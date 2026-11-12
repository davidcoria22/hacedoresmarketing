// Servidor local del panel de agentes de Hacedores.
// Sin dependencias: solo módulos integrados de Node.js.
// Las credenciales se leen aquí y nunca se envían al navegador.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Carga app-agentes/.env (si existe) sin sobrescribir variables ya definidas.
const ARCHIVO_ENV = path.join(__dirname, '.env');
if (fs.existsSync(ARCHIVO_ENV)) {
  for (const l of fs.readFileSync(ARCHIVO_ENV, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const RAIZ = path.resolve(__dirname, '..');              // ...\Hacedores
const AGENTES = path.join(RAIZ, 'agentes');
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const SHEET_ID = '1mdIvmGRBiPWNzEM7ISccsalhKAmEdCbSnl5T1XkjgR4';
const MODELO = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

// ---------- utilidades ----------
function leerTexto(f) { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } }
// Modo público (Vercel u otro hosting): solo lectura, sin IA y sin ajustes editables.
// Las credenciales llegan por variables de entorno, nunca por archivos del repositorio.
const MODO_PUBLICO = !!process.env.VERCEL || process.env.MODO_PUBLICO === '1';
const CLAVES_CREDENCIALES = ['YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID', 'FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_TOKEN', 'INSTAGRAM_USER_ID', 'INSTAGRAM_TOKEN'];
function leerEnv(f) {
  const env = {};
  for (const l of (leerTexto(f) || '').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2];
  }
  for (const k of CLAVES_CREDENCIALES) if (process.env[k]) env[k] = process.env[k];
  return env;
}
function leerCSV(f) {
  const t = leerTexto(f); if (!t) return [];
  const lineas = t.split(/\r?\n/).filter(Boolean);
  const cab = lineas.shift().split(',');
  return lineas.map(l => {
    const cols = l.split(','); const o = {};
    cab.forEach((c, i) => o[c] = cols[i] ?? '');
    return o;
  });
}
function petición(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: headers || {} }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}
const b64 = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// ---------- Google Sheets (solo lectura) ----------
const tokenCache = {};
async function tokenGoogle(permiso = 'spreadsheets.readonly') {
  if (tokenCache[permiso] && Date.now() < tokenCache[permiso].expira) return tokenCache[permiso].valor;
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || fs.readFileSync(path.join(AGENTES, 'seguidores-diarios', 'google-service-account.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const c = b64(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/' + permiso, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const s = b64(crypto.sign('RSA-SHA256', Buffer.from(h + '.' + c), key.private_key));
  const r = await petición('POST', 'https://oauth2.googleapis.com/token',
    'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + h + '.' + c + '.' + s,
    { 'Content-Type': 'application/x-www-form-urlencoded' });
  const t = JSON.parse(r.body).access_token;
  if (!t) throw new Error('Google no entregó acceso a la hoja');
  tokenCache[permiso] = { valor: t, expira: Date.now() + 50 * 60 * 1000 };
  return t;
}
async function leerHoja() {
  const token = await tokenGoogle();
  const r = await petición('GET',
    'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent('Hacedores!A1:K3000'),
    null, { Authorization: 'Bearer ' + token });
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  const filas = JSON.parse(r.body).values || [];
  const cab = filas[0];
  const num = v => (v === undefined || v === '' ? null : Number(String(v).replace(/[.,]/g, '')));
  const fecha = s => { const [d, m, a] = (s || '').split('/').map(Number); return a ? new Date(a, m - 1, d) : null; };
  const datos = filas.slice(1).map(f => ({
    fecha: fecha(f[0]), fechaTexto: f[0],
    twitter: num(f[1]), instagram: num(f[3]), facebook: num(f[5]), youtube: num(f[7]), tiktok: num(f[9]),
  })).filter(d => d.fecha);
  return { cabecera: cab, datos };
}

// ---------- acciones del agente de seguidores ----------
const RUTA_SEGUIDORES = path.join(AGENTES, 'seguidores-diarios');
const numero = v => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[.,]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const conSigno = (a, b) => (a == null || b == null ? 'sin dato' : (a - b >= 0 ? '+' : '') + (a - b));
function ahoraMexico() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = t => p.find(x => x.type === t).value;
  return { fecha: Number(v('day')) + '/' + Number(v('month')) + '/' + v('year'), hora: v('hour') + ':' + v('minute') };
}
async function filasHoja() {
  const token = await tokenGoogle();
  const r = await petición('GET',
    'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent('Hacedores!A1:K3000'),
    null, { Authorization: 'Bearer ' + token });
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return JSON.parse(r.body).values || [];
}
// Lee los seguidores de las redes automáticas. Si una red no responde, devuelve null para ella.
async function seguidoresHoy() {
  const env = leerEnv(path.join(RUTA_SEGUIDORES, 'credenciales.env'));
  const out = { youtube: null, facebook: null, instagram: null };
  try {
    const r = await petición('GET', 'https://www.googleapis.com/youtube/v3/channels?part=statistics&id=' + encodeURIComponent(env.YOUTUBE_CHANNEL_ID || '') + '&key=' + encodeURIComponent(env.YOUTUBE_API_KEY || ''));
    out.youtube = numero(JSON.parse(r.body).items?.[0]?.statistics?.subscriberCount);
  } catch { /* se queda en null */ }
  try {
    const r = await petición('GET', 'https://graph.facebook.com/v27.0/' + encodeURIComponent(env.FACEBOOK_PAGE_ID || '') + '?fields=followers_count&access_token=' + encodeURIComponent(env.FACEBOOK_PAGE_TOKEN || ''));
    out.facebook = numero(JSON.parse(r.body).followers_count);
  } catch { /* se queda en null */ }
  try {
    const r = await petición('GET', 'https://graph.facebook.com/v27.0/' + encodeURIComponent(env.INSTAGRAM_USER_ID || '') + '?fields=followers_count&access_token=' + encodeURIComponent(env.FACEBOOK_PAGE_TOKEN || ''));
    out.instagram = numero(JSON.parse(r.body).followers_count);
  } catch { /* se queda en null */ }
  return out;
}
// ---------- Último post por red + comentarios ----------
const RUTA_PUBLICACIONES = path.join(AGENTES, 'publicaciones');
const cachePosts = {};
async function graph(ruta, env) {
  const r = await petición('GET', 'https://graph.facebook.com/v27.0/' + ruta + (ruta.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(env.FACEBOOK_PAGE_TOKEN || ''));
  const j = JSON.parse(r.body);
  if (j.error) throw new Error(j.error.message);
  return j;
}
async function ultimoPost(red) {
  const env = leerEnv(path.join(RUTA_SEGUIDORES, 'credenciales.env'));
  if (red === 'instagram') {
    const m = (await graph(encodeURIComponent(env.INSTAGRAM_USER_ID || '') + '/media?limit=1&fields=id,caption,permalink,media_type,timestamp,like_count,comments_count,media_url,thumbnail_url', env)).data?.[0];
    if (!m) return { red, post: null, comentarios: [], aviso: 'No hay publicaciones.' };
    let comentarios = [], aviso = '';
    try {
      comentarios = (await graph(m.id + '/comments?limit=20&fields=text,username,timestamp,like_count', env)).data.map(c => ({ usuario: c.username, texto: c.text, fecha: c.timestamp, likes: c.like_count }));
    } catch (e) { aviso = 'No se pudieron leer los comentarios: ' + e.message; }
    return { red, post: { texto: m.caption || '', fecha: m.timestamp, url: m.permalink, imagen: m.thumbnail_url || m.media_url || '', tipo: m.media_type, likes: m.like_count, comentarios: m.comments_count }, comentarios, aviso };
  }
  if (red === 'facebook') {
    const m = (await graph(encodeURIComponent(env.FACEBOOK_PAGE_ID || '') + '/published_posts?limit=1&fields=id,message,created_time,permalink_url,full_picture', env)).data?.[0];
    if (!m) return { red, post: null, comentarios: [], aviso: 'No hay publicaciones.' };
    let comentarios = [], aviso = '';
    try {
      comentarios = (await graph(m.id + '/comments?limit=20&fields=message,from,created_time,like_count', env)).data.map(c => ({ usuario: c.from?.name || 'Usuario', texto: c.message, fecha: c.created_time, likes: c.like_count }));
    } catch (e) {
      aviso = /pages_read_user_content|Public Content/.test(e.message)
        ? 'Para ver los comentarios de Facebook falta el permiso pages_read_user_content en el token de Meta.'
        : 'No se pudieron leer los comentarios: ' + e.message;
    }
    return { red, post: { texto: m.message || '', fecha: m.created_time, url: m.permalink_url, imagen: m.full_picture || '' }, comentarios, aviso };
  }
  // TikTok y X: no tienen lectura automática; se toman de agentes/publicaciones/ultimos-posts.json
  let datos = {};
  try { datos = JSON.parse(leerTexto(path.join(RUTA_PUBLICACIONES, 'ultimos-posts.json')) || '{}'); } catch { /* vacío */ }
  const d = datos[red];
  if (!d || !d.post) return { red, post: null, comentarios: [], aviso: (red === 'twitter' ? 'X' : 'TikTok') + ' no se lee automáticamente. Cuando se capture el último post en ultimos-posts.json aparecerá aquí.' };
  return { red, post: d.post, comentarios: d.comentarios || [], aviso: d.aviso || '' };
}
const etiquetaRed = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };

async function resumenDiario() {
  const { datos } = await leerHoja();
  if (!datos.length) return 'Todavía no hay datos en la hoja.';
  const u = datos[datos.length - 1], p = datos[datos.length - 2] || {};
  const lineas = Object.keys(etiquetaRed).map(k => etiquetaRed[k] + ': ' + (u[k] ?? 'vacío') + ' (' + conSigno(u[k], p[k]) + ')');
  const reg = leerCSV(path.join(RUTA_SEGUIDORES, 'registro.csv')).slice(-1)[0];
  return 'Resumen del ' + u.fechaTexto + ':\n' + lineas.join('\n') +
    '\nX (Twitter): captura manual, último valor en la hoja: ' + (u.twitter ?? 'vacío') + '.' +
    (reg ? '\nÚltima ejecución registrada: ' + reg.fecha + ' — ' + reg.resultado + '.' : '');
}

async function ultimos7Dias() {
  const { datos } = await leerHoja();
  if (!datos.length) return 'Todavía no hay datos en la hoja.';
  const filas = datos.slice(-7).map(d => d.fechaTexto + ': Instagram ' + (d.instagram ?? '—') + ' · Facebook ' + (d.facebook ?? '—') + ' · YouTube ' + (d.youtube ?? '—') + ' · TikTok ' + (d.tiktok ?? '—'));
  return 'Últimos ' + filas.length + ' días:\n' + filas.join('\n');
}

async function actualizarHoy() {
  const { fecha, hora } = ahoraMexico();
  const seg = await seguidoresHoy();
  const filas = await filasHoja();
  const idx = filas.findIndex((f, i) => i > 0 && f[0] === fecha);
  const base = idx > 0 ? filas[idx] : [];
  let previa = [];
  for (let i = filas.length - 1; i > 0; i--) { if (i !== idx && filas[i][0]) { previa = filas[i]; break; } }
  const valor = (k, colValor, colDelta, actual) => {
    const v = actual != null ? actual : numero(base[colValor]);
    const ant = numero(previa[colValor]);
    return { v, delta: v != null && ant != null ? v - ant : (base[colDelta] ?? '') };
  };
  const ig = valor('instagram', 3, 4, seg.instagram);
  const fb = valor('facebook', 5, 6, seg.facebook);
  const yt = valor('youtube', 7, 8, seg.youtube);
  const tt = valor('tiktok', 9, 10, null);   // TikTok no se puede leer desde el panel: se conserva el valor de la fila
  const fila = [fecha, base[1] ?? '', base[2] ?? '', ig.v ?? '', ig.delta, fb.v ?? '', fb.delta, yt.v ?? '', yt.delta, tt.v ?? '', tt.delta];

  const token = await tokenGoogle('spreadsheets');
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const cuerpo = JSON.stringify({ values: [fila] });
  let r, fila_num;
  if (idx > 0) {
    fila_num = idx + 1;
    r = await petición('PUT', 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent('Hacedores!A' + fila_num + ':K' + fila_num) + '?valueInputOption=USER_ENTERED', cuerpo, h);
  } else {
    fila_num = filas.length + 1;
    r = await petición('POST', 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent('Hacedores!A:K') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', cuerpo, h);
  }
  if (r.status !== 200) throw new Error('No se pudo escribir en la hoja (respuesta ' + r.status + ')');

  const sinDato = Object.keys(etiquetaRed).filter(k => k !== 'tiktok' && seg[k] == null);
  const okRedes = ['instagram', 'facebook', 'youtube'].filter(k => seg[k] != null);
  const reg = path.join(RUTA_SEGUIDORES, 'registro.csv');
  const previo = leerTexto(reg) || 'fecha,resultado,redes_ok,redes_con_error,nota\n';
  fs.writeFileSync(reg, previo.replace(/\s*$/, '\n') + [fecha, 'OK', okRedes.join(';'), sinDato.join(';'), 'actualizado ' + hora + ' desde el panel'].join(',') + '\n', 'utf8');

  const lineas = ['Listo: la fila de hoy (' + fecha + ') quedó actualizada a las ' + hora + ' en la fila ' + fila_num + ' de la hoja.'];
  lineas.push('Instagram: ' + (ig.v ?? 'vacío') + ' (' + conSigno(ig.v, numero(previa[3])) + ')');
  lineas.push('Facebook: ' + (fb.v ?? 'vacío') + ' (' + conSigno(fb.v, numero(previa[5])) + ')');
  lineas.push('YouTube: ' + (yt.v ?? 'vacío') + ' (' + conSigno(yt.v, numero(previa[7])) + ')');
  lineas.push('TikTok: se conservó ' + (tt.v ?? 'vacío') + ' (captúralo a mano o con el agente diario).');
  lineas.push('X (Twitter): sin cambios, captura manual.');
  if (sinDato.length) lineas.push('Redes sin respuesta (se conservó su valor anterior): ' + sinDato.map(k => etiquetaRed[k]).join(', ') + '.');
  return lineas.join('\n');
}

// ---------- agentes ----------
// Acepta 2026-11-11 o 11/11/2026 y devuelve siempre d/m/aaaa (sin ceros a la izquierda)
function fechaDiaMes(t) {
  t = String(t || '').trim();
  const [a, b, c] = t.split(/[-\/T ]/);
  if (/^\d{4}$/.test(a) && b && c) return Number(c) + '/' + Number(b) + '/' + a;      // 2026-11-11
  if (/^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b) && /^\d{4}$/.test(c)) return Number(a) + '/' + Number(b) + '/' + c;   // 11/11/2026
  return t;
}
const fechaMexico = d => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);
// Qué agentes trabajaron hoy según la hoja de Google (sirve también en línea, donde el registro del repositorio no se actualiza solo)
let cacheActividad = { t: 0, v: {} };
async function actividadHoy() {
  if (Date.now() - cacheActividad.t < 2 * 60 * 1000) return cacheActividad.v;
  const v = {};
  try { const { datos } = await leerHoja(); const u = datos[datos.length - 1]; if (u) v['seguidores-diarios'] = fechaDiaMes(u.fechaTexto); } catch { /* sin acceso a la hoja */ }
  try { const m = (await require('./mensajes.js').leerMensajes(1))[0]; if (m) v['whatsapp'] = fechaMexico(new Date(m.fecha)); } catch { /* sin pestaña de mensajes */ }
  cacheActividad = { t: Date.now(), v };
  return v;
}
function listarAgentes() {
  if (!fs.existsSync(AGENTES)) return [];
  return fs.readdirSync(AGENTES, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => {
    const dir = path.join(AGENTES, d.name);
    const readme = leerTexto(path.join(dir, 'README.md')) || '';
    const titulo = (readme.match(/^#\s+(.+)$/m) || [null, d.name])[1].replace(/^Agente:\s*/, '');
    const config = leerTexto(path.join(dir, 'config.md')) || '';
    const horario = (config.match(/Hora:\s*(.+)/) || [null, 'Sin horario'])[1];
    const registro = leerCSV(path.join(dir, 'registro.csv'));
    const ultimo = registro[registro.length - 1] || null;
    if (ultimo) ultimo.fecha = fechaDiaMes(ultimo.fecha);
    const aj = leerAjustes()[d.name] || {};
    return {
      id: d.name, nombre: aj.nombre || titulo, nombreOriginal: titulo, horario, ultimo,
      rol: aj.rol || '', color: aj.color || '', notas: aj.notas || '',
      instrucciones: (leerTexto(path.join(dir, 'instrucciones.md')) || '') + (aj.notas ? '\n\nNotas adicionales del equipo:\n' + aj.notas : ''),
    };
  });
}
// Ajustes sencillos por agente (nombre, rol, color, notas), guardados en app-agentes/ajustes.json
const ARCHIVO_AJUSTES = path.join(__dirname, 'ajustes.json');
let ajustesNube = { t: 0, v: {} };   // en línea: copia de la pestaña "Ajustes" de la hoja
async function refrescarAjustesNube(forzar) {
  if (!MODO_PUBLICO) return;
  if (!forzar && Date.now() - ajustesNube.t < 60 * 1000) return;
  try { ajustesNube = { t: Date.now(), v: await require('./ajustes-nube.js').leerTodos() }; } catch { ajustesNube.t = Date.now(); }
}
function leerAjustes() {
  if (MODO_PUBLICO) return ajustesNube.v;
  try { return JSON.parse(fs.readFileSync(ARCHIVO_AJUSTES, 'utf8')); } catch { return {}; }
}
async function guardarAjustes(id, c) {
  const todos = { ...leerAjustes() };
  const limpio = t => String(t || '').trim();
  todos[id] = {
    nombre: limpio(c.nombre).slice(0, 40),
    rol: limpio(c.rol).slice(0, 60),
    color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '',
    notas: limpio(c.notas).slice(0, 1000),
  };
  if (MODO_PUBLICO) { await require('./ajustes-nube.js').guardar(id, todos[id]); ajustesNube = { t: Date.now(), v: todos }; return; }
  fs.writeFileSync(ARCHIVO_AJUSTES, JSON.stringify(todos, null, 2));
}

// ---------- chat ----------
function respuestaLocal(agente, mensaje, datos) {
  const m = mensaje.toLowerCase();
  if (agente.id === 'seguidores-diarios' && datos && datos.length) {
    const u = datos[datos.length - 1];
    const prev = datos[datos.length - 2];
    const cambio = (a, b) => (a == null || b == null ? 'sin dato' : (a - b >= 0 ? '+' : '') + (a - b));
    if (m.includes('x') || m.includes('twitter')) return 'X se captura a mano. Último dato registrado en la hoja: ' + (u.twitter ?? 'vacío') + '.';
    return 'Último registro (' + u.fechaTexto + '): Instagram ' + u.instagram + ' (' + cambio(u.instagram, prev?.instagram) + '), Facebook ' + u.facebook + ' (' + cambio(u.facebook, prev?.facebook) + '), YouTube ' + u.youtube + ' (' + cambio(u.youtube, prev?.youtube) + '), TikTok ' + u.tiktok + ' (' + cambio(u.tiktok, prev?.tiktok) + ').';
  }
  return 'Estoy en modo local, sin IA. Para conversar de verdad, configura la variable ANTHROPIC_API_KEY y reinicia el panel.';
}
async function responderConClaude(agente, historial) {
  const key = process.env.ANTHROPIC_API_KEY;
  const sistema = 'Eres el agente "' + agente.nombre + '" de Hacedores. Responde en español, breve y claro. Estas son tus instrucciones:\n\n' + agente.instrucciones;
  const r = await petición('POST', 'https://api.anthropic.com/v1/messages',
    JSON.stringify({ model: MODELO, max_tokens: 800, system: sistema, messages: historial }),
    { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
  if (r.status !== 200) throw new Error('API de Claude respondió ' + r.status);
  return JSON.parse(r.body).content.map(c => c.text || '').join('');
}

// ---------- HTTP ----------
function enviarJSON(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function leerCuerpo(req) {
  if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {}));
  return new Promise(resolve => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };

const manejar = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (await require('./whatsapp.js').manejarWhatsApp(req, res, url)) return;
    if (await require('./meta-mensajes.js').manejarMeta(req, res, url)) return;
    // ---- contraseña y mensajes de clientes (sección privada) ----
    const auth = require('./auth.js');
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const https_ = (req.headers['x-forwarded-proto'] || '') === 'https';
    if (req.method === 'POST' && url.pathname === '/api/login') {
      if (!MODO_PUBLICO) return enviarJSON(res, 200, { ok: true, local: true });
      if (!auth.configurada()) return enviarJSON(res, 503, { error: 'La contraseña del panel todavía no está configurada.' });
      if (auth.bloqueado(ip)) return enviarJSON(res, 429, { error: 'Demasiados intentos. Espera un minuto.' });
      const { password } = await leerCuerpo(req);
      if (!auth.passwordCorrecta(password)) { auth.anotarFallo(ip); return enviarJSON(res, 401, { error: 'Contraseña incorrecta.' }); }
      res.setHeader('Set-Cookie', auth.cookieSesion(https_));
      return enviarJSON(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      res.setHeader('Set-Cookie', auth.cookieBorrar(https_));
      return enviarJSON(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/mensajes') {
      if (MODO_PUBLICO && !auth.sesionValida(req)) return enviarJSON(res, 401, { requiereLogin: true, configurada: auth.configurada() });
      const red = url.searchParams.get('red') || '';
      const todos = url.searchParams.get('todos') === '1';   // con todos=1 incluye lo que se envió, para armar las conversaciones
      try {
        const mensajes = await require('./mensajes.js').leerMensajes(todos ? 800 : 60, red, todos);
        let resumen = { pendientes: 0, proximo: '' };
        try { resumen = await require('./pendientes.js').resumen(); } catch { /* sin cola todavía */ }
        return enviarJSON(res, 200, { mensajes, resumen });
      }
      catch (e) { return enviarJSON(res, 502, { error: 'No se pudieron leer los mensajes: ' + e.message }); }
    }
    const usaIA = !MODO_PUBLICO && !!process.env.ANTHROPIC_API_KEY;   // en línea nunca se gasta la clave de IA
    if (req.method === 'GET' && url.pathname === '/api/agentes') {
      await refrescarAjustesNube();
      const act = await actividadHoy(), hoy = fechaMexico(new Date());
      const agentes = listarAgentes().map(({ instrucciones, ...resto }) => {
        if (act[resto.id] === hoy && (!resto.ultimo || resto.ultimo.fecha !== hoy)) resto.ultimo = { ...(resto.ultimo || {}), fecha: hoy, resultado: 'OK', nota: 'actividad de hoy en la hoja' };
        return resto;
      });
      return enviarJSON(res, 200, { agentes, chatActivo: usaIA, modoPublico: MODO_PUBLICO });
    }
    if (req.method === 'POST' && url.pathname === '/api/ajustes') {
      if (MODO_PUBLICO && !require('./auth.js').sesionValida(req)) return enviarJSON(res, 401, { requiereLogin: true, error: 'Escribe la contraseña del panel para guardar.' });
      await refrescarAjustesNube(true);
      const { agente: id, ...cfg } = await leerCuerpo(req);
      if (!listarAgentes().some(a => a.id === id)) return enviarJSON(res, 404, { error: 'Agente no encontrado' });
      try { await guardarAjustes(id, cfg); } catch (e) { return enviarJSON(res, 502, { error: 'No se pudo guardar: ' + e.message }); }
      return enviarJSON(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/publicaciones') {
      const red = url.searchParams.get('red');
      if (!['instagram', 'facebook', 'tiktok', 'twitter'].includes(red)) return enviarJSON(res, 400, { error: 'Red desconocida' });
      const c = cachePosts[red];
      if (c && Date.now() - c.t < 5 * 60 * 1000 && !url.searchParams.get('refrescar')) return enviarJSON(res, 200, c.v);
      const v = await ultimoPost(red);
      cachePosts[red] = { t: Date.now(), v };
      return enviarJSON(res, 200, v);
    }
    if (req.method === 'GET' && url.pathname === '/api/seguidores') {
      const { datos } = await leerHoja();
      const ultimos = datos.slice(-60);
      return enviarJSON(res, 200, { ultimos, total: datos.length });
    }
    if (req.method === 'GET' && url.pathname === '/api/registro') {
      const registro = leerCSV(path.join(AGENTES, 'seguidores-diarios', 'registro.csv')).slice(-15).reverse();
      return enviarJSON(res, 200, { registro });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const { agente: id, mensajes = [] } = await leerCuerpo(req);
      const agente = listarAgentes().find(a => a.id === id);
      if (!agente) return enviarJSON(res, 404, { error: 'Agente no encontrado' });
      const ultimo = mensajes[mensajes.length - 1]?.content || '';
      let texto;
      if (usaIA) texto = await responderConClaude(agente, mensajes);
      else {
        let datos = null;
        if (id === 'seguidores-diarios') { try { datos = (await leerHoja()).datos; } catch { datos = null; } }
        texto = respuestaLocal(agente, ultimo, datos);
      }
      return enviarJSON(res, 200, { respuesta: texto });
    }
    if (req.method === 'POST' && url.pathname === '/api/accion') {
      const { agente: id, accion } = await leerCuerpo(req);
      if (id !== 'seguidores-diarios') return enviarJSON(res, 404, { error: 'Esta acción no está disponible para este agente' });
      const acciones = { resumen: resumenDiario, 'actualizar-hoy': actualizarHoy, semana: ultimos7Dias };
      if (!acciones[accion]) return enviarJSON(res, 400, { error: 'Acción desconocida' });
      if (MODO_PUBLICO && accion === 'actualizar-hoy') return enviarJSON(res, 403, { error: 'Escribir en la hoja solo está disponible en la versión local.' });
      return enviarJSON(res, 200, { respuesta: await acciones[accion]() });
    }
    // archivos estáticos
    const archivo = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!archivo.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const contenido = leerTexto(archivo);
    if (contenido === null) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'text/plain' });
    res.end(contenido);
  } catch (e) {
    enviarJSON(res, 500, { error: e.message });
  }
};
manejar.ayudas = { tokenGoogle, petición, SHEET_ID };   // lo usa mensajes.js
module.exports = manejar;   // lo usa api/index.js en Vercel
if (require.main === module) http.createServer(manejar).listen(PORT, () => console.log('Panel de agentes en http://localhost:' + PORT));
