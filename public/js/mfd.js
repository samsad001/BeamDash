// Multi-function display: the pages you flip through with the steering-wheel buttons.
// Designs with a screen give it a slot; classic designs show it as a pop-up for a few seconds.
'use strict';
window.MFD = (() => {
  const { PI, TAU, clamp, text, rrect, glow, noGlow } = G;
  const U = BD.U;
  const PAGES = [
    { id: 'trip', name: 'Trip computer' },
    { id: 'economy', name: 'Economy & eco score' },
    { id: 'energy', name: 'Energy flow' },
    { id: 'media', name: 'Now playing' },
    { id: 'nav', name: 'Navigation' },
    { id: 'assist', name: 'Driver assist' },
    { id: 'speed', name: 'Digital speed' },
    { id: 'perf', name: 'Performance timer' },
    { id: 'lap', name: 'Lap timer' },
    { id: 'drift', name: 'Drift meter' },
    { id: 'dyno', name: 'Virtual dyno' },
    { id: 'tires', name: 'Tires' },
    { id: 'damage', name: 'Damage' },
    { id: 'gforce', name: 'G-force' },
    { id: 'engine', name: 'Engine' },
    { id: 'car', name: 'Vehicle & service' },
  ];
  const enabled = (i) => !(BD.settings.mfdOff || []).includes(PAGES[i].id);
  const TRIPS = [['a', 'TRIP A'], ['b', 'TRIP B'], ['start', 'SINCE START']];
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
  let page = clamp(load('bd.mfd.page', 0), 0, PAGES.length - 1);
  let tripView = load('bd.mfd.trip', 0) % TRIPS.length;
  let navZoom = 1;
  let gPeak = 0;
  let popupUntil = 0, toastText = null, toastUntil = 0;
  const DEFAULT_TH = { bg: 'rgba(8,11,16,.94)', panel: 'rgba(255,255,255,.05)', fg: '#ffffff', dim: 'rgba(255,255,255,.55)', accent: '#4aa3ff', font: 'Rajdhani', line: 'rgba(255,255,255,.12)' };

  const cur = () => PAGES[page];
  function flash(msg) { toastText = msg; toastUntil = performance.now() + 1800; popupUntil = Math.max(popupUntil, toastUntil); }
  function next(dir = 1) {
    // skip pages switched off in Customize
    for (let i = 0; i < PAGES.length; i++) {
      page = (page + dir + PAGES.length) % PAGES.length;
      if (enabled(page)) break;
    }
    store('bd.mfd.page', page);
    popupUntil = performance.now() + 5000;
  }
  function back() { page = 0; store('bd.mfd.page', page); popupUntil = performance.now() + 5000; }
  // OK = the page's main function, hold OK = reset (like a real trip computer)
  function ok() {
    popupUntil = performance.now() + 5000;
    switch (cur().id) {
      case 'trip': tripView = (tripView + 1) % TRIPS.length; store('bd.mfd.trip', tripView); break;
      case 'media': BD.action('media-play-pause'); flash('Play / pause'); break;
      case 'nav': navZoom = navZoom >= 4 ? 0.5 : navZoom * 2; flash(`Zoom ×${navZoom}`); break;
      case 'assist': BD.action('acc-gap'); flash('Following distance'); break;
      case 'gforce': gPeak = 0; flash('Peak reset'); break;
      case 'economy': flash('Hold OK to reset economy'); break;
      case 'lap': {
        const lp = BD.st.perf && BD.st.perf.lap;
        if (!lp || !lp.line) { BD.action('lap-line-here'); flash('Start/finish set here'); } else flash('Hold OK: reset laps');
        break;
      }
      case 'perf': flash('Stop, then launch to time a run'); break;
      case 'drift': flash('Hold OK: reset best drift'); break;
      case 'dyno': flash('Floor it through the revs · hold OK resets'); break;
      default: next(1);
    }
  }
  function hold() {
    popupUntil = performance.now() + 5000;
    if (cur().id === 'trip') { const [k, n] = TRIPS[tripView]; BD.action(k === 'start' ? 'start-reset' : `trip-${k}-reset`); flash(`${n} reset`); }
    else if (cur().id === 'economy') { BD.action('economy-reset'); flash('Fuel economy reset'); }
    else if (cur().id === 'gforce') { gPeak = 0; flash('Peak reset'); }
    else if (cur().id === 'perf') { BD.action('perf-reset'); flash('Performance bests reset'); }
    else if (cur().id === 'lap') { BD.action('lap-reset'); flash('Lap times reset'); }
    else if (cur().id === 'drift') { BD.action('drift-reset'); flash('Best drift reset'); }
    else if (cur().id === 'dyno') { BD.action('dyno-reset'); flash('Dyno reset'); }
    else flash('Nothing to reset here');
  }
  function goto(id) { const i = PAGES.findIndex((p) => p.id === id); if (i >= 0) { page = i; store('bd.mfd.page', page); popupUntil = performance.now() + 5000; } }

  // ---------------------------------------------------------------- helpers
  const km = (m) => `${U.dist(m).toFixed(U.dist(m) < 100 ? 1 : 0)} ${U.distLabel()}`;
  const spd = (ms) => `${Math.round(U.speed(ms))} ${U.speedLabel()}`;
  const cons = (l) => (l > 0.05 ? `${U.consumption(l).toFixed(1)} ${U.consLabel()}` : `-- ${U.consLabel()}`);
  const instCons = (d) => {
    const lph = d.running ? (0.6 + d.throttle * 7) * d.rpm / 1000 : 0;
    const kph = d.speed * 3.6;
    return kph < 5 ? null : clamp(lph / kph * 100, 0, 40);
  };
  const artCache = new Map();
  function art(url) {
    if (!url) return null;
    if (!artCache.has(url)) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      artCache.set(url, img);
      if (artCache.size > 20) artCache.delete(artCache.keys().next().value);
    }
    const img = artCache.get(url);
    return img.complete && img.naturalWidth ? img : null;
  }
  function stat(c, x, y, w, label, val, th, u, big) {
    text(c, label, x, y, u * 0.34, th.dim, 'left', th.font, 600);
    text(c, val, x, y + u * (big ? 0.72 : 0.6), u * (big ? 0.82 : 0.6), th.fg, 'left', th.font, 700);
  }

  // ---------------------------------------------------------------- page renderers
  const R = {};
  R.trip = (c, d, x, y, w, h, th, u) => {
    const [k, name] = TRIPS[tripView];
    const t = (BD.st.trips || {})[k] || {};
    text(c, name, x, y + u * 0.35, u * 0.5, th.accent, 'left', th.font, 700);
    TRIPS.forEach((tt, i) => { c.fillStyle = i === tripView ? th.accent : th.line; c.fillRect(x + w - (3 - i) * u * 0.55, y + u * 0.3, u * 0.42, u * 0.12); });
    const cols = w > h * 1.4 ? 3 : 2, cw = w / cols, rh = (h - u * 0.9) / Math.ceil(6 / cols);
    const items = [['Distance', km(t.dist || 0)], ['Drive time', BD.duration(t.moving)], ['Avg speed', spd(t.avgSpeed || 0)], ['Avg consumption', cons(t.avgCons)], ['Max speed', spd(t.maxSpeed || 0)], ['Fuel used', `${(t.fuel || 0).toFixed(1)} L`]];
    items.forEach(([l, v], i) => stat(c, x + (i % cols) * cw, y + u * 1.1 + Math.floor(i / cols) * rh, cw, l, v, th, u, i < cols));
    text(c, 'OK: switch trip · hold OK: reset', x, y + h - u * 0.2, u * 0.3, th.dim, 'left', th.font, 600);
  };
  R.economy = (c, d, x, y, w, h, th, u) => {
    const t = (BD.st.trips || {}).econ || {};
    const inst = instCons(d);
    text(c, 'INSTANT', x, y + u * 0.35, u * 0.36, th.dim, 'left', th.font, 600);
    text(c, inst === null ? '--' : U.consumption(inst).toFixed(1), x, y + u * 1.15, u * 1.1, th.fg, 'left', th.font, 700);
    text(c, U.consLabel(), x + u * 2.6, y + u * 1.3, u * 0.36, th.dim, 'left', th.font, 600);
    const bw = w - u * 0.2;
    c.fillStyle = th.line; rrect(c, x, y + u * 1.75, bw, u * 0.22, u * 0.11); c.fill();
    c.fillStyle = th.accent; rrect(c, x, y + u * 1.75, bw * clamp((inst || 0) / 30, 0, 1), u * 0.22, u * 0.11); c.fill();
    stat(c, x, y + u * 2.4, w / 2, 'Average since reset', cons(t.avgCons), th, u, true);
    stat(c, x + w / 2, y + u * 2.4, w / 2, 'Range', d.range ? km(d.range) : '---', th, u, true);
    stat(c, x, y + u * 3.7, w / 2, 'Distance since reset', km(t.dist || 0), th, u);
    const eco = t.eco;
    stat(c, x + w / 2, y + u * 3.7, w / 2, 'Eco score', eco === null || eco === undefined ? '--' : `${eco} / 100`, th, u);
    if (eco !== null && eco !== undefined) {
      c.fillStyle = th.line; rrect(c, x + w / 2, y + u * 4.45, w / 2 - u * 0.2, u * 0.12, u * 0.06); c.fill();
      c.fillStyle = eco >= 80 ? '#2bd46a' : eco >= 55 ? '#ffb000' : '#ff3b30';
      rrect(c, x + w / 2, y + u * 4.45, (w / 2 - u * 0.2) * eco / 100, u * 0.12, u * 0.06); c.fill();
    }
    text(c, 'hold OK: reset average', x, y + h - u * 0.2, u * 0.3, th.dim, 'left', th.font, 600);
  };
  R.media = (c, d, x, y, w, h, th, u) => {
    const m = BD.mediaNow();
    if (!m || !m.available) {
      text(c, 'No media source', x, y + h * 0.4, u * 0.6, th.fg, 'left', th.font, 700);
      text(c, 'Install playerctl on the PC running the server', x, y + h * 0.4 + u * 0.7, u * 0.36, th.dim, 'left', th.font, 600);
      return;
    }
    if (!m.active) { text(c, 'Nothing playing', x, y + h * 0.45, u * 0.6, th.dim, 'left', th.font, 700); return; }
    const side = Math.min(h - u * 1.1, w * 0.42);
    const img = art(m.art);
    c.save();
    rrect(c, x, y, side, side, u * 0.3); c.clip();
    if (img) c.drawImage(img, x, y, side, side);
    else {
      const g = c.createLinearGradient(x, y, x + side, y + side); g.addColorStop(0, th.accent); g.addColorStop(1, '#1a1030');
      c.fillStyle = g; c.fillRect(x, y, side, side);
      text(c, '♪', x + side / 2, y + side / 2, side * 0.45, 'rgba(255,255,255,.85)', 'center', 'Arial', 400);
    }
    c.restore();
    const tx = x + side + u * 0.4, tw = w - side - u * 0.4;
    c.save(); c.beginPath(); c.rect(tx, y, tw, h); c.clip();
    text(c, (m.player || '').toUpperCase(), tx, y + u * 0.3, u * 0.32, th.dim, 'left', th.font, 700);
    text(c, m.title || 'Unknown title', tx, y + u * 1.0, u * 0.62, th.fg, 'left', th.font, 700);
    text(c, m.artist || '', tx, y + u * 1.7, u * 0.46, th.fg, 'left', th.font, 600);
    text(c, m.album || '', tx, y + u * 2.3, u * 0.36, th.dim, 'left', th.font, 600);
    c.restore();
    const py = y + side - u * 0.25;
    c.fillStyle = th.line; rrect(c, tx, py, tw, u * 0.14, u * 0.07); c.fill();
    if (m.length > 0) { c.fillStyle = th.accent; rrect(c, tx, py, tw * clamp(m.position / m.length, 0, 1), u * 0.14, u * 0.07); c.fill(); }
    text(c, `${BD.duration(m.position)} / ${BD.duration(m.length)}`, tx, py - u * 0.35, u * 0.32, th.dim, 'left', th.font, 600);
    text(c, m.status === 'Playing' ? '❚❚' : '▶', tx + tw, py - u * 0.38, u * 0.45, th.accent, 'right', 'Arial', 700);
    text(c, 'OK: play / pause', x, y + h - u * 0.2, u * 0.3, th.dim, 'left', th.font, 600);
  };
  R.nav = (c, d, x, y, w, h, th, u) => {
    MapView.mini(c, d, x, y, w, h, { zoom: 1.2 * navZoom, theme: th.mapTheme || 'night', clipRound: u * 0.3, minRoadPx: 2 });
    const n = BD.navNext(d.route, d.pos);
    c.fillStyle = 'rgba(0,0,0,.65)'; rrect(c, x + u * 0.2, y + u * 0.2, Math.min(w - u * 0.4, u * 6.5), u * 1.2, u * 0.25); c.fill();
    if (n) {
      const arrow = n.dir === 'left' ? '↰' : n.dir === 'right' ? '↱' : '⚑';
      text(c, arrow, x + u * 0.8, y + u * 0.82, u * 0.9, th.accent, 'center', 'Arial', 700);
      text(c, n.dir === 'arrive' ? `Arrive in ${U.shortDist(n.dist)}` : `${U.shortDist(n.dist)} · turn ${n.dir}`, x + u * 1.4, y + u * 0.65, u * 0.45, '#fff', 'left', th.font, 700);
      text(c, `${U.shortDist(n.total)} to go`, x + u * 1.4, y + u * 1.1, u * 0.32, 'rgba(255,255,255,.65)', 'left', th.font, 600);
    } else text(c, 'No route · set one on Map & Nav', x + u * 0.5, y + u * 0.82, u * 0.36, '#fff', 'left', th.font, 600);
  };
  R.assist = (c, d, x, y, w, h, th, u) => {
    G.adasView(c, x + w / 2, y + h * 0.58, w * 0.8, h * 0.72, d, { accent: th.accent });
    const acc = d.adas && d.adas.acc;
    text(c, d.cruise.on ? `${acc ? 'ACC' : 'CRUISE'} ${Math.round(U.speed(acc ? d.adas.accSet || d.cruise.target : d.cruise.target))}` : 'CRUISE OFF', x, y + u * 0.35, u * 0.48, d.cruise.on ? th.accent : th.dim, 'left', th.font, 700);
    if (d.speedLimit && d.adas.tsr !== false) G.limitSign(c, x + w - u * 0.7, y + u * 0.7, u * 0.6, Math.round(U.speed(d.speedLimit) / 5) * 5, BD.settings.speedUnit === 'mph');
    const flags = [['FCW', d.adas.fcw], ['AEB', d.adas.aeb], ['BSM', d.adas.bsm]].map(([n, on]) => `${n} ${on ? 'ON' : 'off'}`).join('   ');
    text(c, flags, x, y + h - u * 0.2, u * 0.3, th.dim, 'left', th.font, 600);
  };
  R.speed = (c, d, x, y, w, h, th, u) => {
    const s = Math.round(U.speed(d.speed));
    text(c, String(s), x + w / 2, y + h * 0.45, Math.min(h * 0.6, w * 0.38), th.fg, 'center', th.font, 700);
    text(c, U.speedLabel(), x + w / 2, y + h * 0.78, u * 0.45, th.dim, 'center', th.font, 600);
    if (d.speedLimit && d.adas.tsr !== false) {
      const lim = Math.round(U.speed(d.speedLimit) / 5) * 5;
      G.limitSign(c, x + u * 0.8, y + u * 0.9, u * 0.7, lim, BD.settings.speedUnit === 'mph');
      if (s > lim + 3) text(c, 'OVER LIMIT', x + w / 2, y + h - u * 0.3, u * 0.4, '#ff4a3a', 'center', th.font, 700);
    }
  };
  R.tires = (c, d, x, y, w, h, th, u) => {
    G.carTop(c, x + w / 2, y + h / 2, h * 0.86, d.wheels, {
      wheelColor: (wd) => G.tireTemp()(wd.brakeSurfaceTemperature || 30),
      label: (wd) => (wd.pressure ? U.tire(wd.pressure).toFixed(BD.settings.pressUnit === 'psi' ? 0 : 1) : wd.name),
      font: th.font, textColor: th.fg,
    });
    text(c, `${U.pressLabel()} · colour = brake temp`, x, y + h - u * 0.2, u * 0.3, th.dim, 'left', th.font, 600);
    const bad = (d.wheels || []).filter((wd) => wd.isTireDeflated || wd.isBroken).map((wd) => wd.name);
    if (bad.length) text(c, `FLAT: ${bad.join(' ')}`, x, y + u * 0.35, u * 0.45, '#ff4a3a', 'left', th.font, 700);
  };
  R.gforce = (c, d, x, y, w, h, th, u) => {
    const g = Math.hypot(d.gx, d.gy) / 9.81;
    gPeak = Math.max(gPeak, g);
    const r = Math.min(h * 0.4, w * 0.3);
    G.gMeter(c, x + r + u * 0.3, y + h / 2, r, d.gx, -d.gy, { color: th.accent, label: false, grid: th.line });
    const sx = x + r * 2 + u * 1.0;
    stat(c, sx, y + u * 0.6, w, 'Combined', `${g.toFixed(2)} g`, th, u, true);
    stat(c, sx, y + u * 2.1, w, 'Lateral · Long', `${(d.gx / 9.81).toFixed(2)} · ${(d.gy / 9.81).toFixed(2)}`, th, u);
    stat(c, sx, y + u * 3.4, w, 'Peak', `${gPeak.toFixed(2)} g`, th, u);
    text(c, 'OK: reset peak', x, y + h - u * 0.2, u * 0.3, th.dim, 'left', th.font, 600);
  };
  R.engine = (c, d, x, y, w, h, th, u) => {
    const rows = [
      ['Coolant', `${Math.round(U.temp(d.water))}${U.tempLabel()}`, clamp((d.water - 50) / 80, 0, 1), d.water > 112],
      ['Oil temp', `${Math.round(U.temp(d.oilT))}${U.tempLabel()}`, clamp((d.oilT - 50) / 100, 0, 1), d.oilT > 135],
      ['Oil pressure', d.oilP != null ? `${(BD.settings.pressUnit === 'psi' ? d.oilP * 14.5 : d.oilP).toFixed(1)} ${BD.settings.pressUnit === 'psi' ? 'psi' : 'bar'}` : '—', clamp((d.oilP || 0) / 6, 0, 1), false],
      ['Boost', `${U.boost(d.boost).toFixed(1)} ${U.pressLabel()}`, clamp((d.boost + 5) / (d.boostMax + 5), 0, 1), false],
      ['Load', `${Math.round(d.throttle * 100)} %`, d.throttle, false],
    ];
    const rh = (h - u * 0.3) / rows.length;
    rows.forEach(([l, v, f, warn], i) => {
      const yy = y + i * rh + rh * 0.4;
      text(c, l, x, yy, u * 0.38, th.dim, 'left', th.font, 600);
      text(c, v, x + w, yy, u * 0.46, warn ? '#ff4a3a' : th.fg, 'right', th.font, 700);
      c.fillStyle = th.line; rrect(c, x, yy + u * 0.32, w, u * 0.12, u * 0.06); c.fill();
      c.fillStyle = warn ? '#ff4a3a' : th.accent; rrect(c, x, yy + u * 0.32, w * clamp(f, 0, 1), u * 0.12, u * 0.06); c.fill();
    });
  };
  R.car = (c, d, x, y, w, h, th, u) => {
    const info = BD.st.info || {}, m = info.model || {}, cf = info.config || {};
    text(c, `${m.Brand || ''} ${m.Name || info.jbeam || 'Unknown car'}`.trim(), x, y + u * 0.45, u * 0.62, th.fg, 'left', th.font, 700);
    text(c, cf.Configuration || '', x, y + u * 1.05, u * 0.36, th.dim, 'left', th.font, 600);
    const odoKm = d.odo / 1000, serviceKm = 15000 - (odoKm % 15000);
    const serviceStr = BD.settings.speedUnit === 'mph' ? `${Math.round(serviceKm / 1.609)} mi` : `${Math.round(serviceKm)} km`;
    const items = [['Odometer', km(d.odo)], ['Next service', serviceStr], ['Power', cf.Power ? `${Math.round(cf.Power)} PS` : '—'], ['Weight', cf.Weight ? `${Math.round(cf.Weight)} kg` : '—']];
    const cw = w / 2;
    items.forEach(([l, v], i) => stat(c, x + (i % 2) * cw, y + u * 1.7 + Math.floor(i / 2) * u * 1.35, cw, l, v, th, u));
    const msgs = [];
    const L = d.lights;
    if (L.lowFuel) msgs.push('Fuel low');
    if (d.water > 112) msgs.push('Engine hot');
    if (L.check) msgs.push('Check engine');
    if (L.tpms) msgs.push('Tire pressure');
    if (d.damage > 2000) msgs.push('Vehicle damaged');
    text(c, msgs.length ? `⚠ ${msgs.join(' · ')}` : '✓ No check-control messages', x, y + h - u * 0.25, u * 0.34, msgs.length ? '#ffb000' : th.dim, 'left', th.font, 700);
  };

  // ---------------------------------------------------------------- v0.04 pages
  const fmtS = (s, dp = 2) => (typeof s === 'number' ? `${s.toFixed(dp)} s` : '--');
  const lapStr = (s) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '-:--.---');

  // power flow: engine / battery / motor / wheels, with a CHG-ECO-PWR meter (hybrids) or kW meter (EVs)
  R.energy = (c, d, x, y, w, h, th, u) => {
    if (!d.isEV && !d.isHybrid) {
      text(c, 'Combustion car', x, y + u * 0.5, u * 0.55, th.fg, 'left', th.font, 700);
      text(c, 'No electric drive in this vehicle', x, y + u * 1.1, u * 0.34, th.dim, 'left', th.font, 600);
      stat(c, x, y + u * 2.0, w, 'Engine power now', `${Math.round(Math.max(0, d.engKw))} kW  ·  ${Math.round(Math.max(0, d.engKw) * 1.341)} hp`, th, u, true);
      stat(c, x, y + u * 3.4, w, 'Engine torque', `${Math.round(Math.max(0, d.engNm))} Nm`, th, u);
      return;
    }
    const t = (BD.st.trips || {}).a || {};
    const mk = d.motorKw, ek = Math.max(0, d.engKw);
    const box = (bx, by, label, active, col) => {
      c.fillStyle = active ? col + '33' : th.line; rrect(c, bx - u * 0.9, by - u * 0.45, u * 1.8, u * 0.9, u * 0.2); c.fill();
      c.strokeStyle = active ? col : th.line; c.lineWidth = 2; c.stroke();
      text(c, label, bx, by, u * 0.32, active ? th.fg : th.dim, 'center', th.font, 700);
    };
    const flow = (x1, y1, x2, y2, on, col) => {
      c.strokeStyle = on ? col : th.line; c.lineWidth = u * 0.1;
      c.setLineDash(on ? [u * 0.25, u * 0.18] : []);
      c.lineDashOffset = on ? -(performance.now() / 40) % (u * 0.43) : 0;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.setLineDash([]);
    };
    const cx = x + w * 0.5, rowE = y + u * 0.6, rowW = y + u * 2.1, rowB = y + u * 3.6;
    const green = '#2bd46a', blue = th.accent, orange = '#ffb000';
    if (d.isHybrid) { box(x + w * 0.2, rowE, 'ENGINE', ek > 2, orange); flow(x + w * 0.2, rowE + u * 0.45, cx - u * 0.6, rowW, ek > 2, orange); }
    box(cx, rowW, 'WHEELS', d.speed > 0.5, th.fg);
    box(x + w * 0.8, rowE, 'MOTOR', Math.abs(mk) > 1, mk < -1 ? green : blue);
    flow(x + w * 0.8, rowE + u * 0.45, cx + u * 0.6, rowW, Math.abs(mk) > 1, mk < -1 ? green : blue);
    box(x + w * 0.8, rowB, `BATTERY ${d.battery !== null ? Math.round(d.battery * 100) + '%' : ''}`, Math.abs(mk) > 1, mk < -1 ? green : blue);
    flow(x + w * 0.8, rowE + u * 0.45, x + w * 0.8, rowB - u * 0.45, Math.abs(mk) > 1, mk < -1 ? green : blue);
    // CHG / ECO / PWR style meter
    const mx = x, my = rowB + u * 0.9, mw = w * 0.6;
    const frac = clamp((mk + 60) / 160, 0, 1);
    c.fillStyle = th.line; rrect(c, mx, my, mw, u * 0.28, u * 0.14); c.fill();
    c.fillStyle = mk < -1 ? green : mk > 40 ? orange : blue; rrect(c, mx + mw * Math.min(frac, 60 / 160), my, mw * Math.abs(frac - 60 / 160), u * 0.28, u * 0.14); c.fill();
    text(c, 'CHG', mx, my - u * 0.25, u * 0.26, green, 'left', th.font, 700);
    text(c, 'ECO', mx + mw * 0.45, my - u * 0.25, u * 0.26, th.dim, 'center', th.font, 700);
    text(c, 'PWR', mx + mw, my - u * 0.25, u * 0.26, orange, 'right', th.font, 700);
    text(c, `${mk >= 0 ? '' : '−'}${Math.abs(Math.round(mk))} kW`, mx + mw + u * 0.3, my + u * 0.15, u * 0.42, th.fg, 'left', th.font, 700);
    text(c, `Trip A: ${(t.energy || 0).toFixed(2)} kWh used · ${(t.regen || 0).toFixed(2)} kWh regen${t.kwhPer100 ? ` · ${t.kwhPer100.toFixed(1)} kWh/100km` : ''}`, x, y + h - u * 0.2, u * 0.28, th.dim, 'left', th.font, 600);
  };

  R.perf = (c, d, x, y, w, h, th, u) => {
    const p = BD.st.perf || {};
    const mph = BD.settings.speedUnit === 'mph';
    let status = 'Stop the car to arm the timer';
    let col = th.dim;
    if (p.state === 'ready') { status = 'READY · launch when you want'; col = '#2bd46a'; }
    if (p.state === 'running' && p.run) { status = `RUNNING ${p.run.elapsed.toFixed(1)} s · ${U.shortDist(p.run.dist)}`; col = '#ffb000'; }
    text(c, status, x, y + u * 0.35, u * 0.42, col, 'left', th.font, 700);
    const L = p.last || {}, B = p.best || {};
    const rows = [
      [mph ? '0–60 mph' : '0–100 km/h', mph ? L.t60mph : L.t100, mph ? B.t60mph : B.t100, fmtS],
      [mph ? '0–100 km/h' : '0–60 mph', mph ? L.t100 : L.t60mph, mph ? B.t100 : B.t60mph, fmtS],
      ['100–200 km/h', L.t100to200, B.t100to200, fmtS],
      ['¼ mile', L.quarter, B.quarter, (q) => (q ? `${q.time.toFixed(2)} s @ ${Math.round(U.speed(q.trap))}` : '--')],
      ['⅛ mile', L.eighth, B.eighth, (q) => (q ? `${q.time.toFixed(2)} s @ ${Math.round(U.speed(q.trap))}` : '--')],
      [mph ? '60–0 mph' : '100–0 km/h', mph ? L.brake60mph : L.brake100, mph ? B.brake60mph : B.brake100, (m) => (typeof m === 'number' ? U.shortDist(m) : '--')],
    ];
    const rh = (h - u * 1.4) / rows.length;
    text(c, 'LAST', x + w * 0.62, y + u * 0.95, u * 0.28, th.dim, 'right', th.font, 700);
    text(c, 'BEST', x + w, y + u * 0.95, u * 0.28, th.accent, 'right', th.font, 700);
    rows.forEach(([n, l, b, f], i) => {
      const yy = y + u * 1.4 + rh * (i + 0.5);
      text(c, n, x, yy, u * 0.38, th.dim, 'left', th.font, 600);
      text(c, f(l), x + w * 0.62, yy, u * 0.42, th.fg, 'right', th.font, 700);
      text(c, f(b), x + w, yy, u * 0.42, th.accent, 'right', th.font, 700);
    });
  };

  R.lap = (c, d, x, y, w, h, th, u) => {
    const lp = (BD.st.perf || {}).lap || {};
    if (!lp.line) {
      text(c, 'No start/finish line', x, y + h * 0.3, u * 0.6, th.fg, 'left', th.font, 700);
      text(c, 'Press OK here to put it where your car is,', x, y + h * 0.3 + u * 0.75, u * 0.36, th.dim, 'left', th.font, 600);
      text(c, 'or tap the map on Map & Nav.', x, y + h * 0.3 + u * 1.2, u * 0.36, th.dim, 'left', th.font, 600);
      return;
    }
    const now = BD.lapNow();
    text(c, lp.running ? `LAP ${lp.n}` : 'CROSS THE LINE TO START', x, y + u * 0.35, u * 0.4, th.dim, 'left', th.font, 700);
    text(c, lapStr(lp.running ? now : null), x + w / 2, y + u * 1.45, u * 1.25, th.fg, 'center', th.font, 700);
    // gap to best lap
    const dl = lp.delta;
    const by = y + u * 2.45, bw = w;
    c.fillStyle = th.line; rrect(c, x, by, bw, u * 0.32, u * 0.16); c.fill();
    if (typeof dl === 'number') {
      const f = clamp(dl / 3, -1, 1);
      c.fillStyle = dl <= 0 ? '#2bd46a' : '#ff3b30';
      const mid = x + bw / 2;
      if (f >= 0) c.fillRect(mid, by, bw / 2 * f, u * 0.32); else c.fillRect(mid + bw / 2 * f, by, -bw / 2 * f, u * 0.32);
      text(c, `${dl > 0 ? '+' : '−'}${Math.abs(dl).toFixed(2)}`, x + w / 2, by + u * 0.7, u * 0.46, dl <= 0 ? '#2bd46a' : '#ff3b30', 'center', th.font, 700);
    }
    c.fillStyle = th.fg; c.fillRect(x + bw / 2 - 1, by - u * 0.08, 2, u * 0.48);
    const best = lp.best || {};
    const secs = ['S1', 'S2', 'S3'];
    const sy = y + u * 3.6;
    secs.forEach((s, i) => {
      const cur = lp.sectors[i], b = best.sectors ? best.sectors[i] : null;
      const sx = x + i * w / 3;
      const col = cur === undefined || b === null || b === undefined ? th.fg : cur <= b ? '#2bd46a' : '#ffb000';
      text(c, s, sx, sy, u * 0.3, th.dim, 'left', th.font, 700);
      text(c, cur !== undefined ? cur.toFixed(2) : b ? b.toFixed(2) : '--', sx, sy + u * 0.45, u * 0.42, cur !== undefined ? col : th.dim, 'left', th.font, 700);
    });
    text(c, `Last ${lapStr(lp.lastLap ? lp.lastLap.time : null)}    Best ${lapStr(best.time)}`, x, y + h - u * 0.2, u * 0.32, th.dim, 'left', th.font, 700);
  };

  R.drift = (c, d, x, y, w, h, th, u) => {
    const dr = (BD.st.fun || {}).drift || {};
    const r = Math.min(h * 0.62, w * 0.42), cx = x + w / 2, cy = y + r + u * 0.4;
    const a0 = PI * 1.15, a1 = PI * 1.85;
    c.lineWidth = u * 0.22; c.strokeStyle = th.line;
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
    const f = clamp((dr.angle || 0) / 60, -1, 1);
    const am = (a0 + a1) / 2;
    c.strokeStyle = Math.abs(dr.angle || 0) > 12 ? '#ffb000' : th.accent;
    c.beginPath(); c.arc(cx, cy, r, Math.min(am, am + f * (a1 - am)), Math.max(am, am + f * (a1 - am))); c.stroke();
    text(c, `${Math.round(Math.abs(dr.angle || 0))}°`, cx, cy - r * 0.45, u * 0.7, th.fg, 'center', th.font, 700);
    text(c, dr.active ? String(dr.score) : dr.last ? String(dr.last) : '0', cx, cy - r * 0.05, u * 1.0, dr.active ? '#ffb000' : th.fg, 'center', th.font, 700);
    text(c, dr.active ? 'DRIFTING' : 'LAST DRIFT', cx, cy + r * 0.2, u * 0.3, th.dim, 'center', th.font, 700);
    text(c, `Best ${dr.best || 0}`, x, y + h - u * 0.2, u * 0.34, th.accent, 'left', th.font, 700);
  };

  R.dyno = (c, d, x, y, w, h, th, u) => {
    const dy = (BD.st.fun || {}).dyno;
    const bins = dy ? Object.entries(dy.bins).map(([r, v]) => [+r, v[0], v[1]]).sort((a, b) => a[0] - b[0]) : [];
    if (bins.length < 3) {
      text(c, 'Collecting…', x, y + h * 0.35, u * 0.6, th.fg, 'left', th.font, 700);
      text(c, 'Floor it (full throttle) through the rev range.', x, y + h * 0.35 + u * 0.7, u * 0.34, th.dim, 'left', th.font, 600);
      return;
    }
    const maxR = bins[bins.length - 1][0], minR = bins[0][0];
    const maxP = Math.max(...bins.map((b) => b[1])), maxT = Math.max(...bins.map((b) => b[2]));
    const gx = x, gy = y + u * 0.9, gw = w, gh = h - u * 1.6;
    c.strokeStyle = th.line; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(gx, gy + gh * i / 4); c.lineTo(gx + gw, gy + gh * i / 4); c.stroke(); }
    const px = (r) => gx + (r - minR) / Math.max(1, maxR - minR) * gw;
    const curve = (idx, max, col) => {
      c.strokeStyle = col; c.lineWidth = u * 0.08; c.beginPath();
      bins.forEach((b, i) => { const yy = gy + gh - b[idx] / max * gh * 0.95; i ? c.lineTo(px(b[0]), yy) : c.moveTo(px(b[0]), yy); });
      c.stroke();
    };
    curve(1, maxP, '#ff3b30'); curve(2, maxT, th.accent);
    const peakP = bins.reduce((a, b) => (b[1] > a[1] ? b : a)), peakT = bins.reduce((a, b) => (b[2] > a[2] ? b : a));
    text(c, `${Math.round(peakP[1])} kW (${Math.round(peakP[1] * 1.341)} hp) @ ${peakP[0]}`, x, y + u * 0.3, u * 0.36, '#ff6a5f', 'left', th.font, 700);
    text(c, `${Math.round(peakT[2])} Nm @ ${peakT[0]}`, x + w, y + u * 0.3, u * 0.36, th.accent, 'right', th.font, 700);
    text(c, `${minR}`, gx, gy + gh + u * 0.3, u * 0.26, th.dim, 'left', th.font, 600);
    text(c, `${maxR} rpm`, gx + gw, gy + gh + u * 0.3, u * 0.26, th.dim, 'right', th.font, 600);
  };

  R.damage = (c, d, x, y, w, h, th, u) => {
    const dm = BD.st.dmg;
    if (!dm) { text(c, 'No damage data', x, y + h * 0.4, u * 0.5, th.dim, 'left', th.font, 700); return; }
    const issues = [];
    if (dm.engine && dm.engine.disabled) issues.push(['Engine disabled', true]);
    for (const [k] of Object.entries(dm.flags || {})) issues.push([k.replace(/\./g, ': ').replace(/([a-z])([A-Z])/g, '$1 $2'), /engine|radiator|oil|gearbox|transmission/i.test(k)]);
    for (const b of dm.broken || []) issues.push([`Broken: ${b}`, true]);
    for (const wd of dm.wheels || []) issues.push([`${wd.name}: ${wd.broken ? 'wheel broken' : 'flat tire'}`, true]);
    const parts = Object.entries(dm.deform || {}).sort((a, b) => b[1] - a[1]);
    // car outline with damaged zones
    const ch = h - u * 0.9, cw = ch * 0.45, cx = x + cw / 2 + u * 0.2, cy = y + u * 0.4 + ch / 2;
    const zone = (re) => parts.some(([n]) => re.test(n));
    c.fillStyle = th.line; rrect(c, cx - cw / 2, cy - ch / 2, cw, ch, cw * 0.3); c.fill();
    const hit = (zx, zy, zw, zh, on) => { if (on) { c.fillStyle = 'rgba(255,59,48,.55)'; rrect(c, zx, zy, zw, zh, u * 0.15); c.fill(); } };
    hit(cx - cw / 2, cy - ch / 2, cw, ch * 0.22, zone(/(^|_)F(_|$)|front|bumper_F|hood|headlight|radiator/i));
    hit(cx - cw / 2, cy + ch * 0.28, cw, ch * 0.22, zone(/(^|_)R(_|$)|rear|bumper_R|trunk|taillight|tailgate/i));
    hit(cx - cw / 2, cy - ch * 0.28, cw * 0.3, ch * 0.56, zone(/_L$|left|_FL|_RL|mirror_L|door_L/i));
    hit(cx + cw * 0.2, cy - ch * 0.28, cw * 0.3, ch * 0.56, zone(/_R$|right|_FR|_RR|mirror_R|door_R/i));
    for (const wd of dm.wheels || []) {
      const p = { FL: [-1, -1], FR: [1, -1], RL: [-1, 1], RR: [1, 1] }[wd.name];
      if (p) { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(cx + p[0] * cw / 2, cy + p[1] * ch * 0.3, u * 0.22, 0, TAU); c.fill(); }
    }
    const lx = x + cw + u * 0.8;
    text(c, `Damage ${Math.round(dm.total || 0)}`, lx, y + u * 0.35, u * 0.5, (dm.total || 0) > 2000 ? '#ff3b30' : th.fg, 'left', th.font, 700);
    const lines = [...issues.map(([n, bad]) => [n, bad ? '#ff3b30' : '#ffb000']), ...parts.slice(0, 8).map(([n, v]) => [`${n.replace(/_/g, ' ')}  ${Math.round(Math.min(1, v) * 100)}%`, th.dim])];
    const maxLines = Math.floor((h - u * 1.1) / (u * 0.5));
    lines.slice(0, maxLines).forEach(([s, col], i) => text(c, s, lx, y + u * 1.0 + i * u * 0.5, u * 0.32, col, 'left', th.font, 600));
    if (!lines.length) text(c, '✓ No broken parts', lx, y + u * 1.0, u * 0.36, '#2bd46a', 'left', th.font, 700);
  };

  // ---------------------------------------------------------------- frame
  function drawPage(c, d, id, x, y, w, h, th0, o) {
    const keep = page;
    const i = PAGES.findIndex((p) => p.id === id);
    if (i >= 0) page = i;
    try { draw(c, d, x, y, w, h, th0, o); } finally { page = keep; }
  }
  function draw(c, d, x, y, w, h, th0, o = {}) {
    const th = { ...DEFAULT_TH, ...(th0 || {}) };
    c.save();
    if (o.bg !== false) { c.fillStyle = th.bg; rrect(c, x, y, w, h, o.radius ?? Math.min(w, h) * 0.06); c.fill(); }
    const pad = Math.min(w, h) * 0.06;
    const u = Math.min(w / 11, h / 6.4);
    // header: page name + position dots
    text(c, cur().name.toUpperCase(), x + pad, y + pad + u * 0.2, u * 0.34, th.dim, 'left', th.font, 700);
    const dotW = u * 0.16;
    PAGES.forEach((p, i) => {
      c.fillStyle = i === page ? th.accent : th.line;
      c.beginPath(); c.arc(x + w - pad - (PAGES.length - 1 - i) * dotW * 1.9, y + pad + u * 0.2, dotW / 2, 0, TAU); c.fill();
    });
    const cx = x + pad, cy = y + pad + u * 0.65, cw = w - pad * 2, ch = h - pad * 2 - u * 0.65;
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    try { R[cur().id](c, d, cx, cy, cw, ch, th, u); } catch (err) { console.error(err); }
    if (toastText && performance.now() < toastUntil) {
      c.fillStyle = 'rgba(0,0,0,.75)'; rrect(c, x + w / 2 - u * 3, y + h / 2 - u * 0.5, u * 6, u, u * 0.3); c.fill();
      text(c, toastText, x + w / 2, y + h / 2, u * 0.42, '#fff', 'center', th.font, 700);
    }
    c.restore();
  }

  // one line for small LCD windows (classic clusters)
  function line(d) {
    const p = cur().id;
    const tr = BD.st.trips || {};
    if (p === 'trip') { const [k, n] = TRIPS[tripView]; const t = tr[k] || {}; return `${n}  ${km(t.dist || 0)}  ${BD.duration(t.moving)}  Ø${Math.round(U.speed(t.avgSpeed || 0))}`; }
    if (p === 'economy') { const t = tr.econ || {}; return `Ø ${cons(t.avgCons)}   RANGE ${d.range ? km(d.range) : '---'}`; }
    if (p === 'media') { const m = BD.st.media; return m && m.active ? `♪ ${m.artist ? m.artist + ' - ' : ''}${m.title}` : '♪ NOTHING PLAYING'; }
    if (p === 'nav') { const n = BD.navNext(d.route, d.pos); return n ? `${n.dir === 'arrive' ? 'ARRIVE' : 'TURN ' + n.dir.toUpperCase()} ${U.shortDist(n.dist)}` : 'NO ROUTE'; }
    if (p === 'assist') return d.cruise.on ? `${d.adas.acc ? 'ACC' : 'CRUISE'} ${Math.round(U.speed(d.adas.acc ? d.adas.accSet : d.cruise.target))}` : 'CRUISE OFF';
    if (p === 'speed') return `${Math.round(U.speed(d.speed))} ${U.speedLabel()}`;
    if (p === 'engine') return `OIL ${Math.round(U.temp(d.oilT))}°  H2O ${Math.round(U.temp(d.water))}°  BOOST ${U.boost(d.boost).toFixed(1)}`;
    if (p === 'gforce') return `G ${(Math.hypot(d.gx, d.gy) / 9.81).toFixed(2)}  PEAK ${gPeak.toFixed(2)}`;
    if (p === 'tires') return (d.wheels || []).map((w) => `${w.name} ${w.pressure ? U.tire(w.pressure).toFixed(0) : '-'}`).join(' ');
    if (p === 'energy') return d.isEV || d.isHybrid ? `${Math.round(d.motorKw)} kW  BATT ${d.battery !== null ? Math.round(d.battery * 100) : '--'}%` : `ENGINE ${Math.round(Math.max(0, d.engKw))} kW`;
    if (p === 'perf') { const pf = BD.st.perf || {}; const b = pf.best || {}; return pf.state === 'running' && pf.run ? `RUN ${pf.run.elapsed.toFixed(1)} s` : `0-100 ${typeof b.t100 === 'number' ? b.t100.toFixed(2) : '--'}  ${pf.state === 'ready' ? 'READY' : ''}`; }
    if (p === 'lap') { const lp = (BD.st.perf || {}).lap || {}; return lp.running ? `LAP ${lp.n} ${lapStr(BD.lapNow())}` : lp.line ? 'CROSS LINE' : 'NO LAP LINE'; }
    if (p === 'drift') { const dr = (BD.st.fun || {}).drift || {}; return `DRIFT ${dr.active ? dr.score : dr.last || 0}  BEST ${dr.best || 0}`; }
    if (p === 'dyno') return 'DYNO: FULL THROTTLE';
    if (p === 'damage') { const dm = BD.st.dmg; return dm ? `DAMAGE ${Math.round(dm.total || 0)}` : 'NO DAMAGE DATA'; }
    return `ODO ${km(d.odo)}`;
  }

  // pop-up for designs without a screen
  function popup(c, d, th, area) {
    const now = performance.now();
    if (now > popupUntil) return;
    const a = Math.min(1, (popupUntil - now) / 400);
    c.save();
    c.globalAlpha = a;
    const r = area || { x: 490, y: 280, w: 620, h: 300 };
    // solid backing so glowing gauge numbers don't show through the pop-up
    c.fillStyle = '#000';
    rrect(c, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.06); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.stroke();
    draw(c, d, r.x, r.y, r.w, r.h, th);
    c.restore();
  }

  return { PAGES, next, back, ok, hold, goto, draw, drawPage, line, popup, flash, get page() { return cur(); }, get popupVisible() { return performance.now() < popupUntil; } };
})();
