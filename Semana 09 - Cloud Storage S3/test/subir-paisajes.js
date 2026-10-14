// Sube las fotos de paisajes por el mismo flujo de la app: URL firmada y PUT directo a S3.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function subir(file) {
  const ext = path.extname(file).toLowerCase();
  const contentType = TYPES[ext];
  const size = fs.statSync(file).size;
  const r = await fetch(`${BASE}/api/upload-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: path.basename(file), contentType, sizeBytes: size }),
  });
  const data = await r.json();
  if (!r.ok) return { file, ok: false, motivo: data.error };
  const put = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: fs.readFileSync(file) });
  return { file, ok: put.ok, key: data.key, motivo: put.ok ? '' : `HTTP ${put.status}` };
}

(async () => {
  const dir = process.argv[2];
  const files = fs.readdirSync(dir).filter((f) => TYPES[path.extname(f).toLowerCase()]).map((f) => path.join(dir, f));
  for (const f of files) {
    const res = await subir(f);
    console.log(`${res.ok ? 'OK  ' : 'FAIL'} ${path.basename(f)}${res.ok ? '' : ' -> ' + res.motivo}`);
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
