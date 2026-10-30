// Demo car: a simulated vehicle that emits the same messages as the BeamNG mod,
// so every page can be tried without the game running.
'use strict';

const CTRL = [[0, 0], [700, 0], [900, 160], [880, 520], [650, 700], [380, 620], [200, 780], [-120, 760], [-280, 460], [-220, 160]];
const G = 9.81;
const RATIOS = [-3.4, 0, 4.1, 2.6, 1.85, 1.4, 1.12, 0.92, 0.76]; // index 0 = R, 1 = N, 2.. = 1st..7th
const WHEEL_R = 0.33;

function catmull(points, step) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(4, Math.round(segLen / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

class Track {
  constructor() {
    this.pts = catmull(CTRL, 4);
    const n = this.pts.length;
    this.s = [0];
    for (let i = 1; i <= n; i++) {
      const a = this.pts[i - 1], b = this.pts[i % n];
      this.s.push(this.s[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.len = this.s[n];
    this.curv = this.pts.map((_, i) => {
      const a = this.pts[(i - 3 + n) % n], b = this.pts[i], c = this.pts[(i + 3) % n];
      const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let d = h2 - h1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const dist = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      return d / dist;
    });
  }
  idx(s) {
    s = ((s % this.len) + this.len) % this.len;
    let lo = 0, hi = this.pts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.s[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  at(s, lat = 0) {
    const i = this.idx(s), n = this.pts.length;
    const a = this.pts[i], b = this.pts[(i + 1) % n];
    const seg = this.s[i + 1] - this.s[i] || 1;
    const t = (((s % this.len) + this.len) % this.len - this.s[i]) / seg;
    const dx = (b[0] - a[0]) / seg, dy = (b[1] - a[1]) / seg;
    // right-hand normal = (dy, -dx); positive lat = right
    return { x: a[0] + (b[0] - a[0]) * t + dy * lat, y: a[1] + (b[1] - a[1]) * t - dx * lat, hx: dx, hy: dy, curv: this.curv[i], i };
  }
  limit(s) { // posted speed limit (m/s) per zone
    const f = (((s % this.len) + this.len) % this.len) / this.len;
    return f < 0.18 ? 33.33 : f < 0.4 ? 22.22 : f < 0.62 ? 27.78 : f < 0.8 ? 13.89 : 36.11;
  }
}

class Demo {
  constructor(sink) {
    this.sink = sink;
    this.active = false;
    this.timers = [];
    this.onStop = null;
  }

  emit(msg) { this.sink(msg.t, msg); }

  start() {
    if (this.active) return;
    this.active = true;
    this.track = new Track();
    this.reset(true);
    this.vars = {
      $tirepressure_F: { title: 'Front tire pressure', category: 'Wheels', subCategory: 'Pressure', min: 10, max: 50, step: 0.5, unit: 'psi', default: 32 },
      $tirepressure_R: { title: 'Rear tire pressure', category: 'Wheels', subCategory: 'Pressure', min: 10, max: 50, step: 0.5, unit: 'psi', default: 34 },
      $brakebias: { title: 'Brake bias (front)', category: 'Brakes', min: 0.4, max: 0.8, step: 0.01, unit: '', default: 0.64 },
      $brakestrength: { title: 'Brake force multiplier', category: 'Brakes', min: 0.6, max: 1.2, step: 0.01, unit: '', default: 1 },
      $revLimiterRPM: { title: 'Rev limiter', category: 'Engine', min: 6000, max: 8500, step: 50, unit: 'rpm', default: 7400 },
      $wastegateStart: { title: 'Wastegate pressure', category: 'Engine', subCategory: 'Turbo', min: 8, max: 26, step: 0.5, unit: 'psi', default: 18 },
      $finaldrive: { title: 'Final drive ratio', category: 'Transmission', min: 2.5, max: 5, step: 0.01, unit: ':1', default: 3.42 },
      $spring_F: { title: 'Front spring rate', category: 'Suspension', subCategory: 'Front', min: 30000, max: 120000, step: 500, unit: 'N/m', default: 65000 },
      $spring_R: { title: 'Rear spring rate', category: 'Suspension', subCategory: 'Rear', min: 30000, max: 120000, step: 500, unit: 'N/m', default: 72000 },
      $camber_F: { title: 'Front camber', category: 'Wheel Alignment', min: -0.5, max: 0.5, step: 0.01, unit: '', default: -0.12 },
      $toe_F: { title: 'Front toe', category: 'Wheel Alignment', min: -0.1, max: 0.1, step: 0.002, unit: '', default: 0.004 },
      $ffbSpeedSensitivity: { title: 'Steering speed sensitivity', category: 'Chassis', min: 0, max: 1, step: 0.05, unit: '', default: 0.5 },
    };
    for (const [k, v] of Object.entries(this.vars)) { v.name = k; v.val = v.default; }
    this.values = Object.fromEntries(Object.entries(this.vars).map(([k, v]) => [k, v.default]));
    this.adas = { fcw: true, fcwSens: 2, aeb: false, bsm: true, tsr: true, acc: false, accGap: 2, accSet: 0 };
    this.route = null;
    this.tod = 0.22;

    this.sendStatic();
    let last = Date.now();
    this.timers.push(setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.step(dt);
      this.sendFast();
    }, 1000 / 30));
    this.timers.push(setInterval(() => this.sendSlow(), 250));
    this.timers.push(setInterval(() => this.sendWorld(), 100));
    this.timers.push(setInterval(() => this.emit(this.spec()), 5000));
  }

  stop() {
    if (!this.active) return;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.active = false;
    if (this.onStop) this.onStop();
  }

  reset(full) {
    const st = this.st || {};
    this.st = {
      s: 0, v: 0, gear: 2, rpm: 800, throttle: 0, brake: 0, steer: 0, shiftT: 0, boost: 0,
      water: full ? 72 : st.water || 72, oil: full ? 70 : st.oil || 70, fuel: full ? 0.72 : st.fuel || 0.72,
      odo: st.odo || 184233000, trip: st.trip || 0, t: 0,
      lights: 1, fog: false, sigL: false, sigR: false, hazard: false, horn: false, pbrake: false,
      ignition: true, running: true, cruise: false, cruiseTarget: 0, escMode: 'on', driveMode: 'comfort',
      brakeT: [60, 60, 60, 60], brakeCore: [50, 50, 50, 50], damage: 0, gx: 0, gy: 0,
      finalDrive: (this.values && this.values.$finaldrive) || 3.42, revLimit: (this.values && this.values.$revLimiterRPM) || 7400,
    };
    this.traffic = [
      { id: 1101, s: 160, lat: 0, v: 18, base: 18, laneT: 0 },
      { id: 1102, s: 900, lat: 3.6, v: 24, base: 24, laneT: 0 },
      { id: 1103, s: 1900, lat: 0, v: 21, base: 21, laneT: 0 },
    ];
  }

  // -------------------------------------------------------------- simulation
  targetSpeed(s) {
    let tgt = 62;
    for (let d = 0; d <= 180; d += 10) {
      const c = Math.abs(this.track.at(s + d).curv);
      const vc = c > 1e-4 ? Math.sqrt(8.5 / c) : 80;
      tgt = Math.min(tgt, Math.sqrt(vc * vc + 2 * 7 * d));
    }
    return tgt;
  }

  lead() {
    const st = this.st;
    let best = null;
    for (const c of this.traffic) {
      let gap = c.s - st.s;
      gap = ((gap % this.track.len) + this.track.len) % this.track.len;
      if (Math.abs(c.lat) < 1.8 && gap < 160 && (!best || gap < best.gap)) best = { car: c, gap: Math.max(0, gap - 4.5) };
    }
    return best;
  }

  step(dt) {
    const st = this.st;
    st.t += dt;
    this.tod = (this.tod + dt / 1800) % 1;
    const tr = this.track;

    // traffic: lane changes make overtaking possible
    for (const c of this.traffic) {
      c.v += (c.base - c.v) * dt * 0.3;
      c.s = (c.s + c.v * dt) % tr.len;
      let gap = ((c.s - st.s) % tr.len + tr.len) % tr.len;
      if (c.lat < 1.8 && gap < 30 && st.v > c.v + 0.5) c.laneT += dt; else c.laneT = Math.max(0, c.laneT - dt * 0.2);
      if (c.laneT > 4) { c.targetLat = 3.6; c.laneT = 0; }
      if (c.targetLat !== undefined) {
        c.lat += Math.sign(c.targetLat - c.lat) * Math.min(Math.abs(c.targetLat - c.lat), dt * 1.2);
        gap = ((st.s - c.s) % tr.len + tr.len) % tr.len;
        if (c.lat >= 3.59 && gap > 60) c.targetLat = 0;
        if (c.lat <= 0.01 && c.targetLat === 0) { c.targetLat = undefined; c.lat = 0; }
      }
    }

    // the virtual driver
    let tgt = this.targetSpeed(st.s);
    const ld = this.lead();
    if (ld) {
      const gapWanted = [1.0, 1.5, 2.0, 2.6][(this.adas.accGap || 2) - 1] * Math.max(st.v, 5) + 4;
      if (ld.gap < gapWanted * 1.6) tgt = Math.min(tgt, Math.max(0, ld.car.v + (ld.gap - gapWanted) * 0.35));
    }
    if (st.cruise) tgt = Math.min(tgt, this.adas.acc && this.adas.accSet ? this.adas.accSet : st.cruiseTarget);
    if (!st.running || st.pbrake) tgt = 0;

    let thr, brk;
    if (st.v < tgt - 0.8) { thr = Math.min(1, 0.25 + (tgt - st.v) / 6); brk = 0; }
    else if (st.v > tgt + 1.5) { thr = 0; brk = Math.min(1, (st.v - tgt - 1.5) / 5); }
    else { thr = 0.1 + st.v * 0.004; brk = 0; }
    if (!st.running) thr = 0;
    const k = Math.min(1, dt * 5);
    st.throttle += (thr - st.throttle) * k;
    st.brake += (brk - st.brake) * k;
    if (st.shiftT > 0) { st.shiftT -= dt; st.throttle = 0; }

    const ratio = RATIOS[st.gear] * st.finalDrive;
    const torqueCurve = Math.min(1, 0.55 + st.rpm / 5000) * (st.rpm > st.revLimit ? 0 : 1);
    const driveForce = st.throttle * torqueCurve * 520 * ratio / WHEEL_R; // N
    const mass = 1520;
    const acc = driveForce / mass - st.brake * 10.5 - 0.00042 * st.v * st.v - 0.12 * Math.sign(st.v);
    const prevV = st.v;
    st.v = Math.max(0, st.v + acc * dt);
    st.s = (st.s + st.v * dt) % tr.len;
    st.odo += st.v * dt; st.trip += st.v * dt;

    // gearbox (automatic)
    const wheelRpm = st.v / WHEEL_R * 60 / (2 * Math.PI);
    let rpm = Math.max(800, wheelRpm * RATIOS[st.gear] * st.finalDrive);
    if (st.rpm > 6900 && st.gear < 8 && st.shiftT <= 0) { st.gear++; st.shiftT = 0.22; }
    else if (rpm < 2300 && st.gear > 2 && st.shiftT <= 0) { st.gear--; st.shiftT = 0.18; }
    if (!st.running) rpm = 0;
    st.rpm += (rpm + (st.throttle > 0.1 ? 60 : 0) - st.rpm) * Math.min(1, dt * 12);

    const p = tr.at(st.s);
    st.gx += ((st.v * st.v * p.curv) - st.gx) * Math.min(1, dt * 6);
    st.gy += ((st.v - prevV) / dt - st.gy) * Math.min(1, dt * 6);
    st.steer += (Math.atan(p.curv * 2.8) * 7 - st.steer) * Math.min(1, dt * 5);
    st.boost += ((st.throttle * Math.min(1, st.rpm / 3200) * (this.values?.$wastegateStart || 18)) - 1.5 * (1 - st.throttle) - st.boost) * Math.min(1, dt * 3);
    st.water += ((88 + st.throttle * 8) - st.water) * dt * 0.02;
    st.oil += ((96 + st.throttle * 18) - st.oil) * dt * 0.012;
    st.fuel = Math.max(0, st.fuel - (0.00002 + st.throttle * st.rpm * 0.00000004) * dt * 60 / 60);

    for (let w = 0; w < 4; w++) {
      const bias = w < 2 ? 0.64 : 0.36;
      st.brakeT[w] += (st.brake * st.v * 9 * bias - (st.brakeT[w] - 30) * 0.035 * (1 + st.v / 30)) * dt;
      st.brakeCore[w] += (st.brakeT[w] - st.brakeCore[w]) * dt * 0.15;
    }

    // scripted turn signal before tight corners
    const ahead = tr.at(st.s + 70).curv;
    const sig = Math.abs(ahead) > 0.006 && !st.hazard;
    st.autoSigL = sig && ahead > 0; st.autoSigR = sig && ahead < 0;

    // nav: drop finished route
    if (this.route) {
      const d = ((this.route.endS - st.s) % tr.len + tr.len) % tr.len;
      if (d < 25) this.route = null;
    }
  }

  electrics() {
    const st = this.st;
    const blink = Math.floor(st.t * 2.6) % 2 === 0;
    const sigL = st.sigL || st.autoSigL || st.hazard, sigR = st.sigR || st.autoSigR || st.hazard;
    return {
      wheelspeed: st.v, airspeed: st.v, rpm: st.rpm, rpmTacho: st.rpm,
      gear: st.gear === 0 ? 'R' : st.gear === 1 ? 'N' : 'D', gearIndex: st.gear - 1,
      throttle: st.throttle, brake: st.brake, clutch: st.shiftT > 0 ? 1 : 0,
      throttle_input: st.throttle, brake_input: st.brake, clutch_input: 0,
      parkingbrake: st.pbrake ? 1 : 0, steering: st.steer * 40, steering_input: st.steer / 9,
      fuel: st.fuel, fuelCapacity: 62, fuelVolume: st.fuel * 62,
      watertemp: st.water, oiltemp: st.oil, oilpressure: st.running ? 2.2 + st.rpm / 2500 : 0,
      turboBoost: st.boost, engineLoad: st.throttle,
      lights: st.lights, lowbeam: st.lights >= 1 ? 1 : 0, highbeam: st.lights === 2 ? 1 : 0, fog: st.fog ? 1 : 0,
      signal_L: sigL && blink ? 1 : 0, signal_R: sigR && blink ? 1 : 0,
      signal_left_input: sigL ? 1 : 0, signal_right_input: sigR ? 1 : 0, hazard: st.hazard && blink ? 1 : 0, hazard_enabled: st.hazard ? 1 : 0,
      abs: 0, absActive: st.brake > 0.85 && st.v > 5 ? 1 : 0, hasABS: true, hasESC: true, hasTCS: true,
      esc: st.escMode !== 'on' ? 1 : 0, escActive: Math.abs(st.gx) > 7.5 ? 1 : 0, tcs: 0, tcsActive: st.throttle > 0.95 && st.gear === 2 ? 1 : 0,
      escMode: st.escMode, driveMode: st.driveMode,
      checkengine: st.damage > 3000 ? 1 : 0, oil: st.running ? 0 : 1, battery: st.running ? 0 : 1, lowfuel: st.fuel < 0.12 ? 1 : 0,
      ignitionLevel: st.ignition ? (st.running ? 2 : 1) : 0, engineRunning: st.running ? 1 : 0, running: st.running,
      cruiseControlActive: st.cruise ? 1 : 0, cruiseControlTarget: this.adas.acc && this.adas.accSet ? this.adas.accSet : st.cruiseTarget,
      isShifting: st.shiftT > 0, odometer: st.odo, trip: st.trip, horn: st.horn ? 1 : 0,
      reverse: st.gear === 0 ? 1 : 0, brakelights: st.brake > 0.05 ? 1 : 0, altitude: 112,
      avgFuelConsumption: 8.4, boostMax: this.values.$wastegateStart || 18, maxrpm: st.revLimit, idlerpm: 800,
      lowpressure: 0, gearboxMode: 'auto', engineThrottle: st.throttle, wheelThermals: 0,
      clutchRatio: st.shiftT > 0 ? 0 : 1, smoothShiftLogicAV: st.rpm / 9.55, dseColor: 0, doorFLCoupler_notAttached: 0,
    };
  }

  wheels() {
    const st = this.st;
    const names = ['FL', 'FR', 'RL', 'RR'];
    const latLoad = st.gx * 1520 / 4 * 0.45, longLoad = st.gy * 1520 / 4 * 0.35;
    return names.map((name, i) => {
      const front = i < 2, left = i % 2 === 0;
      const slip = (front ? st.brake * 0.06 : st.throttle * 0.05) + Math.abs(st.gx) * 0.004 + Math.random() * 0.004;
      const down = 1520 * G / 4 + (left ? latLoad : -latLoad) * -1 + (front ? -longLoad : longLoad);
      const press = (this.values[front ? '$tirepressure_F' : '$tirepressure_R'] || 32) * 6894.76 * (1 + (st.brakeCore[i] - 30) / 2500);
      return {
        name, wheelSpeed: st.v * (1 + slip * (front ? -1 : 1)), angularVelocity: st.v / WHEEL_R, radius: WHEEL_R,
        lastSlip: slip, lastSideSlip: st.gx * 0.012 * (front ? 1.1 : 0.9), downForce: Math.max(0, down),
        brakeSurfaceTemperature: st.brakeT[i], brakeCoreTemperature: st.brakeCore[i],
        brakeTorque: st.brake * (front ? 3200 : 1800), isTireDeflated: false, isBroken: false,
        pressure: press, contactMaterialID1: 10,
      };
    });
  }

  sendFast() {
    const st = this.st;
    const p = this.track.at(st.s);
    const msg = {
      t: 'veh', vid: 1000, e: this.electrics(), g: [st.gx, st.gy, G],
      pos: [p.x, p.y, 110], vel: [p.hx * st.v, p.hy * st.v, 0], dir: [p.hx, p.hy, 0],
    };
    this.wf = (this.wf || 0) + 1;
    if (this.wf % 2 === 0) msg.wheels = this.wheels();
    this.emit(msg);
  }

  sendSlow() {
    const st = this.st;
    this.emit({ t: 'electrics', vid: 1000, e: this.electrics() });
    this.emit({
      t: 'pt', vid: 1000, damage: st.damage,
      pt: {
        mainEngine: { name: 'mainEngine', type: 'combustionEngine', rpmOut: st.rpm, engineLoad: st.throttle, outputTorque1: st.throttle * 520, maxRPM: st.revLimit, idleRPM: 800, isStalled: !st.running, coolantTemperature: st.water, oilTemperature: st.oil, exhaustTemperature: 300 + st.throttle * 500 },
        gearbox: { name: 'gearbox', type: 'automaticGearbox', gearIndex: st.gear - 1, gearRatio: RATIOS[st.gear], rpmOut: st.rpm / (RATIOS[st.gear] || 1) },
        rearDiff: { name: 'rearDiff', type: 'differential', diffType: 'lsd', gearRatio: st.finalDrive, rpmOut: st.v / WHEEL_R * 9.549 },
        turbocharger: { name: 'turbocharger', type: 'turbocharger', boost: st.boost, turboRPM: st.boost * 9000 },
      },
      energy: { mainTank: { name: 'mainTank', energyType: 'gasoline', remainingRatio: st.fuel, capacity: 62, remainingVolume: st.fuel * 62 } },
    });
  }

  spec() {
    return {
      t: 'spec', vid: 1000,
      engine: { maxRPM: this.st.revLimit, idleRPM: 800, maxAvailableRPM: 7600, revLimiterRPM: this.st.revLimit, maxPower: 412, maxTorque: 520, maxPowerRPM: 6250, maxTorqueRPM: 2750 },
      gearbox: { type: 'automaticGearbox', minGearIndex: -1, maxGearIndex: 7, ratios: Object.fromEntries(RATIOS.map((r, i) => [String(i - 1), r])) },
      controllers: ['cruiseControl', 'esc', 'driveModes', 'shiftLogic'], driveMode: this.st.driveMode, mass: 1520,
      energy: { mainTank: { energyType: 'gasoline', capacity: 62 } },
    };
  }

  sendStatic() {
    this.emit({
      t: 'info', vid: 1000, jbeam: 'demo_coupe',
      model: { Brand: 'BeamDash', Name: 'Demo Coupe', Type: 'Car', Country: 'Germany', 'Body Style': 'Coupe', Years: { min: 2024, max: 2026 } },
      config: {
        Configuration: '3.0T Sport Auto (Demo)', Power: 412, Torque: 520, Weight: 1520, Drivetrain: 'RWD', Transmission: 'Automatic',
        'Fuel Type': 'Gasoline', 'Induction Type': 'Turbo', 'Top Speed': 77.8, '0-100 km/h': 4.4, '0-60 mph': 4.1, 'Weight/Power': 3.69,
        Value: 68500, 'Config Type': 'Factory', Description: 'Simulated car shown while BeamNG is not connected.',
      },
    });
    this.sendVars();
    this.emit(this.spec());
    this.sendMap();
  }

  sendVars() {
    const vars = {};
    for (const [k, v] of Object.entries(this.vars)) vars[k] = { ...v, val: this.values[k] };
    this.emit({ t: 'vars', vars, values: { ...this.values } });
  }

  sendMap() {
    const tr = this.track, nodes = [], edges = [];
    const step = 5; // every 20 m
    for (let i = 0; i < tr.pts.length; i += step) nodes.push([+tr.pts[i][0].toFixed(1), +tr.pts[i][1].toFixed(1), 110, 7]);
    const loopN = nodes.length;
    for (let i = 0; i < loopN; i++) edges.push([i, (i + 1) % loopN, 1, 0, tr.limit(tr.s[i * step])]);
    // side streets grid
    const grid = {};
    for (let x = -200; x <= 800; x += 160) for (let y = 120; y <= 620; y += 125) {
      grid[x + ',' + y] = nodes.length;
      nodes.push([x, y, 110, 3.5]);
    }
    for (let x = -200; x <= 800; x += 160) for (let y = 120; y <= 620; y += 125) {
      const a = grid[x + ',' + y];
      if (grid[(x + 160) + ',' + y] !== undefined) edges.push([a, grid[(x + 160) + ',' + y], 0.9, 0, 13.89]);
      if (grid[x + ',' + (y + 125)] !== undefined) edges.push([a, grid[x + ',' + (y + 125)], (x / 160) % 2 ? 0.4 : 0.9, 0, 13.89]);
    }
    this.emit({ t: 'map', level: 'demo_circuit', nodes, edges });
  }

  sendWorld() {
    const st = this.st, tr = this.track;
    const me = tr.at(st.s);
    const vehicles = [{ id: 1000, me: true, x: me.x, y: me.y, z: 110, hx: me.hx, hy: me.hy, spd: st.v, dmg: st.damage }];
    for (const c of this.traffic) {
      const p = tr.at(c.s, c.lat);
      vehicles.push({ id: c.id, me: false, x: p.x, y: p.y, z: 110, hx: p.hx, hy: p.hy, spd: c.v, dmg: 0 });
    }
    // ADAS (same logic as the game-side extension)
    const adasState = { lead: null, fcw: 0, bsmL: false, bsmR: false, aeb: false };
    const ld = this.lead();
    if (ld) {
      const closing = st.v - ld.car.v;
      const ttc = closing > 0.5 ? ld.gap / closing : 99;
      adasState.lead = { id: ld.car.id, gap: +ld.gap.toFixed(1), spd: +ld.car.v.toFixed(2), ttc: +ttc.toFixed(2) };
      const thr = [1.4, 2.0, 2.7][(this.adas.fcwSens || 2) - 1];
      if (this.adas.fcw && st.v > 3) adasState.fcw = ttc < thr * 0.55 ? 2 : ttc < thr ? 1 : 0;
    }
    if (this.adas.bsm) for (const c of this.traffic) {
      const back = ((st.s - c.s) % tr.len + tr.len) % tr.len;
      if ((back < 13 || back > tr.len - 2.5) && c.lat > 1.5) adasState.bsmR = true;
    }
    if (this.adas.acc) adasState.accTarget = this.adas.accSet;
    let route = null;
    if (this.route) {
      const pts = [];
      let d = ((this.route.endS - st.s) % tr.len + tr.len) % tr.len;
      for (let x = 0; x <= d; x += 12) { const p = tr.at(st.s + x); pts.push([+p.x.toFixed(1), +p.y.toFixed(1)]); }
      const e = tr.at(this.route.endS); pts.push([e.x, e.y]);
      route = { pts, len: Math.round(d) };
    }
    this.emit({
      t: 'world', level: 'demo_circuit', myId: 1000, vehicles, route, adas: this.adas, adasState,
      speedLimit: this.adas.tsr ? tr.limit(st.s) : null, road: 'demo', tod: this.tod, paused: false,
    });
  }

  // -------------------------------------------------------------- commands
  command(cmd) {
    const st = this.st;
    let ok = true, err;
    const toggle = (k) => { st[k] = !st[k]; };
    switch (cmd.type) {
      case 'lights': st.lights = cmd.value | 0; break;
      case 'toggleLights': st.lights = (st.lights + 1) % 3; break;
      case 'highbeam': st.lights = st.lights === 2 ? 1 : 2; break;
      case 'fog': toggle('fog'); break;
      case 'signalL': st.sigL = !st.sigL; st.sigR = false; break;
      case 'signalR': st.sigR = !st.sigR; st.sigL = false; break;
      case 'hazard': toggle('hazard'); break;
      case 'horn': st.horn = !!cmd.value; break;
      case 'ignition': st.ignition = !!cmd.value; if (!cmd.value) st.running = false; break;
      case 'starter': st.ignition = true; st.running = true; break;
      case 'parkingbrake': st.pbrake = !!cmd.value; break;
      case 'refuel': st.fuel = 1; break;
      case 'repair': case 'reset': this.reset(false); break;
      case 'cruiseOn': st.cruise = true; st.cruiseTarget = cmd.speed || st.v; break;
      case 'cruiseHold': st.cruiseTarget = st.v; break;
      case 'cruiseOff': st.cruise = false; this.adas.acc = false; break;
      case 'cruiseResume': st.cruise = true; break;
      case 'cruiseSet': st.cruiseTarget = cmd.speed; break;
      case 'cruiseChange': st.cruiseTarget = Math.max(0, st.cruiseTarget + (cmd.delta || 0)); if (this.adas.acc) this.adas.accSet = st.cruiseTarget; break;
      case 'escToggle': st.escMode = { on: 'sport', sport: 'off', off: 'on' }[st.escMode]; break;
      case 'driveModeNext': st.driveMode = { comfort: 'sport', sport: 'sportPlus', sportPlus: 'eco', eco: 'comfort' }[st.driveMode]; break;
      case 'driveModeSet': st.driveMode = cmd.key; break;
      case 'adas': Object.assign(this.adas, cmd.settings || {}); break;
      case 'accOn': this.adas.acc = true; this.adas.accSet = cmd.speed || st.v; st.cruise = true; st.cruiseTarget = this.adas.accSet; break;
      case 'accSet': this.adas.accSet = cmd.speed; st.cruiseTarget = cmd.speed; break;
      case 'accOff': this.adas.acc = false; this.adas.accSet = 0; st.cruise = false; break;
      case 'navTo': {
        let best = 0, bd = Infinity;
        this.track.pts.forEach((p, i) => { const d = (p[0] - cmd.x) ** 2 + (p[1] - cmd.y) ** 2; if (d < bd) { bd = d; best = i; } });
        this.route = { endS: this.track.s[best] };
        break;
      }
      case 'navClear': this.route = null; break;
      case 'setVars':
        Object.assign(this.values, cmd.values || {});
        this.reset(false); // like the game, new tuning respawns the car
        this.st.revLimit = this.values.$revLimiterRPM;
        this.st.finalDrive = this.values.$finaldrive;
        this.sendVars(); this.emit(this.spec());
        break;
      case 'getInfo': case 'getVars': this.sendStatic(); break;
      case 'getMap': this.sendMap(); break;
      case 'timeOfDay': this.tod = cmd.value; break;
      case 'shiftUp': case 'shiftDown': case 'shiftTo': case 'pause': case 'controller': case 'hello': break;
      default: ok = false; err = 'unknown command ' + cmd.type;
    }
    this.emit({ t: 'cmdResult', id: cmd.id, type: cmd.type, ok, err });
  }
}

module.exports = { Demo };
