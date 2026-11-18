const test = require('node:test');
const assert = require('node:assert');
const { crear } = require('./helpers/supabase-falso.js');

let sb, pendientes;
const AHORA = Date.parse('2026-11-17T12:00:00Z');
const fila = (id, extra = {}) => ({ id, telefono: '5215512345678', vence: '2026-11-17T11:00:00.000Z', estado: 'pendiente', detalle: '', creado: '2026-11-17T10:00:00.000Z', tipo: 'primero', anuncio: '', ...extra });

function preparar(filas) {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_PENDIENTES = 'supabase';
  sb = crear({ pendientes: filas });
  global.fetch = sb.fetch;
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: { tokenGoogle: async () => { throw new Error('hoja'); } } } };
  for (const m of ['../db.js', '../pendientes.js']) delete require.cache[require.resolve(m)];
  pendientes = require('../pendientes.js');
}

test('agregar inserta con id único e ignora los que ya estaban', async () => {
  preparar([]);
  const item = { id: 'wamid.1', numero: '5215512345678', vence: AHORA, tipo: 'primero', anuncio: 'general' };
  assert.strictEqual(await pendientes.agregar([item, item]), 1);
  assert.strictEqual(await pendientes.agregar([item]), 0);
  assert.strictEqual(sb.tablas.pendientes.length, 1);
  const f = sb.tablas.pendientes[0];
  assert.deepStrictEqual([f.telefono, f.estado, f.tipo, f.anuncio, f.vence], ['5215512345678', 'pendiente', 'primero', 'general', '2026-11-17T12:00:00.000Z']);
});

test('cancelarSeguimientos cancela solo los seguimientos pendientes de esa persona y enmascara el teléfono', async () => {
  preparar([fila('a:seg', { tipo: 'seguimiento' }), fila('a'), fila('b:seg', { tipo: 'seguimiento', telefono: '5219999999999' })]);
  assert.strictEqual(await pendientes.cancelarSeguimientos(['+52 1 55 1234 5678']), 1);
  const por = Object.fromEntries(sb.tablas.pendientes.map(f => [f.id, f]));
  assert.strictEqual(por['a:seg'].estado, 'cancelado');
  assert.strictEqual(por['a:seg'].detalle, 'la persona respondió');
  assert.strictEqual(por['a:seg'].telefono, '+52••••5678');
  assert.strictEqual(por['a'].estado, 'pendiente');
  assert.strictEqual(por['b:seg'].estado, 'pendiente');
});

test('procesar envía los vencidos, deja el resultado sin teléfono completo y deja los futuros', async () => {
  preparar([fila('a', { anuncio: 'inv' }), fila('b'), fila('c', { vence: '2026-11-17T13:00:00.000Z' })]);
  const enviados = [];
  const r = await pendientes.procesar(async (tel, tipo, id, anuncio) => { enviados.push([tel, tipo, id, anuncio]); }, AHORA);
  assert.deepStrictEqual(r, { enviados: 2, errores: 0, pendientes: 1 });
  assert.deepStrictEqual(enviados[0], ['5215512345678', 'primero', 'a', 'inv']);
  const por = Object.fromEntries(sb.tablas.pendientes.map(f => [f.id, f]));
  assert.strictEqual(por.a.estado, 'enviado');
  assert.strictEqual(por.a.telefono, '+52••••5678');
  assert.strictEqual(por.c.estado, 'pendiente');
  assert.strictEqual(por.c.telefono, '5215512345678');
});

test('procesar anota error y detalle recortado cuando el envío falla', async () => {
  preparar([fila('a'), fila('b')]);
  const r = await pendientes.procesar(async (tel, tipo, id) => { if (id === 'a') throw new Error('x'.repeat(300)); }, AHORA);
  assert.deepStrictEqual(r, { enviados: 1, errores: 1, pendientes: 0 });
  const a = sb.tablas.pendientes.find(f => f.id === 'a');
  assert.strictEqual(a.estado, 'error');
  assert.strictEqual(a.detalle.length, 200);
});

test('respeta el máximo de envíos por ejecución', async () => {
  preparar([fila('a'), fila('b'), fila('c')]);
  const r = await pendientes.procesar(async () => {}, AHORA, 2);
  assert.strictEqual(r.enviados, 2);
  assert.strictEqual(r.pendientes, 1);
});

test('dos ejecuciones a la vez nunca mandan el mismo envío dos veces', async () => {
  preparar([fila('a'), fila('b'), fila('c')]);
  const enviados = [];
  const enviar = async (tel, tipo, id) => { enviados.push(id); await new Promise(r => setTimeout(r, 5)); };
  await Promise.all([pendientes.procesar(enviar, AHORA), pendientes.procesar(enviar, AHORA)]);
  assert.deepStrictEqual(enviados.sort(), ['a', 'b', 'c']);
});

test('si otra ejecución ya reservó las filas, no se envía nada', async () => {
  preparar([fila('a', { estado: 'enviando' })]);
  let llamado = false;
  const r = await pendientes.procesar(async () => { llamado = true; }, AHORA);
  assert.strictEqual(llamado, false);
  assert.strictEqual(r.enviados, 0);
});

test('resumen cuenta pendientes y da el próximo vencimiento solo de los "primero"', async () => {
  preparar([fila('a', { vence: '2026-11-17T15:00:00.000Z' }), fila('b', { vence: '2026-11-17T14:00:00.000Z' }), fila('c:seg', { tipo: 'seguimiento', vence: '2026-11-17T13:00:00.000Z' }), fila('d', { estado: 'enviado' })]);
  assert.deepStrictEqual(await pendientes.resumen(), { pendientes: 3, proximo: '2026-11-17T14:00:00.000Z' });
});

test('estados devuelve el estado de los mensajes principales (no de los seguimientos)', async () => {
  preparar([fila('a', { estado: 'enviado' }), fila('b'), fila('b:seg', { tipo: 'seguimiento' })]);
  assert.deepStrictEqual(await pendientes.estados(), { a: 'enviado', b: 'pendiente' });
});
