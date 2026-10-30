// HUD: big, minimal, optionally mirrored (put a phone under the windscreen / a reflective sheet).
// OBS: /hud?obs=1 renders a transparent streaming overlay for an OBS "Browser source" (1920x1080).
'use strict';
(() => {
  BD.connect();
  const S = BD.settings, U = BD.U;
  const qp = new URLSearchParams(location.search);
  const OBS = qp.has('obs');
  if (OBS) { document.documentElement.classList.add('obs'); document.body.classList.add('obs'); }
  let mirror = qp.has('mirror') || (!OBS && localStorage.getItem('bd.hud.mirror') === '1');
  let color = qp.get('color') ? '#' + qp.get('color').replace('#', '') : (localStorage.getItem('bd.hud.color') || '#3dffb0');
  document.body.classList.toggle('mirror', mirror);
  const cv = document.getElementById('hud'), c = cv.getContext('2d');
  const { text, rrect, glow, noGlow, clamp } = G;

  const VW = OBS ? 1920 : 1600, VH = OBS ? 1080 : 900;
  let scale = 1, ox = 0, oy = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    scale = Math.min(cv.width / VW, cv.height / VH);
    ox = (cv.width - VW * scale) / 2; oy = (cv.height - VH * scale) / 2;
  }
  addEventListener('resize', resize); resize();

  const sm = { speed: 0, rpm: 0 };
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const d = BD.data();
    sm.speed += (d.speed - sm.speed) * (1 - Math.exp(-dt * 12));
    sm.rpm += (d.rpm - sm.rpm) * (1 - Math.exp(-dt * 18));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    if (!OBS) { c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height); }
    c.setTransform(scale, 0, 0, scale, ox, oy);
    if (OBS) overlay(d); else hud(d);
    if (!OBS) Alerts.update(d, now);
  }

  // ---------------------------------------------------------------- windscreen HUD
  function hud(d) {
    const col = color;
    glow(c, col, 18);
    text(c, Math.round(U.speed(sm.speed)), 800, 360, 300, col, 'center', 'Rajdhani', 700);
    noGlow(c);
    text(c, U.speedLabel(), 800, 530, 40, col, 'center', 'Rajdhani', 600);
    // rpm (or power on EVs) bar + gear
    const f = d.isEV ? clamp(d.motorKw / d.maxPowerKw, 0, 1) : sm.rpm / d.tachMax;
    G.segments(c, 450, 600, 700, 26, 30, f, (ff) => (!d.isEV && ff * d.tachMax > d.redFrom ? '#ff3b30' : col), 'rgba(255,255,255,.07)', 0.3);
    text(c, d.gear, 800, 690, 70, '#fff', 'center', 'Rajdhani', 700);
    // left: limit + cruise
    if (d.speedLimit && d.adas.tsr !== false) G.limitSign(c, 230, 330, 80, Math.round(U.speed(d.speedLimit) / 5) * 5, S.speedUnit === 'mph');
    if (d.cruise.on) {
      G.icon(c, d.adas && d.adas.acc ? 'acc' : 'cruise', 200, 500, 70, col);
      text(c, Math.round(U.speed(d.adas && d.adas.acc ? d.adas.accSet || d.cruise.target : d.cruise.target)), 260, 505, 64, col, 'left', 'Rajdhani', 700);
    }
    // right: navigation
    const n = BD.navNext(d.route, d.pos);
    if (n) {
      text(c, n.dir === 'left' ? '↰' : n.dir === 'right' ? '↱' : '⚑', 1360, 320, 170, col, 'center', 'Arial', 700);
      text(c, n.dir === 'arrive' ? 'Arrive' : U.shortDist(n.dist), 1360, 470, 56, col, 'center', 'Rajdhani', 700);
    }
    // warnings
    if (d.fcw) { glow(c, '#ff2a1f', 30); text(c, d.fcw === 2 ? 'BRAKE!' : 'CAUTION', 800, 110, 110, d.fcw === 2 ? '#ff2a1f' : '#ffb000', 'center', 'Rajdhani', 700); noGlow(c); }
    if (d.bsmL) G.icon(c, 'bsm', 120, 120, 90, '#ffb000');
    if (d.bsmR) G.icon(c, 'bsm', 1480, 120, 90, '#ffb000');
    if (d.lights.sigL) G.icon(c, 'sigL', 560, 790, 70, LIGHT_GREEN);
    if (d.lights.sigR) G.icon(c, 'sigR', 1040, 790, 70, LIGHT_GREEN);
    const lp = (BD.st.perf || {}).lap || {};
    if (lp.running && typeof lp.delta === 'number') text(c, `${lp.delta > 0 ? '+' : '−'}${Math.abs(lp.delta).toFixed(2)}`, 800, 820, 60, lp.delta <= 0 ? '#2bd46a' : '#ff3b30', 'center', 'Rajdhani', 700);
    const b = Alerts.banner;
    if (b.until > performance.now()) text(c, b.text, 800, 200, 70, '#ffb000', 'center', 'Rajdhani', 700);
  }
  const LIGHT_GREEN = G.LIGHT.green;

  // ---------------------------------------------------------------- OBS overlay (transparent)
  function overlay(d) {
    const x = 40, y = VH - 290, w = 640, h = 250;
    c.fillStyle = 'rgba(5,8,12,.72)'; rrect(c, x, y, w, h, 22); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.stroke();
    text(c, Math.round(U.speed(sm.speed)), x + 150, y + 105, 120, '#fff', 'center', 'Rajdhani', 700);
    text(c, U.speedLabel(), x + 150, y + 175, 26, 'rgba(255,255,255,.65)', 'center', 'Rajdhani', 600);
    text(c, d.gear, x + 330, y + 100, 90, color, 'center', 'Rajdhani', 700);
    text(c, `${Math.round(sm.rpm)} rpm`, x + 330, y + 170, 24, 'rgba(255,255,255,.65)', 'center', 'Rajdhani', 600);
    const f = d.isEV ? clamp(d.motorKw / d.maxPowerKw, 0, 1) : sm.rpm / d.tachMax;
    G.segments(c, x + 30, y + 205, w - 60, 20, 30, f, (ff) => (!d.isEV && ff * d.tachMax > d.redFrom ? '#ff3b30' : color), 'rgba(255,255,255,.08)', 0.25);
    // pedals
    G.bar(c, x + 440, y + 30, 26, 160, d.throttle, '#2bd46a', 'rgba(255,255,255,.08)', true, 6);
    G.bar(c, x + 476, y + 30, 26, 160, d.brake, '#ff3b30', 'rgba(255,255,255,.08)', true, 6);
    G.gMeter(c, x + 570, y + 110, 52, d.gx, -d.gy, { color, label: false, grid: 'rgba(255,255,255,.15)' });
    // lap / drift chips above the panel
    const lp = (BD.st.perf || {}).lap || {};
    const chips = [];
    if (lp.running) {
      const t = BD.lapNow() || 0;
      chips.push([`LAP ${lp.n}  ${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`, '#fff']);
      if (typeof lp.delta === 'number') chips.push([`${lp.delta > 0 ? '+' : '−'}${Math.abs(lp.delta).toFixed(2)}`, lp.delta <= 0 ? '#2bd46a' : '#ff3b30']);
    }
    const dr = (BD.st.fun || {}).drift;
    if (dr && dr.active) chips.push([`DRIFT ${dr.score}  ${Math.round(Math.abs(dr.angle))}°`, '#c07aff']);
    const pf = BD.st.perf;
    if (pf && pf.state === 'running' && pf.run) chips.push([`RUN ${pf.run.elapsed.toFixed(2)} s`, '#ffb000']);
    let cx = x;
    for (const [s, col] of chips) {
      c.font = '700 34px Rajdhani'; const tw = c.measureText(s).width + 40;
      c.fillStyle = 'rgba(5,8,12,.72)'; rrect(c, cx, y - 66, tw, 52, 14); c.fill();
      text(c, s, cx + tw / 2, y - 40, 34, col, 'center', 'Rajdhani', 700);
      cx += tw + 12;
    }
  }

  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- controls
  const bar = document.getElementById('bar');
  let hideT = 0;
  const show = () => { bar.classList.remove('hide'); clearTimeout(hideT); hideT = setTimeout(() => bar.classList.add('hide'), 3500); };
  addEventListener('pointerdown', show); show();
  const sel = document.getElementById('color');
  sel.value = color;
  sel.onchange = () => { color = sel.value; try { localStorage.setItem('bd.hud.color', color); } catch { /* ignore */ } };
  document.getElementById('mirror').onclick = () => {
    mirror = !mirror; document.body.classList.toggle('mirror', mirror);
    try { localStorage.setItem('bd.hud.mirror', mirror ? '1' : '0'); } catch { /* ignore */ }
  };
  document.getElementById('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
  document.getElementById('obsLink').onclick = async () => {
    const url = `${location.origin}/hud?obs=1&color=${color.replace('#', '')}`;
    try { await navigator.clipboard.writeText(url); BD.toast('Copied — add it in OBS as a Browser source (1920×1080)'); } catch { prompt('OBS Browser source URL (1920x1080):', url); }
  };
})();
