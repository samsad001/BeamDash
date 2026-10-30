// Multi-function display: the pages you flip through with the steering-wheel buttons.
// Designs with a screen give it a slot; classic designs show it as a pop-up for a few seconds.
'use strict';
window.MFD = (() => {
  const { PI, TAU, clamp, text, rrect, glow, noGlow } = G;
  const U = BD.U;
  const PAGES = [
    { id: 'trip', name: 'Trip computer' },
    { id: 'economy', name: 'Fuel economy' },
    { id: 'media', name: 'Now playing' },
    { id: 'nav', name: 'Navigation' },
    { id: 'assist', name: 'Driver assist' },
    { id: 'speed', name: 'Digital speed' },
    { id: 'tires', name: 'Tires' },
    { id: 'gforce', name: 'G-force' },
    { id: 'engine', name: 'Engine' },
    { id: 'car', name: 'Vehicle & service' },
  ];
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
    page = (page + dir + PAGES.length) % PAGES.length;
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
      default: next(1);
    }
  }
  function hold() {
    popupUntil = performance.now() + 5000;
    if (cur().id === 'trip') { const [k, n] = TRIPS[tripView]; BD.action(k === 'start' ? 'start-reset' : `trip-${k}-reset`); flash(`${n} reset`); }
    else if (cur().id === 'economy') { BD.action('economy-reset'); flash('Fuel economy reset'); }
    else if (cur().id === 'gforce') { gPeak = 0; flash('Peak reset'); }
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
    stat(c, x + w / 2, y + u * 3.7, w / 2, d.electric ? 'Battery' : 'Fuel', `${Math.round(d.fuel * 100)}%  ·  ${d.fuelVol.toFixed(1)} L`, th, u);
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

  // ---------------------------------------------------------------- frame
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
    draw(c, d, r.x, r.y, r.w, r.h, th);
    c.restore();
  }

  return { PAGES, next, back, ok, hold, goto, draw, line, popup, flash, get page() { return cur(); }, get popupVisible() { return performance.now() < popupUntil; } };
})();
