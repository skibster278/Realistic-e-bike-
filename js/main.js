import * as THREE from 'three';
import { AV } from './util.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { N8AOPass } from 'three/addons/n8ao/N8AO.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { preloadImages } from './textures.js';
import { loadImpostor, IMP_UNIFORMS } from './impostor.js';
import { makeGrass, makeGroundData, makeBlades } from './grass.js';
import { Dust } from './dust.js';
import { TyreMarks } from './marks.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildWorld, lamps, nightMats, biomeAt, makeMapCanvas, groundH, FOREST, updateChunks, mountainMats, signal, signalMats, queryCols } from './world.js';
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
// quality presets. 'phone' renders straight to the screen (no post-processing chain) with hardware MSAA at a
// high pixel ratio: sharp image, low GPU cost. Effects are spent where they matter on bigger GPUs.
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const IS_PHONE = IS_TOUCH && Math.min(screen.width, screen.height) < 600;
const PRESETS = {
  phone: { pr: 2, prMin: 1.5, shadowEvery: 2, direct: true, ao: false, shadow: 1024, shadowR: 45, grass: [4500, 22], far: false, bloom: false, farClip: 2600, traffic: 0.6 },
  low: { pr: 1.5, prMin: 1, shadowEvery: 2, direct: true, ao: false, shadow: 1024, shadowR: 60, grass: [6000, 26], far: true, bloom: false, farClip: 3600, traffic: 0.8 },
  medium: { pr: 1.5, prMin: 1, ao: 'half', shadow: 2048, shadowR: 80, grass: [9000, 32], far: true, bloom: true, farClip: 5200, traffic: 1 },
  high: { pr: 2, prMin: 1.25, ao: 'full', shadow: 4096, shadowR: 80, grass: [15000, 40], far: true, bloom: true, farClip: 5200, traffic: 1 }
};
const defaultQ = IS_PHONE ? 'phone' : IS_TOUCH ? 'medium' : 'high';
let qualityName = defaultQ;
try { qualityName = localStorage.getItem('voltride.q3') || defaultQ; } catch (e) {}
if (!PRESETS[qualityName]) qualityName = defaultQ;
let Q = PRESETS[qualityName];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !!Q.direct, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, Q.pr);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.06, Q.farClip);
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

// lens flare (procedural textures) for the sun
function flareTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  if (kind === 0) { g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.08, 'rgba(255,240,210,0.9)'); g.addColorStop(0.3, 'rgba(255,200,140,0.18)'); g.addColorStop(1, 'rgba(255,180,120,0)'); }
  else if (kind === 1) { g.addColorStop(0, 'rgba(160,200,255,0)'); g.addColorStop(0.7, 'rgba(160,200,255,0.05)'); g.addColorStop(0.85, 'rgba(255,220,160,0.07)'); g.addColorStop(1, 'rgba(255,200,160,0)'); }
  else { g.addColorStop(0, 'rgba(200,230,255,0.14)'); g.addColorStop(1, 'rgba(200,230,255,0)'); }
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  if (kind === 0) { x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,240,220,0.09)'; x.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; x.beginPath(); x.moveTo(128 - Math.cos(a) * 120, 128 - Math.sin(a) * 120); x.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const flare = new Lensflare();
const fT = [flareTex(0), flareTex(1), flareTex(2)];
flare.addElement(new LensflareElement(fT[0], 260, 0, new THREE.Color(1, 0.95, 0.85)));
flare.addElement(new LensflareElement(fT[2], 50, 0.55));
const flareHolder = new THREE.Object3D(); flareHolder.add(flare); scene.add(flareHolder);

// lights
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow);
const SC = sun.shadow.camera; SC.left = -Q.shadowR; SC.right = Q.shadowR; SC.top = Q.shadowR; SC.bottom = -Q.shadowR; SC.near = 1; SC.far = 900;
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
  if (Q.direct) { composer = null; return; }
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const w = Math.floor(innerWidth * pixelRatio), h = Math.floor(innerHeight * pixelRatio);
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.ao ? 0 : 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
  if (Q.ao) {
    aoPass = new N8AOPass(scene, camera, w, h);
    Object.assign(aoPass.configuration, { aoRadius: 1.6, distanceFalloff: 0.8, intensity: 2.6, aoSamples: Q.ao === 'half' ? 8 : 16, denoiseSamples: Q.ao === 'half' ? 4 : 8, denoiseRadius: 10, halfRes: Q.ao === 'half', gammaCorrection: false, screenSpaceRadius: false });
    aoPass.configuration.color.set(0x0b0d12);
    composer.addPass(aoPass);
  } else { aoPass = null; composer.addPass(new RenderPass(scene, camera)); }
  const prev = bloom ? bloom.strength : 0.35;
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), prev, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  gradePass = new ShaderPass(GRADE); composer.addPass(gradePass);
  if (Q.ao) { const fx = new ShaderPass(FXAAShader); fx.material.uniforms.resolution.value.set(1 / w, 1 / h); composer.addPass(fx); }
}
let aoPass = null, gradePass = null;
// keep the *horizontal* view wide in portrait (a phone held upright would otherwise see a narrow slit)
function setFov(vLandscape) {
  const a = camera.aspect, ref = 16 / 9;
  if (a < ref) { const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vLandscape) / 2) * ref); camera.fov = Math.min(105, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / a)) * (a < 1 ? 0.72 : 1)); }
  else camera.fov = vLandscape;
  camera.updateProjectionMatrix();
}
function updateFov() { setFov(camera.fov); }
function applyPixelRatio() {
  renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight); } // resizes targets in place: no black frame
}
// cinematic grade in display space: gentle S-curve, saturation, warm highlights / cool shadows, vignette
const GRADE = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 }, sat: { value: 1.1 }, warm: { value: 0.5 }, blur: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, sat, warm, blur; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (blur > 0.001) { // radial speed blur, strongest at the screen edges
        vec2 dir = (vec2(0.5, 0.52) - vUv); float k = blur * smoothstep(0.35, 0.75, length(dir) * 1.4);
        vec3 acc = c; for (int i = 1; i < 7; i++) acc += texture2D(tDiffuse, vUv + dir * float(i) * 0.012 * k).rgb;
        c = acc / 7.0;
      }
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      c += warm * vec3(0.025, 0.01, -0.02) * smoothstep(0.4, 1.0, l) + warm * vec3(-0.01, 0.0, 0.02) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = vUv - 0.5; c *= 1.0 - vig * dot(d, d) * 1.6;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`
};
buildComposer();
let useBloom = Q.bloom;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  applyPixelRatio(); updateFov();
});

// ------------------------------------------------------------ input
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!started) return;
  if (e.code === 'KeyC' || e.code === 'KeyV') camMode = (camMode + 1) % 2;
  if (e.code === 'KeyN') timeOfDay = timeOfDay > 6 && timeOfDay < 19 ? 21 : 17.2;
  if (e.code === 'KeyG') { lockGolden = !lockGolden; if (lockGolden) timeOfDay = 17.3; toast(lockGolden ? 'Golden hour locked' : 'Day cycle running'); }
  if (e.code === 'KeyB') useBloom = !useBloom;
  if (e.code === 'KeyR') killPlayer('Respawning…');
  if (e.code === 'KeyM') bigMap = !bigMap;
  if (e.code === 'KeyH') $('help').classList.toggle('hide');
  if (e.code === 'Escape' || e.code === 'KeyP') openMenu();
  if (/^Digit[1-8]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (BIKES[i]) selectBike(i, true); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
// ------------------------------------------------------------ touch controls (multi-touch, analog stick, tilt option)
const touch = { steer: 0, gas: false, brake: false, lift: false, dive: false, look: false, tilt: false, tiltSteer: 0 };
// on-screen controls only while the player is actually using touch: any physical key press hides them,
// touching the screen again (after a few seconds without typing) brings them back
let inputMode = IS_TOUCH ? 'touch' : 'keys', lastKeyT = -1e9;
function applyInputMode() {
  const t = inputMode === 'touch';
  document.body.classList.toggle('touch', t);
  $('touch').classList.toggle('hide', !(t && started));
  if (!t) { touch.steer = 0; touch.gas = touch.brake = touch.lift = touch.dive = touch.look = false; document.querySelectorAll('#touch .on').forEach((el) => el.classList.remove('on')); $('knob').style.transform = ''; }
}
function showTouch() { if (inputMode !== 'touch') { inputMode = 'touch'; applyInputMode(); } }
addEventListener('touchstart', () => { if (performance.now() - lastKeyT > 4000) showTouch(); }, { passive: true });
addEventListener('keydown', () => { lastKeyT = performance.now(); if (inputMode !== 'keys') { inputMode = 'keys'; applyInputMode(); } });
{
  const stick = $('stick'), knob = $('knob');
  let sid = null;
  const move = (e) => {
    const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * R * 0.62}px, ${dy * R * 0.25}px)`;
    const dead = 0.08, a = Math.max(0, Math.abs(dx) - dead) / (1 - dead);
    touch.steer = Math.sign(dx) * Math.pow(a, 1.35); // finer control near centre
  };
  stick.addEventListener('pointerdown', (e) => { e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; touch.steer = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
}
document.querySelectorAll('[data-t]').forEach((el) => {
  const k = el.dataset.t; const ids = new Set();
  const on = (e) => { e.preventDefault(); ids.add(e.pointerId); el.setPointerCapture(e.pointerId); touch[k] = true; el.classList.add('on'); };
  const off = (e) => { ids.delete(e.pointerId); if (!ids.size) { touch[k] = false; el.classList.remove('on'); } };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
});
document.querySelectorAll('[data-a]').forEach((el) => el.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  const a = el.dataset.a;
  if (a === 'cam') camMode = (camMode + 1) % 2;
  if (a === 'reset') killPlayer('Respawning…');
  if (a === 'tilt') {
    if (!touch.tilt && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      try { if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return; } catch (err) { return; }
    }
    touch.tilt = !touch.tilt; el.classList.toggle('active', touch.tilt);
    $('stick').style.opacity = touch.tilt ? 0.35 : 1;
    toast(touch.tilt ? 'Tilt steering on' : 'Stick steering');
  }
}));
addEventListener('deviceorientation', (e) => {
  if (!touch.tilt) return;
  // landscape: rolling the tablet like a steering wheel changes beta; portrait: gamma
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let roll = Math.abs(ang) === 90 ? (e.beta || 0) * (ang === 90 ? 1 : -1) : (e.gamma || 0);
  const a = Math.max(0, Math.abs(roll) - 3) / 22;
  touch.tiltSteer = Math.sign(roll) * Math.min(1, a);
});
function readInput() {
  const k = (c) => !!keys[c];
  const kSteer = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  const tSteer = touch.tilt ? touch.tiltSteer : touch.steer;
  return {
    throttle: k('KeyW') || k('ArrowUp') || touch.gas ? 1 : 0,
    brake: k('KeyS') || k('ArrowDown') || touch.brake ? 1 : 0,
    steer: Math.max(-1, Math.min(1, kSteer + tSteer)),
    lift: k('ShiftLeft') || k('ShiftRight') || touch.lift,
    dive: k('ControlLeft') || k('ControlRight') || k('KeyQ') || touch.dive,
    handbrake: k('Space'),
    lookBack: k('KeyE') || touch.look
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
let grass = null; const dust = new Dust(scene); const marks = new TyreMarks(scene);
let started = false, camMode = 0, timeOfDay = 17.2, bigMap = false, lockGolden = false;
const DAY_MINUTES = 14; // real minutes for a full 24h cycle
const player = new Player();
let bikeIdx = 3, bike = null, traffic, wildlife, mapInfo;
const SPAWNS = {
  Forest: [-475, 12, 0], City: [-100, -150, 0], Neighborhood: [450, -102.5, Math.PI / 2], Highway: [-600, 816.8, Math.PI / 2]
};
let spawnName = 'City';
let safeHistory = [], deadTimer = 0, crashCam = null;

function selectBike(i, live) {
  bikeIdx = i;
  if (bike) {
    scene.remove(bike.root);
    // free GPU memory of the old bike (geometry is per-bike; skinned rider meshes share the cached asset, keep those)
    const riderG = bike.rider && bike.rider.group;
    bike.root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      for (let q = o; q; q = q.parent) if (q === riderG) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) if (m && !m.userData.shared) { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); }
    });
    if (bike.headlight) bike.headlight.dispose();
  }
  bike = buildBike(BIKES[i]);
  scene.add(bike.root);
  player.setBike(BIKES[i]);
  document.querySelectorAll('.bikecard').forEach((c, k) => c.classList.toggle('sel', k === i));
  if (live) toast(BIKES[i].name);
}
function spawnAt(name) {
  const [x, z, yaw] = SPAWNS[name];
  placePlayer(x, z, yaw);
}
// teleport + clear every bit of crash state (tumble, crash cam, fade, pending respawn)
function placePlayer(x, z, yaw) {
  if (tumble) { scene.remove(tumble.rider.o); tumble = null; selectBike(bikeIdx, false); }
  crashCam = null; deadTimer = -20; safeHistory = [];
  $('fade').style.opacity = 0; $('crash').classList.remove('show');
  player.reset(x, z, yaw);
  if (syncBike.s) Object.assign(syncBike.s, { f: 0, fv: 0, r: 0, rv: 0 });
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
  // throw bike and rider: rigid-body tumble with ground bounces and sliding friction
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), v = Math.max(4, Math.abs(player.speed));
  const r = bike.root; r.updateMatrixWorld(true);
  const riderObj = bike.rider.group; const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
  riderObj.getWorldPosition(wp); riderObj.getWorldQuaternion(wq); scene.attach(riderObj);
  tumble = {
    bike: { o: r, v: new THREE.Vector3(fx * v * 0.35, 2.6 + v * 0.06, fz * v * 0.35), w: new THREE.Vector3((Math.random() - 0.5) * 4 + 2, (Math.random() - 0.5) * 3, (Math.random() < 0.5 ? -1 : 1) * (3 + v * 0.2)), lift: 0.45 },
    rider: { o: riderObj, v: new THREE.Vector3(fx * v * 0.5, 3.2 + v * 0.08, fz * v * 0.5), w: new THREE.Vector3(3 + v * 0.15, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3), lift: 0.3 }
  };
  tumble.bike.o.position.y += 0.3; tumble.rider.o.position.y += 0.2;
  player.speed = 0; player.wheelieDist = 0;
  fadeDelay = camMode === 0 ? 0.45 : 1.4;
}
let tumble = null, fadeDelay = 0.45;
const _tq = new THREE.Quaternion(), _te = new THREE.Vector3();
function updateTumble(dt) {
  for (const k of ['bike', 'rider']) {
    const b = tumble[k], o = b.o;
    b.v.y -= 9.81 * dt;
    o.position.addScaledVector(b.v, dt);
    const gh = groundH(o.position.x, o.position.z) + b.lift;
    if (o.position.y < gh && b.v.y <= 0) {
      o.position.y = gh;
      if (b.v.y < -1.5) { b.v.y *= -0.32; b.w.multiplyScalar(0.7); } else b.v.y = 0;
      const f = Math.exp(-dt * 2.6); b.v.x *= f; b.v.z *= f; b.w.multiplyScalar(Math.exp(-dt * 2.2));
    }
    const ang = b.w.length() * dt; if (ang > 1e-5) { _te.copy(b.w).normalize(); _tq.setFromAxisAngle(_te, ang); o.quaternion.premultiply(_tq); }
  }
}
function respawn() {
  // pick a safe spot from ~4s before the crash
  const now = performance.now() / 1000;
  let spot = null;
  for (let i = safeHistory.length - 1; i >= 0; i--) if (now - safeHistory[i].t > 4) { spot = safeHistory[i]; break; }
  if (!spot) spawnAt(spawnName); else placePlayer(spot.x, spot.z, spot.yaw);
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
  // cinematic time: golden hours (sunrise/sunset) pass ~4x slower than midday/midnight
  // sunset is ~18:00 here: linger in the golden light before it, move briskly through the murky twilight after it
  const t0 = timeOfDay;
  const golden0 = (t0 > 16.0 && t0 < 17.9) || (t0 > 6.2 && t0 < 8.2);
  const dusk = (t0 >= 17.9 && t0 < 19.0) || (t0 > 5.2 && t0 <= 6.2);
  const pace = lockGolden ? 0 : golden0 ? 0.3 : dusk ? 3 : 1.6;
  timeOfDay = (timeOfDay + (dt * 24) / (DAY_MINUTES * 60) * pace * (keys['KeyT'] ? 40 : 1)) % 24;
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
  hemi.intensity = lerp(0.15, 0.6, day) * (1 + golden * 0.7);
  hemi.color.setRGB(lerp(0.35, 0.74, day), lerp(0.42, 0.84, day), lerp(0.7, 1, day)).lerp(new THREE.Color(1.0, 0.78, 0.6), golden * 0.45);
  hemi.groundColor.setRGB(0.29, 0.25, 0.19).lerp(new THREE.Color(0.45, 0.3, 0.2), golden * 0.6);
  const fogDay = new THREE.Color(hdrTex ? 0xc4d2e0 : 0xb9cde0).lerp(new THREE.Color(0xe0b89a), golden * 0.7);
  scene.fog.color.copy(fogDay).lerp(new THREE.Color(0x0a0f1a), night);
  scene.fog.near = lerp(60, 250, day); scene.fog.far = lerp(1100, 3300, day);
  renderer.toneMappingExposure = lerp(1.15, 0.72, day);
  starM.opacity = smoothstep(0.0, -0.2, elev);
  flareHolder.position.copy(camera.position).addScaledVector(sunDir, 4000); flare.visible = elev > -0.02;
  moon.position.copy(camera.position).addScaledVector(moonDir, 4300); moon.material.opacity = smoothstep(-0.05, 0.1, moonDir.y);
  stars.position.copy(camera.position);
  // emissives
  const nightAmt = smoothstep(0.12, -0.08, elev);
  for (const nm of nightMats) nm.mat.emissiveIntensity = Math.max(nm.min || 0, nm.max * nightAmt);
  headMat.emissiveIntensity = 0.4 + 3.5 * nightAmt; tailMat.emissiveIntensity = 0.6 + 2.5 * nightAmt;
  if (bloom) bloom.strength = 0.18 + nightAmt * 0.3;
  if (bike) bike.headlight.intensity = 5 + nightAmt * 55;
  lampTimer -= dt;
  if (lampTimer <= 0) {
    lampTimer = 0.25;
    const px = player.pos.x, pz = player.pos.z;
    const near = lamps.map((l) => [((l.x - px) ** 2 + (l.z - pz) ** 2), l]).sort((a, b) => a[0] - b[0]).slice(0, lampLights.length);
    near.forEach(([, l], i) => lampLights[i].position.set(l.x, l.y, l.z));
  }
  for (const l of lampLights) l.intensity = 75 * nightAmt;
  for (const mm of mountainMats) mm.color.setScalar(lerp(0.08, 1, day)).lerp(new THREE.Color(1, 0.75, 0.6), golden * 0.35);
  // impostor lighting (matches three's physically based lambert: /PI)
  IMP_UNIFORMS.sunDir.value.copy(lightDir);
  IMP_UNIFORMS.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
  IMP_UNIFORMS.ambCol.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI).addScalar((scene.environmentIntensity ?? 1) * 0.35 * (hdrTex ? 1 : 0.5));
  IMP_UNIFORMS.fogCol.value.copy(scene.fog.color); IMP_UNIFORMS.fogNear.value = scene.fog.near; IMP_UNIFORMS.fogFar.value = scene.fog.far;
  IMP_UNIFORMS.time.value += dt;
  // environment map refresh
  if (hdrTex) {
    scene.backgroundIntensity = lerp(0.015, 1, day) * lerp(1, 0.75, golden);
    scene.environmentIntensity = lerp(0.02, 0.5, day) * lerp(1, 1.1, golden);
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

// ------------------------------------------------------------ real headlight beams on the nearest cars at night
const carLights = [];
for (let i = 0; i < 4; i++) { const l = new THREE.SpotLight(0xfff1dc, 0, 70, 0.5, 0.6, 1.3); const t = new THREE.Object3D(); l.target = t; scene.add(l, t); carLights.push(l); }
let carLightT = 0, carLightCars = [];
function updateCarLights(dt) {
  const night = smoothstep(0.08, -0.06, sunDir.y);
  carLightT -= dt;
  if (carLightT <= 0) {
    carLightT = 0.3;
    carLightCars = night > 0.01 ? traffic.cars.map((c) => [(c.pos.x - player.pos.x) ** 2 + (c.pos.z - player.pos.z) ** 2, c]).filter((a) => a[0] < 90 * 90).sort((a, b) => a[0] - b[0]).slice(0, 4).map((a) => a[1]) : [];
  }
  carLights.forEach((l, i) => {
    const c = carLightCars[i];
    if (!c) { l.intensity = 0; return; }
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    l.position.set(c.pos.x + fx * c.L * 0.5, 0.75, c.pos.z + fz * c.L * 0.5);
    l.target.position.set(c.pos.x + fx * 25, 0, c.pos.z + fz * 25);
    l.intensity = 45 * night;
  });
}

// ------------------------------------------------------------ camera
const camPos = new THREE.Vector3(), tmpV = new THREE.Vector3(); let camDist = 5.2;
let headBob = 0, shake = 0, lookYaw = 0;
function updateCamera(dt, inp) {
  if (crashCam && tumble && camMode === 1) {
    const t = tumble.bike.o.position.clone().lerp(tumble.rider.o.position, 0.5);
    const want = tmpV.set(t.x - Math.sin(player.yaw) * 5.5 + Math.cos(player.yaw) * 2.5, Math.max(t.y, groundH(t.x, t.z)) + 2.2, t.z - Math.cos(player.yaw) * 5.5 - Math.sin(player.yaw) * 2.5);
    if (camPos.distanceTo(want) > 25) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-dt * 3));
    camera.position.copy(camPos); camera.lookAt(t.x, t.y + 0.4, t.z);
    return;
  }
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
    // eyes follow the actual head bone (so posture changes never put the camera inside the body), nudged slightly forward
    const hb = bike.rider.headBone;
    if (hb) { hb.getWorldPosition(tmpV); const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); tmpV.x += fx * 0.12; tmpV.z += fz * 0.12; tmpV.y += 0.08; }
    else { tmpV.copy(bike.headLocal); root.localToWorld(tmpV); }
    camera.position.copy(tmpV);
    camera.position.y += Math.sin(headBob) * 0.006 + (Math.random() - 0.5) * shake;
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw + Math.PI + lookYaw;
    camera.rotation.x = (player.slope + player.pitch) * 0.9 - 0.32 + (Math.random() - 0.5) * shake * 0.5;
    camera.rotation.z = -player.lean * 0.55;
    setFov(82 + Math.min(10, v * 0.15));
  } else {
    bike.rider.setFP(false);
    const fx = Math.sin(player.yaw + lookYaw), fz = Math.cos(player.yaw + lookYaw);
    // chase camera with obstruction handling: march from the rider toward the ideal spot and stop before trees/walls/terrain
    let dist = 5.2;
    for (let d = 0.8; d <= 5.2; d += 0.4) {
      const x = player.pos.x - fx * d, z = player.pos.z - fz * d, y = player.pos.y + 1.2 + (0.9 * d) / 5.2;
      let hit = y < groundH(x, z) + 0.4;
      if (!hit) for (const c of queryCols(x, z)) { if (c.h < y - 0.2) continue; if (c.t === 0 ? (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.45) ** 2 : x > c.minX - 0.45 && x < c.maxX + 0.45 && z > c.minZ - 0.45 && z < c.maxZ + 0.45) { hit = true; break; } }
      if (hit) { dist = Math.max(1.6, d - 0.4); break; }
    }
    camDist += (dist - camDist) * (dist < camDist ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 2.5)); // snap in fast, ease back out
    const want = tmpV.set(player.pos.x - fx * camDist, player.pos.y + 1.2 + 0.9 * camDist / 5.2, player.pos.z - fz * camDist);
    const gh = groundH(want.x, want.z) + 0.6; if (want.y < gh) want.y = gh;
    camPos.lerp(want, 1 - Math.exp(-dt * 7));
    if (camPos.distanceTo(want) > 20) camPos.copy(want);
    // never closer than 1.4 m to the rider horizontally (stops the camera clipping through the body after sharp turns)
    { const dx = camPos.x - player.pos.x, dz = camPos.z - player.pos.z, d = Math.hypot(dx, dz); if (d < 1.4) { const k = 1.4 / Math.max(d, 1e-3); camPos.x = player.pos.x + (d > 1e-3 ? dx * k : -fx * 1.4); camPos.z = player.pos.z + (d > 1e-3 ? dz * k : -fz * 1.4); } }
    camera.position.copy(camPos);
    camera.rotation.set(0, 0, 0);
    camera.lookAt(player.pos.x + fx * 2, player.pos.y + 1.1, player.pos.z + fz * 2);
    setFov(70 + Math.min(12, v * 0.2));
  }
}

// ------------------------------------------------------------ bike visual sync
let wheelRot = 0, crankRot = 0;
function syncBike(dt) {
  if (tumble) { updateTumble(dt); return; }
  const r = bike.root;
  r.visible = true;
  r.position.copy(player.pos);
  r.rotation.order = 'YXZ';
  r.rotation.y = player.yaw;
  r.rotation.x = -(player.slope + player.pitch);
  r.rotation.z = player.lean;
  wheelRot += (player.speed / player.spec.rr) * dt;
  bike.rear.rotation.x = wheelRot; bike.front.rotation.x = wheelRot * (player.spec.rr / player.spec.rf);
  bike.steer.rotation.y = -player.steer * 0.45 * (1 - clamp(Math.abs(player.speed) / 14, 0, 0.85));
  if (bike.crank) { crankRot += player.speed * 0.9 * dt; bike.crank.rotation.x = crankRot; }
  // ---- suspension: fork dive under braking, rear squat under power, landings, surface chatter
  const susp = syncBike.s || (syncBike.s = { f: 0, fv: 0, r: 0, rv: 0 });
  const rough = player.surface === 'asphalt' ? 0.002 : player.surface === 'concrete' ? 0.004 : 0.016;
  const v = Math.abs(player.speed);
  let fT = 0.02 + Math.max(0, -player.accel) * 0.009 - Math.max(0, player.accel) * 0.004, rT = 0.025 + Math.max(0, player.accel) * 0.006;
  if (player.air) { fT = -0.04; rT = -0.04; }
  if (player.pitch > 0.05) fT = -0.05; // front wheel unloaded in a wheelie
  if (susp.wasAir && !player.air) { const k = Math.min(1.2, player.airTime + 0.2); susp.fv += k * 1.6; susp.rv += k * 2.0; }
  susp.wasAir = player.air;
  const chatter = (Math.random() - 0.5) * rough * Math.min(1, v / 8);
  for (const [k, kv, T] of [['f', 'fv', fT + chatter], ['r', 'rv', rT - chatter]]) {
    susp[kv] += ((T - susp[k]) * 160 - susp[kv] * 14) * dt; susp[k] = clamp(susp[k] + susp[kv] * dt, -0.06, 0.16);
  }
  const body = r.children[0];
  body.position.y = -susp.r * 0.55;
  body.rotation.x = (susp.f - susp.r) / player.spec.wb * 0.8;
  if (bike.frontRest) bike.front.position.set(bike.frontRest.x, bike.frontRest.y + susp.f, bike.frontRest.z);
  bike.rider.update({ accel: player.accel, lean: player.lean, air: player.air, pitch: player.pitch });
}

// ------------------------------------------------------------ main loop
const clock = new THREE.Clock();
let shadowTick = 0; let frameAcc = 0, frames = 0, fpsShown = 0, qualityTimer = 0;
function loop() {
  if (window.__capture) return; // frame-stepped capture drives frame() directly
  requestAnimationFrame(loop);
  frame(clock.getDelta());
}
function frame(rawDt) {
  const dt = Math.min(rawDt, 0.1);
  const inp = started ? readInput() : { throttle: 0, brake: 0, steer: 0 };
  if (started) {
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps; i++) {
      const res = player.update(dt / steps, inp, traffic, wildlife);
      if (res) { onCrash(res); break; }
    }
    { const since = 3.2 - deadTimer; $('fade').style.opacity = !player.alive && deadTimer > 0 ? smoothstep(fadeDelay, fadeDelay + 0.6, since) : 0; }
    if (!player.alive) { deadTimer -= Math.min(rawDt, 0.25); if (deadTimer <= 0 && deadTimer > -10) { deadTimer = -20; respawn(); } }
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
  dust.update(dt, player, bike);
  if (started) marks.update(player, inp);
  updateCarLights(dt);
  for (const ax of ['x', 'z']) { const st = signal(ax, traffic.time || 0), m = signalMats[ax]; if (m) for (const c of ['r', 'y', 'g']) m[c].emissiveIntensity = st === c ? 3.2 : 0.02; }
  syncBike(dt);
  updateCamera(dt, inp);
  updateSky(dt);
  updateAudio(player, inp);
  if (gradePass) { const gl2 = smoothstep(0.45, 0.05, sunDir.y) * smoothstep(-0.08, 0.04, sunDir.y); gradePass.uniforms.warm.value = 0.75 + gl2 * 0.9; gradePass.uniforms.sat.value = 1.08 + gl2 * 0.08; }
  if (gradePass) { const v = Math.abs(player.speed); gradePass.uniforms.blur.value += ((player.alive ? smoothstep(26, 45, v) : 0) * 0.4 - gradePass.uniforms.blur.value) * Math.min(1, dt * 4); }
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
  if (Q.shadowEvery) { renderer.shadowMap.autoUpdate = false; shadowTick = (shadowTick + 1) % Q.shadowEvery; if (shadowTick === 0) renderer.shadowMap.needsUpdate = true; }
  if (!window.__norender) { if (composer) { composer.passes[1].enabled = useBloom; composer.render(); } else renderer.render(scene, camera); }
  // adaptive quality
  frameAcc += rawDt; frames++;
  if (frameAcc > 1) {
    fpsShown = Math.round(frames / frameAcc); $('fps').textContent = fpsShown + ' fps'; frames = 0; frameAcc = 0;
    qualityTimer++;
    // gentle dynamic resolution: never below the preset floor (stays sharp), steps back up when there's headroom
    const maxPr = Math.min(window.devicePixelRatio, Q.pr);
    let np = pixelRatio;
    if (qualityTimer > 2 && fpsShown < 28 && pixelRatio > Q.prMin) np = Math.max(Q.prMin, pixelRatio - 0.125);
    else if (qualityTimer > 5 && fpsShown > 52 && pixelRatio < maxPr) np = Math.min(maxPr, pixelRatio + 0.125);
    if (np !== pixelRatio) { pixelRatio = np; applyPixelRatio(); qualityTimer = 0; }
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
  document.querySelectorAll('[data-q]').forEach((b) => {
    b.classList.toggle('sel', b.dataset.q === qualityName);
    b.onclick = () => { if (b.dataset.q === qualityName) return; try { localStorage.setItem('voltride.q3', b.dataset.q); } catch (e) {} location.reload(); };
  });
  $('go').onclick = () => {
    initAudio(); audio && audio.ac.resume();
    $('menu').classList.add('hide');
    if (!started || spawnChanged()) spawnAt(spawnName);
    lastSpawn = spawnName; started = true;
    $('hud').classList.remove('hide');
    applyInputMode();
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
}

// ------------------------------------------------------------ boot
(async function boot() {
  status('Loading photo textures…'); await preloadImages((n, t) => status(`Loading photo textures… ${n}/${t}`));
  status('Loading HDRI sky…');
  await new Promise((res) => new RGBELoader().load('assets/hdri/sky.hdr' + AV, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; hdrTex = t;
    hdrEnv = pmrem.fromEquirectangular(t).texture; scene.background = t; scene.environment = hdrEnv; sky.visible = false; res();
  }, undefined, () => res()));
  status('Loading photoscanned trees & props…');
  const assets = { imp: {}, props: {} };
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all([
    ...['pine1', 'pine2', 'pine3', 'jacaranda', 'island'].map((n) => loadImpostor(n).then((r) => { if (r) assets.imp[n] = r; })),
    ...['rock_07', 'rock_09', 'boulder_01', 'fern_02', 'dead_tree_trunk', 'fire_hydrant', 'metal_trash_can', 'modular_street_seating', 'exterior_aircon_unit', 'concrete_road_barrier'].map((n) =>
      gl.loadAsync(`assets/models/props/${n}.glb${AV}`).then((g) => { assets.props[n] = g; }).catch((e) => console.warn('prop', n, e)))
  ]);
  const grassTex = await new THREE.TextureLoader().loadAsync('assets/impostors/grass_cards.webp' + AV).catch(() => null);
  if (grassTex) { grassTex.colorSpace = THREE.SRGBColorSpace; assets.grass = true; }
  await gl.loadAsync('assets/models/rider.glb' + AV).then((g) => setRiderAsset(g)).catch((e) => console.warn('rider', e));
  status('Generating world…'); await tick();
  buildWorld(scene, assets);
  if (grassTex) { const gd = makeGroundData();
    // near: geometry blades; mid: grass cards in a ring; far: big sparse cards
    const near = makeBlades(gd, Q.grass[0], Q.grass[1] * 0.62);
    const mid = makeGrass(grassTex, gd, Q.grass[0] * 0.55 | 0, Q.grass[1] * 1.4, 0.4, 1.1);
    const far = Q.far ? makeGrass(grassTex, gd, Q.grass[0] * 0.5 | 0, Q.grass[1] * 3.2, 0.42, 1.9) : null;
    scene.add(near, mid); if (far) scene.add(far);
    grass = { update: (x, z) => { near.update(x, z); mid.update(x, z); if (far) far.update(x, z); } }; }
  status('Loading cars…');
  {
    const draco = new DRACOLoader(); draco.setDecoderPath('./lib/jsm/libs/draco/gltf/');
    const cl = new GLTFLoader(); cl.setDRACOLoader(draco); cl.setMeshoptDecoder(MeshoptDecoder);
    await Promise.all([
      cl.loadAsync('assets/models/ferrari.glb' + AV).then((g) => addRealCar(g.scene, 4.6, (o) => o.name === 'body')).catch((e) => console.warn('car', e)),
      cl.loadAsync('assets/models/car_concept.glb' + AV).then((g) => addRealCar(g.scene, 4.7, (o, m) => /paint/i.test(m.name || ''))).catch((e) => console.warn('car', e))
    ]);
  }
  status('Spawning traffic…'); await tick();
  traffic = new Traffic(scene, Q.traffic);
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
window.__game = { player, scene, camera, renderer, get traffic() { return traffic; }, get wildlife() { return wildlife; }, get bike() { return bike; }, setTime: (t) => (timeOfDay = t), setCam: (m) => (camMode = m), keys, touch, selectBike: (i) => selectBike(i, false), step: (dt) => frame(dt), place: (x, z, yaw) => placePlayer(x, z, yaw), startCapture: () => { window.__capture = true; } };
