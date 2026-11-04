// Servidor Express del Mundial de predicciones. Cada nodo (nodo1, nodo2) ejecuta este mismo código.
const express = require('express');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool, iniciarBD, esperarBD } = require('./db');
const { hashClave, compararClave } = require('./claves');
const { puntuarUsuario, PUNTOS } = require('./puntuacion');

const NODO = process.env.NODO || os.hostname();
const PUERTO = Number(process.env.PORT || 3000);
const SECRETO = process.env.JWT_SECRETO || 'secreto-de-desarrollo-cambiar';
const arranque = Date.now();
let peticiones = 0;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => { peticiones++; res.set('X-Nodo', NODO); next(); });
app.use(express.static(path.join(__dirname, '..', 'public')));

class ErrorHttp extends Error { constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; } }
const falla = (codigo, mensaje) => { throw new ErrorHttp(codigo, mensaje); };

// ---------------------------------------------------------------- autenticación (JWT sin estado: sirve en cualquier nodo)
function autenticar(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return res.status(401).json({ error: 'Inicia sesión para continuar' });
  try { req.usuario = jwt.verify(m[1], SECRETO); next(); } catch { res.status(401).json({ error: 'Sesión vencida, inicia sesión otra vez' }); }
}
function opcional(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (m) { try { req.usuario = jwt.verify(m[1], SECRETO); } catch { /* sin sesión */ } }
  next();
}
const soloAdmin = (req, res, next) => (req.usuario.admin ? next() : res.status(403).json({ error: 'Solo el administrador puede hacer esto' }));
const emitirToken = (u) => jwt.sign({ id: u.id, nombre: u.nombre, admin: u.es_admin }, SECRETO, { expiresIn: '8h' });

// ---------------------------------------------------------------- cálculo de puntajes
const SQL_PARTIDOS_FINALIZADOS = 'SELECT id, inicio, goles_local AS "golesLocal", goles_visitante AS "golesVisitante" FROM partidos WHERE finalizado ORDER BY inicio, id';

async function cargarPredicciones(partidoIds, usuarioIds) {
  if (!partidoIds.length) return [];
  const { rows } = await pool.query(
    'SELECT usuario_id AS "usuarioId", partido_id AS "partidoId", goles_local AS "golesLocal", goles_visitante AS "golesVisitante", registrada FROM predicciones WHERE partido_id = ANY($1) AND ($2::int[] IS NULL OR usuario_id = ANY($2))',
    [partidoIds, usuarioIds]);
  return rows;
}

// Ranking de todos los participantes (o solo de los usuarios indicados, para las salas).
async function calcularRanking(usuarioIds = null) {
  const partidos = (await pool.query(SQL_PARTIDOS_FINALIZADOS)).rows;
  const usuarios = (await pool.query('SELECT id, nombre FROM usuarios WHERE NOT es_admin AND ($1::int[] IS NULL OR id = ANY($1))', [usuarioIds])).rows;
  const preds = await cargarPredicciones(partidos.map((p) => p.id), usuarioIds);
  const porUsuario = new Map();
  for (const p of preds) {
    if (!porUsuario.has(p.usuarioId)) porUsuario.set(p.usuarioId, new Map());
    porUsuario.get(p.usuarioId).set(p.partidoId, p);
  }
  const filas = usuarios.map((u) => {
    const r = puntuarUsuario(partidos, porUsuario.get(u.id) || new Map());
    return { usuarioId: u.id, nombre: u.nombre, puntos: r.total, aciertos: r.aciertos, exactos: r.exactos, jugadas: r.jugadas, mejorRacha: r.mejorRacha };
  });
  filas.sort((a, b) => b.puntos - a.puntos || b.exactos - a.exactos || a.nombre.localeCompare(b.nombre));
  filas.forEach((f, i) => { f.posicion = i + 1; });
  return filas;
}

// ---------------------------------------------------------------- información del nodo y salud
app.get('/api/info', (req, res) => res.json({ nodo: NODO, host: os.hostname(), activoSegundos: Math.round((Date.now() - arranque) / 1000), peticiones, hora: new Date().toISOString() }));
app.get('/salud', async (req, res) => { await pool.query('SELECT 1'); res.json({ estado: 'ok', nodo: NODO }); });
app.get('/api/reglas', (req, res) => res.json(PUNTOS));

// ---------------------------------------------------------------- usuarios
app.post('/api/registro', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const clave = String(req.body.clave || '');
  if (!/^[\p{L}0-9_.-]{3,20}$/u.test(nombre)) falla(400, 'El nombre debe tener entre 3 y 20 caracteres (letras, números, _ . -)');
  if (clave.length < 4) falla(400, 'La clave debe tener al menos 4 caracteres');
  try {
    const { rows } = await pool.query('INSERT INTO usuarios (nombre, clave_hash) VALUES ($1,$2) RETURNING id, nombre, es_admin', [nombre, await hashClave(clave)]);
    res.status(201).json({ token: emitirToken(rows[0]), usuario: { id: rows[0].id, nombre: rows[0].nombre, admin: false } });
  } catch (e) { if (e.code === '23505') falla(409, 'Ese nombre ya está en uso'); throw e; }
});

app.post('/api/login', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [String(req.body.nombre || '').trim()]);
  if (!rows.length || !(await compararClave(String(req.body.clave || ''), rows[0].clave_hash))) falla(401, 'Nombre o clave incorrectos');
  res.json({ token: emitirToken(rows[0]), usuario: { id: rows[0].id, nombre: rows[0].nombre, admin: rows[0].es_admin } });
});

app.get('/api/estadisticas', autenticar, async (req, res) => {
  const ranking = await calcularRanking();
  const yo = ranking.find((f) => f.usuarioId === req.usuario.id);
  if (!yo) return res.json({ puntos: 0, jugadas: 0, aciertos: 0, exactos: 0, mejorRacha: 0, efectividad: 0, posicion: null, participantes: ranking.length });
  res.json({ ...yo, efectividad: yo.jugadas ? Math.round((yo.aciertos / yo.jugadas) * 100) : 0, participantes: ranking.length });
});

// ---------------------------------------------------------------- partidos y predicciones
const estadoPartido = (p) => (p.finalizado ? 'finalizado' : new Date(p.inicio) <= new Date() ? 'en_juego' : 'abierto');

app.get('/api/partidos', opcional, async (req, res) => {
  const partidos = (await pool.query('SELECT id, fase, local, visitante, inicio, goles_local AS "golesLocal", goles_visitante AS "golesVisitante", finalizado FROM partidos ORDER BY inicio, id')).rows;
  let mias = new Map(), detalle = new Map();
  if (req.usuario) {
    const { rows } = await pool.query('SELECT partido_id AS "partidoId", goles_local AS "golesLocal", goles_visitante AS "golesVisitante", registrada FROM predicciones WHERE usuario_id = $1', [req.usuario.id]);
    mias = new Map(rows.map((r) => [r.partidoId, r]));
    const fin = (await pool.query(SQL_PARTIDOS_FINALIZADOS)).rows;
    detalle = new Map(puntuarUsuario(fin, mias).detalle.map((d) => [d.partidoId, d]));
  }
  res.json(partidos.map((p) => ({ ...p, estado: estadoPartido(p), miPrediccion: mias.get(p.id) || null, misPuntos: detalle.get(p.id) || null })));
});

const gol = (v, nombre) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 20) falla(400, `${nombre} debe ser un número entero entre 0 y 20`);
  return n;
};

app.put('/api/partidos/:id/prediccion', autenticar, async (req, res) => {
  if (req.usuario.admin) falla(403, 'El administrador no participa en las predicciones');
  const golesLocal = gol(req.body.golesLocal, 'Los goles del local');
  const golesVisitante = gol(req.body.golesVisitante, 'Los goles del visitante');
  const { rows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [Number(req.params.id)]);
  if (!rows.length) falla(404, 'Partido no encontrado');
  if (rows[0].finalizado || new Date(rows[0].inicio) <= new Date()) falla(409, 'Este partido ya empezó: no se aceptan más predicciones');
  const r = await pool.query(
    `INSERT INTO predicciones (usuario_id, partido_id, goles_local, goles_visitante, registrada) VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (usuario_id, partido_id) DO UPDATE SET goles_local = $3, goles_visitante = $4, registrada = now()
     RETURNING goles_local AS "golesLocal", goles_visitante AS "golesVisitante", registrada`,
    [req.usuario.id, rows[0].id, golesLocal, golesVisitante]);
  res.json({ prediccion: r.rows[0], anticipada: new Date(rows[0].inicio) - new Date(r.rows[0].registrada) > 24 * 3600 * 1000 });
});

// ---------------------------------------------------------------- administración (resultados)
app.post('/api/admin/partidos', autenticar, soloAdmin, async (req, res) => {
  const { fase, local, visitante, inicio } = req.body;
  if (!local || !visitante || !inicio || isNaN(new Date(inicio))) falla(400, 'Faltan datos del partido (local, visitante, inicio)');
  const { rows } = await pool.query('INSERT INTO partidos (fase, local, visitante, inicio) VALUES ($1,$2,$3,$4) RETURNING id', [fase || 'Amistoso', local, visitante, new Date(inicio)]);
  res.status(201).json({ id: rows[0].id });
});

app.post('/api/admin/partidos/:id/resultado', autenticar, soloAdmin, async (req, res) => {
  const gl = gol(req.body.golesLocal, 'Los goles del local');
  const gv = gol(req.body.golesVisitante, 'Los goles del visitante');
  const r = await pool.query('UPDATE partidos SET goles_local = $1, goles_visitante = $2, finalizado = TRUE WHERE id = $3 RETURNING id', [gl, gv, Number(req.params.id)]);
  if (!r.rowCount) falla(404, 'Partido no encontrado');
  res.json({ ok: true });
});

app.delete('/api/admin/partidos/:id', autenticar, soloAdmin, async (req, res) => {
  await pool.query('DELETE FROM partidos WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- ranking global
app.get('/api/ranking', async (req, res) => res.json(await calcularRanking()));

// ---------------------------------------------------------------- salas (grupos) con invitación
const generarCodigo = () => crypto.randomBytes(4).toString('hex').toUpperCase();

async function miembroDe(salaId, usuarioId) {
  const { rows } = await pool.query('SELECT s.*, (s.creador_id = $2) AS "esCreador" FROM salas s JOIN sala_miembros m ON m.sala_id = s.id WHERE s.id = $1 AND m.usuario_id = $2', [salaId, usuarioId]);
  if (!rows.length) falla(404, 'Sala no encontrada o no eres miembro');
  return rows[0];
}

app.post('/api/salas', autenticar, async (req, res) => {
  if (req.usuario.admin) falla(403, 'El administrador no participa en las salas');
  const nombre = String(req.body.nombre || '').trim();
  if (nombre.length < 3 || nombre.length > 40) falla(400, 'El nombre de la sala debe tener entre 3 y 40 caracteres');
  for (let intento = 0; intento < 5; intento++) {
    try {
      const { rows } = await pool.query('INSERT INTO salas (nombre, codigo, creador_id) VALUES ($1,$2,$3) RETURNING id, nombre, codigo', [nombre, generarCodigo(), req.usuario.id]);
      await pool.query('INSERT INTO sala_miembros (sala_id, usuario_id) VALUES ($1,$2)', [rows[0].id, req.usuario.id]);
      return res.status(201).json(rows[0]);
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  falla(500, 'No se pudo generar el código de invitación');
});

app.get('/api/salas', autenticar, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.nombre, s.codigo, (s.creador_id = $1) AS "esCreador", (SELECT count(*)::int FROM sala_miembros WHERE sala_id = s.id) AS miembros
     FROM salas s JOIN sala_miembros m ON m.sala_id = s.id WHERE m.usuario_id = $1 ORDER BY s.creada DESC`, [req.usuario.id]);
  res.json(rows);
});

app.post('/api/salas/unirse', autenticar, async (req, res) => {
  if (req.usuario.admin) falla(403, 'El administrador no participa en las salas');
  const { rows } = await pool.query('SELECT id, nombre FROM salas WHERE codigo = $1', [String(req.body.codigo || '').trim().toUpperCase()]);
  if (!rows.length) falla(404, 'Código de invitación no válido');
  await pool.query('INSERT INTO sala_miembros (sala_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, req.usuario.id]);
  res.json({ id: rows[0].id, nombre: rows[0].nombre });
});

app.get('/api/salas/:id', autenticar, async (req, res) => {
  const sala = await miembroDe(Number(req.params.id), req.usuario.id);
  const ids = (await pool.query('SELECT usuario_id FROM sala_miembros WHERE sala_id = $1', [sala.id])).rows.map((r) => r.usuario_id);
  res.json({ id: sala.id, nombre: sala.nombre, codigo: sala.codigo, esCreador: sala.esCreador, creadorId: sala.creador_id, ranking: await calcularRanking(ids) });
});

app.post('/api/salas/:id/codigo', autenticar, async (req, res) => {
  const sala = await miembroDe(Number(req.params.id), req.usuario.id);
  if (!sala.esCreador) falla(403, 'Solo quien creó la sala puede cambiar el código');
  const { rows } = await pool.query('UPDATE salas SET codigo = $1 WHERE id = $2 RETURNING codigo', [generarCodigo(), sala.id]);
  res.json(rows[0]);
});

app.delete('/api/salas/:id/miembros/:usuarioId', autenticar, async (req, res) => {
  const sala = await miembroDe(Number(req.params.id), req.usuario.id);
  if (!sala.esCreador) falla(403, 'Solo quien creó la sala puede sacar miembros');
  if (Number(req.params.usuarioId) === sala.creador_id) falla(400, 'El creador no puede salir de su propia sala; elimínala');
  await pool.query('DELETE FROM sala_miembros WHERE sala_id = $1 AND usuario_id = $2', [sala.id, Number(req.params.usuarioId)]);
  res.json({ ok: true });
});

app.post('/api/salas/:id/salir', autenticar, async (req, res) => {
  const sala = await miembroDe(Number(req.params.id), req.usuario.id);
  if (sala.esCreador) falla(400, 'Quien creó la sala no puede salir; elimina la sala');
  await pool.query('DELETE FROM sala_miembros WHERE sala_id = $1 AND usuario_id = $2', [sala.id, req.usuario.id]);
  res.json({ ok: true });
});

app.delete('/api/salas/:id', autenticar, async (req, res) => {
  const sala = await miembroDe(Number(req.params.id), req.usuario.id);
  if (!sala.esCreador) falla(403, 'Solo quien creó la sala puede eliminarla');
  await pool.query('DELETE FROM salas WHERE id = $1', [sala.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- errores
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  if (err instanceof ErrorHttp) return res.status(err.codigo).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
  console.error(`[${NODO}]`, err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ---------------------------------------------------------------- arranque
(async () => {
  await esperarBD();
  await iniciarBD(hashClave);
  const servidor = app.listen(PUERTO, () => console.log(`[${NODO}] Mundial de predicciones escuchando en el puerto ${PUERTO}`));
  const cerrar = () => servidor.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
})().catch((e) => { console.error(e); process.exit(1); });
