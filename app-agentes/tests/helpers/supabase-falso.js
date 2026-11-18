// Supabase en memoria para las pruebas: entiende lo que usa db.js (filtros eq/neq/lte/gte/in, order, limit,
// insert con ignore-duplicates, upsert, update y delete). Cada operación es síncrona, así que es atómica como en la base real.
function crear(inicial = {}, claves = {}) {
  const tablas = JSON.parse(JSON.stringify(inicial));
  const llamadas = [];
  let caido = false;
  let seq = 0;
  const valor = (fila, col) => {
    const m = col.match(/^(\w+)->>(\w+)$/);
    return m ? (fila[m[1]] ? fila[m[1]][m[2]] : undefined) : fila[col];
  };
  const cumple = (fila, params) => Object.entries(params).every(([col, cond]) => {
    if (['order', 'limit', 'offset', 'select', 'on_conflict'].includes(col)) return true;
    const i = cond.indexOf('.'), op = cond.slice(0, i), v = cond.slice(i + 1), x = valor(fila, col);
    if (op === 'eq') return String(x) === v;
    if (op === 'neq') return String(x) !== v;
    if (op === 'lte') return Date.parse(x) <= Date.parse(v);
    if (op === 'gte') return Date.parse(x) >= Date.parse(v);
    if (op === 'in') return v.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(x));
    throw new Error('operador no soportado en el simulador: ' + op);
  });
  const ordenar = (filas, orden) => {
    if (!orden) return filas;
    const [col, dir] = orden.split('.');
    return [...filas].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  };
  const fetchFalso = async (url, o = {}) => {
    const u = new URL(url), metodo = o.method || 'GET', tabla = u.pathname.split('/').pop();
    const params = Object.fromEntries(u.searchParams), prefer = (o.headers || {}).Prefer || '';
    llamadas.push({ metodo, tabla, params, cuerpo: o.body ? JSON.parse(o.body) : null, url: String(url), prefer });
    if (caido) return { ok: false, status: 500, text: async () => 'caído' };
    const filas = tablas[tabla] = tablas[tabla] || [];
    const devolver = datos => ({ ok: true, status: 200, text: async () => JSON.stringify(datos) });
    if (metodo === 'GET') {
      let r = ordenar(filas.filter(f => cumple(f, params)), params.order);
      if (params.offset) r = r.slice(Number(params.offset));
      if (params.limit) r = r.slice(0, Number(params.limit));
      return devolver(r);
    }
    if (metodo === 'POST') {
      const clave = params.on_conflict, nuevas = JSON.parse(o.body), hechas = [];
      for (const n of nuevas) {
        const i = clave ? filas.findIndex(f => f[clave] === n[clave]) : -1;
        if (i >= 0) { if (/merge-duplicates/.test(prefer)) { filas[i] = { ...filas[i], ...n }; hechas.push(filas[i]); } continue; }
        const fila = { ...n };
        if (claves[tabla] === 'seq') fila.seq = ++seq;
        filas.push(fila); hechas.push(fila);
      }
      return devolver(hechas);
    }
    if (metodo === 'PATCH') {
      const cambios = JSON.parse(o.body), tocadas = [];
      for (const f of filas) if (cumple(f, params)) { Object.assign(f, cambios); tocadas.push({ ...f }); }
      return devolver(tocadas);
    }
    if (metodo === 'DELETE') {
      const fuera = filas.filter(f => cumple(f, params));
      tablas[tabla] = filas.filter(f => !fuera.includes(f));
      return devolver(fuera);
    }
    throw new Error('método no soportado: ' + metodo);
  };
  return { tablas, llamadas, fetch: fetchFalso, caer: () => { caido = true; }, levantar: () => { caido = false; } };
}
module.exports = { crear };
