import * as THREE from 'three';

// ============================================================================================
// Multiplayer over WebRTC (PeerJS). No server to run: the free PeerJS cloud broker only
// introduces peers; game data flows directly between devices.
// Star topology: the room creator is the host and relays everyone's state to everyone.
// Room code "ABCD" -> host peer id "voltride-ABCD".  Add ?peer=host:port to use your own broker.
// ============================================================================================
const PREFIX = 'voltride-';
const COLORS = ['#ff5a5a', '#5ab4ff', '#ffd23a', '#7dff7a', '#ff7ae6', '#ffa64a', '#9a7aff', '#4affe0'];
let libP = null;
function loadLib() {
  if (window.Peer) return Promise.resolve();
  if (!libP) libP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/peerjs/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return libP;
}
function peerOpts() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: +(port || 9000), path: '/', secure: location.protocol === 'https:' && host !== 'localhost', debug: 0 };
}

export class Multiplayer {
  constructor(ctx) {
    this.c = ctx; // { scene, player, game, toast, $, buildBike, BIKES, bikeId: () => id }
    this.peer = null; this.host = false; this.conns = new Map(); this.hostConn = null;
    this.remote = new Map(); // id -> { name, bikeId, bike, label, cur, target, color }
    this.sendT = 0; this.code = null; this.standings = {};
  }
  connected() { return !!this.peer && (this.host || (this.hostConn && this.hostConn.open)); }
  isHost() { return this.host; }
  myId() { return this.peer && this.peer.id; }
  name() { return (this.c.$('mpname').value || 'Rider').slice(0, 14); }
  status(t) { this.c.$('mpstatus').textContent = t; }
  // ---------------------------------------------------------------- room setup
  async create() {
    await loadLib(); this.leave(true);
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join('');
    this.status('Creating room…');
    this.peer = new window.Peer(PREFIX + code, peerOpts()); this.host = true; this.code = code;
    this.peer.on('open', () => { this.status(`Room ${code} — share this code`); this.c.toast(`Room ${code} created`); this.refresh(); });
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('error', (e) => { this.status('Error: ' + (e.type === 'unavailable-id' ? 'code taken, try again' : e.type || e.message)); });
  }
  async join(code) {
    code = (code || '').trim().toUpperCase(); if (code.length < 4) { this.status('Enter a 4-letter code'); return; }
    await loadLib(); this.leave(true);
    this.status('Connecting…'); this.code = code;
    this.peer = new window.Peer(undefined, peerOpts()); this.host = false;
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
      this.hostConn = conn;
      conn.on('open', () => { this.status(`In room ${code}`); this.c.toast(`Joined room ${code}`); conn.send({ t: 'hi', n: this.name(), b: this.c.bikeId() }); this.refresh(); });
      conn.on('data', (m) => this.onMsg(m, conn));
      conn.on('close', () => { this.status('Host left the room'); this.clearRemotes(); this.refresh(); });
    });
    this.peer.on('error', (e) => this.status('Error: ' + (e.type === 'peer-unavailable' ? 'room not found' : e.type || e.message)));
  }
  leave(silent) {
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null; this.host = false; this.conns.clear(); this.hostConn = null; this.code = null; this.clearRemotes();
    if (!silent) { this.status('Offline'); this.refresh(); }
  }
  accept(conn) {
    conn.on('open', () => { this.conns.set(conn.peer, conn); this.refresh(); });
    conn.on('data', (m) => this.onMsg(m, conn));
    conn.on('close', () => { this.conns.delete(conn.peer); this.dropRemote(conn.peer); this.broadcast({ t: 'bye', id: conn.peer }); this.refresh(); });
  }
  // ---------------------------------------------------------------- messaging
  send(m) { if (this.host) this.broadcast(m); else if (this.hostConn && this.hostConn.open) this.hostConn.send(m); }
  broadcast(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m); }
  onMsg(m, conn) {
    if (this.host) {
      // host: record client state / relay events to everyone else
      if (m.t === 's' || m.t === 'hi') { m.id = conn.peer; this.applyState(m); }
      if (m.t === 'fin') { m.id = conn.peer; this.onFinish(m); this.broadcast(m, conn.peer); }
      if (m.t === 'hi') this.c.toast(`${m.n} joined`);
      return;
    }
    if (m.t === 'all') for (const st of m.list) { if (st.id !== this.myId()) this.applyState(st); }
    else if (m.t === 'bye') this.dropRemote(m.id);
    else if (m.t === 'race') { this.c.toast('Host started a race!'); this.c.game.startRace(m.i, false); this.standings = {}; }
    else if (m.t === 'fin') this.onFinish(m);
  }
  myState() {
    const p = this.c.player;
    return { t: 's', id: this.myId(), n: this.name(), b: this.c.bikeId(), x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +(p.slope + p.pitch).toFixed(3), lean: +p.lean.toFixed(3), steer: +p.steer.toFixed(2), sp: +p.speed.toFixed(1), a: p.alive ? 1 : 0 };
  }
  onFinish(m) {
    const r = this.standings[m.race] = this.standings[m.race] || []; r.push({ n: m.n || (this.remote.get(m.id) || {}).name || 'Rider', time: m.time });
    r.sort((a, b) => a.time - b.time);
    const el = this.c.$('standings'); if (el) el.innerHTML = r.map((e, i) => `${i + 1}. ${e.n} — ${e.time.toFixed(2)} s`).join('<br>');
    this.c.toast(`${m.n || 'A rider'} finished: ${m.time.toFixed(2)} s`);
  }
  slot() { // grid position for group race starts
    if (!this.connected()) return 0;
    const ids = [this.myId(), ...this.remote.keys()].sort(); return ids.indexOf(this.myId()) - (ids.length - 1) / 2;
  }
  // ---------------------------------------------------------------- remote riders
  applyState(st) {
    let r = this.remote.get(st.id);
    if (!r) {
      r = { name: st.n || 'Rider', bikeId: null, bike: null, color: COLORS[this.remote.size % COLORS.length], cur: null, target: null, wheel: 0 };
      this.remote.set(st.id, r); this.refresh();
    }
    if (st.n && st.n !== r.name) { r.name = st.n; if (r.label) { this.c.scene.remove(r.label); r.label = null; } this.refresh(); }
    if (st.b && st.b !== r.bikeId) this.setRemoteBike(r, st.b);
    if (st.x !== undefined) { r.target = st; if (!r.cur) r.cur = { ...st }; }
  }
  setRemoteBike(r, bikeId) {
    const spec = this.c.BIKES.find((b) => b.id === bikeId) || this.c.BIKES[0];
    if (r.bike) this.c.scene.remove(r.bike.root);
    r.bike = this.c.buildBike(spec); r.bikeId = bikeId; r.spec = spec;
    r.bike.rider.setFP(false); if (r.bike.headlight) r.bike.headlight.intensity = 0;
    this.c.scene.add(r.bike.root);
  }
  makeLabel(r) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.roundRect(4, 8, 248, 48, 22); x.fill();
    x.fillStyle = r.color; x.beginPath(); x.arc(30, 32, 9, 0, 6.283); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 26px Arial'; x.textBaseline = 'middle'; x.fillText(r.name, 48, 33);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, fog: false, sizeAttenuation: true }));
    s.scale.set(2.6, 0.65, 1); this.c.scene.add(s); r.label = s;
  }
  dropRemote(id) { const r = this.remote.get(id); if (!r) return; if (r.bike) this.c.scene.remove(r.bike.root); if (r.label) this.c.scene.remove(r.label); this.remote.delete(id); this.refresh(); }
  clearRemotes() { for (const id of [...this.remote.keys()]) this.dropRemote(id); }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.peer) return;
    this.sendT -= dt;
    if (this.sendT <= 0 && this.myId()) {
      this.sendT = 0.1; // 10 Hz
      const me = this.myState();
      if (this.host) {
        const list = [me]; for (const [id, r] of this.remote) if (r.target) list.push({ ...r.target, id, n: r.name, b: r.bikeId });
        this.broadcast({ t: 'all', list });
      } else if (this.hostConn && this.hostConn.open) this.hostConn.send(me);
    }
    // interpolate remote riders toward their latest state (smooth at 10 Hz)
    const k = 1 - Math.exp(-dt * 10);
    for (const r of this.remote.values()) {
      if (!r.bike || !r.target) continue;
      const c = r.cur, t = r.target;
      // extrapolate a little along the heading so motion stays fluid between packets
      const ex = t.x + Math.sin(t.yaw) * t.sp * 0.05, ez = t.z + Math.cos(t.yaw) * t.sp * 0.05;
      if (Math.hypot(ex - c.x, ez - c.z) > 30) { c.x = ex; c.z = ez; c.y = t.y; } // teleport/respawn
      c.x += (ex - c.x) * k; c.z += (ez - c.z) * k; c.y += (t.y - c.y) * k;
      let dy = t.yaw - c.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; c.yaw += dy * k;
      c.pitch += (t.pitch - c.pitch) * k; c.lean += (t.lean - c.lean) * k; c.steer += (t.steer - c.steer) * k;
      const root = r.bike.root; root.visible = t.a !== 0;
      root.position.set(c.x, c.y, c.z); root.rotation.order = 'YXZ'; root.rotation.set(-c.pitch, c.yaw, c.lean);
      r.wheel += (t.sp / r.spec.rr) * dt; r.bike.rear.rotation.x = r.wheel; r.bike.front.rotation.x = r.wheel * (r.spec.rr / r.spec.rf);
      r.bike.steer.rotation.y = -c.steer * 0.4;
      r.bike.rider.update({ accel: 0, lean: c.lean, air: false, pitch: 0 });
      if (!r.label) this.makeLabel(r);
      r.label.position.set(c.x, c.y + 2.35, c.z);
    }
  }
  drawMap(ctx, S, px, pz) {
    for (const r of this.remote.values()) { if (!r.cur) continue; ctx.fillStyle = r.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc((r.cur.x - px) * S, (r.cur.z - pz) * S, 4.5, 0, 6.283); ctx.fill(); ctx.stroke(); }
  }
  refresh() {
    const box = this.c.$('mpbox');
    if (!this.peer) { box.classList.remove('show'); this.c.$('mpleave').style.display = 'none'; return; }
    box.classList.add('show'); this.c.$('mpleave').style.display = '';
    const names = [`<b style="color:#fff">${this.name()} (you${this.host ? ', host' : ''})</b>`, ...[...this.remote.values()].map((r) => `<span style="color:${r.color}">● ${r.name}</span>`)];
    box.innerHTML = `ROOM <b>${this.code || '…'}</b> · ${this.remote.size + 1} rider${this.remote.size ? 's' : ''}<br>${names.join('<br>')}${this.host ? '<br><small>Ride into a race beacon to start a group race</small>' : ''}`;
  }
}
