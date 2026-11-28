// JobTrail blueprint engine: a technical drawing of the MacBook Pro 16" (2021) that moves.
// One canvas, drawn at ~30 fps: a 3D wireframe model (own projection, no libraries) rotating in space with live
// dimensions, reference solids, orbit rings, a drafting frame with grid references and a title block, and live
// telemetry from JobTrail (both Macs: CPU, temperature, fans, battery, disk, ping to the mini).
// Modes: desktop (assembled model, rotating) and lock (exploded model: lid, top case, keyboard, logic board,
// battery, fans, bottom case). ?still=1 freezes time for a picture. ?theme=blue for a blueprint-blue palette.
// Live data arrives through window.jtState(snapshot), called by the host app; without it the panels show "no link".
(() => {
  const Q = new URLSearchParams(location.search);
  const MODE = document.body.dataset.mode || 'desktop', STILL = !!Q.get('still'), BLUE = Q.get('theme') === 'blue';
  const W = 1728, H = 1117;   // layout space (points); scaled to the real screen
  const C = BLUE
    ? { bg: '#071526', grid: 'rgba(120,180,255,.07)', grid2: 'rgba(120,180,255,.14)', line: '#b9d6ff', mid: '#6f95c8', dim: '#47689a', faint: 'rgba(150,200,255,.35)', acc: '#ffc061', text: '#dbe9ff', soft: '#8fb0dd' }
    : { bg: '#000000', grid: 'rgba(255,255,255,.035)', grid2: 'rgba(255,255,255,.075)', line: '#d6d6d6', mid: '#8c8c8c', dim: '#565656', faint: 'rgba(255,255,255,.28)', acc: '#e9a23b', text: '#e6e6e6', soft: '#9b9b9b' };
  const MONO = '"Geist Mono", ui-monospace, Menlo, monospace', SANS = 'Geist, -apple-system, sans-serif';

  // ---- canvas ----
  const cv = document.createElement('canvas'); document.body.appendChild(cv);
  let g = cv.getContext('2d');
  let k = 1, ox = 0, oy = 0, dpr = 1;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    k = Math.min(innerWidth / W, innerHeight / H); ox = (innerWidth - W * k) / 2; oy = (innerHeight - H * k) / 2;
    staticLayer = null;
  }
  addEventListener('resize', size);

  // ---- 3D ----
  const V = (x, y, z) => [x, y, z];
  function rot([x, y, z], ay, ax, az = 0) {
    let c = Math.cos(ay), s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(ax); s = Math.sin(ax); [y, z] = [y * c - z * s, y * s + z * c];
    if (az) { c = Math.cos(az); s = Math.sin(az); [x, y] = [x * c - y * s, x * s + y * c]; }
    return [x, y, z];
  }
  // camera: model space in mm, y up. proj returns screen [x, y, depth]
  function camera(cx, cy, scale, dist) {
    return (p) => { const z = p[2] + dist, f = dist / z; return [cx + p[0] * scale * f, cy - p[1] * scale * f, z]; };
  }

  // ---- model of the MacBook Pro 16" (mm). Origin at the centre of the base footprint, y up, z toward the user ----
  const MW = 355.7, MD = 248.1, BH = 11.2, LT = 5.6, LD = 240.0;   // width, depth, base height, lid thickness, lid depth
  const segs = (pts, closed) => { const s = []; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) s.push([pts[i], pts[(i + 1) % pts.length]]); return s; };
  function rrect(cx, cz, w, d, r, y, n = 5) {   // rounded rectangle in the x/z plane at height y
    const out = [], q = [[cx + w / 2 - r, cz - d / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cz + d / 2 - r, 0], [cx - w / 2 + r, cz + d / 2 - r, Math.PI / 2], [cx - w / 2 + r, cz - d / 2 + r, Math.PI]];
    for (const [qx, qz, a0] of q) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; out.push(V(qx + r * Math.cos(a), y, qz + r * Math.sin(a))); }
    return out;
  }
  function rectXZ(cx, cz, w, d, y) { return [V(cx - w / 2, y, cz - d / 2), V(cx + w / 2, y, cz - d / 2), V(cx + w / 2, y, cz + d / 2), V(cx - w / 2, y, cz + d / 2)]; }
  function circleXZ(cx, cz, r, y, n = 18) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push(V(cx + r * Math.cos(a), y, cz + r * Math.sin(a))); } return o; }
  // parts: { name, lines: [[a,b]...], tone: 'line'|'mid'|'dim'|'acc', lift (exploded offset in mm) }
  function buildParts() {
    const P = [];
    const add = (name, lines, tone = 'line', lift = 0) => P.push({ name, lines, tone, lift });
    // bottom case + feet
    const bot = rrect(0, 0, MW, MD, 12, 0), top = rrect(0, 0, MW, MD, 12, BH);
    const walls = []; for (let i = 0; i < bot.length; i += 3) walls.push([bot[i], top[i]]);
    add('bottom case', [...segs(bot, true), ...walls], 'mid', -60);
    const feet = []; for (const [fx, fz] of [[-150, -100], [150, -100], [-150, 100], [150, 100]]) feet.push(...segs(circleXZ(fx, fz, 8, 0, 10), true));
    add('feet', feet, 'dim', -60);
    // battery: six cells
    const bat = []; for (let i = 0; i < 6; i++) { const cx = -125 + (i % 3) * 125, cz = i < 3 ? -20 : 62; bat.push(...segs(rectXZ(cx, cz, 105, 70, 2.5), true)); }
    add('battery 100 Wh · 6 cells', bat, 'mid', -20);
    // fans
    const fans = []; for (const fx of [-110, 110]) { fans.push(...segs(circleXZ(fx, -80, 30, 6, 22), true), ...segs(circleXZ(fx, -80, 9, 6, 10), true)); for (let b = 0; b < 9; b++) { const a = b / 9 * Math.PI * 2; fans.push([V(fx + 9 * Math.cos(a), 6, -80 + 9 * Math.sin(a)), V(fx + 28 * Math.cos(a + .5), 6, -80 + 28 * Math.sin(a + .5))]); } }
    add('fans ×2', fans, 'line', 20);
    // logic board + SoC + memory
    const lb = [...segs(rectXZ(0, -88, 170, 60, 7), true)];
    add('logic board', lb, 'mid', 20);
    add('M1 Pro SoC', [...segs(rectXZ(0, -88, 30, 30, 8), true), ...segs(rectXZ(0, -88, 20, 20, 8.5), true)], 'acc', 20);
    add('unified memory', [...segs(rectXZ(-26, -88, 14, 18, 8), true), ...segs(rectXZ(26, -88, 14, 18, 8), true)], 'line', 20);
    // top case: deck outline, keyboard well, keys, trackpad, speaker grilles
    const deck = [...segs(top, true)];
    add('top case', deck, 'line', 60);
    const keys = [], KW = 282, gap = 1.6, rows = [[14, 9.5], [14, 17.5], [14, 17.5], [13, 17.5], [12, 17.5], [8, 17.5]];
    let zz = -MD / 2 + 26;
    for (const [n, h] of rows) {
      const kw = (KW - (n - 1) * gap) / n; let xx = -KW / 2;
      for (let i = 0; i < n; i++) { const w = n === 8 && i === 3 ? kw * 2.6 : n === 8 ? (KW - (n - 1) * gap - kw * 2.6) / 7 : kw; keys.push(...segs(rectXZ(xx + w / 2, zz + h / 2, w, h, BH + .3), true)); xx += w + gap; }
      zz += h + gap;
    }
    add('keyboard', keys, 'dim', 90);
    add('touch id', segs(circleXZ(130, -MD / 2 + 31, 4, BH + .4, 12), true), 'acc', 90);
    add('force touch trackpad', segs(rrect(0, 72, 160, 100, 6, BH + .2), true), 'line', 60);
    const grille = []; for (const sx of [-158, 158]) for (let i = 0; i < 22; i++) { const z = -MD / 2 + 30 + i * 5.2; grille.push([V(sx - 9, BH, z), V(sx + 9, BH, z)]); }
    add('speaker grilles', grille, 'dim', 60);
    // more internals (mostly visible in the exploded lock view)
    const scr = []; for (const [sx2, sz2] of [[-170, -115], [-60, -118], [60, -118], [170, -115], [-172, 0], [172, 0], [-170, 115], [-60, 118], [60, 118], [170, 115]]) scr.push(...segs(circleXZ(sx2, sz2, 2.2, .5, 8), true), [V(sx2 - 1.5, .5, sz2), V(sx2 + 1.5, .5, sz2)]);
    add('pentalobe screws ×10', scr, 'dim', -60);
    const spk = []; for (const sx2 of [-155, 155]) { spk.push(...segs(rectXZ(sx2, -40, 26, 60, 4), true), ...segs(rectXZ(sx2, 40, 26, 60, 4), true), ...segs(circleXZ(sx2, -40, 9, 4.2, 12), true), ...segs(circleXZ(sx2, 40, 9, 4.2, 12), true), ...segs(rectXZ(sx2, 95, 18, 22, 4), true)); }
    add('speakers ×6', spk, 'line', 5);
    const pipe = []; const hp = [[-110, -80], [-60, -92], [0, -88], [60, -92], [110, -80]]; for (let i = 0; i < hp.length - 1; i++) for (const dz of [-3, 3]) pipe.push([V(hp[i][0], 9, hp[i][1] + dz), V(hp[i + 1][0], 9, hp[i + 1][1] + dz)]);
    add('heat pipe', pipe, 'acc', 34);
    add('SSD NAND ×4', [...segs(rectXZ(-62, -98, 16, 12, 7.6), true), ...segs(rectXZ(-62, -78, 16, 12, 7.6), true), ...segs(rectXZ(62, -98, 16, 12, 7.6), true), ...segs(rectXZ(62, -78, 16, 12, 7.6), true)], 'line', 20);
    add('TB4 retimers', [...segs(rectXZ(-150, -20, 9, 9, 7.6), true), ...segs(rectXZ(150, 10, 9, 9, 7.6), true)], 'line', 20);
    const tap = [...segs(rectXZ(0, 72, 70, 18, 6.5), true)]; for (let i = -30; i <= 30; i += 6) tap.push([V(i, 6.6, 64), V(i, 6.6, 80)]);
    add('taptic engine', tap, 'line', 40);
    add('keyboard backplate', segs(rrect(0, -MD / 2 + 26 + 52, 290, 112, 4, BH - .5), true), 'dim', 75);
    const hin = []; for (const hx of [-140, 140]) { const a0 = circleXZ(0, 0, 4, 0, 10).map((q) => V(hx - 30, BH + q[2], -MD / 2 + q[0])), a1 = a0.map((q) => V(hx + 30, q[1], q[2])); hin.push(...segs(a0, true), ...segs(a1, true)); for (let i = 0; i < a0.length; i += 2) hin.push([a0[i], a1[i]]); }
    add('hinges ×2', hin, 'mid', 100);
    add('antenna · mics', [[V(-100, BH - 1, -MD / 2 + 4), V(100, BH - 1, -MD / 2 + 4)], [V(-100, BH - 1, -MD / 2 + 7), V(100, BH - 1, -MD / 2 + 7)]], 'dim', 100);
    // ports on the side faces (x = ±MW/2)
    const port = (x, z, w, h, y = BH / 2) => segs([V(x, y - h / 2, z - w / 2), V(x, y + h / 2, z - w / 2), V(x, y + h / 2, z + w / 2), V(x, y - h / 2, z + w / 2)], true);
    add('MagSafe 3', port(-MW / 2, -60, 13, 3.6), 'acc', 0);
    add('ports L', [...port(-MW / 2, -25, 8.4, 2.6), ...port(-MW / 2, -5, 8.4, 2.6), ...port(-MW / 2, 90, 4, 4)], 'line', 0);
    add('ports R', [...port(MW / 2, -40, 15, 4.5), ...port(MW / 2, 10, 8.4, 2.6), ...port(MW / 2, 70, 24, 2.2)], 'line', 0);
    return P;
  }
  // lid: built flat, then hinged about the back edge (z = -MD/2, y = BH) by angle
  function buildLid() {
    const L = [];
    const outer = rrect(0, LD / 2, MW, LD, 12, 0), inner = rrect(0, LD / 2, MW, LD, 12, LT);
    const walls = []; for (let i = 0; i < outer.length; i += 3) walls.push([outer[i], inner[i]]);
    L.push({ name: 'display lid', lines: [...segs(outer, true), ...segs(inner, true), ...walls], tone: 'line', layer: 0 });
    L.push({ name: 'Liquid Retina XDR', lines: segs(rrect(0, LD / 2 + 3, MW - 14, LD - 18, 6, LT + .2), true), tone: 'mid', layer: 2 });
    L.push({ name: 'cover glass', lines: segs(rrect(0, LD / 2, MW - 4, LD - 4, 10, LT + .4), true), tone: 'line', layer: 3 });
    const leds = []; for (let i = 0; i < 26; i++) for (let j = 0; j < 15; j++) { const x = -MW / 2 + 16 + i * (MW - 32) / 25, z = 14 + j * (LD - 26) / 14; leds.push([V(x - 1.2, LT, z), V(x + 1.2, LT, z)], [V(x, LT, z - 1.2), V(x, LT, z + 1.2)]); }
    L.push({ name: 'mini-LED backlight', lines: [...segs(rrect(0, LD / 2 + 3, MW - 14, LD - 18, 6, LT), true), ...leds], tone: 'dim', layer: 1 });
    const nw = 34, nd = 6;
    L.push({ name: 'notch · camera', layer: 3, lines: segs([V(-nw / 2, LT + .3, LD - 7), V(nw / 2, LT + .3, LD - 7), V(nw / 2, LT + .3, LD - 7 - nd), V(-nw / 2, LT + .3, LD - 7 - nd)], true), tone: 'acc' });
    // mini-LED zones hint: a light grid on the panel
    const zones = []; for (let i = 1; i < 12; i++) { const x = -MW / 2 + 7 + i * (MW - 14) / 12; zones.push([V(x, LT + .25, 12), V(x, LT + .25, LD - 6)]); } for (let j = 1; j < 8; j++) { const z = 12 + j * (LD - 18) / 8; zones.push([V(-MW / 2 + 7, LT + .25, z), V(MW / 2 - 7, LT + .25, z)]); }
    L.push({ name: 'mini-LED zones', lines: zones, tone: 'faintline', layer: 2 });
    return L;
  }
  const PARTS = buildParts(), LID = buildLid();
  const PROBE = (() => {
    const pts = rrect(0, 0, MW, MD, 12, BH, 6).map((p) => ({ p }));
    pts.push({ p: pts[0].p });
    const lid = [V(MW / 2 - 6, LT, 2), V(MW / 2 - 6, LT, LD - 12), V(MW / 2 - 12, LT, LD - 2), V(-MW / 2 + 12, LT, LD - 2), V(-MW / 2 + 6, LT, LD - 12), V(-MW / 2 + 6, LT, 2)];
    const out = []; for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < 4; j++) { const a = pts[i].p, b = pts[i + 1].p; out.push({ p: [a[0] + (b[0] - a[0]) * j / 4, a[1], a[2] + (b[2] - a[2]) * j / 4] }); }
    for (let i = 0; i < lid.length - 1; i++) for (let j = 0; j < 10; j++) { const a = lid[i], b = lid[i + 1]; out.push({ lid: true, p: [a[0] + (b[0] - a[0]) * j / 10, a[1], a[2] + (b[2] - a[2]) * j / 10] }); }
    return out;
  })();
  // extra probe paths: loops sampled densely so the heads glide
  const loopPts = (pts, steps, extra = {}) => { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; for (let j = 0; j < steps; j++) o.push({ ...extra, p: [a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps, a[2] + (b[2] - a[2]) * j / steps] }); } return o; };
  const PROBES = [
    { pts: PROBE, period: 9000, phase: 0, tail: .16, w: 2.6 },
    { pts: PROBE, period: 9000, phase: .5, tail: .1, w: 1.8, col: '#ffffff', tag: 'P2' },
    { pts: loopPts(rrect(0, 72, 160, 100, 6, BH + .2, 4), 3), period: 5200, phase: .2, tail: .25, w: 1.6, loop: true, tag: 'P3 · TRACKPAD' },
    { pts: loopPts(rrect(0, LD / 2 + 3, MW - 14, LD - 18, 6, LT + .2, 4), 3, { lid: true }), period: 11000, phase: .1, tail: .14, w: 1.6, loop: true, tag: 'P4 · DISPLAY' },
    { pts: loopPts(rectXZ(0, -88, 30, 30, 8), 8), period: 2600, phase: 0, tail: .35, w: 1.6, loop: true, lift: 20, tag: 'P5 · SoC' },
    { pts: loopPts(rectXZ(0, -MD / 2 + 26 + 52, 282, 104, BH + .3), 10), period: 7000, phase: .6, tail: .12, w: 1.4, loop: true, lift: 90, col: '#ffffff', tag: 'P6 · KEYBOARD' },
  ];
  const PART_INFO = { 'pentalobe screws ×10': 'P5 PENTALOBE · M1.2', 'speakers ×6': 'FORCE-CANCELLING WOOFERS ×4 · TWEETERS ×2', 'heat pipe': 'COPPER · VAPOUR · SOC → FANS', 'SSD NAND ×4': 'UP TO 8 TB', 'TB4 retimers': '40 GB/S', 'taptic engine': 'FORCE TOUCH HAPTICS', 'keyboard backplate': 'STEEL · 0.6 MM', 'hinges ×2': 'CLUTCH · 0–135°', 'cover glass': 'OXIDE TFT STACK · 0.5 MM', 'mini-LED backlight': '10,000 LEDS · 2,500 ZONES', 'Liquid Retina XDR': 'LCD · 3456 × 2234',
 'bottom case': 'AL 6000 · UNIBODY', 'battery 100 Wh · 6 cells': 'LI-PO · 99.6 WH', 'fans ×2': '2 × CENTRIFUGAL · 5,000 RPM MAX', 'logic board': '10-LAYER PCB', 'M1 Pro SoC': '5 NM · 33.7 B TRANSISTORS', 'top case': 'AL · FORCE TOUCH · SPEAKERS ×6', 'keyboard': 'MAGIC KEYBOARD · 78 KEYS', 'force touch trackpad': '160 × 100 MM', 'MagSafe 3': '140 W USB-C PD', 'display lid': '16.2 IN · MINI-LED · 10,000 LEDS' };
  function lidPoint(p, open) {   // lid built flat (z from the hinge to the top edge, y = thickness); open = interior angle
    const dy = Math.sin(open), dz = Math.cos(open), ny = -Math.cos(open), nz = Math.sin(open);
    return V(p[0], BH + p[2] * dy + p[1] * ny, -MD / 2 + p[2] * dz + p[1] * nz);
  }

  // reference solids
  const PHI = (1 + Math.sqrt(5)) / 2;
  const ICO_V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
  const ICO_E = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const d = Math.hypot(ICO_V[i][0] - ICO_V[j][0], ICO_V[i][1] - ICO_V[j][1], ICO_V[i][2] - ICO_V[j][2]); if (Math.abs(d - 2) < .01) ICO_E.push([i, j]); }
  function torus(R, r, n = 20, m = 8) { const L = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2; for (let j = 0; j < m; j++) { const b = j / m * Math.PI * 2, b2 = (j + 1) / m * Math.PI * 2; const P = (A, B) => [(R + r * Math.cos(B)) * Math.cos(A), r * Math.sin(B), (R + r * Math.cos(B)) * Math.sin(A)]; L.push([P(a, b), P(a2, b)], [P(a, b), P(a, b2)]); } } return L; }
  const TORUS = torus(1, .38);
  const CUBE_V = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CUBE_V.push([x, y, z]);
  const CUBE_E = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const d = CUBE_V[i].reduce((s, v, q) => s + (v !== CUBE_V[j][q] ? 1 : 0), 0); if (d === 1) CUBE_E.push([i, j]); }

  // ---- live data ----
  const hist = { cpu: [], cpuM: [], ping: [] }; let S = null, linkAt = 0, pings = [], seq = 0;
  // base64 JSON from the host app (safe to pass through evaluateJavaScript whatever the job titles contain)
  window.jtState64 = (b) => { try { window.jtState(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))))); } catch {} };
  window.jtState = (s) => {
    S = s; linkAt = Date.now();
    const L = (s.machines || []).find((m) => m.id === 'local'), R = (s.machines || []).find((m) => m.id === 'remote');
    if (L?.vitals) { hist.cpu.push(L.vitals.cpu ?? 0); if (hist.cpu.length > 90) hist.cpu.shift(); }
    if (R?.vitals) { hist.cpuM.push(R.vitals.cpu ?? 0); if (hist.cpuM.length > 90) hist.cpuM.shift(); }
    if (R) { const ms = R.online ? (R.lastDur || 0) : null; hist.ping.push(ms ?? 0); if (hist.ping.length > 90) hist.ping.shift();
      pings.unshift(R.online ? `POLL mini  seq=${String(++seq).padStart(4, '0')}  rtt=${ms} ms  ok` : `POLL mini  seq=${String(++seq).padStart(4, '0')}  timeout`); pings = pings.slice(0, 9); }
  };

  // ---- drawing helpers (layout space) ----
  const tone = (t) => t === 'acc' ? C.acc : t === 'mid' ? C.mid : t === 'dim' ? C.dim : t === 'faintline' ? C.faint : C.line;
  function txt(s, x, y, { size = 9.5, col = C.soft, font = MONO, align = 'left', ls = 1.4, weight = 500 } = {}) {
    g.font = `${weight} ${size}px ${font}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = ls + 'px';
    g.fillText(s, x, y);
  }
  function line(a, b, col, w = 1, dash = null) { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  let DC = [0, 0];   // current model centre on screen: dimensions are pushed away from it
  function dimLine(a, b, label, off, col = C.mid) {   // screen-space dimension between projected points, offset perpendicular
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const mx0 = (a[0] + b[0]) / 2 - DC[0], my0 = (a[1] + b[1]) / 2 - DC[1], sgn = (-dy * mx0 + dx * my0) >= 0 ? 1 : -1;
    off = Math.abs(off) * sgn; const nx = -dy / L * off, ny = dx / L * off;
    const A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny];
    line(a, A, C.dim, .8, [2, 3]); line(b, B, C.dim, .8, [2, 3]); line(A, B, col, 1);
    for (const [P, sgn] of [[A, 1], [B, -1]]) { const ux = dx / L * sgn, uy = dy / L * sgn; line(P, [P[0] + ux * 9 - uy * 3, P[1] + uy * 9 + ux * 3], col, 1); line(P, [P[0] + ux * 9 + uy * 3, P[1] + uy * 9 - ux * 3], col, 1); }
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    g.font = `600 10px ${MONO}`; const tw = g.measureText(label).width + 12;
    g.fillStyle = C.bg; g.fillRect(mx - tw / 2, my - 8, tw, 14); txt(label, mx, my + 3.5, { col: C.text, align: 'center', size: 10, weight: 600 });
  }
  function spark(arr, x, y, w, h, max, col) {
    g.strokeStyle = C.dim; g.lineWidth = .8; g.setLineDash([]); g.strokeRect(x, y, w, h);
    if (arr.length < 2) return; g.beginPath(); arr.forEach((v, i) => { const px = x + i / 89 * w, py = y + h - Math.min(1, v / max) * h; i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
  }
  function bar(x, y, w, frac, col) { g.fillStyle = C.grid2; g.fillRect(x, y, w, 3); g.fillStyle = col; g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 3); }

  // ---- static layer: grid, drafting frame with references, title block skeleton ----
  let staticLayer = null;
  function buildStatic() {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const s = c.getContext('2d');
    const G0 = g; g = s; g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    g.fillStyle = C.bg; g.fillRect(-ox / k, -oy / k, innerWidth / k, innerHeight / k);
    if (MODE === 'desktop') { g = G0; return c; }
    for (let x = 0; x <= W; x += 12) line([x, 0], [x, H], x % 96 ? C.grid : C.grid2, .6);
    for (let y = 0; y <= H; y += 12) line([0, y], [W, y], y % 96 ? C.grid : C.grid2, .6);
    // frame: outer + inner border with column letters / row numbers (like a drawing sheet)
    const fx = 22, fy = MODE === 'desktop' ? 46 : 22, fw = W - 44, fh = H - fy - (MODE === 'desktop' ? 96 : 22);
    g.strokeStyle = C.mid; g.lineWidth = 1; g.setLineDash([]); g.strokeRect(fx, fy, fw, fh); g.strokeStyle = C.dim; g.strokeRect(fx + 10, fy + 10, fw - 20, fh - 20);
    const cols = 16, rows = 10;
    for (let i = 0; i <= cols; i++) { const x = fx + 10 + i * (fw - 20) / cols; line([x, fy], [x, fy + 10], C.dim, .8); line([x, fy + fh - 10], [x, fy + fh], C.dim, .8);
      if (i < cols) { const L = String.fromCharCode(65 + i); txt(L, x + (fw - 20) / cols / 2, fy + 8, { size: 7.5, align: 'center', col: C.dim }); txt(L, x + (fw - 20) / cols / 2, fy + fh - 2, { size: 7.5, align: 'center', col: C.dim }); } }
    for (let j = 0; j <= rows; j++) { const y = fy + 10 + j * (fh - 20) / rows; line([fx, y], [fx + 10, y], C.dim, .8); line([fx + fw - 10, y], [fx + fw, y], C.dim, .8);
      if (j < rows) { txt(String(j + 1), fx + 5, y + (fh - 20) / rows / 2 + 3, { size: 7.5, align: 'center', col: C.dim }); txt(String(j + 1), fx + fw - 5, y + (fh - 20) / rows / 2 + 3, { size: 7.5, align: 'center', col: C.dim }); } }
    // centre marks
    for (const [x, y, dx, dy] of [[W / 2, fy, 0, 1], [W / 2, fy + fh, 0, -1], [fx, fy + fh / 2, 1, 0], [fx + fw, fy + fh / 2, -1, 0]]) line([x, y], [x + dx * 22, y + dy * 22], C.mid, 1.2);
    g = G0;
    return c;
  }

  // ---- panels ----
  function titleBlock(x, y, t) {
    const w = 330, h = 104; g.setLineDash([]); g.strokeStyle = C.mid; g.lineWidth = 1; g.strokeRect(x, y, w, h);
    g.fillStyle = C.bg; g.fillRect(x + .5, y + .5, w - 1, h - 1); g.strokeRect(x, y, w, h);
    line([x, y + 34], [x + w, y + 34], C.dim); line([x, y + 69], [x + w, y + 69], C.dim); line([x + 165, y + 34], [x + 165, y + h], C.dim); line([x + 248, y + 69], [x + 248, y + h], C.dim);
    txt('MacBook Pro 16-inch · 2021', x + 10, y + 16, { font: SANS, size: 13, col: C.text, weight: 600, ls: 0 });
    txt(MODE === 'desktop' ? 'GENERAL ARRANGEMENT · ROTATING ISO' : 'EXPLODED ASSEMBLY · 21 PARTS', x + 10, y + 28, { size: 7.5, col: C.soft });
    txt('DRAWN', x + 10, y + 46, { size: 7, col: C.dim }); txt('JOBTRAIL', x + 10, y + 60, { size: 9.5, col: C.text, weight: 600 });
    txt('SCALE', x + 175, y + 46, { size: 7, col: C.dim }); txt(MODE === 'desktop' ? '1 : 2.6' : '1 : 3.1', x + 175, y + 60, { size: 9.5, col: C.text, weight: 600 });
    const d = new Date(t), p = (n) => String(n).padStart(2, '0');
    txt('DATE · TIME', x + 10, y + 81, { size: 7, col: C.dim }); txt(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` + (STILL ? '' : `  ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`), x + 10, y + 96, { size: 9.5, col: C.text, weight: 600 });
    txt('SHEET', x + 175, y + 81, { size: 7, col: C.dim }); txt(MODE === 'desktop' ? '1 / 2' : '2 / 2', x + 175, y + 96, { size: 9.5, col: C.text, weight: 600 });
    txt('REV', x + 258, y + 81, { size: 7, col: C.dim }); txt('C', x + 258, y + 96, { size: 9.5, col: C.acc, weight: 600 });
    // first-angle projection symbol
    const sx = x + 290, sy = y + 52; g.strokeStyle = C.mid; g.beginPath(); g.moveTo(sx - 22, sy - 7); g.lineTo(sx - 4, sy - 11); g.lineTo(sx - 4, sy + 11); g.lineTo(sx - 22, sy + 7); g.closePath(); g.stroke();
    g.beginPath(); g.arc(sx + 18, sy, 11, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(sx + 18, sy, 5, 0, Math.PI * 2); g.stroke();
  }
  // fixed specifications (used in the still picture, where live numbers would go stale)
  function specs(x, y) {
    txt('SPECIFICATIONS', x, y, { size: 8, col: C.text, weight: 600, ls: 2 });
    const rows = [['CHIP', 'Apple M1 Pro'], ['CPU', '10-core · 8P + 2E'], ['GPU', '16-core'], ['NEURAL ENGINE', '16-core'], ['PROCESS', '5 nm'], ['DISPLAY', '16.2" Liquid Retina XDR'], ['RESOLUTION', '3456 × 2234 · 254 ppi'], ['REFRESH', 'ProMotion · up to 120 Hz'], ['BRIGHTNESS', '1,000 sustained · 1,600 peak'], ['CONTRAST', '1,000,000 : 1'], ['CAMERA', '1080p FaceTime HD'], ['BATTERY', '100 Wh lithium-polymer'], ['CHARGING', 'MagSafe 3 · 140 W'], ['PORTS', 'TB4 ×3 · HDMI · SDXC · 3.5 mm'], ['SIZE', '355.7 × 248.1 × 16.8 mm'], ['WEIGHT', '2.1 kg']];
    rows.forEach(([a, b], i) => { txt(a, x, y + 22 + i * 15, { size: 7.5, col: C.dim }); txt(b, x + 250, y + 22 + i * 15, { size: 8.5, col: C.text, align: 'right' }); line([x, y + 26 + i * 15], [x + 250, y + 26 + i * 15], C.grid2, .6); });
  }
  function telemetry(x, y, t) {
    if (STILL) return specs(x, y);
    const live = S && Date.now() - linkAt < 15000, L = live && S.machines.find((m) => m.id === 'local'), R = live && S.machines.find((m) => m.id === 'remote');
    txt('LIVE TELEMETRY', x, y, { size: 8, col: C.text, weight: 600, ls: 2 });
    g.fillStyle = live ? C.acc : C.dim; g.globalAlpha = live ? .55 + .45 * Math.sin(t / 300) : 1; g.beginPath(); g.arc(x + 128, y - 3, 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    txt(live ? 'LINK OK · :4791' : 'NO LINK', x + 138, y, { size: 7.5, col: live ? C.soft : C.dim });
    let yy = y + 20;
    const block = (m, name, h) => {
      txt(name, x, yy, { size: 9.5, col: C.text, weight: 600 }); txt(m ? (m.online ? 'ONLINE' : 'OFFLINE') : '—', x + 250, yy, { size: 7.5, col: m && m.online ? C.acc : C.dim, align: 'right' });
      const v = m && m.vitals || {}; yy += 14;
      const row = (k2, val, frac) => { txt(k2, x, yy, { size: 7.5, col: C.dim }); txt(val, x + 250, yy, { size: 8.5, col: C.text, align: 'right' }); if (frac != null) bar(x + 96, yy - 5, 92, frac, C.mid); yy += 13; };
      row('CPU', v.cpu != null ? v.cpu + ' %' : '—', v.cpu / 100);
      row('DIE TEMP', v.cpuT != null ? v.cpuT + ' °C' : '—', v.cpuT / 105);
      if (v.fans?.length) row('FANS', v.fans.map((f) => f + '').join(' / ') + ' rpm', v.fans[0] / (v.fanMax?.[0] || 6000));
      if (v.batt) row('BATTERY', `${v.batt.pct} % · ${v.batt.charging ? 'charging' : v.batt.ac ? 'on AC' : 'battery'}`, v.batt.pct / 100);
      if (v.diskGB) row('DISK FREE', `${v.diskFreeGB} / ${v.diskGB} GB`, v.diskFreeGB / v.diskGB);
      if (v.upSec) row('UPTIME', `${Math.floor(v.upSec / 86400)}d ${Math.floor(v.upSec / 3600) % 24}h ${Math.floor(v.upSec / 60) % 60}m`, null);
      spark(h, x, yy - 4, 250, 26, 100, C.acc); yy += 38;
    };
    block(L, 'MacBook Pro · local', hist.cpu); block(R, 'Mac mini · remote', hist.cpuM);
    txt('LINK RTT · MINI · SSH POLL', x, yy, { size: 7.5, col: C.dim }); txt(hist.ping.length ? hist.ping[hist.ping.length - 1] + ' ms' : '—', x + 250, yy, { size: 8.5, col: C.text, align: 'right' }); yy += 6;
    spark(hist.ping, x, yy, 250, 26, Math.max(50, ...hist.ping), C.mid); yy += 40;
    pings.forEach((p, i) => { txt(p, x, yy + i * 12, { size: 7.5, col: i ? C.dim : C.soft }); });
    const jobs = live ? (S.live || []).filter((j) => j.kind === 'job' && j.state === 'running').length : 0;
    txt(`JOBS RUNNING  ${live ? jobs : '—'}`, x, yy + 9 * 12 + 10, { size: 8, col: jobs ? C.acc : C.soft, weight: 600 });
  }
  function refSolid(kind, x, y, r, t, label, sub) {
    const ay = t / 2600, ax = t / 4100; let V3, E;
    if (kind === 'ico') { V3 = ICO_V.map((p) => rot(p, ay, ax)); E = ICO_E.map(([a, b]) => [V3[a], V3[b]]); }
    else if (kind === 'cube') { V3 = CUBE_V.map((p) => rot(p, -ay * 1.3, ax)); E = CUBE_E.map(([a, b]) => [V3[a], V3[b]]); }
    else E = TORUS.map(([a, b]) => [rot(a, ay, .9 + Math.sin(t / 3000) * .3), rot(b, ay, .9 + Math.sin(t / 3000) * .3)]);
    const pr = camera(x, y, r, 6);
    for (const [a, b] of E) { const A = pr(a), B = pr(b), dep = (A[2] + B[2]) / 2; line(A, B, dep < 6 ? C.line : C.dim, dep < 6 ? 1 : .7); }
    g.strokeStyle = C.dim; g.setLineDash([2, 4]); g.beginPath(); g.arc(x, y, r * 2.05, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    txt(label, x, y + r * 2.05 + 16, { size: 7.5, col: C.text, align: 'center', weight: 600 }); txt(sub, x, y + r * 2.05 + 28, { size: 7, col: C.dim, align: 'center' });
  }

  // depth-faded strokes: nearer lines brighter, farther lines recede (like the Terrain ridges)
  function strokeFaded(segs2, tn) {
    if (tn === 'acc') { g.strokeStyle = C.acc; g.lineWidth = 1.4; g.globalAlpha = 1; g.beginPath(); for (const [A, B] of segs2) { g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); } g.stroke(); return; }
    const base = tn === 'dim' ? .32 : tn === 'mid' ? .55 : tn === 'faintline' ? .18 : .95, buckets = [[], [], [], []];
    for (const sg of segs2) { const z = (sg[0][2] + sg[1][2]) / 2, i = Math.max(0, Math.min(3, Math.floor((z - 760) / 70))); buckets[i].push(sg); }
    g.strokeStyle = '#e8e8e8'; g.lineWidth = .9; g.setLineDash([]);
    buckets.forEach((bk, i) => { if (!bk.length) return; g.globalAlpha = base * (1 - i * .2); g.beginPath(); for (const [A, B] of bk) { g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); } g.stroke(); });
    g.globalAlpha = 1;
  }
  // job history -> overlapping 24 h ridges (one every 6 h), as in the Terrain saver
  let HIST = null, HMAX = 1, HDAYS = 7, HJOBS = 0;
  window.jtHistory64 = (b) => { try { buildHist(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))))); } catch {} };
  function buildHist(jobs) {
    const now = Date.now(), js = jobs.filter((j) => (!j.kind || j.kind === 'job') && j.startedAt);
    const first = Math.min(...js.map((j) => j.startedAt), now - 6 * 864e5), days = Math.max(7, Math.min(30, Math.ceil((now - first) / 864e5)));
    const start = now - days * 864e5, NB = days * 144, series = new Float32Array(NB); let n = 0;
    for (const j of js) { const s0 = j.startedAt, e = Math.min(j.endedAt || now, now); if (e < start) continue; if (s0 >= start) n++; for (let tt = Math.max(s0, start); tt < e; tt += 6e5) series[Math.floor((tt - start) / 6e5)] += 1; }
    const sm = series.slice(); for (let i = 1; i < NB - 1; i++) series[i] = (sm[i - 1] + 2 * sm[i] + sm[i + 1]) / 4;
    const rows = []; for (let off = 0; off + 144 <= NB; off += 36) rows.push(series.subarray(off, off + 144));
    HIST = rows; HMAX = Math.max(4, ...series); HDAYS = days; HJOBS = n;
  }
  (function demoHist() { const a = [], now = Date.now(); for (let i = 0; i < 700; i++) { const s0 = now - Math.random() * 7 * 864e5; if (new Date(s0).getHours() < 7 && Math.random() < .8) continue; a.push({ startedAt: s0, endedAt: s0 + 6e5 + Math.random() * 7.2e6 }); } buildHist(a); HJOBS = 0; })();
  function drawFloor(t, place) {
    const R = HIST.length, X0 = -560, X1 = 560, Z0 = 560, Z1 = -210, Y = -42, HH = 110;   // far → near (−z faces the camera here)
    const hgt = (v) => Math.sqrt(Math.max(0, v) / HMAX) * HH;
    for (let r = 0; r < R; r++) {
      const z = Z0 + (Z1 - Z0) * r / (R - 1), row = HIST[r], front = r === R - 1, depth = r / (R - 1);
      const pts = []; for (let b = 0; b < 144; b += 2) pts.push(place(V(X0 + (X1 - X0) * b / 143, Y + hgt(row[b]) * (front && !STILL ? 1 + .05 * Math.sin(t / 420 + b / 7) : 1), z)));
      const b0 = place(V(X0, Y, z)), b1 = place(V(X1, Y, z));
      g.beginPath(); g.moveTo(b0[0], b0[1]); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(b1[0], b1[1]); g.closePath(); g.fillStyle = C.bg; g.globalAlpha = 1; g.fill();
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      if (front) { g.strokeStyle = C.acc; g.lineWidth = 1.6; g.globalAlpha = .9; g.save(); g.shadowColor = C.acc; g.shadowBlur = 12; g.stroke(); g.restore(); }
      else { g.strokeStyle = '#d6d6d6'; g.lineWidth = .8; g.globalAlpha = .08 + .32 * depth; g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  // ---- the model ----
  function drawModel(t, cx, cy, scale) {
    const spin = .72 + (STILL ? 0 : t / 9000);   // full turn ~ 56 s
    const ay = MODE === 'desktop' ? .72 + (STILL ? 0 : t / 6200) : .6 + Math.sin(t / 14000) * .55, ax = MODE === 'desktop' ? -.34 + Math.sin(t / 19000) * .05 : -.5;
    const open = MODE === 'desktop' ? (Math.PI * .62 + Math.sin(t / 19000) * .05) : Math.PI * .6;
    const explode = MODE === 'lock' ? (STILL ? .62 : .55 + .45 * Math.sin(t / 5000)) : 0;
    DC = [cx, cy];
    const pr = camera(cx, cy, scale, 900), place = (p, lift = 0) => pr(rot(V(p[0], p[1] + lift * explode * 1.9, p[2]), ay, ax));
    // desktop: the laptop floats over a terrain made of its own job history (same ridgelines as the Terrain saver)
    if (MODE === 'desktop') drawFloor(t, place);
    // orbit rings around the model (lock)
    if (MODE !== 'desktop') for (const [rr, tilt, sp, dash] of [[300, .32, 1, [3, 6]], [340, -.2, -.7, [1, 5]]]) {
      g.strokeStyle = C.dim; g.lineWidth = .8; g.setLineDash(dash); g.beginPath();
      for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, p = pr(rot(V(rr * Math.cos(a), 0, rr * Math.sin(a)), ay * .3, tilt)); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); g.setLineDash([]);
      for (let n = 0; n < 3; n++) { const a = (STILL ? n * 2.1 : t / 3000 * sp) + n * 2.1, p = pr(rot(V(rr * Math.cos(a), 0, rr * Math.sin(a)), ay * .3, tilt)); g.fillStyle = n ? C.mid : C.acc; g.beginPath(); g.arc(p[0], p[1], n ? 2 : 3, 0, Math.PI * 2); g.fill(); }
    }
    // parts
    const labels = [];
    for (const part of PARTS) {
      if (MODE === 'desktop') { strokeFaded(part.lines.map(([a, b]) => [place(a, part.lift), place(b, part.lift)]), part.tone); continue; }
      g.strokeStyle = tone(part.tone); g.lineWidth = part.tone === 'acc' ? 1.4 : 1; g.setLineDash([]); g.beginPath();
      let sx = 0, sy = 0, n = 0;
      for (const [a, b] of part.lines) { const A = place(a, part.lift), B = place(b, part.lift); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); sx += A[0]; sy += A[1]; n++; }
      g.stroke(); if (MODE === 'lock' && n) labels.push([part.name, sx / n, sy / n, part.tone]);
    }
    // lid
    const lidLift = 110;
    for (const part of LID) {
      g.strokeStyle = tone(part.tone); g.lineWidth = part.tone === 'acc' ? 1.4 : 1; g.beginPath();
      let sx = 0, sy = 0, n = 0;
      const ly = (part.layer || 0) * 26 * explode, lp = (q) => [q[0], q[1] + ly, q[2]];
      if (MODE === 'desktop') { strokeFaded(part.lines.map(([a, b]) => [place(lidPoint(lp(a), open), lidLift), place(lidPoint(lp(b), open), lidLift)]), part.tone); continue; }
      for (const [a, b] of part.lines) { const A = place(lidPoint(lp(a), open), lidLift), B = place(lidPoint(lp(b), open), lidLift); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); sx += A[0]; sy += A[1]; n++; }
      g.stroke(); if (MODE === 'lock' && /display lid|cover glass|mini-LED backlight|Liquid Retina/.test(part.name)) labels.push([part.name, sx / n, sy / n, 'line']);
    }
    // ground ripple: a ring pulsing out from under the model every 5 s
    if (!STILL && MODE !== 'desktop') for (const off of [0, 2500]) {
      const p = ((t + off) % 5000) / 5000, rr = 140 + p * 420; g.strokeStyle = C.acc; g.globalAlpha = (1 - p) * .55; g.lineWidth = 1.4; g.setLineDash([]); g.beginPath();
      for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, q = place(V(rr * Math.cos(a), 0, rr * Math.sin(a) * .8)); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
      g.stroke(); g.globalAlpha = 1;
    }
    // probes: bright points tracing parts of the model, each leaving a glowing trail; the first one carries live coordinates
    if (!STILL) PROBES.forEach((pb, idx) => {
      const path = pb.pts.map((q) => q.lid ? place(lidPoint(q.p, open), lidLift) : place(q.p, pb.lift || 0)), raw = pb.pts;
      const u = ((t / (pb.period * (MODE === 'desktop' ? 2.5 : 1)) + pb.phase) % 1 + 1) % 1, n = path.length, head = u * (n - 1), hi = Math.floor(head), f = head - hi;
      const at = (i) => path[pb.loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
      const H0 = at(hi), H1 = at(hi + 1), hx = H0[0] + (H1[0] - H0[0]) * f, hy = H0[1] + (H1[1] - H0[1]) * f;
      const tail = Math.max(4, Math.floor(n * pb.tail)), col = pb.col || C.acc;
      for (let i = 0; i < tail; i++) { const a2 = at(hi - i), b2 = at(hi - i - 1); g.strokeStyle = col; g.globalAlpha = (1 - i / tail) * .9; g.lineWidth = pb.w - (pb.w - .6) * i / tail; g.beginPath(); g.moveTo(i ? a2[0] : hx, i ? a2[1] : hy); g.lineTo(b2[0], b2[1]); g.stroke(); }
      g.globalAlpha = 1;
      const R = idx ? 14 : 26, glow = g.createRadialGradient(hx, hy, 0, hx, hy, R); glow.addColorStop(0, idx ? 'rgba(255,255,255,.35)' : 'rgba(233,162,59,.55)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(hx, hy, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(hx, hy, idx ? 1.8 : 2.6, 0, Math.PI * 2); g.fill();
      if (idx) { if (MODE !== 'desktop') txt(pb.tag, hx + 8, hy - 6, { size: 6.5, col: col, weight: 600 }); return; }
      line([hx - 14, hy], [hx - 5, hy], C.acc, 1); line([hx + 5, hy], [hx + 14, hy], C.acc, 1); line([hx, hy - 14], [hx, hy - 5], C.acc, 1); line([hx, hy + 5], [hx, hy + 14], C.acc, 1);
      const r0 = raw[Math.min(n - 1, hi)], r1 = raw[Math.min(n - 1, hi + 1)], L3 = (a3, b3) => a3 + (b3 - a3) * f;
      const P3 = r0.lid ? lidPoint([L3(r0.p[0], r1.p[0]), L3(r0.p[1], r1.p[1]), L3(r0.p[2], r1.p[2])], open) : [L3(r0.p[0], r1.p[0]), L3(r0.p[1], r1.p[1]), L3(r0.p[2], r1.p[2])];
      const tx = hx + 22, ty = hy - 30; line([hx + 8, hy - 8], [tx, ty + 6], C.acc, .8);
      g.fillStyle = C.bg; g.globalAlpha = .85; g.fillRect(tx, ty - 10, 150, 42); g.globalAlpha = 1; g.strokeStyle = C.acc; g.lineWidth = .8; g.strokeRect(tx, ty - 10, 150, 42);
      txt('PROBE 1 · ' + (r0.lid ? 'LID EDGE' : 'TOP CASE EDGE'), tx + 7, ty + 2, { size: 7, col: C.acc, weight: 600 });
      txt(`X ${P3[0].toFixed(1).padStart(6)}  Y ${P3[1].toFixed(1).padStart(5)}`, tx + 7, ty + 15, { size: 8, col: C.text });
      txt(`Z ${P3[2].toFixed(1).padStart(6)}  mm`, tx + 7, ty + 27, { size: 8, col: C.text });
    });
    // axis gizmo at the front-left corner
    const o = V(-MW / 2 - 30, 0, MD / 2 + 30), O = place(o);
    if (MODE !== 'desktop') for (const [d, lbl, col] of [[V(60, 0, 0), 'X', C.acc], [V(0, 60, 0), 'Y', C.line], [V(0, 0, 60), 'Z', C.mid]]) { const P = place([o[0] + d[0], o[1] + d[1], o[2] + d[2]]); line(O, P, col, 1.3); txt(lbl, P[0] + 4, P[1] + 3, { size: 8, col, weight: 600 }); }
    // dimensions attached to the model
    const c0 = place(V(-MW / 2, 0, MD / 2)), c1 = place(V(MW / 2, 0, MD / 2)), c2 = place(V(MW / 2, 0, -MD / 2)), c3 = place(V(MW / 2, BH, MD / 2));
    dimLine(c0, c1, '355.7 mm', c0[1] < cy ? -60 : 60);
    dimLine(c1, c2, '248.1 mm', 56);
    dimLine(c1, c3, MODE === 'lock' ? '15.5–16.8' : '16.8 mm', 34, C.acc);
    if (MODE === 'desktop' && false) {
      const h0 = place(lidPoint(V(MW / 2, 0, 0), open), lidLift), h1 = place(lidPoint(V(MW / 2, 0, LD), open), lidLift);
      dimLine(h0, h1, '240.0 mm', -46);
      txt(`HINGE ∠ ${(open * 180 / Math.PI).toFixed(1)}°`, h1[0] + 12, h1[1] - 6, { size: 8.5, col: C.acc, weight: 600 });
    }
    // part callouts (lock): leader to the right/left edge with a balloon number
    if (MODE === 'lock') {
      const L = labels.filter(([n]) => !/^ports|feet|speaker grilles|touch id|unified|mini-LED zones|antenna/.test(n));
      const sides = [L.slice().sort((p, q) => p[2] - q[2]), []];   // one callout column on the left; telemetry lives on the right
      let num = 1;
      sides.forEach((col, si) => {
        const left = si === 0, ex = left ? cx - 480 : cx + 480, y0 = 230, y1 = 960, step = Math.min(56, (y1 - y0) / Math.max(1, col.length));
        const start = (y0 + y1) / 2 - step * (col.length - 1) / 2;
        col.forEach(([n, x, y, tn], i) => {
          const sy = start + i * step, elbow = left ? ex + 60 : ex - 60;
          g.strokeStyle = C.dim; g.lineWidth = .8; g.setLineDash([1, 3]); g.beginPath(); g.moveTo(x, y); g.lineTo(elbow, sy); g.lineTo(ex, sy); g.stroke(); g.setLineDash([]);
          g.fillStyle = tn === 'acc' ? C.acc : C.mid; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
          const bx = ex + (left ? -11 : 11); g.strokeStyle = tn === 'acc' ? C.acc : C.mid; g.beginPath(); g.arc(bx, sy, 10, 0, Math.PI * 2); g.stroke();
          txt(String(num++).padStart(2, '0'), bx, sy + 3.5, { size: 8, col: C.text, align: 'center', weight: 600, ls: 0 });
          txt(n.toUpperCase(), ex + (left ? -28 : 28), sy - 1, { size: 8.5, col: tn === 'acc' ? C.acc : C.text, align: left ? 'right' : 'left', weight: 600 });
          txt(PART_INFO[n] || '', ex + (left ? -28 : 28), sy + 11, { size: 7, col: C.dim, align: left ? 'right' : 'left' });
        });
      });
    }
    return { ay, ax, open, explode };
  }

  // ---- frame ----
  const t0 = performance.now(); let last = 0, frames = 0, fps = 30, fpsAt = 0;
  function frame(now) {
    requestAnimationFrame(frame);   // keep frames coming even when frozen, so the canvas is always composited
    if (now - last < 32) return; last = now; frames++;
    if (now - fpsAt > 1000) { fps = frames; frames = 0; fpsAt = now; }
    const t = STILL ? 0 : now - t0, clock = Date.now();
    if (!staticLayer) staticLayer = buildStatic();
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(staticLayer, 0, 0);
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    if (MODE === 'desktop') drawDesktop(t, clock); else drawLock(t, clock);
  }
  function scanLine(t, y0, y1) {
    if (STILL) return; const p = (t % 11000) / 11000; if (p > .6) return; const y = y0 + (y1 - y0) * (p / .6);
    const gr = g.createLinearGradient(0, y - 120, 0, y); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, BLUE ? 'rgba(255,192,97,.10)' : 'rgba(233,162,59,.10)');
    g.fillStyle = gr; g.fillRect(32, y - 120, W - 64, 120); line([32, y], [W - 32, y], BLUE ? 'rgba(255,192,97,.45)' : 'rgba(233,162,59,.45)', 1);
  }
  function readout(x, y, st) {
    if (STILL) return;
    const rows = [['ROT Y', (((st.ay * 180 / Math.PI) % 360 + 360) % 360).toFixed(1) + '°'], ['ROT X', (st.ax * 180 / Math.PI).toFixed(1) + '°'], ['HINGE', (st.open * 180 / Math.PI).toFixed(1) + '°'], ['EXPLODE', (st.explode * 100).toFixed(0) + ' %'], ['FOV', '38.0°'], ['FRAME', fps + ' fps']];
    rows.forEach(([a, b], i) => { txt(a, x, y + i * 13, { size: 7.5, col: C.dim }); txt(b, x + 110, y + i * 13, { size: 8.5, col: C.text, align: 'right' }); });
  }
  // orthographic views (first-angle): plan, front elevation, right side elevation, with dimensions
  function orthoViews(x, y, t) {
    const sc = .62, w = MW * sc, d = MD * sc, h = 16.8 * sc * 2.2;   // thickness exaggerated ×2.2 for legibility
    const box = (bx, by, bw, bh, r = 4) => { g.strokeStyle = C.line; g.lineWidth = 1; g.setLineDash([]); g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, r) : g.rect(bx, by, bw, bh); g.stroke(); };
    const hdim = (x1, x2, yy, label) => { line([x1, yy], [x2, yy], C.mid); for (const xx of [x1, x2]) line([xx, yy - 4], [xx, yy + 4], C.mid); g.font = `600 9px ${MONO}`; const tw = g.measureText(label).width + 10; g.fillStyle = C.bg; g.fillRect((x1 + x2) / 2 - tw / 2, yy - 7, tw, 13); txt(label, (x1 + x2) / 2, yy + 3, { size: 9, col: C.text, align: 'center', weight: 600 }); };
    const vdim = (xx, y1, y2, label) => { line([xx, y1], [xx, y2], C.mid); for (const yy of [y1, y2]) line([xx - 4, yy], [xx + 4, yy], C.mid); txt(label, xx + 8, (y1 + y2) / 2 + 3, { size: 9, col: C.text, weight: 600 }); };
    // plan
    box(x, y, w, d, 7); const kx = x + (w - 282 * sc) / 2; g.strokeStyle = C.dim; g.strokeRect(kx, y + 20 * sc, 282 * sc, 110 * sc);
    for (let i = 1; i < 6; i++) line([kx, y + 20 * sc + i * 110 * sc / 6], [kx + 282 * sc, y + 20 * sc + i * 110 * sc / 6], C.dim, .6);
    g.strokeStyle = C.mid; g.strokeRect(x + (w - 160 * sc) / 2, y + d - 110 * sc, 160 * sc, 100 * sc);
    line([x + w / 2, y - 10], [x + w / 2, y + d + 10], C.dim, .7, [8, 3, 2, 3]); line([x - 10, y + d / 2], [x + w + 10, y + d / 2], C.dim, .7, [8, 3, 2, 3]);
    hdim(x, x + w, y - 18, '355.7'); vdim(x + w + 14, y, y + d, '248.1');
    txt('PLAN', x, y + d + 22, { size: 8, col: C.text, weight: 600 }); txt('VIEW A · TOP CASE', x, y + d + 34, { size: 7, col: C.dim });
    // front elevation
    const fx = x + w + 80, fy = y + 20; box(fx, fy, w, h, 3);
    line([fx + w / 2 - 22, fy], [fx + w / 2 - 22, fy + 5], C.mid); line([fx + w / 2 + 22, fy], [fx + w / 2 + 22, fy + 5], C.mid);
    hdim(fx, fx + w, fy + h + 18, '355.7'); vdim(fx + w + 14, fy, fy + h, '16.8');
    txt('FRONT ELEVATION', fx, fy + h + 44, { size: 8, col: C.text, weight: 600 }); txt('VIEW B · THICKNESS ×2.2', fx, fy + h + 56, { size: 7, col: C.dim });
    // side elevation with ports
    const sx = fx, sy = fy + h + 90; box(sx, sy, d, h, 3);
    const ports = [[.18, 8, 'acc'], [.32, 5, 'line'], [.4, 5, 'line'], [.86, 3, 'line']];
    for (const [f, pw, tn] of ports) { g.strokeStyle = tone(tn); g.strokeRect(sx + d * f - pw / 2, sy + h / 2 - 1.5, pw, 3); }
    hdim(sx, sx + d, sy + h + 18, '248.1'); txt('LEFT ELEVATION', sx + d + 30, sy + 8, { size: 8, col: C.text, weight: 600 }); txt('MAGSAFE 3 · TB4 ×2 · 3.5 MM', sx + d + 30, sy + 20, { size: 7, col: C.dim });
    // section hatch on the plan corner (A–A)
    g.save(); g.beginPath(); g.rect(x + w - 60, y + d - 40, 52, 32); g.clip(); for (let i = -40; i < 100; i += 6) line([x + w - 60 + i, y + d - 8], [x + w - 60 + i + 32, y + d - 40], C.dim, .6); g.restore();
    g.strokeStyle = C.mid; g.strokeRect(x + w - 60, y + d - 40, 52, 32); txt('A–A', x + w - 34, y + d - 46, { size: 7, col: C.acc, align: 'center', weight: 600 });
  }
  function drawDesktop(t, clock) {
    const st = drawModel(t * 1.3, 900, 500, 1.18);   // desktop runs 30% faster than the Terrain saver's pace
    // header, Terrain-style: name, what it is, one live line
    txt('MacBook Pro 16″', 72, 104, { font: SANS, size: 24, col: C.text, weight: 600, ls: 0 });
    txt('M1 PRO · 2021 · LIVE BLUEPRINT', 72, 124, { size: 8.5, col: C.soft });
    const live = S && Date.now() - linkAt < 15000, L = live && S.machines.find((m) => m.id === 'local'), R = live && S.machines.find((m) => m.id === 'remote');
    const jobs = live ? (S.live || []).filter((j) => j.kind === 'job' && j.state === 'running').length : null;
    const v = L && L.vitals || {};
    txt(live ? `CPU ${v.cpu ?? '—'}% · ${v.cpuT ?? '—'}°C · BATTERY ${v.batt ? v.batt.pct + '%' : '—'} · ${jobs} JOB${jobs === 1 ? '' : 'S'} RUNNING${R ? ' · MINI ' + (R.online ? 'ONLINE' : 'OFFLINE') : ''}` : 'WAITING FOR JOBTRAIL', 72, 141, { size: 8, col: live ? C.mid : C.dim });
    if (live) { g.fillStyle = C.acc; g.globalAlpha = .5 + .5 * Math.sin(t / 500); g.beginPath(); g.arc(62, 138, 2.6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    // right: model readout
    const deg = (r) => (((r * 180 / Math.PI) % 360 + 360) % 360).toFixed(1) + '°';
    txt(`ROT ${deg(st.ay)} · TILT ${(st.ax * 180 / Math.PI).toFixed(1)}° · HINGE ${(st.open * 180 / Math.PI).toFixed(1)}°`, W - 72, 124, { size: 8, col: C.mid, align: 'right' });
    txt('355.7 × 248.1 × 16.8 MM · 2.1 KG', W - 72, 141, { size: 8, col: C.dim, align: 'right' });
    // legend above the Dock
    txt(`FLOOR · ${HDAYS} DAYS OF JOBS${HJOBS ? ' · ' + HJOBS.toLocaleString() + ' RUNS' : ' · SAMPLE'} · FRONT RIDGE = LAST 24 H`, 72, H - 112, { size: 7.5, col: C.dim });
  }
  function drawLock(t, clock) {
    // the lock screen's clock sits top-centre and the login at the bottom-centre: keep both clear
    const st = drawModel(t, 900, 600, 1.0);
    telemetry(1420, 300, clock);
    readout(70, 940, st);
    refSolid('ico', 1260, 190, 22, t, 'REF · ICOSAHEDRON', '20 F · 30 E · 12 V');
    refSolid('torus', 470, 190, 28, t, 'REF · TORUS', 'R 1.00 · r 0.38');
    titleBlock(W - 34 - 330, H - 34 - 104 - 40, clock);
  }

  size();
  document.fonts?.ready.then(() => { staticLayer = null; });
  requestAnimationFrame(frame);
  if (STILL) setTimeout(() => { staticLayer = null; }, 1200);   // rebuild the frame once the fonts have landed
})();
