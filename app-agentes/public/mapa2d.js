// Mapa 2D de la oficina de Hacedores (vista desde arriba), dibujado a partir del plano.
// Las coordenadas son las del plano original (1280x720 px; 1 m ≈ 33 px). Los agentes caminan por los nodos y se sientan en las sillas.
(function () {
  const VB = { x: 380, y: 28, w: 552, h: 684 };

  // lugares por donde caminan (nodo: [x, y]) y quién se conecta con quién, sin cruzar muebles ni paredes
  const NODOS = {
    Q: [660, 112], R1: [700, 112], R2: [760, 112], R3: [819, 112], R4: [850, 112],
    W1: [850, 200], W2: [850, 290], W3: [850, 360], W4: [850, 430],
    P: [660, 200], A2: [655, 255], A: [600, 270], B: [610, 390], C: [690, 470], D: [800, 455],
    E: [850, 520], G: [715, 545], F: [800, 575],
    T1: [700, 97], T2: [760, 97], T3: [819, 97], T4: [880, 97],
    S1: [737, 603], S2: [798, 603], S3: [857, 603],
  };
  const SILLAS = ['T1', 'T2', 'T3', 'T4', 'S1', 'S2', 'S3'];
  const ARISTAS = [
    ['Q', 'R1'], ['R1', 'R2'], ['R2', 'R3'], ['R3', 'R4'], ['R4', 'W1'], ['W1', 'W2'], ['W2', 'W3'], ['W3', 'W4'], ['W4', 'D'], ['W4', 'E'],
    ['Q', 'P'], ['P', 'A2'], ['A2', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'D'], ['C', 'G'], ['G', 'F'], ['E', 'F'], ['D', 'E'],
    ['T1', 'R1'], ['T2', 'R2'], ['T3', 'R3'], ['T4', 'R4'], ['S1', 'F'], ['S2', 'F'], ['S3', 'F'],
  ];
  const ENTRADAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'W2', 'W3', 'P'];   // dónde aparecen al entrar

  const r = (x1, y1, x2, y2, fill, extra = '') => `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="${fill}" ${extra}/>`;
  const ln = (x1, y1, x2, y2, stroke, w, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="square" ${extra}/>`;
  const circ = (x, y, rad, fill) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
  const txt = (x, y, t) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="13" fill="#9A968C" letter-spacing=".06em">${t}</text>`;
  const BORDE = 'stroke="#D6D1C7" stroke-width="1"';
  const BLANCO = '#FFFFFF', MADERA = '#D9B88F', MADERA_C = '#EBD7B5', ROJO = '#C4553D', ACERO = '#BCC2C8', GRIS = '#D9D5CC';

  function dibujar() {
    let s = '';
    // piso
    s += '<polygon points="558,47 911,47 911,694 400,694 400,217 558,217" fill="#F3F0EA"/>';
    s += r(726, 650, 911, 694, '#E8E9F2');
    // muebles
    [[676, 734], [735, 793], [794, 852], [853, 910]].forEach(([a, b]) => { s += r(a, 60, b, 88, BLANCO, BORDE) + r(a + 3, 64, a + 22, 76, '#2F5A6E'); });
    [[700, 97], [760, 97], [819, 97], [880, 97]].forEach(([x, y]) => { s += circ(x, y, 7, '#8A8F96'); });
    s += r(679, 126, 721, 147, GRIS) + r(685, 386, 720, 409, GRIS);
    [[166, 194], [241, 269], [313, 341], [388, 416]].forEach(([y1, y2]) => {
      s += r(750, y1, 827, y2, MADERA, BORDE);
      [763, 779.5, 796, 813.5].forEach(x => { s += circ(x, y1 - 7, 4.5, '#6B6860') + circ(x, y2 + 6, 4.5, '#6B6860'); });
    });
    s += r(880, 104, 911, 160, BLANCO, BORDE);
    [[194, 229], [231, 265], [269, 300]].forEach(([a, b]) => { s += r(887, a, 909, b, MADERA_C, BORDE); });
    s += r(876, 306, 908, 343, BLANCO, BORDE) + r(870, 347, 911, 386, MADERA_C, BORDE) + r(880, 389, 911, 415, BLANCO, BORDE) + r(887, 418, 911, 465, BLANCO, BORDE);
    s += r(878, 468, 907, 532, ROJO) + r(893, 541, 911, 573, BLANCO, BORDE) + circ(880, 453, 6, '#8A8F96') + circ(884, 556, 6, '#8A8F96');
    [[715, 771], [774, 832], [834, 891]].forEach(([a, b]) => { s += r(a, 618, b, 639, BLANCO, BORDE) + circ((a + b) / 2 - 6, 609, 7, '#8A8F96'); });
    s += r(683, 628, 726, 697, BLANCO, BORDE) + r(681, 618, 691, 633, GRIS) + circ(706, 585, 6, '#8A8F96');
    // cocina
    s += r(502, 532, 680, 562, BLANCO, BORDE) + r(561, 532, 617, 547, MADERA) + r(563, 620, 598, 651, ACERO) + r(597, 617, 669, 655, ACERO, BORDE) + r(501, 637, 527, 678, BLANCO, BORDE);
    // oficina grande y cuartos
    s += r(564, 60, 586, 127, MADERA, BORDE) + r(558, 50, 563, 130, ROJO) + circ(631, 72, 7, '#2B2B2A') + r(595, 174, 618, 215, MADERA, BORDE) + r(597, 176, 601, 200, ROJO);
    // salas de la izquierda
    s += r(400, 351, 420, 399, BLANCO, BORDE) + r(470, 386, 502, 407, BLANCO, BORDE) + r(483, 339, 506, 357, BLANCO, BORDE) + r(385, 515, 410, 537, MADERA) + r(385, 612, 410, 626, MADERA);
    // plantas
    s += circ(893, 62, 10, '#7FAE78') + circ(868, 672, 9, '#7FAE78');
    // paredes
    const P = '#3F3E3B';
    [[554, 43, 915, 43], [915, 43, 915, 698], [396, 698, 915, 698], [396, 213, 396, 698], [396, 213, 554, 213], [554, 43, 554, 236], [554, 170, 648, 170], [554, 236, 648, 236], [596, 170, 596, 236],
      [396, 350, 516, 350], [396, 575, 516, 575], [516, 499, 516, 698], [675, 541, 675, 698]].forEach(([a, b, c, d]) => { s += ln(a, b, c, d, P, 5); });
    s += ln(396, 490, 516, 490, '#C4553D', 8);
    s += ln(516, 311, 516, 382, '#B58B5A', 5);                                        // puertas de madera
    [[646, 63, 646, 166], [516, 217, 516, 311], [516, 382, 516, 499]].forEach(([a, b, c, d]) => { s += ln(a, b, c, d, '#8EC5D8', 3.5); });   // vidrio
    s += ln(560, 43, 910, 43, '#BFE3EE', 3, 'stroke-dasharray="36 8"') + ln(915, 50, 915, 692, '#BFE3EE', 3, 'stroke-dasharray="36 8"');       // ventanas
    // nombres de los espacios
    s += txt(458, 288, 'SALA A') + txt(458, 424, 'SALA B') + txt(458, 535, 'SALA C') + txt(458, 640, 'SALA D') + txt(612, 154, 'OFICINA') + txt(590, 592, 'COCINA') + txt(788, 150, 'SALÓN');
    return s;
  }

  // Monta el mapa dentro de `cont` y devuelve lo que necesitan las mascotas para moverse por él
  function montar(cont) {
    cont.innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-label="Mapa de la oficina de Hacedores, vista desde arriba" preserveAspectRatio="xMidYMid meet">${dibujar()}</svg>`;
    return { el: cont.querySelector('svg'), vb: VB, nodos: NODOS, aristas: ARISTAS, sillas: SILLAS, entradas: ENTRADAS };
  }

  window.Mapa2D = { montar };
})();
