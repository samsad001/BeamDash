#!/usr/bin/env bash
# Installs the BeamDash bridge mod into BeamNG.drive on Linux.
# Works with the native Linux build and with Steam Proton. Run on the machine that runs the game:
#   bash install-mod.sh
# or point it at the mods folder yourself:
#   bash install-mod.sh /path/to/BeamNG.drive/current/mods
set -e
here="$(cd "$(dirname "$0")" && pwd)"
zip="$here/BeamDash-mod.zip"

# rebuild the zip from source when the zip tool is available, otherwise use the bundled one
if command -v zip >/dev/null 2>&1; then
  rm -f "$zip"
  (cd "$here/beamng-mod/BeamDash" && zip -qr "$zip" lua scripts)
  echo "Built $zip"
fi
[ -f "$zip" ] || { echo "BeamDash-mod.zip is missing and 'zip' is not installed (sudo apt install zip)."; exit 1; }

mods="$1"
if [ -z "$mods" ]; then
  # BeamNG user folders: native Linux build, then Steam Proton prefixes (default and Flatpak Steam)
  for base in \
    "$HOME/.local/share/BeamNG/BeamNG.drive" \
    "$HOME/.local/share/BeamNG.drive" \
    "$HOME/.steam/steam/steamapps/compatdata/284160/pfx/drive_c/users/steamuser/AppData/Local/BeamNG/BeamNG.drive" \
    "$HOME/.local/share/Steam/steamapps/compatdata/284160/pfx/drive_c/users/steamuser/AppData/Local/BeamNG/BeamNG.drive" \
    "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/compatdata/284160/pfx/drive_c/users/steamuser/AppData/Local/BeamNG/BeamNG.drive" \
    "$HOME/.steam/steam/steamapps/compatdata/284160/pfx/drive_c/users/steamuser/AppData/Local/BeamNG.drive"; do
    if [ -d "$base/current" ]; then mods="$base/current/mods"; break; fi
    if [ -d "$base" ]; then
      latest="$(ls -1d "$base"/[0-9]* 2>/dev/null | sort -V | tail -n 1)"
      if [ -n "$latest" ]; then mods="$latest/mods"; break; fi
    fi
  done
fi

if [ -z "$mods" ]; then
  echo "Could not find your BeamNG user folder."
  echo "In BeamNG: Options > Other > 'Open user folder', then run:"
  echo "  bash install-mod.sh \"<that folder>/mods\""
  exit 1
fi

mkdir -p "$mods"
cp -f "$zip" "$mods/BeamDash-mod.zip"
echo "Installed to $mods/BeamDash-mod.zip"
echo "Start (or restart) BeamNG.drive and check BeamDash is enabled in the Mod Manager."
