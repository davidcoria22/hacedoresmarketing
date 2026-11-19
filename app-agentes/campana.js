// Resumen de la campaña "Viernes de Consejo Maker" para la sección Redes:
// el reel que se promociona y sus visualizaciones (Meta), los mensajes que llegan del anuncio (WhatsApp) y las compras (WooCommerce).
// Cada parte se pide por separado: si una falla, las otras se siguen viendo.
const ID_ANUNCIO = 'anuncio:viernes-de-consejo-maker';   // así marca whatsapp.js los mensajes de ese anuncio (origen)
const PATRON = /consejo maker/i;                       // productos de la tienda
const COMPRAS_DESDE = Date.parse('2026-11-13T00:00:00-06:00');   // las compras se cuentan desde el 13 de noviembre (hora de México)
const PATRON_CAMPANA = /consejo\s*maker|viernes/i;     // nombre de la campaña en Meta

const diaMX = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(ms));
// Las visualizaciones y los mensajes se muestran solo de hoy (hora de México)
const inicioDeHoy = () => Date.parse(diaMX(Date.now()) + 'T00:00:00-06:00');

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

// Cuándo se activó la campaña por última vez y, si ya se apagó, cuándo. Se lee del historial de cambios de la cuenta
// (cada vez que se pausa o reactiva); si ese historial no se puede leer se usan las fechas de inicio y fin de la campaña.
async function periodoDe(M, c) {
  const activa = c.effective_status === 'ACTIVE';
  const t = v => { const x = Date.parse(v || ''); return isNaN(x) ? 0 : x; };
  try {
    const h = await M.graph('/' + M.cuentaId() + '/activities', { fields: 'event_time,event_type,object_id,extra_data', since: String(Math.floor((t(c.start_time) || Date.now() - 90 * 86400000) / 1000) - 86400), limit: '200' });
    const cambios = (h.data || []).filter(e => String(e.object_id) === String(c.id) && e.event_type === 'update_campaign_run_status')
      .map(e => { let nuevo = ''; try { const x = JSON.parse(e.extra_data || '{}'); nuevo = String(x.new_value ?? ''); } catch { /* sin detalle */ } return { t: t(e.event_time), activo: /active/i.test(nuevo) && !/inactive/i.test(nuevo) }; })
      .filter(e => e.t).sort((a, b) => a.t - b.t);
    const enciende = cambios.filter(e => e.activo).pop();
    if (enciende) {
      const apaga = cambios.find(e => !e.activo && e.t > enciende.t);
      return { desde: enciende.t, hasta: activa ? null : (apaga ? apaga.t : t(c.updated_time) || null) };
    }
  } catch { /* se usan las fechas de la campaña */ }
  return { desde: t(c.start_time) || 0, hasta: activa ? null : (t(c.stop_time) || t(c.updated_time) || null) };
}

// La campaña activa (o la más reciente) cuyo nombre trae "Consejo Maker", con su anuncio, el reel y sus números totales
async function campana() {
  const M = require('./meta-ads.js');
  if (!M.configurado()) throw new Error('Faltan las variables de Meta en Vercel (META_ADS_TOKEN y META_ADS_ACCOUNT_ID).');
  let todas = [], after = '';
  for (let n = 0; n < 5; n++) {   // hasta 500 campañas, por si la cuenta tiene muchas
    const p = await M.graph('/' + M.cuentaId() + '/campaigns', { fields: 'name,effective_status,start_time,stop_time,updated_time', limit: '100', ...(after ? { after } : {}) });
    todas = todas.concat(p.data || []);
    after = p.paging?.cursors?.after;
    if (!p.paging?.next || !after) break;
  }
  const hit = todas.filter(c => PATRON_CAMPANA.test(c.name || ''));
  if (!hit.length) return { encontrada: false, activas: todas.filter(c => c.effective_status === 'ACTIVE').map(c => String(c.name || '').slice(0, 60)).slice(0, 8), total: todas.length };
  const c = hit.find(x => x.effective_status === 'ACTIVE') || hit.sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)))[0];
  const periodo = await periodoDe(M, c);
  const rango = { time_range: JSON.stringify({ since: diaMX(Date.now()), until: diaMX(Date.now()) }) };
  const ins = await M.graph('/' + c.id + '/insights', { fields: 'impressions,reach,spend,clicks,actions', ...rango }).catch(() => ({ data: [] }));
  const i = (ins.data || [])[0] || {};
  const ads = await M.graph('/' + c.id + '/ads', { fields: 'name,effective_status,creative{instagram_permalink_url,thumbnail_url,video_id,object_story_spec}', limit: '10' }).catch(() => ({ data: [] }));
  const lista = ads.data || [];
  const ad = lista.find(a => a.effective_status === 'ACTIVE') || lista[0];
  const cr = ad?.creative || {};
  const video = embedDe(cr.instagram_permalink_url, cr.video_id || cr.object_story_spec?.video_data?.video_id);
  return {
    encontrada: true, desde: periodo.desde ? new Date(periodo.desde).toISOString() : '', hasta: periodo.hasta ? new Date(periodo.hasta).toISOString() : '', nombre: String(c.name || '').slice(0, 100), activa: c.effective_status === 'ACTIVE', estado: String(c.effective_status || '').toLowerCase(),
    reel: video ? { ...video, miniatura: urlSegura(cr.thumbnail_url) || '' } : null,
    visualizaciones: num(i.impressions), alcance: num(i.reach), reproducciones: accion(i.actions, 'video_view'), clics: num(i.clicks),
    mensajes: (i.actions || []).filter(a => /messaging_conversation_started/.test(a.action_type)).reduce((s, a) => s + num(a.value), 0),
    gasto: Math.round(num(i.spend) * 100) / 100,
  };
}

// Mensajes de WhatsApp que llegaron desde este anuncio (solo nombre, teléfono ya enmascarado y texto)
async function mensajesDelAnuncio(periodo = {}) {
  const todos = await require('./mensajes.js').leerMensajes(800, 'whatsapp', false);
  const suyos = todos.filter(m => m.origen === ID_ANUNCIO && (!periodo.desde || Date.parse(m.fecha) >= periodo.desde) && (!periodo.hasta || Date.parse(m.fecha) <= periodo.hasta));
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
  const [c] = await Promise.allSettled([campana()]);
  const k = quitar(c), periodo = { desde: Math.max(inicioDeHoy(), k.desde ? Date.parse(k.desde) : 0), hasta: k.hasta ? Date.parse(k.hasta) : 0 };   // mensajes solo de hoy (y solo mientras estuvo activa)
  const [m, v] = await Promise.allSettled([mensajesDelAnuncio(periodo), W.ventasDe(PATRON, 8, { desde: COMPRAS_DESDE })]);
  const compras = quitar(v);
  if (!compras.error) {   // cantidad de lugares por sede: Interlomas tiene su producto; el otro es Chapultepec
    const sede = re => Object.entries(compras.porProducto || {}).filter(([n]) => re.test(n)).reduce((s, [, q]) => s + q, 0);
    compras.interlomas = sede(/interlomas/i);
    compras.chapultepec = compras.cantidad - compras.interlomas;
  }
  return { campana: k, mensajes: quitar(m), compras, actualizado: new Date().toISOString() };
}

module.exports = { resumen, campana, mensajesDelAnuncio, embedDe, ID_ANUNCIO, inicioDeHoy };
