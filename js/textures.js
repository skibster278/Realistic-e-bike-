import * as THREE from 'three';
import { rand } from './util.js';

export const IMG = {};
const FILES = ['asphalt_02_diff', 'asphalt_02_nor', 'asphalt_02_rough', 'leafy_grass_diff', 'leafy_grass_nor', 'forest_ground_04_diff', 'forest_ground_04_nor', 'stony_dirt_path_diff', 'stony_dirt_path_nor', 'concrete_pavers_diff', 'concrete_pavers_nor', 'brick_wall_02_diff', 'concrete_wall_004_diff', 'white_plaster_02_diff', 'pine_bark_diff'];
export function preloadImages(onProgress) {
  let n = 0;
  return Promise.all(FILES.map((f) => new Promise((res) => {
    const im = new Image(); im.onload = () => { IMG[f] = im; onProgress && onProgress(++n, FILES.length); res(); }; im.onerror = () => res(); im.src = `assets/tex/${f}.jpg`;
  })));
}
const texCache = {};
export function imgTex(name, rx = 1, ry = 1, srgb = true) {
  const im = IMG[name]; if (!im) return null;
  const t = new THREE.Texture(im); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function tileImg(x, name, W, H, tilePx, alpha = 1) {
  const im = IMG[name]; if (!im) return false;
  x.globalAlpha = alpha;
  for (let yy = 0; yy < H; yy += tilePx) for (let xx = 0; xx < W; xx += tilePx) x.drawImage(im, xx, yy, tilePx, tilePx);
  x.globalAlpha = 1; return true;
}
const C = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function tex(c, srgb = true, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(ctx, w, h, n, cols, smin, smax, alpha = 1) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.25 + rand() * 0.75);
    ctx.fillStyle = cols[(rand() * cols.length) | 0];
    const s = smin + rand() * (smax - smin);
    const x = rand() * w, y = rand() * h;
    ctx.fillRect(x, y, s, s);
    // wrap
    if (x + s > w) ctx.fillRect(x - w, y, s, s);
    if (y + s > h) ctx.fillRect(x, y - h, s, s);
  }
  ctx.globalAlpha = 1;
}
function blotches(ctx, w, h, n, col, rmin, rmax, a) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = rmin + rand() * (rmax - rmin);
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
      ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

const cache = {};
export function asphaltBump() {
  if (cache.ab) return cache.ab;
  const c = C(256, 256), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 9000, ['#fff', '#000', '#aaa', '#555'], 1, 2.2, 0.6);
  return (cache.ab = tex(c, false));
}

// Road texture: u across width, v along length (one repeat = 12 m)
export function roadTex(kind, w) {
  const W = 1024, H = 1024, c = C(W, H), x = c.getContext('2d');
  const ppm = W / w; // pixels per meter across
  x.fillStyle = kind === 'hwy' ? '#3b3c3f' : '#36373a'; x.fillRect(0, 0, W, H);
  if (tileImg(x, 'asphalt_02_diff', W, H, Math.round(3.5 * ppm))) { x.fillStyle = 'rgba(30,30,34,0.35)'; x.fillRect(0, 0, W, H); }
  blotches(x, W, H, 30, 'rgba(20,20,22,A)', 40, 160, 0.25);
  blotches(x, W, H, 12, 'rgba(90,90,92,A)', 40, 120, 0.1);
  // tyre tracks (darker strips)
  const lanes = kind === 'city' ? [-6, -2.2, 2.2, 6] : kind === 'hwy' ? [-7.2, -3.2, 3.2, 7.2] : [-2.6, 2.6];
  for (const l of lanes) for (const o of [-0.8, 0.8]) {
    x.fillStyle = 'rgba(15,15,15,0.18)';
    x.fillRect(W / 2 + (l + o) * ppm - 0.35 * ppm, 0, 0.7 * ppm, H);
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(W / 2 + (l + o) * ppm - 0.15 * ppm, 0, 0.3 * ppm, H);
  }
  const line = (m, wm, col, dash) => {
    x.fillStyle = col; const px = W / 2 + m * ppm - (wm * ppm) / 2;
    if (!dash) x.fillRect(px, 0, wm * ppm, H);
    else x.fillRect(px, 0, wm * ppm, H * 0.25);
  };
  const WH = 'rgba(225,225,218,0.82)', YE = 'rgba(215,165,40,0.85)';
  const half = w / 2;
  if (kind === 'city') {
    line(-half + 0.6, 0.15, WH); line(half - 0.6, 0.15, WH);
    line(-0.15, 0.12, YE); line(0.15, 0.12, YE);
    line(-4, 0.13, WH, true); line(4, 0.13, WH, true);
  } else if (kind === 'hood') {
    line(0, 0.12, YE, true);
    x.fillStyle = '#8a8a86'; x.fillRect(0, 0, 0.4 * ppm, H); x.fillRect(W - 0.4 * ppm, 0, 0.4 * ppm, H);
  } else if (kind === 'hwy') {
    line(-half + 0.7, 0.18, WH); line(half - 0.7, 0.18, WH);
    line(-0.8, 0.15, YE); line(0.8, 0.15, YE);
    line(-5.2, 0.15, WH, true); line(5.2, 0.15, WH, true);
  } else {
    line(-half + 0.4, 0.12, WH); line(half - 0.4, 0.12, WH);
    line(-0.12, 0.1, YE); line(0.12, 0.1, YE);
  }
  speckle(x, W, H, 9000, ['rgba(40,40,40,1)'], 1, 3, 0.35);
  // cracks
  x.strokeStyle = 'rgba(15,15,15,0.5)'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let px = rand() * W, py = rand() * H; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 8; k++) { px += (rand() - 0.5) * 20; py += rand() * 14; x.lineTo(px, py); }
    x.stroke();
  }
  return tex(c);
}
export function plainAsphalt() {
  const c = C(256, 256), x = c.getContext('2d');
  x.fillStyle = '#37383b'; x.fillRect(0, 0, 256, 256);
  blotches(x, 256, 256, 20, 'rgba(20,20,22,A)', 10, 40, 0.35);
  speckle(x, 256, 256, 5000, ['#2a2a2c', '#4a4a4d', '#5a5a5c'], 1, 2.5, 0.8);
  return tex(c);
}
export function grassTex() {
  if (IMG.leafy_grass_diff) return imgTex('leafy_grass_diff');
  const c = C(512, 512), x = c.getContext('2d');
  x.fillStyle = '#4f6b2c'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 40, 'rgba(110,120,50,A)', 20, 90, 0.35);
  blotches(x, 512, 512, 40, 'rgba(40,60,20,A)', 20, 80, 0.35);
  for (let i = 0; i < 26000; i++) {
    const px = rand() * 512, py = rand() * 512, l = 3 + rand() * 6;
    const g = 70 + rand() * 80;
    x.strokeStyle = `rgba(${g * 0.6 | 0},${g | 0},${g * 0.3 | 0},${0.4 + rand() * 0.5})`;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rand() - 0.5) * 3, py - l); x.stroke();
  }
  return tex(c);
}
// near-white detail for vertex-colored terrain
export function detailTex() {
  const c = C(512, 512), x = c.getContext('2d');
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 50, 'rgba(255,255,255,A)', 15, 70, 0.35);
  blotches(x, 512, 512, 50, 'rgba(90,90,90,A)', 15, 60, 0.3);
  for (let i = 0; i < 22000; i++) {
    const px = rand() * 512, py = rand() * 512, l = 2 + rand() * 6, g = 120 + rand() * 135;
    x.strokeStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.35 + rand() * 0.5})`;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rand() - 0.5) * 3, py - l); x.stroke();
  }
  speckle(x, 512, 512, 3000, ['#555', '#eee', '#999'], 1, 3, 0.6);
  return tex(c);
}
export function sidewalkTex() {
  if (IMG.concrete_pavers_diff) return imgTex('concrete_pavers_diff');
  const c = C(256, 256), x = c.getContext('2d');
  x.fillStyle = '#9d9b95'; x.fillRect(0, 0, 256, 256);
  blotches(x, 256, 256, 25, 'rgba(70,70,65,A)', 10, 40, 0.2);
  speckle(x, 256, 256, 4000, ['#888', '#aaa', '#777', '#b5b3ad'], 1, 2, 0.6);
  x.strokeStyle = 'rgba(60,60,55,0.6)'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  return tex(c);
}
export function dirtTex() {
  if (IMG.stony_dirt_path_diff) return imgTex('stony_dirt_path_diff');
  const c = C(256, 256), x = c.getContext('2d');
  x.fillStyle = '#6b5236'; x.fillRect(0, 0, 256, 256);
  blotches(x, 256, 256, 30, 'rgba(50,35,20,A)', 10, 40, 0.4);
  speckle(x, 256, 256, 5000, ['#7d6446', '#4d3a26', '#8f7a5e', '#3a2a1a'], 1, 3, 0.8);
  return tex(c);
}
export function woodTex() {
  const c = C(256, 256), x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const v = 120 + rand() * 40;
    x.fillStyle = `rgb(${v | 0},${v * 0.72 | 0},${v * 0.45 | 0})`; x.fillRect(0, i * 32, 256, 31);
    x.fillStyle = 'rgba(40,25,10,0.8)'; x.fillRect(0, i * 32 + 31, 256, 1);
    for (let k = 0; k < 30; k++) { x.fillStyle = `rgba(60,40,20,${rand() * 0.3})`; x.fillRect(0, i * 32 + rand() * 30, 256, 1); }
  }
  return tex(c);
}

// Building facades: one repeat = 4 window columns x 8 floors. Top 6 px rows = roof colour.
const FACADES = [
  { wall: '#c9c1b4', glass: ['#2c3a48', '#425566'], frame: '#77736c', winW: 0.6, winH: 0.55 }, // concrete
  { wall: '#8a4a36', glass: ['#262a30', '#3a4048'], frame: '#d8d2c4', winW: 0.45, winH: 0.55 }, // brick
  { wall: '#3d4c5a', glass: ['#5a7894', '#82a4c0'], frame: '#2b343d', winW: 0.92, winH: 0.8 }, // glass tower
  { wall: '#2a2b2e', glass: ['#3b4450', '#55606e'], frame: '#18191b', winW: 0.8, winH: 0.65 }, // dark modern
  { wall: '#d6d2c8', glass: ['#3a4a5a', '#56697a'], frame: '#aaa49a', winW: 0.7, winH: 0.5 } // white
];
export const FACADE_COUNT = FACADES.length;
export function facadeTex(i) {
  const f = FACADES[i], S = 512, c = C(S, S), x = c.getContext('2d');
  const e = C(S, S), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  x.fillStyle = f.wall; x.fillRect(0, 0, S, S);
  const wallImg = i === 1 ? 'brick_wall_02_diff' : i === 0 ? 'concrete_wall_004_diff' : i === 4 ? 'white_plaster_02_diff' : null;
  if (wallImg && tileImg(x, wallImg, S, S, S / 2)) { x.globalAlpha = 0.25; x.fillStyle = f.wall; x.fillRect(0, 0, S, S); x.globalAlpha = 1; }
  else if (i === 1) { // brick pattern
    for (let yy = 0; yy < S; yy += 6) for (let xx = (yy / 6) % 2 ? 0 : 6; xx < S; xx += 12) {
      x.fillStyle = `rgba(${100 + rand() * 60 | 0},${50 + rand() * 25 | 0},${35 + rand() * 20 | 0},0.6)`; x.fillRect(xx, yy, 11, 5);
    }
  }
  speckle(x, S, S, 3000, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.2)'], 1, 2, 0.5);
  const cols = 4, rows = 8, cw = S / cols, rh = S / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const ww = cw * f.winW, wh = rh * f.winH, wx = k * cw + (cw - ww) / 2, wy = r * rh + (rh - wh) / 2;
    x.fillStyle = f.frame; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
    g.addColorStop(0, f.glass[1]); g.addColorStop(0.5, f.glass[0]); g.addColorStop(1, f.glass[1]);
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(wx, wy, ww * 0.35, wh);
    if (i !== 2) { x.fillStyle = f.frame; x.fillRect(wx + ww / 2 - 1, wy, 2, wh); }
    // lit windows at night
    if (rand() < 0.38) {
      const warm = rand() < 0.75;
      const b = 0.5 + rand() * 0.5;
      ex.fillStyle = warm ? `rgba(255,${190 + rand() * 40 | 0},${110 + rand() * 50 | 0},${b})` : `rgba(190,220,255,${b})`;
      ex.fillRect(wx, wy, ww, wh);
      // blinds / silhouettes
      ex.fillStyle = 'rgba(0,0,0,0.5)';
      if (rand() < 0.4) ex.fillRect(wx, wy, ww, wh * rand() * 0.6);
    }
  }
  x.fillStyle = '#555452'; x.fillRect(0, 0, S, 6);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, 6);
  return { map: tex(c), emissive: tex(e) };
}
// house facade: one repeat = 8 m wide x 3 m high (1 floor)
export function houseTex() {
  const W = 512, H = 192, c = C(W, H), x = c.getContext('2d');
  const e = C(W, H), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  x.fillStyle = '#f0ece4'; x.fillRect(0, 0, W, H);
  for (let yy = 0; yy < H; yy += 8) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, yy + 7, W, 1); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(0, yy, W, 1); }
  for (const wx of [70, 330]) {
    const ww = 110, wy = 50, wh = 80;
    x.fillStyle = '#fff'; x.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh); g.addColorStop(0, '#6b8094'); g.addColorStop(1, '#2d3640');
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = '#fff'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    x.fillStyle = '#3c4a36'; x.fillRect(wx - 26, wy - 8, 18, wh + 16); x.fillRect(wx + ww + 8, wy - 8, 18, wh + 16);
    if (rand() < 0.6) { ex.fillStyle = 'rgba(255,200,120,0.95)'; ex.fillRect(wx, wy, ww, wh); }
  }
  x.fillStyle = '#e8e4dc'; x.fillRect(0, 0, W, 4);
  return { map: tex(c), emissive: tex(e) };
}
export function roofTex() {
  const c = C(256, 256), x = c.getContext('2d');
  x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, 256, 256);
  for (let yy = 0; yy < 256; yy += 16) for (let xx = (yy / 16) % 2 ? 0 : 12; xx < 256; xx += 24) {
    const v = 70 + rand() * 40; x.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; x.fillRect(xx, yy, 23, 15);
    x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(xx, yy + 14, 23, 2);
  }
  return tex(c);
}
export function barkTex() {
  if (IMG.pine_bark_diff) return imgTex('pine_bark_diff');
  const c = C(128, 256), x = c.getContext('2d');
  x.fillStyle = '#4a3a2c'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${20 + rand() * 50 | 0},${15 + rand() * 30 | 0},10,0.6)`; x.fillRect(rand() * 128, rand() * 256, 2 + rand() * 4, 10 + rand() * 40); }
  return tex(c);
}
export function plasticDecal(base, accent, text) {
  const c = C(256, 128), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 128);
  x.fillStyle = accent; x.beginPath(); x.moveTo(0, 90); x.lineTo(256, 30); x.lineTo(256, 60); x.lineTo(0, 120); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'bold italic 30px Arial'; x.fillText(text, 20, 50);
  return tex(c);
}
