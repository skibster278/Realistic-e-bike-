import * as THREE from 'three';
import { IMP_UNIFORMS } from './impostor.js';

// Soft dust / roost particles kicked up by the rear tyre on dirt & grass
export class Dust {
  constructor(scene, n = 260) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.size = new Float32Array(n); this.age = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.age, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ...IMP_UNIFORMS, map: { value: new THREE.CanvasTexture(c) }, col: { value: new THREE.Color(0.42, 0.34, 0.24) }, scale: { value: 600 } },
      vertexShader: `attribute float aLife; attribute float aSize; uniform float scale; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aLife; gl_PointSize = aSize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 col, sunCol, ambCol; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA * vA * 0.16; if (a < 0.01) discard;
          gl_FragColor = vec4(col * (ambCol * 1.5 + sunCol * 0.9), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, size, life) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; this.age[i] = 1; this.size[i] = size;
  }
  update(dt, player, bike) {
    const v = Math.abs(player.speed), surf = player.surface;
    const loose = surf === 'dirt' ? 1 : surf === 'grass' ? 0.45 : 0;
    if (player.alive && !player.air && loose > 0 && (v > 2 || player.accel > 2)) {
      const rate = loose * (Math.min(1, v / 12) * 18 + Math.max(0, player.accel) * 3);
      const n = Math.min(8, Math.floor(rate * dt + Math.random()));
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      for (let k = 0; k < n; k++) {
        const sp = 1.5 + Math.random() * 2 + Math.max(0, player.accel) * 0.35;
        this.emit(player.pos.x - fx * 0.15 + (Math.random() - 0.5) * 0.3, player.pos.y + 0.12, player.pos.z - fz * 0.15 + (Math.random() - 0.5) * 0.3,
          -fx * sp + (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.6, -fz * sp + (Math.random() - 0.5) * 1.2, 0.25 + Math.random() * 0.35, 0.8 + Math.random() * 0.8);
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] <= 0) continue;
      this.age[i] -= dt / this.life[i];
      const k = i * 3, drag = Math.exp(-dt * 1.8);
      this.vel[k] *= drag; this.vel[k + 2] *= drag; this.vel[k + 1] = this.vel[k + 1] * drag - 0.6 * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += dt * 0.7;
      if (this.age[i] < 0) this.age[i] = 0;
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.aLife.needsUpdate = a.aSize.needsUpdate = true;
  }
}
