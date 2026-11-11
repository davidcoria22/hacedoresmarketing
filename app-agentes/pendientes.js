// Cola de envíos diferidos de WhatsApp, guardada en la pestaña "Pendientes" de la hoja de Google.
// El webhook anota cada contacto del anuncio con su hora de envío; un reloj externo llama a
// /api/whatsapp-pendientes cada minuto y se mandan los que ya vencieron.
const PESTANA = 'Pendientes';
const COLUMNAS = ['id', 'telefono', 'vence', 'estado', 'detalle', 'creado'];
const ayudas = () => require('./server.js').ayudas;
const mascara = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };

const cabeceras = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const base = h => 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
const rango = (h, a) => base(h) + '/values/' + encodeURIComponent(PESTANA + '!' + a);

async function crearPestana(h, token) {
  const c = await h.petición('POST', base(h) + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cabeceras(token));
  if (c.status !== 200 && !/already exists/i.test(c.body)) throw new Error('No se pudo crear la pestaña (' + c.status + ')');
  await h.petición('PUT', rango(h, 'A1:F1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cabeceras(token));
}

async function leerFilas(h, token) {
  const r = await h.petición('GET', rango(h, 'A2:F3000'), null, cabeceras(token));
  if (r.status === 400) return null;   // aún no existe la pestaña
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return JSON.parse(r.body).values || [];
}

// Anota envíos pendientes. items: [{ id, numero, vence (ms) }]. Ignora los que ya estaban anotados.
async function agregar(items) {
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  let filas = await leerFilas(h, token);
  if (filas === null) { await crearPestana(h, token); filas = []; }
  const existentes = new Set(filas.map(f => f[0]));
  const nuevas = items.filter(i => i.id && !existentes.has(i.id))
    .map(i => [i.id, String(i.numero), new Date(i.vence).toISOString(), 'pendiente', '', new Date().toISOString()]);
  if (!nuevas.length) return 0;
  const r = await h.petición('POST', rango(h, 'A:F') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', JSON.stringify({ values: nuevas }), cabeceras(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return nuevas.length;
}

// Envía los vencidos con la función `enviar(numero)` y deja el resultado en la hoja (borrando el teléfono completo).
async function procesar(enviar, ahora = Date.now(), maximo = 20) {
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  const filas = await leerFilas(h, token);
  if (!filas) return { enviados: 0, errores: 0, pendientes: 0 };
  const guardarFilas = async datos => {
    const r = await h.petición('POST', base(h) + '/values:batchUpdate', JSON.stringify({ valueInputOption: 'RAW', data: datos }), cabeceras(token));
    if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al guardar');
  };
  const rangoFila = i => PESTANA + '!A' + (i + 2) + ':F' + (i + 2);
  // 1) elegir los vencidos y reservarlos ("enviando") ANTES de mandar nada: si algo falla después, no se repite el mensaje
  const vencidos = [];
  let pendientes = 0;
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][3] !== 'pendiente') continue;
    if (Date.parse(filas[i][2]) <= ahora && vencidos.length < maximo) vencidos.push(i); else pendientes++;
  }
  if (!vencidos.length) return { enviados: 0, errores: 0, pendientes };
  await guardarFilas(vencidos.map(i => ({ range: rangoFila(i), values: [[filas[i][0], filas[i][1], filas[i][2], 'enviando', '', filas[i][5] || '']] })));
  // 2) enviar y dejar el resultado (sin el teléfono completo)
  let enviados = 0, errores = 0;
  const resultados = [];
  for (const i of vencidos) {
    let nuevo = 'enviado', detalle = '';
    try { await enviar(filas[i][1]); enviados++; } catch (e) { nuevo = 'error'; detalle = String(e.message).slice(0, 200); errores++; }
    resultados.push({ range: rangoFila(i), values: [[filas[i][0], mascara(filas[i][1]), filas[i][2], nuevo, detalle, filas[i][5] || '']] });
  }
  try { await guardarFilas(resultados); } catch (e) { console.error('pendientes: enviados pero sin guardar el resultado:', e.message); }
  return { enviados, errores, pendientes };
}

// id -> 'pendiente' | 'enviado' | 'error' (para mostrarlo en la tarjeta de mensajes)
async function estados() {
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets.readonly');
  const filas = await leerFilas(h, token);
  return Object.fromEntries((filas || []).map(f => [f[0], f[3]]));
}

module.exports = { agregar, procesar, estados, mascara };
