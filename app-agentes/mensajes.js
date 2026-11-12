// Registro de mensajes recibidos de Meta en una pestaña "Mensajes" de la hoja de Google.
// Solo se guarda el teléfono enmascarado (los últimos 4 dígitos) y un texto recortado.
const COLUMNAS = ['fecha', 'red', 'nombre', 'telefono', 'tipo', 'texto', 'origen', 'respuesta', 'id'];
const PESTANA = 'Mensajes';

function ayudas() { return require('./server.js').ayudas; }   // se carga al usarse, evita dependencia circular
const enmascarar = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };
const limpiar = (t, max) => String(t || '').replace(/[\r\n]+/g, ' ').slice(0, max);

async function prepararPestana(h, token) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const r = await h.petición('POST', base + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cab);
  if (r.status !== 200 && !/already exists/i.test(r.body)) throw new Error('No se pudo crear la pestaña (' + r.status + ')');
  await h.petición('PUT', base + '/values/' + encodeURIComponent(PESTANA + '!A1:I1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cab);
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
  const filas = registros.map(r => [fecha, r.red, limpiar(r.nombre, 60), r.red === 'whatsapp' ? enmascarar(r.numero) : (r.numero ? 'ID ••' + String(r.numero).slice(-4) : ''), r.tipo, limpiar(r.texto, 300), r.origen, r.respuesta, r.id || '']);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A:I') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  let r = await h.petición('POST', url, JSON.stringify({ values: filas }), cab);
  if (r.status === 400) {   // la pestaña todavía no existe: se crea y se reintenta
    await prepararPestana(h, token);
    r = await h.petición('POST', url, JSON.stringify({ values: filas }), cab);
  }
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
}

async function leerMensajes(limite = 50, red = '') {
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets.readonly');
  const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A2:I5000'), null, { Authorization: 'Bearer ' + token });
  if (r.status === 400) return [];   // todavía no hay pestaña: aún no llega ningún mensaje
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  const filas = JSON.parse(r.body).values || [];
  let est = {};
  try { est = await require('./pendientes.js').estados(); } catch { /* sin cola todavía */ }
  return filas.map(f => Object.fromEntries(COLUMNAS.map((c, i) => [c, f[i] || ''])))
    .filter(x => !red || x.red === red)
    .reverse().slice(0, limite)
    .map(({ id, ...x }) => {   // el id no sale al panel; solo sirve para cruzar con la cola
      if (x.respuesta === 'programada' && est[id]) x.respuesta = est[id] === 'enviado' ? 'enviada' : est[id] === 'error' ? 'error' : 'programada';
      return x;
    });
}

module.exports = { guardarMensajes, leerMensajes };
