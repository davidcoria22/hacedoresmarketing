// Webhook de WhatsApp Cloud API: responde con un mensaje fijo a quien llega desde el anuncio.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MENSAJE = path.join(__dirname, '..', 'agentes', 'whatsapp', 'mensaje.txt');
const MENSAJE_SEGUIMIENTO = path.join(__dirname, '..', 'agentes', 'whatsapp', 'mensaje-seguimiento.txt');
// Horas para el seguimiento si la persona no responde (0 = sin seguimiento). Es menor a 24 porque pasadas 24 h WhatsApp solo permite plantillas aprobadas.
const horasSeguimiento = () => (process.env.WHATSAPP_SEGUIMIENTO_HORAS !== undefined && Number(process.env.WHATSAPP_SEGUIMIENTO_HORAS) >= 0 ? Number(process.env.WHATSAPP_SEGUIMIENTO_HORAS) : 23);

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
      const texto = fs.readFileSync(MENSAJE, 'utf8').trim();
      const seguimiento = fs.readFileSync(MENSAJE_SEGUIMIENTO, 'utf8').trim();
      const r = await require('./pendientes.js').procesar(async (n, tipo, id) => {
        const cuerpo = tipo === 'seguimiento' ? seguimiento : texto;
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
  const texto = fs.readFileSync(MENSAJE, 'utf8').trim();
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
        registros.push({ id: m.id || '', red: 'whatsapp', nombre: '', numero: m.to, tipo: m.type || 'text', texto: m.text?.body || m.button?.text || '', origen: 'manual', respuesta: 'enviada', direccion: 'salida' });
      }
      continue;
    }
    const nombres = {};
    for (const k of c.value?.contacts || []) nombres[k.wa_id] = k.profile?.name || '';
    for (const m of c.value?.messages || []) {
      if (m.from) escribieron.add(m.from);
      const delAnuncio = !!(m.referral && m.from);   // solo contesta a quien llega desde el anuncio
      let respuesta = 'ninguna';
      if (delAnuncio && !contestados.has(m.from)) {
        contestados.add(m.from);
        if (!puedeEnviar) respuesta = 'sin credenciales';
        else if (retraso > 0 && process.env.WHATSAPP_CRON_SECRET) { cola.push({ id: m.id, numero: m.from, vence: Date.now() + retraso, tipo: 'primero' }); respuesta = 'programada'; }
        else {
          try { await enviarTexto(m.from, texto); respuesta = 'enviada'; salidas.push({ id: m.id + ':salida', numero: m.from, texto }); }
          catch (err) { respuesta = 'error'; console.error('whatsapp:', err.message); }
        }
        // seguimiento: solo si hay reloj externo y credenciales; se cancela si la persona vuelve a escribir
        if (puedeEnviar && process.env.WHATSAPP_CRON_SECRET && horas > 0 && m.id) cola.push({ id: m.id + ':seg', numero: m.from, vence: Date.now() + horas * 3600000, tipo: 'seguimiento' });
      }
      registros.push({
        id: m.id || '', red: 'whatsapp', nombre: nombres[m.from] || '', numero: m.from || '', tipo: m.type || '',
        texto: m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '',
        origen: delAnuncio ? 'anuncio' : 'directo', respuesta
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

module.exports = { manejarWhatsApp, responderDesdePanel };
