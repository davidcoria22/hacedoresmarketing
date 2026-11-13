// Mascotas: cada agente es un bichito de píxeles que camina sobre las tarjetas del panel.
// Se pueden agarrar con el clic sostenido y aventar; un clic corto abre su burbuja con la última actualización.
(function () {
  const BASE_ANCHO = 74, BASE_ALTO = 50;       // tamaño normal del bichito en pantalla
  let ANCHO = BASE_ANCHO, ALTO = BASE_ALTO, escala = 1;
  const ocultos = new Set();                   // agentes cuya mascota no se muestra
  const CLAVE_PREFS = 'mascotas-preferencias';
  try { const p = JSON.parse(localStorage.getItem(CLAVE_PREFS) || '{}'); if (p.escala >= .5 && p.escala <= 2.5) escala = p.escala; (p.ocultos || []).forEach(id => ocultos.add(String(id))); } catch { /* sin preferencias guardadas */ }
  ANCHO = Math.round(BASE_ANCHO * escala); ALTO = Math.round(BASE_ALTO * escala);
  const guardarPrefs = () => { try { localStorage.setItem(CLAVE_PREFS, JSON.stringify({ escala, ocultos: [...ocultos] })); } catch { /* sin almacenamiento */ } };
  const GRAVEDAD = 2200;                       // px/s²
  const mascotas = new Map();                  // id -> estado de cada bichito
  let contenidoBurbuja = () => '';
  let abierta = null;                          // id de la mascota con burbuja abierta
  let capa, burbuja, ultimo = 0;
  let anuncioHasta = 0, relojAnuncio = null;   // aviso temporal (por ejemplo una venta nueva)

  const aleatorio = (a, b) => a + Math.random() * (b - a);
  const reducir = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Dibujo estilo píxel: cuerpo, brazos a los lados, dos ojos y cuatro patas
  function dibujo(color) {
    return `<svg viewBox="0 0 208 140" width="${ANCHO}" height="${ALTO}" aria-hidden="true" focusable="false">
      <g class="cuerpo-m" fill="${color}">
        <rect x="40" y="8" width="120" height="88"/><rect x="12" y="38" width="176" height="28"/>
        <rect class="pata p1" x="56" y="96" width="14" height="34"/><rect class="pata p2" x="78" y="96" width="14" height="34"/>
        <rect class="pata p3" x="108" y="96" width="14" height="34"/><rect class="pata p4" x="130" y="96" width="14" height="34"/>
      </g>
      <g class="ojos-m" fill="#0b0b0b"><rect x="56" y="22" width="16" height="20"/><rect x="128" y="22" width="16" height="20"/></g>
    </svg>`;
  }

  // ---------- animación corta: saca una impresora 3D e imprime un cubito ----------
  const DURACION_IMPRESION = 4.6;   // segundos que se ve la acción
  function impresora(color) {
    return `<svg viewBox="0 0 60 56" aria-hidden="true" focusable="false">
      <rect x="2" y="48" width="56" height="6" fill="#2b2b2b"/><rect x="14" y="44" width="32" height="4" fill="#8a8a8a"/>
      <rect x="6" y="8" width="4" height="40" fill="#5a5a5a"/><rect x="50" y="8" width="4" height="40" fill="#5a5a5a"/>
      <rect x="4" y="4" width="52" height="6" fill="#2b2b2b"/>
      <rect class="imp-obj" x="22" y="28" width="16" height="16" fill="${color}"/>
      <g class="imp-carro"><rect x="8" y="20" width="44" height="3" fill="#6a6a6a"/>
        <g class="imp-cabezal"><rect x="26" y="23" width="8" height="5" fill="#e72c5e"/><rect x="29" y="27" width="2" height="2" fill="#fcc139"/></g></g>
    </svg>`;
  }
  function iniciarImpresion(m) {
    if (m.imprimiendo || m.estado !== 'suelo' || ocultos.has(m.id) || reducir()) return false;
    const div = document.createElement('div'); div.className = 'impresora' + (m.x > innerWidth - ANCHO * 2.2 ? ' izq' : '');
    div.style.width = Math.round(ANCHO * .85) + 'px'; div.innerHTML = impresora(m.color);
    m.el.appendChild(div); m.el.classList.add('imprimiendo');
    m.imprimiendo = performance.now() + DURACION_IMPRESION * 1000; m.pausa = Math.max(m.pausa, DURACION_IMPRESION); m.vx = 0;
    return true;
  }
  function terminarImpresion(m) {
    m.imprimiendo = 0; m.imp = aleatorio(25, 70);
    m.el.classList.remove('imprimiendo'); const d = m.el.querySelector('.impresora'); if (d) d.remove();
  }

  // ---------- mapa 2D: al entrar a la sección Agentes todos se meten al mapa y caminan por la oficina ----------
  let mapa = null, vecinos = {}; const ocupadas = new Set();
  const aPantalla = (px, py) => {
    const r = mapa.el.getBoundingClientRect(), vb = mapa.vb, k = Math.min(r.width / vb.w, r.height / vb.h);
    return { x: r.left + (r.width - vb.w * k) / 2 + (px - vb.x) * k, y: r.top + (r.height - vb.h * k) / 2 + (py - vb.y) * k, k, ok: r.width > 40 };
  };
  const escalaMapa = k => Math.max(.22, Math.min(.6, (k * 40) / ANCHO));   // en el mapa miden ~40 px del plano (≈ 1.2 m)
  function rutaA(desde, hasta) {   // camino más corto entre dos nodos del mapa
    const prev = { [desde]: null }, cola = [desde];
    while (cola.length) { const u = cola.shift(); if (u === hasta) break; for (const v of vecinos[u] || []) if (!(v in prev)) { prev[v] = u; cola.push(v); } }
    if (!(hasta in prev)) return [];
    const ruta = []; for (let n = hasta; n !== desde; n = prev[n]) ruta.unshift(n);
    return ruta;
  }
  function iniciarEntrada(m, i) { if (mapa && !ocultos.has(m.id) && m.estado !== 'mapa' && m.estado !== 'hacia-mapa') m.entraEn = performance.now() + i * 140; }
  function comenzarVuelo(m) {
    if (m.imprimiendo) terminarImpresion(m);
    const usados = new Set(); mascotas.forEach(o => { if ((o.estado === 'mapa' || o.estado === 'hacia-mapa') && o.nodo) usados.add(o.nodo); });
    const libres = mapa.entradas.filter(n => !usados.has(n));
    m.nodo = (libres.length ? libres : mapa.entradas)[Math.floor(Math.random() * (libres.length || mapa.entradas.length))];
    m.entraEn = 0; m.estado = 'hacia-mapa'; m.vx = m.vy = 0; m.sentada = null; m.ruta = [];
    m.t0v = performance.now(); m.durv = 950; m.esc0 = m.esc; m.fx0 = m.x + ANCHO * m.esc / 2; m.fy0 = m.y + ALTO * m.esc;
    m.el.classList.add('en-mapa'); m.el.classList.remove('agarrada');
  }
  function colocar(m, fx, fy) { m.x = fx - ANCHO * m.esc / 2; m.y = fy - ALTO * m.esc; }   // (fx, fy) = donde pisan los pies
  function elegirDestino(m) {
    const libres = mapa.sillas.filter(id => !ocupadas.has(id));
    let destino;
    if (libres.length && Math.random() < .45) { destino = libres[Math.floor(Math.random() * libres.length)]; m.sentada = destino; ocupadas.add(destino); }   // va a trabajar a un escritorio
    else { const otros = Object.keys(mapa.nodos).filter(id => !mapa.sillas.includes(id) && id !== m.nodo); destino = otros[Math.floor(Math.random() * otros.length)]; }
    m.ruta = rutaA(m.nodo, destino);
    if (!m.ruta.length) { m.espera = 1; if (m.sentada) { ocupadas.delete(m.sentada); m.sentada = null; } }
  }
  function pasoMapa(m, dt) {
    const ahora = performance.now();
    if (m.estado === 'hacia-mapa') {   // vuelo desde donde estaba hasta su lugar en el mapa
      const [nx, ny] = mapa.nodos[m.nodo], d = aPantalla(nx, ny);
      const u = Math.min(1, (ahora - m.t0v) / m.durv), e = u * u * (3 - 2 * u);
      m.esc = m.esc0 + (escalaMapa(d.k) - m.esc0) * e;
      colocar(m, m.fx0 + (d.x - m.fx0) * e, m.fy0 + (d.y - m.fy0) * e - Math.sin(Math.PI * u) * 90);
      if (u >= 1) { m.estado = 'mapa'; m.mx = nx; m.my = ny; m.ruta = []; m.espera = aleatorio(.3, 1.5); }
      return false;
    }
    const base = aPantalla(0, 0); m.esc = escalaMapa(base.k);
    const quieta = abierta === m.id || reducir() || !base.ok;
    let camina = false;
    if (!quieta) {
      if (m.espera > 0) m.espera -= dt;
      else if (m.ruta.length) {
        const [tx, ty] = mapa.nodos[m.ruta[0]], dx = tx - m.mx, dy = ty - m.my, dist = Math.hypot(dx, dy), avance = 46 * dt;
        if (dist <= avance) { m.mx = tx; m.my = ty; m.nodo = m.ruta.shift(); if (!m.ruta.length) m.espera = m.sentada ? aleatorio(8, 18) : aleatorio(1.2, 4); }
        else { m.mx += dx / dist * avance; m.my += dy / dist * avance; camina = true; }
      } else { if (m.sentada) { ocupadas.delete(m.sentada); m.sentada = null; } elegirDestino(m); }
    }
    const p = aPantalla(m.mx, m.my); colocar(m, p.x, p.y);
    return camina;
  }

  function iniciarCapa() {
    if (capa) return;
    capa = document.createElement('div'); capa.id = 'capa-masc'; document.body.appendChild(capa);
    burbuja = document.createElement('div'); burbuja.id = 'burbuja-masc'; burbuja.hidden = true; burbuja.setAttribute('role', 'status'); document.body.appendChild(burbuja);
    document.addEventListener('pointerdown', e => { if (abierta && !e.target.closest('.masc, #burbuja-masc')) cerrar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    window.addEventListener('resize', () => mascotas.forEach(m => { m.x = Math.min(m.x, Math.max(0, innerWidth - ANCHO)); }));
    requestAnimationFrame(paso);
  }

  function crear(a, color) {
    const el = document.createElement('div');
    el.className = 'masc'; el.tabIndex = 0; el.setAttribute('role', 'button');
    el.innerHTML = `<span class="nombre-masc"></span>${dibujo(color)}`;
    capa.appendChild(el);
    const m = { id: a.id, el, x: aleatorio(20, Math.max(40, innerWidth - ANCHO - 20)), y: -ALTO - aleatorio(0, 160), vx: 0, vy: 0, estado: 'aire', dir: Math.random() < .5 ? -1 : 1, pausa: 0, salto: aleatorio(2, 6), plat: null, color, imp: aleatorio(8, 25), imprimiendo: 0, esc: 1, entraEn: 0 };
    ponerNombre(m, a);
    el.addEventListener('pointerdown', e => agarrar(m, e));
    el.addEventListener('pointermove', e => mover(m, e));
    el.addEventListener('pointerup', e => soltar(m, e));
    el.addEventListener('pointercancel', e => soltar(m, e, true));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(m.id); } });
    mascotas.set(a.id, m);
    if (mapa) iniciarEntrada(m, mascotas.size);
    aplicarMedidas(m); aplicarVisibilidad(m);
    return m;
  }
  function ponerNombre(m, a) {
    m.el.querySelector('.nombre-masc').textContent = a.nombre;
    m.el.setAttribute('aria-label', `${a.nombre}: ver su última actualización`);
  }

  // ---------- arrastrar y aventar ----------
  function agarrar(m, e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (mapa && (m.estado === 'mapa' || m.estado === 'hacia-mapa')) { alternar(m.id); return; }   // dentro del mapa solo se puede tocar para ver su burbuja
    try { m.el.setPointerCapture(e.pointerId); } catch { /* sin captura: el arrastre sigue por los eventos del propio elemento */ }
    m.estado = 'arrastre'; m.dx = e.clientX - m.x; m.dy = e.clientY - m.y;
    m.hist = [{ t: performance.now(), x: e.clientX, y: e.clientY }]; m.t0 = performance.now(); m.recorrido = 0; m.vx = m.vy = 0;
    m.el.classList.add('agarrada');
  }
  function mover(m, e) {
    if (m.estado !== 'arrastre') return;
    const antes = m.hist[m.hist.length - 1];
    m.recorrido += Math.hypot(e.clientX - antes.x, e.clientY - antes.y);
    m.x = Math.min(Math.max(0, e.clientX - m.dx), innerWidth - ANCHO);
    m.y = Math.min(Math.max(0, e.clientY - m.dy), innerHeight - ALTO);
    const t = performance.now();
    m.hist.push({ t, x: e.clientX, y: e.clientY });
    while (m.hist.length > 2 && t - m.hist[0].t > 120) m.hist.shift();
  }
  function soltar(m, e, cancelado) {
    if (m.estado !== 'arrastre') return;
    m.el.classList.remove('agarrada');
    try { m.el.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    const clic = !cancelado && m.recorrido < 6 && performance.now() - m.t0 < 400;
    const a = m.hist[0], b = m.hist[m.hist.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
    m.estado = 'aire'; m.plat = null;
    if (clic) { m.vx = 0; m.vy = 0; alternar(m.id); return; }
    const limite = v => Math.max(-2600, Math.min(2600, v));
    m.vx = limite((b.x - a.x) / dt); m.vy = limite((b.y - a.y) / dt);   // lo aventado conserva la velocidad de la mano
  }

  // ---------- burbuja ----------
  function alternar(id) { if (abierta === id) cerrar(); else abrir(id); }
  function abrir(id) {
    const m = mascotas.get(id); if (!m) return;
    abierta = id; burbuja.innerHTML = contenidoBurbuja(id) + '<button type="button" class="bub-x" aria-label="Cerrar">×</button>';
    burbuja.querySelector('.bub-x').addEventListener('click', cerrar);
    burbuja.hidden = false; burbuja.classList.remove('sin-cola'); burbuja.style.setProperty('--color-masc', m.color);
    ubicarBurbuja(m);
  }
  function cerrar() { abierta = null; if (burbuja) burbuja.hidden = true; }
  function ubicarBurbuja(m) {
    const bw = burbuja.offsetWidth, bh = burbuja.offsetHeight;
    const rm = m.el.getBoundingClientRect();   // sirve igual afuera y dentro del mapa (donde la mascota es más chica)
    const centro = rm.left + rm.width / 2;
    let izq = Math.min(Math.max(8, centro - bw / 2), innerWidth - bw - 8);
    let arriba = rm.top - bh - 14, abajo = false;
    if (arriba < 8) { arriba = rm.bottom + 14; abajo = true; }
    burbuja.style.left = izq + 'px'; burbuja.style.top = arriba + 'px';
    burbuja.style.setProperty('--cola', Math.min(Math.max(16, centro - izq), bw - 16) + 'px');
    burbuja.classList.toggle('abajo', abajo);
  }

  function aplicarMedidas(m) {
    m.el.style.width = ANCHO + 'px'; m.el.style.height = ALTO + 'px';
    const svg = m.el.querySelector('svg'); svg.setAttribute('width', ANCHO); svg.setAttribute('height', ALTO);
  }
  function aplicarVisibilidad(m) {
    const oculta = ocultos.has(m.id);
    m.el.hidden = oculta; m.el.style.display = oculta ? 'none' : '';
    if (oculta && abierta === m.id) cerrar();
  }

  // ---------- plataformas: la parte de arriba de las tarjetas ----------
  function plataformas() {
    const lista = [];
    document.querySelectorAll('.tarjeta, .col-red, .menu, .logo-img').forEach(el => {
      if (!el.offsetParent) return;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.top < ALTO + 4 || r.top > innerHeight - 12) return;
      lista.push({ izq: r.left, der: r.right, arriba: r.top });
    });
    return lista;
  }
  const bajoLosPies = (m, lista, tol) => {
    const centro = m.x + ANCHO / 2, pie = m.y + ALTO;
    return lista.find(p => centro > p.izq + 6 && centro < p.der - 6 && Math.abs(pie - p.arriba) <= tol) || null;
  };

  // ---------- bucle de movimiento ----------
  function paso(t) {
    const dt = Math.min(0.05, (t - (ultimo || t)) / 1000); ultimo = t;
    const lista = plataformas(), suelo = innerHeight, maxX = Math.max(0, innerWidth - ANCHO);
    mascotas.forEach(m => {
      if (ocultos.has(m.id)) { if (m.imprimiendo) terminarImpresion(m); return; }
      if (m.imprimiendo && (m.estado !== 'suelo' || performance.now() >= m.imprimiendo)) terminarImpresion(m);
      if (m.entraEn && mapa && m.estado !== 'arrastre' && performance.now() >= m.entraEn) comenzarVuelo(m);
      if (m.estado === 'hacia-mapa' || m.estado === 'mapa') {
        if (!mapa) { m.estado = 'aire'; m.vx = m.vy = 0; }
        else {
          const camina = pasoMapa(m, dt);
          m.el.classList.toggle('caminando', camina); m.el.classList.remove('en-aire');
          m.el.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) scale(${m.esc.toFixed(3)})`;
          return;
        }
      }
      if (m.esc !== 1) { m.esc += (1 - m.esc) * Math.min(1, dt * 7); if (Math.abs(1 - m.esc) < .015) { m.esc = 1; m.el.classList.remove('en-mapa'); } }
      if (m.estado === 'aire') {
        const pieAntes = m.y + ALTO;
        m.vy += GRAVEDAD * dt; m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.x < 0) { m.x = 0; m.vx = -m.vx * .5; } else if (m.x > maxX) { m.x = maxX; m.vx = -m.vx * .5; }
        if (m.y < 0) { m.y = 0; m.vy = Math.abs(m.vy) * .3; }
        if (m.vy > 0) {
          const pie = m.y + ALTO, centro = m.x + ANCHO / 2;
          const p = lista.find(q => centro > q.izq + 6 && centro < q.der - 6 && pieAntes <= q.arriba + 2 && pie >= q.arriba);
          const piso = pie >= suelo ? { arriba: suelo } : p;
          if (piso) {
            m.y = piso.arriba - ALTO;
            if (m.vy > 650) { m.vy = -m.vy * .3; m.vx *= .7; }   // rebote al caer fuerte
            else { m.vy = 0; m.vx = 0; m.estado = 'suelo'; m.pausa = aleatorio(.3, 1.2); m.salto = aleatorio(2.5, 7); }
          }
        }
      } else if (m.estado === 'suelo') {
        const enSuelo = m.y + ALTO >= suelo - 2;
        const p = enSuelo ? { izq: 0, der: innerWidth } : bajoLosPies(m, lista, 8);
        if (!p) { m.estado = 'aire'; m.vx = 0; m.vy = 0; }
        else {
          if (!enSuelo) m.y = p.arriba - ALTO;
          const quieta = abierta === m.id || reducir();
          m.pausa -= dt; m.salto -= dt;
          if (!quieta && m.pausa <= 0) {
            m.x += m.dir * 46 * escala * dt;
            const centro = m.x + ANCHO / 2;
            if (m.x < 0 || m.x > maxX) { m.x = Math.min(Math.max(0, m.x), maxX); m.dir = -m.dir; }
            else if (!enSuelo && (centro < p.izq + 4 || centro > p.der - 4)) {
              if (Math.random() < .45) { m.dir = -m.dir; m.x += m.dir * 6; }   // da la vuelta
              else { m.estado = 'aire'; m.vx = m.dir * 40; m.vy = 0; }         // se avienta al vacío
            }
            if (Math.random() < dt * .25) { m.pausa = aleatorio(.8, 2.5); m.dir = Math.random() < .5 ? -1 : 1; }
          }
          if (!quieta && !m.imprimiendo) { m.imp -= dt; if (m.imp <= 0) { if (!iniciarImpresion(m)) m.imp = 5; } }
          if (!quieta && !m.imprimiendo && m.salto <= 0 && m.estado === 'suelo') {   // salto ocasional para subir a otras tarjetas
            m.estado = 'aire'; m.vy = -aleatorio(700, 1150); m.vx = m.dir * aleatorio(60, 240); m.salto = aleatorio(3, 8);
          }
        }
      }
      const caminando = m.estado === 'suelo' && m.pausa <= 0 && abierta !== m.id;
      m.el.classList.toggle('caminando', caminando);
      m.el.classList.toggle('en-aire', m.estado === 'aire');
      m.el.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0)${m.esc !== 1 ? ` scale(${m.esc.toFixed(3)})` : ''}`;
    });
    if (abierta) { const m = mascotas.get(abierta); if (m) ubicarBurbuja(m); else cerrar(); }
    requestAnimationFrame(paso);
  }

  window.Mascotas = {
    // agentes: lista de { id, nombre, color }; contenido(id) devuelve el HTML de la burbuja
    sincronizar(agentes, contenido) {
      iniciarCapa();
      if (contenido) contenidoBurbuja = contenido;
      const vivos = new Set(agentes.map(a => a.id));
      mascotas.forEach((m, id) => { if (!vivos.has(id)) { m.el.remove(); mascotas.delete(id); if (abierta === id) cerrar(); } });
      agentes.forEach(a => {
        const m = mascotas.get(a.id);
        if (!m) { crear(a, a.color); return; }
        ponerNombre(m, a);
        if (m.color !== a.color) { m.color = a.color; m.el.querySelector('.cuerpo-m').setAttribute('fill', a.color); }
      });
      if (abierta && Date.now() > anuncioHasta) abrir(abierta);   // refresca el texto si los datos cambiaron (sin pisar un aviso)
    },
    // Aviso temporal de una mascota: salta y muestra su burbuja unos segundos. Si su mascota está oculta, sale como aviso en una esquina.
    anunciar(id, html, ms = 10000) {
      iniciarCapa();
      const m = mascotas.get(id), visible = !!m && !ocultos.has(id);
      if (visible && m.estado === 'suelo') { m.vy = -700; m.estado = 'aire'; }
      abierta = visible ? id : null;
      burbuja.innerHTML = html + '<button type="button" class="bub-x" aria-label="Cerrar">×</button>';
      burbuja.querySelector('.bub-x').addEventListener('click', cerrar);
      burbuja.hidden = false; burbuja.style.setProperty('--color-masc', visible ? m.color : '#e72c5e');
      if (visible) { burbuja.classList.remove('sin-cola'); ubicarBurbuja(m); }
      else { burbuja.classList.add('sin-cola'); burbuja.style.left = Math.max(8, innerWidth - burbuja.offsetWidth - 20) + 'px'; burbuja.style.top = Math.max(8, innerHeight - burbuja.offsetHeight - 20) + 'px'; }
      anuncioHasta = Date.now() + ms; clearTimeout(relojAnuncio);
      relojAnuncio = setTimeout(() => { if (Date.now() >= anuncioHasta - 50) cerrar(); }, ms);
      return visible;
    },
    // Hace que una mascota (o todas, sin id) saque la impresora 3D ahora mismo
    imprimir(id) { mascotas.forEach(m => { if (id === undefined || m.id === id) iniciarImpresion(m); }); },
    // Mapa 2D: todos los agentes se meten al mapa (info viene de Mapa2D.montar) y se quedan trabajando ahí
    irAlMapa(info) {
      iniciarCapa(); mapa = info; vecinos = {};
      info.aristas.forEach(([a, b]) => { (vecinos[a] ||= []).push(b); (vecinos[b] ||= []).push(a); });
      ocupadas.clear(); [...mascotas.values()].forEach(m => { if (m.estado === 'mapa' && m.sentada) ocupadas.add(m.sentada); });
      let i = 0; mascotas.forEach(m => iniciarEntrada(m, i++));
    },
    // Al salir de la sección, los agentes salen del mapa de un salto y vuelven a caminar por la página
    salirDelMapa() {
      mapa = null; ocupadas.clear();
      mascotas.forEach(m => {
        m.entraEn = 0;
        if (m.estado === 'mapa' || m.estado === 'hacia-mapa') { m.estado = 'aire'; m.vx = aleatorio(-220, 220); m.vy = -aleatorio(500, 800); m.sentada = null; }
      });
    },
    preferencias() { return { escala, ocultos: [...ocultos] }; },
    // cambia el tamaño de todas (0.5 a 2.5 veces); los pies se quedan en su lugar para que no floten ni se hundan
    cambiarEscala(v) {
      v = Math.min(2.5, Math.max(.5, Number(v) || 1));
      const antes = ALTO; escala = v; ANCHO = Math.round(BASE_ANCHO * v); ALTO = Math.round(BASE_ALTO * v);
      mascotas.forEach(m => { m.y = Math.max(0, m.y + antes - ALTO); m.x = Math.min(m.x, Math.max(0, innerWidth - ANCHO)); aplicarMedidas(m); });
      guardarPrefs();
    },
    mostrarAgente(id, visible) {
      if (visible) ocultos.delete(id); else ocultos.add(id);
      const m = mascotas.get(id); if (m) { aplicarVisibilidad(m); if (visible) { m.estado = 'aire'; m.vy = 0; m.y = Math.min(m.y, 40); m.esc = 1; iniciarEntrada(m, 0); } }
      guardarPrefs();
    },
    mostrar(id) { const m = mascotas.get(id); if (!m || ocultos.has(id)) return; if (m.estado === 'suelo') { m.vy = -650; m.estado = 'aire'; } abrir(id); },
  };
})();
