// Telemetry page: every live value the game sends.
'use strict';
(() => {
  BD.nav('telemetry');
  BD.connect();
  const U = BD.U, f = BD.fmt;
  const $ = (id) => document.getElementById(id);
  const kv = (el, rows) => {
    const html = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // ---------------------------------------------------------------- canvases
  function fit(cv) {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, r.width, r.height];
  }
  const hist = [];
  let gPeak = 0;
  const gTrail = [];
  setInterval(() => {
    const d = BD.data();
    hist.push({ s: d.speed, r: d.rpm / d.tachMax, t: d.throttle, b: d.brake, bo: d.boost / Math.max(1, d.boostMax) });
    if (hist.length > 300) hist.shift();
    gTrail.push([d.gx, -d.gy]);
    if (gTrail.length > 60) gTrail.shift();
  }, 100);

  function drawChart() {
    const [c, w, h] = fit($('chart'));
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
    const maxS = Math.max(20, ...hist.map((p) => p.s)) * 1.1;
    const line = (key, col, scale = 1) => {
      c.beginPath();
      hist.forEach((p, i) => {
        const x = w - (hist.length - 1 - i) * (w / 299), y = h - 4 - Math.max(0, Math.min(1, p[key] * scale)) * (h - 8);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.strokeStyle = col; c.lineWidth = 2; c.stroke();
    };
    line('t', '#2bd46a'); line('b', '#ff3b30'); line('bo', '#c07aff'); line('r', '#ff8a00'); line('s', '#4aa3ff', 1 / maxS);
    G.text(c, `${Math.round(U.speed(maxS))} ${U.speedLabel()}`, 6, 10, 11, '#8b96a8', 'left', 'Rajdhani', 600);
  }
  function drawG(d) {
    const [c, w, h] = fit($('gm'));
    c.clearRect(0, 0, w, h);
    const r = Math.min(w, h) / 2 - 16, x = w / 2, y = h / 2;
    c.strokeStyle = 'rgba(74,163,255,.35)'; c.lineWidth = 2;
    c.beginPath();
    gTrail.forEach((p, i) => { const px = x + Math.max(-1, Math.min(1, p[0] / 14.7)) * r, py = y + Math.max(-1, Math.min(1, p[1] / 14.7)) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.stroke();
    G.gMeter(c, x, y, r, d.gx, -d.gy, { color: '#4aa3ff', label: false });
    G.text(c, 'BRAKE', x, 10, 11, '#8b96a8', 'center', 'Rajdhani', 600);
    G.text(c, 'ACCEL', x, h - 8, 11, '#8b96a8', 'center', 'Rajdhani', 600);
  }
  function drawCar(d) {
    const [c, w, h] = fit($('carTop'));
    c.clearRect(0, 0, w, h);
    G.carTop(c, w / 2, h / 2, h * 0.85, d.wheels, {
      wheelColor: (wd) => G.tireTemp()(wd.brakeSurfaceTemperature || 30),
      label: (wd) => (wd.pressure ? `${U.tire(wd.pressure).toFixed(1)}` : wd.name),
      font: 'Rajdhani',
    });
  }

  // ---------------------------------------------------------------- tires
  const pick = (w, ...keys) => { for (const k of keys) if (typeof w[k] === 'number') return w[k]; return null; };
  function renderTires(d) {
    const el = $('tires');
    const wheels = (d.wheels || []).slice().sort((a, b) => ['FL', 'FR', 'RL', 'RR'].indexOf(a.name) - ['FL', 'FR', 'RL', 'RR'].indexOf(b.name));
    if (!wheels.length) { el.innerHTML = '<p class="muted">Waiting for wheel data…</p>'; return; }
    const col = G.tireTemp();
    el.innerHTML = wheels.map((w) => {
      const ws = pick(w, 'wheelSpeed', 'angularVelocity');
      const slip = pick(w, 'lastSlip', 'slip');
      const side = pick(w, 'lastSideSlip', 'sideSlip');
      const load = pick(w, 'downForce', 'downForceRaw', 'load');
      const bs = pick(w, 'brakeSurfaceTemperature'), bc = pick(w, 'brakeCoreTemperature');
      const tt = pick(w, 'tireTemperature', 'surfaceTemperature', 'tireSurfaceTemperature');
      const flags = [w.isTireDeflated ? '<span class="pill bad">DEFLATED</span>' : '', w.isBroken ? '<span class="pill bad">BROKEN</span>' : '', slip > 0.15 ? '<span class="pill warn">SLIP</span>' : ''].join(' ');
      return `<div class="tire" style="border-color:${w.isTireDeflated || w.isBroken ? 'var(--bad)' : 'transparent'}">
        <h4><span>${esc(w.name || '?')}</span><span>${flags}</span></h4>
        <div class="temps">
          ${bs !== null ? `<div style="background:${col(bs)}"><small>BRAKE SURF</small>${Math.round(U.temp(bs))}${U.tempLabel()}</div>` : ''}
          ${bc !== null ? `<div style="background:${col(bc)}"><small>BRAKE CORE</small>${Math.round(U.temp(bc))}${U.tempLabel()}</div>` : ''}
          ${tt !== null ? `<div style="background:${col(tt)}"><small>TIRE</small>${Math.round(U.temp(tt))}${U.tempLabel()}</div>` : ''}
        </div>
        <div class="kv">
          ${w.pressure ? `<span>Pressure</span><span>${U.tire(w.pressure).toFixed(1)} ${U.pressLabel()}</span>` : ''}
          ${ws !== null ? `<span>Wheel speed</span><span>${f(U.speed(Math.abs(ws)), 0)} ${U.speedLabel()}</span>` : ''}
          ${slip !== null ? `<span>Slip</span><span>${f(slip * 100, 1)} %</span>` : ''}
          ${side !== null ? `<span>Side slip</span><span>${f(side, 3)}</span>` : ''}
          ${load !== null ? `<span>Load</span><span>${f(load, 0)} N</span>` : ''}
          ${typeof w.brakeTorque === 'number' ? `<span>Brake torque</span><span>${f(w.brakeTorque, 0)} Nm</span>` : ''}
          ${typeof w.radius === 'number' ? `<span>Radius</span><span>${f(w.radius, 3)} m</span>` : ''}
        </div></div>`;
    }).join('');
  }

  function renderPt() {
    const pt = BD.st.pt;
    const el = $('pt');
    if (!pt) { el.innerHTML = '<p class="muted">Waiting for powertrain data…</p>'; return; }
    const open = new Set([...el.querySelectorAll('details[open]')].map((x) => x.dataset.k));
    el.innerHTML = Object.values(pt).map((dev) => {
      const rows = Object.entries(dev).filter(([k]) => k !== 'name').map(([k, v]) => `<tr><td>${esc(k)}</td><td>${typeof v === 'number' ? +v.toFixed(3) : esc(v)}</td></tr>`).join('');
      return `<details data-k="${esc(dev.name)}" ${open.has(dev.name) ? 'open' : ''}><summary>${esc(dev.name)} <span class="muted">· ${esc(dev.type || '')}${dev.rpmOut !== undefined ? ` · ${Math.round(dev.rpmOut)} rpm` : ''}</span></summary><table class="data">${rows}</table></details>`;
    }).join('');
    const en = BD.st.energy || {};
    $('energy').innerHTML = Object.values(en).map((s) => `<h3 style="margin-top:6px">${esc(s.name)}</h3><div class="kv">${Object.entries(s).filter(([k]) => k !== 'name').map(([k, v]) => `<span>${esc(k)}</span><span>${typeof v === 'number' ? +v.toFixed(3) : esc(v)}</span>`).join('')}</div>`).join('') || '<p class="muted">—</p>';
  }

  function renderRaw() {
    const src = $('rawSrc').value, q = $('rawSearch').value.toLowerCase();
    let obj = {};
    if (src === 'e') obj = BD.st.e;
    else if (src === 'w') (BD.st.wheels || []).forEach((w) => Object.entries(w).forEach(([k, v]) => { obj[`${w.name}.${k}`] = v; }));
    else if (src === 'world') { const w = BD.st.world || {}; obj = { level: w.level, myId: w.myId, speedLimit: w.speedLimit, road: w.road, tod: w.tod, paused: w.paused, vehicles: (w.vehicles || []).length, routeLength: w.route && w.route.len, ...Object.fromEntries(Object.entries(w.adas || {}).map(([k, v]) => ['adas.' + k, v])), ...Object.fromEntries(Object.entries(w.adasState || {}).map(([k, v]) => ['adasState.' + k, typeof v === 'object' ? JSON.stringify(v) : v])) }; }
    else if (src === 'spec') { const s = BD.st.spec || {}; obj = { ...Object.fromEntries(Object.entries(s.engine || {}).map(([k, v]) => ['engine.' + k, v])), ...Object.fromEntries(Object.entries(s.gearbox || {}).map(([k, v]) => ['gearbox.' + k, typeof v === 'object' ? JSON.stringify(v) : v])), controllers: (s.controllers || []).join(', '), driveMode: s.driveMode, mass: s.mass }; }
    else if (src === 'info') { const i = BD.st.info || {}; obj = { ...Object.fromEntries(Object.entries(i.model || {}).map(([k, v]) => ['model.' + k, typeof v === 'object' ? JSON.stringify(v) : v])), ...Object.fromEntries(Object.entries(i.config || {}).map(([k, v]) => ['config.' + k, typeof v === 'object' ? JSON.stringify(v) : v])) }; }
    const keys = Object.keys(obj).filter((k) => !q || k.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
    $('rawCount').textContent = `${keys.length} values`;
    $('raw').innerHTML = '<tr><th>Key</th><th style="text-align:right">Value</th></tr>' + keys.map((k) => {
      const v = obj[k];
      return `<tr><td>${esc(k)}</td><td>${typeof v === 'number' ? +v.toFixed(4) : esc(v)}</td></tr>`;
    }).join('');
  }

  // ---------------------------------------------------------------- DOM update loop (10 Hz)
  function update() {
    const d = BD.data();
    $('hSpeed').textContent = Math.round(U.speed(d.speed));
    $('hSpeedU').textContent = U.speedLabel();
    $('hRpm').textContent = Math.round(d.rpm);
    $('hGear').textContent = d.gear;
    $('hG').textContent = (Math.hypot(d.gx, d.gy) / 9.81).toFixed(2);
    $('iThr').style.height = `${d.throttle * 100}%`;
    $('iBrk').style.height = `${d.brake * 100}%`;
    $('iClu').style.height = `${d.clutch * 100}%`;
    $('iPb').style.height = `${(BD.st.e.parkingbrake || 0) * 100}%`;
    $('iSteer').style.left = `calc(${50 + Math.max(-1, Math.min(1, (BD.st.e.steering_input ?? d.steer / 450))) * 50}% - 3px)`;
    const gm = Math.hypot(d.gx, d.gy) / 9.81;
    gPeak = Math.max(gPeak, gm);
    $('gLat').textContent = `${(d.gx / 9.81).toFixed(2)} g`;
    $('gLon').textContent = `${(d.gy / 9.81).toFixed(2)} g`;
    $('gVert').textContent = `${(d.gz / 9.81).toFixed(2)} g`;
    $('gPeak').textContent = `${gPeak.toFixed(2)} g`;
    const e = BD.st.e;
    kv($('engine'), [
      ['RPM', `${Math.round(d.rpm)} / ${Math.round(d.maxRPM)}`], ['Idle RPM', Math.round(d.idleRPM)], ['Running', d.running ? 'yes' : 'no'],
      ['Ignition', ['off', 'accessory', 'on', 'starting'][d.ignition] || d.ignition], ['Engine load', `${f((e.engineLoad ?? d.throttle) * 100, 0)} %`],
      ['Coolant', `${f(U.temp(d.water), 1)} ${U.tempLabel()}`], ['Oil temp', `${f(U.temp(d.oilT), 1)} ${U.tempLabel()}`],
      ['Oil pressure', d.oilP != null ? `${f(d.oilP, 2)} bar` : '—'], ['Boost', `${f(U.boost(d.boost), 2)} ${U.pressLabel()}`],
      ['Shifting', e.isShifting ? 'yes' : 'no'], ['Gear index', d.gearIndex ?? '—'],
    ]);
    kv($('fuel'), [
      ['Fuel', `${f(d.fuel * 100, 1)} %`], ['Volume', `${f(d.fuelVol, 2)} / ${f(d.fuelCap, 0)} L`],
      ['Consumption', d.consumption ? `${f(U.consumption(d.consumption), 1)} ${U.consLabel()}` : '—'],
      ['Range', d.range ? `${f(U.dist(d.range), 0)} ${U.distLabel()}` : '—'],
      ['Odometer', `${f(U.dist(d.odo), 1)} ${U.distLabel()}`], ['Trip', `${f(U.dist(d.trip), 2)} ${U.distLabel()}`],
    ]);
    const p = d.pos || [0, 0, 0], dir = d.dir || [0, 1, 0];
    const hdg = (Math.atan2(dir[0], dir[1]) * 180 / Math.PI + 360) % 360;
    kv($('motion'), [
      ['X / Y', `${f(p[0], 1)} / ${f(p[1], 1)}`], ['Altitude', `${f(p[2], 1)} m`], ['Heading', `${f(hdg, 0)}°`],
      ['Air speed', `${f(U.speed(e.airspeed || 0), 1)} ${U.speedLabel()}`], ['Wheel speed', `${f(U.speed(e.wheelspeed || 0), 1)} ${U.speedLabel()}`],
      ['Steering', `${f(e.steering || 0, 1)}°`], ['Damage', f(d.damage, 0)], ['Level', BD.st.world ? esc(BD.st.world.level || '—') : '—'],
      ['Time of day', BD.clock(d.tod)],
    ]);
    const L = d.lights;
    const pill = (t, on, cls = 'on') => `<span class="pill ${on ? cls : ''}">${t}</span>`;
    const lh = [pill('Low beam', L.low), pill('High beam', L.high), pill('Fog', L.fog), pill('◀ Signal', L.sigL), pill('Signal ▶', L.sigR), pill('Hazard', L.hazard, 'warn'),
      pill('Brake lights', L.brake, 'bad'), pill('Reverse', L.reverse), pill('Park brake', L.park, 'bad'), pill('ABS', L.absActive, 'warn'), pill('ESC', L.escActive, 'warn'),
      pill('TCS', L.tcsActive, 'warn'), pill('Check engine', L.check, 'warn'), pill('Oil', L.oil && d.ignition > 0, 'bad'), pill('Battery', L.battery && d.ignition > 0, 'bad'),
      pill('Low fuel', L.lowFuel, 'warn'), pill('Cruise', d.cruise.on), pill('Horn', L.horn)].join('');
    if ($('lights')._h !== lh) { $('lights').innerHTML = lh; $('lights')._h = lh; }
    kv($('adas'), [
      ['Cruise', d.cruise.on ? `${Math.round(U.speed(d.cruise.target))} ${U.speedLabel()}` : 'off'], ['ACC', d.adas.acc ? `set ${Math.round(U.speed(d.adas.accSet || 0))}, gap ${d.adas.accGap}` : 'off'],
      ['Lead car', d.lead ? `${f(d.lead.gap, 1)} m · ${Math.round(U.speed(d.lead.spd))} ${U.speedLabel()}` : 'none'], ['TTC', d.lead && d.lead.ttc < 30 ? `${f(d.lead.ttc, 1)} s` : '—'],
      ['FCW', ['clear', 'CAUTION', 'BRAKE'][d.fcw]], ['Blind spot', `${d.bsmL ? 'LEFT ' : ''}${d.bsmR ? 'RIGHT' : ''}` || 'clear'],
      ['Speed limit', d.speedLimit ? `${Math.round(U.speed(d.speedLimit))} ${U.speedLabel()}` : '—'],
    ]);
    const info = BD.st.info || {}, m = info.model || {}, cf = info.config || {}, sp = BD.st.spec || {};
    kv($('vehicle'), [
      ['Make / model', esc(`${m.Brand || ''} ${m.Name || info.jbeam || '—'}`)], ['Config', esc(cf.Configuration || '—')],
      ['Power', cf.Power ? `${Math.round(cf.Power)} PS` : sp.engine && sp.engine.maxPower ? `${Math.round(sp.engine.maxPower)}` : '—'],
      ['Torque', cf.Torque ? `${Math.round(cf.Torque)} Nm` : '—'], ['Weight', cf.Weight ? `${Math.round(cf.Weight)} kg` : sp.mass ? `${Math.round(sp.mass)} kg` : '—'],
      ['Drivetrain', esc(cf.Drivetrain || '—')], ['Transmission', esc(cf.Transmission || (sp.gearbox && sp.gearbox.type) || '—')],
      ['Gears', sp.gearbox ? `${sp.gearbox.maxGearIndex ?? '—'}` : '—'], ['Vehicle id', info.vid ?? '—'],
    ]);
    const me = MapView.me(d);
    const others = (d.vehicles || []).filter((v) => !v.me).map((v) => ({ ...v, dist: me ? Math.hypot(v.x - me.x, v.y - me.y) : 0 })).sort((a, b) => a.dist - b.dist);
    $('traffic').innerHTML = '<tr><th>Vehicle</th><th>Distance</th><th style="text-align:right">Speed</th></tr>' + (others.map((v) => `<tr><td>#${v.id}</td><td>${U.shortDist(v.dist)}</td><td>${Math.round(U.speed(v.spd))} ${U.speedLabel()}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No other vehicles</td></tr>');
  }
  setInterval(update, 100);
  setInterval(() => { renderTires(BD.data()); }, 200);
  setInterval(renderPt, 1000);
  setInterval(renderRaw, 500);
  $('rawSearch').oninput = renderRaw;
  $('rawSrc').onchange = renderRaw;

  function frame() {
    requestAnimationFrame(frame);
    const d = BD.data();
    drawChart(); drawG(d); drawCar(d);
  }
  requestAnimationFrame(frame);
})();
