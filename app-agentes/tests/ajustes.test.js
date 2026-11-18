const test = require('node:test');
const assert = require('node:assert');

let llamadas, respuesta, nube, tocoLaHoja;

test.beforeEach(() => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  delete process.env.DB_AJUSTES;
  llamadas = [];
  respuesta = { status: 200, body: '[]' };
  tocoLaHoja = false;
  global.fetch = async (url, o = {}) => {
    llamadas.push({ url: String(url), metodo: o.method || 'GET', cuerpo: o.body });
    return { ok: true, status: respuesta.status, text: async () => respuesta.body };
  };
  // server.js real arranca el servidor: se reemplaza por uno que avisa si se intenta usar la hoja
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: { tokenGoogle: async () => { tocoLaHoja = true; throw new Error('hoja'); } } } };
  for (const m of ['../db.js', '../ajustes-nube.js']) delete require.cache[require.resolve(m)];
  nube = require('../ajustes-nube.js');
});

test('con DB_AJUSTES=supabase leerTodos arma el objeto por agente', async () => {
  process.env.DB_AJUSTES = 'supabase';
  respuesta.body = JSON.stringify([{ agente: 'seguidores-diarios', valores: { nombre: 'Sol' } }]);
  const todos = await nube.leerTodos();
  assert.deepStrictEqual(todos, { 'seguidores-diarios': { nombre: 'Sol' } });
  assert.match(llamadas[0].url, /\/rest\/v1\/ajustes/);
  assert.strictEqual(tocoLaHoja, false);
});

test('con DB_AJUSTES=supabase guardar hace upsert por agente', async () => {
  process.env.DB_AJUSTES = 'supabase';
  await nube.guardar('publicaciones', { nombre: 'A' });
  assert.strictEqual(llamadas[0].metodo, 'POST');
  assert.match(llamadas[0].url, /on_conflict=agente/);
  const fila = JSON.parse(llamadas[0].cuerpo)[0];
  assert.strictEqual(fila.agente, 'publicaciones');
  assert.deepStrictEqual(fila.valores, { nombre: 'A' });
  assert.ok(fila.actualizado);
});

test('sin el interruptor sigue usando la hoja y no llama a Supabase', async () => {
  await assert.rejects(() => nube.leerTodos(), /hoja/);
  assert.strictEqual(tocoLaHoja, true);
  assert.strictEqual(llamadas.length, 0);
});
