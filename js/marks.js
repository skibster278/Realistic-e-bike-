import * as THREE from 'three';
import { groundH } from './world.js';

// Tyre marks: black rubber on tarmac under hard braking / slides, brown ruts on dirt & grass under power
export class TyreMarks {
  constructor(scene, n = 900) {
    this.n = n; this.i = 0; this.last = null; this.lastDirt = null;
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mk = (color, op) => {
      const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), n);
      m.count = 0; m.frustumCulled = false; m.receiveShadow = true; scene.add(m); return m;
    };
    this.rubber = this.mk(0x0a0a0a, 0.55); this.rut = this.mk(0x3a2a1a, 0.6);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0);
    this.ir = 0; this.id = 0;
  }
  put(mesh, idxKey, x, z, yaw, w, len) {
    const i = this[idxKey]; this[idxKey] = (i + 1) % this.n;
    this.q.setFromAxisAngle(this.up, yaw);
    this.m4.compose(new THREE.Vector3(x, groundH(x, z) + 0.115, z), this.q, new THREE.Vector3(w, 1, len));
    mesh.setMatrixAt(i, this.m4); mesh.count = Math.max(mesh.count, i + 1); mesh.instanceMatrix.needsUpdate = true;
  }
  update(p, inp) {
    if (!p.alive || p.air) { this.last = this.lastDirt = null; return; }
    const v = Math.abs(p.speed), x = p.pos.x, z = p.pos.z;
    const tarmac = p.surface === 'asphalt' || p.surface === 'concrete';
    const skid = tarmac && ((inp.brake && v > 7) || (inp.handbrake && v > 4) || (p.pitch > 0.08 && p.accel > 6));
    const rut = !tarmac && v > 1.5 && (p.accel > 1.5 || p.surface === 'dirt');
    for (const [on, key, mesh, idx, w] of [[skid, 'last', this.rubber, 'ir', 0.11], [rut, 'lastDirt', this.rut, 'id', p.surface === 'dirt' ? 0.16 : 0.13]]) {
      if (!on) { this[key] = null; continue; }
      const l = this[key];
      if (!l) { this[key] = { x, z }; continue; }
      const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz);
      if (d < 0.35) continue;
      this.put(mesh, idx, (x + l.x) / 2, (z + l.z) / 2, Math.atan2(dx, dz), w, d + 0.04);
      this[key] = { x, z };
    }
  }
}
