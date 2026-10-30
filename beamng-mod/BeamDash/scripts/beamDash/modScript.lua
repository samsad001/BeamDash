-- loads the BeamDash bridge whenever the mod is active
extensions.load("beamDash")
if setExtensionUnloadMode then
  setExtensionUnloadMode("beamDash", "manual")
elseif extensions.setExtensionUnloadMode then
  extensions.setExtensionUnloadMode("beamDash", "manual")
end
