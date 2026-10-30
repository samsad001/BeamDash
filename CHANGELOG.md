# BeamDash changelog

Each release lists the changes to the **mod** (the Lua files inside BeamNG) and to the **server** (the Node.js program) separately. If the mod changed, reinstall it.

---

## alpha 0.03 (2026-10-30)

**Mod: changed. Reinstall it** (`BeamDash-mod.zip`, or copy the two `lua/…` files over an unpacked install, then restart BeamNG).

### Mod
- `beamDashVeh.lua`
  - **Cruise control fixed.** It now uses BeamNG's `cruiseControl` vehicle *extension* (loading it if needed), and only falls back to a `cruiseControl` controller. In 0.01 and 0.02 the mod only looked for the controller, which cars don't have, so every cruise button did nothing.
  - Cruise state (on/off and set speed) is read from the extension's `getConfiguration` and sent as `cruiseControlActive` / `cruiseControlTarget`, so the cluster shows the real set speed.
  - *Resume* re-applies the last set speed (the extension can forget it when switched off).
  - New `cruiseSetSpeed()` function the game-side extension calls.
  - Clear error ("this car has no cruise control") when a car really has none.
- `beamDash.lua`: adaptive cruise and *set speed* now go through `beamDashVeh.cruiseSetSpeed` instead of the controller.

### Server
- No changes.

### Web app
- Link straight to a look: `/?design=<id>&page=<page>&clean=1` (`clean` hides all controls, for screenshots, OBS or a kiosk tablet).
- Pop-up info pages have a solid background, so gauge glow no longer shows through.
- Trip computer table on Telemetry: number columns line up.

### Docs and images (new)
- `docs/MOD_DESCRIPTION.md` (repository / forum text, plain and BBCode), `docs/MOD_DOCUMENTATION.md` (install, network, data, commands, assists, troubleshooting, FAQ), `docs/TECHNICAL.md` (architecture, protocol, algorithms, APIs).
- `media/`: banner, designs collage, `promo.html` source and screenshots of every design and page.

---

## alpha 0.02 (2026-10-30)

**Mod: no changes** (same Lua as 0.01, so no reinstall needed).

### Server
- **New `actions.js`:** about 50 named actions, each with its own URL `/api/action/<id>` for Stream Deck, Companion, Touch Portal, curl or keyboard shortcuts. `/api/actions` lists them.
  - Toggles (cruise, parking brake, ADAS settings, following distance 1→4) are worked out on the server from the current state, so one URL works as a toggle.
  - Hold actions (horn) take `?state=up` to release. Cruise ± takes `step` and `unit` (km/h or mph).
- **New `trips.js`, trip computer:** Trip A, Trip B, Since start and a resettable Economy counter (distance, drive time, engine time, average and max speed, fuel used, L/100 km). Saved to `data/trips.json` every 10 s. *Since start* resets when you spawn a different car. The demo car uses its own throw-away counters.
- **New `media.js`, now playing:** reads `playerctl` once a second (title, artist, album, art, position) and sends play / pause / next / previous. `/api/media/art` serves only the current track's album art.
- `server.js`
  - New endpoints `/api/action/<id>`, `/api/actions`, `/api/deck` (GET / PUT, saved in `data/deck.json`) and `/api/media/art`.
  - New live events: `trips`, `media`, `ui` (flip pages on every screen) and `deck`.
  - ADAS settings are saved in `data/settings.json` and sent back to the game when it reconnects.
- `beamdash.service` is now a systemd **user** unit, so the server can reach the desktop's media player.

### Web app
- **Info pages (multi-function display)**, flipped with ◀ OK ▶, swipes, keys, the Deck or macros: Trip, Economy, Now playing, Navigation, Driver assist, Digital speed, Tires, G-force, Engine, Vehicle & service. Hold OK to reset a trip.
  - Shown on each design's own screen, in the check-control line on the E46-style design, or as a pop-up on classic designs.
- **4 new designs (20 total):** Bavaria Black Panel '12, Stuttgart Five-Dial '19, Neo Skyline '99, Heartland Pickup '19.
- Nicer gauges: needle shadows and caps, glass reflections, per-design page colours, and more polish on the existing designs.
- **Deck page** (`/deck`): a button pad for a second phone, with editable pages.
- **Macros page** (`/macros`): every action's URL, ready to copy, plus keyboard bindings.
- Telemetry shows the trip computer.


### Known issues
- Cruise control does nothing in-game (fixed in 0.03).

---

## alpha 0.01 (2026-10-30, first build)

### Mod (new)
- `beamDashVeh.lua` (inside every car; only the car you drive streams)
  - Electrics at 30 Hz (speed, rpm, gear, pedals, temperatures, boost, fuel, lights, assists, odometer), G-forces, position, velocity, heading.
  - Every electrics value at 4 Hz, wheels at 15 Hz, powertrain devices and fuel / battery tanks at 4 Hz, engine / gearbox spec every 5 s.
  - Car commands: lights, signals, hazard, horn, fog, cruise, ESC, drive modes, engine start / off, gears, parking brake, repair, refuel.
- `beamDash.lua` (game side)
  - World message at 10 Hz: all vehicles, GPS route, ADAS state, speed limit, time of day, pause.
  - Road network of the level, sent in 48 kB chunks. Car info and tuning variables on spawn.
  - Driver assists: lead car, forward collision warning, emergency braking, adaptive cruise, blind spot, speed-limit signs.
  - Navigation, applying tuning, time of day, pause.
  - "Hello" discovery so the server can run on another PC. Optional `settings/beamDash.json`.
- `modScript.lua` loads the game-side extension.

### Server (new)
- `server.js`
  - Receives the mod's data on UDP 4445 and sends commands on 4446. OutGauge fallback on 4444.
  - Reassembles chunked messages (16 MB receive buffer, because Windows dropped bursts).
  - Keeps the latest state for new browsers, and serves the live stream (`/api/stream`), commands (`/api/cmd`), the map (`/api/map`), a debug snapshot (`/api/state`) and the web app.
  - Options `--port`, `--game-host`, `--telemetry-port`, `--game-cmd-port`, `--outgauge-port`, `--demo`.
- `demo.js`: a demo car on a 3.6 km circuit with 3 traffic cars, used until the game connects.

### Web app (new)
- **Cluster** with 16 designs, 1970s to 2026 (US, Euro, Japanese, race and Custom Builder). Each is customizable (colours, units, redline, shift light, brightness, 30/60 fps). Start-up needle sweep, warning lights, 3-D surround view, Drive Assist panel.
- **Telemetry**, **Map & Nav** (tap to navigate) and **Garage** (specs, tuning sliders, repair, refuel, time of day).
- Installable as an app (PWA) on iPhone, iPad, Android and desktop.

### Scripts
- `start-server.bat` / `.sh`, `install-mod.ps1` / `.sh` (finds native, Proton or Flatpak installs) and `beamdash.service` (system unit), plus the README.

### Known issues
- Cruise control (and adaptive cruise) does nothing in-game (fixed in 0.03).
- The mod only runs if `lua/` and `scripts/` sit directly in the mod folder. This was found in the first live test, when the whole project folder had been put in `mods`.
