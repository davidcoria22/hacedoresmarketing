const test = require('node:test');
const assert = require('node:assert');
const m = require('../scripts/migrar-a-supabase.js');
const { claveDe, refDe } = require('../mensajes.js');

test('las filas en blanco (las que el panel "borraba") no se copian', () => {
  const vacia = ['', '', '', '', '', '', '', '', '', '', '', '', ''];
  for (const f of ['filaAUsuario', 'filaARol', 'filaAAjuste', 'filaAAnuncio', 'filaAPendiente', 'filaAMensaje']) {
    assert.strictEqual(m[f](vacia), null, f);
    assert.strictEqual(m[f]([]), null, f + ' con fila vacía');
  }
});

test('usuario: correo en minúsculas, activo NO a false y sin columna activo es true', () => {
  assert.deepStrictEqual(m.filaAUsuario(['ANA@X.COM', 'Ana', 'Marketing', 'NO', '2026-01-01T00:00:00.000Z', 'yo']),
    { email: 'ana@x.com', nombre: 'Ana', rol: 'Marketing', activo: false, creado: '2026-01-01T00:00:00.000Z', por: 'yo' });
  const sinActivo = m.filaAUsuario(['b@x.com', '', 'Solo lectura']);
  assert.strictEqual(sinActivo.activo, true);
  assert.strictEqual(sinActivo.creado, null);
});

test('rol: permisos separados por comas pasan a arreglo', () => {
  const r = m.filaARol(['Becario', 'ver_inicio, responder', 'Ayuda', '2026-01-01T00:00:00.000Z']);
  assert.deepStrictEqual(r.permisos, ['ver_inicio', 'responder']);
  assert.strictEqual(r.nombre, 'Becario');
  assert.deepStrictEqual(m.filaARol(['Sin permisos', '', '', '']).permisos, []);
});

test('ajuste: el JSON de la hoja pasa a objeto y una fila dañada se salta', () => {
  assert.deepStrictEqual(m.filaAAjuste(['publicaciones', '{"nombre":"A"}', '2026-01-01T00:00:00.000Z']).valores, { nombre: 'A' });
  assert.strictEqual(m.filaAAjuste(['publicaciones', '{roto', '']), null);
});

test('anuncio: las palabras separadas por comas pasan a arreglo', () => {
  const a = m.filaAAnuncio(['taller', 'Taller', 'taller, verano', 'Hola', 'Sigues?', '2026-01-01T00:00:00.000Z']);
  assert.deepStrictEqual(a.palabras, ['taller', 'verano']);
  assert.deepStrictEqual(m.filaAAnuncio(['general', 'General', '', 'Hola', 'Sigues?', '']).palabras, []);
});

test('pendiente: conserva estado y vence en ISO; el tipo vacío es "primero"', () => {
  const p = m.filaAPendiente(['wamid.1', '5215512345678', '2026-11-17T12:00:00.000Z', 'pendiente', '', '2026-11-17T11:00:00.000Z', '', 'inv']);
  assert.deepStrictEqual([p.id, p.telefono, p.vence, p.estado, p.tipo, p.anuncio], ['wamid.1', '5215512345678', '2026-11-17T12:00:00.000Z', 'pendiente', 'primero', 'inv']);
  assert.strictEqual(m.filaAPendiente(['x', '1', 'no-es-fecha', 'pendiente']), null);
});

test('mensaje: media a objeto, ref calculada y clave igual a la del servidor', () => {
  const fila = ['2026-11-17T12:00:00.000Z', 'whatsapp', 'Ana', '+52••••5678', 'image', 'hola', 'anuncio', 'enviada', 'wamid.1', 'entrada', '5215512345678', '{"t":"image","id":"MED1"}', ''];
  const r = m.filaAMensaje(fila);
  assert.deepStrictEqual(r.media, { t: 'image', id: 'MED1' });
  assert.strictEqual(r.ref, refDe('5215512345678'));
  assert.strictEqual(r.clave, 'wamid.1');
  assert.strictEqual(r.direccion, 'entrada');
  assert.strictEqual(r.fecha, '2026-11-17T12:00:00.000Z');
});

test('mensaje sin id: la misma fila da siempre la misma clave, igual a claveDe (así la migración y el servidor no duplican)', () => {
  const fila = ['2026-11-17T12:00:00.000Z', 'whatsapp', 'Agente', '+52••••5678', 'text', 'Hola desde el panel', 'panel', '', '', 'salida', '5215512345678', '', 'Luis'];
  const a = m.filaAMensaje(fila), b = m.filaAMensaje([...fila]);
  assert.strictEqual(a.clave, b.clave);
  assert.strictEqual(a.clave, claveDe({ fecha: fila[0], red: 'whatsapp', contacto: '5215512345678', direccion: 'salida', texto: 'Hola desde el panel' }));
  assert.strictEqual(a.media, null);
  assert.strictEqual(a.autor, 'Luis');
});

test('mensaje: la dirección vacía se trata como entrada y la media dañada como sin archivo', () => {
  const r = m.filaAMensaje(['2026-11-17T12:00:00.000Z', 'facebook', 'Ana', 'ID ••12', 'text', 'hola', 'x', '', 'm.1', '', '', '{roto', '']);
  assert.strictEqual(r.direccion, 'entrada');
  assert.strictEqual(r.media, null);
});

test('unicas deja una sola fila por clave (la última), porque un upsert con claves repetidas en un lote falla', () => {
  const r = m.unicas([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }], 'id');
  assert.deepStrictEqual(r.sort((x, y) => x.id.localeCompare(y.id)), [{ id: 'a', v: 3 }, { id: 'b', v: 2 }]);
});

// ---- el script completo contra una hoja y un Supabase simulados ----
const { crear } = require('./helpers/supabase-falso.js');

async function correr(argv, hoja) {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  const sb = crear({}, { mensajes: 'seq' });
  global.fetch = sb.fetch;
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: {
    SHEET_ID: 'HOJA', tokenGoogle: async () => 't',
    petición: async (metodo, url) => {
      const pestana = decodeURIComponent(url).match(/values\/([A-Za-z]+)!/)[1];
      return hoja[pestana] ? { status: 200, body: JSON.stringify({ values: hoja[pestana] }) } : { status: 400, body: '{}' };
    },
  } } };
  delete require.cache[require.resolve('../db.js')];
  const salida = [];
  const log = console.log; console.log = (...a) => salida.push(a.join(' '));
  let codigo;
  try { codigo = await m.main(argv); } finally { console.log = log; }
  return { sb, salida: salida.join('\n'), codigo };
}

const HOJA = {
  Usuarios: [['ANA@X.COM', 'Ana', 'Marketing', 'SI', '2026-01-01T00:00:00.000Z', 'yo'], ['', '', '', '', '', ''], ['ana@x.com', 'Ana B', 'Marketing', 'NO', '', '']],
  Mensajes: [
    ['2026-11-17T12:00:00.000Z', 'whatsapp', 'Ana', '+52••••5678', 'text', 'texto privado uno', 'anuncio', '', 'wamid.1', 'entrada', '5215512345678', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['2026-11-17T12:01:00.000Z', 'whatsapp', 'Agente', '+52••••5678', 'text', 'texto privado dos', 'panel', '', '', 'salida', '5215512345678', '', 'Luis'],
    ['2026-11-17T12:01:00.000Z', 'whatsapp', 'Agente', '+52••••5678', 'text', 'texto privado dos', 'panel', '', '', 'salida', '5215512345678', '', 'Luis'],
  ],
};

test('migración completa: copia lo que hay, salta lo vacío, no duplica al repetirse y no imprime datos privados', async () => {
  const una = await correr(['--solo=usuarios,mensajes'], HOJA);
  assert.strictEqual(una.codigo, 0);
  assert.strictEqual(una.sb.tablas.usuarios.length, 1);
  assert.strictEqual(una.sb.tablas.usuarios[0].email, 'ana@x.com');
  assert.strictEqual(una.sb.tablas.usuarios[0].activo, false);   // gana la última fila de la misma persona
  assert.strictEqual(una.sb.tablas.mensajes.length, 2);          // la fila en blanco y la repetida no cuentan
  assert.ok(!/texto privado|5215512345678|Ana/.test(una.salida), una.salida);
  assert.match(una.salida, /mensajes: hoja 3 con datos, 2 distintas · Supabase 2 ✔/);
  // segunda ejecución sobre la base que ya tiene los datos: mismo conteo
  const base = una.sb;
  global.fetch = base.fetch;
  const dos = await (async () => { const log = console.log; console.log = () => {}; try { return await m.main(['--solo=usuarios,mensajes']); } finally { console.log = log; } })();
  assert.strictEqual(dos, 0);
  assert.strictEqual(base.tablas.mensajes.length, 2);
  assert.strictEqual(base.tablas.usuarios.length, 1);
});

test('--seco no escribe nada y funciona sin llaves de Supabase', async () => {
  const r = await correr(['--seco', '--solo=usuarios'], HOJA);
  assert.strictEqual(r.codigo, 0);
  assert.strictEqual(r.sb.llamadas.length, 0);
  assert.match(r.salida, /modo seco/);
});

test('una pestaña que no existe en la hoja se avisa y no rompe', async () => {
  const r = await correr(['--solo=roles'], {});
  assert.strictEqual(r.codigo, 0);
  assert.match(r.salida, /no tiene la pestaña Roles/);
});
