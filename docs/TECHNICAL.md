# BeamDash technical write-up (alpha 0.01)

This document explains how the first BeamDash build is put together: the moving parts, the wire protocols, the algorithms behind the assists, and how to extend it. For installation and everyday use, see `MOD_DOCUMENTATION.md` and the README. What changed in later builds is in `CHANGELOG.md`.

---

## 1. Goals and constraints

- **Every car, no per-car work.** Data comes from standard BeamNG systems (electrics, powertrain, wheels, navigation graph), never from vehicle-specific code.
- **Runs on what you already have.** The server is plain Node.js (18+) with **zero npm dependencies**. Copy the folder and run it. The web app is static HTML/JS/Canvas with no build step.
- **Many screens.** Phones, tablets and a second monitor all connect to the same server and see the same live car.
- **Low game overhead.** The mod only reads values the game already computes, and only the player's car streams.
- **Usable without the game.** A built-in demo car exercises every screen, which is also how the UI is developed and tested.

---

## 2. Architecture

```
┌──────────────────── BeamNG.drive ────────────────────┐
│  Vehicle Lua VM (player car)    Game-engine Lua VM    │
│  beamDashVeh.lua                beamDash.lua          │
│   · electrics, wheels,           · all vehicles, GPS  │
│     powertrain                   · road network       │
│   · runs car commands            · car info, tuning   │
│                                  · ADAS logic         │
│        │ UDP 4445                   │ UDP 4445 ▲ 4446 │
└────────┼────────────────────────────┼──────────┼──────┘
         ▼                            ▼          │
┌──────────────────── BeamDash server (Node) ──────────┐
│ server.js   UDP in/out, chunk reassembly, cache, HTTP │
│ demo.js     demo car                                  │
└──────────┬──────────────────────────────▲─────────────┘
           │ Server-Sent Events           │ HTTP POST
           ▼ (/api/stream)                │ (/api/cmd)
        Cluster · Telemetry · Map & Nav · Garage   (browsers)
```

**Why UDP from the game:** BeamNG ships LuaSocket. Non-blocking UDP needs no connection management inside the game loop, never stalls a frame, and a lost packet just means the next one 33 ms later wins.

**Why Server-Sent Events to browsers:** one long-lived HTTP response per client, natively supported (`EventSource`), auto-reconnecting, and needs no WebSocket implementation (the server stays dependency-free). Commands go the other way as plain HTTP requests.

### Two Lua VMs
BeamNG runs vehicle Lua (one VM per vehicle) separately from game-engine (GE) Lua. Vehicle-only data (electrics, wheels, powertrain) has to be read in the vehicle VM; world data (other cars, navigation, tuning, level) lives in GE. So the mod has two extensions:

| File | VM | Loaded by |
|---|---|---|
| `lua/vehicle/extensions/auto/beamDashVeh.lua` | vehicle | auto-loaded into every vehicle (`extensions/auto/`) |
| `lua/ge/extensions/beamDash.lua` | game engine | `scripts/beamDash/modScript.lua` → `extensions.load('beamDash')`, unload mode manual |

The GE side forwards car commands into the player's vehicle VM with `veh:queueLuaCommand("beamDashVeh.cmd(<json>)")`. The JSON is quoted with Lua's `%q`, so no escaping bugs.

---

## 3. Game → server protocol (UDP 4445)

Every datagram is one JSON object with a type field `t`. Messages from the vehicle VM carry `vid` (the vehicle id); GE messages don't, which is how the server tells them apart and learns the game's address for replies.

| `t` | From | Rate | Payload (main fields) |
|---|---|---|---|
| `veh` | vehicle | 30 Hz | `e` (~60 whitelisted electrics), `g` [gx, gy, gz] m/s², `pos`, `vel`, `dir` (vec3), every 2nd packet `wheels[]` |
| `electrics` | vehicle | 4 Hz | `e`: every scalar in `electrics.values` |
| `pt` | vehicle | 4 Hz | `pt{name → device scalars + rpmOut}`, `energy{tank → scalars}`, `damage` |
| `spec` | vehicle | 5 s | `engine{maxRPM, idleRPM, revLimiterRPM, maxPower, maxTorque, …}`, `gearbox{type, ratios}`, `controllers[]`, `driveMode`, `mass` |
| `info` | GE | on spawn / switch | `model` (Brand, Name, Years…), `config` (Configuration, Power, Torque, Weight, Drivetrain…), `jbeam` |
| `vars` | GE | on spawn / switch | `vars{$name → {title, category, min, max, step, unit, default}}`, `values{$name → value}` |
| `world` | GE | 10 Hz | `vehicles[]` {id, me, x, y, z, hx, hy, spd, dmg}, `route{pts[], len}`, `adas`, `adasState`, `speedLimit`, `tod`, `paused`, `level` |
| `map` | GE | level load / request | `nodes[[x, y, z, radius]]`, `edges[[a, b, drivability, oneWay, speedLimit]]` |
| `cmdResult` | either | per command | `id`, `type`, `ok`, `err` |
| `hello` | GE | on load | `listenPort` |

Notes:
- **Numbers** are rounded to 3 decimals (vehicle) or 1–3 (GE), and NaN/±inf are dropped before `jsonEncode`. This keeps a `veh` packet around 2–4 kB.
- **Scalar extraction** (`scalars()`) copies only number/boolean/short-string fields of a table. That's how wheels, powertrain devices and tanks are sent *generically*: whatever fields the game has, the telemetry page shows.
- **Large messages** (the road network can be several hundred kB) are split into chunks: `BDC|<msgId>|<i>|<n>|<payload slice>`, 48 kB each, 2 per frame. The server reassembles by id, ignores duplicates, and expires partial messages after 30 s. Its receive buffer is raised to 16 MB because Windows' default dropped bursts in testing.

### Server → game (UDP 4446)
Plain JSON commands: `{ "type": "...", ...args, "id": n }`. GE handles world-level commands itself (`hello`, `getInfo`, `getMap`, `setVars`, `navTo`, `navClear`, `adas`, `accOn`, `accSet`, `accOff`, `timeOfDay`, `pause`, `reset`). Everything else is forwarded to the vehicle VM's action table.

The server re-sends `hello {needInfo, needMap}` every 3 s, which:
1. lets a server on another machine be discovered: GE switches its `serverHost` to the sender's IP and tells the vehicle VM;
2. re-requests car info / map if the server restarted.

---

## 4. Server

`server/server.js` is one HTTP server plus two UDP sockets (plus an optional OutGauge socket on 4444).

### Cache and fan-out
The latest `info`, `vars`, `spec`, `world`, `pt` and merged `electrics` are cached. A new browser receives the cache immediately on connect, then live events. The road network is cached as the raw JSON string and served from `GET /api/map`; clients are only told its version (`mapver`) over SSE, so the stream stays small.

Live `veh` packets are forwarded to browsers **as the raw string they arrived as**, so no re-serialization happens at 30 Hz × N clients.

### HTTP API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/stream` | GET | SSE stream. Events: `status`, `veh`, `electrics`, `pt`, `spec`, `info`, `vars`, `world`, `mapver`, `cmdResult` |
| `/api/cmd` | POST | raw command JSON → game (or demo) |
| `/api/map` | GET | road network JSON |
| `/api/state` | GET | snapshot of everything (debugging) |
| anything else | GET | static files from `public/` (path-traversal checked) |

### OutGauge fallback
If no mod data arrives, standard OutGauge packets on UDP 4444 are decoded (speed, rpm, gear, pedals, temperatures, fuel, boost, dash-light bits) and turned into the same `veh` shape, so the cluster works in basic mode.

### Demo car (`demo.js`)
A closed circuit built from a Catmull-Rom spline (≈3.6 km) with a grid of side streets, used as the demo map. A virtual driver:
- target speed from look-ahead curvature: `v ≤ √(a_lat / κ)` with braking look-ahead `√(v_c² + 2·a_brake·d)`;
- throttle and brake follow the speed error through a first-order filter;
- a 7-speed automatic from rpm thresholds, turbo, temperatures, fuel burn and brake heating;
- 3 traffic cars, one in the next lane, that change lanes so the overtake / blind-spot / ACC logic gets exercised.

It emits exactly the same message types as the mod, through the same handler, so every page is tested by the same code path.

---

## 5. Web app

No framework, no bundler: one `<script>` per module, sharing a few globals.

| Module | Role |
|---|---|
| `client.js` (`BD`) | SSE connection, state store, **normalization**, units, settings (localStorage), commands, formatting |
| `gauges.js` (`G`) | canvas primitives: dial (ticks, labels, red zone), needles, arc bars, segment bars, 7-segment digits, tell-tale icons drawn as paths, G-meter, top-down car, speed-limit signs, ADAS lane view |
| `mapview.js` | road-network renderer + spatial grid |
| `designs.js` | the 16 cluster designs (a registry of `{id, draw, opts}`) |
| `cluster.js` | render loop, smoothing, needle sweep, design picker, customization, warnings, sounds, keys (← → designs, `A` assist, `H` hide) |
| `assist.js` | the Drive Assist panel (cruise, ACC, FCW, AEB, BSM, speed limits, ESC, drive modes) |
| `telemetry.js`, `map.js`, `garage.js` | the other pages |

### Normalization
`BD.data()` turns raw electrics into one stable object that all designs use: speed (m/s), rpm, tach max (redline × 1.06 rounded up to 1000), red-zone start, gear string (`P/R/N/D3/1…` from the string or number forms the game uses), fuel, range, temperatures, boost, every light as a boolean, cruise / ADAS / route / lead car, and G-forces. Designs never read raw electrics, so one fix applies to all 16.

### Rendering
- Each design draws into a fixed **1600 × 600 virtual canvas**. The page scales it to the screen (letterboxed, HiDPI-aware), so every design works on a phone, an iPad or a 4K monitor without layout code.
- `requestAnimationFrame` at 60 fps (or 30). Data arrives at 30 Hz, so values are smoothed per frame with `v += (target − v)·(1 − e^(−dt·rate))`, with a rate per signal (rpm fast, temperatures slow).
- A start-up needle sweep (rpm and speed to max and back, 1.6 s) runs when a car spawns or the design changes.

### Map renderer
Road edges are bucketed into a **250 m spatial grid** when the map loads. Each frame only the cells around the view are visited, edges are grouped by class (dirt / minor / major) and by width, and each group is one canvas path. Projection: translate → rotate (heading-up) → scale with Y flipped (BeamNG is Z-up, Y-north).

**Turn-by-turn:** walk the route polyline; at each point, compare the heading 25 m before and after; the first point beyond 15 m with |Δheading| > 40° is the next manoeuvre (> 110° = sharp).

### 3-D surround view
Other vehicles are converted to the car's frame (`lon = rel·fwd`, `lat = rel·right`) and projected with a pinhole camera behind and above the car. Cars are drawn back-to-front as a shadow, a rear face and a roof. The lead car takes the ACC / FCW colour; blind-spot cars turn amber.

---

## 6. ADAS algorithms (in `beamDash.lua`, 10 Hz)

Using `map.objects` (position, velocity, direction of every vehicle):

```
fwd   = normalize(dir.xy)          right = (fwd.y, −fwd.x)
rel   = other.pos − me.pos
lon   = rel·fwd                    lat = rel·right
mySpd = me.vel·fwd                 itsSpd = other.vel·fwd

lead        : 1 < lon < 160, |lat| < 2.0 + 0.012·lon, |Δz| < 6   → nearest by lon
gap         = lon − 4.5            (rough bumper-to-bumper)
TTC         = gap / (mySpd − itsSpd)   when closing > 0.5 m/s
FCW         : TTC < T (1.4 / 2.0 / 2.7 s) → caution, < 0.55·T → brake (mySpd > 3 m/s)
AEB         : TTC < 0.9 s → input.event('brake', 1); release when TTC > 1.6 s or stopped
ACC target  = min(set, itsSpd + 0.35·(gap − (τ·max(mySpd, 5) + 4)))   if gap < 1.6·desired
              τ = 1.0 / 1.5 / 2.0 / 2.6 s; sent to the car's cruise control every 100 ms
BSM         : −13 < lon < 2.5 and 1.5 < |lat| < 5.5
TSR (2 Hz)  : map.findClosestRoad(pos) → link.speedLimit if within 15 m
```

ACC is a proportional gap controller on top of the game's own cruise control.

---

## 7. BeamNG APIs used

| API | Purpose | Status in this build |
|---|---|---|
| LuaSocket UDP (`socket.udp`, `sendto`, `receivefrom`, non-blocking) | transport | ✅ confirmed (native Linux) |
| `electrics.values`, `sensors.gx2/gy2/gz2`, `obj:getPosition/Velocity/DirectionVector` | live data | ✅ confirmed |
| `wheels.wheelRotators`, `powertrain.getDevices/getDevicesByType`, `energyStorage.getStorages` | tires, drivetrain, tanks | ✅ confirmed |
| `playerInfo.firstPlayerSeated` | stream only the player's car | ✅ confirmed |
| `map.objects`, `map.getMap()`, `map.findClosestRoad` | world, roads, limits | ✅ confirmed (road network received) |
| `core_vehicles.getCurrentVehicleDetails`, `core_vehicle_manager.getPlayerVehicleData` | car info, tuning variables | ✅ confirmed |
| `controller.getController('cruiseControl')` | cruise / ACC | ❌ not found in-game; cruise doesn't work (a fix is planned for the next release) |
| `core_vehicle_partmgmt.setConfigVars` | apply tuning | to be confirmed in-game |
| `core_groundMarkers.setPath` / `routePlanner.path` | GPS route | to be confirmed in-game |
| `electrics.setLightsState`, `toggle_*_signal`, `toggle_warn_signal`, `toggle_fog_lights`, `horn` | lights | to be confirmed in-game |
| `controller.mainController.setStarter / setEngineIgnition / shiftUp / shiftDown` | engine, gears | to be confirmed in-game |
| `controller.getController('esc' / 'driveModes')` | ESC, drive modes | vehicle-dependent |
| `core_environment.get/setTimeOfDay`, `simTimeAuthority.pause/getPause` | world | to be confirmed in-game |

Every call that could be missing on some car or version is wrapped in `pcall`. A failure becomes a `cmdResult` error the app shows, never a script crash.

---

## 8. Persistence

| Where | What |
|---|---|
| browser localStorage | per-screen choices: design, design colours, units, brightness, map theme |
| `settings/beamDash.json` (BeamNG user folder) | mod network settings |

The server keeps nothing on disk in this build. ADAS settings live in the game session.

---

## 9. Security model

- Designed for a **trusted home network**. There is no authentication: anyone who can reach port 8080 can view telemetry and send car commands.
- The server only reads files under `public/` (normalized path check). Request bodies are capped at 1 MB. Commands are JSON data, never evaluated as code. In the game, payloads reach Lua only through `jsonDecode` and a fixed action table.
- Don't port-forward 8080 / 4445 / 4446. For remote use, put it behind a VPN.

---

## 10. Extending

**Add a cluster design** (`public/js/designs.js`):
```js
reg({
  id: 'myDash', name: "My Dash '99", era: '1990s', region: 'Euro', inspired: 'my idea',
  opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#ff8800' }],
  draw(c, d, k) {
    // 1600x600 canvas; d = normalized data; k.o = options; k.t = seconds
    const ang = G.dial(c, { x: 400, y: 300, r: 250, max: d.tachMax / 1000, major: 1, minor: 0.5 });
    G.needle(c, 400, 300, ang(d.rpm / 1000), { len: 230 });
  },
});
```
It appears in the picker automatically (grouped by `era`).

**Add a game command:** a handler in `beamDashVeh.lua` (`actions.<name>`) or `beamDash.lua` (`geActions.<name>`), then send `{type:'<name>'}` to `/api/cmd`.

---

## 11. Testing

- **Demo mode** covers every page and every design without the game.
- A **fake-game UDP script** (sends `veh` / `world` packets and a chunked 6 000-node map, then listens on 4446) verified the demo → live hand-off, chunk reassembly and command forwarding.
- First live test on native Linux: ETK 800 on ks_nord, 179 electrics values, road network received.

---

## 12. Known limitations

- Cruise control and adaptive cruise don't work in-game (a fix is planned for the next release).
- Several command APIs (§7) are still to be confirmed in-game.
- No trip computer, info pages, Deck or macros yet (added in 0.02).
- Speed limits depend on the level's navigation data. No authentication (see §9).
