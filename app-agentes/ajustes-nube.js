// Ajustes de los agentes guardados en la pestaña "Ajustes" de la hoja de Google.
// En línea (Vercel) el disco es de solo lectura, así que ahí los cambios viven en la hoja.
const PESTANA = 'Ajustes';
const ayudas = () => require('./server.js').ayudas;

async function leerTodos() {
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets.readonly');
  const r = await h.petición('GET', 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID + '/values/' + encodeURIComponent(PESTANA + '!A2:B200'), null, { Authorization: 'Bearer ' + token });
  if (r.status === 400) return {};   // todavía no existe la pestaña
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  const todos = {};
  for (const [id, json] of JSON.parse(r.body).values || []) { try { todos[id] = JSON.parse(json); } catch { /* fila dañada */ } }
  return todos;
}

async function guardar(id, valores) {
  const h = ayudas();
  const token = await h.tokenGoogle('spreadsheets');
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const rango = a => base + '/values/' + encodeURIComponent(PESTANA + '!' + a);
  let r = await h.petición('GET', rango('A2:A200'), null, cab);
  if (r.status === 400) {   // la pestaña todavía no existe: se crea con su encabezado
    const c = await h.petición('POST', base + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cab);
    if (c.status !== 200 && !/already exists/i.test(c.body)) throw new Error('No se pudo crear la pestaña (' + c.status + ')');
    await h.petición('PUT', rango('A1:C1') + '?valueInputOption=RAW', JSON.stringify({ values: [['agente', 'ajustes', 'actualizado']] }), cab);
    r = { status: 200, body: '{}' };
  }
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  const ids = (JSON.parse(r.body).values || []).map(f => f[0]);
  const fila = [id, JSON.stringify(valores), new Date().toISOString()];
  const i = ids.indexOf(id);
  const w = i >= 0
    ? await h.petición('PUT', rango('A' + (i + 2) + ':C' + (i + 2)) + '?valueInputOption=RAW', JSON.stringify({ values: [fila] }), cab)
    : await h.petición('POST', rango('A:C') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', JSON.stringify({ values: [fila] }), cab);
  if (w.status !== 200) throw new Error('Google Sheets respondió ' + w.status);
}

module.exports = { leerTodos, guardar };
