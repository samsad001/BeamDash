# BeamDash changelog

Each release lists the changes to the **mod** (the Lua files inside BeamNG) and to the **server** (the Node.js program) separately. If the mod changed, reinstall it.

---

## alpha 0.04 (2026-10-30)

The biggest update yet.

**Mod: changed. Reinstall it.**

### New cluster designs (15, now 35 in total)
| | US | Euro | Asian |
|---|---|---|---|
| 1 | **Pony S650 '24**: Mustang-style digital, with a retro **Fox-body '87** theme | **Neue Klasse '26**: BMW Panoramic iDrive-style strip across the windscreen base | **Tokyo VFD '86**: 80s JDM stair-step digital tach |
| 2 | **Mid-Engine '20**: Corvette C8-style wide curved tach | **Bavaria M Track '24**: BMW M track view with converging shift lights and lap strip | **Synergy '16**: Prius-style hybrid display (CHG / ECO / PWR, EV mode, READY) |
| 3 | **Volt Ridge EV '24**: electric pickup, power / regen meter | **Maranello '05**: yellow centre tach, F430 era | **Rotary '92**: RX-7 FD-style centre tach and 3-gauge stack |
| 4 | **Super Sport '69**: ribbon speedometer, woodgrain | **Zuffen EV '20**: Taycan-style EV power meter | **Godzilla '09**: R35 GT-R-style tach with multi-function meter |
| 5 | **Lux Digital '21**: Cadillac / Lincoln-style luxury digital | **Sindelfingen '89**: Mercedes W124-style three-dial | **Seoul EV '22**: Ioniq 5 / EV6-style, dark or light theme |

New **1960s** era in the design picker.

### EV and hybrid support
- The mod now reports engine and electric-motor **power (kW) and torque**, **regeneration**, and the **traction battery** (%, kWh).
- Cars are detected as **combustion, hybrid or electric** automatically (Garage shows which).
- New **Energy flow** info page: engine / motor / battery / wheels with animated power flow, and a CHG–ECO–PWR meter.
- Trip computer tracks **kWh used, kWh regenerated and kWh/100 km**.
- 5 designs with EV / hybrid power meters (Volt Ridge, Zuffen, Seoul, Synergy, Lux).

### Performance and track
- **Performance timer**: stop, then launch. 0–60 mph, 0–100 km/h, 0–200 km/h, 100–200 km/h, ⅛ and ¼ mile (with trap speed), 100–0 km/h and 60–0 mph braking distance. Last and best results, saved. The run ends when you lift off, brake or slow down.
- **Lap timer**: set a start/finish line at your car or by tapping a road on the map. Lap and 3 sector times, a live **gap-to-best bar**, best lap and history per level.
- **Drift meter**: drift angle, live score (angle × speed × time, bonus for long drifts), last and best.
- **Virtual dyno**: power and torque curves recorded at full throttle, per car.
- **Crash detector**: impacts over 4 g are logged with speed, peak g and damage added.
- **Achievements**: 15 to unlock (first km, the ton, 0-100 under 5 s, ¼ mile under 12 s, drift king, airtime, crash test dummy, eco hero, night owl…).

### New pages
- **Records**: performance, laps, drift, dyno chart, eco scores, drive recordings, achievements, crash log.
- **HUD**: big minimal speed / gear / limit / nav / lap gap, optionally **mirrored** for a windscreen reflection, 4 colours.
- **OBS overlay** (`/hud?obs=1`): transparent 1920×1080 stream overlay with speed, gear, revs, pedals, G, plus lap / drift / launch chips.
- **Connect**: QR codes for every address of the server, choose which page the code opens.

### Cluster
- **Portrait screens** (e.g. a 1080×1920 side monitor): cluster on top, two large info pages below (the flip-through page plus one you pin).
- 6 new info pages: Energy flow, Performance timer, Lap timer, Drift meter, Virtual dyno, Damage (16 in total). Pages can be switched off in Customize.
- **Chimes & alerts**: speed warning at a speed you choose, over-the-speed-limit alert (with tolerance), low fuel / battery chime, shift beep, crash and achievement sounds, big on-screen warning banners.
- **Automatic night dimming** from the in-game clock.
- **Spoken navigation**: "In 300 metres, turn left…" (miles/feet in mph mode). Toggle in Customize, from the Deck, or with a macro.
- **Eco score** (0–100) on the economy page.

### Watching other cars
- 👁 **Watch** any car (AI traffic, a parked car) from Map & Nav, the Deck or a macro: its live data streams to every screen. "Back to my car" returns.

### Damage
- New **Damage** info page and Telemetry card: total damage, damage-tracker flags (engine, radiator, etc.), broken drivetrain parts, flat or broken wheels, deformed parts, plus a car outline with damaged areas.

### Recording
- **Drive recorder**: 10 samples per second to CSV (speed, rpm, gear, pedals, steering, G, position, fuel, temps, boost, engine / motor kW, battery, odometer). Start / stop from Records, the Deck or a macro; download or delete from Records.

### Macros & Deck
- New actions: set / remove lap line, reset laps / performance / drift / dyno, start/stop recording, watch next car, back to my car, voice navigation on/off.
- New default Deck page **Track & tools**.

### Fixes
- Cruise control uses BeamNG's `cruiseControl` vehicle extension (with controller fallback) and reports the real set speed (introduced in 0.03).
- Pop-ups are opaque (gauge glow no longer shows through).
- Trip computer table columns line up.
- Demo car comes to a full stop with the parking brake (needed for the launch timer).

### Mod changes (re-install the mod!)
- `beamDashVeh.lua`
  - New live fields at 30 Hz:
    - `bd_engTorque` and `bd_engPower` (kW).
    - `bd_motorTorque` and `bd_motorPower` (kW, negative = regeneration).
    - `bd_hasEngine` and `bd_hasMotor`.
    - `bd_battery` (%), `bd_batteryKwh` and `bd_batteryCapKwh`, read from the electric energy storage.
  - New `dmg` message at 2 Hz:
    - total damage and the damage-tracker flags;
    - broken drivetrain devices, and flat or broken wheels;
    - deformed parts, and whether the engine is stalled or disabled.
  - Engine spec reports `hybrid` (engine and motor both present).
  - A car can be **watched**: it then streams like the player's car (`setWatched`).
  - Keeps the 0.03 cruise-control fix.
- `beamDash.lua`: new `watch` command (start / stop streaming another vehicle); the world message includes `watched`.

### Server changes
- **New `version.js`:** the version ("alpha 0.04"), shown in the app's top bar and in `/api/state`.
- **New `perf.js`, performance and lap timer:**
  - Launch runs (0-60 mph, 0-100, 0-200, 100-200 km/h, ⅛ / ¼ mile with trap speed).
  - Braking runs (100-0 km/h, 60-0 mph).
  - A lap line per level, with crossing detection, 3 sectors, gap to best and lap history.
  - Saved in `data/perf.json`.
- **New `fun.js`:** virtual dyno (per car), drift scoring, crash detection (over 4 g), airtime, distance and night-driving totals, and 15 achievements. Saved in `data/fun.json`.
- **New `recorder.js`:** 10 Hz CSV drive recordings in `data/recordings/` (filenames are checked, so no path tricks).
- `trips.js`: eco score (0–100), kWh used, kWh regenerated and kWh/100 km.
- `actions.js`:
  - New server-side actions: set / clear lap line, reset laps / performance / drift / dyno, start / stop recording, watch next car, back to my car.
  - New UI actions: voice navigation on / off, cluster hold.
- `server.js`
  - A watched car's data goes to every screen but never counts toward your trips, records or recordings.
  - Damage is cached for new screens.
  - Live events `perf` (5 Hz), `fun` (2 Hz) and `toast` (achievements, crashes).
  - New endpoints `/api/info`, `/api/recordings`, and `/api/recordings/<file>` (download or delete).
  - Status includes version, recording and watched car.
- `demo.js`: the demo car is now a mild hybrid with a battery and regeneration. It also sends damage, can be watched, and stops fully with the parking brake.

### Known issue (fixed in alpha 0.04-2)
18 lines of `public/js/designs.js` that alpha 0.02 and 0.03 have were accidentally left out of this build:
- On **Bavaria M '98** (E46 style), the check-control line shows the time and economy instead of the info page you flipped to.
- The **Custom Builder** has no *Pages* centre option.

Both are fixed in alpha 0.04-2.

---

## alpha 0.03 (2026-10-30)
**Mod changed** (cruise-control fix).

- **Mod:**
  - `beamDashVeh.lua` uses the `cruiseControl` vehicle extension (with controller fallback).
  - It reports the real cruise state and set speed, remembers the last set speed for *resume*, and adds a new `cruiseSetSpeed()`.
  - `beamDash.lua` drives ACC through it.
- **Server:** no changes.
- **Web app:**
  - `/?design=&page=&clean=1` links.
  - Opaque pop-ups.
  - An aligned trip table.
- **New:** `docs/` (mod description, documentation, technical write-up) and `media/` (stock images and screenshots).

## alpha 0.02 (2026-10-30)
**Mod: no changes.**

- **Server:**
  - New `actions.js`: about 50 actions with URLs, `/api/action/<id>` and `/api/actions`.
  - New `trips.js`: Trip A / B / Since start / Economy, saved in `data/trips.json`.
  - New `media.js`: now playing via playerctl, plus `/api/media/art`.
  - `/api/deck` (saved in `data/deck.json`).
  - SSE events `trips`, `media`, `ui` and `deck`.
  - ADAS settings saved in `data/settings.json` and restored when the game reconnects.
  - systemd **user** unit.
- **Web app:**
  - 10 info pages with ◀ OK ▶ (hold to reset).
  - 4 new designs (20 total).
  - Needle shadows, caps and glass.
  - Deck page and Macros page.
- **Known issue:** cruise control does nothing in-game (fixed in 0.03).

## alpha 0.01 (2026-10-30, first build)


- **Mod:**
  - Vehicle-side streaming: electrics 30 Hz, all electrics and powertrain 4 Hz, wheels 15 Hz, spec 5 s.
  - Car commands.
  - Game side: world 10 Hz, chunked road network, car info / tuning, ADAS (lead car, FCW, AEB, ACC, BSM, speed limits), navigation, time of day, pause, hello discovery.
- **Server:**
  - UDP 4445 in / 4446 out, OutGauge fallback on 4444, chunk reassembly, state cache.
  - `/api/stream`, `/api/cmd`, `/api/map`, `/api/state`.
  - Demo car.
- **Web app:** 16 designs, Telemetry, Map & Nav, Garage, Drive Assist panel, installable as an app.
- **Known issue:** cruise control does nothing in-game (fixed in 0.03).
