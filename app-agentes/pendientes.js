// Cola de envíos diferidos de WhatsApp, guardada en la pestaña "Pendientes" de la hoja de Google.
// Hay dos tipos: "primero" (el mensaje del curso, unos minutos después) y "seguimiento" (si no hubo respuesta, horas después).
// El webhook anota cada envío con su hora; un reloj externo llama a /api/whatsapp-pendientes cada minuto
// y se mandan los que ya vencieron. Si la persona escribe de nuevo, su seguimiento se cancela.
const PESTANA = 'Pendientes';
const COLUMNAS = ['id', 'telefono', 'vence', 'estado', 'detalle', 'creado', 'tipo', 'anuncio'];
const ayudas = () => require('./server.js').ayudas;
const db = require('./db.js');
const sb = () => db.usa('pendientes');
const lista_ = ids => 'in.(' + ids.join(',') + ')';
const mascara = n => { n = String(n || '').replace(/\D/g, ''); return n ? '+' + n.slice(0, 2) + '••••' + n.slice(-4) : ''; };
const soloDigitos = n => String(n || '').replace(/\D/g, '');

const cabeceras = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const base = h => 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
const rango = (h, a) => base(h) + '/values/' + encodeURIComponent(PESTANA + '!' + a);

async function crearPestana(h, token) {
  const c = await h.petición('POST', base(h) + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cabeceras(token));
  if (c.status !== 200 && !/already exists/i.test(c.body)) throw new Error('No se pudo crear la pestaña (' + c.status + ')');
  await h.petición('PUT', rango(h, 'A1:H1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cabeceras(token));
}

async function leerFilas(h, token) {
  const r = await h.petición('GET', rango(h, 'A2:H3000'), null, cabeceras(token));
  if (r.status === 400) return null;   // aún no existe la pestaña
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return JSON.parse(r.body).values || [];
}
let cacheCola = { t: 0, filas: null };   // solo para mostrar en el panel; enviar y cancelar siempre leen la hoja al momento
async function filasCola(h, token) {
  if (cacheCola.filas && Date.now() - cacheCola.t < 4000) return cacheCola.filas;
  const f = await leerFilas(h, token);
  cacheCola = { t: Date.now(), filas: f };
  return f;
}
const tipoDe = f => f[6] || 'primero';   // las filas anteriores a los seguimientos no tienen tipo

async function guardarFilas(h, token, datos) {
  cacheCola.t = 0;
  const r = await h.petición('POST', base(h) + '/values:batchUpdate', JSON.stringify({ valueInputOption: 'RAW', data: datos }), cabeceras(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al guardar');
}
const rangoFila = i => PESTANA + '!A' + (i + 2) + ':H' + (i + 2);

// Anota envíos pendientes. items: [{ id, numero, vence (ms), tipo }]. Ignora los que ya estaban anotados.
async function agregar(items) {
  if (sb()) {
    const vistos = new Set();
    const nuevas = items.filter(i => i.id && !vistos.has(i.id) && vistos.add(i.id))
      .map(i => ({ id: i.id, telefono: String(i.numero), vence: new Date(i.vence).toISOString(), estado: 'pendiente', creado: new Date().toISOString(), tipo: i.tipo || 'primero', anuncio: i.anuncio || '' }));
    if (!nuevas.length) return 0;
    const hechas = await db.insert('pendientes', nuevas, { ignorarDuplicados: true, conflicto: 'id' });
    return hechas.length;
  }
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  let filas = await leerFilas(h, token);
  if (filas === null) { await crearPestana(h, token); filas = []; }
  const existentes = new Set(filas.map(f => f[0]));
  const nuevas = items.filter(i => i.id && !existentes.has(i.id))
    .map(i => [i.id, String(i.numero), new Date(i.vence).toISOString(), 'pendiente', '', new Date().toISOString(), i.tipo || 'primero', i.anuncio || '']);
  if (!nuevas.length) return 0;
  const r = await h.petición('POST', rango(h, 'A:H') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', JSON.stringify({ values: nuevas }), cabeceras(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  cacheCola.t = 0;
  return nuevas.length;
}

// Cancela los seguimientos pendientes de las personas que acaban de escribir (ya respondieron).
async function cancelarSeguimientos(numeros) {
  const lista = new Set([...numeros].map(soloDigitos).filter(Boolean));
  if (!lista.size) return 0;
  if (sb()) {
    const filas = await db.select('pendientes', { tipo: 'eq.seguimiento', estado: 'eq.pendiente', telefono: lista_([...lista]) });
    let n = 0;
    for (const f of filas) {   // una por una para dejar el teléfono enmascarado en cada fila
      const hechas = await db.update('pendientes', { id: 'eq.' + f.id, estado: 'eq.pendiente' }, { estado: 'cancelado', detalle: 'la persona respondió', telefono: mascara(f.telefono) });
      n += hechas.length;
    }
    return n;
  }
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  const filas = await leerFilas(h, token);
  if (!filas) return 0;
  const cambios = [];
  filas.forEach((f, i) => {
    if (tipoDe(f) === 'seguimiento' && f[3] === 'pendiente' && lista.has(soloDigitos(f[1]))) {
      cambios.push({ range: rangoFila(i), values: [[f[0], mascara(f[1]), f[2], 'cancelado', 'la persona respondió', f[5] || '', 'seguimiento', f[7] || '']] });
    }
  });
  if (cambios.length) await guardarFilas(h, token, cambios);
  return cambios.length;
}

// Envía los vencidos con `enviar(numero, tipo, id, anuncio)` y deja el resultado en la hoja (borrando el teléfono completo).
async function procesar(enviar, ahora = Date.now(), maximo = 20) {
  if (sb()) return procesarSb(enviar, ahora, maximo);
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
  await guardarFilas(h, token, vencidos.map(i => ({ range: rangoFila(i), values: [[filas[i][0], filas[i][1], filas[i][2], 'enviando', '', filas[i][5] || '', tipoDe(filas[i]), filas[i][7] || '']] })));
  // 2) enviar y dejar el resultado (sin el teléfono completo)
  let enviados = 0, errores = 0;
  const resultados = [];
  for (const i of vencidos) {
    let nuevo = 'enviado', detalle = '';
    try { await enviar(filas[i][1], tipoDe(filas[i]), filas[i][0], filas[i][7] || ''); enviados++; } catch (e) { nuevo = 'error'; detalle = String(e.message).slice(0, 200); errores++; }
    resultados.push({ range: rangoFila(i), values: [[filas[i][0], mascara(filas[i][1]), filas[i][2], nuevo, detalle, filas[i][5] || '', tipoDe(filas[i]), filas[i][7] || '']] });
  }
  try { await guardarFilas(h, token, resultados); } catch (e) { console.error('pendientes: enviados pero sin guardar el resultado:', e.message); }
  return { enviados, errores, pendientes };
}

// Supabase: se eligen los vencidos y se reservan con UN solo cambio atómico (solo pasa de 'pendiente' a 'enviando' una vez):
// si otra ejecución ya los tomó, aquí vuelven vacíos y no se envía nada.
async function procesarSb(enviar, ahora, maximo) {
  const todas = await db.select('pendientes', { estado: 'eq.pendiente', order: 'vence.asc', select: 'id,vence' });
  const vencidas = todas.filter(f => Date.parse(f.vence) <= ahora).slice(0, maximo);
  const pendientes = todas.length - vencidas.length;
  if (!vencidas.length) return { enviados: 0, errores: 0, pendientes };
  const tomadas = await db.update('pendientes', { id: lista_(vencidas.map(f => f.id)), estado: 'eq.pendiente' }, { estado: 'enviando', detalle: '' });
  let enviados = 0, errores = 0;
  for (const f of tomadas) {
    let estado = 'enviado', detalle = '';
    try { await enviar(f.telefono, f.tipo || 'primero', f.id, f.anuncio || ''); enviados++; } catch (e) { estado = 'error'; detalle = String(e.message).slice(0, 200); errores++; }
    try { await db.update('pendientes', { id: 'eq.' + f.id }, { estado, detalle, telefono: mascara(f.telefono) }); } catch (e) { console.error('pendientes: enviado pero sin guardar el resultado:', e.message); }
  }
  return { enviados, errores, pendientes };
}

// Para el panel: cuántos envíos esperan y a qué hora vence el próximo mensaje del curso.
async function resumen() {
  if (sb()) {
    const pend = await db.select('pendientes', { estado: 'eq.pendiente', select: 'tipo,vence' });
    const vencen = pend.filter(f => (f.tipo || 'primero') === 'primero').map(f => Date.parse(f.vence)).filter(n => !isNaN(n));
    return { pendientes: pend.length, proximo: vencen.length ? new Date(Math.min(...vencen)).toISOString() : '' };
  }
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets.readonly');
  const filas = (await filasCola(h, token)) || [];
  const pend = filas.filter(f => f[3] === 'pendiente');
  const vencen = pend.filter(f => tipoDe(f) === 'primero').map(f => Date.parse(f[2])).filter(n => !isNaN(n));
  return { pendientes: pend.length, proximo: vencen.length ? new Date(Math.min(...vencen)).toISOString() : '' };
}

// id -> 'pendiente' | 'enviado' | 'error' (para mostrarlo en la tarjeta de mensajes; solo el mensaje principal)
async function estados() {
  if (sb()) return Object.fromEntries((await db.select('pendientes', { tipo: 'eq.primero', select: 'id,estado' })).map(f => [f.id, f.estado]));
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets.readonly');
  const filas = await filasCola(h, token);
  return Object.fromEntries((filas || []).filter(f => tipoDe(f) === 'primero').map(f => [f[0], f[3]]));
}

module.exports = { agregar, cancelarSeguimientos, procesar, estados, resumen, mascara };
