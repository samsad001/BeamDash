// Deck: a Stream Deck style button pad for a second phone. Layout is saved on the server, so every phone shares it.
'use strict';
(() => {
  BD.connect();
  const U = BD.U;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // short labels + icons for the buttons (icons come from the cluster's tell-tale set where one fits)
  const LOOK = {
    'signal-left': { icon: 'sigL', label: 'Left', col: '#27e05a' }, 'signal-right': { icon: 'sigR', label: 'Right', col: '#27e05a' },
    hazard: { glyph: '⚠', label: 'Hazard', col: '#ff3b30' }, 'lights-cycle': { icon: 'low', label: 'Lights', col: '#27e05a' },
    'lights-off': { icon: 'low', label: 'Lights off' }, 'lights-low': { icon: 'low', label: 'Low beam', col: '#27e05a' },
    'high-beam': { icon: 'high', label: 'High beam', col: '#2f7bff' }, fog: { icon: 'fog', label: 'Fog', col: '#27e05a' },
    horn: { glyph: '📢', label: 'Horn' },
    'cruise-toggle': { icon: 'cruise', label: 'Cruise', col: '#27e05a' }, 'cruise-set': { glyph: 'SET', label: 'Set speed' },
    'cruise-resume': { glyph: 'RES', label: 'Resume' }, 'cruise-off': { glyph: 'OFF', label: 'Cruise off' },
    'cruise-plus': { glyph: '+', label: 'Faster' }, 'cruise-minus': { glyph: '−', label: 'Slower' },
    'acc-toggle': { icon: 'acc', label: 'ACC', col: '#2f9bff' }, 'acc-gap': { glyph: '▮▮▮', label: 'Distance' },
    'fcw-toggle': { icon: 'fcw', label: 'Collision warn', col: '#27e05a' }, 'aeb-toggle': { glyph: 'AEB', label: 'Auto brake', col: '#27e05a' },
    'bsm-toggle': { icon: 'bsm', label: 'Blind spot', col: '#27e05a' }, 'tsr-toggle': { glyph: '⦸', label: 'Sign recog.', col: '#27e05a' },
    'esc-mode': { icon: 'esc', label: 'ESC mode' }, 'drive-mode': { glyph: '⚙', label: 'Drive mode' },
    'engine-start': { icon: 'engine', label: 'Start', col: '#27e05a' }, 'engine-off': { glyph: '⏻', label: 'Engine off' },
    'parking-brake': { icon: 'park', label: 'Park brake', col: '#ff3b30' }, 'shift-up': { glyph: '⇧', label: 'Shift up' },
    'shift-down': { glyph: '⇩', label: 'Shift down' }, repair: { glyph: '🔧', label: 'Repair' }, refuel: { icon: 'fuel', label: 'Refuel' },
    'nav-clear': { glyph: '⚑', label: 'Clear route' }, pause: { glyph: '⏸', label: 'Pause game', col: '#ffb000' },
    'cluster-next': { glyph: '▶', label: 'Page' }, 'cluster-prev': { glyph: '◀', label: 'Page' }, 'cluster-ok': { glyph: 'OK', label: 'hold = reset' },
    'cluster-back': { glyph: '⟲', label: 'Back' }, 'cluster-hold': { glyph: '↺', label: 'Reset page' },
    'design-next': { glyph: '◑', label: 'Next design' }, 'design-prev': { glyph: '◐', label: 'Prev design' }, 'cluster-hide': { glyph: '▭', label: 'Show/hide UI' },
    'trip-a-reset': { glyph: 'A↺', label: 'Reset trip A' }, 'trip-b-reset': { glyph: 'B↺', label: 'Reset trip B' },
    'economy-reset': { glyph: '⛽↺', label: 'Reset economy' }, 'start-reset': { glyph: '↺', label: 'Reset journey' },
    'media-play-pause': { glyph: '⏯', label: 'Play / pause', col: '#2f9bff' }, 'media-next': { glyph: '⏭', label: 'Next' }, 'media-prev': { glyph: '⏮', label: 'Previous' },
    'perf-reset': { glyph: '⏱↺', label: 'Reset 0-100' }, 'lap-line-here': { glyph: '🏁', label: 'Start/finish here' }, 'lap-line-clear': { glyph: '🏁✕', label: 'Remove line' },
    'lap-reset': { glyph: '⏱', label: 'Reset laps' }, 'drift-reset': { glyph: '↯↺', label: 'Reset drift' }, 'dyno-reset': { glyph: '📈↺', label: 'Reset dyno' },
    'record-toggle': { glyph: '⏺', label: 'Record drive', col: '#ff3b30' }, 'watch-next': { glyph: '👁', label: 'Watch next car', col: '#c07aff' },
    'watch-off': { glyph: '★', label: 'Back to my car' }, 'voice-toggle': { glyph: '🗣', label: 'Voice nav', col: '#27e05a' },
  };
  const COLORS = ['', '#4aa3ff', '#27e05a', '#ffb000', '#ff3b30', '#c07aff', '#00e5ff', '#ffffff'];

  const DEFAULT = {
    pages: [
      { name: 'Drive', cols: 3, buttons: ['signal-left', 'hazard', 'signal-right', 'high-beam', 'lights-cycle', 'fog', 'cruise-toggle', 'cruise-set', 'cruise-resume', 'cruise-minus', 'acc-gap', 'cruise-plus', 'horn', 'parking-brake', 'drive-mode', 'cluster-prev', 'cluster-ok', 'cluster-next'].map((a) => ({ action: a })) },
      { name: 'Car & media', cols: 3, buttons: ['media-prev', 'media-play-pause', 'media-next', 'acc-toggle', 'fcw-toggle', 'bsm-toggle', 'esc-mode', 'aeb-toggle', 'tsr-toggle', 'trip-a-reset', 'trip-b-reset', 'economy-reset', 'engine-start', 'engine-off', 'repair', 'refuel', 'nav-clear', 'design-next'].map((a) => ({ action: a })) },
      { name: 'Track & tools', cols: 3, buttons: ['lap-line-here', 'lap-reset', 'lap-line-clear', 'perf-reset', 'drift-reset', 'dyno-reset', 'record-toggle', 'watch-next', 'watch-off', 'voice-toggle', 'pause', 'repair'].map((a) => ({ action: a })) },
    ],
  };
  let deck = null, actions = [], pageIdx = 0, editing = false, editIdx = -1;
  const byId = () => Object.fromEntries(actions.map((a) => [a.id, a]));

  async function load() {
    try { actions = await (await fetch('/api/actions')).json(); } catch { actions = []; }
    try { deck = await (await fetch('/api/deck')).json(); } catch { deck = null; }
    if (!deck || !deck.pages || !deck.pages.length) deck = JSON.parse(JSON.stringify(DEFAULT));
    try { pageIdx = Math.min(+localStorage.getItem('bd.deck.page') || 0, deck.pages.length - 1); } catch { pageIdx = 0; }
    render();
  }
  async function save() {
    await fetch('/api/deck', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deck) });
  }
  BD.on('deck', (m) => { if (!editing && m && m.pages) { deck = m; pageIdx = Math.min(pageIdx, deck.pages.length - 1); render(); } });

  // ---------------------------------------------------------------- live state for each button
  function state(action, d) {
    const L = d.lights, e = BD.st.e, a = d.adas || {};
    const m = BD.st.media;
    switch (action) {
      case 'signal-left': return { on: BD.b(e.signal_left_input) || L.sigL, blink: true };
      case 'signal-right': return { on: BD.b(e.signal_right_input) || L.sigR, blink: true };
      case 'hazard': return { on: L.hazard, blink: true };
      case 'lights-cycle': return { on: L.low || L.high, val: ['Off', 'Low', 'High'][e.lights] || '' };
      case 'lights-low': return { on: L.low && !L.high };
      case 'high-beam': return { on: L.high };
      case 'fog': return { on: L.fog };
      case 'horn': return { on: L.horn };
      case 'cruise-toggle': case 'cruise-set': case 'cruise-resume': case 'cruise-plus': case 'cruise-minus':
        return { on: action === 'cruise-toggle' && d.cruise.on, val: d.cruise.on ? `${Math.round(U.speed(a.acc ? a.accSet || d.cruise.target : d.cruise.target))}` : '' };
      case 'acc-toggle': return { on: !!a.acc, val: a.acc ? `${Math.round(U.speed(a.accSet || 0))}` : '' };
      case 'acc-gap': return { val: '▮'.repeat(a.accGap || 2) };
      case 'fcw-toggle': return { on: !!a.fcw, val: d.fcw === 2 ? 'BRAKE' : d.fcw === 1 ? 'WARN' : '' };
      case 'aeb-toggle': return { on: !!a.aeb };
      case 'bsm-toggle': return { on: !!a.bsm, val: d.bsmL || d.bsmR ? `${d.bsmL ? '◀' : ''}${d.bsmR ? '▶' : ''}` : '' };
      case 'tsr-toggle': return { on: a.tsr !== false, val: d.speedLimit ? String(Math.round(U.speed(d.speedLimit) / 5) * 5) : '' };
      case 'esc-mode': return { val: d.escMode ? d.escMode.toUpperCase() : '' };
      case 'drive-mode': return { val: d.driveMode ? String(d.driveMode).toUpperCase() : '' };
      case 'parking-brake': return { on: L.park };
      case 'engine-start': return { on: d.running };
      case 'pause': return { on: !!(BD.st.world && BD.st.world.paused) };
      case 'media-play-pause': return { on: !!(m && m.status === 'Playing'), val: m && m.active ? (m.title || '').slice(0, 18) : '' };
      case 'trip-a-reset': case 'trip-b-reset': case 'economy-reset': {
        const t = (BD.st.trips || {})[action === 'economy-reset' ? 'econ' : action[5]] || {};
        return { val: action === 'economy-reset' ? (t.avgCons ? `${U.consumption(t.avgCons).toFixed(1)}` : '') : `${U.dist(t.dist || 0).toFixed(1)} ${U.distLabel()}` };
      }
      case 'cluster-ok': return { val: '' };
      case 'record-toggle': return { on: !!(BD.st.status && BD.st.status.recording), blink: true };
      case 'watch-next': return { on: !!d.watching, val: d.watching ? `#${d.watching}` : '' };
      case 'voice-toggle': return { on: !!BD.settings.voice };
      case 'lap-line-here': { const lp = (BD.st.perf || {}).lap || {}; return { on: !!lp.line, val: lp.running ? `${(BD.lapNow() || 0).toFixed(1)} s` : '' }; }
      case 'perf-reset': { const pf = BD.st.perf || {}; return { on: pf.state === 'ready', val: pf.state === 'ready' ? 'READY' : pf.best && typeof pf.best.t100 === 'number' ? `${pf.best.t100.toFixed(2)} s` : '' }; }
      case 'drift-reset': { const dr = (BD.st.fun || {}).drift || {}; return { val: dr.best ? String(dr.best) : '' }; }
    }
    return {};
  }

  // ---------------------------------------------------------------- render
  function render() {
    const tabs = $('tabs');
    tabs.innerHTML = deck.pages.map((p, i) => `<button class="${i === pageIdx ? 'on' : ''}" data-i="${i}">${esc(p.name)}</button>`).join('');
    tabs.querySelectorAll('button').forEach((b) => (b.onclick = () => { pageIdx = +b.dataset.i; try { localStorage.setItem('bd.deck.page', pageIdx); } catch { /* ignore */ } render(); }));
    const page = deck.pages[pageIdx];
    const pad = $('pad');
    pad.style.gridTemplateColumns = `repeat(${page.cols || 3}, 1fr)`;
    const A = byId();
    pad.innerHTML = page.buttons.map((b, i) => {
      const look = LOOK[b.action] || {};
      const label = b.label || look.label || (A[b.action] && A[b.action].label) || b.action;
      return `<div class="key" data-i="${i}" style="${b.color || look.col ? `--keycol:${b.color || look.col}` : ''}">
        ${look.icon ? `<canvas width="96" height="96" data-icon="${look.icon}"></canvas>` : `<span class="glyph">${esc(look.glyph || '•')}</span>`}
        <span class="lbl">${esc(label)}</span><span class="val"></span></div>`;
    }).join('') + (editing ? '<div class="key add" id="addKey">＋</div>' : '');
    $('cols').value = page.cols || 3;
    pad.querySelectorAll('.key[data-i]').forEach(bind);
    if (editing) $('addKey').onclick = () => { page.buttons.push({ action: 'cluster-next' }); save(); render(); openEditor(page.buttons.length - 1); };
    paintIcons();
  }
  function paintIcons() {
    $('pad').querySelectorAll('canvas[data-icon]').forEach((cv) => {
      const key = cv.closest('.key');
      const on = key.classList.contains('on');
      const col = on ? getComputedStyle(key).getPropertyValue('--keycol').trim() || '#4aa3ff' : '#cfd6e2';
      if (cv._col === col) return;
      cv._col = col;
      const c = cv.getContext('2d');
      c.clearRect(0, 0, 96, 96);
      G.icon(c, cv.dataset.icon, 48, 48, 80, col);
    });
  }

  function bind(el) {
    const i = +el.dataset.i;
    const btn = () => deck.pages[pageIdx].buttons[i];
    let holdTimer = 0, held = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (editing) return;
      el.classList.add('down');
      held = false;
      if (navigator.vibrate) navigator.vibrate(12);
      const a = byId()[btn().action];
      if (a && a.hold) BD.action(btn().action);
      else if (btn().action === 'cluster-ok') holdTimer = setTimeout(() => { held = true; BD.action('cluster-hold'); if (navigator.vibrate) navigator.vibrate([20, 40, 20]); }, 700);
    });
    const up = () => {
      el.classList.remove('down');
      clearTimeout(holdTimer);
    };
    el.addEventListener('pointerup', () => {
      if (editing) { openEditor(i); return; }
      const wasDown = el.classList.contains('down');
      up();
      if (!wasDown) return;
      const a = byId()[btn().action];
      if (a && a.hold) { BD.action(btn().action, { state: 'up' }); return; }
      if (held) return;
      BD.action(btn().action, btn().action.startsWith('cruise-') ? BD.unitParams() : undefined);
    });
    el.addEventListener('pointerleave', () => {
      const a = byId()[btn().action];
      if (el.classList.contains('down') && a && a.hold) BD.action(btn().action, { state: 'up' });
      up();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setInterval(() => {
    const d = BD.data();
    $('live').innerHTML = `${Math.round(U.speed(d.speed))}<small>${U.speedLabel()} · ${esc(d.gear)}</small>`;
    const page = deck && deck.pages[pageIdx];
    if (!page) return;
    $('pad').querySelectorAll('.key[data-i]').forEach((el) => {
      const b = page.buttons[+el.dataset.i];
      if (!b) return;
      const s = state(b.action, d);
      el.classList.toggle('on', !!s.on);
      el.classList.toggle('blink', !!(s.on && s.blink));
      const v = el.querySelector('.val');
      const val = s.val || '';
      if (v.textContent !== val) v.textContent = val;
    });
    paintIcons();
  }, 150);

  // ---------------------------------------------------------------- editing
  $('editBtn').onclick = () => {
    editing = !editing;
    document.body.classList.toggle('editing', editing);
    $('editBtn').textContent = editing ? 'Done' : 'Edit';
    $('editBtn').classList.toggle('on', editing);
    render();
  };
  $('cols').onchange = () => { deck.pages[pageIdx].cols = +$('cols').value; save(); render(); };
  $('pageAdd').onclick = () => { deck.pages.push({ name: `Page ${deck.pages.length + 1}`, cols: 3, buttons: [] }); pageIdx = deck.pages.length - 1; save(); render(); };
  $('pageRename').onclick = () => { const n = prompt('Page name', deck.pages[pageIdx].name); if (n) { deck.pages[pageIdx].name = n.slice(0, 20); save(); render(); } };
  $('pageDel').onclick = () => {
    if (deck.pages.length < 2) { BD.toast('Keep at least one page'); return; }
    if (!confirm(`Delete page "${deck.pages[pageIdx].name}"?`)) return;
    deck.pages.splice(pageIdx, 1); pageIdx = 0; save(); render();
  };
  $('resetDeck').onclick = () => { if (confirm('Replace every page with the default deck?')) { deck = JSON.parse(JSON.stringify(DEFAULT)); pageIdx = 0; save(); render(); } };

  const editor = $('editor'), scrim = $('scrim');
  function openEditor(i) {
    editIdx = i;
    const b = deck.pages[pageIdx].buttons[i];
    const groups = {};
    actions.forEach((a) => (groups[a.group] = groups[a.group] || []).push(a));
    $('edAction').innerHTML = Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((a) => `<option value="${a.id}" ${a.id === b.action ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</optgroup>`).join('');
    $('edLabel').value = b.label || '';
    $('edColor').innerHTML = COLORS.map((c) => `<button data-c="${c}" class="${(b.color || '') === c ? 'on' : ''}" style="background:${c || 'conic-gradient(#4aa3ff,#27e05a,#ffb000,#ff3b30,#4aa3ff)'}" title="${c || 'default'}"></button>`).join('');
    $('edColor').querySelectorAll('button').forEach((s) => (s.onclick = () => { b.color = s.dataset.c || undefined; $('edColor').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === s)); }));
    editor.classList.add('open'); scrim.classList.add('open');
  }
  function closeEditor() {
    const b = deck.pages[pageIdx].buttons[editIdx];
    if (b) { b.action = $('edAction').value; b.label = $('edLabel').value.trim() || undefined; }
    editor.classList.remove('open'); scrim.classList.remove('open');
    save(); render();
  }
  $('edDone').onclick = closeEditor;
  scrim.onclick = closeEditor;
  const move = (dir) => {
    const list = deck.pages[pageIdx].buttons, j = editIdx + dir;
    if (j < 0 || j >= list.length) return;
    [list[editIdx], list[j]] = [list[j], list[editIdx]];
    editIdx = j;
  };
  $('edLeft').onclick = () => move(-1);
  $('edRight').onclick = () => move(1);
  $('edDelete').onclick = () => { deck.pages[pageIdx].buttons.splice(editIdx, 1); editor.classList.remove('open'); scrim.classList.remove('open'); save(); render(); };

  load();
})();
