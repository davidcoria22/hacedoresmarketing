// Webhook de Instagram (mensajes directos) y Facebook (Messenger): registra los mensajes que llegan, sin contestar solos.
// Los guarda en la pestaña "Mensajes"; desde el panel una persona puede contestar (responderDesdePanel).
const crypto = require('crypto');

function leerCrudo(req) {
  return new Promise(resolve => {
    const t = []; req.on('data', c => t.push(c)); req.on('end', () => resolve(Buffer.concat(t))); req.on('error', () => resolve(Buffer.alloc(0)));
  });
}
function firmaValida(crudo, cabecera, secreto) {
  if (!secreto || !cabecera) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(crudo).digest('hex');
  const a = Buffer.from(esperada), b = Buffer.from(cabecera);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Nombre o @usuario de quien escribe (mejor esfuerzo: si falla, se anota sin nombre)
async function pedir(ruta, token) {
  const r = await fetch('https://graph.facebook.com/v21.0/' + ruta + (ruta.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(3000) });
  const t = await r.text();
  if (!r.ok) return { ok: false, motivo: 'estado ' + r.status + ': ' + t.slice(0, 140) };
  try { return { ok: true, j: JSON.parse(t) }; } catch { return { ok: false, motivo: 'respuesta no válida' }; }
}
// META_PAGE_TOKEN: token de página de la app de mensajes. Se limpian espacios, saltos de línea y comillas que se cuelan al pegarlo.
const tokenPagina = () => String(process.env.META_PAGE_TOKEN || process.env.FACEBOOK_PAGE_TOKEN || '').replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
async function perfil(id, red, mid) {
  const token = tokenPagina();
  if (!token || !id) return '';
  const intentos = [];
  // 1) perfil del usuario; 2) quién envió ese mensaje en concreto
  if (red === 'instagram') {
    intentos.push(['perfil', encodeURIComponent(id) + '?fields=name,username']);
    if (mid) intentos.push(['mensaje', encodeURIComponent(mid) + '?fields=from{username,name}']);
  } else {
    intentos.push(['perfil', encodeURIComponent(id) + '?fields=first_name,last_name']);
    if (mid) intentos.push(['mensaje', encodeURIComponent(mid) + '?fields=from{name}']);
  }
  const fallos = [];
  for (const [etiqueta, ruta] of intentos) {
    try {
      const r = await pedir(ruta, token);
      if (!r.ok) { fallos.push(etiqueta + ' ' + r.motivo); continue; }
      const j = r.j.from || r.j;
      const nombre = j.username ? '@' + j.username : (j.name || [j.first_name, j.last_name].filter(Boolean).join(' '));
      if (nombre) return nombre;
      fallos.push(etiqueta + ' sin nombre en la respuesta');
    } catch (e) { fallos.push(etiqueta + ' error: ' + e.message); }
  }
  console.error('meta: no se pudo leer el nombre (' + red + '): ' + fallos.join(' | '));
  return '';
}

// Texto del mensaje (lo que se adjunta se guarda aparte, en "media")
const textoDe = m => String(m.text || '');

// Archivos que llegan: solo se aceptan direcciones https de Meta (o de nuestro almacén)
const HOST_OK = /(^|\.)(fbcdn\.net|cdninstagram\.com|facebook\.com|instagram\.com|fbsbx\.com|supabase\.co)$/i;
const urlOk = u => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && HOST_OK.test(x.hostname) ? x.href : ''; } catch { return ''; } };
const NOMBRE_ENLACE = { ig_reel: 'Reel', reel: 'Reel', share: 'Publicación', ig_post: 'Publicación', story_mention: 'Mención en historia', story: 'Historia' };
// { t: 'image' | 'video' | 'audio' | 'file' | 'enlace', u: dirección, n: nombre } o null si no trae nada
function adjuntoDe(m) {
  const a = (m.attachments || [])[0]; if (!a) return null;
  const tipo = String(a.type || ''), u = urlOk(a.payload && a.payload.url);
  if (['image', 'video', 'audio', 'file'].includes(tipo)) return u ? { t: tipo, u } : { t: tipo };
  const n = String(NOMBRE_ENLACE[tipo] || (a.payload && a.payload.title) || tipo || 'Compartido').slice(0, 80);
  return u ? { t: 'enlace', u, n } : { t: 'enlace', n };
}
// Las direcciones de Meta caducan: lo recibido se copia a nuestro almacén (si no se puede, se queda la original)
async function guardarAdjunto(adj) {
  if (!adj || !adj.u || adj.t === 'enlace') return adj;
  const copia = await require('./almacen.js').copiar(adj.u);
  return copia ? { ...adj, u: copia } : adj;
}

// Comprobaciones comunes antes de contestar desde el panel: red, clave de la página, a quién y la ventana de 24 h
async function prepararEnvio(red, ref) {
  if (red !== 'instagram' && red !== 'facebook') return { codigo: 400, error: 'Red no válida.' };
  const nombre = red === 'instagram' ? 'Instagram' : 'Facebook';
  const token = tokenPagina();
  if (!token) return { codigo: 503, error: 'Falta la clave de ' + nombre + ' (META_PAGE_TOKEN) en este servidor.' };
  const c = await require('./mensajes.js').buscarContacto(ref, red);
  if (!c) return { codigo: 404, error: 'No tengo el dato para contestar esta conversación (es anterior a esta función). Responde desde la app de ' + nombre + '.' };
  if (Date.now() - c.ultimaEntrada > 24 * 3600000) return { codigo: 409, error: 'Pasaron más de 24 horas desde su último mensaje. ' + nombre + ' ya no permite contestarle desde aquí.' };
  return { token, nombre, c };
}
// Manda un mensaje (texto o archivo por dirección) y devuelve su id. Lanza un error con el motivo de Meta si lo rechaza.
async function enviarMensaje(token, nombre, para, mensaje) {
  const r = await fetch('https://graph.facebook.com/v21.0/me/messages?access_token=' + encodeURIComponent(token), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: para }, messaging_type: 'RESPONSE', message: mensaje }), signal: AbortSignal.timeout(20000),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    let motivo = cuerpo.slice(0, 160); try { motivo = JSON.parse(cuerpo).error?.message || motivo; } catch { /* texto plano */ }
    console.error('meta responder:', r.status, cuerpo.slice(0, 200));
    throw new Error(nombre + ' no aceptó el mensaje: ' + String(motivo).slice(0, 160));
  }
  try { return JSON.parse(cuerpo).message_id || ''; } catch { return ''; }
}
async function anotarSalida(red, id, numero, texto, autor, extra = {}) {
  try { await require('./mensajes.js').guardarMensajes([{ id: id || 'panel:' + Date.now() + Math.random().toString(36).slice(2, 6), red, nombre: '', numero, tipo: 'text', texto, origen: 'manual', respuesta: 'enviada', direccion: 'salida', autor, ...extra }]); }
  catch (err) { console.error('mensajes: no se pudo anotar el envío:', err.message); }
}

// Respuesta escrita por una persona desde el panel, por Instagram o Messenger, dentro de las 24 h del último mensaje de la persona.
// Devuelve { ok } o { error, codigo }.
async function responderDesdePanel(red, ref, texto, autor = '') {
  if (red !== 'instagram' && red !== 'facebook') return { codigo: 400, error: 'Red no válida.' };
  texto = String(texto || '').trim();
  if (!texto) return { codigo: 400, error: 'Escribe un mensaje.' };
  if (texto.length > 1000) return { codigo: 400, error: 'El mensaje es muy largo (máximo 1000 caracteres).' };
  const p = await prepararEnvio(red, ref); if (p.error) return p;
  let id;
  try { id = await enviarMensaje(p.token, p.nombre, p.c.numero, { text: texto }); }
  catch (e) { return { codigo: 502, error: String(e.message).slice(0, 200) }; }
  await anotarSalida(red, id, p.c.numero, texto, autor);
  return { ok: true };
}

// Fotos, videos y (solo en Facebook) documentos. Meta los descarga de una dirección web, por eso se suben antes al almacén.
const LIMITE_ARCHIVO = 4 * 1024 * 1024;   // lo máximo que recibe el servidor en línea
const DOCS = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
const TIPOS_ENVIO = {
  imagen: { api: 'image', mimes: ['image/jpeg', 'image/png', 'image/gif'], nombre: 'La foto' },
  video: { api: 'video', mimes: ['video/mp4'], nombre: 'El video' },
  documento: { api: 'file', mimes: DOCS, nombre: 'El documento', solo: 'facebook' },
};
async function enviarArchivoDesdePanel(red, ref, d, autor = '') {
  if (red !== 'instagram' && red !== 'facebook') return { codigo: 400, error: 'Red no válida.' };
  const t = TIPOS_ENVIO[d.tipo];
  if (!t || (t.solo && t.solo !== red)) return { codigo: 400, error: d.tipo === 'documento' ? 'Instagram no permite mandar documentos. Manda una foto o un video.' : 'Tipo de archivo no válido.' };
  const mime = String(d.mime || '').split(';')[0].trim().toLowerCase();
  if (!t.mimes.includes(mime)) return { codigo: 415, error: t.nombre + ' no es de un formato que ' + (red === 'instagram' ? 'Instagram' : 'Facebook') + ' acepte' + (d.tipo === 'imagen' ? ' (JPG, PNG o GIF).' : d.tipo === 'video' ? ' (solo MP4).' : '.') };
  const datos = d.datos;
  if (!Buffer.isBuffer(datos) || !datos.length) return { codigo: 400, error: 'No llegó el archivo.' };
  if (datos.length > LIMITE_ARCHIVO) return { codigo: 413, error: t.nombre + ' pesa más de 4 MB. Por ahora ese es el máximo (para un video más grande, manda el enlace).' };
  const pie = String(d.pie || '').trim().slice(0, 1000);
  const p = await prepararEnvio(red, ref); if (p.error) return p;
  let url;
  try { url = await require('./almacen.js').subir(datos, mime, 'salida'); }
  catch (e) { console.error('meta archivo (subir):', e.message); return { codigo: 503, error: 'No pude guardar el archivo para enviarlo: ' + String(e.message).slice(0, 140) }; }
  let id;
  try { id = await enviarMensaje(p.token, p.nombre, p.c.numero, { attachment: { type: t.api, payload: { url, is_reusable: false } } }); }
  catch (e) { return { codigo: 502, error: String(e.message).slice(0, 200) }; }
  await anotarSalida(red, id, p.c.numero, pie, autor, { tipo: t.api, media: JSON.stringify({ t: t.api, u: url, ...(t.api === 'file' ? { n: String(d.nombre || 'archivo').slice(0, 100) } : {}) }) });
  if (pie) {   // Messenger e Instagram no llevan pie de foto: el texto sale como un mensaje aparte
    try { const id2 = await enviarMensaje(p.token, p.nombre, p.c.numero, { text: pie }); await anotarSalida(red, id2, p.c.numero, pie, autor, { texto: pie }); }
    catch (e) { return { ok: true, aviso: 'La foto salió, pero el texto no: ' + e.message }; }
  }
  return { ok: true };
}

// Foto de perfil de quien escribe (Instagram y Facebook; WhatsApp no la entrega). Se guarda en memoria unos minutos.
const cacheFotos = new Map();
async function fotoContacto(red, ref) {
  if (red !== 'instagram' && red !== 'facebook') return '';
  const k = red + '|' + ref, previo = cacheFotos.get(k);
  if (previo && Date.now() - previo.t < previo.vida) return previo.url;
  let url = '';
  try {
    const token = tokenPagina(), c = token ? await require('./mensajes.js').buscarContacto(ref, red) : null;
    if (c) { const r = await pedir(encodeURIComponent(c.numero) + '?fields=profile_pic', token); if (r.ok) url = urlOk(r.j.profile_pic); }
  } catch { /* sin foto */ }
  cacheFotos.set(k, { url, t: Date.now(), vida: url ? 10 * 60000 : 2 * 60000 });
  return url;
}

// Carpetas de la bandeja de Instagram (principal, general y solicitudes): a qué carpeta pertenece cada conversación.
// Devuelve { principal: [ref...], general: [...], solicitudes: [...], errores: {carpeta: motivo} }; solo viajan las referencias, no los ids.
const CARPETAS_IG = { principal: 'primary', general: 'general', solicitudes: 'requests' };
let cacheCarpetas = { t: 0, v: null };
async function carpetasInstagram() {
  if (cacheCarpetas.v && Date.now() - cacheCarpetas.t < 60000) return cacheCarpetas.v;
  const token = tokenPagina();
  if (!token) throw new Error('Falta la clave de Instagram (META_PAGE_TOKEN) en este servidor.');
  const { refDe } = require('./mensajes.js');
  const res = { errores: {} };
  for (const [nombre, carpeta] of Object.entries(CARPETAS_IG)) {
    const refs = new Set();
    try {
      let ruta = 'me/conversations?platform=instagram&folder=' + carpeta + '&fields=participants&limit=50';
      for (let n = 0; n < 6 && ruta; n++) {
        const r = await pedir(ruta, token);
        if (!r.ok) throw new Error(r.motivo);
        for (const conv of r.j.data || []) for (const x of (conv.participants && conv.participants.data) || []) if (x.id) refs.add(refDe(String(x.id).replace(/\D/g, '')));
        const sig = r.j.paging && r.j.paging.cursors && r.j.paging.next ? r.j.paging.cursors.after : '';
        ruta = sig ? 'me/conversations?platform=instagram&folder=' + carpeta + '&fields=participants&limit=50&after=' + encodeURIComponent(sig) : '';
      }
    } catch (e) { res.errores[nombre] = String(e.message).slice(0, 160); }
    res[nombre] = [...refs];
  }
  cacheCarpetas = { t: Date.now(), v: res };
  return res;
}

// Devuelve true si atendió la ruta.
async function manejarMeta(req, res, url) {
  if (url.pathname !== '/api/meta') return false;
  const fin = (c, t) => { res.writeHead(c, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(t || ''); };
  const verificacion = process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  const secreto = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;

  if (req.method === 'GET') {   // verificación inicial de Meta
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && verificacion && url.searchParams.get('hub.verify_token') === verificacion;
    return fin(ok ? 200 : 403, ok ? url.searchParams.get('hub.challenge') : 'No autorizado'), true;
  }
  if (req.method !== 'POST') return fin(405), true;

  const crudo = await leerCrudo(req);
  if (!firmaValida(crudo, req.headers['x-hub-signature-256'], secreto)) {
    console.error('meta: firma invalida (cuerpo=' + crudo.length + ' bytes)');
    return fin(403, 'Firma inválida'), true;
  }
  let datos; try { datos = JSON.parse(crudo.toString('utf8')); } catch { return fin(200), true; }
  const red = datos.object === 'instagram' ? 'instagram' : datos.object === 'page' ? 'facebook' : '';
  if (!red) return fin(200), true;

  const registros = [];
  for (const e of datos.entry || []) {
    // Formato clásico (messaging[]) y formato nuevo (changes[] con campo "messages")
    const eventos = [...(e.messaging || []), ...(e.changes || []).filter(c => c.field === 'messages').map(c => c.value)];
    for (const ev of eventos) {
      const m = ev.message; if (!m) continue;
      if (m.is_echo) {   // "eco": lo que manda la propia cuenta (tú, desde la app). Se guarda como salida de esa conversación.
        const para = ev.recipient?.id || ''; if (!para || !m.mid) continue;
        const adj = await guardarAdjunto(adjuntoDe(m));
        registros.push({ id: m.mid, red, nombre: '', numero: para, tipo: adj ? adj.t : 'text', texto: textoDe(m), media: adj ? JSON.stringify(adj) : '', origen: 'manual', respuesta: 'enviada', direccion: 'salida' });
        continue;
      }
      const de = ev.sender?.id || ''; if (!de) continue;
      const adj = await guardarAdjunto(adjuntoDe(m));
      registros.push({ id: m.mid || '', red, nombre: await perfil(de, red, m.mid), numero: de, tipo: adj ? adj.t : 'text', texto: textoDe(m), media: adj ? JSON.stringify(adj) : '', origen: 'directo', respuesta: 'ninguna' });
    }
  }
  if (registros.length) {
    try { await require('./mensajes.js').guardarMensajes(registros); }
    catch (err) { console.error('meta: no se pudo guardar:', err.message); }
  }
  return fin(200, 'ok'), true;
}

module.exports = { manejarMeta, responderDesdePanel, enviarArchivoDesdePanel, carpetasInstagram, fotoContacto, adjuntoDe, LIMITE_ARCHIVO };
