// Copia los datos de las pestañas de la hoja de Google a las tablas de Supabase. Se puede ejecutar varias veces: hace upsert, no duplica.
//   node app-agentes/scripts/migrar-a-supabase.js [--seco] [--solo=ajustes,usuarios,roles,anuncios,pendientes,mensajes]
// --seco: solo lee la hoja y cuenta; no necesita Supabase ni escribe nada.
// La pestaña "Hacedores" (seguidores) no se toca. Nunca imprime teléfonos ni textos de mensajes.
const { claveDe, refDe } = require('../mensajes.js');

const texto = v => String(v ?? '').trim();
const vacia = f => !f || f.every(c => texto(c) === '');
const iso = v => { const t = Date.parse(v); return texto(v) && !isNaN(t) ? new Date(t).toISOString() : null; };
const lista = v => texto(v).split(',').map(s => s.trim()).filter(Boolean);
const objeto = v => { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; } };

// Cada convertidor recibe la fila de la hoja (arreglo de celdas) y devuelve la fila de la tabla, o null si está en blanco o dañada.
const filaAAjuste = f => {
  if (vacia(f) || !texto(f[0])) return null;
  const valores = objeto(f[1]);
  return valores ? { agente: texto(f[0]), valores, actualizado: iso(f[2]) || new Date().toISOString() } : null;
};
const filaAUsuario = f => {
  if (vacia(f) || !texto(f[0])) return null;
  return { email: texto(f[0]).toLowerCase(), nombre: texto(f[1]), rol: texto(f[2]), activo: texto(f[3] || 'SI').toUpperCase() !== 'NO', creado: iso(f[4]), por: texto(f[5]) };
};
const filaARol = f => {
  if (vacia(f) || !texto(f[0])) return null;
  return { nombre: texto(f[0]), permisos: lista(f[1]), descripcion: texto(f[2]), actualizado: iso(f[3]) || new Date().toISOString() };
};
const filaAAnuncio = f => {
  if (vacia(f) || !texto(f[0])) return null;
  return { id: texto(f[0]), nombre: texto(f[1]), palabras: lista(f[2]), mensaje: texto(f[3]), seguimiento: texto(f[4]), actualizado: iso(f[5]) || new Date().toISOString() };
};
const filaAPendiente = f => {
  if (vacia(f) || !texto(f[0])) return null;
  const vence = iso(f[2]);
  if (!vence) return null;
  return { id: texto(f[0]), telefono: texto(f[1]), vence, estado: texto(f[3]) || 'pendiente', detalle: texto(f[4]), creado: iso(f[5]) || vence, tipo: texto(f[6]) || 'primero', anuncio: texto(f[7]) };
};
// Columnas de la pestaña Mensajes: fecha, red, nombre, telefono, tipo, texto, origen, respuesta, id, direccion, contacto, media, autor
const filaAMensaje = f => {
  if (vacia(f)) return null;
  const fecha = iso(f[0]);
  if (!fecha) return null;
  const contacto = texto(f[10]).replace(/\D/g, '');
  const direccion = texto(f[9]) || 'entrada';
  return {
    clave: claveDe({ id: texto(f[8]), fecha, red: texto(f[1]), contacto, direccion, texto: f[5] || '' }),   // igual que al guardar en vivo
    fecha, red: texto(f[1]), nombre: f[2] || '', telefono: texto(f[3]), tipo: texto(f[4]), texto: f[5] || '', origen: texto(f[6]), respuesta: texto(f[7]),
    id: texto(f[8]), direccion, contacto, ref: contacto ? refDe(contacto) : '', media: objeto(f[11]), autor: texto(f[12]),
  };
};

// Un upsert con la misma clave dos veces en un lote falla: se deja una sola fila por clave (la última).
const unicas = (filas, clave) => [...new Map(filas.map(r => [r[clave], r])).values()];

const TABLAS = [
  { tabla: 'ajustes', pestana: 'Ajustes', rango: 'A2:C200', convertir: filaAAjuste, clave: 'agente' },
  { tabla: 'usuarios', pestana: 'Usuarios', rango: 'A2:F500', convertir: filaAUsuario, clave: 'email' },
  { tabla: 'roles', pestana: 'Roles', rango: 'A2:D500', convertir: filaARol, clave: 'nombre' },
  { tabla: 'anuncios', pestana: 'Anuncios', rango: 'A2:F300', convertir: filaAAnuncio, clave: 'id' },
  { tabla: 'pendientes', pestana: 'Pendientes', rango: 'A2:H50000', convertir: filaAPendiente, clave: 'id' },
  { tabla: 'mensajes', pestana: 'Mensajes', rango: 'A2:M50000', convertir: filaAMensaje, clave: 'clave' },
];

async function leerPestana(ayudas, token, t) {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + ayudas.SHEET_ID + '/values/' + encodeURIComponent(t.pestana + '!' + t.rango);
  const r = await ayudas.petición('GET', url, null, { Authorization: 'Bearer ' + token });
  if (r.status === 400) return null;   // la pestaña todavía no existe
  if (r.status !== 200) throw new Error('Google Sheets respondió ' + r.status + ' al leer ' + t.pestana);
  return JSON.parse(r.body).values || [];
}

async function contar(db, t) {   // Supabase entrega como máximo 1000 filas por consulta: se pide por páginas
  let n = 0;
  for (let desde = 0; ; desde += 1000) {
    const pag = await db.select(t.tabla, { select: t.clave, order: t.clave + '.asc', limit: '1000', offset: String(desde) });
    n += pag.length;
    if (pag.length < 1000) return n;
  }
}

async function main(argv) {
  const seco = argv.includes('--seco');
  const solo = (argv.find(a => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean);
  const ayudas = require('../server.js').ayudas;   // también carga app-agentes/.env
  const db = require('../db.js');
  if (!seco && !db.configurado()) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (ponlas en app-agentes/.env).'); return 1; }
  const token = await ayudas.tokenGoogle('spreadsheets.readonly');
  let mal = false;
  for (const t of TABLAS.filter(x => !solo.length || solo.includes(x.tabla))) {
    const filas = await leerPestana(ayudas, token, t);
    if (filas === null) { console.log(t.tabla + ': la hoja no tiene la pestaña ' + t.pestana + ' (nada que copiar)'); continue; }
    const conDatos = filas.filter(f => !vacia(f));
    const convertidas = conDatos.map(t.convertir).filter(Boolean);
    const distintas = unicas(convertidas, t.clave);
    const saltadas = conDatos.length - convertidas.length;
    let linea = t.tabla + ': hoja ' + conDatos.length + ' con datos' + (saltadas ? ', ' + saltadas + ' saltadas por estar dañadas' : '') + ', ' + distintas.length + ' distintas';
    if (seco) { console.log(linea + ' (modo seco: no se escribió nada)'); continue; }
    for (let i = 0; i < distintas.length; i += 500) await db.upsert(t.tabla, distintas.slice(i, i + 500), t.clave);
    const enSupabase = await contar(db, t);
    const ok = enSupabase >= distintas.length;
    if (!ok) mal = true;
    console.log(linea + ' · Supabase ' + enSupabase + (ok ? (enSupabase > distintas.length ? ' (hay filas nuevas que ya se guardaron en Supabase: normal)' : ' ✔') : ' ✖ FALTAN FILAS'));
  }
  return mal ? 1 : 0;
}

module.exports = { filaAAjuste, filaAUsuario, filaARol, filaAAnuncio, filaAPendiente, filaAMensaje, unicas, TABLAS, main };
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error('Error: ' + e.message); process.exit(1); });
