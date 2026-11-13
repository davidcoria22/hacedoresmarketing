// Anuncios de Facebook e Instagram (Meta Marketing API). Por ahora SOLO LECTURA: muestra cómo van tus campañas.
// Variables de entorno: META_ADS_TOKEN (usuario del sistema con ads_read), META_ADS_ACCOUNT_ID (act_123… o solo el número),
// y para más adelante META_PAGE_ID y META_IG_ID. Nunca se devuelve ni se imprime el token.
const API = 'https://graph.facebook.com/v21.0';
const cuentaId = () => { const v = String(process.env.META_ADS_ACCOUNT_ID || '').trim(); return v ? (v.startsWith('act_') ? v : 'act_' + v.replace(/\D/g, '')) : ''; };
const configurado = () => !!(process.env.META_ADS_TOKEN && cuentaId());
const variables = () => ({ META_ADS_TOKEN: !!process.env.META_ADS_TOKEN, META_ADS_ACCOUNT_ID: !!process.env.META_ADS_ACCOUNT_ID, META_PAGE_ID: !!process.env.META_PAGE_ID, META_IG_ID: !!process.env.META_IG_ID });

async function graph(ruta, params = {}, metodo = 'GET') {
  const q = new URLSearchParams(params);
  const cab = { Authorization: 'Bearer ' + process.env.META_ADS_TOKEN, Accept: 'application/json', 'User-Agent': 'Hacedores-Panel/1.0' };
  const r = metodo === 'GET'
    ? await fetch(API + ruta + '?' + q, { headers: cab, signal: AbortSignal.timeout(15000) })
    : await fetch(API + ruta, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString(), signal: AbortSignal.timeout(15000) });
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
  const conj = await graph('/' + cuentaId() + '/adsets', { fields: 'name,campaign_id,status,effective_status,daily_budget,lifetime_budget', limit: '200' }).catch(() => ({ data: [] }));
  const porCampana = {};
  for (const c of conj.data || []) (porCampana[c.campaign_id] ||= []).push({ id: c.id, nombre: String(c.name || '').slice(0, 100), estado: ESTADOS[c.effective_status] || String(c.effective_status || '').toLowerCase(), activo: c.status === 'ACTIVE', presupuestoDiario: c.daily_budget ? dinero(num(c.daily_budget) / 100, moneda) : null, vitalicio: !!c.lifetime_budget });
  const hoy = await graph('/' + cuentaId() + '/insights', { fields: 'spend', date_preset: 'today' }).catch(() => ({ data: [] }));
  const lista = (campanas.data || []).map(c => {
    const i = (c.insights?.data || [])[0] || {};
    return {
      id: c.id, nombre: String(c.name || '').slice(0, 100), estado: ESTADOS[c.effective_status] || String(c.effective_status || '').toLowerCase(), activa: c.effective_status === 'ACTIVE',
      objetivo: c.objective || '',
      presupuestoDiario: c.daily_budget ? dinero(num(c.daily_budget) / 100, moneda) : null, presupuestoEnCampana: !!c.daily_budget,
      conjuntos: porCampana[c.id] || [],
      presupuestoTotal: dinero(c.daily_budget ? num(c.daily_budget) / 100 : (porCampana[c.id] || []).filter(x => x.activo).reduce((t, x) => t + (x.presupuestoDiario?.valor || 0), 0), moneda),
      gasto7d: dinero(i.spend, moneda), alcance7d: num(i.reach), clics7d: num(i.clicks), mensajes7d: mensajesDe(i.actions),
    };
  }).sort((a, b) => (b.activa - a.activa) || (b.gasto7d.valor - a.gasto7d.valor));
  const v = { configurado: true, variables: d.variables, cuenta: d.cuenta, tope: tope(), gastoHoy: dinero(hoy.data?.[0]?.spend, moneda), campanas: lista, actualizado: new Date().toISOString() };
  cache = { t: Date.now(), v };
  return v;
}


// ---------- cambios (necesitan ads_management) ----------
// Tope máximo de presupuesto diario por campaña o conjunto, en pesos (META_ADS_TOPE_DIARIO; por defecto 300).
const tope = () => { const t = Number(process.env.META_ADS_TOPE_DIARIO); return t > 0 ? t : 300; };
const soloId = id => { id = String(id || ''); if (!/^\d{5,25}$/.test(id)) throw new Error('Identificador no válido.'); return id; };
const idCuenta = () => cuentaId().replace('act_', '');
// Solo se toca lo que es de TU cuenta publicitaria (nunca un ID cualquiera)
async function deLaCuenta(id, campos) {
  const o = await graph('/' + soloId(id), { fields: 'account_id,' + campos });
  if (String(o.account_id) !== idCuenta()) throw new Error('Ese elemento no pertenece a tu cuenta publicitaria.');
  return o;
}
const cambioHecho = () => { cache = { t: 0, v: null }; };

// Pausar o reactivar una campaña. Reactivar solo si su presupuesto diario cabe en el tope. Nunca se borra nada.
async function cambiarEstado(id, estado) {
  if (!configurado()) throw new Error('Faltan variables de Meta en Vercel.');
  if (estado !== 'ACTIVE' && estado !== 'PAUSED') throw new Error('Estado no válido.');
  const c = await deLaCuenta(id, 'name,status,daily_budget,lifetime_budget');
  if (estado === 'ACTIVE') {
    const conj = await graph('/' + soloId(id) + '/adsets', { fields: 'status,daily_budget,lifetime_budget', limit: '100' });
    const activos = (conj.data || []).filter(a => a.status === 'ACTIVE');
    if (c.lifetime_budget || activos.some(a => a.lifetime_budget && !a.daily_budget)) throw new Error('Esta campaña usa presupuesto total (no diario). Reactívala desde el Administrador de anuncios.');
    const diario = c.daily_budget ? num(c.daily_budget) / 100 : activos.reduce((t, a) => t + num(a.daily_budget) / 100, 0);
    if (diario > tope()) throw new Error('Su presupuesto diario ($' + diario + ') pasa del tope de $' + tope() + '. Bájalo primero.');
  }
  await graph('/' + soloId(id), { status: estado }, 'POST');
  console.log('meta-ads: campaña ' + id + ' -> ' + estado);
  cambioHecho();
  return { ok: true, nombre: c.name, estado };
}

// Cambia el presupuesto diario de una campaña o de un conjunto de anuncios (en pesos). Nunca por encima del tope.
async function cambiarPresupuesto(id, pesos) {
  if (!configurado()) throw new Error('Faltan variables de Meta en Vercel.');
  const monto = Math.round(Number(pesos) * 100) / 100;
  if (!(monto > 0)) throw new Error('Escribe un monto mayor a cero.');
  if (monto > tope()) throw new Error('El máximo permitido es $' + tope() + ' al día.');
  const o = await deLaCuenta(id, 'name,daily_budget,lifetime_budget');
  if (!o.daily_budget) throw new Error(o.lifetime_budget ? 'Este elemento usa presupuesto total, no diario. Cámbialo en el Administrador de anuncios.' : 'Este elemento no tiene presupuesto propio: el presupuesto está en sus conjuntos de anuncios.');
  await graph('/' + soloId(id), { daily_budget: String(Math.round(monto * 100)) }, 'POST');
  console.log('meta-ads: presupuesto de ' + id + ' -> $' + monto);
  cambioHecho();
  return { ok: true, nombre: o.name, antes: num(o.daily_budget) / 100, ahora: monto };
}

module.exports = { resumen, diagnostico, configurado, cambiarEstado, cambiarPresupuesto, tope };
