// Oficina 3D de Hacedores, reconstruida desde cero a partir del plano (imagen cenital).
// Medidas: la imagen del plano mide 1280x720 px; las losetas de 60 cm miden 20 px, así que 1 m = 33.33 px.
// El origen del mundo es el punto de la imagen que queda justo debajo de la cámara del plano (nadir).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const COLORES = ['#5E8C61', '#E08A4B', '#5E7FB0', '#C4553D', '#8A6FB0', '#3E8C8C'];
const PXM = 33.333;          // píxeles de la imagen por metro
const NX = 650, NZ = 330;    // nadir de la imagen (px)
const P = (X, Y) => [(X - NX) / PXM, (Y - NZ) / PXM];
const R = (X1, Y1, X2, Y2) => { const c = P((X1 + X2) / 2, (Y1 + Y2) / 2); return { x: c[0], z: c[1], w: (X2 - X1) / PXM, d: (Y2 - Y1) / PXM }; };

const VISTAS = {
  general: { pos: [0.2, 24, 17.5], tgt: [0.2, 0, 1.6] },
  interior: { pos: [1.5, 1.7, 5.7], tgt: [-1.2, 1.4, -6.5] },
};
// sillas de los escritorios de cómputo (arriba), centro del asiento en px del plano
const SILLAS_TRABAJO = [[700, 93], [760, 93], [819, 93], [880, 93]];
const CAMINAR = [[590, 270], [610, 390], [690, 470], [640, 560], [740, 520], [850, 520], [860, 240], [700, 300]].map(([X, Y]) => P(X, Y));

// ---------- texturas procedurales ----------
function textura(dibujar, w = 512, h = 512, repetir = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  dibujar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repetir); }
  return t;
}
const texPiso = () => textura((g, w, h) => {
  g.fillStyle = '#ECEAF1'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.4})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  g.strokeStyle = '#A7A4B3'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
}, 256, 256, [1 / 0.6, 1 / 0.6]);
const texPantalla = seed => textura((g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#1B2B3D'); gr.addColorStop(1, '#2F5A6E');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const cols = ['#7FC8A9', '#E8C170', '#8FB8DE', '#E08A7B'];
  for (let i = 0; i < 9; i++) { g.fillStyle = cols[(i + seed) % 4]; g.fillRect(16, 18 + i * 14, 20 + ((i * 37 + seed * 13) % 120), 6); }
}, 256, 160);
const texMural = () => textura((g, w, h) => {
  g.fillStyle = '#9ACD32'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { g.fillStyle = ['#2E7D32', '#43A047', '#1B5E20'][i % 3]; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 10, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#3A3A3A'; g.lineWidth = 34; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(120, 150); g.lineTo(560, 150); g.lineTo(560, 300); g.lineTo(120, 300); g.lineTo(120, 430); g.lineTo(900, 430); g.stroke();
  g.strokeStyle = '#F2F2F2'; g.lineWidth = 6; g.setLineDash([18, 14]);
  g.beginPath(); g.moveTo(120, 150); g.lineTo(560, 150); g.lineTo(560, 300); g.lineTo(120, 300); g.lineTo(120, 430); g.lineTo(900, 430); g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#E53935'; g.font = 'bold 64px sans-serif'; g.fillText('hacedores', 600, 110);
  ['#F2C14E', '#E08A7B', '#8FB8DE'].forEach((c, i) => { g.fillStyle = c; g.fillRect(700 + i * 70, 360, 50, 40); });
}, 1024, 512);
const texMadera = () => textura((g, w, h) => {
  g.fillStyle = '#D9A47F'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(150,90,50,${0.05 + Math.random() * 0.12})`; g.fillRect(0, i * 22, w, 11 + Math.random() * 10); }
  g.strokeStyle = 'rgba(120,70,40,.25)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const y = Math.random() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 2); g.stroke(); }
}, 512, 512, [1, 1]);
const texPanelRojoAzul = () => textura((g, w, h) => {
  g.fillStyle = '#C8102E'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1428D6';
  g.beginPath(); g.moveTo(w * 0.52, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w * 0.42, h); g.closePath(); g.fill();
}, 512, 256);

// ---------- objetos base ----------
function mat(color, rough = 0.6, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0.02, ...extra });
}
const vidrioMat = () => new THREE.MeshStandardMaterial({ color: '#BFE3EE', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
function caja(w, h, d, material, x, y, z, sombra = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = sombra && !material.transparent; m.receiveShadow = true;
  return m;
}
function cilindro(r, h, material, x, y, z, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
// bloque definido por su huella en píxeles del plano (X1,Y1)-(X2,Y2), altura h y altura de base y0
function bloque(scene, X1, Y1, X2, Y2, h, material, y0 = 0) {
  const r = R(X1, Y1, X2, Y2);
  const m = caja(r.w, h, r.d, material, r.x, y0 + h / 2, r.z);
  scene.add(m); return m;
}
const T = 8; // grosor de muro en px (0.24 m)
// muro por su línea central (horizontal o vertical); alto 3.4 m con zócalo
function pared(scene, X1, Y1, X2, Y2, material) {
  const m = material || mat('#EEF0EA', 0.95);
  if (Y1 === Y2) { bloque(scene, X1 - T / 2, Y1 - T / 2, X2 + T / 2, Y2 + T / 2, 3.4, m, 0); bloque(scene, X1 - T / 2 - 1.5, Y1 - T / 2 - 1.5, X2 + T / 2 + 1.5, Y2 + T / 2 + 1.5, 0.12, mat('#C9CFC2', 0.6), 0); }
  else { bloque(scene, X1 - T / 2, Y1 - T / 2, X2 + T / 2, Y2 + T / 2, 3.4, m, 0); bloque(scene, X1 - T / 2 - 1.5, Y1 - T / 2 - 1.5, X2 + T / 2 + 1.5, Y2 + T / 2 + 1.5, 0.12, mat('#C9CFC2', 0.6), 0); }
}
// muro con ventanas: base sólida, vidrio, dintel y marcos de aluminio cada "paso" px
function muroVentana(scene, X1, Y1, X2, Y2, paso) {
  const m = mat('#EEF0EA', 0.95);
  const e = T / 2;
  bloque(scene, X1 - e, Y1 - e, X2 + e, Y2 + e, 0.9, m, 0);
  bloque(scene, X1 - e, Y1 - e, X2 + e, Y2 + e, 0.5, m, 2.9);
  bloque(scene, X1 - e, Y1 - e, X2 + e, Y2 + e, 2.0, vidrioMat(), 0.9);
  const marco = mat('#3A3F48', 0.4, { metalness: 0.5 });
  // solo 2 marcos en cada extremo de la ventana
  // 4 marcos con la misma separacion entre ellos y hasta las paredes (extremos)
  for (let k = 1; k <= 4; k++) {
    const f = k / 5;
    if (Y1 === Y2) { const X = X1 + (X2 - X1) * f; bloque(scene, X - 1.5, Y1 - e - 1, X + 1.5, Y1 + e + 1, 2.0, marco, 0.9); }
    else { const Y = Y1 + (Y2 - Y1) * f; bloque(scene, X1 - e - 1, Y - 1.5, X1 + e + 1, Y + 1.5, 2.0, marco, 0.9); }
  }
}
// tabique de vidrio de piso a techo con marcos
function vidrioMuro(scene, X1, Y1, X2, Y2) {
  const e = 2.5, marco = mat('#3A3F48', 0.4, { metalness: 0.5 });
  bloque(scene, X1 - e, Y1, X2 + e, Y2, 3.2, vidrioMat(), 0.1);
  bloque(scene, X1 - e - 0.5, Y1, X2 + e + 0.5, Y2, 0.1, marco, 0);
  bloque(scene, X1 - e - 0.5, Y1, X2 + e + 0.5, Y2, 0.1, marco, 3.3);
  const vertical = X1 === X2;
  const a = vertical ? Y1 : X1, b = vertical ? Y2 : X2;
  for (const q of [a, (a + b) / 2, b]) {
    if (vertical) bloque(scene, X1 - e - 0.5, q - 1, X1 + e + 0.5, q + 1, 3.3, marco, 0);
    else bloque(scene, q - 1, Y1 - e - 0.5, q + 1, Y1 + e + 0.5, 3.3, marco, 0);
  }
}
function mesa(scene, X1, Y1, X2, Y2, h, material, patas) {
  const r = R(X1, Y1, X2, Y2);
  scene.add(caja(r.w, 0.05, r.d, material, r.x, h, r.z));
  const pat = patas || mat('#2A2D2A', 0.4, { metalness: 0.4 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    scene.add(cilindro(0.03, h - 0.03, pat, r.x + dx * (r.w / 2 - 0.1), (h - 0.03) / 2, r.z + dz * (r.d / 2 - 0.1), 8));
  }
}
function silla(scene, X, Y, yaw, color = '#2F3238') {
  const [x, z] = P(X, Y);
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  const tela = mat(color, 0.9), oscuro = mat('#1E2024', 0.4, { metalness: 0.4 });
  g.add(caja(0.46, 0.07, 0.46, tela, 0, 0.46, 0));
  g.add(caja(0.44, 0.48, 0.06, tela, 0, 0.78, -0.21));
  g.add(cilindro(0.03, 0.42, oscuro, 0, 0.23, 0, 10));
  for (let k = 0; k < 5; k++) {
    const pata = caja(0.26, 0.03, 0.045, oscuro, 0.13, 0.04, 0);
    const pivote = new THREE.Group(); pivote.rotation.y = (k * Math.PI * 2) / 5; pivote.add(pata); g.add(pivote);
  }
  for (const dx of [-0.25, 0.25]) {
    g.add(caja(0.05, 0.04, 0.28, oscuro, dx, 0.68, 0.02));
    g.add(caja(0.04, 0.2, 0.04, oscuro, dx, 0.58, 0.02));
  }
}
// banco alto con asiento redondo, cuatro patas de metal y aro para los pies
function banquito(scene, X, Y, alto = 0.72) {
  const [x, z] = P(X, Y);
  const metal = mat('#8A8F96', 0.35, { metalness: 0.7 });
  scene.add(cilindro(0.17, 0.05, mat('#2F3238', 0.9), x, alto, z, 24));
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pata = cilindro(0.015, alto, metal, x + dx * 0.12, alto / 2, z + dz * 0.12, 6);
    pata.rotation.z = dx * -0.07; pata.rotation.x = dz * 0.07; scene.add(pata);
  }
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 20), metal);
  aro.rotation.x = Math.PI / 2; aro.position.set(x, alto * 0.38, z); aro.castShadow = true; scene.add(aro);
}
// computadora de escritorio: monitor con pantalla encendida, teclado y mouse. (X,Y) es el punto del monitor sobre el escritorio.
function computadora(scene, X, Y, yaw, alto) {
  const [x, z] = P(X, Y);
  const g = new THREE.Group(); g.position.set(x, alto, z); g.rotation.y = yaw; scene.add(g);
  const negro = mat('#1E2024', 0.35, { metalness: 0.3 });
  g.add(caja(0.18, 0.02, 0.14, negro, 0, 0.01, 0));
  g.add(caja(0.04, 0.2, 0.03, negro, 0, 0.11, 0));
  g.add(caja(0.56, 0.34, 0.03, negro, 0, 0.36, 0));
  const tex = texPantalla(Math.round(Math.abs(x) * 10));
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshStandardMaterial({ map: tex, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.7, roughness: 0.2 }));
  pantalla.position.set(0, 0.36, 0.017); g.add(pantalla);
  g.add(caja(0.4, 0.015, 0.14, negro, 0, 0.008, 0.32));
  g.add(caja(0.06, 0.02, 0.1, negro, 0.32, 0.01, 0.32));
}
// cajas de cartón abiertas en una cuadrícula (almacén)
function cajasCarton(scene, X1, Y1, X2, Y2, cols, filas) {
  const carton = mat('#B9915E', 0.9), interior = mat('#6E5232', 0.95);
  const r = R(X1, Y1, X2, Y2);
  const w = r.w / cols, d = r.d / filas;
  for (let i = 0; i < cols; i++) for (let j = 0; j < filas; j++) {
    const x = r.x - r.w / 2 + w * (i + 0.5), z = r.z - r.d / 2 + d * (j + 0.5);
    scene.add(caja(w * 0.94, 0.45, d * 0.9, carton, x, 0.225, z));
    scene.add(caja(w * 0.8, 0.02, d * 0.7, interior, x, 0.455, z, false));
  }
}
function planta(scene, X, Y, escala = 1) {
  const [x, z] = P(X, Y);
  const maceta = mat('#C98F65', 0.55, { clearcoat: 0.2 });
  scene.add(cilindro(0.3 * escala, 0.5 * escala, maceta, x, 0.25 * escala, z, 28));
  const hojas = mat('#4E7F4F', 0.45, { clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const claro = mat('#7FA97B', 0.4, { clearcoat: 0.4 });
  const puntos = [[0, 1.4, 0, 0.45], [-0.28, 1.1, 0.14, 0.33], [0.28, 1.15, -0.1, 0.35], [0.05, 1.7, 0.1, 0.3], [-0.2, 0.95, -0.22, 0.28], [0.22, 0.9, 0.26, 0.26]];
  puntos.forEach(([dx, dy, dz, r], i) => {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(r * escala, 1), i % 2 ? claro : hojas);
    h.position.set(x + dx * escala, dy * escala, z + dz * escala); h.castShadow = true; h.receiveShadow = true;
    scene.add(h);
  });
}

// ---------- personajes ----------
function persona(color) {
  const g = new THREE.Group();
  const piel = mat('#F2C9A0', 0.45, { clearcoat: 0.3 });
  const ropa = mat(color, 0.35, { clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const pelo = mat('#2B2F2A', 0.6);
  const oscuro = mat('#3A3F48', 0.5);
  const zapatos = mat('#2A2620', 0.35, { clearcoat: 0.8 });
  const cinturon = mat('#4A3A2A', 0.4);
  const sombra = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const torso = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.34, 8, 16), ropa)); torso.position.y = 0.95; g.add(torso);
  const cinto = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.07, 20), cinturon)); cinto.position.y = 0.66; g.add(cinto);
  const cabeza = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.24, 28, 20), piel)); cabeza.position.y = 1.5; g.add(cabeza);
  const cabello = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.25, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), pelo));
  cabello.position.y = 1.53; cabello.position.z = -0.02; g.add(cabello);
  const flequillo = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.12), pelo));
  flequillo.position.set(0, 1.66, 0.14); flequillo.rotation.x = -0.25; g.add(flequillo);
  for (const dx of [-0.23, 0.23]) {
    const oreja = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), piel));
    oreja.position.set(dx, 1.5, 0); g.add(oreja);
  }
  for (const dx of [-0.08, 0.08]) {
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('#1D1D1D', 0.3));
    ojo.position.set(dx, 1.52, 0.22); g.add(ojo);
    const brillo = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
    brillo.position.set(dx + 0.01, 1.53, 0.245); g.add(brillo);
    const ceja = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), pelo);
    ceja.position.set(dx, 1.58, 0.225); ceja.rotation.z = dx < 0 ? 0.15 : -0.15; g.add(ceja);
  }
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), piel);
  nariz.position.set(0, 1.47, 0.238); nariz.scale.set(1, 1.2, 0.8); g.add(nariz);
  const sonrisa = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), mat('#8A4A3A', 0.5));
  sonrisa.rotation.z = Math.PI; sonrisa.position.set(0, 1.4, 0.225); g.add(sonrisa);
  const brazo = (x) => {
    const piv = new THREE.Group(); piv.position.set(x, 1.2, 0);
    const b = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.3, 6, 10), ropa)); b.position.y = -0.2; piv.add(b);
    const mano = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), piel)); mano.position.y = -0.46; piv.add(mano);
    g.add(piv); return piv;
  };
  const pierna = (x) => {
    const piv = new THREE.Group(); piv.position.set(x, 0.62, 0);
    const p = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 6, 10), oscuro)); p.position.y = -0.2; piv.add(p);
    const zapato = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.28), zapatos)); zapato.position.set(0, -0.47, 0.06); piv.add(zapato);
    g.add(piv); return piv;
  };
  g.scale.setScalar(1.05);
  return { g, torso, brazoI: brazo(-0.36), brazoD: brazo(0.36), piernaI: pierna(-0.13), piernaD: pierna(0.13) };
}

// ---------- el espacio ----------
function construirEspacio(scene, techoVisible) {
  const blanco = () => mat('#F7F6F2', 0.3, { clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const madera = () => mat('#D9A47F', 0.5, { map: texMadera() });
  const maderaClara = () => mat('#E2C9A3', 0.55, { map: texMadera() });
  const oscuroM = () => mat('#2A2D2A', 0.4, { metalness: 0.4 });
  const rojo = () => mat('#C4102A', 0.45, { clearcoat: 0.4 });
  const acero = () => mat('#B8BEC4', 0.3, { metalness: 0.7, clearcoat: 0.5 });

  // piso: contorno del plano (hall + bloque izquierdo + oficinas)
  const forma = new THREE.Shape();
  [[558, 47], [911, 47], [911, 694], [400, 694], [400, 217], [558, 217]].forEach(([X, Y], i) => {
    const [x, z] = P(X, Y);
    if (i === 0) forma.moveTo(x, -z); else forma.lineTo(x, -z);
  });
  forma.closePath();
  const geoPiso = new THREE.ShapeGeometry(forma); geoPiso.rotateX(-Math.PI / 2);
  const piso = new THREE.Mesh(geoPiso, mat('#FFFFFF', 0.4, { map: texPiso(), clearcoat: 0.4, clearcoatRoughness: 0.2 }));
  piso.receiveShadow = true; scene.add(piso);
  // franja inferior de la sala (tono más claro) y plataforma blanca
  const franja = new THREE.Mesh(new THREE.PlaneGeometry(R(726, 650, 911, 694).w, R(726, 650, 911, 694).d), mat('#E4E6F2', 0.5));
  franja.rotation.x = -Math.PI / 2; franja.position.set(R(726, 650, 911, 694).x, 0.004, R(726, 650, 911, 694).z); franja.receiveShadow = true; scene.add(franja);

  // ---- muros exteriores ----
  muroVentana(scene, 554, 43, 915, 43, 31.5);       // norte, con ventanas
  muroVentana(scene, 915, 43, 915, 698, 25);        // este, con ventanas
  pared(scene, 396, 698, 915, 698);                  // sur
  pared(scene, 396, 213, 396, 698);                  // oeste del bloque izquierdo
  pared(scene, 396, 213, 554, 213);                  // norte del bloque izquierdo
  pared(scene, 554, 43, 554, 236);                   // oeste de las oficinas
  // ---- oficinas de arriba a la izquierda ----
  pared(scene, 554, 170, 648, 170);                  // separa la oficina grande de los cuartos chicos
  pared(scene, 554, 236, 648, 236);                  // muro sur de las oficinas (con puerta y mural)
  pared(scene, 596, 170, 596, 236);                  // tabique entre los dos cuartos chicos
  vidrioMuro(scene, 646, 63, 646, 166);              // tabique de vidrio a la derecha de la oficina
  // puerta de madera en el muro sur y mural
  const [dx0, dz0] = P(571.5, 240);
  const puerta = caja(0.8, 2.1, 0.06, madera(), dx0, 1.05, dz0 + 0.02); scene.add(puerta);
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), new THREE.MeshStandardMaterial({ map: texMural(), roughness: 0.5 }));
  const [mx, mz] = P(613.5, 240); mural.position.set(mx, 1.7, mz + 0.02); scene.add(mural);
  // ---- bloque izquierdo ----
  pared(scene, 396, 350, 516, 350);                  // A / B
  const panelRA = new THREE.MeshStandardMaterial({ map: texPanelRojoAzul(), roughness: 0.6 });
  bloque(scene, 396, 486, 516, 494, 3.4, mat('#EEF0EA', 0.95), 0); // B / C
  const [px, pz] = P(456, 485.5); const panelPared = new THREE.Mesh(new THREE.PlaneGeometry(R(396, 0, 516, 1).w, 3.3), panelRA);
  panelPared.position.set(px, 1.7, pz); scene.add(panelPared);        // cara norte pintada roja y azul
  pared(scene, 396, 575, 516, 575);                  // C / D
  vidrioMuro(scene, 516, 217, 516, 311);             // este de A (vidrio)
  pared(scene, 516, 311, 516, 382);                  // este (puertas de madera)
  vidrioMuro(scene, 516, 382, 516, 499);             // este de B (vidrio)
  pared(scene, 516, 499, 516, 698);                  // este de C y D (sólido)
  bloque(scene, 504, 316, 514, 347, 2.1, madera(), 0);   // puerta de madera
  bloque(scene, 504, 355, 514, 380, 2.1, madera(), 0);   // puerta de madera
  bloque(scene, 520, 500, 526, 534, 2.1, madera(), 0);   // paneles de madera en la cocina
  bloque(scene, 520, 579, 526, 626, 2.1, madera(), 0);
  // ---- cocina (abajo al centro) ----
  pared(scene, 675, 541, 675, 698);                  // muro este de la cocina

  // ---- escritorios de cómputo (arriba) ----
  [[676, 734], [735, 793], [794, 852], [853, 910]].forEach(([a, b]) => {
    mesa(scene, a, 60, b, 88, 0.75, blanco(), mat('#D8D8D4', 0.4, { metalness: 0.4 }));
    bloque(scene, b - 14, 62, b - 2, 86, 0.65, blanco(), 0.05);   // cajonera
    computadora(scene, (a + b) / 2 - 8, 66, 0, 0.775);
  });
  for (const [X, Y] of SILLAS_TRABAJO) silla(scene, X, Y, Math.PI);

  // ---- columnas marcadas en el plano ----
  bloque(scene, 679, 126, 721, 147, 3.4, blanco(), 0);              // columna 1
  ['#E53935', '#F57C00', '#F2C14E', '#43A047', '#1E88E5', '#5E35B1', '#8D6E63', '#212121'].forEach((c, i) => {
    const [x, z] = P(700, 147);
    const rollo = cilindro(0.065, 0.78, mat(c, 0.5), x, 0.9 + i * 0.13, z + 0.07);
    rollo.rotation.z = Math.PI / 2; scene.add(rollo);              // rollos de vinilo apilados
  });
  bloque(scene, 686, 154, 717, 172, 0.22, oscuroM(), 0.85);          // plotter de corte
  bloque(scene, 689, 156, 693, 170, 0.85, oscuroM(), 0);
  bloque(scene, 710, 156, 714, 170, 0.85, oscuroM(), 0);
  bloque(scene, 685, 386, 720, 409, 3.4, blanco(), 0);              // columna 2

  // ---- mesas largas del salón (4) con 4 sillas por lado ----
  [[166, 194], [241, 269], [313, 341], [388, 416]].forEach(([y1, y2]) => {
    mesa(scene, 750, y1, 827, y2, 0.75, madera(), mat('#8A8F96', 0.4, { metalness: 0.5 }));
    for (const X of [763, 779.5, 796, 813.5]) { banquito(scene, X, y1 - 7, 0.64); banquito(scene, X, y2 + 4, 0.64); }
  });

  // ---- lado este: gabinetes, horno, repisa, mostradores, gabinete rojo ----
  bloque(scene, 880, 104, 911, 160, 0.9, blanco(), 0);               // mostrador
  [[194, 229], [231, 265], [269, 300]].forEach(([a, b]) => {
    bloque(scene, 887, a, 909, b, 1.2, maderaClara(), 0);              // gabinetes de madera
    const rr = R(887, a, 909, b);
    scene.add(caja(rr.w * 0.9, 0.04, rr.d * 0.9, mat('#C9A77C', 0.6), rr.x, 0.6, rr.z));
  });
  bloque(scene, 876, 306, 908, 343, 1.0, blanco(), 0);               // horno (caja blanca)
  const [ox, oz] = P(876, 324.5); scene.add(caja(0.04, 0.55, 0.85, oscuroM(), ox - 0.005, 0.55, oz));
  bloque(scene, 870, 347, 911, 386, 2.0, maderaClara(), 0);          // librero alto
  bloque(scene, 880, 389, 911, 415, 0.9, blanco(), 0);               // mostrador
  bloque(scene, 887, 418, 911, 465, 0.9, blanco(), 0);               // mostrador / escritorio
  silla(scene, 880, 453, Math.PI / 2);
  computadora(scene, 906, 442, -Math.PI / 2, 0.9);
  bloque(scene, 878, 468, 907, 532, 2.0, rojo(), 0);                  // gabinete rojo
  bloque(scene, 893, 541, 911, 573, 0.9, blanco(), 0);               // escritorio
  silla(scene, 884, 556, Math.PI / 2);
  computadora(scene, 908, 557, -Math.PI / 2, 0.9);

  // ---- escritorios inferiores con sillas al norte ----
  [[715, 771], [774, 832], [834, 891]].forEach(([a, b]) => {
    mesa(scene, a, 618, b, 639, 0.75, blanco(), mat('#D8D8D4', 0.4, { metalness: 0.4 }));
    silla(scene, (a + b) / 2 - 6, 609, 0);
    computadora(scene, (a + b) / 2, 635, Math.PI, 0.775);
  });
  bloque(scene, 683, 628, 726, 697, 0.3, blanco(), 0);               // plataforma / rampa blanca
  bloque(scene, 681, 618, 691, 633, 0.5, blanco(), 0);               // cubo blanco
  silla(scene, 706, 585, -Math.PI / 2);

  // ---- cocina ----
  bloque(scene, 502, 532, 680, 562, 0.9, blanco(), 0);               // isla larga
  bloque(scene, 546, 551, 612, 557, 0.02, oscuroM(), 0.905);        // canal del fregadero
  bloque(scene, 561, 532, 617, 547, 0.45, madera(), 0.9);            // caja de madera
  bloque(scene, 641, 541, 671, 560, 0.05, madera(), 0.9);            // tabla de madera
  bloque(scene, 563, 620, 598, 651, 1.9, acero(), 0);                // tanque / gabinete de acero
  bloque(scene, 597, 617, 669, 655, 0.9, acero(), 0);                // mesa de acero
  bloque(scene, 622, 636, 650, 651, 0.02, oscuroM(), 0.905);        // fregadero
  bloque(scene, 501, 637, 527, 678, 0.35, blanco(), 0);              // banca baja

  // ---- oficina grande (arriba a la izquierda) ----
  bloque(scene, 564, 60, 586, 127, 0.75, madera(), 0);               // escritorio de madera
  computadora(scene, 567, 93, Math.PI / 2, 0.75);
  bloque(scene, 558, 50, 563, 130, 1.0, rojo(), 1.0);                // repisas rojas en el muro
  banquito(scene, 631, 72);                                           // banco negro
  // cuartos chicos
  bloque(scene, 595, 174, 618, 215, 0.75, madera(), 0);              // escritorio del cuarto derecho
  bloque(scene, 597, 176, 601, 200, 0.5, rojo(), 0.75);
  computadora(scene, 599, 208, Math.PI / 2, 0.75);

  // ---- bloque izquierdo ----
  bloque(scene, 400, 351, 420, 399, 1.9, blanco(), 0);               // gabinete blanco
  bloque(scene, 470, 386, 502, 407, 1.0, blanco(), 0);               // caja / gabinete blanco
  bloque(scene, 483, 339, 506, 357, 1.3, blanco(), 0);               // equipo junto a la puerta
  // trípode de luz (sala B)
  { const [tx, tz] = P(455, 441); const n = mat('#1E2024', 0.4, { metalness: 0.5 });
    scene.add(cilindro(0.015, 1.6, n, tx, 0.8, tz, 6));
    for (let k = 0; k < 3; k++) { const a = (k * Math.PI * 2) / 3; const pata = cilindro(0.012, 0.8, n, tx + Math.cos(a) * 0.3, 0.38, tz + Math.sin(a) * 0.3, 5); pata.rotation.z = Math.cos(a) * 0.4; pata.rotation.x = -Math.sin(a) * 0.4; scene.add(pata); }
    scene.add(caja(0.3, 0.2, 0.2, n, tx, 1.65, tz)); }
  cajasCarton(scene, 384, 547, 481, 583, 3, 3);                       // sala C
  cajasCarton(scene, 384, 624, 481, 666, 3, 3);                       // sala D
  bloque(scene, 385, 515, 410, 537, 0.9, madera(), 1.1);              // repisas de madera
  bloque(scene, 385, 612, 410, 626, 0.9, madera(), 1.1);

  // ---- plantas ----
  planta(scene, 893, 62, 1.0);
  planta(scene, 868, 672, 0.9);
}

// ---------- escena ----------
window.iniciar3D = function iniciar3D(agentes, onElegir, cont, opciones = {}) {
  const plano = !!opciones.plano;
  const W = plano ? 1280 : (cont.clientWidth || 800), H0 = plano ? 720 : (cont.clientHeight || 600);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: plano });
  renderer.setPixelRatio(plano ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!plano) { renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; }
  renderer.domElement.style.display = 'block';
  cont.innerHTML = '';
  cont.appendChild(renderer.domElement);
  const capaEtiquetas = document.createElement('div'); capaEtiquetas.className = 'etiquetas-3d'; cont.appendChild(capaEtiquetas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // reflejos
  scene.environmentIntensity = 0.55;

  // cámara: en modo "plano" imita la cámara de la imagen (vista cenital en perspectiva, 26 m de altura)
  const camara = new THREE.PerspectiveCamera(45, W / H0, 0.1, 300);
  let controles = null, trans = null;
  if (plano) {
    camara.position.set(0, 26, 0); camara.up.set(0, 0, -1); camara.lookAt(0, 0, 0);
    camara.setViewOffset(1280, 720, -10, 30, 1280, 720);
  } else {
    camara.position.set(...VISTAS.general.pos);
    controles = new OrbitControls(camara, renderer.domElement);
    controles.target.set(...VISTAS.general.tgt);
    controles.enableDamping = true; controles.enablePan = true;
    controles.minDistance = 3; controles.maxDistance = 70;
    controles.maxPolarAngle = Math.PI * 0.49;
    const barraVistas = document.createElement('div'); barraVistas.className = 'vistas-3d';
    barraVistas.innerHTML = '<button type="button" data-vista="general" class="activa">Vista general</button><button type="button" data-vista="interior">Vista interior</button>';
    cont.appendChild(barraVistas);
    const irA = nombre => {
      const v = VISTAS[nombre];
      trans = { t: 0, inicio: performance.now(), pos0: camara.position.clone(), tgt0: controles.target.clone(), pos1: new THREE.Vector3(...v.pos), tgt1: new THREE.Vector3(...v.tgt) };
      barraVistas.querySelectorAll('button').forEach(b => b.classList.toggle('activa', b.dataset.vista === nombre));
    };
    barraVistas.addEventListener('click', e => { const b = e.target.closest('[data-vista]'); if (b) irA(b.dataset.vista); });
    controles.addEventListener('start', () => { trans = null; });
  }

  // luces
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#D9D3C6', 1.35));
  const sol = new THREE.DirectionalLight('#FFF4E0', 1.9);
  sol.position.set(-4, 16, -10); sol.target.position.set(0, 0, 0); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
  sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.02;
  scene.add(sol); scene.add(sol.target);

  construirEspacio(scene, !plano);

  // personajes
  const lugaresSentado = SILLAS_TRABAJO.map(([X, Y]) => P(X, Y));
  const personas = (agentes || []).map((a, i) => {
    const p = persona(a.color || COLORES[i % COLORES.length]);
    p.agente = a; p.trabaja = !!(a.ultimo && a.ultimo.fecha === hoyTexto());
    const ini = P(640, 400); p.x = ini[0]; p.z = ini[1]; p.destino = null; p.espera = Math.random() * 2; p.yaw = Math.PI;
    p.g.userData.id = a.id;
    scene.add(p.g);
    p.etiqueta = document.createElement('div'); p.etiqueta.className = 'etiqueta-3d';
    p.etiqueta.innerHTML = `<strong>${a.nombre.split(' ').slice(0, 2).join(' ')}</strong><span class="est"></span>`;
    p.etiqueta.addEventListener('click', () => onElegir(a.id));
    capaEtiquetas.appendChild(p.etiqueta);
    return p;
  });
  let libre = 0;
  personas.forEach(p => {
    if (p.trabaja && libre < lugaresSentado.length) { [p.x, p.z] = lugaresSentado[libre++]; p.yaw = Math.PI; p.sentado = true; }
    else { p.trabaja = false; p.sentado = false; }
  });
  function nuevoDestino(p) {
    const c = CAMINAR[Math.floor(Math.random() * CAMINAR.length)];
    p.destino = [c[0] + (Math.random() - 0.5) * 0.6, c[1] + (Math.random() - 0.5) * 0.6];
  }

  // interacción: clic sobre un personaje
  const rayo = new THREE.Raycaster(), punto = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => {
    const r = renderer.domElement.getBoundingClientRect();
    punto.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    punto.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    rayo.setFromCamera(punto, camara);
    const hit = rayo.intersectObjects(personas.map(p => p.g), true)[0];
    if (!hit) return;
    let o = hit.object; while (o && !o.userData.id) o = o.parent;
    if (o) onElegir(o.userData.id);
  });

  const vec = new THREE.Vector3();
  let anterior = performance.now();
  function animar(t) {
    const dt = Math.min(0.05, (t - anterior) / 1000); anterior = t;
    const s = t / 1000;
    personas.forEach((p, idx) => {
      let andando = false;
      if (!p.sentado) {
        if (!p.destino) { p.espera -= dt; if (p.espera <= 0) nuevoDestino(p); }
        if (p.destino) {
          const dx = p.destino[0] - p.x, dz = p.destino[1] - p.z, d = Math.hypot(dx, dz);
          if (d > 0.06) {
            const k = Math.min(1.1 * dt, d) / d;
            p.x += dx * k; p.z += dz * k; andando = true;
            p.yaw = Math.atan2(dx, dz);
          } else { p.destino = null; p.espera = 2 + Math.random() * 4; }
        }
      }
      p.g.position.set(p.x, 0, p.z);
      p.g.rotation.y = p.yaw;
      if (p.sentado) {
        p.piernaI.rotation.x = -Math.PI / 2; p.piernaD.rotation.x = -Math.PI / 2;
        p.brazoI.rotation.x = -1.2 + Math.sin(s * 9 + idx) * 0.12;
        p.brazoD.rotation.x = -1.2 + Math.sin(s * 9 + idx + 1.5) * 0.12;
        p.torso.position.y = 0.95 + Math.sin(s * 2 + idx) * 0.01;
      } else {
        const a = andando ? Math.sin(s * 8) * 0.55 : 0;
        p.piernaI.rotation.x = a; p.piernaD.rotation.x = -a;
        p.brazoI.rotation.x = andando ? -a * 0.8 : Math.sin(s * 1.5 + idx) * 0.03;
        p.brazoD.rotation.x = andando ? a * 0.8 : -Math.sin(s * 1.5 + idx) * 0.03;
        p.torso.position.y = 0.95 + (andando ? Math.abs(Math.sin(s * 8)) * 0.03 : Math.sin(s * 1.5 + idx) * 0.01);
      }
      vec.set(p.x, 2.3, p.z).project(camara);
      const sx = (vec.x * 0.5 + 0.5) * W, sy = (-vec.y * 0.5 + 0.5) * H0;
      p.etiqueta.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;
      const est = p.etiqueta.querySelector('.est');
      est.textContent = p.sentado ? 'trabajando' : andando ? 'caminando' : 'descansando';
      est.className = 'est ' + (p.sentado ? 'on' : '');
    });
    if (controles) {
      if (trans) {
        trans.t = Math.min(1, (performance.now() - trans.inicio) / 1200);
        const k = trans.t * trans.t * (3 - 2 * trans.t);
        camara.position.lerpVectors(trans.pos0, trans.pos1, k);
        controles.target.lerpVectors(trans.tgt0, trans.tgt1, k);
        if (trans.t >= 1) trans = null;
      }
      controles.update();
    }
    renderer.render(scene, camara);
    requestAnimationFrame(animar);
  }
  requestAnimationFrame(animar);

  if (!plano) {
    new ResizeObserver(() => {
      const w = cont.clientWidth, h = cont.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camara.aspect = w / h; camara.updateProjectionMatrix();
    }).observe(cont);
  }
  return { scene, renderer, camara };
};

function hoyTexto() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
window.dispatchEvent(new Event('escena3d-lista'));
