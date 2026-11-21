import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// asset version: bump when any file in assets/ changes so cached copies are refreshed
export const AV = '?v=20261121b';
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

let seed = 1337;
export function setSeed(s) { seed = s; }
export function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
export const rr = (a, b) => a + (b - a) * rand();
export const pick = (arr) => arr[(rand() * arr.length) | 0];

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// Merge geometries robustly (mixed indexed / non-indexed, optional colors)
export function merge(geos) {
  const list = geos.map((g) => {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  const hasColor = list.some((g) => g.attributes.color);
  for (const g of list) {
    if (hasColor && !g.attributes.color) colorize(g, 0xffffff);
    if (!hasColor && g.attributes.color) g.deleteAttribute('color');
  }
  return mergeGeometries(list, false);
}
const _c = new THREE.Color();
export function colorize(g, hex, jitter = 0) {
  _c.set(hex);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    arr[i * 3] = _c.r * j; arr[i * 3 + 1] = _c.g * j; arr[i * 3 + 2] = _c.b * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function jitterVerts(g, amt) {
  const p = g.attributes.position;
  // keep shared positions consistent: hash by rounded position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = noise2(x * 7.1 + 13, z * 7.3 + y * 5.1) - 0.5, h2 = noise2(y * 6.7 + 3, x * 4.9 - z * 3.3) - 0.5;
    p.setXYZ(i, x + h * amt, y + h2 * amt * 0.6, z + (h - h2) * amt);
  }
  g.computeVertexNormals();
  return g;
}
// cylinder from a to b
const _up = new THREE.Vector3(0, 1, 0);
export function tubeGeo(a, b, r1, r2 = r1, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  g.applyQuaternion(q);
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}
export function boxGeo(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
