import * as THREE from 'three';
import { merge, colorize } from './util.js';

// ============================================================================================
// Procedural car generator: real-world body types built from superellipse cross-section lofts
// (smooth panels, proper wheel arches, glasshouse, roof, pillars, lights, grille, bumpers,
// mirrors, door seams, plates, alloy wheels). Every variant randomises proportions and detail.
// Geometry is merged per material, so each car is ~8 draw calls.
// ============================================================================================

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + (b - a) * rnd();
const pickW = (arr) => { let t = arr.reduce((s, a) => s + a[1], 0) * rnd(); for (const a of arr) { if ((t -= a[1]) <= 0) return a[0]; } return arr[0][0]; };

// ---------- loft along z with superellipse sections: stations [z, yBottom, yTop, halfWidth]
function sloft(st, n = 4, seg = 28, capEnds = true, tumble = 0.1) {
  const pos = [], idx = [];
  const e = 2 / n;
  for (let i = 0; i < st.length; i++) {
    const [z, yb, yt, w] = st[i], ym = (yb + yt) / 2, h = (yt - yb) / 2;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const tw = s > 0 ? 1 - tumble * Math.pow(s, 1.5) : 1 - 0.06 * Math.pow(-s, 2); // sides lean in toward the roof, tuck under at the sill
      pos.push(Math.sign(c) * Math.pow(Math.abs(c), e) * w * tw, ym + Math.sign(s) * Math.pow(Math.abs(s), e) * h, z);
    }
  }
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  if (capEnds) for (const [i, flip] of [[0, true], [st.length - 1, false]]) {
    const [z, yb, yt] = st[i], ci = pos.length / 3; pos.push(0, (yb + yt) / 2, z);
    for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k; flip ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// smooth resample of stations (catmull-rom) so silhouettes are curved, not faceted
function smooth(st, sub = 3) {
  const out = [];
  const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < sub; k++) {
    const t = k / sub, a = st[Math.max(0, i - 1)], b = st[i], c = st[i + 1], d = st[Math.min(st.length - 1, i + 2)];
    out.push(b.map((_, j) => cr(a[j], b[j], c[j], d[j], t)));
  }
  out.push(st[st.length - 1]); return out;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// ---------- wheels
function wheelGeo(r, w, style) {
  const tire = [], rim = [], disc = [];
  const prof = [[r * 0.62, -w / 2], [r * 0.92, -w / 2 - 0.004], [r, -w * 0.32], [r, w * 0.32], [r * 0.92, w / 2 + 0.004], [r * 0.62, w / 2]];
  tire.push(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 28).rotateZ(-Math.PI / 2));
  const rr0 = r * 0.64;
  rim.push(new THREE.CylinderGeometry(rr0, rr0, w * 0.6, 24, 1, true).rotateZ(Math.PI / 2));
  rim.push(new THREE.CylinderGeometry(r * 0.12, r * 0.12, w * 0.66, 12).rotateZ(Math.PI / 2)); // hub
  const spokes = style === 0 ? 5 : style === 1 ? 10 : style === 2 ? 6 : 16;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2, sw = style === 3 ? 0.012 : style === 1 ? 0.022 : 0.045;
    rim.push(new THREE.BoxGeometry(0.02, rr0 * 0.95, sw).translate(w * 0.3, rr0 * 0.5, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(a)));
  }
  disc.push(new THREE.CylinderGeometry(rr0 * 0.95, rr0 * 0.95, 0.01, 20).rotateZ(Math.PI / 2).translate(w * 0.18, 0, 0));
  return { tire: merge(tire), rim: merge(rim), disc: merge(disc) };
}

// ---------- body type definitions (lengths in metres; z stations normalised -1 rear .. +1 front)
// lower: [z, yBottom, yTop, halfWidthFraction]; cabin: same, yTop = roofline; roof: z range of painted roof
const TYPES = {
  sedan: { L: [4.6, 5.0], W: [1.8, 1.9], wb: 0.58, r: [0.32, 0.35], lower: [[-1, 0.42, 0.78, 0.86], [-0.96, 0.3, 0.97, 0.95], [-0.78, 0.24, 1.0, 0.98], [-0.5, 0.21, 0.97, 1], [0.1, 0.21, 0.94, 1], [0.48, 0.22, 0.92, 1], [0.78, 0.25, 0.84, 0.98], [0.95, 0.3, 0.74, 0.93], [1, 0.42, 0.64, 0.82]],
    cabin: [[-0.64, 0.92, 0.95, 0.86], [-0.46, 0.92, 1.36, 0.82], [-0.12, 0.92, 1.44, 0.81], [0.14, 0.92, 1.42, 0.82], [0.44, 0.9, 0.95, 0.88]], roof: [-0.42, 0.12], bootLip: true },
  hatch: { L: [3.9, 4.35], W: [1.72, 1.82], wb: 0.62, r: [0.3, 0.33], lower: [[-1, 0.38, 0.92, 0.9], [-0.95, 0.28, 0.98, 0.97], [-0.6, 0.21, 0.97, 1], [0.1, 0.21, 0.93, 1], [0.5, 0.22, 0.9, 1], [0.8, 0.26, 0.82, 0.97], [0.96, 0.32, 0.72, 0.9], [1, 0.42, 0.62, 0.8]],
    cabin: [[-0.98, 0.92, 1.28, 0.84], [-0.86, 0.92, 1.44, 0.82], [-0.2, 0.92, 1.48, 0.81], [0.18, 0.92, 1.45, 0.82], [0.48, 0.9, 0.95, 0.88]], roof: [-0.84, 0.15] },
  wagon: { L: [4.7, 5.0], W: [1.82, 1.9], wb: 0.58, r: [0.32, 0.35], lower: [[-1, 0.4, 0.95, 0.9], [-0.96, 0.3, 0.98, 0.97], [-0.6, 0.22, 0.97, 1], [0.1, 0.22, 0.94, 1], [0.5, 0.23, 0.91, 1], [0.8, 0.26, 0.83, 0.97], [0.96, 0.32, 0.73, 0.92], [1, 0.42, 0.63, 0.82]],
    cabin: [[-0.98, 0.93, 1.36, 0.84], [-0.9, 0.93, 1.47, 0.82], [-0.1, 0.93, 1.48, 0.81], [0.16, 0.93, 1.45, 0.82], [0.46, 0.9, 0.95, 0.88]], roof: [-0.92, 0.14], rails: true },
  suv: { L: [4.7, 5.1], W: [1.92, 2.02], wb: 0.58, r: [0.38, 0.41], lower: [[-1, 0.5, 1.02, 0.9], [-0.96, 0.4, 1.08, 0.97], [-0.6, 0.34, 1.1, 1], [0.1, 0.34, 1.08, 1], [0.5, 0.35, 1.06, 1], [0.82, 0.38, 1.0, 0.98], [0.97, 0.45, 0.92, 0.93], [1, 0.55, 0.84, 0.86]],
    cabin: [[-0.97, 1.05, 1.56, 0.84], [-0.88, 1.05, 1.76, 0.82], [-0.1, 1.05, 1.8, 0.81], [0.18, 1.05, 1.77, 0.82], [0.5, 1.03, 1.08, 0.88]], roof: [-0.88, 0.16], rails: true, cladding: true },
  crossover: { L: [4.3, 4.6], W: [1.82, 1.9], wb: 0.6, r: [0.34, 0.37], lower: [[-1, 0.46, 0.95, 0.88], [-0.95, 0.36, 1.0, 0.96], [-0.6, 0.3, 1.0, 1], [0.1, 0.3, 0.98, 1], [0.5, 0.31, 0.96, 1], [0.82, 0.34, 0.9, 0.97], [0.97, 0.4, 0.82, 0.9], [1, 0.5, 0.74, 0.82]],
    cabin: [[-0.95, 0.97, 1.38, 0.83], [-0.82, 0.97, 1.58, 0.81], [-0.15, 0.97, 1.63, 0.8], [0.15, 0.97, 1.6, 0.81], [0.48, 0.95, 1.0, 0.88]], roof: [-0.8, 0.14], cladding: true },
  coupe: { L: [4.4, 4.8], W: [1.85, 1.95], wb: 0.6, r: [0.33, 0.35], lower: [[-1, 0.38, 0.8, 0.86], [-0.95, 0.27, 0.92, 0.97], [-0.7, 0.2, 0.93, 1], [0.0, 0.19, 0.86, 1], [0.5, 0.2, 0.8, 1], [0.8, 0.22, 0.72, 0.97], [0.96, 0.27, 0.62, 0.9], [1, 0.36, 0.54, 0.78]],
    cabin: [[-0.78, 0.86, 0.9, 0.84], [-0.5, 0.85, 1.2, 0.8], [-0.12, 0.84, 1.3, 0.79], [0.12, 0.83, 1.28, 0.8], [0.4, 0.8, 0.84, 0.87]], roof: [-0.36, 0.1], spoiler: true },
  sports: { L: [4.4, 4.7], W: [1.92, 2.0], wb: 0.6, r: [0.33, 0.35], lower: [[-1, 0.34, 0.78, 0.88], [-0.95, 0.24, 0.88, 0.98], [-0.6, 0.18, 0.92, 1.03], [-0.2, 0.17, 0.8, 0.98], [0.3, 0.17, 0.72, 0.98], [0.62, 0.18, 0.66, 1.02], [0.9, 0.2, 0.55, 0.96], [1, 0.3, 0.45, 0.8]],
    cabin: [[-0.75, 0.8, 0.84, 0.8], [-0.45, 0.78, 1.1, 0.74], [-0.12, 0.76, 1.18, 0.72], [0.1, 0.74, 1.15, 0.74], [0.36, 0.7, 0.74, 0.84]], roof: [-0.3, 0.06], spoiler: true },
  muscle: { L: [4.75, 5.05], W: [1.9, 1.97], wb: 0.58, r: [0.34, 0.37], lower: [[-1, 0.38, 0.9, 0.9], [-0.96, 0.28, 0.96, 0.98], [-0.7, 0.23, 0.98, 1], [0.0, 0.23, 0.93, 1], [0.55, 0.24, 0.92, 1], [0.85, 0.27, 0.88, 0.98], [0.98, 0.32, 0.84, 0.95], [1, 0.42, 0.78, 0.9]],
    cabin: [[-0.62, 0.93, 0.97, 0.84], [-0.4, 0.93, 1.3, 0.8], [-0.1, 0.92, 1.36, 0.79], [0.12, 0.92, 1.34, 0.8], [0.36, 0.9, 0.95, 0.87]], roof: [-0.34, 0.08], bootLip: true },
  pickup: { L: [5.3, 5.8], W: [1.98, 2.05], wb: 0.62, r: [0.39, 0.42], lower: [[-1, 0.52, 1.08, 0.97], [-0.97, 0.45, 1.1, 1], [0.1, 0.42, 1.12, 1], [0.55, 0.43, 1.12, 1], [0.84, 0.46, 1.08, 0.99], [0.97, 0.52, 1.02, 0.95], [1, 0.62, 0.95, 0.88]],
    cabin: [[-0.25, 1.1, 1.85, 0.86], [-0.2, 1.1, 1.92, 0.84], [0.14, 1.1, 1.9, 0.84], [0.5, 1.08, 1.14, 0.9]], roof: [-0.2, 0.12], bed: true },
  minivan: { L: [4.9, 5.2], W: [1.9, 1.98], wb: 0.6, r: [0.33, 0.36], lower: [[-1, 0.42, 1.0, 0.92], [-0.96, 0.32, 1.02, 0.98], [-0.6, 0.27, 1.0, 1], [0.1, 0.27, 0.98, 1], [0.55, 0.28, 0.96, 1], [0.82, 0.31, 0.9, 0.97], [0.97, 0.37, 0.8, 0.9], [1, 0.47, 0.72, 0.82]],
    cabin: [[-0.98, 0.98, 1.6, 0.86], [-0.92, 0.98, 1.78, 0.84], [0.2, 0.98, 1.78, 0.83], [0.4, 0.98, 1.6, 0.85], [0.66, 0.95, 1.0, 0.9]], roof: [-0.92, 0.3], slider: true },
  van: { L: [5.3, 6.0], W: [2.0, 2.06], wb: 0.64, r: [0.36, 0.38], lower: [[-1, 0.4, 1.0, 0.98], [-0.98, 0.34, 1.02, 1], [0.6, 0.34, 1.02, 1], [0.86, 0.37, 1.0, 0.98], [0.97, 0.43, 0.92, 0.92], [1, 0.52, 0.85, 0.85]],
    cabin: [[-1, 1.0, 2.4, 0.98], [-0.99, 1.0, 2.5, 0.98], [0.52, 1.0, 2.5, 0.98], [0.62, 1.0, 2.35, 0.97], [0.84, 0.98, 1.06, 0.95]], roof: null, panelVan: true },
  taxi: 'sedan', police: 'sedan'
};
// realistic paint distribution (white / black / grey / silver dominate real traffic)
const PAINTS = [[0xf2f2f0, 22], [0x111214, 18], [0x8a8e94, 12], [0xb9bcc0, 12], [0x2c3b57, 7], [0x7d1418, 6], [0x3a3d42, 8], [0x1c2a44, 4], [0x5c6b70, 3], [0x2e4a32, 2], [0xc9b7a0, 2], [0x8c5a2a, 1], [0xd6a23a, 1], [0x2a6ea8, 2], [0xc2c6c9, 3]];
const paintCache = new Map();
function paintMat(hex) {
  if (!paintCache.has(hex)) paintCache.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.32, metalness: hex === 0xf2f2f0 || hex === 0x111214 ? 0.1 : 0.55, clearcoat: 1, clearcoatRoughness: 0.06 }));
  return paintCache.get(hex);
}
export const M = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1016, roughness: 0.04, metalness: 0.7, clearcoat: 1 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.08, metalness: 1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 }),
  rimS: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.95 }),
  rimD: new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.35, metalness: 0.85 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.5, metalness: 0.8 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.5 }),
  well: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }),
  detail: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.95 })
};

const variantCache = new Map();
// build one variant's geometry (cached); returns { parts: {matKey: geometry}, L, W }
function buildVariant(type, vseed) {
  seed = vseed;
  let T = TYPES[type]; const special = typeof T === 'string' ? type : null; if (special) T = TYPES[T];
  const L = rr(...T.L), W = rr(...T.W), hw = W / 2, r = rr(...T.r), Z = L / 2;
  const hScale = rr(0.97, 1.04);
  const parts = { paint: [], glass: [], trim: [], chrome: [], lightF: [], lightR: [], plate: [], well: [] };
  // body
  const lw = T.lower.map(([z, yb, yt, wf], i, a) => [z * Z, yb * (yb > 0.3 ? hScale : 1), yt * hScale, wf * hw * (i === 0 || i === a.length - 1 ? 0.92 : 1)]);
  // extra rounded nose/tail caps so the ends are curved rather than flat slabs
  const f = lw[lw.length - 1], b0 = lw[0];
  lw.push([f[0] + 0.05, f[1] + 0.05, f[2] - 0.04, f[3] * 0.82]); lw.unshift([b0[0] - 0.04, b0[1] + 0.05, b0[2] - 0.04, b0[3] * 0.85]);
  const lower = smooth(lw, 4);
  const bodyG = sloft(lower, 3.1, 40, true, 0.13);
  parts.paint.push(bodyG);
  // wheel arches: dark wells + flared lips, wheels sit inside
  const wbz = T.wb * Z * rr(0.97, 1.03), wz = [wbz, -wbz];
  if (T.cabin) {
    const cab = smooth(T.cabin.map(([z, yb, yt, wf]) => [z * Z, yb * hScale, yt * hScale, wf * hw]));
    parts.glass.push(sloft(cab, 2.8, 26, true, 0.2));
    if (T.roof) { // painted roof skin + pillars (B/C) so the glasshouse reads as windows
      const roofSt = cab.filter((s) => s[0] >= T.roof[0] * Z - 0.01 && s[0] <= T.roof[1] * Z + 0.01).map(([z, yb, yt, w]) => [z, yt - 0.045, yt + 0.012, w * 1.01]);
      if (roofSt.length >= 2) parts.paint.push(sloft(roofSt, 2.8, 26, true, 0.2));
      const bz = (T.roof[0] + T.roof[1]) / 2 * Z + rr(-0.1, 0.1), topY = Math.max(...cab.map((s) => s[2])) - 0.05;
      for (const sx of [-1, 1]) parts.paint.push(box(0.03, topY - 0.95 * hScale, 0.11, sx * hw * 0.8, (topY + 0.95 * hScale) / 2, bz));
      // A- and C-pillars: painted strips following the glasshouse edges, plus windscreen header & base
      const pillar = (iA, iB, sx) => { const a = cab[iA], b2 = cab[iB]; const tw = (st) => st[3] * (1 - 0.2) * 0.98; parts.paint.push(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(sx * tw(a), a[1] + 0.02, a[0]), new THREE.Vector3(sx * tw(b2), b2[2] - 0.01, b2[0])), 1, 0.035, 5)); };
      const n = cab.length, iTopF = cab.reduce((m, st, i) => (st[0] <= T.roof[1] * Z + 0.05 ? i : m), 0), iTopR = cab.findIndex((st) => st[0] >= T.roof[0] * Z - 0.05);
      for (const sx of [-1, 1]) { pillar(n - 1, Math.max(iTopF, 0), sx); if (iTopR > 0) pillar(0, iTopR, sx); }
    }
    if (T.panelVan) { // vans: painted cargo box with just cab windows
      parts.paint.push(sloft(smooth(T.cabin.slice(0, 3).map(([z, yb, yt, wf]) => [z * Z, yb * hScale, yt * hScale + 0.01, wf * hw * 1.01])), 6, 24));
    }
  }
  if (T.bed) { // pickup bed walls + tailgate
    const z0 = -Z * 0.97, z1 = -Z * 0.28, yb = 1.08 * hScale, yt = 1.3 * hScale;
    for (const sx of [-1, 1]) parts.paint.push(box(0.06, yt - yb, z1 - z0, sx * (hw - 0.04), (yb + yt) / 2, (z0 + z1) / 2));
    parts.paint.push(box(W - 0.06, yt - yb, 0.06, 0, (yb + yt) / 2, z0)); parts.trim.push(box(W - 0.14, 0.04, z1 - z0, 0, yb + 0.02, (z0 + z1) / 2));
  }
  // cut real wheel-arch openings: body vertices inside each arch (outer side region) are pushed out to the arch edge
  { const R = r * 1.14, p = bodyG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(x) < hw * 0.5) continue;
      for (const wz0 of wz) { const dz = z - wz0, dy = y - r, d = Math.hypot(dz, dy); if (d < R && dy > -r * 1.2) { const k = R / Math.max(d, 1e-4); p.setXYZ(i, x * 0.97, r + Math.max(dy * k, -r), wz0 + dz * k); } }
    }
    bodyG.computeVertexNormals(); }
  for (const z of wz) for (const sx of [-1, 1]) {
    parts.well.push(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.26, 22, 1, true).rotateZ(Math.PI / 2).translate(sx * (hw - 0.27), r, z)); // dark arch liner behind the wheel
    parts.trim.push(new THREE.TorusGeometry(r * 1.13, 0.028, 5, 18, Math.PI).rotateY(Math.PI / 2).translate(sx * (hw - 0.005), r, z));
  }
  if (T.cladding) for (const sx of [-1, 1]) parts.trim.push(box(0.05, 0.14, L * 0.78, sx * (hw - 0.01), 0.42, 0));
  // bumpers (black lower valance) + grille + lights
  const fy = T.lower[T.lower.length - 2][2] * hScale, frontY = (T.lower[T.lower.length - 1][1] + T.lower[T.lower.length - 1][2]) / 2 * hScale;
  parts.trim.push(box(W * 0.84, 0.16, 0.1, 0, T.lower[0][1] * 0.9 + 0.06, Z - 0.02), box(W * 0.84, 0.15, 0.1, 0, T.lower[0][1] * 0.9 + 0.06, -Z + 0.02));
  const grilleW = W * rr(0.32, 0.5), grilleH = rr(0.12, 0.22);
  parts.trim.push(box(grilleW, grilleH, 0.06, 0, frontY - 0.02, Z - 0.01));
  if (rnd() < 0.55) parts.chrome.push(box(grilleW + 0.03, 0.02, 0.065, 0, frontY - 0.02 + grilleH / 2, Z - 0.005));
  const hlW = rr(0.22, 0.34), hlH = rr(0.07, 0.12), hlY = fy - hlH * 0.7;
  for (const sx of [-1, 1]) {
    const hx = sx * (hw - hlW / 2 - 0.1), hz = Z * (type === 'sports' ? 0.955 : 0.975) - 0.02, ang = -sx * 0.32;
    const rot = (g) => g.translate(-hx, -hlY, -hz).rotateY(ang).translate(hx, hlY, hz);
    parts.trim.push(rot(box(hlW + 0.03, hlH + 0.03, 0.06, hx, hlY, hz)));
    parts.chrome.push(rot(box(hlW + 0.012, hlH + 0.012, 0.065, hx, hlY, hz + 0.004)));
    parts.lightF.push(rot(box(hlW * 0.82, hlH * 0.55, 0.07, hx, hlY + hlH * 0.08, hz + 0.008)));
    if (rnd() < 0.6) parts.lightF.push(rot(box(hlW * 0.9, 0.012, 0.072, hx, hlY - hlH * 0.38, hz + 0.01))); // LED DRL strip
  }
  const tlFull = rnd() < 0.35, ry = (T.lower[1][2] * hScale) - 0.1;
  if (tlFull) parts.lightR.push(box(W * 0.86, 0.05, 0.06, 0, ry, -Z + 0.03));
  for (const sx of [-1, 1]) parts.lightR.push(box(rr(0.22, 0.32), rr(0.08, 0.14), 0.07, sx * (hw - 0.2), ry, -Z * 0.99 + 0.03));
  // plates
  parts.plate.push(box(0.52, 0.12, 0.02, 0, T.lower[0][1] + 0.18, -Z - 0.01), box(0.52, 0.12, 0.02, 0, frontY - grilleH / 2 - 0.1, Z + 0.01));
  // mirrors, handles, door seams
  if (T.cabin) {
    const mz = T.cabin[T.cabin.length - 1][0] * Z - 0.15, my = T.cabin[T.cabin.length - 1][1] * hScale + 0.08;
    for (const sx of [-1, 1]) {
      parts.paint.push(box(0.16, 0.11, 0.1, sx * (hw + 0.05), my, mz)); parts.trim.push(box(0.04, 0.03, 0.08, sx * (hw - 0.02), my - 0.06, mz));
      const doors = T.slider || T.bed || T.panelVan ? [0.3 * Z] : type === 'coupe' || type === 'sports' || type === 'muscle' ? [0.1 * Z] : [0.32 * Z, -0.12 * Z];
      for (const dz of doors) {
        parts.trim.push(box(0.006, 0.55 * hScale, 0.012, sx * (hw - 0.002), 0.62 * hScale, dz - 0.55)); // seam
        parts.chrome.push(box(0.02, 0.025, 0.13, sx * (hw + 0.005), 0.86 * hScale, dz - 0.75));
      }
    }
  }
  if (T.rails) for (const sx of [-1, 1]) parts.trim.push(box(0.04, 0.05, L * 0.5, sx * hw * 0.62, Math.max(...T.cabin.map((c) => c[2])) * hScale + 0.04, -0.1));
  if (T.spoiler && rnd() < 0.6) parts.paint.push(box(W * 0.8, 0.03, 0.18, 0, T.lower[1][2] * hScale + 0.07, -Z + 0.12));
  if (T.bootLip) parts.paint.push(box(W * 0.82, 0.02, 0.06, 0, T.lower[1][2] * hScale + 0.01, -Z * 0.95));
  if (special === 'taxi') { parts.trim.push(box(0.7, 0.18, 0.28, 0, 1.47 * hScale + 0.09, -0.1)); parts.lightF.push(box(0.6, 0.12, 0.3, 0, 1.47 * hScale + 0.1, -0.1)); }
  if (special === 'police') { parts.trim.push(box(1.2, 0.08, 0.3, 0, 1.47 * hScale + 0.05, -0.1)); parts.lightF.push(box(0.5, 0.06, 0.26, -0.32, 1.47 * hScale + 0.1, -0.1)); parts.lightR.push(box(0.5, 0.06, 0.26, 0.32, 1.47 * hScale + 0.1, -0.1)); }
  // wheels
  const style = (rnd() * 4) | 0, wg = wheelGeo(r, rr(0.2, 0.26), style), tires = [], rims = [], discs = [];
  for (const z of wz) for (const sx of [-1, 1]) {
    const flip = new THREE.Matrix4().makeRotationY(sx < 0 ? Math.PI : 0).setPosition(sx * (hw - 0.13), r, z);
    tires.push(wg.tire.clone().applyMatrix4(flip)); rims.push(wg.rim.clone().applyMatrix4(flip)); discs.push(wg.disc.clone().applyMatrix4(flip));
  }
  const out = {}, rimDark = rnd() < 0.3;
  for (const k of ['paint', 'glass', 'lightF', 'lightR']) if (parts[k].length) out[k] = merge(parts[k]);
  // one vertex-coloured mesh for all dark/matte detail, one for all metal: keeps each car at ~6 draw calls
  const C = (list, hex) => list.map((g) => colorize(g, hex));
  out.detail = merge([...C(parts.trim, 0x151617), ...C(parts.well, 0x050505), ...C(tires, 0x141414), ...C(parts.plate, 0xeeeee4)]);
  out.metal = merge([...C(parts.chrome, 0xe6e8ea), ...C(rims, rimDark ? 0x2a2c2f : 0xc4c8cc), ...C(discs, 0x5e5e5e)]);
  return { parts: out, L, W };
}

export const CAR_TYPES = ['sedan', 'hatch', 'wagon', 'suv', 'crossover', 'coupe', 'sports', 'muscle', 'pickup', 'minivan', 'van', 'taxi', 'police'];
const MIX = { city: [['sedan', 20], ['hatch', 14], ['suv', 14], ['crossover', 16], ['wagon', 5], ['minivan', 6], ['van', 6], ['pickup', 5], ['coupe', 4], ['taxi', 7], ['police', 2], ['sports', 2], ['muscle', 2]],
  hood: [['suv', 20], ['crossover', 20], ['sedan', 16], ['minivan', 10], ['pickup', 14], ['hatch', 8], ['wagon', 6], ['muscle', 3], ['van', 3]],
  hwy: [['sedan', 18], ['suv', 16], ['crossover', 14], ['pickup', 12], ['van', 8], ['wagon', 6], ['coupe', 6], ['sports', 6], ['muscle', 4], ['minivan', 6], ['hatch', 4]] };
let vCounter = 0;
export function randomCarType(kind) { return pickW(MIX[kind] || MIX.city); }
// returns a THREE.Group with userData {L, W}; ~20 cached geometry variants per type keep memory low
export function makeGenCar(type, paintHex) {
  const vi = (vCounter++ % 20), key = type + ':' + vi;
  if (!variantCache.has(key)) variantCache.set(key, buildVariant(type, 1000 + vi * 7919 + type.length * 131));
  const v = variantCache.get(key);
  seed = (vCounter * 48271) % 2147483647 || 1;
  const hex = type === 'taxi' ? 0xf1b512 : type === 'police' ? (rnd() < 0.5 ? 0x111214 : 0xf2f2f0) : (paintHex ?? pickW(PAINTS));
  const g = new THREE.Group();
  const add = (geo, mat, cast = true) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  add(v.parts.paint, paintMat(hex)); add(v.parts.glass, M.glass);
  add(v.parts.detail, M.detail); add(v.parts.metal, M.metal, false);
  g.userData.lightF = add(v.parts.lightF, LIGHTS.head, false); g.userData.lightR = add(v.parts.lightR, LIGHTS.tail, false);
  g.userData.L = v.L; g.userData.W = v.W; g.userData.gen = true;
  return g;
}
export const LIGHTS = { head: null, tail: null };
export function setLightMats(head, tail) { LIGHTS.head = head; LIGHTS.tail = tail; }
