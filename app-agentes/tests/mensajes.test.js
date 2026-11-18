const test = require('node:test');
const assert = require('node:assert');
const { crear } = require('./helpers/supabase-falso.js');

let sb, mensajes;
const fila = (seq, extra = {}) => ({ seq, clave: 'k' + seq, fecha: '2026-11-17T1' + seq + ':00:00.000Z', red: 'whatsapp', nombre: 'Ana', telefono: '+52••••5678', tipo: 'text', texto: 'hola ' + seq, origen: 'anuncio', respuesta: '', id: 'M' + seq, direccion: 'entrada', contacto: '5215512345678', ref: '', media: null, autor: '', ...extra });

function preparar(mensajesIniciales = [], pendientesIniciales = []) {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_MENSAJES = 'supabase';
  process.env.DB_PENDIENTES = 'supabase';
  sb = crear({ mensajes: mensajesIniciales, pendientes: pendientesIniciales }, { mensajes: 'seq' });
  global.fetch = sb.fetch;
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: { tokenGoogle: async () => { throw new Error('hoja'); } } } };
  for (const m of ['../db.js', '../pendientes.js', '../mensajes.js']) delete require.cache[require.resolve(m)];
  mensajes = require('../mensajes.js');
  for (const f of sb.tablas.mensajes) f.ref = f.contacto ? mensajes.refDe(f.contacto) : '';
}

test.afterEach(() => { try { test.mock.timers.reset(); } catch { /* sin reloj simulado */ } });

test('claveDe usa el id de Meta o, sin id, un hash estable del mensaje', () => {
  preparar();
  assert.strictEqual(mensajes.claveDe({ id: 'wamid.1', fecha: 'F', red: 'whatsapp', texto: 'x' }), 'wamid.1');
  const base = { fecha: 'F', red: 'whatsapp', contacto: '521', direccion: 'salida', texto: 'hola' };
  assert.match(mensajes.claveDe(base), /^[0-9a-f]{40}$/);
  assert.strictEqual(mensajes.claveDe(base), mensajes.claveDe({ ...base }));
  assert.notStrictEqual(mensajes.claveDe(base), mensajes.claveDe({ ...base, texto: 'otro' }));
});

test('guardarMensajes inserta con teléfono enmascarado, contacto solo dígitos y ref', async () => {
  preparar();
  await mensajes.guardarMensajes([{ red: 'whatsapp', nombre: 'Ana', numero: '+52 1 55 1234 5678', tipo: 'text', texto: 'hola', origen: 'anuncio', respuesta: 'programada', id: 'wamid.1' }]);
  const f = sb.tablas.mensajes[0];
  assert.strictEqual(f.clave, 'wamid.1');
  assert.strictEqual(f.telefono, '+52••••5678');
  assert.strictEqual(f.contacto, '5215512345678');
  assert.strictEqual(f.ref, mensajes.refDe('5215512345678'));
  assert.strictEqual(f.direccion, 'entrada');
  assert.strictEqual(f.media, null);
  assert.match(sb.llamadas[0].url, /on_conflict=clave/);
  assert.match(sb.llamadas[0].prefer, /ignore-duplicates/);
});

test('el mismo aviso repetido por Meta no deja una segunda fila y no lanza error', async () => {
  preparar();
  const r = { red: 'whatsapp', numero: '5215512345678', tipo: 'text', texto: 'hola', id: 'wamid.1' };
  await mensajes.guardarMensajes([r]);
  await mensajes.guardarMensajes([r]);
  assert.strictEqual(sb.tablas.mensajes.length, 1);
});

test('un mensaje que manda el agente guarda su archivo adjunto como objeto', async () => {
  preparar();
  await mensajes.guardarMensajes([{ red: 'whatsapp', numero: '5215512345678', tipo: 'image', texto: '', direccion: 'salida', media: JSON.stringify({ t: 'image', id: 'MED1', m: 'image/png', n: 'a.png' }), autor: 'Luis' }]);
  const f = sb.tablas.mensajes[0];
  assert.deepStrictEqual(f.media, { t: 'image', id: 'MED1', m: 'image/png', n: 'a.png' });
  assert.strictEqual(f.direccion, 'salida');
  assert.strictEqual(f.autor, 'Luis');
});

test('leerMensajes devuelve lo más nuevo primero, sin id, contacto ni media, con ref, adjunto y fecha ISO', async () => {
  preparar([fila(1), fila(2, { direccion: 'salida' }), fila(3, { media: { t: 'image', id: 'MED1' } }), fila(4, { red: 'facebook', contacto: '' })]);
  const lista = await mensajes.leerMensajes(50, '', false);
  assert.deepStrictEqual(lista.map(m => m.texto), ['hola 4', 'hola 3', 'hola 1']);
  const m = lista[1];
  assert.ok(!('id' in m) && !('contacto' in m) && !('media' in m));
  assert.strictEqual(m.ref, mensajes.refDe('5215512345678'));
  assert.deepStrictEqual(m.adjunto, { t: 'image', id: 'MED1' });
  assert.strictEqual(lista[2].adjunto, null);
  assert.strictEqual(m.fecha, '2026-11-17T13:00:00.000Z');
  assert.strictEqual(m.telefono, '+52••••5678');
});

test('leerMensajes respeta límite, red y "todos" (incluye lo que se envía)', async () => {
  preparar([fila(1), fila(2, { direccion: 'salida' }), fila(3, { red: 'facebook', contacto: '' })]);
  assert.strictEqual((await mensajes.leerMensajes(1, '', false)).length, 1);
  assert.deepStrictEqual((await mensajes.leerMensajes(50, 'whatsapp', false)).map(m => m.texto), ['hola 1']);
  assert.deepStrictEqual((await mensajes.leerMensajes(50, 'whatsapp', true)).map(m => m.texto), ['hola 2', 'hola 1']);
});

test('una respuesta "programada" se actualiza con el estado de la cola', async () => {
  preparar([fila(1, { respuesta: 'programada', id: 'M1' }), fila(2, { respuesta: 'programada', id: 'M2' })],
    [{ id: 'M1', tipo: 'primero', estado: 'enviado' }, { id: 'M2', tipo: 'primero', estado: 'pendiente' }]);
  const lista = await mensajes.leerMensajes();
  assert.deepStrictEqual(lista.map(m => m.respuesta), ['programada', 'enviada']);
});

test('buscarContacto devuelve el número y la última entrada de esa conversación de WhatsApp', async () => {
  preparar([fila(1), fila(2, { direccion: 'salida', fecha: '2026-11-17T20:00:00.000Z' }), fila(3, { contacto: '5219999999999' })]);
  const r = await mensajes.buscarContacto(mensajes.refDe('5215512345678'));
  assert.deepStrictEqual(r, { numero: '5215512345678', ultimaEntrada: Date.parse('2026-11-17T11:00:00.000Z') });
  assert.strictEqual(await mensajes.buscarContacto(mensajes.refDe('5210000000000')), null);
});

test('buscarContacto rechaza una referencia mal formada sin consultar la base', async () => {
  preparar([fila(1)]);
  assert.strictEqual(await mensajes.buscarContacto('no-es-hex'), null);
  assert.strictEqual(sb.llamadas.length, 0);
});

test('mediaConocida solo reconoce archivos que están en la base', async () => {
  preparar([fila(1, { media: { t: 'image', id: 'MED1' } })]);
  assert.strictEqual(await mensajes.mediaConocida('MED1'), true);
  assert.strictEqual(await mensajes.mediaConocida('OTRO'), false);
});

test('si Supabase falla un momento, leerMensajes sigue con lo último leído (y lanza pasados 2 minutos)', async () => {
  test.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-17T12:00:00Z') });
  preparar([fila(1)]);
  assert.strictEqual((await mensajes.leerMensajes()).length, 1);
  sb.caer();
  test.mock.timers.tick(10000);
  assert.strictEqual((await mensajes.leerMensajes()).length, 1);
  test.mock.timers.tick(121000);
  await assert.rejects(() => mensajes.leerMensajes(), /Supabase respondió 500/);
});
