# Packs the BeamDash bridge mod and copies it into your BeamNG.drive mods folder.
# Run on the PC that has BeamNG (right-click > Run with PowerShell).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here 'beamng-mod\BeamDash'
$zip = Join-Path $here 'BeamDash-mod.zip'

if (Test-Path $zip) { Remove-Item $zip -Force }
# build the zip by hand so entries use forward slashes (Compress-Archive on Windows PowerShell writes backslashes)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, 'Create')
Get-ChildItem $src -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel)
}
$archive.Dispose()
Write-Host "Built $zip"

# BeamNG user folder: 0.32+ uses ...\BeamNG\BeamNG.drive\current, older versions ...\BeamNG.drive\<version>
$candidates = @()
$new = Join-Path $env:LOCALAPPDATA 'BeamNG\BeamNG.drive\current'
if (Test-Path $new) { $candidates += $new }
$old = Join-Path $env:LOCALAPPDATA 'BeamNG.drive'
if (Test-Path $old) {
  $candidates += Get-ChildItem $old -Directory | Where-Object { $_.Name -match '^\d+\.\d+' } | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}

if (-not $candidates) {
  Write-Host "Could not find your BeamNG user folder."
  Write-Host "Open BeamNG > Options > Other > 'Open user folder', then copy BeamDash-mod.zip into its 'mods' folder."
  Read-Host 'Press Enter to close'
  exit 1
}

$mods = Join-Path $candidates[0] 'mods'
New-Item -ItemType Directory -Force -Path $mods | Out-Null
Copy-Item $zip (Join-Path $mods 'BeamDash-mod.zip') -Force
Write-Host "Installed to $mods\BeamDash-mod.zip"
Write-Host 'Start (or restart) BeamNG.drive and make sure the mod is enabled in the Mod Manager.'
Read-Host 'Press Enter to close'
