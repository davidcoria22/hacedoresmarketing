const REDES = [
  { id: 'instagram', nombre: 'Instagram', color: '#E1306C', icono: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>' },
  { id: 'facebook', nombre: 'Facebook', color: '#1877F2', icono: '<path d="M14 8h2.5V5H14c-2.5 0-4 1.6-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13V9.5c0-.8.4-1.5 1-1.5z" fill="currentColor"/>' },
  { id: 'youtube', nombre: 'YouTube', color: '#FF0000', icono: '<rect x="2.5" y="6" width="19" height="12" rx="3.5" fill="currentColor"/><path d="M10 9.5v5l4.5-2.5z" fill="#FFFFFF"/>' },
  { id: 'tiktok', nombre: 'TikTok', color: '#111111', icono: '<path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3V8.7a6.6 6.6 0 1 0 5.8 6.5V8.3a5.5 5.5 0 0 0 3.5 1.2V6.4A3.6 3.6 0 0 1 14 3z" fill="currentColor"/>' },
  { id: 'twitter', nombre: 'X', color: '#111111', icono: '<path d="M4 4h4.2l4 5.6L17.9 4H20l-6.2 7.2L20.5 20h-4.2l-4.3-6-5.1 6H4.8l6.6-7.6z" fill="currentColor"/>' },
];
let datos = [];
let redActiva = 'instagram';
let agentes = [];
let agenteActivo = null;
let oficinaIniciada = false;
let modoPublico = false;   // en línea: el engrane pide la contraseña del panel y no se puede escribir en la hoja de seguidores
const historiales = {};

const $ = s => document.querySelector(s);
const fmt = n => (n == null ? '—' : n.toLocaleString('es-MX'));
const compacto = n => (n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
const cambioTxt = n => (n == null ? '<span class="neu">sin dato</span>' : n > 0 ? `<span class="pos">▲ +${n}</span>` : n < 0 ? `<span class="neg">▼ ${n}</span>` : '<span class="neu">sin cambio</span>');
function hoyTexto() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
function trabajaHoy(a) { return !!(a.ultimo && a.ultimo.fecha === hoyTexto()); }

// ---------- cajones y velo ----------
function abrir(id) {
  cerrarTodo();
  $('#' + id).classList.add('abierto');
  $('#velo').classList.add('activo');
}
function cerrarTodo() {
  document.querySelectorAll('.cajon').forEach(c => c.classList.remove('abierto'));
  $('#velo').classList.remove('activo');
}
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrarTodo));
$('#velo').addEventListener('click', cerrarTodo);
const COLORES = ['#5E8C61', '#E08A4B', '#5E7FB0', '#C4553D', '#8A6FB0', '#3E8C8C'];

// ---------- menú: una sección a la vez ----------
function irA(vista) {
  document.body.dataset.vista = vista;
  document.querySelectorAll('.vista').forEach(v => { v.hidden = v.id !== 'vista-' + vista; });
  document.querySelectorAll('.menu button').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  try { localStorage.setItem('vista', vista); } catch { /* sin almacenamiento */ }
  if (vista === 'redes') setTimeout(pintarGrafica, 0);   // la gráfica necesita medir su ancho ya visible
  if (vista === 'mensajes') cargarMensajes();
}
document.querySelectorAll('.menu button').forEach(b => b.addEventListener('click', () => irA(b.dataset.vista)));
document.addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if (b) irA(b.dataset.ir); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarTodo(); });

// ---------- datos ----------
async function cargar() {
  const [ag, seg, reg] = await Promise.all([
    fetch('/api/agentes').then(r => r.json()),
    fetch('/api/seguidores').then(r => r.json()).catch(e => ({ error: e.message })),
    fetch('/api/registro').then(r => r.json()),
  ]);
  agentes = ag.agentes;
  modoPublico = !!ag.modoPublico;
  $('#estado-chat').textContent = ag.chatActivo ? 'Chat conectado a Claude' : 'Chat en modo local (sin IA)';
  datos = seg.error ? [] : seg.ultimos;
  pintarAgentesPanel();
  pintarRedes();
  pintarGrafica();
  pintarRegistro(reg.registro);
  pintarSemana();
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

// ---------- panel derecho: agentes ----------
function pintarAgentesPanel() {
  $('#lista-agentes-panel').innerHTML = agentes.map((a, i) => {
    const t = trabajaHoy(a);
    return `<div class="agente-fila" role="button" tabindex="0" data-chat="${a.id}">
      <span class="ag-cara">${cara(a.color || COLORES[i % COLORES.length], t)}</span>
      <span class="ag-datos">
        <span class="ag-nombre">${esc(a.nombre)}</span>
        ${a.rol ? `<span class="ag-rol">${esc(a.rol)}</span>` : ''}
        <span class="ag-estado ${t ? 'on' : ''}"><i></i>${t ? 'Trabajando' : 'Descansando'}</span>
      </span>
      <span class="ag-chat">Hablar</span>
      ${`<button class="ag-engrane" data-ajustes="${a.id}" title="Ajustes del agente" aria-label="Ajustes de ${esc(a.nombre)}">
        <svg viewBox="0 0 24 24" width="17" height="17"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H19a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
      </button>`}
    </div>`;
  }).join('') || '<p class="neu">No hay agentes todavía.</p>';
  const lista = $('#lista-agentes-panel');
  lista.querySelectorAll('[data-chat]').forEach(b => {
    b.addEventListener('click', () => abrirChat(b.dataset.chat));
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === b) abrirChat(b.dataset.chat); });
  });
  lista.querySelectorAll('[data-ajustes]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); abrirAjustes(b.dataset.ajustes); }));
}

// ---------- ajustes del agente (engrane) ----------
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PALETA = ['#5E8C61', '#E5A92B', '#5E7FB0', '#F7695C', '#8A6FB0', '#26272B'];
function abrirAjustes(id) {
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
    <span class="error-msg" data-aviso></span>
    <p class="nota-aj">Horario actual: ${esc(a.horario)} (se cambia en la tarea programada).</p>
    <div class="botones-aj"><button type="button" class="sec" data-restablecer>Restablecer</button><span style="flex:1"></span><button type="button" class="sec" data-cancelar>Cancelar</button><button type="submit">Guardar</button></div>
  </form>`;
  document.body.appendChild(m);
  const cerrar = () => m.remove();
  m.addEventListener('mousedown', e => { if (e.target === m) cerrar(); });
  m.querySelector('[data-cancelar]').addEventListener('click', cerrar);
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
    if (agenteActivo === id) $('#chat-cabecera').textContent = agentes.find(x => x.id === id).nombre;
  };
  m.querySelector('[data-restablecer]').addEventListener('click', () => guardar({}));
  m.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    guardar({ nombre: f.get('nombre'), rol: f.get('rol'), color: f.get('color'), notas: f.get('notas') });
  });
  m.querySelector('input[name=nombre]').focus();
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
function pintarGrafica() {
  const red = REDES.find(r => r.id === redActiva);
  $('#titulo-grafica').textContent = red.nombre;
  const cont = $('#grafica');
  const pts = datos.filter(d => d[red.id] != null);
  if (pts.length < 2) { cont.innerHTML = '<p class="neu">Sin datos suficientes.</p>'; return; }
  const W = Math.max(260, cont.clientWidth || 300), H = 190;
  const M = { t: 14, r: 12, b: 26, l: 46 };
  const vals = pts.map(d => d[red.id]);
  const min0 = Math.min(...vals), max0 = Math.max(...vals);
  const rango0 = max0 - min0 || Math.max(1, max0 * 0.01);
  const lo = min0 - rango0 * 0.2, hi = max0 + rango0 * 0.15;
  const x = i => M.l + (i * (W - M.l - M.r)) / (pts.length - 1);
  const y = v => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const ps = pts.map((d, i) => [x(i), y(d[red.id])]);
  const linea = curva(ps);
  const area = linea + ` L${x(pts.length - 1).toFixed(1)},${H - M.b} L${x(0).toFixed(1)},${H - M.b} Z`;
  const grid = [0, 1, 2, 3].map(k => {
    const v = lo + ((hi - lo) * k) / 3, yy = y(v).toFixed(1);
    return `<line x1="${M.l}" x2="${W - M.r}" y1="${yy}" y2="${yy}" stroke="#ECEAE2"/>
      <text x="${M.l - 8}" y="${+yy + 4}" text-anchor="end" font-size="10" fill="#9AA095">${fmt(Math.round(v))}</text>`;
  }).join('');
  const idG = 'g-' + red.id;
  const trazo = '#e72c5e';   // rosa del tema
  const ult = pts[pts.length - 1];
  const etiquetas = `<text x="${M.l}" y="${H - 6}" font-size="10" fill="#9AA095">${pts[0].fechaTexto}</text>
    <text x="${W - M.r}" y="${H - 6}" font-size="10" fill="#9AA095" text-anchor="end">${ult.fechaTexto}</text>`;
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
    const prev = pts[i - 1], d = prev ? pts[i][red.id] - prev[red.id] : null;
    tip.hidden = false;
    tip.innerHTML = `<strong>${fmt(pts[i][red.id])}</strong><span>${pts[i].fechaTexto}</span>${d == null ? '' : `<span class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${d} vs. día anterior</span>`}`;
    tip.style.left = Math.min(W - 150, Math.max(0, px - 60)) + 'px';
    tip.style.top = Math.max(0, py - 58) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; guia.setAttribute('opacity', '0'); punto.setAttribute('opacity', '0'); });
}
let redimension;
window.addEventListener('resize', () => { clearTimeout(redimension); redimension = setTimeout(pintarGrafica, 150); });

// ---------- inicio: seguidores de la semana y por red ----------
function pintarSemana() {
  const ult = datos.slice(-8);
  const cont = $('#barras-sem');
  if (ult.length < 2) { $('#seg-semana').textContent = '—'; cont.innerHTML = ''; return; }
  // diferencia por red solo cuando hay dato en los dos días (si a una red le falta el dato de un día, no se cuenta como si hubiera perdido todo)
  const difs = ult.slice(1).map((d, i) => REDES.reduce((s, x) => (d[x.id] != null && ult[i][x.id] != null ? s + d[x.id] - ult[i][x.id] : s), 0));
  const suma = difs.reduce((a, b) => a + b, 0);
  $('#seg-semana').innerHTML = `${suma > 0 ? '+' : ''}${fmt(suma)} <span class="neu">esta semana</span>`;
  const max = Math.max(1, ...difs.map(Math.abs));
  cont.innerHTML = difs.map((v, i) => {
    const t = new Date(); t.setDate(t.getDate() - (difs.length - 1 - i));
    const dia = ['D', 'L', 'M', 'M', 'J', 'V', 'S'][t.getDay()];
    return `<div class="${i === difs.length - 1 ? 'hoy' : ''} ${v === 0 ? 'vacio' : ''}"><i style="height:${Math.max(6, Math.round(Math.abs(v) / max * 80))}px"></i>${dia}</div>`;
  }).join('');
}
function pintarBarrasRedes() {
  const u = datos[datos.length - 1];
  const cont = $('#barras-redes');
  if (!u) { cont.innerHTML = '<p class="neu">Sin datos de seguidores.</p>'; return; }
  const valores = REDES.map(r => ({ r, v: u[r.id] })).filter(x => x.v != null);
  const max = Math.max(1, ...valores.map(x => x.v));
  cont.innerHTML = valores.map((x, i) => `<div class="fila-red"><span class="n">${x.r.nombre}</span><div class="r"><div style="width:${Math.max(3, Math.round(x.v / max * 100))}%;background:${i % 2 ? '#e72c5e' : '#2B2B2A'}"></div></div><b>${fmt(x.v)}</b></div>`).join('');
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

// ---------- chat ----------
function abrirChat(id) {
  agenteActivo = id;
  const a = agentes.find(x => x.id === id);
  $('#chat-cabecera').textContent = a ? a.nombre : 'Chat';
  abrir('cajon-chat');
  pintarMensajes();
  pintarAcciones();
  setTimeout(() => $('#entrada').focus(), 350);
}
// Botones rápidos: solo para el agente de seguidores
const ACCIONES = [
  { id: 'resumen', texto: 'Resumen diario', ayuda: 'Resumen de seguidores del último registro' },
  { id: 'actualizar-hoy', texto: 'Actualizar hoy en la hoja', ayuda: 'Sobrescribe la fila de hoy con las cifras actuales' },
  { id: 'semana', texto: 'Últimos 7 días', ayuda: 'Muestra los seguidores de la última semana' },
];
function pintarAcciones() {
  const cont = $('#acciones');
  if (agenteActivo !== 'seguidores-diarios') { cont.hidden = true; cont.innerHTML = ''; return; }
  cont.hidden = false;
  cont.innerHTML = ACCIONES.filter(a => !(modoPublico && a.id === 'actualizar-hoy')).map(a => `<button type="button" class="chip" data-accion="${a.id}" title="${a.ayuda}">${a.texto}</button>`).join('');
  cont.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', () => ejecutarAccion(b.dataset.accion)));
}
async function ejecutarAccion(id) {
  const accion = ACCIONES.find(a => a.id === id);
  if (!accion || !agenteActivo) return;
  if (id === 'actualizar-hoy' && !confirm('Esto sobrescribe la fila de hoy en la hoja de seguidores con las cifras actuales. ¿Continuar?')) return;
  const h = (historiales[agenteActivo] ||= []);
  const agente = agenteActivo;
  h.push({ role: 'user', content: accion.texto });
  pintarMensajes();
  const cont = $('#acciones');
  cont.querySelectorAll('button').forEach(b => b.disabled = true);
  const esperando = document.createElement('div');
  esperando.className = 'burbuja agente'; esperando.textContent = 'Trabajando…';
  $('#mensajes').appendChild(esperando);
  try {
    const r = await fetch('/api/accion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agente, accion: id }),
    });
    const j = await r.json();
    h.push({ role: 'assistant', content: j.respuesta || j.error || 'Sin respuesta' });
  } catch (err) {
    h.push({ role: 'assistant', content: 'Error: ' + err.message });
  }
  cont.querySelectorAll('button').forEach(b => b.disabled = false);
  if (agenteActivo === agente) pintarMensajes();
}
function pintarMensajes() {
  const h = historiales[agenteActivo] || [];
  const cont = $('#mensajes');
  cont.innerHTML = '';
  if (!h.length) { cont.innerHTML = '<p class="neu">Escribe una pregunta para empezar.</p>'; return; }
  h.forEach(m => {
    const d = document.createElement('div');
    d.className = 'burbuja ' + (m.role === 'user' ? 'yo' : 'agente');
    d.textContent = m.content;
    cont.appendChild(d);
  });
  cont.scrollTop = cont.scrollHeight;
}
$('#formulario').addEventListener('submit', async e => {
  e.preventDefault();
  const texto = $('#entrada').value.trim();
  if (!texto || !agenteActivo) return;
  $('#entrada').value = '';
  const h = (historiales[agenteActivo] ||= []);
  h.push({ role: 'user', content: texto });
  pintarMensajes();
  const esperando = document.createElement('div');
  esperando.className = 'burbuja agente'; esperando.textContent = 'Pensando…';
  $('#mensajes').appendChild(esperando);
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agente: agenteActivo, mensajes: h }),
    });
    const j = await r.json();
    h.push({ role: 'assistant', content: j.respuesta || j.error || 'Sin respuesta' });
  } catch (err) {
    h.push({ role: 'assistant', content: 'Error: ' + err.message });
  }
  pintarMensajes();
});

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
    return { ...c, ult, titulo: c.nombre || c.telefono || 'Sin nombre', estado: enEspera ? 'espera' : sinResp ? 'sin' : 'ok' };
  }).sort((a, b) => new Date(b.ult.fecha) - new Date(a.ult.fecha));
}
const pendiente = c => c.estado !== 'ok';
const inicial = c => (c.titulo.replace(/[@+•]/g, '').trim().charAt(0) || '?').toUpperCase();
const vistaPrevia = c => (c.ult.direccion === 'salida' ? 'Respuesta: ' : '') + (c.ult.texto || '[' + (c.ult.tipo || 'mensaje') + ']');

function filaContacto(c) {
  return `<button type="button" class="ct ${c.clave === convActiva ? 'sel' : ''}" data-conv="${esc(c.clave)}">
    <span class="av">${esc(inicial(c))}</span><span class="x"><span class="n">${esc(c.titulo)}</span><span class="s">${esc(vistaPrevia(c))}</span></span><span class="punto ${pendiente(c) ? '' : 'ok'}"></span></button>`;
}
function etiquetaRed(lista) {
  const p = lista.filter(pendiente).length;
  return `<span class="etq-red ${p ? 'p' : ''}">${p ? p + (p === 1 ? ' pendiente' : ' pendientes') : 'al día'}</span>`;
}
function pintarColumnas() {
  const cont = $('#cols-msg');
  cont.innerHTML = Object.entries(RED_MSG).map(([id, r]) => {
    const lista = conversaciones.filter(c => c.red === id);
    return `<section class="col-red"><div class="cab"><svg viewBox="0 0 24 24" aria-hidden="true">${r.icono}</svg>${r.nombre}${etiquetaRed(lista)}</div>
      <div class="lista-col">${lista.length ? lista.map(filaContacto).join('') : '<div class="sin">Todavía no hay conversaciones.</div>'}</div></section>`;
  }).join('');
  cont.querySelectorAll('[data-conv]').forEach(b => b.addEventListener('click', () => abrirConversacion(b.dataset.conv)));
}
function pintarConversacion(desplazar) {
  const cont = $('#conv'), modal = $('#modal-conv');
  const c = conversaciones.find(x => x.clave === convActiva);
  if (!c) { modal.hidden = true; return; }
  modal.hidden = false;
  const r = RED_MSG[c.red];
  const previo = cont.querySelector('.resp-texto');   // si ya estabas escribiendo, no se pierde al refrescar
  const borrador = previo ? previo.value : '', teniaFoco = !!previo && document.activeElement === previo;
  const burbujas = c.mensajes.map(m => {
    const salida = m.direccion === 'salida';
    const cls = !salida ? 'cli' : m.origen === 'manual' ? 'yo' : 'ag';
    const quien = !salida ? c.titulo : m.origen === 'manual' ? 'Tú' : 'Agente automático';
    return `<div class="burbuja-c ${cls}">${esc(m.texto || '[' + (m.tipo || 'mensaje') + ']')}<small>${esc(quien)} · ${esc(hora(m.fecha))}</small></div>`;
  }).join('');
  const est = c.estado === 'ok' ? ['Respondido', ''] : c.estado === 'espera' ? ['Respuesta programada', 'p'] : ['Sin respuesta', 'p'];
  cont.innerHTML = `<div class="cab"><span class="av"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${r.icono}</svg></span>
    <div><p>${esc(c.titulo)}</p><p class="s">${r.nombre}${c.nombre && c.telefono ? ' · ' + esc(c.telefono) : ''}</p></div>
    <span class="est ${est[1]}">${est[0]}</span><button class="cerrar-conv" type="button" aria-label="Cerrar conversación">×</button></div>
    <div class="hilo">${burbujas}</div>
    ${cajaRespuesta(c)}
    <div class="leyenda"><span class="l1">Cliente</span><span class="l2">Agente automático</span><span class="l3">Tú</span></div>`;
  cont.querySelector('.cerrar-conv').addEventListener('click', cerrarConversacion);
  const hilo = cont.querySelector('.hilo'); hilo.scrollTop = hilo.scrollHeight;
  activarRespuesta(c, borrador, teniaFoco);
}

// ---------- contestar desde el panel (solo WhatsApp, dentro de las 24 h del último mensaje del cliente) ----------
function cajaRespuesta(c) {
  if (c.red !== 'whatsapp') return '<p class="resp-nota">Por ahora solo se puede contestar desde aquí en WhatsApp.</p>';
  if (!c.ref) return '<p class="resp-nota">Esta conversación es anterior a esta función y no tengo su número completo. Contesta desde la app de WhatsApp.</p>';
  const ultimo = [...c.mensajes].reverse().find(m => m.direccion !== 'salida');
  if (!ultimo || Date.now() - new Date(ultimo.fecha) > 24 * 3600000) return '<p class="resp-nota">Pasaron más de 24 horas desde su último mensaje. WhatsApp solo permite plantillas aprobadas, así que no se puede contestar con texto libre.</p>';
  return `<div class="resp">
    <textarea class="resp-texto" rows="2" maxlength="1000" placeholder="Escribe tu respuesta…"></textarea>
    <div class="resp-conf" hidden><span>Se enviará por WhatsApp a <b>${esc(c.titulo)}</b>.</span><button type="button" class="resp-ok">Confirmar y enviar</button><button type="button" class="resp-no">Cancelar</button></div>
    <div class="resp-pie"><span class="resp-error" role="alert"></span><button type="button" class="resp-enviar">Enviar</button></div>
  </div>`;
}
function activarRespuesta(c, borrador, teniaFoco) {
  const cont = $('#conv');
  const caja = cont.querySelector('.resp');
  if (!caja) return;
  const texto = caja.querySelector('.resp-texto'), conf = caja.querySelector('.resp-conf'), enviar = caja.querySelector('.resp-enviar'), error = caja.querySelector('.resp-error');
  texto.value = borrador;
  if (teniaFoco) texto.focus();
  const ocupado = si => { caja.querySelectorAll('button, textarea').forEach(e => { e.disabled = si; }); };
  enviar.addEventListener('click', () => {
    error.textContent = '';
    if (!texto.value.trim()) { error.textContent = 'Escribe un mensaje primero.'; return; }
    conf.hidden = false; enviar.hidden = true;   // segundo paso: confirmar, para no mandar nada por accidente
  });
  caja.querySelector('.resp-no').addEventListener('click', () => { conf.hidden = true; enviar.hidden = false; });
  caja.querySelector('.resp-ok').addEventListener('click', async () => {
    ocupado(true); error.textContent = 'Enviando…';
    try {
      const r = await fetch('/api/responder', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-panel': '1' }, body: JSON.stringify({ ref: c.ref, texto: texto.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        ocupado(false); conf.hidden = true; enviar.hidden = false;
        error.textContent = r.status === 401 ? 'Tu sesión venció. Entra de nuevo en Mensajes con la contraseña.' : (j.error || 'No se pudo enviar.');
        return;
      }
      texto.value = '';
      await cargarMensajes();   // vuelve a dibujar la conversación con tu mensaje ya incluido
    } catch { ocupado(false); conf.hidden = true; enviar.hidden = false; error.textContent = 'Sin conexión con el servidor.'; }
  });
}
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
  const nueva = $('#modal-conv').hidden;
  convActiva = clave;
  pintarConversacion();
  if (nueva) animarConversacion(true);
}
let cerrandoConv = false;
async function cerrarConversacion() {
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
      ${lista.slice(0, 2).map(filaContacto).join('') || '<div class="vacio-msg">Sin conversaciones.</div>'}`;
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
  $('#cols-msg').innerHTML = `<form class="clave-msg" id="form-clave"><p>${esc(texto)}</p>
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
async function cargarMensajes() {
  try {
    const r = await fetch('/api/mensajes?todos=1');
    const j = await r.json();
    $('#salir-msg').hidden = !(r.ok && modoPublico);
    if (r.status === 401) {
      formularioClave(j.configurada === false ? 'La contraseña del panel todavía no está configurada.' : 'Escribe la contraseña para ver los mensajes.');
      $('#inicio-msg').innerHTML = '<div class="vacio-msg">Entra a Mensajes con tu contraseña para verlos aquí.</div>';
      return;
    }
    if (!r.ok) { $('#cols-msg').innerHTML = `<div class="vacio-msg">${esc(j.error || 'No se pudieron cargar')}</div>`; return; }
    conversaciones = armarConversaciones(j.mensajes || []);
    resumenCola = j.resumen || resumenCola;
    finProximo = resumenCola.proximo ? Date.parse(resumenCola.proximo) : 0;
    pintarColumnas(); pintarConversacion(); pintarInicioMensajes(); pintarPorcentajes(); pintarGrandes(); pintarReloj();
  } catch { $('#cols-msg').innerHTML = '<div class="vacio-msg">Sin conexión con el servidor.</div>'; }
}
$('#salir-msg').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); cargarMensajes(); });
$('#actualizar-msg').addEventListener('click', cargarMensajes);
$('#fecha-hoy').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
cargarMensajes();
setInterval(() => { if (!document.hidden && !document.querySelector('#clave-msg')) cargarMensajes(); }, 30000);
try { const v = localStorage.getItem('vista'); if (v && document.getElementById('vista-' + v)) irA(v); } catch { /* sin almacenamiento */ }

cargar();
setInterval(cargar, 5 * 60 * 1000);
