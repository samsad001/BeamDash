# BeamDash mod documentation (alpha 0.02)

> What changed in each release: [`CHANGELOG.md`](../CHANGELOG.md).

BeamDash has two parts:

1. **The BeamNG mod** (`BeamDash-mod.zip`): a small Lua bridge that runs inside the game. It reads live data from your car and the world, sends it out over your local network, and carries out commands (cruise, lights, tuning, navigation…).
2. **The BeamDash server** (`server/`, Node.js): receives that data and serves the web app (cluster, telemetry, map, garage, deck, macros) to your phones, tablets and PCs.

You need both. The mod does nothing on its own, and the server only shows a demo car without the mod.

---

## 1. Installing the mod

### Automatic
- **Linux (native or Steam Proton):** `bash install-mod.sh` in the BeamDash folder.
- **Windows:** right-click `install-mod.ps1` → *Run with PowerShell*.

The scripts find your BeamNG user folder and copy `BeamDash-mod.zip` into `mods/`.

### Manual
Copy `BeamDash-mod.zip` into your BeamNG user folder's `mods` folder. In BeamNG: Options → Other → *Open user folder*.

| System | Usual mods folder |
|---|---|
| Windows | `%LOCALAPPDATA%\BeamNG\BeamNG.drive\current\mods` |
| Linux native | `~/.local/share/BeamNG/BeamNG.drive/current/mods` |
| Linux Proton | `~/.steam/steam/steamapps/compatdata/284160/pfx/drive_c/users/steamuser/AppData/Local/BeamNG/BeamNG.drive/current/mods` |

### Unpacked install
You can also unpack it to `mods/unpacked/<any name>/`. The folder must contain `lua/` and `scripts/` **directly**:

```
mods/unpacked/beamdash_bridge/
├── lua/
│   ├── ge/extensions/beamDash.lua
│   └── vehicle/extensions/auto/beamDashVeh.lua
└── scripts/beamDash/modScript.lua
```

> ⚠ Don't zip or unpack the whole BeamDash project folder into `mods`. If `scripts/` ends up one or more folders deeper, BeamNG lists the mod as active but never runs it.

### Check that it's running
- The mod creates `settings/beamDash.json` in your BeamNG user folder the first time it starts.
- The BeamNG console (`~`) shows `BeamDash bridge loaded -> <host>:<port>`.
- The web app's status dot turns green: **BeamNG live**.

### Updating / uninstalling
- **Update:** replace the zip (or the unpacked folder) and restart BeamNG.
- **Uninstall:** delete it from `mods`, or deactivate it in the Mod Manager. Optionally delete `settings/beamDash.json`.

---

## 2. Network setup

| Port | Protocol | Direction | Purpose |
|---|---|---|---|
| 4445 | UDP | game → server | live telemetry from the mod |
| 4446 | UDP | server → game | commands to the mod |
| 4444 | UDP | game → server | optional: stock OutGauge fallback |
| 8080 | TCP | browser → server | the web app |

**Same PC (recommended):** start the server with no options. Only TCP 8080 needs to be open in the firewall, for your phones.

**Server on another PC / VM:** start it with `--game-host <game PC IP>`. It then keeps saying "hello" to the game on UDP 4446. The mod sends everything back to whoever said hello, so nothing has to be typed into the game. Open UDP 4446 on the game PC, and TCP 8080 plus UDP 4445 on the server.

### `settings/beamDash.json` (optional)
Created by the mod with defaults. Edit it with the game closed.

```json
{ "serverHost": "127.0.0.1", "serverPort": 4445, "listenPort": 4446 }
```

| Key | Meaning |
|---|---|
| `serverHost` | where telemetry goes until a server says hello |
| `serverPort` | the server's telemetry port |
| `listenPort` | the port the mod listens on for commands |

### Server options
`start-server.sh` / `.bat` pass these through. Each also works as an environment variable, e.g. `BEAMDASH_PORT=9000`.

| Option | Default | Meaning |
|---|---|---|
| `--port` | 8080 | web app port |
| `--game-host` | auto | IP of the game PC when it isn't this PC |
| `--telemetry-port` | 4445 | UDP port for the mod's data |
| `--game-cmd-port` | 4446 | UDP port the mod listens on |
| `--outgauge-port` | 4444 | UDP port for OutGauge |
| `--demo` | auto | `auto` = demo car when no game data, `on`, `off` |

---

## 3. What the mod sends

All data is sent only to the BeamDash server you run. Nothing goes to the internet.

| Data | Rate | Source in the game |
|---|---|---|
| Speed, rpm, gear, pedals, steering, temperatures, boost, fuel, lights, assists, cruise, odometer | 30 Hz | vehicle electrics |
| G-forces, position, velocity, heading | 30 Hz | vehicle sensors / object |
| Wheels: speed, slip, side slip, load, brake temps & torque, pressure, deflated / broken | 15 Hz | wheel rotators |
| Every electrics value (~200) | 4 Hz | `electrics.values` |
| Powertrain devices (engine, gearbox, diffs, turbo…) and fuel / battery tanks | 4 Hz | powertrain, energy storage |
| Engine & gearbox spec (max / idle rpm, power & torque peaks, gear ratios), controllers, drive mode | every 5 s | powertrain |
| Car model & configuration info, tuning variables | on spawn / switch | vehicle manager |
| All vehicles' positions, GPS route, ADAS state, speed limit, time of day, pause | 10 Hz | game engine |
| Road network of the level | on level load / on request | navigation graph |

Only the car you're driving streams vehicle data. Traffic and parked cars stay quiet.

---

## 4. What the mod can do (commands)

Sent from the web app, the Deck, or a macro URL.

| Area | Commands |
|---|---|
| Lights & signals | lights off / low / high, high beam, fog, left / right signal, hazard, horn (hold) |
| Cruise | on / set (hold current speed), set speed, ± step, resume, off |
| Adaptive cruise | on (at current speed), set speed, following distance 1–4, off |
| Assist settings | collision warning (on/off, Late / Normal / Early), emergency braking, blind spot, speed-limit signs |
| Stability | ESC mode toggle, next drive mode |
| Car | start engine, engine off, parking brake, shift up / down, repair (reset in place), refuel / recharge |
| Tuning | apply the car's tuning variables (the car respawns, like the in-game Tuning menu) |
| Navigation | set a GPS destination (snapped to the nearest road), clear route |
| World | time of day, pause / resume |

If a car lacks a feature (e.g. no drive modes), the command fails safely and the app shows a short message.

> **Known issue in this build:** cruise control (and so adaptive cruise) does nothing in-game. The mod looks for a `cruiseControl` *controller*, but BeamNG provides cruise as a vehicle *extension*. A fix is planned for the next release. The mod is the same as in alpha 0.01.

---

## 5. Driver assists in detail

The assists run in the mod, using the positions of all vehicles in the world.

| Assist | How it works |
|---|---|
| **Lead vehicle** | Nearest car ahead in your lane (lateral offset < ~2 m, widening slightly with distance), up to 160 m, at a similar height |
| **Forward collision warning** | Time-to-collision = gap ÷ closing speed. *Caution* below 1.4 / 2.0 / 2.7 s (Late / Normal / Early), *Brake!* below 55 % of that. Only above ~10 km/h |
| **Emergency braking** (off by default) | Full brake below 0.9 s TTC; released when TTC > 1.6 s or you've stopped |
| **Adaptive cruise** | Holds the set speed; with a car ahead it targets `lead speed + 0.35 × (gap − desired gap)`, where desired gap = time gap (1.0 / 1.5 / 2.0 / 2.6 s) × your speed + 4 m. It drives the car's own cruise control |
| **Blind spot** | Cars 1.5–5.5 m to the side, from 13 m behind to 2.5 m ahead |
| **Speed-limit signs** | Speed limit of the nearest road segment in the level's navigation data (only on maps that have limits) |

These are game features. They act on the AI and player cars the game knows about, and they're tuned for fun, not realism.

---

## 6. Using it without the mod (OutGauge)

In BeamNG: Options → Other → **OutGauge**. Turn it on with IP = the server's IP (127.0.0.1 on the same PC) and port 4444. The cluster then works with basic data: speed, rpm, gear, pedals, temperatures, fuel, boost and a few lights. Tires, map, ADAS, trip fuel and all car control need the mod.

---

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Status stays **demo car** / **waiting for game** | Is the mod active in the Mod Manager? Does `settings/beamDash.json` exist? Any red `beamDash` lines in the console (`~`)? Is the mod folder layout right (see §1)? |
| Works on the PC but not on the phone | Same Wi-Fi? Use the IP address the server prints. Is TCP 8080 open in the firewall? Some routers block devices on different Wi-Fi networks (VLANs / guest networks) from reaching each other. |
| Server on another PC never connects | Started with `--game-host`? Is UDP 4446 open on the game PC and UDP 4445 on the server PC? |
| Cruise does nothing | Known issue in this build (see §4). A fix is planned for the next release. |
| Map is empty | Map & Nav → *Reload map*. Large levels take a few seconds. |
| "LuaSocket unavailable" in the console | That BeamNG build doesn't include the network library the mod needs; please report it. |

When asking for help, include the BeamNG version, your OS, and any console lines that mention `beamDash`.

---

## 8. FAQ

**Does it affect performance?** Barely. The vehicle side does simple table reads and sends a few kB at 30 Hz; the world side runs at 10 Hz.

**Multiplayer (BeamMP)?** Not tested. It reads the local player's vehicle, so it may work for your own car.

**Does it work with modded cars?** Yes. Everything comes from standard game systems (electrics, powertrain, wheels). Cars without some systems just show fewer values.

**Is it safe to leave running?** The server only listens on your local network and has no login. Don't forward its ports to the internet.
