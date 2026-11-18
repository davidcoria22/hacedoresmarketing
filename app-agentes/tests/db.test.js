const test = require('node:test');
const assert = require('node:assert');

const ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'DB_MENSAJES'];
let llamadas, respuesta, db;

test.beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'llave-de-prueba';
  llamadas = [];
  respuesta = { status: 200, body: '[]' };
  global.fetch = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || 'GET', cab: opciones.headers || {}, cuerpo: opciones.body });
    return { ok: respuesta.status < 300, status: respuesta.status, text: async () => respuesta.body };
  };
  delete require.cache[require.resolve('../db.js')];
  db = require('../db.js');
});

test('select arma la URL con los filtros y manda las dos cabeceras', async () => {
  respuesta.body = JSON.stringify([{ id: 'a' }]);
  const filas = await db.select('pendientes', { estado: 'eq.pendiente', limit: '20' });
  assert.deepStrictEqual(filas, [{ id: 'a' }]);
  assert.strictEqual(llamadas[0].metodo, 'GET');
  assert.strictEqual(llamadas[0].url, 'https://abc.supabase.co/rest/v1/pendientes?estado=eq.pendiente&limit=20');
  assert.strictEqual(llamadas[0].cab.apikey, 'llave-de-prueba');
  assert.strictEqual(llamadas[0].cab.Authorization, 'Bearer llave-de-prueba');
});

test('insert con ignorarDuplicados pide ignore-duplicates y on_conflict', async () => {
  await db.insert('mensajes', [{ clave: 'x' }], { ignorarDuplicados: true, conflicto: 'clave' });
  assert.strictEqual(llamadas[0].metodo, 'POST');
  assert.match(llamadas[0].url, /on_conflict=clave/);
  assert.match(llamadas[0].cab.Prefer, /resolution=ignore-duplicates/);
  assert.match(llamadas[0].cab.Prefer, /return=representation/);
  assert.deepStrictEqual(JSON.parse(llamadas[0].cuerpo), [{ clave: 'x' }]);
});

test('upsert pide merge-duplicates con su conflicto', async () => {
  await db.upsert('usuarios', [{ email: 'a@x.com' }], 'email');
  assert.match(llamadas[0].url, /on_conflict=email/);
  assert.match(llamadas[0].cab.Prefer, /resolution=merge-duplicates/);
});

test('update es PATCH con filtro y cuerpo, y devuelve las filas cambiadas', async () => {
  respuesta.body = JSON.stringify([{ id: '1' }, { id: '2' }]);
  const filas = await db.update('pendientes', { estado: 'eq.pendiente' }, { estado: 'enviando' });
  assert.strictEqual(llamadas[0].metodo, 'PATCH');
  assert.strictEqual(llamadas[0].url, 'https://abc.supabase.co/rest/v1/pendientes?estado=eq.pendiente');
  assert.deepStrictEqual(JSON.parse(llamadas[0].cuerpo), { estado: 'enviando' });
  assert.strictEqual(filas.length, 2);
});

test('remove es DELETE y devuelve cuántas filas borró', async () => {
  respuesta.body = JSON.stringify([{ email: 'a' }]);
  const n = await db.remove('usuarios', { email: 'eq.a@x.com' });
  assert.strictEqual(llamadas[0].metodo, 'DELETE');
  assert.strictEqual(n, 1);
});

test('una respuesta de error lanza con el estado', async () => {
  respuesta = { status: 500, body: 'se cayó' };
  await assert.rejects(() => db.select('mensajes'), /Supabase respondió 500/);
});

test('usa() exige la variable del módulo y las llaves', () => {
  assert.strictEqual(db.usa('mensajes'), false);
  process.env.DB_MENSAJES = 'supabase';
  assert.strictEqual(db.usa('mensajes'), true);
  delete process.env.SUPABASE_SERVICE_KEY;
  assert.strictEqual(db.configurado(), false);
  assert.strictEqual(db.usa('mensajes'), false);
});

test('con una llave nueva (sb_secret_...) solo se manda apikey; con la llave JWT antigua se mandan las dos', async () => {
  process.env.SUPABASE_SERVICE_KEY = 'sb_secret_abc123';
  await db.select('mensajes');
  assert.strictEqual(llamadas[0].cab.apikey, 'sb_secret_abc123');
  assert.strictEqual(llamadas[0].cab.Authorization, undefined);
  process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOi.JWT.firma';
  await db.select('mensajes');
  assert.strictEqual(llamadas[1].cab.apikey, 'eyJhbGciOi.JWT.firma');
  assert.strictEqual(llamadas[1].cab.Authorization, 'Bearer eyJhbGciOi.JWT.firma');
});
