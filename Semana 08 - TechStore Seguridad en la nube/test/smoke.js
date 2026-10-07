// Pruebas de humo: registro, bloqueo, MFA (TOTP) y control de acceso por rol.
process.env.DB_FILE = require('path').join(require('os').tmpdir(), `techstore-test-${Date.now()}.db`);
const { authenticator } = require('otplib');
const { app } = require('../server');

let passed = 0, failed = 0;
const ok = (cond, name) => { cond ? passed++ : failed++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = () => ({ c: {} });
  const call = async (j, method, url, body) => {
    const r = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Cookie: Object.entries(j.c).map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const sc of r.headers.getSetCookie()) {
      const [kv] = sc.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v) j.c[k] = v; else delete j.c[k];
    }
    return { s: r.status, d: await r.json().catch(() => ({})) };
  };
  const GOOD = 'Clave#2026';
  const reg = (email, name, store) => call(jar(), 'POST', '/api/register', { email, password: GOOD, full_name: name, store });
  const secrets = {};
  // login completo (credenciales + MFA)
  const fullLogin = async (email) => {
    const j = jar();
    const l = await call(j, 'POST', '/api/login', { email, password: GOOD });
    if (l.d.status === 'mfa_setup') secrets[email] = (await call(j, 'GET', '/api/mfa/setup')).d.secret;
    await call(j, 'POST', '/api/mfa/verify', { code: authenticator.generate(secrets[email]) });
    return j;
  };

  try {
    // --- registro y validaciones
    ok((await call(jar(), 'POST', '/api/register', { email: 'x', password: 'abc', full_name: 'A', store: 'Nada' })).s === 400, 'registro rechaza datos inválidos');
    ok((await call(jar(), 'POST', '/api/register', { email: 'a@t.com', password: 'sinmayus#1', full_name: 'Ana Admin', store: 'Lima Centro' })).s === 400, 'contraseña sin mayúscula es rechazada');
    ok((await reg('admin@t.com', 'Ana Admin', 'Lima Centro')).d.role === 'admin', 'primer usuario queda como admin');
    ok((await reg('emp@t.com', 'Eva Empleada', 'Miraflores')).d.role === 'empleado', 'siguiente usuario es empleado');
    await reg('ger@t.com', 'Gabi Gerente', 'Miraflores');
    await reg('aud@t.com', 'Aldo Auditor', 'Lima Centro');
    ok((await reg('emp@t.com', 'Dup Dup', 'Lima Centro')).s === 409, 'email duplicado es rechazado');

    // --- bloqueo por intentos fallidos
    let last;
    for (let i = 0; i < 5; i++) last = await call(jar(), 'POST', '/api/login', { email: 'aud@t.com', password: 'mala' });
    ok(last.s === 423, 'la cuenta se bloquea al 5.º intento fallido');
    ok((await call(jar(), 'POST', '/api/login', { email: 'aud@t.com', password: GOOD })).s === 423, 'cuenta bloqueada rechaza incluso la contraseña correcta');

    // --- MFA
    const j = jar();
    const l = await call(j, 'POST', '/api/login', { email: 'admin@t.com', password: GOOD });
    ok(l.d.status === 'mfa_setup', 'primer login exige configurar MFA');
    ok((await call(j, 'GET', '/api/products')).s === 401, 'sin completar el MFA no hay acceso a la API');
    const sec = (await call(j, 'GET', '/api/mfa/setup')).d.secret; secrets['admin@t.com'] = sec;
    let w; for (let i = 0; i < 3; i++) w = await call(j, 'POST', '/api/mfa/verify', { code: '000000' });
    ok(w.s === 401 && w.d.restart === true, 'MFA se bloquea tras 3 códigos incorrectos');
    await call(j, 'POST', '/api/login', { email: 'admin@t.com', password: GOOD });
    const good = await call(j, 'POST', '/api/mfa/verify', { code: authenticator.generate(sec) });
    ok(good.s === 200 && good.d.ok === true, 'código TOTP correcto concede el acceso');
    ok((await call(jar(), 'POST', '/api/login', { email: 'admin@t.com', password: GOOD })).d.status === 'mfa_required', 'login posterior solo pide el código MFA');

    // --- roles y permisos
    const admin = await fullLogin('admin@t.com');
    const users = (await call(admin, 'GET', '/api/users')).d;
    const idOf = (e) => users.find((u) => u.email === e).id;
    await call(admin, 'PATCH', `/api/users/${idOf('ger@t.com')}`, { role: 'gerente' });
    await call(admin, 'PATCH', `/api/users/${idOf('aud@t.com')}`, { role: 'auditor' });
    await call(admin, 'POST', `/api/users/${idOf('aud@t.com')}/unlock`);
    const pA = (await call(admin, 'POST', '/api/products', { name: 'Laptop', price: 2500, stock: 10, store: 'Lima Centro' })).d.id;
    const pB = (await call(admin, 'POST', '/api/products', { name: 'Mouse', price: 60, stock: 3, store: 'Miraflores' })).d.id;

    const emp = await fullLogin('emp@t.com'), ger = await fullLogin('ger@t.com'), aud = await fullLogin('aud@t.com');
    ok((await call(emp, 'PATCH', `/api/products/${pA}/stock`, { stock: 7 })).s === 200, 'empleado SÍ puede actualizar stock');
    ok((await call(emp, 'PUT', `/api/products/${pA}`, { name: 'Laptop', price: 1, stock: 7 })).s === 403, 'empleado NO puede modificar precios');
    ok((await call(emp, 'DELETE', `/api/products/${pA}`)).s === 403, 'empleado NO puede eliminar productos');
    ok((await call(emp, 'GET', '/api/reports')).s === 403, 'empleado NO ve reportes');
    ok((await call(ger, 'DELETE', `/api/products/${pA}`)).s === 403, 'gerente NO elimina productos de otra tienda');
    ok((await call(ger, 'PUT', `/api/products/${pB}`, { name: 'Mouse Pro', price: 80, stock: 3 })).s === 200, 'gerente SÍ edita productos de su tienda');
    const rep = (await call(ger, 'GET', '/api/reports')).d;
    ok(rep.length === 1 && rep[0].store === 'Miraflores', 'gerente solo ve el reporte de su tienda');
    ok((await call(aud, 'GET', '/api/products')).s === 200 && (await call(aud, 'GET', '/api/reports')).d.length === 2, 'auditor lee todo y genera reportes');
    ok((await call(aud, 'POST', '/api/products', { name: 'X', price: 1, stock: 1 })).s === 403, 'auditor NO puede modificar (solo lectura)');
    ok((await call(emp, 'GET', '/api/users')).s === 403 && (await call(ger, 'GET', '/api/users')).s === 403, 'solo el admin gestiona usuarios');
    ok((await call(admin, 'DELETE', `/api/products/${pA}`)).s === 200, 'admin tiene acceso total');
    ok((await call(aud, 'GET', '/api/audit')).d.some((e) => e.event === 'ACCESO_DENEGADO'), 'los accesos denegados quedan en la auditoría');
    ok((await call(jar(), 'GET', '/auth/google')).s === 302, 'login social redirige (sin credenciales vuelve con aviso)');
  } catch (e) { failed++; console.error('ERROR', e); }
  console.log(`\n${passed} pruebas correctas, ${failed} fallidas`);
  server.close(); process.exit(failed ? 1 : 0);
});
