// BeamDash server - zero dependencies (Node 18+).
// BeamNG mod --UDP--> this server --Server-Sent Events--> phones / iPads / desktops
// browser --HTTP POST /api/cmd--> this server --UDP--> BeamNG mod
'use strict';
const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Demo } = require('./demo');

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

// ------------------------------------------------------------------ state
const cache = {
  info: null, vars: null, spec: null, world: null, pt: null,
  electrics: {}, map: null, mapVersion: 0, mapLevel: null,
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
    src: source(), demo: demo.active, clients: clients.size,
    game: lastGe ? now - lastGe : null, veh: lastModVeh ? now - lastModVeh : null,
    outgauge: lastOutgauge ? now - lastOutgauge : null,
    gameHost: geAddr ? geAddr.address : null, mapVersion: cache.mapVersion, mapLevel: cache.mapLevel,
  };
}

// ------------------------------------------------------------------ incoming game data
const chunks = new Map();

function handleMessage(msg, raw, fromGe) {
  switch (msg.t) {
    case 'veh':
      if (msg.e) Object.assign(cache.electrics, msg.e);
      emit('veh', raw || msg);
      break;
    case 'electrics':
      cache.electrics = Object.assign(cache.electrics, msg.e);
      emit('electrics', raw || msg);
      break;
    case 'pt': cache.pt = msg; emit('pt', raw || msg); break;
    case 'spec': cache.spec = msg; emit('spec', raw || msg); break;
    case 'info': cache.info = msg; cache.electrics = {}; emit('info', raw || msg); break;
    case 'vars': cache.vars = msg; emit('vars', raw || msg); break;
    case 'world': cache.world = msg; emit('world', raw || msg); break;
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
  if (msg.t === 'veh') lastModVeh = Date.now();
  if (demo.active) demo.stop();
  handleMessage(msg, str, fromGe);
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

// keep announcing ourselves so the mod finds us (needed when the game is on another machine)
setInterval(() => {
  if (demo.active && !CFG.gameHost && !lastGe) return;
  sendToGame({ type: 'hello', needInfo: !cache.info, needMap: !cache.map });
}, 3000);

// ------------------------------------------------------------------ demo mode
const demo = new Demo((type, msg) => handleMessage(msg, null, false));
if (CFG.demo === 'on') demo.start();
setInterval(() => {
  if (CFG.demo !== 'auto') return;
  const quiet = Date.now() - Math.max(lastModVeh, lastOutgauge, lastGe) > 4000;
  if (quiet && !demo.active) { demo.start(); console.log('[demo] no game data - demo car running'); }
}, 1000);
demo.onStop = () => { cache.map = null; cache.info = null; cache.vars = null; cache.spec = null; console.log('[demo] game connected - demo stopped'); };

setInterval(() => emit('status', status()), 1000);

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    clients.add(res);
    sseWrite(res, 'status', JSON.stringify(status()));
    for (const k of ['info', 'vars', 'spec', 'world', 'pt']) if (cache[k]) sseWrite(res, k, JSON.stringify(cache[k]));
    sseWrite(res, 'electrics', JSON.stringify({ t: 'electrics', e: cache.electrics }));
    if (cache.map) sseWrite(res, 'mapver', JSON.stringify({ version: cache.mapVersion, level: cache.mapLevel }));
    const ka = setInterval(() => res.write(': ka\n\n'), 15000);
    req.on('close', () => { clearInterval(ka); clients.delete(res); });
    return;
  }
  if (p === '/api/cmd' && req.method === 'POST') {
    try {
      const cmd = JSON.parse(await readBody(req));
      cmd.id = ++cmdId;
      if (demo.active) demo.command(cmd); else sendToGame(cmd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: cmd.id, routed: demo.active ? 'demo' : 'game' }));
    } catch (e) {
      res.writeHead(400); res.end(JSON.stringify({ ok: false, err: e.message }));
    }
    return;
  }
  if (p === '/api/map') {
    if (!cache.map) { res.writeHead(404); res.end('{}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(cache.map);
    return;
  }
  if (p === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: status(), ...cache, map: undefined }));
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
  console.log('\n  BeamDash is running. Open on any device on your network:\n');
  console.log(`    http://localhost:${CFG.httpPort}`);
  console.log(`    http://${os.hostname()}:${CFG.httpPort}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) console.log(`    http://${ni.address}:${CFG.httpPort}`);
  }
  console.log(`\n  Game host: ${CFG.gameHost || 'auto (same PC / learned from the mod)'}   demo: ${CFG.demo}\n`);
});
