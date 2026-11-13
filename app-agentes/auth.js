// Contraseña del panel para las secciones privadas (mensajes de clientes).
// Sin dependencias: la sesión es una cookie firmada con HMAC. Variables de entorno:
//   PANEL_PASSWORD  contraseña para entrar (obligatoria en línea)
//   SESSION_SECRET  texto largo al azar para firmar la cookie (opcional; si falta se deriva de la contraseña)
const crypto = require('crypto');

const DURACION = 7 * 24 * 3600 * 1000;   // la sesión dura 7 días
const NOMBRE = 'sesion';

const secreto = () => crypto.createHash('sha256').update('hacedores:' + (process.env.SESSION_SECRET || process.env.PANEL_PASSWORD || '')).digest();
const firmar = exp => crypto.createHmac('sha256', secreto()).update(String(exp)).digest('hex');
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const configurada = () => !!process.env.PANEL_PASSWORD;

function cookies(req) {
  const o = {};
  for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
  return o;
}

// ---- Inicio de sesión con Google: la sesión es una cookie con el correo, firmada con HMAC (ver google-login.js) ----
const googleActivo = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const secretoGoogle = () => crypto.createHash('sha256').update('hacedores-google:' + (process.env.AUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET || '')).digest();
const firmarGoogle = t => crypto.createHmac('sha256', secretoGoogle()).update(t).digest('hex');
function usuarioGoogle(req) {
  const [cuerpo, firma] = String(cookies(req).gsesion || '').split('.');
  if (!cuerpo || !firma || !googleActivo() || !iguales(firma, firmarGoogle(cuerpo))) return null;
  try { const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')); return d.x > Date.now() && d.e ? { email: d.e, nombre: d.n || '' } : null; } catch { return null; }
}
function cookieGoogle(email, nombre, seguro) {
  const cuerpo = Buffer.from(JSON.stringify({ e: email, n: String(nombre).slice(0, 80), x: Date.now() + DURACION })).toString('base64url');
  return 'gsesion=' + cuerpo + '.' + firmarGoogle(cuerpo) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + DURACION / 1000 + (seguro ? '; Secure' : '');
}
const cookieGoogleBorrar = seguro => 'gsesion=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (seguro ? '; Secure' : '');

function sesionValida(req) {
  if (googleActivo()) return !!usuarioGoogle(req);   // con Google activo, solo vale la sesión de Google
  if (!configurada()) return false;
  const [exp, firma] = String(cookies(req)[NOMBRE] || '').split('.');
  return !!(exp && firma && Number(exp) > Date.now() && iguales(firma, firmar(exp)));
}

function passwordCorrecta(intento) {
  if (!configurada()) return false;
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(intento || ''), h(process.env.PANEL_PASSWORD));
}

function cookieSesion(seguro) {
  const exp = Date.now() + DURACION;
  return NOMBRE + '=' + exp + '.' + firmar(exp) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + DURACION / 1000 + (seguro ? '; Secure' : '');
}
const cookieBorrar = seguro => NOMBRE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (seguro ? '; Secure' : '');

// Freno sencillo contra adivinar la contraseña: 5 fallos por minuto desde la misma IP
const fallos = new Map();
function bloqueado(ip) {
  const ahora = Date.now(), lista = (fallos.get(ip) || []).filter(t => ahora - t < 60000);
  fallos.set(ip, lista);
  return lista.length >= 5;
}
const anotarFallo = ip => fallos.set(ip, [...(fallos.get(ip) || []), Date.now()]);

module.exports = { googleActivo, usuarioGoogle, cookieGoogle, cookieGoogleBorrar, configurada, sesionValida, passwordCorrecta, cookieSesion, cookieBorrar, bloqueado, anotarFallo };
