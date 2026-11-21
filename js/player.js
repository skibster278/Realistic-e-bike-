import * as THREE from 'three';
import { groundH, surfaceAt, queryCols } from './world.js';
import { clamp } from './util.js';

const G = 9.81;
const GRIP = { asphalt: 1.0, concrete: 0.95, dirt: 0.75, grass: 0.6 };

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.vy = 0;
    this.lean = 0; this.steer = 0; this.pitch = 0; this.pitchVel = 0; this.slope = 0;
    this.air = false; this.alive = true; this.battery = 100; this.wheelieDist = 0; this.bestWheelie = 0; this.airTime = 0;
    this.accel = 0; this.surface = 'asphalt'; this.crashReason = '';
  }
  setBike(spec) {
    this.spec = spec;
    this.vmax = spec.vmax / 3.6;
    this.isMoto = spec.kind === 'moto';
  }
  reset(x, z, yaw) {
    this.pos.set(x, groundH(x, z), z); this.yaw = yaw; this.speed = 0; this.vy = 0; this.pitch = 0; this.pitchVel = 0;
    this.lean = 0; this.steer = 0; this.air = false; this.alive = true; this.wheelieDist = 0;
  }
  fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

  update(dt, inp, traffic, wildlife) {
    if (!this.alive) return null;
    const s = this.spec, v = this.speed, av = Math.abs(v);
    this.surface = surfaceAt(this.pos.x, this.pos.z);
    const grip = GRIP[this.surface] * (s.tire === 'slick' && this.surface !== 'asphalt' && this.surface !== 'concrete' ? 0.7 : 1) * (s.tire === 'knobby' && this.surface !== 'asphalt' ? 1.1 : 1);
    const offroadDrag = this.surface === 'grass' ? (s.tire === 'street' ? 0.08 : 0.035) : this.surface === 'dirt' ? 0.02 : 0.012;

    // ---------------- longitudinal
    let a = 0;
    const thr = inp.throttle;
    if (!this.air) {
      if (thr > 0 && v >= -0.5) {
        const pAcc = (s.power * thr) / (s.mass * Math.max(av, 2.5));
        const trac = grip * G * (this.isMoto ? 0.95 : 0.7);
        a += Math.min(pAcc, trac) * (v > this.vmax ? 0 : 1 - Math.pow(Math.max(0, v) / this.vmax, 6));
      }
      if (inp.brake > 0) {
        if (v > 0.3) a -= inp.brake * 8.5 * grip * (this.pitch > 0.05 ? 0.35 : 1);
        else if (thr === 0) a -= 1.5 * inp.brake; // slow reverse push
      }
      if (inp.handbrake && v > 0.2) a -= 5 * grip;
      a -= offroadDrag * G * Math.sign(v);
      // slope gravity
      a -= G * Math.sin(this.slope) * 0.9;
    }
    const cda = this.isMoto ? 0.55 : 0.45;
    a -= (0.5 * 1.2 * cda * v * Math.abs(v)) / s.mass;
    this.accel = a;
    const vPrev = this.speed;
    this.speed += a * dt;
    if (vPrev > 0 && this.speed < 0 && !(inp.brake > 0 && thr === 0 && av < 0.4)) this.speed = 0;
    if (this.speed < -2) this.speed = -2;
    if (Math.abs(this.speed) < 0.05 && thr === 0) this.speed = 0;
    // battery
    this.battery = Math.max(0, this.battery - (thr * s.power * dt) / (s.power * 900));
    if (this.battery <= 0) this.battery = 100; // auto swap pack

    // ---------------- steering / lean
    const steerIn = inp.steer; // -1..1 (right +)
    this.steer += (steerIn - this.steer) * Math.min(1, dt * (av > 15 ? 3.5 : 6));
    const frontDown = this.pitch < 0.15;
    const maxLean = 0.85 * Math.min(1, grip + 0.15);
    const leanTarget = this.steer * maxLean * clamp(av / 9, 0, 1);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 5);
    let yawRate = 0;
    if (!this.air) {
      const lowSteer = this.steer * 0.6 * (1 - clamp(av / 12, 0, 1));
      yawRate = (v * Math.tan(lowSteer)) / s.wb;
      if (av > 1) yawRate += (G * Math.tan(this.lean)) / Math.max(av, 4) * Math.sign(v);
      if (!frontDown) yawRate *= 0.35;
    }
    this.yaw -= yawRate * dt;

    // ---------------- wheelie / pitch dynamics
    const pull = inp.lift ? 1 : 0, push = inp.dive ? 1 : 0;
    const pullEdge = pull && !this.pullPrev; this.pullPrev = pull;
    if (!this.air) {
      const pBal = 1.2;
      const grav = -9.5 * Math.sin(pBal - this.pitch);
      // wheelie control: power alone can't lift the front unless the rider asks for it (Shift / WHEELIE)
      let lift = (pull || this.pitch > 0.15) ? Math.max(0, a - 3.2) * 1.6 * (this.isMoto ? 1 : 0.5) : 0;
      if (!pull && this.pitch > 0.02 && this.pitch < 0.15) { this.pitchVel = Math.min(this.pitchVel, 0); }
      // rider-initiated wheelie: a "pop" when the button is first pressed, then sustained lift while on the gas.
      // Stronger bikes lift harder; it fades at high speed (aero + less torque) but stays possible to ~90 km/h.
      const spd = Math.min(1, Math.max(0.45, 1 - (av - 14) / 30));
      if (pullEdge && this.pitch < 0.1 && av > 0.5) this.pitchVel += (this.isMoto ? 1.6 + Math.min(1, s.power / 30000) : 2.0) * spd;
      lift += pull * (this.isMoto ? 11 + Math.min(2.5, s.power / 12000) : 11) * spd * (thr > 0.1 || !this.isMoto ? 1 : 0.35);
      if (!this.isMoto) lift += pull * thr * 1.5;
      // balance-point assist: the rider feathers power/rear brake as the front climbs, so a held wheelie
      // settles around ~50deg instead of looping (push past it with throttle on a hill or a big pop and you still can)
      if (pull && this.pitch > 0.5) lift *= Math.max(0, 1 - (this.pitch - 0.5) / 0.38);
      if (!pull && this.pitch > 0.15) lift *= Math.max(0, 1 - (this.pitch - 0.15) / 0.6);
      let tq = lift + grav;
      if (pull && this.pitch > 0.78 && this.pitchVel > 0) tq -= 16 * (this.pitch - 0.7); // automatic rear-brake dab near the balance point
      if (this.pitch > 0.01) {
        tq -= (inp.brake > 0 ? 14 : 0) + push * 6;
      }
      if (this.pitch <= 0 && tq < 0) { this.pitch = 0; this.pitchVel = 0; }
      else {
        this.pitchVel += tq * dt; this.pitchVel *= Math.exp(-dt * (pull ? 3.2 : 1.5));
        this.pitch += this.pitchVel * dt;
        if (this.pitch < 0) { this.pitch = 0; this.pitchVel = Math.max(0, -this.pitchVel * 0.2); }
      }
      if (this.pitch > 1.72) return this.crash('Looped out!');
      if (this.pitch > 0.12 && this.speed > 1) { this.wheelieDist += this.speed * dt; } else if (this.pitch < 0.05) { if (this.wheelieDist > this.bestWheelie) this.bestWheelie = this.wheelieDist; this.wheelieDistShown = this.wheelieDist; this.wheelieDist = 0; }
    } else {
      // air control
      this.pitchVel += (pull * 3.5 - push * 3.5) * dt; this.pitchVel *= Math.exp(-dt * 0.6);
      this.pitch += this.pitchVel * dt;
    }

    // ---------------- move
    const [fx, fz] = this.fwd();
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    // collisions with static colliders
    const col = this.collide(nx, nz);
    if (col) {
      if (Math.abs(this.speed) > 7) return this.crash('Crashed into ' + col);
      this.speed = 0;
    } else { this.pos.x = nx; this.pos.z = nz; }
    // traffic
    const hit = traffic.hit(this.pos.x, this.pos.z, 0.45);
    if (hit) {
      const c = hit.car, rel = Math.hypot(fx * this.speed - Math.sin(c.yaw) * c.speed, fz * this.speed - Math.cos(c.yaw) * c.speed);
      if (rel > 5 || c.speed > 4) return this.crash(c.speed > 4 ? 'Hit by traffic' : 'Crashed into a car');
      this.speed = 0; this.pos.x -= fx * 0.3; this.pos.z -= fz * 0.3;
    }
    const an = wildlife.hit(this.pos.x, this.pos.z);
    if (an && an.kind === 'deer' && Math.abs(this.speed) > 8) return this.crash('Hit a deer!');

    // vertical
    const gh = groundH(this.pos.x, this.pos.z);
    const ghF = groundH(this.pos.x + fx * s.wb, this.pos.z + fz * s.wb);
    const slope = Math.atan2(ghF - gh, s.wb);
    if (!this.air) {
      const implied = (gh - this.pos.y) / dt;
      if (implied < this.vy - G * dt * 1.5 && gh < this.pos.y - 0.05) {
        this.air = true; this.airTime = 0; this.pitchVel += (this.slope - slope) * 0.0; // launch
      } else {
        this.vy = implied; this.pos.y = gh; this.slope += (slope - this.slope) * Math.min(1, dt * 15);
      }
    }
    if (this.air) {
      this.airTime += dt;
      this.vy -= G * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= gh) {
        // landing
        const bikeAngle = this.slope + this.pitch; // nose up positive
        const diff = Math.abs(bikeAngle - slope);
        this.pos.y = gh; this.air = false;
        if (this.vy < -16) return this.crash('Cased it! Landed too hard');
        if (diff > 0.75 && this.airTime > 0.35) return this.crash('Bad landing');
        // convert into pitch: land on rear if nose high
        this.pitch = Math.max(0, bikeAngle - slope);
        this.pitchVel = 0; this.slope = slope; this.vy = 0;
        this.landed = Math.min(1, this.airTime);
      }
    }
    return null;
  }
  collide(x, z) {
    const cols = queryCols(x, z), y = this.pos.y;
    for (const c of cols) {
      if (c.h < y - 0.3) continue;
      if (c.t === 0) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < (c.r + 0.35) ** 2) return c.h > 15 ? 'a tree' : c.h > 5 ? 'a pole' : 'a rock'; }
      else if (x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4) return c.h > 2 ? 'a building' : 'a barrier';
    }
    return null;
  }
  crash(reason) { this.alive = false; this.crashReason = reason; return reason; }
}
