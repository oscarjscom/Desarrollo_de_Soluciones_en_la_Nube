// Interfaz del Mundial de predicciones (JavaScript sin librerías).
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('token');
let usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
let modoRegistro = false;
let vistaActual = 'partidos';

const BANDERAS = {'méxico':'mx','sudáfrica':'za','argentina':'ar','argelia':'dz','brasil':'br','marruecos':'ma','españa':'es','uruguay':'uy','francia':'fr','senegal':'sn','inglaterra':'gb-eng','croacia':'hr','alemania':'de','japón':'jp','portugal':'pt','colombia':'co','estados unidos':'us','paraguay':'py','países bajos':'nl','ecuador':'ec','bélgica':'be','egipto':'eg','italia':'it','corea del sur':'kr','canadá':'ca','chile':'cl','perú':'pe','venezuela':'ve','bolivia':'bo','costa rica':'cr','panamá':'pa','jamaica':'jm','haití':'ht','cuba':'cu','honduras':'hn','el salvador':'sv','guatemala':'gt','túnez':'tn','ghana':'gh','nigeria':'ng','camerún':'cm','costa de marfil':'ci','mali':'ml','cabo verde':'cv','arabia saudita':'sa','irán':'ir','australia':'au','nueva zelanda':'nz','catar':'qa','qatar':'qa','suiza':'ch','austria':'at','dinamarca':'dk','suecia':'se','noruega':'no','polonia':'pl','serbia':'rs','ucrania':'ua','chequia':'cz','república checa':'cz','turquía':'tr','grecia':'gr','escocia':'sc','irlanda':'ie','rusia':'ru','china':'cn'};
function equipo(nombre) {
  const cod = BANDERAS[String(nombre).trim().toLowerCase()];
  const img = cod ? `<img class="bandera" src="flags/${cod}.png" alt="" loading="lazy">` : '<span class="bandera sin"></span>';
  return `<span class="equipo">${img}<span>${esc(nombre)}</span></span>`;
}
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (iso) => new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function aviso(texto, error = false) {
  const el = $('aviso');
  el.textContent = texto; el.className = 'aviso' + (error ? ' error' : '');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.add('hidden'), 3200);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { ...opciones, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opciones.headers || {}) } });
  const nodo = r.headers.get('X-Nodo'); if (nodo) $('nodo').textContent = nodo; // muestra qué nodo respondió
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && token && !ruta.startsWith('/api/login')) { cerrarSesion(); throw new Error(datos.error || 'Sesión vencida'); }
  if (!r.ok) throw new Error(datos.error || 'Ocurrió un error');
  return datos;
}
const cuerpo = (o) => ({ method: 'POST', body: JSON.stringify(o) });

// ------------------------------------------------------------ sesión
function guardarSesion(datos) { token = datos.token; usuario = datos.usuario; localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(usuario)); entrar(); }
function cerrarSesion() { token = null; usuario = null; localStorage.clear(); entrar(); }

function entrar() {
  const dentro = Boolean(token && usuario);
  $('vista-acceso').classList.toggle('hidden', dentro);
  $('menu').classList.toggle('hidden', !dentro);
  $('sesion').classList.toggle('hidden', !dentro);
  if (dentro) { $('quien').textContent = usuario.nombre + (usuario.admin ? ' (admin)' : ''); mostrarVista(vistaActual); }
  else document.querySelectorAll('.vista').forEach((v) => v.classList.add('hidden'));
}

$('t-login').onclick = () => cambiarModo(false);
$('t-registro').onclick = () => cambiarModo(true);
function cambiarModo(registro) {
  modoRegistro = registro;
  $('t-login').classList.toggle('activo', !registro); $('t-registro').classList.toggle('activo', registro);
  $('a-enviar').textContent = registro ? 'Crear cuenta' : 'Ingresar'; $('a-msg').textContent = '';
}
$('form-acceso').onsubmit = async (e) => {
  e.preventDefault();
  try { guardarSesion(await api(modoRegistro ? '/api/registro' : '/api/login', cuerpo({ nombre: $('a-nombre').value, clave: $('a-clave').value }))); }
  catch (err) { $('a-msg').textContent = err.message; }
};
$('salir').onclick = cerrarSesion;

// ------------------------------------------------------------ navegación
document.querySelectorAll('#menu button').forEach((b) => (b.onclick = () => mostrarVista(b.dataset.vista)));
function mostrarVista(v) {
  vistaActual = v;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === v));
  document.querySelectorAll('.vista').forEach((s) => s.classList.toggle('hidden', s.id !== 'vista-' + v));
  ({ partidos: cargarPartidos, ranking: cargarRanking, salas: cargarSalas, stats: cargarStats })[v]();
}

// ------------------------------------------------------------ partidos
const ESTADOS = { abierto: 'Abierto', en_juego: 'En juego', finalizado: 'Finalizado' };

function desglose(d) {
  if (!d || d.sinPrediccion) return '<span class="puntos cero">Sin predicción: 0 puntos</span>';
  const partes = [`base ${d.base}`];
  if (d.racha) partes.push(`racha +${d.racha}`);
  if (d.anticipada) partes.push(`anticipada +${d.anticipada}`);
  return `<span class="puntos ${d.total ? '' : 'cero'}">${d.total} punto${d.total === 1 ? '' : 's'}</span> <span class="suave">(${partes.join(' · ')})</span>`;
}

async function cargarPartidos() {
  const partidos = await api('/api/partidos');
  $('lista-partidos').innerHTML = partidos.map((p) => {
    const mia = p.miPrediccion;
    let accion = '';
    if (p.estado === 'abierto' && !usuario.admin) {
      accion = `<form data-pred="${p.id}"><input type="number" min="0" max="20" required value="${mia ? mia.golesLocal : ''}" aria-label="Goles de ${esc(p.local)}"><span>-</span><input type="number" min="0" max="20" required value="${mia ? mia.golesVisitante : ''}" aria-label="Goles de ${esc(p.visitante)}"><button class="primario">${mia ? 'Actualizar' : 'Predecir'}</button></form>`;
    }
    if (mia) accion += `<div class="mia">Tu predicción: <b>${mia.golesLocal} - ${mia.golesVisitante}</b></div>`;
    if (p.estado === 'finalizado') accion += `<div class="mia">${desglose(p.misPuntos)}</div>`;
    if (usuario.admin && p.estado !== 'finalizado') accion += `<form class="admin-res" data-res="${p.id}"><span class="suave">Resultado:</span><input type="number" min="0" max="20" required><span>-</span><input type="number" min="0" max="20" required><button class="secundario">Finalizar</button></form>`;
    return `<article class="tarjeta partido"><div class="meta"><span>${esc(p.fase)} · ${fecha(p.inicio)}</span><span class="etiqueta e-${p.estado}">${ESTADOS[p.estado]}</span></div>
      <div class="equipos">${equipo(p.local)}<span class="marcador">${p.finalizado ? p.golesLocal + ' - ' + p.golesVisitante : 'vs'}</span>${equipo(p.visitante)}</div>${accion}</article>`;
  }).join('');
  document.querySelectorAll('form[data-pred]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault(); const [a, b] = f.querySelectorAll('input');
    try { const r = await api(`/api/partidos/${f.dataset.pred}/prediccion`, { method: 'PUT', body: JSON.stringify({ golesLocal: a.value, golesVisitante: b.value }) }); aviso(r.anticipada ? 'Predicción guardada (anticipada: +1 si aciertas)' : 'Predicción guardada'); cargarPartidos(); }
    catch (err) { aviso(err.message, true); }
  }));
  document.querySelectorAll('form[data-res]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault(); const [a, b] = f.querySelectorAll('input');
    try { await api(`/api/admin/partidos/${f.dataset.res}/resultado`, cuerpo({ golesLocal: a.value, golesVisitante: b.value })); aviso('Resultado registrado'); cargarPartidos(); }
    catch (err) { aviso(err.message, true); }
  }));
}

// ------------------------------------------------------------ ranking
function tablaRanking(filas) {
  if (!filas.length) return '<p class="suave">Todavía no hay participantes.</p>';
  return `<table><thead><tr><th class="pos">#</th><th>Participante</th><th class="num">Puntos</th><th class="num">Aciertos</th><th class="num">Exactos</th><th class="num">Mejor racha</th></tr></thead><tbody>${filas.map((f) => `<tr class="${f.usuarioId === usuario.id ? 'yo' : ''} ${f.posicion === 1 && f.puntos > 0 ? 'oro' : ''}"><td class="pos">${f.posicion}</td><td>${esc(f.nombre)}</td><td class="num"><b>${f.puntos}</b></td><td class="num">${f.aciertos}</td><td class="num">${f.exactos}</td><td class="num">${f.mejorRacha}</td></tr>`).join('')}</tbody></table>`;
}
async function cargarRanking() { $('tabla-ranking').innerHTML = tablaRanking(await api('/api/ranking')); }

// ------------------------------------------------------------ salas
async function cargarSalas() {
  const salas = await api('/api/salas');
  $('lista-salas').innerHTML = salas.length ? salas.map((s) => `<article class="tarjeta sala-item" data-sala="${s.id}"><h3>${esc(s.nombre)}</h3><div class="suave">${s.miembros} miembro${s.miembros === 1 ? '' : 's'}${s.esCreador ? ' · eres el creador' : ''}</div></article>`).join('') : '<p class="suave">Aún no estás en ninguna sala. Crea una o únete con un código.</p>';
  document.querySelectorAll('.sala-item').forEach((el) => (el.onclick = () => verSala(el.dataset.sala)));
}

async function verSala(id) {
  const s = await api('/api/salas/' + id);
  const caja = $('detalle-sala'); caja.classList.remove('hidden');
  caja.innerHTML = `<h3>${esc(s.nombre)}</h3>
    <div>Código de invitación: <span class="codigo">${esc(s.codigo)}</span> <button class="secundario" id="copiar">Copiar</button></div>
    <div class="acciones">${s.esCreador ? '<button class="secundario" id="nuevo-codigo">Generar código nuevo</button><button class="peligro" id="borrar-sala">Eliminar sala</button>' : '<button class="peligro" id="salir-sala">Salir de la sala</button>'}</div>
    <h3>Ranking de la sala</h3>${tablaRanking(s.ranking).replace(/<\/tr>/g, (m) => m)}
    ${s.esCreador ? `<div class="acciones">${s.ranking.filter((f) => f.usuarioId !== s.creadorId).map((f) => `<button class="peligro" data-sacar="${f.usuarioId}">Sacar a ${esc(f.nombre)}</button>`).join('')}</div>` : ''}`;
  $('copiar').onclick = () => { navigator.clipboard?.writeText(s.codigo); aviso('Código copiado'); };
  const accion = (idBoton, fn) => { const b = $(idBoton); if (b) b.onclick = async () => { try { await fn(); } catch (e) { aviso(e.message, true); } }; };
  accion('nuevo-codigo', async () => { await api(`/api/salas/${id}/codigo`, cuerpo({})); aviso('Código renovado'); verSala(id); });
  accion('borrar-sala', async () => { if (confirm('¿Eliminar la sala?')) { await api('/api/salas/' + id, { method: 'DELETE' }); caja.classList.add('hidden'); cargarSalas(); } });
  accion('salir-sala', async () => { await api(`/api/salas/${id}/salir`, cuerpo({})); caja.classList.add('hidden'); cargarSalas(); });
  caja.querySelectorAll('[data-sacar]').forEach((b) => (b.onclick = async () => { try { await api(`/api/salas/${id}/miembros/${b.dataset.sacar}`, { method: 'DELETE' }); verSala(id); } catch (e) { aviso(e.message, true); } }));
}

$('form-crear-sala').onsubmit = async (e) => {
  e.preventDefault();
  try { const s = await api('/api/salas', cuerpo({ nombre: $('s-nombre').value })); $('s-nombre').value = ''; $('s-msg').textContent = ''; aviso('Sala creada: comparte el código ' + s.codigo); await cargarSalas(); verSala(s.id); }
  catch (err) { $('s-msg').textContent = err.message; }
};
$('form-unirse').onsubmit = async (e) => {
  e.preventDefault();
  try { const s = await api('/api/salas/unirse', cuerpo({ codigo: $('s-codigo').value })); $('s-codigo').value = ''; $('s-msg').textContent = ''; aviso('Te uniste a ' + s.nombre); await cargarSalas(); verSala(s.id); }
  catch (err) { $('s-msg').textContent = err.message; }
};

// ------------------------------------------------------------ estadísticas
async function cargarStats() {
  const s = await api('/api/estadisticas');
  const t = (valor, etq) => `<div class="tarjeta"><div class="valor">${valor}</div><div class="etq">${etq}</div></div>`;
  $('tarjetas-stats').innerHTML = usuario.admin ? '<p class="suave">El administrador no participa en las predicciones.</p>'
    : t(s.puntos, 'Puntos') + t(s.posicion ? `${s.posicion}/${s.participantes}` : '-', 'Posición general') + t(s.aciertos, 'Ganadores acertados') + t(s.exactos, 'Marcadores exactos') + t(s.mejorRacha, 'Mejor racha') + t(s.efectividad + '%', 'Efectividad');
}

// ------------------------------------------------------------ inicio
api('/api/info').then((i) => { $('nodo').textContent = i.nodo; }).catch(() => {});
entrar();
