// Records page: performance timer, lap timer, drift, eco, dyno, recorder, achievements, crashes.
'use strict';
(() => {
  BD.nav('records');
  BD.connect();
  const U = BD.U;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const lap = (s) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '-:--.---');
  const sec = (s) => (typeof s === 'number' ? `${s.toFixed(2)} s` : '—');
  const set = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
  document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    const r = await BD.action(b.dataset.act);
    if (r.ok) BD.toast('Done');
    if (b.dataset.act === 'record-toggle') setTimeout(loadRecordings, 600);
  }));

  function perf() {
    const p = BD.st.perf;
    if (!p) return;
    const st = $('perfState');
    st.textContent = p.state === 'ready' ? 'READY' : p.state === 'running' && p.run ? `RUNNING ${p.run.elapsed.toFixed(1)} s` : 'stop to arm';
    st.className = 'pill ' + (p.state === 'ready' ? 'on' : p.state === 'running' ? 'warn' : '');
    const L = p.last || {}, B = p.best || {};
    const q = (x) => (x ? `${x.time.toFixed(2)} s @ ${Math.round(U.speed(x.trap))} ${U.speedLabel()}` : '—');
    const m = (x) => (typeof x === 'number' ? U.shortDist(x) : '—');
    const rows = [['0–60 mph', sec(L.t60mph), sec(B.t60mph)], ['0–100 km/h', sec(L.t100), sec(B.t100)], ['0–200 km/h', sec(L.t200), sec(B.t200)],
      ['100–200 km/h', sec(L.t100to200), sec(B.t100to200)], ['⅛ mile', q(L.eighth), q(B.eighth)], ['¼ mile', q(L.quarter), q(B.quarter)],
      ['100–0 km/h braking', m(L.brake100), m(B.brake100)], ['60–0 mph braking', m(L.brake60mph), m(B.brake60mph)]];
    set($('perfTable'), '<tr><th></th><th style="text-align:right">Last</th><th style="text-align:right">Best</th></tr>' + rows.map(([n, l, b]) => `<tr><td>${n}</td><td style="text-align:right">${l}</td><td style="color:var(--accent)">${b}</td></tr>`).join(''));

    const lp = p.lap || {};
    $('lapLevel').textContent = lp.line ? `${lp.level || ''} · line set` : `${lp.level || ''} · no line`;
    $('lapNow').textContent = lp.running ? lap(BD.lapNow()) : '-:--.---';
    const dl = lp.delta;
    $('lapDelta').textContent = typeof dl === 'number' ? `${dl > 0 ? '+' : '−'}${Math.abs(dl).toFixed(2)}` : '—';
    $('lapDelta').className = 'big2 ' + (typeof dl === 'number' ? (dl > 0 ? 'delta-pos' : 'delta-neg') : '');
    $('lapBest').textContent = lap(lp.best && lp.best.time);
    const hist = lp.history || [];
    set($('lapTable'), '<tr><th>#</th><th>Lap</th><th>S1</th><th>S2</th><th style="text-align:right">S3</th></tr>' + (hist.map((h, i) => `<tr><td>${hist.length - i}</td><td style="${lp.best && h.time === lp.best.time ? 'color:var(--good);font-weight:700' : ''}">${lap(h.time)}</td>${[0, 1, 2].map((k) => `<td>${h.sectors ? h.sectors[k].toFixed(2) : '—'}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="5" class="muted">No laps yet: set a start/finish line and drive through it.</td></tr>'));
  }

  function fun() {
    const f = BD.st.fun;
    if (!f) return;
    const dr = f.drift || {};
    $('dAngle').textContent = `${Math.round(Math.abs(dr.angle || 0))}°`;
    $('dScore').textContent = dr.active ? dr.score : '—';
    $('dLast').textContent = dr.last || 0;
    $('dBest').textContent = dr.best || 0;
    const got = (f.achievements || []).filter((a) => a.at).length;
    $('achCount').textContent = `${got} / ${(f.achievements || []).length}`;
    set($('ach'), (f.achievements || []).map((a) => `<div class="${a.at ? 'got' : ''}"><b>${a.at ? '🏆 ' : '🔒 '}${esc(a.name)}</b><small>${esc(a.desc)}${a.at ? ` · ${new Date(a.at).toLocaleDateString()}` : ''}</small></div>`).join(''));
    set($('crashes'), '<tr><th>When</th><th>Speed</th><th>Peak</th><th style="text-align:right">Damage</th></tr>' + ((f.crashes || []).map((c) => `<tr><td>${new Date(c.at).toLocaleTimeString()}</td><td>${Math.round(U.speed(c.speed))} ${U.speedLabel()}</td><td>${c.peakG.toFixed(1)} g</td><td>${Math.round(c.damage || 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No crashes. Keep it that way!</td></tr>'));
    drawDyno(f.dyno);
  }

  function eco() {
    const t = BD.st.trips;
    if (!t) return;
    const s = (x) => (x && x.eco !== null && x.eco !== undefined ? `${x.eco} / 100` : '—');
    set($('eco'), [['Trip A', s(t.a)], ['Trip B', s(t.b)], ['Since start', s(t.start)], ['Economy period', s(t.econ)]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join(''));
  }

  function drawDyno(dy) {
    const cv = $('dyno');
    const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height;
    c.clearRect(0, 0, w, h);
    const bins = dy ? Object.entries(dy.bins).map(([rpm, v]) => [+rpm, v[0], v[1]]).sort((a, b) => a[0] - b[0]) : [];
    if (bins.length < 3) { G.text(c, 'No dyno data for this car yet: floor it through the revs.', w / 2, h / 2, 15, '#8b96a8', 'center', 'Rajdhani', 600); return; }
    const minR = bins[0][0], maxR = bins[bins.length - 1][0];
    const maxP = Math.max(...bins.map((b) => b[1])), maxT = Math.max(...bins.map((b) => b[2]));
    const px = (rpm) => 40 + (rpm - minR) / Math.max(1, maxR - minR) * (w - 80);
    c.strokeStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(40, 20 + (h - 50) * i / 4); c.lineTo(w - 40, 20 + (h - 50) * i / 4); c.stroke(); }
    const curve = (idx, max, col) => {
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
      bins.forEach((b, i) => { const y = 20 + (h - 50) * (1 - b[idx] / max * 0.95); i ? c.lineTo(px(b[0]), y) : c.moveTo(px(b[0]), y); });
      c.stroke();
    };
    curve(1, maxP, '#ff6a5f'); curve(2, maxT, '#4aa3ff');
    G.text(c, `${Math.round(maxP)} kW / ${Math.round(maxP * 1.341)} hp`, 44, 12, 13, '#ff6a5f', 'left', 'Rajdhani', 700);
    G.text(c, `${Math.round(maxT)} Nm`, w - 44, 12, 13, '#4aa3ff', 'right', 'Rajdhani', 700);
    G.text(c, `${minR} rpm`, 40, h - 12, 12, '#8b96a8', 'left', 'Rajdhani', 600);
    G.text(c, `${maxR} rpm`, w - 40, h - 12, 12, '#8b96a8', 'right', 'Rajdhani', 600);
  }

  async function loadRecordings() {
    try {
      const r = await (await fetch('/api/recordings')).json();
      $('recState').textContent = r.active ? '● recording' : 'off';
      $('recState').className = 'pill ' + (r.active ? 'bad' : '');
      $('recBtn').textContent = r.active ? 'Stop recording' : 'Start recording';
      set($('recTable'), (r.list || []).map((f) => `<tr><td>${esc(f.file)}${f.recording ? ' <span class="pill bad">rec</span>' : ''}<div class="muted" style="font-size:11px">${(f.size / 1024).toFixed(0)} KB</div></td><td style="white-space:nowrap"><a class="btn small" href="/api/recordings/${encodeURIComponent(f.file)}" download>CSV</a> ${f.recording ? '' : `<button class="btn small danger" data-del="${esc(f.file)}">✕</button>`}</td></tr>`).join('') || '<tr><td class="muted">No recordings yet</td></tr>');
      $('recTable').querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
        if (!confirm(`Delete ${b.dataset.del}?`)) return;
        await fetch(`/api/recordings/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
        $('recTable')._h = ''; loadRecordings();
      }));
    } catch { /* offline */ }
  }

  setInterval(perf, 100);
  setInterval(fun, 500);
  setInterval(eco, 1000);
  setInterval(loadRecordings, 3000);
  loadRecordings();
})();
