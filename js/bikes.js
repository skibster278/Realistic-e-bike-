import * as THREE from 'three';
import { merge, tubeGeo, boxGeo, V } from './util.js';

// Specs: power W (peak), vmax km/h, mass kg incl. rider, wb wheelbase m, rr/rf wheel radius
export const BIKES = [
  { id: 'lbx', name: 'Sur-Ron Light Bee X', cls: 'Electric Dirt Bike', kind: 'moto', power: 6000, vmax: 75, mass: 135, wb: 1.26, rr: 0.34, rf: 0.35, color: '#1c1c1e', accent: '#4fb8ff', fork: '#1a1a1a', range: 'Light & flickable', tire: 'knobby' },
  { id: 'ultra', name: 'Sur-Ron Ultra Bee', cls: 'Electric Enduro', kind: 'moto', power: 12500, vmax: 90, mass: 165, wb: 1.33, rr: 0.35, rf: 0.36, color: '#e8e8e8', accent: '#ff5a1f', fork: '#c9a24a', range: 'Bigger, stronger', tire: 'knobby' },
  { id: 'talaria', name: 'Talaria Sting R MX4', cls: 'Electric Dirt Bike', kind: 'moto', power: 8000, vmax: 85, mass: 140, wb: 1.27, rr: 0.34, rf: 0.35, color: '#2a3a2a', accent: '#c8ff3a', fork: '#111', range: 'Torquey', tire: 'knobby' },
  { id: 'varg', name: 'Stark Varg MX', cls: 'Electric Motocross', kind: 'moto', power: 44000, vmax: 130, mass: 198, wb: 1.48, rr: 0.37, rf: 0.38, color: '#f0f0f0', accent: '#ff2a2a', fork: '#d4a84a', range: '80 hp. Insane.', tire: 'knobby' },
  { id: 'vargsm', name: 'Stark Varg SM', cls: 'Electric Supermoto', kind: 'moto', power: 44000, vmax: 150, mass: 200, wb: 1.47, rr: 0.32, rf: 0.32, color: '#141414', accent: '#ffcc00', fork: '#d4a84a', range: 'Street slicks', tire: 'slick' },
  { id: 'emtb', name: 'Trail e-MTB', cls: 'Electric Mountain Bike', kind: 'bicycle', power: 900, vmax: 45, mass: 105, wb: 1.22, rr: 0.37, rf: 0.37, color: '#3a5a7a', accent: '#ffffff', fork: '#d4a84a', range: 'Pedal assist', tire: 'knobby' },
  { id: 'fat', name: 'Fat-Tire e-Bike', cls: 'Fat Tire Cruiser', kind: 'bicycle', power: 1500, vmax: 50, mass: 115, wb: 1.2, rr: 0.36, rf: 0.36, color: '#a83232', accent: '#222', fork: '#222', range: 'Goes anywhere', tire: 'fat' },
  { id: 'city', name: 'Urban Commuter', cls: 'City e-Bike', kind: 'bicycle', power: 500, vmax: 32, mass: 100, wb: 1.12, rr: 0.35, rf: 0.35, color: '#d8d4c8', accent: '#2a6a5a', fork: '#888', range: 'Lights & fenders', tire: 'street' }
];

const MAT = {};
function mats(spec) {
  const plastic = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.35, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const accent = new THREE.MeshPhysicalMaterial({ color: spec.accent, roughness: 0.35, clearcoat: 0.6 });
  return {
    plastic, accent,
    black: MAT.black || (MAT.black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 })),
    rubber: MAT.rubber || (MAT.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 })),
    alu: MAT.alu || (MAT.alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 })),
    darkAlu: MAT.dalu || (MAT.dalu = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.35, metalness: 0.85 })),
    fork: new THREE.MeshStandardMaterial({ color: spec.fork, roughness: 0.25, metalness: 0.9 }),
    chrome: MAT.chrome || (MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.1, metalness: 1 })),
    seat: MAT.seat || (MAT.seat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.75 })),
    light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 2 }),
    spring: new THREE.MeshStandardMaterial({ color: spec.kind === 'moto' ? 0xd23a1a : 0x222222, roughness: 0.4, metalness: 0.6 })
  };
}

function wheel(r, tw, m, type, spokes = true) {
  const g = new THREE.Group();
  const tire = [new THREE.TorusGeometry(r - tw * 0.5, tw * 0.5, 10, 48)];
  if (type === 'knobby' || type === 'fat') {
    const n = type === 'fat' ? 40 : 56;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const k = boxGeo(tw * 0.32, tw * 0.22, tw * 0.25, s * tw * (i % 2 ? 0.18 : 0.28), 0, 0);
        k.translate(0, r - tw * 0.04, 0); k.applyMatrix4(new THREE.Matrix4().makeRotationX(a));
        tire.push(k);
      }
    }
  }
  const tg = merge(tire.map((t, i) => (i === 0 ? t.rotateY(Math.PI / 2) : t)));
  g.add(new THREE.Mesh(tg, m.rubber));
  const rimG = new THREE.TorusGeometry(r - tw * 0.95, tw * 0.12, 6, 40).rotateY(Math.PI / 2);
  g.add(new THREE.Mesh(rimG, m.darkAlu));
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12).rotateZ(Math.PI / 2);
  const sp = [hub];
  if (spokes) for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, side = i % 2 ? 0.05 : -0.05;
    sp.push(tubeGeo(V(side, Math.cos(a + 0.2) * 0.05, Math.sin(a + 0.2) * 0.05), V(0, Math.cos(a) * (r - tw), Math.sin(a) * (r - tw)), 0.004, 0.004, 3));
  }
  g.add(new THREE.Mesh(merge(sp), m.alu));
  const disc = new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.006, 24).rotateZ(Math.PI / 2).translate(0.07, 0, 0);
  g.add(new THREE.Mesh(disc, m.chrome));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// Builds a bike; origin = rear tyre contact point, +Z forward.
export function buildBike(spec) {
  const m = mats(spec);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const add = (geo, mat, parent = body) => { const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
  const { wb, rr, rf } = spec;
  const tw = spec.tire === 'fat' ? 0.11 : spec.kind === 'moto' ? (spec.tire === 'slick' ? 0.13 : 0.1) : 0.06;
  const rear = wheel(rr, tw, m, spec.tire, true); rear.position.set(0, rr, 0); root.add(rear);
  const front = wheel(rf, spec.tire === 'slick' ? 0.11 : tw, m, spec.tire, true);
  let headTop, rake = 0.44, steer, gripL, gripR, seat, pegL, pegR, head;
  const out = { root, rear, front, spec, mats: m };

  if (spec.kind === 'moto') {
    const hy = spec.id.startsWith('varg') ? 1.08 : 1.0;
    const hz = wb - (hy - rf) * Math.tan(rake) - 0.02;
    headTop = V(0, hy, hz);
    const big = spec.id.startsWith('varg') ? 1.12 : spec.id === 'ultra' ? 1.06 : 1;
    // frame / battery body
    add(boxGeo(0.2 * big, 0.36 * big, 0.5 * big, 0, 0.62, hz - 0.42), m.darkAlu);
    add(tubeGeo(V(0.07, hy - 0.05, hz - 0.04), V(0.08, 0.5, hz - 0.62), 0.03), m.alu);
    add(tubeGeo(V(-0.07, hy - 0.05, hz - 0.04), V(-0.08, 0.5, hz - 0.62), 0.03), m.alu);
    add(tubeGeo(V(0.07, hy - 0.02, hz - 0.08), V(0.08, 0.86, 0.38), 0.025), m.alu);
    add(tubeGeo(V(-0.07, hy - 0.02, hz - 0.08), V(-0.08, 0.86, 0.38), 0.025), m.alu);
    // side panels (plastics)
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.55, 0.06); sh.lineTo(0.62, 0.32); sh.lineTo(0.05, 0.36); sh.closePath();
      const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      pg.rotateY(-Math.PI / 2); pg.translate(s * (0.11 * big + 0.01), 0.5, hz - 0.68);
      add(pg, s > 0 ? m.plastic : m.plastic);
      add(boxGeo(0.005, 0.06, 0.4, s * (0.11 * big + 0.035), 0.7, hz - 0.35, 0.12, 0, 0), m.accent);
    }
    // seat + tail
    seat = V(0, 0.9 * big, 0.42);
    add(boxGeo(0.22, 0.09, 0.75, 0, 0.88 * big, 0.45, -0.05, 0, 0), m.seat);
    const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.lineTo(0.5, 0.02); tail.lineTo(0.58, 0.1); tail.lineTo(-0.15, 0.2); tail.closePath();
    const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.2, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 });
    tg.translate(0, 0, -0.1); tg.rotateY(-Math.PI / 2); tg.rotateX(-0.1); tg.translate(0, 0.83 * big, -0.25);
    add(tg, m.plastic);
    add(boxGeo(0.1, 0.03, 0.04, 0, 0.92 * big, -0.33), m.tail);
    // swingarm + shock
    for (const s of [-1, 1]) add(boxGeo(0.03, 0.07, 0.6, s * 0.09, (rr + 0.45) / 2, 0.28, -Math.atan2(0.45 - rr, 0.6), 0, 0), m.alu);
    add(tubeGeo(V(0, 0.52, 0.55), V(0, 0.85, 0.3), 0.035), m.spring);
    add(tubeGeo(V(0, 0.52, 0.55), V(0, 0.85, 0.3), 0.018), m.chrome);
    // motor
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 18).rotateZ(Math.PI / 2).translate(0, 0.4, hz - 0.55), m.black);
    add(tubeGeo(V(0.06, 0.4, hz - 0.55), V(0.06, rr, 0), 0.012), m.black);
    // pegs
    pegL = V(0.17, 0.38, 0.55); pegR = V(-0.17, 0.38, 0.55);
    add(boxGeo(0.4, 0.03, 0.05, 0, 0.38, 0.55), m.alu);
  } else {
    const hy = spec.id === 'city' ? 1.02 : 1.0;
    const hz = wb - (hy - rf) * Math.tan(0.36) - 0.02; rake = 0.36;
    headTop = V(0, hy, hz);
    const bb = V(0, 0.33, 0.44), seatTop = V(0, 0.9, 0.25), headBot = V(0, hy - 0.16, hz + 0.05);
    const tub = (a, b, r) => add(tubeGeo(a, b, r, r, 10), m.plastic);
    if (spec.id === 'city') { tub(bb, V(0, 0.55, hz - 0.05), 0.03); tub(V(0, 0.55, hz - 0.05), headBot, 0.03); }
    else tub(V(0, hy - 0.06, hz), seatTop, 0.026);
    tub(bb, seatTop, 0.025);
    // battery downtube
    add(tubeGeo(bb, headBot, 0.055, 0.045, 12), m.plastic);
    add(tubeGeo(V(0, 0.42, 0.52), V(0, hy - 0.25, hz - 0.03), 0.04, 0.035, 10).translate(0, 0, 0.0), m.black);
    for (const s of [-1, 1]) {
      add(tubeGeo(V(s * 0.06, rr, 0), bb, 0.012), m.plastic);
      add(tubeGeo(V(s * 0.06, rr, 0), V(0, 0.82, 0.27), 0.012), m.plastic);
    }
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16).rotateZ(Math.PI / 2).translate(0, bb.y, bb.z), m.black); // mid motor
    add(tubeGeo(V(0, 0.9, 0.25), V(0, 1.02, 0.2), 0.016), m.alu);
    seat = V(0, 1.06, 0.2);
    add(boxGeo(0.14, 0.05, 0.26, 0, 1.05, 0.2), m.seat);
    // cranks
    const crank = new THREE.Group(); crank.position.copy(bb); body.add(crank); out.crank = crank;
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 24).rotateZ(Math.PI / 2).translate(0.07, 0, 0), m.chrome, crank);
    add(boxGeo(0.02, 0.17, 0.03, 0.09, -0.08, 0), m.black, crank); add(boxGeo(0.02, 0.17, 0.03, -0.09, 0.08, 0), m.black, crank);
    add(boxGeo(0.1, 0.02, 0.07, 0.13, -0.17, 0), m.black, crank); add(boxGeo(0.1, 0.02, 0.07, -0.13, 0.17, 0), m.black, crank);
    pegL = V(0.15, 0.2, 0.44); pegR = V(-0.15, 0.4, 0.44);
    if (spec.id === 'city') {
      add(boxGeo(0.16, 0.015, 0.4, 0, rr + 0.12, -0.05), m.black); // rack
      add(new THREE.TorusGeometry(rr + 0.03, 0.035, 4, 24, 2.2).rotateY(Math.PI / 2).rotateX(-0.4).translate(0, rr, 0), m.black);
      add(boxGeo(0.08, 0.03, 0.03, 0, rr + 0.15, -0.26), m.tail);
    }
  }
  // steering assembly
  const steerAxis = new THREE.Group(); steerAxis.position.copy(headTop); steerAxis.rotation.x = -rake; body.add(steerAxis);
  steer = new THREE.Group(); steerAxis.add(steer);
  // axle in steer frame
  const axleW = V(0, rf, wb).sub(headTop);
  const axle = axleW.clone().applyAxisAngle(V(1, 0, 0), rake);
  const forkLen = -axle.y;
  front.position.copy(axle); steer.add(front);
  const fr = spec.kind === 'moto' ? 0.032 : 0.018;
  for (const s of [-1, 1]) {
    add(tubeGeo(V(s * 0.09, 0.05, axle.z), V(s * 0.09, -forkLen * 0.55, axle.z), fr * 1.15), m.fork, steer);
    add(tubeGeo(V(s * 0.09, -forkLen * 0.5, axle.z), V(s * 0.09, -forkLen, axle.z), fr), spec.kind === 'moto' ? m.black : m.fork, steer);
  }
  add(boxGeo(0.24, 0.04, 0.08, 0, 0.0, axle.z), m.darkAlu, steer);
  add(boxGeo(0.24, 0.04, 0.08, 0, -0.18, axle.z), m.darkAlu, steer);
  // bars
  const barW = spec.kind === 'moto' ? 0.4 : spec.id === 'city' ? 0.3 : 0.37;
  const barY = spec.kind === 'moto' ? 0.13 : 0.08, barZ = spec.id === 'city' ? -0.14 : -0.03;
  add(tubeGeo(V(0, 0.02, 0), V(0, barY, barZ), 0.02), m.darkAlu, steer);
  add(tubeGeo(V(-barW, barY + 0.03, barZ - 0.03), V(barW, barY + 0.03, barZ - 0.03), 0.013, 0.013, 8), m.black, steer);
  for (const s of [-1, 1]) {
    add(tubeGeo(V(s * (barW - 0.1), barY + 0.03, barZ - 0.03), V(s * barW, barY + 0.03, barZ - 0.03), 0.018, 0.018, 8), m.rubber, steer);
    add(tubeGeo(V(s * (barW - 0.14), barY + 0.05, barZ - 0.01), V(s * (barW - 0.02), barY + 0.04, barZ + 0.07), 0.006), m.alu, steer); // lever
  }
  gripL = V(barW - 0.05, barY + 0.03, barZ - 0.03); gripR = V(-(barW - 0.05), barY + 0.03, barZ - 0.03);
  // dash screen
  const dc = document.createElement('canvas'); dc.width = 128; dc.height = 64;
  const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace;
  const dash = add(new THREE.PlaneGeometry(0.09, 0.045), new THREE.MeshBasicMaterial({ map: dt, toneMapped: false }), steer);
  dash.position.set(0, barY + 0.07, barZ - 0.02); dash.rotation.x = 1.0; dash.rotation.y = Math.PI;
  add(boxGeo(0.1, 0.055, 0.02, 0, barY + 0.068, barZ - 0.008, 1.0, 0, 0), m.black, steer);
  out.dash = { canvas: dc, tex: dt };
  // number plate / headlight / fender
  if (spec.kind === 'moto') {
    const plate = new THREE.Shape(); plate.moveTo(-0.13, -0.18); plate.lineTo(0.13, -0.18); plate.lineTo(0.15, 0.1); plate.lineTo(0, 0.17); plate.lineTo(-0.15, 0.1); plate.closePath();
    const pg = new THREE.ExtrudeGeometry(plate, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008 });
    pg.rotateX(0.0); pg.translate(0, -0.12, 0.14);
    add(pg, m.plastic, steer);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 20).rotateX(Math.PI / 2).translate(0, -0.12, 0.17), m.light, steer);
    const fg = new THREE.TorusGeometry(rf + 0.05, 0.06, 4, 20, 1.3).rotateY(Math.PI / 2).rotateX(1.05);
    fg.scale(1.5, 1, 1).translate(0, 0, axle.z).translate(0, axle.y, 0);
    add(fg, m.plastic, steer);
  } else {
    add(boxGeo(0.06, 0.04, 0.05, 0, -0.08, 0.06), m.black, steer);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 14).rotateX(Math.PI / 2).translate(0, -0.08, 0.09), m.light, steer);
    if (spec.id === 'city') { const fg = new THREE.TorusGeometry(rf + 0.03, 0.035, 4, 24, 1.8).rotateY(Math.PI / 2).rotateX(0.75); fg.translate(0, axle.y, axle.z); add(fg, m.black, steer); }
  }
  // headlight (real light)
  const spot = new THREE.SpotLight(0xfff2dd, 0, 140, 0.42, 0.5, 1.2);
  spot.position.set(0, -0.1, 0.2); steer.add(spot);
  const tgt = new THREE.Object3D(); tgt.position.copy(V(0, -1.6, 20).applyAxisAngle(V(1, 0, 0), rake)); steer.add(tgt); spot.target = tgt;
  out.headlight = spot;
  out.steer = steer; out.steerAxis = steerAxis;
  out.seat = seat; out.wb = wb;

  // rider
  const rider = buildRider(out, steerAxis, gripL, gripR, pegL, pegR, seat, spec);
  out.rider = rider;
  return out;
}

const RM = {};
function buildRider(bike, steerAxis, gripL, gripR, pegL, pegR, seat, spec) {
  const jacket = RM.j || (RM.j = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.85 }));
  const jeans = RM.p || (RM.p = new THREE.MeshStandardMaterial({ color: 0x3a5070, roughness: 0.9 }));
  const glove = RM.g || (RM.g = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
  const helmet = RM.h || (RM.h = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0c, roughness: 0.25, clearcoat: 1 }));
  const shoe = RM.s || (RM.s = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }));
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const moto = spec.kind === 'moto';
  const hip = V(0, seat.y + 0.12, seat.z + (moto ? 0.05 : 0));
  const lean = moto ? 0.38 : 0.32;
  const sh = V(0, hip.y + 0.5 * Math.cos(lean), hip.z + 0.5 * Math.sin(lean));
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 4, 10), jacket);
  torso.position.copy(hip).lerp(sh, 0.55); torso.rotation.x = lean; torso.scale.set(1.15, 1, 0.8); torso.castShadow = true;
  body.add(torso);
  const headPos = V(0, sh.y + 0.24, sh.z + 0.06);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), helmet); hm.position.copy(headPos); hm.scale.set(1, 1, 1.15); hm.castShadow = true;
  body.add(hm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.12), helmet); visor.position.set(0, headPos.y + 0.03, headPos.z + 0.15); body.add(visor);
  // limbs (in body frame; grips are in steer frame → convert)
  const gl = steerAxis.position.clone().add(gripL.clone().applyEuler(steerAxis.rotation));
  const gr = steerAxis.position.clone().add(gripR.clone().applyEuler(steerAxis.rotation));
  const arms = new THREE.Group(); g.add(arms);
  for (const [s, gp] of [[1, gl], [-1, gr]]) {
    const shp = V(s * 0.2, sh.y - 0.03, sh.z);
    const el = shp.clone().lerp(gp, 0.5).add(V(s * 0.12, -0.1, -0.05));
    arms.add(new THREE.Mesh(tubeGeo(shp, el, 0.055, 0.05), jacket));
    arms.add(new THREE.Mesh(tubeGeo(el, gp, 0.05, 0.04), jacket));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glove); hand.position.copy(gp); hand.scale.set(1.2, 0.9, 1.3); arms.add(hand);
  }
  const legs = new THREE.Group(); g.add(legs);
  for (const [s, pg] of [[1, pegL], [-1, pegR]]) {
    const hp = V(s * 0.13, hip.y - 0.02, hip.z);
    const foot = V(s * Math.max(Math.abs(pg.x), 0.15), pg.y + 0.05, pg.z);
    const kn = hp.clone().lerp(foot, 0.5).add(V(s * 0.08, 0.12, 0.25));
    legs.add(new THREE.Mesh(tubeGeo(hp, kn, 0.08, 0.065), jeans));
    legs.add(new THREE.Mesh(tubeGeo(kn, foot, 0.06, 0.05), jeans));
    legs.add(new THREE.Mesh(boxGeo(0.1, 0.08, 0.26, foot.x, foot.y - 0.02, foot.z + 0.05), shoe));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  bike.root.children[0].add(g);
  bike.headLocal = headPos.clone().add(V(0, -0.12, -0.08));
  return { group: g, body, arms, legs };
}
