// Garage page: car details loaded on spawn, tuning variables, quick actions, world controls, drive assist.
'use strict';
(() => {
  BD.nav('garage');
  BD.connect();
  const U = BD.U;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  Assist.mount($('assist'));

  // ---------------------------------------------------------------- car info
  function renderInfo() {
    const info = BD.st.info;
    if (!info) return;
    const m = info.model || {}, cf = info.config || {};
    const years = cf.Years || m.Years;
    $('carName').textContent = `${m.Brand || ''} ${m.Name || info.jbeam || 'Unknown car'}`.trim();
    $('carConfig').textContent = [cf.Configuration, years ? `${years.min}${years.max !== years.min ? '–' + years.max : ''}` : null, m.Country, m['Body Style'] || m.Type].filter(Boolean).join(' · ');
    const stat = (label, val) => (val ? `<div><small>${label}</small><b>${esc(val)}</b></div>` : '');
    const kmh = (ms) => `${Math.round(U.speed(ms))} ${U.speedLabel()}`;
    $('stats').innerHTML = [
      stat('Power', cf.Power ? `${Math.round(cf.Power)} PS / ${Math.round(cf.Power * 0.986)} hp` : null),
      stat('Torque', cf.Torque ? `${Math.round(cf.Torque)} Nm` : null),
      stat('Weight', cf.Weight ? `${Math.round(cf.Weight)} kg` : null),
      stat('Drivetrain', cf.Drivetrain), stat('Transmission', cf.Transmission), stat('Fuel', cf['Fuel Type']),
      stat('Induction', cf['Induction Type']), stat('Top speed', cf['Top Speed'] ? kmh(cf['Top Speed']) : null),
      stat(BD.settings.speedUnit === 'mph' ? '0-60 mph' : '0-100 km/h', BD.settings.speedUnit === 'mph' ? (cf['0-60 mph'] ? `${(+cf['0-60 mph']).toFixed(1)} s` : null) : (cf['0-100 km/h'] ? `${(+cf['0-100 km/h']).toFixed(1)} s` : null)),
      stat('Weight / power', cf['Weight/Power'] ? `${(+cf['Weight/Power']).toFixed(2)} kg/PS` : null),
      stat('Value', cf.Value ? `$${Math.round(cf.Value).toLocaleString()}` : null),
    ].join('');
  }
  function renderSpec() {
    const sp = BD.st.spec;
    if (!sp) return;
    const e = sp.engine || {}, g = sp.gearbox || {};
    $('spec').innerHTML = [
      ['Max RPM', e.maxRPM && Math.round(e.maxRPM)], ['Idle RPM', e.idleRPM && Math.round(e.idleRPM)], ['Rev limiter', e.revLimiterRPM && Math.round(e.revLimiterRPM)],
      ['Peak power', e.maxPower ? `${Math.round(e.maxPower)} @ ${Math.round(e.maxPowerRPM || 0)} rpm` : null],
      ['Peak torque', e.maxTorque ? `${Math.round(e.maxTorque)} Nm @ ${Math.round(e.maxTorqueRPM || 0)} rpm` : null],
      ['Electric', e.electric ? 'yes' : 'no'], ['Gearbox', g.type], ['Forward gears', g.maxGearIndex], ['Mass', sp.mass ? `${Math.round(sp.mass)} kg` : null],
      ['Drive mode', sp.driveMode], ['Controllers', (sp.controllers || []).join(', ')],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<span>${k}</span><span>${esc(v)}</span>`).join('');
    const r = g.ratios || {};
    $('ratios').innerHTML = Object.keys(r).sort((a, b) => +a - +b).filter((k) => r[k] !== 0).map((k) => `<span>${+k < 0 ? 'Reverse' : +k === 0 ? 'Neutral' : 'Gear ' + k}</span><span>${(+r[k]).toFixed(3)}</span>`).join('') || '<span class="muted">—</span><span></span>';
  }

  // ---------------------------------------------------------------- tuning variables
  let edits = {};
  function fmtVal(v, def) {
    const unit = def.unit || '';
    if (unit === '%' || (def.max <= 1 && def.min >= 0 && /bias|ratio/i.test(def.title || ''))) return `${(v * 100).toFixed(0)} %`;
    const dec = def.step && def.step < 1 ? Math.min(4, Math.ceil(-Math.log10(def.step))) : 0;
    return `${(+v).toFixed(dec)} ${unit}`;
  }
  function renderVars() {
    const vv = BD.st.vars;
    const el = $('vars');
    if (!vv || !Object.keys(vv.vars || {}).length) { el.innerHTML = '<p class="muted">This car has no tuning variables (or the game has not sent them yet).</p>'; $('varCount').textContent = ''; return; }
    const q = $('varSearch').value.toLowerCase();
    const groups = {};
    for (const [name, def] of Object.entries(vv.vars)) {
      if (q && !(`${name} ${def.title} ${def.category}`).toLowerCase().includes(q)) continue;
      const cat = [def.category, def.subCategory].filter(Boolean).join(' · ') || 'Other';
      (groups[cat] = groups[cat] || []).push([name, def]);
    }
    $('varCount').textContent = `${Object.keys(vv.vars).length} settings`;
    el.innerHTML = Object.keys(groups).sort().map((cat) => `<div class="cat">${esc(cat)}</div>` + groups[cat].sort((a, b) => (a[1].title || a[0]).localeCompare(b[1].title || b[0])).map(([name, def]) => {
      const cur = name in edits ? edits[name] : (vv.values[name] ?? def.val ?? def.default);
      const min = def.min ?? 0, max = def.max ?? 1, step = def.step || (max - min) / 100;
      return `<div class="var ${name in edits ? 'changed' : ''}" data-n="${esc(name)}">
        <div class="top"><span>${esc(def.title || name)}</span><b>${esc(fmtVal(cur, def))}</b></div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${cur}">
        ${def.description ? `<div class="muted" style="font-size:12px">${esc(def.description)}</div>` : ''}
      </div>`;
    }).join('')).join('');
    el.querySelectorAll('.var').forEach((row) => {
      const name = row.dataset.n, def = vv.vars[name];
      const inp = row.querySelector('input');
      inp.oninput = () => {
        edits[name] = +inp.value;
        row.classList.add('changed');
        row.querySelector('b').textContent = fmtVal(+inp.value, def);
      };
    });
  }
  $('varSearch').oninput = renderVars;
  $('applyVars').onclick = async () => {
    if (!Object.keys(edits).length) { BD.toast('Nothing changed'); return; }
    await BD.cmd('setVars', { values: edits });
    BD.toast('Applying tuning — the car will respawn');
    edits = {};
  };
  $('resetVars').onclick = () => { edits = {}; renderVars(); };
  $('defaultVars').onclick = () => {
    const vv = BD.st.vars;
    if (!vv) return;
    edits = {};
    for (const [n, def] of Object.entries(vv.vars)) if (def.default !== undefined && def.default !== vv.values[n]) edits[n] = def.default;
    renderVars();
    BD.toast('Defaults loaded — press Apply to car');
  };

  // ---------------------------------------------------------------- actions
  document.querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = async () => {
    const r = await BD.cmd(b.dataset.cmd);
    if (r && r.ok) BD.toast(`${b.textContent} ✓`);
  }));
  $('ignOff').onclick = () => BD.cmd('ignition', { value: false });
  $('pbrake').onclick = () => BD.cmd('parkingbrake', { value: !BD.data().lights.park });
  const tod = $('tod');
  tod.oninput = () => { $('todVal').textContent = fmtHour(+tod.value); };
  tod.onchange = () => BD.cmd('timeOfDay', { value: (((+tod.value - 12) / 24) % 1 + 1) % 1 });
  const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  $('pause').onclick = () => BD.cmd('pause', { value: !(BD.st.world && BD.st.world.paused) });

  BD.on('info', () => { edits = {}; renderInfo(); });
  BD.on('spec', renderSpec);
  BD.on('vars', () => { if (!Object.keys(edits).length) renderVars(); });
  BD.on('settings', renderInfo);
  setInterval(() => {
    const d = BD.data();
    $('pbrake').classList.toggle('on', d.lights.park);
    if (document.activeElement !== tod && typeof d.tod === 'number') {
      const h = ((d.tod * 24 + 12) % 24);
      tod.value = h;
      $('todVal').textContent = fmtHour(h);
    }
  }, 500);
  renderInfo(); renderSpec(); renderVars();
})();
