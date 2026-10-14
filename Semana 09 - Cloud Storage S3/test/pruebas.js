require('dotenv').config();
// Pruebas del ejercicio 4. Requiere el servidor encendido (npm start) en el puerto 3000.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let ok = 0, fail = 0;
const check = (cond, name) => { cond ? ok++ : fail++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); };

const post = (body) => fetch(`${BASE}/api/upload-url`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

(async () => {
  // Validaciones del servidor
  let r = await post({ filename: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 1000 });
  const good = await r.json();
  check(r.status === 200 && good.uploadUrl && good.key.startsWith('originales/'), 'JPG válido recibe URL firmada');
  check(/X-Amz-Expires=300/.test(good.uploadUrl), 'la URL de subida dura 5 minutos (X-Amz-Expires=300)');
  // El ID de clave (AKIA...) sí aparece en X-Amz-Credential, es público. Lo que nunca debe salir es la clave secreta.
  const secreto = process.env.AWS_SECRET_ACCESS_KEY || '';
  check(secreto.length === 40 && !good.uploadUrl.includes(secreto), 'la URL firmada no contiene la clave secreta');

  r = await post({ filename: 'virus.exe', contentType: 'application/x-msdownload', sizeBytes: 1000 });
  check(r.status === 400, 'un .exe es rechazado por el servidor');

  r = await post({ filename: 'doc.pdf', contentType: 'application/pdf', sizeBytes: 1000 });
  check(r.status === 400, 'un PDF es rechazado por el servidor');

  r = await post({ filename: 'grande.jpg', contentType: 'image/jpeg', sizeBytes: 10 * 1024 * 1024 });
  check(r.status === 400, 'un archivo de 10 MB es rechazado por el servidor');

  r = await post({ filename: 'x.png', contentType: 'image/png', sizeBytes: -5 });
  check(r.status === 400, 'un tamaño negativo es rechazado');

  // Subida real: el navegador habla directo con S3 (aquí simulado con PUT a la URL firmada)
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8ffff3f0005fe02fea7d6d1a00000000049454e44ae426082', 'hex');
  const up = await fetch(good.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: png });
  check(up.ok, 'la subida directa a S3 con la URL firmada responde OK');

  // Listado con URLs de visualización de 15 minutos
  r = await fetch(`${BASE}/api/images`);
  const list = await r.json();
  const found = list.items.find((i) => i.key === good.key);
  check(r.status === 200 && Boolean(found), 'la imagen subida aparece en la galería');
  check(found && /X-Amz-Expires=900/.test(found.url), 'las URLs de visualización duran 15 minutos (X-Amz-Expires=900)');

  // Borrado: solo dentro de originales/ y sin rutas peligrosas
  r = await fetch(`${BASE}/api/images/${encodeURIComponent('../secreto.txt')}`, { method: 'DELETE' });
  check(r.status === 400, 'no se puede borrar fuera de originales/ (path traversal)');

  r = await fetch(`${BASE}/api/images/${encodeURIComponent('miniaturas/otra.jpg')}`, { method: 'DELETE' });
  check(r.status === 400, 'no se puede borrar fuera de originales/ (otra carpeta)');

  r = await fetch(`${BASE}/api/images/${encodeURIComponent(good.key)}`, { method: 'DELETE' });
  const del = await r.json();
  check(r.status === 200 && del.deleted === true, 'la imagen de prueba se elimina');

  console.log(`\n${ok} pruebas correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
