import * as THREE from 'three';
import { IMP_UNIFORMS } from './impostor.js';
import { terrainH, surfaceAt, FOREST, HOOD, CITY } from './world.js';

// World-space data texture: R = terrain height, G = grass density
const X0 = -1260, Z0 = -960, W = 2520, D = 1920, RES = 4;
export function makeGroundData() {
  const w = W / RES, h = D / RES, data = new Uint16Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = X0 + (i + 0.5) * RES, z = Z0 + (j + 0.5) * RES, k = (j * w + i) * 4;
    data[k] = THREE.DataUtils.toHalfFloat(terrainH(x, z));
    const s = surfaceAt(x, z);
    let dens = s === 'grass' ? 1 : 0;
    if (dens && x > HOOD.x0 && x < HOOD.x1 && z > HOOD.z0 && z < HOOD.z1) dens = 0.55;
    if (x > CITY.x0 - 8 && x < CITY.x1 + 8 && z > CITY.z0 - 8 && z < CITY.z1 + 8) dens = s === 'grass' ? 0.5 : 0;
    if (dens && x > FOREST.x0 && x < FOREST.x1 && z > FOREST.z0 && z < FOREST.z1) dens = 0.85;
    data[k + 1] = THREE.DataUtils.toHalfFloat(dens);
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export function makeGrass(cardTex, groundTex, count = 8000, R = 42) {
  const g = new THREE.BufferGeometry();
  // two crossed quads, 1x1, bottom at 0
  const P = [], U = [], I = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3 + 0.3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const ig = new THREE.InstancedBufferGeometry().copy(g); ig.instanceCount = count;
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { off[i * 4] = (Math.random() * 2 - 1) * R; off[i * 4 + 1] = (Math.random() * 2 - 1) * R; off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = Math.random(); }
  ig.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...IMP_UNIFORMS, cards: { value: cardTex }, ground: { value: groundTex }, center: { value: new THREE.Vector2() }, R: { value: R },
      g0: { value: new THREE.Vector2(X0, Z0) }, gSize: { value: new THREE.Vector2(W, D) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aOff; uniform vec2 center, g0, gSize; uniform float R, time; uniform sampler2D ground;
      uniform float fogNear, fogFar;
      varying vec2 vUv; varying float vFog, vShade;
      void main(){
        float T = 2.0 * R;
        vec2 wp = aOff.xy + T * floor((center - aOff.xy) / T + 0.5);
        vec4 gd = texture2D(ground, (wp - g0) / gSize);
        float d = length(wp - center) / R;
        float s = (0.55 + aOff.z * 0.7) * smoothstep(1.0, 0.75, d);
        s *= smoothstep(aOff.w - 0.08, aOff.w + 0.08, gd.g) * step(0.25, gd.g);
        float rot = aOff.z * 6.283;
        vec3 p = position; p.xz = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p.xz;
        p *= vec3(1.35, 0.65, 1.35) * s;
        float sw = sin(time * 2.1 + wp.x * 0.35 + wp.y * 0.27) + 0.5 * sin(time * 3.7 + wp.x * 0.9);
        p.xz += position.y * position.y * vec2(0.09, 0.05) * sw;
        vec3 world = vec3(wp.x, gd.r - 0.04, wp.y) + p;
        float col = floor(aOff.z * 3.999);
        vUv = vec2((col + uv.x) / 4.0, uv.y);
        vShade = 0.55 + 0.45 * position.y;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        vFog = smoothstep(fogNear, fogFar, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D cards; uniform vec3 sunDir, sunCol, ambCol, fogCol;
      varying vec2 vUv; varying float vFog, vShade;
      void main(){
        vec4 c = texture2D(cards, vUv);
        if (c.a < 0.5) discard;
        vec3 col = c.rgb * 2.6 * vShade * (ambCol * 1.3 + sunCol * (0.5 + 0.5 * max(sunDir.y, 0.0)));
        col = mix(col, fogCol, vFog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(ig, mat);
  mesh.frustumCulled = false;
  mesh.update = (px, pz) => mat.uniforms.center.value.set(px, pz);
  return mesh;
}
