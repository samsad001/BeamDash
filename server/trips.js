// Trip computer, like a real car: Trip A, Trip B, Since start, and a resettable fuel economy.
// Runs on the server so every screen shows the same numbers, and saves to data/trips.json.
'use strict';

const blank = () => ({ dist: 0, moving: 0, running: 0, fuel: 0, maxSpeed: 0, since: Date.now() });
const KEYS = ['a', 'b', 'start', 'econ'];

class Trips {
  constructor(saved) {
    this.t = {};
    for (const k of KEYS) this.t[k] = { ...blank(), ...((saved && saved[k]) || {}) };
    this.last = null;
    this.dirty = false;
  }

  // called for every live vehicle packet (30 Hz)
  update(e) {
    const now = Date.now();
    const speed = Math.abs(e.wheelspeed ?? e.airspeed ?? 0);
    const running = e.engineRunning === true || e.engineRunning > 0.5 || e.running === true;
    const fuel = typeof e.fuelVolume === 'number' ? e.fuelVolume : null;
    if (this.last) {
      const dt = (now - this.last.t) / 1000;
      if (dt > 0 && dt < 2) { // ignore gaps (pause, reconnect)
        let used = 0;
        // only count fuel going down slowly; refuels and car swaps jump
        if (fuel !== null && this.last.fuel !== null) {
          const d = this.last.fuel - fuel;
          if (d > 0 && d < 0.05) used = d;
        }
        for (const k of KEYS) {
          const tr = this.t[k];
          tr.dist += speed * dt;
          if (speed > 0.5) tr.moving += dt;
          if (running) tr.running += dt;
          tr.fuel += used;
          if (speed > tr.maxSpeed) tr.maxSpeed = speed;
        }
        this.dirty = true;
      }
    }
    this.last = { t: now, fuel };
  }

  reset(which) {
    if (!KEYS.includes(which)) return false;
    this.t[which] = blank();
    this.dirty = true;
    return true;
  }

  // a new car or a new game session starts a new "since start"
  newJourney() { this.reset('start'); this.last = null; }

  snapshot() {
    const out = {};
    for (const k of KEYS) {
      const tr = this.t[k];
      out[k] = {
        dist: tr.dist, moving: tr.moving, running: tr.running, fuel: tr.fuel, maxSpeed: tr.maxSpeed, since: tr.since,
        avgSpeed: tr.moving > 1 ? tr.dist / tr.moving : 0, // m/s while moving, like a car's trip computer
        avgCons: tr.dist > 100 ? tr.fuel / tr.dist * 100000 : 0, // L/100km
      };
    }
    return out;
  }
}

module.exports = { Trips };
