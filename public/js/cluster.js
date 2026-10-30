// Cluster page: render loop, design picker, customization, assist sheet, warnings, sounds.
'use strict';
(() => {
  const S = BD.settings, U = BD.U;
  BD.nav('index');
  BD.connect();
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const VW = 1600, VH = 600;
  let design = DESIGNS.find((x) => x.id === S.design) || DESIGNS[0];
  // link straight to a look: /?design=bav86&page=trip&clean=1 (clean hides all controls, e.g. for screenshots or OBS)
  const qp = new URLSearchParams(location.search);
  if (qp.get('design')) design = DESIGNS.find((x) => x.id === qp.get('design')) || design;
  if (qp.get('page')) MFD.goto(qp.get('page'));
  if (qp.has('clean')) document.body.classList.add('clean');

  // ---------------------------------------------------------------- options
  function optsFor(def) {
    const saved = (S.designOpts && S.designOpts[def.id]) || {};
    const o = {};
    for (const op of def.opts || []) o[op.k] = saved[op.k] !== undefined ? saved[op.k] : op.def;
    return o;
  }

  // ---------------------------------------------------------------- smoothing + start-up sweep
  const sm = {};
  const RATE = { speed: 14, rpm: 20, fuel: 2, water: 2, oilT: 2, boost: 10, throttle: 18, brake: 18, gx: 6, gy: 6 };
  let sweepT = 0;
  BD.on('info', () => { sweepT = 0.001; });
  function smooth(d, dt) {
    for (const [key, r] of Object.entries(RATE)) {
      const v = d[key];
      if (typeof v !== 'number') continue;
      if (sm[key] === undefined || Math.abs(v - sm[key]) > (key === 'rpm' ? 5000 : 1e6)) sm[key] = v;
      sm[key] += (v - sm[key]) * (1 - Math.exp(-dt * r));
      d[key] = sm[key];
    }
    if (sweepT > 0) {
      sweepT += dt;
      const p = sweepT < 0.8 ? sweepT / 0.8 : Math.max(0, 1 - (sweepT - 0.8) / 0.8);
      const e = p * p * (3 - 2 * p);
      d.rpm = Math.max(d.rpm, e * d.tachMax);
      d.speed = Math.max(d.speed, e * U.speedToMs(BD.settings.speedUnit === 'mph' ? 160 : 260));
      if (sweepT > 1.6) sweepT = 0;
    }
    return d;
  }

  // ---------------------------------------------------------------- sizing
  let scale = 1, ox = 0, oy = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / VW, h / VH) * dpr;
    ox = (canvas.width - VW * scale) / 2;
    oy = (canvas.height - VH * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- sound
  let audio = null;
  function beep(freq, dur, vol = 0.15, type = 'square') {
    if (!S.sounds || !audio) return;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  }
  const unlock = () => { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } } };
  window.addEventListener('pointerdown', unlock, { once: false });
  let lastSig = false, lastFcw = 0, fcwBeep = 0;

  // ---------------------------------------------------------------- chips (assist info on classic designs)
  const chipsEl = document.getElementById('chips');
  const fcwEl = document.getElementById('fcw');
  let chipTimer = 0;
  function updateChips(d) {
    const html = [];
    if (S.assistChips && !design.adasNative) {
      if (d.cruise.on) {
        const acc = d.adas && d.adas.acc;
        html.push(`<span class="chip ${acc ? 'acc' : ''}">${acc ? 'ACC' : 'CRUISE'} ${Math.round(U.speed(acc ? d.adas.accSet : d.cruise.target))} ${acc ? '▮'.repeat(d.adas.accGap || 2) : ''}</span>`);
      }
      if (d.speedLimit && d.adas.tsr !== false) html.push(`<span class="chip limit"><b>${Math.round(U.speed(d.speedLimit) / 5) * 5}</b></span>`);
      const n = BD.navNext(d.route, d.pos);
      if (n) html.push(`<span class="chip nav">${n.dir === 'left' ? '↰' : n.dir === 'right' ? '↱' : '⚑'} ${n.dir === 'arrive' ? 'Arrive' : U.shortDist(n.dist)}</span>`);
      if (d.bsmL) html.push('<span class="chip bsm">◀ BLIND SPOT</span>');
      if (d.bsmR) html.push('<span class="chip bsm">BLIND SPOT ▶</span>');
    }
    const s = html.join('');
    if (chipsEl._last !== s) { chipsEl.innerHTML = s; chipsEl._last = s; }
    fcwEl.className = 'fcw' + (d.fcw ? ` on l${d.fcw}` : '');
    fcwEl.firstChild.textContent = d.fcw === 2 ? 'BRAKE!' : 'CAUTION';
  }

  // ---------------------------------------------------------------- design + multi-function display
  // live = the real cluster (pop-ups allowed); thumbnails always show the screen pages statically
  function drawDesign(c, def, d, t, live) {
    const o = optsFor(def);
    try { def.draw(c, d, { t, o, S }); } catch (err) { console.error(def.id, err); }
    G.noGlow(c);
    const slot = def.mfd ? def.mfd(o, d) : null;
    try {
      if (slot && !slot.line) MFD.draw(c, d, slot.x, slot.y, slot.w, slot.h, { ...(def.mfdTheme || {}), ...(slot.theme || {}) });
      else if (!slot && live) MFD.popup(c, d, def.mfdTheme);
    } catch (err) { console.error('mfd', err); }
    if (def.glass) {
      // faint sheet-of-glass reflection across the whole cluster
      const g = c.createLinearGradient(0, 0, VW, VH);
      g.addColorStop(0, 'rgba(255,255,255,.035)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.015)');
      c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    }
    G.noGlow(c);
  }

  function setDesign(def) {
    design = def;
    S.design = def.id;
    BD.save();
    sweepT = 0.001;
    BD.toast(def.name);
  }
  function stepDesign(dir) {
    const i = DESIGNS.indexOf(design);
    setDesign(DESIGNS[(i + dir + DESIGNS.length) % DESIGNS.length]);
  }

  // steering-wheel style controls: on-screen buttons, swipes, keys and remote macros all land here
  function ui(action) {
    if (action === 'next') MFD.next(1);
    else if (action === 'prev') MFD.next(-1);
    else if (action === 'ok') MFD.ok();
    else if (action === 'hold') MFD.hold();
    else if (action === 'back') MFD.back();
    else if (action === 'design-next') stepDesign(1);
    else if (action === 'design-prev') stepDesign(-1);
    else if (action === 'hide') document.body.classList.toggle('chrome-hidden');
    if (['next', 'prev', 'ok', 'hold', 'back'].includes(action)) beep(1800, 0.02, 0.05, 'sine');
  }
  BD.on('ui', (m) => ui(m.action));
  // local buttons act instantly here and tell other clusters through the server
  const press = (action) => { ui(action); };
  const wheel = document.getElementById('wheel');
  if (wheel) {
    wheel.querySelectorAll('[data-ui]').forEach((b) => {
      let holdTimer = 0, held = false;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        held = false;
        if (b.dataset.ui === 'ok') holdTimer = setTimeout(() => { held = true; press('hold'); }, 700);
      });
      b.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        clearTimeout(holdTimer);
        if (!held) press(b.dataset.ui);
      });
      b.addEventListener('pointerleave', () => clearTimeout(holdTimer));
      b.addEventListener('click', (e) => e.stopPropagation());
    });
  }
  // swipe left / right on the cluster flips pages, swipe up / down changes design
  let swipe = null, swiped = false;
  canvas.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, t: performance.now() }; swiped = false; });
  canvas.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (performance.now() - swipe.t < 700 && Math.max(Math.abs(dx), Math.abs(dy)) > 60) {
      swiped = true;
      if (Math.abs(dx) > Math.abs(dy)) press(dx < 0 ? 'next' : 'prev');
      else press(dy < 0 ? 'design-next' : 'design-prev');
    }
    swipe = null;
  });

  // ---------------------------------------------------------------- render loop
  let last = performance.now(), acc = 0, t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    acc += dt;
    last = now;
    if (S.fps == 30 && acc < 1 / 31) return;
    const fdt = acc;
    acc = 0;
    const d = smooth(BD.data(), fdt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.globalAlpha = 1;
    drawDesign(ctx, design, d, (now - t0) / 1000, true);
    if (S.brightness < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(0,0,0,${1 - S.brightness})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // sounds
    const sig = d.lights.sigL || d.lights.sigR;
    if (sig !== lastSig) { beep(sig ? 1400 : 900, 0.03, 0.08, 'triangle'); lastSig = sig; }
    if (d.fcw && now - fcwBeep > (d.fcw === 2 ? 180 : 600)) { beep(d.fcw === 2 ? 2200 : 1600, 0.09, 0.2); fcwBeep = now; }
    lastFcw = d.fcw;
    chipTimer += fdt;
    if (chipTimer > 0.2) { chipTimer = 0; updateChips(d); }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- sheets
  const scrim = document.getElementById('scrim');
  let openSheet = null, assistTimer = null;
  function open(name) {
    close();
    openSheet = document.getElementById('sheet-' + name);
    openSheet.classList.add('open');
    scrim.classList.add('open');
    if (name === 'designs') buildDesignList();
    if (name === 'custom') buildCustom();
    if (name === 'assist') assistTimer = Assist.mount(document.getElementById('assistBody'));
  }
  function close() {
    if (openSheet) openSheet.classList.remove('open');
    scrim.classList.remove('open');
    openSheet = null;
    if (assistTimer) { clearInterval(assistTimer); assistTimer = null; }
    if (thumbTimer) { clearInterval(thumbTimer); thumbTimer = null; }
  }
  document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); open(b.dataset.open); }));
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  scrim.onclick = close;

  // design picker with live thumbnails
  let thumbTimer = null;
  function buildDesignList() {
    const el = document.getElementById('designList');
    const eras = ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s', 'Custom'];
    el.innerHTML = eras.map((era) => {
      const items = DESIGNS.filter((x) => x.era === era);
      if (!items.length) return '';
      return `<div class="era"><h4>${era === 'Custom' ? 'Custom' : era}</h4><div class="thumbs">${items.map((x) => `
        <button class="thumb ${x.id === design.id ? 'on' : ''}" data-id="${x.id}">
          <canvas width="480" height="180"></canvas>
          <div><b>${x.name}</b><small>${x.region} · ${x.inspired}</small></div>
        </button>`).join('')}</div></div>`;
    }).join('');
    const thumbs = [...el.querySelectorAll('.thumb')];
    thumbs.forEach((b) => (b.onclick = () => {
      setDesign(DESIGNS.find((x) => x.id === b.dataset.id));
      thumbs.forEach((t) => t.classList.toggle('on', t === b));
    }));
    const paint = () => {
      const d = BD.data();
      thumbs.forEach((b) => {
        const def = DESIGNS.find((x) => x.id === b.dataset.id);
        const cv = b.querySelector('canvas');
        const c = cv.getContext('2d');
        c.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
        drawDesign(c, def, d, performance.now() / 1000, false);
      });
    };
    paint();
    thumbTimer = setInterval(paint, 700);
  }

  function buildCustom() {
    document.getElementById('designOptsTitle').textContent = `${design.name} options`;
    const box = document.getElementById('designOpts');
    const o = optsFor(design);
    box.innerHTML = (design.opts || []).map((op) => {
      let input;
      if (op.type === 'color') input = `<input type="color" data-k="${op.k}" value="${o[op.k]}">`;
      else if (op.type === 'bool') input = `<span class="switch"><input type="checkbox" data-k="${op.k}" ${o[op.k] ? 'checked' : ''}><i></i></span>`;
      else input = `<select data-k="${op.k}">${op.options.map((v) => `<option ${v === o[op.k] ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
      return `<label class="row"><span>${op.label}</span>${input}</label>`;
    }).join('') || '<p class="muted">No options for this design.</p>';
    box.querySelectorAll('[data-k]').forEach((inp) => {
      inp.oninput = inp.onchange = () => {
        S.designOpts[design.id] = S.designOpts[design.id] || {};
        S.designOpts[design.id][inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value;
        BD.save();
      };
    });
    document.getElementById('resetOpts').onclick = () => { delete S.designOpts[design.id]; BD.save(); buildCustom(); };
    const bindSel = (id, key, num) => {
      const el = document.getElementById(id);
      if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
      el.onchange = el.oninput = () => { S[key] = el.type === 'checkbox' ? el.checked : num ? +el.value : el.value; BD.save(); };
    };
    bindSel('speedUnit', 'speedUnit'); bindSel('tempUnit', 'tempUnit'); bindSel('pressUnit', 'pressUnit');
    bindSel('redline', 'redline', true); bindSel('shiftRpm', 'shiftRpm', true); bindSel('fps', 'fps', true);
    bindSel('brightness', 'brightness', true); bindSel('sounds', 'sounds'); bindSel('assistChips', 'assistChips');
    bindSel('wheelButtons', 'wheelButtons'); bindSel('cruiseStep', 'cruiseStep', true);
  }
  const applyWheel = () => { if (wheel) wheel.style.display = S.wheelButtons === false ? 'none' : ''; };
  BD.on('settings', applyWheel);
  applyWheel();

  // ---------------------------------------------------------------- chrome / fullscreen / wake lock
  const body = document.body;
  let hideTimer = 0;
  const showChrome = () => {
    body.classList.remove('chrome-hidden');
    clearTimeout(hideTimer);
    // phones, fullscreen and home-screen apps: tuck the controls away after a few seconds
    if (document.fullscreenElement || window.navigator.standalone || window.innerHeight < 520) hideTimer = setTimeout(() => !openSheet && body.classList.add('chrome-hidden'), 4000);
  };
  showChrome();
  canvas.addEventListener('click', () => {
    if (swiped) { swiped = false; return; }
    if (body.classList.contains('chrome-hidden')) showChrome();
    else if (!openSheet) { body.classList.add('chrome-hidden'); }
  });
  document.getElementById('hideBtn').onclick = (e) => { e.stopPropagation(); body.classList.add('chrome-hidden'); };
  document.getElementById('fsBtn').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch { BD.toast('Fullscreen not available here — on iPhone/iPad use Share → Add to Home Screen'); }
    showChrome();
  };
  let wakeLock = null;
  const keepAwake = async () => {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* needs https on some browsers */ }
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());
  window.addEventListener('pointerdown', keepAwake, { once: true });

  // page / design keys come from the shared key bindings (Macros page); these two stay local
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'a' && !BD.keys.a) open('assist');
    if (e.key === 'Escape') close();
  });
})();
