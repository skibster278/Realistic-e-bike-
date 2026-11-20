import * as THREE from 'three';
import { FOREST, terrainH } from './world.js';
import { rr, rand, tubeGeo, V } from './util.js';

const fur = new THREE.MeshStandardMaterial({ color: 0x8a6540, roughness: 0.95 });
const furDark = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.95 });
const white = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.95 });
const antlerM = new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.8 });
const bunnyM = new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 1 });
const eyeM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });

function deer(buck) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.85, 4, 12).rotateX(Math.PI / 2), fur); body.position.y = 1.0; body.scale.set(0.85, 1, 1); g.add(body);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8).rotateX(Math.PI / 2), white); belly.position.set(0, 0.88, 0); g.add(belly);
  const neck = new THREE.Mesh(tubeGeo(V(0, 1.05, 0.5), V(0, 1.55, 0.78), 0.14, 0.1), fur); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 1.6, 0.82); g.add(head);
  head.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8).rotateX(Math.PI / 2 - 0.5), fur));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeM); nose.position.set(0, -0.08, 0.22); head.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), furDark); ear.position.set(s * 0.1, 0.12, -0.05); ear.rotation.z = -s * 0.8; head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeM); eye.position.set(s * 0.075, 0.03, 0.08); head.add(eye);
    if (buck) {
      head.add(new THREE.Mesh(tubeGeo(V(s * 0.05, 0.1, -0.02), V(s * 0.25, 0.45, -0.1), 0.02, 0.012), antlerM));
      head.add(new THREE.Mesh(tubeGeo(V(s * 0.15, 0.27, -0.06), V(s * 0.12, 0.45, 0.1), 0.012, 0.008), antlerM));
      head.add(new THREE.Mesh(tubeGeo(V(s * 0.22, 0.4, -0.09), V(s * 0.35, 0.55, 0.02), 0.012, 0.006), antlerM));
    }
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), white); tail.position.set(0, 1.12, -0.7); tail.rotation.x = -2.3; g.add(tail);
  const legs = [];
  for (const [x, z] of [[0.15, 0.45], [-0.15, 0.45], [0.15, -0.45], [-0.15, -0.45]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.95, z); g.add(pivot);
    pivot.add(new THREE.Mesh(tubeGeo(V(0, 0, 0), V(0, -0.5, z > 0 ? 0.02 : -0.05), 0.07, 0.045), fur));
    pivot.add(new THREE.Mesh(tubeGeo(V(0, -0.5, z > 0 ? 0.02 : -0.05), V(0, -0.93, 0), 0.035, 0.03), furDark));
    legs.push(pivot);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legs, head, kind: 'deer', speed: 0, r: 0.6 };
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
        a.legs.forEach((l, i) => { const off = run ? (i < 2 ? 0 : Math.PI * 0.6) : (i === 0 || i === 3 ? 0 : Math.PI); l.rotation.x = Math.sin(a.phase + off) * Math.min(0.9, a.speed * 0.12); });
        if (run) y += Math.max(0, Math.sin(a.phase)) * 0.35;
        a.head.rotation.x = a.state === 'idle' ? 0.9 + Math.sin(a.phase * 0.3) * 0.2 : 0;
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
