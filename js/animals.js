import * as THREE from 'three';
import { FOREST, terrainH } from './world.js';
import { rr, rand, tubeGeo, V } from './util.js';

const fur = new THREE.MeshStandardMaterial({ color: 0x8a6540, roughness: 0.95 });
const furDark = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.95 });
const white = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.95 });
const antlerM = new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.8 });
const bunnyM = new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 1 });
const eyeM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });

// ---- realistic procedural white-tailed deer: shaped body, jointed legs, fur gradient, antlers
const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, map: furTex() });
const hoofM = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.5 });
const noseM = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.3 });
function furTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) { const v = 150 + Math.random() * 105; x.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.5)`; const px = Math.random() * 128, py = Math.random() * 128; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 2, py + 3 + Math.random() * 3); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const C_BACK = new THREE.Color(0x6a4a2e), C_SIDE = new THREE.Color(0x9a6c42), C_BELLY = new THREE.Color(0xe6dccb), C_WHITE = new THREE.Color(0xf2efe8), C_MUZ = new THREE.Color(0x3a2a1e);
function shade(g, fn) { // per-vertex colour from local position
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function deerBody() {
  // capsule along z, reshaped: deep chest, tucked belly, rounded rump
  const g = new THREE.CapsuleGeometry(0.27, 0.78, 8, 18).rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (z + 0.66) / 1.32; // 0 rump .. 1 chest
    const deep = 1 + 0.25 * Math.exp(-((t - 0.72) ** 2) / 0.03); // chest
    const tuck = y < 0 ? 1 - 0.28 * Math.exp(-((t - 0.38) ** 2) / 0.02) : 1; // belly tuck
    x *= 0.72 * (1 + 0.08 * Math.exp(-((t - 0.15) ** 2) / 0.02));
    y *= deep * tuck; if (y > 0) y *= 0.85 + 0.15 * t;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return shade(g, (c, x, y, z) => { const t = (z + 0.66) / 1.32; c.copy(C_SIDE).lerp(C_BACK, Math.max(0, y / 0.25) * 0.8); if (y < -0.12) c.lerp(C_BELLY, Math.min(1, (-0.12 - y) / 0.1)); if (t < 0.12 && y > -0.15) c.lerp(C_WHITE, 0.85 * Math.min(1, Math.abs(x) < 0.12 ? 1 : 0.4)); });
}
function deerHead() {
  const g = new THREE.SphereGeometry(0.12, 18, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const f = z > 0 ? 1 + z * 9 : 1; const taper = z > 0 ? 1 - z * 2.6 : 1; p.setXYZ(i, x * 0.8 * taper, y * 0.9 * (z > 0 ? 1 - z * 1.8 : 1) - (z > 0 ? z * z * 1.6 : 0), z * (z > 0 ? 2.4 : 1)); }
  g.computeVertexNormals();
  return shade(g, (c, x, y, z) => { c.copy(C_SIDE).lerp(C_BACK, 0.3); if (z > 0.2) c.lerp(C_MUZ, Math.min(1, (z - 0.2) / 0.05)); if (y < -0.04 && z > 0.05) c.lerp(C_WHITE, 0.7); });
}
function deerLeg(len1, len2, thick) {
  // upper and lower bones, each in its own pivot so knees bend
  const up = new THREE.Group(), low = new THREE.Group();
  const ug = shade(new THREE.CylinderGeometry(thick * 0.75, thick, len1, 10).translate(0, -len1 / 2, 0), (c, x, y) => c.copy(C_SIDE).lerp(C_BACK, 0.2));
  up.add(new THREE.Mesh(ug, furMat));
  low.position.y = -len1; up.add(low);
  const lg = shade(new THREE.CylinderGeometry(thick * 0.42, thick * 0.55, len2, 8).translate(0, -len2 / 2, 0), (c, x, y) => c.copy(C_SIDE).lerp(C_BELLY, 0.25));
  low.add(new THREE.Mesh(lg, furMat));
  const hoof = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.38, thick * 0.5, 0.06, 8).translate(0, -len2 - 0.02, 0.01), hoofM); low.add(hoof);
  return { up, low };
}
function antlers(head, sx) {
  const pts = [V(sx * 0.05, 0.1, -0.05), V(sx * 0.16, 0.24, -0.1), V(sx * 0.24, 0.34, 0.02), V(sx * 0.2, 0.42, 0.16)];
  const main = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.014, 6);
  head.add(new THREE.Mesh(main, antlerM));
  for (const [i, h] of [[1, 0.13], [2, 0.12], [2.6, 0.09]]) {
    const b = pts[Math.floor(i)].clone().lerp(pts[Math.min(3, Math.floor(i) + 1)], i % 1);
    head.add(new THREE.Mesh(tubeGeo(b, b.clone().add(V(sx * 0.01, h, 0.03)), 0.011, 0.005, 5), antlerM));
  }
}
function deer(buck) {
  const g = new THREE.Group();
  const s = buck ? 1.08 : 0.95;
  const torso = new THREE.Group(); torso.position.y = 1.04; g.add(torso);
  const body = new THREE.Mesh(deerBody(), furMat); body.castShadow = true; torso.add(body);
  // neck
  const neckG = shade(tubeGeo(V(0, 0.08, 0.42), V(0, 0.52, 0.66), 0.13, 0.075, 12), (c, x, y, z) => { c.copy(C_SIDE); if (y < 0.25 && z > 0.5) c.lerp(C_BELLY, 0.6); });
  torso.add(new THREE.Mesh(neckG, furMat));
  const head = new THREE.Group(); head.position.set(0, 0.55, 0.68); torso.add(head);
  const hm = new THREE.Mesh(deerHead(), furMat); hm.rotation.x = 0.35; head.add(hm);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), noseM); nose.position.set(0, -0.09, 0.26); head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(shade(new THREE.SphereGeometry(0.06, 10, 8).scale(0.45, 1.3, 0.25), (c) => c.copy(C_SIDE)), furMat);
    ear.position.set(sx * 0.09, 0.1, -0.06); ear.rotation.set(-0.3, 0, -sx * 0.9); head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeM); eye.position.set(sx * 0.075, 0.02, 0.06); head.add(eye);
    if (buck) antlers(head, sx);
  }
  // tail (white flag)
  const tail = new THREE.Mesh(shade(new THREE.SphereGeometry(0.06, 10, 8).scale(0.8, 1.6, 0.5), (c, x, y, z) => c.copy(z < 0 ? C_WHITE : C_SIDE)), furMat);
  tail.position.set(0, 0.12, -0.7); tail.rotation.x = 0.5; torso.add(tail);
  // legs: front (straight, knee forward) and hind (hock backwards)
  const legs = [];
  for (const [x, z, front] of [[0.12, 0.42, true], [-0.12, 0.42, true], [0.13, -0.42, false], [-0.13, -0.42, false]]) {
    const L = deerLeg(front ? 0.5 : 0.48, front ? 0.46 : 0.5, front ? 0.045 : 0.058);
    L.up.position.set(x, -0.05, z); torso.add(L.up);
    L.front = front; legs.push(L);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(s);
  return { g, legs, head, torso, tail, kind: 'deer', speed: 0, r: 0.6 };
}
function rabbit() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), bunnyM); b.scale.set(0.9, 0.85, 1.3); b.position.y = 0.13; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bunnyM); h.position.set(0, 0.24, 0.15); g.add(h);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12, 3, 6), bunnyM); e.position.set(s * 0.03, 0.36, 0.12); e.rotation.x = -0.3; e.rotation.z = s * 0.15; g.add(e); }
  const t = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), white); t.position.set(0, 0.15, -0.17); g.add(t);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legs: [], kind: 'rabbit', speed: 0, r: 0.2 };
}

export class Wildlife {
  constructor(scene) {
    this.scene = scene; this.list = [];
    for (let i = 0; i < 16; i++) this.add(deer(rand() < 0.4));
    for (let i = 0; i < 40; i++) this.add(rabbit());
    this.mixers = [];
  }
  add(a, x, z) {
    a.x = x ?? rr(FOREST.x0 + 40, FOREST.x1 - 40); a.z = z ?? rr(FOREST.z0 + 40, FOREST.z1 - 40);
    a.yaw = rand() * 6.28; a.state = 'idle'; a.timer = rr(1, 5); a.phase = rand() * 10; a.hop = 0;
    this.scene.add(a.g); this.list.push(a);
  }
  // optional real animated model (e.g. fox) via GLTF
  addAnimated(proto, clips, count, scale) {
    for (let i = 0; i < count; i++) {
      const g = proto();
      const mixer = new THREE.AnimationMixer(g);
      const acts = {}; for (const c of clips) acts[c.name.toLowerCase()] = mixer.clipAction(c);
      const a = { g, legs: [], kind: 'fox', speed: 0, r: 0.3, mixer, acts, cur: null };
      g.scale.setScalar(scale);
      this.add(a);
    }
  }
  update(dt, player) {
    for (const a of this.list) {
      const dx = player.pos.x - a.x, dz = player.pos.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 > 350 * 350) { a.g.visible = false; continue; }
      a.g.visible = true;
      const fleeR = a.kind === 'deer' ? 30 : 12;
      if (player.alive && d2 < fleeR * fleeR && Math.abs(player.speed) > 1.5) { a.state = 'flee'; a.timer = rr(2, 4); a.yaw = Math.atan2(-dx, -dz) + rr(-0.5, 0.5); }
      a.timer -= dt;
      if (a.timer <= 0) {
        if (a.state === 'flee' || a.state === 'walk') { a.state = 'idle'; a.timer = rr(2, 7); }
        else { a.state = 'walk'; a.timer = rr(2, 6); a.yaw += rr(-1.5, 1.5); }
      }
      const vmax = a.kind === 'deer' ? (a.state === 'flee' ? 13 : 1.3) : a.kind === 'fox' ? (a.state === 'flee' ? 9 : 1.2) : (a.state === 'flee' ? 7 : 0.6);
      const target = a.state === 'idle' ? 0 : vmax;
      a.speed += (target - a.speed) * Math.min(1, dt * 3);
      a.x += Math.sin(a.yaw) * a.speed * dt; a.z += Math.cos(a.yaw) * a.speed * dt;
      // stay inside forest
      if (a.x < FOREST.x0 + 20 || a.x > FOREST.x1 - 20 || a.z < FOREST.z0 + 20 || a.z > FOREST.z1 - 20) {
        a.yaw = Math.atan2((FOREST.x0 + FOREST.x1) / 2 - a.x, -a.z); a.x = Math.min(Math.max(a.x, FOREST.x0 + 20), FOREST.x1 - 20); a.z = Math.min(Math.max(a.z, FOREST.z0 + 20), FOREST.z1 - 20);
      }
      a.phase += dt * (a.speed * (a.kind === 'deer' ? 2.2 : 4) + 0.5);
      let y = terrainH(a.x, a.z);
      if (a.kind === 'deer') {
        const run = a.speed > 4;
        const amp = Math.min(1, a.speed * 0.14);
        a.legs.forEach((l, i) => {
          // walk: diagonal pairs; gallop: fronts together, hinds together, offset
          const off = run ? (l.front ? 0 : Math.PI * 0.75) + (i % 2) * 0.35 : (i === 0 || i === 3 ? 0 : Math.PI);
          const ph = a.phase + off, sw = Math.sin(ph);
          l.up.rotation.x = sw * 0.55 * amp + (run && !l.front ? 0.15 : 0);
          const lift = Math.max(0, Math.cos(ph));
          l.low.rotation.x = l.front ? -lift * 1.0 * amp : lift * 1.1 * amp + 0.25; // knees forward, hocks back
        });
        if (run) { y += Math.max(0, Math.sin(a.phase)) * 0.32; a.torso.rotation.x = Math.sin(a.phase + 0.5) * 0.12; } else a.torso.rotation.x = 0;
        a.tail.rotation.x = a.state === 'flee' ? -0.6 : 0.5; // tail flag up when fleeing
        a.head.rotation.x = a.state === 'idle' ? 1.0 + Math.sin(a.phase * 0.3) * 0.25 : 0.1;
      } else if (a.kind === 'rabbit') {
        if (a.speed > 0.2) y += Math.abs(Math.sin(a.phase * 1.4)) * (a.state === 'flee' ? 0.35 : 0.1);
      } else if (a.mixer) {
        const want = a.speed > 4 ? 'run' : a.speed > 0.3 ? 'walk' : 'survey';
        if (a.cur !== want && a.acts[want]) { a.acts[want].reset().fadeIn(0.3).play(); if (a.cur && a.acts[a.cur]) a.acts[a.cur].fadeOut(0.3); a.cur = want; }
        a.mixer.update(dt);
      }
      a.g.position.set(a.x, y, a.z); a.g.rotation.y = a.yaw;
    }
  }
  hit(x, z) {
    for (const a of this.list) { const dx = x - a.x, dz = z - a.z; if (dx * dx + dz * dz < (a.r + 0.4) ** 2) return a; }
    return null;
  }
}
