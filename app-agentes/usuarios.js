// Usuarios y roles del panel. Se guardan en las pestañas "Usuarios" y "Roles" de la hoja de Google.
// Quién entra:
//   1) Las cuentas de AUTH_EMAILS (Vercel) son siempre Administrador y no se pueden quitar desde el panel (así nunca te quedas sin acceso).
//   2) Las personas agregadas en la pestaña Usuarios entran con el rol que tengan (si están activas).
//   3) Quien solo coincide con AUTH_DOMINIOS entra con el rol de AUTH_ROL_DOMINIO (por defecto "Solo lectura").
// Cada rol es una lista de permisos. Lo que no esté en la lista no se muestra y el servidor lo rechaza.
const PERMISOS = [
  { id: 'ver_inicio', texto: 'Ver Inicio', grupo: 'Secciones' },
  { id: 'ver_mensajes', texto: 'Ver Mensajes', grupo: 'Secciones' },
  { id: 'ver_redes', texto: 'Ver Redes', grupo: 'Secciones' },
  { id: 'ver_agentes', texto: 'Ver Agentes', grupo: 'Secciones' },
  { id: 'responder', texto: 'Responder mensajes de WhatsApp', grupo: 'Mensajes' },
  { id: 'anuncios_ver', texto: 'Ver los anuncios de Meta', grupo: 'Anuncios' },
  { id: 'anuncios_mensajes', texto: 'Editar los mensajes automáticos de cada anuncio', grupo: 'Anuncios' },
  { id: 'anuncios_control', texto: 'Pausar, reactivar y cambiar presupuestos', grupo: 'Anuncios' },
  { id: 'anuncios_crear', texto: 'Crear y publicar anuncios', grupo: 'Anuncios' },
  { id: 'ajustes_agentes', texto: 'Cambiar ajustes de los agentes y actualizar datos', grupo: 'Agentes' },
  { id: 'usuarios', texto: 'Administrar usuarios y roles', grupo: 'Administración' },
];
const IDS = PERMISOS.map(p => p.id);
const ROLES_BASE = [
  { nombre: 'Administrador', descripcion: 'Puede hacer todo, incluida la administración de usuarios.', permisos: IDS, fijo: true },
  { nombre: 'Atención al cliente', descripcion: 'Ve Inicio y Mensajes y contesta WhatsApp.', permisos: ['ver_inicio', 'ver_mensajes', 'responder'] },
  { nombre: 'Marketing', descripcion: 'Ve todo y maneja los anuncios; no cambia usuarios.', permisos: ['ver_inicio', 'ver_mensajes', 'ver_redes', 'ver_agentes', 'anuncios_ver', 'anuncios_mensajes', 'anuncios_control', 'anuncios_crear'] },
  { nombre: 'Solo lectura', descripcion: 'Ve todo, no cambia nada.', permisos: ['ver_inicio', 'ver_mensajes', 'ver_redes', 'ver_agentes', 'anuncios_ver'] },
];

const ayudas = () => require('./server.js').ayudas;
const db = require('./db.js');
const lista = t => String(t || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
const cab = token => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
const base = h => 'https://sheets.googleapis.com/v4/spreadsheets/' + h.SHEET_ID;
const rango = (h, pestana, a) => base(h) + '/values/' + encodeURIComponent(pestana + '!' + a);
const TABLAS = {
  Usuarios: { cols: ['email', 'nombre', 'rol', 'activo', 'creado', 'por'], ultima: 'F' },
  Roles: { cols: ['nombre', 'permisos', 'descripcion', 'actualizado'], ultima: 'D' },
};
const esEmail = e => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e) && e.length <= 120;

async function crearPestana(h, token, nombre) {
  const c = await h.petición('POST', base(h) + ':batchUpdate', JSON.stringify({ requests: [{ addSheet: { properties: { title: nombre } } }] }), cab(token));
  if (c.status !== 200 && !/already exists/i.test(c.body)) throw new Error('No se pudo crear la pestaña ' + nombre + ' (' + c.status + ')');
  const t = TABLAS[nombre];
  await h.petición('PUT', rango(h, nombre, 'A1:' + t.ultima + '1') + '?valueInputOption=RAW', JSON.stringify({ values: [t.cols] }), cab(token));
}
async function leerFilas(h, token, nombre) {
  const r = await h.petición('GET', rango(h, nombre, 'A2:' + TABLAS[nombre].ultima + '500'), null, cab(token));
  if (r.status === 400) return null;   // la pestaña todavía no existe
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  return JSON.parse(r.body).values || [];
}
// En Supabase no hay credenciales de Google que pedir: [h, token] van vacíos.
async function credencialesHoja() {
  if (db.usa('usuarios')) return [null, null];
  const h = ayudas();
  return [h, await h.tokenGoogle('spreadsheets')];
}
async function escribirFila(h, token, nombre, clave, fila) {
  if (db.usa('usuarios')) {   // la fila llega en el orden de las columnas de la hoja
    if (nombre === 'Usuarios') await db.upsert('usuarios', [{ email: fila[0], nombre: fila[1], rol: fila[2], activo: fila[3] !== 'NO', creado: fila[4] || null, por: fila[5] }], 'email');
    else await db.upsert('roles', [{ nombre: fila[0], permisos: String(fila[1] || '').split(',').filter(Boolean), descripcion: fila[2], actualizado: fila[3] }], 'nombre');
    cache = { t: 0, v: cache.v };
    return;
  }
  let filas = await leerFilas(h, token, nombre);
  if (filas === null) { await crearPestana(h, token, nombre); filas = []; }
  const i = filas.findIndex(f => String(f[0] || '').toLowerCase() === String(clave).toLowerCase());
  const u = TABLAS[nombre].ultima;
  const r = i >= 0
    ? await h.petición('PUT', rango(h, nombre, 'A' + (i + 2) + ':' + u + (i + 2)) + '?valueInputOption=RAW', JSON.stringify({ values: [fila] }), cab(token))
    : await h.petición('POST', rango(h, nombre, 'A:' + u) + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', JSON.stringify({ values: [fila] }), cab(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al guardar');
  cache = { t: 0, v: cache.v };
}
async function borrarFila(h, token, nombre, clave) {
  if (db.usa('usuarios')) {
    await db.remove(nombre === 'Usuarios' ? 'usuarios' : 'roles', { [nombre === 'Usuarios' ? 'email' : 'nombre']: 'eq.' + clave });
    cache = { t: 0, v: cache.v };
    return;
  }
  const filas = await leerFilas(h, token, nombre);
  const i = (filas || []).findIndex(f => String(f[0] || '').toLowerCase() === String(clave).toLowerCase());
  if (i < 0) return;
  const u = TABLAS[nombre].ultima;
  const vacia = TABLAS[nombre].cols.map(() => '');
  const r = await h.petición('PUT', rango(h, nombre, 'A' + (i + 2) + ':' + u + (i + 2)) + '?valueInputOption=RAW', JSON.stringify({ values: [vacia] }), cab(token));
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status);
  cache = { t: 0, v: cache.v };
}

let cache = { t: 0, v: null };   // se guarda 15 s; si la hoja falla se sigue con lo último que se supo
async function cargar() {
  if (cache.v && Date.now() - cache.t < 15000) return cache.v;
  try {
    let fu, fr;
    if (db.usa('usuarios')) {   // se convierten a las mismas filas de la hoja para no tocar la lógica de abajo
      const [tu, tr] = await Promise.all([db.select('usuarios'), db.select('roles')]);
      fu = tu.map(u => [u.email, u.nombre, u.rol, u.activo ? 'SI' : 'NO', u.creado || '', u.por]);
      fr = tr.map(r => [r.nombre, (r.permisos || []).join(','), r.descripcion, r.actualizado || '']);
    } else {
      const h = ayudas(), token = await h.tokenGoogle('spreadsheets.readonly');
      [fu, fr] = await Promise.all([leerFilas(h, token, 'Usuarios'), leerFilas(h, token, 'Roles')]);
    }
    const usuarios = (fu || []).filter(f => f[0]).map(f => ({ email: String(f[0]).trim().toLowerCase(), nombre: f[1] || '', rol: f[2] || '', activo: String(f[3] || 'SI').toUpperCase() !== 'NO', creado: f[4] || '', por: f[5] || '' }));
    const roles = ROLES_BASE.map(r => ({ ...r }));
    for (const f of fr || []) {
      const nombre = String(f[0] || '').trim(); if (!nombre) continue;
      const permisos = String(f[1] || '').split(',').map(s => s.trim()).filter(p => IDS.includes(p));
      const i = roles.findIndex(r => r.nombre.toLowerCase() === nombre.toLowerCase());
      if (i >= 0) { if (!roles[i].fijo) roles[i] = { ...roles[i], permisos, descripcion: f[2] || roles[i].descripcion, editado: true }; }
      else roles.push({ nombre, permisos, descripcion: f[2] || '', fijo: false, propio: true });
    }
    cache = { t: Date.now(), v: { usuarios, roles } };
  } catch (e) {
    if (!cache.v) throw e;
    console.error('usuarios: se usa la última lista conocida (' + e.message + ')');
    cache = { t: Date.now() - 10000, v: cache.v };
  }
  return cache.v;
}

const conjunto = r => new Set(r ? r.permisos : []);
const TODOS = () => new Set(IDS);
// Qué puede hacer una cuenta de Google: { rol, permisos:Set, origen } o null si no tiene acceso
async function acceso(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  const deVercel = lista(process.env.AUTH_EMAILS).includes(email);
  let datos;
  try { datos = await cargar(); }
  catch (e) { if (deVercel) return { rol: 'Administrador', permisos: TODOS(), origen: 'vercel' }; throw e; }   // si la hoja falla, quien está en Vercel sigue pudiendo entrar
  const { usuarios, roles } = datos;
  const u = usuarios.find(x => x.email === email);
  if (u) {   // lo que se guarda en el panel manda, también para las cuentas de Vercel
    if (!u.activo) return null;
    const rol = roles.find(r => r.nombre.toLowerCase() === u.rol.toLowerCase());
    return { rol: rol ? rol.nombre : u.rol, permisos: conjunto(rol), origen: deVercel ? 'vercel' : 'hoja' };
  }
  if (deVercel) return { rol: 'Administrador', permisos: TODOS(), origen: 'vercel' };   // sin cambios guardados: administrador
  const dominio = email.split('@')[1];
  if (dominio && lista(process.env.AUTH_DOMINIOS).includes(dominio)) {
    const nombre = process.env.AUTH_ROL_DOMINIO || 'Solo lectura';
    const rol = roles.find(r => r.nombre.toLowerCase() === nombre.toLowerCase());
    return { rol: rol ? rol.nombre : nombre, permisos: conjunto(rol), origen: 'dominio' };
  }
  return null;
}

// ---------- lo que ve y edita la pantalla de administración ----------
async function listar() {
  const { usuarios, roles } = await cargar();
  const env = lista(process.env.AUTH_EMAILS).map(email => { const u = usuarios.find(x => x.email === email); return u ? { ...u, origen: 'vercel' } : { email, nombre: '', rol: 'Administrador', activo: true, origen: 'vercel' }; });
  const deLaHoja = usuarios.filter(u => !env.some(e => e.email === u.email)).map(u => ({ ...u, origen: 'hoja' }));
  const usados = new Set([...env, ...deLaHoja].map(u => u.rol.toLowerCase()));
  return { permisos: PERMISOS, usuarios: [...env, ...deLaHoja], roles: roles.map(r => ({ ...r, enUso: usados.has(r.nombre.toLowerCase()) })) };
}

async function guardarUsuario(d, quien) {
  const email = String(d.email || '').trim().toLowerCase();
  if (!esEmail(email)) return { ok: false, error: 'Escribe un correo válido.' };
  if (email === String(quien || '').toLowerCase()) return { ok: false, error: 'No puedes cambiar tu propio acceso (para que nunca te quedes sin poder entrar).' };
  const { roles, usuarios } = await cargar();
  const rol = roles.find(r => r.nombre.toLowerCase() === String(d.rol || '').toLowerCase());
  if (!rol) return { ok: false, error: 'Elige un rol de la lista.' };
  const previo = usuarios.find(u => u.email === email);
  const nombre = String(d.nombre ?? (previo && previo.nombre) ?? '').trim().slice(0, 60);
  const activo = d.activo === false || d.activo === 'NO' ? 'NO' : 'SI';
  const [h, token] = await credencialesHoja();
  await escribirFila(h, token, 'Usuarios', email, [email, nombre, rol.nombre, activo, (previo && previo.creado) || new Date().toISOString(), (previo && previo.por) || String(quien || '').slice(0, 80)]);
  return { ok: true };
}
async function quitarUsuario(email, quien) {
  email = String(email || '').trim().toLowerCase();
  if (email === String(quien || '').toLowerCase()) return { ok: false, error: 'No puedes quitarte a ti mismo.' };
  if (lista(process.env.AUTH_EMAILS).includes(email)) return { ok: false, error: 'Esa cuenta viene de Vercel y no se quita desde aquí. Puedes cambiarle el rol o desactivarla.' };
  const [h, token] = await credencialesHoja();
  await borrarFila(h, token, 'Usuarios', email);
  return { ok: true };
}
async function guardarRol(d) {
  const nombre = String(d.nombre || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2 || nombre.length > 40 || /[,;]/.test(nombre)) return { ok: false, error: 'El nombre del rol debe tener de 2 a 40 letras, sin comas.' };
  if (nombre.toLowerCase() === 'administrador') return { ok: false, error: 'El rol Administrador no se puede cambiar.' };
  const permisos = [...new Set((Array.isArray(d.permisos) ? d.permisos : []).filter(p => IDS.includes(p)))];
  if (permisos.includes('usuarios')) return { ok: false, error: 'Solo el rol Administrador puede administrar usuarios.' };
  const { roles } = await cargar();
  const previo = roles.find(r => r.nombre.toLowerCase() === nombre.toLowerCase());
  if (!previo && d.nuevo !== true) return { ok: false, error: 'Ese rol no existe.' };
  if (previo && d.nuevo === true) return { ok: false, error: 'Ya hay un rol con ese nombre.' };
  const [h, token] = await credencialesHoja();
  await escribirFila(h, token, 'Roles', previo ? previo.nombre : nombre, [previo ? previo.nombre : nombre, permisos.join(','), String(d.descripcion || '').trim().slice(0, 120), new Date().toISOString()]);
  return { ok: true };
}
async function quitarRol(nombre) {
  nombre = String(nombre || '').trim();
  const { roles, usuarios } = await cargar();
  const r = roles.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (!r) return { ok: true };
  if (r.fijo) return { ok: false, error: 'El rol Administrador no se puede quitar.' };
  if (usuarios.some(u => u.rol.toLowerCase() === r.nombre.toLowerCase())) return { ok: false, error: 'Hay personas con este rol. Cámbialas a otro rol primero.' };
  const [h, token] = await credencialesHoja();
  if (ROLES_BASE.some(b => b.nombre.toLowerCase() === r.nombre.toLowerCase())) {   // un rol de fábrica "se restaura" quitando su cambio
    await borrarFila(h, token, 'Roles', r.nombre);
    return { ok: true, nota: 'Los roles de fábrica no se eliminan: vuelve a su configuración original.' };
  }
  await borrarFila(h, token, 'Roles', r.nombre);
  return { ok: true };
}

module.exports = { PERMISOS, IDS, acceso, listar, guardarUsuario, quitarUsuario, guardarRol, quitarRol };
