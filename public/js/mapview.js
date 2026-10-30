// Shared road-network renderer for the in-game map (used by the Map page and cluster designs).
'use strict';
window.MapView = (() => {
  const CELL = 250;
  let map = null, version = -1, grid = new Map(), bounds = null;
  const listeners = [];

  async function load() {
    try {
      const r = await fetch('/api/map', { cache: 'no-store' });
      if (!r.ok) { map = null; return; }
      const m = await r.json();
      grid = new Map();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of m.nodes) {
        minX = Math.min(minX, n[0]); maxX = Math.max(maxX, n[0]);
        minY = Math.min(minY, n[1]); maxY = Math.max(maxY, n[1]);
      }
      m.edges.forEach((e, i) => {
        const a = m.nodes[e[0]], b = m.nodes[e[1]];
        if (!a || !b) return;
        const cx0 = Math.floor(Math.min(a[0], b[0]) / CELL), cx1 = Math.floor(Math.max(a[0], b[0]) / CELL);
        const cy0 = Math.floor(Math.min(a[1], b[1]) / CELL), cy1 = Math.floor(Math.max(a[1], b[1]) / CELL);
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
          const k = cx + ',' + cy;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(i);
        }
      });
      bounds = { minX, minY, maxX, maxY };
      map = m;
      listeners.forEach((f) => f(map));
    } catch (err) { console.warn('map load failed', err); }
  }
  const sync = (v) => { if (v && v !== version) { version = v; load(); } };
  BD.on('mapver', (m) => sync(m.version));
  BD.on('status', (s) => sync(s.mapVersion));

  const THEMES = {
    dark: { bg: '#0d1117', road: '#3a4252', roadMajor: '#5a6478', edge: '#05070a', dirt: '#5b4a35', route: '#2f9bff', me: '#ffffff', other: '#ffb000', grid: null },
    night: { bg: '#05080d', road: '#253041', roadMajor: '#3a4a63', edge: '#000', dirt: '#3b3326', route: '#36a3ff', me: '#fff', other: '#ff9a3d' },
    light: { bg: '#e8ebef', road: '#ffffff', roadMajor: '#fff7d6', edge: '#b8c0cc', dirt: '#d7c4a3', route: '#1a73e8', me: '#1a73e8', other: '#e8710a' },
    amber: { bg: '#100800', road: '#4a2a08', roadMajor: '#7a4410', edge: '#000', dirt: '#3a2408', route: '#ffb000', me: '#ffd27a', other: '#ff6a00' },
  };

  function makeProjector(x, y, w, h, o) {
    const s = o.scale, rot = o.rot || 0, cos = Math.cos(rot), sin = Math.sin(rot);
    const ox = x + w / 2, oy = y + h * (o.anchorY ?? 0.5);
    return {
      s, rot, ox, oy,
      p: (wx, wy) => {
        const sx = (wx - o.cx) * s, sy = -(wy - o.cy) * s;
        return [ox + sx * cos - sy * sin, oy + sx * sin + sy * cos];
      },
      inv: (px, py) => {
        const dx = px - ox, dy = py - oy;
        const sx = dx * cos + dy * sin, sy = -dx * sin + dy * cos;
        return [o.cx + sx / s, o.cy - sy / s];
      },
    };
  }

  // o: { cx, cy, scale(px/m), rot, anchorY, theme, route, vehicles, myId, heading }
  function draw(c, x, y, w, h, o) {
    const th = typeof o.theme === 'object' ? o.theme : THEMES[o.theme || 'dark'];
    const P = makeProjector(x, y, w, h, o);
    c.save();
    c.beginPath();
    if (o.clipRound) G.rrect(c, x, y, w, h, o.clipRound); else c.rect(x, y, w, h);
    c.clip();
    if (th.bg) { c.fillStyle = th.bg; c.fillRect(x, y, w, h); }

    if (map) {
      const reach = Math.hypot(w, h) / P.s * 0.75;
      const cx0 = Math.floor((o.cx - reach) / CELL), cx1 = Math.floor((o.cx + reach) / CELL);
      const cy0 = Math.floor((o.cy - reach) / CELL), cy1 = Math.floor((o.cy + reach) / CELL);
      const seen = new Set();
      const groups = { dirt: [], minor: [], major: [] };
      for (let gx = cx0; gx <= cx1; gx++) for (let gy = cy0; gy <= cy1; gy++) {
        const list = grid.get(gx + ',' + gy);
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue;
          seen.add(i);
          const e = map.edges[i];
          const a = map.nodes[e[0]], b = map.nodes[e[1]];
          const r = (a[3] + b[3]) / 2;
          const cls = e[2] < 0.5 ? 'dirt' : r >= 5 ? 'major' : 'minor';
          groups[cls].push([a, b, r]);
        }
      }
      c.save();
      c.translate(P.ox, P.oy);
      c.rotate(P.rot);
      c.scale(P.s, -P.s);
      c.translate(-o.cx, -o.cy);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      const minW = (o.minRoadPx || 1.6) / P.s;
      const stroke = (list, color, extra) => {
        // bucket by width so each bucket is one path
        const buckets = new Map();
        for (const [a, b, r] of list) {
          const wd = Math.max(minW, r * 2 * (o.roadScale || 1)) + extra;
          const k = Math.round(wd * 4) / 4;
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push([a, b]);
        }
        for (const [wd, segs] of buckets) {
          c.beginPath();
          for (const [a, b] of segs) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
          c.lineWidth = wd;
          c.strokeStyle = color;
          c.stroke();
        }
      };
      if (th.edge) {
        const ex = 2.4 / P.s;
        stroke(groups.dirt, th.edge, ex); stroke(groups.minor, th.edge, ex); stroke(groups.major, th.edge, ex);
      }
      stroke(groups.dirt, th.dirt, 0);
      stroke(groups.minor, th.road, 0);
      stroke(groups.major, th.roadMajor, 0);
      c.restore();
    } else if (o.noMapText !== false) {
      G.text(c, 'Waiting for map…', x + w / 2, y + h / 2, Math.min(28, w / 14), 'rgba(255,255,255,.4)', 'center', 'Rajdhani', 600);
    }

    // route
    const route = o.route;
    if (route && route.pts && route.pts.length > 1) {
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      route.pts.forEach((pt, i) => { const q = P.p(pt[0], pt[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
      c.lineWidth = Math.max(5, (o.routeW || 7));
      c.strokeStyle = 'rgba(0,0,0,.45)';
      c.stroke();
      c.lineWidth = Math.max(3, (o.routeW || 7) - 3);
      c.strokeStyle = th.route;
      c.stroke();
      const end = route.pts[route.pts.length - 1];
      const q = P.p(end[0], end[1]);
      c.fillStyle = '#e8352b';
      c.beginPath(); c.arc(q[0], q[1] - 14, 9, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(q[0] - 7, q[1] - 10); c.lineTo(q[0], q[1]); c.lineTo(q[0] + 7, q[1] - 10); c.fill();
      c.restore();
    }
    if (o.dest) {
      const q = P.p(o.dest[0], o.dest[1]);
      c.strokeStyle = '#e8352b'; c.lineWidth = 3;
      c.beginPath(); c.arc(q[0], q[1], 12, 0, Math.PI * 2); c.stroke();
    }

    // vehicles
    for (const v of o.vehicles || []) {
      const q = P.p(v.x, v.y);
      if (q[0] < x - 30 || q[0] > x + w + 30 || q[1] < y - 30 || q[1] > y + h + 30) continue;
      const hd = Math.atan2(-v.hy, v.hx) + P.rot; // screen angle
      const me = v.me || v.id === o.myId;
      const sz = me ? (o.meSize || 16) : (o.otherSize || 9);
      c.save();
      c.translate(q[0], q[1]);
      c.rotate(hd);
      c.beginPath();
      if (me) { c.moveTo(sz, 0); c.lineTo(-sz * 0.75, sz * 0.7); c.lineTo(-sz * 0.35, 0); c.lineTo(-sz * 0.75, -sz * 0.7); }
      else { c.moveTo(sz, 0); c.lineTo(-sz * 0.7, sz * 0.6); c.lineTo(-sz * 0.7, -sz * 0.6); }
      c.closePath();
      c.fillStyle = me ? th.me : th.other;
      c.strokeStyle = 'rgba(0,0,0,.7)';
      c.lineWidth = 2;
      c.fill(); c.stroke();
      c.restore();
    }
    c.restore();
    return P;
  }

  // view helper for "follow my car, heading up"
  // own car from the 30 Hz vehicle stream (smoother than the 10 Hz world list)
  function me(d) {
    if (d.pos && d.dir) return { x: d.pos[0], y: d.pos[1], hx: d.dir[0], hy: d.dir[1], me: true };
    return (d.vehicles || []).find((v) => v.me) || null;
  }
  function liveVehicles(d) {
    const m = me(d);
    return (d.vehicles || []).map((v) => (v.me && m ? { ...v, ...m } : v));
  }
  function follow(d, zoom = 1.2, headingUp = true) {
    const m = me(d);
    if (!m) return null;
    const heading = Math.atan2(m.hy, m.hx);
    return { cx: m.x, cy: m.y, scale: zoom, rot: headingUp ? heading - Math.PI / 2 : 0 };
  }

  // one-call minimap for cluster designs
  function mini(c, d, x, y, w, h, o = {}) {
    const f = follow(d, o.zoom || 1.1, o.headingUp !== false);
    if (!f) return null;
    return draw(c, x, y, w, h, { ...f, anchorY: o.anchorY ?? 0.62, theme: o.theme || 'night', route: d.route, vehicles: liveVehicles(d), myId: d.myId, ...o });
  }

  return { draw, follow, me, liveVehicles, mini, load, makeProjector, THEMES, get map() { return map; }, get bounds() { return bounds; }, onLoad: (f) => listeners.push(f) };
})();
