import * as THREE from 'three';
import { AV } from './util.js';

// Shared lighting uniforms (updated each frame from main.js)
export const IMP_UNIFORMS = {
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunCol: { value: new THREE.Color(1, 1, 1) },
  ambCol: { value: new THREE.Color(0.5, 0.55, 0.6) },
  fogCol: { value: new THREE.Color(0.7, 0.8, 0.9) },
  fogNear: { value: 200 }, fogFar: { value: 3000 },
  time: { value: 0 }
};

const VERT_COMMON = /* glsl */`
uniform float frames, cols, rows, frameW, frameH;
attribute float aRot; attribute float aTint;
varying vec2 vUv0; varying vec2 vUv1; varying float vT; varying float vTint; varying float vA0;
uniform float time;
const float PI2 = 6.28318530718;
vec2 frameUv(float f, vec2 uv){ float cx = mod(f, cols); float cy = floor(f / cols); return vec2((cx + uv.x) / cols, 1.0 - (cy + 1.0 - uv.y) / rows); }
vec3 billboard(out float a0){
  vec3 c = instanceMatrix[3].xyz; float s = length(instanceMatrix[0].xyz);
  vec2 d = cameraPosition.xz - c.xz; float len = length(d); d = len > 0.001 ? d / len : vec2(0.0, 1.0);
  vec3 right = vec3(d.y, 0.0, -d.x);
  float sway = sin(time * 1.3 + c.x * 0.37 + c.z * 0.23) * 0.015 * position.y * position.y;
  vec3 wp = c + right * (position.x * frameW * s + sway * frameW * s) + vec3(0.0, position.y * frameH * s, 0.0) + vec3(d.x, 0.0, d.y) * min(frameW * s * 0.25, len * 0.3);
  float ang = atan(d.x, d.y) - aRot;
  float f = mod(ang / PI2 * frames + frames * 8.0, frames);
  float f0 = floor(f); float f1 = mod(f0 + 1.0, frames);
  vT = f - f0; vUv0 = frameUv(f0, uv); vUv1 = frameUv(f1, uv);
  a0 = (f0 / frames) * PI2 + aRot;
  vTint = aTint;
  return wp;
}`;

export function makeImpostorMaterial(lit, nrm, meta) {
  const uniforms = {
    ...IMP_UNIFORMS,
    litMap: { value: lit }, nrmMap: { value: nrm },
    frames: { value: meta.FR }, cols: { value: meta.COLS }, rows: { value: meta.ROWS },
    frameW: { value: meta.halfW * 2 }, frameH: { value: meta.halfH * 2 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT_COMMON + /* glsl */`
      varying float vFog; uniform float fogNear, fogFar; varying vec3 vRight; varying vec3 vToCam;
      void main(){
        float a0; vec3 wp = billboard(a0);
        vToCam = vec3(sin(a0), 0.0, cos(a0)); vRight = vec3(cos(a0), 0.0, -sin(a0));
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vFog = smoothstep(fogNear, fogFar, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D litMap, nrmMap; uniform vec3 sunDir, sunCol, ambCol, fogCol;
      varying vec2 vUv0, vUv1; varying float vT, vTint, vFog; varying vec3 vRight, vToCam;
      void main(){
        vec4 c0 = texture2D(litMap, vUv0), c1 = texture2D(litMap, vUv1);
        vec4 c = mix(c0, c1, vT);
        if (c.a < 0.45) discard;
        vec3 n = mix(texture2D(nrmMap, vUv0).xyz, texture2D(nrmMap, vUv1).xyz, vT) * 2.0 - 1.0;
        vec3 nw = normalize(vRight * n.x + vec3(0.0, 1.0, 0.0) * n.y + vToCam * n.z);
        float ndl = max(dot(nw, sunDir), 0.0);
        vec3 alb = c.rgb * vTint;
        vec3 col = alb * 2.0 * (ambCol * 1.2 + sunCol * (0.3 + 0.85 * ndl));
        col = mix(col, fogCol, vFog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  // shadow pass: billboard faces the light camera
  const depth = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT_COMMON + `void main(){ float a0; vec3 wp = billboard(a0); gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
    fragmentShader: `#include <packing>
      uniform sampler2D litMap; varying vec2 vUv0, vUv1; varying float vT;
      void main(){ float a = mix(texture2D(litMap, vUv0).a, texture2D(litMap, vUv1).a, vT); if (a < 0.5) discard; gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }`
  });
  return { mat, depth };
}

const quad = new THREE.PlaneGeometry(1, 1, 1, 4).translate(0, 0.5, 0);
export function makeImpostorMesh(list, lit, nrm, meta) {
  // list: [x, y, z, scale]
  const { mat, depth } = makeImpostorMaterial(lit, nrm, meta);
  const geo = quad.clone();
  const rot = new Float32Array(list.length), tint = new Float32Array(list.length);
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach((t, i) => {
    m4.makeScale(t[3], t[3], t[3]); m4.setPosition(t[0], t[1], t[2]); im.setMatrixAt(i, m4);
    rot[i] = Math.random() * 6.283; tint[i] = 0.82 + Math.random() * 0.3;
  });
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  im.customDepthMaterial = depth;
  im.castShadow = true; im.frustumCulled = false;
  return im;
}

export function loadImpostor(name) {
  const tl = new THREE.TextureLoader();
  return Promise.all([
    fetch(`assets/impostors/${name}.json${AV}`).then((r) => r.json()),
    new Promise((r, e) => tl.load(`assets/impostors/${name}_lit.webp${AV}`, r, undefined, e)),
    new Promise((r, e) => tl.load(`assets/impostors/${name}_normal.webp${AV}`, r, undefined, e))
  ]).then(([meta, lit, nrm]) => {
    lit.colorSpace = THREE.SRGBColorSpace; lit.anisotropy = 4;
    nrm.colorSpace = THREE.NoColorSpace;
    for (const t of [lit, nrm]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
    // texture alpha in colour pass: linear-space colours, the shader works in linear
    return { meta, lit, nrm };
  }).catch(() => null);
}
