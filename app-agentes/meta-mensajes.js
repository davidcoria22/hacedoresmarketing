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
async function pedir(ruta, token) {
  const r = await fetch('https://graph.facebook.com/v21.0/' + ruta + (ruta.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(3000) });
  const t = await r.text();
  if (!r.ok) return { ok: false, motivo: 'estado ' + r.status + ': ' + t.slice(0, 140) };
  try { return { ok: true, j: JSON.parse(t) }; } catch { return { ok: false, motivo: 'respuesta no válida' }; }
}
async function perfil(id, red, mid) {
  // META_PAGE_TOKEN: token de página de la app de mensajes. Se limpian espacios, saltos de línea y comillas que se cuelan al pegarlo.
  const token = String(process.env.META_PAGE_TOKEN || process.env.FACEBOOK_PAGE_TOKEN || '').replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
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

module.exports = { manejarMeta };
