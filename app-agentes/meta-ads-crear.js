// Crear anuncios nuevos de "clic a WhatsApp" para Facebook e Instagram a partir de un video de tu página.
// Todo se crea PAUSADO: no gasta nada hasta que se publique desde el panel. El presupuesto nunca pasa del tope (META_ADS_TOPE_DIARIO).
// Variables: META_PAGE_ID, META_IG_ID (opcional) y META_WHATSAPP_NUMERO (el número de WhatsApp Business ligado a la página, con lada de país, solo dígitos).
const M = require('./meta-ads.js');
const { graph, cuentaId } = M;

const digitos = v => String(v || '').replace(/\D/g, '');
const pagina = () => digitos(process.env.META_PAGE_ID);
const instagram = () => digitos(process.env.META_IG_ID);
const whatsapp = () => digitos(process.env.META_WHATSAPP_NUMERO);
const limpiar = (t, max) => String(t ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

function revisarVariables() {
  const falta = [['META_ADS_TOKEN', process.env.META_ADS_TOKEN], ['META_ADS_ACCOUNT_ID', cuentaId()], ['META_PAGE_ID', pagina()], ['META_WHATSAPP_NUMERO', whatsapp()]].filter(([, v]) => !v).map(([k]) => k);
  if (falta.length) throw new Error('Faltan variables en Vercel: ' + falta.join(', ') + '.');
}

// Algunas lecturas de la página piden el token de la página; se obtiene con el del usuario del sistema
async function tokenPagina() { try { return (await graph('/' + pagina(), { fields: 'access_token' })).access_token || undefined; } catch { return undefined; } }

// Últimos videos de la página, para elegir cuál promocionar
async function videos() {
  if (!process.env.META_ADS_TOKEN || !pagina()) throw new Error('Faltan variables en Vercel: META_ADS_TOKEN o META_PAGE_ID.');
  const tp = await tokenPagina();
  const r = await graph('/' + pagina() + '/videos', { fields: 'id,title,description,created_time,picture,length', limit: '12' }, 'GET', tp);
  return (r.data || []).map(v => ({ id: String(v.id), titulo: limpiar(v.title || v.description || 'Video sin título', 90), fecha: v.created_time || '', imagen: v.picture || '', segundos: Math.round(Number(v.length) || 0) }));
}

// Buscar intereses de Meta para segmentar (padres, robótica, educación…)
async function intereses(q) {
  q = limpiar(q, 60); if (q.length < 2) return [];
  const r = await graph('/search', { type: 'adinterest', q, limit: '12', locale: 'es_LA' });
  return (r.data || []).map(i => ({ id: String(i.id), nombre: String(i.name || '').slice(0, 80), personas: Number(i.audience_size_upper_bound || i.audience_size || 0) }));
}

// Revisa y normaliza lo que llegó del formulario. Lanza un error claro si algo no cuadra.
function validar(d) {
  const e = msg => { throw new Error(msg); };
  const nombre = limpiar(d.nombre, 80); if (nombre.length < 3) e('Ponle un nombre al anuncio (mínimo 3 letras).');
  const video = digitos(d.video); if (video.length < 5) e('Elige un video de tu página.');
  const texto = limpiar(d.texto, 500); if (texto.length < 10) e('Escribe el texto del anuncio (mínimo 10 letras).');
  const titulo = limpiar(d.titulo, 40);
  const palabra = limpiar(d.palabra, 40); if (palabra.length < 3) e('Escribe la palabra clave (mínimo 3 letras). Sirve para reconocer a quien llegue desde este anuncio.');
  if (!(texto + ' ' + titulo).toLowerCase().includes(palabra.toLowerCase())) e('La palabra clave "' + palabra + '" debe aparecer en el texto o en el título del anuncio, si no el agente no sabrá de qué anuncio llegó la persona.');
  const respuesta = limpiar(d.respuesta, 1500); if (!respuesta) e('Escribe el mensaje de respuesta de WhatsApp para este anuncio.');
  const seguimiento = limpiar(d.seguimiento, 1500); if (!seguimiento) e('Escribe el mensaje de seguimiento de WhatsApp para este anuncio.');
  const presupuesto = Math.round(Number(d.presupuesto) * 100) / 100; if (!(presupuesto >= 1)) e('Escribe el presupuesto diario en pesos.');
  if (presupuesto > M.tope()) e('El máximo permitido es $' + M.tope() + ' al día.');
  const dias = Math.round(Number(d.dias)); if (!(dias >= 1 && dias <= 60)) e('La duración debe ser de 1 a 60 días.');
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(d.inicio)) ? String(d.inicio) : e('Elige la fecha de inicio.');
  const lat = Number(d.lat), lng = Number(d.lng), radio = Number(d.radio);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180) || d.lat === '' || d.lng === '') e('Escribe la latitud y la longitud del lugar (clic derecho en Google Maps → copiar coordenadas).');
  if (!(radio >= 1 && radio <= 80)) e('El radio debe ser de 1 a 80 km.');
  const edadMin = Math.round(Number(d.edadMin)), edadMax = Math.round(Number(d.edadMax));
  if (!(edadMin >= 18 && edadMax <= 65 && edadMin <= edadMax)) e('Las edades deben estar entre 18 y 65, con la mínima menor o igual a la máxima.');
  const ints = (Array.isArray(d.intereses) ? d.intereses : []).slice(0, 10).map(i => ({ id: digitos(i.id), name: limpiar(i.nombre, 80) })).filter(i => i.id);
  return { nombre, video, texto, titulo, palabra, respuesta, seguimiento, presupuesto, dias, inicio, lat, lng, radio, edadMin, edadMax, ints };
}

// Crea campaña + conjunto + anuncio, todo PAUSADO, y guarda sus mensajes de WhatsApp. Si algo falla a medias, avisa qué quedó creado (todo pausado, sin gasto).
async function crear(datos) {
  revisarVariables();
  const d = validar(datos);
  const post = (ruta, campos) => graph(ruta, Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])), 'POST');
  const v = await graph('/' + d.video, { fields: 'picture,title' }, 'GET', await tokenPagina());
  if (!v.picture) throw new Error('No pude obtener la imagen de portada de ese video.');
  const inicio = new Date(d.inicio + 'T06:00:00-06:00'), fin = new Date(inicio.getTime() + d.dias * 86400000);
  if (isNaN(inicio.getTime())) throw new Error('Fecha de inicio no válida.');
  const creados = [];
  const paso = async (nombrePaso, f) => { try { return await f(); } catch (e) { throw new Error('Meta rechazó el paso "' + nombrePaso + '": ' + e.message.replace(/^Meta respondió \d+: ?/, '') + (creados.length ? ' (Quedó creado y pausado: ' + creados.join(', ') + '. No gasta nada; puedes borrarlo en el Administrador de anuncios.)' : '')); } };
  const cuenta = cuentaId();
  const camp = await paso('campaña', () => post('/' + cuenta + '/campaigns', { name: d.nombre, objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [] }));
  creados.push('campaña ' + camp.id);
  const conj = await paso('conjunto de anuncios', () => post('/' + cuenta + '/adsets', {
    name: d.nombre + ' · conjunto', campaign_id: camp.id, daily_budget: Math.round(d.presupuesto * 100), billing_event: 'IMPRESSIONS', optimization_goal: 'CONVERSATIONS',
    destination_type: 'WHATSAPP', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', status: 'PAUSED', start_time: inicio.toISOString(), end_time: fin.toISOString(),
    promoted_object: { page_id: pagina(), whatsapp_phone_number: whatsapp() },
    targeting: {
      geo_locations: { custom_locations: [{ latitude: d.lat, longitude: d.lng, radius: d.radio, distance_unit: 'kilometer' }] },
      age_min: d.edadMin, age_max: d.edadMax, publisher_platforms: instagram() ? ['facebook', 'instagram'] : ['facebook'],
      ...(d.ints.length ? { flexible_spec: [{ interests: d.ints }] } : {}),
    },
  }));
  creados.push('conjunto ' + conj.id);
  const cre = await paso('creativo', () => post('/' + cuenta + '/adcreatives', {
    name: d.nombre + ' · creativo',
    object_story_spec: { page_id: pagina(), ...(instagram() ? { instagram_user_id: instagram() } : {}),
      video_data: { video_id: d.video, image_url: v.picture, message: d.texto, ...(d.titulo ? { title: d.titulo } : {}), call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } } } },
  }));
  creados.push('creativo ' + cre.id);
  const ad = await paso('anuncio', () => post('/' + cuenta + '/ads', { name: d.nombre, adset_id: conj.id, creative: { creative_id: cre.id }, status: 'PAUSED' }));
  creados.push('anuncio ' + ad.id);
  let mensajes = true;
  try {
    const r = await require('./anuncios.js').guardar({ nombre: d.nombre, palabras: [d.palabra], mensaje: d.respuesta, seguimiento: d.seguimiento });
    if (!r.ok) mensajes = r.error;
  } catch (e) { mensajes = e.message; }
  console.log('meta-ads: creado anuncio pausado ' + ad.id + ' (campaña ' + camp.id + ')');
  M.cambioHecho();
  return { ok: true, campana: camp.id, conjunto: conj.id, anuncio: ad.id, nombre: d.nombre, presupuesto: d.presupuesto, mensajes };
}

// Publica un anuncio creado aquí: activa anuncio, conjunto y campaña. Solo si su presupuesto diario cabe en el tope.
async function publicar(campanaId) {
  if (!M.configurado()) throw new Error('Faltan variables de Meta en Vercel.');
  const id = M.soloId(campanaId);
  const c = await M.deLaCuenta(id, 'name,status,daily_budget');
  const conj = await graph('/' + id + '/adsets', { fields: 'status,daily_budget,lifetime_budget', limit: '50' });
  const anuncios = await graph('/' + id + '/ads', { fields: 'status', limit: '50' });
  const diario = c.daily_budget ? Number(c.daily_budget) / 100 : (conj.data || []).reduce((t, a) => t + (Number(a.daily_budget) || 0) / 100, 0);
  if ((conj.data || []).some(a => a.lifetime_budget && !a.daily_budget)) throw new Error('Esta campaña usa presupuesto total. Publícala desde el Administrador de anuncios.');
  if (diario > M.tope()) throw new Error('Su presupuesto diario ($' + diario + ') pasa del tope de $' + M.tope() + '. Bájalo primero.');
  const activar = i => graph('/' + i, { status: 'ACTIVE' }, 'POST');
  for (const a of anuncios.data || []) await activar(a.id);
  for (const a of conj.data || []) await activar(a.id);
  await activar(id);
  console.log('meta-ads: publicada campaña ' + id);
  M.cambioHecho();
  return { ok: true, nombre: c.name };
}

module.exports = { videos, intereses, crear, publicar, validar };
