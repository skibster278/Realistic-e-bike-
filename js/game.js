import * as THREE from 'three';
import { roads, trails, terrainH, groundH } from './world.js';

// ============================================================ save data
const KEY = 'voltride.save1';
// prices: you start on the slowest bike and earn your way up
export const PRICES = { city: 0, emtb: 900, fat: 2200, lbx: 5500, talaria: 9500, ultra: 16000, vargsm: 30000, varg: 42000 };
export const ORDER = ['city', 'emtb', 'fat', 'lbx', 'talaria', 'ultra', 'vargsm', 'varg'];
const UP_COST = (id, kind, lvl) => Math.round(Math.max(250, (PRICES[id] || 1500) * (kind === 'motor' ? [0.22, 0.38, 0.6] : [0.12, 0.22, 0.35])[lvl]) / 10) * 10;
export const save = (() => {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  return Object.assign({ money: 0, owned: ['city'], sel: 'city', up: {}, best: {}, name: '', total: 0 }, d || {});
})();
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export function upLevel(id, kind) { return (save.up[id] && save.up[id][kind]) || 0; }
export function upgradeCost(id, kind) { const l = upLevel(id, kind); return l >= 3 ? null : UP_COST(id, kind, l); }
// spec with upgrades applied (motor: +14% power & +5% top speed per level; tyres: +6% grip per level)
export function tunedSpec(spec) {
  const m = upLevel(spec.id, 'motor'), t = upLevel(spec.id, 'tires');
  return { ...spec, power: spec.power * (1 + 0.14 * m), vmax: spec.vmax * (1 + 0.05 * m), gripMul: 1 + 0.06 * t };
}
export function addMoney(n) { save.money = Math.max(0, save.money + n); if (n > 0) save.total += n; }
export function buy(id) { const p = PRICES[id]; if (save.owned.includes(id) || save.money < p) return false; save.money -= p; save.owned.push(id); save.sel = id; persist(); return true; }
export function buyUpgrade(id, kind) {
  const c = upgradeCost(id, kind); if (c == null || save.money < c || !save.owned.includes(id)) return false;
  save.money -= c; save.up[id] = save.up[id] || {}; save.up[id][kind] = upLevel(id, kind) + 1; persist(); return true;
}
export const fmt = (n) => '$' + Math.floor(n).toLocaleString('en-US');

// ============================================================ wheelie zones (pitch in radians)
export const WZ = { green0: 0.6, green1: 0.95, red: 1.3, max: 1.72 };

// ============================================================ races
function roadPath(pts) { return pts.map(([x, z]) => [x, z]); }
function trailPath(t, every = 22, max = 14) { const out = []; for (let i = 6; i < t.length && out.length < max; i += every) out.push(t[i]); return out; }
export function makeRaces() {
  return [
    { id: 'city', name: 'Downtown Sprint', pts: roadPath([[-98, -270], [-98, -102], [-2, -102], [-2, 98], [198, 98], [198, -102], [102, -202]]), pace: 15 },
    { id: 'hwy', name: 'Highway Blast', pts: roadPath([[-1000, 816.8], [-500, 816.8], [0, 816.8], [500, 816.8], [895, 816.8], [1096.8, 600], [1096.8, 200]]), pace: 30 },
    { id: 'trail', name: 'Forest Trail Enduro', pts: trailPath(trails[2] || trails[0]), pace: 11, offroad: true },
    { id: 'hood', name: 'Suburb Loop', pts: roadPath([[402, -203], [598, -203], [598, -2], [798, -2], [798, 198], [402, 198], [402, 2]]), pace: 11 },
    { id: 'cross', name: 'Cross-Country', pts: roadPath([[-298, 2], [-480, 2], [-700, 2], [-900, 2], [-1146.8, 200], [-1146.8, 600], [-700, 816.8]]), pace: 24 }
  ].map((r) => {
    let len = 0; for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    r.len = len; r.par = len / r.pace; r.reward = Math.round((250 + len * 0.35) / 10) * 10;
    return r;
  });
}

// ============================================================ game layer
export class Game {
  constructor(ctx) {
    this.c = ctx; // { scene, player, traffic, toast, place, $ }
    this.races = makeRaces();
    this.race = null; this.combo = 0; this.comboT = 0; this.pending = 0; this.payT = 0; this.lastPos = null; this.nearCool = 0;
    this.mp = null; // multiplayer hooks set later
    this.buildMarkers();
  }
  buildMarkers() {
    const scene = this.c.scene;
    this.beacons = this.races.map((r) => {
      const [x, z] = r.pts[0], y = groundH(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 20; g.add(beam);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 8, 48), new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.85 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; g.add(ring);
      g.add(this.label(r.name, 4.8));
      scene.add(g); return g;
    });
    // gate pool: next gate is bright, the one after is faint
    const gate = () => { const m = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.28, 10, 56), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.9, fog: false })); m.visible = false; scene.add(m); return m; };
    this.gates = [gate(), gate()];
    this.gates[1].material = this.gates[1].material.clone(); this.gates[1].material.opacity = 0.35;
    this.flag = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.32, 10, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false })); this.flag.visible = false; scene.add(this.flag);
  }
  label(text, y) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(8,16,28,0.72)'; x.beginPath(); x.roundRect(8, 16, 496, 96, 26); x.fill();
    x.fillStyle = '#7fe6ff'; x.font = 'bold 26px Arial'; x.textAlign = 'center'; x.fillText('RACE', 256, 52);
    x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.fillText(text, 256, 96);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, fog: false })); s.scale.set(10, 2.5, 1); s.position.y = y + 3; return s;
  }
  // ---------------------------------------------------- per-frame
  update(dt, started) {
    const p = this.c.player; if (!started) return;
    const t = performance.now() / 1000;
    for (const b of this.beacons) { b.children[1].scale.setScalar(1 + Math.sin(t * 3) * 0.05); b.visible = !this.race; }
    // ---- earnings while riding
    if (p.alive) {
      if (this.lastPos) {
        const d = Math.hypot(p.pos.x - this.lastPos.x, p.pos.z - this.lastPos.z);
        if (d < 20) {
          const kmh = Math.abs(p.speed) * 3.6;
          this.pending += d * 0.2 * (1 + kmh / 60);                                         // riding pays, faster pays more
          if (p.pitch > 0.08 && !p.air) this.pending += d * (p.pitch > WZ.green0 && p.pitch < WZ.green1 ? 1.6 : 0.45); // wheelies pay big in the balance zone
          if (p.air) this.combo += dt * 18;                                                   // air time
        }
      }
      this.lastPos = p.pos.clone();
      // near misses with traffic at speed
      this.nearCool -= dt;
      if (Math.abs(p.speed) > 9 && this.nearCool <= 0) for (const c of this.c.traffic.cars) {
        const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, d2 = dx * dx + dz * dz;
        if (d2 < (c.W / 2 + 1.6) ** 2 && d2 > (c.W / 2 + 0.5) ** 2) { this.combo += 25; this.nearCool = 1.2; this.trick('NEAR MISS +$25'); break; }
      }
      if (p.wheelieDist > 5) this.comboT = 1.5;
      this.payT += dt;
      if (this.payT > 0.5) { const n = this.pending; if (n >= 1) { addMoney(n); this.pending -= Math.floor(n); } this.payT = 0; }
      if (this.combo > 0 && !p.air) { this.comboT -= dt; if (this.comboT <= 0) { const v = Math.round(this.combo); if (v >= 5) { addMoney(v); this.trick('+' + fmt(v)); } this.combo = 0; } }
      else if (p.air) this.comboT = 0.6;
    } else { if (this.combo > 0) this.trick('Combo lost'); this.combo = 0; this.lastPos = null; }
    this.saveT = (this.saveT || 0) + dt; if (this.saveT > 5) { this.saveT = 0; persist(); }
    // ---- races
    if (!this.race) {
      if (p.alive) for (let i = 0; i < this.races.length; i++) {
        const r = this.races[i], [x, z] = r.pts[0];
        if ((p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < 4.2 * 4.2) { this.startRace(i, true); break; }
      }
    } else this.updateRace(dt);
    this.hud();
  }
  trick(text) { const el = this.c.$('earn'); el.textContent = text; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  // ---------------------------------------------------- races
  startRace(i, local) {
    const r = this.races[i];
    this.race = { r, i, next: 1, t: -3, done: false };
    // put the rider on the start line facing the first gate
    const [x, z] = r.pts[0], [nx, nz] = r.pts[1];
    const off = this.mp && this.mp.slot ? this.mp.slot() : 0, yaw = Math.atan2(nx - x, nz - z);
    this.c.place(x - Math.cos(yaw) * off * 2.2, z + Math.sin(yaw) * off * 2.2, yaw);
    this.c.toast(r.name + ' — ride through the gates');
    if (local && this.mp && this.mp.isHost && this.mp.isHost()) this.mp.send({ t: 'race', i });
  }
  updateRace(dt) {
    const R = this.race, p = this.c.player, r = R.r;
    R.t += dt;
    if (R.t < 0) { p.speed = 0; p.pos.y = groundH(p.pos.x, p.pos.z); this.c.$('countdown').textContent = Math.ceil(-R.t); this.c.$('countdown').classList.add('show'); this.placeGates(); return; }
    if (R.t - dt < 0) { this.c.$('countdown').textContent = 'GO!'; setTimeout(() => this.c.$('countdown').classList.remove('show'), 700); }
    const [gx, gz] = r.pts[R.next];
    if ((p.pos.x - gx) ** 2 + (p.pos.z - gz) ** 2 < 7.5 * 7.5) {
      R.next++;
      if (R.next >= r.pts.length) return this.finishRace();
      this.c.toast(`Checkpoint ${R.next - 1}/${r.pts.length - 1}`);
    }
    // abandon if the rider wanders far from the route
    if ((p.pos.x - gx) ** 2 + (p.pos.z - gz) ** 2 > 420 * 420) { this.c.toast('Race abandoned'); this.endRace(); }
    this.placeGates();
  }
  placeGates() {
    const R = this.race, r = R.r;
    this.gates.forEach((g, k) => {
      const i = R.next + k; g.visible = i < r.pts.length - (k === 0 ? 0 : 1) || (k === 0 && i < r.pts.length);
      if (i >= r.pts.length) { g.visible = false; return; }
      const [x, z] = r.pts[i], [px, pz] = r.pts[i - 1];
      g.position.set(x, groundH(x, z) + 5.2, z); g.rotation.set(0, Math.atan2(x - px, z - pz), 0);
      if (k === 0) g.material.color.set(i === r.pts.length - 1 ? 0xffffff : 0xffc23a);
    });
  }
  finishRace() {
    const R = this.race, r = R.r, t = R.t;
    const medal = t <= r.par ? 'GOLD' : t <= r.par * 1.25 ? 'SILVER' : 'BRONZE';
    const pay = Math.round(r.reward * (medal === 'GOLD' ? 1 : medal === 'SILVER' ? 0.6 : 0.35));
    const prev = save.best[r.id]; const record = !prev || t < prev; if (record) save.best[r.id] = t;
    addMoney(pay); persist();
    this.showResult(`${r.name}`, `${t.toFixed(2)} s · ${medal}${record ? ' · NEW RECORD' : ''}`, `+${fmt(pay)}`);
    if (this.mp && this.mp.connected()) { const m = { t: 'fin', race: r.id, time: t, n: this.mp.name(), id: this.mp.myId() }; this.mp.onFinish(m); this.mp.send(m); }
    this.endRace();
  }
  endRace() { this.race = null; for (const g of this.gates) g.visible = false; this.c.$('countdown').classList.remove('show'); }
  showResult(a, b, c) { const el = this.c.$('result'); el.innerHTML = `<b>${a}</b><span>${b}</span><em>${c}</em><div id="standings"></div>`; el.classList.add('show'); clearTimeout(this.resT); this.resT = setTimeout(() => el.classList.remove('show'), 7000); }
  // ---------------------------------------------------- HUD
  hud() {
    const p = this.c.player, $ = this.c.$;
    $('money').textContent = fmt(save.money);
    const wb = $('wbar');
    if (p.pitch > 0.03 && p.alive && !p.air) {
      wb.classList.add('show');
      $('wneedle').style.bottom = Math.min(100, (p.pitch / WZ.max) * 100).toFixed(1) + '%';
      const z = p.pitch > WZ.red ? 'red' : p.pitch > WZ.green0 && p.pitch < WZ.green1 ? 'green' : 'amber';
      wb.dataset.zone = z;
    } else wb.classList.remove('show');
    const rt = $('racetime');
    if (this.race && this.race.t >= 0) { rt.classList.add('show'); rt.innerHTML = `<b>${this.race.t.toFixed(1)}s</b> · CP ${this.race.next}/${this.race.r.pts.length - 1}<small>par ${this.race.r.par.toFixed(0)}s</small>`; }
    else rt.classList.remove('show');
  }
  // minimap extras: race starts, next gate, remote players (drawn in the minimap's world-relative frame)
  drawMap(ctx, S, px, pz) {
    if (!this.race) for (const r of this.races) { const [x, z] = r.pts[0]; ctx.fillStyle = '#3fd0ff'; ctx.beginPath(); ctx.arc((x - px) * S, (z - pz) * S, 4, 0, 6.283); ctx.fill(); }
    else { const r = this.race.r; ctx.strokeStyle = '#ffc23a'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = this.race.next - 1; i < r.pts.length; i++) { const [x, z] = r.pts[i]; const X = (x - px) * S, Z = (z - pz) * S; i === this.race.next - 1 ? ctx.moveTo(X, Z) : ctx.lineTo(X, Z); } ctx.stroke(); }
    if (this.mp) this.mp.drawMap(ctx, S, px, pz);
  }
}
