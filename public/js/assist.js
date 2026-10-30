// Drive Assist panel: cruise control, adaptive cruise, FCW / AEB / blind spot / sign recognition, ESC, drive modes, lights.
// Used on the cluster (bottom sheet) and on the Garage page.
'use strict';
window.Assist = (() => {
  function mount(root) {
    const S = BD.settings, U = BD.U;
    root.innerHTML = `
    <div class="assist-grid">
      <div class="card"><h3>Cruise control <span class="pill" id="asCruiseState">OFF</span></h3>
        <div class="setspeed"><span class="big" id="asSet">--</span><span class="unit" id="asUnit"></span></div>
        <div class="btns fill" style="margin-bottom:8px">
          <button class="btn primary" id="asOn">ON / SET</button><button class="btn" id="asRes">RES</button><button class="btn danger" id="asOff">OFF</button>
        </div>
        <div class="btns fill">
          <button class="btn" data-d="-5">−5</button><button class="btn" data-d="-1">−1</button><button class="btn" data-d="1">+1</button><button class="btn" data-d="5">+5</button>
        </div>
      </div>
      <div class="card"><h3>Adaptive cruise (ACC) <span class="pill" id="asAccState">OFF</span></h3>
        <label class="row"><span>Use adaptive cruise when I press ON</span><span class="switch"><input type="checkbox" id="asAccPref"><i></i></span></label>
        <label class="row"><span>Following distance</span><span class="btns" id="asGap"></span></label>
        <div class="kv" style="margin-top:8px"><span>Lead vehicle</span><span id="asLead">none</span><span>Gap</span><span id="asLeadGap">—</span><span>Lead speed</span><span id="asLeadSpd">—</span><span>Time to collision</span><span id="asTTC">—</span></div>
      </div>
      <div class="card"><h3>Collision &amp; blind spot</h3>
        <label class="row"><span>Forward collision warning</span><span class="switch"><input type="checkbox" data-adas="fcw"><i></i></span></label>
        <label class="row"><span>Warning timing</span><span class="btns" id="asSens"></span></label>
        <label class="row"><span>Automatic emergency braking</span><span class="switch"><input type="checkbox" data-adas="aeb"><i></i></span></label>
        <label class="row"><span>Blind spot monitor</span><span class="switch"><input type="checkbox" data-adas="bsm"><i></i></span></label>
        <label class="row"><span>Speed limit recognition</span><span class="switch"><input type="checkbox" data-adas="tsr"><i></i></span></label>
        <div class="btns" style="margin-top:8px"><span class="pill" id="asFcw">FCW ready</span><span class="pill" id="asBsmL">BSM L</span><span class="pill" id="asBsmR">BSM R</span><span class="pill" id="asLimit">Limit —</span></div>
      </div>
      <div class="card"><h3>Stability &amp; drive mode</h3>
        <div class="kv" style="margin-bottom:10px"><span>ESC / traction</span><span id="asEsc">—</span><span>Drive mode</span><span id="asMode">—</span></div>
        <div class="btns fill"><button class="btn" id="asEscBtn">ESC mode</button><button class="btn" id="asModeBtn">Next drive mode</button></div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">Works on cars that have ESC / drive-mode controllers (most modern BeamNG cars).</p>
      </div>
      <div class="card"><h3>Lights &amp; signals</h3>
        <div class="btns fill" style="margin-bottom:8px"><button class="btn" data-light="0">Off</button><button class="btn" data-light="1">Low</button><button class="btn" data-light="2">High</button><button class="btn" data-cmd="fog">Fog</button></div>
        <div class="btns fill"><button class="btn" data-cmd="signalL">◀ Left</button><button class="btn danger" data-cmd="hazard">Hazard</button><button class="btn" data-cmd="signalR">Right ▶</button><button class="btn" id="asHorn">Horn</button></div>
      </div>
    </div>`;
    const $ = (s) => root.querySelector(s);
    const display = (ms) => Math.round(U.speed(ms));
    const accActive = () => { const a = (BD.st.world && BD.st.world.adas) || {}; return !!a.acc; };

    $('#asUnit').textContent = U.speedLabel();
    $('#asOn').onclick = () => {
      const d = BD.data();
      if (S.adas.accPref) BD.cmd('accOn', { speed: Math.max(d.speed, U.speedToMs(30)) });
      else BD.cmd('cruiseOn', {});
    };
    $('#asRes').onclick = () => BD.cmd('cruiseResume');
    $('#asOff').onclick = () => (accActive() ? BD.cmd('accOff') : BD.cmd('cruiseOff'));
    root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
      const delta = U.speedToMs(+b.dataset.d);
      if (accActive()) {
        const cur = BD.st.world.adas.accSet || BD.data().speed;
        BD.cmd('accSet', { speed: Math.max(0, cur + delta) });
      } else BD.cmd('cruiseChange', { delta });
    }));
    $('#asAccPref').checked = !!S.adas.accPref;
    $('#asAccPref').onchange = (e) => { S.adas.accPref = e.target.checked; BD.save(); };
    const gapEl = $('#asGap');
    for (let i = 1; i <= 4; i++) {
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = '▮'.repeat(i); b.dataset.g = i;
      b.onclick = () => BD.setAdas({ accGap: i });
      gapEl.appendChild(b);
    }
    const sensEl = $('#asSens');
    ['Late', 'Normal', 'Early'].forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = t; b.dataset.s = i + 1;
      b.onclick = () => BD.setAdas({ fcwSens: i + 1 });
      sensEl.appendChild(b);
    });
    root.querySelectorAll('[data-adas]').forEach((inp) => {
      inp.checked = !!S.adas[inp.dataset.adas];
      inp.onchange = () => BD.setAdas({ [inp.dataset.adas]: inp.checked });
    });
    $('#asEscBtn').onclick = () => BD.cmd('escToggle');
    $('#asModeBtn').onclick = () => BD.cmd('driveModeNext');
    root.querySelectorAll('[data-light]').forEach((b) => (b.onclick = () => BD.cmd('lights', { value: +b.dataset.light })));
    root.querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = () => BD.cmd(b.dataset.cmd)));
    const horn = $('#asHorn');
    const hornOn = (e) => { e.preventDefault(); BD.cmd('horn', { value: true }); };
    const hornOff = () => BD.cmd('horn', { value: false });
    horn.addEventListener('pointerdown', hornOn);
    horn.addEventListener('pointerup', hornOff);
    horn.addEventListener('pointerleave', hornOff);

    function update() {
      const d = BD.data();
      const w = BD.st.world || {};
      const ad = w.adas || {};
      const acc = !!ad.acc;
      const set = acc ? ad.accSet : d.cruise.target;
      $('#asUnit').textContent = U.speedLabel();
      $('#asSet').textContent = d.cruise.on || acc ? display(set) : '--';
      const cs = $('#asCruiseState');
      cs.textContent = d.cruise.on ? (acc ? 'ACC' : 'ON') : 'OFF';
      cs.className = 'pill ' + (d.cruise.on ? 'on' : '');
      const as = $('#asAccState');
      as.textContent = acc ? `ACTIVE ${display(d.accTarget || set)}` : 'OFF';
      as.className = 'pill ' + (acc ? 'on' : '');
      gapEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.g === (S.adas.accGap || 2)));
      sensEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.s === (S.adas.fcwSens || 2)));
      const L = d.lead;
      $('#asLead').textContent = L ? `#${L.id}` : 'none';
      $('#asLeadGap').textContent = L ? U.shortDist(L.gap) : '—';
      $('#asLeadSpd').textContent = L ? `${display(L.spd)} ${U.speedLabel()}` : '—';
      $('#asTTC').textContent = L && L.ttc < 30 ? `${L.ttc.toFixed(1)} s` : '—';
      const f = $('#asFcw');
      f.textContent = d.fcw === 2 ? 'BRAKE!' : d.fcw === 1 ? 'CAUTION' : S.adas.fcw ? 'FCW ready' : 'FCW off';
      f.className = 'pill ' + (d.fcw === 2 ? 'bad' : d.fcw === 1 ? 'warn' : S.adas.fcw ? 'on' : '');
      $('#asBsmL').className = 'pill ' + (d.bsmL ? 'warn' : '');
      $('#asBsmR').className = 'pill ' + (d.bsmR ? 'warn' : '');
      $('#asLimit').textContent = d.speedLimit ? `Limit ${Math.round(U.speed(d.speedLimit) / 5) * 5}` : 'Limit —';
      $('#asEsc').textContent = d.escMode ? d.escMode.toUpperCase() : (d.lights.escActive ? 'intervening' : d.lights.esc ? 'off / warning' : 'on');
      $('#asMode').textContent = d.driveMode || '—';
      const lights = BD.st.e.lights;
      root.querySelectorAll('[data-light]').forEach((b) => b.classList.toggle('on', +b.dataset.light === lights));
      root.querySelector('[data-cmd=fog]').classList.toggle('on', d.lights.fog);
      root.querySelector('[data-cmd=hazard]').classList.toggle('on', d.lights.hazard);
    }
    update();
    return setInterval(update, 250);
  }
  return { mount };
})();
