require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { AWS_REGION = 'us-east-1', S3_BUCKET, PORT = 3000 } = process.env;
if (!S3_BUCKET) {
  throw new Error('Falta la variable S3_BUCKET en el archivo .env');
}

// Las credenciales se leen de AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY del .env.
// Nunca se envían al navegador.
const s3 = new S3Client({ region: AWS_REGION });

const PREFIX = 'originales/';
const MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_TTL = 5 * 60;      // 5 minutos para subir
const VIEW_TTL = 15 * 60;       // 15 minutos para ver
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.static(path.join(__dirname, 'public')));

// Convierte el nombre original en un texto seguro para usarlo como parte de la clave.
function safeStem(filename) {
  const base = path.basename(String(filename || 'foto'));
  const stem = base.replace(/\.[^.]+$/, '');
  return (stem.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)) || 'foto';
}

// 1) Presigned URL para subir una imagen directamente a S3
app.post('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType, sizeBytes } = req.body || {};

    if (!Object.prototype.hasOwnProperty.call(ALLOWED, contentType)) {
      return res.status(400).json({ error: 'Solo se aceptan imágenes JPG, PNG o WebP' });
    }
    const size = Number(sizeBytes);
    if (!Number.isInteger(size) || size <= 0) {
      return res.status(400).json({ error: 'Tamaño de archivo inválido' });
    }
    if (size > MAX_BYTES) {
      return res.status(400).json({ error: 'La imagen supera el límite de 5 MB' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const key = `${PREFIX}${Date.now()}-${id}-${safeStem(filename)}.${ALLOWED[contentType]}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_TTL }
    );
    res.json({ uploadUrl, key, expiresIn: UPLOAD_TTL });
  } catch (err) {
    console.error('upload-url:', err.message);
    res.status(500).json({ error: 'No se pudo generar la URL de subida' });
  }
});

// 2) Listar imágenes con URLs de visualización temporales
app.get('/api/images', async (req, res) => {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: PREFIX,
      MaxKeys: 200,
    }));
    const items = await Promise.all(
      (list.Contents || [])
        .filter((obj) => obj.Key !== PREFIX && obj.Size > 0)
        .map(async (obj) => ({
          key: obj.Key,
          name: obj.Key.slice(PREFIX.length),
          size: obj.Size,
          lastModified: obj.LastModified,
          url: await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: S3_BUCKET, Key: obj.Key }),
            { expiresIn: VIEW_TTL }
          ),
        }))
    );
    items.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    res.json({ items, expiresIn: VIEW_TTL });
  } catch (err) {
    console.error('list:', err.message);
    res.status(500).json({ error: 'No se pudieron listar las imágenes' });
  }
});

// 3) Eliminar una imagen (solo dentro de originales/)
app.delete(/^\/api\/images\/(.+)$/, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params[0]);
    if (
      typeof key !== 'string' ||
      !key.startsWith(PREFIX) ||
      key.includes('..') ||
      key.endsWith('/') ||
      key.length > 1024
    ) {
      return res.status(400).json({ error: 'Clave no válida' });
    }
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    res.json({ deleted: true, key });
  } catch (err) {
    console.error('delete:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la imagen' });
  }
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Galería escuchando en http://localhost:${PORT}`);
});
