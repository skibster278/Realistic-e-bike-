import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { preloadImages } from './textures.js';
import { loadImpostor, IMP_UNIFORMS } from './impostor.js';
import { makeGrass, makeGroundData } from './grass.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildWorld, lamps, nightMats, biomeAt, makeMapCanvas, groundH, FOREST, updateChunks } from './world.js';
import { BIKES, buildBike, setRiderAsset } from './bikes.js';
import { Traffic, headMat, tailMat, addRealCar } from './traffic.js';
import { Wildlife } from './animals.js';
import { Player } from './player.js';
import { clamp, smoothstep, lerp } from './util.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('loadmsg').textContent = t; };
const tick = () => new Promise((r) => setTimeout(r, 16));

// ------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.06, 7000);
scene.fog = new THREE.Fog(0xbfd1e5, 250, 3300);

// sky
const sky = new Sky(); sky.scale.setScalar(6000); scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.8;
// stars
const starG = new THREE.BufferGeometry(); const sp = [];
for (let i = 0; i < 2500; i++) { const u = Math.random() * 2 - 1, t = Math.random() * 6.283, r = Math.sqrt(1 - u * u); if (u < 0.02) continue; sp.push(r * Math.cos(t) * 5000, u * 5000, r * Math.sin(t) * 5000); }
starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
const starM = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starG, starM); scene.add(stars);
const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1e6, fog: false, transparent: true }));
scene.add(moon);

// lights
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera; SC.left = -70; SC.right = 70; SC.top = 70; SC.bottom = -70; SC.near = 1; SC.far = 900;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a4030, 1.0); scene.add(hemi);
const lampLights = [];
for (let i = 0; i < 10; i++) { const l = new THREE.PointLight(0xffc98a, 0, 48, 1.3); scene.add(l); lampLights.push(l); }
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
let envRT = null, hdrTex = null, hdrEnv = null;

// post
let composer, bloom;
function buildComposer() {
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const w = Math.floor(innerWidth * pixelRatio), h = Math.floor(innerHeight * pixelRatio);
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const prev = bloom ? bloom.strength : 0.35;
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), prev, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
buildComposer();
let useBloom = true;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); buildComposer();
});

// ------------------------------------------------------------ input
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!started) return;
  if (e.code === 'KeyC' || e.code === 'KeyV') camMode = (camMode + 1) % 2;
  if (e.code === 'KeyN') timeOfDay = timeOfDay > 6 && timeOfDay < 19 ? 21 : 8;
  if (e.code === 'KeyB') useBloom = !useBloom;
  if (e.code === 'KeyR') killPlayer('Respawning…');
  if (e.code === 'KeyM') bigMap = !bigMap;
  if (e.code === 'KeyH') $('help').classList.toggle('hide');
  if (e.code === 'Escape' || e.code === 'KeyP') openMenu();
  if (/^Digit[1-8]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (BIKES[i]) selectBike(i, true); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const touch = { l: false, r: false, gas: false, brake: false, lift: false };
document.querySelectorAll('[data-t]').forEach((el) => {
  const k = el.dataset.t;
  const on = (e) => { e.preventDefault(); touch[k] = true; el.classList.add('on'); };
  const off = (e) => { e.preventDefault(); touch[k] = false; el.classList.remove('on'); };
  el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off);
});
function readInput() {
  const k = (c) => !!keys[c];
  return {
    throttle: k('KeyW') || k('ArrowUp') || touch.gas ? 1 : 0,
    brake: k('KeyS') || k('ArrowDown') || touch.brake ? 1 : 0,
    steer: (k('KeyD') || k('ArrowRight') || touch.r ? 1 : 0) - (k('KeyA') || k('ArrowLeft') || touch.l ? 1 : 0),
    lift: k('ShiftLeft') || k('ShiftRight') || touch.lift,
    dive: k('ControlLeft') || k('ControlRight') || k('KeyQ'),
    handbrake: k('Space'),
    lookBack: k('KeyE')
  };
}

// ------------------------------------------------------------ audio (procedural)
let audio = null;
function initAudio() {
  if (audio) return;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  const motorG = ac.createGain(); motorG.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; const o2 = ac.createOscillator(); o2.type = 'sine'; const o3 = ac.createOscillator(); o3.type = 'triangle';
  o1.connect(lp); o2.connect(lp); o3.connect(lp); lp.connect(motorG); motorG.connect(master); o1.start(); o2.start(); o3.start();
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.5;
  const windG = ac.createGain(); windG.gain.value = 0; noise.connect(bp); bp.connect(windG); windG.connect(master);
  const tireF = ac.createBiquadFilter(); tireF.type = 'lowpass'; tireF.frequency.value = 300; const tireG = ac.createGain(); tireG.gain.value = 0;
  noise.connect(tireF); tireF.connect(tireG); tireG.connect(master); noise.start();
  audio = { ac, master, motorG, o1, o2, o3, lp, windG, tireG, buf };
}
function updateAudio(p, inp) {
  if (!audio) return;
  const t = audio.ac.currentTime, v = Math.abs(p.speed), moto = p.isMoto;
  const f = (moto ? 70 : 40) + v * (moto ? 14 : 9) + inp.throttle * 30;
  audio.o1.frequency.setTargetAtTime(f, t, 0.05); audio.o2.frequency.setTargetAtTime(f * 2.01, t, 0.05); audio.o3.frequency.setTargetAtTime(f * 4.6, t, 0.05);
  audio.lp.frequency.setTargetAtTime(600 + inp.throttle * 2500 + v * 40, t, 0.05);
  const mg = p.alive ? (moto ? 0.05 + inp.throttle * 0.13 + v * 0.002 : 0.015 + inp.throttle * 0.04) : 0;
  audio.motorG.gain.setTargetAtTime(mg, t, 0.06);
  audio.windG.gain.setTargetAtTime(p.alive ? Math.min(0.5, v * v * 0.0004) : 0, t, 0.1);
  audio.tireG.gain.setTargetAtTime(p.alive && !p.air ? Math.min(0.4, v * (p.surface === 'asphalt' ? 0.004 : 0.02)) : 0, t, 0.1);
}
function crashSound() {
  if (!audio) return;
  const s = audio.ac.createBufferSource(); s.buffer = audio.buf; const g = audio.ac.createGain(); const f = audio.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0.9, audio.ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.ac.currentTime + 1.2);
  s.connect(f); f.connect(g); g.connect(audio.master); s.start(); s.stop(audio.ac.currentTime + 1.3);
}

// ------------------------------------------------------------ game state
let grass = null;
let started = false, camMode = 0, timeOfDay = 17.3, bigMap = false;
const DAY_MINUTES = 14; // real minutes for a full 24h cycle
const player = new Player();
let bikeIdx = 3, bike = null, traffic, wildlife, mapInfo;
const SPAWNS = {
  Forest: [-475, 12, 0], City: [-100, -150, 0], Neighborhood: [450, -100, 0], Highway: [-600, 816.8, Math.PI / 2]
};
let spawnName = 'City';
let safeHistory = [], deadTimer = 0, crashCam = null;

function selectBike(i, live) {
  bikeIdx = i;
  if (bike) scene.remove(bike.root);
  bike = buildBike(BIKES[i]);
  scene.add(bike.root);
  player.setBike(BIKES[i]);
  document.querySelectorAll('.bikecard').forEach((c, k) => c.classList.toggle('sel', k === i));
  if (live) toast(BIKES[i].name);
}
function spawnAt(name) {
  const [x, z, yaw] = SPAWNS[name];
  player.reset(x, z, yaw);
}
function killPlayer(reason) {
  if (!player.alive && deadTimer > 0) return;
  player.alive = false; player.crashReason = reason;
  onCrash(reason);
}
function onCrash(reason) {
  deadTimer = 3.2; crashSound();
  $('crash').textContent = reason; $('crash').classList.add('show');
  crashCam = { pos: camera.position.clone(), vel: new THREE.Vector3(Math.sin(player.yaw) * player.speed * 0.6, 3 + Math.abs(player.speed) * 0.1, Math.cos(player.yaw) * player.speed * 0.6), rot: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8) };
  setTimeout(() => $('fade').classList.add('black'), 450);
}
function respawn() {
  // pick a safe spot from ~4s before the crash
  const now = performance.now() / 1000;
  let spot = null;
  for (let i = safeHistory.length - 1; i >= 0; i--) if (now - safeHistory[i].t > 4) { spot = safeHistory[i]; break; }
  if (!spot) { spawnAt(spawnName); } else player.reset(spot.x, spot.z, spot.yaw);
  safeHistory = [];
  $('fade').classList.remove('black'); $('crash').classList.remove('show'); crashCam = null;
}

// ------------------------------------------------------------ HUD
let toastT = 0;
function toast(t) { $('toast').textContent = t; $('toast').classList.add('show'); toastT = 2.5; }
const mm = $('minimap'), mmx = mm.getContext('2d');
function drawMinimap() {
  const big = bigMap; const W = big ? Math.min(innerWidth, innerHeight) * 0.8 : 170;
  if (mm.width !== W) { mm.width = W; mm.height = W; mm.style.width = mm.style.height = W + 'px'; }
  mm.classList.toggle('big', big);
  const { canvas: mc, S, X0, Z0 } = mapInfo;
  mmx.save(); mmx.clearRect(0, 0, W, W);
  mmx.beginPath(); mmx.arc(W / 2, W / 2, W / 2 - 2, 0, 6.283); mmx.clip();
  mmx.fillStyle = '#223'; mmx.fillRect(0, 0, W, W);
  const zoom = big ? W / (2600 * S) : 1.0;
  mmx.translate(W / 2, W / 2);
  if (!big) mmx.rotate(player.yaw + Math.PI);
  mmx.scale(zoom, zoom);
  mmx.drawImage(mc, -(player.pos.x - X0) * S, -(player.pos.z - Z0) * S);
  // flip x so map matches view (world +x = screen right when facing +z? we draw x→right, z→down)
  mmx.fillStyle = '#ff4d4d';
  for (const c of traffic.cars) { const dx = (c.pos.x - player.pos.x) * S, dz = (c.pos.z - player.pos.z) * S; if (Math.abs(dx) < 400 && Math.abs(dz) < 400) mmx.fillRect(dx - 1.5, dz - 1.5, 3, 3); }
  mmx.restore();
  // player arrow
  mmx.save(); mmx.translate(W / 2, W / 2); if (big) mmx.rotate(-player.yaw + Math.PI);
  mmx.fillStyle = '#39f'; mmx.strokeStyle = '#fff'; mmx.lineWidth = 2;
  mmx.beginPath(); mmx.moveTo(0, -9); mmx.lineTo(6, 7); mmx.lineTo(0, 3); mmx.lineTo(-6, 7); mmx.closePath(); mmx.fill(); mmx.stroke(); mmx.restore();
  mmx.strokeStyle = 'rgba(255,255,255,0.8)'; mmx.lineWidth = 3; mmx.beginPath(); mmx.arc(W / 2, W / 2, W / 2 - 2, 0, 6.283); mmx.stroke();
}
let dashT = 0;
function drawDash() {
  const { canvas: c, tex } = bike.dash, x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#0b1420'); g.addColorStop(1, '#02050a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#e8f6ff'; x.font = 'bold 64px Arial'; x.textAlign = 'center';
  x.fillText(Math.round(Math.abs(player.speed) * 3.6), 128, 74);
  x.fillStyle = '#7fc8ff'; x.font = 'bold 16px Arial'; x.fillText('KM/H', 128, 96);
  x.textAlign = 'left'; x.fillStyle = '#9ab'; x.font = '14px Arial'; x.fillText(fmtTime(timeOfDay), 12, 22);
  x.textAlign = 'right'; x.fillText(Math.round(player.battery) + '%', 244, 22);
  x.fillStyle = '#223'; x.fillRect(14, 108, 228, 10); x.fillStyle = player.battery > 25 ? '#3f8' : '#f44'; x.fillRect(14, 108, 228 * player.battery / 100, 10);
  const pw = Math.min(1, Math.max(0, player.accel / 8)); x.fillStyle = '#4af'; x.fillRect(14, 30, 6, 70 * pw);
  tex.needsUpdate = true;
}
function fmtTime(t) { const h = Math.floor(t), m = Math.floor((t - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

// r160 has no scene.environmentIntensity: drive envMapIntensity on every material
let envMats = [], envLast = -1, envScanT = 0;
function setEnvIntensity(v) {
  envScanT -= 1;
  if (envScanT <= 0) {
    envScanT = 120; const set = new Set();
    scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial) { if (m.userData.envBase === undefined) m.userData.envBase = m.envMapIntensity ?? 1; set.add(m); } });
    envMats = [...set]; envLast = -1;
  }
  if (Math.abs(v - envLast) < 0.005) return;
  envLast = v;
  for (const m of envMats) m.envMapIntensity = m.userData.envBase * v;
}
// ------------------------------------------------------------ day / night
const sunDir = new THREE.Vector3(); let envTimer = 0, lampTimer = 0, lastNight = -1;
function updateSky(dt) {
  timeOfDay = (timeOfDay + (dt * 24) / (DAY_MINUTES * 60) * (keys['KeyT'] ? 40 : 1)) % 24;
  const a = ((timeOfDay - 6) / 24) * Math.PI * 2;
  sunDir.set(Math.cos(a) * 0.8, Math.sin(a) * 0.85, 0.55).normalize();
  const elev = sunDir.y;
  su.sunPosition.value.copy(sunDir);
  const day = smoothstep(-0.12, 0.12, elev);
  const golden = smoothstep(0.35, 0.02, elev) * day;
  su.rayleigh.value = lerp(0.4, 1.6 + golden * 1.5, day);
  su.turbidity.value = 4 + golden * 6;
  // sun / moon light
  const moonDir = sunDir.clone().multiplyScalar(-1);
  const night = 1 - day;
  const lightDir = elev > -0.05 ? sunDir : moonDir;
  sun.position.copy(player.pos).addScaledVector(lightDir, 400);
  sun.target.position.copy(player.pos);
  const sunCol = new THREE.Color().setRGB(1, lerp(1, 0.62, golden), lerp(0.96, 0.38, golden));
  sun.color.copy(elev > -0.05 ? sunCol : new THREE.Color(0x8fa8ff));
  sun.intensity = elev > -0.05 ? 4.2 * smoothstep(-0.05, 0.15, elev) : 0.25 * smoothstep(0.05, 0.3, moonDir.y);
  hemi.intensity = lerp(0.07, 0.45, day);
  hemi.color.setRGB(lerp(0.35, 0.74, day), lerp(0.42, 0.84, day), lerp(0.7, 1, day));
  const fogDay = new THREE.Color(hdrTex ? 0xc4d2e0 : 0xb9cde0).lerp(new THREE.Color(0xe0b89a), golden * 0.7);
  scene.fog.color.copy(fogDay).lerp(new THREE.Color(0x0a0f1a), night);
  scene.fog.near = lerp(60, 250, day); scene.fog.far = lerp(1100, 3300, day);
  renderer.toneMappingExposure = lerp(0.95, 0.72, day);
  starM.opacity = smoothstep(0.0, -0.2, elev);
  moon.position.copy(camera.position).addScaledVector(moonDir, 4500); moon.material.opacity = smoothstep(-0.05, 0.1, moonDir.y);
  stars.position.copy(camera.position);
  // emissives
  const nightAmt = smoothstep(0.12, -0.08, elev);
  for (const nm of nightMats) nm.mat.emissiveIntensity = Math.max(nm.min || 0, nm.max * nightAmt);
  headMat.emissiveIntensity = 0.4 + 3.5 * nightAmt; tailMat.emissiveIntensity = 0.6 + 2.5 * nightAmt;
  bloom.strength = 0.18 + nightAmt * 0.3;
  if (bike) bike.headlight.intensity = 5 + nightAmt * 55;
  lampTimer -= dt;
  if (lampTimer <= 0) {
    lampTimer = 0.25;
    const px = player.pos.x, pz = player.pos.z;
    const near = lamps.map((l) => [((l.x - px) ** 2 + (l.z - pz) ** 2), l]).sort((a, b) => a[0] - b[0]).slice(0, lampLights.length);
    near.forEach(([, l], i) => lampLights[i].position.set(l.x, l.y, l.z));
  }
  for (const l of lampLights) l.intensity = 75 * nightAmt;
  // impostor lighting (matches three's physically based lambert: /PI)
  IMP_UNIFORMS.sunDir.value.copy(lightDir);
  IMP_UNIFORMS.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
  IMP_UNIFORMS.ambCol.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI).addScalar((scene.environmentIntensity ?? 1) * 0.35 * (hdrTex ? 1 : 0.5));
  IMP_UNIFORMS.fogCol.value.copy(scene.fog.color); IMP_UNIFORMS.fogNear.value = scene.fog.near; IMP_UNIFORMS.fogFar.value = scene.fog.far;
  IMP_UNIFORMS.time.value += dt;
  // environment map refresh
  if (hdrTex) {
    scene.backgroundIntensity = lerp(0.015, 1, day) * lerp(1, 0.75, golden);
    scene.environmentIntensity = lerp(0.02, 0.42, day) * lerp(1, 0.6, golden);
    setEnvIntensity(scene.environmentIntensity);
    scene.backgroundRotation && (scene.backgroundRotation.y = 0);
    envTimer = 1e9;
  }
  envTimer -= dt;
  if (envTimer <= 0) {
    envTimer = 4;
    envSky.material.uniforms.sunPosition.value.copy(sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = su[k].value;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0, 1, 2000);
    scene.environment = envRT.texture;
    scene.environmentIntensity = lerp(0.06, 0.55, day);
  }
  return nightAmt;
}

// ------------------------------------------------------------ camera
const camPos = new THREE.Vector3(), tmpV = new THREE.Vector3();
let headBob = 0, shake = 0, lookYaw = 0;
function updateCamera(dt, inp) {
  if (crashCam) {
    crashCam.vel.y -= 9.8 * dt; crashCam.pos.addScaledVector(crashCam.vel, dt);
    const gh = groundH(crashCam.pos.x, crashCam.pos.z) + 0.25;
    if (crashCam.pos.y < gh) { crashCam.pos.y = gh; crashCam.vel.multiplyScalar(0.4); crashCam.vel.y *= -0.3; }
    camera.position.copy(crashCam.pos);
    camera.rotation.x += crashCam.rot.x * dt; camera.rotation.y += crashCam.rot.y * dt; camera.rotation.z += crashCam.rot.z * dt;
    crashCam.rot.multiplyScalar(Math.exp(-dt * 1.5));
    return;
  }
  const root = bike.root;
  const v = Math.abs(player.speed);
  lookYaw += ((inp.lookBack ? Math.PI * 0.9 : 0) - lookYaw) * Math.min(1, dt * 8);
  if (window.__game && window.__game.freeCam) {
    bike.rider.setFP(false);
    camera.position.set(...window.__game.freeCamPos); camera.rotation.set(0, 0, 0);
    const la = window.__game.lookAt; if (la) camera.lookAt(...la); else camera.lookAt(player.pos.x, player.pos.y + 0.7, player.pos.z); camera.fov = 45; camera.updateProjectionMatrix();
    return;
  }
  if (camMode === 0) {
    bike.rider.setFP(true);
    headBob += dt * (2 + v * 0.4);
    const surfShake = player.surface === 'asphalt' ? 0.002 : player.surface === 'concrete' ? 0.004 : 0.012;
    shake = surfShake * Math.min(1, v / 10) + (player.landed || 0) * 0.08;
    player.landed = (player.landed || 0) * Math.exp(-dt * 8);
    tmpV.copy(bike.headLocal); root.localToWorld(tmpV);
    camera.position.copy(tmpV);
    camera.position.y += Math.sin(headBob) * 0.006 + (Math.random() - 0.5) * shake;
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw + Math.PI + lookYaw;
    camera.rotation.x = -(player.slope + player.pitch) * 0.95 - 0.32 + (Math.random() - 0.5) * shake * 0.5;
    camera.rotation.z = -player.lean * 0.55;
    camera.fov = 82 + Math.min(10, v * 0.15); camera.updateProjectionMatrix();
  } else {
    bike.rider.setFP(false);
    const fx = Math.sin(player.yaw + lookYaw), fz = Math.cos(player.yaw + lookYaw);
    const want = tmpV.set(player.pos.x - fx * 5.2, player.pos.y + 2.1, player.pos.z - fz * 5.2);
    const gh = groundH(want.x, want.z) + 0.6; if (want.y < gh) want.y = gh;
    camPos.lerp(want, 1 - Math.exp(-dt * 6));
    if (camPos.distanceTo(want) > 20) camPos.copy(want);
    camera.position.copy(camPos);
    camera.rotation.set(0, 0, 0);
    camera.lookAt(player.pos.x + fx * 2, player.pos.y + 1.1, player.pos.z + fz * 2);
    camera.fov = 70 + Math.min(12, v * 0.2); camera.updateProjectionMatrix();
  }
}

// ------------------------------------------------------------ bike visual sync
let wheelRot = 0, crankRot = 0;
function syncBike(dt) {
  const r = bike.root;
  r.visible = player.alive || deadTimer > 2.6;
  r.position.copy(player.pos);
  r.rotation.order = 'YXZ';
  r.rotation.y = player.yaw;
  r.rotation.x = -(player.slope + player.pitch);
  r.rotation.z = player.lean;
  wheelRot += (player.speed / player.spec.rr) * dt;
  bike.rear.rotation.x = wheelRot; bike.front.rotation.x = wheelRot * (player.spec.rr / player.spec.rf);
  bike.steer.rotation.y = -player.steer * 0.45 * (1 - clamp(Math.abs(player.speed) / 14, 0, 0.85));
  if (bike.crank) { crankRot += player.speed * 0.9 * dt; bike.crank.rotation.x = crankRot; }
  bike.rider.update();
}

// ------------------------------------------------------------ main loop
const clock = new THREE.Clock();
let frameAcc = 0, frames = 0, fpsShown = 0, qualityTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const inp = started ? readInput() : { throttle: 0, brake: 0, steer: 0 };
  if (started) {
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps; i++) {
      const res = player.update(dt / steps, inp, traffic, wildlife);
      if (res) { onCrash(res); break; }
    }
    if (!player.alive) { deadTimer -= dt; if (deadTimer <= 0 && deadTimer > -10) { deadTimer = -20; respawn(); } }
    else if (!player.air && player.pitch < 0.1 && Math.abs(player.lean) < 0.3) {
      const now = performance.now() / 1000;
      if (!safeHistory.length || now - safeHistory[safeHistory.length - 1].t > 1) safeHistory.push({ t: now, x: player.pos.x, z: player.pos.z, yaw: player.yaw });
      if (safeHistory.length > 20) safeHistory.shift();
    }
  }
  traffic.update(dt, player);
  wildlife.update(dt, player);
  if (grass) grass.update(player.pos.x, player.pos.z);
  updateChunks(player.pos.x, player.pos.z);
  syncBike(dt);
  updateCamera(dt, inp);
  updateSky(dt);
  updateAudio(player, inp);
  // HUD
  if (started) {
    const kmh = Math.round(Math.abs(player.speed) * 3.6);
    $('speed').textContent = kmh;
    $('batt').style.width = player.battery + '%';
    $('clock').textContent = fmtTime(timeOfDay);
    $('biome').textContent = biomeAt(player.pos.x, player.pos.z);
    $('bikename').textContent = player.spec.name;
    const w = player.wheelieDist;
    $('trick').textContent = player.air ? `AIR ${player.airTime.toFixed(1)}s` : w > 3 ? `WHEELIE ${w.toFixed(0)} m` : '';
    $('best').textContent = `Best wheelie ${player.bestWheelie.toFixed(0)} m`;
    drawMinimap();
    dashT -= dt; if (dashT <= 0) { dashT = 0.1; drawDash(); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  }
  if (useBloom) composer.render(); else renderer.render(scene, camera);
  // adaptive quality
  frameAcc += dt; frames++;
  if (frameAcc > 1) {
    fpsShown = Math.round(frames / frameAcc); $('fps').textContent = fpsShown + ' fps'; frames = 0; frameAcc = 0;
    qualityTimer++;
    if (qualityTimer > 3 && fpsShown < 32 && pixelRatio > 0.7) {
      pixelRatio = Math.max(0.7, pixelRatio - 0.15); renderer.setPixelRatio(pixelRatio); buildComposer(); qualityTimer = 0;
    }
  }
}

// ------------------------------------------------------------ menu
function buildMenu() {
  const wrap = $('bikes');
  BIKES.forEach((b, i) => {
    const d = document.createElement('div'); d.className = 'bikecard';
    const hp = Math.round(b.power / 745.7);
    d.innerHTML = `<div class="sw" style="background:linear-gradient(135deg,${b.color},${b.accent})"></div><b>${b.name}</b><small>${b.cls}</small>
      <div class="stat">Power<i style="width:${Math.min(100, b.power / 440)}%"></i></div>
      <div class="stat">Top speed<i style="width:${b.vmax / 1.5}%"></i></div>
      <small>${hp ? hp + ' hp · ' : ''}${b.vmax} km/h · ${b.range}</small><span class="key">${i + 1}</span>`;
    d.onclick = () => selectBike(i, false);
    wrap.appendChild(d);
  });
  document.querySelectorAll('[data-spawn]').forEach((b) => (b.onclick = () => {
    spawnName = b.dataset.spawn; document.querySelectorAll('[data-spawn]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  $('go').onclick = () => {
    initAudio(); audio && audio.ac.resume();
    $('menu').classList.add('hide');
    if (!started || spawnChanged()) spawnAt(spawnName);
    lastSpawn = spawnName; started = true;
    $('hud').classList.remove('hide');
    if (matchMedia('(pointer: coarse)').matches) $('touch').classList.remove('hide');
  };
}
let lastSpawn = null; const spawnChanged = () => lastSpawn !== spawnName;
function openMenu() { $('menu').classList.remove('hide'); $('go').textContent = 'RESUME'; }

// ------------------------------------------------------------ optional real 3D models (needs internet)
function loadRealModels() {
  const draco = new DRACOLoader(); draco.setDecoderPath('./lib/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const tryLoad = (urls, ok) => {
    const u = urls.shift(); if (!u) return;
    loader.load(u, ok, undefined, () => tryLoad(urls, ok));
  };
  tryLoad(['assets/models/fox.glb', 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb', 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Fox/glTF-Binary/Fox.glb'], (g) => {
    const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3());
    const s = 1.0 / Math.max(size.x, size.z);
    g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    wildlife.addAnimated(() => SkeletonUtils.clone(g.scene), g.animations, 8, s);
  });
}

// ------------------------------------------------------------ boot
(async function boot() {
  status('Loading photo textures…'); await preloadImages((n, t) => status(`Loading photo textures… ${n}/${t}`));
  status('Loading HDRI sky…');
  await new Promise((res) => new RGBELoader().load('assets/hdri/sky.hdr', (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; hdrTex = t;
    hdrEnv = pmrem.fromEquirectangular(t).texture; scene.background = t; scene.environment = hdrEnv; sky.visible = false; res();
  }, undefined, () => res()));
  status('Loading photoscanned trees & props…');
  const assets = { imp: {}, props: {} };
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all([
    ...['pine1', 'pine2', 'pine3', 'jacaranda', 'island'].map((n) => loadImpostor(n).then((r) => { if (r) assets.imp[n] = r; })),
    ...['rock_07', 'rock_09', 'boulder_01', 'fern_02', 'dead_tree_trunk', 'fire_hydrant', 'metal_trash_can', 'modular_street_seating', 'exterior_aircon_unit', 'concrete_road_barrier'].map((n) =>
      gl.loadAsync(`assets/models/props/${n}.glb`).then((g) => { assets.props[n] = g; }).catch((e) => console.warn('prop', n, e)))
  ]);
  const grassTex = await new THREE.TextureLoader().loadAsync('assets/impostors/grass_cards.webp').catch(() => null);
  if (grassTex) { grassTex.colorSpace = THREE.SRGBColorSpace; assets.grass = true; }
  await gl.loadAsync('assets/models/rider.glb').then((g) => setRiderAsset(g)).catch((e) => console.warn('rider', e));
  status('Generating world…'); await tick();
  buildWorld(scene, assets);
  if (grassTex) { grass = makeGrass(grassTex, makeGroundData(), ...(matchMedia('(pointer: coarse)').matches ? [9000, 32] : [14000, 38])); scene.add(grass); }
  status('Loading cars…');
  {
    const draco = new DRACOLoader(); draco.setDecoderPath('./lib/jsm/libs/draco/gltf/');
    const cl = new GLTFLoader(); cl.setDRACOLoader(draco); cl.setMeshoptDecoder(MeshoptDecoder);
    await Promise.all([
      cl.loadAsync('assets/models/ferrari.glb').then((g) => addRealCar(g.scene, 4.6, (o) => o.name === 'body')).catch((e) => console.warn('car', e)),
      cl.loadAsync('assets/models/car_concept.glb').then((g) => addRealCar(g.scene, 4.7, (o, m) => /paint/i.test(m.name || ''))).catch((e) => console.warn('car', e))
    ]);
  }
  status('Spawning traffic…'); await tick();
  traffic = new Traffic(scene);
  status('Releasing wildlife…'); await tick();
  wildlife = new Wildlife(scene);
  mapInfo = makeMapCanvas();
  buildMenu();
  selectBike(bikeIdx, false);
  spawnAt(spawnName);
  status('Compiling shaders…'); await tick();
  updateSky(0); syncBike(0); updateCamera(0, { lookBack: false });
  renderer.compile(scene, camera);
  $('loading').classList.add('hide'); $('menuinner').classList.remove('hide');
  loadRealModels();
  loop();
})();
window.__game = { player, scene, camera, renderer, get traffic() { return traffic; }, setTime: (t) => (timeOfDay = t), keys };
