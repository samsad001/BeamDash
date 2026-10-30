// Virtual dyno, drift meter, crash detector and achievements. Saved to data/fun.json.
'use strict';

const G = 9.81;
const BIN = 250; // rpm per dyno bin

const ACHIEVEMENTS = [
  { id: 'first_km', name: 'First kilometre', desc: 'Drive 1 km' },
  { id: 'road_trip', name: 'Road trip', desc: 'Drive 100 km in total' },
  { id: 'ton', name: 'The ton', desc: 'Reach 100 mph (161 km/h)' },
  { id: 'double_ton', name: 'Double ton', desc: 'Reach 200 mph (322 km/h)' },
  { id: 'sub5', name: 'Quick', desc: '0-100 km/h under 5 s' },
  { id: 'sub3', name: 'Rocket', desc: '0-100 km/h under 3 s' },
  { id: 'quarter12', name: 'Drag strip', desc: '1/4 mile under 12 s' },
  { id: 'lap', name: 'Lap runner', desc: 'Complete a timed lap' },
  { id: 'drift_1k', name: 'Sideways', desc: 'Score 1 000 in one drift' },
  { id: 'drift_10k', name: 'Drift king', desc: 'Score 10 000 in one drift' },
  { id: 'g15', name: 'Glued to the road', desc: 'Pull 1.5 g in a corner' },
  { id: 'airtime', name: 'Airtime', desc: 'Fly for a full second' },
  { id: 'crash6', name: 'Crash test dummy', desc: 'Survive a 6 g impact' },
  { id: 'eco90', name: 'Eco hero', desc: 'Eco score 90+ over 10 km' },
  { id: 'night', name: 'Night owl', desc: 'Drive 10 km at night (in-game)' },
];

class Fun {
  constructor(saved) {
    const s = saved || {};
    this.dyno = s.dyno || {};
    this.unlocked = s.unlocked || {};
    this.crashes = s.crashes || [];
    this.driftBest = s.driftBest || 0;
    this.totalDist = s.totalDist || 0;
    this.nightDist = s.nightDist || 0;
    this.carKey = null;
    this.drift = { angle: 0, score: 0, active: false, time: 0, quiet: 0, last: 0 };
    this.air = 0;
    this.recent = []; // [t, speed, damage]
    this.pendingCrash = null;
    this.peakLat = 0;
    this.events = [];
    this.dirty = false;
    this.prevT = 0;
  }

  setCar(key) { this.carKey = key; }

  unlock(id) {
    if (this.unlocked[id]) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.unlocked[id] = Date.now();
    this.events.push(`🏆 Achievement: ${a.name}`);
    this.dirty = true;
  }

  // m: veh message; e: merged electrics; damage: total damage; ctx: { night, perf, trips }
  update(m, e, damage, ctx) {
    const now = Date.now();
    const dt = this.prevT ? (now - this.prevT) / 1000 : 0;
    this.prevT = now;
    if (dt <= 0 || dt > 1) return;
    const v = Math.abs(e.wheelspeed ?? e.airspeed ?? 0);
    const g = m.g || [0, 0, G];

    // distance-based achievements
    this.totalDist += v * dt;
    if (ctx.night) this.nightDist += v * dt;
    if (this.totalDist > 1000) this.unlock('first_km');
    if (this.totalDist > 100000) this.unlock('road_trip');
    if (this.nightDist > 10000) this.unlock('night');
    if (v > 44.7) this.unlock('ton');
    if (v > 89.4) this.unlock('double_ton');
    const lat = Math.abs(g[0]) / G;
    if (lat > 1.5 && v > 10) this.unlock('g15');

    // airtime: vertical g near zero while moving
    if (Math.abs(g[2]) < 2 && v > 5) { this.air += dt; if (this.air > 1) this.unlock('airtime'); } else this.air = 0;

    // virtual dyno: best power / torque seen per rpm band at (near) full throttle
    const rpm = e.rpm || 0;
    const engine = e.bd_hasEngine !== false && (e.bd_engTorque || 0) !== 0;
    const torque = engine ? e.bd_engTorque : e.bd_motorTorque;
    const power = engine ? e.bd_engPower : e.bd_motorPower;
    const motorRpm = !engine && e.bd_motorPower && e.bd_motorTorque ? Math.abs(e.bd_motorPower * 1000 / e.bd_motorTorque) * 9.5493 : rpm;
    if (this.carKey && (e.throttle ?? 0) > 0.85 && typeof torque === 'number' && torque > 0) {
      const r = engine ? rpm : motorRpm;
      const bin = Math.round(r / BIN) * BIN;
      const car = (this.dyno[this.carKey] = this.dyno[this.carKey] || { bins: {}, kind: engine ? 'engine' : 'motor' });
      const cur = car.bins[bin] || [0, 0];
      if (power > cur[0] || torque > cur[1]) { car.bins[bin] = [Math.max(cur[0], power), Math.max(cur[1], torque)]; this.dirty = true; }
    }

    // drift: angle between where the car points and where it's going
    let angle = 0;
    if (m.dir && m.vel && v > 5) {
      const hd = Math.atan2(m.dir[1], m.dir[0]), mv = Math.atan2(m.vel[1], m.vel[0]);
      let d = (mv - hd) * 180 / Math.PI;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      angle = Math.abs(d) > 120 ? 0 : d; // ignore reversing
    }
    const dr = this.drift;
    dr.angle = angle;
    if (Math.abs(angle) > 12 && v > 8) {
      dr.active = true; dr.quiet = 0; dr.time += dt;
      dr.score += Math.abs(angle) * v * dt * (1 + Math.min(dr.time, 10) / 5); // longer drifts multiply
    } else if (dr.active) {
      dr.quiet += dt;
      if (dr.quiet > 1.2) {
        dr.last = Math.round(dr.score);
        if (dr.last > this.driftBest) { this.driftBest = dr.last; this.events.push(`New best drift: ${dr.last}`); this.dirty = true; }
        if (dr.last >= 1000) this.unlock('drift_1k');
        if (dr.last >= 10000) this.unlock('drift_10k');
        dr.active = false; dr.score = 0; dr.time = 0;
      }
    }

    // crash: a big horizontal g spike; report speed just before, peak g and damage added
    this.recent.push([now, v, damage]);
    while (this.recent.length && now - this.recent[0][0] > 1500) this.recent.shift();
    const hg = Math.hypot(g[0], g[1]) / G;
    if (this.pendingCrash) {
      const pc = this.pendingCrash;
      pc.peakG = Math.max(pc.peakG, hg);
      if (now - pc.t > 1000) {
        pc.damage = Math.max(0, damage - pc.damage0);
        delete pc.damage0;
        this.crashes.unshift(pc);
        this.crashes = this.crashes.slice(0, 20);
        this.events.push(`💥 Crash: ${pc.peakG.toFixed(1)} g at ${Math.round(pc.speed * 3.6)} km/h`);
        if (pc.peakG >= 6) this.unlock('crash6');
        this.pendingCrash = null;
        this.dirty = true;
      }
    } else if (hg > 4 && v > 3) {
      const before = Math.max(...this.recent.map((r) => r[1]));
      this.pendingCrash = { t: now, at: now, speed: before, peakG: hg, damage0: this.recent[0] ? this.recent[0][2] : damage, pos: m.pos || null };
    }

    // results from other modules
    const best = (ctx.perf && ctx.perf.best) || {};
    if (best.t100 !== undefined && best.t100 < 5) this.unlock('sub5');
    if (best.t100 !== undefined && best.t100 < 3) this.unlock('sub3');
    if (best.quarter && best.quarter.time < 12) this.unlock('quarter12');
    if (ctx.lapDone) this.unlock('lap');
    const tr = ctx.trips && ctx.trips.a;
    if (tr && tr.dist > 10000 && tr.eco >= 90) this.unlock('eco90');
  }

  snapshot() {
    const car = this.carKey && this.dyno[this.carKey];
    return {
      drift: { angle: this.drift.angle, score: Math.round(this.drift.score), active: this.drift.active, last: this.drift.last, best: this.driftBest },
      dyno: car ? { kind: car.kind, bins: car.bins } : null,
      crashes: this.crashes.slice(0, 10),
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, at: this.unlocked[a.id] || null })),
      totalDist: this.totalDist,
    };
  }

  resetDyno() { if (this.carKey) { delete this.dyno[this.carKey]; this.dirty = true; } }
  resetDrift() { this.driftBest = 0; this.drift.last = 0; this.dirty = true; }

  toJSON() {
    // keep the saved dyno list small
    const keys = Object.keys(this.dyno);
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete this.dyno[k];
    return { dyno: this.dyno, unlocked: this.unlocked, crashes: this.crashes, driftBest: this.driftBest, totalDist: this.totalDist, nightDist: this.nightDist };
  }
}

module.exports = { Fun, ACHIEVEMENTS };
