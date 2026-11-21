import * as THREE from 'three';
import { FOREST, terrainH } from './world.js';
import { rr, rand, tubeGeo, V } from './util.js';

// ============================================================ loft builder
// stations: [z, y, w, top, bottom] (+ optional x) along a spine in the YZ plane.
// Each station is an ellipse: half-width w, half-height `top` above / `bottom` below the spine point.
// colour(c, t, s, side) gets t = 0..1 along the spine, s = -1 (underside) .. 1 (top), side = -1..1 (left/right).
function lerpStations(st, sub) {
  const out = [];
  const cr = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < sub; k++) {
    const t = k / sub, a = st[Math.max(0, i - 1)], b = st[i], c = st[i + 1], d = st[Math.min(st.length - 1, i + 2)];
    out.push(b.map((_, j) => (j >= 2 ? Math.max(0, cr(a[j], b[j], c[j], d[j], t)) : cr(a[j], b[j], c[j], d[j], t))));
  }
  out.push(st[st.length - 1].slice());
  return out;
}
function loft(stations, colour, { seg = 18, sub = 4, lateral = false } = {}) {
  const st = lerpStations(stations, sub), n = st.length;
  const pos = [], col = [], idx = [], c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [z, y, w, top, bot] = st[i], x0 = st[i][5] || 0;
    const p0 = st[Math.max(0, i - 1)], p1 = st[Math.min(n - 1, i + 1)];
    // tangent in the spine plane (YZ for bodies, XY for lateral pieces like ears)
    let tz = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
    // local up = tangent rotated +90deg in the spine plane
    const uz = -ty, uy = tz;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const h = sa >= 0 ? top : bot;
      const X = x0 + ca * w, Yo = sa * h;
      pos.push(X, y + uy * Yo, z + uz * Yo);
      colour(c, i / (n - 1), sa, ca);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * (seg + 1) + k, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// vertical limb loft: stations [y, w(x), d(z), zOffset]
function limb(stations, colour, seg = 12) {
  const st = lerpStations(stations, 3), n = st.length, pos = [], col = [], idx = [], c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [y, w, d, zo = 0] = st[i];
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; pos.push(Math.cos(a) * w, y, zo + Math.sin(a) * d); colour(c, i / (n - 1), Math.sin(a), Math.cos(a)); col.push(c.r, c.g, c.b); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

// fur: vertex colours + a fine hair-strand texture that breaks up the shading
function furTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  x.fillStyle = '#d2d2d2'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.random() * 105, px = Math.random() * 256, py = Math.random() * 256, l = 2 + Math.random() * 5;
    x.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.35 + Math.random() * 0.35})`; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 1.5, py + l); x.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const FUR = furTexture();
const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: FUR, side: THREE.DoubleSide });
const hoofM = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.45 });
const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x050403, roughness: 0.05, clearcoat: 1 });
const noseM = new THREE.MeshPhysicalMaterial({ color: 0x0b0908, roughness: 0.25, clearcoat: 0.6 });
const antlerM = new THREE.MeshStandardMaterial({ color: 0xb8a487, roughness: 0.75 });
const col = (h) => new THREE.Color(h);
const mixc = (c, a, b, t) => c.copy(a).lerp(b, Math.max(0, Math.min(1, t)));

// ============================================================ white-tailed deer
const D = { back: col(0x5e4128), side: col(0x92643c), belly: col(0xe9e0cf), white: col(0xf4f1ea), dark: col(0x2a1d14), leg: col(0x7a5434) };
function deerBuild(buck) {
  const g = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 0; g.add(torso);
  // body: rump -> chest, deep chest, tucked loin, white rump patch & belly
  const body = loft([
    [-0.71, 0.95, 0.0, 0.0, 0.0], [-0.67, 0.965, 0.075, 0.08, 0.09], [-0.58, 0.975, 0.145, 0.125, 0.19], [-0.44, 0.975, 0.175, 0.13, 0.245],
    [-0.25, 0.965, 0.165, 0.12, 0.2], [-0.02, 0.975, 0.185, 0.13, 0.245], [0.2, 0.99, 0.19, 0.14, 0.29], [0.36, 1.02, 0.16, 0.15, 0.295],
    [0.47, 1.06, 0.115, 0.13, 0.22], [0.53, 1.1, 0.0, 0.0, 0.0]
  ], (c, t, s, sd) => {
    mixc(c, D.side, D.back, s * 1.2);
    if (s < -0.62) mixc(c, c, D.belly, (-0.62 - s) * 2.6 * (t > 0.2 && t < 0.85 ? 1 : 0.3)); // pale underbelly only
    if (t < 0.16 && s > -0.6) mixc(c, c, D.white, (0.16 - t) * 7 * (1 - Math.abs(sd) * 0.6)); // rump patch
  }, { seg: 22, sub: 5 });
  torso.add(new THREE.Mesh(body, furMat));
  // neck + head (one loft) on a pivot at the withers so the head can graze
  const neck = new THREE.Group(); neck.position.set(0, 1.08, 0.41); torso.add(neck);
  const nh = loft([
    [-0.07, -0.05, 0.1, 0.12, 0.15], [0.05, 0.09, 0.088, 0.1, 0.125], [0.14, 0.26, 0.072, 0.078, 0.09], [0.2, 0.4, 0.062, 0.068, 0.072],
    [0.245, 0.495, 0.068, 0.074, 0.068], [0.315, 0.53, 0.07, 0.07, 0.066], [0.385, 0.515, 0.055, 0.052, 0.055], [0.45, 0.485, 0.04, 0.036, 0.043],
    [0.492, 0.468, 0.028, 0.025, 0.029], [0.512, 0.462, 0.0, 0.0, 0.0]
  ], (c, t, s, sd) => {
    mixc(c, D.side, D.back, s);
    if (s < -0.3 && t < 0.55) mixc(c, c, col(0xb08a62), 0.45); // slightly paler grey-brown under the neck
    if (t > 0.42 && t < 0.52 && s < 0) mixc(c, c, D.white, 0.9); // throat patch
    if (t > 0.86) mixc(c, c, D.dark, (t - 0.86) * 9);            // muzzle
    if (t > 0.8 && t < 0.86) mixc(c, c, D.white, 0.75);          // white band behind the nose
  }, { seg: 18, sub: 5 });
  neck.add(new THREE.Mesh(nh, furMat));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(1.2, 0.8, 0.9), noseM); nose.position.set(0, 0.47, 0.5); neck.add(nose);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeM); eye.position.set(sx * 0.058, 0.545, 0.33); neck.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.004, 4, 12), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 1 })); ring.position.copy(eye.position); ring.rotation.y = sx * Math.PI / 2; neck.add(ring);
    // ear: flattened leaf loft, dark rim, pale inside
    const ear = new THREE.Mesh(loft([[0, 0, 0.0, 0, 0], [0.03, 0, 0.035, 0.012, 0.012], [0.08, 0, 0.042, 0.01, 0.01], [0.13, 0, 0.028, 0.008, 0.008], [0.16, 0, 0, 0, 0]],
      (c, t, s, sd) => mixc(c, D.side, sd > 0.4 ? D.belly : D.dark, sd > 0.4 ? 0.6 : t * 0.6), { seg: 10, sub: 3 }), furMat);
    ear.position.set(sx * 0.05, 0.575, 0.27); ear.rotation.set(-0.5, sx * 0.4, sx * 1.15); neck.add(ear);
    if (buck) {
      const pts = [V(sx * 0.03, 0.6, 0.29), V(sx * 0.12, 0.72, 0.26), V(sx * 0.2, 0.8, 0.33), V(sx * 0.19, 0.86, 0.44), V(sx * 0.14, 0.88, 0.52)];
      neck.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.013, 6), antlerM));
      for (const [i, h] of [[1, 0.12], [2, 0.13], [3, 0.09]]) { const b = pts[i]; neck.add(new THREE.Mesh(tubeGeo(b, b.clone().add(V(-sx * 0.01, h, 0.02)), 0.01, 0.004, 5), antlerM)); }
    }
  }
  // tail: white underside flag
  const tailG = new THREE.Group(); tailG.position.set(0, 1.0, -0.66); torso.add(tailG);
  tailG.add(new THREE.Mesh(loft([[0, 0, 0, 0, 0], [-0.03, -0.01, 0.04, 0.03, 0.03], [-0.1, -0.05, 0.05, 0.03, 0.04], [-0.17, -0.09, 0.035, 0.02, 0.03], [-0.2, -0.11, 0, 0, 0]],
    (c, t, s) => mixc(c, D.side, D.white, s < 0 ? 1 : 0.1), { seg: 10, sub: 3 }), furMat));
  // legs
  const legs = [];
  const legCol = (c, t, s) => { mixc(c, D.side, D.leg, t); if (s < -0.5) mixc(c, c, D.belly, 0.3 * (-0.5 - s) * 2); };
  for (const sx of [-1, 1]) {
    // front: shoulder blade/forearm muscle, carpus, slim cannon, fetlock, hoof
    const fu = new THREE.Group(); fu.position.set(sx * 0.1, 0.95, 0.3); torso.add(fu);
    fu.add(new THREE.Mesh(limb([[0.08, 0.075, 0.1, 0.02], [-0.12, 0.06, 0.08, 0.02], [-0.3, 0.038, 0.045, 0], [-0.43, 0.03, 0.036, 0]], legCol), furMat));
    const fl = new THREE.Group(); fl.position.y = -0.43; fu.add(fl);
    fl.add(new THREE.Mesh(limb([[0.01, 0.03, 0.035], [-0.12, 0.022, 0.026], [-0.36, 0.02, 0.024], [-0.43, 0.025, 0.03], [-0.47, 0.022, 0.028, 0.01]], legCol), furMat));
    const fh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.05, 10).translate(0, -0.495, 0.012), hoofM); fl.add(fh);
    legs.push({ up: fu, low: fl, front: true, rest: [0, 0] });
    // hind: big ham, hock angled back, long cannon
    const hu = new THREE.Group(); hu.position.set(sx * 0.11, 0.98, -0.46); torso.add(hu);
    hu.add(new THREE.Mesh(limb([[0.1, 0.09, 0.15, 0.03], [-0.08, 0.085, 0.14, 0.0], [-0.26, 0.055, 0.075, -0.03], [-0.4, 0.033, 0.042, -0.05]], legCol), furMat));
    const hl = new THREE.Group(); hl.position.set(0, -0.41, -0.05); hu.add(hl);
    hl.add(new THREE.Mesh(limb([[0.02, 0.034, 0.045], [-0.1, 0.024, 0.03], [-0.42, 0.021, 0.026], [-0.48, 0.025, 0.03], [-0.52, 0.022, 0.028, 0.01]], legCol), furMat));
    hl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.05, 10).translate(0, -0.545, 0.012), hoofM));
    legs.push({ up: hu, low: hl, front: false, rest: [0.3, -0.3] });
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const s = buck ? rr(1.05, 1.12) : rr(0.88, 0.98); g.scale.setScalar(s);
  return { g, legs, neck, torso, tail: tailG, kind: 'deer', speed: 0, r: 0.6 * s, gaitK: 2.4 };
}

// ============================================================ cottontail rabbit
const R = { back: col(0x6e5c48), side: col(0x8f7a62), belly: col(0xe9e3d8), white: col(0xf6f4ef), dark: col(0x2a221b) };
function rabbitBuild() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(new THREE.Mesh(loft([[-0.17, 0.14, 0, 0, 0], [-0.155, 0.145, 0.06, 0.06, 0.06], [-0.11, 0.15, 0.095, 0.09, 0.1], [-0.03, 0.155, 0.088, 0.085, 0.085], [0.05, 0.165, 0.07, 0.07, 0.07], [0.1, 0.19, 0.045, 0.05, 0.045], [0.12, 0.2, 0, 0, 0]],
    (c, t, s) => { mixc(c, R.side, R.back, s); if (s < -0.3) mixc(c, c, R.belly, (-0.3 - s) * 2); }, { seg: 16, sub: 4 }), furMat));
  const head = new THREE.Group(); head.position.set(0, 0.21, 0.1); body.add(head);
  head.add(new THREE.Mesh(loft([[-0.04, 0, 0, 0, 0], [-0.03, 0.005, 0.035, 0.035, 0.035], [0.01, 0.005, 0.045, 0.042, 0.04], [0.05, -0.005, 0.034, 0.032, 0.032], [0.075, -0.015, 0.018, 0.017, 0.017], [0.085, -0.02, 0, 0, 0]],
    (c, t, s) => { mixc(c, R.side, R.back, s * 0.8); if (s < -0.4) mixc(c, c, R.belly, 0.6); }, { seg: 14, sub: 3 }), furMat));
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), eyeM); eye.position.set(sx * 0.03, 0.012, 0.02); head.add(eye);
    const ear = new THREE.Mesh(loft([[0, 0, 0, 0, 0], [0.02, 0, 0.018, 0.006, 0.006], [0.07, 0, 0.022, 0.005, 0.005], [0.11, 0, 0.015, 0.004, 0.004], [0.125, 0, 0, 0, 0]],
      (c, t, s, sd) => mixc(c, R.side, t > 0.85 ? R.dark : sd > 0.3 ? col(0xd9b4a6) : R.side, t > 0.85 ? 0.8 : 0.5), { seg: 8, sub: 3 }), furMat);
    ear.position.set(sx * 0.016, 0.03, -0.01); ear.rotation.set(-1.15, 0, sx * 1.4); head.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), new THREE.MeshStandardMaterial({ color: 0x6a4a44 })); nose.position.set(0, -0.01, 0.083); head.add(nose);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 1, map: FUR })); tail.position.set(0, 0.17, -0.165); body.add(tail);
  // hind legs: big haunch + long foot (folded when sitting)
  const hinds = [];
  for (const sx of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(sx * 0.06, 0.13, -0.09); body.add(hp);
    hp.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10).scale(0.7, 1, 1.25), new THREE.MeshStandardMaterial({ color: 0x84705a, roughness: 1, map: FUR })));
    const foot = new THREE.Mesh(loft([[-0.03, 0, 0, 0, 0], [-0.02, 0, 0.018, 0.012, 0.012], [0.05, 0, 0.016, 0.01, 0.008], [0.09, 0, 0.013, 0.008, 0.006], [0.1, 0, 0, 0, 0]],
      (c, t, s) => mixc(c, R.side, R.belly, s < 0 ? 0.6 : 0), { seg: 8, sub: 3 }), furMat);
    foot.position.set(0, -0.11, 0.0); hp.add(foot);
    hinds.push(hp);
  }
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(limb([[0, 0.014, 0.016], [-0.07, 0.011, 0.013], [-0.1, 0.012, 0.016, 0.008]], (c) => c.copy(R.side)), furMat); f.position.set(sx * 0.035, 0.12, 0.06); body.add(f); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.scale.setScalar(rr(0.95, 1.15));
  return { g, body, head, hinds, legs: [], kind: 'rabbit', speed: 0, r: 0.2, gaitK: 5 };
}

// ============================================================ red fox
const F = { red: col(0xb85a22), back: col(0x8e3f17), white: col(0xf2ede4), black: col(0x1c1612) };
function foxBuild() {
  const g = new THREE.Group();
  const torso = new THREE.Group(); g.add(torso);
  torso.add(new THREE.Mesh(loft([[-0.34, 0.4, 0, 0, 0], [-0.3, 0.41, 0.07, 0.07, 0.08], [-0.18, 0.41, 0.09, 0.08, 0.1], [0.0, 0.4, 0.085, 0.075, 0.095], [0.15, 0.42, 0.09, 0.085, 0.12], [0.25, 0.45, 0.07, 0.08, 0.1], [0.3, 0.48, 0, 0, 0]],
    (c, t, s) => { mixc(c, F.red, F.back, s); if (s < -0.35) mixc(c, c, F.white, (-0.35 - s) * 2.4); }, { seg: 18, sub: 4 }), furMat));
  const neck = new THREE.Group(); neck.position.set(0, 0.47, 0.24); torso.add(neck);
  neck.add(new THREE.Mesh(loft([[-0.05, -0.03, 0.07, 0.07, 0.09], [0.04, 0.06, 0.06, 0.06, 0.07], [0.1, 0.11, 0.065, 0.06, 0.06], [0.16, 0.12, 0.055, 0.05, 0.045], [0.22, 0.1, 0.03, 0.025, 0.025], [0.27, 0.085, 0.012, 0.012, 0.012], [0.285, 0.08, 0, 0, 0]],
    (c, t, s) => { mixc(c, F.red, F.back, s * 0.8); if (s < -0.1 || (t > 0.5 && s < 0.2)) mixc(c, c, F.white, s < -0.1 ? 0.95 : 0.5); }, { seg: 16, sub: 4 }), furMat));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), noseM); nose.position.set(0, 0.083, 0.285); neck.add(nose);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshPhysicalMaterial({ color: 0x8a5a10, roughness: 0.1, clearcoat: 1 })); eye.position.set(sx * 0.035, 0.13, 0.19); neck.add(eye);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.085, 4).scale(1, 1, 0.35), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1, map: FUR }));
    ear.position.set(sx * 0.04, 0.2, 0.1); ear.rotation.z = -sx * 0.25; neck.add(ear);
  }
  // big bushy tail with white tip
  const tail = new THREE.Group(); tail.position.set(0, 0.42, -0.32); torso.add(tail);
  tail.add(new THREE.Mesh(loft([[0, 0, 0.03, 0.03, 0.03], [-0.1, -0.04, 0.06, 0.06, 0.06], [-0.22, -0.1, 0.075, 0.07, 0.075], [-0.34, -0.15, 0.06, 0.055, 0.06], [-0.42, -0.17, 0.035, 0.03, 0.035], [-0.46, -0.18, 0, 0, 0]],
    (c, t) => mixc(c, F.red, F.white, t > 0.82 ? 1 : 0), { seg: 14, sub: 4 }), furMat));
  const legs = [];
  const legC = (c, t) => mixc(c, F.red, F.black, (t - 0.3) * 2.5);
  for (const [x, z, front] of [[0.055, 0.18, true], [-0.055, 0.18, true], [0.06, -0.22, false], [-0.06, -0.22, false]]) {
    const up = new THREE.Group(); up.position.set(x, 0.4, z); torso.add(up);
    up.add(new THREE.Mesh(limb([[0.04, 0.035, front ? 0.04 : 0.06], [-0.1, 0.025, front ? 0.03 : 0.045], [-0.2, 0.018, 0.02]], legC), furMat));
    const low = new THREE.Group(); low.position.y = -0.2; up.add(low);
    low.add(new THREE.Mesh(limb([[0.01, 0.018, 0.02], [-0.16, 0.013, 0.015], [-0.19, 0.017, 0.022, 0.01]], (c) => c.copy(F.black)), furMat));
    legs.push({ up, low, front, rest: front ? [0, 0] : [0.25, -0.25] });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legs, neck, torso, tail, kind: 'fox', speed: 0, r: 0.3, gaitK: 4.2 };
}

// ============================================================ birds (crows circling above the trees)
class Flock {
  constructor(scene, n = 14) {
    this.birds = []; this.c = new THREE.Vector3(-700, 40, 0); this.t = Math.random() * 10;
    const m = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6).scale(0.7, 0.6, 2.2), m));
      const wing = (sx) => { const pv = new THREE.Group(); const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(sx * 0.42, 0.06); sh.lineTo(sx * 0.5, -0.04); sh.lineTo(sx * 0.2, -0.12); sh.lineTo(0, -0.1); sh.closePath(); const w = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), m); pv.add(w); b.add(pv); return pv; };
      b.userData = { wl: wing(1), wr: wing(-1), ph: Math.random() * 6, r: rr(10, 26), h: rr(-4, 6), sp: rr(0.25, 0.4) * (Math.random() < 0.5 ? 1 : -1), a: Math.random() * 6.28 };
      b.scale.setScalar(rr(1.6, 2.1)); scene.add(b); this.birds.push(b);
    }
  }
  update(dt, player) {
    this.t += dt;
    // flock drifts toward the player over open/forest areas, staying above the canopy
    const target = new THREE.Vector3(player.pos.x + Math.sin(this.t * 0.05) * 60, Math.max(terrainH(player.pos.x, player.pos.z) + 30, 32), player.pos.z + Math.cos(this.t * 0.04) * 60);
    this.c.lerp(target, 1 - Math.exp(-dt * 0.08));
    for (const b of this.birds) {
      const u = b.userData; u.a += u.sp * dt; u.ph += dt * (7 + Math.sin(u.a * 3) * 2);
      const x = this.c.x + Math.cos(u.a) * u.r, z = this.c.z + Math.sin(u.a) * u.r, y = this.c.y + u.h + Math.sin(u.a * 2 + u.r) * 1.5;
      b.position.set(x, y, z); b.rotation.y = Math.atan2(-Math.sin(u.a) * u.sp, Math.cos(u.a) * u.sp) + Math.PI / 2 * Math.sign(u.sp);
      b.rotation.z = -Math.sign(u.sp) * 0.35;
      const glide = Math.sin(u.ph * 0.13) > 0.4; const f = glide ? 0.12 : Math.sin(u.ph) * 0.75;
      u.wl.rotation.z = f; u.wr.rotation.z = -f;
    }
  }
}

// ============================================================ wildlife manager
export class Wildlife {
  constructor(scene) {
    this.scene = scene; this.list = [];
    for (let i = 0; i < 16; i++) this.add(deerBuild(rand() < 0.4));
    for (let i = 0; i < 36; i++) this.add(rabbitBuild());
    for (let i = 0; i < 8; i++) this.add(foxBuild());
    this.flocks = [new Flock(scene, 14), new Flock(scene, 9)];
    this.flocks[1].c.set(300, 45, 300);
  }
  add(a, x, z) {
    a.x = x ?? rr(FOREST.x0 + 40, FOREST.x1 - 40); a.z = z ?? rr(FOREST.z0 + 40, FOREST.z1 - 40);
    a.yaw = rand() * 6.28; a.state = 'idle'; a.timer = rr(1, 5); a.phase = rand() * 10;
    this.scene.add(a.g); this.list.push(a);
  }
  addAnimated() {} // kept for compatibility (the procedural fox replaced the glTF sample fox)
  update(dt, player) {
    for (const f of this.flocks) f.update(dt, player);
    for (const a of this.list) {
      const dx = player.pos.x - a.x, dz = player.pos.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 > 320 * 320) { a.g.visible = false; continue; }
      a.g.visible = true;
      const fleeR = a.kind === 'deer' ? 32 : a.kind === 'fox' ? 22 : 12;
      if (player.alive && d2 < fleeR * fleeR && Math.abs(player.speed) > 1.5) { a.state = 'flee'; a.timer = rr(2, 4); a.yaw = Math.atan2(-dx, -dz) + rr(-0.5, 0.5); }
      a.timer -= dt;
      if (a.timer <= 0) {
        if (a.state === 'flee' || a.state === 'walk') { a.state = 'idle'; a.timer = rr(2, 7); }
        else { a.state = 'walk'; a.timer = rr(2, 6); a.yaw += rr(-1.5, 1.5); }
      }
      const vmax = a.kind === 'deer' ? (a.state === 'flee' ? 13 : 1.3) : a.kind === 'fox' ? (a.state === 'flee' ? 10 : 1.4) : (a.state === 'flee' ? 7 : 0.8);
      a.speed += ((a.state === 'idle' ? 0 : vmax) - a.speed) * Math.min(1, dt * 3);
      a.x += Math.sin(a.yaw) * a.speed * dt; a.z += Math.cos(a.yaw) * a.speed * dt;
      if (a.x < FOREST.x0 + 20 || a.x > FOREST.x1 - 20 || a.z < FOREST.z0 + 20 || a.z > FOREST.z1 - 20) {
        a.yaw = Math.atan2((FOREST.x0 + FOREST.x1) / 2 - a.x, -a.z); a.x = Math.min(Math.max(a.x, FOREST.x0 + 20), FOREST.x1 - 20); a.z = Math.min(Math.max(a.z, FOREST.z0 + 20), FOREST.z1 - 20);
      }
      a.phase += dt * (a.speed * a.gaitK + 0.5);
      let y = terrainH(a.x, a.z);
      if (a.kind === 'deer' || a.kind === 'fox') {
        const run = a.speed > (a.kind === 'deer' ? 4 : 3), amp = Math.min(1, a.speed * (a.kind === 'deer' ? 0.14 : 0.3));
        a.legs.forEach((l, i) => {
          const side = i % 2;
          // walk/trot: diagonal pairs; gallop/bound: fronts then hinds
          const off = run ? (l.front ? 0 : Math.PI * 0.8) + side * 0.3 : (l.front ? 0 : Math.PI) + side * Math.PI;
          const ph = a.phase + off, sw = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
          l.up.rotation.x = l.rest[0] + sw * (run ? 0.7 : 0.38) * amp;
          l.low.rotation.x = l.rest[1] + (l.front ? lift * 1.1 * amp : -lift * 0.9 * amp);
        });
        if (run) { y += Math.max(0, Math.sin(a.phase)) * (a.kind === 'deer' ? 0.3 : 0.1); a.torso.rotation.x = Math.sin(a.phase + 0.6) * 0.1; } else a.torso.rotation.x = Math.sin(a.phase * 2) * 0.01;
        const graze = a.state === 'idle' && Math.sin(a.phase * 0.21 + a.x) > -0.2;
        a.neck.rotation.x += ((graze ? 1.05 : run ? 0.25 : 0.05) - a.neck.rotation.x) * Math.min(1, dt * 2.5);
        if (a.kind === 'deer') a.tail.rotation.x = a.state === 'flee' ? -0.9 : 0.15; // white flag goes up when fleeing
        else a.tail.rotation.x = (run ? -0.1 : 0.15) + Math.sin(a.phase * 1.5) * 0.08;
      } else if (a.kind === 'rabbit') {
        // hop: crouch -> launch (hind legs extend back) -> airborne -> land
        const moving = a.speed > 0.15, ph = (a.phase * 1.2) % (Math.PI * 2);
        const air = moving ? Math.max(0, Math.sin(ph)) : 0;
        y += air * (a.state === 'flee' ? 0.32 : 0.1);
        a.body.rotation.x = moving ? -Math.cos(ph) * 0.25 : 0;
        for (const h of a.hinds) h.rotation.x = moving ? Math.max(0, Math.cos(ph)) * -0.9 * (a.state === 'flee' ? 1 : 0.5) : 0;
        a.head.rotation.x = !moving ? Math.sin(a.phase * 3) * 0.05 + 0.1 : 0;
      }
      a.g.position.set(a.x, y, a.z); a.g.rotation.y = a.yaw;
    }
  }
  hit(x, z) {
    for (const a of this.list) { const dx = x - a.x, dz = z - a.z; if (dx * dx + dz * dz < (a.r + 0.4) ** 2) return a; }
    return null;
  }
}
