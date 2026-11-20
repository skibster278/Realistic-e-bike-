import * as THREE from 'three';
import { clamp, smoothstep, fbm, rand, rr, pick, merge, colorize, jitterVerts, tubeGeo, boxGeo, V, setSeed } from './util.js';
import * as TX from './textures.js';
import { makeImpostorMesh } from './impostor.js';

// ---------------------------------------------------------------- layout
export const FOREST = { x0: -1100, x1: -370, z0: -760, z1: 760 };
export const CITY = { x0: -300, x1: 300, z0: -300, z1: 300 };
export const HOOD = { x0: 300, x1: 900, z0: -300, z1: 300 };
export const JUMPPARK = { x0: -530, x1: -420, z0: 25, z1: 120 };
const WID = { city: 16, hood: 10, hwy: 20, forest: 9 };
export const LANES = { city: [2.2, 6], hood: [2.6], hwy: [3.2, 7.2], forest: [2.4] };
export const SPEED = { city: 13, hood: 9, hwy: 29, forest: 16 };

export const roads = [];
export const nodes = new Map();
const nkey = (x, z) => `${Math.round(x)},${Math.round(z)}`;
function seg(ax, az, bx, bz, kind) {
  const len = Math.hypot(bx - ax, bz - az);
  const s = { ax, az, bx, bz, kind, w: WID[kind], len, dx: (bx - ax) / len, dz: (bz - az) / len, id: roads.length };
  roads.push(s);
  for (const [x, z, end] of [[ax, az, 0], [bx, bz, 1]]) {
    const k = nkey(x, z);
    if (!nodes.has(k)) nodes.set(k, { x, z, links: [] });
    nodes.get(k).links.push({ seg: s, end });
  }
}
const L = [-300, -200, -100, 0, 100, 200, 300];
for (const x of L) for (let i = 0; i < L.length - 1; i++) seg(x, L[i], x, L[i + 1], 'city');
for (const z of L) for (let i = 0; i < L.length - 1; i++) seg(L[i], z, L[i + 1], z, 'city');
const HX = [300, 400, 500, 600, 700, 800, 900];
for (const x of HX.slice(1)) for (let i = 0; i < L.length - 1; i++) seg(x, L[i], x, L[i + 1], 'hood');
for (const z of L) for (let i = 0; i < HX.length - 1; i++) seg(HX[i], z, HX[i + 1], z, 'hood');
seg(-300, 0, -1150, 0, 'forest');
seg(0, 300, 0, 820, 'city'); seg(0, -300, 0, -820, 'city');
seg(900, 300, 900, 820, 'hood'); seg(900, -300, 900, -820, 'hood');
seg(900, 0, 1100, 0, 'hood');
const RX = [-1150, 0, 900, 1100];
for (const z of [820, -820]) for (let i = 0; i < RX.length - 1; i++) seg(RX[i], z, RX[i + 1], z, 'hwy');
seg(-1150, -820, -1150, 0, 'hwy'); seg(-1150, 0, -1150, 820, 'hwy');
seg(1100, -820, 1100, 0, 'hwy'); seg(1100, 0, 1100, 820, 'hwy');

export function nearestRoad(x, z) {
  let best = null, bd = 1e9, bt = 0;
  for (const s of roads) {
    const t = clamp((x - s.ax) * s.dx + (z - s.az) * s.dz, 0, s.len);
    const px = s.ax + s.dx * t, pz = s.az + s.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = s; bt = t; }
  }
  return { seg: best, d: bd, t: bt };
}

// ---------------------------------------------------------------- trails (forest)
export const trails = [];
const TM = { res: 2, w: 0, h: 0, data: null };
function buildTrails() {
  setSeed(42);
  TM.w = Math.ceil((FOREST.x1 - FOREST.x0) / TM.res); TM.h = Math.ceil((FOREST.z1 - FOREST.z0) / TM.res);
  TM.data = new Float32Array(TM.w * TM.h).fill(99);
  const starts = [[-470, 14, 0.2], [-600, -14, Math.PI], [-760, 14, 0.3], [-900, -14, Math.PI - 0.2], [-1000, 14, -0.3], [-680, 14, 0.1], [-820, -14, Math.PI + 0.3]];
  for (const [sx, sz, h0] of starts) {
    const pts = []; let x = sx, z = sz, h = h0, dh = 0;
    for (let i = 0; i < 260; i++) {
      pts.push([x, z]);
      dh += (rand() - 0.5) * 0.12; dh *= 0.92; h += dh;
      // keep in forest
      const cx = (FOREST.x0 + FOREST.x1) / 2;
      if (x < FOREST.x0 + 60 || x > FOREST.x1 - 60 || z < FOREST.z0 + 60 || z > FOREST.z1 - 60) {
        const want = Math.atan2(cx - x, -z * 0.5); h += Math.sign(Math.sin(want - h)) * 0.15;
      }
      x += Math.sin(h) * 3; z += Math.cos(h) * 3;
    }
    trails.push(pts);
  }
  // jump-park access
  trails.push([[-475, 10], [-475, 30], [-475, 60], [-475, 90], [-475, 118]]);
  for (const pts of trails) for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1);
    for (let k = 0; k <= steps; k++) {
      const x = ax + (bx - ax) * k / steps, z = az + (bz - az) * k / steps;
      const ci = Math.floor((x - FOREST.x0) / TM.res), cj = Math.floor((z - FOREST.z0) / TM.res);
      for (let di = -4; di <= 4; di++) for (let dj = -4; dj <= 4; dj++) {
        const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= TM.w || jj >= TM.h) continue;
        const cx = FOREST.x0 + (ii + 0.5) * TM.res, cz = FOREST.z0 + (jj + 0.5) * TM.res;
        const d = Math.hypot(cx - x, cz - z); const idx = jj * TM.w + ii;
        if (d < TM.data[idx]) TM.data[idx] = d;
      }
    }
  }
}
buildTrails();
export function trailDist(x, z) {
  const i = Math.floor((x - FOREST.x0) / TM.res), j = Math.floor((z - FOREST.z0) / TM.res);
  if (i < 0 || j < 0 || i >= TM.w || j >= TM.h) return 99;
  return TM.data[j * TM.w + i];
}

// ---------------------------------------------------------------- terrain height
export function terrainH(x, z) {
  if (x < FOREST.x0 || x > FOREST.x1 || z < FOREST.z0 || z > FOREST.z1) return 0;
  const inset = Math.min(x - FOREST.x0, FOREST.x1 - x, z - FOREST.z0, FOREST.z1 - z);
  let f = smoothstep(0, 90, inset) * smoothstep(9, 45, Math.abs(z));
  // jump park flat
  const jp = Math.min(x - JUMPPARK.x0, JUMPPARK.x1 - x, z - JUMPPARK.z0, JUMPPARK.z1 - z);
  if (jp > -30) f *= 1 - smoothstep(-30, 0, jp);
  if (f <= 0) return 0;
  let h = (fbm(x * 0.0035 + 3, z * 0.0035 - 7, 4) - 0.35) * 70 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 3;
  h = Math.max(h, -2);
  // smooth trails a bit
  const td = trailDist(x, z);
  if (td < 3) h += (fbm(x * 0.15, z * 0.15, 1) - 0.5) * 0.4;
  return h * f;
}
// ramps: kicker rises along +local, landing falls
export const ramps = [];
function addRamp(x, z, yaw, len, w, h, type = 'kick') { ramps.push({ x, z, yaw, len, w, h, type, c: Math.cos(yaw), s: Math.sin(yaw) }); }
// jump park lines (pointing +z)
for (const lx of [-500, -475, -450]) {
  const big = lx === -475 ? 1.5 : lx === -450 ? 2.2 : 1;
  addRamp(lx, 40, 0, 4 * big, 4, 1.2 * big, 'kick');
  addRamp(lx, 40 + 4 * big + 5 * big, 0, 6 * big, 4.5, 1.2 * big, 'land');
  addRamp(lx, 80, 0, 4 * big, 4, 1.4 * big, 'kick');
  addRamp(lx, 80 + 4 * big + 6 * big, 0, 7 * big, 4.5, 1.4 * big, 'land');
}
// city skate plaza ramps (block 50,50)
addRamp(30, 25, 0, 5, 5, 1.4); addRamp(70, 40, Math.PI, 5, 5, 1.6); addRamp(50, 60, Math.PI / 2, 6, 6, 2.0);
addRamp(35, 72, -Math.PI / 2, 4, 4, 1.0); addRamp(68, 75, 0.6, 5, 5, 1.3);
// countryside big jump near forest road
addRamp(-330, -5, -Math.PI / 2, 8, 6, 2.4, 'kick');
function rampH(x, z) {
  let best = 0;
  for (const r of ramps) {
    const dx = x - r.x, dz = z - r.z;
    if (dx * dx + dz * dz > 400) continue;
    const lf = dx * r.s + dz * r.c, ls = dx * r.c - dz * r.s; // along/side
    if (lf < 0 || lf > r.len || Math.abs(ls) > r.w / 2) continue;
    const h = r.type === 'kick' ? r.h * Math.pow(lf / r.len, 1.25) : r.h * (1 - lf / r.len);
    if (h > best) best = h;
  }
  return best;
}
export function groundH(x, z) { return terrainH(x, z) + rampH(x, z); }

export function surfaceAt(x, z) {
  const r = nearestRoad(x, z);
  if (r.d < r.seg.w / 2) return 'asphalt';
  if (x > CITY.x0 - 8 && x < CITY.x1 + 8 && z > CITY.z0 - 8 && z < CITY.z1 + 8) {
    if (!(x > 18 && x < 82 && z > 18 && z < 82)) return 'concrete';
  }
  if (trailDist(x, z) < 2.6) return 'dirt';
  if (x > JUMPPARK.x0 && x < JUMPPARK.x1 && z > JUMPPARK.z0 && z < JUMPPARK.z1) return 'dirt';
  return 'grass';
}
export function biomeAt(x, z) {
  const r = nearestRoad(x, z);
  if (r.seg.kind === 'hwy' && r.d < 40) return 'Highway';
  if (x >= FOREST.x0 && x <= FOREST.x1 && z >= FOREST.z0 && z <= FOREST.z1) return 'Forest';
  if (x >= CITY.x0 - 10 && x <= CITY.x1 && z >= CITY.z0 - 10 && z <= CITY.z1 + 10) return 'City';
  if (x >= HOOD.x0 && x <= HOOD.x1 + 10 && z >= HOOD.z0 - 10 && z <= HOOD.z1 + 10) return 'Neighborhood';
  return 'Countryside';
}

// ---------------------------------------------------------------- colliders (spatial hash)
const CELL = 20; const grid = new Map();
function addCol(c) {
  for (let i = Math.floor(c.minX / CELL); i <= Math.floor(c.maxX / CELL); i++)
    for (let j = Math.floor(c.minZ / CELL); j <= Math.floor(c.maxZ / CELL); j++) {
      const k = i * 100000 + j; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(c);
    }
}
export function addCircle(x, z, r, h = 10) { addCol({ t: 0, x, z, r, h, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }); }
export function addBox(minX, maxX, minZ, maxZ, h = 50) { addCol({ t: 1, minX, maxX, minZ, maxZ, h }); }
export function queryCols(x, z) {
  const k = Math.floor(x / CELL) * 100000 + Math.floor(z / CELL);
  return grid.get(k) || [];
}

// ---------------------------------------------------------------- build
export const lamps = []; // {x,y,z}
export const nightMats = []; // {mat, max}
export const parkedSpots = []; // {x,z,yaw}

export function buildWorld(scene, assets) {
  const cityRoofs = [];
  setSeed(7);
  const group = new THREE.Group(); scene.add(group);
  const addMesh = (geo, mat, cast = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; group.add(m); return m; };

  // --- base ground
  const grassMap = TX.grassTex(); grassMap.repeat.set(1500, 1500);
  const grassNor = TX.imgTex('leafy_grass_nor', 1500, 1500, false);
  const ground = addMesh(new THREE.PlaneGeometry(6000, 6000, 150, 150).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grassMap, normalMap: grassNor, roughness: 1, color: 0xc8c8b0 }), false, true);
  ground.position.y = -0.12;

  // --- city concrete pad
  const sw = TX.sidewalkTex(); sw.repeat.set(320, 320);
  const pad = addMesh(new THREE.PlaneGeometry(640, 640, 32, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sw, normalMap: TX.imgTex('concrete_pavers_nor', 160, 160, false), roughness: 0.95 }), false, true);
  pad.position.y = 0.02;

  // --- roads
  const bump = TX.asphaltBump();
  const roadMats = {};
  for (const k of Object.keys(WID)) {
    const nor = TX.imgTex('asphalt_02_nor', WID[k] / 3.5, 12 / 3.5, false), rough = TX.imgTex('asphalt_02_rough', WID[k] / 3.5, 12 / 3.5, false);
    roadMats[k] = new THREE.MeshStandardMaterial({ map: TX.roadTex(k, WID[k]), roughness: 1, roughnessMap: rough, metalness: 0, normalMap: nor, normalScale: new THREE.Vector2(0.8, 0.8) });
  }
  const byKind = {};
  for (const s of roads) {
    const g = new THREE.PlaneGeometry(s.w, s.len, 1, Math.ceil(s.len / 25)).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * s.len / 12);
    g.rotateY(Math.atan2(s.dx, s.dz));
    g.translate((s.ax + s.bx) / 2, 0.06, (s.az + s.bz) / 2);
    (byKind[s.kind] = byKind[s.kind] || []).push(g);
  }
  for (const k in byKind) addMesh(merge(byKind[k]), roadMats[k], false, true);
  // intersections
  const pa = TX.plainAsphalt();
  const ip = [];
  for (const n of nodes.values()) {
    if (n.links.length < 2) continue;
    const w = Math.max(...n.links.map((l) => l.seg.w));
    const g = new THREE.PlaneGeometry(w, w).rotateX(-Math.PI / 2); g.translate(n.x, 0.09, n.z); ip.push(g);
  }
  addMesh(merge(ip), new THREE.MeshStandardMaterial({ map: pa, roughness: 0.9, bumpMap: bump, bumpScale: 0.6 }), false, true);

  // highway medians + guard rails
  const med = [], rails = [];
  for (const s of roads) if (s.kind === 'hwy') {
    const l = s.len - 30; if (l <= 0) continue;
    const yaw = Math.atan2(s.dx, s.dz), cx = (s.ax + s.bx) / 2, cz = (s.az + s.bz) / 2;
    med.push(boxGeo(0.7, 0.9, l, 0, 0.45, 0).rotateY(yaw).translate(cx, 0, cz));
    const hx = Math.abs(s.dx) > 0.5 ? l / 2 : 0.35, hz = Math.abs(s.dz) > 0.5 ? l / 2 : 0.35;
    addBox(cx - hx, cx + hx, cz - hz, cz + hz, 1);
    for (const side of [-1, 1]) {
      const ox = -s.dz * side * (s.w / 2 + 1.2), oz = s.dx * side * (s.w / 2 + 1.2);
      rails.push(boxGeo(0.08, 0.35, s.len - 24, 0, 0.7, 0).rotateY(yaw).translate(cx + ox, 0, cz + oz));
      for (let t = 12; t < s.len - 12; t += 4) rails.push(boxGeo(0.12, 0.75, 0.12, s.ax + s.dx * t + ox, 0.37, s.az + s.dz * t + oz));
    }
  }
  addMesh(merge(med), new THREE.MeshStandardMaterial({ color: 0xa9a7a0, roughness: 0.9, map: sw }));
  addMesh(merge(rails), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.8 }));

  // --- street lamps
  const poleG = merge([new THREE.CylinderGeometry(0.09, 0.14, 8, 8).translate(0, 4, 0), tubeGeo(V(0, 7.8, 0), V(0, 8.1, 2.3), 0.06), boxGeo(0.35, 0.12, 0.8, 0, 8.05, 2.5)]);
  const headG = boxGeo(0.28, 0.05, 0.6, 0, 7.97, 2.5);
  const lampSpots = [];
  for (const s of roads) {
    const spacing = s.kind === 'hood' ? 50 : s.kind === 'hwy' ? 55 : s.kind === 'forest' ? 0 : 38;
    if (!spacing) continue;
    const sides = s.kind === 'hood' ? [1] : [-1, 1];
    for (let t = 15; t < s.len - 10; t += spacing) for (const side of sides) {
      const rx = -s.dz * side, rz = s.dx * side, off = s.w / 2 + 1.6;
      const x = s.ax + s.dx * t + rx * off, z = s.az + s.dz * t + rz * off;
      lampSpots.push({ x, z, yaw: Math.atan2(-rx, -rz) });
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.5, metalness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 });
  nightMats.push({ mat: headMat, max: 6 });
  const poles = new THREE.InstancedMesh(poleG, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headG, headMat, lampSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = V(0, 1, 0);
  lampSpots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw); m4.compose(V(p.x, 0, p.z), q, sc);
    poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
    lamps.push({ x: p.x + Math.sin(p.yaw) * 2.5, y: 7.7, z: p.z + Math.cos(p.yaw) * 2.5 });
    addCircle(p.x, p.z, 0.2);
  });
  poles.castShadow = true; group.add(poles, heads);

  // --- city buildings
  const facades = [];
  for (let i = 0; i < TX.FACADE_COUNT; i++) {
    const f = TX.facadeTex(i);
    const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: i === 2 ? 0.25 : 0.8, metalness: i === 2 ? 0.6 : 0.05 });
    nightMats.push({ mat, max: 1.6 });
    facades.push({ mat, geos: [] });
  }
  const roofBits = [];
  const B = [-300, -200, -100, 0, 100, 200];
  for (const bx of B) for (const bz of B) {
    if (bx === 0 && bz === 0) { cityPark(group, addMesh); continue; }
    const x0 = bx + 8 + 4, x1 = bx + 100 - 8 - 4, z0 = bz + 8 + 4, z1 = bz + 100 - 8 - 4;
    const n = rand() < 0.5 ? 2 : 3, m = rand() < 0.5 ? 2 : 3;
    const lw = (x1 - x0) / n, ld = (z1 - z0) / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const cx = x0 + lw * (i + 0.5), cz = z0 + ld * (j + 0.5);
      const w = lw * rr(0.75, 0.95), d = ld * rr(0.75, 0.95);
      const dist = Math.hypot(cx, cz);
      let h = rr(12, 35) + Math.max(0, 1 - dist / 380) * rr(10, 150);
      const style = h > 80 ? pick([2, 3, 2, 0]) : pick([0, 1, 4, 1, 3]);
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const idx = f * 4 + v;
        if (f === 2 || f === 3) { uv.setXY(idx, 0.5, 0.996); continue; }
        const faceW = f < 2 ? d : w;
        uv.setXY(idx, uv.getX(idx) * faceW / 12, uv.getY(idx) * h / 28);
      }
      g.translate(cx, h / 2, cz);
      facades[style].geos.push(g);
      addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);
      // roof units
      cityRoofs.push([cx, h, cz, w, d]);
      for (let k = 0; k < 1; k++) roofBits.push(boxGeo(rr(2, 5), rr(1, 2.5), rr(2, 5), cx + rr(-w / 3, w / 3), h + 0.8, cz + rr(-d / 3, d / 3)));
      if (h > 90) roofBits.push(new THREE.CylinderGeometry(0.15, 0.15, 12).translate(cx, h + 6, cz));
    }
  }
  for (const f of facades) if (f.geos.length) addMesh(merge(f.geos), f.mat);
  addMesh(merge(roofBits), new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.7, metalness: 0.3 }));

  // --- neighborhood houses
  const ht = TX.houseTex();
  const houseMat = new THREE.MeshStandardMaterial({ map: ht.map, emissiveMap: ht.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.85 });
  nightMats.push({ mat: houseMat, max: 1.4 });
  const roofMat = new THREE.MeshStandardMaterial({ map: TX.roofTex(), vertexColors: true, roughness: 0.9 });
  const walls = [], roofs = [], drives = [], leafyHood = [];
  const HC = [0xf2efe6, 0xd9cdb4, 0xa9b8c4, 0xc7d1b5, 0xe8d8c0, 0x9aa5ad, 0xd6b9a0, 0xffffff, 0x8c9c8a];
  const RC = [0x4a4a4a, 0x5a3e32, 0x3a3f46, 0x6b5a4a, 0x2f2f2f];
  for (let bx = 300; bx < 900; bx += 100) for (let bz = -300; bz < 300; bz += 100) {
    for (const [qi, qj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const lx = bx + 5 + 2 + qi * 45 + 22.5, lz = bz + 5 + 2 + qj * 45 + 22.5;
      // face toward nearest street side in z
      const fz = qj === 0 ? -1 : 1;
      const w = rr(11, 16), d = rr(9, 12), floors = rand() < 0.45 ? 2 : 1, h = floors * 3;
      const cx = lx + rr(-4, 4), cz = lz + fz * 7;
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const idx = f * 4 + v;
        if (f === 2 || f === 3) { uv.setXY(idx, 0.5, 0.995); continue; }
        const faceW = f < 2 ? d : w;
        uv.setXY(idx, uv.getX(idx) * faceW / 8, uv.getY(idx) * floors);
      }
      g.translate(cx, h / 2, cz); colorize(g, pick(HC)); walls.push(g);
      // gable roof
      const rh = rr(2, 3.5), ov = 0.5;
      const shape = new THREE.Shape(); shape.moveTo(-d / 2 - ov, 0); shape.lineTo(d / 2 + ov, 0); shape.lineTo(0, rh); shape.closePath();
      const rg = new THREE.ExtrudeGeometry(shape, { depth: w + ov * 2, bevelEnabled: false });
      rg.translate(0, 0, -(w + ov * 2) / 2); rg.rotateY(Math.PI / 2);
      const ruv = rg.attributes.uv; for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) / 4, ruv.getY(i) / 4);
      rg.translate(cx, h, cz); colorize(rg, pick(RC)); roofs.push(rg);
      addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h + rh);
      // driveway to street
      const streetZ = fz < 0 ? bz : bz + 100;
      const dx = cx + w / 2 - 3;
      const z0 = cz + fz * d / 2, z1 = streetZ - fz * 5;
      const dl = Math.abs(z1 - z0);
      drives.push(new THREE.PlaneGeometry(4, dl).rotateX(-Math.PI / 2).translate(dx, 0.04, (z0 + z1) / 2));
      if (rand() < 0.35) parkedSpots.push({ x: dx, z: (z0 + z1) / 2, yaw: fz > 0 ? 0 : Math.PI });
      // yard trees
      for (let k = 0; k < 3; k++) {
        const tx = lx + rr(-20, 20), tz = lz + rr(-20, 20);
        if (Math.abs(tx - cx) < w / 2 + 3 && Math.abs(tz - cz) < d / 2 + 3) continue;
        if (Math.abs(tx - dx) < 4) continue;
        leafyHood.push([tx, 0, tz, rr(0.6, 1.1)]);
      }
    }
  }
  addMesh(merge(walls), houseMat);
  addMesh(merge(roofs), roofMat);
  const drMap = TX.sidewalkTex(); drMap.repeat.set(1, 4);
  addMesh(merge(drives), new THREE.MeshStandardMaterial({ map: drMap, roughness: 0.9 }), false, true);

  // --- forest terrain mesh
  const FW = FOREST.x1 - FOREST.x0, FD = FOREST.z1 - FOREST.z0;
  const tg = new THREE.PlaneGeometry(FW, FD, Math.round(FW / 3.5), Math.round(FD / 3.5)).rotateX(-Math.PI / 2);
  tg.translate((FOREST.x0 + FOREST.x1) / 2, 0, (FOREST.z0 + FOREST.z1) / 2);
  const p = tg.attributes.position; const cols = new Float32Array(p.count * 3);
  const cG1 = new THREE.Color(0x56702e), cG2 = new THREE.Color(0x3d5222), cMoss = new THREE.Color(0x6a6a34), cDirt = new THREE.Color(0x7a5c3c), cRock = new THREE.Color(0x77736a), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = terrainH(x, z) - 0.02; p.setY(i, y);
    const n = fbm(x * 0.02, z * 0.02, 3);
    tmp.copy(cG1).lerp(cG2, n).lerp(cMoss, Math.max(0, fbm(x * 0.006 + 9, z * 0.006, 2) - 0.5) * 1.6);
    const td = trailDist(x, z);
    const jp = x > JUMPPARK.x0 - 4 && x < JUMPPARK.x1 + 4 && z > JUMPPARK.z0 - 4 && z < JUMPPARK.z1 + 4;
    if (jp) tmp.copy(cDirt);
    else tmp.lerp(cDirt, 1 - smoothstep(1.2, 3.6, td));
    const sl = Math.abs(terrainH(x + 2, z) - terrainH(x - 2, z)) + Math.abs(terrainH(x, z + 2) - terrainH(x, z - 2));
    tmp.lerp(cRock, smoothstep(2.5, 5, sl));
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const fgD = TX.imgTex('forest_ground_04_diff');
  if (fgD) {
    // blend real forest-floor / dirt-path / grass photo textures by vertex weights
    const w = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), td = trailDist(x, z);
      const jp = x > JUMPPARK.x0 - 4 && x < JUMPPARK.x1 + 4 && z > JUMPPARK.z0 - 4 && z < JUMPPARK.z1 + 4;
      const dirt = jp ? 1 : 1 - smoothstep(1.4, 3.4, td);
      const grass = (1 - dirt) * (0.45 + 0.55 * smoothstep(0.3, 0.6, fbm(x * 0.008 + 4, z * 0.008, 3)));
      w[i * 3] = dirt; w[i * 3 + 1] = grass; w[i * 3 + 2] = 0.7 + fbm(x * 0.05, z * 0.05, 2) * 0.35;
    }
    tg.setAttribute('blend', new THREE.BufferAttribute(w, 3));
    const mat = new THREE.MeshStandardMaterial({ map: fgD, normalMap: TX.imgTex('forest_ground_04_nor', 1, 1, false), roughness: 1 });
    const T = 1 / 3.0;
    const dirtT = TX.imgTex('stony_dirt_path_diff'), grassT = TX.imgTex('leafy_grass_diff'), dirtN = TX.imgTex('stony_dirt_path_nor', 1, 1, false);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.dirtMap = { value: dirtT }; sh.uniforms.grassMap = { value: grassT }; sh.uniforms.dirtNor = { value: dirtN };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 blend; varying vec3 vBlend; varying vec2 vW;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBlend = blend; vW = (modelMatrix * vec4(position,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D dirtMap; uniform sampler2D grassMap; uniform sampler2D dirtNor; varying vec3 vBlend; varying vec2 vW;')
        .replace('#include <map_fragment>', `vec2 tuv = vW * ${T.toFixed(4)};
          vec4 cF = texture2D(map, tuv); vec4 cF2 = texture2D(map, tuv * 0.13 + 0.37);
          cF = mix(cF, cF2, 0.35);
          vec4 cD = texture2D(dirtMap, tuv * 1.2); vec4 cG = texture2D(grassMap, tuv * 1.4);
          vec4 tc = mix(mix(cF, cG * vec4(0.85, 0.95, 0.7, 1.0), vBlend.g), cD, vBlend.r);
          diffuseColor *= tc * vec4(vec3(vBlend.b), 1.0);`)
        .replace('#include <normal_fragment_maps>', `vec3 mapN = mix(texture2D(normalMap, vW * ${T.toFixed(4)}).xyz, texture2D(dirtNor, vW * ${(T * 1.2).toFixed(4)}).xyz, vBlend.r) * 2.0 - 1.0;
          mapN.xy *= normalScale; normal = normalize(tbn * mapN);`);
    };
    addMesh(tg, mat, false, true);
  } else {
    const det = TX.detailTex(); det.repeat.set(FW / 6, FD / 6);
    addMesh(tg, new THREE.MeshStandardMaterial({ map: det, vertexColors: true, roughness: 1 }), false, true);
  }

  // --- ramps
  const rg = [];
  for (const r of ramps) {
    const shape = new THREE.Shape();
    if (r.type === 'kick') { shape.moveTo(0, 0); for (let k = 1; k <= 8; k++) shape.lineTo(r.len * k / 8, r.h * Math.pow(k / 8, 1.25)); shape.lineTo(r.len, 0); }
    else { shape.moveTo(0, 0); shape.lineTo(0, r.h); shape.lineTo(r.len, 0); }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: r.w, bevelEnabled: false });
    g.translate(0, 0, -r.w / 2); g.rotateY(-Math.PI / 2); // shape x -> +z
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    g.rotateY(r.yaw); g.translate(r.x, terrainH(r.x, r.z) - 0.02, r.z);
    rg.push(g);
  }
  const dirtMap = TX.dirtTex(); dirtMap.repeat.set(0.4, 0.4);
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtMap, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: TX.woodTex(), roughness: 0.8 });
  const forestR = [], plazaR = [];
  ramps.forEach((r, i) => (r.x < -400 ? forestR : plazaR).push(rg[i]));
  addMesh(merge(forestR), dirtMat); addMesh(merge(plazaR), woodMat);

  // --- vegetation
  const pine = pineGeo(), leafy = leafyGeo(), rockG = jitterVerts(new THREE.DodecahedronGeometry(1, 1), 0.35), bushG = jitterVerts(new THREE.IcosahedronGeometry(1, 1), 0.3);
  const pines = [], leafs = [...leafyHood], rocks = [], bushes = [];
  const clearOf = (x, z, rad) => {
    const r = nearestRoad(x, z); if (r.d < r.seg.w / 2 + rad) return false;
    if (trailDist(x, z) < 3 + rad) return false;
    if (x > JUMPPARK.x0 - 10 && x < JUMPPARK.x1 + 10 && z > JUMPPARK.z0 - 10 && z < JUMPPARK.z1 + 10) return false;
    return true;
  };
  for (let i = 0; i < 9000 && pines.length < 3200; i++) {
    const x = rr(FOREST.x0 + 5, FOREST.x1 - 5), z = rr(FOREST.z0 + 5, FOREST.z1 - 5);
    if (fbm(x * 0.01, z * 0.01, 2) < 0.38) continue; // clearings
    if (!clearOf(x, z, 2)) continue;
    const s = rr(0.7, 1.5);
    if (rand() < 0.78) pines.push([x, terrainH(x, z) - 0.2, z, s]); else leafs.push([x, terrainH(x, z) - 0.2, z, s]);
    addCircle(x, z, 0.35 * s + 0.15, 20);
  }
  for (let i = 0; i < 700; i++) {
    const x = rr(FOREST.x0, FOREST.x1), z = rr(FOREST.z0, FOREST.z1);
    if (!clearOf(x, z, 1)) continue;
    const s = rr(0.3, 1.6); rocks.push([x, terrainH(x, z) - 0.2 * s, z, s]); if (s > 0.7) addCircle(x, z, s * 0.9, 2);
  }
  for (let i = 0; i < 2500; i++) {
    const x = rr(FOREST.x0, FOREST.x1), z = rr(FOREST.z0, FOREST.z1);
    if (!clearOf(x, z, 0)) continue;
    bushes.push([x, terrainH(x, z), z, rr(0.4, 1.1)]);
  }
  // countryside trees
  for (let i = 0; i < 1400; i++) {
    const x = rr(-1250, 1250), z = rr(-950, 950);
    if (x > FOREST.x0 - 5 && x < FOREST.x1 + 5 && z > FOREST.z0 - 5 && z < FOREST.z1 + 5) continue;
    if (x > CITY.x0 - 15 && x < HOOD.x1 + 15 && z > CITY.z0 - 15 && z < CITY.z1 + 15) continue;
    if (!clearOf(x, z, 4)) continue;
    if (Math.abs(x + 330) < 30 && Math.abs(z) < 30) continue;
    const s = rr(0.7, 1.4);
    (rand() < 0.4 ? pines : leafs).push([x, -0.1, z, s]); addCircle(x, z, 0.4 * s, 20);
  }
  for (const t of leafyHood) addCircle(t[0], t[2], 0.35 * t[3], 20);
  const inst = (geo, mat, list, rotRand = true, cast = true) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const c = new THREE.Color();
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, rotRand ? rand() * 6.28 : 0);
      m4.compose(V(t[0], t[1], t[2]), q, V(t[3], t[3] * rr(0.85, 1.15), t[3]));
      im.setMatrixAt(i, m4);
      c.setHSL(0, 0, rr(0.75, 1.15)); im.setColorAt(i, c);
    });
    im.castShadow = cast; im.receiveShadow = true; group.add(im); return im;
  };
  const A = assets || {};
  const glbInst = (gltf, list, { cast = true, yScaleJitter = 0.15, pick = null, norm = false } = {}) => {
    const out = [], geos = [];
    gltf.scene.updateMatrixWorld(true);
    for (const top of gltf.scene.children) {
      if (pick && !pick.includes(top.name)) continue;
      top.traverse((o) => { if (o.isMesh) geos.push([o.geometry.clone().applyMatrix4(o.matrixWorld), o.material]); });
    }
    const bb = new THREE.Box3(); for (const [g] of geos) { g.computeBoundingBox(); bb.union(g.boundingBox); }
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const sz = bb.getSize(V(0, 0, 0)), nk = norm ? 1 / Math.max(sz.x, sz.z) : 1;
    for (const [g, m] of geos) { g.translate(-cx, -bb.min.y, -cz); if (norm) g.scale(nk, nk, nk); out.push(new THREE.InstancedMesh(g, m, list.length)); }
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t[4] ?? rand() * 6.28);
      m4.compose(V(t[0], t[1], t[2]), q, V(t[3], t[3] * rr(1 - yScaleJitter, 1 + yScaleJitter), t[3]));
      for (const im of out) im.setMatrixAt(i, m4);
    });
    for (const im of out) { im.castShadow = cast; im.receiveShadow = true; group.add(im); }
    return out;
  };
  const split = (list, n) => { const o = Array.from({ length: n }, () => []); list.forEach((t) => o[(rand() * n) | 0].push(t)); return o; };
  if (A.imp && A.imp.pine1) {
    const pv = split(pines, 3);
    ['pine1', 'pine2', 'pine3'].forEach((k, i) => { const I = A.imp[k]; if (I) group.add(makeImpostorMesh(pv[i].map((t) => [t[0], t[1], t[2], t[3] * 0.78]), I.lit, I.nrm, I.meta)); });
    const lv = split(leafs.filter((t) => !t.hood), 2);
    if (A.imp.jacaranda) group.add(makeImpostorMesh(lv[0].concat(leafyHood).map((t) => [t[0], t[1], t[2], t[3] * 0.55]), A.imp.jacaranda.lit, A.imp.jacaranda.nrm, A.imp.jacaranda.meta));
    if (A.imp.island) group.add(makeImpostorMesh(lv[1].map((t) => [t[0], t[1], t[2], t[3] * 2.2]), A.imp.island.lit, A.imp.island.nrm, A.imp.island.meta));
  } else {
    const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: false });
    inst(pine, vegMat, pines);
    inst(leafy, vegMat, leafs);
  }
  if (A.props && A.props.rock_07) {
    const rv = split(rocks, 3);
    glbInst(A.props.rock_07, rv[0].map((t) => [t[0], t[1] - 0.15 * t[3], t[2], t[3] * 1.6]), { norm: true });
    glbInst(A.props.rock_09, rv[1].map((t) => [t[0], t[1] - 0.15 * t[3], t[2], t[3] * 1.6]), { norm: true });
    glbInst(A.props.boulder_01, rv[2].filter((t, i) => i % 2 === 0).map((t) => [t[0], t[1] - 0.3 * t[3], t[2], t[3] * 3]), { norm: true });
  } else inst(rockG, new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.95, flatShading: true }), rocks);
  if (A.props && A.props.fern_02) split(bushes, 4).forEach((l, i) => glbInst(A.props.fern_02, l.map((t) => [t[0], t[1] - 0.05, t[2], t[3] * 1.6]), { cast: false, pick: [['fern_02_a', 'fern_02_b', 'fern_02_c', 'fern_02_d'][i]] }));
  else inst(bushG, new THREE.MeshStandardMaterial({ color: 0x3f5a24, roughness: 1, flatShading: true }), bushes, true, false);
  if (A.props && A.props.dead_tree_trunk) {
    const logs = [];
    for (let i = 0; i < 160; i++) { const x = rr(FOREST.x0, FOREST.x1), z = rr(FOREST.z0, FOREST.z1); if (!clearOf(x, z, 3)) continue; logs.push([x, terrainH(x, z) - 0.1, z, rr(0.8, 1.3)]); addCircle(x, z, 1.0, 1.2); }
    glbInst(A.props.dead_tree_trunk, logs);
  }
  if (!A.grass) {
    const tuftG = merge([0, 1, 2].map((k) => new THREE.PlaneGeometry(0.5, 0.45).translate(0, 0.22, 0).rotateY(k * Math.PI / 3)));
    const tufts = [];
    for (let i = 0; i < 12000; i++) {
      const x = rr(FOREST.x0, FOREST.x1), z = rr(FOREST.z0, FOREST.z1);
      const td = trailDist(x, z); if (td < 2.2 || Math.abs(z) < 7) continue;
      tufts.push([x, terrainH(x, z) - 0.03, z, rr(0.6, 1.4)]);
    }
    inst(tuftG, new THREE.MeshStandardMaterial({ color: 0x5f7a32, roughness: 1, side: THREE.DoubleSide }), tufts, true, false);
  }
  // --- city props (photoscanned)
  if (A.props && A.props.fire_hydrant) {
    const hyd = [], cans = [], benches = [], ac = [];
    for (const s2 of roads) {
      if (s2.kind !== 'city' && s2.kind !== 'hood') continue;
      if (s2.ax > CITY.x1 + 1 && s2.kind === 'city') continue;
      for (let t = 20; t < s2.len - 20; t += s2.kind === 'city' ? 26 : 60) for (const side of [-1, 1]) {
        const rx = -s2.dz * side, rz = s2.dx * side, off = s2.w / 2 + (s2.kind === 'city' ? 2.8 : 1.5);
        const x = s2.ax + s2.dx * t + rx * off, z = s2.az + s2.dz * t + rz * off;
        const r = rand();
        if (r < 0.18) { hyd.push([x, 0.02, z, 1]); addCircle(x, z, 0.25, 1); }
        else if (r < 0.38 && s2.kind === 'city') { cans.push([x, 0.02, z, 1]); addCircle(x, z, 0.35, 1); }
        else if (r < 0.5 && s2.kind === 'city') { benches.push([x + rx * 0.8, 0.02, z + rz * 0.8, 1, Math.atan2(rx, rz)]); }
      }
    }
    glbInst(A.props.fire_hydrant, hyd, { yScaleJitter: 0, pick: ['fire_hydrant', 'fire_hydrant_cap_01'] });
    glbInst(A.props.metal_trash_can, cans, { yScaleJitter: 0, pick: ['metal_trash_can', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right'] });
    glbInst(A.props.modular_street_seating, benches, { yScaleJitter: 0, pick: ['crossbar', 'legs_double', 'legs_single', 'back_support_r', 'back_support_l', 'arm_rest_01', 'arm_rest_02', 'seat', 'seat_back'] });
    for (const b of cityRoofs) for (let k = 0; k < 2; k++) ac.push([b[0] + rr(-b[3] / 3, b[3] / 3), b[1], b[2] + rr(-b[4] / 3, b[4] / 3), 1.5]);
    glbInst(A.props.exterior_aircon_unit, ac, { yScaleJitter: 0, pick: ['exterior_aircon_unit'] });
  }

  // --- distant mountains
  const mg = new THREE.CylinderGeometry(3200, 3300, 400, 160, 6, true);
  const mp = mg.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i), a = Math.atan2(z, x);
    const top = y > 0 ? 1 : 0;
    const hgt = (fbm(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, 5) * 650 + 50) * (y + 200) / 400;
    mp.setY(i, hgt - 30);
  }
  mg.computeVertexNormals();
  addMesh(mg, new THREE.MeshStandardMaterial({ color: 0x4d5a52, roughness: 1, side: THREE.DoubleSide }), false, false);

  return group;
}

function cityPark(group, addMesh) {
  const g = new THREE.PlaneGeometry(76, 76).rotateX(-Math.PI / 2).translate(50, 0.05, 50);
  const gm = TX.grassTex(); gm.repeat.set(8, 8);
  addMesh(g, new THREE.MeshStandardMaterial({ map: gm, roughness: 1 }), false, true);
}

function pineGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.12, 0.32, 4, 7).translate(0, 2, 0), 0x4a3626)];
  const fol = [0x22381c, 0x2a4420, 0x1e3218];
  for (let k = 0; k < 5; k++) {
    const r = 2.6 - k * 0.45, h = 3.4 - k * 0.3, y = 2.2 + k * 1.75;
    const c = jitterVerts(new THREE.ConeGeometry(r, h, 9, 2).translate(0, y + h / 2, 0), 0.35);
    parts.push(colorize(c, fol[k % 3], 0.25));
  }
  return merge(parts);
}
function leafyGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.18, 0.35, 4.5, 7).translate(0, 2.25, 0), 0x5a4532)];
  parts.push(colorize(tubeGeo(V(0, 3.2, 0), V(1.2, 4.8, 0.3), 0.12, 0.08), 0x5a4532));
  parts.push(colorize(tubeGeo(V(0, 3.4, 0), V(-1, 5, -0.6), 0.12, 0.08), 0x5a4532));
  const fol = [0x3d5a22, 0x4a6a2a, 0x35501e, 0x557530];
  for (const [x, y, z, r] of [[0, 6, 0, 2.6], [1.4, 5.3, 0.5, 1.9], [-1.3, 5.5, -0.6, 2], [0.2, 7.3, -0.3, 1.8], [-0.4, 5, 1.3, 1.7]]) {
    parts.push(colorize(jitterVerts(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0.6), pick(fol), 0.3));
  }
  return merge(parts);
}

// minimap image
export function makeMapCanvas() {
  const S = 0.5, X0 = -1250, Z0 = -950, W = 2500 * S, H = 1900 * S;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#3d5a2a'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#21381a'; x.fillRect((FOREST.x0 - X0) * S, (FOREST.z0 - Z0) * S, (FOREST.x1 - FOREST.x0) * S, (FOREST.z1 - FOREST.z0) * S);
  x.fillStyle = '#6b6b6b'; x.fillRect((CITY.x0 - X0) * S, (CITY.z0 - Z0) * S, 600 * S, 600 * S);
  x.strokeStyle = '#a07a4a'; x.lineWidth = 2;
  for (const t of trails) { x.beginPath(); t.forEach(([px, pz], i) => (i ? x.lineTo : x.moveTo).call(x, (px - X0) * S, (pz - Z0) * S)); x.stroke(); }
  for (const s of roads) {
    x.strokeStyle = s.kind === 'hwy' ? '#f0c040' : '#e8e8e8'; x.lineWidth = s.w * S * 1.3;
    x.beginPath(); x.moveTo((s.ax - X0) * S, (s.az - Z0) * S); x.lineTo((s.bx - X0) * S, (s.bz - Z0) * S); x.stroke();
  }
  return { canvas: c, S, X0, Z0 };
}
