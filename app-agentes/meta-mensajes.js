// Webhook de Instagram (mensajes directos) y Facebook (Messenger): solo registra los mensajes que llegan.
// No contesta nada. Los guarda en la pestaña "Mensajes" para supervisarlos en el panel.
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
async function perfil(id, red) {
  const token = process.env.FACEBOOK_PAGE_TOKEN;
  if (!token || !id) return '';
  try {
    const campos = red === 'instagram' ? 'name,username' : 'name';
    const r = await fetch('https://graph.facebook.com/v21.0/' + encodeURIComponent(id) + '?fields=' + campos + '&access_token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return '';
    const j = await r.json();
    return j.username ? '@' + j.username : (j.name || '');
  } catch { return ''; }
}

function textoDe(m) {
  if (m.text) return m.text;
  const adj = (m.attachments || [])[0];
  if (adj) return '[' + (adj.type || 'adjunto') + ']';
  return '';
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
      const m = ev.message; if (!m || m.is_echo) continue;   // los "eco" son los mensajes que manda la propia cuenta
      const de = ev.sender?.id || ''; if (!de) continue;
      registros.push({ id: m.mid || '', red, nombre: await perfil(de, red), numero: de, tipo: m.attachments ? 'adjunto' : 'text', texto: textoDe(m), origen: 'directo', respuesta: 'ninguna' });
    }
  }
  if (registros.length) {
    try { await require('./mensajes.js').guardarMensajes(registros); }
    catch (err) { console.error('meta: no se pudo guardar:', err.message); }
  }
  return fin(200, 'ok'), true;
}

module.exports = { manejarMeta };
