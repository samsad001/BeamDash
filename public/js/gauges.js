// BeamDash gauge primitives (canvas 2D). All designs are built from these.
'use strict';
window.G = (() => {
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function text(c, s, x, y, size, color, align = 'center', font = 'Barlow Condensed', weight = 600, base = 'middle') {
    c.font = `${weight} ${size}px "${font}", "Arial Narrow", sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = base;
    c.fillText(s, x, y);
  }

  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function glow(c, color, blur) {
    c.shadowColor = color;
    c.shadowBlur = blur;
  }
  function noGlow(c) { c.shadowBlur = 0; c.shadowColor = 'transparent'; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }

  // subtle curved-glass reflection over a round dial
  function glass(c, x, y, r) {
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    const g = c.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.4);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(0.45, 'rgba(255,255,255,.025)'); g.addColorStop(0.46, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x - r * 0.15, y - r * 0.35, r * 1.05, r * 0.75, -0.5, 0, TAU); c.fill();
    const v = c.createRadialGradient(x, y, r * 0.75, x, y, r);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
    c.fillStyle = v; c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }

  // Face + ticks + labels. Returns the value->angle mapping for needles.
  function dial(c, o) {
    const x = o.x, y = o.y, r = o.r, min = o.min ?? 0, max = o.max ?? 100;
    const a0 = o.a0 ?? 0.75 * PI, a1 = o.a1 ?? 2.25 * PI;
    const ang = (v) => a0 + (clamp(v, min, max) - min) / (max - min) * (a1 - a0);
    c.save();
    if (o.face) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fillStyle = typeof o.face === 'function' ? o.face(c, x, y, r) : o.face;
      c.fill();
    }
    if (o.rim) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.lineWidth = o.rimW || 4;
      c.strokeStyle = typeof o.rim === 'function' ? o.rim(c, x, y, r) : o.rim;
      c.stroke();
    }
    if (o.red) {
      const rr = r * (o.red.r ?? 0.86), rw = r * (o.red.w ?? 0.06);
      c.beginPath();
      c.arc(x, y, rr, ang(o.red.from), ang(o.red.to ?? max), a1 < a0);
      c.lineWidth = rw;
      c.strokeStyle = o.red.color || '#e0201a';
      c.stroke();
    }
    if (o.arcLine) {
      c.beginPath();
      c.arc(x, y, r * (o.arcLine.r ?? 0.93), a0, a1, a1 < a0);
      c.lineWidth = o.arcLine.w || 2;
      c.strokeStyle = o.arcLine.color;
      c.stroke();
    }
    const minor = o.minor, major = o.major;
    const tOut = r * (o.tickR ?? 0.94);
    if (o.tickGlow) glow(c, o.tickGlow, 8);
    if (minor) {
      const n = Math.round((max - min) / minor);
      for (let i = 0; i <= n; i++) {
        const v = min + i * minor;
        const isMajor = major && Math.abs(((v - min) / major) - Math.round((v - min) / major)) < 1e-6;
        const isMid = o.mid && !isMajor && Math.abs(((v - min) / o.mid) - Math.round((v - min) / o.mid)) < 1e-6;
        const len = r * (isMajor ? (o.majorLen ?? 0.12) : isMid ? (o.midLen ?? 0.085) : (o.minorLen ?? 0.055));
        const a = ang(v);
        c.beginPath();
        c.moveTo(x + Math.cos(a) * tOut, y + Math.sin(a) * tOut);
        c.lineTo(x + Math.cos(a) * (tOut - len), y + Math.sin(a) * (tOut - len));
        c.lineWidth = isMajor ? (o.majorW ?? r * 0.022) : (o.minorW ?? r * 0.01);
        c.strokeStyle = (o.tickColorFn && o.tickColorFn(v)) || o.tickColor || '#fff';
        c.lineCap = o.tickCap || 'butt';
        c.stroke();
      }
    }
    noGlow(c);
    if (o.labels !== false && major) {
      const n = Math.round((max - min) / (o.labelStep || major));
      const lr = r * (o.labelR ?? 0.7);
      if (o.labelGlow) glow(c, o.labelGlow, 10);
      for (let i = 0; i <= n; i++) {
        const v = min + i * (o.labelStep || major);
        const s = o.label ? o.label(v) : String(v);
        if (s === null) continue;
        const a = ang(v);
        const col = (o.labelColorFn && o.labelColorFn(v)) || o.labelColor || '#fff';
        if (o.labelRotate) {
          c.save();
          c.translate(x + Math.cos(a) * lr, y + Math.sin(a) * lr);
          c.rotate(a + PI / 2);
          text(c, s, 0, 0, o.labelSize || r * 0.16, col, 'center', o.font, o.weight ?? 600);
          c.restore();
        } else {
          text(c, s, x + Math.cos(a) * lr, y + Math.sin(a) * lr, o.labelSize || r * 0.16, col, 'center', o.font, o.weight ?? 600);
        }
      }
      noGlow(c);
    }
    c.restore();
    return ang;
  }

  // needle styles: 'classic' (tapered), 'bar' (rect), 'line', 'pointer' (only the tip segment), 'blade'
  function needle(c, x, y, a, o = {}) {
    const len = o.len, tail = o.tail ?? len * 0.18, w = o.w ?? len * 0.035, col = o.color || '#ff3b1f';
    c.save();
    c.translate(x, y);
    c.rotate(a);
    if (o.glow) glow(c, o.glow, o.glowBlur || 14);
    else if (o.shadow !== false) {
      // needles sit above the face: soft shadow down-right (shadow offsets ignore the rotation)
      c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6;
      c.shadowOffsetX = 3; c.shadowOffsetY = 4;
    }
    c.fillStyle = col;
    c.beginPath();
    const style = o.style || 'classic';
    if (style === 'classic') {
      c.moveTo(-tail, -w * 1.1);
      c.lineTo(len, -w * 0.25);
      c.lineTo(len, w * 0.25);
      c.lineTo(-tail, w * 1.1);
    } else if (style === 'bar') {
      c.rect(-tail, -w / 2, len + tail, w);
    } else if (style === 'pointer') {
      const s = o.start ?? len * 0.55;
      c.moveTo(s, -w * 0.8);
      c.lineTo(len, -w * 0.3);
      c.lineTo(len, w * 0.3);
      c.lineTo(s, w * 0.8);
    } else if (style === 'blade') {
      c.moveTo(-tail, 0);
      c.lineTo(len * 0.1, -w * 1.6);
      c.lineTo(len, 0);
      c.lineTo(len * 0.1, w * 1.6);
    }
    c.closePath();
    c.fill();
    noGlow(c);
    if (o.cap) {
      c.rotate(-a); // keep the cap's light coming from the top-left
      c.beginPath();
      c.arc(0, 0, o.cap, 0, TAU);
      const cg = c.createRadialGradient(-o.cap * 0.35, -o.cap * 0.4, o.cap * 0.1, 0, 0, o.cap);
      cg.addColorStop(0, o.capRim ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)');
      cg.addColorStop(0.35, o.capColor || '#111');
      cg.addColorStop(1, '#000');
      c.fillStyle = cg;
      c.fill();
      if (o.capRim) { c.lineWidth = 2; c.strokeStyle = o.capRim; c.stroke(); }
    }
    c.restore();
  }

  // filled arc progress (modern clusters)
  function arcBar(c, x, y, r, w, a0, a1, frac, color, bg, o = {}) {
    c.save();
    c.lineCap = o.cap || 'butt';
    if (bg) {
      c.beginPath();
      c.arc(x, y, r, a0, a1, a1 < a0);
      c.lineWidth = w;
      c.strokeStyle = bg;
      c.stroke();
    }
    frac = clamp(frac, 0, 1);
    if (frac > 0.001) {
      c.beginPath();
      c.arc(x, y, r, a0, a0 + (a1 - a0) * frac, a1 < a0);
      c.lineWidth = w;
      if (o.glow) glow(c, o.glow, o.glowBlur || 16);
      c.strokeStyle = typeof color === 'function' ? color(c) : color;
      c.stroke();
    }
    c.restore();
  }

  function bar(c, x, y, w, h, frac, color, bg, vertical, radius = 0) {
    frac = clamp(frac, 0, 1);
    if (bg) { c.fillStyle = bg; rrect(c, x, y, w, h, radius); c.fill(); }
    c.fillStyle = color;
    if (vertical) rrect(c, x, y + h * (1 - frac), w, h * frac, radius);
    else rrect(c, x, y, w * frac, h, radius);
    if (frac > 0) c.fill();
  }

  // segmented bar (80s LCD / shift lights)
  function segments(c, x, y, w, h, n, frac, colorFn, off, gap = 0.25, vertical = false) {
    const lit = Math.round(clamp(frac, 0, 1) * n);
    for (let i = 0; i < n; i++) {
      c.fillStyle = i < lit ? colorFn(i / n, i) : off;
      if (vertical) {
        const sh = h / n;
        c.fillRect(x, y + h - (i + 1) * sh + sh * gap / 2, w, sh * (1 - gap));
      } else {
        const sw = w / n;
        c.fillRect(x + i * sw + sw * gap / 2, y, sw * (1 - gap), h);
      }
    }
  }

  // ---------------------------------------------------------------- seven segment
  const SEG = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    '-': 'g', ' ': '', P: 'abefg', R: 'eg', r: 'eg', N: 'ceg', n: 'ceg', D: 'bcdeg', d: 'bcdeg', E: 'adefg', F: 'aefg',
    L: 'def', H: 'bcefg', A: 'abcefg', C: 'adef', S: 'afgcd', U: 'bcdef', o: 'cdeg', t: 'defg', b: 'cdefg', M: 'abcef', _: 'd',
  };
  function seg7(c, str, x, y, h, color, off, o = {}) {
    str = String(str);
    const w = h * (o.wRatio ?? 0.52), t = h * (o.thick ?? 0.12), gap = h * 0.22, skew = o.skew ?? 0.1;
    const total = str.replace(/\./g, '').length * (w + gap) - gap;
    let cx = o.align === 'right' ? x - total : o.align === 'left' ? x : x - total / 2;
    c.save();
    c.transform(1, 0, -skew, 1, skew * y, 0);
    const segPath = (sx, sy, L, horiz) => {
      const ht = t / 2;
      c.beginPath();
      if (horiz) {
        c.moveTo(sx, sy); c.lineTo(sx + ht, sy - ht); c.lineTo(sx + L - ht, sy - ht);
        c.lineTo(sx + L, sy); c.lineTo(sx + L - ht, sy + ht); c.lineTo(sx + ht, sy + ht);
      } else {
        c.moveTo(sx, sy); c.lineTo(sx + ht, sy + ht); c.lineTo(sx + ht, sy + L - ht);
        c.lineTo(sx, sy + L); c.lineTo(sx - ht, sy + L - ht); c.lineTo(sx - ht, sy + ht);
      }
      c.closePath();
    };
    const top = y - h / 2, hh = h / 2;
    for (const ch of str) {
      if (ch === '.') {
        c.fillStyle = color;
        c.fillRect(cx - gap * 0.75, y + hh - t, t, t);
        continue;
      }
      const on = SEG[ch] ?? SEG[ch.toUpperCase()] ?? '';
      const p = 1.5;
      const segs = {
        a: [cx + p, top, w - 2 * p, true], g: [cx + p, top + hh, w - 2 * p, true], d: [cx + p, top + h, w - 2 * p, true],
        f: [cx, top + p, hh - 2 * p, false], b: [cx + w, top + p, hh - 2 * p, false],
        e: [cx, top + hh + p, hh - 2 * p, false], c: [cx + w, top + hh + p, hh - 2 * p, false],
      };
      for (const k of 'abcdefg') {
        const lit = on.includes(k);
        if (!lit && !off) continue;
        segPath(...segs[k]);
        if (lit && o.glow) glow(c, o.glow, o.glowBlur || 12);
        c.fillStyle = lit ? color : off;
        c.fill();
        noGlow(c);
      }
      cx += w + gap;
    }
    c.restore();
  }

  // ---------------------------------------------------------------- warning icons
  // standard tell-tale colours
  const LIGHT = { red: '#ff2a1f', amber: '#ffb000', green: '#27e05a', blue: '#2f7bff', white: '#e8eef5', cyan: '#30d0ff' };

  function icon(c, name, x, y, s, col) {
    c.save();
    c.translate(x, y);
    c.scale(s / 100, s / 100);
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const P = (pts, fill = true) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); fill ? c.fill() : c.stroke(); };
    const L = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    const T = (s2, size = 30, yy = 0) => { c.font = `800 ${size}px "Barlow Condensed", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s2, 0, yy); };
    const lamp = () => { c.beginPath(); c.moveTo(5, -30); c.bezierCurveTo(45, -30, 45, 30, 5, 30); c.closePath(); c.stroke(); };
    switch (name) {
      case 'sigL': P([[-45, 0], [-5, -35], [-5, -15], [40, -15], [40, 15], [-5, 15], [-5, 35]]); break;
      case 'sigR': P([[45, 0], [5, -35], [5, -15], [-40, -15], [-40, 15], [5, 15], [5, 35]]); break;
      case 'high': lamp(); for (let i = -1; i <= 1; i++) L(-45, i * 18, -12, i * 18); L(-45, -30, -12, -30); L(-45, 30, -12, 30); break;
      case 'low': lamp(); for (let i = -2; i <= 2; i++) L(-42, i * 14 + 6, -12, i * 14 - 4); break;
      case 'fog': lamp(); for (let i = -1; i <= 1; i++) L(-45, i * 18, -15, i * 18); c.beginPath(); c.moveTo(-30, -38); c.bezierCurveTo(-18, -15, -42, 15, -30, 38); c.stroke(); break;
      case 'park': c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 44, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(0, 0, 44, PI - 0.8, PI + 0.8); c.stroke(); T('P', 44, 2); break;
      case 'brakeWarn': c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 44, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(0, 0, 44, PI - 0.8, PI + 0.8); c.stroke(); T('!', 44, 2); break;
      case 'abs': c.beginPath(); c.arc(0, 0, 33, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 46, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(0, 0, 46, PI - 0.8, PI + 0.8); c.stroke(); T('ABS', 26, 2); break;
      case 'esc': case 'escOff':
        rrect(c, -28, -32, 56, 34, 10); c.stroke();
        c.beginPath(); c.moveTo(-30, 18); c.bezierCurveTo(-15, 30, -35, 40, -20, 48); c.stroke();
        c.beginPath(); c.moveTo(20, 18); c.bezierCurveTo(35, 30, 15, 40, 30, 48); c.stroke();
        if (name === 'escOff') T('OFF', 24, -15);
        break;
      case 'tcs': T('TCS', 36); break;
      case 'engine': P([[-40, -10], [-25, -10], [-25, -25], [15, -25], [15, -15], [30, -15], [30, -25], [42, -25], [42, 25], [30, 25], [30, 15], [-5, 30], [-25, 30], [-25, 12], [-40, 12]], false); break;
      case 'oil':
        P([[-45, -5], [-10, -5], [5, -18], [40, -5], [20, 25], [-35, 25], [-35, 5], [-45, 0]], false);
        c.beginPath(); c.arc(45, 22, 5, 0, TAU); c.fill(); break;
      case 'battery': rrect(c, -40, -22, 80, 50, 4); c.stroke(); L(-25, -30, -15, -30); L(15, -30, 25, -30); L(-28, 2, -12, 2); L(-20, -6, -20, 10); L(12, 2, 28, 2); break;
      case 'fuel': rrect(c, -35, -35, 42, 70, 4); c.stroke(); L(-28, -15, 0, -15); c.beginPath(); c.moveTo(7, -20); c.lineTo(25, -10); c.lineTo(25, 20); c.lineTo(35, 20); c.lineTo(35, -25); c.stroke(); break;
      case 'temp': L(0, -40, 0, 15); L(0, -30, 18, -30); L(0, -15, 18, -15); c.beginPath(); c.arc(0, 22, 10, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(-40, 38); c.quadraticCurveTo(-27, 30, -14, 38); c.stroke(); c.beginPath(); c.moveTo(14, 38); c.quadraticCurveTo(27, 30, 40, 38); c.stroke(); break;
      case 'cruise': c.beginPath(); c.arc(0, 8, 36, PI * 1.05, PI * 1.95); c.stroke(); L(0, 8, 22, -18); c.beginPath(); c.arc(0, 8, 6, 0, TAU); c.fill(); L(-30, 30, 30, 30); break;
      case 'acc':
        c.beginPath(); c.arc(0, 0, 32, PI * 1.05, PI * 1.95); c.stroke(); L(0, 0, 20, -22);
        for (let i = 0; i < 3; i++) L(-30 + i * 4, 18 + i * 10, 30 - i * 4, 18 + i * 10); break;
      case 'tpms': c.beginPath(); c.moveTo(-28, 30); c.bezierCurveTo(-50, 0, -35, -32, -20, -32); c.lineTo(20, -32); c.bezierCurveTo(35, -32, 50, 0, 28, 30); c.stroke(); L(-34, 36, 34, 36); T('!', 40, -2); break;
      case 'check': T('CHECK', 22, -10); T('ENGINE', 22, 14); break;
      case 'bsm': rrect(c, -15, -30, 30, 50, 8); c.stroke(); L(-40, 28, -22, 10); L(40, 28, 22, 10); break;
      case 'fcw': rrect(c, -28, -10, 56, 28, 8); c.stroke(); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, -10, 20 + i * 12, PI * 1.3, PI * 1.7); c.stroke(); } break;
      case 'belt': c.beginPath(); c.arc(0, -32, 10, 0, TAU); c.fill(); P([[-18, -15], [18, -15], [22, 40], [-22, 40]], false); L(-20, -15, 20, 30); break;
      case 'lane': L(-30, 40, -12, -40); L(30, 40, 12, -40); rrect(c, -10, -5, 20, 30, 4); c.fill(); break;
      default: T(name, 30);
    }
    c.restore();
  }

  // default tell-tale set; returns entries for state d
  function tellTales(d) {
    const L2 = d.lights;
    return [
      ['sigL', L2.sigL, LIGHT.green], ['high', L2.high, LIGHT.blue], ['low', L2.low && !L2.high, LIGHT.green], ['fog', L2.fog, LIGHT.green],
      ['park', L2.park, LIGHT.red], ['check', L2.check, LIGHT.amber], ['oil', L2.oil && d.ignition > 0, LIGHT.red],
      ['battery', L2.battery && d.ignition > 0, LIGHT.red], ['abs', L2.abs || L2.absActive, LIGHT.amber],
      [d.escMode === 'off' ? 'escOff' : 'esc', L2.esc || L2.escActive || L2.tcsActive, LIGHT.amber],
      ['fuel', L2.lowFuel, LIGHT.amber], ['temp', d.water > 115, LIGHT.red], ['tpms', L2.tpms, LIGHT.amber],
      ['cruise', d.cruise.on, LIGHT.green], ['sigR', L2.sigR, LIGHT.green],
    ];
  }

  // draw a row of tell-tales; `dim` = colour for unlit icons (null hides them)
  function lightRow(c, d, x, y, size, gap, o = {}) {
    const list = (o.list ? tellTales(d).filter((t) => o.list.includes(t[0]) || (t[0] === 'escOff' && o.list.includes('esc'))) : tellTales(d));
    const total = list.length * size + (list.length - 1) * gap;
    let cx = o.align === 'left' ? x : x - total / 2;
    for (const [name, lit, col] of list) {
      if (lit) {
        if (o.glow !== false) glow(c, col, 10);
        icon(c, name, cx + size / 2, y, size, col);
        noGlow(c);
      } else if (o.dim) icon(c, name, cx + size / 2, y, size, o.dim);
      cx += size + gap;
    }
  }

  // ---------------------------------------------------------------- misc widgets
  function gMeter(c, x, y, r, gx, gy, o = {}) {
    const max = o.max || 1.5 * 9.81;
    c.save();
    c.strokeStyle = o.grid || 'rgba(255,255,255,.18)';
    c.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(x, y, r * i / 3, 0, TAU); c.stroke(); }
    c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
    const px = x + clamp(gx / max, -1, 1) * r, py = y + clamp(gy / max, -1, 1) * r;
    glow(c, o.color || '#ff3b1f', 12);
    c.fillStyle = o.color || '#ff3b1f';
    c.beginPath(); c.arc(px, py, r * 0.09, 0, TAU); c.fill();
    noGlow(c);
    if (o.label !== false) text(c, (Math.hypot(gx, gy) / 9.81).toFixed(2) + ' g', x, y + r + r * 0.22, r * 0.2, o.textColor || '#ddd', 'center', o.font || 'Rajdhani', 600);
    c.restore();
  }

  function tireTemp(c) {
    return (t) => {
      const k = clamp((t - 40) / 120, 0, 1);
      return `hsl(${210 - k * 210}, 85%, ${50 + k * 5}%)`;
    };
  }

  // car seen from above with tire pressures / temps (TPMS page)
  function carTop(c, x, y, h, wheels, o = {}) {
    const w = h * 0.45;
    c.save();
    c.fillStyle = o.body || 'rgba(255,255,255,.12)';
    c.strokeStyle = o.line || 'rgba(255,255,255,.5)';
    c.lineWidth = 2;
    rrect(c, x - w / 2, y - h / 2, w, h, w * 0.35);
    c.fill(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,.35)';
    rrect(c, x - w * 0.36, y - h * 0.18, w * 0.72, h * 0.16, 8); c.fill();
    rrect(c, x - w * 0.34, y + h * 0.18, w * 0.68, h * 0.12, 8); c.fill();
    const pos = { FL: [-1, -1], FR: [1, -1], RL: [-1, 1], RR: [1, 1] };
    for (const wd of wheels || []) {
      const p = pos[wd.name];
      if (!p) continue;
      const wx = x + p[0] * (w / 2 + h * 0.02), wy = y + p[1] * h * 0.3;
      c.fillStyle = o.wheelColor ? o.wheelColor(wd) : '#888';
      rrect(c, wx - h * 0.04, wy - h * 0.09, h * 0.08, h * 0.18, 4);
      c.fill();
      if (o.label) {
        const s = o.label(wd);
        text(c, s, x + p[0] * (w / 2 + h * 0.2), wy, h * 0.085, o.textColor || '#fff', 'center', o.font || 'Rajdhani', 600);
      }
    }
    c.restore();
  }

  // speed limit sign (EU round or US rectangular)
  function limitSign(c, x, y, r, value, us) {
    if (!value) return;
    c.save();
    if (us) {
      c.fillStyle = '#fff';
      rrect(c, x - r * 0.8, y - r, r * 1.6, r * 2, r * 0.18); c.fill();
      c.strokeStyle = '#111'; c.lineWidth = r * 0.08;
      rrect(c, x - r * 0.68, y - r * 0.88, r * 1.36, r * 1.76, r * 0.12); c.stroke();
      text(c, 'SPEED', x, y - r * 0.6, r * 0.32, '#111', 'center', 'Barlow Condensed', 700);
      text(c, 'LIMIT', x, y - r * 0.28, r * 0.32, '#111', 'center', 'Barlow Condensed', 700);
      text(c, String(value), x, y + r * 0.38, r * 0.85, '#111', 'center', 'Barlow Condensed', 700);
    } else {
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#fff'; c.fill();
      c.lineWidth = r * 0.2; c.strokeStyle = '#d0181b';
      c.beginPath(); c.arc(x, y, r * 0.88, 0, TAU); c.stroke();
      text(c, String(value), x, y + r * 0.04, r * (value >= 100 ? 0.78 : 0.95), '#111', 'center', 'Barlow Condensed', 700);
    }
    c.restore();
  }

  // ADAS lane view: own car, lead car, blind-spot cars, lane lines
  function adasView(c, x, y, w, h, d, o = {}) {
    c.save();
    const vp = { x, y: y - h * 0.48 };
    const col = o.line || 'rgba(255,255,255,.35)';
    const persp = (lx, dy) => { // lx: lateral -1..1 at bottom, dy 0..1 distance
      const k = 1 - dy * 0.82;
      return [x + lx * w / 2 * k, y + h / 2 - dy * h];
    };
    c.lineWidth = 3;
    for (const lx of [-1, -0.33, 0.33, 1]) {
      c.strokeStyle = Math.abs(lx) === 1 ? col : col.replace(/[\d.]+\)$/, '0.2)');
      c.setLineDash(Math.abs(lx) === 1 ? [] : [14, 14]);
      c.beginPath();
      const a = persp(lx, 0), b2 = persp(lx, 1);
      c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke();
    }
    c.setLineDash([]);
    const car = (lx, dy, color, scale = 1) => {
      const p = persp(lx, dy);
      const k = (1 - dy * 0.82) * scale;
      const cw = w * 0.13 * k, ch = h * 0.16 * k;
      c.fillStyle = color;
      rrect(c, p[0] - cw / 2, p[1] - ch, cw, ch, cw * 0.25); c.fill();
      c.fillStyle = 'rgba(0,0,0,.35)';
      rrect(c, p[0] - cw * 0.38, p[1] - ch * 0.8, cw * 0.76, ch * 0.28, 4); c.fill();
    };
    // ACC gap bars
    if (d.adas && d.adas.acc) {
      const bars = d.adas.accGap || 2;
      for (let i = 0; i < bars; i++) {
        const p1 = persp(-0.3, 0.2 + i * 0.07), p2 = persp(0.3, 0.2 + i * 0.07);
        c.strokeStyle = o.accent || '#2f9bff'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
      }
    }
    if (d.lead) {
      const dy = clamp(d.lead.gap / 80, 0.12, 0.95);
      const colr = d.fcw === 2 ? '#ff2a1f' : d.fcw === 1 ? '#ffb000' : d.adas && d.adas.acc ? (o.accent || '#2f9bff') : 'rgba(255,255,255,.75)';
      car(0, dy, colr);
      text(c, `${Math.round(d.lead.gap)} m`, persp(0.5, dy)[0] + 20, persp(0, dy)[1] - 14, h * 0.07, 'rgba(255,255,255,.7)', 'left', 'Rajdhani', 600);
    }
    if (d.bsmL) car(-0.66, 0.02, '#ffb000', 0.9);
    if (d.bsmR) car(0.66, 0.02, '#ffb000', 0.9);
    car(0, -0.02, o.me || 'rgba(255,255,255,.95)', 1.15);
    c.restore();
  }

  return { PI, TAU, clamp, lerp, text, rrect, glow, noGlow, glass, dial, needle, arcBar, bar, segments, seg7, icon, LIGHT, tellTales, lightRow, gMeter, tireTemp, carTop, limitSign, adasView };
})();
