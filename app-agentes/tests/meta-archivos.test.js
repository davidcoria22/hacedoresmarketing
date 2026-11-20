const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { EventEmitter } = require('node:events');
const { crear } = require('./helpers/supabase-falso.js');

let sb, meta, storage, M, mensajes;
const fila = (seq, extra = {}) => ({ seq, clave: 'k' + seq, fecha: new Date().toISOString(), red: 'instagram', nombre: '@ana', telefono: 'ID ••1234', tipo: 'text', texto: 'hola', origen: 'directo', respuesta: '', id: 'm' + seq, direccion: 'entrada', contacto: '17841400000001234', ref: '', media: null, autor: '', ...extra });
const resp = (ok, json, status) => ({ ok, status: status || (ok ? 200 : 400), headers: { get: () => null }, text: async () => JSON.stringify(json), arrayBuffer: async () => new ArrayBuffer(0) });

// opciones.meta: función (url, cuerpo) => respuesta de Meta; opciones.storageFalla: el almacén responde error
function preparar(filas, opciones = {}) {
  process.env.SUPABASE_URL = 'https://abc.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_MENSAJES = 'supabase'; process.env.DB_PENDIENTES = 'supabase';
  process.env.META_PAGE_TOKEN = 'TOKEN'; process.env.META_APP_SECRET = 'secreto';
  sb = crear({ mensajes: filas, pendientes: [] }, { mensajes: 'seq' });
  meta = []; storage = [];
  global.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.includes('/storage/v1/')) { storage.push({ url: u, mime: o.headers && o.headers['Content-Type'], tam: o.body ? o.body.length : 0 }); return opciones.storageFalla ? resp(false, { error: 'x' }, 500) : resp(true, { Key: 'ok' }); }
    if (u.includes('supabase.co')) return sb.fetch(u, o);
    if (u.startsWith('https://scontent.fbcdn.net/')) return { ok: true, status: 200, headers: { get: k => (/type/i.test(k) ? 'image/jpeg' : '10') }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer };
    const cuerpo = o.body ? JSON.parse(o.body) : null;
    meta.push({ url: u, cuerpo });
    return opciones.meta ? opciones.meta(u, cuerpo) : resp(true, { message_id: 'mid.' + meta.length });
  };
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: {} } };
  for (const m of ['../db.js', '../pendientes.js', '../mensajes.js', '../almacen.js', '../meta-mensajes.js']) delete require.cache[require.resolve(m)];
  mensajes = require('../mensajes.js'); M = require('../meta-mensajes.js');
  for (const f of sb.tablas.mensajes) f.ref = f.contacto ? mensajes.refDe(f.contacto) : '';
}
const ref = () => mensajes.refDe('17841400000001234');
const foto = { tipo: 'imagen', nombre: 'a.jpg', mime: 'image/jpeg', datos: Buffer.from('imagen'), pie: '' };

test('adjuntoDe reconoce fotos, videos y reels compartidos y descarta direcciones que no son de Meta', () => {
  preparar([]);
  assert.deepStrictEqual(M.adjuntoDe({ attachments: [{ type: 'image', payload: { url: 'https://scontent.fbcdn.net/a.jpg' } }] }), { t: 'image', u: 'https://scontent.fbcdn.net/a.jpg' });
  assert.deepStrictEqual(M.adjuntoDe({ attachments: [{ type: 'image', payload: { url: 'https://malo.example.com/a.jpg' } }] }), { t: 'image' });
  assert.deepStrictEqual(M.adjuntoDe({ attachments: [{ type: 'ig_reel', payload: { url: 'https://www.instagram.com/reel/ABC/' } }] }), { t: 'enlace', u: 'https://www.instagram.com/reel/ABC/', n: 'Reel' });
  assert.strictEqual(M.adjuntoDe({ text: 'hola' }), null);
});

test('una foto se sube al almacén y Meta la recibe por su dirección pública; queda en la conversación', async () => {
  preparar([fila(1)]);
  const r = await M.enviarArchivoDesdePanel('instagram', ref(), foto, 'Luis');
  assert.deepStrictEqual(r, { ok: true });
  assert.match(storage[0].url, /\/storage\/v1\/object\/envios\/salida\/[0-9a-f]+\.jpg$/);
  assert.strictEqual(meta.length, 1);
  const adj = meta[0].cuerpo.message.attachment;
  assert.strictEqual(adj.type, 'image');
  assert.match(adj.payload.url, /^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/envios\/salida\/[0-9a-f]+\.jpg$/);
  const salida = sb.tablas.mensajes.find(f => f.direccion === 'salida');
  assert.strictEqual(salida.media.t, 'image');
  assert.strictEqual(salida.media.u, adj.payload.url);
  assert.strictEqual(salida.autor, 'Luis');
});

test('el texto que acompaña a la foto sale como un mensaje aparte', async () => {
  preparar([fila(1)]);
  await M.enviarArchivoDesdePanel('instagram', ref(), { ...foto, pie: 'Mira esto' }, 'Luis');
  assert.strictEqual(meta.length, 2);
  assert.deepStrictEqual(meta[1].cuerpo.message, { text: 'Mira esto' });
  assert.strictEqual(sb.tablas.mensajes.filter(f => f.direccion === 'salida').length, 2);
});

test('Instagram no acepta documentos, formatos raros ni archivos de más de 4 MB, y nada de eso llega a Meta', async () => {
  preparar([fila(1)]);
  assert.strictEqual((await M.enviarArchivoDesdePanel('instagram', ref(), { ...foto, tipo: 'documento', mime: 'application/pdf' }, '')).codigo, 400);
  assert.strictEqual((await M.enviarArchivoDesdePanel('instagram', ref(), { ...foto, mime: 'image/bmp' }, '')).codigo, 415);
  assert.strictEqual((await M.enviarArchivoDesdePanel('instagram', ref(), { ...foto, datos: Buffer.alloc(4 * 1024 * 1024 + 1) }, '')).codigo, 413);
  assert.strictEqual(meta.length + storage.length, 0);
});

test('Facebook sí acepta documentos', async () => {
  preparar([fila(1, { red: 'facebook', contacto: '555666777' })]);
  const r = await M.enviarArchivoDesdePanel('facebook', mensajes.refDe('555666777'), { tipo: 'documento', nombre: 'lista.pdf', mime: 'application/pdf', datos: Buffer.from('pdf'), pie: '' }, '');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(meta[0].cuerpo.message.attachment.type, 'file');
});

test('si el almacén falla no se manda nada a Meta; si Meta rechaza no se anota como enviado', async () => {
  preparar([fila(1)], { storageFalla: true });
  assert.strictEqual((await M.enviarArchivoDesdePanel('instagram', ref(), foto, '')).codigo, 503);
  assert.strictEqual(meta.length, 0);
  preparar([fila(1)], { meta: () => resp(false, { error: { message: 'sin permiso' } }) });
  const r = await M.enviarArchivoDesdePanel('instagram', ref(), foto, '');
  assert.strictEqual(r.codigo, 502);
  assert.match(r.error, /sin permiso/);
  assert.strictEqual(sb.tablas.mensajes.filter(f => f.direccion === 'salida').length, 0);
});

test('un mensaje de Instagram con foto se guarda con su archivo copiado al almacén', async () => {
  preparar([]);
  const cuerpo = Buffer.from(JSON.stringify({ object: 'instagram', entry: [{ messaging: [{ sender: { id: '17841400000001234' }, message: { mid: 'mid.F1', attachments: [{ type: 'image', payload: { url: 'https://scontent.fbcdn.net/foto.jpg' } }] } }] }] }));
  const req = new EventEmitter(); req.method = 'POST'; req.headers = { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'secreto').update(cuerpo).digest('hex') };
  const res = { writeHead() {}, end() {} };
  process.nextTick(() => { req.emit('data', cuerpo); req.emit('end'); });
  await M.manejarMeta(req, res, new URL('http://x/api/meta'));
  const f = sb.tablas.mensajes[0];
  assert.strictEqual(f.tipo, 'image');
  assert.strictEqual(f.texto, '');
  assert.match(f.media.u, /^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/envios\/entrada\/[0-9a-f]+\.jpg$/);
});

test('carpetas de Instagram: devuelve referencias por carpeta y anota la que falle sin romper las otras', async () => {
  preparar([], { meta: u => {
    if (u.includes('folder=requests')) return resp(false, { error: { message: 'carpeta no válida' } });
    const id = u.includes('folder=primary') ? '111' : '222';
    return resp(true, { data: [{ participants: { data: [{ id }, { id: '999' }] } }] });
  } });
  const r = await M.carpetasInstagram();
  assert.ok(r.principal.includes(mensajes.refDe('111')));
  assert.ok(r.general.includes(mensajes.refDe('222')));
  assert.deepStrictEqual(r.solicitudes, []);
  assert.match(r.errores.solicitudes, /carpeta no válida/);
  assert.ok(!JSON.stringify(r).includes('"111"'));
});

test('fotoContacto pide la foto de perfil a Instagram o Facebook y solo acepta direcciones de Meta', async () => {
  preparar([fila(1), fila(2, { red: 'facebook', contacto: '555' })], { meta: u => u.includes('/17841400000001234?') ? resp(true, { profile_pic: 'https://scontent.cdninstagram.com/yo.jpg' }) : resp(true, { profile_pic: 'https://malo.example.com/x.jpg' }) });
  assert.strictEqual(await M.fotoContacto('instagram', ref()), 'https://scontent.cdninstagram.com/yo.jpg');
  assert.match(meta[0].url, /fields=profile_pic/);
  assert.strictEqual(await M.fotoContacto('facebook', mensajes.refDe('555')), '');
  assert.strictEqual(await M.fotoContacto('whatsapp', ref()), '');   // WhatsApp no entrega fotos de perfil
  const antes = meta.length; await M.fotoContacto('instagram', ref());
  assert.strictEqual(meta.length, antes);   // la segunda vez sale de la memoria
});
