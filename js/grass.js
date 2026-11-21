import * as THREE from 'three';
import { IMP_UNIFORMS } from './impostor.js';
import { terrainH, surfaceAt, nearestRoad, FOREST, HOOD, CITY } from './world.js';

// World-space data texture: R = terrain height, G = grass density
const X0 = -1260, Z0 = -960, W = 2520, D = 1920, RES = 4;
export function makeGroundData() {
  const w = W / RES, h = D / RES, data = new Uint16Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = X0 + (i + 0.5) * RES, z = Z0 + (j + 0.5) * RES, k = (j * w + i) * 4;
    data[k] = THREE.DataUtils.toHalfFloat(terrainH(x, z));
    const s = surfaceAt(x, z);
    let dens = s === 'grass' ? 1 : 0;
    // keep a clean shoulder: no grass within a few metres of any road edge (guard rails, kerbs, verges)
    const nr = nearestRoad(x, z);
    if (nr.d < nr.seg.w / 2 + (nr.seg.kind === 'hwy' ? 5 : 3.5)) dens = 0;
    else if (nr.d < nr.seg.w / 2 + 8) dens *= 0.6;
    if (dens && x > HOOD.x0 && x < HOOD.x1 && z > HOOD.z0 && z < HOOD.z1) dens = 0.3;
    if (x > CITY.x0 - 8 && x < CITY.x1 + 8 && z > CITY.z0 - 8 && z < CITY.z1 + 8) dens = s === 'grass' ? 0.5 : 0;
    if (dens && x > FOREST.x0 && x < FOREST.x1 && z > FOREST.z0 && z < FOREST.z1) dens = 1;
    data[k + 1] = THREE.DataUtils.toHalfFloat(dens);
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export function makeGrass(cardTex, groundTex, count = 8000, R = 42, inner = 0, size = 1) {
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
    uniforms: { ...IMP_UNIFORMS, cards: { value: cardTex }, ground: { value: groundTex }, center: { value: new THREE.Vector2() }, R: { value: R }, inner: { value: inner }, size: { value: size },
      g0: { value: new THREE.Vector2(X0, Z0) }, gSize: { value: new THREE.Vector2(W, D) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aOff; uniform vec2 center, g0, gSize; uniform float R, time, inner, size; uniform sampler2D ground;
      uniform float fogNear, fogFar;
      varying vec2 vUv; varying float vFog, vShade;
      void main(){
        float T = 2.0 * R;
        vec2 wp = aOff.xy + T * floor((center - aOff.xy) / T + 0.5);
        vec4 gd = texture2D(ground, (wp - g0) / gSize);
        float d = length(wp - center) / R;
        float s = (0.55 + aOff.z * 0.7) * smoothstep(1.0, 0.75, d) * smoothstep(inner * 0.92, inner * 1.02 + 0.0001, d) * size;
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

// Geometry grass: clumps of individual tapered blades (looks right from every angle, incl. top-down FP view)
export function makeBlades(groundTex, count = 10000, R = 30) {
  const BL = 12, P = [], H = [], I = [];
  let rs = 7; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < BL; b++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.32, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 0.14 + Math.pow(rnd(), 1.6) * 0.5, w = 0.011 + rnd() * 0.014, face = rnd() * 6.283, lean = (rnd() - 0.5) * 0.5;
    const fx = Math.cos(face), fz = Math.sin(face);
    const base = P.length / 3;
    const seg = [[0, 1], [0.45, 0.8], [0.8, 0.45], [1, 0]];
    for (const [t, wk] of seg) {
      const ox = bx + Math.cos(a) * lean * t * t * h, oz = bz + Math.sin(a) * lean * t * t * h;
      if (wk > 0) { P.push(ox - fx * w * wk, t * h, oz - fz * w * wk, ox + fx * w * wk, t * h, oz + fz * w * wk); H.push(t, t); }
      else { P.push(ox, t * h, oz); H.push(1); }
    }
    // indices: 3 quads-ish strip, last is tip
    I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4, base + 3, base + 5, base + 4, base + 4, base + 5, base + 6);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('hgt', new THREE.Float32BufferAttribute(H, 1));
  g.setIndex(I); g.instanceCount = count;
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { off[i * 4] = (Math.random() * 2 - 1) * R; off[i * 4 + 1] = (Math.random() * 2 - 1) * R; off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = Math.random(); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...IMP_UNIFORMS, ground: { value: groundTex }, center: { value: new THREE.Vector2() }, R: { value: R }, g0: { value: new THREE.Vector2(X0, Z0) }, gSize: { value: new THREE.Vector2(W, D) } },
    vertexShader: /* glsl */`
      attribute vec4 aOff; attribute float hgt; uniform vec2 center, g0, gSize; uniform float R, time, fogNear, fogFar; uniform sampler2D ground;
      varying float vH, vFog, vVar, vTop;
      void main(){
        float T = 2.0 * R;
        vec2 wp = aOff.xy + T * floor((center - aOff.xy) / T + 0.5);
        vec4 gd = texture2D(ground, (wp - g0) / gSize);
        float d = length(wp - center) / R;
        float s = (0.7 + aOff.z * 0.6) * smoothstep(1.0, 0.8, d) * smoothstep(aOff.w - 0.08, aOff.w + 0.08, gd.g) * step(0.25, gd.g);
        float rot = aOff.z * 37.0;
        vec3 p = position; p.xz = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p.xz;
        p *= s;
        float w1 = sin(time * 1.7 + wp.x * 0.21 + wp.y * 0.17), w2 = sin(time * 3.1 + wp.x * 0.73 - wp.y * 0.5);
        vec2 wind = vec2(0.6, 0.35) * (0.6 * w1 + 0.25 * w2 + 0.35);
        p.xz += wind * hgt * hgt * 0.18 * s; p.y -= hgt * hgt * 0.04 * length(wind) * s;
        vec3 world = vec3(wp.x, gd.r - 0.03, wp.y) + p;
        vH = hgt; vVar = aOff.z; vTop = gd.g;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        vFog = smoothstep(fogNear, fogFar, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sunCol, ambCol, fogCol; varying float vH, vFog, vVar, vTop;
      void main(){
        vec3 baseC = mix(vec3(0.045, 0.07, 0.02), vec3(0.06, 0.08, 0.025), vVar);
        vec3 tipC = mix(vec3(0.16, 0.24, 0.06), vec3(0.3, 0.28, 0.1), vVar * vVar * vVar);
        vec3 alb = mix(baseC, tipC, smoothstep(0.0, 1.0, vH));
        float ao = 0.35 + 0.65 * smoothstep(0.0, 0.7, vH);
        vec3 col = alb * ao * (ambCol * 2.4 + sunCol * (0.55 + 0.9 * vH) * (0.45 + 0.55 * max(sunDir.y, 0.0)));
        col = mix(col, fogCol, vFog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  mesh.update = (px, pz) => mat.uniforms.center.value.set(px, pz);
  return mesh;
}
