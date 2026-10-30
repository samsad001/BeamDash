# BeamDash changelog

Each release lists the changes to the **mod** (the Lua files inside BeamNG) and to the **server** (the Node.js program) separately. If the mod changed, reinstall it.

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
- Cruise control (and adaptive cruise) does nothing in-game (a fix is planned for the next release).
- The mod only runs if `lua/` and `scripts/` sit directly in the mod folder. This was found in the first live test, when the whole project folder had been put in `mods`.
