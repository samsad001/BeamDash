// BeamDash server - zero dependencies (Node 18+).
// BeamNG mod --UDP--> this server --Server-Sent Events--> phones / iPads / desktops
// browser / macros --HTTP--> this server --UDP--> BeamNG mod
'use strict';
const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Demo } = require('./demo');
const actions = require('./actions');
const { Media } = require('./media');
const { Trips } = require('./trips');
const { Perf } = require('./perf');
const { Fun } = require('./fun');
const { Recorder } = require('./recorder');
const { VERSION } = require('./version');

// ------------------------------------------------------------------ config
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  const env = process.env['BEAMDASH_' + name.toUpperCase().replace(/-/g, '_')];
  return env !== undefined ? env : def;
};
const CFG = {
  httpPort: +arg('port', 8080),
  telemetryPort: +arg('telemetry-port', 4445),
  outgaugePort: +arg('outgauge-port', 4444),
  gameHost: arg('game-host', null), // set when BeamNG runs on another machine than this server
  gameCmdPort: +arg('game-cmd-port', 4446),
  demo: arg('demo', 'auto'), // auto | on | off
};
const PUBLIC = path.join(__dirname, '..', 'public');

// ------------------------------------------------------------------ saved settings (data/*.json)
const DATA = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
const loadJson = (name, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return def; } };
const saveJson = (name, obj) => fs.writeFile(path.join(DATA, name), JSON.stringify(obj, null, 2), (e) => e && console.error('[data]', e.message));
// ADAS choices live on the server so every phone, macro and game restart sees the same settings
const prefs = loadJson('settings.json', { adas: { fcw: true, fcwSens: 2, aeb: false, bsm: true, tsr: true, accGap: 2 } });
let deck = loadJson('deck.json', null);
// real counters are saved; the demo car gets its own throw-away set so it never pollutes your records
const real = { trips: new Trips(loadJson('trips.json', null)), perf: new Perf(loadJson('perf.json', null)), fun: new Fun(loadJson('fun.json', null)) };
let demoSet = null;
const freshDemoSet = () => ({ trips: new Trips(null), perf: new Perf(null), fun: new Fun(null) });
const recorder = new Recorder(path.join(DATA, 'recordings'));
setInterval(() => {
  if (real.trips.dirty) { real.trips.dirty = false; saveJson('trips.json', real.trips.t); }
  if (real.perf.dirty) { real.perf.dirty = false; saveJson('perf.json', real.perf); }
  if (real.fun.dirty) { real.fun.dirty = false; saveJson('fun.json', real.fun); }
}, 10000);

// ------------------------------------------------------------------ state
const cache = {
  info: null, vars: null, spec: null, world: null, pt: null, dmg: null,
  electrics: {}, map: null, mapVersion: 0, mapLevel: null, last: null,
};
let lastModVeh = 0, lastGe = 0, lastOutgauge = 0;
let geAddr = CFG.gameHost ? { address: CFG.gameHost, port: CFG.gameCmdPort } : null;
const clients = new Set();
let cmdId = 0;

function sseWrite(res, type, str) {
  res.write(`event: ${type}\ndata: ${str}\n\n`);
}
function emit(type, obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const res of clients) sseWrite(res, type, str);
}

function source() {
  const now = Date.now();
  if (now - lastModVeh < 2000) return 'mod';
  if (now - lastOutgauge < 2000) return 'outgauge';
  if (demo.active) return 'demo';
  return 'none';
}

function status() {
  const now = Date.now();
  return {
    version: VERSION, src: source(), demo: demo.active, clients: clients.size,
    game: lastGe ? now - lastGe : null, veh: lastModVeh ? now - lastModVeh : null,
    outgauge: lastOutgauge ? now - lastOutgauge : null,
    gameHost: geAddr ? geAddr.address : null, mapVersion: cache.mapVersion, mapLevel: cache.mapLevel,
    recording: recorder.active ? recorder.file : null, watched: cache.world ? cache.world.watched || null : null,
  };
}

const active = () => (demo.active ? (demoSet = demoSet || freshDemoSet()) : real);
const carKey = (info) => (info ? `${info.jbeam || '?'}|${(info.config && info.config.Configuration) || (info.current && info.current.config_key) || ''}` : null);

// messages from cars other than the one you drive (spectating) go to the browsers but not into trips / caches
function isOtherCar(msg) {
  if (msg.vid === undefined || !cache.world || cache.world.myId === undefined || cache.world.myId === null) return false;
  return msg.vid !== cache.world.myId;
}

function flushEvents() {
  const s = active();
  for (const text of s.perf.events.splice(0)) emit('toast', { text, kind: 'record' });
  for (const text of s.fun.events.splice(0)) emit('toast', { text, kind: text.startsWith('🏆') ? 'achievement' : 'info' });
}

// ------------------------------------------------------------------ incoming game data
const chunks = new Map();

function handleMessage(msg, raw, fromGe) {
  if (isOtherCar(msg)) {
    if (['veh', 'electrics', 'pt', 'spec', 'dmg'].includes(msg.t)) emit(msg.t, raw || msg);
    return;
  }
  switch (msg.t) {
    case 'veh':
      if (msg.e) {
        Object.assign(cache.electrics, msg.e);
        const e = cache.electrics;
        const s = active();
        const maxRpm = (cache.spec && cache.spec.engine && cache.spec.engine.maxRPM) || e.maxrpm || 7000;
        s.trips.update(e, { accel: msg.g ? msg.g[1] : 0, rpmFrac: (e.rpm || 0) / maxRpm });
        const now = Date.now();
        s.perf.update(e, msg.pos || null, now);
        const tod = cache.world && cache.world.tod;
        const hour = typeof tod === 'number' ? (tod * 24 + 12) % 24 : 12;
        s.fun.update(msg, e, (cache.dmg && cache.dmg.total) || (cache.pt && cache.pt.damage) || 0, {
          night: hour < 6 || hour >= 20, perf: s.perf, lapDone: !!s.perf.lastLap, trips: s.trips.snapshot(),
        });
        recorder.sample(msg, e);
        if (msg.pos) cache.last = { pos: msg.pos, dir: msg.dir };
      }
      emit('veh', raw || msg);
      break;
    case 'electrics':
      cache.electrics = Object.assign(cache.electrics, msg.e);
      emit('electrics', raw || msg);
      break;
    case 'pt': cache.pt = msg; emit('pt', raw || msg); break;
    case 'dmg': cache.dmg = msg; emit('dmg', raw || msg); break;
    case 'spec': cache.spec = msg; emit('spec', raw || msg); break;
    case 'info':
      if (!cache.info || cache.info.vid !== msg.vid || cache.info.jbeam !== msg.jbeam) active().trips.newJourney();
      cache.info = msg; cache.electrics = {};
      active().fun.setCar(carKey(msg));
      emit('info', raw || msg);
      break;
    case 'vars': cache.vars = msg; emit('vars', raw || msg); break;
    case 'world':
      cache.world = msg;
      active().perf.setLevel(msg.level || 'unknown');
      emit('world', raw || msg);
      break;
    case 'map':
      cache.map = raw || JSON.stringify(msg);
      cache.mapVersion++;
      cache.mapLevel = msg.level || null;
      emit('mapver', { version: cache.mapVersion, level: cache.mapLevel, nodes: msg.nodes.length, edges: msg.edges.length });
      console.log(`[map] ${msg.level || '?'}: ${msg.nodes.length} nodes, ${msg.edges.length} roads`);
      break;
    case 'cmdResult': emit('cmdResult', raw || msg); break;
    case 'hello': console.log('[game] BeamDash mod says hello'); break;
  }
  if (fromGe) lastGe = Date.now();
}

const telem = dgram.createSocket('udp4');
telem.on('message', (buf, rinfo) => {
  let str = buf.toString('utf8');
  if (str.startsWith('BDC|')) { // chunked big message (road network)
    const [, id, i, n] = str.split('|', 4);
    let idx = -1;
    for (let k = 0; k < 4; k++) idx = str.indexOf('|', idx + 1);
    const body = str.slice(idx + 1);
    let c = chunks.get(id);
    if (!c) { c = { parts: [], got: 0, n: +n, t: Date.now() }; chunks.set(id, c); }
    if (!c.parts[+i - 1]) { c.parts[+i - 1] = body; c.got++; }
    if (c.got < c.n) return;
    chunks.delete(id);
    str = c.parts.join('');
    for (const [k, v] of chunks) if (Date.now() - v.t > 30000) chunks.delete(k);
  }
  let msg;
  try { msg = JSON.parse(str); } catch { return; }
  const fromGe = msg.vid === undefined; // vehicle VM messages carry their vehicle id
  if (fromGe && !CFG.gameHost) geAddr = { address: rinfo.address, port: CFG.gameCmdPort };
  if (msg.t === 'veh' && !isOtherCar(msg)) lastModVeh = Date.now();
  if (demo.active) demo.stop();
  const reconnect = fromGe && Date.now() - lastGe > 10000;
  handleMessage(msg, str, fromGe);
  if (reconnect) sendToGame({ type: 'adas', settings: prefs.adas }); // game (re)started: restore ADAS choices
});
telem.on('error', (e) => console.error('[udp telemetry]', e.message));
telem.bind(CFG.telemetryPort, '0.0.0.0', () => {
  // the road network arrives as a burst of large datagrams; the Windows default buffer drops them
  try { telem.setRecvBufferSize(16 * 1024 * 1024); } catch { /* keep default */ }
  console.log(`[udp] telemetry on ${CFG.telemetryPort}`);
});

// OutGauge fallback: works with the stock game (Options > Other > OutGauge) even without the mod
const og = dgram.createSocket('udp4');
og.on('message', (b) => {
  if (b.length < 92 || Date.now() - lastModVeh < 1000) return;
  lastOutgauge = Date.now();
  if (demo.active) demo.stop();
  const gearRaw = b.readInt8(10);
  const dl = b.readUInt32LE(44); // showLights
  const has = (bit) => (dl & bit) !== 0;
  const e = {
    wheelspeed: b.readFloatLE(12), rpm: b.readFloatLE(16), turboBoost: b.readFloatLE(20) * 14.5038,
    watertemp: b.readFloatLE(24), fuel: b.readFloatLE(28), oilpressure: b.readFloatLE(32),
    oiltemp: b.readFloatLE(36), throttle: b.readFloatLE(48), brake: b.readFloatLE(52), clutch: b.readFloatLE(56),
    gear: gearRaw === 0 ? 'R' : gearRaw === 1 ? 'N' : String(gearRaw - 1),
    highbeam: has(2), parkingbrake: has(4), tcsActive: has(16), signal_L: has(32), signal_R: has(64),
    oil: has(256), battery: has(512), absActive: has(1024), lowbeam: true, engineRunning: b.readFloatLE(16) > 100,
  };
  handleMessage({ t: 'veh', e, og: true }, null, false);
});
og.on('error', (e) => console.error('[udp outgauge]', e.message));
og.bind(CFG.outgaugePort, '0.0.0.0', () => console.log(`[udp] OutGauge fallback on ${CFG.outgaugePort}`));

function sendToGame(cmd) {
  const target = geAddr || { address: '127.0.0.1', port: CFG.gameCmdPort };
  const buf = Buffer.from(JSON.stringify(cmd));
  telem.send(buf, target.port, target.address);
}

// every car command goes through here (web pages, macros, Deck)
function dispatch(cmd) {
  cmd.id = ++cmdId;
  // handled by the server itself
  if (cmd.type === 'lapLine') {
    const L = { x1: +cmd.x1, y1: +cmd.y1, x2: +cmd.x2, y2: +cmd.y2, dir: cmd.dir || 0 };
    return { ok: active().perf.setLine(L), id: cmd.id, routed: 'server' };
  }
  if (cmd.type === 'adas' && cmd.settings) {
    Object.assign(prefs.adas, cmd.settings);
    saveJson('settings.json', prefs);
  }
  if (demo.active) demo.command(cmd); else sendToGame(cmd);
  return { ok: true, id: cmd.id, routed: demo.active ? 'demo' : 'game' };
}

// server-side actions (no game command needed)
function serverAction(id) {
  const s = active();
  switch (id) {
    case 'perf-reset': s.perf.resetBest(); return { ok: true };
    case 'lap-reset': s.perf.resetLaps(); return { ok: true };
    case 'lap-line-clear': s.perf.clearLine(); return { ok: true };
    case 'lap-line-here': {
      const l = cache.last;
      if (!l || !l.pos || !l.dir) return { ok: false, err: 'No car position yet' };
      const fl = Math.hypot(l.dir[0], l.dir[1]) || 1;
      const fx = l.dir[0] / fl, fy = l.dir[1] / fl, rx = fy, ry = -fx, half = 15;
      // line across the road at the car; "dir" = the side you cross towards (driving forward)
      const L = { x1: l.pos[0] - rx * half, y1: l.pos[1] - ry * half, x2: l.pos[0] + rx * half, y2: l.pos[1] + ry * half };
      const side = (L.x2 - L.x1) * (l.pos[1] + fy - L.y1) - (L.y2 - L.y1) * (l.pos[0] + fx - L.x1);
      L.dir = Math.sign(side) || 1;
      return { ok: s.perf.setLine(L) };
    }
    case 'drift-reset': s.fun.resetDrift(); return { ok: true };
    case 'dyno-reset': s.fun.resetDyno(); return { ok: true };
    case 'record-toggle': {
      if (recorder.active) { const f = recorder.stop(); emit('toast', { text: `Recording saved: ${f}` }); }
      else { const f = recorder.start(cache.info && cache.info.model ? cache.info.model.Name : ''); emit('toast', { text: 'Recording started' }); return { ok: true, file: f }; }
      return { ok: true };
    }
    case 'watch-off': return dispatch({ type: 'watch', vid: null });
    case 'watch-next': {
      const list = ((cache.world && cache.world.vehicles) || []).filter((v) => !v.me).map((v) => v.id).sort((a, b) => a - b);
      if (!list.length) return { ok: false, err: 'No other vehicles to watch' };
      const cur = cache.world.watched;
      const next = list.find((id) => id > (cur || -1));
      return dispatch({ type: 'watch', vid: next === undefined ? null : next });
    }
  }
  return { ok: false, err: `unknown server action ${id}` };
}

// keep announcing ourselves so the mod finds us (needed when the game is on another machine)
setInterval(() => {
  if (demo.active && !CFG.gameHost && !lastGe) return;
  sendToGame({ type: 'hello', needInfo: !cache.info, needMap: !cache.map });
}, 3000);

// ------------------------------------------------------------------ demo mode
const demo = new Demo((type, msg) => handleMessage(msg, null, false));
function startDemo() {
  demoSet = freshDemoSet();
  demo.start();
  demo.command({ type: 'adas', settings: prefs.adas });
}
if (CFG.demo === 'on') startDemo();
setInterval(() => {
  if (CFG.demo !== 'auto') return;
  const quiet = Date.now() - Math.max(lastModVeh, lastOutgauge, lastGe) > 4000;
  if (quiet && !demo.active) { startDemo(); console.log('[demo] no game data - demo car running'); }
  media.demo = demo.active;
}, 1000);
demo.onStop = () => { cache.map = null; cache.info = null; cache.vars = null; cache.spec = null; cache.dmg = null; media.demo = false; console.log('[demo] game connected - demo stopped'); };

// ------------------------------------------------------------------ periodic broadcasts
const media = new Media((s) => emit('media', s));
media.start();
setInterval(() => {
  emit('status', status());
  emit('trips', active().trips.snapshot());
}, 1000);
setInterval(() => { emit('perf', active().perf.snapshot()); flushEvents(); }, 200);
setInterval(() => emit('fun', active().fun.snapshot()), 500);

// ------------------------------------------------------------------ http
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
};

async function runAction(id, q) {
  const r = actions.resolve(id, q, cache);
  if (r.error) return { ok: false, err: r.error };
  if (r.none) return { ok: true };
  if (r.ui) { emit('ui', { action: r.ui }); return { ok: true, ui: r.ui }; }
  if (r.trip) { active().trips.reset(r.trip); emit('trips', active().trips.snapshot()); return { ok: true, reset: r.trip }; }
  if (r.srv) { const out = serverAction(r.srv); emit('status', status()); emit('perf', active().perf.snapshot()); return out; }
  if (r.media) {
    if (await media.command(r.media)) return { ok: true, media: r.media };
    return { ok: false, err: 'No media player found (install playerctl on the PC running the server)' };
  }
  return dispatch({ ...r.game });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    clients.add(res);
    sseWrite(res, 'status', JSON.stringify(status()));
    for (const k of ['info', 'vars', 'spec', 'world', 'pt', 'dmg']) if (cache[k]) sseWrite(res, k, JSON.stringify(cache[k]));
    sseWrite(res, 'electrics', JSON.stringify({ t: 'electrics', e: cache.electrics }));
    sseWrite(res, 'media', JSON.stringify({ ...media.state, artFile: undefined }));
    sseWrite(res, 'trips', JSON.stringify(active().trips.snapshot()));
    sseWrite(res, 'perf', JSON.stringify(active().perf.snapshot()));
    sseWrite(res, 'fun', JSON.stringify(active().fun.snapshot()));
    if (cache.map) sseWrite(res, 'mapver', JSON.stringify({ version: cache.mapVersion, level: cache.mapLevel }));
    const ka = setInterval(() => res.write(': ka\n\n'), 15000);
    req.on('close', () => { clearInterval(ka); clients.delete(res); });
    return;
  }
  if (p === '/api/cmd' && req.method === 'POST') {
    try { json(res, 200, dispatch(JSON.parse(await readBody(req)))); } catch (e) { json(res, 400, { ok: false, err: e.message }); }
    return;
  }
  // macros: GET or POST /api/action/<id>?step=5&unit=mph  (Stream Deck, KDE shortcuts, curl, Deck page)
  if (p.startsWith('/api/action/')) {
    const id = decodeURIComponent(p.slice('/api/action/'.length));
    const r = await runAction(id, Object.fromEntries(url.searchParams));
    json(res, r.ok === false ? 400 : 200, r);
    return;
  }
  if (p === '/api/actions') { json(res, 200, actions.LIST); return; }
  if (p === '/api/info') { json(res, 200, { version: VERSION, port: CFG.httpPort, hostname: os.hostname(), addresses: lanAddresses() }); return; }
  if (p === '/api/deck') {
    if (req.method === 'PUT' || req.method === 'POST') {
      try { deck = JSON.parse(await readBody(req)); saveJson('deck.json', deck); emit('deck', deck); json(res, 200, { ok: true }); }
      catch (e) { json(res, 400, { ok: false, err: e.message }); }
    } else json(res, 200, deck);
    return;
  }
  // drive recordings (CSV)
  if (p === '/api/recordings') { json(res, 200, { active: recorder.active, file: recorder.file, list: recorder.list() }); return; }
  if (p.startsWith('/api/recordings/')) {
    const f = recorder.safePath(decodeURIComponent(p.slice('/api/recordings/'.length)));
    if (!f) { json(res, 404, { ok: false }); return; }
    if (req.method === 'DELETE') {
      if (recorder.file && f.endsWith(recorder.file)) { json(res, 400, { ok: false, err: 'Stop the recording first' }); return; }
      fs.unlink(f, (e) => json(res, e ? 500 : 200, { ok: !e }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${path.basename(f)}"` });
    fs.createReadStream(f).pipe(res);
    return;
  }
  if (p === '/api/media/art') { media.sendArt(res); return; }
  if (p === '/api/map') {
    if (!cache.map) { res.writeHead(404); res.end('{}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(cache.map);
    return;
  }
  if (p === '/api/state') {
    json(res, 200, {
      status: status(), ...cache, map: undefined, trips: active().trips.snapshot(), perf: active().perf.snapshot(),
      fun: active().fun.snapshot(), media: { ...media.state, artFile: undefined }, adasPrefs: prefs.adas,
    });
    return;
  }

  // static files
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(p === '/' ? '/index.html' : p)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  if (!path.extname(file)) file += '.html';
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(CFG.httpPort, '0.0.0.0', () => {
  console.log(`\n  BeamDash ${VERSION} is running. Open on any device on your network:\n`);
  console.log(`    http://localhost:${CFG.httpPort}`);
  console.log(`    http://${os.hostname()}:${CFG.httpPort}`);
  for (const a of lanAddresses()) console.log(`    http://${a}:${CFG.httpPort}`);
  console.log(`\n  Game host: ${CFG.gameHost || 'auto (same PC / learned from the mod)'}   demo: ${CFG.demo}`);
  console.log(`  Connect a phone (QR codes): /connect   Deck: /deck   HUD: /hud   Macros: /macros\n`);
});
