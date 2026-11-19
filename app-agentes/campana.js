// Resumen de la campaña "Viernes de Consejo Maker" para la sección Redes:
// el reel que se promociona y sus visualizaciones (Meta), los mensajes que llegan del anuncio (WhatsApp) y las compras (WooCommerce).
// Cada parte se pide por separado: si una falla, las otras se siguen viendo.
const ID_ANUNCIO = 'anuncio:viernes-de-consejo-maker';   // así marca whatsapp.js los mensajes de ese anuncio (origen)
const PATRON = /consejo maker/i;                       // productos de la tienda
const PATRON_CAMPANA = /consejo\s*maker|viernes/i;     // nombre de la campaña en Meta

const num = v => Number(v) || 0;
const accion = (acciones, tipo) => (acciones || []).filter(a => a.action_type === tipo).reduce((s, a) => s + num(a.value), 0);
// Solo se incrustan páginas de Instagram o Facebook
const urlSegura = u => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && /(^|\.)(instagram|facebook)\.com$/.test(x.hostname) ? x.href : ''; } catch { return ''; } };
const embedDe = (igUrl, videoId) => {
  const ig = urlSegura(igUrl);
  if (ig) return { red: 'instagram', url: ig, embed: ig.replace(/[?#].*$/, '').replace(/\/?$/, '/') + 'embed/' };
  if (/^\d{5,25}$/.test(String(videoId || ''))) {
    const v = 'https://www.facebook.com/watch/?v=' + videoId;
    return { red: 'facebook', url: v, embed: 'https://www.facebook.com/plugins/video.php?show_text=false&href=' + encodeURIComponent(v) };
  }
  return null;
};

// La campaña activa (o la más reciente) cuyo nombre trae "Consejo Maker", con su anuncio, el reel y sus números totales
async function campana() {
  const M = require('./meta-ads.js');
  if (!M.configurado()) throw new Error('Faltan las variables de Meta en Vercel (META_ADS_TOKEN y META_ADS_ACCOUNT_ID).');
  let todas = [], after = '';
  for (let n = 0; n < 5; n++) {   // hasta 500 campañas, por si la cuenta tiene muchas
    const p = await M.graph('/' + M.cuentaId() + '/campaigns', { fields: 'name,effective_status,start_time', limit: '100', ...(after ? { after } : {}) });
    todas = todas.concat(p.data || []);
    after = p.paging?.cursors?.after;
    if (!p.paging?.next || !after) break;
  }
  const hit = todas.filter(c => PATRON_CAMPANA.test(c.name || ''));
  if (!hit.length) return { encontrada: false, activas: todas.filter(c => c.effective_status === 'ACTIVE').map(c => String(c.name || '').slice(0, 60)).slice(0, 8), total: todas.length };
  const c = hit.find(x => x.effective_status === 'ACTIVE') || hit.sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)))[0];
  const ins = await M.graph('/' + c.id + '/insights', { fields: 'impressions,reach,spend,clicks,actions', date_preset: 'maximum' }).catch(() => ({ data: [] }));
  const i = (ins.data || [])[0] || {};
  const ads = await M.graph('/' + c.id + '/ads', { fields: 'name,effective_status,creative{instagram_permalink_url,thumbnail_url,video_id,object_story_spec}', limit: '10' }).catch(() => ({ data: [] }));
  const lista = ads.data || [];
  const ad = lista.find(a => a.effective_status === 'ACTIVE') || lista[0];
  const cr = ad?.creative || {};
  const video = embedDe(cr.instagram_permalink_url, cr.video_id || cr.object_story_spec?.video_data?.video_id);
  return {
    encontrada: true, nombre: String(c.name || '').slice(0, 100), activa: c.effective_status === 'ACTIVE', estado: String(c.effective_status || '').toLowerCase(),
    reel: video ? { ...video, miniatura: urlSegura(cr.thumbnail_url) || '' } : null,
    visualizaciones: num(i.impressions), alcance: num(i.reach), reproducciones: accion(i.actions, 'video_view'), clics: num(i.clicks),
    mensajes: (i.actions || []).filter(a => /messaging_conversation_started/.test(a.action_type)).reduce((s, a) => s + num(a.value), 0),
    gasto: Math.round(num(i.spend) * 100) / 100,
  };
}

// Mensajes de WhatsApp que llegaron desde este anuncio (solo nombre, teléfono ya enmascarado y texto)
async function mensajesDelAnuncio() {
  const todos = await require('./mensajes.js').leerMensajes(800, 'whatsapp', false);
  const suyos = todos.filter(m => m.origen === ID_ANUNCIO);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
  const hoyTxt = hoy.format(new Date());
  return {
    total: suyos.length, hoy: suyos.filter(m => m.fecha && hoy.format(new Date(m.fecha)) === hoyTxt).length,
    ultimos: suyos.slice(0, 8).map(m => ({ fecha: m.fecha, nombre: m.nombre || '', telefono: m.telefono || '', texto: String(m.texto || '').slice(0, 140), ref: m.ref })),
  };
}

const quitar = r => (r.status === 'fulfilled' ? r.value : { error: String(r.reason?.message || r.reason).slice(0, 300) });
async function resumen() {
  const W = require('./woocommerce.js');
  const [c, m, v] = await Promise.allSettled([campana(), mensajesDelAnuncio(), W.ventasDe(PATRON)]);
  return { campana: quitar(c), mensajes: quitar(m), compras: quitar(v), actualizado: new Date().toISOString() };
}

module.exports = { resumen, campana, mensajesDelAnuncio, embedDe, ID_ANUNCIO };
