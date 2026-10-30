// Performance timer (0-100 km/h, 0-60 mph, 100-200 km/h, 1/8 and 1/4 mile with trap speed, 100-0 / 60-0 braking)
// and lap timer (start/finish line, 3 sectors, live gap to best lap). Best results are saved per level / overall.
'use strict';

const MPH60 = 26.8224, KMH100 = 27.7778, KMH200 = 55.5556;
const EIGHTH = 201.168, QUARTER = 402.336;
const lerpT = (t0, t1, v0, v1, target) => (v1 === v0 ? t1 : t0 + (t1 - t0) * (target - v0) / (v1 - v0));

class Perf {
  constructor(saved) {
    this.best = (saved && saved.best) || {};
    this.last = (saved && saved.last) || {};
    this.laps = (saved && saved.laps) || {}; // per level: { line, best, history }
    this.state = 'idle';
    this.run = null;
    this.brakes = [];
    this.lap = null;
    this.prev = null;
    this.level = null;
    this.dirty = false;
    this.events = [];
  }

  // ---------------------------------------------------------------- launch / braking timer
  update(e, pos, now) {
    const v = Math.abs(e.wheelspeed ?? e.airspeed ?? 0);
    const brake = e.brake ?? 0;
    const p = this.prev;
    this.prev = { t: now, v, pos };
    if (!p) return;
    const dt = (now - p.t) / 1000;
    if (dt <= 0 || dt > 1) { this.state = 'idle'; this.run = null; return; }

    // launch: stand still for half a second to arm, the timer starts the moment you move
    if (v < 0.3) {
      this.stillFor = (this.stillFor || 0) + dt;
      if (this.stillFor > 0.5 && this.state !== 'running') this.state = 'ready';
    } else this.stillFor = 0;
    if (this.state === 'ready' && v >= 0.3) {
      this.state = 'running';
      this.run = { t0: lerpT(p.t, now, p.v, v, 0.3), dist: 0, vmax: 0, res: {} };
    }
    if (this.state === 'running') {
      const r = this.run;
      const prevDist = r.dist;
      r.dist += (p.v + v) / 2 * dt;
      r.vmax = Math.max(r.vmax, v);
      const at = (key, target) => {
        if (r.res[key] === undefined && p.v < target && v >= target) r.res[key] = (lerpT(p.t, now, p.v, v, target) - r.t0) / 1000;
      };
      at('t60mph', MPH60); at('t100', KMH100); at('t200', KMH200);
      if (r.res.t100 !== undefined && r.res.t200 !== undefined && r.res.t100to200 === undefined) r.res.t100to200 = r.res.t200 - r.res.t100;
      const atDist = (key, target) => {
        if (r.res[key] === undefined && prevDist < target && r.dist >= target) {
          const tt = (lerpT(p.t, now, prevDist, r.dist, target) - r.t0) / 1000;
          r.res[key] = { time: tt, trap: v };
        }
      };
      atDist('eighth', EIGHTH); atDist('quarter', QUARTER);
      r.elapsed = (now - r.t0) / 1000;
      // lifting off ends the run (like a real launch timer): throttle under 30 % for 0.7 s
      r.lift = (e.throttle ?? 1) < 0.3 ? (r.lift || 0) + dt : 0;
      // the run ends when you lift, slow down, brake, or after 60 s
      if (r.lift > 0.7 || r.vmax - v > 4 || r.elapsed > 60 || (brake > 0.3 && v < r.vmax - 1)) this.finishRun();
    }

    // braking: 100-0 km/h and 60-0 mph, measured from the moment you pass the speed with the brake on
    for (const [key, from] of [['brake100', KMH100], ['brake60mph', MPH60]]) {
      let b = this.brakes.find((x) => x.key === key);
      if (!b && p.v >= from && v < from && brake > 0.3) { b = { key, dist: 0, t0: now }; this.brakes.push(b); }
      if (!b) continue;
      b.dist += (p.v + v) / 2 * dt;
      if (v < 0.3) {
        this.last[key] = b.dist;
        if (this.best[key] === undefined || b.dist < this.best[key]) { this.best[key] = b.dist; this.events.push(`New best ${key === 'brake100' ? '100-0 km/h' : '60-0 mph'}: ${b.dist.toFixed(1)} m`); }
        this.brakes = this.brakes.filter((x) => x !== b);
        this.dirty = true;
      } else if (brake < 0.05 && now - b.t0 > 500) this.brakes = this.brakes.filter((x) => x !== b); // let off the brake: not a stop
    }

    this.updateLap(pos, now, p);
  }

  finishRun() {
    const r = this.run;
    this.state = 'idle';
    this.run = null;
    if (!r || !Object.keys(r.res).length) return;
    this.last = { ...this.last, ...r.res, at: Date.now() };
    for (const [k, v] of Object.entries(r.res)) {
      const val = typeof v === 'object' ? v.time : v;
      const bestVal = this.best[k] && typeof this.best[k] === 'object' ? this.best[k].time : this.best[k];
      if (bestVal === undefined || val < bestVal) {
        this.best[k] = v;
        const names = { t60mph: '0-60 mph', t100: '0-100 km/h', t200: '0-200 km/h', t100to200: '100-200 km/h', eighth: '1/8 mile', quarter: '1/4 mile' };
        this.events.push(`New best ${names[k] || k}: ${val.toFixed(2)} s`);
      }
    }
    this.dirty = true;
  }

  resetBest() { this.best = {}; this.last = {}; this.dirty = true; }

  // ---------------------------------------------------------------- lap timer
  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    this.lap = null;
  }
  track() { return this.level ? (this.laps[this.level] = this.laps[this.level] || { line: null, best: null, history: [] }) : null; }

  setLine(line) {
    const tr = this.track();
    if (!tr) return false;
    tr.line = line;
    tr.best = null;
    tr.history = [];
    this.lap = null;
    this.dirty = true;
    return true;
  }
  clearLine() { const tr = this.track(); if (tr) { tr.line = null; this.lap = null; this.dirty = true; } }
  resetLaps() { const tr = this.track(); if (tr) { tr.best = null; tr.history = []; this.lap = null; this.dirty = true; } }

  updateLap(pos, now, p) {
    const tr = this.track();
    if (!tr || !tr.line || !pos || !p || !p.pos) return;
    const L = tr.line;
    const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    // did the car's path this tick cross the start/finish segment, in the right direction?
    const d1 = cross(L.x1, L.y1, L.x2, L.y2, p.pos[0], p.pos[1]);
    const d2 = cross(L.x1, L.y1, L.x2, L.y2, pos[0], pos[1]);
    const d3 = cross(p.pos[0], p.pos[1], pos[0], pos[1], L.x1, L.y1);
    const d4 = cross(p.pos[0], p.pos[1], pos[0], pos[1], L.x2, L.y2);
    const crossed = d1 * d2 < 0 && d3 * d4 < 0 && Math.sign(d2) === (L.dir || Math.sign(d2));
    if (this.lap) {
      const step = Math.hypot(pos[0] - p.pos[0], pos[1] - p.pos[1]);
      this.lap.dist += step;
      const elapsed = (now - this.lap.t0) / 1000;
      this.lap.elapsed = elapsed;
      if (this.lap.dist >= this.lap.nextProfile) { this.lap.profile.push(elapsed); this.lap.nextProfile += 10; }
      const ref = tr.best && tr.best.dist;
      if (ref) {
        const sectorLen = ref / 3;
        while (this.lap.sectors.length < 2 && this.lap.dist >= sectorLen * (this.lap.sectors.length + 1)) {
          this.lap.sectors.push(elapsed - this.lap.sectors.reduce((a, b) => a + b, 0));
        }
        const idx = Math.floor(this.lap.dist / 10);
        if (tr.best.profile && tr.best.profile[idx] !== undefined) this.lap.delta = elapsed - tr.best.profile[idx];
      }
    }
    if (!crossed) return;
    if (!L.dir) { L.dir = Math.sign(d2); this.dirty = true; }
    if (this.lap && this.lap.dist > 150) {
      const time = (now - this.lap.t0) / 1000;
      const sectors = [...this.lap.sectors];
      sectors.push(time - sectors.reduce((a, b) => a + b, 0));
      const lap = { time, dist: this.lap.dist, sectors: sectors.length === 3 ? sectors : null, at: Date.now(), profile: this.lap.profile };
      tr.history.unshift({ time, sectors: lap.sectors, at: lap.at });
      tr.history = tr.history.slice(0, 30);
      if (!tr.best || time < tr.best.time) {
        if (tr.best) this.events.push(`New best lap: ${time.toFixed(3)} s`);
        tr.best = lap;
      }
      this.lastLap = { time, sectors: lap.sectors, delta: tr.best && tr.best !== lap ? time - tr.best.time : 0 };
      this.dirty = true;
    }
    this.lap = { t0: now, dist: 0, elapsed: 0, profile: [0], nextProfile: 10, sectors: [], delta: null, n: (this.lap ? this.lap.n : 0) + 1 };
  }

  snapshot() {
    const tr = this.track();
    return {
      state: this.state, run: this.run ? { elapsed: this.run.elapsed || 0, dist: this.run.dist, res: this.run.res } : null,
      last: this.last, best: this.best,
      lap: {
        level: this.level, line: tr && tr.line, running: !!this.lap,
        n: this.lap ? this.lap.n : 0, elapsed: this.lap ? this.lap.elapsed : 0, dist: this.lap ? this.lap.dist : 0,
        delta: this.lap ? this.lap.delta : null, sectors: this.lap ? this.lap.sectors : [],
        lastLap: this.lastLap || null,
        best: tr && tr.best ? { time: tr.best.time, sectors: tr.best.sectors, dist: tr.best.dist } : null,
        history: tr ? tr.history.slice(0, 10) : [],
      },
    };
  }
  toJSON() {
    return { best: this.best, last: this.last, laps: this.laps };
  }
}

module.exports = { Perf };
