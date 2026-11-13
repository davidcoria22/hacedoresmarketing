// Inicio de sesión con Google (OpenID Connect, flujo "código de autorización"), sin dependencias.
// Variables de entorno (en Vercel):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  credenciales del cliente OAuth creado en Google Cloud
//   AUTH_EMAILS     cuentas que pueden entrar, separadas por comas (ej. nombre@dominio.com,otra@gmail.com)
//   AUTH_DOMINIOS   (opcional) dominios completos que pueden entrar, separados por comas (ej. hacedores.com)
//   AUTH_URL        (opcional) dirección pública del sitio si no es la que llega en la petición, ej. https://panel.hacedores.com
//   AUTH_SECRET     (opcional) texto largo al azar para firmar la sesión; si falta se usa el secreto del cliente
// Si no hay ninguna cuenta ni dominio autorizado, nadie puede entrar.
const crypto = require('crypto');
const auth = require('./auth.js');

const ID = () => process.env.GOOGLE_CLIENT_ID || '';
const lista = t => String(t || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);

function permitido(email) {
  email = String(email || '').toLowerCase();
  if (!email) return false;
  if (lista(process.env.AUTH_EMAILS).includes(email)) return true;
  const dominio = email.split('@')[1];
  return !!dominio && lista(process.env.AUTH_DOMINIOS).includes(dominio);
}
const base = req => (process.env.AUTH_URL || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host))).replace(/\/+$/, '');
const seguro = req => (req.headers['x-forwarded-proto'] || '') === 'https' || /^https:/i.test(process.env.AUTH_URL || '');
const cookieEstado = (valor, req, maxAge) => 'hestado=' + valor + '; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (seguro(req) ? '; Secure' : '');
const volver = (res, ruta, cookies) => { res.writeHead(302, { Location: ruta, 'Cache-Control': 'no-store', ...(cookies ? { 'Set-Cookie': cookies } : {}) }); res.end(); };
const json = (res, codigo, obj, extra) => { res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) }); res.end(JSON.stringify(obj)); };
const b64 = t => String(t).replace(/-/g, '+').replace(/_/g, '/');

// Devuelve true si atendió la ruta.
async function manejarGoogle(req, res, url, { modoPublico }) {
  // ¿quién soy? La página lo consulta al abrir: 401 = hay que entrar con Google
  if (url.pathname === '/api/yo') {
    if (!modoPublico) return json(res, 200, { local: true }), true;
    if (!auth.googleActivo()) return json(res, 200, { abierto: true }), true;
    const u = auth.usuarioGoogle(req);
    if (!u) return json(res, 401, { requiereLogin: true }, { 'X-Login': '/entrar.html' }), true;
    return json(res, 200, { google: true, email: u.email, nombre: u.nombre, foto: u.foto }), true;
  }

  if (url.pathname === '/api/auth/google') {
    if (!auth.googleActivo()) return volver(res, '/entrar.html?error=sin_configurar'), true;
    const estado = crypto.randomBytes(16).toString('hex'), nonce = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: ID(), redirect_uri: base(req) + '/api/auth/callback', response_type: 'code', scope: 'openid email profile',
      state: estado, nonce, prompt: 'select_account',
    });
    return volver(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + params, cookieEstado(estado + '.' + nonce, req, 600)), true;
  }

  if (url.pathname === '/api/auth/callback') {
    const fallo = motivo => volver(res, '/entrar.html?error=' + motivo, cookieEstado('', req, 0));
    if (!auth.googleActivo()) return fallo('sin_configurar'), true;
    if (url.searchParams.get('error')) return fallo('cancelado'), true;
    const cookie = String(req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('hestado='));
    const [estado, nonce] = cookie ? cookie.slice(8).split('.') : [];
    const recibido = url.searchParams.get('state') || '', codigo = url.searchParams.get('code');
    if (!estado || !nonce || !codigo || estado.length !== recibido.length || !crypto.timingSafeEqual(Buffer.from(estado), Buffer.from(recibido))) return fallo('fallo'), true;
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: codigo, client_id: ID(), client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: base(req) + '/api/auth/callback', grant_type: 'authorization_code' }),
        signal: AbortSignal.timeout(8000),
      });
      const t = await r.json();
      if (!r.ok || !t.id_token) { console.error('google-login: intercambio rechazado:', t.error || r.status); return fallo('fallo'), true; }
      // El token llega directo de Google por una conexión segura, así que se puede leer sin verificar su firma (OpenID Connect, 3.1.3.7)
      const p = JSON.parse(Buffer.from(b64(t.id_token.split('.')[1]), 'base64').toString('utf8'));
      const emisorOk = p.iss === 'https://accounts.google.com' || p.iss === 'accounts.google.com';
      if (!emisorOk || p.aud !== ID() || !(p.exp * 1000 > Date.now()) || p.nonce !== nonce || p.email_verified !== true) return fallo('fallo'), true;
      if (!permitido(p.email)) { console.error('google-login: cuenta sin acceso:', String(p.email).replace(/^(.).*(@.*)$/, '$1***$2')); return fallo('cuenta'), true; }
      return volver(res, '/', [auth.cookieGoogle(p.email, p.name || '', seguro(req), p.picture), cookieEstado('', req, 0)]), true;
    } catch (e) { console.error('google-login:', e.message); return fallo('fallo'), true; }
  }
  return false;
}

module.exports = { manejarGoogle, permitido };
