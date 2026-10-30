// BeamDash cluster designs. Each design draws into a 1600 x 600 virtual canvas.
// draw(c, d, k): c = 2D context, d = live data (BD.data(), smoothed), k = { t, o (options), S (settings) }
'use strict';
window.DESIGNS = (() => {
  const { PI, TAU, clamp, text, rrect, glow, noGlow, dial, needle, arcBar, bar, segments, seg7, icon, LIGHT, lightRow } = G;
  const U = BD.U;
  const list = [];
  const reg = (def) => list.push(def);

  // ---------------------------------------------------------------- helpers
  const mph = () => BD.settings.speedUnit === 'mph';
  const spd = (d) => U.speed(d.speed);
  const sScale = (kmh, mi) => (mph() ? mi : kmh); // [max, major, minor]
  const odoStr = (d, n = 6) => String(Math.floor(U.dist(d.odo)) % 10 ** n).padStart(n, '0');
  const tripStr = (d) => U.dist(d.trip).toFixed(1);
  const rangeStr = (d) => (d.range ? `${Math.round(U.dist(d.range))} ${U.distLabel()}` : `--- ${U.distLabel()}`);
  const oilP = (d) => (d.oilP != null ? d.oilP * 14.5 : d.running ? 20 + d.rpm / 140 : 0); // psi
  const volts = (d) => (d.running ? 13.9 : d.ignition > 0 ? 12.4 : 0);
  const kmax = (d) => d.tachMax / 1000;
  const fuelFrac = (d) => clamp(d.fuel, 0, 1);
  const waterFrac = (d) => clamp((d.water - 50) / 80, 0, 1); // 50..130 C
  const gearMain = (d) => (d.gear && d.gear[0] === 'D' && d.gear.length > 1 ? d.gear.slice(1) : d.gear);
  // instantaneous economy estimate (L/100km) - econometers really read manifold vacuum, so this follows load
  const econ = (d) => {
    const lph = d.running ? (0.6 + d.throttle * 7) * d.rpm / 1000 : 0;
    const kph = d.speed * 3.6;
    return kph < 5 ? 30 : clamp(lph / kph * 100, 0, 30);
  };
  const tempC = (d) => U.temp(d.water);
  const accent = (k, def) => k.o.accent || def;

  function chrome(c, x, y, r, w) {
    const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#f6f6f6'); g.addColorStop(0.3, '#8a8a8a'); g.addColorStop(0.55, '#e6e6e6'); g.addColorStop(0.8, '#5a5a5a'); g.addColorStop(1, '#bdbdbd');
    c.beginPath(); c.arc(x, y, r + w, 0, TAU); c.arc(x, y, r, 0, TAU, true);
    c.fillStyle = g; c.fill();
  }
  function deepFace(c, x, y, r, col = '#111') {
    const f = c.createRadialGradient(x, y - r * 0.35, r * 0.05, x, y, r);
    f.addColorStop(0, col); f.addColorStop(1, '#000');
    return f;
  }
  // rolling odometer drum
  function drum(c, x, y, value, n, h, o = {}) {
    const dw = h * 0.68, w = dw * n;
    c.save();
    c.fillStyle = o.bg || '#050505';
    c.fillRect(x - w / 2 - 4, y - h / 2 - 3, w + 8, h + 6);
    c.beginPath(); c.rect(x - w / 2, y - h / 2, w, h); c.clip();
    const v = Math.max(0, value);
    for (let i = 0; i < n; i++) {
      const place = 10 ** (n - 1 - i);
      const digit = Math.floor(v / place) % 10;
      // last digit rolls continuously, others roll when the lower digits are at 9.x
      let frac = 0;
      if (i === n - 1) frac = (v % 1);
      else {
        const lower = v % place;
        if (lower > place - 1) frac = lower - (place - 1);
      }
      const cx = x - w / 2 + dw * (i + 0.5);
      c.fillStyle = i === n - 1 && o.lastRed ? '#6a0d0d' : (o.drum || '#111');
      c.fillRect(cx - dw / 2 + 1, y - h / 2, dw - 2, h);
      for (const k of [0, 1]) {
        text(c, String((digit + k) % 10), cx, y - frac * h + k * h, h * 0.8, o.color || '#e8e8e8', 'center', o.font || 'Barlow Condensed', 600);
      }
    }
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
    c.fillStyle = g;
    c.fillRect(x - w / 2, y - h / 2, w, h);
    c.restore();
  }
  // small sub-gauge (fuel / temp / econ)
  function mini(c, x, y, r, frac, o = {}) {
    const a0 = o.a0 ?? 1.2 * PI, a1 = o.a1 ?? 1.8 * PI;
    const ticks = o.ticks ?? 4;
    c.save();
    c.lineCap = 'butt';
    for (let i = 0; i <= ticks; i++) {
      const a = a0 + (a1 - a0) * i / ticks;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      c.lineTo(x + Math.cos(a) * r * (i % 2 ? 0.86 : 0.8), y + Math.sin(a) * r * (i % 2 ? 0.86 : 0.8));
      c.strokeStyle = (o.redEnd && i === ticks) || (o.redStart && i === 0) ? (o.red || '#ff3a2a') : (o.tick || '#ddd');
      c.lineWidth = o.tickW || r * 0.06;
      c.stroke();
    }
    if (o.lo) {
      const lr = o.labelR ?? 1.18;
      if (o.labelGlow) glow(c, o.labelGlow, 8);
      text(c, o.lo, x + Math.cos(a0) * r * lr, y + Math.sin(a0) * r * lr, o.size || r * 0.3, o.loColor || o.label || '#ddd', 'center', o.font, 600);
      text(c, o.hi, x + Math.cos(a1) * r * lr, y + Math.sin(a1) * r * lr, o.size || r * 0.3, o.hiColor || o.label || '#ddd', 'center', o.font, 600);
      noGlow(c);
    }
    if (o.name) text(c, o.name, x, y + (o.nameDy ?? r * 0.3), o.nameSize || r * 0.24, o.label || '#bbb', 'center', o.font, 600);
    if (o.icon) icon(c, o.icon, x, y + (o.iconDy ?? r * 0.32), r * 0.4, o.label || '#bbb');
    needle(c, x, y, a0 + (a1 - a0) * clamp(frac, 0, 1), { len: r * 0.95, w: r * 0.05, tail: r * 0.1, color: o.needle || '#ff5a1a', cap: r * 0.12, capColor: o.cap || '#111', glow: o.needleGlow });
    c.restore();
  }
  function arcSegs(c, x, y, r, w, a0, a1, n, frac, colorFn, off, gap = 0.3) {
    const lit = Math.round(clamp(frac, 0, 1) * n);
    const step = (a1 - a0) / n;
    c.save();
    c.lineWidth = w;
    for (let i = 0; i < n; i++) {
      const s = a0 + step * i + step * gap / 2, e = a0 + step * (i + 1) - step * gap / 2;
      c.beginPath();
      c.arc(x, y, r, Math.min(s, e), Math.max(s, e));
      c.strokeStyle = i < lit ? colorFn(i / n, i) : off;
      c.stroke();
    }
    c.restore();
  }
  function checkMessages(d) {
    const m = [];
    const L = d.lights;
    if (L.park && d.speed > 1) m.push('PARKING BRAKE ON');
    if (L.lowFuel) m.push('FUEL RESERVE');
    if (d.water > 112) m.push('COOLANT TEMPERATURE');
    if (L.oil && d.ignition > 0) m.push('STOP! OIL PRESSURE');
    if (L.check) m.push('ENGINE MALFUNCTION');
    if (L.tpms) m.push('TIRE PRESSURE LOW');
    if (d.damage > 2000) m.push('VEHICLE DAMAGED');
    if (d.fcw) m.push('COLLISION WARNING');
    if (L.esc && d.escMode === 'off') m.push('DSC DEACTIVATED');
    return m;
  }
  function gearRow(c, d, x, y, size, on, off, letters = ['P', 'R', 'N', 'D'], font = 'Barlow Condensed') {
    const cur = d.gear ? d.gear[0] : 'N';
    const gap = size * 0.95;
    let cx = x - (letters.length - 1) * gap / 2;
    for (const L of letters) {
      const lit = L === cur || (L === 'D' && /^[MS]/.test(cur));
      if (lit) glow(c, on, 10);
      text(c, L, cx, y, size, lit ? on : off, 'center', font, 700);
      noGlow(c);
      cx += gap;
    }
  }
  function navArrow(c, x, y, s, dir, col) {
    c.save();
    c.translate(x, y);
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = s * 0.14; c.lineCap = 'round'; c.lineJoin = 'round';
    if (dir === 'arrive') {
      c.beginPath(); c.arc(0, -s * 0.15, s * 0.3, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.2, s * 0.05); c.lineTo(0, s * 0.45); c.lineTo(s * 0.2, s * 0.05); c.fill();
    } else {
      const m = dir === 'left' ? -1 : 1;
      c.beginPath(); c.moveTo(0, s * 0.5); c.lineTo(0, -s * 0.05); c.quadraticCurveTo(0, -s * 0.3, m * s * 0.25, -s * 0.3); c.stroke();
      c.beginPath(); c.moveTo(m * s * 0.45, -s * 0.3); c.lineTo(m * s * 0.2, -s * 0.52); c.lineTo(m * s * 0.2, -s * 0.08); c.closePath(); c.fill();
    }
    c.restore();
  }
  // nav maneuver card; returns true when a route is active
  function navCard(c, d, x, y, w, h, o = {}) {
    const n = BD.navNext(d.route, d.pos);
    if (!n) return false;
    c.save();
    c.fillStyle = o.bg || 'rgba(10,14,22,.85)';
    rrect(c, x, y, w, h, h * 0.2); c.fill();
    navArrow(c, x + h * 0.55, y + h / 2, h * 0.7, n.dir, o.accent || '#5aa8ff');
    text(c, n.dir === 'arrive' ? 'Destination' : U.shortDist(n.dist), x + h * 1.1, y + h * 0.38, h * 0.36, o.color || '#fff', 'left', o.font || 'Rajdhani', 700);
    text(c, `${U.shortDist(n.total)} to go`, x + h * 1.1, y + h * 0.72, h * 0.22, o.dim || 'rgba(255,255,255,.6)', 'left', o.font || 'Rajdhani', 600);
    c.restore();
    return true;
  }
  function setSpeedChip(c, d, x, y, h, col, font = 'Rajdhani') {
    if (!d.cruise.on) return;
    const v = Math.round(U.speed(d.adas && d.adas.acc ? (d.adas.accSet || d.cruise.target) : d.cruise.target));
    icon(c, d.adas && d.adas.acc ? 'acc' : 'cruise', x, y, h * 0.8, col);
    text(c, String(v), x + h * 0.6, y + 2, h * 0.75, col, 'left', font, 700);
  }
  function limit(c, d, x, y, r) {
    if (!d.speedLimit || !(d.adas && d.adas.tsr !== false)) return;
    const v = Math.round(U.speed(d.speedLimit) / 5) * 5;
    G.limitSign(c, x, y, r, v, mph());
  }
  // surrounding traffic in perspective (2020s clusters)
  function surround(c, d, x, y, w, h, o = {}) {
    const me = MapView.me(d);
    // camera sits `back` m behind and `camH` m above the car; own car lands at ~80 % of the height
    const camH = 6, back = 12;
    const hz = y + h * 0.08, fy = h * 1.36, fx = w * 1.02;
    const cx = x + w / 2;
    const proj = (lon, lat, up = 0) => {
      const z = Math.max(0.5, lon + back);
      return [cx + fx * lat / z, hz + fy * (camH - up) / z];
    };
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    const grd = c.createLinearGradient(0, hz, 0, y + h);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, o.road || 'rgba(120,150,190,.10)');
    c.fillStyle = grd;
    const q = (lon0, lon1, l0, l1) => { const a = proj(lon0, l0), b = proj(lon0, l1), cc = proj(lon1, l1), dd = proj(lon1, l0); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(dd[0], dd[1]); c.closePath(); };
    q(-6, 160, -5.4, 5.4); c.fill();
    // lane lines (dashes scroll with odometer)
    const off = (d.odo || 0) % 12;
    for (const lat of [-5.4, -1.8, 1.8, 5.4]) {
      const solid = Math.abs(lat) > 5;
      c.fillStyle = solid ? (o.edgeLine || 'rgba(255,255,255,.45)') : (o.laneLine || 'rgba(255,255,255,.3)');
      if (solid) { q(-6, 160, lat - 0.08, lat + 0.08); c.fill(); continue; }
      for (let lon = -6 - off; lon < 160; lon += 12) { q(lon, lon + 5, lat - 0.08, lat + 0.08); c.fill(); }
    }
    // ACC gap / lead highlight
    if (d.adas && d.adas.acc && d.cruise.on) {
      const lon1 = d.lead ? d.lead.gap + 2.3 : 40;
      c.fillStyle = (o.accent || '#5aa8ff') + '33';
      q(2.3, lon1, -1.6, 1.6); c.fill();
    }
    // simple 3D car: rear face + roof, seen from behind and above
    const box = (lon, lat, hl, hw, col, top) => {
      const H = 1.35;
      const poly = (pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); };
      c.fillStyle = 'rgba(0,0,0,.35)';
      q(lon - hl, lon + hl, lat - hw * 1.1, lat + hw * 1.1); c.fill();
      c.fillStyle = col;
      poly([proj(lon - hl, lat - hw), proj(lon - hl, lat + hw), proj(lon - hl, lat + hw, H), proj(lon - hl, lat - hw, H)]);
      c.fillStyle = top;
      poly([proj(lon - hl, lat - hw * 0.92, H), proj(lon - hl, lat + hw * 0.92, H), proj(lon + hl * 0.7, lat + hw * 0.85, H), proj(lon + hl * 0.7, lat - hw * 0.85, H)]);
      c.fillStyle = 'rgba(0,0,0,.28)';
      poly([proj(lon - hl * 0.55, lat - hw * 0.8, H), proj(lon - hl * 0.55, lat + hw * 0.8, H), proj(lon + hl * 0.35, lat + hw * 0.75, H), proj(lon + hl * 0.35, lat - hw * 0.75, H)]);
      c.fillStyle = '#ff2a1f';
      const l0 = proj(lon - hl, lat - hw * 0.85, H * 0.7), l1 = proj(lon - hl, lat - hw * 0.45, H * 0.6);
      const r0 = proj(lon - hl, lat + hw * 0.45, H * 0.7), r1 = proj(lon - hl, lat + hw * 0.85, H * 0.6);
      c.fillRect(l0[0], l0[1], l1[0] - l0[0], Math.max(2, l1[1] - l0[1]));
      c.fillRect(r0[0], r0[1], r1[0] - r0[0], Math.max(2, r1[1] - r0[1]));
    };
    const cars = [];
    if (me) {
      const fx = me.hx, fy = me.hy, fl = Math.hypot(fx, fy) || 1;
      for (const v of d.vehicles || []) {
        if (v.me) continue;
        const rx = v.x - me.x, ry = v.y - me.y;
        const lon = (rx * fx + ry * fy) / fl, lat = (rx * fy - ry * fx) / fl;
        if (lon > -6 && lon < 150 && Math.abs(lat) < 9) cars.push({ lon, lat, id: v.id });
      }
    }
    cars.sort((a, b) => b.lon - a.lon);
    for (const v of cars) {
      const isLead = d.lead && d.lead.id === v.id;
      const bs = v.lon < 2.5 && Math.abs(v.lat) > 1.4 && ((v.lat < 0 && d.bsmL) || (v.lat > 0 && d.bsmR));
      let col = o.car || 'rgba(190,200,215,.55)', top = o.carTop || 'rgba(230,236,245,.85)';
      if (isLead) { col = d.fcw === 2 ? '#ff2a1f' : d.fcw === 1 ? '#ffb000' : (o.accent || '#5aa8ff'); top = col; }
      if (bs) { col = '#ffb000'; top = '#ffcc55'; }
      box(v.lon, v.lat, 2.25, 0.95, col, top);
    }
    box(0, 0, 2.3, 0.97, o.me || '#aab6c8', o.meTop || '#eef2f8');
    if (d.bsmL) { glow(c, '#ffb000', 14); icon(c, 'bsm', x + 40, y + h - 40, 44, '#ffb000'); noGlow(c); }
    if (d.bsmR) { glow(c, '#ffb000', 14); icon(c, 'bsm', x + w - 40, y + h - 40, 44, '#ffb000'); noGlow(c); }
    c.restore();
  }

  // =============================================================== 1970s
  reg({
    id: 'us70', glass: true, mfdTheme: { bg: 'rgba(12,12,12,.95)', accent: '#ff7a1a', font: 'Barlow Condensed' }, name: "Detroit '70", era: '1970s', region: 'US', inspired: 'American muscle (GM / Ford)',
    opts: [
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff7a1a' },
      { k: 'panel', label: 'Dash panel', type: 'select', options: ['brushed', 'wood', 'black'], def: 'brushed' },
      { k: 'face', label: 'Gauge face', type: 'color', def: '#161616' },
    ],
    draw(c, d, k) {
      const o = k.o;
      if (o.panel === 'wood') {
        const g = c.createLinearGradient(0, 0, 0, 600); g.addColorStop(0, '#5a3418'); g.addColorStop(0.5, '#3d220e'); g.addColorStop(1, '#2a1708');
        c.fillStyle = g; c.fillRect(0, 0, 1600, 600);
        c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2;
        for (let i = 0; i < 40; i++) { c.beginPath(); c.moveTo(0, i * 16); c.bezierCurveTo(500, i * 16 + 20 * Math.sin(i), 1100, i * 16 - 18 * Math.cos(i), 1600, i * 16 + 6); c.stroke(); }
      } else {
        c.fillStyle = o.panel === 'black' ? '#0c0c0c' : '#262626'; c.fillRect(0, 0, 1600, 600);
        if (o.panel === 'brushed') { for (let i = 0; i < 600; i += 3) { c.fillStyle = `rgba(255,255,255,${0.02 + 0.03 * Math.abs(Math.sin(i * 1.7))})`; c.fillRect(0, i, 1600, 1); } }
      }
      const pods = [[360, 300, 205], [800, 300, 238], [1240, 300, 205]];
      for (const [x, y, r] of pods) {
        c.beginPath(); c.arc(x, y + 8, r + 26, 0, TAU); c.fillStyle = 'rgba(0,0,0,.55)'; c.fill();
        chrome(c, x, y, r, 14);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, o.face); c.fill();
      }
      // tach
      let [x, y, r] = pods[0];
      const km = kmax(d);
      let ang = dial(c, { x, y, r: r * 0.96, min: 0, max: km, major: 1, minor: 0.25, mid: 0.5, tickColor: '#eee', labelColor: '#f4f4f4', labelSize: r * 0.17, labelR: 0.68, weight: 700, red: { from: d.redFrom / 1000, color: '#d61f1f', r: 0.9, w: 0.09 }, labelColorFn: (v) => (v >= d.redFrom / 1000 ? '#ff4a3a' : null) });
      text(c, 'RPM', x, y + r * 0.34, r * 0.1, '#bbb', 'center', 'Barlow Condensed', 700);
      text(c, 'x1000', x, y + r * 0.46, r * 0.08, '#999');
      needle(c, x, y, ang(d.rpm / 1000), { len: r * 0.86, color: o.needle, w: r * 0.032, cap: r * 0.12, capColor: '#111', capRim: '#888' });
      // speedo
      [x, y, r] = pods[1];
      const [smax, smaj, smin] = sScale([240, 20, 10], [140, 20, 5]);
      ang = dial(c, { x, y, r: r * 0.96, min: 0, max: smax, major: smaj, minor: smin, mid: smaj / 2, tickColor: '#eee', labelColor: '#f4f4f4', labelSize: r * 0.13, labelR: 0.7, weight: 700 });
      text(c, mph() ? 'MPH' : 'KM/H', x, y - r * 0.32, r * 0.09, '#bbb', 'center', 'Barlow Condensed', 700);
      drum(c, x, y + r * 0.42, U.dist(d.odo) % 1e5, 5, r * 0.11, { lastRed: true });
      needle(c, x, y, ang(spd(d)), { len: r * 0.88, color: o.needle, w: r * 0.028, cap: r * 0.12, capColor: '#111', capRim: '#888' });
      // combination pod
      [x, y, r] = pods[2];
      const m = (dx, dy, frac, lo, hi, name, opt = {}) => mini(c, x + dx * r, y + dy * r, r * 0.33, frac, { lo, hi, name, needle: o.needle, tick: '#ddd', label: '#ddd', font: 'Barlow Condensed', ...opt });
      m(-0.43, -0.3, fuelFrac(d), 'E', 'F', 'FUEL', { redStart: true });
      m(0.43, -0.3, waterFrac(d), 'C', 'H', 'TEMP', { redEnd: true });
      m(-0.43, 0.42, oilP(d) / 80, '0', '80', 'OIL');
      m(0.43, 0.42, (volts(d) - 10) / 6, '10', '16', 'VOLTS');
      // lamps
      const lamp = (lx, ly, label, on, col) => {
        c.fillStyle = on ? col : 'rgba(40,10,10,.9)';
        if (on) glow(c, col, 16);
        rrect(c, lx - 46, ly - 15, 92, 30, 4); c.fill(); noGlow(c);
        text(c, label, lx, ly + 1, 19, on ? '#fff' : 'rgba(255,255,255,.18)', 'center', 'Barlow Condensed', 700);
      };
      const L = d.lights;
      lamp(560, 565, 'BRAKE', L.park, '#d61f1f'); lamp(680, 565, 'OIL', L.oil && d.ignition > 0, '#d61f1f');
      lamp(800, 565, 'GEN', L.battery && d.ignition > 0, '#d61f1f'); lamp(920, 565, 'TEMP', d.water > 115, '#d61f1f');
      lamp(1040, 565, 'HI BEAM', L.high, '#1f5fd6');
      if (d.cruise.on) lamp(1160, 565, 'CRUISE', true, '#1d9b3c');
      if (L.sigL) { glow(c, LIGHT.green, 14); icon(c, 'sigL', 580, 50, 50, LIGHT.green); noGlow(c); }
      if (L.sigR) { glow(c, LIGHT.green, 14); icon(c, 'sigR', 1020, 50, 50, LIGHT.green); noGlow(c); }
    },
  });

  reg({
    id: 'eu72', glass: true, mfdTheme: { bg: 'rgba(6,6,6,.95)', accent: '#ff6a1a', font: 'Barlow Condensed' }, name: "Bavaria '72", era: '1970s', region: 'Euro', inspired: 'BMW 2002-era German sedan',
    opts: [
      { k: 'needle', label: 'Needle', type: 'color', def: '#f2f2f2' },
      { k: 'tip', label: 'Needle tip', type: 'color', def: '#ff6a1a' },
      { k: 'numbers', label: 'Numerals', type: 'color', def: '#f0f0f0' },
    ],
    draw(c, d, k) {
      const o = k.o;
      c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, 1600, 600);
      const hood = c.createLinearGradient(0, 0, 0, 120); hood.addColorStop(0, '#202020'); hood.addColorStop(1, 'rgba(10,10,10,0)');
      c.fillStyle = hood; c.fillRect(0, 0, 1600, 120);
      const nd = (x, y, a, len) => {
        needle(c, x, y, a, { len, color: o.needle, w: len * 0.022, style: 'bar', tail: len * 0.15 });
        needle(c, x, y, a, { len, color: o.tip, w: len * 0.03, style: 'pointer', start: len * 0.72, cap: len * 0.07, capColor: '#151515', capRim: '#555' });
      };
      // speedo
      let x = 450, y = 310, r = 235;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#040404'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#8c8c8c'; c.stroke();
      const [smax, smaj, smin] = sScale([220, 20, 10], [140, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.97, min: 0, max: smax, major: smaj, minor: smin, tickColor: o.numbers, labelColor: o.numbers, labelSize: r * 0.12, labelR: 0.74, weight: 500, majorW: 3, minorW: 1.5 });
      text(c, mph() ? 'MPH' : 'km/h', x, y - r * 0.3, r * 0.08, '#aaa', 'center', 'Barlow Condensed', 500);
      drum(c, x, y + r * 0.38, U.dist(d.odo) % 1e6, 6, r * 0.1, { lastRed: false });
      drum(c, x, y + r * 0.56, (U.dist(d.trip) * 10) % 1e4, 4, r * 0.07);
      nd(x, y, ang(spd(d)), r * 0.9);
      // tach
      x = 1150;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#040404'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#8c8c8c'; c.stroke();
      ang = dial(c, { x, y, r: r * 0.97, min: 0, max: kmax(d), major: 1, minor: 0.5, tickColor: o.numbers, labelColor: o.numbers, labelSize: r * 0.15, labelR: 0.72, weight: 500, majorW: 3, minorW: 1.5, red: { from: d.redFrom / 1000, r: 0.9, w: 0.06, color: '#c81e1e' }, tickColorFn: (v) => (v >= d.redFrom / 1000 ? '#ff3a2a' : null) });
      text(c, 'x 1000 U/min', x, y + r * 0.36, r * 0.08, '#aaa', 'center', 'Barlow Condensed', 500);
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      // centre combination gauge: fuel left, temp right
      x = 800; y = 340; r = 120;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#040404'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#8c8c8c'; c.stroke();
      mini(c, x, y, r * 0.86, fuelFrac(d), { a0: 0.68 * PI, a1: 1.32 * PI, lo: '0', hi: '1/1', tick: o.numbers, label: o.numbers, needle: o.tip, redStart: true, size: 20, labelR: 0.75 });
      mini(c, x, y, r * 0.86, waterFrac(d), { a0: 0.32 * PI, a1: -0.32 * PI, lo: '40', hi: '120', tick: o.numbers, label: o.numbers, needle: o.tip, redEnd: true, size: 18, labelR: 0.75 });
      icon(c, 'fuel', x - 38, y + 4, 28, '#999'); icon(c, 'temp', x + 38, y + 4, 28, '#999');
      // clock with in-game time
      const cy = 120, cr = 58;
      c.beginPath(); c.arc(x, cy, cr, 0, TAU); c.fillStyle = '#040404'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#8c8c8c'; c.stroke();
      dial(c, { x, y: cy, r: cr * 0.95, min: 0, max: 12, a0: -PI / 2, a1: 1.5 * PI, major: 1, minor: 1, labels: false, tickColor: o.numbers, majorLen: 0.16 });
      const hm = BD.clock(d.tod).split(':').map(Number);
      needle(c, x, cy, -PI / 2 + ((hm[0] % 12) + hm[1] / 60) / 12 * TAU, { len: cr * 0.5, w: 4, style: 'bar', color: o.needle });
      needle(c, x, cy, -PI / 2 + hm[1] / 60 * TAU, { len: cr * 0.8, w: 3, style: 'bar', color: o.needle, cap: 5, capColor: '#333' });
      // lens lamps
      const L = d.lights;
      const lamps = [['sigL', L.sigL, LIGHT.green], ['high', L.high, LIGHT.blue], ['oil', L.oil && d.ignition > 0, LIGHT.red], ['battery', L.battery && d.ignition > 0, LIGHT.red], ['park', L.park, LIGHT.red], ['fuel', L.lowFuel, LIGHT.amber], ['sigR', L.sigR, LIGHT.green]];
      lamps.forEach(([n, on, col], i) => {
        const lx = 620 + i * 60, ly = 530;
        c.beginPath(); c.arc(lx, ly, 22, 0, TAU);
        c.fillStyle = on ? col : 'rgba(255,255,255,.05)';
        if (on) glow(c, col, 18);
        c.fill(); noGlow(c);
        c.lineWidth = 2; c.strokeStyle = '#555'; c.stroke();
        icon(c, n, lx, ly, 24, on ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.12)');
      });
    },
  });

  // =============================================================== 1980s
  reg({
    id: 'bav86', glass: true, mfdTheme: { bg: 'rgba(8,5,2,.95)', accent: '#ff6a1f', fg: '#ffd2b0', dim: 'rgba(255,150,90,.65)', line: 'rgba(255,106,31,.2)', font: 'Barlow Condensed' }, name: "Bavaria '86", era: '1980s', region: 'Euro', inspired: 'BMW E30 3-Series',
    opts: [
      { k: 'illum', label: 'Illumination', type: 'color', def: '#ff6a1f' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff4d0a' },
      { k: 'si', label: 'Service LEDs', type: 'bool', def: true },
    ],
    draw(c, d, k) {
      const o = k.o, il = o.illum;
      c.fillStyle = '#000'; c.fillRect(0, 0, 1600, 600);
      c.fillStyle = '#0d0d0d'; rrect(c, 20, 20, 1560, 560, 60); c.fill();
      c.strokeStyle = '#1e1e1e'; c.lineWidth = 3; c.stroke();
      const face = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#141414'); c.fill(); c.lineWidth = 3; c.strokeStyle = '#262626'; c.stroke(); };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: len * 0.026, tail: len * 0.2, glow: o.needle, glowBlur: 6, cap: len * 0.1, capColor: '#0a0a0a', capRim: '#2a2a2a' });
      // speedometer
      let x = 420, y = 310, r = 258;
      face(x, y, r);
      const [smax, smaj, smin] = sScale([240, 20, 10], [140, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.97, min: 0, max: smax, major: smaj, minor: smin, a0: 0.72 * PI, a1: 2.28 * PI, tickColor: '#e8e8e8', labelColor: il, labelGlow: il, labelSize: r * 0.125, labelR: 0.73, weight: 600, majorW: 4, minorW: 2 });
      text(c, mph() ? 'MPH' : 'km/h', x, y - r * 0.34, r * 0.075, '#bbb');
      // odo + trip window
      c.fillStyle = '#050505'; rrect(c, x - 82, y + r * 0.22, 164, 40, 4); c.fill();
      text(c, odoStr(d), x, y + r * 0.22 + 21, 32, '#eee', 'center', 'Barlow Condensed', 600);
      text(c, tripStr(d), x - 30, y + r * 0.42, 22, '#bbb', 'center', 'Barlow Condensed', 600);
      text(c, U.distLabel(), x + 40, y + r * 0.42, 18, '#888');
      // fuel gauge (bottom of speedo)
      mini(c, x, y + r * 0.7, 62, fuelFrac(d), { a0: 1.18 * PI, a1: 1.82 * PI, lo: 'R', hi: '1/1', loColor: '#ff3a2a', tick: '#ddd', label: il, labelGlow: il, needle: o.needle, size: 18, redStart: true, ticks: 4 });
      icon(c, 'fuel', x, y + r * 0.7 - 18, 20, '#888');
      nd(x, y, ang(spd(d)), r * 0.9);
      // tachometer
      x = 1180;
      face(x, y, r);
      const km = kmax(d);
      ang = dial(c, { x, y, r: r * 0.97, min: 0, max: km, major: 1, minor: 0.5, a0: 0.72 * PI, a1: 2.28 * PI, tickColor: '#e8e8e8', labelColor: il, labelGlow: il, labelSize: r * 0.15, labelR: 0.72, weight: 600, majorW: 4, minorW: 2, red: { from: d.redFrom / 1000, r: 0.9, w: 0.1, color: '#e03010' }, label: (v) => (v === 0 ? null : String(v)) });
      text(c, '1/min x 1000', x, y + r * 0.2, r * 0.065, '#999');
      // econometer (upper inner)
      const ec = econ(d);
      mini(c, x, y - r * 0.15, 70, ec / 30, { a0: 1.2 * PI, a1: 1.8 * PI, lo: mph() ? '∞' : '0', hi: mph() ? '8' : '30', tick: '#ddd', label: il, labelGlow: il, needle: o.needle, size: 16, ticks: 6 });
      text(c, U.consLabel(), x, y - r * 0.15 + 10, 14, '#888');
      // temperature (bottom of tach)
      mini(c, x, y + r * 0.7, 62, waterFrac(d), { a0: 1.18 * PI, a1: 1.82 * PI, lo: 'C', hi: 'H', hiColor: '#ff3a2a', tick: '#ddd', label: il, labelGlow: il, needle: o.needle, size: 18, redEnd: true });
      icon(c, 'temp', x, y + r * 0.7 - 18, 20, '#888');
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      // centre: service interval LEDs, tell-tales, gear indicator, clock
      if (o.si) {
        const used = (U.dist(d.odo) % 15000) / 15000;
        const greens = 5 - Math.floor(used * 5);
        for (let i = 0; i < 7; i++) {
          const col = i < 5 ? (i < greens ? '#22e04a' : '#0f2a14') : i === 5 ? (greens <= 0 ? '#ffc400' : '#2a2400') : '#2a0a0a';
          c.beginPath(); c.arc(722 + i * 26, 70, 8, 0, TAU); c.fillStyle = col;
          if (col === '#22e04a' || col === '#ffc400') glow(c, col, 8);
          c.fill(); noGlow(c);
        }
      }
      const tt = G.tellTales(d).filter(([n]) => n !== 'cruise');
      const grid = [['sigL', 'sigR'], ['high', 'park'], ['oil', 'battery'], ['check', 'abs'], ['fuel', 'temp']];
      grid.forEach((row, ri) => row.forEach((n, ci) => {
        const t = tt.find((e) => e[0] === n || (n === 'abs' && e[0] === 'abs'));
        if (!t) return;
        const lx = 762 + ci * 76, ly = 125 + ri * 62;
        if (t[1]) { glow(c, t[2], 12); icon(c, n, lx, ly, 42, t[2]); noGlow(c); }
        else icon(c, n, lx, ly, 42, 'rgba(255,255,255,.06)');
      }));
      if (/^[PRND]/.test(d.gear)) gearRow(c, d, 800, 470, 30, il, 'rgba(255,255,255,.12)', ['P', 'R', 'N', 'D', '3', '2', '1']);
      else text(c, d.gear, 800, 470, 60, il, 'center', 'Barlow Condensed', 700);
      seg7(c, BD.clock(d.tod), 800, 535, 34, il, 'rgba(255,106,31,.07)', { glow: il, glowBlur: 6 });
    },
  });

  reg({
    id: 'us84', mfdTheme: { bg: 'rgba(3,10,5,.96)', accent: '#4cff6a', fg: '#ffb52e', dim: 'rgba(76,255,106,.6)', line: 'rgba(76,255,106,.15)', font: 'Orbitron' }, name: "Digital '84", era: '1980s', region: 'US', inspired: 'Corvette C4 liquid-crystal dash',
    opts: [
      { k: 'palette', label: 'LCD colours', type: 'select', options: ['classic', 'blue', 'red'], def: 'classic' },
    ],
    draw(c, d, k) {
      const pal = { classic: ['#4cff6a', '#ffe23b', '#ff3a1a', '#ffb52e'], blue: ['#3ad8ff', '#7d9bff', '#ff3a6a', '#7fd8ff'], red: ['#ff6a3a', '#ff9a3a', '#ff1a1a', '#ff7a4a'] }[k.o.palette] || [];
      const [cg, cy, cr, ca] = pal;
      const off = 'rgba(255,255,255,.045)';
      c.fillStyle = '#020302'; c.fillRect(0, 0, 1600, 600);
      const panel = (x, y, w, h) => {
        const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#08130c'); g.addColorStop(1, '#030604');
        c.fillStyle = g; rrect(c, x, y, w, h, 18); c.fill();
        c.strokeStyle = '#1a2a1e'; c.lineWidth = 3; c.stroke();
      };
      panel(30, 30, 640, 540); panel(690, 30, 220, 540); panel(930, 30, 640, 540);
      // speedometer: arc bar + digits
      const [smax] = sScale([300], [180]);
      arcSegs(c, 350, 480, 290, 40, 1.1 * PI, 1.9 * PI, 40, spd(d) / smax, (f) => (f < 0.7 ? cg : f < 0.85 ? cy : cr), off, 0.28);
      for (let v = 0; v <= smax; v += mph() ? 20 : 50) {
        const a = 1.1 * PI + 0.8 * PI * v / smax;
        text(c, String(v), 350 + Math.cos(a) * 238, 480 + Math.sin(a) * 238, 20, ca, 'center', 'Orbitron', 500);
      }
      seg7(c, String(Math.round(spd(d))).padStart(3, ' '), 350, 345, 120, ca, off, { glow: ca, glowBlur: 8 });
      text(c, mph() ? 'MPH' : 'KM/H', 350, 440, 24, ca, 'center', 'Orbitron', 700);
      seg7(c, odoStr(d), 230, 520, 30, ca, off); text(c, 'ODO', 100, 520, 18, ca, 'center', 'Orbitron', 600);
      seg7(c, tripStr(d), 520, 520, 30, ca, off); text(c, 'TRIP', 610, 520, 16, ca, 'center', 'Orbitron', 600);
      // tachometer
      const km = kmax(d);
      arcSegs(c, 1250, 480, 290, 40, 1.1 * PI, 1.9 * PI, 44, d.rpm / d.tachMax, (f) => (f * d.tachMax < d.redFrom * 0.85 ? cy : f * d.tachMax < d.redFrom ? ca : cr), off, 0.28);
      for (let v = 0; v <= km; v++) {
        const a = 1.1 * PI + 0.8 * PI * v / km;
        text(c, String(v * 10), 1250 + Math.cos(a) * 238, 480 + Math.sin(a) * 238, 20, ca, 'center', 'Orbitron', 500);
      }
      seg7(c, String(Math.round(d.rpm / 10) * 10).padStart(4, ' '), 1250, 345, 84, cy, off, { glow: cy, glowBlur: 6 });
      text(c, 'RPM  (scale x100)', 1250, 420, 18, ca, 'center', 'Orbitron', 700);
      seg7(c, gearMain(d), 1250, 500, 56, cg, off, { glow: cg });
      // centre column: bar stacks
      const cols = [['OIL', oilP(d) / 80, Math.round(oilP(d))], ['OIL°', clamp((d.oilT - 40) / 110, 0, 1), Math.round(U.temp(d.oilT))], ['H2O', waterFrac(d), Math.round(tempC(d))], ['VOLT', (volts(d) - 9) / 7, volts(d).toFixed(1)]];
      cols.forEach(([n, f, v], i) => {
        const x = 712 + i * 50;
        segments(c, x, 70, 34, 260, 18, f, (ff) => (ff > 0.85 ? cr : ff > 0.65 ? cy : cg), off, 0.3, true);
        text(c, n, x + 17, 350, 15, ca, 'center', 'Orbitron', 600);
        text(c, String(v), x + 17, 378, 17, cg, 'center', 'Orbitron', 600);
      });
      segments(c, 712, 430, 176, 34, 16, fuelFrac(d), (f) => (f < 0.15 ? cr : cg), off, 0.3);
      text(c, 'FUEL', 800, 488, 20, ca, 'center', 'Orbitron', 700);
      text(c, `${U.dist(d.range || 0).toFixed(0)} ${U.distLabel()}`, 800, 520, 18, cg, 'center', 'Orbitron', 600);
      lightRow(c, d, 800, 553, 26, 4, { list: ['sigL', 'high', 'park', 'check', 'oil', 'cruise', 'sigR'] });
    },
  });

  // =============================================================== 1990s
  reg({
    id: 'bav95', glass: true, name: "Bavaria M '98", era: '1990s', region: 'Euro', inspired: 'BMW E36 / E46 M3',
    opts: [
      { k: 'illum', label: 'Illumination', type: 'color', def: '#ff7a2a' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff2414' },
      { k: 'warmup', label: 'Warm-up redline', type: 'bool', def: true },
    ],
    draw(c, d, k) {
      const o = k.o, il = o.illum;
      c.fillStyle = '#030303'; c.fillRect(0, 0, 1600, 600);
      const face = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 8, 0, TAU); c.fillStyle = '#222428'; c.fill();
        c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.fillStyle = '#5c5f66'; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#1c1e22'); c.fill();
      };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: len * 0.03, style: 'blade', tail: len * 0.18, glow: il, glowBlur: 10, cap: len * 0.11, capColor: '#111', capRim: '#333' });
      let x = 420, y = 300, r = 250;
      face(x, y, r);
      const [smax, smaj, smin] = sScale([280, 20, 10], [180, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.96, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#f2f2f2', labelColor: il, labelGlow: il, labelSize: r * 0.115, labelR: 0.74, majorW: 5, minorW: 2, label: (v) => ((v / smaj) % 2 === 0 || smax < 200 ? String(v) : null) });
      text(c, mph() ? 'MPH' : 'km/h', x, y - r * 0.32, 20, '#999');
      text(c, odoStr(d) + ' ' + U.distLabel(), x, y + r * 0.27, 26, il, 'center', 'Barlow Condensed', 600);
      text(c, tripStr(d), x, y + r * 0.4, 22, il, 'center', 'Barlow Condensed', 600);
      mini(c, x, y + r * 0.68, 60, fuelFrac(d), { a0: 1.2 * PI, a1: 1.8 * PI, lo: '0', hi: '1/1', loColor: '#ff3a2a', tick: '#eee', label: il, needle: o.needle, size: 16, redStart: true });
      nd(x, y, ang(spd(d)), r * 0.9);
      // tach with warm-up LEDs
      x = 1180;
      face(x, y, r);
      const km = kmax(d);
      ang = dial(c, { x, y, r: r * 0.96, min: 0, max: km, major: 1, minor: 0.5, tickColor: '#f2f2f2', labelColor: il, labelGlow: il, labelSize: r * 0.15, labelR: 0.72, majorW: 5, minorW: 2, tickColorFn: (v) => (v * 1000 >= d.redFrom ? '#ff2a1a' : null) });
      const oilT = d.oilT || 0;
      const warm = o.warmup ? (oilT < 50 ? d.redFrom - 3000 : oilT < 70 ? d.redFrom - 2000 : oilT < 85 ? d.redFrom - 1000 : d.redFrom) : d.redFrom;
      for (let v = Math.max(1000, warm); v <= d.tachMax; v += 250) {
        const a = ang(v / 1000);
        const col = v >= d.redFrom ? '#ff2010' : '#ffa000';
        glow(c, col, 8);
        c.beginPath(); c.arc(x + Math.cos(a) * r * 0.99, y + Math.sin(a) * r * 0.99, 5, 0, TAU); c.fillStyle = col; c.fill(); noGlow(c);
      }
      text(c, '1/min x 1000', x, y + r * 0.27, 16, '#999');
      // oil temp gauge
      mini(c, x, y + r * 0.68, 60, clamp((oilT - 50) / 100, 0, 1), { a0: 1.2 * PI, a1: 1.8 * PI, lo: mph() ? '120' : '50', hi: mph() ? '300' : '150', hiColor: '#ff3a2a', tick: '#eee', label: il, needle: o.needle, size: 15, redEnd: true });
      icon(c, 'oil', x, y + r * 0.68 - 16, 22, '#aaa');
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      // centre: gear, tell-tales
      glow(c, il, 12);
      text(c, gearMain(d), 800, 210, 110, il, 'center', 'Barlow Condensed', 600);
      noGlow(c);
      text(c, d.gear && d.gear[0] === 'D' ? 'D' : 'GEAR', 800, 280, 22, '#777');
      lightRow(c, d, 800, 70, 38, 10, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'sigR'] });
      lightRow(c, d, 800, 340, 34, 12, { list: ['oil', 'battery', 'check', 'fuel', 'cruise'] });
      // check control LCD
      c.fillStyle = '#0a0703'; rrect(c, 580, 470, 440, 70, 8); c.fill();
      c.strokeStyle = '#2a1a08'; c.lineWidth = 2; c.stroke();
      const msgs = checkMessages(d);
      const msg = msgs.length ? msgs[Math.floor(k.t / 3) % msgs.length] : `${BD.clock(d.tod)}    ${U.speed(d.speed) > 1 ? econ(d).toFixed(1) + ' L/100' : 'READY'}`;
      // dot-matrix look: draw text then a dot mask
      text(c, msg, 800, 506, 30, msgs.length ? '#ff9a3a' : il, 'center', 'Orbitron', 500);
      c.fillStyle = 'rgba(10,7,3,.55)';
      for (let yy = 476; yy < 540; yy += 4) c.fillRect(584, yy, 432, 1.4);
    },
  });

  reg({
    id: 'rally98', glass: true, mfdTheme: { bg: 'rgba(10,14,24,.95)', accent: '#2a6bff', font: 'Rajdhani' }, name: "Pleiades Rally '98", era: '1990s', region: 'Japan', inspired: 'Subaru Impreza WRX STI (GC8)',
    opts: [
      { k: 'face', label: 'Gauge face', type: 'select', options: ['white', 'silver', 'black'], def: 'white' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#e3121b' },
      { k: 'accent', label: 'Accent', type: 'color', def: '#2a6bff' },
    ],
    draw(c, d, k) {
      const o = k.o;
      const faceCol = { white: '#f2f1eb', silver: '#c9ccd1', black: '#111' }[o.face];
      const ink = o.face === 'black' ? '#f2f2f2' : '#111';
      c.fillStyle = '#0a0c10'; c.fillRect(0, 0, 1600, 600);
      c.strokeStyle = 'rgba(255,255,255,.03)'; c.lineWidth = 6;
      for (let i = -600; i < 1600; i += 14) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 600, 600); c.stroke(); }
      const face = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 14, 0, TAU); c.fillStyle = '#000'; c.fill();
        c.beginPath(); c.arc(x, y, r + 6, 0, TAU); c.fillStyle = accent(k, '#2a6bff'); c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU);
        const g = c.createRadialGradient(x, y - r * 0.3, 0, x, y, r); g.addColorStop(0, faceCol); g.addColorStop(1, o.face === 'black' ? '#000' : '#bdbcb4');
        c.fillStyle = g; c.fill();
      };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: len * 0.035, tail: len * 0.22, cap: len * 0.13, capColor: '#111', capRim: '#444' });
      // speedo
      let x = 300, y = 340, r = 200;
      face(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: ink, labelColor: ink, labelSize: r * 0.13, labelR: 0.72, weight: 700, font: 'Rajdhani', label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, mph() ? 'MPH' : 'km/h', x, y - r * 0.32, 18, ink, 'center', 'Rajdhani', 700);
      c.fillStyle = '#9aa38f'; rrect(c, x - 70, y + r * 0.3, 140, 54, 5); c.fill();
      text(c, odoStr(d), x, y + r * 0.3 + 17, 22, '#1a1f15', 'center', 'Orbitron', 600);
      text(c, 'TRIP ' + tripStr(d), x, y + r * 0.3 + 40, 16, '#1a1f15', 'center', 'Orbitron', 600);
      nd(x, y, ang(spd(d)), r * 0.88);
      // big centre tach
      x = 790; y = 300; r = 265;
      face(x, y, r);
      const km = Math.max(9, kmax(d));
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: km, major: 1, minor: 0.2, mid: 0.5, tickColor: ink, labelColor: ink, labelSize: r * 0.16, labelR: 0.7, weight: 700, font: 'Rajdhani', red: { from: d.redFrom / 1000, color: '#e3121b', r: 0.88, w: 0.1 } });
      text(c, 'x1000r/min', x, y - r * 0.3, 18, ink, 'center', 'Rajdhani', 700);
      const shift = d.rpm > d.shiftRpm;
      c.beginPath(); c.arc(x, y - r * 0.5, 14, 0, TAU);
      if (shift && Math.floor(k.t * 10) % 2) { glow(c, '#ff1a1a', 24); c.fillStyle = '#ff1a1a'; } else c.fillStyle = '#5a1010';
      c.fill(); noGlow(c);
      c.fillStyle = '#9aa38f'; rrect(c, x - 40, y + r * 0.32, 80, 64, 5); c.fill();
      seg7(c, gearMain(d).slice(0, 2), x, y + r * 0.32 + 32, 44, '#1a1f15', 'rgba(0,0,0,.06)');
      nd(x, y, ang(d.rpm / 1000), r * 0.88);
      // boost gauge with fuel / temp
      x = 1300; y = 340; r = 200;
      face(x, y, r);
      const bar2 = BD.settings.pressUnit === 'bar' || BD.settings.pressUnit === 'kpa';
      const bmin = bar2 ? -1 : -15, bmax = bar2 ? 1.5 : 22;
      ang = dial(c, { x, y, r: r * 0.95, min: bmin, max: bmax, major: bar2 ? 0.5 : 5, minor: bar2 ? 0.1 : 1, a0: 0.8 * PI, a1: 2.0 * PI, tickColor: ink, labelColor: ink, labelSize: r * 0.13, labelR: 0.72, weight: 700, font: 'Rajdhani', label: (v) => (bar2 ? v.toFixed(1) : String(v)), labelColorFn: (v) => (v > 0 ? accent(k, '#2a6bff') : null) });
      text(c, 'TURBO', x, y - r * 0.34, 22, accent(k, '#2a6bff'), 'center', 'Rajdhani', 700);
      text(c, (bar2 ? 'bar' : 'psi'), x, y - r * 0.2, 16, ink, 'center', 'Rajdhani', 600);
      const bv = BD.settings.pressUnit === 'kpa' ? U.boost(d.boost) / 100 : U.boost(d.boost);
      mini(c, x - 62, y + r * 0.5, 46, fuelFrac(d), { lo: 'E', hi: 'F', tick: ink, label: ink, needle: o.needle, size: 14, redStart: true, font: 'Rajdhani' });
      mini(c, x + 62, y + r * 0.5, 46, waterFrac(d), { lo: 'C', hi: 'H', tick: ink, label: ink, needle: o.needle, size: 14, redEnd: true, font: 'Rajdhani' });
      nd(x, y, ang(bv), r * 0.88);
      lightRow(c, d, 800, 575, 30, 8, { list: ['sigL', 'high', 'park', 'abs', 'check', 'oil', 'battery', 'fuel', 'cruise', 'sigR'] });
    },
  });

  // =============================================================== 2000s
  reg({
    id: 'optitron04', mfdTheme: { bg: 'rgba(0,0,0,.95)', accent: '#ff2a2a', font: 'Rajdhani' }, name: "Optitron '04", era: '2000s', region: 'Japan', inspired: 'Electroluminescent clusters (Lexus / STI 2004)',
    opts: [
      { k: 'accent', label: 'Glow colour', type: 'color', def: '#ff2a2a' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff3a1a' },
    ],
    draw(c, d, k) {
      const a = accent(k, '#ff2a2a');
      c.fillStyle = '#000'; c.fillRect(0, 0, 1600, 600);
      const ring = (x, y, r) => {
        glow(c, a, 22);
        c.beginPath(); c.arc(x, y, r, 0.72 * PI, 2.28 * PI); c.lineWidth = 6; c.strokeStyle = a; c.stroke();
        noGlow(c);
        const g = c.createRadialGradient(x, y, r * 0.6, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, a + '22');
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
      };
      const nd = (x, y, an, len) => needle(c, x, y, an, { len, color: k.o.needle, w: len * 0.03, style: 'pointer', start: len * 0.25, glow: k.o.needle, glowBlur: 18, cap: len * 0.12, capColor: '#050505' });
      // speedo left
      let x = 320, y = 330, r = 215;
      ring(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, a0: 0.72 * PI, a1: 2.28 * PI, tickColor: '#fff', tickGlow: '#fff', labelColor: '#fff', labelGlow: '#ffffff', labelSize: r * 0.12, labelR: 0.72, font: 'Rajdhani', weight: 600, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, U.speedLabel(), x, y + r * 0.35, 20, a, 'center', 'Rajdhani', 700);
      nd(x, y, ang(spd(d)), r * 0.9);
      // centre tach with digital speed
      x = 800; y = 300; r = 272;
      ring(x, y, r);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.25, a0: 0.72 * PI, a1: 2.28 * PI, tickColor: '#fff', tickGlow: '#fff', labelColor: '#fff', labelGlow: '#fff', labelSize: r * 0.15, labelR: 0.72, font: 'Rajdhani', weight: 600, red: { from: d.redFrom / 1000, r: 0.97, w: 0.05, color: '#ff1010' } });
      glow(c, '#fff', 16);
      text(c, String(Math.round(spd(d))), x, y + r * 0.3, 92, '#fff', 'center', 'Rajdhani', 600);
      noGlow(c);
      text(c, U.speedLabel(), x, y + r * 0.48, 22, a, 'center', 'Rajdhani', 700);
      glow(c, a, 14);
      text(c, d.gear, x, y - r * 0.32, 54, a, 'center', 'Rajdhani', 700);
      noGlow(c);
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      // right: fuel + temp glowing segment arcs, info
      x = 1280; y = 330; r = 215;
      ring(x, y, r);
      arcSegs(c, x, y, r * 0.82, 24, 1.1 * PI, 1.9 * PI, 14, fuelFrac(d), (f) => (f < 0.15 ? '#ffb000' : '#fff'), 'rgba(255,255,255,.06)');
      arcSegs(c, x, y, r * 0.82, 24, 0.9 * PI, 0.1 * PI, 14, waterFrac(d), (f) => (f > 0.82 ? '#ff2a1a' : '#fff'), 'rgba(255,255,255,.06)');
      icon(c, 'fuel', x, y - r * 0.55, 34, a); icon(c, 'temp', x, y + r * 0.55, 34, a);
      text(c, 'E', x - r * 0.68, y - r * 0.18, 20, a, 'center', 'Rajdhani', 700); text(c, 'F', x + r * 0.68, y - r * 0.18, 20, a, 'center', 'Rajdhani', 700);
      text(c, odoStr(d) + ' ' + U.distLabel(), x, y - 22, 26, '#fff', 'center', 'Rajdhani', 600);
      text(c, 'TRIP ' + tripStr(d), x, y + 10, 22, '#ccc', 'center', 'Rajdhani', 600);
      text(c, 'RANGE ' + rangeStr(d), x, y + 40, 20, '#ccc', 'center', 'Rajdhani', 600);
      lightRow(c, d, 800, 575, 30, 10, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'cruise', 'sigR'] });
    },
  });

  reg({
    id: 'bav06', glass: true, mfdTheme: { bg: 'rgba(6,4,2,.95)', accent: '#ff6e1f', fg: '#ffd9bf', dim: 'rgba(255,140,80,.65)', line: 'rgba(255,110,31,.2)', font: 'Rajdhani' }, name: "Bavaria '06", era: '2000s', region: 'Euro', inspired: 'BMW E90 3-Series',
    opts: [
      { k: 'illum', label: 'Illumination', type: 'color', def: '#ff6e1f' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff3a0e' },
    ],
    draw(c, d, k) {
      const o = k.o, il = o.illum;
      c.fillStyle = '#000'; c.fillRect(0, 0, 1600, 600);
      const face = (x, y, r) => {
        chrome(c, x, y, r, 5);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#121212'); c.fill();
      };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: 6, style: 'bar', tail: len * 0.16, glow: il, glowBlur: 12, cap: 24, capColor: '#0b0b0b', capRim: '#777' });
      const lcd = (x, y, w, h, l1, l2) => {
        c.fillStyle = '#050302'; rrect(c, x - w / 2, y - h / 2, w, h, 6); c.fill();
        c.strokeStyle = '#2b1a0e'; c.lineWidth = 2; c.stroke();
        text(c, l1, x, y - h * 0.2, h * 0.34, il, 'center', 'Rajdhani', 600);
        text(c, l2, x, y + h * 0.24, h * 0.3, il, 'center', 'Rajdhani', 600);
      };
      let x = 430, y = 295, r = 248;
      face(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 10, 5]);
      let ang = dial(c, { x, y, r: r * 0.96, min: 0, max: smax, major: smaj, minor: smin, tickColor: il, labelColor: il, labelGlow: il, labelSize: r * 0.12, labelR: 0.75, majorW: 4, minorW: 2, tickGlow: il, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      // cruise set-speed marker
      if (d.cruise.on) {
        const tv = U.speed(d.adas && d.adas.acc ? d.adas.accSet || d.cruise.target : d.cruise.target);
        const a = ang(tv);
        glow(c, '#ff9a2a', 12); c.fillStyle = '#ff9a2a';
        c.save(); c.translate(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2)); c.rotate(a);
        c.beginPath(); c.moveTo(-12, 0); c.lineTo(10, -11); c.lineTo(10, 11); c.closePath(); c.fill(); c.restore(); noGlow(c);
      }
      if (d.speedLimit && d.adas.tsr !== false) {
        const a = ang(U.speed(d.speedLimit));
        c.strokeStyle = '#fff'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.99, y + Math.sin(a) * r * 0.99); c.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); c.stroke();
      }
      text(c, U.speedLabel(), x, y - r * 0.3, 20, '#888');
      lcd(x, y + r * 0.42, 210, 62, `${BD.clock(d.tod)}     ${odoStr(d)} ${U.distLabel()}`, `TRIP ${tripStr(d)}`);
      mini(c, x, y + r * 0.82, 50, fuelFrac(d), { a0: 1.25 * PI, a1: 1.75 * PI, tick: il, needle: o.needle, ticks: 4, redStart: true });
      icon(c, 'fuel', x, y + r * 0.84, 16, il);
      nd(x, y, ang(spd(d)), r * 0.92);
      x = 1170;
      face(x, y, r);
      ang = dial(c, { x, y, r: r * 0.96, min: 0, max: kmax(d), major: 1, minor: 0.5, tickColor: il, labelColor: il, labelGlow: il, labelSize: r * 0.15, labelR: 0.74, majorW: 4, minorW: 2, tickGlow: il, red: { from: d.redFrom / 1000, r: 0.92, w: 0.08, color: '#d9230f' } });
      text(c, '1/min x 1000', x, y - r * 0.3, 18, '#888');
      lcd(x, y + r * 0.42, 210, 62, `${d.gear}     ${rangeStr(d)}`, d.cruise.on ? `CRUISE ${Math.round(U.speed(d.cruise.target))}` : `${U.temp(d.oilT).toFixed(0)}${U.tempLabel()} OIL`);
      mini(c, x, y + r * 0.82, 50, clamp(econ(d) / 30, 0, 1), { a0: 1.25 * PI, a1: 1.75 * PI, tick: il, needle: o.needle, ticks: 6 });
      text(c, U.consLabel(), x, y + r * 0.84, 12, il);
      nd(x, y, ang(d.rpm / 1000), r * 0.92);
      // centre column tell-tales
      const col = ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'temp', 'sigR'];
      const tt = G.tellTales(d);
      col.forEach((n, i) => {
        const t = tt.find((e) => e[0] === n || (n === 'esc' && e[0] === 'escOff'));
        const lx = 800 + (i % 2 ? 32 : -32), ly = 70 + Math.floor(i / 2) * 82;
        if (t && t[1]) { glow(c, t[2], 12); icon(c, t[0], lx, ly, 40, t[2]); noGlow(c); } else icon(c, n, lx, ly, 40, 'rgba(255,255,255,.05)');
      });
    },
  });

  reg({
    id: 'pony05', glass: true, mfdTheme: { bg: 'rgba(8,10,14,.95)', accent: '#3fa9ff', font: 'Bebas Neue' }, name: "Retro Pony '05", era: '2000s', region: 'US', inspired: 'Ford Mustang S197 (colour-selectable)',
    opts: [
      { k: 'accent', label: 'Backlight colour', type: 'color', def: '#3fa9ff' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff3b1f' },
      { k: 'ring', label: 'Rings', type: 'select', options: ['chrome', 'black'], def: 'chrome' },
    ],
    draw(c, d, k) {
      const a = accent(k, '#3fa9ff'), o = k.o;
      c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, 1600, 600);
      const pod = (x, y, r) => {
        const g = c.createRadialGradient(x, y - 40, r * 0.8, x, y, r * 1.25); g.addColorStop(0, '#000'); g.addColorStop(1, '#1d1d1d');
        c.beginPath(); c.arc(x, y, r * 1.18, 0, TAU); c.fillStyle = g; c.fill();
        if (o.ring === 'chrome') chrome(c, x, y, r, 12); else { c.beginPath(); c.arc(x, y, r + 10, 0, TAU); c.fillStyle = '#222'; c.fill(); }
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#151515'); c.fill();
        // turned-aluminium inner ring
        const al = c.createConicGradient ? c.createConicGradient(0, x, y) : null;
        if (al) { [0, 0.25, 0.5, 0.75, 1].forEach((s, i) => al.addColorStop(s, i % 2 ? '#3a3a3a' : '#5a5a5a')); c.beginPath(); c.arc(x, y, r * 0.42, 0, TAU); c.fillStyle = al; c.fill(); c.beginPath(); c.arc(x, y, r * 0.38, 0, TAU); c.fillStyle = '#0d0d0d'; c.fill(); }
      };
      const nd = (x, y, an, len) => needle(c, x, y, an, { len, color: o.needle, w: len * 0.035, style: 'pointer', start: len * 0.4, glow: o.needle, glowBlur: 8 });
      let x = 430, y = 320, r = 232;
      pod(x, y, r);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.25, tickColor: a, tickGlow: a, labelColor: '#fff', labelGlow: a, labelSize: r * 0.18, labelR: 0.68, font: 'Bebas Neue', weight: 400, red: { from: d.redFrom / 1000, r: 0.9, w: 0.06 } });
      text(c, 'RPM x1000', x, y + r * 0.28, 22, a, 'center', 'Bebas Neue', 400);
      glow(c, a, 10); text(c, d.gear, x, y + 2, 56, '#fff', 'center', 'Bebas Neue', 400); noGlow(c);
      nd(x, y, ang(d.rpm / 1000), r * 0.88);
      x = 1170;
      pod(x, y, r);
      const [smax, smaj, smin] = sScale([240, 20, 10], [140, 20, 5]);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: a, tickGlow: a, labelColor: '#fff', labelGlow: a, labelSize: r * 0.15, labelR: 0.7, font: 'Bebas Neue', weight: 400 });
      text(c, mph() ? 'MPH' : 'KM/H', x, y + r * 0.28, 22, a, 'center', 'Bebas Neue', 400);
      text(c, Math.round(spd(d)), x, y + 2, 50, '#fff', 'center', 'Bebas Neue', 400);
      nd(x, y, ang(spd(d)), r * 0.88);
      // centre pods
      const sp = (yy, frac, lo, hi, ic, red) => {
        pod(800, yy, 92);
        mini(c, 800, yy + 18, 72, frac, { lo, hi, tick: a, label: '#fff', needle: o.needle, size: 20, font: 'Bebas Neue', [red]: true, labelR: 1.05 });
        icon(c, ic, 800, yy + 40, 26, a);
      };
      sp(170, waterFrac(d), 'C', 'H', 'temp', 'redEnd');
      sp(440, fuelFrac(d), 'E', 'F', 'fuel', 'redStart');
      text(c, `ODO ${odoStr(d)}`, 1170, 580, 24, a, 'center', 'Bebas Neue', 400);
      text(c, `TRIP ${tripStr(d)}`, 430, 580, 24, a, 'center', 'Bebas Neue', 400);
      lightRow(c, d, 800, 305, 28, 6, { list: ['sigL', 'high', 'park', 'check', 'oil', 'sigR'] });
    },
  });

  // =============================================================== 2010s
  reg({
    id: 'vette14', name: "Stingray '14", era: '2010s', region: 'US', inspired: 'Corvette C7 configurable TFT',
    opts: [
      { k: 'mode', label: 'Mode', type: 'select', options: ['tour', 'sport', 'track'], def: 'tour' },
      { k: 'right', label: 'Right screen', type: 'select', options: ['pages', 'g-meter + tires'], def: 'pages' },
    ],
    mfd: (o) => (o.right === 'pages' ? { x: 1130, y: 50, w: 420, h: 500, theme: { accent: { tour: '#3fb6ff', sport: '#ffd21f', track: '#ff2a2a' }[o.mode], bg: 'rgba(0,0,0,0)' } } : null),
    draw(c, d, k) {
      const mode = k.o.mode;
      const a = { tour: '#3fb6ff', sport: '#ffd21f', track: '#ff2a2a' }[mode];
      const bg = c.createLinearGradient(0, 0, 0, 600); bg.addColorStop(0, '#0a0d12'); bg.addColorStop(1, '#020304');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      const sidePanel = (x) => { c.fillStyle = 'rgba(255,255,255,.035)'; rrect(c, x, 40, 440, 520, 22); c.fill(); };
      sidePanel(40); sidePanel(1120);
      const rowBar = (y, label, val, frac, warn) => {
        text(c, label, 70, y, 22, 'rgba(255,255,255,.65)', 'left', 'Rajdhani', 600);
        text(c, val, 450, y, 30, warn ? '#ff3a2a' : '#fff', 'right', 'Rajdhani', 700);
        bar(c, 70, y + 20, 380, 8, frac, warn ? '#ff3a2a' : a, 'rgba(255,255,255,.08)', false, 4);
      };
      rowBar(85, 'FUEL', `${Math.round(d.fuel * 100)}%  ${rangeStr(d)}`, d.fuel, d.lights.lowFuel);
      rowBar(170, 'OIL PRESS', `${Math.round(BD.settings.pressUnit === 'bar' ? oilP(d) / 14.5 : oilP(d))} ${BD.settings.pressUnit === 'bar' ? 'bar' : 'psi'}`, oilP(d) / 90, d.lights.oil && d.ignition > 0);
      rowBar(255, 'OIL TEMP', `${Math.round(U.temp(d.oilT))}${U.tempLabel()}`, clamp((d.oilT - 40) / 110, 0, 1), d.oilT > 135);
      rowBar(340, 'COOLANT', `${Math.round(tempC(d))}${U.tempLabel()}`, waterFrac(d), d.water > 112);
      rowBar(425, 'BOOST', `${U.boost(d.boost).toFixed(1)} ${U.pressLabel()}`, clamp((d.boost + 5) / (d.boostMax + 5), 0, 1), false);
      text(c, `${odoStr(d)} ${U.distLabel()}   TRIP ${tripStr(d)}`, 260, 520, 22, 'rgba(255,255,255,.55)', 'center', 'Rajdhani', 600);
      // right: interactive pages, or the fixed g-meter + tires screen
      if (k.o.right !== 'pages') {
        G.gMeter(c, 1240, 230, 90, d.gx, -d.gy, { color: a, font: 'Rajdhani' });
        G.carTop(c, 1440, 230, 200, d.wheels, {
          wheelColor: (w) => G.tireTemp()(w.brakeSurfaceTemperature || 30),
          label: (w) => (w.pressure ? U.tire(w.pressure).toFixed(BD.settings.pressUnit === 'psi' ? 0 : 1) : ''),
          font: 'Rajdhani',
        });
        text(c, 'TIRE ' + U.pressLabel() + ' · BRAKE TEMP', 1440, 360, 16, 'rgba(255,255,255,.5)', 'center', 'Rajdhani', 600);
        if (!navCard(c, d, 1150, 420, 380, 90, { accent: a })) lightRow(c, d, 1340, 465, 32, 6, { list: ['abs', 'esc', 'check', 'oil', 'battery', 'tpms'] });
      }
      if (mode === 'track') {
        const f = d.rpm / d.tachMax;
        segments(c, 520, 70, 560, 60, 28, f, (ff) => (ff * d.tachMax > d.shiftRpm ? (Math.floor(k.t * 12) % 2 ? '#3a8bff' : '#000') : ff * d.tachMax > d.redFrom * 0.85 ? '#ff2a2a' : ff > 0.5 ? '#ffd21f' : '#2ae05a'), 'rgba(255,255,255,.06)', 0.2);
        text(c, Math.round(d.rpm), 800, 160, 34, '#fff', 'center', 'Rajdhani', 700);
        glow(c, a, 30);
        text(c, gearMain(d), 800, 330, 250, '#fff', 'center', 'Rajdhani', 700);
        noGlow(c);
        text(c, `${Math.round(spd(d))} ${U.speedLabel()}`, 800, 500, 54, a, 'center', 'Rajdhani', 700);
      } else {
        const x = 800, y = 320, r = 255;
        const ang = dial(c, { x, y, r, min: 0, max: kmax(d), major: 1, minor: 0.5, a0: 0.75 * PI, a1: 2.25 * PI, tickColor: 'rgba(255,255,255,.75)', labelColor: '#fff', labelSize: mode === 'sport' ? 40 : 32, labelR: 0.78, font: 'Rajdhani', weight: 700, tickR: 0.97, red: { from: d.redFrom / 1000, r: 0.97, w: 0.05, color: '#ff2a2a' } });
        arcBar(c, x, y, r * 0.9, mode === 'sport' ? 22 : 14, 0.75 * PI, 2.25 * PI, d.rpm / d.tachMax, a, 'rgba(255,255,255,.05)', { glow: a });
        const an = ang(d.rpm / 1000);
        c.strokeStyle = '#fff'; c.lineWidth = 6; glow(c, a, 14);
        c.beginPath(); c.moveTo(x + Math.cos(an) * r * 0.82, y + Math.sin(an) * r * 0.82); c.lineTo(x + Math.cos(an) * r * 0.98, y + Math.sin(an) * r * 0.98); c.stroke(); noGlow(c);
        text(c, Math.round(spd(d)), x, y - 10, 130, '#fff', 'center', 'Rajdhani', 700);
        text(c, U.speedLabel(), x, y + 60, 26, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
        c.strokeStyle = a; c.lineWidth = 3; rrect(c, x - 45, y + 100, 90, 70, 10); c.stroke();
        text(c, d.gear, x, y + 136, 52, a, 'center', 'Rajdhani', 700);
        setSpeedChip(c, d, x - 60, y - 120, 34, a);
      }
      lightRow(c, d, 800, 575, 26, 8, { list: ['sigL', 'high', 'low', 'park', 'cruise', 'sigR'] });
    },
  });

  reg({
    id: 'virtual16', name: "Euro Virtual '16", era: '2010s', region: 'Euro', inspired: 'Audi Virtual Cockpit', adasNative: true,
    opts: [
      { k: 'view', label: 'View', type: 'select', options: ['classic', 'wide'], def: 'classic' },
      { k: 'center', label: 'Centre screen', type: 'select', options: ['pages', 'map', 'assist', 'car', 'tires'], def: 'pages' },
      { k: 'accent', label: 'Needle colour', type: 'color', def: '#ff3226' },
    ],
    mfd: (o) => (o.center === 'pages' ? (o.view === 'wide' ? { x: 340, y: 40, w: 920, h: 470 } : { x: 620, y: 90, w: 360, h: 420 }) : null),
    draw(c, d, k) {
      const a = accent(k, '#ff3226'), wide = k.o.view === 'wide';
      const bg = c.createRadialGradient(800, 300, 100, 800, 300, 900); bg.addColorStop(0, '#15171c'); bg.addColorStop(1, '#030304');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      const ringG = (x, y, r, max, val, maj, mi, label, red, centre, sub) => {
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = 'rgba(0,0,0,.55)'; c.fill();
        c.lineWidth = 3; c.strokeStyle = '#3a3e46'; c.stroke();
        // light sweep from zero to needle
        const a0 = 0.7 * PI, a1 = 2.3 * PI;
        const f = clamp(val / max, 0, 1);
        const sweep = c.createRadialGradient(x, y, r * 0.55, x, y, r);
        sweep.addColorStop(0, 'rgba(0,0,0,0)'); sweep.addColorStop(1, a + '55');
        c.beginPath(); c.moveTo(x, y); c.arc(x, y, r * 0.97, a0, a0 + (a1 - a0) * f); c.closePath(); c.fillStyle = sweep; c.fill();
        const ang = dial(c, { x, y, r: r * 0.95, min: 0, max, major: maj, minor: mi, a0, a1, tickColor: '#d8dce3', labelColor: '#e8ecf2', labelSize: r * 0.12, labelR: 0.76, font: 'Rajdhani', weight: 500, majorLen: 0.08, minorLen: 0.04, red, label });
        needle(c, x, y, ang(val), { len: r * 0.97, w: r * 0.02, style: 'pointer', start: r * 0.6, color: a, glow: a, glowBlur: 16 });
        text(c, centre, x, y - r * 0.05, r * 0.32, '#fff', 'center', 'Rajdhani', 600);
        text(c, sub, x, y + r * 0.22, r * 0.09, 'rgba(255,255,255,.55)', 'center', 'Rajdhani', 600);
      };
      const [smax, smaj, smin] = sScale([280, 20, 10], [180, 20, 5]);
      const rs = wide ? 150 : 260;
      const pL = wide ? [190, 420] : [330, 320], pR = wide ? [1410, 420] : [1270, 320];
      ringG(pL[0], pL[1], rs, smax, spd(d), smaj, smin, (v) => ((v / smaj) % 2 === 0 ? String(v) : null), null, String(Math.round(spd(d))), U.speedLabel());
      ringG(pR[0], pR[1], rs, kmax(d), d.rpm / 1000, 1, 0.5, (v) => String(v), { from: d.redFrom / 1000, r: 0.92, w: 0.04, color: '#ff2a1a' }, gearMain(d), d.gear[0] === 'D' ? 'D' : 'x1000 rpm');
      // centre screen
      const cx0 = wide ? 340 : 620, cw = wide ? 920 : 360, cy0 = wide ? 40 : 90, ch = wide ? 470 : 420;
      c.fillStyle = 'rgba(0,0,0,.6)'; rrect(c, cx0, cy0, cw, ch, 18); c.fill();
      const view = k.o.center;
      if (view === 'pages') {
        // drawn by the multi-function display
      } else if (view === 'map') {
        MapView.mini(c, d, cx0, cy0, cw, ch, { zoom: wide ? 1.4 : 1.1, theme: 'night', clipRound: 18 });
        navCard(c, d, cx0 + 14, cy0 + 14, Math.min(320, cw - 28), 76, { accent: '#5aa8ff' });
      } else if (view === 'assist') {
        G.adasView(c, cx0 + cw / 2, cy0 + ch * 0.55, cw * 0.8, ch * 0.8, d, { accent: '#2f9bff' });
        setSpeedChip(c, d, cx0 + 40, cy0 + 40, 36, '#2f9bff');
      } else if (view === 'tires') {
        G.carTop(c, cx0 + cw / 2, cy0 + ch / 2, ch * 0.7, d.wheels, { wheelColor: (w) => G.tireTemp()(w.brakeSurfaceTemperature || 30), label: (w) => (w.pressure ? U.tire(w.pressure).toFixed(1) : ''), font: 'Rajdhani' });
      } else {
        const info = BD.st.info || {}, m = info.model || {}, cf = info.config || {};
        text(c, `${m.Brand || ''} ${m.Name || ''}`, cx0 + cw / 2, cy0 + 60, 34, '#fff', 'center', 'Rajdhani', 700);
        text(c, cf.Configuration || '', cx0 + cw / 2, cy0 + 100, 22, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
        const rows = [['Oil', `${Math.round(U.temp(d.oilT))}${U.tempLabel()}`], ['Coolant', `${Math.round(tempC(d))}${U.tempLabel()}`], ['Boost', `${U.boost(d.boost).toFixed(1)} ${U.pressLabel()}`], ['Range', rangeStr(d)], ['Trip', `${tripStr(d)} ${U.distLabel()}`], ['Consumption', `${U.consumption(d.consumption).toFixed(1)} ${U.consLabel()}`]];
        rows.forEach(([l, v], i) => { const yy = cy0 + 160 + i * 42; text(c, l, cx0 + 30, yy, 24, 'rgba(255,255,255,.6)', 'left', 'Rajdhani', 600); text(c, v, cx0 + cw - 30, yy, 26, '#fff', 'right', 'Rajdhani', 700); });
      }
      // top: limit + ACC; bottom bar
      limit(c, d, wide ? 1320 : 800, wide ? 90 : 48, 30);
      setSpeedChip(c, d, wide ? 1380 : 860, wide ? 170 : 48, 30, '#2f9bff');
      c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, 548, 1600, 52);
      text(c, `${odoStr(d)} ${U.distLabel()}`, 120, 574, 22, 'rgba(255,255,255,.7)', 'center', 'Rajdhani', 600);
      text(c, BD.clock(d.tod), 1480, 574, 24, '#fff', 'center', 'Rajdhani', 700);
      text(c, `Range ${rangeStr(d)}`, 400, 574, 22, 'rgba(255,255,255,.7)', 'center', 'Rajdhani', 600);
      text(c, `${Math.round(tempC(d))}${U.tempLabel()}`, 1200, 574, 22, 'rgba(255,255,255,.7)', 'center', 'Rajdhani', 600);
      lightRow(c, d, 800, 574, 28, 8, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'fuel', 'sigR'] });
    },
  });

  // =============================================================== 2020s
  reg({
    id: 'bavLive22', name: "Bavaria Live '22", era: '2020s', region: 'Euro', inspired: 'BMW Live Cockpit Professional (G20)', adasNative: true,
    opts: [
      { k: 'theme', label: 'Mode', type: 'select', options: ['auto', 'comfort', 'sport', 'eco'], def: 'auto' },
      { k: 'center', label: 'Centre', type: 'select', options: ['pages', 'auto', 'map', 'assist'], def: 'pages' },
    ],
    mfd: (o, d) => {
      if (o.center !== 'pages') return null;
      let th = o.theme;
      if (th === 'auto') th = /sport/i.test(d.driveMode || '') ? 'sport' : /eco/i.test(d.driveMode || '') ? 'eco' : 'comfort';
      return { x: 600, y: 90, w: 400, h: 410, theme: { accent: { comfort: '#5ab0ff', sport: '#ff3030', eco: '#2fe0c8' }[th], bg: 'rgba(10,14,22,.55)' } };
    },
    draw(c, d, k) {
      let th = k.o.theme;
      if (th === 'auto') th = /sport/i.test(d.driveMode || '') ? 'sport' : /eco/i.test(d.driveMode || '') ? 'eco' : 'comfort';
      const a = { comfort: '#5ab0ff', sport: '#ff3030', eco: '#2fe0c8' }[th];
      const bg = c.createLinearGradient(0, 0, 0, 600); bg.addColorStop(0, '#080b12'); bg.addColorStop(1, '#020305');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      // hexagonal frame lines
      c.strokeStyle = a + '55'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(120, 560); c.lineTo(60, 330); c.lineTo(160, 70); c.lineTo(560, 40); c.stroke();
      c.beginPath(); c.moveTo(1480, 560); c.lineTo(1540, 330); c.lineTo(1440, 70); c.lineTo(1040, 40); c.stroke();
      // left: speed arc (clockwise from lower-left)
      let x = 360, y = 330, r = 245;
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 10]);
      let ang = dial(c, { x, y, r, min: 0, max: smax, major: smaj * 2, minor: smin * 2, a0: 0.62 * PI, a1: 1.62 * PI, tickColor: 'rgba(255,255,255,.55)', labelColor: 'rgba(255,255,255,.8)', labelSize: 22, labelR: 0.84, font: 'Rajdhani', weight: 600, tickR: 1.0, majorLen: 0.06, minorLen: 0.03 });
      arcBar(c, x, y, r * 0.95, 10, 0.62 * PI, 1.62 * PI, spd(d) / smax, a, 'rgba(255,255,255,.06)', { glow: a });
      let an = ang(spd(d));
      c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(x + Math.cos(an) * r * 0.88, y + Math.sin(an) * r * 0.88); c.lineTo(x + Math.cos(an) * r * 1.02, y + Math.sin(an) * r * 1.02); c.stroke();
      text(c, Math.round(spd(d)), x + 20, y - 10, 120, '#fff', 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), x + 20, y + 60, 24, 'rgba(255,255,255,.55)', 'center', 'Rajdhani', 600);
      limit(c, d, x - 40, y + 125, 32);
      setSpeedChip(c, d, x + 20, y + 125, 32, a);
      // fuel bar under speed
      bar(c, 180, 520, 300, 8, d.fuel, d.lights.lowFuel ? '#ffb000' : '#fff', 'rgba(255,255,255,.1)', false, 4);
      icon(c, 'fuel', 160, 524, 22, 'rgba(255,255,255,.6)');
      text(c, rangeStr(d), 480, 500, 22, 'rgba(255,255,255,.8)', 'right', 'Rajdhani', 600);
      // right: tach arc (counter-clockwise from lower-right)
      x = 1240;
      ang = dial(c, { x, y, r, min: 0, max: kmax(d), major: 1, minor: 0.5, a0: 0.38 * PI, a1: -0.62 * PI, tickColor: 'rgba(255,255,255,.55)', labelColor: 'rgba(255,255,255,.8)', labelSize: 24, labelR: 0.84, font: 'Rajdhani', weight: 600, tickR: 1.0, majorLen: 0.06, minorLen: 0.03, red: { from: d.redFrom / 1000, r: 0.95, w: 0.04, color: '#ff2a2a' } });
      arcBar(c, x, y, r * 0.95, 10, 0.38 * PI, -0.62 * PI, d.rpm / d.tachMax, th === 'sport' ? '#ff3030' : '#fff', 'rgba(255,255,255,.06)', { glow: a });
      an = ang(d.rpm / 1000);
      c.strokeStyle = a; c.lineWidth = 5; c.beginPath(); c.moveTo(x + Math.cos(an) * r * 0.88, y + Math.sin(an) * r * 0.88); c.lineTo(x + Math.cos(an) * r * 1.02, y + Math.sin(an) * r * 1.02); c.stroke();
      text(c, d.gear, x - 20, y - 10, 120, '#fff', 'center', 'Rajdhani', 600);
      text(c, (d.driveMode || th).toUpperCase(), x - 20, y + 60, 22, a, 'center', 'Rajdhani', 700);
      bar(c, 1120, 520, 300, 8, clamp((d.oilT - 50) / 100, 0, 1), '#fff', 'rgba(255,255,255,.1)', false, 4);
      icon(c, 'oil', 1440, 524, 22, 'rgba(255,255,255,.6)');
      text(c, `${Math.round(U.temp(d.oilT))}${U.tempLabel()}`, 1120, 500, 22, 'rgba(255,255,255,.8)', 'left', 'Rajdhani', 600);
      // centre
      let view = k.o.center;
      if (view === 'auto') view = d.route ? 'map' : 'assist';
      const cx0 = 590, cy0 = 80, cw = 420, ch = 430;
      if (view === 'pages') {
        // drawn by the multi-function display
      } else if (view === 'map') {
        MapView.mini(c, d, cx0, cy0, cw, ch, { zoom: 1.2, theme: 'night', clipRound: 30 });
        const vg = c.createRadialGradient(800, 300, 120, 800, 300, 320); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,3,5,.95)');
        c.fillStyle = vg; c.fillRect(cx0, cy0, cw, ch);
        navCard(c, d, cx0 + 40, cy0 + 4, cw - 80, 70, { accent: a, bg: 'rgba(5,8,12,.8)' });
      } else surround(c, d, cx0, cy0, cw, ch, { accent: a });
      lightRow(c, d, 800, 40, 30, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'tpms', 'sigR'] });
      text(c, `${BD.clock(d.tod)}     ${odoStr(d)} ${U.distLabel()}`, 800, 560, 22, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
    },
  });

  reg({
    id: 'curve26', name: "Bavaria Curved '26", era: '2020s', region: 'Euro', inspired: 'BMW curved display / latest 2026 layouts', adasNative: true,
    opts: [
      { k: 'theme', label: 'Theme', type: 'select', options: ['dark', 'light'], def: 'dark' },
      { k: 'accent', label: 'Accent', type: 'color', def: '#5aa8ff' },
      { k: 'center', label: 'Centre', type: 'select', options: ['surround', 'map'], def: 'surround' },
      { k: 'right', label: 'Right screen', type: 'select', options: ['pages', 'map + vitals'], def: 'pages' },
    ],
    mfd: (o) => (o.right === 'pages' ? {
      x: 1150, y: 46, w: 420, h: 516,
      theme: o.theme === 'light'
        ? { bg: 'rgba(255,255,255,.7)', fg: '#0d1320', dim: 'rgba(13,19,32,.55)', line: 'rgba(0,0,0,.12)', accent: o.accent || '#5aa8ff', mapTheme: 'light' }
        : { bg: 'rgba(255,255,255,.04)', accent: o.accent || '#5aa8ff' },
    } : null),
    draw(c, d, k) {
      const light = k.o.theme === 'light', a = accent(k, '#5aa8ff');
      const fg = light ? '#0d1320' : '#ffffff', dim = light ? 'rgba(13,19,32,.55)' : 'rgba(255,255,255,.55)';
      const bg = c.createLinearGradient(0, 0, 1600, 600);
      if (light) { bg.addColorStop(0, '#eef2f7'); bg.addColorStop(1, '#d8dee8'); } else { bg.addColorStop(0, '#0d121c'); bg.addColorStop(1, '#04060a'); }
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      const gl = c.createLinearGradient(0, 0, 0, 80); gl.addColorStop(0, light ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.06)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gl; c.fillRect(0, 0, 1600, 80);
      // left: speed, rpm line, gear selector
      limit(c, d, 90, 110, 38);
      if (d.cruise.on) {
        c.fillStyle = a + '26'; rrect(c, 150, 80, 210, 62, 31); c.fill();
        setSpeedChip(c, d, 190, 111, 40, a);
        if (d.adas && d.adas.acc) for (let i = 0; i < (d.adas.accGap || 2); i++) { c.fillStyle = a; c.fillRect(300 + i * 12, 128 - i * 9, 8, 6 + i * 9); }
      }
      text(c, Math.round(spd(d)), 250, 285, 190, fg, 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), 250, 385, 28, dim, 'center', 'Rajdhani', 600);
      const rf = d.rpm / d.tachMax;
      c.fillStyle = light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; rrect(c, 70, 425, 360, 10, 5); c.fill();
      c.fillStyle = d.rpm > d.redFrom ? '#ff3a2a' : a; rrect(c, 70, 425, 360 * clamp(rf, 0, 1), 10, 5); c.fill();
      text(c, `${(d.rpm / 1000).toFixed(1)}k rpm`, 430, 455, 20, dim, 'right', 'Rajdhani', 600);
      if (/^[PRND]/.test(d.gear)) {
        gearRow(c, d, 250, 520, 40, fg, light ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.2)', ['P', 'R', 'N', 'D'], 'Rajdhani');
        if (d.gearIndex > 0 && d.gear[0] === 'D') text(c, String(d.gearIndex), 345, 512, 22, a, 'left', 'Rajdhani', 700);
      } else text(c, d.gear, 250, 520, 54, fg, 'center', 'Rajdhani', 700);
      // centre
      const cx0 = 470, cw = 660;
      if (k.o.center === 'map') {
        MapView.mini(c, d, cx0, 40, cw, 520, { zoom: 1.4, theme: light ? 'light' : 'night', clipRound: 28, anchorY: 0.7 });
      } else {
        surround(c, d, cx0, 40, cw, 520, light ? { accent: a, car: 'rgba(60,70,90,.35)', carTop: 'rgba(60,70,90,.55)', me: '#20293a', meTop: '#38445a', laneLine: 'rgba(0,0,0,.25)', edgeLine: 'rgba(0,0,0,.4)', road: 'rgba(0,0,0,.06)' } : { accent: a });
      }
      navCard(c, d, cx0 + cw / 2 - 180, 50, 360, 80, { accent: a, bg: light ? 'rgba(255,255,255,.85)' : 'rgba(8,12,20,.8)', color: fg, dim });
      if (d.fcw) {
        glow(c, '#ff2a1f', 30);
        text(c, d.fcw === 2 ? 'BRAKE!' : 'CAUTION', 800, 470, 60, d.fcw === 2 ? '#ff2a1f' : '#ffb000', 'center', 'Rajdhani', 700);
        noGlow(c);
      }
      // right: interactive pages (drawn by the MFD), or the fixed mini map + vitals
      if (k.o.right !== 'pages') {
        c.save();
        if (k.o.center !== 'map') MapView.mini(c, d, 1160, 50, 400, 300, { zoom: 0.9, theme: light ? 'light' : 'night', clipRound: 24 });
        else {
          c.fillStyle = light ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.04)'; rrect(c, 1160, 50, 400, 300, 24); c.fill();
          G.carTop(c, 1360, 200, 230, d.wheels, { body: light ? 'rgba(0,0,0,.08)' : undefined, line: light ? 'rgba(0,0,0,.3)' : undefined, wheelColor: (w) => G.tireTemp()(w.brakeSurfaceTemperature || 30), label: (w) => (w.pressure ? U.tire(w.pressure).toFixed(1) : ''), textColor: fg, font: 'Rajdhani' });
        }
        c.restore();
        const row = (y, l, v) => { text(c, l, 1170, y, 22, dim, 'left', 'Rajdhani', 600); text(c, v, 1550, y, 26, fg, 'right', 'Rajdhani', 700); };
        row(390, d.electric ? 'Battery' : 'Fuel', `${Math.round(d.fuel * 100)}%`);
        c.fillStyle = light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; rrect(c, 1170, 405, 380, 8, 4); c.fill();
        c.fillStyle = d.lights.lowFuel ? '#ffb000' : a; rrect(c, 1170, 405, 380 * clamp(d.fuel, 0, 1), 8, 4); c.fill();
        row(440, 'Range', rangeStr(d));
        row(475, 'Consumption', `${U.consumption(d.consumption).toFixed(1)} ${U.consLabel()}`);
        row(510, 'Coolant · Oil', `${Math.round(tempC(d))}° · ${Math.round(U.temp(d.oilT))}°`);
        row(545, BD.clock(d.tod), `${odoStr(d)} ${U.distLabel()}`);
      } else {
        // fuel + clock strip stays visible under the left speed area
        text(c, `${BD.clock(d.tod)}   ·   ${Math.round(d.fuel * 100)}% ${rangeStr(d)}`, 250, 575, 20, dim, 'center', 'Rajdhani', 600);
      }
      lightRow(c, d, 800, 22, 26, 8, { list: ['sigL', 'high', 'low', 'fog', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'tpms', 'temp', 'sigR'] });
    },
  });

  reg({
    id: 'wrx22', name: "Pleiades '22", era: '2020s', region: 'Japan', inspired: 'Subaru WRX (VB) with centre display', adasNative: true, glass: true,
    opts: [
      { k: 'center', label: 'Centre display', type: 'select', options: ['pages', 'eyesight', 'boost', 'gforce', 'tires'], def: 'pages' },
      { k: 'accent', label: 'Ring colour', type: 'color', def: '#2a7fff' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff2b1c' },
    ],
    mfd: (o) => (o.center === 'pages' ? { x: 616, y: 76, w: 368, h: 430, theme: { bg: 'rgba(0,0,0,0)', accent: o.accent || '#2a7fff', fg: '#e8eef8', dim: '#7f8ea8' } } : null),
    draw(c, d, k) {
      const a = accent(k, '#2a7fff'), o = k.o;
      c.fillStyle = '#060708'; c.fillRect(0, 0, 1600, 600);
      const face = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 10, 0, TAU); c.fillStyle = '#16191e'; c.fill();
        glow(c, a, 18); c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.lineWidth = 4; c.strokeStyle = a; c.stroke(); noGlow(c);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#15181d'); c.fill();
      };
      const nd = (x, y, an, len) => needle(c, x, y, an, { len, color: o.needle, w: len * 0.03, tail: len * 0.15, glow: o.needle, glowBlur: 10, cap: len * 0.12, capColor: '#0c0e12', capRim: '#3a3f48' });
      let x = 330, y = 320, r = 245;
      face(x, y, r);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.5, tickColor: '#fff', labelColor: '#fff', labelSize: r * 0.15, labelR: 0.72, font: 'Rajdhani', weight: 700, red: { from: d.redFrom / 1000, r: 0.9, w: 0.08, color: '#ff2b1c' } });
      text(c, 'x1000r/min', x, y - r * 0.3, 18, '#aaa', 'center', 'Rajdhani', 600);
      c.fillStyle = '#000'; rrect(c, x - 44, y + r * 0.3, 88, 70, 10); c.fill(); c.strokeStyle = a; c.lineWidth = 2; c.stroke();
      text(c, gearMain(d), x, y + r * 0.3 + 37, 52, '#fff', 'center', 'Rajdhani', 700);
      arcSegs(c, x, y, r * 0.55, 10, 0.25 * PI, 0.75 * PI, 8, waterFrac(d), (f) => (f > 0.8 ? '#ff2b1c' : a), 'rgba(255,255,255,.07)');
      nd(x, y, ang(d.rpm / 1000), r * 0.88);
      x = 1270;
      face(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#fff', labelColor: '#fff', labelSize: r * 0.12, labelR: 0.74, font: 'Rajdhani', weight: 700, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, U.speedLabel(), x, y - r * 0.3, 18, '#aaa', 'center', 'Rajdhani', 600);
      text(c, Math.round(spd(d)), x, y + r * 0.42, 48, '#fff', 'center', 'Rajdhani', 700);
      arcSegs(c, x, y, r * 0.55, 10, 0.75 * PI, 0.25 * PI, 8, fuelFrac(d), (f) => (f < 0.15 ? '#ffb000' : a), 'rgba(255,255,255,.07)');
      nd(x, y, ang(spd(d)), r * 0.88);
      // centre TFT
      const cx0 = 610, cy0 = 70, cw = 380, ch = 470;
      c.fillStyle = '#0a0d14'; rrect(c, cx0, cy0, cw, ch, 20); c.fill(); c.strokeStyle = '#1c2433'; c.lineWidth = 2; c.stroke();
      const view = o.center;
      if (view === 'pages') {
        // drawn by the multi-function display
      } else if (view === 'eyesight') {
        text(c, 'EyeSight', cx0 + 24, cy0 + 32, 22, '#9fb4d6', 'left', 'Rajdhani', 700);
        limit(c, d, cx0 + cw - 40, cy0 + 40, 26);
        G.adasView(c, cx0 + cw / 2, cy0 + ch * 0.55, cw * 0.85, ch * 0.6, d, { accent: '#2fe07a' });
        setSpeedChip(c, d, cx0 + 30, cy0 + ch - 50, 34, '#2fe07a');
      } else if (view === 'boost') {
        const bmin = -1, bmax = 1.6;
        const bv = U.boost(d.boost) / (BD.settings.pressUnit === 'psi' ? 14.5 : BD.settings.pressUnit === 'kpa' ? 100 : 1);
        const an2 = dial(c, { x: cx0 + cw / 2, y: cy0 + ch / 2, r: 150, min: bmin, max: bmax, major: 0.5, minor: 0.1, tickColor: '#fff', labelColor: '#fff', labelSize: 22, labelR: 0.75, font: 'Rajdhani', label: (v) => v.toFixed(1) });
        arcBar(c, cx0 + cw / 2, cy0 + ch / 2, 140, 12, an2(0), an2(bv), 1, a, null, { glow: a });
        text(c, `${U.boost(d.boost).toFixed(1)} ${U.pressLabel()}`, cx0 + cw / 2, cy0 + ch / 2 + 40, 40, '#fff', 'center', 'Rajdhani', 700);
        text(c, 'BOOST (bar scale)', cx0 + cw / 2, cy0 + ch - 50, 18, '#9fb4d6', 'center', 'Rajdhani', 600);
      } else if (view === 'gforce') {
        G.gMeter(c, cx0 + cw / 2, cy0 + ch / 2 - 20, 140, d.gx, -d.gy, { color: a, font: 'Rajdhani' });
      } else {
        G.carTop(c, cx0 + cw / 2, cy0 + ch / 2, 300, d.wheels, { wheelColor: (w) => G.tireTemp()(w.brakeSurfaceTemperature || 30), label: (w) => (w.pressure ? U.tire(w.pressure).toFixed(BD.settings.pressUnit === 'psi' ? 0 : 1) : ''), font: 'Rajdhani' });
      }
      text(c, `${BD.clock(d.tod)}   ${odoStr(d)} ${U.distLabel()}`, cx0 + cw / 2, cy0 + ch - 16, 18, '#7f8ea8', 'center', 'Rajdhani', 600);
      lightRow(c, d, 800, 34, 28, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'cruise', 'sigR'] });
    },
  });

  // =============================================================== v2 designs
  reg({
    id: 'bavBlack12', name: "Bavaria Black Panel '12", era: '2010s', region: 'Euro', inspired: 'BMW F10 / F30 black-panel cluster', glass: true,
    opts: [
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff4614' },
      { k: 'accent', label: 'Screen accent', type: 'color', def: '#ff7a2a' },
      { k: 'sport', label: 'Sport display (red tach)', type: 'bool', def: false },
    ],
    mfd: (o) => ({ x: 640, y: 140, w: 320, h: 330, theme: { bg: 'rgba(10,12,16,.96)', accent: o.accent || '#ff7a2a', font: 'Rajdhani' } }),
    draw(c, d, k) {
      const o = k.o;
      c.fillStyle = '#000'; c.fillRect(0, 0, 1600, 600);
      const ring = (x, y, r) => {
        const g = c.createLinearGradient(x, y - r, x, y + r);
        g.addColorStop(0, '#9aa0a8'); g.addColorStop(0.5, '#2a2d33'); g.addColorStop(1, '#7c828a');
        c.beginPath(); c.arc(x, y, r + 7, 0, TAU); c.arc(x, y, r, 0, TAU, true); c.fillStyle = g; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#0c0d10'); c.fill();
      };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: 7, style: 'bar', tail: len * 0.18, cap: 26, capColor: '#16181c', capRim: '#5a5f66' });
      // speedometer
      let x = 390, y = 300, r = 240;
      ring(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.96, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#f2f4f7', labelColor: '#f5f7fa', labelSize: r * 0.12, labelR: 0.75, font: 'Rajdhani', weight: 600, majorW: 4, minorW: 2, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      if (d.cruise.on) {
        const a = ang(U.speed(d.adas && d.adas.acc ? d.adas.accSet || d.cruise.target : d.cruise.target));
        glow(c, '#ff8a2a', 10); c.fillStyle = '#ff8a2a';
        c.save(); c.translate(x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 14)); c.rotate(a);
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(8, -9); c.lineTo(8, 9); c.closePath(); c.fill(); c.restore(); noGlow(c);
      }
      text(c, U.speedLabel(), x, y - r * 0.32, 18, '#8a9099', 'center', 'Rajdhani', 600);
      mini(c, x, y + r * 0.62, 58, fuelFrac(d), { a0: 1.22 * PI, a1: 1.78 * PI, tick: '#f2f4f7', needle: o.needle, redStart: true, lo: '0', hi: '1/1', label: '#c8ccd2', size: 15, labelR: 1.22 });
      icon(c, 'fuel', x, y + r * 0.66, 18, '#8a9099');
      nd(x, y, ang(spd(d)), r * 0.9);
      G.glass(c, x, y, r);
      // tachometer
      x = 1210;
      ring(x, y, r);
      ang = dial(c, { x, y, r: r * 0.96, min: 0, max: kmax(d), major: 1, minor: 0.5, tickColor: o.sport ? '#ff5a3a' : '#f2f4f7', labelColor: o.sport ? '#ff6a4a' : '#f5f7fa', labelSize: r * 0.15, labelR: 0.74, font: 'Rajdhani', weight: 600, majorW: 4, minorW: 2, red: { from: d.redFrom / 1000, r: 0.93, w: 0.06, color: '#d8230f' } });
      text(c, '1/min x1000', x, y - r * 0.32, 16, '#8a9099', 'center', 'Rajdhani', 600);
      mini(c, x, y + r * 0.62, 58, clamp((d.oilT - 70) / 80, 0, 1), { a0: 1.22 * PI, a1: 1.78 * PI, tick: '#f2f4f7', needle: o.needle, redEnd: true, lo: mph() ? '160' : '70', hi: mph() ? '300' : '150', label: '#c8ccd2', size: 14, labelR: 1.22 });
      icon(c, 'oil', x, y + r * 0.66, 18, '#8a9099');
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      G.glass(c, x, y, r);
      // centre: gear + odometer under the screen, tell-tales above
      lightRow(c, d, 800, 60, 30, 6, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'sigR'] });
      text(c, d.gear, 710, 520, 46, '#fff', 'center', 'Rajdhani', 700);
      text(c, `${odoStr(d)} ${U.distLabel()}`, 860, 512, 20, '#c8ccd2', 'center', 'Rajdhani', 600);
      text(c, BD.clock(d.tod), 860, 536, 18, '#8a9099', 'center', 'Rajdhani', 600);
    },
  });

  reg({
    id: 'stuttgart19', name: "Stuttgart Five-Dial '19", era: '2010s', region: 'Euro', inspired: 'Porsche 911 (992): analog tach between two screens', glass: true,
    opts: [
      { k: 'needle', label: 'Needle', type: 'color', def: '#e8231a' },
      { k: 'accent', label: 'Screen accent', type: 'color', def: '#e8231a' },
      { k: 'left', label: 'Left screen', type: 'select', options: ['speed + boost', 'off'], def: 'speed + boost' },
    ],
    mfd: (o) => ({ x: 1090, y: 70, w: 440, h: 460, theme: { bg: 'rgba(0,0,0,0)', accent: o.accent || '#e8231a', font: 'Barlow Condensed' } }),
    draw(c, d, k) {
      const o = k.o, a = accent(k, '#e8231a');
      c.fillStyle = '#050505'; c.fillRect(0, 0, 1600, 600);
      const screen = (x, y, w, h) => {
        c.fillStyle = '#0b0c0e'; rrect(c, x, y, w, h, 26); c.fill();
        c.strokeStyle = '#26282c'; c.lineWidth = 3; c.stroke();
      };
      screen(70, 60, 460, 480); screen(1070, 60, 460, 480);
      // left screen: virtual speedometer + boost dial
      if (o.left !== 'pages') {
        const vdial = (x, y, r, max, val, maj, mi, lbl, title, red) => {
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#000'; c.fill();
          c.lineWidth = 2; c.strokeStyle = '#3a3c40'; c.stroke();
          const an = dial(c, { x, y, r: r * 0.95, min: 0, max, major: maj, minor: mi, tickColor: '#e8e8e8', labelColor: '#f0f0f0', labelSize: r * 0.15, labelR: 0.7, font: 'Barlow Condensed', weight: 600, label: lbl, red });
          text(c, title, x, y + r * 0.42, r * 0.11, '#9a9a9a', 'center', 'Barlow Condensed', 600);
          needle(c, x, y, an(val), { len: r * 0.88, w: r * 0.035, color: o.needle, cap: r * 0.1, capColor: '#111' });
        };
        const [smax, smaj] = sScale([300, 20, 10], [190, 20, 5]);
        vdial(220, 300, 135, smax, spd(d), smaj * 2, smaj, (v) => String(v), U.speedLabel());
        const bmax = BD.settings.pressUnit === 'psi' ? 25 : BD.settings.pressUnit === 'kpa' ? 175 : 1.75;
        vdial(430, 330, 85, bmax, Math.max(0, U.boost(d.boost)), bmax / 5, bmax / 25, (v) => (bmax < 5 ? v.toFixed(1) : String(Math.round(v))), `BOOST ${U.pressLabel()}`);
        text(c, `${odoStr(d)} ${U.distLabel()}`, 300, 500, 20, '#9a9a9a', 'center', 'Barlow Condensed', 600);
        text(c, `${Math.round(tempC(d))}${U.tempLabel()} WATER   ${Math.round(d.fuel * 100)}% FUEL`, 300, 100, 20, '#cfcfcf', 'center', 'Barlow Condensed', 600);
      }
      // centre: big analog tachometer
      const x = 800, y = 300, r = 270;
      const g = c.createLinearGradient(x, y - r, x, y + r); g.addColorStop(0, '#d8d8d8'); g.addColorStop(0.5, '#4a4a4a'); g.addColorStop(1, '#b8b8b8');
      c.beginPath(); c.arc(x, y, r + 10, 0, TAU); c.fillStyle = g; c.fill();
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#121212'); c.fill();
      const ang = dial(c, { x, y, r: r * 0.96, min: 0, max: kmax(d), major: 1, minor: 0.2, mid: 0.5, a0: 0.75 * PI, a1: 2.25 * PI, tickColor: '#f4f4f4', labelColor: '#f4f4f4', labelSize: r * 0.17, labelR: 0.7, font: 'Barlow Condensed', weight: 600, majorW: 5, minorW: 2, red: { from: d.redFrom / 1000, r: 0.92, w: 0.07, color: '#e8231a' } });
      text(c, '1/min x1000', x, y - r * 0.3, 18, '#9a9a9a', 'center', 'Barlow Condensed', 600);
      text(c, Math.round(spd(d)), x, y + r * 0.36, 64, '#fff', 'center', 'Barlow Condensed', 600);
      text(c, U.speedLabel(), x, y + r * 0.53, 18, '#9a9a9a', 'center', 'Barlow Condensed', 600);
      c.fillStyle = '#000'; rrect(c, x + r * 0.28, y - 26, 64, 52, 8); c.fill();
      text(c, gearMain(d), x + r * 0.28 + 32, y + 2, 40, a, 'center', 'Barlow Condensed', 700);
      needle(c, x, y, ang(d.rpm / 1000), { len: r * 0.92, w: 9, style: 'classic', tail: r * 0.2, color: o.needle, cap: 34, capColor: '#151515', capRim: '#555' });
      G.glass(c, x, y, r);
      lightRow(c, d, 800, 575, 26, 8, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'cruise', 'sigR'] });
    },
  });

  reg({
    id: 'skyline99', name: "Neo Skyline '99", era: '1990s', region: 'Japan', inspired: 'Nissan Skyline GT-R (R34) with centre multi-function display', glass: true,
    opts: [
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff2a1a' },
      { k: 'mfdColor', label: 'MFD highlight', type: 'color', def: '#ffd200' },
    ],
    mfd: (o) => ({ x: 1140, y: 70, w: 420, h: 460, theme: { bg: '#071126', fg: '#e8f4ff', dim: '#6f9bd1', accent: o.mfdColor || '#ffd200', font: 'Orbitron', line: 'rgba(111,155,209,.25)', mapTheme: 'night' } }),
    draw(c, d, k) {
      const o = k.o;
      const bg = c.createLinearGradient(0, 0, 0, 600); bg.addColorStop(0, '#15181d'); bg.addColorStop(1, '#07080a');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      // MFD bezel (the screen itself is drawn by the multi-function display)
      c.fillStyle = '#000'; rrect(c, 1126, 56, 448, 488, 18); c.fill();
      c.strokeStyle = '#2b3442'; c.lineWidth = 3; c.stroke();
      text(c, 'MULTI FUNCTION DISPLAY', 1350, 562, 13, '#6f9bd1', 'center', 'Orbitron', 500);
      const pod = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 12, 0, TAU); c.fillStyle = '#000'; c.fill();
        c.beginPath(); c.arc(x, y, r + 4, 0, TAU); c.fillStyle = '#2a2d33'; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#101114'); c.fill();
      };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: len * 0.03, tail: len * 0.18, glow: o.needle, glowBlur: 6, cap: len * 0.11, capColor: '#0d0d0d', capRim: '#3a3a3a' });
      // speedometer
      let x = 280, y = 330, r = 190;
      pod(x, y, r);
      const [smax, smaj, smin] = sScale([180, 20, 10], [120, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#f2f2f2', labelColor: '#f2f2f2', labelSize: r * 0.14, labelR: 0.72, font: 'Rajdhani', weight: 700 });
      text(c, U.speedLabel(), x, y - r * 0.32, 16, '#aaa', 'center', 'Rajdhani', 600);
      text(c, odoStr(d), x, y + r * 0.42, 22, '#d8d8d8', 'center', 'Orbitron', 500);
      nd(x, y, ang(spd(d)), r * 0.88);
      G.glass(c, x, y, r);
      // tachometer, centre
      x = 710; y = 300; r = 250;
      pod(x, y, r);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: Math.max(10, kmax(d)), major: 1, minor: 0.2, mid: 0.5, tickColor: '#f2f2f2', labelColor: '#f2f2f2', labelSize: r * 0.15, labelR: 0.7, font: 'Rajdhani', weight: 700, red: { from: d.redFrom / 1000, r: 0.88, w: 0.09, color: '#d6141a' } });
      text(c, 'x1000r/min', x, y - r * 0.3, 18, '#aaa', 'center', 'Rajdhani', 600);
      text(c, gearMain(d), x, y + r * 0.4, 46, '#ffd200', 'center', 'Orbitron', 700);
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      G.glass(c, x, y, r);
      // boost
      x = 1030; y = 455; r = 82;
      pod(x, y, r);
      const bar2 = BD.settings.pressUnit !== 'psi';
      ang = dial(c, { x, y, r: r * 0.93, min: bar2 ? -1 : -15, max: bar2 ? 1.5 : 22, major: bar2 ? 0.5 : 5, minor: bar2 ? 0.1 : 1, tickColor: '#f2f2f2', labelColor: '#f2f2f2', labelSize: r * 0.2, labelR: 0.66, font: 'Rajdhani', weight: 700, label: (v) => (bar2 ? v.toFixed(1) : String(v)) });
      text(c, 'BOOST', x, y + r * 0.42, 12, '#aaa', 'center', 'Rajdhani', 700);
      nd(x, y, ang(BD.settings.pressUnit === 'kpa' ? U.boost(d.boost) / 100 : U.boost(d.boost)), r * 0.86);
      // fuel + temp bars under the speedometer
      text(c, 'FUEL', 130, 560, 14, '#aaa', 'left', 'Rajdhani', 700);
      segments(c, 175, 552, 140, 16, 10, fuelFrac(d), (f) => (f < 0.15 ? '#ffb000' : '#f2f2f2'), '#222', 0.25);
      text(c, 'TEMP', 330, 560, 14, '#aaa', 'left', 'Rajdhani', 700);
      segments(c, 375, 552, 100, 16, 8, waterFrac(d), (f) => (f > 0.8 ? '#ff2a1a' : '#f2f2f2'), '#222', 0.25);
      lightRow(c, d, 710, 30, 26, 6, { list: ['sigL', 'high', 'park', 'abs', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  reg({
    id: 'truck19', name: "Heartland Pickup '19", era: '2010s', region: 'US', inspired: 'American full-size pickup (Ford / GM trucks)', glass: true,
    opts: [
      { k: 'numbers', label: 'Numerals', type: 'color', def: '#dfe9ff' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff3b1f' },
      { k: 'accent', label: 'Screen accent', type: 'color', def: '#3f9bff' },
    ],
    mfd: (o) => ({ x: 652, y: 92, w: 296, h: 396, theme: { bg: 'rgba(6,10,16,.96)', accent: o.accent || '#3f9bff', font: 'Rajdhani' } }),
    draw(c, d, k) {
      const o = k.o, num = o.numbers;
      c.fillStyle = '#0d0f12'; c.fillRect(0, 0, 1600, 600);
      // textured dash panel
      c.strokeStyle = 'rgba(255,255,255,.025)'; c.lineWidth = 2;
      for (let i = -600; i < 1600; i += 10) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 600, 600); c.stroke(); }
      const pod = (x, y, r, w = 10) => {
        c.beginPath(); c.arc(x, y, r + w + 8, 0, TAU); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill();
        chrome(c, x, y, r, w);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#1b1e23'); c.fill();
      };
      const nd = (x, y, a, len) => needle(c, x, y, a, { len, color: o.needle, w: len * 0.035, tail: len * 0.18, cap: len * 0.11, capColor: '#16181c', capRim: '#777' });
      const small = (x, y, frac, lo, hi, name, ic, warnEnd) => {
        pod(x, y, 66, 6);
        mini(c, x, y + 12, 52, frac, { lo, hi, tick: num, label: num, needle: o.needle, size: 13, font: 'Rajdhani', [warnEnd ? 'redEnd' : 'redStart']: true, labelR: 1.12 });
        icon(c, ic, x, y + 34, 18, '#8fa0b8');
        text(c, name, x, y - 38, 11, '#8fa0b8', 'center', 'Rajdhani', 700);
      };
      small(110, 175, fuelFrac(d), 'E', 'F', 'FUEL', 'fuel', false);
      small(110, 415, waterFrac(d), 'C', 'H', 'ENGINE', 'temp', true);
      small(1490, 175, oilP(d) / 80, '0', '80', 'OIL PSI', 'oil', false);
      small(1490, 415, (volts(d) - 8) / 10, '8', '18', 'VOLTS', 'battery', false);
      // speedometer
      let x = 410, y = 300, r = 215;
      pod(x, y, r);
      const [smax, smaj, smin] = sScale([200, 20, 10], [120, 10, 5]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: num, labelColor: num, labelSize: r * 0.13, labelR: 0.72, font: 'Rajdhani', weight: 700, majorW: 4, minorW: 2, label: (v) => (mph() || (v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, mph() ? 'MPH' : 'KM/H', x, y - r * 0.32, 16, '#8fa0b8', 'center', 'Rajdhani', 700);
      text(c, `${odoStr(d)}`, x, y + r * 0.42, 20, num, 'center', 'Rajdhani', 600);
      nd(x, y, ang(spd(d)), r * 0.88);
      G.glass(c, x, y, r);
      // tachometer
      x = 1190;
      pod(x, y, r);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.25, tickColor: num, labelColor: num, labelSize: r * 0.15, labelR: 0.7, font: 'Rajdhani', weight: 700, majorW: 4, minorW: 2, red: { from: d.redFrom / 1000, r: 0.9, w: 0.08, color: '#d6231a' } });
      text(c, 'RPM x1000', x, y - r * 0.32, 16, '#8fa0b8', 'center', 'Rajdhani', 700);
      nd(x, y, ang(d.rpm / 1000), r * 0.88);
      G.glass(c, x, y, r);
      // centre screen bezel + gear selector
      c.fillStyle = '#000'; rrect(c, 640, 80, 320, 420, 16); c.fill();
      c.strokeStyle = '#3a4048'; c.lineWidth = 3; c.stroke();
      gearRow(c, d, 800, 540, 34, '#fff', 'rgba(255,255,255,.18)', ['P', 'R', 'N', 'D', 'L'], 'Rajdhani');
      lightRow(c, d, 800, 40, 28, 6, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'cruise', 'sigR'] });
    },
  });

  // =============================================================== alpha 0.04 designs
  // EV / hybrid power meter: regen (green) below zero, power up to 100 % of the car's peak
  function powerDial(c, d, x, y, r, o = {}) {
    const pct = clamp((d.isEV || d.isHybrid ? d.motorKw + Math.max(0, d.engKw) : Math.max(0, d.engKw)) / d.maxPowerKw * 100, -30, 100);
    const a0 = o.a0 ?? 0.75 * PI, a1 = o.a1 ?? 2.25 * PI;
    const ang = (v) => a0 + (v + 30) / 130 * (a1 - a0);
    c.save();
    c.lineCap = 'butt';
    c.lineWidth = o.w || r * 0.1;
    c.strokeStyle = o.track || 'rgba(255,255,255,.08)';
    c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke();
    c.strokeStyle = 'rgba(43,212,106,.25)';
    c.beginPath(); c.arc(x, y, r, a0, ang(0)); c.stroke();
    if (Math.abs(pct) > 0.5) {
      c.strokeStyle = pct < 0 ? '#2bd46a' : (o.color || '#4aa3ff');
      glow(c, c.strokeStyle, 14);
      c.beginPath(); c.arc(x, y, r, Math.min(ang(0), ang(pct)), Math.max(ang(0), ang(pct))); c.stroke();
      noGlow(c);
    }
    for (const v of [-30, 0, 25, 50, 75, 100]) {
      const a = ang(v);
      text(c, v === -30 ? 'CHG' : String(v), x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.09, v < 0 ? '#2bd46a' : (o.label || 'rgba(255,255,255,.6)'), 'center', o.font || 'Rajdhani', 700);
    }
    c.restore();
    return pct;
  }
  const levelPct = (d) => Math.round((d.isEV && d.battery !== null ? d.battery : d.fuel) * 100);

  // ---------------- US ----------------
  reg({
    id: 'ponyS650', name: "Pony S650 '24", era: '2020s', region: 'US', inspired: 'Ford Mustang S650 digital cluster (with retro Fox-body mode)',
    opts: [
      { k: 'theme', label: 'Theme', type: 'select', options: ['modern', 'fox87'], def: 'modern' },
      { k: 'accent', label: 'Accent', type: 'color', def: '#2f8bff' },
    ],
    mfd: (o) => (o.theme === 'fox87' ? null : { x: 1110, y: 70, w: 450, h: 470, theme: { accent: o.accent || '#2f8bff', bg: 'rgba(10,16,28,.8)' } }),
    mfdTheme: { bg: 'rgba(0,0,0,.95)', accent: '#ff7a1a', fg: '#9dff9d', dim: 'rgba(157,255,157,.6)', font: 'Orbitron', line: 'rgba(157,255,157,.15)' },
    draw(c, d, k) {
      const a = accent(k, '#2f8bff');
      if (k.o.theme === 'fox87') {
        // 1987 Fox-body throwback: straight horizontal scales with sliding orange needles
        c.fillStyle = '#050505'; c.fillRect(0, 0, 1600, 600);
        const strip = (y, max, step, val, label, fmt) => {
          c.fillStyle = '#0b0b0b'; rrect(c, 80, y - 70, 1440, 140, 14); c.fill();
          c.strokeStyle = '#1e1e1e'; c.lineWidth = 3; c.stroke();
          for (let v = 0; v <= max; v += step / 2) {
            const x = 140 + v / max * 1320, major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
            c.fillStyle = '#e8e8e8'; c.fillRect(x - (major ? 2 : 1), y - 30, major ? 4 : 2, major ? 34 : 18);
            if (major) text(c, fmt(v), x, y + 30, 26, '#e8e8e8', 'center', 'Barlow Condensed', 600);
          }
          text(c, label, 110, y - 52, 18, '#9dff9d', 'left', 'Orbitron', 600);
          const nx = 140 + clamp(val / max, 0, 1) * 1320;
          glow(c, '#ff7a1a', 12); c.fillStyle = '#ff7a1a'; c.fillRect(nx - 4, y - 58, 8, 80); noGlow(c);
        };
        const [smax] = sScale([240], [140]);
        strip(150, smax, mph() ? 20 : 20, spd(d), mph() ? 'MPH' : 'KM/H', String);
        strip(350, kmax(d), 1, d.rpm / 1000, 'RPM x1000', String);
        text(c, `FUEL ${Math.round(d.fuel * 100)}%   TEMP ${Math.round(tempC(d))}°   OIL ${Math.round(oilP(d))} PSI   ${d.gear}`, 800, 520, 32, '#9dff9d', 'center', 'Orbitron', 600);
        text(c, odoStr(d), 1450, 520, 26, '#e8e8e8', 'right', 'Orbitron', 500);
        lightRow(c, d, 220, 520, 26, 6, { list: ['sigL', 'high', 'park', 'sigR'] });
        return;
      }
      const bg = c.createLinearGradient(0, 0, 0, 600); bg.addColorStop(0, '#0a1322'); bg.addColorStop(1, '#03060b');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      // left: tach arc with segmented fill
      const x = 360, y = 330, r = 240;
      dial(c, { x, y, r, min: 0, max: kmax(d), major: 1, minor: 0.5, a0: 0.75 * PI, a1: 2.0 * PI, tickColor: 'rgba(255,255,255,.7)', labelColor: '#fff', labelSize: 30, labelR: 0.78, font: 'Rajdhani', weight: 700, red: { from: d.redFrom / 1000, r: 0.98, w: 0.04, color: '#ff2a2a' } });
      arcSegs(c, x, y, r * 0.9, 26, 0.75 * PI, 2.0 * PI, 40, d.rpm / d.tachMax, (f) => (f * d.tachMax > d.redFrom ? '#ff2a2a' : a), 'rgba(255,255,255,.05)', 0.25);
      text(c, gearMain(d), x, y + 10, 120, '#fff', 'center', 'Rajdhani', 700);
      text(c, `${Math.round(d.rpm)} rpm`, x, y + 90, 22, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
      // centre: speed
      text(c, Math.round(spd(d)), 820, 260, 170, '#fff', 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), 820, 360, 28, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
      setSpeedChip(c, d, 720, 440, 34, a);
      limit(c, d, 900, 445, 30);
      bar(c, 650, 520, 340, 10, d.fuel, d.lights.lowFuel ? '#ffb000' : a, 'rgba(255,255,255,.1)', false, 5);
      text(c, `${Math.round(d.fuel * 100)}%  ${rangeStr(d)}`, 820, 555, 20, 'rgba(255,255,255,.7)', 'center', 'Rajdhani', 600);
      lightRow(c, d, 800, 36, 28, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  reg({
    id: 'c8_20', name: "Mid-Engine '20", era: '2020s', region: 'US', inspired: 'Chevrolet Corvette C8 (sport view)',
    opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#ffd21f' }],
    mfd: (o) => ({ x: 1130, y: 170, w: 430, h: 380, theme: { accent: o.accent || '#ffd21f', bg: 'rgba(255,255,255,.04)' } }),
    draw(c, d, k) {
      const a = accent(k, '#ffd21f');
      c.fillStyle = '#05060a'; c.fillRect(0, 0, 1600, 600);
      // wide curved tach band across the top
      const cx = 800, cy = 1180, r = 1040, a0 = 1.33 * PI, a1 = 1.67 * PI;
      const km = kmax(d);
      for (let v = 0; v <= km; v += 0.5) {
        const an = a0 + v / km * (a1 - a0), major = v % 1 === 0;
        c.strokeStyle = v * 1000 >= d.redFrom ? '#ff2a2a' : 'rgba(255,255,255,.7)'; c.lineWidth = major ? 4 : 2;
        c.beginPath(); c.moveTo(cx + Math.cos(an) * (r + 4), cy + Math.sin(an) * (r + 4)); c.lineTo(cx + Math.cos(an) * (r + (major ? 30 : 16)), cy + Math.sin(an) * (r + (major ? 30 : 16))); c.stroke();
        if (major) text(c, String(v), cx + Math.cos(an) * (r + 56), cy + Math.sin(an) * (r + 56), 26, '#fff', 'center', 'Rajdhani', 700);
      }
      arcBar(c, cx, cy, r - 22, 40, a0, a1, d.rpm / d.tachMax, d.rpm > d.redFrom ? '#ff2a2a' : a, 'rgba(255,255,255,.05)', { glow: a });
      text(c, Math.round(spd(d)), 800, 330, 150, '#fff', 'center', 'Rajdhani', 700);
      text(c, U.speedLabel(), 800, 420, 26, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
      c.strokeStyle = a; c.lineWidth = 3; rrect(c, 950, 260, 110, 110, 14); c.stroke();
      text(c, gearMain(d), 1005, 318, 80, a, 'center', 'Rajdhani', 700);
      // left vitals
      const row = (y, l, v, f, warn) => {
        text(c, l, 70, y, 20, 'rgba(255,255,255,.6)', 'left', 'Rajdhani', 600);
        text(c, v, 470, y, 28, warn ? '#ff3a2a' : '#fff', 'right', 'Rajdhani', 700);
        bar(c, 70, y + 18, 400, 6, f, warn ? '#ff3a2a' : a, 'rgba(255,255,255,.08)', false, 3);
      };
      row(220, 'OIL TEMP', `${Math.round(U.temp(d.oilT))}${U.tempLabel()}`, clamp((d.oilT - 40) / 110, 0, 1), d.oilT > 135);
      row(300, 'COOLANT', `${Math.round(tempC(d))}${U.tempLabel()}`, waterFrac(d), d.water > 112);
      row(380, 'OIL PRESS', `${Math.round(oilP(d))} psi`, oilP(d) / 90, false);
      row(460, 'FUEL', `${Math.round(d.fuel * 100)}%`, d.fuel, d.lights.lowFuel);
      setSpeedChip(c, d, 700, 500, 32, a);
      limit(c, d, 890, 505, 28);
      lightRow(c, d, 800, 575, 26, 8, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  reg({
    id: 'ridgeEV24', name: "Volt Ridge EV '24", era: '2020s', region: 'US', inspired: 'American electric pickups (Rivian / F-150 Lightning)',
    opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#ffb000' }],
    mfd: (o) => ({ x: 1120, y: 60, w: 440, h: 480, theme: { accent: o.accent || '#ffb000', bg: 'rgba(255,255,255,.04)' } }),
    draw(c, d, k) {
      const a = accent(k, '#ffb000');
      const bg = c.createLinearGradient(0, 0, 1600, 0); bg.addColorStop(0, '#0e1210'); bg.addColorStop(1, '#050706');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      const pct = powerDial(c, d, 300, 320, 220, { color: a });
      text(c, `${Math.round(pct)}%`, 300, 300, 70, '#fff', 'center', 'Rajdhani', 700);
      text(c, pct < 0 ? 'REGEN' : 'POWER', 300, 360, 22, pct < 0 ? '#2bd46a' : a, 'center', 'Rajdhani', 700);
      text(c, `${Math.round(d.motorKw + Math.max(0, d.engKw))} kW`, 300, 400, 24, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
      text(c, Math.round(spd(d)), 800, 240, 180, '#fff', 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), 800, 345, 28, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
      gearRow(c, d, 800, 410, 34, '#fff', 'rgba(255,255,255,.2)', ['P', 'R', 'N', 'D'], 'Rajdhani');
      // battery (or fuel on non-EVs)
      const lvl = levelPct(d) / 100;
      c.fillStyle = 'rgba(255,255,255,.08)'; rrect(c, 600, 470, 400, 44, 10); c.fill();
      c.fillStyle = lvl < 0.15 ? '#ff3b30' : '#2bd46a'; rrect(c, 604, 474, 392 * clamp(lvl, 0, 1), 36, 8); c.fill();
      c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(1002, 482, 8, 20);
      text(c, `${Math.round(lvl * 100)}%   ${rangeStr(d)}`, 800, 545, 24, '#fff', 'center', 'Rajdhani', 700);
      limit(c, d, 640, 110, 30);
      setSpeedChip(c, d, 700, 110, 32, a);
      lightRow(c, d, 800, 36, 26, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'battery', 'tpms', 'sigR'] });
    },
  });

  reg({
    id: 'ss69', name: "Super Sport '69", era: '1960s', region: 'US', inspired: 'Late-60s muscle car with ribbon speedometer', glass: true,
    opts: [
      { k: 'ribbon', label: 'Ribbon colour', type: 'color', def: '#ff3a1a' },
      { k: 'panel', label: 'Panel', type: 'select', options: ['woodgrain', 'brushed'], def: 'woodgrain' },
    ],
    mfdTheme: { bg: 'rgba(14,10,6,.96)', accent: '#ff7a1a', font: 'Barlow Condensed' },
    draw(c, d, k) {
      const o = k.o;
      if (o.panel === 'woodgrain') {
        const g = c.createLinearGradient(0, 0, 0, 600); g.addColorStop(0, '#5a3418'); g.addColorStop(1, '#2a1708');
        c.fillStyle = g; c.fillRect(0, 0, 1600, 600);
        c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 2;
        for (let i = 0; i < 40; i++) { c.beginPath(); c.moveTo(0, i * 16); c.bezierCurveTo(500, i * 16 + 18 * Math.sin(i * 1.3), 1100, i * 16 - 16 * Math.cos(i), 1600, i * 16 + 5); c.stroke(); }
      } else {
        c.fillStyle = '#262626'; c.fillRect(0, 0, 1600, 600);
        for (let i = 0; i < 600; i += 3) { c.fillStyle = `rgba(255,255,255,${0.02 + 0.03 * Math.abs(Math.sin(i * 1.7))})`; c.fillRect(0, i, 1600, 1); }
      }
      // ribbon speedometer window
      const [smax] = sScale([200], [120]);
      c.fillStyle = '#0a0a0a'; rrect(c, 160, 60, 1280, 150, 75); c.fill();
      c.strokeStyle = '#c9c9c9'; c.lineWidth = 8; rrect(c, 160, 60, 1280, 150, 75); c.stroke();
      const x0 = 240, x1 = 1360;
      c.fillStyle = o.ribbon; glow(c, o.ribbon, 10);
      c.fillRect(x0, 120, (x1 - x0) * clamp(spd(d) / smax, 0, 1), 30); noGlow(c);
      for (let v = 0; v <= smax; v += 10) {
        const x = x0 + v / smax * (x1 - x0);
        c.fillStyle = '#eee'; c.fillRect(x - 1.5, 100, 3, v % 20 === 0 ? 16 : 8);
        if (v % 20 === 0) text(c, String(v), x, 175, 26, '#f2f2f2', 'center', 'Barlow Condensed', 700);
      }
      text(c, mph() ? 'MPH' : 'KM/H', 200, 135, 18, '#bbb', 'center', 'Barlow Condensed', 700);
      // tach pod + small pods
      const pod = (x, y, r) => { chrome(c, x, y, r, 10); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#151515'); c.fill(); };
      let x = 800, y = 400, r = 165;
      pod(x, y, r);
      const ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.5, tickColor: '#eee', labelColor: '#f2f2f2', labelSize: r * 0.18, labelR: 0.68, weight: 700, red: { from: d.redFrom / 1000, r: 0.88, w: 0.1 } });
      text(c, 'RPM x1000', x, y + r * 0.4, 16, '#aaa', 'center', 'Barlow Condensed', 700);
      needle(c, x, y, ang(d.rpm / 1000), { len: r * 0.86, color: '#ff7a1a', w: r * 0.035, cap: r * 0.12, capColor: '#111', capRim: '#888' });
      G.glass(c, x, y, r);
      const small = (sx, frac, lo, hi, name, red) => {
        pod(sx, 400, 110);
        mini(c, sx, 420, 88, frac, { lo, hi, name, needle: '#ff7a1a', tick: '#ddd', label: '#ddd', font: 'Barlow Condensed', [red]: true, size: 22 });
        G.glass(c, sx, 400, 110);
      };
      small(400, fuelFrac(d), 'E', 'F', 'FUEL', 'redStart');
      small(1200, waterFrac(d), 'C', 'H', 'TEMP', 'redEnd');
      const L = d.lights;
      if (L.sigL) { glow(c, LIGHT.green, 14); icon(c, 'sigL', 560, 270, 44, LIGHT.green); noGlow(c); }
      if (L.sigR) { glow(c, LIGHT.green, 14); icon(c, 'sigR', 1040, 270, 44, LIGHT.green); noGlow(c); }
      lightRow(c, d, 800, 580, 24, 8, { list: ['high', 'park', 'oil', 'battery'] });
    },
  });

  reg({
    id: 'luxe21', name: "Lux Digital '21", era: '2020s', region: 'US', inspired: 'American luxury digital clusters (Cadillac / Lincoln)',
    opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#c8a46a' }],
    mfd: (o) => ({ x: 1110, y: 90, w: 440, h: 420, theme: { accent: o.accent || '#c8a46a', bg: 'rgba(200,164,106,.05)', font: 'Rajdhani', fg: '#f3ede4', dim: 'rgba(243,237,228,.55)' } }),
    draw(c, d, k) {
      const a = accent(k, '#c8a46a');
      const bg = c.createRadialGradient(560, 300, 50, 560, 300, 900); bg.addColorStop(0, '#1a1712'); bg.addColorStop(1, '#050403');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      // left: thin power ring
      const pct = powerDial(c, d, 230, 310, 160, { color: a, w: 8, label: 'rgba(243,237,228,.55)' });
      text(c, `${Math.round(Math.max(0, pct))}%`, 230, 300, 46, '#f3ede4', 'center', 'Rajdhani', 500);
      text(c, 'POWER', 230, 345, 16, a, 'center', 'Rajdhani', 700);
      // centre: speed inside a fine ring with an rpm sweep
      const x = 650, y = 300, r = 230;
      c.strokeStyle = 'rgba(200,164,106,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      arcBar(c, x, y, r - 14, 6, 0.75 * PI, 2.25 * PI, d.rpm / d.tachMax, a, 'rgba(255,255,255,.05)', { glow: a });
      text(c, Math.round(spd(d)), x, y - 10, 140, '#f3ede4', 'center', 'Rajdhani', 500);
      text(c, U.speedLabel(), x, y + 70, 24, 'rgba(243,237,228,.6)', 'center', 'Rajdhani', 600);
      text(c, d.gear, x, y + 130, 40, a, 'center', 'Rajdhani', 700);
      limit(c, d, x - 70, y - 160, 26);
      setSpeedChip(c, d, x + 10, y - 160, 30, a);
      text(c, `${BD.clock(d.tod)}   ${Math.round(d.fuel * 100)}%   ${rangeStr(d)}`, 650, 572, 20, 'rgba(243,237,228,.55)', 'center', 'Rajdhani', 600);
      lightRow(c, d, 650, 30, 24, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'sigR'] });
    },
  });

  // ---------------- Euro ----------------
  reg({
    id: 'neueKlasse26', name: "Neue Klasse '26", era: '2020s', region: 'Euro', inspired: 'BMW Panoramic iDrive (2026): info strip across the windscreen base', adasNative: true,
    opts: [
      { k: 'accent', label: 'Accent', type: 'color', def: '#6fb6ff' },
      { k: 'strip', label: 'Strip tint', type: 'select', options: ['clear', 'warm'], def: 'clear' },
    ],
    mfd: (o) => ({ x: 330, y: 250, w: 940, h: 320, theme: { accent: o.accent || '#6fb6ff', bg: 'rgba(255,255,255,.035)' } }),
    draw(c, d, k) {
      const a = accent(k, '#6fb6ff');
      c.fillStyle = '#020306'; c.fillRect(0, 0, 1600, 600);
      // the panoramic strip
      const sg = c.createLinearGradient(0, 30, 0, 200);
      sg.addColorStop(0, k.o.strip === 'warm' ? 'rgba(255,190,140,.10)' : 'rgba(140,190,255,.10)'); sg.addColorStop(1, 'rgba(255,255,255,.02)');
      c.fillStyle = sg; rrect(c, 30, 30, 1540, 180, 40); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
      limit(c, d, 110, 120, 42);
      text(c, Math.round(spd(d)), 290, 118, 110, '#fff', 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), 290, 182, 20, 'rgba(255,255,255,.5)', 'center', 'Rajdhani', 600);
      gearRow(c, d, 470, 120, 30, '#fff', 'rgba(255,255,255,.18)', ['P', 'R', 'N', 'D'], 'Rajdhani');
      // assist status
      if (d.cruise.on) setSpeedChip(c, d, 600, 120, 34, a);
      const adasCol = d.fcw ? (d.fcw === 2 ? '#ff2a1f' : '#ffb000') : 'rgba(255,255,255,.45)';
      icon(c, 'acc', 760, 120, 40, d.adas && d.adas.acc ? a : 'rgba(255,255,255,.25)');
      icon(c, 'fcw', 830, 120, 40, adasCol);
      if (d.bsmL || d.bsmR) icon(c, 'bsm', 900, 120, 40, '#ffb000');
      // navigation
      const n = BD.navNext(d.route, d.pos);
      if (n) {
        navArrow(c, 1000, 120, 70, n.dir, a);
        text(c, n.dir === 'arrive' ? 'Arriving' : U.shortDist(n.dist), 1050, 105, 40, '#fff', 'left', 'Rajdhani', 700);
        text(c, `${U.shortDist(n.total)} to go`, 1050, 145, 20, 'rgba(255,255,255,.55)', 'left', 'Rajdhani', 600);
      } else text(c, BD.clock(d.tod), 1080, 120, 44, '#fff', 'center', 'Rajdhani', 600);
      // energy
      const lvl = levelPct(d);
      c.fillStyle = 'rgba(255,255,255,.1)'; rrect(c, 1300, 100, 180, 14, 7); c.fill();
      c.fillStyle = lvl < 12 ? '#ffb000' : a; rrect(c, 1300, 100, 180 * lvl / 100, 14, 7); c.fill();
      text(c, `${lvl}%  ${rangeStr(d)}`, 1390, 145, 22, '#fff', 'center', 'Rajdhani', 700);
      // rpm / power as a hairline under the strip
      const f = d.isEV ? clamp(d.motorKw / d.maxPowerKw, 0, 1) : d.rpm / d.tachMax;
      c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(70, 200, 1460, 4);
      c.fillStyle = !d.isEV && d.rpm > d.redFrom ? '#ff2a2a' : a; c.fillRect(70, 200, 1460 * f, 4);
      lightRow(c, d, 800, 232, 22, 10, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'tpms', 'sigR'] });
    },
  });

  reg({
    id: 'bavMTrack24', name: "Bavaria M Track '24", era: '2020s', region: 'Euro', inspired: 'BMW M curved display in track mode', adasNative: false,
    opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#1c69d4' }],
    mfd: (o) => ({ x: 1080, y: 160, w: 480, h: 400, theme: { accent: o.accent || '#1c69d4', bg: 'rgba(255,255,255,.04)', font: 'Rajdhani' } }),
    draw(c, d, k) {
      const a = accent(k, '#1c69d4');
      c.fillStyle = '#030406'; c.fillRect(0, 0, 1600, 600);
      // shift lights that close in from both ends, then flash
      const lo = d.shiftRpm * 0.7, f = clamp((d.rpm - lo) / (d.shiftRpm - lo), 0, 1), n = 10;
      const flash = d.rpm >= d.shiftRpm && Math.floor(k.t * 12) % 2 === 0;
      for (let i = 0; i < n; i++) {
        const lit = d.rpm >= d.shiftRpm ? flash : f * n > i;
        const col = i < 4 ? '#1c69d4' : i < 7 ? '#6b2c91' : '#e4002b';
        for (const side of [-1, 1]) {
          const x = 800 + side * (700 - i * 66);
          c.fillStyle = lit ? col : 'rgba(255,255,255,.06)';
          if (lit) glow(c, col, 14);
          rrect(c, x - 26, 30, 52, 22, 6); c.fill(); noGlow(c);
        }
      }
      // horizontal tach
      const km = kmax(d);
      segments(c, 120, 80, 1360, 46, 80, d.rpm / d.tachMax, (ff) => (ff * d.tachMax > d.redFrom ? '#e4002b' : '#fff'), 'rgba(255,255,255,.06)', 0.3);
      for (let v = 0; v <= km; v++) text(c, String(v), 120 + v / km * 1360, 146, 20, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 700);
      // gear, speed
      text(c, gearMain(d), 800, 330, 230, '#fff', 'center', 'Rajdhani', 700);
      text(c, Math.round(spd(d)), 300, 300, 130, '#fff', 'center', 'Rajdhani', 700);
      text(c, U.speedLabel(), 300, 380, 24, 'rgba(255,255,255,.55)', 'center', 'Rajdhani', 600);
      // lap strip from the lap timer
      const lp = (BD.st.perf || {}).lap || {};
      c.fillStyle = 'rgba(255,255,255,.05)'; rrect(c, 80, 450, 900, 110, 16); c.fill();
      const t = BD.lapNow();
      text(c, lp.running ? `LAP ${lp.n}` : 'LAP', 110, 480, 20, 'rgba(255,255,255,.55)', 'left', 'Rajdhani', 700);
      text(c, lp.running && typeof t === 'number' ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '--:--.--', 110, 530, 46, '#fff', 'left', 'Rajdhani', 700);
      if (typeof lp.delta === 'number') text(c, `${lp.delta > 0 ? '+' : '−'}${Math.abs(lp.delta).toFixed(2)}`, 560, 520, 50, lp.delta <= 0 ? '#2bd46a' : '#e4002b', 'center', 'Rajdhani', 700);
      text(c, `BEST ${lp.best ? lp.best.time.toFixed(2) : '--'}`, 950, 530, 26, a, 'right', 'Rajdhani', 700);
      // stripe accent
      [['#1c69d4', 0], ['#6b2c91', 1], ['#e4002b', 2]].forEach(([col, i]) => { c.fillStyle = col; c.fillRect(80 + i * 14, 175, 10, 40); });
      text(c, `OIL ${Math.round(U.temp(d.oilT))}°   H2O ${Math.round(tempC(d))}°   BOOST ${U.boost(d.boost).toFixed(1)}`, 140, 196, 22, 'rgba(255,255,255,.7)', 'left', 'Rajdhani', 700);
    },
  });

  reg({
    id: 'maranello05', name: "Maranello '05", era: '2000s', region: 'Euro', inspired: 'Italian supercar with yellow centre tach (Ferrari F430 era)', glass: true,
    opts: [
      { k: 'face', label: 'Tach face', type: 'color', def: '#f2c200' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#d40000' },
    ],
    mfd: () => ({ x: 1090, y: 90, w: 450, h: 420, theme: { accent: '#f2c200', bg: 'rgba(10,10,10,.95)', font: 'Barlow Condensed' } }),
    draw(c, d, k) {
      const o = k.o;
      c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, 1600, 600);
      c.strokeStyle = 'rgba(255,255,255,.03)'; c.lineWidth = 5;
      for (let i = -600; i < 1600; i += 12) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 600, 600); c.stroke(); }
      c.fillStyle = '#000'; rrect(c, 1076, 76, 478, 448, 18); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 3; c.stroke();
      // speedo (left)
      let x = 300, y = 320, r = 190;
      chrome(c, x, y, r, 7);
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#141414'); c.fill();
      const [smax, smaj, smin] = sScale([340, 40, 10], [220, 20, 10]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#f2f2f2', labelColor: '#f2f2f2', labelSize: r * 0.13, labelR: 0.72, font: 'Barlow Condensed', weight: 600 });
      text(c, U.speedLabel(), x, y + r * 0.35, 16, '#aaa', 'center', 'Barlow Condensed', 600);
      needle(c, x, y, ang(spd(d)), { len: r * 0.88, w: r * 0.035, color: o.needle, cap: r * 0.11, capColor: '#111', capRim: '#555' });
      G.glass(c, x, y, r);
      // yellow centre tach
      x = 760; y = 300; r = 262;
      chrome(c, x, y, r, 10);
      const g = c.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, o.face); g.addColorStop(1, '#a88400');
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: Math.max(9, kmax(d)), major: 1, minor: 0.25, mid: 0.5, tickColor: '#111', labelColor: '#111', labelSize: r * 0.16, labelR: 0.7, font: 'Barlow Condensed', weight: 700, red: { from: d.redFrom / 1000, r: 0.9, w: 0.1, color: '#d40000' } });
      text(c, 'x1000', x, y - r * 0.32, 20, '#222', 'center', 'Barlow Condensed', 700);
      c.fillStyle = '#111'; rrect(c, x - 46, y + r * 0.3, 92, 72, 10); c.fill();
      text(c, gearMain(d), x, y + r * 0.3 + 38, 54, o.face, 'center', 'Barlow Condensed', 700);
      needle(c, x, y, ang(d.rpm / 1000), { len: r * 0.9, w: 9, color: o.needle, tail: r * 0.2, cap: 34, capColor: '#111', capRim: '#555' });
      G.glass(c, x, y, r);
      lightRow(c, d, 300, 560, 24, 6, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'sigR'] });
    },
  });

  reg({
    id: 'taycan20', name: "Zuffen EV '20", era: '2020s', region: 'Euro', inspired: 'Porsche Taycan curved display (EV power meter)', adasNative: false,
    opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#7fe0ff' }],
    mfd: (o) => ({ x: 1110, y: 80, w: 440, h: 440, theme: { accent: o.accent || '#7fe0ff', bg: 'rgba(255,255,255,.04)', font: 'Barlow Condensed' } }),
    draw(c, d, k) {
      const a = accent(k, '#7fe0ff');
      // gently curved glass
      c.fillStyle = '#000'; c.fillRect(0, 0, 1600, 600);
      const gl = c.createLinearGradient(0, 0, 1600, 0); gl.addColorStop(0, '#0b0f14'); gl.addColorStop(0.5, '#05070a'); gl.addColorStop(1, '#0b0f14');
      c.fillStyle = gl; rrect(c, 20, 20, 1560, 560, 60); c.fill();
      // left: battery + range dials
      const ring = (x, y, r, f, label, val, col) => {
        arcBar(c, x, y, r, 10, 0.75 * PI, 2.25 * PI, f, col, 'rgba(255,255,255,.07)', { glow: col });
        text(c, val, x, y - 6, r * 0.42, '#fff', 'center', 'Barlow Condensed', 600);
        text(c, label, x, y + r * 0.38, r * 0.16, 'rgba(255,255,255,.55)', 'center', 'Barlow Condensed', 600);
      };
      const lvl = levelPct(d);
      ring(170, 300, 110, lvl / 100, d.isEV ? 'BATTERY' : 'FUEL', `${lvl}%`, lvl < 15 ? '#ff3b30' : '#2bd46a');
      ring(400, 300, 95, clamp((d.range || 0) / 500000, 0, 1), 'RANGE', d.range ? `${Math.round(U.dist(d.range))}` : '--', a);
      // centre: power meter with speed
      const pct = powerDial(c, d, 790, 300, 240, { color: a, font: 'Barlow Condensed' });
      text(c, Math.round(spd(d)), 790, 280, 130, '#fff', 'center', 'Barlow Condensed', 600);
      text(c, U.speedLabel(), 790, 350, 24, 'rgba(255,255,255,.55)', 'center', 'Barlow Condensed', 600);
      text(c, `${pct < 0 ? 'RECUPERATION' : 'POWER'} ${Math.abs(Math.round(pct))}%`, 790, 400, 22, pct < 0 ? '#2bd46a' : a, 'center', 'Barlow Condensed', 700);
      text(c, d.gear, 790, 470, 40, '#fff', 'center', 'Barlow Condensed', 700);
      limit(c, d, 600, 90, 28);
      setSpeedChip(c, d, 940, 90, 30, a);
      lightRow(c, d, 790, 555, 24, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'battery', 'tpms', 'sigR'] });
    },
  });

  reg({
    id: 'w124_89', name: "Sindelfingen '89", era: '1980s', region: 'Euro', inspired: 'Mercedes-Benz W124 E-Class', glass: true,
    opts: [{ k: 'needle', label: 'Needle', type: 'color', def: '#ff5a1a' }],
    mfdTheme: { bg: 'rgba(6,6,6,.96)', accent: '#ff8a3a', font: 'Barlow Condensed' },
    draw(c, d, k) {
      const o = k.o;
      c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, 1600, 600);
      c.fillStyle = '#141414'; rrect(c, 40, 30, 1520, 540, 50); c.fill();
      const pod = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 8, 0, TAU); c.fillStyle = '#242424'; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#101010'); c.fill();
      };
      const nd = (x, y, an, len) => needle(c, x, y, an, { len, w: len * 0.03, style: 'bar', tail: len * 0.16, color: o.needle, cap: len * 0.1, capColor: '#111', capRim: '#444' });
      // left: combination instrument
      let x = 330, y = 320, r = 180;
      pod(x, y, r);
      mini(c, x, y - 50, 95, fuelFrac(d), { a0: 1.2 * PI, a1: 1.8 * PI, lo: 'R', hi: '1/1', loColor: '#ff3a2a', tick: '#eee', label: '#eee', needle: o.needle, size: 18, redStart: true });
      mini(c, x - 80, y + 90, 60, waterFrac(d), { a0: 1.15 * PI, a1: 1.85 * PI, lo: '40', hi: '120', tick: '#eee', label: '#eee', needle: o.needle, size: 13, redEnd: true });
      mini(c, x + 80, y + 90, 60, oilP(d) / 45, { a0: 1.15 * PI, a1: 1.85 * PI, lo: '0', hi: '3', tick: '#eee', label: '#eee', needle: o.needle, size: 13 });
      icon(c, 'temp', x - 80, y + 112, 20, '#999'); icon(c, 'oil', x + 80, y + 112, 20, '#999'); icon(c, 'fuel', x, y - 22, 20, '#999');
      G.glass(c, x, y, r);
      // centre: big speedometer
      x = 800; y = 300; r = 250;
      pod(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.96, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#f0f0f0', labelColor: '#f0f0f0', labelSize: r * 0.12, labelR: 0.74, font: 'Barlow Condensed', weight: 500, majorW: 4, minorW: 2, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, U.speedLabel(), x, y - r * 0.32, 18, '#aaa', 'center', 'Barlow Condensed', 500);
      drum(c, x, y + r * 0.38, U.dist(d.odo) % 1e6, 6, 30);
      drum(c, x, y + r * 0.56, (U.dist(d.trip) * 10) % 1e4, 4, 22);
      nd(x, y, ang(spd(d)), r * 0.9);
      G.glass(c, x, y, r);
      // right: tach with clock inset
      x = 1270; y = 320; r = 180;
      pod(x, y, r);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.5, tickColor: '#f0f0f0', labelColor: '#f0f0f0', labelSize: r * 0.16, labelR: 0.7, font: 'Barlow Condensed', weight: 500, red: { from: d.redFrom / 1000, r: 0.9, w: 0.08, color: '#c81e1e' } });
      const hm = BD.clock(d.tod).split(':').map(Number);
      c.beginPath(); c.arc(x, y + 70, 40, 0, TAU); c.fillStyle = '#060606'; c.fill(); c.strokeStyle = '#333'; c.lineWidth = 2; c.stroke();
      needle(c, x, y + 70, -PI / 2 + ((hm[0] % 12) + hm[1] / 60) / 12 * TAU, { len: 22, w: 3, style: 'bar', color: '#eee', shadow: false });
      needle(c, x, y + 70, -PI / 2 + hm[1] / 60 * TAU, { len: 32, w: 2, style: 'bar', color: '#eee', shadow: false });
      nd(x, y, ang(d.rpm / 1000), r * 0.88);
      G.glass(c, x, y, r);
      lightRow(c, d, 800, 575, 24, 8, { list: ['sigL', 'high', 'park', 'abs', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  // ---------------- Asian ----------------
  reg({
    id: 'tokyo86', name: "Tokyo VFD '86", era: '1980s', region: 'Japan', inspired: '80s Japanese digital dash (Soarer / 300ZX)',
    opts: [{ k: 'tint', label: 'Glow', type: 'select', options: ['aqua', 'green', 'amber'], def: 'aqua' }],
    mfdTheme: { bg: 'rgba(0,10,12,.96)', accent: '#ff3ad0', fg: '#7ff7ff', dim: 'rgba(127,247,255,.6)', font: 'Orbitron', line: 'rgba(127,247,255,.15)' },
    draw(c, d, k) {
      const tint = { aqua: '#7ff7ff', green: '#7dff9a', amber: '#ffbf4a' }[k.o.tint];
      const mag = '#ff3ad0', off = 'rgba(255,255,255,.04)';
      c.fillStyle = '#010304'; c.fillRect(0, 0, 1600, 600);
      const gl = c.createLinearGradient(0, 0, 0, 600); gl.addColorStop(0, 'rgba(60,140,160,.10)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gl; rrect(c, 40, 30, 1520, 540, 24); c.fill();
      // stair-step tach across the top: bars get taller as revs rise
      const n = 50, f = d.rpm / d.tachMax;
      for (let i = 0; i < n; i++) {
        const x = 90 + i * 28.5, hh = 20 + i * 2.6, lit = f * n > i;
        const col = i / n * d.tachMax > d.redFrom ? '#ff3b30' : i > n * 0.75 ? mag : tint;
        c.fillStyle = lit ? col : off;
        if (lit) glow(c, col, 8);
        c.fillRect(x, 200 - hh, 20, hh); noGlow(c);
      }
      for (let v = 0; v <= kmax(d); v++) text(c, String(v), 100 + v / kmax(d) * n * 28.5, 222, 18, tint, 'left', 'Orbitron', 500);
      text(c, 'x1000 RPM', 1500, 222, 16, mag, 'right', 'Orbitron', 600);
      // speed
      seg7(c, String(Math.round(spd(d))).padStart(3, ' '), 760, 380, 170, tint, off, { glow: tint, glowBlur: 12 });
      text(c, mph() ? 'MPH' : 'km/h', 960, 440, 26, mag, 'left', 'Orbitron', 700);
      // side bars
      const vbar = (x, label, frac, warnLow) => {
        segments(c, x, 270, 40, 220, 14, frac, (ff) => (warnLow && ff < 0.15 ? '#ff3b30' : tint), off, 0.3, true);
        text(c, label, x + 20, 510, 16, mag, 'center', 'Orbitron', 600);
      };
      vbar(110, 'FUEL', fuelFrac(d), true);
      vbar(190, 'TEMP', waterFrac(d), false);
      vbar(270, 'OIL', clamp(oilP(d) / 80, 0, 1), false);
      seg7(c, gearMain(d).slice(0, 2), 1330, 360, 120, mag, off, { glow: mag });
      text(c, 'GEAR', 1330, 445, 16, tint, 'center', 'Orbitron', 600);
      seg7(c, odoStr(d), 1330, 520, 30, tint, off);
      lightRow(c, d, 760, 530, 26, 8, { list: ['sigL', 'high', 'park', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  reg({
    id: 'synergy16', name: "Synergy '16", era: '2010s', region: 'Japan', inspired: 'Toyota Prius-style hybrid display', adasNative: false,
    opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#3fc2ff' }],
    mfd: (o) => ({ x: 1100, y: 70, w: 460, h: 470, theme: { accent: o.accent || '#3fc2ff', bg: 'rgba(255,255,255,.04)' } }),
    draw(c, d, k) {
      const a = accent(k, '#3fc2ff');
      const bg = c.createLinearGradient(0, 0, 0, 600); bg.addColorStop(0, '#0a1420'); bg.addColorStop(1, '#03070c');
      c.fillStyle = bg; c.fillRect(0, 0, 1600, 600);
      text(c, Math.round(spd(d)), 240, 250, 170, '#fff', 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), 240, 350, 28, 'rgba(255,255,255,.6)', 'center', 'Rajdhani', 600);
      gearRow(c, d, 240, 430, 34, '#fff', 'rgba(255,255,255,.2)', ['P', 'R', 'N', 'D', 'B'], 'Rajdhani');
      // READY + EV mode
      if (d.running || d.isEV) { glow(c, '#2bd46a', 10); text(c, 'READY', 240, 500, 30, '#2bd46a', 'center', 'Rajdhani', 700); noGlow(c); }
      const evMode = d.isHybrid && d.speed > 1 && d.engKw < 2 && d.motorKw > 1;
      if (evMode) { c.strokeStyle = '#2bd46a'; c.lineWidth = 3; rrect(c, 180, 530, 120, 40, 10); c.stroke(); text(c, 'EV MODE', 240, 551, 20, '#2bd46a', 'center', 'Rajdhani', 700); }
      // hybrid system indicator: CHG | ECO | PWR arc
      const x = 680, y = 360, r = 230, a0 = 1.05 * PI, a1 = 1.95 * PI;
      const zones = [[0, 0.22, '#2bd46a', 'CHG'], [0.22, 0.75, a, 'ECO'], [0.75, 1, '#ffb000', 'PWR']];
      for (const [s, e2, col, lbl] of zones) {
        c.strokeStyle = col + '40'; c.lineWidth = 46;
        c.beginPath(); c.arc(x, y, r, a0 + (a1 - a0) * s, a0 + (a1 - a0) * e2); c.stroke();
        const am = a0 + (a1 - a0) * (s + e2) / 2;
        text(c, lbl, x + Math.cos(am) * (r + 50), y + Math.sin(am) * (r + 50), 22, col, 'center', 'Rajdhani', 700);
      }
      const load = d.isEV || d.isHybrid ? (d.motorKw + Math.max(0, d.engKw)) : Math.max(0, d.engKw);
      const pos = load < 0 ? 0.22 * (1 - clamp(-load / 60, 0, 1)) : 0.22 + 0.78 * clamp(load / d.maxPowerKw, 0, 1);
      c.strokeStyle = pos < 0.22 ? '#2bd46a' : pos > 0.75 ? '#ffb000' : a; c.lineWidth = 46; glow(c, c.strokeStyle, 12);
      c.beginPath(); c.arc(x, y, r, a0 + (a1 - a0) * Math.min(pos, 0.22), a0 + (a1 - a0) * Math.max(pos, 0.22)); c.stroke(); noGlow(c);
      const t = (BD.st.trips || {}).a || {};
      text(c, t.avgCons ? `${U.consumption(t.avgCons).toFixed(1)}` : '--', x, y - 40, 70, '#fff', 'center', 'Rajdhani', 600);
      text(c, `${U.consLabel()} trip avg`, x, y + 10, 20, 'rgba(255,255,255,.55)', 'center', 'Rajdhani', 600);
      if (d.battery !== null) {
        for (let i = 0; i < 8; i++) { c.fillStyle = i < Math.round(d.battery * 8) ? a : 'rgba(255,255,255,.08)'; c.fillRect(x - 100 + i * 26, y + 50, 20, 30); }
        text(c, 'HYBRID BATTERY', x, y + 100, 16, 'rgba(255,255,255,.5)', 'center', 'Rajdhani', 700);
      }
      lightRow(c, d, 680, 32, 24, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'sigR'] });
    },
  });

  reg({
    id: 'rotary92', name: "Rotary '92", era: '1990s', region: 'Japan', inspired: 'Mazda RX-7 (FD): centre tach, small gauge stack', glass: true,
    opts: [{ k: 'needle', label: 'Needle', type: 'color', def: '#ff3a1a' }],
    mfdTheme: { bg: 'rgba(8,8,10,.96)', accent: '#ff3a1a', font: 'Rajdhani' },
    draw(c, d, k) {
      const o = k.o;
      c.fillStyle = '#0b0b0d'; c.fillRect(0, 0, 1600, 600);
      const pod = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 14, 0, TAU); c.fillStyle = '#000'; c.fill();
        c.beginPath(); c.arc(x, y, r + 5, 0, TAU); c.fillStyle = '#2b2d31'; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#111216'); c.fill();
      };
      const nd = (x, y, an, len) => needle(c, x, y, an, { len, w: len * 0.03, tail: len * 0.16, color: o.needle, cap: len * 0.11, capColor: '#111', capRim: '#3a3a3a' });
      let x = 330, y = 340, r = 190;
      pod(x, y, r);
      const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#f2f2f2', labelColor: '#f2f2f2', labelSize: r * 0.13, labelR: 0.72, font: 'Rajdhani', weight: 700, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, U.speedLabel(), x, y - r * 0.32, 16, '#aaa', 'center', 'Rajdhani', 600);
      text(c, odoStr(d), x, y + r * 0.42, 22, '#ddd', 'center', 'Rajdhani', 600);
      nd(x, y, ang(spd(d)), r * 0.88);
      G.glass(c, x, y, r);
      x = 800; y = 300; r = 262;
      pod(x, y, r);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: Math.max(10, kmax(d)), major: 1, minor: 0.25, mid: 0.5, tickColor: '#f2f2f2', labelColor: '#f2f2f2', labelSize: r * 0.15, labelR: 0.7, font: 'Rajdhani', weight: 700, red: { from: d.redFrom / 1000, r: 0.88, w: 0.1, color: '#e3121b' }, labelColorFn: (v) => (v * 1000 >= d.redFrom ? '#ff4a3a' : null) });
      text(c, 'x1000 r/min', x, y - r * 0.3, 18, '#aaa', 'center', 'Rajdhani', 600);
      text(c, gearMain(d), x, y + r * 0.42, 44, '#fff', 'center', 'Rajdhani', 700);
      nd(x, y, ang(d.rpm / 1000), r * 0.9);
      G.glass(c, x, y, r);
      // stack of three small gauges
      const small = (sy, frac, lo, hi, name, red) => {
        pod(1260, sy, 82);
        mini(c, 1260, sy + 12, 66, frac, { lo, hi, name, tick: '#eee', label: '#eee', needle: o.needle, size: 15, font: 'Rajdhani', [red]: true, labelR: 1.1 });
      };
      small(120, clamp((d.boost + 10) / 25, 0, 1), '-', '+', 'BOOST', 'redEnd');
      small(300, waterFrac(d), 'C', 'H', 'WATER', 'redEnd');
      small(480, fuelFrac(d), 'E', 'F', 'FUEL', 'redStart');
      lightRow(c, d, 800, 575, 24, 8, { list: ['sigL', 'high', 'park', 'abs', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  reg({
    id: 'gtr09', name: "Godzilla '09", era: '2000s', region: 'Japan', inspired: 'Nissan GT-R (R35) with multi-function meter', glass: true,
    opts: [{ k: 'accent', label: 'Screen accent', type: 'color', def: '#ff8a00' }],
    mfd: (o) => ({ x: 1110, y: 70, w: 450, h: 460, theme: { accent: o.accent || '#ff8a00', bg: '#08090b', fg: '#f2f2f2', dim: '#8d95a3', font: 'Rajdhani', line: 'rgba(255,255,255,.1)' } }),
    draw(c, d, k) {
      c.fillStyle = '#0a0b0d'; c.fillRect(0, 0, 1600, 600);
      c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 6;
      for (let i = -600; i < 1600; i += 14) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 600, 600); c.stroke(); }
      c.fillStyle = '#000'; rrect(c, 1096, 56, 478, 488, 16); c.fill(); c.strokeStyle = '#2c2f36'; c.lineWidth = 3; c.stroke();
      const pod = (x, y, r) => {
        c.beginPath(); c.arc(x, y, r + 12, 0, TAU); c.fillStyle = '#1b1d22'; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = deepFace(c, x, y, r, '#0e0f12'); c.fill();
      };
      const glowNum = '#ff9a3a';
      let x = 300, y = 320, r = 200;
      pod(x, y, r);
      const [smax, smaj, smin] = sScale([340, 20, 10], [220, 20, 10]);
      let ang = dial(c, { x, y, r: r * 0.95, min: 0, max: smax, major: smaj, minor: smin, tickColor: '#fff', labelColor: glowNum, labelGlow: glowNum, labelSize: r * 0.12, labelR: 0.73, font: 'Rajdhani', weight: 700, label: (v) => ((v / smaj) % 2 === 0 ? String(v) : null) });
      text(c, U.speedLabel(), x, y - r * 0.32, 16, '#999', 'center', 'Rajdhani', 600);
      needle(c, x, y, ang(spd(d)), { len: r * 0.88, w: r * 0.03, color: '#ff2a1a', glow: '#ff2a1a', glowBlur: 8, cap: r * 0.12, capColor: '#111', capRim: '#444' });
      G.glass(c, x, y, r);
      x = 780; y = 300; r = 265;
      pod(x, y, r);
      ang = dial(c, { x, y, r: r * 0.95, min: 0, max: kmax(d), major: 1, minor: 0.25, tickColor: '#fff', labelColor: glowNum, labelGlow: glowNum, labelSize: r * 0.15, labelR: 0.71, font: 'Rajdhani', weight: 700, red: { from: d.redFrom / 1000, r: 0.92, w: 0.07, color: '#ff2a1a' } });
      c.fillStyle = '#000'; rrect(c, x - 70, y + 40, 140, 120, 14); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 2; c.stroke();
      glow(c, glowNum, 14); text(c, gearMain(d), x, y + 102, 96, glowNum, 'center', 'Rajdhani', 700); noGlow(c);
      needle(c, x, y, ang(d.rpm / 1000), { len: r * 0.9, w: 8, color: '#ff2a1a', glow: '#ff2a1a', glowBlur: 10, cap: 32, capColor: '#111', capRim: '#444' });
      G.glass(c, x, y, r);
      lightRow(c, d, 540, 575, 24, 8, { list: ['sigL', 'high', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'sigR'] });
    },
  });

  reg({
    id: 'ioniq22', name: "Seoul EV '22", era: '2020s', region: 'Korea', inspired: 'Hyundai Ioniq 5 / Kia EV6 tablet-style display',
    opts: [
      { k: 'theme', label: 'Theme', type: 'select', options: ['dark', 'light'], def: 'dark' },
      { k: 'accent', label: 'Accent', type: 'color', def: '#2fd0b0' },
    ],
    mfd: (o) => ({ x: 1100, y: 60, w: 460, h: 480, theme: o.theme === 'light'
      ? { bg: 'rgba(255,255,255,.8)', fg: '#151a22', dim: 'rgba(21,26,34,.55)', line: 'rgba(0,0,0,.1)', accent: o.accent || '#2fd0b0', mapTheme: 'light' }
      : { bg: 'rgba(255,255,255,.04)', accent: o.accent || '#2fd0b0' } }),
    draw(c, d, k) {
      const light = k.o.theme === 'light', a = accent(k, '#2fd0b0');
      const fg = light ? '#151a22' : '#fff', dim = light ? 'rgba(21,26,34,.55)' : 'rgba(255,255,255,.55)';
      c.fillStyle = light ? '#eef1f4' : '#07090c'; c.fillRect(0, 0, 1600, 600);
      // left: power / regen ring
      const pct = powerDial(c, d, 250, 310, 190, { color: a, track: light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)', label: dim });
      text(c, `${Math.abs(Math.round(pct))}%`, 250, 300, 56, fg, 'center', 'Rajdhani', 600);
      text(c, pct < 0 ? 'REGEN' : 'POWER', 250, 350, 18, pct < 0 ? '#2bd46a' : a, 'center', 'Rajdhani', 700);
      // centre: speed in a ring + drive mode
      const x = 700, y = 300, r = 220;
      c.strokeStyle = light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.12)'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
      arcBar(c, x, y, r, 6, -PI / 2, 1.5 * PI, clamp(spd(d) / (mph() ? 160 : 260), 0, 1), a, null, { glow: light ? null : a });
      text(c, Math.round(spd(d)), x, y - 10, 140, fg, 'center', 'Rajdhani', 600);
      text(c, U.speedLabel(), x, y + 70, 24, dim, 'center', 'Rajdhani', 600);
      text(c, (d.driveMode || 'normal').toUpperCase(), x, y + 120, 22, a, 'center', 'Rajdhani', 700);
      gearRow(c, d, x, y - 150, 30, fg, light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.18)', ['P', 'R', 'N', 'D'], 'Rajdhani');
      limit(c, d, 440, 110, 30);
      setSpeedChip(c, d, 900, 110, 30, a);
      // battery bar along the bottom
      const lvl = levelPct(d);
      c.fillStyle = light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; rrect(c, 120, 545, 860, 14, 7); c.fill();
      c.fillStyle = lvl < 15 ? '#ff3b30' : a; rrect(c, 120, 545, 860 * lvl / 100, 14, 7); c.fill();
      text(c, `${lvl}%   ${rangeStr(d)}   ${BD.clock(d.tod)}`, 550, 520, 22, fg, 'center', 'Rajdhani', 700);
      lightRow(c, d, 550, 30, 24, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'battery', 'tpms', 'sigR'] });
    },
  });

  // =============================================================== custom
  reg({
    id: 'race', mfdTheme: { bg: 'rgba(0,0,0,.96)', accent: '#00e5ff', font: 'Orbitron' }, name: 'Motorsport Pro', era: 'Custom', region: 'Custom', inspired: 'Race-car data displays',
    opts: [
      { k: 'accent', label: 'Accent', type: 'color', def: '#00e5ff' },
      { k: 'lights', label: 'Shift lights', type: 'select', options: ['gt', 'f1'], def: 'gt' },
    ],
    draw(c, d, k) {
      const a = accent(k, '#00e5ff');
      c.fillStyle = '#000'; c.fillRect(0, 0, 1600, 600);
      // shift lights
      const n = 15, lo = d.shiftRpm * 0.72;
      const f = clamp((d.rpm - lo) / (d.shiftRpm - lo), 0, 1);
      const flash = d.rpm >= d.shiftRpm && Math.floor(k.t * 14) % 2 === 0;
      for (let i = 0; i < n; i++) {
        let lit, col;
        if (k.o.lights === 'f1') { const side = Math.min(i, n - 1 - i); lit = f * 7.5 > 7 - side; col = side > 4 ? '#2ae05a' : side > 1 ? '#ff2a2a' : '#5a5aff'; }
        else { lit = f * n > i; col = i < 5 ? '#2ae05a' : i < 10 ? '#ffd000' : '#ff2a2a'; }
        if (d.rpm >= d.shiftRpm) { lit = flash; col = '#3a6bff'; }
        c.beginPath(); c.arc(380 + i * 60, 44, 20, 0, TAU);
        if (lit) glow(c, col, 18);
        c.fillStyle = lit ? col : '#151515'; c.fill(); noGlow(c);
      }
      segments(c, 160, 92, 1280, 34, 60, d.rpm / d.tachMax, (ff) => (ff * d.tachMax > d.redFrom ? '#ff2a2a' : a), '#111', 0.25);
      text(c, Math.round(d.rpm), 800, 152, 30, '#fff', 'center', 'Orbitron', 700);
      text(c, gearMain(d), 800, 330, 240, '#fff', 'center', 'Orbitron', 700);
      text(c, Math.round(spd(d)), 800, 500, 70, a, 'center', 'Orbitron', 700);
      text(c, U.speedLabel(), 800, 548, 20, '#888', 'center', 'Orbitron', 600);
      // data boxes
      const box = (x, y, w, h, label, val, alarm) => {
        const on = alarm && Math.floor(k.t * 4) % 2 === 0;
        c.fillStyle = on ? '#b00000' : '#0b0b0b'; rrect(c, x, y, w, h, 10); c.fill();
        c.strokeStyle = alarm ? '#ff2a2a' : '#222'; c.lineWidth = 2; c.stroke();
        text(c, label, x + 14, y + 22, 18, alarm ? '#fff' : '#888', 'left', 'Orbitron', 600);
        text(c, val, x + w - 14, y + h - 32, 44, '#fff', 'right', 'Orbitron', 700);
      };
      const bx = 40, by = 180, bw = 230, bh = 110, gp = 14;
      box(bx, by, bw, bh, 'WATER', Math.round(tempC(d)), d.water > 112);
      box(bx + bw + gp, by, bw, bh, 'OIL T', Math.round(U.temp(d.oilT)), d.oilT > 135);
      box(bx, by + bh + gp, bw, bh, 'OIL P', Math.round(oilP(d)), d.lights.oil && d.ignition > 0);
      box(bx + bw + gp, by + bh + gp, bw, bh, 'BOOST', U.boost(d.boost).toFixed(1), false);
      box(bx, by + 2 * (bh + gp), bw, bh, 'FUEL L', d.fuelVol.toFixed(1), d.lights.lowFuel);
      box(bx + bw + gp, by + 2 * (bh + gp), bw, bh, 'G', (Math.hypot(d.gx, d.gy) / 9.81).toFixed(2), false);
      // tires
      const tw = 150, th = 100;
      (d.wheels || []).slice(0, 4).forEach((w, i) => {
        const x = 1090 + (i % 2) * (tw + 14), y = 180 + Math.floor(i / 2) * (th + 14);
        const t = w.brakeSurfaceTemperature || 0;
        c.fillStyle = G.tireTemp()(t); rrect(c, x, y, tw, th, 10); c.fill();
        text(c, w.name, x + 12, y + 20, 16, '#000', 'left', 'Orbitron', 700);
        text(c, `${Math.round(U.temp(t))}°`, x + tw - 12, y + 52, 32, '#000', 'right', 'Orbitron', 700);
        text(c, w.pressure ? U.tire(w.pressure).toFixed(1) : '', x + tw - 12, y + 84, 18, '#000', 'right', 'Orbitron', 600);
      });
      G.gMeter(c, 1170, 470, 70, d.gx, -d.gy, { color: a, label: false });
      bar(c, 1300, 400, 40, 160, d.throttle, '#2ae05a', '#111', true, 6);
      bar(c, 1360, 400, 40, 160, d.brake, '#ff2a2a', '#111', true, 6);
      bar(c, 1420, 400, 40, 160, d.clutch, '#3a8bff', '#111', true, 6);
      text(c, 'T   B   C', 1380, 580, 16, '#888', 'center', 'Orbitron', 600);
      lightRow(c, d, 800, 205, 26, 6, { list: ['sigL', 'abs', 'esc', 'park', 'check', 'sigR'] });
    },
  });

  reg({
    id: 'builder', name: 'Custom Builder', era: 'Custom', region: 'Custom', inspired: 'Build your own',
    opts: [
      { k: 'layout', label: 'Layout', type: 'select', options: ['twin', 'triple', 'single'], def: 'twin' },
      { k: 'style', label: 'Dial style', type: 'select', options: ['classic', 'ring', 'digital'], def: 'ring' },
      { k: 'center', label: 'Centre widget', type: 'select', options: ['info', 'map', 'adas', 'surround', 'gforce', 'tires', 'none'], def: 'info' },
      { k: 'font', label: 'Font', type: 'select', options: ['Rajdhani', 'Barlow Condensed', 'Orbitron', 'Bebas Neue'], def: 'Rajdhani' },
      { k: 'bg', label: 'Background', type: 'color', def: '#05070a' },
      { k: 'face', label: 'Dial face', type: 'color', def: '#0d1016' },
      { k: 'numbers', label: 'Numbers', type: 'color', def: '#ffffff' },
      { k: 'accent', label: 'Accent', type: 'color', def: '#ff8a00' },
      { k: 'needle', label: 'Needle', type: 'color', def: '#ff3a1a' },
    ],
    draw(c, d, k) {
      const o = k.o, a = o.accent, F = o.font;
      c.fillStyle = o.bg; c.fillRect(0, 0, 1600, 600);
      const gauge = (x, y, r, kind) => {
        const isTach = kind === 'tach';
        const [smax, smaj, smin] = sScale([260, 20, 10], [160, 20, 5]);
        const max = isTach ? kmax(d) : smax, val = isTach ? d.rpm / 1000 : spd(d);
        const maj = isTach ? 1 : smaj, mi = isTach ? 0.5 : smin;
        const red = isTach ? { from: d.redFrom / 1000, r: 0.92, w: 0.06, color: '#ff2a1a' } : null;
        const lbl = isTach ? String : (v) => ((v / smaj) % 2 === 0 ? String(v) : null);
        if (o.style === 'digital') {
          c.fillStyle = o.face; rrect(c, x - r, y - r * 0.75, r * 2, r * 1.5, 24); c.fill();
          arcBar(c, x, y + r * 0.2, r * 0.8, 18, 1.1 * PI, 1.9 * PI, val / max, isTach && val * 1000 > d.redFrom ? '#ff2a1a' : a, 'rgba(255,255,255,.06)', { glow: a });
          text(c, isTach ? d.gear : Math.round(val), x, y + r * 0.05, r * 0.5, o.numbers, 'center', F, 700);
          text(c, isTach ? `${Math.round(d.rpm)} rpm` : U.speedLabel(), x, y + r * 0.42, r * 0.12, a, 'center', F, 600);
          return;
        }
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = o.face; c.fill();
        if (o.style === 'ring') { c.lineWidth = 4; c.strokeStyle = a; glow(c, a, 14); c.stroke(); noGlow(c); }
        else chrome(c, x, y, r, 8);
        const ang = dial(c, { x, y, r: r * 0.95, min: 0, max, major: maj, minor: mi, tickColor: o.numbers, labelColor: o.numbers, labelSize: r * 0.13, labelR: 0.73, font: F, weight: 600, red, label: lbl });
        if (o.style === 'ring') arcBar(c, x, y, r * 0.86, 8, 0.75 * PI, ang(val), 1, a, null, { glow: a });
        text(c, isTach ? d.gear : Math.round(val), x, y + r * 0.38, r * 0.2, o.numbers, 'center', F, 700);
        text(c, isTach ? 'x1000' : U.speedLabel(), x, y - r * 0.3, r * 0.08, a, 'center', F, 600);
        needle(c, x, y, ang(val), { len: r * 0.88, color: o.needle, w: r * 0.028, style: o.style === 'ring' ? 'pointer' : 'classic', start: r * 0.5, glow: o.needle, glowBlur: 8, cap: o.style === 'ring' ? 0 : r * 0.1, capColor: '#111' });
      };
      const centre = (x0, y0, w, h) => {
        const v = o.center;
        if (v === 'none') return;
        if (v === 'map') { MapView.mini(c, d, x0, y0, w, h, { zoom: 1.2, clipRound: 20 }); navCard(c, d, x0 + 10, y0 + 10, w - 20, 64, { accent: a }); }
        else if (v === 'adas') { G.adasView(c, x0 + w / 2, y0 + h * 0.55, w * 0.85, h * 0.7, d, { accent: a }); setSpeedChip(c, d, x0 + 30, y0 + 30, 30, a, F); limit(c, d, x0 + w - 40, y0 + 40, 28); }
        else if (v === 'surround') surround(c, d, x0, y0, w, h, { accent: a });
        else if (v === 'gforce') G.gMeter(c, x0 + w / 2, y0 + h / 2 - 15, Math.min(w, h) * 0.36, d.gx, -d.gy, { color: a, font: F });
        else if (v === 'tires') G.carTop(c, x0 + w / 2, y0 + h / 2, h * 0.7, d.wheels, { wheelColor: (wd) => G.tireTemp()(wd.brakeSurfaceTemperature || 30), label: (wd) => (wd.pressure ? U.tire(wd.pressure).toFixed(1) : ''), font: F });
        else {
          const rows = [['Fuel', `${Math.round(d.fuel * 100)}%`], ['Range', rangeStr(d)], ['Coolant', `${Math.round(tempC(d))}${U.tempLabel()}`], ['Oil', `${Math.round(U.temp(d.oilT))}${U.tempLabel()}`], ['Boost', `${U.boost(d.boost).toFixed(1)} ${U.pressLabel()}`], ['Trip', `${tripStr(d)} ${U.distLabel()}`], ['Time', BD.clock(d.tod)]];
          const rh = h / (rows.length + 0.5);
          rows.forEach(([l, val], i) => { const yy = y0 + rh * (i + 0.75); text(c, l, x0 + 20, yy, rh * 0.45, 'rgba(255,255,255,.55)', 'left', F, 600); text(c, val, x0 + w - 20, yy, rh * 0.5, o.numbers, 'right', F, 700); });
        }
      };
      if (o.layout === 'single') {
        gauge(560, 310, 270, 'speed');
        const sub = o.style === 'digital' ? null : true;
        if (sub) arcBar(c, 560, 310, 285, 10, 0.75 * PI, 2.25 * PI, d.rpm / d.tachMax, d.rpm > d.redFrom ? '#ff2a1a' : a, 'rgba(255,255,255,.06)');
        centre(900, 60, 640, 480);
      } else if (o.layout === 'triple') {
        gauge(290, 330, 200, 'tach');
        gauge(800, 300, 260, 'speed');
        c.fillStyle = 'rgba(255,255,255,.03)'; rrect(c, 1100, 120, 460, 400, 20); c.fill();
        centre(1100, 120, 460, 400);
      } else {
        gauge(330, 310, 250, 'tach');
        gauge(1270, 310, 250, 'speed');
        centre(610, 80, 380, 430);
      }
      lightRow(c, d, 800, 570, 28, 8, { list: ['sigL', 'high', 'low', 'park', 'abs', 'esc', 'check', 'oil', 'battery', 'fuel', 'cruise', 'sigR'] });
    },
  });

  return list;
})();
