// TechStore - Laboratorio S08: autenticación, roles, MFA (TOTP) y login social.
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------- configuración
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.db');
const OAUTH = {
  google: { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET },
  github: { id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET },
};
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MAX_MFA_ATTEMPTS = 3;
const STORES = ['Lima Centro', 'Miraflores', 'San Isidro', 'Arequipa'];
const ROLES = ['admin', 'gerente', 'empleado', 'auditor'];
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
authenticator.options = { window: 1 };

// ---------------------------------------------------------------- base de datos
const db = new DatabaseSync(DB_FILE);
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  store TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'empleado',
  provider TEXT NOT NULL DEFAULT 'local',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  store TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_email TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  ip TEXT
);
`);
const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
};
function audit(email, event, detail, req) {
  db.prepare('INSERT INTO audit_log (at, user_email, event, detail, ip) VALUES (?,?,?,?,?)')
    .run(Date.now(), email || null, event, detail || null, req ? (req.ip || '') : '');
}

// ---------------------------------------------------------------- utilidades
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'",
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.full_name, store: u.store, role: u.role, provider: u.provider });
const sign = (payload, expiresIn) => jwt.sign(payload, JWT_SECRET, { expiresIn });
const cookieOpts = (maxAgeMs) => ({ httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https'), maxAge: maxAgeMs });
const verifyCookie = (req, name) => { try { return jwt.verify(req.cookies[name], JWT_SECRET); } catch { return null; } };

function isLocked(u) { return u.locked_until && u.locked_until > Date.now(); }
function minutesLeft(u) { return Math.ceil((u.locked_until - Date.now()) / 60000); }

// Inicia el flujo MFA tras validar credenciales (o login social)
function startMfa(res, u) {
  db.prepare('UPDATE users SET mfa_attempts = 0 WHERE id = ?').run(u.id);
  const stage = u.totp_enabled ? 'verify' : 'setup';
  res.cookie('pending', sign({ uid: u.id, stage }, '5m'), cookieOpts(5 * 60 * 1000));
  return stage;
}

// ---------------------------------------------------------------- middlewares
function auth(req, res, next) {
  const t = verifyCookie(req, 'session');
  const u = t && q.userById.get(t.uid);
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  req.user = u;
  next();
}
const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    audit(req.user.email, 'ACCESO_DENEGADO', `${req.method} ${req.path} (rol ${req.user.role})`, req);
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  next();
};

// ---------------------------------------------------------------- configuración pública
app.get('/api/config', (req, res) => {
  res.json({ stores: STORES, roles: ROLES, google: !!(OAUTH.google.id && OAUTH.google.secret), github: !!(OAUTH.github.id && OAUTH.github.secret) });
});
app.get('/health', (req, res) => res.send('OK'));

// ---------------------------------------------------------------- registro
app.post('/api/register', async (req, res) => {
  const { email, password, full_name, store } = req.body || {};
  const mail = String(email || '').trim().toLowerCase();
  const name = String(full_name || '').trim();
  const errors = [];
  if (!EMAIL_RULE.test(mail)) errors.push('Email inválido');
  if (!PASSWORD_RULE.test(String(password || ''))) errors.push('La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial');
  if (name.length < 3) errors.push('Ingresa tu nombre completo');
  if (!STORES.includes(store)) errors.push('Selecciona una tienda válida');
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  if (q.userByEmail.get(mail)) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });

  // El primer usuario registrado es el administrador del sistema; los demás empiezan como empleados.
  const role = q.countUsers.get().n === 0 ? 'admin' : 'empleado';
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (email, password_hash, full_name, store, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(mail, hash, name, store, role, Date.now());
  audit(mail, 'REGISTRO', `rol inicial: ${role}`, req);
  res.status(201).json({ ok: true, role });
});

// ---------------------------------------------------------------- login
app.post('/api/login', async (req, res) => {
  const mail = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const u = q.userByEmail.get(mail);
  const generic = { error: 'Credenciales incorrectas' };
  if (!u || !u.password_hash) { audit(mail, 'LOGIN_FALLIDO', 'usuario inexistente o sin contraseña', req); return res.status(401).json(generic); }
  if (isLocked(u)) {
    audit(mail, 'LOGIN_BLOQUEADO', 'cuenta bloqueada', req);
    return res.status(423).json({ error: `Cuenta bloqueada por intentos fallidos. Inténtalo en ${minutesLeft(u)} min.` });
  }
  if (!(await bcrypt.compare(password, u.password_hash))) {
    const n = u.failed_attempts + 1;
    if (n >= MAX_LOGIN_ATTEMPTS) {
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(Date.now() + LOCK_MINUTES * 60000, u.id);
      audit(mail, 'CUENTA_BLOQUEADA', `${MAX_LOGIN_ATTEMPTS} intentos fallidos`, req);
      return res.status(423).json({ error: `Cuenta bloqueada por ${LOCK_MINUTES} minutos tras ${MAX_LOGIN_ATTEMPTS} intentos fallidos.` });
    }
    db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(n, u.id);
    audit(mail, 'LOGIN_FALLIDO', `intento ${n}/${MAX_LOGIN_ATTEMPTS}`, req);
    return res.status(401).json({ error: `Credenciales incorrectas. Intentos restantes: ${MAX_LOGIN_ATTEMPTS - n}` });
  }
  db.prepare('UPDATE users SET failed_attempts = 0 WHERE id = ?').run(u.id);
  audit(mail, 'LOGIN_PASO1_OK', 'credenciales válidas, falta MFA', req);
  res.json({ status: startMfa(res, u) === 'setup' ? 'mfa_setup' : 'mfa_required' });
});

// ---------------------------------------------------------------- MFA (TOTP)
function pendingUser(req, res) {
  const t = verifyCookie(req, 'pending');
  const u = t && q.userById.get(t.uid);
  if (!u) { res.status(401).json({ error: 'La verificación expiró. Inicia sesión de nuevo.' }); return null; }
  return { u, stage: t.stage };
}

app.get('/api/mfa/setup', async (req, res) => {
  const p = pendingUser(req, res); if (!p) return;
  if (p.stage !== 'setup') return res.status(400).json({ error: 'El MFA ya está configurado' });
  const secret = p.u.totp_secret || authenticator.generateSecret();
  if (!p.u.totp_secret) db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, p.u.id);
  const uri = authenticator.keyuri(p.u.email, 'TechStore', secret);
  res.json({ qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret });
});

app.post('/api/mfa/verify', (req, res) => {
  const p = pendingUser(req, res); if (!p) return;
  const code = String((req.body || {}).code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Ingresa el código de 6 dígitos' });
  if (!p.u.totp_secret) return res.status(400).json({ error: 'Primero configura el MFA' });

  if (!authenticator.check(code, p.u.totp_secret)) {
    const n = p.u.mfa_attempts + 1;
    if (n >= MAX_MFA_ATTEMPTS) {
      db.prepare('UPDATE users SET mfa_attempts = 0 WHERE id = ?').run(p.u.id);
      res.clearCookie('pending');
      audit(p.u.email, 'MFA_BLOQUEADO', `${MAX_MFA_ATTEMPTS} códigos incorrectos`, req);
      return res.status(401).json({ error: 'Superaste los 3 intentos. Inicia sesión de nuevo.', restart: true });
    }
    db.prepare('UPDATE users SET mfa_attempts = ? WHERE id = ?').run(n, p.u.id);
    audit(p.u.email, 'MFA_FALLIDO', `intento ${n}/${MAX_MFA_ATTEMPTS}`, req);
    return res.status(401).json({ error: `Código incorrecto. Intentos restantes: ${MAX_MFA_ATTEMPTS - n}` });
  }
  if (!p.u.totp_enabled) db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(p.u.id);
  db.prepare('UPDATE users SET mfa_attempts = 0 WHERE id = ?').run(p.u.id);
  res.clearCookie('pending');
  res.cookie('session', sign({ uid: p.u.id, role: p.u.role, mfa: true }, '2h'), cookieOpts(2 * 3600 * 1000));
  audit(p.u.email, 'LOGIN_OK', `acceso concedido (${p.u.provider})`, req);
  res.json({ ok: true, user: publicUser(p.u) });
});

// Estado de la sesión para el frontend
app.get('/api/session', (req, res) => {
  const s = verifyCookie(req, 'session');
  const u = s && q.userById.get(s.uid);
  if (u) return res.json({ state: 'ok', user: publicUser(u) });
  const p = verifyCookie(req, 'pending');
  const pu = p && q.userById.get(p.uid);
  if (pu) return res.json({ state: pu.totp_enabled ? 'mfa_required' : 'mfa_setup', email: pu.email });
  res.json({ state: 'none' });
});

app.post('/api/logout', (req, res) => {
  const s = verifyCookie(req, 'session');
  const u = s && q.userById.get(s.uid);
  if (u) audit(u.email, 'LOGOUT', null, req);
  res.clearCookie('session'); res.clearCookie('pending');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- login social (OAuth 2.0)
const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    async profile(code) {
      const tok = await (await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: OAUTH.google.id, client_secret: OAUTH.google.secret, redirect_uri: `${BASE_URL}/auth/google/callback`, grant_type: 'authorization_code' }),
      })).json();
      if (!tok.access_token) throw new Error('Google no entregó el token');
      const p = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
      if (!p.email || p.email_verified === false) throw new Error('Email de Google no verificado');
      return { email: p.email.toLowerCase(), name: p.name || p.email };
    },
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    scope: 'read:user user:email',
    async profile(code) {
      const tok = await (await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: OAUTH.github.id, client_secret: OAUTH.github.secret, code, redirect_uri: `${BASE_URL}/auth/github/callback` }),
      })).json();
      if (!tok.access_token) throw new Error('GitHub no entregó el token');
      const h = { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': 'techstore-lab', Accept: 'application/vnd.github+json' };
      const me = await (await fetch('https://api.github.com/user', { headers: h })).json();
      const emails = await (await fetch('https://api.github.com/user/emails', { headers: h })).json();
      const primary = Array.isArray(emails) && (emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified));
      if (!primary) throw new Error('GitHub no tiene un email verificado');
      return { email: primary.email.toLowerCase(), name: me.name || me.login };
    },
  },
};

app.get('/auth/:provider', (req, res) => {
  const p = PROVIDERS[req.params.provider];
  const cfg = OAUTH[req.params.provider];
  if (!p || !cfg || !cfg.id || !cfg.secret) return res.redirect('/?error=' + encodeURIComponent('Login social no configurado'));
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, cookieOpts(10 * 60 * 1000));
  const params = new URLSearchParams({ client_id: cfg.id, redirect_uri: `${BASE_URL}/auth/${req.params.provider}/callback`, response_type: 'code', scope: p.scope, state });
  res.redirect(`${p.authUrl}?${params}`);
});

app.get('/auth/:provider/callback', async (req, res) => {
  const name = req.params.provider, p = PROVIDERS[name];
  const fail = (m) => res.redirect('/?error=' + encodeURIComponent(m));
  if (!p) return fail('Proveedor inválido');
  if (!req.query.code || !req.query.state || req.query.state !== req.cookies.oauth_state) return fail('Solicitud de login social inválida');
  res.clearCookie('oauth_state');
  try {
    const prof = await p.profile(String(req.query.code));
    let u = q.userByEmail.get(prof.email);
    if (!u) {
      const role = q.countUsers.get().n === 0 ? 'admin' : 'empleado';
      db.prepare('INSERT INTO users (email, password_hash, full_name, store, role, provider, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(prof.email, null, prof.name, STORES[0], role, name, Date.now());
      u = q.userByEmail.get(prof.email);
      audit(prof.email, 'REGISTRO', `vía ${name}, rol inicial: ${role}`, req);
    }
    if (isLocked(u)) return fail(`Cuenta bloqueada. Inténtalo en ${minutesLeft(u)} min.`);
    audit(u.email, 'LOGIN_PASO1_OK', `autenticado con ${name}, falta MFA`, req);
    startMfa(res, u);
    res.redirect('/');
  } catch (e) {
    audit(null, 'LOGIN_SOCIAL_FALLIDO', `${name}: ${e.message}`, req);
    fail('No se pudo iniciar sesión con ' + name);
  }
});

// ---------------------------------------------------------------- productos (RBAC)
const validProduct = (b) => b && String(b.name || '').trim().length > 0 && Number(b.price) >= 0 && Number.isInteger(Number(b.stock)) && Number(b.stock) >= 0;

app.get('/api/products', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY store, name').all());
});

app.post('/api/products', auth, allow('admin', 'gerente'), (req, res) => {
  if (!validProduct(req.body)) return res.status(400).json({ error: 'Datos del producto inválidos' });
  const store = req.user.role === 'gerente' ? req.user.store : (STORES.includes(req.body.store) ? req.body.store : req.user.store);
  const r = db.prepare('INSERT INTO products (name, price, stock, store) VALUES (?,?,?,?)').run(String(req.body.name).trim(), Number(req.body.price), Number(req.body.stock), store);
  audit(req.user.email, 'PRODUCTO_CREADO', `#${r.lastInsertRowid} en ${store}`, req);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/products/:id', auth, allow('admin', 'gerente'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  if (req.user.role === 'gerente' && p.store !== req.user.store) return res.status(403).json({ error: 'Solo puedes modificar productos de tu tienda' });
  if (!validProduct(req.body)) return res.status(400).json({ error: 'Datos del producto inválidos' });
  db.prepare('UPDATE products SET name=?, price=?, stock=? WHERE id=?').run(String(req.body.name).trim(), Number(req.body.price), Number(req.body.stock), p.id);
  audit(req.user.email, 'PRODUCTO_EDITADO', `#${p.id}`, req);
  res.json({ ok: true });
});

// Empleado de ventas: solo puede actualizar stock (nunca precios)
app.patch('/api/products/:id/stock', auth, allow('admin', 'gerente', 'empleado'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  if (req.user.role === 'gerente' && p.store !== req.user.store) return res.status(403).json({ error: 'Solo puedes modificar productos de tu tienda' });
  const stock = Number((req.body || {}).stock);
  if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Stock inválido' });
  db.prepare('UPDATE products SET stock=? WHERE id=?').run(stock, p.id);
  audit(req.user.email, 'STOCK_ACTUALIZADO', `#${p.id}: ${p.stock} -> ${stock}`, req);
  res.json({ ok: true });
});

app.delete('/api/products/:id', auth, allow('admin', 'gerente'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  if (req.user.role === 'gerente' && p.store !== req.user.store) return res.status(403).json({ error: 'No puedes eliminar productos de otras tiendas' });
  db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
  audit(req.user.email, 'PRODUCTO_ELIMINADO', `#${p.id} (${p.name})`, req);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- reportes
app.get('/api/reports', auth, allow('admin', 'gerente', 'auditor'), (req, res) => {
  const where = req.user.role === 'gerente' ? 'WHERE store = ?' : '';
  const args = req.user.role === 'gerente' ? [req.user.store] : [];
  const rows = db.prepare(`SELECT store, COUNT(*) AS products, COALESCE(SUM(stock),0) AS units, COALESCE(SUM(stock*price),0) AS value,
    COALESCE(SUM(CASE WHEN stock < 5 THEN 1 ELSE 0 END),0) AS low FROM products ${where} GROUP BY store ORDER BY store`).all(...args);
  res.json(rows);
});

// ---------------------------------------------------------------- administración y auditoría
app.get('/api/users', auth, allow('admin'), (req, res) => {
  res.json(db.prepare('SELECT id, email, full_name, store, role, provider, totp_enabled, locked_until FROM users ORDER BY id').all()
    .map((u) => ({ ...u, locked: u.locked_until > Date.now() })));
});
app.patch('/api/users/:id', auth, allow('admin'), (req, res) => {
  const u = q.userById.get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { role, store } = req.body || {};
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (store !== undefined && !STORES.includes(store)) return res.status(400).json({ error: 'Tienda inválida' });
  if (u.id === req.user.id && role && role !== 'admin') return res.status(400).json({ error: 'No puedes quitarte el rol de administrador' });
  db.prepare('UPDATE users SET role = ?, store = ? WHERE id = ?').run(role || u.role, store || u.store, u.id);
  audit(req.user.email, 'USUARIO_EDITADO', `${u.email}: rol=${role || u.role}, tienda=${store || u.store}`, req);
  res.json({ ok: true });
});
app.post('/api/users/:id/unlock', auth, allow('admin'), (req, res) => {
  const u = q.userById.get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('UPDATE users SET locked_until = 0, failed_attempts = 0 WHERE id = ?').run(u.id);
  audit(req.user.email, 'USUARIO_DESBLOQUEADO', u.email, req);
  res.json({ ok: true });
});
app.get('/api/audit', auth, allow('admin', 'auditor'), (req, res) => {
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all());
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

module.exports = { app, db };
if (require.main === module) {
  app.listen(PORT, () => console.log(`TechStore escuchando en ${BASE_URL}`));
}
