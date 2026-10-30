# BeamDash technical write-up (alpha 0.04-2)

What changed technically in 0.04: three new server modules (`perf.js`, `fun.js`, `recorder.js`), power / battery / damage data and "watched" streaming in the mod, per-vehicle routing in the server and client, 6 new info pages, portrait rendering, an alerts module, and HUD / OBS / Records / Connect pages. See §14 for the algorithms. The rest of this document is updated throughout.

This document explains how BeamDash is built: the moving parts, the wire protocols, the algorithms behind the assists and the trip computer, and how to extend it. For installation and everyday use, see `MOD_DOCUMENTATION.md` and the README.

---

## 1. Goals and constraints

- **Every car, no per-car work.** Data comes from standard BeamNG systems (electrics, powertrain, wheels, navigation graph), never from vehicle-specific code.
- **Runs on what you already have.** The server is plain Node.js (18+) with **zero npm dependencies**. Copy the folder and run it. The web app is static HTML/JS/Canvas with no build step.
- **Many screens, one truth.** Phones, tablets, a second monitor and a button deck all show the same state. Anything that must agree (trip counters, ADAS settings, Deck layout) lives on the server.
- **Low game overhead.** The mod only reads values the game already computes, and only the player's car streams.
- **Usable without the game.** A built-in demo car exercises every screen, which is also how the UI is developed and tested.

---

## 2. Architecture

```
┌──────────────────── BeamNG.drive ────────────────────┐
│  Vehicle Lua VM (player car)    Game-engine Lua VM    │
│  beamDashVeh.lua                beamDash.lua          │
│   · electrics, wheels,           · all vehicles, GPS  │
│     powertrain, cruise           · road network       │
│   · runs car commands            · car info, tuning   │
│                                  · ADAS logic         │
│        │ UDP 4445                   │ UDP 4445 ▲ 4446 │
└────────┼────────────────────────────┼──────────┼──────┘
         ▼                            ▼          │
┌──────────────────── BeamDash server (Node) ──────────┐
│ server.js   UDP in/out, chunk reassembly, cache, HTTP │
│ trips.js    trip computer + eco    actions.js  macros │
│ perf.js     launch/brake + laps    fun.js  dyno/drift │
│             timers                   crash/achievements│
│ recorder.js CSV drive recorder     media.js playerctl │
│ demo.js     demo car (hybrid)                         │
│ data/  settings trips perf fun deck .json, recordings/ │
└──────────┬──────────────────────────────▲─────────────┘
           │ Server-Sent Events           │ HTTP POST / GET
           ▼ (/api/stream)                │ (/api/cmd, /api/action/…)
   Cluster · Telemetry · Map · Records · Garage · Deck · HUD/OBS · Macros · Connect
   Stream Deck · KDE shortcuts · curl · Companion       (macros)
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
| `veh` | vehicle | 30 Hz | `e` (~60 whitelisted electrics, incl. cruise state, plus `bd_engPower`, `bd_engTorque`, `bd_motorPower` (− = regen), `bd_motorTorque`, `bd_hasEngine`, `bd_hasMotor`, `bd_battery`, `bd_batteryKwh`, `bd_batteryCapKwh`), `g` [gx, gy, gz] m/s², `pos`, `vel`, `dir` (vec3), every 2nd packet `wheels[]` |
| `dmg` | vehicle | 2 Hz | `total`, `flags{group.name}`, `broken[]` (drivetrain devices), `wheels[]` {name, flat, broken}, `deform{group: 0..1}`, `engine{stalled, disabled}` |
| `electrics` | vehicle | 4 Hz | `e`: every scalar in `electrics.values` |
| `pt` | vehicle | 4 Hz | `pt{name → device scalars + rpmOut}`, `energy{tank → scalars}`, `damage` |
| `spec` | vehicle | 5 s | `engine{maxRPM, idleRPM, revLimiterRPM, maxPower, maxTorque, …}`, `gearbox{type, ratios}`, `controllers[]`, `driveMode`, `mass` |
| `info` | GE | on spawn / switch | `model` (Brand, Name, Years…), `config` (Configuration, Power, Torque, Weight, Drivetrain…), `jbeam` |
| `vars` | GE | on spawn / switch | `vars{$name → {title, category, min, max, step, unit, default}}`, `values{$name → value}` |
| `world` | GE | 10 Hz | `vehicles[]` {id, me, x, y, z, hx, hy, spd, dmg}, `route{pts[], len}`, `adas`, `adasState`, `speedLimit`, `tod`, `paused`, `level`, `watched` (vehicle id being spectated) |
| `map` | GE | level load / request | `nodes[[x, y, z, radius]]`, `edges[[a, b, drivability, oneWay, speedLimit]]` |
| `cmdResult` | either | per command | `id`, `type`, `ok`, `err` |
| `hello` | GE | on load | `listenPort` |

Notes:
- **Numbers** are rounded to 3 decimals (vehicle) or 1–3 (GE), and NaN/±inf are dropped before `jsonEncode`. This keeps a `veh` packet around 2–4 kB.
- **Scalar extraction** (`scalars()`) copies only number/boolean/short-string fields of a table. That's how wheels, powertrain devices and tanks are sent *generically*: whatever fields the game has, the telemetry page shows.
- **Large messages** (the road network can be several hundred kB) are split into chunks: `BDC|<msgId>|<i>|<n>|<payload slice>`, 48 kB each, 2 per frame. The server reassembles by id, ignores duplicates, and expires partial messages after 30 s. Its receive buffer is raised to 16 MB because Windows' default dropped bursts in testing.

### Server → game (UDP 4446)
Plain JSON commands: `{ "type": "...", ...args, "id": n }`. GE handles world-level commands itself (`hello`, `getInfo`, `getMap`, `setVars`, `navTo`, `navClear`, `adas`, `accOn`, `accSet`, `accOff`, `timeOfDay`, `pause`, `reset`, `watch`). Everything else is forwarded to the vehicle VM's action table.

**Watching (spectating):** `watch {vid}` makes GE call `beamDashVeh.setWatched(true)` in that vehicle (and `false` in the previous one). `isActive()` in the vehicle VM is `watched or firstPlayerSeated`, so the watched car streams exactly like the player's. Its packets carry its own `vid`. The server compares it with `world.myId`: other cars' packets are forwarded to browsers but never touch the caches, trips, timers or recorder. Browsers show the car named by `world.watched`, else `world.myId`, and reset their live state when that target changes.

The server re-sends `hello {needInfo, needMap}` every 3 s, which:
1. lets a server on another machine be discovered: GE switches its `serverHost` to the sender's IP and tells the vehicle VM;
2. re-requests car info / map if the server restarted.

When the game reappears after more than 10 s of silence, the server pushes the saved ADAS settings back to it.

---

## 4. Server

`server/server.js` is one HTTP server plus two UDP sockets.

### Cache and fan-out
The latest `info`, `vars`, `spec`, `world`, `pt` and merged `electrics` are cached. A new browser receives the cache immediately on connect, then live events. The road network is cached as the raw JSON string and served from `GET /api/map`; clients are only told its version (`mapver`) over SSE, so the stream stays small.

Live `veh` packets are forwarded to browsers **as the raw string they arrived as**, so no re-serialization happens at 30 Hz × N clients.

### HTTP API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/stream` | GET | SSE stream. Events: `status`, `veh`, `electrics`, `pt`, `dmg`, `spec`, `info`, `vars`, `world`, `mapver`, `media`, `trips` (1 Hz), `perf` (5 Hz: launch + lap timer), `fun` (2 Hz: drift, dyno, crashes, achievements), `toast`, `ui`, `deck`, `cmdResult` |
| `/api/info` | GET | version, port, hostname, LAN addresses (Connect page / QR codes) |
| `/api/recordings` | GET | recorder state + list of CSV files |
| `/api/recordings/<file>` | GET / DELETE | download (attachment) or delete one recording (plain file names only) |
| `/api/cmd` | POST | raw command JSON → game (or demo) |
| `/api/action/<id>` | GET / POST | named action (macros). Query: `step`, `unit`, `state=up` |
| `/api/actions` | GET | list of all actions (id, label, group, hold) |
| `/api/deck` | GET / PUT | Deck layout |
| `/api/map` | GET | road network JSON |
| `/api/media/art` | GET | album art of the current track (only that one file) |
| `/api/state` | GET | snapshot of everything (debugging) |
| anything else | GET | static files from `public/` (path-traversal checked) |

### Actions (`actions.js`)
One table defines ~50 actions. Each resolves to one of: a game command, a UI event (broadcast to every cluster as `ui`), a media command, or a trip reset. Stateful actions are resolved on the server from the cached state: `cruise-toggle` picks on/off, `parking-brake` flips the current value, `acc-gap` cycles 1→4, ADAS toggles invert the game's current setting. So one URL works as a toggle from a Stream Deck with no client state. `cruise-plus/minus` convert `step` + `unit` (km/h or mph) to m/s on the server.

Hold actions (horn) take `?state=up` for release.

### Trip computer (`trips.js`)
Fed by every `veh` packet (30 Hz). Four independent accumulators: `a`, `b`, `start`, `econ`.

```
dt        = wall-clock time since last packet (ignored if > 2 s: pause / reconnect)
dist     += speed · dt
moving   += dt  when speed > 0.5 m/s        (drive time)
running  += dt  when engine running         (engine time)
fuel     += Δ  where Δ = fuelVolume(prev) − fuelVolume(now), only if 0 < Δ < 0.05 L
              (refuels and car swaps make fuel jump up or drop a lot; those are ignored)
maxSpeed  = max(maxSpeed, speed)

avgSpeed  = dist / moving                    (like a real trip computer: excludes standstill)
avgCons   = fuel / dist · 100 000  L/100km   (shown once dist > 100 m)
```

`start` resets automatically when a different vehicle spawns. Real counters are saved to `data/trips.json` every 10 s if changed. The demo car uses a separate, throw-away set.

### Media (`media.js`)
Polls `playerctl metadata --format …` once a second (status, player, artist, title, album, artUrl, length, position), separated by the unit-separator character so titles with tabs or pipes can't break parsing. `playerctl` reads MPRIS over the user's D-Bus session, so the server must run as the desktop user (hence the systemd **user** unit). If `playerctl` is missing, the feature turns off and re-checks every minute. Album art: `https://` URLs (e.g. Spotify) go straight to the browser; `file://` URLs are served by `/api/media/art`, which only serves the art file of the track playing right now.

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
| `client.js` (`BD`) | SSE connection, state store, **normalization**, units, settings (localStorage), commands / actions, key bindings, formatting |
| `gauges.js` (`G`) | canvas primitives: dial (ticks, labels, red zone), needles (shadow, cap), arc bars, segment bars, 7-segment digits, ~25 tell-tale icons drawn as paths, G-meter, top-down car, speed-limit signs, ADAS lane view, glass reflection |
| `mapview.js` | road-network renderer + spatial grid |
| `mfd.js` | the multi-function display: pages, OK / hold logic, line mode, pop-ups |
| `designs.js` | the cluster designs (a registry of `{id, draw, opts, mfd}`) |
| `cluster.js` | render loop, smoothing, needle sweep, landscape / portrait layout, design picker, customization, swipes and steering-wheel buttons, warning banners |
| `alerts.js` | Web Audio chimes, speed / limit / fuel / shift alerts, night dimming, spoken navigation (Web Speech API) |
| `hud.js` | windscreen HUD (optionally mirrored) and the transparent OBS overlay |
| `records.js` | performance, laps, drift, dyno chart, eco, recorder, achievements, crashes |
| `telemetry.js`, `map.js`, `garage.js`, `deck.js`, `macros.js`, `assist.js` | the other pages |

### Normalization
`BD.data()` turns raw electrics into one stable object that all designs use: speed (m/s), rpm, tach max (redline × 1.06 rounded up to 1000), red-zone start, gear string (`P/R/N/D3/1…` from the string or number forms the game uses), fuel, range (from measured consumption), temperatures, boost, every light as a boolean, cruise / ADAS / route / lead car, and G-forces. Designs never read raw electrics, so one fix applies to all 20.

### Rendering
- Each design draws into a fixed **1600 × 600 virtual canvas**. The page scales it to the screen (letterboxed, HiDPI-aware, up to 2.5× device pixel ratio), so every design works on a phone, an iPad or a 4K monitor without layout code.
- `requestAnimationFrame` at 60 fps (or 30 in battery-saver mode). Data arrives at 30 Hz, so values are smoothed per frame with `v += (target − v)·(1 − e^(−dt·rate))`, with a rate per signal (rpm fast, temperatures slow). That gives needle inertia without lag.
- A start-up needle sweep (rpm and speed to max and back, smoothstep, 1.6 s) runs when a car spawns or the design changes, as on many real cars.
- Static-looking parts (faces, ticks) are redrawn every frame. It keeps designs simple and fully dynamic (colours, units and redline can change live). Caching faces to an offscreen canvas is the obvious optimization if a slow device ever needs it.

### Multi-function display
`MFD` holds the current page (persisted per device) and draws it into any rectangle with a theme (`bg, fg, dim, accent, font, line`), so the same 16 pages fit a tall TFT, a small centre screen, or a pop-up. Each design declares where its screen is:

```js
mfd: (opts, data) => ({ x, y, w, h, theme }) // draw the pages here
mfd: () => ({ line: true })                   // single-line LCD mode (the design calls MFD.line())
// no mfd → pages appear as a 5 s pop-up when you flip, like a classic trip computer
```

Page layout uses a unit `u = min(w/11, h/6.4)`, so text scales with the slot. Input sources (on-screen buttons, swipes, keys, Deck, macro URLs) all end in the same `ui(action)` function. OK is short-press; hold (700 ms) is reset.

### Map renderer
Road edges are bucketed into a **250 m spatial grid** when the map loads. Each frame only the cells around the view are visited, edges are grouped by class (dirt / minor / major) and by width, and each group is one canvas path. That's a handful of `stroke()` calls even on large levels. Projection: translate → rotate (heading-up = `heading − π/2`) → scale with Y flipped (BeamNG is Z-up, Y-north). The own car uses the 30 Hz vehicle position for smoothness; other cars come from the 10 Hz world list.

**Turn-by-turn:** walk the route polyline; at each point, compare the heading 25 m before and after; the first point beyond 15 m with |Δheading| > 40° is the next manoeuvre (> 110° = sharp). The sign gives left/right (counter-clockwise = left).

### 3-D surround view
Other vehicles are converted to the car's frame (`lon = rel·fwd`, `lat = rel·right`) and projected with a pinhole camera 12 m behind and 6 m above the car. `x = cx + fx·lat/z`, `y = horizon + fy·h_cam/z`, `z = lon + 12`. Cars are drawn back-to-front as a shadow, a rear face and a roof. The lead car takes the ACC / FCW colour; blind-spot cars turn amber.

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

ACC is a proportional gap controller on top of the game's own cruise control (which does the throttle/brake), so it inherits each car's cruise behaviour.

---

## 7. BeamNG APIs used

| API | Purpose | Status |
|---|---|---|
| LuaSocket UDP (`socket.udp`, `sendto`, `receivefrom`, non-blocking) | transport | ✅ confirmed (native Linux) |
| `electrics.values`, `sensors.gx2/gy2/gz2`, `obj:getPosition/Velocity/DirectionVector` | live data | ✅ confirmed |
| `wheels.wheelRotators`, `powertrain.getDevices/getDevicesByType`, `energyStorage.getStorages` | tires, drivetrain, tanks | ✅ confirmed |
| `playerInfo.firstPlayerSeated` | stream only the player's car | ✅ confirmed |
| `map.objects`, `map.getMap()`, `map.findClosestRoad` | world, roads, limits | ✅ confirmed (road network received) |
| `core_vehicles.getCurrentVehicleDetails`, `core_vehicle_manager.getPlayerVehicleData` | car info, tuning variables | ✅ confirmed |
| `extensions.cruiseControl` (`setSpeed`, `changeSpeed`, `holdCurrentSpeed`, `setEnabled`, `getConfiguration`) | cruise / ACC | ⚠ patched to the extension API after the controller lookup failed in-game; to be confirmed |
| `combustionEngine` / `electricMotor` device `outputTorque1`, `outputAV1`; storage `energyType == 'electricEnergy'`, `remainingRatio`, `storedEnergy` | power, regen, battery (0.04) | to be confirmed in-game |
| `damageTracker` data, `beamstate.deformGroupDamage`, device `isBroken`, wheel `isBroken` / `isTireDeflated` | damage page (0.04) | to be confirmed in-game; every part is optional |
| vehicle `queueLuaCommand('beamDashVeh.setWatched(true)')` on a non-player vehicle | watching (0.04) | to be confirmed in-game |
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
| `data/settings.json` (server) | ADAS settings (shared, restored when the game reconnects) |
| `data/trips.json` (server) | trip counters |
| `data/deck.json` (server) | Deck layout (pushed live to every Deck as `deck`) |
| `data/perf.json` (server) | launch / braking last & best, lap lines + best lap (with its distance→time profile) + history, per level |
| `data/fun.json` (server) | dyno curves per car (max 60 cars), drift best, crash log (20), achievements, lifetime / night distance |
| `data/recordings/*.csv` (server) | drive recordings |
| browser localStorage | per-screen choices: design, design colours, units, brightness, key bindings, current page, map theme |
| `settings/beamDash.json` (BeamNG user folder) | mod network settings |

Per-screen choices stay local on purpose: the iPad can run the E30 cluster while the phone runs the Deck.

---

## 9. Security model

- Designed for a **trusted home network**. There is no authentication: anyone who can reach port 8080 can view telemetry and send car / media commands.
- The server only reads files under `public/` (normalized path check), and the album-art endpoint only serves the single path currently reported by the media player.
- Request bodies are capped at 1 MB. Commands are JSON data, never evaluated as code on the server. In the game, payloads reach Lua only through `jsonDecode` and a fixed action table. The generic `controller` action can call a named function on a vehicle controller, but not arbitrary Lua.
- Don't port-forward 8080 / 4445 / 4446. For remote use, put it behind a VPN (e.g. WireGuard / Tailscale).

---

## 10. Performance notes

- Vehicle VM: one table walk of ~60 keys at 30 Hz, a full electrics walk at 4 Hz, one `jsonEncode` per packet. Negligible next to physics.
- GE: world list and ADAS at 10 Hz over `map.objects` (O(vehicles)).
- Network (estimate, not measured): a `veh` packet is ~2–4 kB at 30 Hz, so on the order of 100 kB/s game → server, and about the same to each browser over SSE. Comfortable for home Wi-Fi with several screens.
- Browser: one canvas per page. Frame cost hasn't been profiled on phones yet; the 30 fps mode in Customize halves the work if a device struggles.

---

## 11. Extending

**Add a cluster design** (`public/js/designs.js`):
```js
reg({
  id: 'myDash', name: "My Dash '99", era: '1990s', region: 'Euro', inspired: 'my idea',
  opts: [{ k: 'accent', label: 'Accent', type: 'color', def: '#ff8800' }],
  mfd: (o) => ({ x: 600, y: 100, w: 400, h: 400, theme: { accent: o.accent } }), // optional screen
  draw(c, d, k) {
    // 1600x600 canvas; d = normalized data; k.o = options; k.t = seconds
    const ang = G.dial(c, { x: 400, y: 300, r: 250, max: d.tachMax / 1000, major: 1, minor: 0.5 });
    G.needle(c, 400, 300, ang(d.rpm / 1000), { len: 230 });
  },
});
```
It appears in the picker automatically (grouped by `era`) with a live thumbnail.

**Add an action:** one line in `server/actions.js`. It shows up on the Macros page and in the Deck editor. A new game command needs a handler in `beamDashVeh.lua` (`actions.<name>`) or `beamDash.lua` (`geActions.<name>`).

**Add an MFD page:** add `{ id, name }` to `PAGES` and a renderer `R.<id>` (plus a `line()` case) in `mfd.js`.

**Link to a specific look** (for OBS or a kiosk tablet): `/?design=<id>&page=<page>&clean=1`.

---

## 12. Testing

- **Demo mode** covers every page, every design and every action without the game. In 0.04 the demo car is a mild hybrid (motor assist, regen, a 1.6 kWh battery), carries a little damage, can be watched (traffic car streams), and stops fully on the parking brake, so the launch timer, lap timer, dyno, eco score, energy pages and recorder can all be exercised. Checked with it: 0-60 mph 2.81 s / 0-100 3.29 s / ⅛ mile 7.24 s from a standstill, a timed lap, 26 dyno bins, a 10 Hz CSV, watching car #1101 and back.
- A **fake-game UDP script** (sends `veh` / `world` packets and a chunked 6 000-node map, then listens on 4446) verified the demo → live hand-off, chunk reassembly and command forwarding.
- Lua files are checked for block balance; the game itself is the final check (watch the `~` console for `beamDash` lines).
- Stock images are captured from the demo server with headless Chrome over the DevTools protocol (the live SSE stream keeps pages "busy", so simple `--screenshot` never finishes).

---

## 13. Known limitations

- Several command APIs (§7) are still to be confirmed in-game. Cruise control was just switched to the extension API.
- Tire *surface* temperature only appears if the BeamNG version exposes it; brake temperatures and pressures are always there.
- Speed limits depend on the level's navigation data.
- Range and consumption are estimates from fuel-volume changes; they settle after a few hundred metres.
- No authentication (see §9).
- (0.04) Power, battery, damage and watching use game fields that haven't been confirmed in-game yet (§7). The UI degrades gracefully when they're missing.
- (0.04) Lap sectors are thirds of the best lap's *distance*, not fixed track points, so the first lap has no sectors.
- (0.04) Drift angle uses the body heading vs. the velocity vector, so very slow manoeuvres (< 5 m/s) are ignored on purpose.

---

## 14. alpha 0.04 algorithms

All of these run on the server from the 30 Hz `veh` stream of *your* car (never a watched car). `dt` is wall-clock time between packets; gaps over 1–2 s (pause, reconnect) reset the state instead of being integrated.

### Launch timer (`perf.js`)
```
armed      : speed < 0.3 m/s for > 0.5 s                      → state READY
start      : first packet with v ≥ 0.3 m/s; t0 interpolated to the 0.3 m/s crossing
distance  += (v_prev + v) / 2 · dt                             (trapezoid rule)
split time = linear interpolation of the crossing between two packets
             (0-60 mph = 26.82 m/s, 0-100 = 27.78, 0-200 = 55.56; ⅛ mile 201.17 m, ¼ mile 402.34 m with trap speed)
100-200    = t200 − t100
end        : throttle < 30 % for 0.7 s, or v_max − v > 4 m/s, or braking, or 60 s
best       = per split, lowest time (¼/⅛ compare the time, keep the trap speed)
```
**Braking:** a tracker starts when speed crosses down through 100 km/h (and separately 60 mph) with the brake > 30 %. It integrates distance until v < 0.3 m/s (result) or is dropped if the brake is released (< 5 %) for more than 0.5 s.

### Lap timer (`perf.js`)
- **Line:** a segment (x1, y1)–(x2, y2). From *my car* it's 30 m across the car's heading. From the map it's across the nearest road edge, half-width max(10 m, 1.8 × road radius).
- **Crossing:** the car's path segment between two packets intersects the line (both orientation tests change sign). The line also stores the crossing *direction* (sign of the cross product), so driving through backwards doesn't count. Set at the car, the direction is taken from the car's heading; set on the map, it's learned from the first crossing.
- **Lap:** time between crossings, only if > 150 m was driven (filters jitter on the line). Sector times are taken when the lap distance passes ⅓ and ⅔ of the *best lap's* distance.
- **Gap to best:** each lap records elapsed time every 10 m (a profile). Gap = elapsed now − best profile[distance / 10]. That's the same idea as a real delta bar, sampled by distance rather than track position.
- Stored per level: line, best lap (time, sectors, distance, profile), last 30 laps.

### Drift meter (`fun.js`)
```
angle  = wrap(atan2(vel) − atan2(heading)) in degrees, ignored above 120° (reversing) or below 5 m/s
active : |angle| > 12° and v > 8 m/s
score += |angle| · v · dt · (1 + min(time_in_drift, 10) / 5)     (long drifts multiply up to ×3)
ends   : 1.2 s below the threshold → last = score, best = max
```

### Virtual dyno (`fun.js`)
At throttle > 85 % the engine's (or, on EVs, the motor's) power = τ·ω and torque are binned by 250 rpm, keeping the maximum per bin, per car (key = jbeam + configuration). It's a "best observed" curve, so it fills in as you drive through the rev range and isn't averaged.

### Crash detector (`fun.js`)
Trigger: horizontal acceleration √(gx² + gy²) > 4 g while moving. Over the next second it tracks peak g; the impact speed is the maximum speed in the 1.5 s before; damage added = damage now − damage before. Logged (last 20) and announced; > 6 g unlocks *Crash test dummy*.

### Eco score (`trips.js`)
Every driving second accumulates a penalty: (a − 2)·0.35 for acceleration above 2 m/s², (−a − 3)·0.35 for braking harder than 3 m/s², +0.6 above 80 % of the redline. Score = 100 · e^(−2 · penalty / drivingSeconds), so smooth driving stays in the 90s and a few hard launches pull it down gradually. EV / hybrid energy: kWh += motorKW · dt / 3600 (positive = used, negative = regen).

### Achievements (`fun.js`)
15 rules over the running state: distances (1 km, 100 km, 10 km at night by the in-game clock), speeds (161 / 322 km/h), cornering (≥ 1.5 g lateral), airtime (|gz| < 2 m/s² for 1 s while moving), timer results (0-100 < 5 s / < 3 s, ¼ mile < 12 s), a completed lap, drift scores, a 6 g crash, eco ≥ 90 over 10 km. Unlock time is saved, and a toast and chime go to every screen.

### Portrait layout (`cluster.js`)
If height > 1.15 × width, the 1600-unit virtual canvas is scaled to the screen width (instead of letterboxed). The cluster occupies the top 600 units, and the remaining height (≈ 2 840 units on 1080×1920) holds two `MFD` panels: the current page and a pinned page (`MFD.drawPage` renders any page without changing the current one). Classic designs don't show pop-ups in portrait, since the pages are always visible.

### Alerts (`alerts.js`)
Edge-triggered, with cooldowns so nothing nags: speed warning every 8 s while above, over-limit every 10 s (limit rounded to 5, plus tolerance), low fuel once per drop below 10 % (re-arms above 15 %), shift beep with hysteresis (re-arms below 90 % of the shift rpm). Chimes are synthesized with Web Audio oscillators (no audio files). Night dimming: × 0.62 between 21:00 and 05:00 game time, × 0.8 at dusk / dawn.

**Spoken navigation:** for each upcoming manoeuvre (keyed by its distance along the route) it speaks once at 800 m, 300 m and 60 m, using `speechSynthesis`, in metric or imperial units. On iOS speech needs one tap on the page first.

### Drive recorder (`recorder.js`)
A write stream to `data/recordings/drive-<date>-<car>.csv`, throttled to one row per 100 ms. Columns: time, speed, rpm, gear, pedals, steering, g lat/long/vert, x/y/z, fuel % / L, coolant, oil, boost, engine kW, motor kW, battery %, odometer. Download / delete only accept plain `[\w.-]+\.csv` names inside that folder.
