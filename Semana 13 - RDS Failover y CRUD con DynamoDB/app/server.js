// CRUD de empleados: datos en DynamoDB, fotos en S3 y prueba de conexión a RDS MySQL (Multi-AZ).
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const mysql = require('mysql2/promise');

// Toda la configuración sale de variables de entorno (las credenciales las da el rol de la EC2)
const REGION = process.env.AWS_REGION || 'us-east-2';
const TABLA = process.env.TABLA || 'empleados';
const BUCKET = process.env.BUCKET;
const PUERTO = process.env.PORT || 80;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// La foto es privada: se entrega con una URL firmada que vence a los 10 minutos
async function conFoto(e) {
  if (e.foto) e.fotoUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: e.foto }), { expiresIn: 600 });
  return e;
}

async function guardarFoto(id, archivo) {
  if (!archivo) return null;
  if (!/^image\//.test(archivo.mimetype)) throw new Error('El archivo debe ser una imagen');
  const key = `fotos/${id}${path.extname(archivo.originalname).toLowerCase()}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: archivo.buffer, ContentType: archivo.mimetype }));
  return key;
}

function validar(c) {
  if (!c.nombre || !c.nombre.trim()) throw new Error('El nombre es obligatorio');
  if (c.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.correo)) throw new Error('Correo no válido');
}

const envolver = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));

// CREATE
app.post('/api/empleados', subida.single('foto'), envolver(async (req, res) => {
  validar(req.body);
  const id = crypto.randomUUID();
  const item = { id, nombre: req.body.nombre.trim(), cargo: req.body.cargo || '', correo: req.body.correo || '', creado: new Date().toISOString() };
  const foto = await guardarFoto(id, req.file);
  if (foto) item.foto = foto;
  await dynamo.send(new PutCommand({ TableName: TABLA, Item: item }));
  res.status(201).json(await conFoto(item));
}));

// READ (lista y uno)
app.get('/api/empleados', envolver(async (req, res) => {
  const r = await dynamo.send(new ScanCommand({ TableName: TABLA }));
  const lista = await Promise.all(r.Items.sort((a, b) => a.creado.localeCompare(b.creado)).map(conFoto));
  res.json(lista);
}));
app.get('/api/empleados/:id', envolver(async (req, res) => {
  const r = await dynamo.send(new GetCommand({ TableName: TABLA, Key: { id: req.params.id } }));
  if (!r.Item) return res.status(404).json({ error: 'No existe' });
  res.json(await conFoto(r.Item));
}));

// UPDATE (la foto es opcional: si no se envía, se conserva la anterior)
app.put('/api/empleados/:id', subida.single('foto'), envolver(async (req, res) => {
  validar(req.body);
  const r = await dynamo.send(new GetCommand({ TableName: TABLA, Key: { id: req.params.id } }));
  if (!r.Item) return res.status(404).json({ error: 'No existe' });
  const item = { ...r.Item, nombre: req.body.nombre.trim(), cargo: req.body.cargo || '', correo: req.body.correo || '' };
  const foto = await guardarFoto(item.id, req.file);
  if (foto) item.foto = foto;
  await dynamo.send(new PutCommand({ TableName: TABLA, Item: item }));
  res.json(await conFoto(item));
}));

// DELETE (borra el registro y su foto)
app.delete('/api/empleados/:id', envolver(async (req, res) => {
  const r = await dynamo.send(new GetCommand({ TableName: TABLA, Key: { id: req.params.id } }));
  if (!r.Item) return res.status(404).json({ error: 'No existe' });
  if (r.Item.foto) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: r.Item.foto }));
  await dynamo.send(new DeleteCommand({ TableName: TABLA, Key: { id: req.params.id } }));
  res.json({ eliminado: req.params.id });
}));

// Prueba del failover de RDS: escribe un registro y dice a qué servidor MySQL se conectó
app.get('/api/db', envolver(async (req, res) => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, connectTimeout: 8000 });
  try {
    await c.query('CREATE TABLE IF NOT EXISTS registro (id INT AUTO_INCREMENT PRIMARY KEY, momento DATETIME DEFAULT CURRENT_TIMESTAMP, servidor VARCHAR(64))');
    const [[s]] = await c.query('SELECT @@hostname AS servidor, @@read_only AS soloLectura');
    await c.query('INSERT INTO registro (servidor) VALUES (?)', [s.servidor]);
    const [[n]] = await c.query('SELECT COUNT(*) AS total FROM registro');
    res.json({ endpoint: process.env.DB_HOST, servidor: s.servidor, soloLectura: s.soloLectura, registros: n.total });
  } finally { await c.end(); }
}));

app.get('/salud', (req, res) => res.send('ok'));
app.listen(PUERTO, () => console.log(`Empleados escuchando en el puerto ${PUERTO}`));
