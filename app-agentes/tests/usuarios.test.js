const test = require('node:test');
const assert = require('node:assert');

let tablas, escrituras, caido, usuarios;

test.beforeEach(() => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.DB_USUARIOS = 'supabase';
  process.env.AUTH_EMAILS = 'admin@x.com';
  delete process.env.AUTH_DOMINIOS;
  tablas = { usuarios: [], roles: [] };
  escrituras = [];
  caido = false;
  global.fetch = async (url, o = {}) => {
    const metodo = o.method || 'GET';
    const tabla = new URL(url).pathname.split('/').pop();
    if (caido) return { ok: false, status: 500, text: async () => 'caído' };
    if (metodo === 'GET') return { ok: true, status: 200, text: async () => JSON.stringify(tablas[tabla]) };
    escrituras.push({ metodo, tabla, url: String(url), cuerpo: o.body ? JSON.parse(o.body) : null });
    return { ok: true, status: 200, text: async () => JSON.stringify(metodo === 'DELETE' ? [{}] : o.body ? JSON.parse(o.body) : []) };
  };
  const rutaServer = require.resolve('../server.js');
  require.cache[rutaServer] = { id: rutaServer, filename: rutaServer, loaded: true, exports: { ayudas: { tokenGoogle: async () => { throw new Error('hoja'); } } } };
  for (const m of ['../db.js', '../usuarios.js']) delete require.cache[require.resolve(m)];
  usuarios = require('../usuarios.js');
});

test('una cuenta de AUTH_EMAILS es Administrador aunque la tabla esté vacía (sin importar mayúsculas)', async () => {
  const a = await usuarios.acceso('ADMIN@x.com');
  assert.strictEqual(a.rol, 'Administrador');
  assert.strictEqual(a.permisos.has('usuarios'), true);
});

test('un usuario activo recibe los permisos de su rol de fábrica', async () => {
  tablas.usuarios = [{ email: 'ana@x.com', nombre: 'Ana', rol: 'Marketing', activo: true, creado: null, por: '' }];
  const a = await usuarios.acceso('ana@x.com');
  assert.strictEqual(a.rol, 'Marketing');
  assert.strictEqual(a.permisos.has('anuncios_crear'), true);
  assert.strictEqual(a.permisos.has('usuarios'), false);
});

test('un usuario inactivo no entra', async () => {
  tablas.usuarios = [{ email: 'ana@x.com', nombre: '', rol: 'Marketing', activo: false }];
  assert.strictEqual(await usuarios.acceso('ana@x.com'), null);
});

test('un rol propio de la tabla se suma a los de fábrica', async () => {
  tablas.roles = [{ nombre: 'Becario', permisos: ['ver_inicio', 'no_existe'], descripcion: 'Solo inicio' }];
  tablas.usuarios = [{ email: 'b@x.com', nombre: '', rol: 'Becario', activo: true }];
  const a = await usuarios.acceso('b@x.com');
  assert.deepStrictEqual([...a.permisos], ['ver_inicio']);
  const { roles } = await usuarios.listar();
  assert.ok(roles.some(r => r.nombre === 'Becario' && r.propio));
});

test('guardarUsuario hace upsert por email en minúsculas', async () => {
  const r = await usuarios.guardarUsuario({ email: 'Ana@X.com', rol: 'Marketing', nombre: 'Ana' }, 'admin@x.com');
  assert.deepStrictEqual(r, { ok: true });
  const w = escrituras.find(e => e.tabla === 'usuarios');
  assert.match(w.url, /on_conflict=email/);
  assert.strictEqual(w.cuerpo[0].email, 'ana@x.com');
  assert.strictEqual(w.cuerpo[0].rol, 'Marketing');
  assert.strictEqual(w.cuerpo[0].activo, true);
});

test('guardarUsuario conserva las validaciones y no escribe si fallan', async () => {
  const r = await usuarios.guardarUsuario({ email: 'admin@x.com', rol: 'Marketing' }, 'admin@x.com');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(escrituras.length, 0);
});

test('quitarUsuario borra por email', async () => {
  const r = await usuarios.quitarUsuario('Ana@x.com', 'admin@x.com');
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(escrituras[0].metodo, 'DELETE');
  assert.match(escrituras[0].url, /email=eq\.ana%40x\.com/);
});

test('guardarRol hace upsert por nombre con los permisos válidos', async () => {
  const r = await usuarios.guardarRol({ nombre: 'Becario', permisos: ['ver_inicio', 'basura'], nuevo: true });
  assert.deepStrictEqual(r, { ok: true });
  const w = escrituras.find(e => e.tabla === 'roles');
  assert.match(w.url, /on_conflict=nombre/);
  assert.deepStrictEqual(w.cuerpo[0].permisos, ['ver_inicio']);
});

test('quitarRol de un rol de fábrica editado borra su fila y avisa que se restaura', async () => {
  tablas.roles = [{ nombre: 'Marketing', permisos: ['ver_inicio'], descripcion: 'x' }];
  const r = await usuarios.quitarRol('Marketing');
  assert.strictEqual(r.ok, true);
  assert.match(r.nota, /fábrica/);
  assert.strictEqual(escrituras[0].metodo, 'DELETE');
  assert.match(escrituras[0].url, /roles\?nombre=eq\.Marketing/);
});

test('si Supabase falla, los administradores de AUTH_EMAILS siguen entrando', async () => {
  caido = true;
  const a = await usuarios.acceso('admin@x.com');
  assert.strictEqual(a.rol, 'Administrador');
  assert.strictEqual(a.origen, 'vercel');
});

test('si Supabase falla y la cuenta no es de Vercel, el error sale (no se concede acceso)', async () => {
  caido = true;
  await assert.rejects(() => usuarios.acceso('otro@x.com'), /Supabase respondió 500/);
});
