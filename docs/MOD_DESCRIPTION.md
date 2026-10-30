# BeamDash alpha 0.04: mod page description

Ready-to-paste text for the BeamNG.drive repository / forum: a plain version and a BBCode version (the forum uses BBCode).

**Images to upload** (in `media/`): `banner.png` as the main image, then `designs.png` and a few from `media/screenshots/`.

---

## Title

**BeamDash: Live Gauge Clusters, Telemetry, Lap Timing & Car Control on Your Phone (alpha 0.04)**

## Short description (one line)

Turn any phone, tablet or second screen into a working instrument cluster for every car: 35 designs from the 1960s to 2026, EV & hybrid displays, live telemetry, lap and 0-100 timers, drift score, virtual dyno, map & GPS, cruise / ADAS, HUD & OBS overlay, and Stream Deck buttons.

## Full description (plain text)

BeamDash streams live data from BeamNG.drive to a web app you open on your phone, iPad, tablet or a second monitor. It works with every vehicle, stock or modded, combustion, hybrid or electric. Spawn a car and its details load automatically.

**35 gauge clusters**
- From a 1969 ribbon speedometer to a 2026 panoramic windscreen strip.
- US, Euro and Japanese / Korean styles, EV and hybrid displays, a race display and a Custom Builder.
- Every design is customizable: colours, needles, units (km/h or mph, °C or °F, psi/bar/kPa), redline, shift light.
- Phone, tablet, monitor, or a **portrait side screen** (cluster on top, big info pages below).

**Works like a real car**
- Flip through 16 info pages with ◀ OK ▶, swipes, keys or macros: trip computer, economy & eco score, energy flow, now playing, navigation, driver assist, digital speed, performance timer, lap timer, drift meter, virtual dyno, tires, damage, G-force, engine, and vehicle & service.
- Trip A / B / Since start and a resettable fuel economy. Hold OK to reset, just like the real thing.
- Chimes: indicator tick, speed warning at a speed you set, over-the-limit alert, low fuel, shift beep, collision warning.
- Automatic night dimming from the in-game clock, and **spoken turn-by-turn navigation**.

**Performance & track**
- 0–60 mph, 0–100 / 100–200 km/h, ⅛ & ¼ mile with trap speed, braking distance, with best results saved.
- Lap timer with a start/finish line you place on the map, 3 sectors and a live gap-to-best bar.
- Drift angle and score, a virtual dyno that draws your car's power and torque curves, a crash detector, and 15 achievements.

**EV & hybrid**
- Motor power and regeneration, battery %, kWh used and recovered.
- A power-flow display (engine / motor / battery / wheels) and EV / hybrid cluster designs.

**All the live data**
- Tire & brake temperatures, pressures, slip and load per wheel, engine and drivetrain, damage (broken parts, flat tires), G-force and live charts.
- Plus every value the game's UI apps can read.
- Drive recorder: 10 Hz CSV logs for Excel / Google Sheets.
- **Watch any other car's** live data (AI traffic, friends' parked cars…).

**Map & navigation**
- The level's real road network with every vehicle and your GPS route.
- Tap to navigate (the route appears in the game too), or tap to place a lap line.

**Drive assist (ADAS)**
- Cruise control, adaptive cruise with 4 following distances, forward collision warning, optional automatic emergency braking, blind-spot monitor, speed-limit signs.
- Also ESC mode, drive modes, lights and signals.

**HUD & streaming**
- A mirrored windscreen HUD, and a transparent **OBS overlay** with speed, gear, revs, pedals, G, lap and drift.

**Stream Deck & macros**
- A built-in button pad for a second phone (3 pages by default).
- Every function has a URL for Elgato Stream Deck, StreamController, Companion, Touch Portal or desktop keyboard shortcuts.
- QR codes connect a phone in one scan.

**Now playing**
- What your PC is playing, with album art and controls (Linux with playerctl).

**Requirements**
- BeamNG.drive 0.32 or newer (developed against native Linux).
- Node.js 18+ on the PC that runs the included companion server (usually the same PC as the game). No other installs.
- A phone, tablet or PC with a modern browser on the same network.

**Installation (short)**
1. Put `BeamDash-mod.zip` in your BeamNG `mods` folder (or run the included install script). Don't unzip the whole download into `mods`.
2. Run `start-server` (`.sh` on Linux, `.bat` on Windows) from the BeamDash folder.
3. Open the address it prints (or scan the QR code on its Connect page) on your phone, and spawn a car.

Full guide: `docs/MOD_DOCUMENTATION.md` in the download.

**Notes**
- This is an **alpha**. Some game functions (damage details, tuning, navigation, drive modes) depend on the game version and the car; when one isn't available, the app says so instead of failing.
- Cluster designs are original artwork *inspired by* the look of real cars of each era. BeamDash is not affiliated with or endorsed by any car maker.
- The app only works on your local network. Don't expose its port to the internet.

## Full description (BBCode for the forum)

```bbcode
[SIZE=6][B]BeamDash[/B] alpha 0.04 - Live Gauge Clusters, Telemetry, Lap Timing & Car Control on Your Phone[/SIZE]

Turn any [B]phone, tablet or second screen[/B] into a working instrument cluster for [B]every car[/B] - combustion, hybrid or electric.

[SIZE=5][B]35 gauge clusters (1960s → 2026)[/B][/SIZE]
[LIST]
[*]US, Euro, Japanese & Korean styles, EV and hybrid displays, race display, Custom Builder
[*]Ribbon speedos, VFD digital, electroluminescent, TFT, curved & panoramic displays
[*]Customize colours, needles, units, redline, shift light - phone, tablet, monitor or [B]portrait side screen[/B]
[/LIST]

[SIZE=5][B]Works like a real car[/B][/SIZE]
[LIST]
[*]16 info pages with [B]◀ OK ▶[/B]: trip computer, eco score, energy flow, now playing, nav, assist, performance, lap timer, drift, dyno, tires, damage…
[*]Trip A / B / Since start + resettable economy - hold OK to reset
[*]Chimes: speed warning, over-limit alert, low fuel, shift beep - night dimming - [B]spoken navigation[/B]
[/LIST]

[SIZE=5][B]Performance & track[/B][/SIZE]
[LIST]
[*]0-60 / 0-100 / 100-200, ⅛ & ¼ mile with trap speed, braking distance - best results saved
[*][B]Lap timer[/B] with sectors and live gap-to-best, start/finish placed on the map
[*][B]Drift score[/B], [B]virtual dyno[/B] curves, crash detector, 15 achievements
[/LIST]

[SIZE=5][B]EV & hybrid · live data · map · ADAS[/B][/SIZE]
[LIST]
[*]Motor power & regen, battery, kWh used/recovered, power-flow display
[*]Tires & brakes, damage, every UI-app value, 10 Hz CSV drive recorder, [B]watch any other car[/B]
[*]Live road map, tap to navigate - cruise, adaptive cruise, collision warning, AEB, blind spot, speed limits
[/LIST]

[SIZE=5][B]HUD, streaming & Stream Deck[/B][/SIZE]
Mirrored windscreen HUD, transparent [B]OBS overlay[/B], a built-in button pad for a second phone, and a URL for every function (Stream Deck, StreamController, Companion, Touch Portal, keyboard shortcuts). Connect a phone with a QR code.

[SIZE=5][B]Requirements & install[/B][/SIZE]
[LIST=1]
[*]BeamNG.drive 0.32+ and Node.js 18+ (included server, no other installs)
[*]Put [I]BeamDash-mod.zip[/I] in your BeamNG [I]mods[/I] folder
[*]Run [I]start-server[/I], scan the QR code / open the address on your phone, spawn a car
[/LIST]

[I]Alpha: some features depend on the game version and car. Designs are original artwork inspired by real cars of each era; BeamDash is not affiliated with any car maker. Keep the app on your home network.[/I]
```
