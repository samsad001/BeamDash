// Map & Nav page: live in-game road map, all vehicles, route, tap-to-navigate.
'use strict';
(() => {
  BD.nav('map');
  BD.connect();
  const U = BD.U;
  const $ = (id) => document.getElementById(id);
  const cv = $('map'), c = cv.getContext('2d');
  const view = { cx: 0, cy: 0, scale: 0.6, rot: 0, follow: true, headUp: true, theme: localStorage.getItem('bd.mapTheme') || 'dark' };
  $('theme').value = view.theme;
  let P = null, dest = null, fitted = false;

  function size() {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  window.addEventListener('resize', size);
  size();

  // whole-map view when no car is known yet
  MapView.onLoad(() => {
    const b = MapView.bounds;
    if (!b || fitted) return;
    const r = cv.getBoundingClientRect();
    view.cx = (b.minX + b.maxX) / 2; view.cy = (b.minY + b.maxY) / 2;
    view.scale = Math.min(r.width / (b.maxX - b.minX + 50), r.height / (b.maxY - b.minY + 50)) * 0.9;
    fitted = true;
  });

  function frame() {
    requestAnimationFrame(frame);
    const d = BD.data();
    const dpr = window.devicePixelRatio || 1;
    const w = cv.width / dpr, h = cv.height / dpr;
    if (view.follow) {
      const f = MapView.follow(d, view.scale, view.headUp);
      if (f) { view.cx = f.cx; view.cy = f.cy; view.rot = f.rot; }
    } else if (!view.headUp) view.rot = 0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    P = MapView.draw(c, 0, 0, w, h, {
      cx: view.cx, cy: view.cy, scale: view.scale, rot: view.rot, anchorY: view.follow && view.headUp ? 0.65 : 0.5,
      theme: view.theme, route: d.route, vehicles: MapView.liveVehicles(d), myId: d.myId, dest, meSize: 18, otherSize: 11,
      lapLine: BD.st.perf && BD.st.perf.lap && BD.st.perf.lap.line, watched: d.watching,
    });
    // north arrow + scale bar
    c.save();
    c.translate(w - 34, 34); c.rotate(view.rot);
    c.fillStyle = '#ff3b30'; c.beginPath(); c.moveTo(0, -16); c.lineTo(7, 4); c.lineTo(-7, 4); c.fill();
    c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(0, 16); c.lineTo(7, 4); c.lineTo(-7, 4); c.fill();
    c.restore();
    G.text(c, 'N', w - 34, 62, 13, '#ddd', 'center', 'Rajdhani', 700);
    const meters = [10, 25, 50, 100, 250, 500, 1000, 2500].find((m) => m * view.scale > 70) || 5000;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(12, h - 34, meters * view.scale + 16, 24);
    c.fillStyle = '#fff'; c.fillRect(20, h - 18, meters * view.scale, 3);
    G.text(c, U.shortDist(meters), 20, h - 26, 12, '#fff', 'left', 'Rajdhani', 600);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- interaction
  const pointers = new Map();
  let drag = null, pinch = null, moved = false;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    moved = false;
    if (pointers.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: view.cx, cy: view.cy };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.scale }; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      view.scale = Math.max(0.02, Math.min(12, pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
      moved = true;
      return;
    }
    if (drag && P) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (!moved) return;
      setFollow(false);
      const cos = Math.cos(view.rot), sin = Math.sin(view.rot);
      const sx = dx * cos + dy * sin, sy = -dx * sin + dy * cos;
      view.cx = drag.cx - sx / view.scale; view.cy = drag.cy + sy / view.scale;
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (!moved && P) showPop(e.offsetX, e.offsetY);
      drag = null;
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.scale = Math.max(0.02, Math.min(12, view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  }, { passive: false });

  const pop = $('pop');
  let popWorld = null;
  function showPop(x, y) {
    popWorld = P.inv(x, y);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
    pop.classList.add('show');
  }
  $('popX').onclick = () => pop.classList.remove('show');
  $('goHere').onclick = async () => {
    pop.classList.remove('show');
    dest = popWorld;
    const r = await BD.cmd('navTo', { x: popWorld[0], y: popWorld[1] });
    BD.toast(r && r.ok ? 'Route requested — follow the blue line' : 'Could not set route');
    setTimeout(() => { dest = null; }, 4000);
  };
  // lap start/finish line: across the nearest road at the tapped point
  $('lapHere').onclick = async () => {
    pop.classList.remove('show');
    const m = MapView.map;
    if (!m || !popWorld) { BD.toast('Map not loaded yet', true); return; }
    let best = null, bd = Infinity;
    for (const e of m.edges) {
      const a = m.nodes[e[0]], b = m.nodes[e[1]];
      const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((popWorld[0] - a[0]) * dx + (popWorld[1] - a[1]) * dy) / len2));
      const px = a[0] + dx * t, py = a[1] + dy * t;
      const dist = Math.hypot(popWorld[0] - px, popWorld[1] - py);
      if (dist < bd) { bd = dist; best = { px, py, dx, dy, r: (a[3] + b[3]) / 2 }; }
    }
    if (!best || bd > 60) { BD.toast('Tap closer to a road', true); return; }
    const l = Math.hypot(best.dx, best.dy) || 1, half = Math.max(10, best.r * 1.8);
    const nx = -best.dy / l, ny = best.dx / l;
    const r = await BD.cmd('lapLine', { x1: best.px - nx * half, y1: best.py - ny * half, x2: best.px + nx * half, y2: best.py + ny * half });
    BD.toast(r && r.ok ? 'Start/finish line set: drive through it to start a lap' : 'Could not set the line');
  };
  $('clearRoute').onclick = () => BD.cmd('navClear');
  $('reloadMap').onclick = () => { BD.cmd('getMap'); setTimeout(() => MapView.load(), 1500); BD.toast('Asking the game for the road network…'); };

  function setFollow(on) { view.follow = on; $('follow').classList.toggle('on', on); }
  $('follow').onclick = () => setFollow(!view.follow);
  $('headUp').onclick = () => { view.headUp = !view.headUp; $('headUp').classList.toggle('on', view.headUp); if (!view.headUp) view.rot = 0; };
  $('zin').onclick = () => { view.scale = Math.min(12, view.scale * 1.4); };
  $('zout').onclick = () => { view.scale = Math.max(0.02, view.scale / 1.4); };
  $('theme').onchange = (e) => { view.theme = e.target.value; try { localStorage.setItem('bd.mapTheme', view.theme); } catch { /* ignore */ } };

  // ---------------------------------------------------------------- side panel
  setInterval(() => {
    const d = BD.data();
    const n = BD.navNext(d.route, d.pos);
    if (n) {
      $('nArrow').textContent = n.dir === 'left' ? (n.sharp ? '⮢' : '↰') : n.dir === 'right' ? (n.sharp ? '⮣' : '↱') : '⚑';
      $('nDist').textContent = n.dir === 'arrive' ? U.shortDist(n.dist) : U.shortDist(n.dist);
      $('nSub').textContent = n.dir === 'arrive' ? 'to your destination' : `then turn ${n.dir}`;
      $('nRem').textContent = U.shortDist(n.total);
      const eta = n.total / Math.max(d.speed, 8);
      $('nEta').textContent = `${Math.floor(eta / 60)} min ${Math.round(eta % 60)} s`;
    } else {
      $('nArrow').textContent = '·'; $('nDist').textContent = 'No route';
      $('nSub').textContent = 'Tap the map to choose a destination, or set a waypoint in-game.';
      $('nRem').textContent = '—'; $('nEta').textContent = '—';
    }
    $('nSpd').textContent = `${Math.round(U.speed(d.speed))} / ${d.speedLimit ? Math.round(U.speed(d.speedLimit) / 5) * 5 : '—'} ${U.speedLabel()}`;
    const w = BD.st.world || {}, m = MapView.map;
    $('world').innerHTML = [['Level', w.level || '—'], ['Roads', m ? `${m.edges.length} segments` : 'loading…'], ['Vehicles', (w.vehicles || []).length], ['Time', BD.clock(w.tod)], ['Paused', w.paused ? 'yes' : 'no']]
      .map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    const me = MapView.me(d);
    const vl = $('vlist');
    const list = (w.vehicles || []).map((v) => ({ ...v, dist: me ? Math.hypot(v.x - me.x, v.y - me.y) : 0 })).sort((a, b) => a.dist - b.dist);
    const watched = w.watched || null;
    const html = (watched ? '<button class="btn small on" data-watch="off" style="justify-content:center">◀ Back to my car</button>' : '') +
      list.map((v) => `<div style="display:flex;gap:6px"><button class="btn small" style="flex:1" data-x="${v.x}" data-y="${v.y}"><span>${v.me ? '★ You' : '#' + v.id}</span><span class="muted">${v.me ? '' : U.shortDist(v.dist) + ' · '}${Math.round(U.speed(v.spd))} ${U.speedLabel()}</span></button>${v.me ? '' : `<button class="btn small ${watched === v.id ? 'on' : ''}" data-watch="${v.id}" title="Watch this car's live data">👁</button>`}</div>`).join('');
    if (vl._h !== html) {
      vl._h = html;
      vl.innerHTML = html;
      vl.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { setFollow(false); view.cx = +b.dataset.x; view.cy = +b.dataset.y; view.scale = Math.max(view.scale, 1); }));
      vl.querySelectorAll('[data-watch]').forEach((b) => (b.onclick = () => {
        const vid = b.dataset.watch === 'off' || watched === +b.dataset.watch ? null : +b.dataset.watch;
        BD.cmd('watch', { vid });
        BD.toast(vid ? `Watching #${vid}` : 'Back to your car');
      }));
    }
  }, 500);
})();
