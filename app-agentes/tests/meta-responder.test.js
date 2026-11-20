const test = require('node:test');
const assert = require('node:assert');
const { crear } = require('./helpers/supabase-falso.js');

let sb, llamadasMeta, M, mensajes;
const fila = (seq, extra = {}) => ({ seq, clave: 'k' + seq, fecha: new Date().toISOString(), red: 'instagram', nombre: '@ana', telefono: 'ID ••1234', tipo: 'text', texto: 'hola', origen: 'directo', respuesta: '', id: 'm' + seq, direccion: 'entrada', contacto: '17841400000001234', ref: '', media: null, autor: '', ...extra });

function preparar(filas, { token = 'TOKEN', respuesta = { ok: true, json: { message_id: 'mid.ENVIADO', recipient_id: '17841400000001234' } } } = {}) {
  process.env.SUPABASE_URL = 'https://abc.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_MENSAJES = 'supabase'; process.env.DB_PENDIENTES = 'supabase';
  if (token) process.env.META_PAGE_TOKEN = token; else delete process.env.META_PAGE_TOKEN;
  delete process.env.FACEBOOK_PAGE_TOKEN;
  sb = crear({ mensajes: filas, pendientes: [] }, { mensajes: 'seq' });
  llamadasMeta = [];
  global.fetch = async (u, o) => {
    if (String(u).includes('supabase.co')) return sb.fetch(u, o);
    llamadasMeta.push({ url: String(u), cuerpo: o && o.body ? JSON.parse(o.body) : null, cab: o && o.headers });
    return { ok: respuesta.ok, status: respuesta.ok ? 200 : 400, text: async () => JSON.stringify(respuesta.json) };
  };
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: {} } };
  for (const m of ['../db.js', '../pendientes.js', '../mensajes.js', '../meta-mensajes.js']) delete require.cache[require.resolve(m)];
  mensajes = require('../mensajes.js'); M = require('../meta-mensajes.js');
  for (const f of sb.tablas.mensajes) f.ref = f.contacto ? mensajes.refDe(f.contacto) : '';
}
const ref = () => mensajes.refDe('17841400000001234');

test('contesta por Instagram con el token de la página, dentro de la ventana de 24 h, y deja la respuesta en la conversación', async () => {
  preparar([fila(1)]);
  const r = await M.responderDesdePanel('instagram', ref(), '  Hola Ana  ', 'Luis');
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(llamadasMeta.length, 1);
  assert.match(llamadasMeta[0].url, /graph\.facebook\.com\/v\d+\.\d+\/me\/messages/);
  assert.deepStrictEqual(llamadasMeta[0].cuerpo, { recipient: { id: '17841400000001234' }, messaging_type: 'RESPONSE', message: { text: 'Hola Ana' } });
  assert.ok(!llamadasMeta[0].url.includes('TOKEN') || llamadasMeta[0].url.includes('access_token'));
  const salida = sb.tablas.mensajes.find(f => f.direccion === 'salida');
  assert.strictEqual(salida.red, 'instagram');
  assert.strictEqual(salida.texto, 'Hola Ana');
  assert.strictEqual(salida.origen, 'manual');
  assert.strictEqual(salida.autor, 'Luis');
  assert.strictEqual(salida.id, 'mid.ENVIADO');
  assert.strictEqual(salida.ref, ref());
});

test('contesta por Facebook igual que por Instagram', async () => {
  preparar([fila(1, { red: 'facebook', contacto: '555666777' })]);
  const r = await M.responderDesdePanel('facebook', mensajes.refDe('555666777'), 'Hola', '');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(llamadasMeta[0].cuerpo.recipient.id, '555666777');
});

test('no deja contestar si pasaron más de 24 horas del último mensaje de la persona', async () => {
  preparar([fila(1, { fecha: new Date(Date.now() - 25 * 3600000).toISOString() })]);
  const r = await M.responderDesdePanel('instagram', ref(), 'Hola', '');
  assert.strictEqual(r.codigo, 409);
  assert.strictEqual(llamadasMeta.length, 0);
});

test('mensajes vacíos, demasiado largos, redes no permitidas y falta de token se rechazan sin llamar a Meta', async () => {
  preparar([fila(1)]);
  assert.strictEqual((await M.responderDesdePanel('instagram', ref(), '   ', '')).codigo, 400);
  assert.strictEqual((await M.responderDesdePanel('instagram', ref(), 'x'.repeat(1001), '')).codigo, 400);
  assert.strictEqual((await M.responderDesdePanel('tiktok', ref(), 'hola', '')).codigo, 400);
  assert.strictEqual((await M.responderDesdePanel('instagram', 'zzz', 'hola', '')).codigo, 404);
  preparar([fila(1)], { token: '' });
  assert.strictEqual((await M.responderDesdePanel('instagram', ref(), 'hola', '')).codigo, 503);
  assert.strictEqual(llamadasMeta.length, 0);
});

test('si Meta rechaza el mensaje se avisa con el motivo y no se anota como enviado', async () => {
  preparar([fila(1)], { respuesta: { ok: false, json: { error: { message: '(#10) Application does not have permission', code: 10 } } } });
  const r = await M.responderDesdePanel('instagram', ref(), 'hola', '');
  assert.strictEqual(r.codigo, 502);
  assert.match(r.error, /permission/);
  assert.strictEqual(sb.tablas.mensajes.filter(f => f.direccion === 'salida').length, 0);
});
