// BeamDash shared client: live connection, normalized vehicle data, units, settings, commands.
'use strict';
window.BD = (() => {
  const st = {
    e: {}, wheels: [], pt: null, energy: null, spec: null, info: null, vars: null, world: null, status: null,
    g: [0, 0, 9.81], pos: null, vel: null, dir: null, last: 0, damage: 0, connected: false,
    media: null, mediaAt: 0, trips: null,
  };
  const listeners = {};
  const on = (type, fn) => ((listeners[type] = listeners[type] || []).push(fn), fn);
  const fire = (type, data) => (listeners[type] || []).forEach((f) => { try { f(data); } catch (err) { console.error(err); } });

  // ---------------------------------------------------------------- settings
  const DEFAULTS = {
    speedUnit: 'kmh', tempUnit: 'C', pressUnit: 'psi', distUnit: 'km', design: 'bav86', designOpts: {},
    sounds: true, assistChips: true, fps: 60, redline: 0, shiftRpm: 0, brightness: 1, wheelButtons: true, cruiseStep: 5,
    adas: { fcw: true, fcwSens: 2, aeb: false, bsm: true, tsr: true, accGap: 2 },
  };
  let settings;
  try { settings = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('beamdash.settings') || '{}')); }
  catch { settings = Object.assign({}, DEFAULTS); }
  settings.adas = Object.assign({}, DEFAULTS.adas, settings.adas);
  function save() {
    try { localStorage.setItem('beamdash.settings', JSON.stringify(settings)); } catch { /* private mode */ }
    fire('settings', settings);
  }

  // ---------------------------------------------------------------- units
  const U = {
    speed: (ms) => (settings.speedUnit === 'mph' ? ms * 2.23694 : ms * 3.6),
    speedToMs: (v) => (settings.speedUnit === 'mph' ? v / 2.23694 : v / 3.6),
    speedLabel: () => (settings.speedUnit === 'mph' ? 'mph' : 'km/h'),
    dist: (m) => (settings.speedUnit === 'mph' ? m / 1609.344 : m / 1000),
    distLabel: () => (settings.speedUnit === 'mph' ? 'mi' : 'km'),
    shortDist: (m) => {
      if (settings.speedUnit === 'mph') return m < 300 ? `${Math.round(m * 3.28084 / 10) * 10} ft` : `${(m / 1609.344).toFixed(1)} mi`;
      return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
    },
    temp: (c) => (settings.tempUnit === 'F' ? c * 1.8 + 32 : c),
    tempLabel: () => (settings.tempUnit === 'F' ? '°F' : '°C'),
    // BeamNG boost is psi
    boost: (psi) => (settings.pressUnit === 'bar' ? psi / 14.5038 : settings.pressUnit === 'kpa' ? psi * 6.89476 : psi),
    pressLabel: () => (settings.pressUnit === 'bar' ? 'bar' : settings.pressUnit === 'kpa' ? 'kPa' : 'psi'),
    // tire pressure arrives in Pa
    tire: (pa) => (settings.pressUnit === 'bar' ? pa / 1e5 : settings.pressUnit === 'kpa' ? pa / 1000 : pa / 6894.76),
    consumption: (lPer100) => (settings.speedUnit === 'mph' ? (lPer100 > 0.01 ? 235.215 / lPer100 : 0) : lPer100),
    consLabel: () => (settings.speedUnit === 'mph' ? 'mpg' : 'L/100km'),
  };

  // ---------------------------------------------------------------- derived data
  const b = (v) => v === true || (typeof v === 'number' && v > 0.5);
  function gearStr(e) {
    const g = e.gear;
    if (typeof g === 'string') {
      if (g === 'D' || g === 'M' || g === 'S') {
        const gi = e.gearIndex;
        return typeof gi === 'number' && gi > 0 ? g + gi : g;
      }
      return g;
    }
    if (typeof g === 'number') return g < 0 ? 'R' : g === 0 ? 'N' : String(g);
    return 'N';
  }
  // running fuel consumption (L/100km) from fuel volume vs. distance
  const cons = { lastOdo: null, lastFuel: null, samples: [], value: 0 };
  function updateConsumption(e) {
    const odo = e.odometer, fuel = e.fuelVolume;
    if (typeof odo !== 'number' || typeof fuel !== 'number') return;
    if (cons.lastOdo === null || odo < cons.lastOdo || fuel > cons.lastFuel + 0.5) { cons.lastOdo = odo; cons.lastFuel = fuel; return; }
    const dd = odo - cons.lastOdo;
    if (dd < 50) return;
    const used = cons.lastFuel - fuel;
    cons.samples.push([dd, Math.max(0, used)]);
    if (cons.samples.length > 40) cons.samples.shift();
    const D = cons.samples.reduce((a, s) => a + s[0], 0), F = cons.samples.reduce((a, s) => a + s[1], 0);
    cons.value = D > 0 ? (F / D) * 100000 : 0;
    cons.lastOdo = odo; cons.lastFuel = fuel;
  }

  function data() {
    const e = st.e, eng = (st.spec && st.spec.engine) || {};
    const maxRPM = settings.redline || eng.maxRPM || e.maxrpm || 7000;
    const tachMax = Math.ceil((maxRPM * 1.06 + 200) / 1000) * 1000;
    const fuelCap = e.fuelCapacity || 60;
    const fuelVol = typeof e.fuelVolume === 'number' ? e.fuelVolume : (e.fuel || 0) * fuelCap;
    const consumption = cons.value || e.avgFuelConsumption || 0;
    const w = st.world || {};
    const ad = w.adasState || {};
    const sigL = b(e.signal_L), sigR = b(e.signal_R);
    return {
      speed: Math.abs(e.wheelspeed ?? e.airspeed ?? 0),
      rpm: e.rpmTacho ?? e.rpm ?? 0,
      maxRPM, tachMax, idleRPM: eng.idleRPM || e.idlerpm || 800,
      redFrom: Math.round((maxRPM * 0.94) / 250) * 250,
      shiftRpm: settings.shiftRpm || maxRPM * 0.93,
      gear: gearStr(e), gearIndex: e.gearIndex,
      throttle: e.throttle ?? 0, brake: e.brake ?? 0, clutch: e.clutch ?? 0, steer: e.steering ?? 0,
      fuel: e.fuel ?? 0, fuelVol, fuelCap,
      range: consumption > 0.5 ? fuelVol / consumption * 100000 : null, consumption,
      water: e.watertemp ?? 0, oilT: e.oiltemp ?? 0, oilP: e.oilpressure ?? null,
      boost: e.turboBoost ?? 0, hasTurbo: typeof e.turboBoost === 'number' && (e.boostMax > 0 || Math.abs(e.turboBoost) > 0.2),
      boostMax: e.boostMax || 20,
      odo: e.odometer ?? 0, trip: e.trip ?? 0,
      lights: {
        low: b(e.lowbeam), high: b(e.highbeam), fog: b(e.fog), sigL, sigR, hazard: b(e.hazard_enabled) || b(e.hazard),
        park: b(e.parkingbrake), abs: b(e.abs), absActive: b(e.absActive), esc: b(e.esc), escActive: b(e.escActive),
        tcs: b(e.tcs), tcsActive: b(e.tcsActive), check: b(e.checkengine), oil: b(e.oil), battery: b(e.battery),
        lowFuel: b(e.lowfuel) || (e.fuel ?? 1) < 0.1, tpms: b(e.lowpressure), cruise: b(e.cruiseControlActive),
        brake: b(e.brakelights), horn: b(e.horn), reverse: b(e.reverse),
      },
      ignition: e.ignitionLevel ?? 2, running: b(e.engineRunning) || e.running === true,
      cruise: { on: b(e.cruiseControlActive), target: e.cruiseControlTarget || 0 },
      escMode: e.escMode || null, driveMode: e.driveMode || (st.spec && st.spec.driveMode) || null,
      gx: st.g[0], gy: st.g[1], gz: st.g[2],
      pos: st.pos, dir: st.dir,
      wheels: st.wheels,
      adas: w.adas || settings.adas, lead: ad.lead || null, fcw: ad.fcw || 0, bsmL: !!ad.bsmL, bsmR: !!ad.bsmR, aeb: !!ad.aeb,
      accTarget: ad.accTarget || 0, speedLimit: w.speedLimit || null,
      route: w.route || null, tod: w.tod, vehicles: w.vehicles || [], myId: w.myId,
      damage: st.damage,
      electric: !!(st.spec && st.spec.engine && st.spec.engine.electric),
      age: performance.now() - st.last,
      src: (st.status && st.status.src) || 'none',
    };
  }

  // in-game time of day: BeamNG uses 0 = noon, 0.5 = midnight
  function clock(tod) {
    if (typeof tod !== 'number') {
      const n = new Date();
      return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    }
    const h = ((tod * 24 + 12) % 24);
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- navigation helpers
  function navNext(route, pos) {
    if (!route || !route.pts || route.pts.length < 2) return null;
    const p = route.pts;
    let dist = pos ? Math.hypot(p[0][0] - pos[0], p[0][1] - pos[1]) : 0;
    const head = (a, c) => Math.atan2(c[1] - a[1], c[0] - a[0]);
    for (let i = 1; i < p.length - 1; i++) {
      dist += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (dist < 15) continue;
      // compare heading 25 m before and after this point
      let j = i, k = i, back = 0, fwd = 0;
      while (j > 0 && back < 25) { back += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]); j--; }
      while (k < p.length - 1 && fwd < 25) { fwd += Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]); k++; }
      let d = head(p[i], p[k]) - head(p[j], p[i]);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const deg = d * 180 / Math.PI;
      if (Math.abs(deg) > 40) {
        // world is z-up / y-north: positive angle = counter-clockwise = left turn
        return { dist, dir: deg > 0 ? 'left' : 'right', sharp: Math.abs(deg) > 110, total: route.len };
      }
    }
    return { dist: route.len, dir: 'arrive', total: route.len };
  }

  // ---------------------------------------------------------------- connection
  let es = null;
  function handle(type, fn) {
    es.addEventListener(type, (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      fn(m);
      fire(type, m);
    });
  }
  function connect() {
    es = new EventSource('/api/stream');
    es.onopen = () => { st.connected = true; fire('connection', true); };
    es.onerror = () => { st.connected = false; fire('connection', false); };
    handle('veh', (m) => {
      Object.assign(st.e, m.e);
      if (m.g) st.g = m.g;
      if (m.pos) { st.pos = m.pos; st.vel = m.vel; st.dir = m.dir; }
      if (m.wheels) st.wheels = m.wheels;
      st.last = performance.now();
      updateConsumption(st.e);
    });
    handle('electrics', (m) => Object.assign(st.e, m.e));
    handle('pt', (m) => { st.pt = m.pt; st.energy = m.energy; if (typeof m.damage === 'number') st.damage = m.damage; });
    handle('spec', (m) => { st.spec = m; });
    handle('info', (m) => { st.info = m; cons.samples = []; cons.lastOdo = null; cons.value = 0; });
    handle('vars', (m) => { st.vars = m; });
    handle('world', (m) => {
      st.world = m;
      // the game is the source of truth for ADAS settings (they can change from macros / other phones)
      if (m.adas) for (const k of ['fcw', 'fcwSens', 'aeb', 'bsm', 'tsr', 'accGap']) if (m.adas[k] !== undefined) settings.adas[k] = m.adas[k];
    });
    handle('media', (m) => { st.media = m; st.mediaAt = performance.now(); });
    handle('trips', (m) => { st.trips = m; });
    handle('ui', () => {});
    handle('deck', () => {});
    handle('status', (m) => { st.status = m; });
    handle('mapver', () => {});
    handle('cmdResult', (m) => { if (!m.ok && m.err) toast(`${m.type}: ${m.err}`, true); });
  }

  async function cmd(type, args = {}) {
    try {
      const r = await fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...args }) });
      return await r.json();
    } catch (err) {
      toast('Server unreachable', true);
      return { ok: false };
    }
  }
  function pushAdas() { cmd('adas', { settings: settings.adas }); }
  function setAdas(patch) { Object.assign(settings.adas, patch); save(); cmd('adas', { settings: patch }); }

  // named actions (same ones macros / Stream Deck use)
  async function action(id, params) {
    const q = params ? '?' + new URLSearchParams(params) : '';
    try {
      const r = await fetch(`/api/action/${encodeURIComponent(id)}${q}`, { method: 'POST' });
      const j = await r.json();
      if (!j.ok && j.err) toast(j.err, true);
      return j;
    } catch {
      toast('Server unreachable', true);
      return { ok: false };
    }
  }
  const unitParams = () => ({ step: settings.cruiseStep || 5, unit: settings.speedUnit });

  // ---------------------------------------------------------------- key bindings (work on every BeamDash page)
  const DEFAULT_KEYS = {
    ArrowRight: 'cluster-next', ArrowLeft: 'cluster-prev', Enter: 'cluster-ok', Backspace: 'cluster-back',
    PageDown: 'design-next', PageUp: 'design-prev', h: 'cluster-hide',
  };
  let keys;
  try { keys = JSON.parse(localStorage.getItem('beamdash.keys') || 'null') || { ...DEFAULT_KEYS }; } catch { keys = { ...DEFAULT_KEYS }; }
  const saveKeys = () => { try { localStorage.setItem('beamdash.keys', JSON.stringify(keys)); } catch { /* ignore */ } };
  let keysPaused = false;
  window.addEventListener('keydown', (e) => {
    if (keysPaused || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const id = keys[e.key] || keys[e.code];
    if (!id) return;
    e.preventDefault();
    action(id, id.startsWith('cruise-') ? unitParams() : undefined);
  });

  // ---------------------------------------------------------------- formatting
  function duration(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }
  // current media position, advanced locally between 1 Hz updates
  function mediaNow() {
    const m = st.media;
    if (!m || !m.active) return m;
    const pos = m.status === 'Playing' ? m.position + (performance.now() - st.mediaAt) / 1000 : m.position;
    return { ...m, position: Math.min(m.length || pos, pos) };
  }

  // ---------------------------------------------------------------- UI helpers
  let toastEl = null, toastTimer = 0;
  function toast(msg, bad) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'bd-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('bad', !!bad);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function nav(active) {
    const links = [['index', 'Cluster'], ['telemetry', 'Telemetry'], ['map', 'Map & Nav'], ['garage', 'Garage'], ['deck', 'Deck'], ['macros', 'Macros']];
    const el = document.createElement('nav');
    el.className = 'bd-nav';
    el.innerHTML = `<a class="brand" href="/">BeamDash</a>` +
      links.map(([h, t]) => `<a href="/${h === 'index' ? '' : h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('') +
      `<span class="bd-status" id="bdStatus"><i></i><b>connecting</b></span>`;
    document.body.prepend(el);
    const s = el.querySelector('#bdStatus');
    const upd = () => {
      const src = st.status ? st.status.src : 'none';
      const label = !st.connected ? 'offline' : src === 'mod' ? 'BeamNG live' : src === 'outgauge' ? 'OutGauge' : src === 'demo' ? 'demo car' : 'waiting for game';
      s.className = 'bd-status ' + (!st.connected ? 'off' : src);
      s.querySelector('b').textContent = label;
    };
    on('status', upd); on('connection', upd);
    return el;
  }

  function fmt(v, d = 0) { return typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—'; }

  return {
    st, on, fire, connect, cmd, data, settings, save, U, clock, navNext, toast, nav, fmt, setAdas, pushAdas, b,
    action, unitParams, duration, mediaNow, DEFAULT_KEYS,
    get keys() { return keys; }, setKey(k, id) { if (id) keys[k] = id; else delete keys[k]; saveKeys(); },
    resetKeys() { keys = { ...DEFAULT_KEYS }; saveKeys(); }, pauseKeys(v) { keysPaused = v; },
  };
})();
