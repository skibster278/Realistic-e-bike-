import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { merge, tubeGeo, boxGeo, V } from './util.js';

// Specs: power W (peak), vmax km/h, mass kg incl. rider, wb wheelbase m, rr/rf wheel radius
export const BIKES = [
  { id: 'lbx', style: 'surron', name: 'Sur-Ron Light Bee X', cls: 'Electric Dirt Bike', kind: 'moto', power: 6000, vmax: 75, mass: 135, wb: 1.26, rr: 0.34, rf: 0.35, color: '#1d1f22', accent: '#3aa8ff', fork: '#1a1a1a', stanch: '#c9a24a', frame: '#2a2c30', spring: '#d8d8d8', range: 'Light & flickable', tire: 'knobby' },
  { id: 'ultra', style: 'surron', name: 'Sur-Ron Ultra Bee', cls: 'Electric Enduro', kind: 'moto', power: 12500, vmax: 90, mass: 165, wb: 1.36, rr: 0.355, rf: 0.37, color: '#e9e9e6', accent: '#ff5a1f', fork: '#202020', stanch: '#c9a24a', frame: '#3a3c40', spring: '#ff5a1f', range: 'Bigger, stronger', tire: 'knobby' },
  { id: 'talaria', style: 'surron', name: 'Talaria Sting R MX4', cls: 'Electric Dirt Bike', kind: 'moto', power: 8000, vmax: 85, mass: 140, wb: 1.28, rr: 0.345, rf: 0.355, color: '#2b3a2b', accent: '#c8ff3a', fork: '#151515', stanch: '#d8d8d8', frame: '#1c1c1c', spring: '#c8ff3a', range: 'Torquey', tire: 'knobby' },
  { id: 'varg', style: 'mx', name: 'Stark Varg MX', cls: 'Electric Motocross', kind: 'moto', power: 44000, vmax: 130, mass: 198, wb: 1.48, rr: 0.37, rf: 0.385, color: '#f2f2f0', accent: '#e8202a', fork: '#2b2b2b', stanch: '#d4a84a', frame: '#9aa0a6', spring: '#d4a84a', range: '80 hp. Insane.', tire: 'knobby' },
  { id: 'vargsm', style: 'mx', name: 'Stark Varg SM', cls: 'Electric Supermoto', kind: 'moto', power: 44000, vmax: 150, mass: 200, wb: 1.47, rr: 0.315, rf: 0.315, color: '#141414', accent: '#ffcc00', fork: '#2b2b2b', stanch: '#d4a84a', frame: '#3a3c40', spring: '#ffcc00', range: 'Street slicks', tire: 'slick' },
  { id: 'emtb', style: 'mtb', name: 'Trail e-MTB', cls: 'Electric Mountain Bike', kind: 'bicycle', power: 900, vmax: 45, mass: 105, wb: 1.22, rr: 0.37, rf: 0.37, color: '#2f4f6f', accent: '#ffffff', fork: '#d4a84a', stanch: '#d4a84a', frame: '#2f4f6f', spring: '#222', range: 'Pedal assist', tire: 'knobby' },
  { id: 'fat', style: 'fat', name: 'Fat-Tire e-Bike', cls: 'Fat Tire Cruiser', kind: 'bicycle', power: 1500, vmax: 50, mass: 115, wb: 1.2, rr: 0.36, rf: 0.36, color: '#8f2a2a', accent: '#222', fork: '#222', stanch: '#222', frame: '#8f2a2a', spring: '#222', range: 'Goes anywhere', tire: 'fat' },
  { id: 'city', style: 'city', name: 'Urban Commuter', cls: 'City e-Bike', kind: 'bicycle', power: 500, vmax: 32, mass: 100, wb: 1.12, rr: 0.35, rf: 0.35, color: '#d8d4c8', accent: '#2a6a5a', fork: '#888', stanch: '#bbb', frame: '#d8d4c8', spring: '#222', range: 'Lights & fenders', tire: 'street' }
];

let riderAsset = null;
export function setRiderAsset(gltf) { riderAsset = gltf; }

// ---------------------------------------------------------------- materials
const M = {};
function mats(spec) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    plastic: new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.32, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    accent: new THREE.MeshPhysicalMaterial({ color: spec.accent, roughness: 0.35, clearcoat: 0.7 }),
    frame: std({ color: spec.frame, roughness: 0.32, metalness: 0.85 }),
    fork: std({ color: spec.fork, roughness: 0.28, metalness: 0.8 }),
    stanch: std({ color: spec.stanch, roughness: 0.12, metalness: 1 }),
    spring: std({ color: spec.spring, roughness: 0.35, metalness: 0.5 }),
    black: M.black || (M.black = std({ color: 0x121212, roughness: 0.55, metalness: 0.1 })),
    satin: M.satin || (M.satin = std({ color: 0x1c1d1f, roughness: 0.4, metalness: 0.6 })),
    rubber: M.rubber || (M.rubber = std({ color: 0x161616, roughness: 0.92 })),
    alu: M.alu || (M.alu = std({ color: 0xc4c8cc, roughness: 0.28, metalness: 0.95 })),
    chrome: M.chrome || (M.chrome = std({ color: 0xf0f0f0, roughness: 0.06, metalness: 1 })),
    gold: M.gold || (M.gold = std({ color: 0xd4a84a, roughness: 0.25, metalness: 1 })),
    seat: M.seat || (M.seat = std({ color: 0x1a1a1a, roughness: 0.8 })),
    disc: M.disc || (M.disc = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.25, metalness: 1, alphaMap: discAlpha(), alphaTest: 0.5, side: THREE.DoubleSide })),
    light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 2 })
  };
}
function discAlpha() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#fff';
  x.beginPath(); x.arc(128, 128, 126, 0, 6.283); x.arc(128, 128, 84, 0, 6.283, true); x.fill();
  x.fillStyle = '#000';
  for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; x.beginPath(); x.arc(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106, 5, 0, 6.283); x.fill(); }
  x.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) { x.save(); x.translate(128, 128); x.rotate(i / 6 * 6.283); x.fillRect(-7, 30, 14, 60); x.restore(); }
  x.beginPath(); x.arc(128, 128, 34, 0, 6.283); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(128, 128, 18, 0, 6.283); x.fill();
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- geometry helpers
// side profile in (z,y) → extruded along x, centred at xc
function side(build, depth, xc = 0, bevel = 0.006) {
  const s = new THREE.Shape(); build(s);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); g.translate(xc, 0, 0);
  return g;
}
// points: [z,y] line, [cz,cy,z,y] quadratic, [c1z,c1y,c2z,c2y,z,y] bezier
const poly = (pts) => (s) => { s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else if (p.length === 6) s.bezierCurveTo(...p); else s.lineTo(p[0], p[1]); } s.closePath(); };
class Helix extends THREE.Curve {
  constructor(a, b, r, turns) { super(); this.a = a; this.r = r; this.turns = turns; const d = b.clone().sub(a); this.len = d.length(); this.q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()); }
  getPoint(t, o = new THREE.Vector3()) { const ang = t * this.turns * Math.PI * 2; return o.set(Math.cos(ang) * this.r, t * this.len, Math.sin(ang) * this.r).applyQuaternion(this.q).add(this.a); }
}
const spring = (a, b, r, turns, wire) => new THREE.TubeGeometry(new Helix(a, b, r, turns), turns * 14, wire, 6, false);

function tire(R, tw, th, type) {
  const prof = [[R - th, -0.4 * tw], [R - th * 0.6, -0.5 * tw], [R - th * 0.2, -0.48 * tw], [R - th * 0.02, -0.34 * tw], [R, 0], [R - th * 0.02, 0.34 * tw], [R - th * 0.2, 0.48 * tw], [R - th * 0.6, 0.5 * tw], [R - th, 0.4 * tw]];
  const curve = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)));
  const parts = [new THREE.LatheGeometry(curve.getPoints(14), 64).rotateZ(-Math.PI / 2)];
  if (type === 'knobby' || type === 'fat') {
    const n = type === 'fat' ? 36 : 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const lat of (i % 2 ? [-0.3, 0.3] : [-0.42, 0, 0.42])) {
        const k = new THREE.BoxGeometry(tw * (lat === 0 ? 0.24 : 0.17), th * 0.22, tw * 0.2);
        k.translate(lat * tw, R + th * 0.03 - Math.abs(lat) * th * 0.28, 0);
        k.rotateX(a); parts.push(k);
      }
    }
  }
  return merge(parts);
}
function rimGeo(R, w) {
  const pts = [[R - 0.028, -w / 2], [R, -w / 2 - 0.004], [R + 0.004, -w / 2 + 0.006], [R - 0.004, 0], [R + 0.004, w / 2 - 0.006], [R, w / 2 + 0.004], [R - 0.028, w / 2], [R - 0.03, 0], [R - 0.028, -w / 2]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48).rotateZ(-Math.PI / 2);
}
function wheel(R, tw, th, m, spec, front) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(tire(R, tw, th, spec.tire), m.rubber));
  const rimR = R - th + 0.004, moto = spec.kind === 'moto';
  g.add(new THREE.Mesh(rimGeo(rimR, tw * 0.72), spec.style === 'mx' ? m.gold : moto ? m.satin : m.black));
  const hubW = moto ? 0.09 : 0.06, hubR = moto ? 0.055 : 0.03;
  const sp = [new THREE.CylinderGeometry(hubR, hubR, hubW * 1.6, 16).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(hubR * 1.5, hubR * 1.5, 0.008, 16).rotateZ(Math.PI / 2).translate(hubW * 0.75, 0, 0), new THREE.CylinderGeometry(hubR * 1.5, hubR * 1.5, 0.008, 16).rotateZ(Math.PI / 2).translate(-hubW * 0.75, 0, 0)];
  for (let i = 0; i < 36; i++) {
    const sd = i % 2 ? 1 : -1, a = (i / 36) * Math.PI * 2, a2 = a + (sd * 3 * Math.PI * 2) / 36;
    sp.push(tubeGeo(V(sd * hubW * 0.75, Math.cos(a) * hubR * 1.4, Math.sin(a) * hubR * 1.4), V(sd * 0.006, Math.cos(a2) * (rimR - 0.025), Math.sin(a2) * (rimR - 0.025)), moto ? 0.0025 : 0.0017, moto ? 0.0025 : 0.0017, 4));
  }
  g.add(new THREE.Mesh(merge(sp), moto ? m.alu : m.black));
  const dr = moto ? (front ? 0.135 : 0.11) : 0.09, dx = hubW * 0.9 + 0.01;
  g.add(new THREE.Mesh(new THREE.CircleGeometry(dr, 48).rotateY(Math.PI / 2).translate(dx, 0, 0), m.disc));
  if (!front && moto) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.006, 42).rotateZ(Math.PI / 2).translate(-dx - 0.002, 0, 0), m.satin));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.discR = dr; g.userData.discX = dx;
  return g;
}

// ---------------------------------------------------------------- builder
// origin = rear tyre contact point, +Z forward, +X = rider's left
export function buildBike(spec) {
  const m = mats(spec);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const add = (geo, mat, parent = body) => { const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
  const { wb, rr, rf } = spec;
  const moto = spec.kind === 'moto', mx = spec.style === 'mx';
  const tw = spec.tire === 'fat' ? 0.11 : moto ? (spec.tire === 'slick' ? 0.15 : 0.105) : 0.062;
  const twF = spec.tire === 'slick' ? 0.12 : moto ? 0.085 : tw;
  const th = moto ? (spec.tire === 'slick' ? 0.09 : 0.1) : spec.tire === 'fat' ? 0.1 : 0.055;
  const rear = wheel(rr, tw, th, m, spec, false); rear.position.set(0, rr, 0); root.add(rear);
  const front = wheel(rf, twF, moto ? th * 0.92 : th, m, spec, true);
  const out = { root, rear, front, spec, mats: m, wb };
  let headTop, rake, pegL, pegR, seat;

  if (moto) {
    const k = wb / 1.3;
    rake = mx ? 0.47 : 0.44;
    const hy = (mx ? 1.1 : 1.0) * Math.min(1.08, k);
    const hz = wb - (hy - rf) * Math.tan(rake) - 0.03;
    headTop = V(0, hy, hz);
    const pivot = V(0, 0.46 * k, 0.55 * k);
    const seatY = (mx ? 0.98 : 0.9) * Math.min(1.08, k);
    // frame spars
    for (const sx of [-1, 1]) {
      add(side(poly([[hz + 0.02, hy + 0.01], [hz - 0.14, hy + 0.03], [hz - 0.32, hy - 0.06, pivot.z + 0.1, pivot.y + 0.28], [pivot.z - 0.02, pivot.y + 0.1], [pivot.z - 0.05, pivot.y - 0.04], [pivot.z + 0.06, pivot.y - 0.08], [pivot.z + 0.12, pivot.y + 0.12, hz - 0.08, hy - 0.22], [hz + 0.03, hy - 0.16]]), 0.032, sx * 0.085, 0.006), m.frame);
      add(tubeGeo(V(sx * 0.08, pivot.y + 0.3, pivot.z + 0.02), V(sx * 0.07, seatY - 0.04, -0.25 * k), 0.012), m.frame);
      add(tubeGeo(V(sx * 0.08, pivot.y + 0.04, pivot.z - 0.02), V(sx * 0.07, seatY - 0.06, -0.15 * k), 0.011), m.frame);
    }
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 14).rotateX(-rake).translate(0, hy - 0.08, hz + 0.015), m.frame);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10).rotateZ(Math.PI / 2).translate(0, pivot.y, pivot.z), m.alu);
    // battery + motor
    const batTop = hy - 0.1, batBot = pivot.y - 0.02;
    add(side(poly([[hz - 0.08, batTop], [pivot.z + 0.1, batTop - 0.02], [pivot.z + 0.02, batBot + 0.08], [pivot.z + 0.12, batBot - 0.04], [hz - 0.12, batBot], [hz - 0.02, batTop - 0.2]]), 0.15, 0, 0.012), m.black);
    for (let i = 0; i < 5; i++) add(boxGeo(0.154, 0.008, 0.16, 0, batBot + 0.06 + i * 0.045, (hz + pivot.z) / 2 - 0.02), m.satin);
    const motorP = V(0, pivot.y - 0.02, pivot.z + 0.1);
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.13, 24).rotateZ(Math.PI / 2).translate(0, motorP.y, motorP.z), m.satin);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.135, 6).rotateZ(Math.PI / 2).translate(0, motorP.y, motorP.z), m.alu);
    // chain (right side, -x)
    const cx = -0.103, rs = 0.105, fs = 0.04, pts = [];
    for (let i = 0; i <= 20; i++) { const a = Math.PI / 2 + (i / 20) * Math.PI; pts.push(V(cx, rr + Math.sin(a) * rs, Math.cos(a) * rs)); }
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; pts.push(V(cx, motorP.y + Math.sin(a) * fs, motorP.z + Math.cos(a) * fs)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.007, 5, true), m.satin);
    add(new THREE.CylinderGeometry(fs, fs, 0.01, 18).rotateZ(Math.PI / 2).translate(cx, motorP.y, motorP.z), m.alu);
    // swingarm
    for (const sx of [-1, 1]) add(side(poly([[0.05, rr + 0.03], [pivot.z, pivot.y + 0.05], [pivot.z, pivot.y - 0.05], [0.05, rr - 0.035], [-0.04, rr - 0.025], [-0.04, rr + 0.025]]), 0.035, sx * 0.095, 0.006), m.alu);
    add(boxGeo(0.17, 0.04, 0.06, 0, pivot.y - 0.02, pivot.z - 0.12), m.alu);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8).rotateZ(Math.PI / 2).translate(0, rr, 0), m.alu);
    // shock
    const sTop = V(0, hy - 0.08, pivot.z + 0.02), sBot = V(0, pivot.y - 0.04, pivot.z - 0.22);
    add(tubeGeo(sBot, sTop, 0.024, 0.024, 14), m.satin);
    add(tubeGeo(sBot.clone().lerp(sTop, 0.15), sBot.clone().lerp(sTop, 0.55), 0.03, 0.03, 14), m.gold);
    add(spring(sBot.clone().lerp(sTop, 0.2), sBot.clone().lerp(sTop, 0.92), 0.04, 8, 0.006), m.spring);
    // plastics
    const big = mx ? 1.08 : 1;
    seat = V(0, seatY, mx ? 0.45 : 0.4);
    for (const sx of [-1, 1]) {
      add(side(poly([[hz - 0.06, batTop + 0.03], [hz - 0.25, batTop + 0.06, pivot.z + 0.16, seatY - 0.04], [pivot.z - 0.08, seatY - 0.06], [pivot.z - 0.06, seatY - 0.2, pivot.z + 0.02, pivot.y + 0.12], [pivot.z + 0.25, pivot.y + 0.18], [hz - 0.2, batBot + 0.2, hz - 0.08, batTop - 0.1]]), 0.016, sx * (0.105 * big), 0.006), m.plastic);
      add(side(poly([[hz - 0.16, batTop - 0.02], [pivot.z + 0.08, seatY - 0.1], [pivot.z + 0.06, seatY - 0.14], [hz - 0.18, batTop - 0.07]]), 0.004, sx * (0.105 * big + 0.012), 0), m.accent);
      add(side(poly([[pivot.z - 0.1, seatY - 0.05], [-0.28 * k, seatY + 0.04], [-0.3 * k, seatY - 0.06], [0.0, seatY - 0.22], [pivot.z - 0.14, seatY - 0.22]]), 0.012, sx * 0.1, 0.005), mx ? m.plastic : m.black);
      if (mx) {
        const shm = add(side(poly([[hz + 0.02, hy - 0.02], [hz - 0.1, hy + 0.06, pivot.z + 0.3, seatY + 0.02], [pivot.z + 0.15, seatY - 0.02], [pivot.z + 0.2, batTop - 0.1], [hz - 0.02, batTop - 0.12, hz + 0.05, hy - 0.12]]), 0.012, 0, 0.005), m.plastic);
        shm.position.x = sx * 0.13; shm.rotation.z = sx * -0.12;
        const st = add(side(poly([[hz - 0.02, hy - 0.04], [pivot.z + 0.25, seatY - 0.03], [pivot.z + 0.27, seatY - 0.07], [hz - 0.04, hy - 0.09]]), 0.004, 0, 0), m.accent);
        st.position.x = sx * 0.142; st.rotation.z = sx * -0.12;
      }
    }
    add(side(poly([[hz - 0.04, hy - 0.02], [hz - 0.15, hy + 0.05, pivot.z + 0.28, seatY + 0.01], [pivot.z + 0.25, seatY - 0.05], [hz - 0.06, hy - 0.12]]), 0.2 * big, 0, 0.03), mx ? m.plastic : m.black);
    add(side(poly([[pivot.z + 0.3, seatY + 0.02], [pivot.z + 0.1, seatY + 0.065, pivot.z - 0.05, seatY + 0.07], [-0.24 * k, seatY + 0.09], [-0.3 * k, seatY + 0.07], [-0.28 * k, seatY - 0.02], [pivot.z + 0.25, seatY - 0.05]]), 0.23, 0, 0.035), m.seat);
    add(side(poly([[0.06, seatY - 0.02], [-0.3 * k, seatY + 0.05], [-0.6 * k, seatY + 0.15], [-0.62 * k, seatY + 0.13], [-0.32 * k, seatY + 0.0], [0.04, seatY - 0.07]]), 0.2, 0, 0.012), m.plastic);
    add(boxGeo(0.12, 0.025, 0.02, 0, seatY + 0.09, -0.55 * k, -0.3, 0, 0), m.tail);
    pegL = V(0.19, pivot.y - 0.06, pivot.z + 0.02); pegR = V(-0.19, pivot.y - 0.06, pivot.z + 0.02);
    for (const p of [pegL, pegR]) { add(boxGeo(0.11, 0.022, 0.055, p.x, p.y, p.z), m.alu); for (let i = 0; i < 4; i++) add(boxGeo(0.008, 0.012, 0.055, p.x - 0.04 + i * 0.027, p.y + 0.012, p.z), m.satin); }
    add(tubeGeo(V(0.12, pivot.y - 0.04, pivot.z - 0.02), V(0.15, pivot.y + 0.02, pivot.z - 0.38), 0.012), m.satin); // kickstand (tucked)
    add(boxGeo(0.03, 0.06, 0.05, rear.userData.discX + 0.015, rr + 0.085, -0.05), mx ? m.gold : m.black);
  } else {
    rake = 0.36;
    const hy = spec.style === 'city' ? 1.0 : 0.98;
    const hz = wb - (hy - rf) * Math.tan(rake) - 0.02;
    headTop = V(0, hy, hz);
    const bb = V(0, 0.32, 0.45), seatTop = V(0, 0.86, 0.26), headBot = V(0, hy - 0.17, hz + 0.06);
    const tub = (a, b, r, r2 = r) => add(tubeGeo(a, b, r, r2, 14), m.frame);
    if (spec.style === 'city') { tub(bb, V(0, 0.5, hz - 0.08), 0.03); tub(V(0, 0.5, hz - 0.08), headBot, 0.028); }
    else tub(V(0, hy - 0.06, hz - 0.01), seatTop, 0.026, 0.02);
    tub(bb, seatTop, 0.024);
    add(tubeGeo(bb, headBot, 0.05, 0.042, 18), m.frame);
    add(tubeGeo(bb.clone().lerp(headBot, 0.15), bb.clone().lerp(headBot, 0.85), 0.044, 0.038, 14).translate(0, -0.012, 0.01), m.black);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14).rotateX(-rake).translate(0, hy - 0.09, hz + 0.03), m.frame);
    for (const sx of [-1, 1]) {
      add(tubeGeo(V(sx * 0.065, rr, 0), V(sx * 0.03, bb.y, bb.z - 0.05), 0.012, 0.014), m.frame);
      add(tubeGeo(V(sx * 0.065, rr, 0), V(sx * 0.02, seatTop.y - 0.04, seatTop.z + 0.02), 0.011, 0.013), m.frame);
    }
    if (spec.style === 'mtb') { add(tubeGeo(V(0, 0.62, 0.38), V(0, 0.48, 0.14), 0.018), m.satin); add(spring(V(0, 0.6, 0.35), V(0, 0.5, 0.17), 0.026, 7, 0.004), m.gold); }
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.11, 20).rotateZ(Math.PI / 2).translate(0, bb.y, bb.z), m.black);
    const crank = new THREE.Group(); crank.position.copy(bb); body.add(crank); out.crank = crank;
    add(new THREE.CylinderGeometry(0.095, 0.095, 0.006, 32).rotateZ(Math.PI / 2).translate(-0.075, 0, 0), m.alu, crank);
    add(boxGeo(0.02, 0.17, 0.03, -0.09, -0.08, 0), m.satin, crank); add(boxGeo(0.02, 0.17, 0.03, 0.09, 0.08, 0), m.satin, crank);
    add(boxGeo(0.1, 0.02, 0.08, -0.14, -0.17, 0), m.black, crank); add(boxGeo(0.1, 0.02, 0.08, 0.14, 0.17, 0), m.black, crank);
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 + (i / 16) * Math.PI; pts.push(V(-0.075, rr + Math.sin(a) * 0.05, Math.cos(a) * 0.05)); }
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; pts.push(V(-0.075, bb.y + Math.sin(a) * 0.095, bb.z + Math.cos(a) * 0.095)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.004, 4, true), m.satin);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20).rotateZ(Math.PI / 2).translate(-0.065, rr, 0), m.alu);
    seat = V(0, seatTop.y + 0.2, seatTop.z - 0.06);
    add(tubeGeo(seatTop, V(0, seat.y - 0.03, seat.z + 0.01), 0.016), m.black);
    add(side(poly([[seat.z + 0.14, seat.y + 0.005], [seat.z + 0.05, seat.y + 0.02], [seat.z - 0.12, seat.y + 0.035], [seat.z - 0.14, seat.y], [seat.z + 0.12, seat.y - 0.02]]), 0.15, 0, 0.02), m.seat);
    pegL = V(0.16, bb.y - 0.17, bb.z); pegR = V(-0.16, bb.y + 0.17, bb.z);
    if (spec.style === 'city') {
      add(boxGeo(0.15, 0.012, 0.38, 0, rr + 0.13, -0.06), m.satin);
      for (const sx of [-1, 1]) add(tubeGeo(V(sx * 0.07, rr + 0.13, 0.1), V(sx * 0.06, rr, 0), 0.008), m.satin);
      add(new THREE.TorusGeometry(rr + 0.035, 0.03, 6, 32, 2.1).rotateY(Math.PI / 2).rotateX(-0.25).scale(1.3, 1, 1).translate(0, rr, 0), m.black);
      add(boxGeo(0.06, 0.03, 0.03, 0, rr + 0.15, -0.26), m.tail);
    }
    add(boxGeo(0.03, 0.05, 0.04, rear.userData.discX + 0.012, rr + 0.07, -0.05), m.black);
  }

  // ---------------- steering assembly
  const steerAxis = new THREE.Group(); steerAxis.position.copy(headTop); steerAxis.rotation.x = -rake; body.add(steerAxis);
  const steer = new THREE.Group(); steerAxis.add(steer);
  const axle = V(0, rf, wb).sub(headTop).applyAxisAngle(V(1, 0, 0), rake);
  const forkLen = -axle.y, offZ = axle.z;
  front.position.copy(axle); steer.add(front);
  const fx = moto ? 0.095 : 0.06;
  if (moto) {
    for (const sx of [-1, 1]) {
      add(tubeGeo(V(sx * fx, 0.06, offZ), V(sx * fx, -forkLen * 0.52, offZ), 0.03, 0.03, 16), m.fork, steer);
      add(tubeGeo(V(sx * fx, -forkLen * 0.48, offZ), V(sx * fx, -forkLen + 0.05, offZ), 0.024, 0.024, 16), m.stanch, steer);
      add(boxGeo(0.045, 0.09, 0.06, sx * fx, -forkLen + 0.02, offZ), m.fork, steer);
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.015, 16).translate(sx * fx, 0.07, offZ), m.gold, steer);
      const fg = add(side(poly([[0.03, 0], [0.045, forkLen * 0.33], [0.015, forkLen * 0.35], [0.0, 0.02]]), 0.05, 0, 0.006), mx ? m.plastic : m.black, steer);
      fg.position.set(sx * fx, -forkLen * 0.95, offZ);
    }
    add(boxGeo(0.045, 0.06, 0.035, rf > 0 ? fx + 0.03 : 0, -forkLen + 0.12, offZ - 0.06), mx ? m.gold : m.black, steer); // front caliper (left)
    for (const [y, t] of [[0.0, 0.035], [-0.17, 0.045]]) {
      const s = new THREE.Shape(); s.moveTo(-fx - 0.04, offZ - 0.035); s.lineTo(fx + 0.04, offZ - 0.035); s.quadraticCurveTo(fx + 0.065, offZ, fx + 0.04, offZ + 0.035); s.lineTo(-fx - 0.04, offZ + 0.035); s.quadraticCurveTo(-fx - 0.065, offZ, -fx - 0.04, offZ - 0.035);
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
      g.rotateX(Math.PI / 2); g.translate(0, y + t / 2, 0);
      add(g, mx ? m.gold : m.satin, steer);
    }
    // front fender (arc shell)
    const fR = rf + (mx ? 0.14 : 0.07), fy = mx ? 0.02 : 0;
    const fend = (s) => {
      const N = 16, a0 = Math.PI * 0.66, a1 = -Math.PI * 0.2;
      const P = (a, r) => [offZ + Math.cos(a) * r, -forkLen + Math.sin(a) * r * 0.82 + fy];
      const p0 = P(a0, fR); s.moveTo(p0[0], p0[1]);
      for (let i = 1; i <= N; i++) { const p = P(a0 + (a1 - a0) * i / N, fR); s.lineTo(p[0], p[1]); }
      for (let i = N; i >= 0; i--) { const p = P(a0 + (a1 - a0) * i / N, fR - 0.012); s.lineTo(p[0], p[1]); }
    };
    add(side(fend, 0.17, 0, 0.012), m.plastic, steer);
    add(side(poly([[offZ + 0.15, 0.08], [offZ + 0.2, -0.04, offZ + 0.17, -0.22], [offZ + 0.12, -0.3], [offZ + 0.1, -0.28], [offZ + 0.12, -0.05]]), 0.26, 0, 0.012), m.plastic, steer);
    add(new THREE.CylinderGeometry(0.06, 0.065, 0.03, 24).rotateX(Math.PI / 2 - 0.2).translate(0, -0.12, offZ + 0.19), m.light, steer);
    add(new THREE.TorusGeometry(0.066, 0.008, 6, 24).rotateX(-0.2).translate(0, -0.12, offZ + 0.2), m.black, steer);
  } else {
    for (const sx of [-1, 1]) {
      add(tubeGeo(V(sx * fx, -0.15, offZ), V(sx * fx, -forkLen * 0.55, offZ), 0.019, 0.019, 12), m.stanch, steer);
      add(tubeGeo(V(sx * fx, -forkLen * 0.5, offZ), V(sx * fx, -forkLen, offZ), 0.024, 0.02, 12), spec.style === 'mtb' ? m.black : m.fork, steer);
    }
    add(boxGeo(fx * 2 + 0.05, 0.045, 0.06, 0, -0.16, offZ), spec.style === 'mtb' ? m.black : m.fork, steer);
    add(tubeGeo(V(0, -0.15, 0), V(0, 0.04, 0), 0.018), m.satin, steer);
    add(boxGeo(0.06, 0.04, 0.05, 0, -0.06, 0.08), m.black, steer);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 16).rotateX(Math.PI / 2).translate(0, -0.06, 0.106), m.light, steer);
    if (spec.style === 'city') { const fg = new THREE.TorusGeometry(rf + 0.03, 0.03, 6, 28, 1.9).rotateY(Math.PI / 2).rotateX(0.7).scale(1.3, 1, 1); fg.translate(0, axle.y, axle.z); add(fg, m.black, steer); }
  }
  // handlebar
  const barW = moto ? 0.4 : spec.style === 'city' ? 0.3 : 0.38;
  const barY = moto ? 0.15 : 0.08, barZ = spec.style === 'city' ? -0.16 : moto ? -0.04 : -0.02;
  if (moto) for (const sx of [-1, 1]) add(tubeGeo(V(sx * 0.04, 0.035, 0), V(sx * 0.04, barY - 0.01, barZ + 0.01), 0.018), m.gold, steer);
  const barPts = [V(-barW, barY + 0.03, barZ - 0.035), V(-barW * 0.55, barY + 0.025, barZ - 0.01), V(0, barY, barZ + 0.005), V(barW * 0.55, barY + 0.025, barZ - 0.01), V(barW, barY + 0.03, barZ - 0.035)];
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 40, moto ? 0.013 : 0.011, 10), mx ? m.gold : m.satin, steer);
  if (moto) {
    add(boxGeo(0.1, 0.035, 0.03, 0, barY + 0.006, barZ - 0.0), m.satin, steer);
    if (mx) add(new THREE.CapsuleGeometry(0.022, 0.16, 4, 10).rotateZ(Math.PI / 2).translate(0, barY + 0.05, barZ - 0.01), m.accent, steer);
  }
  const gripL = V(barW - 0.06, barY + 0.029, barZ - 0.03), gripR = V(-(barW - 0.06), barY + 0.029, barZ - 0.03);
  for (const [sx, g] of [[1, gripL], [-1, gripR]]) {
    const dir = V(sx, 0.05, -0.2).normalize();
    add(tubeGeo(g.clone().addScaledVector(dir, -0.065), g.clone().addScaledVector(dir, 0.06), 0.017, 0.017, 12), m.rubber, steer);
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 14).rotateZ(Math.PI / 2).translate(g.x - sx * 0.065, g.y, g.z + 0.012), m.rubber, steer);
    const per = V(g.x - sx * 0.1, g.y + 0.012, g.z + 0.01);
    add(boxGeo(0.035, 0.03, 0.04, per.x, per.y, per.z), m.satin, steer);
    add(boxGeo(0.04, 0.025, 0.035, per.x - sx * 0.01, per.y + 0.035, per.z - 0.01), m.satin, steer);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([per.clone().add(V(0, 0, 0.02)), per.clone().add(V(sx * 0.07, -0.005, 0.07)), per.clone().add(V(sx * 0.15, -0.012, 0.055))]), 12, 0.0055, 5), m.alu, steer);
    if (mx) {
      const hg = add(side(poly([[0.0, 0.0], [0.06, 0.05, 0.12, 0.0], [0.13, -0.03], [0.02, -0.05]]), 0.012, 0, 0.004), m.plastic, steer);
      hg.position.set(g.x + sx * 0.01, g.y - 0.01, g.z + 0.03); hg.rotation.y = sx * 0.5;
    }
  }
  add(boxGeo(0.045, 0.045, 0.04, gripR.x + 0.075, gripR.y, gripR.z + 0.005), m.satin, steer);
  // dash
  const dc = document.createElement('canvas'); dc.width = 256; dc.height = 128;
  const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace;
  const dw = mx ? 0.13 : 0.085, dh = dw * 0.55;
  const dash = add(new THREE.PlaneGeometry(dw, dh), new THREE.MeshBasicMaterial({ map: dt, toneMapped: false }), steer);
  dash.position.set(0, barY + 0.065, barZ + 0.012); dash.rotation.set(0.95, Math.PI, 0);
  const bez = add(new THREE.BoxGeometry(dw + 0.012, dh + 0.012, 0.012), m.black, steer); bez.position.set(0, barY + 0.06, barZ + 0.02); bez.rotation.x = 0.95;
  out.dash = { canvas: dc, tex: dt };
  const spot = new THREE.SpotLight(0xfff2dd, 0, 140, 0.42, 0.5, 1.2);
  spot.position.set(0, -0.1, offZ + 0.25); steer.add(spot);
  const tgt = new THREE.Object3D(); tgt.position.copy(V(0, -1.6, 20).applyAxisAngle(V(1, 0, 0), rake)); steer.add(tgt); spot.target = tgt;
  out.headlight = spot; out.steer = steer; out.steerAxis = steerAxis; out.seat = seat;
  const gL = new THREE.Object3D(); gL.position.copy(gripL); steer.add(gL);
  const gR = new THREE.Object3D(); gR.position.copy(gripR); steer.add(gR);
  out.gripObjs = [gL, gR];
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  out.rider = buildRider(out, spec, pegL, pegR, seat);
  return out;
}

// ---------------------------------------------------------------- rider (rigged human, posed with IK)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function aimBone(bone, child, target) {
  bone.updateWorldMatrix(true, false); child.updateWorldMatrix(false, false);
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  const from = _b.sub(_a).normalize(), to = _t.copy(target).sub(_a).normalize();
  _q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(_q2); _q.multiply(_q2);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_q));
  bone.updateWorldMatrix(false, true);
}
function twoBoneIK(upper, lower, end, target, pole) {
  upper.updateWorldMatrix(true, true);
  const a = upper.getWorldPosition(new THREE.Vector3()), b = lower.getWorldPosition(new THREE.Vector3()), c = end.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const d = Math.min(target.distanceTo(a), (l1 + l2) * 0.999);
  const dir = target.clone().sub(a).normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const pl = pole.clone().sub(a); pl.addScaledVector(dir, -pl.dot(dir)).normalize();
  const elbow = a.clone().addScaledVector(dir, Math.cos(ang) * l1).addScaledVector(pl, Math.sin(ang) * l1);
  aimBone(upper, lower, elbow);
  aimBone(lower, end, a.clone().addScaledVector(dir, d));
}
let riderMat = null;
function riderMaterial(src) {
  if (riderMat) return riderMat;
  riderMat = src.clone();
  // turn the desert camo into dark riding gear (keeps all the fabric/strap detail)
  riderMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      vec3 gear = mix(vec3(0.012, 0.013, 0.015), vec3(0.07, 0.075, 0.085), smoothstep(0.05, 0.5, lum));
      diffuseColor.rgb = gear;`);
  };
  riderMat.roughness = 0.75;
  return riderMat;
}
function buildRider(bike, spec, pegL, pegR, seat) {
  const body = bike.root.children[0];
  const holder = new THREE.Group(); body.add(holder);
  const res = { group: holder, setFP: () => {}, update: () => {} };
  bike.headLocal = V(0, seat.y + 0.72, seat.z + 0.32);
  if (!riderAsset) return res;
  const model = SkeletonUtils.clone(riderAsset.scene);
  holder.add(model);
  holder.rotation.y = Math.PI; // the Mixamo character faces -Z
  const bones = {}; let visor = null;
  model.traverse((o) => {
    if (o.isBone) bones[o.name.replace('mixamorig', '').replace(':', '')] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      if (/visor/i.test(o.name)) visor = o;
      else o.material = riderMaterial(o.material);
    }
  });
  const moto = spec.kind === 'moto';
  bike.root.updateWorldMatrix(true, true);
  const hipTarget = V(0, seat.y + 0.1, seat.z + (moto ? -0.04 : -0.05));
  const hpL = body.worldToLocal(bones.Hips.getWorldPosition(new THREE.Vector3()));
  const delta = hipTarget.sub(hpL); // body space; holder is rotated PI about Y
  model.position.add(V(-delta.x, delta.y, -delta.z).divideScalar(1));
  model.updateWorldMatrix(true, true);
  // fix: model.position is in holder space with model scale; use world-space correction loop
  for (let i = 0; i < 3; i++) {
    bike.root.updateWorldMatrix(true, true);
    const cur = body.worldToLocal(bones.Hips.getWorldPosition(new THREE.Vector3()));
    const err = V(0, seat.y + 0.1, seat.z + (moto ? -0.04 : -0.05)).sub(cur);
    model.position.x -= err.x; model.position.y += err.y; model.position.z -= err.z;
  }
  // forward lean: Mixamo spine bends forward with +X rotation
  const lean = moto ? 0.45 : 0.55;
  for (const [n, f] of [['Spine', 0.35], ['Spine1', 0.35], ['Spine2', 0.3]]) if (bones[n]) bones[n].rotateX(lean * f);
  if (bones.Neck) bones.Neck.rotateX(-lean * 0.45);
  if (bones.Head) bones.Head.rotateX(-lean * 0.35);
  for (const sd of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) { const b = bones[`${sd}Hand${f}${i}`]; if (b) b.rotateX(0.9); }
  const toWorld = (v) => body.localToWorld(v.clone());
  bike.root.updateWorldMatrix(true, true);
  twoBoneIK(bones.LeftUpLeg, bones.LeftLeg, bones.LeftFoot, toWorld(pegL.clone().add(V(0, 0.07, -0.02))), toWorld(V(0.45, seat.y, seat.z + 1.2)));
  twoBoneIK(bones.RightUpLeg, bones.RightLeg, bones.RightFoot, toWorld(pegR.clone().add(V(0, 0.07, -0.02))), toWorld(V(-0.45, seat.y, seat.z + 1.2)));
  const doIK = () => {
    bike.root.updateWorldMatrix(true, true);
    const gl = bike.gripObjs[0].getWorldPosition(new THREE.Vector3()), gr = bike.gripObjs[1].getWorldPosition(new THREE.Vector3());
    twoBoneIK(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, gl, toWorld(V(0.7, seat.y + 0.05, seat.z - 0.1)));
    twoBoneIK(bones.RightArm, bones.RightForeArm, bones.RightHand, gr, toWorld(V(-0.7, seat.y + 0.05, seat.z - 0.1)));
  };
  doIK();
  bike.root.updateWorldMatrix(true, true);
  bike.headLocal = body.worldToLocal(bones.Head.getWorldPosition(new THREE.Vector3())).add(V(0, 0.09, 0.1));
  res.setFP = (fp) => { if (visor) visor.visible = !fp; };
  res.update = doIK;
  res.bones = bones;
  return res;
}
