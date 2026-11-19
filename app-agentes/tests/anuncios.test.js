const test = require('node:test');
const assert = require('node:assert');

let filas, escrituras, caido, anuncios;

test.beforeEach(() => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_ANUNCIOS = 'supabase';
  filas = [];
  escrituras = [];
  caido = false;
  global.fetch = async (url, o = {}) => {
    const metodo = o.method || 'GET';
    if (caido) return { ok: false, status: 500, text: async () => 'caído' };
    if (metodo === 'GET') return { ok: true, status: 200, text: async () => JSON.stringify(filas) };
    escrituras.push({ metodo, url: String(url), cuerpo: o.body ? JSON.parse(o.body) : null });
    return { ok: true, status: 200, text: async () => (metodo === 'DELETE' ? '[{}]' : o.body || '[]') };
  };
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: { tokenGoogle: async () => { throw new Error('hoja'); } } } };
  for (const m of ['../db.js', '../anuncios.js']) delete require.cache[require.resolve(m)];
  anuncios = require('../anuncios.js');
});

test('una fila editada de "general" sobrescribe los textos de los archivos y se marca editada', async () => {
  filas = [{ id: 'general', nombre: '', palabras: [], mensaje: 'M nuevo', seguimiento: 'S nuevo' }];
  const g = (await anuncios.listar()).find(a => a.id === 'general');
  assert.strictEqual(g.mensaje, 'M nuevo');
  assert.strictEqual(g.seguimiento, 'S nuevo');
  assert.strictEqual(g.editado, true);
});

test('una fila nueva con palabras clave aparece como anuncio propio y elegir() lo encuentra', async () => {
  filas = [{ id: 'taller', nombre: 'Taller', palabras: ['taller'], mensaje: 'Hola taller', seguimiento: 'Sigues?' }];
  const lista = await anuncios.listar();
  const t = lista.find(a => a.id === 'taller');
  assert.strictEqual(t.original, false);
  assert.deepStrictEqual(t.palabras, ['taller']);
  const elegido = await anuncios.elegir({ text: { body: 'Info del TALLER por favor' } });
  assert.strictEqual(elegido.id, 'taller');
});

test('guardar con el mensaje vacío devuelve el error de siempre y no escribe', async () => {
  const r = await anuncios.guardar({ nombre: 'Taller', mensaje: '', seguimiento: 'x', palabras: 'taller' });
  assert.deepStrictEqual(r, { ok: false, error: 'El mensaje de respuesta no puede quedar vacío.' });
  assert.strictEqual(escrituras.length, 0);
});

test('guardar válido hace upsert por id', async () => {
  const r = await anuncios.guardar({ nombre: 'Taller Verano', mensaje: 'Hola', seguimiento: 'Sigues?', palabras: 'taller, verano' });
  assert.deepStrictEqual(r, { ok: true, id: 'taller-verano' });
  assert.match(escrituras[0].url, /on_conflict=id/);
  assert.deepStrictEqual(escrituras[0].cuerpo[0].palabras, ['taller', 'verano']);
  assert.strictEqual(escrituras[0].cuerpo[0].mensaje, 'Hola');
});

test('quitar borra la fila por id', async () => {
  const r = await anuncios.quitar('taller');
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(escrituras[0].metodo, 'DELETE');
  assert.match(escrituras[0].url, /anuncios\?id=eq\.taller/);
});

test('si Supabase falla, listar usa solo los textos de los archivos y no lanza', async () => {
  caido = true;
  const lista = await anuncios.listar();
  assert.ok(lista.some(a => a.id === 'general'));
  assert.ok(lista.every(a => a.original));
});

test.describe('eliminar anuncios originales', () => {
  const { crear } = require('./helpers/supabase-falso.js');
  let sb, A;
  test.beforeEach(() => {
    process.env.SUPABASE_URL = 'https://abc.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'k';
    process.env.DB_ANUNCIOS = 'supabase'; process.env.DB_AJUSTES = 'supabase';
    sb = crear({ anuncios: [{ id: 'viernes-de-consejo-maker', nombre: 'Viernes', palabras: ['viernes de consejo maker'], mensaje: 'M', seguimiento: 'S' }], ajustes: [] });
    global.fetch = sb.fetch;
    const rutaServer = require.resolve('../server.js');
    require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: {} } };
    for (const m of ['../db.js', '../ajustes-nube.js', '../anuncios.js']) delete require.cache[require.resolve(m)];
    A = require('../anuncios.js');
  });

  test('eliminar un original lo esconde de la lista y el agente ya no usa su texto', async () => {
    assert.ok((await A.listar()).some(a => a.id === 'general'));
    assert.deepStrictEqual(await A.quitar('general'), { ok: true });
    assert.deepStrictEqual(sb.tablas.ajustes.find(f => f.agente === 'anuncios-ocultos').valores, { ids: ['general'] });
    assert.ok(!(await A.listar()).some(a => a.id === 'general'));
    assert.strictEqual(await A.textos('general'), null);
    assert.strictEqual((await A.textos('viernes-de-consejo-maker')).mensaje, 'M');
  });

  test('si se elimina el general, un anuncio sin coincidencia ya no recibe texto', async () => {
    await A.quitar('general'); await A.quitar('inventors');
    assert.strictEqual(await A.textos(''), null);
    assert.deepStrictEqual((await A.listar()).map(a => a.id), ['viernes-de-consejo-maker']);
  });

  test('"restaurar" un original editado no lo esconde', async () => {
    sb.tablas.anuncios.push({ id: 'inventors', nombre: '', palabras: [], mensaje: 'Editado', seguimiento: 'Ed' });
    await A.quitar('inventors', true);
    assert.strictEqual(sb.tablas.anuncios.some(f => f.id === 'inventors'), false);
    assert.ok((await A.listar()).some(a => a.id === 'inventors'));
  });

  test('eliminar un anuncio propio sigue borrando su fila', async () => {
    await A.quitar('viernes-de-consejo-maker');
    assert.strictEqual(sb.tablas.anuncios.length, 0);
  });
});
