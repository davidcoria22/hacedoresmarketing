// Registro de mensajes recibidos de Meta en una pestaña "Mensajes" de la hoja de Google.
// Solo se guarda el teléfono enmascarado (los últimos 4 dígitos) y un texto recortado.
const COLUMNAS = ['fecha', 'red', 'nombre', 'telefono', 'tipo', 'texto', 'origen', 'respuesta', 'id', 'direccion', 'contacto', 'media'];   // direccion: 'entrada' (vacío = entrada) o 'salida' (lo que manda el agente o tú); contacto: número completo de WhatsApp (solo para poder responder desde el panel; nunca sale del servidor); media: JSON con el archivo adjunto de WhatsApp ({t:tipo, id, m:mime, n:nombre})
const crypto = require('crypto');
const refDe = n => (n ? crypto.createHash('sha256').update('hacedores:' + n).digest('hex').slice(0, 12) : '');   // identificador corto de la conversación que sí viaja al panel
const PESTANA = 'Mensajes';

function ayudas() { return require('./server.js').ayudas; }   // se carga al usarse, evita dependencia circular
const enmascarar = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };
const limpiar = (t, max, saltos) => (saltos ? String(t || '').replace(/\r/g, '') : String(t || '').replace(/[\r\n]+/g, ' ')).slice(0, max);

async function prepararPestana(h, token) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const r = await h.petición('POST', base + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cab);
  if (r.status !== 200 && !/already exists/i.test(r.body)) throw new Error('No se pudo crear la pestaña (' + r.status + ')');
  await h.petición('PUT', base + '/values/' + encodeURIComponent(PESTANA + '!A1:L1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cab);
}

async function guardarMensajes(registros) {
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets');
  const fecha = new Date().toISOString();
  // Meta reenvía el mismo aviso si tarda en recibir respuesta: no se vuelve a anotar un mensaje que ya está
  try {
    const previo = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!I2:I5000'), null, { Authorization: 'Bearer ' + token });
    if (previo.status === 200) {
      const vistos = new Set((JSON.parse(previo.body).values || []).map(f => f[0]));
      registros = registros.filter(r => !r.id || !vistos.has(r.id));
    }
  } catch { /* si no se puede revisar, se anota igual */ }
  if (!registros.length) return;
  const filas = registros.map(r => [fecha, r.red, limpiar(r.nombre, 60), r.red === 'whatsapp' ? enmascarar(r.numero) : (r.numero ? 'ID ••' + String(r.numero).slice(-4) : ''), r.tipo, limpiar(r.texto, r.direccion === 'salida' ? 1000 : 300, r.direccion === 'salida'), r.origen, r.respuesta, r.id || '', r.direccion || 'entrada', r.red === 'whatsapp' ? String(r.numero || '').replace(/\D/g, '') : '', r.media || '']);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A:L') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  let r = await h.petición('POST', url, JSON.stringify({ values: filas }), cab);
  if (r.status === 400) {   // la pestaña todavía no existe: se crea y se reintenta
    await prepararPestana(h, token);
    r = await h.petición('POST', url, JSON.stringify({ values: filas }), cab);
  }
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
}

// Por defecto solo devuelve lo que escriben los clientes; con todos=true también lo que se les envía (conversación completa).
async function leerMensajes(limite = 50, red = '', todos = false) {
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets.readonly');
  const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A2:L5000'), null, { Authorization: 'Bearer ' + token });
  if (r.status === 400) return [];   // todavía no hay pestaña: aún no llega ningún mensaje
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  const filas = JSON.parse(r.body).values || [];
  let est = {};
  try { est = await require('./pendientes.js').estados(); } catch { /* sin cola todavía */ }
  return filas.map(f => Object.fromEntries(COLUMNAS.map((c, i) => [c, f[i] || ''])))
    .filter(x => (!red || x.red === red) && (todos || x.direccion !== 'salida'))
    .reverse().slice(0, limite)
    .map(({ id, contacto, media, ...x }) => {   // el id y el número completo no salen al panel; el id solo cruza con la cola y el número se cambia por una referencia
      if (x.respuesta === 'programada' && est[id]) x.respuesta = est[id] === 'enviado' ? 'enviada' : est[id] === 'error' ? 'error' : 'programada';
      x.ref = refDe(contacto);
      try { x.adjunto = media ? JSON.parse(media) : null; } catch { x.adjunto = null; }   // archivo adjunto: el panel lo pide por /api/whatsapp-media
      return x;
    });
}

// Para responder desde el panel: número completo y fecha del último mensaje del cliente en esa conversación de WhatsApp.
async function buscarContacto(ref) {
  if (!/^[0-9a-f]{12}$/.test(String(ref || ''))) return null;
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets.readonly');
  const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A2:K5000'), null, { Authorization: 'Bearer ' + token });
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  let numero = '', ultimaEntrada = 0;
  for (const f of JSON.parse(r.body).values || []) {
    const contacto = f[10] || '';
    if (!contacto || f[1] !== 'whatsapp' || refDe(contacto) !== ref) continue;
    numero = contacto;
    if ((f[9] || 'entrada') !== 'salida') ultimaEntrada = Math.max(ultimaEntrada, Date.parse(f[0]) || 0);
  }
  return numero ? { numero, ultimaEntrada } : null;
}

// ¿Este archivo de WhatsApp está en la hoja? Así /api/whatsapp-media solo sirve archivos de conversaciones del panel (guarda la lista 60 s en memoria)
let cacheMedia = { t: 0, ids: new Set() };
async function mediaConocida(id) {
  if (Date.now() - cacheMedia.t > 60000 || !cacheMedia.ids.has(id)) {
    const h = ayudas();
    const token = await h.tokenGoogle('spreadsheets.readonly');
    const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!L2:L5000'), null, { Authorization: 'Bearer ' + token });
    if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
    const ids = new Set();
    for (const f of JSON.parse(r.body).values || []) { try { const m = JSON.parse(f[0]); if (m && m.id) ids.add(String(m.id)); } catch { /* fila sin archivo */ } }
    cacheMedia = { t: Date.now(), ids };
  }
  return cacheMedia.ids.has(String(id));
}

module.exports = { guardarMensajes, leerMensajes, buscarContacto, mediaConocida };
