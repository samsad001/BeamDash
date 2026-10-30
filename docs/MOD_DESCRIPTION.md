# BeamDash alpha 0.01: mod page description

Ready-to-paste text for the BeamNG.drive repository / forum: a plain version and a BBCode version (the forum uses BBCode).

**Images to upload** (in `media/`): `banner.png` as the main image, then `designs.png` and a few from `media/screenshots/`.

---

## Title

**BeamDash: Live Gauge Clusters, Telemetry & Car Control on Your Phone (alpha 0.01)**

## Short description (one line)

Turn any phone, tablet or second screen into a working instrument cluster for every car: 16 designs from the 1970s to 2026, live telemetry, map & GPS, cruise / ADAS and car tuning.

## Full description (plain text)

BeamDash streams live data from BeamNG.drive to a web app you open on your phone, iPad, tablet or a second monitor. It works with every vehicle, stock or modded. Spawn a car and its details load automatically.

**16 gauge clusters**
- 1970s muscle and BMW 2002-era, 80s BMW E30 and Corvette C4 digital, 90s M3 and WRX STI, 2000s electroluminescent, BMW E90 and Mustang, 2010s Corvette C7 and Audi Virtual Cockpit, and 2020s BMW Live Cockpit, BMW Curved Display and WRX.
- A race display and a Custom Builder.
- Every design is customizable: colours, needles, units (km/h or mph, °C or °F, psi/bar/kPa), redline and shift-light overrides, brightness, 30/60 fps.
- Start-up needle sweep, smooth needles, every warning light.
- Modern designs show your surroundings in 3-D: the lead car, blind-spot traffic and lanes.

**All the live data**
- A telemetry page with tire and brake temperatures, tire pressures, slip and load per wheel, engine and drivetrain, G-force and live charts.
- Plus a searchable table of every value the game's UI apps can read (~200 values).

**Map & navigation**
- The level's real road network with every vehicle on it, and your in-game GPS route.
- Tap the map to set a destination; the route appears in the game too.

**Drive assist (ADAS)**
- Cruise control, adaptive cruise with 4 following distances, forward collision warning, optional automatic emergency braking, blind-spot monitor and speed-limit sign recognition.
- Also from the app: ESC mode, drive modes, lights and signals.

**Garage**
- Car specs (power, torque, weight, drivetrain…), the car's tuning sliders, repair, refuel, engine start/stop, gears, time of day, pause.

**Install it like an app**
- Add to Home Screen on iPhone / iPad / Android, or install from Chrome / Edge on desktop.

**Requirements**
- BeamNG.drive 0.32 or newer (tested on native Linux).
- Node.js 18+ on the PC that runs the companion server (usually the same PC as the game). It's a small, dependency-free web server included in the download.
- Phone, tablet or PC with a modern browser on the same network.

**Installation (short)**
1. Put `BeamDash-mod.zip` in your BeamNG `mods` folder (or run the included install script). Don't unzip the whole download into `mods`.
2. Run `start-server` (`.bat` on Windows, `.sh` on Linux) from the BeamDash folder.
3. Open the address it prints (e.g. `http://192.168.1.20:8080`) on your phone and spawn a car.

Full guide: `docs/MOD_DOCUMENTATION.md` in the download.

**Notes**
- First alpha. Cruise control doesn't respond in-game in this build (a fix is planned for the next release).
- Cluster designs are original artwork *inspired by* the look of real cars of each era. BeamDash is not affiliated with or endorsed by any car maker.
- The app only works on your local network. Don't expose its port to the internet.
- No mod? The cluster also runs in basic mode from BeamNG's built-in OutGauge output.

## Full description (BBCode for the forum)

```bbcode
[SIZE=6][B]BeamDash[/B] alpha 0.01 - Live Gauge Clusters, Telemetry & Car Control on Your Phone[/SIZE]

Turn any [B]phone, tablet or second screen[/B] into a working instrument cluster for [B]every car[/B] in BeamNG.drive. Spawn a car and its details load automatically.

[SIZE=5][B]Gauge clusters[/B][/SIZE]
[LIST]
[*][B]16 designs[/B] from the [B]1970s to 2026[/B]: muscle-car chrome, 80s German & US digital, 90s JDM / M-car, electroluminescent, TFT, curved display
[*]Euro, US and Japanese styles, plus a race display and a [B]Custom Builder[/B]
[*]Customize colours, needles, units, redline and shift lights
[*]3-D surround view with lead car, blind-spot traffic and lanes
[/LIST]

[SIZE=5][B]Live data, map & assists[/B][/SIZE]
[LIST]
[*]Tire & brake temps, pressures, slip and load per wheel, engine, G-force, charts + every UI-app value (~200)
[*]Live [B]road map[/B] with all vehicles and your GPS route - [B]tap to navigate[/B]
[*][B]Cruise control, adaptive cruise[/B], collision warning, emergency braking, blind spot, speed-limit signs
[*]Garage: specs, tuning sliders, repair, refuel, engine, time of day
[/LIST]

[SIZE=5][B]Requirements & install[/B][/SIZE]
[LIST=1]
[*]BeamNG.drive 0.32+ and Node.js 18+ (included server, no other installs)
[*]Put [I]BeamDash-mod.zip[/I] in your BeamNG [I]mods[/I] folder
[*]Run [I]start-server[/I], open the printed address on your phone, spawn a car
[/LIST]

[I]Alpha 0.01. Designs are original artwork inspired by real cars of each era; BeamDash is not affiliated with any car maker. Keep the app on your home network.[/I]
```
