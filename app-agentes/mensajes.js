// Registro de mensajes recibidos de Meta en una pestaña "Mensajes" de la hoja de Google.
// Solo se guarda el teléfono enmascarado (los últimos 4 dígitos) y un texto recortado.
const COLUMNAS = ['fecha', 'red', 'nombre', 'telefono', 'tipo', 'texto', 'origen', 'respuesta', 'id', 'direccion', 'contacto', 'media', 'autor'];   // direccion: 'entrada' (vacío = entrada) o 'salida' (lo que manda el agente o tú); contacto: número completo de WhatsApp (solo para poder responder desde el panel; nunca sale del servidor); media: JSON con el archivo adjunto de WhatsApp ({t:tipo, id, m:mime, n:nombre}); autor: nombre de quien escribió el mensaje desde el panel (cuenta de Google)
const crypto = require('crypto');
const db = require('./db.js');
const refDe = n => (n ? crypto.createHash('sha256').update('hacedores:' + n).digest('hex').slice(0, 12) : '');   // identificador corto de la conversación que sí viaja al panel
const PESTANA = 'Mensajes';
// Identificador único de un mensaje: el id de Meta o, si no tiene, un hash de sus datos (así el aviso repetido no se guarda dos veces)
const soloDig = x => String(x || '').replace(/\D/g, '');
const claveDe = r => r.id ? String(r.id) : crypto.createHash('sha1').update([r.fecha, r.red, soloDig(r.contacto || r.numero), r.direccion || 'entrada', r.texto || ''].join('|')).digest('hex');

function ayudas() { return require('./server.js').ayudas; }   // se carga al usarse, evita dependencia circular
const enmascarar = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };
const limpiar = (t, max, saltos) => (saltos ? String(t || '').replace(/\r/g, '') : String(t || '').replace(/[\r\n]+/g, ' ')).slice(0, max);

async function prepararPestana(h, token) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const r = await h.petición('POST', base + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cab);
  if (r.status !== 200 && !/already exists/i.test(r.body)) throw new Error('No se pudo crear la pestaña (' + r.status + ')');
  await h.petición('PUT', base + '/values/' + encodeURIComponent(PESTANA + '!A1:M1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cab);
}

async function guardarMensajes(registros) {
  if (db.usa('mensajes')) return guardarSb(registros);
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
  const filas = registros.map(r => [fecha, r.red, limpiar(r.nombre, 60), r.red === 'whatsapp' ? enmascarar(r.numero) : (r.numero ? 'ID ••' + String(r.numero).slice(-4) : ''), r.tipo, limpiar(r.texto, r.direccion === 'salida' ? 1000 : 300, r.direccion === 'salida'), r.origen, r.respuesta, r.id || '', r.direccion || 'entrada', r.red === 'whatsapp' ? String(r.numero || '').replace(/\D/g, '') : '', r.media || '', limpiar(r.autor, 60)]);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A:M') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  let r = await h.petición('POST', url, JSON.stringify({ values: filas }), cab);
  if (r.status === 400) {   // la pestaña todavía no existe: se crea y se reintenta
    await prepararPestana(h, token);
    r = await h.petición('POST', url, JSON.stringify({ values: filas }), cab);
  }
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  cacheFilas = { t: 0, filas: cacheFilas.filas };   // hay mensajes nuevos: la próxima lectura va a la hoja
  if (!cabeceraAutor) {   // la pestaña ya existía sin la columna "autor": se le pone su título una vez
    cabeceraAutor = true;
    h.petición('PUT', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!M1') + '?valueInputOption=RAW', JSON.stringify({ values: [['autor']] }), cab).catch(() => { cabeceraAutor = false; });
  }
}
let cabeceraAutor = false;

const cacheSb = new Map();   // lecturas del panel en Supabase: 4 s, y si la base falla se sigue con lo último hasta 2 minutos
async function guardarSb(registros) {
  const fecha = new Date().toISOString();
  const filas = registros.map(r => {
    const contacto = r.red === 'whatsapp' ? soloDig(r.numero) : '';
    let media = null;
    if (r.media) { try { media = typeof r.media === 'string' ? JSON.parse(r.media) : r.media; } catch { media = null; } }
    const direccion = r.direccion || 'entrada';
    return {
      clave: claveDe({ id: r.id, fecha, red: r.red, contacto, direccion, texto: r.texto }), fecha, red: r.red || '', nombre: limpiar(r.nombre, 60),
      telefono: r.red === 'whatsapp' ? enmascarar(r.numero) : (r.numero ? 'ID ••' + String(r.numero).slice(-4) : ''), tipo: r.tipo || '',
      texto: limpiar(r.texto, direccion === 'salida' ? 1000 : 300, direccion === 'salida'), origen: r.origen || '', respuesta: r.respuesta || '',
      id: r.id || '', direccion, contacto, ref: contacto ? refDe(contacto) : '', media, autor: limpiar(r.autor, 60),
    };
  });
  if (!filas.length) return;
  await db.insert('mensajes', filas, { ignorarDuplicados: true, conflicto: 'clave' });
  cacheSb.clear();
}
async function objetosSb(limite, red, todos) {
  const k = [limite, red, todos].join('|'), previo = cacheSb.get(k);
  if (previo && Date.now() - previo.t < 4000) return previo.v;
  try {
    const params = { order: 'seq.desc', limit: String(limite) };
    if (red) params.red = 'eq.' + red;
    if (!todos) params.direccion = 'neq.salida';
    const v = (await db.select('mensajes', params)).map(f => ({
      fecha: new Date(f.fecha).toISOString(), red: f.red || '', nombre: f.nombre || '', telefono: f.telefono || '', tipo: f.tipo || '', texto: f.texto || '', origen: f.origen || '',
      respuesta: f.respuesta || '', id: f.id || '', direccion: f.direccion || '', contacto: f.contacto || '', media: f.media ? JSON.stringify(f.media) : '', autor: f.autor || '',
    }));
    cacheSb.set(k, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (previo && Date.now() - previo.t < 120000) return previo.v;
    throw e;
  }
}
const mediaSb = new Set();

// Con el panel abierto se pregunta cada pocos segundos: la hoja se lee una vez y se comparte unos segundos entre todos (Google limita las lecturas por minuto).
// Si Google falla un momento se sigue con lo último leído para que el panel no se vea roto.
let cacheFilas = { t: 0, filas: null };
async function filasMensajes() {
  if (cacheFilas.filas && Date.now() - cacheFilas.t < 4000) return cacheFilas.filas;
  try {
    const h = ayudas();
    const token = await h.tokenGoogle('spreadsheets.readonly');
    const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A2:M5000'), null, { Authorization: 'Bearer ' + token });
    if (r.status === 400) { cacheFilas = { t: Date.now(), filas: [] }; return []; }   // todavía no hay pestaña: aún no llega ningún mensaje
    if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
    cacheFilas = { t: Date.now(), filas: JSON.parse(r.body).values || [] };
    return cacheFilas.filas;
  } catch (e) {
    if (cacheFilas.filas && Date.now() - cacheFilas.t < 120000) return cacheFilas.filas;
    throw e;
  }
}

// Por defecto solo devuelve lo que escriben los clientes; con todos=true también lo que se les envía (conversación completa).
async function leerMensajes(limite = 50, red = '', todos = false) {
  const objs = db.usa('mensajes') ? await objetosSb(limite, red, todos) : null;   // en Supabase ya vienen filtrados, ordenados y limitados
  const filas = objs ? null : await filasMensajes();
  let est = {};
  try { est = await require('./pendientes.js').estados(); } catch { /* sin cola todavía */ }
  return (objs || filas.map(f => Object.fromEntries(COLUMNAS.map((c, i) => [c, f[i] || ''])))
    .filter(x => (!red || x.red === red) && (todos || x.direccion !== 'salida'))
    .reverse().slice(0, limite))
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
  if (db.usa('mensajes')) {
    let numero = '', ultimaEntrada = 0;
    for (const f of await db.select('mensajes', { ref: 'eq.' + ref, red: 'eq.whatsapp', select: 'contacto,fecha,direccion' })) {
      if (!f.contacto) continue;
      numero = f.contacto;
      if ((f.direccion || 'entrada') !== 'salida') ultimaEntrada = Math.max(ultimaEntrada, Date.parse(f.fecha) || 0);
    }
    return numero ? { numero, ultimaEntrada } : null;
  }
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
  if (db.usa('mensajes')) {
    id = String(id);
    if (mediaSb.has(id)) return true;
    const r = await db.select('mensajes', { 'media->>id': 'eq.' + id, select: 'seq', limit: '1' });
    if (r.length) mediaSb.add(id);
    return r.length > 0;
  }
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

module.exports = { guardarMensajes, leerMensajes, buscarContacto, mediaConocida, claveDe, refDe };
