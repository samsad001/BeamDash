// Drive recorder: writes the player's car at 10 Hz to data/recordings/*.csv (open in Excel, Sheets, MoTeC-style tools...).
'use strict';
const fs = require('fs');
const path = require('path');

const COLS = ['time_s', 'speed_kmh', 'rpm', 'gear', 'throttle', 'brake', 'clutch', 'steering', 'g_lat', 'g_long', 'g_vert',
  'x', 'y', 'z', 'fuel_pct', 'fuel_l', 'coolant_c', 'oil_c', 'boost_psi', 'engine_kw', 'motor_kw', 'battery_pct', 'odometer_m'];

class Recorder {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.stream = null;
    this.file = null;
    this.t0 = 0;
    this.lastT = 0;
    this.rows = 0;
  }

  get active() { return !!this.stream; }

  start(label) {
    if (this.stream) return this.file;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const safe = String(label || '').replace(/[^\w-]+/g, '_').slice(0, 40);
    this.file = `drive-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${safe ? '-' + safe : ''}.csv`;
    this.stream = fs.createWriteStream(path.join(this.dir, this.file));
    this.stream.write(COLS.join(',') + '\n');
    this.t0 = Date.now();
    this.lastT = 0;
    this.rows = 0;
    return this.file;
  }

  stop() {
    if (!this.stream) return null;
    this.stream.end();
    this.stream = null;
    const f = this.file;
    this.file = null;
    return f;
  }

  sample(m, e) {
    if (!this.stream) return;
    const now = Date.now();
    if (now - this.lastT < 100) return;
    this.lastT = now;
    const g = m.g || [0, 0, 9.81], p = m.pos || [0, 0, 0];
    const r = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '');
    const row = [r((now - this.t0) / 1000, 2), r((e.wheelspeed || 0) * 3.6, 1), r(e.rpm, 0), JSON.stringify(String(e.gear ?? '')),
      r(e.throttle, 3), r(e.brake, 3), r(e.clutch, 3), r(e.steering, 1), r(g[0] / 9.81, 3), r(g[1] / 9.81, 3), r(g[2] / 9.81, 3),
      r(p[0], 1), r(p[1], 1), r(p[2], 1), r((e.fuel || 0) * 100, 1), r(e.fuelVolume, 2), r(e.watertemp, 1), r(e.oiltemp, 1),
      r(e.turboBoost, 2), r(e.bd_engPower, 1), r(e.bd_motorPower, 1), r(e.bd_battery !== undefined ? e.bd_battery * 100 : undefined, 1), r(e.odometer, 0)];
    this.stream.write(row.join(',') + '\n');
    this.rows++;
  }

  list() {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith('.csv')).map((f) => {
        const s = fs.statSync(path.join(this.dir, f));
        return { file: f, size: s.size, at: s.mtimeMs, recording: f === this.file };
      }).sort((a, b) => b.at - a.at);
    } catch { return []; }
  }

  // only plain file names inside the recordings folder
  safePath(name) {
    if (!/^[\w.-]+\.csv$/.test(name)) return null;
    const p = path.join(this.dir, name);
    return fs.existsSync(p) ? p : null;
  }
}

module.exports = { Recorder };
