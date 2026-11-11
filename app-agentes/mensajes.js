// Registro de mensajes recibidos de Meta en una pestaña "Mensajes" de la hoja de Google.
// Solo se guarda el teléfono enmascarado (los últimos 4 dígitos) y un texto recortado.
const COLUMNAS = ['fecha', 'red', 'nombre', 'telefono', 'tipo', 'texto', 'origen', 'respuesta'];
const PESTANA = 'Mensajes';

function ayudas() { return require('./server.js').ayudas; }   // se carga al usarse, evita dependencia circular
const enmascarar = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };
const limpiar = (t, max) => String(t || '').replace(/[\r\n]+/g, ' ').slice(0, max);

async function prepararPestana(h, token) {
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const r = await h.petición('POST', base + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cab);
  if (r.status !== 200 && !/already exists/i.test(r.body)) throw new Error('No se pudo crear la pestaña (' + r.status + ')');
  await h.petición('PUT', base + '/values/' + encodeURIComponent(PESTANA + '!A1:H1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cab);
}

async function guardarMensajes(registros) {
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets');
  const fecha = new Date().toISOString();
  const filas = registros.map(r => [fecha, r.red, limpiar(r.nombre, 60), enmascarar(r.numero), r.tipo, limpiar(r.texto, 300), r.origen, r.respuesta]);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A:H') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
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
  const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A2:H5000'), null, { Authorization: 'Bearer ' + token });
  if (r.status === 400) return [];   // todavía no hay pestaña: aún no llega ningún mensaje
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  const filas = JSON.parse(r.body).values || [];
  return filas.map(f => Object.fromEntries(COLUMNAS.map((c, i) => [c, f[i] || ''])))
    .filter(m => !red || m.red === red)
    .reverse().slice(0, limite);
}

module.exports = { guardarMensajes, leerMensajes };
