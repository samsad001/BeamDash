# BeamDash alpha 0.02: mod page description

Ready-to-paste text for the BeamNG.drive repository / forum. There's a plain version and a BBCode version (the forum uses BBCode).

**Images to upload** (in `media/`): `banner.png` as the main image, then `designs.png` and a few from `media/screenshots/`.

---

## Title

**BeamDash: Live Gauge Clusters, Telemetry & Car Control on Your Phone (alpha 0.02)**

## Short description (one line)

Turn any phone, tablet or second screen into a working instrument cluster for every car: 20 designs from the 1970s to 2026, live telemetry, map & GPS, cruise / ADAS, trip computer and Stream Deck buttons.

## Full description (plain text)

BeamDash streams live data from BeamNG.drive to a web app you open on your phone, iPad, tablet or a second monitor. It works with every vehicle, stock or modded. Spawn a car and its details load automatically.

**Gauge clusters**
- 20 cluster designs across the eras: 1970s muscle, 80s German and US digital, 90s JDM and M-car, 2000s electroluminescent, 2010s TFT, and 2026-style curved and panoramic displays.
- Euro, US and Japanese styles, plus a race display and a Custom Builder.
- Every design is customizable: colours, needles, units (km/h or mph, °C or °F, psi/bar/kPa), redline and shift-light overrides.
- Modern designs show your surroundings in 3-D: the lead car, blind-spot traffic and lanes.

**Works like a real car's cluster**
- Flip through info pages with on-screen ◀ OK ▶ buttons, swipes, keys or macros: trip computer, fuel economy, now playing, navigation, driver assist, digital speed, tires, G-force, engine, vehicle and service.
- Trip A, Trip B, Since start and a resettable fuel economy: distance, drive time, average and max speed, consumption, fuel used. Hold OK to reset, just like the real thing.
- Every warning light: turn signals, beams, fog, parking brake, ABS, ESC/TCS, check engine, oil, battery, low fuel, temperature, tire pressure and cruise.

**All the live data**
- A telemetry page with tire and brake temperatures, tire pressures, slip and load per wheel, engine and drivetrain, G-force, live charts.
- Plus a searchable table of every value the game's UI apps can read (~200 values).

**Map & navigation**
- The level's real road network with every vehicle on it, and your in-game GPS route.
- Tap the map to set a destination; the route appears in the game too.

**Drive assist (ADAS)**
- Cruise control, adaptive cruise with 4 following distances, forward collision warning, optional automatic emergency braking, blind-spot monitor and speed-limit sign recognition.
- Also from the app: ESC mode, drive modes, lights and signals.

**Garage**
- Car specs (power, torque, weight, drivetrain…), the car's tuning sliders, repair, refuel, engine start/stop, time of day, pause.

**Stream Deck & macros**
- A built-in button pad for a second phone.
- Every function has a URL for Elgato Stream Deck, StreamController, Companion, Touch Portal or KDE / desktop keyboard shortcuts (they work while the game has focus).

**Now playing**
- Shows what your PC is playing (Spotify, browser, VLC…) with album art and controls (Linux with playerctl).

**Requirements**
- BeamNG.drive 0.32 or newer (tested on native Linux).
- Node.js 18+ on the PC that runs the companion server (usually the same PC as the game). It's a small, dependency-free web server included in the download.
- Phone, tablet or PC with a modern browser on the same network.

**Installation (short)**
1. Put `BeamDash-mod.zip` in your BeamNG `mods` folder (or run the included install script).
2. Run `start-server` (`.bat` on Windows, `.sh` on Linux) from the BeamDash folder.
3. Open the address it prints (e.g. `http://192.168.1.20:8080`) on your phone and spawn a car.

Full guide: `docs/MOD_DOCUMENTATION.md` in the download.

**Notes**
- Alpha: cruise control doesn't respond in-game in this build. A fix is planned for the next release.
- Cluster designs are original artwork *inspired by* the look of real cars of each era. BeamDash is not affiliated with or endorsed by any car maker.
- The app only works on your local network. Don't expose its port to the internet.
- No mod? The cluster also runs in basic mode from BeamNG's built-in OutGauge output.

## Full description (BBCode for the forum)

```bbcode
[SIZE=6][B]BeamDash[/B] alpha 0.02 - Live Gauge Clusters, Telemetry & Car Control on Your Phone[/SIZE]

Turn any [B]phone, tablet or second screen[/B] into a working instrument cluster for [B]every car[/B] in BeamNG.drive. Spawn a car and its details load automatically.

[SIZE=5][B]Gauge clusters[/B][/SIZE]
[LIST]
[*][B]20 designs[/B] from the [B]1970s to 2026[/B]: muscle-car chrome, 80s German & US digital, 90s JDM / M-car, electroluminescent, TFT, curved and panoramic displays
[*]Euro, US and Japanese styles, plus a race display and a [B]Custom Builder[/B]
[*]Customize colours, needles, units, redline and shift lights
[*]3-D surround view with lead car, blind-spot traffic and lanes
[/LIST]

[SIZE=5][B]Works like a real car[/B][/SIZE]
[LIST]
[*]Flip through info pages with [B]◀ OK ▶[/B], swipes, keys or macros
[*][B]Trip A / Trip B / Since start[/B] + resettable [B]fuel economy[/B] - hold OK to reset
[*]All warning lights: signals, beams, ABS, ESC/TCS, check engine, oil, battery, fuel, temperature, TPMS, cruise
[/LIST]

[SIZE=5][B]Live data, map & assists[/B][/SIZE]
[LIST]
[*]Tire & brake temps, pressures, slip and load per wheel, engine, G-force, charts + every UI-app value (~200)
[*]Live [B]road map[/B] with all vehicles and your GPS route - [B]tap to navigate[/B]
[*][B]Cruise control, adaptive cruise[/B], collision warning, emergency braking, blind spot, speed-limit signs
[*]Garage: specs, tuning sliders, repair, refuel, engine, time of day
[/LIST]

[SIZE=5][B]Stream Deck & macros[/B][/SIZE]
Built-in button pad for a second phone, and a URL for every function - works with Stream Deck, StreamController, Companion, Touch Portal and desktop keyboard shortcuts.

[SIZE=5][B]Requirements[/B][/SIZE]
[LIST]
[*]BeamNG.drive 0.32+
[*]Node.js 18+ on the PC running the included server (no other installs)
[*]A browser on the same network
[/LIST]

[SIZE=5][B]Install[/B][/SIZE]
[LIST=1]
[*]Put [I]BeamDash-mod.zip[/I] in your BeamNG [I]mods[/I] folder
[*]Run [I]start-server[/I] from the BeamDash folder
[*]Open the printed address on your phone and spawn a car
[/LIST]

[I]Designs are original artwork inspired by real cars of each era; BeamDash is not affiliated with any car maker. Keep the app on your home network.[/I]
```
