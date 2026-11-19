// Permisos de quien entró (los manda /api/yo según su rol). null = todo permitido (modo local o con contraseña)
let permisosYo = null, rolYo = '', miEmail = '';
const puede = p => !permisosYo || permisosYo.has(p);
const PERM_VISTA = { inicio: 'ver_inicio', mensajes: 'ver_mensajes', redes: 'ver_redes', agentes: 'ver_agentes', usuarios: 'usuarios' };
const vistaPermitida = v => puede(PERM_VISTA[v] || 'ver_inicio');
const primeraVista = () => ['inicio', 'mensajes', 'redes', 'agentes', 'usuarios'].find(vistaPermitida) || 'inicio';
const puedeAjustarAgente = id => puede('ajustes_agentes') || (id === 'whatsapp' && (puede('anuncios_ver') || puede('anuncios_mensajes')));
function aplicarPermisos() {   // esconde del menú lo que su rol no puede ver
  document.querySelectorAll('.menu button[data-vista]').forEach(b => { b.hidden = !vistaPermitida(b.dataset.vista); });
  if (!vistaPermitida(document.body.dataset.vista || 'inicio')) irA(primeraVista());
  if (typeof pintarAgentesPanel === 'function' && agentes && agentes.length) pintarAgentesPanel();
}

// ---- acceso con Google: la página se muestra solo si hay sesión; si no, va a la pantalla de entrada ----
(function () {
  const nativo = window.fetch.bind(window);
  window.fetch = async (...args) => {   // cualquier consulta que vuelva con "hay que entrar" manda a la pantalla de entrada
    const r = await nativo(...args);
    const login = r.status === 401 && r.headers.get('X-Login');
    if (login) location.replace(login);
    return r;
  };
  const listo = () => document.documentElement.classList.remove('verificando');
  nativo('/api/yo').then(async r => {
    if (r.status === 401) { location.replace('/entrar.html'); return; }
    const j = await r.json().catch(() => ({}));
    listo();
    permisosYo = Array.isArray(j.permisos) ? new Set(j.permisos) : null; rolYo = j.rol || ''; miEmail = j.email || '';
    aplicarPermisos();
    if (j.google) {
      const quien = document.getElementById('estado-sistema'); if (quien) { quien.textContent = j.rol || j.email; quien.title = j.email; }
      const nombre = (j.nombre || String(j.email || '').split('@')[0] || 'Hacedores').trim();
      const pn = document.getElementById('perfil-nombre'); if (pn) pn.textContent = nombre;
      const pa = document.getElementById('perfil-avatar');
      if (pa) {
        pa.textContent = nombre.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'H';
        if (j.foto) { const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onload = () => { pa.textContent = ''; pa.appendChild(im); }; im.src = j.foto; }
      }
      const salir = document.getElementById('btn-salir-google');
      if (salir) { salir.hidden = false; salir.addEventListener('click', async () => { await nativo('/api/logout', { method: 'POST' }); location.replace('/entrar.html'); }); }
    }
  }).catch(listo);   // si no hay conexión con el servidor no se deja la pantalla en blanco
})();

// Colores de cada red en la sección de seguidores del inicio
const COLOR_SEG = { facebook: '#20a8c1', instagram: '#e72c5e', youtube: '#fcc139', tiktok: '#7858a1', twitter: '#b7cf4b' };
const REDES = [
  { id: 'instagram', nombre: 'Instagram', color: '#E1306C', icono: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>' },
  { id: 'facebook', nombre: 'Facebook', color: '#1877F2', icono: '<path d="M14 8h2.5V5H14c-2.5 0-4 1.6-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13V9.5c0-.8.4-1.5 1-1.5z" fill="currentColor"/>' },
  { id: 'youtube', nombre: 'YouTube', color: '#FF0000', icono: '<rect x="2.5" y="6" width="19" height="12" rx="3.5" fill="currentColor"/><path d="M10 9.5v5l4.5-2.5z" fill="#FFFFFF"/>' },
  { id: 'tiktok', nombre: 'TikTok', color: '#111111', icono: '<path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3V8.7a6.6 6.6 0 1 0 5.8 6.5V8.3a5.5 5.5 0 0 0 3.5 1.2V6.4A3.6 3.6 0 0 1 14 3z" fill="currentColor"/>' },
  { id: 'twitter', nombre: 'X', color: '#111111', icono: '<path d="M4 4h4.2l4 5.6L17.9 4H20l-6.2 7.2L20.5 20h-4.2l-4.3-6-5.1 6H4.8l6.6-7.6z" fill="currentColor"/>' },
];
let datos = [];
let datosTodos = [];
let redActiva = 'instagram';
let agentes = [];
let oficinaIniciada = false;
let modoPublico = false;   // en línea: el engrane pide la contraseña del panel y no se puede escribir en la hoja de seguidores

const $ = s => document.querySelector(s);
const fmt = n => (n == null ? '—' : n.toLocaleString('es-MX'));
const compacto = n => (n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
const cambioTxt = n => (n == null ? '<span class="neu">sin dato</span>' : n > 0 ? `<span class="pos">▲ +${n}</span>` : n < 0 ? `<span class="neg">▼ ${n}</span>` : '<span class="neu">sin cambio</span>');
function hoyTexto() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
function trabajaHoy(a) { return !!(a.ultimo && a.ultimo.fecha === hoyTexto()); }

const COLORES = ['#5E8C61', '#E08A4B', '#5E7FB0', '#C4553D', '#8A6FB0', '#3E8C8C'];

// ---------- menú: una sección a la vez ----------
function irA(vista) {
  if (!vistaPermitida(vista)) vista = primeraVista();
  const previa = document.body.dataset.vista;
  document.body.dataset.vista = vista;
  if (previa === 'mensajes' && vista !== 'mensajes') { convActiva = ''; const ap = document.querySelector('.msg-app'); if (ap) ap.classList.remove('con-chat'); }   // al salir de Mensajes no queda una conversación abierta
  if (vista === 'mensajes') $('#modal-conv').hidden = true;   // si venías de una ventana emergente en Inicio, ahora se ve en el panel
  document.querySelectorAll('.vista').forEach(v => { v.hidden = v.id !== 'vista-' + vista; });
  document.querySelectorAll('.menu button').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  try { localStorage.setItem('vista', vista); } catch { /* sin almacenamiento */ }
  if (vista === 'redes') setTimeout(pintarGrafica, 0);   // la gráfica necesita medir su ancho ya visible
  if (vista === 'inicio') setTimeout(pintarGraficaInicio, 0);
  if (vista === 'mensajes') { pintarColumnas(); pintarConversacion(); cargarMensajes(); }
  mapaSegunVista(vista);
  if (vista === 'usuarios') pintarUsuarios();
}
document.querySelectorAll('.menu button').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));
// Mapa 2D de la sección Agentes: al entrar, los agentes se meten al mapa; al salir, vuelven a caminar por la página
const infoMapa = (window.Mapa2D && document.getElementById('mapa-2d')) ? Mapa2D.montar(document.getElementById('mapa-2d')) : null;
function mapaSegunVista(vista) {
  if (!infoMapa || !window.Mascotas) return;
  if (vista === 'agentes') setTimeout(() => { if (document.body.dataset.vista === 'agentes') Mascotas.irAlMapa(infoMapa); }, 80);
  else Mascotas.salirDelMapa();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if (b) irA(b.dataset.ir); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarTodo(); });

// ---------- datos ----------
async function cargar() {
  const [ag, seg, reg] = await Promise.all([
    fetch('/api/agentes').then(r => r.json()),
    fetch('/api/seguidores?limite=1000').then(r => r.json()).catch(e => ({ error: e.message })),
    fetch('/api/registro').then(r => r.json()),
  ]);
  agentes = ag.agentes;
  modoPublico = !!ag.modoPublico;
  datosTodos = seg.error ? [] : seg.ultimos;   // todo el historial que devuelve la hoja (hasta 1000 filas)
  datos = datosTodos.slice(-60);                // los últimos 60 registros, para la sección Redes
  pintarAgentesPanel();
  pintarRedes();
  pintarGrafica();
  pintarRegistro(reg.registro);
  pintarSeguidoresInicio();
  pintarBarrasRedes();
  if (!cachePosts.__listo) { cachePosts.__listo = true; cargarPost(); }
}

// ---------- caras de los agentes ----------
function cara(color, trabaja) {
  return `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
    <circle cx="22" cy="22" r="21" fill="${color}" opacity=".16"/>
    <circle cx="22" cy="22" r="20" fill="none" stroke="${trabaja ? '#e72c5e' : '#D9D2C5'}" stroke-width="2"/>
    <path d="M10 42 Q22 27 34 42 Z" fill="${color}"/>
    <circle cx="22" cy="19" r="8.5" fill="#F2C9A0"/>
    <path d="M13.5 17.5 Q14 9.5 22 9.5 Q30.5 9.5 30.5 17.5 Q27 13.5 22 14 Q17 13.5 13.5 17.5 Z" fill="#2B2F2A"/>
    <circle cx="19" cy="20" r="1.2" fill="#2B2F2A"/><circle cx="25" cy="20" r="1.2" fill="#2B2F2A"/>
    <path d="${trabaja ? 'M19 23.5 Q22 25.8 25 23.5' : 'M19 24 Q22 22.6 25 24'}" stroke="#2B2F2A" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// ---------- ventas de WooCommerce: se consultan cada minuto y cada venta nueva la anuncia su mascota ----------
let ventas = null;
const dinero = n => '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
const CLAVE_VENTA = 'ventas-ultima-id';
// Sonido de "caja registradora": se genera en el navegador (no hay archivo de audio). Los navegadores solo dejan sonar después de que tocas la página una vez.
let audioCtx = null;
const sonidoActivo = () => { try { return localStorage.getItem('ventas-sonido') !== '0'; } catch { return true; } };
const AudioNav = window.AudioContext || window.webkitAudioContext;
function desbloquearAudio() {
  if (!AudioNav) return;
  try { audioCtx = audioCtx || new AudioNav(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch { /* sin audio */ }
}
['pointerdown', 'keydown'].forEach(e => document.addEventListener(e, desbloquearAudio, { passive: true }));
function sonidoVenta() {
  if (!audioCtx || audioCtx.state !== 'running') return false;
  const t = audioCtx.currentTime;
  const nota = (f, ini, dur, vol, tipo) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo || 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + ini); g.gain.exponentialRampToValueAtTime(vol, t + ini + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + ini + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(t + ini); o.stop(t + ini + dur + 0.05);
  };
  nota(988, 0, 0.16, 0.22); nota(1319, 0.1, 0.55, 0.24); nota(1760, 0.1, 0.65, 0.1, 'sine'); nota(2637, 0.1, 0.35, 0.05, 'sine');   // "ka-ching"
  return true;
}
function anunciarVentas(nuevas) {
  const total = nuevas.reduce((s, o) => s + o.total, 0);
  const lineas = o => (o.items && o.items.length ? o.items : (o.productos || []).map(n => ({ nombre: n, cantidad: 1 }))).map(i => (i.cantidad > 1 ? i.cantidad + ' × ' : '') + i.nombre).join(', ') || 'Pedido ' + o.id;
  const sono = sonidoActivo() ? sonidoVenta() : true;
  const html = '<div class="bub-cab"><b>' + (nuevas.length === 1 ? '¡Se vendió!' : '¡Se hicieron ' + nuevas.length + ' ventas!') + '</b><span>Ventas de WooCommerce</span></div>' +
    nuevas.slice(-3).map(o => '<p class="bub-linea"><b>' + esc(lineas(o)) + '</b><br><span class="monto-venta">' + dinero(o.total) + '</span></p>').join('') +
    (nuevas.length > 1 ? '<p class="bub-pie">Total vendido: <b>' + dinero(total) + '</b></p>' : '') +
    (sono ? '' : '<p class="bub-pie">Toca cualquier parte de la página una vez para que suene el aviso.</p>');
  if (window.Mascotas) Mascotas.anunciar('ventas-woocommerce', html, 12000);
}
function revisarVentasNuevas(lista) {
  let visto = null;
  try { const g = localStorage.getItem(CLAVE_VENTA); visto = g === null ? null : Number(g); } catch { /* sin almacenamiento */ }
  const maxId = lista.length ? Math.max(...lista.map(o => o.id)) : 0;
  const guardar = n => { try { localStorage.setItem(CLAVE_VENTA, String(n)); } catch { /* sin almacenamiento */ } };
  if (visto === null) { guardar(maxId); return; }   // primera vez en este navegador: no se anuncia lo que ya existía
  const nuevas = lista.filter(o => o.id > visto).sort((a, b) => a.id - b.id);
  if (!nuevas.length) return;
  guardar(maxId);
  anunciarVentas(nuevas);
}
async function cargarVentas() {
  try {
    const r = await fetch('/api/ventas'), j = await r.json().catch(() => ({}));
    if (!r.ok) { ventas = { error: j.error || 'No se pudieron leer las ventas.' }; return; }
    ventas = j;
    revisarVentasNuevas(j.ultimas || []);
  } catch { /* sin conexión: se reintenta en un minuto */ }
}
cargarVentas();
setInterval(() => { if (!document.hidden) cargarVentas(); }, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarVentas(); });

// ---------- mascotas: cada agente camina por el panel y su burbuja muestra la última actualización ----------
const ultimaTexto = a => (a.ultimo ? (a.ultimo.fecha ? 'Última actualización: ' + a.ultimo.fecha + (a.ultimo.resultado ? ' · ' + a.ultimo.resultado : '') + (a.id === 'ventas-woocommerce' && a.ultimo.nota ? ' · ' + a.ultimo.nota : '') : (a.ultimo.nota || a.ultimo.resultado || 'Sin actualizaciones todavía')) : 'Sin actualizaciones todavía');
function burbujaAgente(id) {
  const a = agentes.find(x => x.id === id); if (!a) return '';
  const t = trabajaHoy(a), u = a.ultimo;
  let cuerpo = '';
  if (id === 'seguidores-diarios') {   // icono de cada red con su cifra de hoy y el cambio contra el día anterior
    const hoy = datos[datos.length - 1], ayer = datos[datos.length - 2];
    cuerpo = '<div class="bub-redes">' + REDES.map(r => {
      const v = hoy ? hoy[r.id] : null, p = ayer ? ayer[r.id] : null, d = v != null && p != null ? v - p : null;
      const cambio = d == null ? '<em class="neu">sin dato</em>' : d > 0 ? '<em class="pos">+' + fmt(d) + '</em>' : d < 0 ? '<em class="neg">' + fmt(d) + '</em>' : '<em class="neu">+0</em>';
      return '<div class="bub-red"><svg viewBox="0 0 24 24" width="20" height="20" style="color:' + r.color + '" aria-label="' + r.nombre + '">' + r.icono + '</svg><b>' + (v == null ? '—' : fmt(v)) + '</b>' + cambio + '</div>';
    }).join('') + '</div>';
  } else if (id === 'ventas-woocommerce') {   // ventas de la tienda: hoy, este mes y la última
    if (!ventas) cuerpo = '<p class="bub-linea">Cargando ventas…</p>';
    else if (ventas.error) cuerpo = '<p class="bub-linea">' + esc(ventas.error) + '</p>';
    else {
      const fila = (t, x) => '<div class="bub-red"><b>' + t + '</b><em>' + x.n + (x.n === 1 ? ' venta' : ' ventas') + ' · ' + dinero(x.total) + '</em></div>';
      const u = (ventas.ultimas || [])[0];
      cuerpo = '<div class="bub-redes">' + fila('Hoy', ventas.hoy) + fila('Este mes', ventas.mes) + '</div>' +
        (u ? '<p class="bub-linea neu">Última: ' + esc((u.items && u.items.length ? u.items.map(i => (i.cantidad > 1 ? i.cantidad + ' × ' : '') + i.nombre) : u.productos).join(', ') || 'Pedido ' + u.id) + ' · ' + dinero(u.total) + (u.fecha ? ' · ' + esc(hace(u.fecha)) : '') + '</p>' : '<p class="bub-linea neu">Todavía no hay ventas este mes.</p>');
    }
  } else if (id === 'whatsapp') {
    const todos = conversaciones.flatMap(c => c.mensajes), hoy = diaLocal(Date.now());
    const rec = todos.filter(m => m.direccion !== 'salida' && diaLocal(m.fecha) === hoy).length, env = todos.filter(m => m.direccion === 'salida' && diaLocal(m.fecha) === hoy).length;
    cuerpo = '<p class="bub-linea">Hoy: <b>' + rec + '</b> mensajes recibidos, <b>' + env + '</b> enviados, <b>' + resumenCola.pendientes + '</b> en cola.</p>';
  }
  const pie = u ? (u.fecha ? 'Última actualización: <b>' + esc(u.fecha) + '</b>' + (u.resultado ? ' · ' + esc(u.resultado) : '') + (u.nota ? '<br>' + esc(u.nota) : '') : esc(u.nota || u.resultado || 'Sin actualizaciones todavía.')) : 'Todavía no hay actualizaciones.';
  return '<div class="bub-cab"><b>' + esc(a.nombre) + '</b>' + (a.rol ? '<span>' + esc(a.rol) + '</span>' : '') + '</div>' +
    '<div class="bub-est ' + (t ? 'on' : '') + '"><i></i>' + (t ? 'Trabajando hoy' : 'Descansando') + '</div>' + cuerpo + (id === 'ventas-woocommerce' && ventas && ventas.error ? '' : '<p class="bub-pie">' + pie + '</p>');   // sin conexión a la tienda el cuerpo ya explica el problema
}
function sincronizarMascotas() {
  if (!window.Mascotas) return;
  // cada mascota con su propio color: el que elegiste en los ajustes y, si se repite o falta, uno libre de la paleta
  const paleta = [...COLORES, '#e72c5e', '#E5A92B', '#2B2B2A'], usados = new Set();
  const elegir = a => { const c = (a.color || '').toLowerCase(); if (c && !usados.has(c)) return c; return (paleta.find(p => !usados.has(p.toLowerCase())) || paleta[0]); };
  Mascotas.sincronizar(agentes.map(a => { const color = elegir(a); usados.add(color.toLowerCase()); coloresMasc[a.id] = color; return { id: a.id, nombre: a.nombre, color }; }), burbujaAgente);
}
const coloresMasc = {};

// Engrane junto al título "Agentes": tamaño de las mascotas y cuáles se ven
function cerrarPanelMasc() {
  const p = $('#panel-masc'); if (p) p.remove();
  $('#btn-ajuste-masc').setAttribute('aria-expanded', 'false');
}
function abrirPanelMasc() {
  if ($('#panel-masc')) { cerrarPanelMasc(); return; }
  const btn = $('#btn-ajuste-masc'), pref = Mascotas.preferencias();
  const p = document.createElement('div'); p.id = 'panel-masc'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Ajustes de los agentes');
  p.innerHTML = '<h4>Tamaño</h4><div class="fila-tam"><input type="range" min="0.5" max="2.5" step="0.1" value="' + pref.escala + '" aria-label="Tamaño de los agentes"><span class="valor-tam">' + Math.round(pref.escala * 100) + '%</span></div>' +
    '<div class="acciones-vis"><button type="button" data-tam="1">Tamaño normal</button></div><div class="sep"></div><h4>Agentes visibles</h4>' +
    '<div class="lista-vis">' + agentes.map(a => '<label class="vis"><input type="checkbox" data-id="' + esc(a.id) + '"' + (pref.ocultos.includes(a.id) ? '' : ' checked') + '><span class="punto-color" style="background:' + esc(coloresMasc[a.id] || '#999') + '"></span>' + esc(a.nombre) + '</label>').join('') + '</div>' +
    '<div class="acciones-vis"><button type="button" data-todos="1">Mostrar todos</button><button type="button" data-todos="0">Ocultar todos</button></div>' +
    '<div class="sep"></div><h4>Ventas</h4><label class="vis"><input type="checkbox" id="chk-sonido"' + (sonidoActivo() ? ' checked' : '') + '>Sonido cuando se hace una venta</label><div class="acciones-vis"><button type="button" id="btn-probar-sonido">Probar sonido</button></div>';
  document.body.appendChild(p);
  const r = btn.getBoundingClientRect();
  p.style.left = Math.max(12, Math.min(r.left + scrollX, innerWidth - p.offsetWidth - 12)) + 'px'; p.style.top = (r.bottom + scrollY + 10) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  const rango = p.querySelector('input[type=range]'), valor = p.querySelector('.valor-tam');
  rango.addEventListener('input', () => { Mascotas.cambiarEscala(rango.value); valor.textContent = Math.round(rango.value * 100) + '%'; });
  p.querySelector('[data-tam]').addEventListener('click', () => { rango.value = 1; Mascotas.cambiarEscala(1); valor.textContent = '100%'; });
  const marcas = [...p.querySelectorAll('input[type=checkbox]')];
  marcas.forEach(i => i.addEventListener('change', () => Mascotas.mostrarAgente(i.dataset.id, i.checked)));
  p.querySelector('#chk-sonido').addEventListener('change', e => { try { localStorage.setItem('ventas-sonido', e.target.checked ? '1' : '0'); } catch { /* sin almacenamiento */ } });
  p.querySelector('#btn-probar-sonido').addEventListener('click', () => { desbloquearAudio(); setTimeout(sonidoVenta, 60); });
  p.querySelectorAll('[data-todos]').forEach(b => b.addEventListener('click', () => marcas.forEach(i => { i.checked = b.dataset.todos === '1'; Mascotas.mostrarAgente(i.dataset.id, i.checked); })));
}
$('#btn-ajuste-masc').addEventListener('click', e => { e.stopPropagation(); abrirPanelMasc(); });
document.addEventListener('pointerdown', e => { if ($('#panel-masc') && !e.target.closest('#panel-masc, #btn-ajuste-masc')) cerrarPanelMasc(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarPanelMasc(); });

// ---------- panel derecho: agentes ----------
function pintarAgentesPanel() {
  $('#lista-agentes-panel').innerHTML = agentes.map((a, i) => {
    const t = trabajaHoy(a);
    return `<div class="agente-fila" role="button" tabindex="0" data-agente="${a.id}">
      <span class="ag-cara">${cara(a.color || COLORES[i % COLORES.length], t)}</span>
      <span class="ag-datos">
        <span class="ag-nombre">${esc(a.nombre)}</span>
        ${a.rol ? `<span class="ag-rol">${esc(a.rol)}</span>` : ''}
        <span class="ag-estado ${t ? 'on' : ''}"><i></i>${t ? 'Trabajando' : 'Descansando'}</span>
        <span class="ag-ult">${esc(ultimaTexto(a))}</span>
      </span>
      ${!puedeAjustarAgente(a.id) ? '' : `<button class="ag-engrane" data-ajustes="${a.id}" title="Ajustes del agente" aria-label="Ajustes de ${esc(a.nombre)}">
        <svg viewBox="0 0 24 24" width="17" height="17"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H19a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
      </button>`}
    </div>`;
  }).join('') || '<p class="neu">No hay agentes todavía.</p>';
  const lista = $('#lista-agentes-panel');
  lista.querySelectorAll('[data-agente]').forEach(b => {
    b.addEventListener('click', () => window.Mascotas && Mascotas.mostrar(b.dataset.agente));   // su mascota salta y abre la burbuja
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === b) window.Mascotas && Mascotas.mostrar(b.dataset.agente); });
  });
  sincronizarMascotas();
  lista.querySelectorAll('[data-ajustes]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); abrirAjustes(b.dataset.ajustes); }));
}

// ---------- ajustes del agente (engrane) ----------
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PALETA = ['#5E8C61', '#E5A92B', '#5E7FB0', '#F7695C', '#8A6FB0', '#26272B'];
const botonesAnuncios = () => (puede('anuncios_mensajes') ? '<button type="button" class="sec btn-anuncios" data-anuncios>Mensajes por anuncio…</button>' : '') + (puede('anuncios_ver') ? '<button type="button" class="sec btn-anuncios" data-meta-ads>Anuncios en Meta…</button>' : '');
function abrirAccesosAnuncios() {   // para quien no puede cambiar los ajustes del agente pero sí trabajar con anuncios
  const m = document.createElement('div'); m.className = 'modal-ajustes';
  m.innerHTML = '<div class="modal-caja"><h3>Anuncios</h3>' + botonesAnuncios() + '<div class="botones-aj"><span style="flex:1"></span><button type="button" class="sec" data-cerrar>Cerrar</button></div></div>';
  document.body.appendChild(m);
  const cerrar = () => m.remove();
  m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
  m.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  const b1 = m.querySelector('[data-anuncios]'); if (b1) b1.addEventListener('click', () => { cerrar(); abrirAnuncios(); });
  const b2 = m.querySelector('[data-meta-ads]'); if (b2) b2.addEventListener('click', () => { cerrar(); abrirMetaAds(); });
}
function abrirAjustes(id) {
  if (!puede('ajustes_agentes')) { abrirAccesosAnuncios(); return; }
  const a = agentes.find(x => x.id === id); if (!a) return;
  const i = agentes.indexOf(a);
  const actual = a.color || COLORES[i % COLORES.length];
  const m = document.createElement('div');
  m.className = 'modal-ajustes';
  m.innerHTML = `<form class="modal-caja">
    <h3>Ajustes del agente</h3>
    <label>Nombre<input name="nombre" maxlength="40" value="${esc(a.nombre)}" required></label>
    <label>Rol <small>(opcional, aparece bajo el nombre)</small><input name="rol" maxlength="60" value="${esc(a.rol)}" placeholder="Ej. Seguimiento de redes"></label>
    <div class="campo">Color
      <div class="paleta">${PALETA.map(c => `<label class="color"><input type="radio" name="color" value="${c}" ${c.toLowerCase() === actual.toLowerCase() ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div>
    </div>
    <label>Notas para el chat <small>(se suman a sus instrucciones cuando hablas con él)</small><textarea name="notas" rows="4" maxlength="1000" placeholder="Ej. Responde siempre con emojis">${esc(a.notas)}</textarea></label>
    ${modoPublico ? '<label>Contraseña del panel <small>(necesaria para guardar en línea)</small><input type="password" name="clave" autocomplete="current-password"></label>' : ''}
    ${id === 'whatsapp' ? botonesAnuncios() : ''}
    <span class="error-msg" data-aviso></span>
    <p class="nota-aj">Horario actual: ${esc(a.horario)} (se cambia en la tarea programada).</p>
    <div class="botones-aj"><button type="button" class="sec" data-restablecer>Restablecer</button><span style="flex:1"></span><button type="button" class="sec" data-cancelar>Cancelar</button><button type="submit">Guardar</button></div>
  </form>`;
  document.body.appendChild(m);
  const cerrar = () => m.remove();
  m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
  m.querySelector('[data-cancelar]').addEventListener('click', cerrar);
  const bMeta = m.querySelector('[data-meta-ads]'); if (bMeta) bMeta.addEventListener('click', () => { cerrar(); abrirMetaAds(); });
  const bAn = m.querySelector('[data-anuncios]'); if (bAn) bAn.addEventListener('click', () => { cerrar(); abrirAnuncios(); });
  const aviso = t => { m.querySelector('[data-aviso]').textContent = t; };
  const guardar = async cfg => {
    const clave = m.querySelector('input[name=clave]')?.value;
    const enviar = () => fetch('/api/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente: id, ...cfg }) });
    let r = await enviar();
    if (r.status === 401 && modoPublico) {   // en línea hace falta iniciar sesión con la contraseña del panel
      if (!clave) { aviso('Escribe la contraseña del panel para guardar.'); return; }
      const l = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: clave }) });
      if (!l.ok) { aviso((await l.json()).error || 'Contraseña incorrecta.'); return; }
      r = await enviar();
    }
    if (!r.ok) { aviso((await r.json().catch(() => ({}))).error || 'No se pudo guardar.'); return; }
    cerrar();
    const ag = await fetch('/api/agentes').then(r => r.json());
    agentes = ag.agentes;
    pintarAgentesPanel();
  };
  m.querySelector('[data-restablecer]').addEventListener('click', () => guardar({}));
  m.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    guardar({ nombre: f.get('nombre'), rol: f.get('rol'), color: f.get('color'), notas: f.get('notas') });
  });
  m.querySelector('input[name=nombre]').focus();
}

// ---------- mensajes automáticos por anuncio (agente de WhatsApp) ----------
async function abrirAnuncios() {
  const m = document.createElement('div');
  m.className = 'modal-ajustes';
  m.innerHTML = '<div class="modal-caja caja-anuncios"><h3>Mensajes por anuncio</h3><p class="nota-aj">Cuando alguien llega desde un anuncio, el agente responde con el mensaje de ese anuncio y, si la persona no contesta, manda el seguimiento. Los cambios valen desde el siguiente mensaje que llegue.</p><div data-lista><p class="neu">Cargando…</p></div><span class="error-msg" data-aviso></span><div class="botones-aj"><button type="button" class="sec" data-nuevo>+ Agregar anuncio</button><span style="flex:1"></span><button type="button" class="sec" data-cerrar>Cerrar</button></div></div>';
  document.body.appendChild(m);
  const cerrar = () => m.remove();
  m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
  m.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  const aviso = t => { m.querySelector('[data-aviso]').textContent = t || ''; };
  const llamar = async (metodo, url, cuerpo) => {
    const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-panel': '1' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo completar.');
    return j;
  };
  const tarjeta = a => {
    const nuevo = !a.id;
    return `<form class="anuncio-edit" data-id="${esc(a.id || '')}">
      <div class="anuncio-cab"><b>${nuevo ? 'Anuncio nuevo' : esc(a.nombre)}</b>${a.editado ? '<i class="mini-etq ok">Editado</i>' : ''}</div>
      ${nuevo || !a.original ? `<label>Nombre del anuncio<input name="nombre" maxlength="60" value="${esc(a.nombre || '')}" placeholder="Ej. Viernes de Consejo Maker"></label>` : ''}
      ${a.id === 'general' ? '<small>Se usa para los anuncios que no coinciden con ninguna palabra clave de los demás.</small>' : `<label>Palabras clave <small>(separadas por coma; si aparecen en el anuncio o en el mensaje de la persona, se usa este mensaje)</small><input name="palabras" value="${esc((a.palabras || []).join(', '))}" placeholder="Ej. consejo maker, viernes"></label>`}
      <label>Mensaje de respuesta<textarea name="mensaje" rows="6" maxlength="1500">${esc(a.mensaje || '')}</textarea></label>
      <label>Mensaje de seguimiento <small>(si no contesta)</small><textarea name="seguimiento" rows="4" maxlength="1500">${esc(a.seguimiento || '')}</textarea></label>
      <div class="botones-aj"><span class="ok-guardado" data-ok></span><span style="flex:1"></span>
        ${nuevo ? '<button type="button" class="sec" data-quitar-nuevo>Descartar</button>' : (a.original && a.editado ? '<button type="button" class="sec" data-restaurar>Restaurar el original</button>' : '') + '<button type="button" class="sec peligro" data-quitar>Eliminar</button>'}
        <button type="submit">Guardar</button></div>
    </form>`;
  };
  const pintar = async () => {
    try {
      const { anuncios } = await fetch('/api/anuncios').then(r => { if (!r.ok) throw new Error('No se pudieron cargar los anuncios.'); return r.json(); });
      m.querySelector('[data-lista]').innerHTML = anuncios.map(tarjeta).join('');
      enlazar();
    } catch (e) { m.querySelector('[data-lista]').innerHTML = '<p class="neu">' + esc(e.message) + '</p>'; }
  };
  const enlazar = () => m.querySelectorAll('form.anuncio-edit').forEach(f => {
    if (f.dataset.listo) return; f.dataset.listo = '1';
    f.addEventListener('submit', async e => {
      e.preventDefault(); aviso('');
      const d = new FormData(f);
      try {
        await llamar('POST', '/api/anuncios', { id: f.dataset.id, nombre: d.get('nombre') || undefined, palabras: d.get('palabras') || '', mensaje: d.get('mensaje'), seguimiento: d.get('seguimiento') });
        await pintar();
      } catch (err) { aviso(err.message); f.scrollIntoView({ block: 'nearest' }); }
    });
    const q = f.querySelector('[data-quitar]');
    if (q) q.addEventListener('click', async () => {
      const general = f.dataset.id === 'general';
      if (!confirm('Se elimina el mensaje de "' + (f.querySelector('.anuncio-cab b').textContent) + '" y el agente dejará de contestar a quien llegue por ese anuncio.' + (general ? ' Este es el mensaje general: quien llegue desde un anuncio sin palabra clave tampoco recibirá respuesta.' : '') + ' ¿Seguro?')) return;
      try { await llamar('DELETE', '/api/anuncios?id=' + encodeURIComponent(f.dataset.id)); await pintar(); } catch (err) { aviso(err.message); }
    });
    const rs = f.querySelector('[data-restaurar]');
    if (rs) rs.addEventListener('click', async () => {
      if (!confirm('Se vuelve al mensaje original. ¿Seguro?')) return;
      try { await llamar('DELETE', '/api/anuncios?restaurar=1&id=' + encodeURIComponent(f.dataset.id)); await pintar(); } catch (err) { aviso(err.message); }
    });
    const qn = f.querySelector('[data-quitar-nuevo]'); if (qn) qn.addEventListener('click', () => f.remove());
  });
  m.querySelector('[data-nuevo]').addEventListener('click', () => {
    if (m.querySelector('form.anuncio-edit[data-id=""]')) return;
    m.querySelector('[data-lista]').insertAdjacentHTML('beforeend', tarjeta({ original: false }));
    enlazar(); const t = m.querySelector('form.anuncio-edit[data-id=""]'); t.scrollIntoView({ block: 'nearest' }); t.querySelector('input[name=nombre]').focus();
  });
  pintar();
}

// ---------- anuncios de Facebook e Instagram: ver, pausar/reactivar y cambiar presupuesto ----------
async function abrirMetaAds() {
  const m = document.createElement('div');
  m.className = 'modal-ajustes';
  m.innerHTML = '<div class="modal-caja caja-anuncios caja-meta"><h3>Anuncios en Meta</h3><div data-cuerpo><p class="neu">Consultando a Meta…</p></div><span class="error-msg" data-aviso></span><div class="botones-aj"><span class="neu" data-tope></span><span style="flex:1"></span><button type="button" class="sec" data-crear-anuncio>+ Crear anuncio</button><button type="button" class="sec" data-cerrar>Cerrar</button></div></div>';
  document.body.appendChild(m);
  const cerrar = () => m.remove();
  m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
  m.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  const bCrear = m.querySelector('[data-crear-anuncio]');
  if (!puede('anuncios_crear')) bCrear.remove(); else bCrear.addEventListener('click', () => { cerrar(); abrirCrearAnuncio(); });
  const cuerpo = m.querySelector('[data-cuerpo]');
  const aviso = (t, bien) => { const a = m.querySelector('[data-aviso]'); a.textContent = t || ''; a.style.color = bien ? 'var(--bien)' : ''; };
  const peso = x => x ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: x.moneda || 'MXN', maximumFractionDigits: 2 }).format(x.valor) : '—';
  const n = v => new Intl.NumberFormat('es-MX').format(v || 0);
  let datos = null; const abiertas = new Set();
  const llamar = async (ruta, cuerpoJson) => {
    const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpoJson) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo completar.');
    return j;
  };
  const pintar = () => {
    const j = datos;
    m.querySelector('[data-tope]').textContent = 'Tope por día: ' + peso({ valor: j.tope, moneda: j.cuenta.moneda });
    cuerpo.innerHTML = '<p class="nota-aj">Cuenta: <b>' + esc(j.cuenta.nombre) + '</b> · ' + esc(j.cuenta.estado) + ' · Gastado hoy: <b>' + peso(j.gastoHoy) + '</b></p>' +
      (j.campanas.length ? '<div class="tabla-meta"><div class="fila-meta cab-meta"><span>Campaña</span><span>Estado</span><span>Presup./día</span><span>Gasto 7 d</span><span>Alcance</span><span>Mensajes</span><span></span></div>' +
        j.campanas.map(c => {
          const abierta = abiertas.has(c.id);
          const filaC = '<div class="fila-meta"><span>' + (c.conjuntos.length ? '<button type="button" class="enlace-fila" data-abrir="' + esc(c.id) + '">' + (abierta ? '▾ ' : '▸ ') + esc(c.nombre) + '</button>' : esc(c.nombre)) + '</span>' +
            '<span class="' + (c.activa ? 'pos' : 'neu') + '">' + esc(c.estado) + '</span>' +
            '<span>' + (c.presupuestoTotal.valor ? peso(c.presupuestoTotal) : '—') + (c.presupuestoEnCampana ? ' <button type="button" class="mini-acc" data-presup="' + esc(c.id) + '" data-nombre="' + esc(c.nombre) + '" data-actual="' + c.presupuestoDiario.valor + '">cambiar</button>' : '') + '</span>' +
            '<span>' + peso(c.gasto7d) + '</span><span>' + n(c.alcance7d) + '</span><span>' + n(c.mensajes7d) + '</span>' +
            '<span><button type="button" class="mini-acc ' + (c.activa ? 'peligro' : '') + '" data-estado="' + (c.activa ? 'PAUSED' : 'ACTIVE') + '" data-id="' + esc(c.id) + '" data-nombre="' + esc(c.nombre) + '">' + (c.activa ? 'Pausar' : 'Reactivar') + '</button></span></div>';
          const subs = abierta ? c.conjuntos.map(x => '<div class="fila-meta sub-meta"><span>↳ ' + esc(x.nombre) + '</span><span class="' + (x.activo ? 'pos' : 'neu') + '">' + esc(x.estado) + '</span><span>' + (x.presupuestoDiario ? peso(x.presupuestoDiario) + ' <button type="button" class="mini-acc" data-presup="' + esc(x.id) + '" data-nombre="' + esc(x.nombre) + '" data-actual="' + x.presupuestoDiario.valor + '">cambiar</button>' : (x.vitalicio ? 'total' : '—')) + '</span><span></span><span></span><span></span><span></span></div>').join('') : '';
          return filaC + subs;
        }).join('') + '</div>'
        : '<p class="neu">No hay campañas en esta cuenta.</p>') +
      '<p class="nota-aj">Pausar o reactivar siempre pide confirmación. Nunca se borra nada, y un presupuesto nunca pasa del tope.</p>';
    if (!puede('anuncios_control')) cuerpo.querySelectorAll('[data-estado], [data-presup]').forEach(e => e.remove());
    cuerpo.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.abrir; abiertas.has(id) ? abiertas.delete(id) : abiertas.add(id); pintar(); }));
    cuerpo.querySelectorAll('[data-estado]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.estado === 'ACTIVE';
      if (!confirm((act ? 'Reactivar' : 'Pausar') + ' la campaña "' + b.dataset.nombre + '"?' + (act ? '\nEmpezará a gastar su presupuesto diario.' : '\nDejará de mostrarse.'))) return;
      b.disabled = true; aviso('');
      try { const r = await llamar('/api/meta-ads/estado', { id: b.dataset.id, estado: b.dataset.estado }); await cargar(); aviso('Listo: "' + r.nombre + '" quedó ' + (act ? 'activa' : 'pausada') + '.', true); }
      catch (e) { b.disabled = false; aviso(e.message); }
    }));
    cuerpo.querySelectorAll('[data-presup]').forEach(b => b.addEventListener('click', async () => {
      const t = prompt('Nuevo presupuesto diario (en pesos) para "' + b.dataset.nombre + '".\nAhora: $' + b.dataset.actual + ' · Máximo: $' + datos.tope, b.dataset.actual);
      if (t === null) return;
      const monto = Number(String(t).replace(/[$,\s]/g, ''));
      if (!(monto > 0)) { aviso('Escribe un monto válido.'); return; }
      if (!confirm('Cambiar el presupuesto de "' + b.dataset.nombre + '" de $' + b.dataset.actual + ' a $' + monto + ' al día?')) return;
      aviso('');
      try { const r = await llamar('/api/meta-ads/presupuesto', { id: b.dataset.presup, monto }); await cargar(); aviso('Listo: ahora gasta hasta $' + r.ahora + ' al día.', true); }
      catch (e) { aviso(e.message); }
    }));
  };
  const cargar = async () => {
    try {
      const r = await fetch('/api/meta-ads'); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo consultar.');
      if (j.error) { const vars = j.variables ? Object.entries(j.variables).map(([k, v]) => '<li>' + (v ? '✓' : '✗') + ' ' + esc(k) + '</li>').join('') : ''; cuerpo.innerHTML = '<p class="error-msg">' + esc(j.error) + '</p><ul class="lista-vars">' + vars + '</ul>'; return; }
      datos = j; pintar();
    } catch (e) { cuerpo.innerHTML = '<p class="error-msg">' + esc(e.message) + '</p>'; }
  };
  cargar();
}

// ---------- crear un anuncio nuevo de clic a WhatsApp (siempre se crea pausado) ----------
async function abrirCrearAnuncio() {
  const m = document.createElement('div');
  m.className = 'modal-ajustes';
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(Date.now() + 86400000));   // mañana, hora de México
  m.innerHTML = `<form class="modal-caja caja-anuncios caja-meta"><h3>Crear anuncio</h3>
    <p class="nota-aj">Se crea <b>pausado</b>: no gasta nada hasta que lo publiques. Es un anuncio de clic a WhatsApp para Facebook e Instagram.</p>
    <div class="campo">1. Video de tu página <div class="videos-ca" data-videos><p class="neu">Buscando tus videos…</p></div>
      <label class="chico">O escribe el ID del video <input name="video" inputmode="numeric" placeholder="Solo si no aparece arriba"></label></div>
    <label>Nombre del anuncio<input name="nombre" maxlength="80" placeholder="Ej. Viernes de Consejo Maker · Chapultepec" required></label>
    <label>Texto principal <small>(lo que se lee en el anuncio)</small><textarea name="texto" rows="4" maxlength="500" placeholder="Ej. Viernes de Consejo Maker en Hacedores Chapultepec. Tus hijos construyen y aprenden con otros makers. Escríbenos por WhatsApp." required></textarea></label>
    <label>Título <small>(opcional, máx. 40)</small><input name="titulo" maxlength="40"></label>
    <div class="campo">2. Para quién
      <div class="dos-col"><label>Latitud<input name="lat" inputmode="decimal" placeholder="19.4200" required></label><label>Longitud<input name="lng" inputmode="decimal" placeholder="-99.1800" required></label></div>
      <small>Clic derecho en Google Maps sobre el lugar y copia las coordenadas.</small>
      <div class="dos-col"><label>Radio (km)<input name="radio" type="number" min="1" max="80" value="5" required></label><label>Edades<span class="par"><input name="edadMin" type="number" min="18" max="65" value="28"><input name="edadMax" type="number" min="18" max="65" value="50"></span></label></div>
      <label>Intereses <small>(busca, por ejemplo: padres, robótica, educación)</small><input name="buscar-int" placeholder="Escribe y espera un momento"></label>
      <div class="chips-ca" data-resultados></div><div class="chips-ca sel" data-elegidos></div></div>
    <div class="campo">3. Presupuesto y fechas
      <div class="dos-col"><label>Presupuesto diario ($)<input name="presupuesto" type="number" min="1" step="1" required></label><label>Duración (días)<input name="dias" type="number" min="1" max="60" value="7" required></label></div>
      <label>Fecha de inicio <small>(6:00 a. m. hora de México)</small><input name="inicio" type="date" value="${fecha}" required></label></div>
    <div class="campo">4. Mensajes automáticos de WhatsApp para este anuncio
      <label>Palabra clave <small>(debe aparecer en el texto o el título; así el agente sabe de qué anuncio llegó la persona)</small><input name="palabra" maxlength="40" placeholder="Ej. consejo maker" required></label>
      <label>Mensaje de respuesta<textarea name="respuesta" rows="5" maxlength="1500" required></textarea></label>
      <label>Mensaje de seguimiento <small>(si no contesta)</small><textarea name="seguimiento" rows="3" maxlength="1500" required></textarea></label></div>
    <span class="error-msg" data-aviso></span>
    <div data-resultado></div>
    <div class="botones-aj"><span class="neu" data-tope></span><span style="flex:1"></span><button type="button" class="sec" data-cerrar>Cerrar</button><button type="submit" data-crear>Crear (pausado)</button></div>
  </form>`;
  document.body.appendChild(m);
  const f = m.querySelector('form'), aviso = (t, bien) => { const a = m.querySelector('[data-aviso]'); a.textContent = t || ''; a.style.color = bien ? 'var(--bien)' : ''; };
  const cerrar = () => m.remove();
  m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
  m.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  const llamar = async (ruta, cuerpo) => {
    const r = await fetch(ruta, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpo) } : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo completar.');
    return j;
  };
  fetch('/api/meta-ads').then(r => r.json()).then(j => { if (j.tope) { m.querySelector('[data-tope]').textContent = 'Tope por día: $' + j.tope; f.presupuesto.max = j.tope; } }).catch(() => {});
  let videoElegido = '';
  llamar('/api/meta-ads/videos').then(({ videos }) => {
    const c = m.querySelector('[data-videos]');
    c.innerHTML = videos.length ? videos.map(v => '<label class="video-ca"><input type="radio" name="vid" value="' + esc(v.id) + '"><span class="mini" style="background-image:url(\'' + esc(v.imagen) + '\')"></span><span><b>' + esc(v.titulo) + '</b><small>' + esc((v.fecha || '').slice(0, 10)) + (v.segundos ? ' · ' + v.segundos + ' s' : '') + '</small></span></label>').join('') : '<p class="neu">No encontré videos en tu página. Escribe el ID abajo.</p>';
    c.querySelectorAll('input[name=vid]').forEach(r => r.addEventListener('change', () => { videoElegido = r.value; f.video.value = ''; }));
  }).catch(e => { m.querySelector('[data-videos]').innerHTML = '<p class="error-msg">' + esc(e.message) + ' Puedes escribir el ID del video abajo.</p>'; });
  f.video.addEventListener('input', () => { videoElegido = ''; m.querySelectorAll('input[name=vid]').forEach(r => { r.checked = false; }); });
  // intereses
  const elegidos = new Map(); let espera = null;
  const pintarElegidos = () => { const c = m.querySelector('[data-elegidos]'); c.innerHTML = [...elegidos].map(([id, nombre]) => '<button type="button" class="chip-ca on" data-quitar="' + esc(id) + '">' + esc(nombre) + ' ✕</button>').join(''); c.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => { elegidos.delete(b.dataset.quitar); pintarElegidos(); })); };
  f['buscar-int'].addEventListener('input', () => {
    clearTimeout(espera); const q = f['buscar-int'].value.trim(); const c = m.querySelector('[data-resultados]');
    if (q.length < 2) { c.innerHTML = ''; return; }
    espera = setTimeout(async () => {
      try { const { intereses } = await llamar('/api/meta-ads/intereses?q=' + encodeURIComponent(q)); c.innerHTML = intereses.map(i => '<button type="button" class="chip-ca" data-id="' + esc(i.id) + '" data-n="' + esc(i.nombre) + '">' + esc(i.nombre) + '</button>').join('') || '<span class="neu">Sin resultados.</span>';
        c.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { if (elegidos.size < 10) { elegidos.set(b.dataset.id, b.dataset.n); pintarElegidos(); } })); }
      catch (e) { c.innerHTML = '<span class="error-msg">' + esc(e.message) + '</span>'; }
    }, 400);
  });
  f.addEventListener('submit', async e => {
    e.preventDefault(); aviso('');
    const d = Object.fromEntries(new FormData(f));
    const video = videoElegido || String(d.video || '').trim();
    if (!video) { aviso('Elige un video de tu página.'); return; }
    if (!confirm('Crear el anuncio "' + d.nombre + '" (pausado)?\n\n$' + d.presupuesto + ' al día durante ' + d.dias + ' días, desde el ' + d.inicio + '.\nPúblico: ' + d.radio + ' km a la redonda, ' + d.edadMin + '–' + d.edadMax + ' años.')) return;
    const b = m.querySelector('[data-crear]'); b.disabled = true; b.textContent = 'Creando…';
    try {
      const r = await llamar('/api/meta-ads/crear', { nombre: d.nombre, video, texto: d.texto, titulo: d.titulo, palabra: d['palabra'], respuesta: d.respuesta, seguimiento: d.seguimiento, presupuesto: d.presupuesto, dias: d.dias, inicio: d.inicio, lat: d.lat, lng: d.lng, radio: d.radio, edadMin: d.edadMin, edadMax: d.edadMax, intereses: [...elegidos].map(([id, nombre]) => ({ id, nombre })) });
      f.querySelectorAll('input, textarea, button[type=submit]').forEach(x => { x.disabled = true; });
      m.querySelector('[data-resultado]').innerHTML = '<div class="resultado-ca"><b>Listo: "' + esc(r.nombre) + '" quedó creado y pausado.</b><p>Revísalo en el Administrador de anuncios de Meta. Meta puede tardar un rato en aprobarlo.' + (r.mensajes === true ? ' Sus mensajes de WhatsApp ya quedaron guardados.' : ' <span class="error-msg">Pero sus mensajes no se guardaron: ' + esc(String(r.mensajes)) + ' Agrégalos en "Mensajes por anuncio".</span>') + '</p><button type="button" class="sec" data-publicar="' + esc(r.campana) + '">Publicar ahora ($' + esc(String(r.presupuesto)) + ' al día)</button></div>';
      m.querySelector('[data-publicar]').addEventListener('click', async ev => {
        if (!confirm('Publicar "' + r.nombre + '"?\nEmpezará a gastar hasta $' + r.presupuesto + ' al día desde la fecha de inicio.')) return;
        ev.target.disabled = true;
        try { await llamar('/api/meta-ads/publicar', { campana: ev.target.dataset.publicar }); ev.target.textContent = 'Publicado ✓'; aviso('Publicado. Meta lo revisará antes de mostrarlo.', true); }
        catch (err) { ev.target.disabled = false; aviso(err.message); }
      });
    } catch (err) { b.disabled = false; b.textContent = 'Crear (pausado)'; aviso(err.message); m.querySelector('.error-msg[data-aviso]').scrollIntoView({ block: 'nearest' }); }
  });
}

// ---------- administración de usuarios y roles (solo quien tiene el permiso "usuarios") ----------
let adminDatos = null;
async function pintarUsuarios() {
  const cont = $('#usuarios-cuerpo'); if (!cont) return;
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-panel': '1' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo completar.');
    return j;
  };
  try {
    const r = await fetch('/api/usuarios'); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo cargar.');
    adminDatos = j;
  } catch (e) { cont.innerHTML = '<div class="tarjeta"><p class="error-msg">' + esc(e.message) + '</p></div>'; return; }
  const { usuarios, roles } = adminDatos;
  const opcionesRol = sel => roles.map(r => `<option value="${esc(r.nombre)}" ${r.nombre.toLowerCase() === String(sel).toLowerCase() ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('');
  const iniciales = u => (u.nombre || u.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  const filaUsuario = u => {
    const yoMismo = u.email === (miEmail || '').toLowerCase();
    const fijo = yoMismo;   // nadie cambia su propio acceso; a los demás, incluso a los de Vercel, sí se les cambia el rol
    return `<div class="usr-fila ${u.activo ? '' : 'inactivo'}" data-email="${esc(u.email)}">
      <span class="avatar">${esc(iniciales(u))}</span>
      <span class="usr-datos"><b>${esc(u.nombre || u.email.split('@')[0])}${yoMismo ? ' <i class="mini-etq-c">tú</i>' : ''}</b><small>${esc(u.email)}${u.origen === 'vercel' ? ' · cuenta de Vercel' : ''}</small></span>
      ${fijo ? `<span class="rol-fijo">${esc(u.rol)} · no puedes cambiar tu propio acceso</span>`
        : `<select class="sel-rol" aria-label="Rol de ${esc(u.email)}">${opcionesRol(u.rol)}</select>
           <button type="button" class="mini-acc" data-activo="${u.activo ? '0' : '1'}">${u.activo ? 'Desactivar' : 'Activar'}</button>
           ${u.origen === 'vercel' ? '' : '<button type="button" class="mini-acc peligro" data-quitar>Quitar</button>'}`}
    </div>`;
  };
  const filaRol = r => `<div class="rol-fila"><div class="rol-info"><b>${esc(r.nombre)}</b> <small>${r.enUso ? 'en uso' : 'sin personas'}${r.fijo ? ' · fijo' : r.editado ? ' · ajustado' : r.propio ? ' · tuyo' : ''}</small><p>${esc(r.descripcion || '')}</p></div><button type="button" class="mini-acc" data-rol="${esc(r.nombre)}">${r.fijo ? 'Ver' : 'Editar'}</button></div>`;
  cont.innerHTML = `<div class="rejilla dos">
    <section class="tarjeta"><div class="tit"><h3>Personas con acceso</h3><span class="neu">entran con su cuenta de Google</span></div>
      <div class="usr-lista">${usuarios.map(filaUsuario).join('')}</div>
      <form class="usr-nuevo" id="form-usuario"><h4>Agregar persona</h4>
        <div class="dos-col"><label>Correo de Google<input name="email" type="email" required placeholder="nombre@gmail.com"></label><label>Nombre <small>(opcional)</small><input name="nombre" maxlength="60"></label></div>
        <label>Rol<select name="rol">${opcionesRol('Solo lectura')}</select></label>
        <div class="botones-aj"><span class="error-msg" data-aviso></span><span style="flex:1"></span><button type="submit">Agregar</button></div>
      </form></section>
    <section class="tarjeta"><div class="tit"><h3>Roles</h3><button type="button" class="mini-acc" id="nuevo-rol">+ Nuevo rol</button></div>
      <p class="nota-aj">Cada rol decide qué ve y qué puede mover la persona. Los cambios valen en unos segundos.</p>
      <div class="rol-lista">${roles.map(filaRol).join('')}</div></section></div>`;
  const aviso = t => { const a = cont.querySelector('[data-aviso]'); if (a) a.textContent = t || ''; };
  const guardarUsuario = async (email, cambios) => {
    const u = usuarios.find(x => x.email === email);
    try { await pedir('POST', '/api/usuarios', { email, nombre: u.nombre, rol: u.rol, activo: u.activo, ...cambios }); await pintarUsuarios(); }
    catch (e) { aviso(e.message); alert(e.message); await pintarUsuarios(); }
  };
  cont.querySelectorAll('.usr-fila').forEach(f => {
    const email = f.dataset.email;
    const sel = f.querySelector('.sel-rol'); if (sel) sel.addEventListener('change', () => guardarUsuario(email, { rol: sel.value }));
    const act = f.querySelector('[data-activo]'); if (act) act.addEventListener('click', () => guardarUsuario(email, { activo: act.dataset.activo === '1' }));
    const q = f.querySelector('[data-quitar]');
    if (q) q.addEventListener('click', async () => {
      if (!confirm('Quitar a ' + email + '? Ya no podrá entrar al panel.')) return;
      try { await pedir('DELETE', '/api/usuarios?email=' + encodeURIComponent(email)); await pintarUsuarios(); } catch (e) { alert(e.message); }
    });
  });
  $('#form-usuario').addEventListener('submit', async e => {
    e.preventDefault(); aviso('');
    const d = Object.fromEntries(new FormData(e.target));
    try { await pedir('POST', '/api/usuarios', d); await pintarUsuarios(); }
    catch (err) { aviso(err.message); }
  });
  const editorRol = rol => {
    const nuevo = !rol, fijo = !!(rol && rol.fijo);
    const m = document.createElement('div'); m.className = 'modal-ajustes';
    const grupos = {}; adminDatos.permisos.filter(p => p.id !== 'usuarios').forEach(p => { (grupos[p.grupo] ||= []).push(p); });
    m.innerHTML = `<form class="modal-caja"><h3>${nuevo ? 'Nuevo rol' : esc(rol.nombre)}</h3>
      ${nuevo ? '<label>Nombre del rol<input name="nombre" maxlength="40" required placeholder="Ej. Diseño"></label>' : ''}
      <label>Descripción <small>(opcional)</small><input name="descripcion" maxlength="120" value="${esc(rol ? rol.descripcion : '')}" ${fijo ? 'disabled' : ''}></label>
      ${fijo ? '<p class="nota-aj">El rol Administrador tiene todos los permisos y no se puede cambiar.</p>' : ''}
      ${Object.entries(grupos).map(([g, ps]) => `<div class="campo"><b>${esc(g)}</b>${ps.map(p => `<label class="perm"><input type="checkbox" name="p" value="${p.id}" ${rol && rol.permisos.includes(p.id) ? 'checked' : ''} ${fijo ? 'disabled' : ''}> ${esc(p.texto)}</label>`).join('')}</div>`).join('')}
      <span class="error-msg" data-aviso></span>
      <div class="botones-aj">${!nuevo && !fijo ? '<button type="button" class="sec" data-borrar>' + (rol.propio ? 'Eliminar' : 'Restaurar original') + '</button>' : ''}<span style="flex:1"></span><button type="button" class="sec" data-cerrar>${fijo ? 'Cerrar' : 'Cancelar'}</button>${fijo ? '' : '<button type="submit">Guardar</button>'}</div></form>`;
    document.body.appendChild(m);
    const cerrar = () => m.remove();
    m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
    m.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    const av = t => { m.querySelector('[data-aviso]').textContent = t; };
    m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { await pedir('POST', '/api/roles', { nuevo, nombre: nuevo ? f.get('nombre') : rol.nombre, descripcion: f.get('descripcion'), permisos: f.getAll('p') }); cerrar(); await pintarUsuarios(); }
      catch (err) { av(err.message); }
    });
    const b = m.querySelector('[data-borrar]');
    if (b) b.addEventListener('click', async () => {
      if (!confirm(rol.propio ? 'Eliminar el rol ' + rol.nombre + '?' : 'Volver al rol original?')) return;
      try { await pedir('DELETE', '/api/roles?nombre=' + encodeURIComponent(rol.nombre)); cerrar(); await pintarUsuarios(); } catch (err) { av(err.message); }
    });
  };
  cont.querySelectorAll('[data-rol]').forEach(b => b.addEventListener('click', () => editorRol(roles.find(r => r.nombre === b.dataset.rol))));
  $('#nuevo-rol').addEventListener('click', () => editorRol(null));
}

// ---------- último post por red (arriba de la gráfica) ----------
const REDES_POST = ['instagram', 'facebook', 'tiktok', 'twitter'];
let redPost = 'instagram';
const cachePosts = {};
function hace(f) {
  const t = new Date(f); if (isNaN(t)) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return d < 30 ? `hace ${d} ${d === 1 ? 'día' : 'días'}` : t.toLocaleDateString('es-MX');
}
function pintarIconosPosts() {
  $('#iconos-posts').innerHTML = REDES_POST.map(id => {
    const r = REDES.find(x => x.id === id);
    return `<button class="icono-post ${id === redPost ? 'activo' : ''}" data-post="${id}" title="Último post de ${r.nombre}" aria-label="Último post de ${r.nombre}">
      <svg viewBox="0 0 24 24" width="20" height="20">${r.icono}</svg></button>`;
  }).join('');
  $('#iconos-posts').querySelectorAll('[data-post]').forEach(b => b.addEventListener('click', () => { redPost = b.dataset.post; cargarPost(); }));
}
async function cargarPost(refrescar) {
  pintarIconosPosts();
  const cont = $('#post-ultimo'), red = redPost;
  if (cachePosts[red] && !refrescar) return pintarPost(cachePosts[red]);
  cont.innerHTML = '<p class="neu">Cargando…</p>';
  try {
    const d = await fetch('/api/publicaciones?red=' + red + (refrescar ? '&refrescar=1' : '')).then(r => r.json());
    if (d.error) throw new Error(d.error);
    cachePosts[red] = d;
    if (red === redPost) pintarPost(d);
  } catch (e) { if (red === redPost) cont.innerHTML = `<p class="neu">No se pudo cargar: ${esc(e.message)}</p>`; }
}
function pintarPost(d) {
  const cont = $('#post-ultimo');
  if (!d.post) { cont.innerHTML = `<p class="neu">${esc(d.aviso || 'Sin datos.')}</p>`; return; }
  const p = d.post;
  const texto = p.texto.length > 140 ? p.texto.slice(0, 140).trim() + '…' : p.texto;
  const num = (n, i) => (n == null ? '' : `<span>${i} ${fmt(n)}</span>`);
  cont.innerHTML = `
    <a class="post-cab" href="${esc(p.url)}" target="_blank" rel="noopener">
      ${p.imagen ? `<img src="${esc(p.imagen)}" alt="" referrerpolicy="no-referrer">` : '<span class="sin-img"></span>'}
      <span class="post-info"><span class="post-texto">${esc(texto) || '<i>(sin texto)</i>'}</span>
      <span class="post-meta"><span>${hace(p.fecha)}</span>${num(p.likes, '♥')}${num(p.comentarios ?? (d.comentarios.length || null), '💬')}</span></span>
    </a>
    <div class="coments">
      <h4>Comentarios${d.comentarios.length ? ` (${d.comentarios.length})` : ''}</h4>
      ${d.aviso ? `<p class="neu aviso">${esc(d.aviso)}</p>` : ''}
      ${d.comentarios.length ? d.comentarios.map(c => `<div class="coment"><strong>${esc(c.usuario)}</strong><span class="cuando">${hace(c.fecha)}</span><p>${esc(c.texto)}</p></div>`).join('')
        : (d.aviso ? '' : '<p class="neu">Este post aún no tiene comentarios.</p>')}
    </div>`;
}

// ---------- panel derecho: redes ----------
function pintarRedes() {
  const u = datos[datos.length - 1], p = datos[datos.length - 2];
  $('#lista-redes').innerHTML = REDES.map(r => {
    const hoy = u ? u[r.id] : null, ayer = p ? p[r.id] : null;
    const d = hoy != null && ayer != null ? hoy - ayer : null;
    return `<button class="red-fila ${r.id === redActiva ? 'activa' : ''}" data-red="${r.id}">
      <span class="icono" style="color:${r.color}"><svg viewBox="0 0 24 24" width="20" height="20">${r.icono}</svg></span>
      <span class="red-datos">
        <span class="red-nombre">${r.nombre}</span>
        <span class="red-cifra">${hoy == null ? '—' : fmt(hoy)}</span>
      </span>
      <span class="red-cambio">${cambioTxt(d)}</span>
    </button>`;
  }).join('');
  $('#lista-redes').querySelectorAll('.red-fila').forEach(b => b.addEventListener('click', () => {
    redActiva = b.dataset.red; pintarRedes(); pintarGrafica();
  }));
}

// ---------- gráfica ----------
function curva(ps) {
  let d = `M${ps[0][0].toFixed(1)},${ps[0][1].toFixed(1)}`;
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[i - 1] || ps[i], p1 = ps[i], p2 = ps[i + 1], p3 = ps[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
// Gráfica de línea con área, cuadrícula y globo al pasar el mouse. pts: [{ v, texto }]
function dibujarLinea(cont, pts, { idG, previo }) {
  if (pts.length < 2) { cont.innerHTML = '<p class="neu">Sin datos suficientes para este periodo. Prueba con un rango más largo o agrupa por día.</p>'; return; }
  const W = Math.max(260, cont.clientWidth || 300), H = 190;
  const M = { t: 14, r: 12, b: 26, l: 46 };
  const vals = pts.map(d => d.v);
  const min0 = Math.min(...vals), max0 = Math.max(...vals);
  const rango0 = max0 - min0 || Math.max(1, max0 * 0.01);
  const lo = min0 - rango0 * 0.2, hi = max0 + rango0 * 0.15;
  const x = i => M.l + (i * (W - M.l - M.r)) / (pts.length - 1);
  const y = v => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const ps = pts.map((d, i) => [x(i), y(d.v)]);
  const linea = curva(ps);
  const area = linea + ` L${x(pts.length - 1).toFixed(1)},${H - M.b} L${x(0).toFixed(1)},${H - M.b} Z`;
  const grid = [0, 1, 2, 3].map(k => {
    const v = lo + ((hi - lo) * k) / 3, yy = y(v).toFixed(1);
    return `<line x1="${M.l}" x2="${W - M.r}" y1="${yy}" y2="${yy}" stroke="#ECEAE2"/>
      <text x="${M.l - 8}" y="${+yy + 4}" text-anchor="end" font-size="10" fill="#9AA095">${fmt(Math.round(v))}</text>`;
  }).join('');
  const trazo = '#e72c5e';   // rosa del tema
  const ult = pts[pts.length - 1];
  const etiquetas = `<text x="${M.l}" y="${H - 6}" font-size="10" fill="#9AA095">${esc(pts[0].texto)}</text>
    <text x="${W - M.r}" y="${H - 6}" font-size="10" fill="#9AA095" text-anchor="end">${esc(ult.texto)}</text>`;
  cont.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="${idG}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${trazo}" stop-opacity=".30"/><stop offset="100%" stop-color="${trazo}" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#${idG})"/>
    <path d="${linea}" fill="none" stroke="${trazo}" stroke-width="2.6" stroke-linecap="round"/>
    <line class="guia" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" stroke="${trazo}" stroke-dasharray="3 3" opacity="0"/>
    <circle class="punto-activo" r="5" fill="#26272B" stroke="${trazo}" stroke-width="2.5" opacity="0"/>
    <circle cx="${ps[ps.length - 1][0]}" cy="${ps[ps.length - 1][1]}" r="4.5" fill="#2B2B2A"/>
    ${etiquetas}
  </svg>
  <div class="tip" hidden></div>`;
  const svg = cont.querySelector('svg'), tip = cont.querySelector('.tip');
  const guia = cont.querySelector('.guia'), punto = cont.querySelector('.punto-activo');
  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((mx - M.l) / (W - M.l - M.r)) * (pts.length - 1))));
    const [px, py] = ps[i];
    guia.setAttribute('x1', px); guia.setAttribute('x2', px); guia.setAttribute('opacity', '.6');
    punto.setAttribute('cx', px); punto.setAttribute('cy', py); punto.setAttribute('opacity', '1');
    const prev = pts[i - 1], d = prev ? pts[i].v - prev.v : null;
    tip.hidden = false;
    tip.innerHTML = `<strong>${fmt(pts[i].v)}</strong><span>${esc(pts[i].texto)}</span>${d == null ? '' : `<span class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${fmt(d)} vs. ${previo}</span>`}`;
    tip.style.left = Math.min(W - 150, Math.max(0, px - 60)) + 'px';
    tip.style.top = Math.max(0, py - 58) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; guia.setAttribute('opacity', '0'); punto.setAttribute('opacity', '0'); });
}
// Sección Redes: una red a la vez, últimos 60 registros
function pintarGrafica() {
  const red = REDES.find(r => r.id === redActiva);
  $('#titulo-grafica').textContent = red.nombre;
  dibujarLinea($('#grafica'), datos.filter(d => d[red.id] != null).map(d => ({ v: d[red.id], texto: d.fechaTexto })), { idG: 'g-' + red.id, previo: 'día anterior' });
}
let redimension;
window.addEventListener('resize', () => { clearTimeout(redimension); redimension = setTimeout(() => { pintarGrafica(); pintarGraficaInicio(); }, 150); });

// ---------- inicio: seguidores de la semana y por red ----------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RANGOS = [{ id: '7', texto: '7 días' }, { id: '30', texto: '30 días' }, { id: '90', texto: '3 meses' }, { id: '365', texto: '1 año' }, { id: '0', texto: 'Todo' }];
const AGRUPAR = [{ id: 'dia', texto: 'Por día', previo: 'día anterior' }, { id: 'semana', texto: 'Por semana', previo: 'semana anterior' }, { id: 'mes', texto: 'Por mes', previo: 'mes anterior' }];
let ctlSeg = { red: 'total', rango: '30', agrupar: 'dia' };
try { const g = JSON.parse(localStorage.getItem('seguidores-inicio') || '{}'); if (g.red && (g.red === 'total' || REDES.some(r => r.id === g.red))) ctlSeg.red = g.red; if (RANGOS.some(r => r.id === g.rango)) ctlSeg.rango = g.rango; if (AGRUPAR.some(a => a.id === g.agrupar)) ctlSeg.agrupar = g.agrupar; } catch { /* sin preferencias guardadas */ }
const diaMx = f => { const d = new Date(Date.parse(f) - 6 * 3600000); return d; };   // la hoja guarda la medianoche de México (UTC-6): se lee con getUTC*
// Serie de seguidores: "total" suma las redes (si a una le falta el dato de un día se usa el último que tuvo)
function serieSeguidores() {
  const base = [], ultimoDe = {};
  for (const d of datosTodos) {
    let v;
    if (ctlSeg.red === 'total') {
      REDES.forEach(r => { if (d[r.id] != null) ultimoDe[r.id] = d[r.id]; });
      if (!REDES.every(r => ultimoDe[r.id] != null)) continue;
      v = REDES.reduce((s, r) => s + ultimoDe[r.id], 0);
    } else { v = d[ctlSeg.red]; if (v == null) continue; }
    const t = diaMx(d.fecha);
    if (isNaN(t)) continue;
    base.push({ t, v, texto: d.fechaTexto });
  }
  const limite = Number(ctlSeg.rango) ? Date.now() - Number(ctlSeg.rango) * 86400000 : 0;
  const enRango = base.filter(p => p.t.getTime() >= limite - 6 * 3600000);
  if (ctlSeg.agrupar === 'dia') return enRango;
  // por semana (lunes a domingo) o por mes: cada punto es el último dato del periodo
  const grupos = new Map();
  for (const p of enRango) {
    let clave, texto;
    if (ctlSeg.agrupar === 'semana') {
      const lun = new Date(p.t); lun.setUTCDate(lun.getUTCDate() - ((lun.getUTCDay() + 6) % 7));
      clave = lun.toISOString().slice(0, 10); texto = 'Semana del ' + lun.getUTCDate() + ' ' + MESES[lun.getUTCMonth()];
    } else { clave = p.t.getUTCFullYear() + '-' + p.t.getUTCMonth(); texto = MESES[p.t.getUTCMonth()] + ' ' + p.t.getUTCFullYear(); }
    grupos.set(clave, { t: p.t, v: p.v, texto });   // el último registro del periodo reemplaza a los anteriores
  }
  return [...grupos.values()];
}
function pintarGraficaInicio() {
  const cont = $('#grafica-inicio'); if (!cont) return;
  const a = AGRUPAR.find(x => x.id === ctlSeg.agrupar);
  dibujarLinea(cont, serieSeguidores().map(p => ({ v: p.v, texto: p.texto })), { idG: 'g-inicio', previo: a.previo });
}
function pintarSeguidoresInicio() {
  const boton = (grupo, id, html, activo, etiqueta) => '<button type="button" class="seg-op ' + (activo ? 'activo' : '') + '" data-grupo="' + grupo + '" data-id="' + id + '"' + (etiqueta ? ' aria-label="' + etiqueta + '" title="' + etiqueta + '"' : '') + ' aria-pressed="' + activo + '">' + html + '</button>';
  $('#ctl-redes').innerHTML = boton('red', 'total', 'Total', ctlSeg.red === 'total') +
    REDES.map(r => boton('red', r.id, '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style="color:' + COLOR_SEG[r.id] + '">' + r.icono + '</svg>', ctlSeg.red === r.id, r.nombre).replace('class="seg-op', 'style="' + (ctlSeg.red === r.id ? 'background:#fff;box-shadow:inset 0 0 0 2px ' + COLOR_SEG[r.id] : '') + '" class="seg-op')).join('');
  $('#ctl-rango').innerHTML = RANGOS.map(r => boton('rango', r.id, r.texto, ctlSeg.rango === r.id)).join('');
  $('#ctl-agrupar').innerHTML = AGRUPAR.map(a => boton('agrupar', a.id, a.texto, ctlSeg.agrupar === a.id)).join('');
  // cifra grande: valor más reciente y cambio dentro del periodo elegido
  const serie = serieSeguidores(), nombre = ctlSeg.red === 'total' ? 'Todas las redes' : REDES.find(r => r.id === ctlSeg.red).nombre;
  const cifra = $('#cifra-seg');
  if (serie.length) {
    const ult = serie[serie.length - 1], ini = serie[0], d = ult.v - ini.v, pct = ini.v ? d / ini.v * 100 : 0;
    cifra.innerHTML = '<strong>' + fmt(ult.v) + '</strong><span class="' + (d > 0 ? 'pos' : d < 0 ? 'neg' : 'neu') + '">' + (d > 0 ? '+' : '') + fmt(d) + ' (' + (d > 0 ? '+' : '') + pct.toFixed(1) + '%)</span><small>' + esc(nombre) + ' · ' + esc((RANGOS.find(r => r.id === ctlSeg.rango) || {}).texto) + '</small>';
  } else cifra.innerHTML = '<small>Sin datos de ' + esc(nombre) + '</small>';
  pintarGraficaInicio();
}
document.addEventListener('click', e => {
  const b = e.target.closest('.seg-op'); if (!b) return;
  ctlSeg[b.dataset.grupo] = b.dataset.id;
  try { localStorage.setItem('seguidores-inicio', JSON.stringify(ctlSeg)); } catch { /* sin almacenamiento */ }
  pintarSeguidoresInicio();
});
function pintarBarrasRedes() {
  const u = datos[datos.length - 1];
  const cont = $('#barras-redes');
  if (!u) { cont.innerHTML = '<p class="neu">Sin datos de seguidores.</p>'; return; }
  const valores = REDES.map(r => ({ r, v: u[r.id] })).filter(x => x.v != null);
  const max = Math.max(1, ...valores.map(x => x.v));
  cont.innerHTML = valores.map(x => { const col = COLOR_SEG[x.r.id] || '#2B2B2A'; return `<div class="fila-red"><span class="ic-red" style="color:${col}" role="img" aria-label="${x.r.nombre}" title="${x.r.nombre}"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${x.r.icono}</svg></span><div class="r"><div style="width:${Math.max(3, Math.round(x.v / max * 100))}%;background:${col}"></div></div><b>${fmt(x.v)}</b></div>`; }).join('');
  const total = valores.reduce((s, x) => s + x.v, 0);
  $('#grandes').dataset.seguidores = total;
  pintarGrandes();
}
function pintarRegistro(filas) {
  if (!filas || !filas.length) { $('#registro').innerHTML = '<p class="neu">Todavía no hay ejecuciones.</p>'; return; }
  $('#registro').innerHTML = `<table>
    <thead><tr><th>Fecha</th><th>Resultado</th><th>Redes</th></tr></thead>
    <tbody>${filas.map(f => `<tr>
      <td>${f.fecha}</td>
      <td><span class="etiq ${f.resultado === 'OK' ? 'ok' : 'error'}">${f.resultado}</span></td>
      <td>${f.redes_ok || f.redes_con_error || '—'}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- Mensajes de Meta (sección privada: en línea pide contraseña) ----------
const RED_MSG = {
  whatsapp: { nombre: 'WhatsApp', icono: '<path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.2 8.5c.3 3 2.4 5.5 5.8 6.4l1.2-1.5-1.9-.9-.9.8a4.600 4.600 0 0 1-2.300-2.300l.8-.9-.9-1.900z" fill="currentColor"/>' },
  facebook: { nombre: 'Facebook', icono: REDES[1].icono },
  instagram: { nombre: 'Instagram', icono: REDES[0].icono },
};
let conversaciones = [];
let convActiva = '';
let resumenCola = { pendientes: 0, proximo: '' };
let finProximo = 0;
const hora = f => { const t = new Date(f); return isNaN(t) ? '' : t.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

// Nombre con el que firma el agente de WhatsApp (el que contesta solo): "Agente Charon"
function nombreAgenteWhatsApp() {
  const ag = agentes.find(x => x.id === 'whatsapp'), n = String((ag && ag.nombre) || '').trim();
  return n ? (/^agente\b/i.test(n) ? n : 'Agente ' + n) : 'Agente automático';
}

// Agrupa los mensajes (de todos los sentidos) por persona y red
function armarConversaciones(lista) {
  const mapa = new Map();
  // El mismo teléfono tapado puede ser de dos personas: si hay referencia (ref) se separa por ella.
  // Los mensajes viejos no tienen ref: se asignan a la única ref de ese teléfono, si es una sola.
  const refsDeTel = new Map();
  lista.forEach(m => { if (m.ref) { const s = refsDeTel.get(m.telefono) || new Set(); s.add(m.ref); refsDeTel.set(m.telefono, s); } });
  [...lista].reverse().forEach(m => {   // de más viejo a más nuevo
    if (!RED_MSG[m.red]) return;
    const unica = !m.ref && refsDeTel.get(m.telefono)?.size === 1 ? [...refsDeTel.get(m.telefono)][0] : '';
    const ref = m.ref || unica;
    const clave = m.red + '|' + (ref || m.telefono || m.nombre || '');
    let c = mapa.get(clave);
    if (!c) { c = { clave, red: m.red, ref, nombre: '', telefono: m.telefono || '', mensajes: [] }; mapa.set(clave, c); }
    if (m.nombre && m.direccion !== 'salida') c.nombre = m.nombre;
    c.mensajes.push(m);
  });
  return [...mapa.values()].map(c => {
    const ult = c.mensajes[c.mensajes.length - 1];
    const sinResp = ult.direccion !== 'salida' && ult.respuesta !== 'enviada';   // 'enviada' = el agente ya contestó (así quedó anotado antes de guardar las salidas)
    const enEspera = sinResp && ult.respuesta === 'programada';
    const delAnuncio = c.mensajes.some(m => String(m.origen).startsWith('anuncio'));
    const agenteRespondio = c.mensajes.some(m => (m.direccion === 'salida' && m.origen === 'agente') || (m.direccion !== 'salida' && m.respuesta === 'enviada'));   // lo segundo cubre los mensajes anteriores a guardar las respuestas
    // Archivada: el agente ya mandó su primer mensaje automático y la persona no ha escrito nada después. Si vuelve a escribir, reaparece sola.
    const auto = c.mensajes.find(m => m.direccion === 'salida' && m.origen === 'agente') || c.mensajes.find(m => m.direccion !== 'salida' && m.respuesta === 'enviada');   // lo segundo cubre los mensajes anteriores a guardar las respuestas
    const tAuto = auto ? Date.parse(auto.fecha) : 0;
    const archivada = c.red === 'whatsapp' && tAuto > 0 && !c.mensajes.some(m => m.direccion !== 'salida' && Date.parse(m.fecha) > tAuto);
    return { ...c, ult, delAnuncio, agenteRespondio, archivada, titulo: c.nombre || c.telefono || 'Sin nombre', estado: enEspera ? 'espera' : sinResp ? 'sin' : 'ok' };
  }).sort((a, b) => new Date(b.ult.fecha) - new Date(a.ult.fecha));
}
const pendiente = c => c.estado !== 'ok';
const inicial = c => (c.titulo.replace(/[@+•]/g, '').trim().charAt(0) || '?').toUpperCase();
// Archivos de WhatsApp: etiquetas, vista previa y cómo se dibujan dentro de la conversación
const NOMBRE_TIPO = { image: 'Imagen', document: 'Documento', audio: 'Audio', video: 'Video', sticker: 'Sticker' };
const sinTexto = m => m.adjunto ? '' : (NOMBRE_TIPO[m.tipo] ? '[' + NOMBRE_TIPO[m.tipo].toLowerCase() + ' · llegó antes de que el panel guardara archivos]' : '[' + (m.tipo || 'mensaje') + ']');
const vistaPrevia = c => (c.ult.direccion === 'salida' ? 'Respuesta: ' : '') + (c.ult.texto || (c.ult.adjunto ? (NOMBRE_TIPO[c.ult.adjunto.t] || 'Archivo') + (c.ult.adjunto.n ? ': ' + c.ult.adjunto.n : '') : sinTexto(c.ult)));
function htmlAdjunto(a) {
  const u = esc('/api/whatsapp-media?id=' + encodeURIComponent(a.id) + (a.n ? '&n=' + encodeURIComponent(a.n) : ''));
  if (a.t === 'image' || a.t === 'sticker') return '<a class="adj adj-img" href="' + u + '" target="_blank" rel="noopener" title="Abrir en grande"><img src="' + u + '" alt="' + (a.t === 'sticker' ? 'Sticker' : 'Imagen enviada') + '" loading="lazy"></a>';
  if (a.t === 'audio') return '<audio class="adj" controls preload="none" src="' + u + '"></audio>';
  if (a.t === 'video') return '<video class="adj" controls preload="metadata" src="' + u + '"></video>';
  return '<a class="adj adj-doc" href="' + u + '" download="' + esc(a.n || 'archivo') + '"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>' + esc(a.n || 'Documento') + '</span><small>Descargar</small></a>';
}

function filaContacto(c) {
  return `<button type="button" class="ct ${c.clave === convActiva ? 'sel' : ''}" data-conv="${esc(c.clave)}">
    <span class="av">${esc(inicial(c))}</span><span class="x"><span class="n">${esc(c.titulo)}</span><span class="s">${esc(vistaPrevia(c))}</span></span><span class="punto ${pendiente(c) ? '' : 'ok'}"></span></button>`;
}
function filaColumna(c) {
  const etqs = c.red === 'whatsapp' ? (c.archivada && filtroWa !== 'archivados' ? '<i class="mini-etq">Archivado</i>' : '') + (c.delAnuncio ? '<i class="mini-etq">Anuncio</i>' : '') + (c.agenteRespondio ? '<i class="mini-etq ok">Respuesta del agente</i>' : '') : '';
  return filaContacto(c).replace('</button>', (etqs ? '<span class="mini-etqs">' + etqs + '</span>' : '') + '</button>').replace('class="ct ', 'class="ct ' + (etqs ? 'con-etq ' : ''));
}
// Filtro de la columna de WhatsApp: todos, solo los que llegaron de un anuncio, o los que ya contestó el agente
const FILTROS_WA = [
  { id: 'todos', texto: 'Todos', ayuda: 'Las conversaciones activas (sin las archivadas)', pasa: c => !c.archivada },
  { id: 'anuncios', texto: 'Anuncios', pasa: c => c.delAnuncio },
  { id: 'agente', texto: 'Respuesta enviada', ayuda: 'Conversaciones a las que el agente ya les mandó su respuesta', pasa: c => c.agenteRespondio },
  { id: 'archivados', texto: 'Archivados', ayuda: 'Ya recibieron el primer mensaje automático y la persona no ha vuelto a escribir. Si escribe, reaparecen en Todos', pasa: c => c.archivada },
];
let filtroWa = 'todos';
try { const f = localStorage.getItem('filtro-whatsapp'); if (FILTROS_WA.some(x => x.id === f)) filtroWa = f; } catch { /* sin almacenamiento */ }
function etiquetaRed(lista) {
  const p = lista.filter(pendiente).length;
  return `<span class="etq-red ${p ? 'p' : ''}">${p ? p + (p === 1 ? ' pendiente' : ' pendientes') : 'al día'}</span>`;
}
// Sección Mensajes: lista de conversaciones a la izquierda y la conversación abierta a la derecha (como WhatsApp Web)
let redMsg = 'whatsapp', busquedaMsg = '';
try { const v = localStorage.getItem('red-mensajes'); if (RED_MSG[v]) redMsg = v; } catch { /* sin almacenamiento */ }
const enMensajes = () => document.body.dataset.vista === 'mensajes';
function pintarColumnas() {
  const lista = $('#lista-msg'); if (!lista) return;
  const scrollLista = lista.scrollTop;   // para no perder dónde ibas al refrescar
  $('#msg-redes').innerHTML = Object.entries(RED_MSG).map(([id, r]) => {
    const p = conversaciones.filter(c => c.red === id && pendiente(c)).length;
    return `<button type="button" class="red-tab ${id === redMsg ? 'activo' : ''}" data-red="${id}" role="tab" aria-selected="${id === redMsg}" aria-label="${r.nombre}" title="${r.nombre}${p ? ' · ' + p + (p === 1 ? ' pendiente' : ' pendientes') : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${r.icono}</svg>${p ? '<i class="red-aviso"></i>' : ''}</button>`;
  }).join('');
  const todas = conversaciones.filter(c => c.red === redMsg);
  let visibles = todas;
  const filtros = $('#msg-filtros');
  if (redMsg === 'whatsapp') {
    const f = FILTROS_WA.find(x => x.id === filtroWa) || FILTROS_WA[0];
    visibles = todas.filter(f.pasa);
    filtros.hidden = false;
    filtros.innerHTML = FILTROS_WA.map(x => '<button type="button" class="filtro-wa ' + (x.id === filtroWa ? 'activo' : '') + '" data-filtro="' + x.id + '" aria-pressed="' + (x.id === filtroWa) + '"' + (x.ayuda ? ' title="' + x.ayuda + '"' : '') + '>' + x.texto + ' <small>' + todas.filter(x.pasa).length + '</small></button>').join('');
  } else { filtros.hidden = true; filtros.innerHTML = ''; }
  const q = busquedaMsg.trim().toLowerCase();
  if (q) visibles = visibles.filter(c => (c.titulo + ' ' + c.telefono + ' ' + c.mensajes.map(m => m.texto).join(' ')).toLowerCase().includes(q));
  lista.innerHTML = visibles.length ? visibles.map(filaColumna).join('') : '<div class="sin">' + (q ? 'Sin resultados.' : todas.length ? 'Ninguna conversación con este filtro.' : 'Todavía no hay conversaciones.') + '</div>';
  lista.scrollTop = scrollLista;
  lista.querySelectorAll('[data-conv]').forEach(b => b.addEventListener('click', () => abrirConversacion(b.dataset.conv)));
  filtros.querySelectorAll('.filtro-wa').forEach(b => b.addEventListener('click', () => {
    filtroWa = b.dataset.filtro;
    try { localStorage.setItem('filtro-whatsapp', filtroWa); } catch { /* sin almacenamiento */ }
    pintarColumnas();
  }));
  $('#msg-redes').querySelectorAll('[data-red]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.red === redMsg) return;
    redMsg = b.dataset.red; convActiva = '';
    try { localStorage.setItem('red-mensajes', redMsg); } catch { /* sin almacenamiento */ }
    pintarColumnas(); pintarConversacion();
  }));
  const app = document.querySelector('.msg-app'); if (app) app.classList.toggle('con-chat', !!convActiva && enMensajes());
}
const buscarMsg = $('#buscar-msg');
if (buscarMsg) buscarMsg.addEventListener('input', () => { busquedaMsg = buscarMsg.value; pintarColumnas(); });
function pintarConversacion(desplazar) {
  const panel = enMensajes();
  const cont = panel ? $('#chat-panel') : $('#conv'), modal = $('#modal-conv');
  const c = conversaciones.find(x => x.clave === convActiva);
  if (!c) {
    modal.hidden = true;
    if (panel) { cont.dataset.clave = ''; cont.innerHTML = '<div class="chat-vacio"><svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><p>Elige una conversación para verla aquí</p></div>'; }
    return;
  }
  modal.hidden = panel;   // en Mensajes no hay ventana emergente: la conversación va en el panel
  const r = RED_MSG[c.red];
  const hiloPrev = cont.querySelector('.hilo'), mismaConv = cont.dataset.clave === c.clave;   // al refrescar solo, no te mueve si estabas leyendo arriba
  const alFinal = !hiloPrev || !mismaConv || hiloPrev.scrollHeight - hiloPrev.scrollTop - hiloPrev.clientHeight < 70, topPrev = hiloPrev ? hiloPrev.scrollTop : 0;
  cont.dataset.clave = c.clave;
  const previo = cont.querySelector('.resp-texto');   // si ya estabas escribiendo, no se pierde al refrescar
  const borrador = previo ? previo.value : '', teniaFoco = !!previo && document.activeElement === previo;
  const burbujas = c.mensajes.map(m => {
    const salida = m.direccion === 'salida';
    const cls = !salida ? 'cli' : m.origen === 'manual' ? 'yo' : 'ag';
    const quien = !salida ? c.titulo : m.origen === 'manual' ? (m.autor || 'Equipo Hacedores') : nombreAgenteWhatsApp();
    const texto = m.texto || sinTexto(m);
    return `<div class="burbuja-c ${cls}">${m.adjunto ? htmlAdjunto(m.adjunto) : ''}${texto ? '<div class="txt-c">' + esc(texto) + '</div>' : ''}<small>${esc(quien)} · ${esc(hora(m.fecha))}</small></div>`;
  }).join('');
  const est = c.estado === 'ok' ? ['Respondido', ''] : c.estado === 'espera' ? ['Respuesta programada', 'p'] : ['Sin respuesta', 'p'];
  cont.innerHTML = `<div class="cab"><span class="av"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${r.icono}</svg></span>
    <div><p>${esc(c.titulo)}</p><p class="s">${r.nombre}${c.nombre && c.telefono ? ' · ' + esc(c.telefono) : ''}</p></div>
    <span class="est ${est[1]}">${est[0]}</span><button class="cerrar-conv" type="button" aria-label="Cerrar conversación">×</button></div>
    <div class="hilo">${burbujas}</div>
    ${cajaRespuesta(c)}
    <div class="leyenda"><span class="l1">Cliente</span><span class="l2">Agente automático</span><span class="l3">Equipo</span></div>`;
  cont.querySelector('.cerrar-conv').addEventListener('click', cerrarConversacion);
  // si WhatsApp ya no tiene el archivo (los guarda unos 30 días) o pesa demasiado, se avisa en lugar de dejar un hueco roto
  cont.querySelectorAll('.adj-img img, audio.adj, video.adj').forEach(el => el.addEventListener('error', async () => {
    const nota = document.createElement('span'); nota.className = 'adj-nota'; nota.textContent = 'No se puede mostrar este archivo…';
    const url = el.currentSrc || el.src;
    (el.closest('.adj') || el).replaceWith(nota);
    let motivo = '';
    try { const r = await fetch(url); if (!r.ok) { const j = await r.json().catch(() => ({})); motivo = j.error || ('Error ' + r.status); } } catch { motivo = 'Sin conexión con el servidor.'; }   // se pide de nuevo para decir el motivo real
    nota.textContent = 'No se puede mostrar este archivo. ' + (motivo || 'El navegador no pudo leerlo.');
  }, { once: true }));
  const hilo = cont.querySelector('.hilo'); hilo.scrollTop = alFinal ? hilo.scrollHeight : topPrev;
  activarRespuesta(c, borrador, teniaFoco);
}

// ---------- contestar desde el panel (solo WhatsApp, dentro de las 24 h del último mensaje del cliente) ----------
function cajaRespuesta(c) {
  if (c.red !== 'whatsapp') return '<p class="resp-nota">Por ahora solo se puede contestar desde aquí en WhatsApp.</p>';
  if (!puede('responder')) return '<p class="resp-nota">Tu rol puede ver esta conversación, pero no responder.</p>';
  if (!c.ref) return '<p class="resp-nota">Esta conversación es anterior a esta función y no tengo su número completo. Contesta desde la app de WhatsApp.</p>';
  const ultimo = [...c.mensajes].reverse().find(m => m.direccion !== 'salida');
  if (!ultimo || Date.now() - new Date(ultimo.fecha) > 24 * 3600000) return '<p class="resp-nota">Pasaron más de 24 horas desde su último mensaje. WhatsApp solo permite plantillas aprobadas, así que no se puede contestar con texto libre.</p>';
  const ic = d => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<div class="resp">
    <div class="resp-adj" hidden></div>
    <div class="resp-caja">
      <div class="resp-clip-zona">
        <button type="button" class="resp-clip" aria-label="Adjuntar" aria-haspopup="menu" aria-expanded="false" title="Adjuntar">${ic('M20 11.5 12.2 19.3a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3')}</button>
        <div class="resp-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-tipo="imagen">${ic('M4 6h16v12H4zM4 15l4.5-4.5 3.5 3.5 2.5-2.5L20 16M9 9.5h.01')}<span>Foto o video</span></button>
          <button type="button" role="menuitem" data-tipo="documento">${ic('M7 3h7l5 5v13H7zM14 3v5h5')}<span>Documento</span></button>
          <button type="button" role="menuitem" data-tipo="sticker">${ic('M12 3a9 9 0 1 0 9 9c-4.5 0-9-4.5-9-9zM9 11h.01M14 14c-1 1-3 1-4 0')}<span>Sticker</span></button>
        </div>
      </div>
      <textarea class="resp-texto" rows="1" maxlength="1000" placeholder="Escribe tu respuesta…" aria-label="Escribe tu respuesta"></textarea>
      <button type="button" class="resp-enviar" aria-label="Enviar" title="Enviar (Enter)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 19V6M6 11.5 12 5.5l6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <input type="file" class="resp-archivo" hidden>
    <div class="resp-pie"><span class="resp-error" role="alert"></span><small class="resp-ayuda">Enter envía · Mayús + Enter salto de línea · también puedes pegar o arrastrar archivos</small></div>
  </div>`;
}
// ---- archivos para enviar (hasta 4 MB: es lo que recibe el servidor en línea) ----
const MAX_ARCHIVO = 4 * 1024 * 1024, MAX_STICKER = 500 * 1024;
const MIME_DOC = { pdf: 'application/pdf', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const ACEPTA = { imagen: 'image/jpeg,image/png,image/webp,video/mp4,video/3gpp', documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt', sticker: 'image/webp' };
const pesoTexto = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
let adjuntoPend = null;   // { clave, blob, nombre, tipo, mime, vista }: lo elegido para enviar; se conserva si la conversación se refresca sola
async function prepararImagen(archivo) {   // las fotos del celular pesan mucho: se reducen y se pasan a JPG para que quepan
  if ((archivo.type === 'image/jpeg' || archivo.type === 'image/png') && archivo.size <= 1.5 * 1048576) return archivo;
  let bmp; try { bmp = await createImageBitmap(archivo); } catch { throw new Error('No pude leer esa imagen. Usa un JPG o PNG.'); }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * k); lienzo.height = Math.round(bmp.height * k);
  const g = lienzo.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, lienzo.width, lienzo.height); g.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const aJpg = q => new Promise(r => lienzo.toBlob(r, 'image/jpeg', q));
  let q = .85, blob = await aJpg(q);
  while (blob && blob.size > 3.5 * 1048576 && q > .4) { q -= .15; blob = await aJpg(q); }
  if (!blob) throw new Error('No pude preparar esa imagen.');
  return blob;
}
async function validarArchivo(archivo, tipoPedido) {   // devuelve { blob, tipo, mime, nombre } o lanza un error entendible
  let tipo = tipoPedido, mime = archivo.type, nombre = archivo.name || 'archivo';
  const ext = (nombre.split('.').pop() || '').toLowerCase();
  if (tipo === 'imagen' && mime.startsWith('video/')) tipo = 'video';
  if (tipo === 'imagen') {
    if (!mime.startsWith('image/')) throw new Error('Elige una foto (JPG o PNG) o un video (MP4).');
    const blob = await prepararImagen(archivo);
    if (blob !== archivo) nombre = nombre.replace(/\.[^.]+$/, '') + '.jpg';
    return { blob, tipo, mime: blob.type || 'image/jpeg', nombre };
  }
  if (tipo === 'video') {
    if (mime !== 'video/mp4' && mime !== 'video/3gpp') throw new Error('Los videos deben ser MP4 o 3GP.');
    if (archivo.size > MAX_ARCHIVO) throw new Error('Ese video pesa ' + pesoTexto(archivo.size) + '. Por ahora el máximo es 4 MB.');
    return { blob: archivo, tipo, mime, nombre };
  }
  if (tipo === 'sticker') {
    if (mime !== 'image/webp') throw new Error('Los stickers deben ser archivos WebP.');
    if (archivo.size > MAX_STICKER) throw new Error('Ese sticker pesa ' + pesoTexto(archivo.size) + '. Debe pesar menos de 500 KB.');
    return { blob: archivo, tipo, mime, nombre };
  }
  mime = MIME_DOC[ext] || (Object.values(MIME_DOC).includes(mime) ? mime : '');
  if (!mime) throw new Error('Ese tipo de documento no se puede enviar. Usa PDF, Word, Excel, PowerPoint o texto.');
  if (archivo.size > MAX_ARCHIVO) throw new Error('Ese archivo pesa ' + pesoTexto(archivo.size) + '. Por ahora el máximo es 4 MB.');
  return { blob: archivo, tipo: 'documento', mime, nombre };
}
function activarRespuesta(c, borrador, teniaFoco) {
  const cont = enMensajes() ? $('#chat-panel') : $('#conv');
  const caja = cont.querySelector('.resp');
  if (!caja) return;
  const texto = caja.querySelector('.resp-texto'), enviar = caja.querySelector('.resp-enviar'), error = caja.querySelector('.resp-error');
  const barra = caja.querySelector('.resp-adj'), clip = caja.querySelector('.resp-clip'), menu = caja.querySelector('.resp-menu'), entrada = caja.querySelector('.resp-archivo');
  texto.value = borrador;
  const ajustarAlto = () => { texto.style.height = 'auto'; texto.style.height = Math.min(texto.scrollHeight, 120) + 'px'; };
  ajustarAlto();
  if (teniaFoco || enfocarRespuesta) { texto.focus(); enfocarRespuesta = false; }
  if (adjuntoPend && adjuntoPend.clave !== c.clave) { if (adjuntoPend.vista) URL.revokeObjectURL(adjuntoPend.vista); adjuntoPend = null; }   // cambiaste de conversación: no se manda a otra persona
  const pintarAdjunto = () => {
    if (!adjuntoPend) { barra.hidden = true; barra.innerHTML = ''; return; }
    const a = adjuntoPend, ico = { video: 'M5 6h10v12H5zM15 10l5-3v10l-5-3', documento: 'M7 3h7l5 5v13H7zM14 3v5h5' }[a.tipo];
    barra.hidden = false;
    barra.innerHTML = `<span class="adj-mini">${a.vista ? `<img src="${esc(a.vista)}" alt="">` : `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${ico || ''}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</span><span class="adj-datos"><b>${esc(a.nombre)}</b><small>${esc({ imagen: 'Foto', video: 'Video', documento: 'Documento', sticker: 'Sticker' }[a.tipo])} · ${pesoTexto(a.blob.size)}${a.tipo === 'sticker' ? '' : ' · escribe un mensaje si quieres acompañarlo'}</small></span><button type="button" class="adj-quitar" aria-label="Quitar archivo">×</button>`;
    barra.querySelector('.adj-quitar').addEventListener('click', () => { if (a.vista) URL.revokeObjectURL(a.vista); adjuntoPend = null; pintarAdjunto(); texto.focus(); });
  };
  pintarAdjunto();
  let enviando = false;
  const ocupado = si => { enviando = si; texto.readOnly = si; enviar.disabled = si; clip.disabled = si; caja.classList.toggle('enviando', si); };
  async function elegir(archivo, tipo) {
    error.textContent = '';
    try {
      const v = await validarArchivo(archivo, tipo);
      if (adjuntoPend && adjuntoPend.vista) URL.revokeObjectURL(adjuntoPend.vista);
      adjuntoPend = { clave: c.clave, ...v, vista: v.tipo === 'imagen' || v.tipo === 'sticker' ? URL.createObjectURL(v.blob) : '' };
      pintarAdjunto(); texto.focus();
    } catch (e) { error.textContent = e.message; }
  }
  const cerrarMenu = () => { menu.hidden = true; clip.setAttribute('aria-expanded', 'false'); };
  clip.addEventListener('click', () => { const abrir = menu.hidden; menu.hidden = !abrir; clip.setAttribute('aria-expanded', String(abrir)); });
  document.addEventListener('pointerdown', function fuera(e) { if (!caja.isConnected) { document.removeEventListener('pointerdown', fuera); return; } if (!e.target.closest('.resp-clip-zona')) cerrarMenu(); });
  menu.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => { cerrarMenu(); entrada.accept = ACEPTA[b.dataset.tipo]; entrada.dataset.tipo = b.dataset.tipo; entrada.value = ''; entrada.click(); }));
  entrada.addEventListener('change', () => { if (entrada.files[0]) elegir(entrada.files[0], entrada.dataset.tipo); });
  texto.addEventListener('paste', e => { const f = [...(e.clipboardData ? e.clipboardData.files : [])][0]; if (f) { e.preventDefault(); elegir(f, f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'imagen' : 'documento'); } });
  const zona = cont;
  zona.ondragover = e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); zona.classList.add('arrastrando'); } };
  zona.ondragleave = e => { if (e.target === zona) zona.classList.remove('arrastrando'); };
  zona.ondrop = e => { zona.classList.remove('arrastrando'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); elegir(f, f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'imagen' : 'documento'); };
  async function mandar() {
    if (enviando) return;
    error.textContent = '';
    if (!adjuntoPend && !texto.value.trim()) { error.textContent = 'Escribe un mensaje primero.'; return; }
    ocupado(true);
    try {
      let r, j;
      if (adjuntoPend) {
        const a = adjuntoPend;
        r = await fetch('/api/enviar-archivo?ref=' + encodeURIComponent(c.ref) + '&tipo=' + a.tipo + '&nombre=' + encodeURIComponent(a.nombre) + '&pie=' + encodeURIComponent(a.tipo === 'sticker' ? '' : texto.value.trim()), { method: 'POST', headers: { 'Content-Type': a.mime, 'x-panel': '1' }, body: a.blob });
      } else {
        r = await fetch('/api/responder', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-panel': '1' }, body: JSON.stringify({ ref: c.ref, texto: texto.value }) });
      }
      j = await r.json().catch(() => ({}));
      if (!r.ok) { ocupado(false); error.textContent = r.status === 401 ? 'Tu sesión venció. Entra de nuevo.' : r.status === 413 ? 'El archivo es muy grande. Por ahora el máximo es 4 MB.' : (j.error || 'No se pudo enviar.'); return; }
      if (adjuntoPend && adjuntoPend.vista) URL.revokeObjectURL(adjuntoPend.vista);
      adjuntoPend = null; texto.value = ''; enfocarRespuesta = true;
      await cargarMensajes(true);   // vuelve a dibujar la conversación con tu mensaje ya incluido
    } catch { ocupado(false); error.textContent = 'Sin conexión con el servidor.'; }
  }
  enviar.addEventListener('click', mandar);
  texto.addEventListener('input', ajustarAlto);
  texto.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); mandar(); } });
}
let enfocarRespuesta = false;   // después de enviar, el cursor vuelve a la caja para seguir escribiendo
// Animación tipo iOS: la ventana crece desde el contacto que tocaste y, al cerrar, regresa a él (FLIP con curva de resorte suave)
const CURVA_IOS = 'cubic-bezier(.32, .72, 0, 1)';
const sinMovimiento = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function animarConversacion(entrando) {
  const modal = $('#modal-conv'), caja = $('#conv');
  if (sinMovimiento() || !caja.animate) return Promise.resolve();
  const origen = [...document.querySelectorAll('[data-conv]')].find(e => e.dataset.conv === convActiva && e.offsetParent);
  const d = caja.getBoundingClientRect(), o = origen && origen.getBoundingClientRect();
  const dx = o ? (o.left + o.width / 2) - (d.left + d.width / 2) : 0;
  const dy = o ? (o.top + o.height / 2) - (d.top + d.height / 2) : 30;
  const esc = o ? Math.max(.1, Math.min(.45, o.width / d.width)) : .9;
  const chico = { transform: `translate(${dx}px, ${dy}px) scale(${esc})`, opacity: 0 };
  const grande = { transform: 'translate(0, 0) scale(1)', opacity: 1 };
  const cuadros = entrando ? [chico, { ...grande, opacity: 1, offset: .4 }, grande] : [grande, { ...chico, opacity: 0, offset: 1 }];
  if (entrando) cuadros[1] = { opacity: 1, offset: .35 }, cuadros[1].transform = `translate(${dx * .35}px, ${dy * .35}px) scale(${esc + (1 - esc) * .5})`;
  modal.getAnimations({ subtree: true }).forEach(a => a.cancel());   // limpia restos de una animación anterior
  // Al cerrar se queda en el último cuadro (fill: forwards) hasta ocultar la ventana: así no hay un destello en que reaparece completa
  const fill = entrando ? 'none' : 'forwards';
  modal.animate([{ opacity: entrando ? 0 : 1 }, { opacity: entrando ? 1 : 0 }], { duration: entrando ? 320 : 300, easing: 'ease-out', fill });
  return caja.animate(cuadros, { duration: entrando ? 520 : 300, easing: entrando ? CURVA_IOS : 'cubic-bezier(.4, 0, .2, 1)', fill }).finished.catch(() => {});
}
function abrirConversacion(clave) {
  if (enMensajes()) {   // en Mensajes se abre en el panel de la derecha, sin ventana emergente
    const otra = convActiva !== clave;
    convActiva = clave;
    if (otra) $('#chat-panel').dataset.clave = '';   // empieza en el último mensaje
    pintarColumnas(); pintarConversacion();
    return;
  }
  const nueva = $('#modal-conv').hidden;
  convActiva = clave;
  if (nueva) $('#conv').dataset.clave = '';   // al abrirla de nuevo empieza en el último mensaje
  pintarConversacion();
  if (nueva) animarConversacion(true);
}
let cerrandoConv = false;
async function cerrarConversacion() {
  if (enMensajes()) { convActiva = ''; pintarColumnas(); pintarConversacion(); return; }   // en el panel solo se quita la selección (en celular, regresa a la lista)
  if (cerrandoConv || $('#modal-conv').hidden) return;
  cerrandoConv = true;
  await Promise.race([animarConversacion(false), new Promise(r => setTimeout(r, 450))]);   // tope por si el navegador pausa la animación
  convActiva = ''; $('#modal-conv').hidden = true;
  $('#modal-conv').getAnimations({ subtree: true }).forEach(a => a.cancel());   // ya oculta: se sueltan los últimos cuadros retenidos
  cerrandoConv = false;
  pintarColumnas(); pintarInicioMensajes();
}
$('#modal-conv').addEventListener('mousedown', e => { if (e.target === $('#modal-conv')) cerrarConversacion(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal-conv').hidden) cerrarConversacion(); });

// ---------- inicio: cifras, porcentajes, reloj y mensajes ----------
const diaLocal = f => new Date(f).toLocaleDateString('en-CA');   // aaaa-mm-dd en la zona del navegador
function pintarGrandes() {
  const hoy = diaLocal(Date.now());
  const todos = conversaciones.flatMap(c => c.mensajes);
  const recibidos = todos.filter(m => m.direccion !== 'salida' && diaLocal(m.fecha) === hoy).length;
  const enviados = todos.filter(m => m.direccion === 'salida' && diaLocal(m.fecha) === hoy).length;
  const seg = Number($('#grandes').dataset.seguidores || 0);
  $('#grandes').innerHTML = `<div><strong>${recibidos}</strong>Mensajes hoy</div><div><strong>${resumenCola.pendientes}</strong>En cola de envío</div><div><strong>${enviados}</strong>Enviados hoy</div><div><strong>${seg ? compacto(seg) : '—'}</strong>Seguidores</div>`;
}
function pintarPorcentajes() {
  const tot = conversaciones.length;
  const cont = $('#barras-pct');
  if (!tot) { cont.innerHTML = ''; return; }
  const n = { ok: 0, espera: 0, sin: 0 };
  conversaciones.forEach(c => n[c.estado]++);
  const pct = k => Math.round(n[k] / tot * 100);
  const w = k => Math.max(14, pct(k));
  cont.innerHTML = `<div class="seg" style="flex:${w('ok')}">Respondidos<b style="background:#2B2B2A;color:#fff">${pct('ok')}%</b></div>
    <div class="seg" style="flex:${w('espera')}">En espera<b style="background:#e72c5e;color:#fff">${pct('espera')}%</b></div>
    <div class="seg" style="flex:${w('sin')}">Sin respuesta<b style="border:1px solid #B4B2A9">${pct('sin')}%</b></div>`;
}
function pintarInicioMensajes() {
  const cont = $('#inicio-msg');
  cont.innerHTML = Object.entries(RED_MSG).map(([id, r]) => {
    const lista = conversaciones.filter(c => c.red === id);
    return `<div class="grupo-h"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${r.icono}</svg>${r.nombre}${etiquetaRed(lista)}</div>
      ${lista.filter(c => !c.archivada).slice(0, 2).map(filaContacto).join('') || '<div class="vacio-msg">Sin conversaciones activas.</div>'}`;
  }).join('');
  cont.querySelectorAll('[data-conv]').forEach(b => b.addEventListener('click', () => abrirConversacion(b.dataset.conv)));
  $('#aviso-mensajes').hidden = !conversaciones.some(pendiente);
}
function pintarReloj() {
  const cont = $('#reloj');
  const resta = finProximo - Date.now();
  const total = 5 * 60000;
  let texto = '--:--', extra = resumenCola.pendientes ? resumenCola.pendientes + ' envíos en cola' : 'No hay envíos en espera', prog = 0;
  if (finProximo) {
    if (resta > 0) { const s = Math.ceil(resta / 1000); texto = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); prog = Math.min(1, Math.max(0, 1 - resta / total)); }
    else { texto = '00:00'; extra = 'Se envía en el próximo minuto'; prog = 1; }
  }
  const circ = 2 * Math.PI * 52;
  cont.innerHTML = `<div class="aro"><svg viewBox="0 0 132 132" role="img" aria-label="Cuenta regresiva"><circle cx="66" cy="66" r="52" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="9"/><circle cx="66" cy="66" r="52" fill="none" stroke="#e72c5e" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(circ * prog).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 66 66)"/></svg>
    <div class="centro"><div class="tiempo">${texto}</div><div class="pie">para enviar</div></div></div><div class="extra">${extra}</div>`;
}
setInterval(pintarReloj, 1000);

function formularioClave(texto) {
  $('#lista-msg').innerHTML = `<form class="clave-msg" id="form-clave"><p>${esc(texto)}</p>
    <input type="password" id="clave-msg" placeholder="Contraseña" autocomplete="current-password" required>
    <button type="submit">Entrar</button><span class="error-msg" id="error-clave"></span></form>`;
  $('#modal-conv').hidden = true;
  $('#form-clave').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#clave-msg').value }) });
      const j = await r.json();
      if (!r.ok) { $('#error-clave').textContent = j.error || 'No se pudo entrar'; return; }
      cargarMensajes();
    } catch { $('#error-clave').textContent = 'Sin conexión con el servidor'; }
  });
}
// Los mensajes se actualizan solos: cada pocos segundos se pregunta si hay algo nuevo y solo se redibuja si cambió algo
let firmaMensajes = '', cargandoMensajes = false, fallosMensajes = 0, mensajesBloqueado = false, temporizadorMensajes = null, ciclosOtras = 0;
const firmaDe = j => { const l = j.mensajes || []; return l.length + '|' + l.slice(0, 40).map(m => m.fecha + m.respuesta + (m.autor || '') + (m.direccion || '')).join(',') + '|' + (j.resumen ? j.resumen.pendientes + '|' + j.resumen.proximo : ''); };
function estadoEnVivo(ok) { const b = $('#actualizar-msg'); if (!b) return; b.classList.toggle('sin-red', !ok); const s = b.querySelector('span'); if (s) s.textContent = ok ? 'En vivo' : 'Reconectando…'; }
async function cargarMensajes(forzar) {
  if (cargandoMensajes) return;
  cargandoMensajes = true;
  try {
    const r = await fetch('/api/mensajes?todos=1');
    const j = await r.json().catch(() => ({}));
    $('#salir-msg').hidden = !(r.ok && modoPublico);
    if (r.status === 401) {
      formularioClave(j.configurada === false ? 'La contraseña del panel todavía no está configurada.' : 'Escribe la contraseña para ver los mensajes.');
      $('#inicio-msg').innerHTML = '<div class="vacio-msg">Entra a Mensajes con tu contraseña para verlos aquí.</div>';
      return;
    }
    if (r.status === 403) { mensajesBloqueado = true; $('#lista-msg').innerHTML = '<div class="vacio-msg">Tu rol no puede ver los mensajes.</div>'; return; }
    if (!r.ok) { fallosMensajes++; estadoEnVivo(false); if (!firmaMensajes) $('#lista-msg').innerHTML = `<div class="vacio-msg">${esc(j.error || 'No se pudieron cargar')}</div>`; return; }
    fallosMensajes = 0; estadoEnVivo(true);
    const firma = firmaDe(j);
    if (!forzar && firma === firmaMensajes) return;   // nada nuevo: no se redibuja (así no se pierde lo que estás haciendo)
    firmaMensajes = firma;
    conversaciones = armarConversaciones(j.mensajes || []);
    resumenCola = j.resumen || resumenCola;
    finProximo = resumenCola.proximo ? Date.parse(resumenCola.proximo) : 0;
    pintarColumnas(); pintarConversacion(); pintarInicioMensajes(); pintarPorcentajes(); pintarGrandes(); pintarReloj();
  } catch { fallosMensajes++; estadoEnVivo(false); if (!firmaMensajes) $('#lista-msg').innerHTML = '<div class="vacio-msg">Sin conexión con el servidor.</div>'; }
  finally { cargandoMensajes = false; }
}
function programarMensajes() {
  clearTimeout(temporizadorMensajes);
  const espera = fallosMensajes ? Math.min(60000, 6000 * 2 ** fallosMensajes) : 6000;   // si falla, espera más cada vez
  temporizadorMensajes = setTimeout(async () => {
    const vista = document.body.dataset.vista, enMensajes = vista === 'inicio' || vista === 'mensajes';
    const util = !document.hidden && !mensajesBloqueado && !document.querySelector('#clave-msg');
    if (util && (enMensajes || ++ciclosOtras % 5 === 0)) await cargarMensajes();   // en otras secciones solo para encender el aviso de mensajes nuevos
    programarMensajes();
  }, espera);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && !mensajesBloqueado) cargarMensajes(); });
window.addEventListener('focus', () => { if (!mensajesBloqueado) cargarMensajes(); });
$('#salir-msg').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); cargarMensajes(true); });
$('#actualizar-msg').addEventListener('click', () => cargarMensajes(true));
$('#fecha-hoy').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
cargarMensajes();
programarMensajes();
try { const v = localStorage.getItem('vista'); if (v && document.getElementById('vista-' + v)) irA(v); } catch { /* sin almacenamiento */ }

cargar();
setInterval(cargar, 5 * 60 * 1000);

// ---------- Redes: campaña Viernes de Consejo Maker (reel, visualizaciones, mensajes del anuncio y compras) ----------
let vmDatos = null;
const VM_ICONOS = {
  vistas: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  mensajes: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  chapultepec: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  interlomas: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
};
let vmInfo = {};   // lo que muestra la burbuja de cada icono
let vmAbierto = '';
function cerrarVMPop() { const p = document.getElementById('vm-pop'); if (p) p.remove(); vmAbierto = ''; document.querySelectorAll('.vm-ico.activo').forEach(b => b.classList.remove('activo')); }
function abrirVMPop(btn, fijar) {
  const clave = btn.dataset.vm, info = vmInfo[clave]; if (!info) return;
  cerrarVMPop();
  const p = document.createElement('div'); p.id = 'vm-pop'; p.className = 'vm-pop'; p.innerHTML = info;
  document.body.appendChild(p);
  const r = btn.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
  let x = r.right + 10; if (x + w > innerWidth - 8) x = Math.max(8, r.left - w - 10);   // si no cabe a la derecha, va a la izquierda
  p.style.left = x + 'px'; p.style.top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8)) + 'px';
  btn.classList.add('activo'); vmAbierto = fijar ? clave : '';
}
function pintarVM() {
  const cont = $('#vm'), est = $('#vm-estado');
  if (!cont) return;
  if (!vmDatos) { cont.innerHTML = ''; return; }
  const { campana: c, mensajes: m, compras: v } = vmDatos.error ? { campana: { error: vmDatos.error }, compras: { error: vmDatos.error } } : vmDatos;
  const dd = f => new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const periodo = c && c.encontrada && c.desde ? (c.hasta ? 'Del ' + dd(c.desde) + ' al ' + dd(c.hasta) : 'Desde el ' + dd(c.desde) + ' · activa') : '';
  est.textContent = c && c.encontrada ? c.nombre : '';
  let reel;
  if (c && c.reel) reel = '<iframe class="vm-reel" src="' + esc(c.reel.embed) + '" title="Reel que se promociona" loading="lazy" scrolling="no" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe>' +
    '<a class="vm-enlace" href="' + esc(c.reel.url) + '" target="_blank" rel="noopener">Abrir en ' + (c.reel.red === 'instagram' ? 'Instagram' : 'Facebook') + '</a>';
  else reel = '<div class="vm-reel vacio neu">' + (c && c.error ? esc(c.error) : c && !c.encontrada ? 'No encontré una campaña de Consejo Maker en Meta (su nombre debe incluir "Consejo Maker" o "Viernes"). ' + (c.activas && c.activas.length ? 'Campañas activas: ' + c.activas.map(esc).join(', ') + '.' : 'No hay campañas activas.') : 'El anuncio no trae un reel que se pueda mostrar.') + '</div>';
  const cr = $('#vm-reel'), clave = c && c.reel ? c.reel.embed : (c ? 'sin-reel' : '');
  if (cr && cr.dataset.reel !== clave) { cr.dataset.reel = clave; cr.innerHTML = reel; }   // el reel solo se vuelve a cargar si cambia, para que no se reinicie cada minuto
  const campanaOk = c && c.encontrada;
  const falla = x => '<b class="vm-t">' + esc(x.error || 'Sin datos') + '</b>';
  const pop = (titulo, grande, texto, extra) => '<b class="vm-t">' + titulo + '</b><span class="vm-n">' + grande + '</span><span class="vm-d">' + texto + '</span>' + (extra ? '<span class="vm-x">' + extra + '</span>' : '');
  const sede = (n, nombre) => v && !v.error ? pop('Viernes de Consejo Maker ' + nombre, fmt(n), n === 1 ? 'lugar vendido' : 'lugares vendidos', 'Compras en WooCommerce desde el 13 nov') : falla(v || {});
  vmInfo = {
    vistas: campanaOk ? pop('Visualizaciones', fmt(c.visualizaciones), 'veces que se mostró el anuncio hoy', fmt(c.alcance) + ' personas alcanzadas · ' + fmt(c.reproducciones) + ' reproducciones' + (periodo ? '<br>' + periodo : '')) : falla(c || {}),
    mensajes: campanaOk ? pop('Mensajes iniciados', fmt(c.mensajes), 'conversaciones que empezaron desde el anuncio hoy', (m && !m.error ? fmt(m.total) + ' llegaron hoy al panel' : '') + (periodo ? '<br>' + periodo : '')) : falla(c || {}),
    chapultepec: sede(v && v.chapultepec, 'Chapultepec'),
    interlomas: sede(v && v.interlomas, 'Interlomas'),
  };
  const num = n => (n == null || n === '' ? '' : '<i class="vm-num">' + (n > 999 ? compacto(n) : n) + '</i>');
  const boton = (clave, nombre, n) => '<button type="button" class="vm-ico' + (vmAbierto === clave ? ' activo' : '') + '" data-vm="' + clave + '" aria-label="' + nombre + '"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + VM_ICONOS[clave] + '</svg>' + num(n) + (clave === 'chapultepec' ? '<em>C</em>' : clave === 'interlomas' ? '<em>I</em>' : '') + '</button>';
  cont.innerHTML = boton('vistas', 'Visualizaciones', campanaOk ? c.visualizaciones : null) + boton('mensajes', 'Mensajes iniciados', campanaOk ? c.mensajes : null) +
    boton('chapultepec', 'Compras Chapultepec', v && !v.error ? v.chapultepec : null) + boton('interlomas', 'Compras Interlomas', v && !v.error ? v.interlomas : null);
  cont.querySelectorAll('.vm-ico').forEach(b => {
    b.addEventListener('mouseenter', () => { if (!vmAbierto) abrirVMPop(b, false); });
    b.addEventListener('mouseleave', () => { if (!vmAbierto) cerrarVMPop(); });
    b.addEventListener('focus', () => { if (!vmAbierto) abrirVMPop(b, false); });
    b.addEventListener('blur', () => { if (!vmAbierto) cerrarVMPop(); });
    b.addEventListener('click', e => { e.stopPropagation(); if (vmAbierto === b.dataset.vm) cerrarVMPop(); else abrirVMPop(b, true); });   // al tocarlo queda abierto
  });
  if (vmAbierto) { const b = cont.querySelector('[data-vm="' + vmAbierto + '"]'); if (b) abrirVMPop(b, true); }   // la actualización de cada minuto no cierra la burbuja
}
document.addEventListener('click', e => { if (vmAbierto && !e.target.closest('#vm-pop')) cerrarVMPop(); });
async function cargarVM() {
  try {
    const r = await fetch('/api/viernes-maker'), j = await r.json().catch(() => ({}));
    vmDatos = r.ok ? j : { error: j.error || 'No se pudo leer la campaña.' };
  } catch { vmDatos = { error: 'No se pudo leer la campaña.' }; }
  pintarVM();
}
cargarVM();
setInterval(() => { if (!document.hidden && document.body.dataset.vista === 'redes') cargarVM(); }, 60 * 1000);
