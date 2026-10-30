// Macros page: every action's URL, a test button, and key bindings.
'use strict';
(() => {
  BD.nav('macros');
  BD.connect();
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const origin = location.origin;
  let actions = [];
  let listening = null;

  const urlFor = (a) => {
    let q = '';
    if (a.id === 'cruise-plus' || a.id === 'cruise-minus') q = `?step=${BD.settings.cruiseStep || 5}&unit=${BD.settings.speedUnit}`;
    return `${origin}/api/action/${a.id}${q}`;
  };
  const keyFor = (id) => Object.entries(BD.keys).filter(([, v]) => v === id).map(([k]) => k);
  const keyName = (k) => ({ ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[k] || k);

  function render() {
    $('kdeExample').textContent = `curl -s ${origin}/api/action/signal-left`;
    $('step').value = BD.settings.cruiseStep || 5;
    $('count').textContent = `${actions.length} actions`;
    let group = null;
    const rows = [];
    for (const a of actions) {
      if (a.group !== group) {
        group = a.group;
        rows.push(`<tr><th colspan="4" style="padding-top:16px">${esc(group)}</th></tr>`);
      }
      const keys = keyFor(a.id);
      rows.push(`<tr>
        <td style="white-space:nowrap">${esc(a.label)}${a.hold ? ' <span class="pill">hold</span>' : ''}</td>
        <td class="hide-sm"><span class="url">${esc(urlFor(a))}</span>${a.hold ? `<div class="muted" style="font-size:12px">release: <span class="url">…?state=up</span></div>` : ''}</td>
        <td style="white-space:nowrap"><button class="btn small" data-copy="${esc(urlFor(a))}">Copy URL</button> <button class="btn small" data-run="${a.id}">Run</button></td>
        <td style="white-space:nowrap"><button class="kbd ${listening === a.id ? 'listening' : ''}" data-key="${a.id}">${listening === a.id ? 'press a key…' : keys.length ? keys.map(keyName).map(esc).join(' / ') : '—'}</button></td>
      </tr>`);
    }
    $('table').innerHTML = rows.join('');
    $('table').querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); BD.toast('URL copied'); }
      catch { prompt('Copy this URL', b.dataset.copy); }
    }));
    $('table').querySelectorAll('[data-run]').forEach((b) => (b.onclick = async () => {
      const id = b.dataset.run;
      const r = await BD.action(id, id.startsWith('cruise-') ? BD.unitParams() : undefined);
      if (r.ok) BD.toast(`Sent: ${id}`);
      if (actions.find((a) => a.id === id && a.hold)) setTimeout(() => BD.action(id, { state: 'up' }), 400);
    }));
    $('table').querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => {
      listening = listening === b.dataset.key ? null : b.dataset.key;
      BD.pauseKeys(!!listening);
      render();
    }));
  }

  window.addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    const id = listening;
    for (const k of keyFor(id)) BD.setKey(k, null); // one key per action
    if (e.key !== 'Escape') {
      BD.setKey(e.key, id);
      BD.toast(`${keyName(e.key)} → ${id}`);
    }
    listening = null;
    BD.pauseKeys(false);
    render();
  }, true);

  $('step').onchange = () => { BD.settings.cruiseStep = +$('step').value; BD.save(); render(); };
  $('resetKeys').onclick = () => { BD.resetKeys(); render(); BD.toast('Default keys restored'); };

  fetch('/api/actions').then((r) => r.json()).then((list) => { actions = list; render(); }).catch(() => BD.toast('Could not load actions', true));
})();
