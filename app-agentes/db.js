// Acceso a Supabase (API REST) sin dependencias. Solo lo usa el servidor, con la llave de servicio.
// Cada módulo decide con usa('<módulo>') si guarda en Supabase o en la hoja de Google (variable DB_<MÓDULO>=supabase).
const configurado = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const usa = modulo => configurado() && process.env['DB_' + String(modulo).toUpperCase()] === 'supabase';

async function pedir(metodo, tabla, params, cuerpo, prefer) {
  const base = String(process.env.SUPABASE_URL).replace(/\/+$/, '');
  const q = new URLSearchParams(params || {}).toString();
  const llave = process.env.SUPABASE_SERVICE_KEY;
  const cab = { apikey: llave, Authorization: 'Bearer ' + llave };
  if (cuerpo !== undefined) cab['Content-Type'] = 'application/json';
  if (prefer) cab.Prefer = prefer;
  const r = await fetch(base + '/rest/v1/' + tabla + (q ? '?' + q : ''), {
    method: metodo, headers: cab, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error('Supabase respondió ' + r.status + ': ' + String(texto).slice(0, 200));
  return texto ? JSON.parse(texto) : [];
}

const select = (tabla, params) => pedir('GET', tabla, params);
const insert = (tabla, filas, { ignorarDuplicados = false, conflicto } = {}) => pedir('POST', tabla,
  conflicto ? { on_conflict: conflicto } : {}, filas, 'return=representation' + (ignorarDuplicados ? ',resolution=ignore-duplicates' : ''));
const upsert = (tabla, filas, conflicto) => pedir('POST', tabla, { on_conflict: conflicto }, filas, 'return=representation,resolution=merge-duplicates');
const update = (tabla, params, cambios) => pedir('PATCH', tabla, params, cambios, 'return=representation');
const remove = async (tabla, params) => (await pedir('DELETE', tabla, params, undefined, 'return=representation')).length;

module.exports = { configurado, usa, select, insert, upsert, update, remove };
