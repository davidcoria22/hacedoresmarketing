// Ventas de la tienda (WooCommerce en WordPress): cuántas van hoy y en el mes, y las más recientes.
// Solo lee pedidos pagados (en proceso o completados). No trae datos de clientes: únicamente producto, total y hora.
// Variables de entorno:
//   WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET  claves de la API REST de WooCommerce (permiso: solo lectura)
//   WOO_URL                                (opcional) dirección de la tienda; por defecto https://hacedores.com
const base = () => (process.env.WOO_URL || 'https://hacedores.com').replace(/\/+$/, '');
const configurado = () => !!(process.env.WOO_CONSUMER_KEY && process.env.WOO_CONSUMER_SECRET);

async function pagina(n, desde) {
  const auth = Buffer.from(process.env.WOO_CONSUMER_KEY + ':' + process.env.WOO_CONSUMER_SECRET).toString('base64');
  const q = new URLSearchParams({ status: 'processing,completed', per_page: '100', page: String(n), orderby: 'date', order: 'desc', after: desde, _fields: 'id,date_created,date_created_gmt,total,currency,status,line_items' });
  const r = await fetch(base() + '/wp-json/wc/v3/orders?' + q, { headers: { Authorization: 'Basic ' + auth, Accept: 'application/json', 'User-Agent': 'Hacedores-Panel/1.0' }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 || r.status === 403) throw new Error('WooCommerce rechazó las claves. Revisa que sean de la API REST y con permiso de lectura.');
  if (!r.ok) throw new Error('WooCommerce respondió ' + r.status + '.');
  return r.json();
}

let cache = { t: 0, v: null };
// Resumen de ventas (se guarda 45 s para no cargar la tienda con cada consulta del panel)
async function resumen() {
  if (!configurado()) throw new Error('Falta conectar WooCommerce: crea las claves de la API REST y ponlas en las variables WOO_CONSUMER_KEY y WOO_CONSUMER_SECRET.');
  if (cache.v && Date.now() - cache.t < 45000) return cache.v;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());   // aaaa-mm-dd en México
  const mes = hoy.slice(0, 7);
  const desde = new Date(Date.now() - 36 * 86400000).toISOString();   // alcanza para todo el mes en curso
  let pedidos = [];
  for (let n = 1; n <= 6; n++) {
    const lote = await pagina(n, desde);
    pedidos = pedidos.concat(lote);
    if (lote.length < 100) break;
  }
  const suma = lista => ({ n: lista.length, total: Math.round(lista.reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100 });
  const delMes = pedidos.filter(p => String(p.date_created || '').slice(0, 7) === mes);   // date_created viene en la hora de la tienda
  const deHoy = delMes.filter(p => String(p.date_created).slice(0, 10) === hoy);
  const ultimas = [...pedidos].sort((a, b) => b.id - a.id).slice(0, 8).map(p => ({
    id: p.id, fecha: p.date_created_gmt ? p.date_created_gmt + 'Z' : '', total: Number(p.total) || 0, moneda: p.currency || 'MXN',
    productos: (p.line_items || []).map(i => String(i.name || '').slice(0, 80)).filter(Boolean),
  }));
  cache = { t: Date.now(), v: { configurado: true, hoy: suma(deHoy), mes: suma(delMes), ultimas, actualizado: new Date().toISOString() } };
  return cache.v;
}

module.exports = { resumen, configurado };
