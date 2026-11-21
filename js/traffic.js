import * as THREE from 'three';
import { roads, nodes, LANES, SPEED, parkedSpots, signal, isSignalNode } from './world.js';
import { merge, boxGeo, rand, rr, pick, V } from './util.js';

const PAINT = [0xf2f2f2, 0x111111, 0x8a8f96, 0x1f3a6e, 0x8c1010, 0x3a3f44, 0xc9c9c4, 0x2b4a2b, 0xd8b23a, 0x5a2a6e, 0xb8b8b8, 0x7a1a1a];
const paintMats = PAINT.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08 }));
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0e12, roughness: 0.05, metalness: 0.9 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
export const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff6e6, emissiveIntensity: 0.3 });
export const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a10, emissiveIntensity: 0.4 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });

function extrudeSide(pts, width, bevel = 0.06) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x -> +z (forward)
  return g;
}
function wheels(xs, zs, r, w) {
  const out = [];
  for (const x of xs) for (const z of zs) {
    out.push(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2).translate(x, r, z));
  }
  return merge(out);
}
// Types: profile = side silhouette (z,y), cabin = glass silhouette
const TYPES = {
  sedan: { L: 4.7, W: 1.85, body: [[-2.35, 0.32], [2.35, 0.32], [2.38, 0.62], [2.2, 0.82], [0.9, 0.95], [-1.8, 0.98], [-2.35, 0.9]], cab: [[-1.75, 0.92], [0.95, 0.92], [0.15, 1.42], [-1.25, 1.45], [-1.8, 1.0]], r: 0.34, wz: [1.45, -1.4], hl: 0.68, tl: 0.85 },
  suv: { L: 4.9, W: 1.95, body: [[-2.45, 0.42], [2.45, 0.42], [2.48, 0.8], [2.3, 1.05], [1.1, 1.12], [-2.4, 1.15], [-2.45, 1.0]], cab: [[-2.35, 1.08], [1.15, 1.08], [0.35, 1.75], [-2.25, 1.78]], r: 0.4, wz: [1.55, -1.5], hl: 0.85, tl: 1.05 },
  hatch: { L: 4.1, W: 1.78, body: [[-2.05, 0.32], [2.05, 0.32], [2.08, 0.62], [1.9, 0.84], [0.8, 0.95], [-2.0, 0.98], [-2.05, 0.8]], cab: [[-1.98, 0.92], [0.85, 0.92], [0.05, 1.45], [-1.8, 1.48]], r: 0.32, wz: [1.3, -1.3], hl: 0.68, tl: 0.9 },
  sport: { L: 4.5, W: 1.95, body: [[-2.25, 0.25], [2.25, 0.25], [2.3, 0.45], [2.0, 0.62], [0.7, 0.8], [-1.7, 0.85], [-2.25, 0.78]], cab: [[-1.6, 0.8], [0.75, 0.8], [-0.1, 1.15], [-1.1, 1.17]], r: 0.33, wz: [1.4, -1.35], hl: 0.52, tl: 0.72 },
  pickup: { L: 5.6, W: 2.0, body: [[-2.8, 0.5], [2.8, 0.5], [2.82, 0.95], [2.6, 1.18], [1.3, 1.22], [-2.8, 1.22]], cab: [[-0.6, 1.18], [1.35, 1.18], [0.6, 1.9], [-0.55, 1.92]], r: 0.42, wz: [1.85, -1.75], hl: 0.95, tl: 1.05 },
  van: { L: 5.3, W: 2.0, body: [[-2.65, 0.4], [2.65, 0.4], [2.68, 1.0], [2.3, 1.3], [-2.65, 1.3]], cab: [[-2.6, 1.25], [2.25, 1.25], [1.5, 2.3], [-2.6, 2.35]], r: 0.38, wz: [1.75, -1.7], hl: 0.9, tl: 1.1, glassBody: true },
  bus: { L: 11.5, W: 2.5, body: [[-5.75, 0.4], [5.75, 0.4], [5.78, 1.3], [5.7, 3.0], [-5.75, 3.0]], cab: [[-5.6, 1.6], [5.68, 1.6], [5.62, 2.6], [-5.6, 2.6]], r: 0.5, wz: [3.8, -3.2], hl: 0.9, tl: 1.0 },
  truck: { L: 9.5, W: 2.5, body: [[-4.75, 0.6], [4.75, 0.6], [4.78, 1.4], [4.6, 2.5], [2.8, 2.6], [2.8, 3.6], [-4.75, 3.6]], cab: [[3.0, 1.6], [4.6, 1.6], [4.5, 2.4], [3.0, 2.4]], r: 0.52, wz: [3.6, -3.0], hl: 1.0, tl: 1.0 }
};
const geoCache = {};
function typeGeo(t) {
  if (geoCache[t]) return geoCache[t];
  const T = TYPES[t];
  const body = extrudeSide(T.body, T.W);
  const cab = extrudeSide(T.cab, T.W - 0.14, 0.04);
  const wh = wheels([T.W / 2 - 0.22, -(T.W / 2 - 0.22)], T.wz, T.r, 0.26);
  const zF = T.L / 2 + 0.02, zR = -T.L / 2 - 0.02;
  const hl = merge([boxGeo(0.35, 0.12, 0.06, T.W / 2 - 0.3, T.hl, zF), boxGeo(0.35, 0.12, 0.06, -(T.W / 2 - 0.3), T.hl, zF)]);
  const tl = merge([boxGeo(0.4, 0.12, 0.06, T.W / 2 - 0.25, T.tl, zR), boxGeo(0.4, 0.12, 0.06, -(T.W / 2 - 0.25), T.tl, zR)]);
  const trim = merge([boxGeo(T.W + 0.02, 0.18, 0.12, 0, T.r * 0.9, zF - 0.02), boxGeo(T.W + 0.02, 0.18, 0.12, 0, T.r * 0.9, zR + 0.02), boxGeo(0.06, 0.06, 0.18, T.W / 2 + 0.05, (T.hl + T.tl) / 2 + 0.25, T.wz[0] - 0.8), boxGeo(0.06, 0.06, 0.18, -T.W / 2 - 0.05, (T.hl + T.tl) / 2 + 0.25, T.wz[0] - 0.8)]);
  return (geoCache[t] = { body, cab, wh, hl, tl, trim, T });
}

const realCars = []; // { proto, L, W }
const glassReal = new THREE.MeshPhysicalMaterial({ color: 0x10161c, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.82 });
// normalise a loaded car: length along +Z (front = +Z), wheels on y=0, centred, given length
export function addRealCar(scene, length, isPaint) {
  const wrap = new THREE.Group(); wrap.add(scene);
  let box = new THREE.Box3().setFromObject(wrap), size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) scene.rotation.y = Math.PI / 2;
  wrap.updateMatrixWorld(true);
  // find the front using headlight meshes
  let hl = null; scene.traverse((o) => { if (o.isMesh && /head/i.test(o.material.name || '')) hl = o; });
  box = new THREE.Box3().setFromObject(wrap); const c = box.getCenter(new THREE.Vector3());
  if (hl) { const hc = new THREE.Box3().setFromObject(hl).getCenter(new THREE.Vector3()); if (hc.z < c.z) scene.rotation.y += Math.PI; }
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap); size = box.getSize(new THREE.Vector3());
  const k = length / size.z; scene.scale.multiplyScalar(k);
  wrap.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(wrap); const c2 = box.getCenter(new THREE.Vector3());
  scene.position.x -= c2.x; scene.position.z -= c2.z; scene.position.y -= box.min.y;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const mm = o.material;
    if (mm.transmission > 0 || /glass|window/i.test(mm.name || '')) o.material = glassReal;
    if (isPaint(o, mm)) o.userData.paint = true;
    if (/head/i.test(mm.name || '')) o.userData.head = true;
    if (/brake|tail/i.test(mm.name || '')) o.userData.tail = true;
  });
  wrap.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(wrap); size = box.getSize(new THREE.Vector3());
  realCars.push({ proto: wrap, L: size.z, W: size.x });
}
export function hasRealCars() { return realCars.length > 0; }

export function makeCar(type, paint) {
  const g = new THREE.Group();
  if (type === 'real' && realCars.length) {
    const rc = pick(realCars);
    const c = rc.proto.clone(true);
    c.traverse((o) => { if (o.isMesh) { if (o.userData.paint) o.material = paint; else if (o.userData.head) o.material = headMat; else if (o.userData.tail) o.material = tailMat; } });
    g.add(c);
    const proxy = makeCar(rc.L > 4.65 ? 'sedan' : 'sport', paint); proxy.visible = false; g.add(proxy);
    g.userData = { L: rc.L, W: rc.W, real: c, proxy };
    return g;
  }
  const G = typeGeo(type);
  const b = new THREE.Mesh(G.body, paint); b.castShadow = true; b.receiveShadow = true;
  const c = new THREE.Mesh(G.cab, G.T.glassBody ? paint : glassMat); c.castShadow = true;
  const w = new THREE.Mesh(G.wh, tireMat); w.castShadow = true;
  g.add(b, c, w, new THREE.Mesh(G.hl, headMat), new THREE.Mesh(G.tl, tailMat), new THREE.Mesh(G.trim, trimMat));
  if (G.T.glassBody) { // van windows
    const win = merge([boxGeo(G.T.W + 0.01, 0.55, 1.2, 0, 1.75, 1.3), boxGeo(G.T.W + 0.01, 0.5, 3.2, 0, 1.8, -0.9)]);
    g.add(new THREE.Mesh(win, glassMat));
  }
  g.userData = { L: G.T.L, W: G.T.W };
  return g;
}

// ------------------------------------------------------------ traffic sim
export class Traffic {
  constructor(scene) {
    this.scene = scene; this.cars = [];
    const counts = { city: 34, hood: 12, hwy: 30, forest: 4 };
    for (const kind in counts) {
      const segs = roads.filter((s) => s.kind === kind);
      for (let i = 0; i < counts[kind]; i++) this.spawn(pick(segs), kind);
    }
    // parked cars
    this.parked = [];
    // kerbside parking along city streets
    for (const s2 of roads) {
      if (s2.kind !== 'city' || Math.abs(s2.ax) > 300 || Math.abs(s2.bx) > 300 || Math.abs(s2.az) > 300 || Math.abs(s2.bz) > 300) continue;
      for (const dir of [1, -1]) for (let t = 20; t < s2.len - 20; t += 7.2) {
        if (rand() > 0.3) continue;
        const tt = dir > 0 ? t : s2.len - t, fx = s2.dx * dir, fz = s2.dz * dir;
        const x = s2.ax + s2.dx * tt - fz * 7.0, z = s2.az + s2.dz * tt + fx * 7.0, yaw = Math.atan2(fx, fz);
        const car = makeCar(rand() < 0.4 && realCars.length ? 'real' : pick(['sedan', 'suv', 'hatch', 'pickup', 'van']), pick(paintMats));
        car.position.set(x, 0, z); car.rotation.y = yaw; scene.add(car);
        car.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        this.parked.push({ mesh: car, pos: car.position, yaw, speed: 0, L: car.userData.L, W: car.userData.W });
      }
    }
    for (const p of parkedSpots.slice(0, 28)) {
      const car = makeCar(pick(['sedan', 'suv', 'hatch', 'pickup']), pick(paintMats));
      car.position.set(p.x, 0, p.z); car.rotation.y = p.yaw; scene.add(car);
      this.parked.push({ mesh: car, pos: car.position, yaw: p.yaw, speed: 0, L: car.userData.L, W: car.userData.W });
    }
  }
  spawn(seg, kind) {
    let type;
    if (kind === 'hwy') type = pick(['sedan', 'suv', 'sport', 'truck', 'sedan', 'pickup', 'van', 'real', 'truck']);
    else if (kind === 'city') type = pick(['sedan', 'suv', 'hatch', 'van', 'bus', 'sedan', 'real', 'pickup']);
    else type = pick(['sedan', 'suv', 'hatch', 'pickup', 'real']);
    if (type === 'real' && !realCars.length) type = 'sport';
    if (realCars.length && type !== 'bus' && type !== 'truck' && rand() < 0.45) type = 'real';
    const mesh = makeCar(type, pick(paintMats));
    this.scene.add(mesh);
    const dir = rand() < 0.5 ? 1 : -1;
    const lanes = LANES[seg.kind];
    const lane = type === 'truck' || type === 'bus' ? lanes[lanes.length - 1] : pick(lanes);
    const car = { mesh, seg, dir, s: rr(0, seg.len), lane, speed: 0, vmax: SPEED[seg.kind] * rr(0.85, 1.15) * (type === 'truck' || type === 'bus' ? 0.8 : 1), pos: mesh.position, yaw: 0, L: mesh.userData.L, W: mesh.userData.W, type };
    car.next = this.chooseNext(car);
    const p = this.lanePoint(car, car.s); car.pos.set(p.x, 0, p.z);
    const p2 = this.lanePoint(car, car.s + 3); car.yaw = Math.atan2(p2.x - p.x, p2.z - p.z);
    car.speed = car.vmax * 0.8;
    this.cars.push(car);
  }
  endNode(seg, dir) { return dir > 0 ? [seg.bx, seg.bz] : [seg.ax, seg.az]; }
  chooseNext(car) {
    const [x, z] = this.endNode(car.seg, car.dir);
    const n = nodes.get(`${Math.round(x)},${Math.round(z)}`);
    let opts = n.links.filter((l) => l.seg !== car.seg);
    if (!opts.length) return { seg: car.seg, dir: -car.dir };
    // prefer staying on same road type
    const same = opts.filter((l) => l.seg.kind === car.seg.kind);
    if (same.length && rand() < 0.85) opts = same;
    const l = pick(opts);
    return { seg: l.seg, dir: l.end === 0 ? 1 : -1 };
  }
  lanePoint(car, s, seg = car.seg, dir = car.dir, lane = car.lane) {
    if (s > seg.len && seg === car.seg) return this.lanePoint(car, s - seg.len, car.next.seg, car.next.dir, LANES[car.next.seg.kind].includes(lane) ? lane : LANES[car.next.seg.kind][0]);
    const t = dir > 0 ? s : seg.len - s;
    const fx = seg.dx * dir, fz = seg.dz * dir;
    const rx = -fz, rz = fx;
    return { x: seg.ax + seg.dx * t + rx * lane, z: seg.az + seg.dz * t + rz * lane, fx, fz };
  }
  update(dt, player) {
    this.time = (this.time || 0) + dt;
    const all = this.cars;
    this.lodT = (this.lodT || 0) - dt;
    if (this.lodT <= 0 && player) {
      this.lodT = 0.4;
      for (const c of this.parked) { const d2 = (c.pos.x - player.pos.x) ** 2 + (c.pos.z - player.pos.z) ** 2; c.mesh.visible = d2 < 120 * 120; const u = c.mesh.userData; if (u.real) { u.real.visible = d2 < 45 * 45; u.proxy.visible = !u.real.visible; } }
      for (const c of all) { const u = c.mesh.userData; if (!u.real) continue; const near = (c.pos.x - player.pos.x) ** 2 + (c.pos.z - player.pos.z) ** 2 < 70 * 70; u.real.visible = near; u.proxy.visible = !near; }
    }
    for (const c of all) {
      // target speed
      let target = c.vmax;
      const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
      const remain = c.seg.len - c.s;
      const turning = c.next.seg.dx * c.next.dir !== c.seg.dx * c.dir || c.next.seg.dz * c.next.dir !== c.seg.dz * c.dir;
      if (turning && remain < 30) target = Math.min(target, 6 + remain * 0.3);
      // stop at red / amber lights
      if (c.seg.kind === 'city' && remain < 45) {
        const [ex, ez] = this.endNode(c.seg, c.dir);
        const node = nodes.get(`${Math.round(ex)},${Math.round(ez)}`);
        if (isSignalNode(node)) {
          const st = signal(Math.abs(c.seg.dx) > 0.5 ? 'x' : 'z', this.time);
          const stopAt = remain - 12.5; // stop line before the crosswalk
          if ((st === 'r' || (st === 'y' && stopAt > 6)) && stopAt > -1) target = Math.min(target, Math.max(0, stopAt * 0.55));
        }
      }
      // car ahead
      for (const o of all) {
        if (o === c) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
        const ahead = dx * fwdX + dz * fwdZ; if (ahead <= 0 || ahead > 40) continue;
        const side = Math.abs(dx * fwdZ - dz * fwdX); if (side > 2.2) continue;
        const gap = ahead - (c.L + o.L) / 2;
        target = Math.min(target, Math.max(0, (gap - 3) * 0.6 + o.speed * 0.5));
      }
      // player ahead
      if (player && player.alive) {
        const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
        const ahead = dx * fwdX + dz * fwdZ, side = Math.abs(dx * fwdZ - dz * fwdX);
        if (ahead > 0 && ahead < 30 && side < 2) target = Math.min(target, Math.max(0, (ahead - c.L / 2 - 4) * 0.5 + Math.max(0, player.speed) * 0.4));
      }
      if (target > c.speed) c.speed = Math.min(target, c.speed + 2.5 * dt);
      else c.speed = Math.max(target, c.speed - 8 * dt);
      c.s += c.speed * dt;
      if (c.s >= c.seg.len) {
        c.s -= c.seg.len;
        const lanes = LANES[c.next.seg.kind];
        if (!lanes.includes(c.lane)) c.lane = lanes[Math.min(lanes.length - 1, c.lane > 4 ? 1 : 0)];
        c.seg = c.next.seg; c.dir = c.next.dir; c.next = this.chooseNext(c);
      }
      const p = this.lanePoint(c, c.s);
      const k = 1 - Math.exp(-dt * 3);
      c.pos.x += (p.x - c.pos.x) * k; c.pos.z += (p.z - c.pos.z) * k;
      const la = this.lanePoint(c, c.s + 5 + c.L * 0.3);
      const wantYaw = Math.atan2(la.x - c.pos.x, la.z - c.pos.z);
      let dy = wantYaw - c.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += dy * Math.min(1, dt * 4);
      c.mesh.rotation.y = c.yaw;
    }
  }
  // check collision with point (player) radius r; returns car hit
  hit(x, z, r) {
    for (const list of [this.cars, this.parked]) for (const c of list) {
      const dx = x - c.pos.x, dz = z - c.pos.z;
      if (dx * dx + dz * dz > 64) continue;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      const lz = dx * s + dz * co, lx = dx * co - dz * s;
      if (Math.abs(lx) < c.W / 2 + r && Math.abs(lz) < c.L / 2 + r) return { car: c, lx, lz };
    }
    return null;
  }
}
