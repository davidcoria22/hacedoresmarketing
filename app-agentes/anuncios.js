// Mensajes automáticos de WhatsApp por anuncio, editables desde el panel.
// Los textos originales viven en agentes/whatsapp/*.txt y anuncios.json (respaldo). Lo que se edita en el panel se guarda
// en la pestaña "Anuncios" de la hoja de Google y tiene prioridad. Si la hoja falla, se usan los archivos.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'agentes', 'whatsapp');
const PESTANA = 'Anuncios';
const COLUMNAS = ['id', 'nombre', 'palabras', 'mensaje', 'seguimiento', 'actualizado'];
const ayudas = () => require('./server.js').ayudas;
const db = require('./db.js');
const cabeceras = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const base = h => 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
const rango = (h, a) => base(h) + '/values/' + encodeURIComponent(PESTANA + '!' + a);

const leerArchivo = nombre => { try { return fs.readFileSync(path.join(DIR, path.basename(nombre)), 'utf8').trim(); } catch { return ''; } };
const NOMBRES = { general: 'Curso de Impresión 3D (anuncio general)', inventors: 'Curso Inventors Lab' };

// Lo que traen los archivos del proyecto: el anuncio general (sin palabras) y los que listaba anuncios.json
function deArchivos() {
  let extra = []; try { extra = JSON.parse(fs.readFileSync(path.join(DIR, 'anuncios.json'), 'utf8')); } catch { /* sin archivo */ }
  return [
    { id: 'general', nombre: NOMBRES.general, palabras: [], mensaje: leerArchivo('mensaje.txt'), seguimiento: leerArchivo('mensaje-seguimiento.txt'), original: true },
    ...extra.map(a => ({ id: String(a.id), nombre: NOMBRES[a.id] || String(a.id), palabras: (a.palabras || []).map(String), mensaje: leerArchivo(a.mensaje || ''), seguimiento: leerArchivo(a.seguimiento || ''), original: true })),
  ];
}

async function crearPestana(h, token) {
  const c = await h.petición('POST', base(h) + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: PESTANA } } }] }), cabeceras(token));
  if (c.status !== 200 && !/already exists/i.test(c.body)) throw new Error('No se pudo crear la pestaña (' + c.status + ')');
  await h.petición('PUT', rango(h, 'A1:F1') + '?valueInputOption=RAW', JSON.stringify({ values: [COLUMNAS] }), cabeceras(token));
}
async function leerFilas(h, token) {
  const r = await h.petición('GET', rango(h, 'A2:F300'), null, cabeceras(token));
  if (r.status === 400) return null;   // aún no existe la pestaña
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return JSON.parse(r.body).values || [];
}

// Los anuncios originales (de los archivos del proyecto) no se pueden borrar del disco: "eliminarlos" los esconde.
// La lista de los escondidos vive en los ajustes (agente "anuncios-ocultos"), igual que los demás ajustes del panel.
const AJ_OCULTOS = 'anuncios-ocultos';
const nube = () => require('./ajustes-nube.js');
async function leerOcultos() { try { const v = (await nube().leerTodos())[AJ_OCULTOS]; return Array.isArray(v?.ids) ? v.ids.map(String) : []; } catch { return []; } }
const guardarOcultos = ids => nube().guardar(AJ_OCULTOS, { ids });

let cache = { t: 0, v: null };
// Lista final: archivos + lo editado en la hoja. Cada elemento: { id, nombre, palabras[], mensaje, seguimiento, original, editado }
async function listar() {
  if (cache.v && Date.now() - cache.t < 20000) return cache.v;
  const ocultos = await leerOcultos();
  const lista = deArchivos().filter(a => !ocultos.includes(a.id));
  try {
    let filas;
    if (db.usa('anuncios')) {   // misma forma de fila que la hoja: [id, nombre, palabras, mensaje, seguimiento]
      filas = (await db.select('anuncios')).map(a => [a.id, a.nombre, (a.palabras || []).join(', '), a.mensaje, a.seguimiento, a.actualizado]);
    } else {
      const h = ayudas(), token = await h.tokenGoogle('spreadsheets.readonly');
      filas = (await leerFilas(h, token)) || [];
    }
    for (const f of filas) {
      const id = String(f[0] || '').trim(); if (!id) continue;
      const palabras = String(f[2] || '').split(',').map(s => s.trim()).filter(Boolean);
      const i = lista.findIndex(a => a.id === id);
      const hoja = { nombre: f[1] || '', palabras, mensaje: String(f[3] || '').trim(), seguimiento: String(f[4] || '').trim() };
      if (i >= 0) {
        const a = lista[i];
        if (hoja.nombre) a.nombre = hoja.nombre;
        if (id !== 'general' && palabras.length) a.palabras = palabras;
        if (hoja.mensaje) a.mensaje = hoja.mensaje;
        if (hoja.seguimiento) a.seguimiento = hoja.seguimiento;
        a.editado = true;
      } else if (hoja.mensaje && hoja.seguimiento && palabras.length) {
        lista.push({ id, nombre: hoja.nombre || id, palabras, mensaje: hoja.mensaje, seguimiento: hoja.seguimiento, original: false, editado: true });
      }
    }
  } catch (e) { console.error('anuncios: se usan los textos de los archivos (' + e.message + ')'); }
  cache = { t: Date.now(), v: lista };
  return lista;
}

// A qué anuncio pertenece un mensaje de WhatsApp (null = el general)
async function elegir(m) {
  const r = m.referral || {};
  const pajar = [r.headline, r.body, r.source_url, r.source_id, m.text?.body].filter(Boolean).join(' ').toLowerCase();
  return (await listar()).find(a => a.id !== 'general' && a.palabras.some(p => pajar.includes(p.toLowerCase()))) || null;
}
// Textos de un anuncio (por id; vacío o desconocido = el general)
async function textos(id) {
  const lista = await listar();
  const a = lista.find(x => x.id === id) || lista.find(x => x.id === 'general');
  return a ? { mensaje: a.mensaje, seguimiento: a.seguimiento } : null;   // null = ese anuncio ya no existe: no se contesta
}

const limpiar = (t, max) => String(t ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const idDe = nombre => String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// Guarda (o crea) un anuncio. Devuelve { ok, id } o { ok:false, error }
async function guardar(entrada) {
  const nombre = limpiar(entrada.nombre, 60);
  const mensaje = limpiar(entrada.mensaje, 1500), seguimiento = limpiar(entrada.seguimiento, 1500);
  let palabras = Array.isArray(entrada.palabras) ? entrada.palabras : String(entrada.palabras || '').split(',');
  palabras = [...new Set(palabras.map(p => limpiar(p, 40)).filter(Boolean))].slice(0, 10);
  const lista = await listar();
  const id = String(entrada.id || '') || idDe(nombre);
  const existente = lista.find(a => a.id === id);
  if (!id) return { ok: false, error: 'Ponle un nombre al anuncio.' };
  if (!existente && !nombre) return { ok: false, error: 'Ponle un nombre al anuncio.' };
  if (!mensaje) return { ok: false, error: 'El mensaje de respuesta no puede quedar vacío.' };
  if (!seguimiento) return { ok: false, error: 'El mensaje de seguimiento no puede quedar vacío.' };
  const general = id === 'general';
  if (!general && !palabras.length) return { ok: false, error: 'Agrega al menos una palabra clave para reconocer el anuncio.' };
  if (palabras.some(p => p.length < 3)) return { ok: false, error: 'Cada palabra clave debe tener al menos 3 letras.' };
  if (!existente && lista.some(a => a.id === id)) return { ok: false, error: 'Ya existe un anuncio con ese nombre.' };
  const ocultos = await leerOcultos();
  if (ocultos.includes(id)) await guardarOcultos(ocultos.filter(x => x !== id));   // volver a crear un original eliminado lo vuelve a mostrar
  const fila = [id, nombre || existente?.nombre, general ? '' : palabras.join(', '), mensaje, seguimiento, new Date().toISOString()];
  if (db.usa('anuncios')) {
    await db.upsert('anuncios', [{ id, nombre: fila[1], palabras: general ? [] : palabras, mensaje, seguimiento, actualizado: fila[5] }], 'id');
    cache = { t: 0, v: null };
    return { ok: true, id };
  }
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  let filas = await leerFilas(h, token);
  if (filas === null) { await crearPestana(h, token); filas = []; }
  const i = filas.findIndex(f => String(f[0] || '') === id);
  if (i >= 0) {
    const r = await h.petición('PUT', rango(h, 'A' + (i + 2) + ':F' + (i + 2)) + '?valueInputOption=RAW', JSON.stringify({ values: [fila] }), cabeceras(token));
    if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al guardar');
  } else {
    const r = await h.petición('POST', rango(h, 'A:F') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', JSON.stringify({ values: [fila] }), cabeceras(token));
    if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al guardar');
  }
  cache = { t: 0, v: null };
  return { ok: true, id };
}

// Elimina un anuncio (los originales se esconden) o, con soloRestaurar, devuelve un original editado a sus textos de los archivos
async function quitar(id, soloRestaurar = false) {
  id = String(id || '');
  if (!id) return { ok: false, error: 'Falta el anuncio.' };
  const original = deArchivos().some(a => a.id === id);
  if (original && !soloRestaurar) { const o = await leerOcultos(); if (!o.includes(id)) await guardarOcultos([...o, id]); }   // un original se esconde; lo editado de ese anuncio se borra abajo
  if (db.usa('anuncios')) { await db.remove('anuncios', { id: 'eq.' + id }); cache = { t: 0, v: null }; return { ok: true }; }
  const h = ayudas(), token = await h.tokenGoogle('spreadsheets');
  const filas = await leerFilas(h, token);
  const i = (filas || []).findIndex(f => String(f[0] || '') === id);
  if (i < 0) { cache = { t: 0, v: null }; return { ok: true }; }   // no tenía nada editado
  const r = await h.petición('PUT', rango(h, 'A' + (i + 2) + ':F' + (i + 2)) + '?valueInputOption=RAW', JSON.stringify({ values: [['', '', '', '', '', '']] }), cabeceras(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  cache = { t: 0, v: null };
  return { ok: true };
}

module.exports = { listar, elegir, textos, guardar, quitar };
