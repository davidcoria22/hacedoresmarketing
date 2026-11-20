// Archivos en Supabase Storage (carpeta pública "envios"): sirven para mandar fotos y videos por Instagram y Facebook
// (Meta los descarga desde una dirección web) y para guardar lo que recibimos (los enlaces de Meta caducan).
// Los nombres son aleatorios; solo quien tiene la dirección puede abrir el archivo.
const crypto = require('crypto');
const BUCKET = 'envios';
const configurado = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/3gpp': '.3gp', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.ogg', 'application/pdf': '.pdf', 'text/plain': '.txt' };

const cab = (extra = {}) => {
  const k = process.env.SUPABASE_SERVICE_KEY, h = { apikey: k, ...extra };
  if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;   // igual que db.js: las llaves nuevas (sb_secret_...) van solo en apikey
  return h;
};

let bucketListo = false;
async function asegurarCubeta() {
  if (bucketListo) return;
  const r = await fetch(base() + '/storage/v1/bucket', { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }), signal: AbortSignal.timeout(10000) });
  const t = await r.text();
  if (!r.ok && r.status !== 409 && !/already exists|duplicate/i.test(t)) throw new Error('Storage no pudo crear la carpeta (' + r.status + '): ' + t.slice(0, 120));
  bucketListo = true;
}

// Sube el archivo y devuelve su dirección pública
async function subir(datos, mime, carpeta = 'salida') {
  if (!configurado()) throw new Error('Falta conectar Supabase para guardar archivos.');
  mime = String(mime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const ruta = carpeta + '/' + crypto.randomBytes(14).toString('hex') + (EXT[mime] || '');
  const poner = () => fetch(base() + '/storage/v1/object/' + BUCKET + '/' + ruta, { method: 'POST', headers: cab({ 'Content-Type': mime, 'x-upsert': 'false' }), body: datos, signal: AbortSignal.timeout(20000) });
  let r = await poner();
  if (!r.ok && !bucketListo) { await asegurarCubeta(); r = await poner(); }   // la primera vez la carpeta puede no existir
  if (!r.ok) throw new Error('Storage respondió ' + r.status + ': ' + String(await r.text()).slice(0, 120));
  return base() + '/storage/v1/object/public/' + BUCKET + '/' + ruta;
}

// Copia a nuestro almacén un archivo que Meta nos dio por dirección (esas direcciones caducan). Si algo falla devuelve null.
async function copiar(url, maximo = 8 * 1024 * 1024) {
  try {
    if (!configurado()) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const largo = Number(r.headers.get('content-length')) || 0;
    if (largo > maximo) return null;
    const datos = Buffer.from(await r.arrayBuffer());
    if (!datos.length || datos.length > maximo) return null;
    return await subir(datos, r.headers.get('content-type'), 'entrada');
  } catch { return null; }
}

module.exports = { configurado, subir, copiar };
