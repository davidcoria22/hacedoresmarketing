// Anuncios de Facebook e Instagram (Meta Marketing API). Por ahora SOLO LECTURA: muestra cómo van tus campañas.
// Variables de entorno: META_ADS_TOKEN (usuario del sistema con ads_read), META_ADS_ACCOUNT_ID (act_123… o solo el número),
// y para más adelante META_PAGE_ID y META_IG_ID. Nunca se devuelve ni se imprime el token.
const API = 'https://graph.facebook.com/v21.0';
const cuentaId = () => { const v = String(process.env.META_ADS_ACCOUNT_ID || '').trim(); return v ? (v.startsWith('act_') ? v : 'act_' + v.replace(/\D/g, '')) : ''; };
const configurado = () => !!(process.env.META_ADS_TOKEN && cuentaId());
const variables = () => ({ META_ADS_TOKEN: !!process.env.META_ADS_TOKEN, META_ADS_ACCOUNT_ID: !!process.env.META_ADS_ACCOUNT_ID, META_PAGE_ID: !!process.env.META_PAGE_ID, META_IG_ID: !!process.env.META_IG_ID });

async function graph(ruta, params = {}) {
  const q = new URLSearchParams(params);
  const r = await fetch(API + ruta + '?' + q, { headers: { Authorization: 'Bearer ' + process.env.META_ADS_TOKEN, Accept: 'application/json', 'User-Agent': 'Hacedores-Panel/1.0' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const msg = e.code === 190 ? 'Meta rechazó el token (caducó o no es válido). Genera uno nuevo.'
      : (e.code === 200 || e.code === 10 || e.code === 294) ? 'El token no tiene permiso para esta cuenta. Revisa que el usuario del sistema tenga la cuenta publicitaria asignada y los permisos ads_read / ads_management.'
      : e.code === 100 ? 'Meta no encontró la cuenta publicitaria. Revisa el ID en META_ADS_ACCOUNT_ID.'
      : 'Meta respondió ' + r.status + (e.message ? ': ' + String(e.message).slice(0, 160) : '.');
    throw new Error(msg);
  }
  return j;
}

const ESTADOS = { ACTIVE: 'activa', PAUSED: 'pausada', ARCHIVED: 'archivada', DELETED: 'eliminada', WITH_ISSUES: 'con problemas', IN_PROCESS: 'en revisión', PENDING_REVIEW: 'en revisión', DISAPPROVED: 'rechazada', CAMPAIGN_PAUSED: 'pausada', ADSET_PAUSED: 'pausada' };
const ESTADOS_CUENTA = { 1: 'activa', 2: 'deshabilitada', 3: 'con saldo pendiente', 7: 'en revisión de riesgo', 8: 'en periodo de gracia', 9: 'en periodo de gracia', 100: 'cierre pendiente', 101: 'cerrada', 201: 'cualquier actividad', 202: 'cerrada' };
const num = v => Number(v) || 0;
const dinero = (v, moneda) => ({ valor: Math.round(num(v) * 100) / 100, moneda });
const mensajesDe = acciones => (acciones || []).filter(a => /messaging_conversation_started/.test(a.action_type)).reduce((s, a) => s + num(a.value), 0);

// Estado de la conexión: qué variables existen (solo sí/no) y si Meta acepta el token
async function diagnostico() {
  const vars = variables();
  if (!configurado()) return { configurado: false, variables: vars, error: 'Faltan variables en Vercel: ' + ['META_ADS_TOKEN', 'META_ADS_ACCOUNT_ID'].filter(k => !vars[k]).join(', ') + '.' };
  try {
    const c = await graph('/' + cuentaId(), { fields: 'name,account_status,currency,timezone_name,amount_spent' });
    return { configurado: true, variables: vars, cuenta: { nombre: c.name || '', estado: ESTADOS_CUENTA[c.account_status] || String(c.account_status), moneda: c.currency || 'MXN', zona: c.timezone_name || '' } };
  } catch (e) { return { configurado: true, variables: vars, error: e.message }; }
}

let cache = { t: 0, v: null };
// Campañas con su gasto, alcance y mensajes de los últimos 7 días (se guarda 60 s)
async function resumen() {
  const d = await diagnostico();
  if (d.error) return d;
  if (cache.v && Date.now() - cache.t < 60000) return cache.v;
  const moneda = d.cuenta.moneda;
  const campanas = await graph('/' + cuentaId() + '/campaigns', {
    fields: 'name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(last_7d){spend,reach,impressions,clicks,actions}',
    limit: '50',
  });
  const hoy = await graph('/' + cuentaId() + '/insights', { fields: 'spend', date_preset: 'today' }).catch(() => ({ data: [] }));
  const lista = (campanas.data || []).map(c => {
    const i = (c.insights?.data || [])[0] || {};
    return {
      id: c.id, nombre: String(c.name || '').slice(0, 100), estado: ESTADOS[c.effective_status] || String(c.effective_status || '').toLowerCase(), activa: c.effective_status === 'ACTIVE',
      objetivo: c.objective || '',
      presupuestoDiario: c.daily_budget ? dinero(num(c.daily_budget) / 100, moneda) : null,
      gasto7d: dinero(i.spend, moneda), alcance7d: num(i.reach), clics7d: num(i.clicks), mensajes7d: mensajesDe(i.actions),
    };
  }).sort((a, b) => (b.activa - a.activa) || (b.gasto7d.valor - a.gasto7d.valor));
  const v = { configurado: true, variables: d.variables, cuenta: d.cuenta, gastoHoy: dinero(hoy.data?.[0]?.spend, moneda), campanas: lista, actualizado: new Date().toISOString() };
  cache = { t: Date.now(), v };
  return v;
}

module.exports = { resumen, diagnostico, configurado };
