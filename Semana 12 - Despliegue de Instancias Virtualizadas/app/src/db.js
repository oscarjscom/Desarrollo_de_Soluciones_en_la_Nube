// Conexión a PostgreSQL y creación de tablas. Los dos nodos comparten esta misma base de datos.
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'mundial',
  password: process.env.DB_PASSWORD || 'mundial',
  database: process.env.DB_NAME || 'mundial',
  max: Number(process.env.DB_POOL || 10),
});

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  clave_hash TEXT NOT NULL,
  es_admin BOOLEAN NOT NULL DEFAULT FALSE,
  creado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS partidos (
  id SERIAL PRIMARY KEY,
  fase TEXT NOT NULL,
  local TEXT NOT NULL,
  visitante TEXT NOT NULL,
  inicio TIMESTAMPTZ NOT NULL,
  goles_local INT,
  goles_visitante INT,
  finalizado BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS predicciones (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  partido_id INT NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  goles_local INT NOT NULL,
  goles_visitante INT NOT NULL,
  registrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, partido_id)
);
CREATE TABLE IF NOT EXISTS salas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo TEXT UNIQUE NOT NULL,
  creador_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sala_miembros (
  sala_id INT NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  unido TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sala_id, usuario_id)
);
`;

// Partidos de ejemplo del Mundial (datos educativos); las fechas se generan a partir de "ahora".
const EQUIPOS = [
  ['México', 'Sudáfrica'], ['Argentina', 'Argelia'], ['Brasil', 'Marruecos'], ['España', 'Uruguay'],
  ['Francia', 'Senegal'], ['Inglaterra', 'Croacia'], ['Alemania', 'Japón'], ['Portugal', 'Colombia'],
  ['Estados Unidos', 'Paraguay'], ['Países Bajos', 'Ecuador'], ['Bélgica', 'Egipto'], ['Italia', 'Corea del Sur'],
];

async function iniciarBD(hashClave) {
  // Un candado evita que los dos nodos creen las tablas al mismo tiempo cuando arrancan juntos.
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock(424242)');
    await cliente.query(ESQUEMA);
    const { rows } = await cliente.query('SELECT count(*)::int AS n FROM partidos');
    if (rows[0].n === 0) {
      const base = Date.now();
      for (let i = 0; i < EQUIPOS.length; i++) {
        const inicio = new Date(base + (30 + i * 12) * 3600 * 1000); // el primero a 30 h, luego cada 12 h
        await cliente.query('INSERT INTO partidos (fase, local, visitante, inicio) VALUES ($1,$2,$3,$4)',
          [i < 8 ? 'Fase de grupos' : 'Octavos de final', EQUIPOS[i][0], EQUIPOS[i][1], inicio]);
      }
    }
    const admin = process.env.ADMIN_USUARIO || 'admin';
    const existe = await cliente.query('SELECT 1 FROM usuarios WHERE nombre = $1', [admin]);
    if (!existe.rowCount) {
      const hash = await hashClave(process.env.ADMIN_CLAVE || 'admin123');
      await cliente.query('INSERT INTO usuarios (nombre, clave_hash, es_admin) VALUES ($1,$2,TRUE)', [admin, hash]);
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    cliente.release();
  }
}

// Espera a que la base de datos acepte conexiones (en Docker puede tardar unos segundos).
async function esperarBD(intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try { await pool.query('SELECT 1'); return; } catch (e) {
      console.log(`Esperando la base de datos (${i}/${intentos})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('No se pudo conectar a la base de datos');
}

module.exports = { pool, iniciarBD, esperarBD };
