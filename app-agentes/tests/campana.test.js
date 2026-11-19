const test = require('node:test');
const assert = require('node:assert');

const pedido = (id, items) => ({ id, date_created: '2026-11-18T10:00:00', date_created_gmt: '2026-11-18T16:00:00', total: '0', currency: 'MXN', status: 'processing', line_items: items });
const item = (name, total, quantity = 1) => ({ name, total: String(total), quantity });

function cargar({ pedidos = [], meta = {} } = {}) {
  process.env.WOO_CONSUMER_KEY = 'k'; process.env.WOO_CONSUMER_SECRET = 's';
  process.env.META_ADS_TOKEN = 't'; process.env.META_ADS_ACCOUNT_ID = '123';
  global.fetch = async url => {
    const u = String(url);
    const j = cuerpo => ({ ok: true, status: 200, json: async () => cuerpo });
    if (u.includes('/wp-json/wc/v3/orders')) return j(pedidos);
    for (const [ruta, cuerpo] of Object.entries(meta)) if (u.includes(ruta)) return j(cuerpo);
    return j({ data: [] });
  };
  for (const m of ['../woocommerce.js', '../meta-ads.js', '../campana.js']) delete require.cache[require.resolve(m)];
  return { W: require('../woocommerce.js'), C: require('../campana.js') };
}

test('ventasDe suma solo los productos de Viernes de Consejo Maker, de las dos sedes', async () => {
  const { W } = cargar({ pedidos: [
    pedido(3, [item('Viernes de Consejo Maker – Hacedores Interlomas 27 de noviembre', 980, 2), item('Camiseta', 300)]),
    pedido(2, [item('Curso de impresión 3D', 1500)]),
    pedido(1, [item('Viernes de Consejo Maker', 490)]),
  ] });
  const r = await W.ventasDe(/consejo maker/i);
  assert.strictEqual(r.cantidad, 3);
  assert.strictEqual(r.total, 980 + 490);
  assert.deepStrictEqual(r.ultimas.map(c => c.id), [3, 1]);
  assert.ok(!('cliente' in r.ultimas[0]) && !('billing' in r.ultimas[0]));
});

test('resumen de ventas sigue funcionando con la misma consulta compartida', async () => {
  const { W } = cargar({ pedidos: [pedido(1, [item('Algo', 10)])] });
  const r = await W.resumen();
  assert.strictEqual(r.configurado, true);
  assert.strictEqual(r.ultimas.length, 1);
});

test('embedDe solo acepta páginas de Instagram o Facebook', () => {
  const { C } = cargar();
  assert.strictEqual(C.embedDe('https://www.instagram.com/reel/ABC/?utm=1', '').embed, 'https://www.instagram.com/reel/ABC/embed/');
  assert.strictEqual(C.embedDe('https://malo.com/reel/ABC/', ''), null);
  assert.strictEqual(C.embedDe('javascript:alert(1)', ''), null);
  assert.match(C.embedDe('', '12345678').embed, /^https:\/\/www\.facebook\.com\/plugins\/video\.php/);
});

test('campana elige la de Consejo Maker, con su reel y sus visualizaciones', async () => {
  const { C } = cargar({ meta: {
    '/act_123/campaigns': { data: [{ id: '1', name: 'Curso 3D', effective_status: 'ACTIVE' }, { id: '2', name: 'Viernes de Consejo Maker', effective_status: 'ACTIVE', start_time: '2026-11-17' }] },
    '/2/insights': { data: [{ impressions: '5000', reach: '3200', spend: '150.5', clicks: '90', actions: [{ action_type: 'video_view', value: '1200' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' }] }] },
    '/2/ads': { data: [{ name: 'Reel', effective_status: 'ACTIVE', creative: { instagram_permalink_url: 'https://www.instagram.com/reel/XYZ/', thumbnail_url: 'https://scontent.fbcdn.net/x.jpg' } }] },
  } });
  const c = await C.campana();
  assert.strictEqual(c.encontrada, true);
  assert.strictEqual(c.nombre, 'Viernes de Consejo Maker');
  assert.strictEqual(c.visualizaciones, 5000);
  assert.strictEqual(c.reproducciones, 1200);
  assert.strictEqual(c.mensajes, 7);
  assert.strictEqual(c.gasto, 150.5);
  assert.strictEqual(c.reel.embed, 'https://www.instagram.com/reel/XYZ/embed/');
});

test('si no hay campaña de Consejo Maker lo dice sin fallar', async () => {
  const { C } = cargar({ meta: { '/act_123/campaigns': { data: [{ id: '1', name: 'Curso 3D', effective_status: 'ACTIVE' }] } } });
  assert.deepStrictEqual(await C.campana(), { encontrada: false, activas: ['Curso 3D'], total: 1 });
});

test('resumen: si WooCommerce falla, la campaña y los mensajes se siguen mostrando', async () => {
  const { C } = cargar({ pedidos: [] });
  delete process.env.WOO_CONSUMER_KEY;
  delete require.cache[require.resolve('../woocommerce.js')]; delete require.cache[require.resolve('../campana.js')];
  const r = await require('../campana.js').resumen();
  assert.match(r.compras.error, /WooCommerce/);
  assert.ok('campana' in r && 'mensajes' in r);
});

test('mensajesDelAnuncio cuenta solo lo que llegó del anuncio de Consejo Maker y no expone el número', async () => {
  const { crear } = require('./helpers/supabase-falso.js');
  process.env.SUPABASE_URL = 'https://abc.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_MENSAJES = 'supabase'; process.env.DB_PENDIENTES = 'supabase';
  const ahora = new Date().toISOString();
  const f = (seq, origen, extra = {}) => ({ seq, clave: 'k' + seq, fecha: ahora, red: 'whatsapp', nombre: 'Ana', telefono: '+52••••5678', tipo: 'text', texto: 'hola ' + seq, origen, respuesta: '', id: 'M' + seq, direccion: 'entrada', contacto: '5215512345678', ref: '', media: null, autor: '', ...extra });
  const sb = crear({ mensajes: [f(1, 'anuncio:viernes-de-consejo-maker'), f(2, 'anuncio:viernes-de-consejo-maker', { fecha: '2026-01-01T10:00:00.000Z' }), f(3, 'anuncio:inventors'), f(4, 'directo')], pendientes: [] }, { mensajes: 'seq' });
  global.fetch = sb.fetch;
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: {} } };
  for (const m of ['../db.js', '../pendientes.js', '../mensajes.js', '../campana.js']) delete require.cache[require.resolve(m)];
  const r = await require('../campana.js').mensajesDelAnuncio();
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.hoy, 1);
  assert.ok(!JSON.stringify(r).includes('5215512345678'));
});
