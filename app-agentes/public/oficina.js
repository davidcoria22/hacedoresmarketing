// Oficina isométrica con detalle: los agentes caminan y trabajan según su última ejecución.
const ESC = 34, COS = 0.866, SEN = 0.5, OX = 450, OY = 200;
const VB = { w: 900, h: 660 };

function P(x, y, z = 0) { return [OX + (x - y) * COS * ESC, OY + (x + y) * SEN * ESC - z * ESC]; }
const pts = a => a.map(p => P(...p).map(v => v.toFixed(1)).join(',')).join(' ');
function tono(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}
// Caja con cara frontal, lateral y superior
function caja(x, y, w, d, h, c, z0 = 0) {
  return `<polygon points="${pts([[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, h], [x, y + d, h]])}" fill="${tono(c, .82)}"/>
  <polygon points="${pts([[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, h], [x + w, y, h]])}" fill="${tono(c, .66)}"/>
  <polygon points="${pts([[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]])}" fill="${c}"/>`;
}
function linea(a, b, c, g = 1) {
  const [x1, y1] = P(...a), [x2, y2] = P(...b);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${g}"/>`;
}
function plano(a, c, extra = '') { return `<polygon points="${pts(a)}" fill="${c}" ${extra}/>`; }

// Escritorios: mesa + monitor + silla (la silla queda del lado de quien trabaja)
const ESCRITORIOS = [
  { x: 2.2, y: 1.8 }, { x: 6.2, y: 1.8 }, { x: 10.2, y: 1.8 }, { x: 2.2, y: 5.6 },
];
const SILLAS = ESCRITORIOS.map(e => [e.x + 1.0, e.y + 1.7]);

function escena() {
  let s = '';
  // Piso con tablones
  s += plano([[0, 0, 0], [14, 0, 0], [14, 12, 0], [0, 12, 0]], '#D8BE9C');
  for (let i = 1; i < 14; i++) s += linea([i, 0, 0], [i, 12, 0], '#C7A982', .8);
  // Alfombra
  s += plano([[4.8, 6.6, 0.01], [9.8, 6.6, 0.01], [9.8, 9.6, 0.01], [4.8, 9.6, 0.01]], '#B9C8B2');
  s += plano([[5.1, 6.9, 0.02], [9.5, 6.9, 0.02], [9.5, 9.3, 0.02], [5.1, 9.3, 0.02]], '#CBD8C4');
  // Muros
  s += plano([[0, 0, 0], [14, 0, 0], [14, 0, 4.5], [0, 0, 4.5]], '#EEF0EA');
  s += plano([[0, 0, 0], [0, 12, 0], [0, 12, 4.5], [0, 0, 4.5]], '#E2E6DC');
  // Zócalo
  s += plano([[0, 0.02, 0], [14, 0.02, 0], [14, 0.02, .25], [0, 0.02, .25]], '#C9CFC2');
  s += plano([[0.02, 0, 0], [0.02, 12, 0], [0.02, 12, .25], [0.02, 0, .25]], '#C9CFC2');
  // Ventanas (muro izquierdo) con luz
  for (const yy of [1.2, 4.8]) {
    s += plano([[0.03, yy, 1.4], [0.03, yy + 2.6, 1.4], [0.03, yy + 2.6, 3.6], [0.03, yy, 3.6]], '#A9D7E3');
    s += plano([[0.04, yy + 1.2, 1.4], [0.04, yy + 1.4, 1.4], [0.04, yy + 1.4, 3.6], [0.04, yy + 1.2, 3.6]], '#8E9A8B');
  }
  s += plano([[0.05, 1.2, 0.02], [0.05, 7.4, 0.02], [4.5, 7.4, 0.02], [4.5, 1.2, 0.02]], '#FFF6DA', 'opacity=".35"');
  // Pizarrón y tablero de corcho (muro del fondo)
  s += plano([[7.6, 0.03, 1.5], [10.8, 0.03, 1.5], [10.8, 0.03, 3.4], [7.6, 0.03, 3.4]], '#FFFFFF', 'stroke="#8A8F86" stroke-width="2"');
  s += plano([[4.2, 0.03, 1.4], [5.8, 0.03, 1.4], [5.8, 0.03, 2.8], [4.2, 0.03, 2.8]], '#D9A77A');
  [[4.4, 2.0, '#E08A4B'], [5.0, 1.9, '#5E8C61'], [4.6, 2.4, '#5E7FB0']].forEach(([x, z, c]) => s += plano([[x, .05, z], [x + .45, .05, z], [x + .45, .05, z + .45], [x, .05, z + .45]], c));
  // Reloj
  const [cx, cy] = P(2.2, 0.04, 3.7);
  s += `<circle cx="${cx}" cy="${cy}" r="${ESC * .45}" fill="#FFFFFF" stroke="#2B2F2A" stroke-width="2"/>
        <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - ESC * .3}" stroke="#2B2F2A" stroke-width="2"/>`;
  return s;
}

// Objetos en orden de profundidad (de atrás hacia adelante)
function objetos() {
  const L = [];
  // Estantería (muro izquierdo)
  L.push({ k: 0.5, s: caja(0.1, 8.2, 0.7, 2.8, 2.7, '#B07A4A') + linea([0.85, 8.2, 1.3], [0.85, 11, 1.3], '#7E5532', 2) + linea([0.85, 8.2, 2.0], [0.85, 11, 2.0], '#7E5532', 2) });
  // Planta alta del fondo derecha
  L.push({ k: 12, s: planta(12.5, 0.8, 1.1) });
  // Escritorios con monitor y silla
  ESCRITORIOS.forEach((e, i) => {
    L.push({ k: e.x + e.y + 2.2 + 1.1, s: caja(e.x, e.y, 2.2, 1.1, .9, '#FFFFFF') + caja(e.x + .8, e.y + .15, .6, .08, .7, '#2B2F2A', .9) + caja(e.x + .9, e.y + .2, .4, .04, .15, '#2B2F2A', .75) });
    L.push({ k: SILLAS[i][0] + SILLAS[i][1], s: silla(SILLAS[i][0], SILLAS[i][1]) });
  });
  // Sofá naranja
  L.push({ k: 11.5 + 9.2, s: sofa(9.6, 8.2) });
  // Mesa de centro
  L.push({ k: 10.8 + 10.4, s: caja(10.4, 10.2, 1.4, 1.1, .5, '#B07A4A') + caja(10.6, 10.4, .3, .3, .25, '#F3EFE6', .5) });
  // Lámpara de pie junto al sofá
  L.push({ k: 12.4 + 7.6, s: lampara(12.2, 6.8) });
  // Cafetería
  L.push({ k: 2.3 + 10.5, s: caja(1.5, 10.2, 2.6, .8, 1.0, '#EDE9E0') + caja(2.4, 10.3, .5, .5, .45, '#3E4A3F', 1.0) + caja(3.2, 10.3, .3, .3, .18, '#FFFFFF', 1.0) });
  // Mesa redonda pequeña
  L.push({ k: 7.2 + 11.3, s: cilindro(7.4, 11.2, .8, .7) });
  // Plantas
  L.push({ k: 0.5 + 11.5, s: planta(0.8, 11.5, .9) });
  L.push({ k: 13.5 + 11.5, s: planta(13.2, 11.2, 1.2) });
  L.push({ k: 3 + 0.3, s: planta(13.2, 4.6, 1) });
  // Máquina de agua
  L.push({ k: 11 + 0.5, s: caja(10.8, 0.5, .6, .6, 1.9, '#E8F1F5') + caja(10.9, .6, .4, .4, .3, '#BFE0E8', 1.9) });
  L.sort((a, b) => a.k - b.k);
  return L.map(o => o.s).join('');
}
function silla(x, y) {
  return caja(x, y, .7, .7, .5, '#5B6370') + caja(x + .05, y + .65, .6, .1, .8, '#5B6370', .5);
}
function sofa(x, y) {
  return caja(x, y, 2.6, 1.0, .5, '#E08A4B') + caja(x, y, 2.6, .3, 1.2, '#D2763A', .5) + caja(x - .25, y, .3, 1.0, .9, '#D2763A') + caja(x + 2.55, y, .3, 1.0, .9, '#D2763A') + caja(x + .3, y + .15, 1.0, .7, .15, '#F3D2B0', .5);
}
function planta(x, y, z) {
  const hojas = [[0, 0, 1.9, 0.9], [-.3, .1, 1.5, .6], [.3, -.1, 2.2, .6], [0, .3, 2.4, .5]];
  let s = caja(x - .3, y - .3, .6, .6, .7, '#C98F65');
  for (const [dx, dy, h, r] of hojas) {
    const [px, py] = P(x + dx, y + dy, h + z * .3);
    s += `<circle cx="${px}" cy="${py}" r="${r * ESC * .9}" fill="${dx === 0 && dy === .3 ? '#7FA97B' : '#5E8C61'}"/>`;
  }
  return s;
}
function cilindro(x, y, r, h) {
  const [cx, cy] = P(x, y, h), [bx, by] = P(x, y, 0);
  return `<ellipse cx="${bx}" cy="${by}" rx="${r * ESC}" ry="${r * ESC * .5}" fill="#B07A4A"/>
          <rect x="${cx - r * ESC}" y="${cy}" width="${r * ESC * 2}" height="${by - cy}" fill="#B07A4A"/>
          <ellipse cx="${cx}" cy="${cy}" rx="${r * ESC}" ry="${r * ESC * .5}" fill="#D9B98E"/>`;
}
function lampara(x, y) {
  const [px, py] = P(x, y, 0), [sx, sy] = P(x, y, 2.6);
  return `<line x1="${px}" y1="${py}" x2="${sx}" y2="${sy}" stroke="#2B2F2A" stroke-width="2"/>
          <ellipse cx="${sx}" cy="${sy}" rx="${ESC * .4}" ry="${ESC * .25}" fill="#F7E6B0"/>`;
}

// ---------- personajes ----------
const COLORES = ['#5E8C61', '#E08A4B', '#5E7FB0', '#C4553D', '#8A6FB0', '#3E8C8C'];
const LUGARES_CAMINAR = [[10.2, 9.2], [4.3, 10.5], [9.2, 2.6], [6.5, 8.2], [1.6, 3.8], [12.4, 9.9]];

function figura(id, nombre, color) {
  return `<g class="fig" id="fig-${id}" data-id="${id}" style="cursor:pointer">
    <ellipse cx="0" cy="0" rx="11" ry="4.5" fill="rgba(40,40,30,.18)"/>
    <g class="cuerpo">
      <rect class="pi" x="-5" y="-12" width="4" height="12" rx="2" fill="#3A3F48"/>
      <rect class="pd" x="1" y="-12" width="4" height="12" rx="2" fill="#3A3F48"/>
      <rect x="-7" y="-27" width="14" height="16" rx="6" fill="${color}"/>
      <rect class="bi" x="-10" y="-25" width="4" height="11" rx="2" fill="${color}"/>
      <rect class="bd" x="6" y="-25" width="4" height="11" rx="2" fill="${color}"/>
      <circle cx="0" cy="-33" r="6.5" fill="#F2C9A0"/>
      <path d="M-7,-35 Q0,-43 7,-35 Q4,-37 0,-37 Q-4,-37 -7,-35 Z" fill="#2B2F2A"/>
    </g>
    <g class="globo" transform="translate(0,-52)">
      <rect x="-62" y="-12" width="124" height="18" rx="9" fill="#FFFFFF" stroke="#E6E2D8"/>
      <text text-anchor="middle" y="1" font-size="10" fill="#2B2F2A"><tspan font-weight="600">${nombre}</tspan> <tspan class="estado" fill="#7A8075"></tspan></text>
    </g>
  </g>`;
}
function hoyTexto() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function iniciarOficina(agentes, onElegir) {
  const cont = document.getElementById('oficina');
  if (!cont) return;
  const hoy = hoyTexto();
  cont.innerHTML = `<svg viewBox="0 0 ${VB.w} ${VB.h}" class="escena-svg">
      ${escena()}
      ${objetos()}
      <g id="personajes"></g>
    </svg>`;
  const capa = cont.querySelector('#personajes');
  const personas = agentes.map((a, i) => ({
    agente: a, color: COLORES[i % COLORES.length],
    trabaja: !!(a.ultimo && a.ultimo.fecha === hoy),
    x: 9.5, y: 9.0, destino: null, espera: Math.random() * 2, mirando: 1, slot: null,
  }));
  capa.innerHTML = personas.map((p, i) => figura(p.agente.id, p.agente.nombre.split(' ').slice(0, 2).join(' '), p.color)).join('');
  capa.querySelectorAll('.fig').forEach(g => g.addEventListener('click', () => onElegir(g.dataset.id)));

  // Asignar escritorios a quienes trabajan hoy; el resto camina
  let libre = 0;
  personas.forEach(p => {
    if (p.trabaja && libre < ESCRITORIOS.length) {
      p.slot = libre; p.x = SILLAS[libre][0]; p.y = SILLAS[libre][1]; libre++;
    } else p.trabaja = false;
  });

  function nuevoDestino(p) {
    const c = LUGARES_CAMINAR[Math.floor(Math.random() * LUGARES_CAMINAR.length)];
    p.destino = [c[0] + (Math.random() - .5) * .6, c[1] + (Math.random() - .5) * .6];
  }
  let ultimo = performance.now();
  function frame(t) {
    const dt = Math.min(.1, (t - ultimo) / 1000); ultimo = t;
    const s = t / 1000;
    personas.forEach((p, idx) => {
      const g = document.getElementById('fig-' + p.agente.id);
      if (!g) return;
      let caminando = false;
      if (!p.trabaja) {
        if (!p.destino) { p.espera -= dt; if (p.espera <= 0) { nuevoDestino(p); } }
        if (p.destino) {
          const dx = p.destino[0] - p.x, dy = p.destino[1] - p.y, d = Math.hypot(dx, dy);
          if (d > .05) {
            const v = 1.1 * dt, k = Math.min(v, d) / d;
            p.x += dx * k; p.y += dy * k; caminando = true;
            if (Math.abs(dx) > .01) p.mirando = dx < 0 ? -1 : 1;
          } else { p.destino = null; p.espera = 2 + Math.random() * 4; }
        }
      }
      const [sx, sy] = P(p.x, p.y);
      const rebote = p.trabaja ? Math.abs(Math.sin(s * 3 + idx)) * 0.6 : (caminando ? Math.abs(Math.sin(s * 8)) * 1.8 : Math.sin(s * 2 + idx) * .4);
      g.setAttribute('transform', `translate(${sx.toFixed(1)},${(sy - rebote).toFixed(1)}) scale(${(p.mirando * 1.25).toFixed(2)},1.25)`);
      // Piernas: caminan; sentados no se mueven
      const a = caminando ? Math.sin(s * 8) * 28 : 0;
      g.querySelector('.pi').setAttribute('transform', `rotate(${a.toFixed(1)} -3 -12)`);
      g.querySelector('.pd').setAttribute('transform', `rotate(${(-a).toFixed(1)} 3 -12)`);
      // Brazos: teclean si trabajan, si no se balancean al caminar
      const b = p.trabaja ? Math.sin(s * 10 + idx) * 12 - 18 : (caminando ? -a * .6 : 0);
      g.querySelector('.bi').setAttribute('transform', `rotate(${(-b).toFixed(1)} -8 -25)`);
      g.querySelector('.bd').setAttribute('transform', `rotate(${(p.trabaja ? -Math.sin(s * 10 + idx + 1) * 12 + 18 : b).toFixed(1)} 8 -25)`);
      const estado = p.trabaja ? 'trabajando' : caminando ? 'caminando' : 'descansando';
      g.querySelector('.estado').textContent = estado;
      g.querySelector('.estado').setAttribute('fill', p.trabaja ? '#5E8C61' : '#7A8075');
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
