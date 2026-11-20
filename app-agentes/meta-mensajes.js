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

function textoDe(m) {
  if (m.text) return m.text;
  const adj = (m.attachments || [])[0];
  if (adj) return '[' + (adj.type || 'adjunto') + ']';
  return '';
}

// Respuesta escrita por una persona desde el panel, por Instagram o Messenger. Solo texto, y dentro de las 24 h del último mensaje de la persona.
// Devuelve { ok } o { error, codigo }.
async function responderDesdePanel(red, ref, texto, autor = '') {
  if (red !== 'instagram' && red !== 'facebook') return { codigo: 400, error: 'Red no válida.' };
  texto = String(texto || '').trim();
  if (!texto) return { codigo: 400, error: 'Escribe un mensaje.' };
  if (texto.length > 1000) return { codigo: 400, error: 'El mensaje es muy largo (máximo 1000 caracteres).' };
  const token = tokenPagina();
  const nombre = red === 'instagram' ? 'Instagram' : 'Facebook';
  if (!token) return { codigo: 503, error: 'Falta la clave de ' + nombre + ' (META_PAGE_TOKEN) en este servidor.' };
  const c = await require('./mensajes.js').buscarContacto(ref, red);
  if (!c) return { codigo: 404, error: 'No tengo el dato para contestar esta conversación (es anterior a esta función). Responde desde la app de ' + nombre + '.' };
  if (Date.now() - c.ultimaEntrada > 24 * 3600000) return { codigo: 409, error: 'Pasaron más de 24 horas desde su último mensaje. ' + nombre + ' ya no permite contestarle desde aquí.' };
  let id = '';
  try {
    const r = await fetch('https://graph.facebook.com/v21.0/me/messages?access_token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: c.numero }, messaging_type: 'RESPONSE', message: { text: texto } }), signal: AbortSignal.timeout(15000),
    });
    const cuerpo = await r.text();
    if (!r.ok) {
      let motivo = cuerpo.slice(0, 160); try { motivo = JSON.parse(cuerpo).error?.message || motivo; } catch { /* texto plano */ }
      console.error('meta responder (' + red + '):', r.status, cuerpo.slice(0, 200));
      return { codigo: 502, error: nombre + ' no aceptó el mensaje: ' + String(motivo).slice(0, 160) };
    }
    try { id = JSON.parse(cuerpo).message_id || ''; } catch { /* sin id */ }
  } catch (e) { console.error('meta responder:', e.message); return { codigo: 502, error: 'No se pudo enviar por ' + nombre + ': ' + String(e.message).slice(0, 120) }; }
  try { await require('./mensajes.js').guardarMensajes([{ id: id || 'panel:' + Date.now(), red, nombre: '', numero: c.numero, tipo: 'text', texto, origen: 'manual', respuesta: 'enviada', direccion: 'salida', autor }]); }
  catch (err) { console.error('mensajes: no se pudo anotar el envío:', err.message); }
  return { ok: true };
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
        registros.push({ id: m.mid, red, nombre: '', numero: para, tipo: m.attachments ? 'adjunto' : 'text', texto: textoDe(m), origen: 'manual', respuesta: 'enviada', direccion: 'salida' });
        continue;
      }
      const de = ev.sender?.id || ''; if (!de) continue;
      registros.push({ id: m.mid || '', red, nombre: await perfil(de, red, m.mid), numero: de, tipo: m.attachments ? 'adjunto' : 'text', texto: textoDe(m), origen: 'directo', respuesta: 'ninguna' });
    }
  }
  if (registros.length) {
    try { await require('./mensajes.js').guardarMensajes(registros); }
    catch (err) { console.error('meta: no se pudo guardar:', err.message); }
  }
  return fin(200, 'ok'), true;
}

module.exports = { manejarMeta, responderDesdePanel };
