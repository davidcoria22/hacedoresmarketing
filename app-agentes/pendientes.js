// Cola de envíos diferidos de WhatsApp, guardada en la pestaña "Pendientes" de la hoja de Google.
// Hay dos tipos: "primero" (el mensaje del curso, unos minutos después) y "seguimiento" (si no hubo respuesta, horas después).
// El webhook anota cada envío con su hora; un reloj externo llama a /api/whatsapp-pendientes cada minuto
// y se mandan los que ya vencieron. Si la persona escribe de nuevo, su seguimiento se cancela.
const PESTANA = 'Pendientes';
const COLUMNAS = ['id', 'telefono', 'vence', 'estado', 'detalle', 'creado', 'tipo'];
const ayudas = () => require('./server.js').ayudas;
const mascara = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };
const soloDigitos = n => String(n || '').replace(/\D/g, '');

const cabeceras = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const base = h => 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
const rango = (h, a) => base(h) + '/values/' + encodeURIComponent(PESTANA + '!' + a);

async function crearPestana(h, token) {
  const c = await h.petición('POST', base(h) + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cabeceras(token));
  if (c.status !== 200 && !/already exists/i.test(c.body)) throw new Error('No se pudo crear la pestaña (' + c.status + ')');
  await h.petición('PUT', rango(h, 'A1:G1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cabeceras(token));
}

async function leerFilas(h, token) {
  const r = await h.petición('GET', rango(h, 'A2:G3000'), null, cabeceras(token));
  if (r.status === 400) return null;   // aún no existe la pestaña
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return JSON.parse(r.body).values || [];
}
const tipoDe = f => f[6] || 'primero';   // las filas anteriores a los seguimientos no tienen tipo

async function guardarFilas(h, token, datos) {
  const r = await h.petición('POST', base(h) + '/values:batchUpdate', JSON.stringify({ valueInputOption: 'RAW', data: datos }), cabeceras(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al guardar');
}
const rangoFila = i => PESTANA + '!A' + (i + 2) + ':G' + (i + 2);

// Anota envíos pendientes. items: [{ id, numero, vence (ms), tipo }]. Ignora los que ya estaban anotados.
async function agregar(items) {
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  let filas = await leerFilas(h, token);
  if (filas === null) { await crearPestana(h, token); filas = []; }
  const existentes = new Set(filas.map(f => f[0]));
  const nuevas = items.filter(i => i.id && !existentes.has(i.id))
    .map(i => [i.id, String(i.numero), new Date(i.vence).toISOString(), 'pendiente', '', new Date().toISOString(), i.tipo || 'primero']);
  if (!nuevas.length) return 0;
  const r = await h.petición('POST', rango(h, 'A:G') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', JSON.stringify({ values: nuevas }), cabeceras(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return nuevas.length;
}

// Cancela los seguimientos pendientes de las personas que acaban de escribir (ya respondieron).
async function cancelarSeguimientos(numeros) {
  const lista = new Set([...numeros].map(soloDigitos).filter(Boolean));
  if (!lista.size) return 0;
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  const filas = await leerFilas(h, token);
  if (!filas) return 0;
  const cambios = [];
  filas.forEach((f, i) => {
    if (tipoDe(f) === 'seguimiento' && f[3] === 'pendiente' && lista.has(soloDigitos(f[1]))) {
      cambios.push({ range: rangoFila(i), values: [[f[0], mascara(f[1]), f[2], 'cancelado', 'la persona respondió', f[5] || '', 'seguimiento']] });
    }
  });
  if (cambios.length) await guardarFilas(h, token, cambios);
  return cambios.length;
}

// Envía los vencidos con `enviar(numero, tipo, id)` y deja el resultado en la hoja (borrando el teléfono completo).
async function procesar(enviar, ahora = Date.now(), maximo = 20) {
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  const filas = await leerFilas(h, token);
  if (!filas) return { enviados: 0, errores: 0, pendientes: 0 };
  // 1) elegir los vencidos y reservarlos ("enviando") ANTES de mandar nada: si algo falla después, no se repite el mensaje
  const vencidos = [];
  let pendientes = 0;
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][3] !== 'pendiente') continue;
    if (Date.parse(filas[i][2]) <= ahora && vencidos.length < maximo) vencidos.push(i); else pendientes++;
  }
  if (!vencidos.length) return { enviados: 0, errores: 0, pendientes };
  await guardarFilas(h, token, vencidos.map(i => ({ range: rangoFila(i), values: [[filas[i][0], filas[i][1], filas[i][2], 'enviando', '', filas[i][5] || '', tipoDe(filas[i])]] })));
  // 2) enviar y dejar el resultado (sin el teléfono completo)
  let enviados = 0, errores = 0;
  const resultados = [];
  for (const i of vencidos) {
    let nuevo = 'enviado', detalle = '';
    try { await enviar(filas[i][1], tipoDe(filas[i]), filas[i][0]); enviados++; } catch (e) { nuevo = 'error'; detalle = String(e.message).slice(0, 200); errores++; }
    resultados.push({ range: rangoFila(i), values: [[filas[i][0], mascara(filas[i][1]), filas[i][2], nuevo, detalle, filas[i][5] || '', tipoDe(filas[i])]] });
  }
  try { await guardarFilas(h, token, resultados); } catch (e) { console.error('pendientes: enviados pero sin guardar el resultado:', e.message); }
  return { enviados, errores, pendientes };
}

// id -> 'pendiente' | 'enviado' | 'error' (para mostrarlo en la tarjeta de mensajes; solo el mensaje principal)
async function estados() {
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets.readonly');
  const filas = await leerFilas(h, token);
  return Object.fromEntries((filas || []).filter(f => tipoDe(f) === 'primero').map(f => [f[0], f[3]]));
}

module.exports = { agregar, cancelarSeguimientos, procesar, estados, mascara };
