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
$('#btn-dash').addEventListener('click', () => abrir('cajon-dash'));
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
  pintarAgentesMini();
  pintarRegistro(reg.registro);
  if (!cachePosts.__listo) { cachePosts.__listo = true; cargarPost(); }
  if (!oficinaIniciada) {
    oficinaIniciada = true;
    montarOficina(agentes, id => abrirChat(id));
  }
}

// ---------- oficina: 3D si carga Three.js; si no, la versión 2D ----------
function montarOficina(ag, cb) {
  let hecho = false;
  const arrancar3D = () => {
    if (hecho || !window.iniciar3D) return false;
    hecho = true;
    try { window.iniciar3D(ag, cb, document.getElementById('oficina')); }
    catch (e) { console.error(e); iniciarOficina(ag, cb); }
    return true;
  };
  if (!arrancar3D()) {
    window.addEventListener('escena3d-lista', arrancar3D, { once: true });
    setTimeout(() => { if (!hecho) { hecho = true; iniciarOficina(ag, cb); } }, 6000);
  }
}

// ---------- caras de los agentes ----------
function cara(color, trabaja) {
  return `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
    <circle cx="22" cy="22" r="21" fill="${color}" opacity=".16"/>
    <circle cx="22" cy="22" r="20" fill="none" stroke="${trabaja ? '#F5B800' : '#D9D2C5'}" stroke-width="2"/>
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
    pintarAgentesPanel(); pintarAgentesMini();
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
  const trazo = '#FFD95A';   // amarillo del tema, sobre tarjeta oscura
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
    <circle cx="${ps[ps.length - 1][0]}" cy="${ps[ps.length - 1][1]}" r="4.5" fill="#F7695C"/>
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

// ---------- cajón: agentes y ejecuciones ----------
function pintarAgentesMini() {
  $('#lista-agentes-mini').innerHTML = agentes.map(a => `
    <div class="mini-agente">
      <div><strong>${a.nombre}</strong><small>${a.horario}</small></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="etiq ${a.ultimo && a.ultimo.resultado === 'OK' ? 'ok' : 'error'}">${a.ultimo ? a.ultimo.resultado : 'Pendiente'}</span>
        <button class="boton-chat" data-chat="${a.id}">Hablar</button>
      </div>
    </div>`).join('') || '<p class="neu">No hay agentes todavía.</p>';
  $('#lista-agentes-mini').querySelectorAll('[data-chat]').forEach(b => b.addEventListener('click', () => abrirChat(b.dataset.chat)));
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
const CANALES_MSG = [{ id: '', nombre: 'Todos' }, { id: 'whatsapp', nombre: 'WhatsApp' }, { id: 'facebook', nombre: 'Facebook', pronto: true }, { id: 'instagram', nombre: 'Instagram', pronto: true }];
let canalMsg = '';
let temporizadorMsg = null;
function pintarChipsMsg() {
  $('#chips-msg').innerHTML = CANALES_MSG.map(c =>
    `<button class="chip-msg ${c.id === canalMsg ? 'activo' : ''}" data-canal="${c.id}" ${c.pronto ? 'disabled title="Falta conectar los permisos de Meta"' : ''}>${c.nombre}${c.pronto ? ' · pronto' : ''}</button>`).join('');
  $('#chips-msg').querySelectorAll('button:not([disabled])').forEach(b => b.addEventListener('click', () => { canalMsg = b.dataset.canal; pintarChipsMsg(); cargarMensajes(); }));
}
function formularioClave(texto) {
  $('#lista-msg').innerHTML = `<form class="clave-msg" id="form-clave"><p>${esc(texto)}</p>
    <input type="password" id="clave-msg" placeholder="Contraseña" autocomplete="current-password" required>
    <button type="submit">Entrar</button><span class="error-msg" id="error-clave"></span></form>`;
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
function pintarMensajes2(lista) {
  if (!lista.length) { $('#lista-msg').innerHTML = '<div class="vacio-msg">Todavía no ha llegado ningún mensaje.</div>'; return; }
  const ETQ = { enviada: ['Respuesta enviada', 'ok'], error: ['Error al responder', 'mal'], 'sin credenciales': ['Faltan credenciales', 'mal'] };
  $('#lista-msg').innerHTML = lista.map(m => {
    const e = ETQ[m.respuesta];
    return `<div class="msg-item"><div class="msg-cab"><b>${esc(m.nombre || m.telefono || 'Sin nombre')}</b><span>${esc(hace(m.fecha))}</span></div>
      ${m.nombre && m.telefono ? `<div class="msg-tel">${esc(m.telefono)}</div>` : ''}
      <div class="msg-texto">${esc(m.texto || '[' + (m.tipo || 'mensaje') + ']')}</div>
      <div class="msg-pie"><span class="msg-red">${esc(m.red)}</span>${m.origen === 'anuncio' ? '<span class="msg-etq">Anuncio</span>' : ''}${e ? `<span class="msg-etq ${e[1]}">${e[0]}</span>` : ''}</div></div>`;
  }).join('');
}
async function cargarMensajes() {
  try {
    const r = await fetch('/api/mensajes' + (canalMsg ? '?red=' + canalMsg : ''));
    const j = await r.json();
    $('#salir-msg').hidden = !(r.ok && modoPublico);
    if (r.status === 401) { formularioClave(j.configurada === false ? 'La contraseña del panel todavía no está configurada.' : 'Escribe la contraseña para ver los mensajes.'); return; }
    if (!r.ok) { $('#lista-msg').innerHTML = `<div class="vacio-msg">${esc(j.error || 'No se pudieron cargar')}</div>`; return; }
    pintarMensajes2(j.mensajes || []);
  } catch { $('#lista-msg').innerHTML = '<div class="vacio-msg">Sin conexión con el servidor.</div>'; }
}
$('#salir-msg').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); cargarMensajes(); });
$('#actualizar-msg').addEventListener('click', cargarMensajes);
pintarChipsMsg();
cargarMensajes();
temporizadorMsg = setInterval(() => { if (!document.hidden && !document.querySelector('#clave-msg')) cargarMensajes(); }, 30000);

cargar();
setInterval(cargar, 5 * 60 * 1000);
