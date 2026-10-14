const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

const fileInput = document.getElementById('file');
const drop = document.getElementById('drop');
const picked = document.getElementById('picked');
const uploadBtn = document.getElementById('uploadBtn');
const statusEl = document.getElementById('status');
const gallery = document.getElementById('gallery');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
let chosen = null;

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + kind;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Validación en el navegador (la verdadera validación está en el servidor)
function choose(file) {
  if (!file) return;
  if (!ALLOWED.includes(file.type)) {
    chosen = null;
    picked.textContent = '';
    uploadBtn.disabled = true;
    setStatus('Formato no permitido. Usa JPG, PNG o WebP.', 'err');
    return;
  }
  if (file.size > MAX_BYTES) {
    chosen = null;
    picked.textContent = '';
    uploadBtn.disabled = true;
    setStatus('La imagen supera los 5 MB.', 'err');
    return;
  }
  chosen = file;
  picked.textContent = `${file.name} · ${formatSize(file.size)}`;
  uploadBtn.disabled = false;
  setStatus('');
}

fileInput.addEventListener('change', () => choose(fileInput.files[0]));

['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); })
);
['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); })
);
drop.addEventListener('drop', (e) => choose(e.dataTransfer.files[0]));

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error');
  return data;
}

// Flujo: 1) pedir URL firmada al servidor  2) subir el archivo directo a S3
uploadBtn.addEventListener('click', async () => {
  if (!chosen) return;
  uploadBtn.disabled = true;
  setStatus('Preparando la subida…');
  try {
    const { uploadUrl } = await api('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: chosen.name,
        contentType: chosen.type,
        sizeBytes: chosen.size,
      }),
    });

    setStatus('Subiendo…');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': chosen.type },
      body: chosen,
    });
    if (!put.ok) throw new Error('La subida fue rechazada por el almacenamiento');

    setStatus('Imagen subida correctamente.', 'ok');
    chosen = null;
    fileInput.value = '';
    picked.textContent = '';
    await loadGallery();
  } catch (err) {
    setStatus(err.message, 'err');
    uploadBtn.disabled = !chosen;
  }
});

function card(item) {
  const el = document.createElement('figure');
  el.className = 'card';

  const img = document.createElement('img');
  img.src = item.url;
  img.alt = item.name;
  img.loading = 'lazy';

  const caption = document.createElement('figcaption');
  caption.className = 'card-caption';
  caption.textContent = item.name;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const when = document.createElement('span');
  when.className = 'muted';
  when.style.fontSize = '';
  when.textContent = `${formatSize(item.size)} · ${new Date(item.lastModified).toLocaleDateString('es-PE')}`;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-small btn-danger';
  del.textContent = 'Eliminar';
  del.addEventListener('click', () => removeImage(item));

  meta.append(when, del);
  el.append(img, caption, meta);
  return el;
}

async function loadGallery() {
  try {
    const { items } = await api('/api/images');
    gallery.replaceChildren(...items.map(card));
    empty.classList.toggle('hidden', items.length > 0);
    count.textContent = items.length ? `${items.length} ${items.length === 1 ? 'imagen' : 'imágenes'}` : '';
  } catch (err) {
    setStatus(err.message, 'err');
  }
}

async function removeImage(item) {
  if (!confirm('¿Eliminar esta imagen? No se puede deshacer.')) return;
  try {
    await api('/api/images/' + encodeURIComponent(item.key), { method: 'DELETE' });
    setStatus('Imagen eliminada.', 'ok');
    await loadGallery();
  } catch (err) {
    setStatus(err.message, 'err');
  }
}

document.getElementById('refresh').addEventListener('click', loadGallery);
loadGallery();
