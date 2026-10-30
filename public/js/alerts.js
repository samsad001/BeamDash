// Chimes, warnings, night dimming and spoken navigation (used by the cluster and the HUD).
'use strict';
window.Alerts = (() => {
  const S = BD.settings, U = BD.U;
  let audio = null;
  const unlock = () => {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } }
    if (audio && audio.state === 'suspended') audio.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  function tone(freq, dur, vol = 0.15, type = 'sine', when = 0) {
    if (!S.sounds || !audio) return;
    const t = audio.currentTime + when;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + dur);
  }
  const CHIMES = {
    tick: () => tone(1400, 0.03, 0.08, 'triangle'),
    tock: () => tone(900, 0.03, 0.08, 'triangle'),
    gong: () => { tone(880, 0.6, 0.18); tone(660, 0.8, 0.14, 'sine', 0.18); },       // classic "ding-dong"
    warn: () => { tone(1320, 0.12, 0.18, 'square'); tone(1320, 0.12, 0.18, 'square', 0.2); },
    shift: () => tone(2400, 0.06, 0.12, 'square'),
    fcw1: () => tone(1600, 0.09, 0.2, 'square'),
    fcw2: () => tone(2200, 0.09, 0.22, 'square'),
    win: () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.25, 0.14, 'triangle', i * 0.12)); },
    crash: () => tone(140, 0.5, 0.25, 'sawtooth'),
  };
  const play = (n) => CHIMES[n] && CHIMES[n]();

  // ---------------------------------------------------------------- spoken navigation
  let lastNav = null, spokenFor = '', lastSpoken = 0;
  function say(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* not allowed yet */ }
  }
  const spokenDist = (m) => {
    if (S.speedUnit === 'mph') return m < 300 ? `${Math.round(m * 3.28084 / 50) * 50} feet` : `${(m / 1609.344).toFixed(1).replace('.0', '')} miles`;
    return m < 1000 ? `${Math.round(m / 50) * 50} metres` : `${(m / 1000).toFixed(1).replace('.0', '')} kilometres`;
  };
  function navVoice(d) {
    if (!S.voice) return;
    const n = BD.navNext(d.route, d.pos);
    if (!n) { if (lastNav && lastNav.dir === 'arrive' && lastNav.dist < 60) say('You have arrived'); lastNav = null; spokenFor = ''; return; }
    const key = `${n.dir}:${Math.round((n.total - n.dist) / 30)}`; // identifies this manoeuvre along the route
    for (const mark of [800, 300, 60]) {
      const tag = `${key}@${mark}`;
      if (n.dist < mark && n.dist > mark * 0.4 && !spokenFor.includes(tag) && performance.now() - lastSpoken > 3000) {
        spokenFor += tag + ';';
        lastSpoken = performance.now();
        if (n.dir === 'arrive') say(mark === 60 ? 'Your destination is ahead' : `In ${spokenDist(n.dist)}, you will arrive`);
        else say(mark === 60 ? `Turn ${n.dir} now` : `In ${spokenDist(n.dist)}, ${n.sharp ? 'make a sharp' : 'turn'} ${n.dir}`);
        break;
      }
    }
    if (spokenFor.length > 600) spokenFor = spokenFor.slice(-300);
    lastNav = n;
  }
  function toggleVoice() {
    S.voice = !S.voice;
    BD.save();
    BD.toast(S.voice ? 'Voice navigation on' : 'Voice navigation off');
    if (S.voice) say('Voice navigation on');
  }

  // ---------------------------------------------------------------- per-frame checks
  let lastSig = false, fcwAt = 0, speedAt = 0, limitAt = 0, fuelWarned = false, shiftArmed = true, lastDrift = 0, crashCount = null, achCount = null;
  const banner = { text: '', until: 0, kind: '' };
  function show(text, kind, ms = 2500) { banner.text = text; banner.kind = kind; banner.until = performance.now() + ms; }

  function update(d, now) {
    // indicator tick
    const sig = d.lights.sigL || d.lights.sigR;
    if (sig !== lastSig) { play(sig ? 'tick' : 'tock'); lastSig = sig; }
    // forward collision
    if (d.fcw && now - fcwAt > (d.fcw === 2 ? 180 : 600)) { play(d.fcw === 2 ? 'fcw2' : 'fcw1'); fcwAt = now; }
    const spdDisp = U.speed(d.speed);
    // speed warning at a speed you choose (like a real car's "speed warning" setting)
    if (S.speedWarn > 0 && spdDisp > S.speedWarn) {
      if (now - speedAt > 8000) { play('gong'); show(`SPEED ${S.speedWarn}`, 'warn'); speedAt = now; }
    }
    // over the posted limit
    if (S.limitWarn && d.speedLimit && d.adas.tsr !== false) {
      const lim = Math.round(U.speed(d.speedLimit) / 5) * 5;
      if (spdDisp > lim + (+S.limitTol || 0) && now - limitAt > 10000) { play('warn'); show(`LIMIT ${lim}`, 'limit'); limitAt = now; }
    }
    // low fuel / battery once per drop below 10 %
    const level = d.isEV && d.battery !== null ? d.battery : d.fuel;
    if (S.lowFuelChime && level < 0.1 && level > 0 && !fuelWarned) { play('gong'); show(d.isEV ? 'BATTERY LOW' : 'FUEL LOW', 'warn', 4000); fuelWarned = true; }
    if (level > 0.15) fuelWarned = false;
    // shift beep at the shift-light rpm
    if (S.shiftBeep && !d.isEV) {
      if (d.rpm > d.shiftRpm && shiftArmed) { play('shift'); shiftArmed = false; }
      if (d.rpm < d.shiftRpm * 0.9) shiftArmed = true;
    }
    // crash + achievement sounds (counts come from the server)
    const f = BD.st.fun;
    if (f) {
      const c = f.crashes ? f.crashes.length : 0;
      if (crashCount !== null && c > crashCount) { play('crash'); show(`IMPACT ${f.crashes[0].peakG.toFixed(1)} g`, 'limit', 3000); }
      crashCount = c;
      const a = (f.achievements || []).filter((x) => x.at).length;
      if (achCount !== null && a > achCount) play('win');
      achCount = a;
      if (f.drift && f.drift.last && f.drift.last !== lastDrift) { lastDrift = f.drift.last; if (lastDrift > 300) show(`DRIFT ${lastDrift}`, 'drift', 2500); }
    }
    navVoice(d);
  }

  // automatic night dimming from the in-game clock
  function dimFactor(d) {
    if (!S.autoDim || typeof d.tod !== 'number') return 1;
    const h = (d.tod * 24 + 12) % 24;
    if (h >= 21 || h < 5) return 0.62;
    if (h >= 19.5 || h < 6.5) return 0.8;
    return 1;
  }

  BD.on('ui', (m) => { if (m.action === 'voice') toggleVoice(); });

  return { update, play, say, dimFactor, toggleVoice, banner, show };
})();
