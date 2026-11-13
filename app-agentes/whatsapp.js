// Webhook de WhatsApp Cloud API: responde con un mensaje fijo a quien llega desde el anuncio.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR_MENSAJES = path.join(__dirname, '..', 'agentes', 'whatsapp');
const leerTexto = archivo => fs.readFileSync(path.join(DIR_MENSAJES, path.basename(archivo)), 'utf8').trim();
// Cada anuncio puede tener su propio mensaje: agentes/whatsapp/anuncios.json dice qué palabras lo identifican y qué textos usar.
// Lo que no coincida con ninguno usa mensaje.txt y mensaje-seguimiento.txt (el del curso de impresión 3D).
const listaAnuncios = () => { try { return JSON.parse(fs.readFileSync(path.join(DIR_MENSAJES, 'anuncios.json'), 'utf8')); } catch { return []; } };
function elegirAnuncio(m) {
  const r = m.referral || {};
  const pajar = [r.headline, r.body, r.source_url, r.source_id, m.text?.body].filter(Boolean).join(' ').toLowerCase();
  return listaAnuncios().find(a => (a.palabras || []).some(p => pajar.includes(String(p).toLowerCase()))) || null;
}
const textosDe = a => ({ mensaje: leerTexto(a?.mensaje || 'mensaje.txt'), seguimiento: leerTexto(a?.seguimiento || 'mensaje-seguimiento.txt') });
const anuncioPorId = id => listaAnuncios().find(a => a.id === id) || null;
// Horas para el seguimiento si la persona no responde (0 = sin seguimiento; por defecto 2). Debe ser menor a 24: pasadas 24 h WhatsApp solo permite plantillas aprobadas.
const horasSeguimiento = () => (process.env.WHATSAPP_SEGUIMIENTO_HORAS !== undefined && Number(process.env.WHATSAPP_SEGUIMIENTO_HORAS) >= 0 ? Number(process.env.WHATSAPP_SEGUIMIENTO_HORAS) : 2);

function leerCrudo(req) {
  return new Promise(resolve => {
    const trozos = [];
    req.on('data', c => trozos.push(c));
    req.on('end', () => resolve(Buffer.concat(trozos)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function firmaValida(crudo, cabecera, secreto) {
  if (!secreto || !cabecera) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(crudo).digest('hex');
  const a = Buffer.from(esperada), b = Buffer.from(cabecera);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function enviarTexto(para, texto) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto, preview_url: true } })
  });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error('WhatsApp ' + r.status + ' ' + cuerpo.slice(0, 200));
  try { return JSON.parse(cuerpo).messages?.[0]?.id || ''; } catch { return ''; }   // id del mensaje enviado
}

// Respuesta escrita por una persona desde el panel. Devuelve { ok } o { error, codigo }.
async function responderDesdePanel(ref, texto) {
  texto = String(texto || '').trim();
  if (!texto) return { codigo: 400, error: 'Escribe un mensaje.' };
  if (texto.length > 1000) return { codigo: 400, error: 'El mensaje es muy largo (máximo 1000 caracteres).' };
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return { codigo: 503, error: 'Faltan las credenciales de WhatsApp en este servidor.' };
  const c = await require('./mensajes.js').buscarContacto(ref);
  if (!c) return { codigo: 404, error: 'No tengo el número de esta conversación (es anterior a esta función). Responde desde la app de WhatsApp.' };
  if (Date.now() - c.ultimaEntrada > 24 * 3600000) return { codigo: 409, error: 'Pasaron más de 24 horas desde su último mensaje. WhatsApp solo permite plantillas aprobadas.' };
  let id;
  try { id = await enviarTexto(c.numero, texto); }
  catch (e) { console.error('responder:', e.message); return { codigo: 502, error: 'WhatsApp no aceptó el mensaje: ' + String(e.message).replace(/^WhatsApp \d+ /, '').slice(0, 160) }; }
  await anotarSalida(id || 'panel:' + Date.now(), c.numero, texto, 'manual');   // queda en la conversación como respuesta tuya
  if (process.env.WHATSAPP_CRON_SECRET) { try { await require('./pendientes.js').cancelarSeguimientos([c.numero]); } catch { /* sin cola */ } }   // si una persona ya conversa, no sale el seguimiento automático
  return { ok: true };
}

// Texto de un mensaje de WhatsApp: el escrito o el pie de foto/archivo
const textoDe = m => m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.image?.caption || m.document?.caption || m.video?.caption || '';
// Archivo adjunto (foto, documento, audio, video, sticker): se guarda su id; WhatsApp lo conserva unos 30 días
const TIPOS_MEDIA = ['image', 'document', 'audio', 'video', 'sticker'];
function mediaDe(m) {
  const o = TIPOS_MEDIA.includes(m.type) ? m[m.type] : null;
  return o && o.id ? JSON.stringify({ t: m.type, id: String(o.id), m: String(o.mime_type || ''), n: String(o.filename || '').slice(0, 120) }) : '';
}

// Entrega un archivo de WhatsApp al panel (el navegador no puede pedirlo directo: hace falta la clave de WhatsApp).
// Tope de 4 MB: es lo que permite una respuesta de Vercel. Los archivos que no son imagen/audio/video siempre se descargan, nunca se abren en la página.
const MIME_EN_LINEA = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))(;|$)/i;
async function servirMedia(id, nombre, res) {
  const fin = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  if (!/^\d{5,30}$/.test(String(id || ''))) return fin(400, { error: 'Archivo no válido.' });
  if (!process.env.WHATSAPP_TOKEN) return fin(503, { error: 'Faltan las credenciales de WhatsApp en este servidor.' });
  if (!(await require('./mensajes.js').mediaConocida(id))) return fin(404, { error: 'Ese archivo no pertenece a ninguna conversación del panel.' });
  const cab = { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN };
  const info = await fetch('https://graph.facebook.com/v21.0/' + id, { headers: cab, signal: AbortSignal.timeout(8000) });
  if (!info.ok) return fin(404, { error: 'WhatsApp ya no tiene este archivo (los guarda unos 30 días).' });
  const meta = await info.json();
  if (!meta.url) return fin(404, { error: 'WhatsApp no devolvió el archivo.' });
  if (meta.file_size > 4 * 1024 * 1024) return fin(413, { error: 'El archivo es muy grande para verlo aquí (más de 4 MB). Ábrelo desde la app de WhatsApp.' });
  const d = await fetch(meta.url, { headers: cab, signal: AbortSignal.timeout(15000) });
  if (!d.ok) return fin(502, { error: 'No se pudo descargar el archivo.' });
  const datos = Buffer.from(await d.arrayBuffer());
  if (datos.length > 4.4 * 1024 * 1024) return fin(413, { error: 'El archivo es muy grande para verlo aquí.' });
  const mime = /^[a-z]+\/[a-z0-9.+-]+(;.*)?$/i.test(String(meta.mime_type || '')) ? meta.mime_type : 'application/octet-stream';
  const limpio = String(nombre || '').replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 100);
  const enLinea = MIME_EN_LINEA.test(mime);
  res.writeHead(200, {
    'Content-Type': mime, 'Content-Length': datos.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': (enLinea ? 'inline' : 'attachment') + (limpio ? "; filename*=UTF-8''" + encodeURIComponent(limpio) : ''),
  });
  res.end(datos);
}

// Anota en la hoja un mensaje que mandó el agente (para ver la conversación completa). Si falla no afecta al envío.
async function anotarSalida(id, numero, texto, origen = 'agente') {
  try { await require('./mensajes.js').guardarMensajes([{ id, red: 'whatsapp', nombre: '', numero, tipo: 'text', texto, origen, respuesta: 'enviada', direccion: 'salida' }]); }
  catch (err) { console.error('mensajes: no se pudo anotar el envío:', err.message); }
}

// Devuelve true si atendió la ruta.
async function manejarWhatsApp(req, res, url) {
  const fin = (c, t) => { res.writeHead(c, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(t || ''); };

  // Reloj externo (cron-job.org): envía los mensajes diferidos que ya vencieron
  if (url.pathname === '/api/whatsapp-pendientes') {
    const clave = process.env.WHATSAPP_CRON_SECRET || '';
    const recibida = String(req.headers['x-cron-key'] || '');
    const a = Buffer.from(clave), b = Buffer.from(recibida);
    if (!clave || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fin(403, 'No autorizado'), true;
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return fin(500, 'Faltan credenciales de WhatsApp'), true;
    try {
      const r = await require('./pendientes.js').procesar(async (n, tipo, id, anuncio) => {
        const t = textosDe(anuncioPorId(anuncio));   // el texto sale según el anuncio del que llegó la persona
        const cuerpo = tipo === 'seguimiento' ? t.seguimiento : t.mensaje;
        await enviarTexto(n, cuerpo);
        await anotarSalida(id + ':salida', n, cuerpo);   // queda en el historial de la conversación
      });
      return fin(200, JSON.stringify(r)), true;
    } catch (e) { console.error('whatsapp-pendientes:', e.message); return fin(500, 'Error: ' + e.message), true; }
  }
  if (url.pathname !== '/api/whatsapp') return false;

  // Verificación inicial que hace Meta al registrar el webhook
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN &&
      url.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN;
    return fin(ok ? 200 : 403, ok ? url.searchParams.get('hub.challenge') : 'No autorizado'), true;
  }
  if (req.method !== 'POST') return fin(405), true;

  const crudo = await leerCrudo(req);
  if (!firmaValida(crudo, req.headers['x-hub-signature-256'], process.env.WHATSAPP_APP_SECRET)) {
    console.error('whatsapp: firma invalida (cuerpo=' + crudo.length + ' bytes, secreto configurado=' + !!process.env.WHATSAPP_APP_SECRET + ', cabecera=' + !!req.headers['x-hub-signature-256'] + ')');
    return fin(403, 'Firma inválida'), true;
  }

  let datos; try { datos = JSON.parse(crudo.toString('utf8')); } catch { return fin(200), true; }
  const puedeEnviar = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  const registros = [];
  const contestados = new Set();   // un solo mensaje por persona en cada aviso de Meta
  const retraso = (process.env.WHATSAPP_RETRASO_MIN !== undefined && Number(process.env.WHATSAPP_RETRASO_MIN) >= 0 ? Number(process.env.WHATSAPP_RETRASO_MIN) : 5) * 60000;
  const cola = [];
  const salidas = [];   // envíos inmediatos del agente, para el historial
  const escribieron = new Set();   // quienes acaban de escribir: si tenían un seguimiento pendiente, se cancela
  const horas = horasSeguimiento();
  for (const e of datos.entry || []) for (const c of e.changes || []) {
    if (c.field === 'smb_message_echoes') {   // lo que respondes tú desde la app WhatsApp Business (coexistencia): se guarda como salida
      for (const m of c.value?.message_echoes || []) {
        if (!m.to) continue;
        registros.push({ id: m.id || '', red: 'whatsapp', nombre: '', numero: m.to, tipo: m.type || 'text', texto: textoDe(m), media: mediaDe(m), origen: 'manual', respuesta: 'enviada', direccion: 'salida' });
      }
      continue;
    }
    const nombres = {};
    for (const k of c.value?.contacts || []) nombres[k.wa_id] = k.profile?.name || '';
    for (const m of c.value?.messages || []) {
      if (m.from) escribieron.add(m.from);
      const delAnuncio = !!(m.referral && m.from);   // solo contesta a quien llega desde el anuncio
      let respuesta = 'ninguna';
      const anuncio = delAnuncio ? elegirAnuncio(m) : null;
      if (delAnuncio && !contestados.has(m.from)) {
        contestados.add(m.from);
        const idAnuncio = anuncio?.id || '';
        if (!puedeEnviar) respuesta = 'sin credenciales';
        else if (retraso > 0 && process.env.WHATSAPP_CRON_SECRET) { cola.push({ id: m.id, numero: m.from, vence: Date.now() + retraso, tipo: 'primero', anuncio: idAnuncio }); respuesta = 'programada'; }
        else {
          const texto = textosDe(anuncio).mensaje;
          try { await enviarTexto(m.from, texto); respuesta = 'enviada'; salidas.push({ id: m.id + ':salida', numero: m.from, texto }); }
          catch (err) { respuesta = 'error'; console.error('whatsapp:', err.message); }
        }
        // seguimiento: solo si hay reloj externo y credenciales; se cancela si la persona vuelve a escribir
        if (puedeEnviar && process.env.WHATSAPP_CRON_SECRET && horas > 0 && m.id) cola.push({ id: m.id + ':seg', numero: m.from, vence: Date.now() + horas * 3600000, tipo: 'seguimiento', anuncio: idAnuncio });
      }
      registros.push({
        id: m.id || '', red: 'whatsapp', nombre: nombres[m.from] || '', numero: m.from || '', tipo: m.type || '',
        texto: textoDe(m), media: mediaDe(m),
        origen: delAnuncio ? 'anuncio' + (anuncio ? ':' + anuncio.id : '') : 'directo', respuesta
      });
    }
  }
  if (escribieron.size && process.env.WHATSAPP_CRON_SECRET) {
    try { await require('./pendientes.js').cancelarSeguimientos(escribieron); }
    catch (err) { console.error('pendientes: no se pudo revisar respuestas:', err.message); }
  }
  if (cola.length) {
    try { await require('./pendientes.js').agregar(cola); }
    catch (err) {
      console.error('pendientes: no se pudo programar:', err.message);
      for (const r of registros) if (r.respuesta === 'programada') r.respuesta = 'error';
    }
  }
  for (const s of salidas) registros.push({ id: s.id, red: 'whatsapp', nombre: '', numero: s.numero, tipo: 'text', texto: s.texto, origen: 'agente', respuesta: 'enviada', direccion: 'salida' });
  if (registros.length) {
    try { await require('./mensajes.js').guardarMensajes(registros); }
    catch (err) { console.error('mensajes: no se pudo guardar:', err.message); }
  }
  return fin(200, 'ok'), true;
}

module.exports = { manejarWhatsApp, responderDesdePanel, servirMedia };
