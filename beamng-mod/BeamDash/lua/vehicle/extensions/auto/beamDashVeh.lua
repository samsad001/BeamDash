-- BeamDash vehicle-side extension (runs inside every vehicle's Lua VM).
-- Streams live vehicle data (electrics, wheels, powertrain, sensors) to the
-- BeamDash server over UDP, and executes commands forwarded by the GE extension.

local M = {}

local host, port = "127.0.0.1", 4445
local udp = nil
local fastTimer, wheelTimer, fullTimer, ptTimer, specTimer = 0, 0, 0, 0, 0
local FAST, WHEEL, FULL, PT, SPEC = 1 / 30, 1 / 15, 1 / 4, 1 / 4, 5
local starterTimer = 0
local seq = 0

-- keys sent at the high rate; everything else in electrics goes in the 4 Hz full dump
local fastKeys = {
  "wheelspeed", "airspeed", "rpm", "rpmTacho", "gear", "gearIndex", "throttle", "brake", "clutch",
  "throttle_input", "brake_input", "clutch_input", "parkingbrake", "parkingbrake_input", "steering",
  "steering_input", "fuel", "watertemp", "oiltemp", "turboBoost", "engineLoad", "lowbeam", "highbeam",
  "fog", "signal_L", "signal_R", "signal_left_input", "signal_right_input", "hazard", "hazard_enabled",
  "lights", "abs", "absActive", "esc", "escActive", "tcs", "tcsActive", "checkengine", "oil", "lowfuel",
  "ignitionLevel", "engineRunning", "running", "cruiseControlActive", "cruiseControlTarget", "isShifting",
  "odometer", "trip", "horn", "reverse", "brakelights", "isYCBrakeActive", "isTCBrakeActive",
  "avgFuelConsumption", "fuelVolume", "fuelCapacity", "altitude", "lowpressure", "battery", "boostMax"
}

local function getSocket()
  local ok, s = pcall(require, "socket.socket")
  if ok and type(s) == "table" and s.udp then return s end
  ok, s = pcall(require, "socket")
  if ok and type(s) == "table" and s.udp then return s end
  return rawget(_G, "socket")
end

local function openSocket()
  if udp then pcall(function() udp:close() end) end
  udp = nil
  local s = getSocket()
  if s and s.udp then
    udp = s.udp()
    udp:settimeout(0)
  else
    log("E", "beamDash", "LuaSocket unavailable - telemetry disabled")
  end
end

local function num(v)
  if v ~= v or v == math.huge or v == -math.huge then return nil end
  return math.floor(v * 1000 + 0.5) / 1000
end

-- copy plain scalar fields (numbers/bools/short strings) of a table
local function scalars(t, out)
  out = out or {}
  if type(t) ~= "table" then return out end
  for k, v in pairs(t) do
    if type(k) == "string" then
      local tv = type(v)
      if tv == "number" then out[k] = num(v)
      elseif tv == "boolean" then out[k] = v
      elseif tv == "string" and #v < 64 then out[k] = v end
    end
  end
  return out
end

local function send(msg)
  if not udp then return end
  msg.vid = obj:getId()
  seq = seq + 1
  msg.seq = seq
  local ok, str = pcall(jsonEncode, msg)
  if ok and str then pcall(function() udp:sendto(str, host, port) end) end
end

local function isActive()
  return playerInfo and playerInfo.firstPlayerSeated
end

local function vecTbl(v)
  if not v then return nil end
  return { num(v.x), num(v.y), num(v.z) }
end

local function wheelData()
  local out = {}
  if not wheels or not wheels.wheelRotators then return out end
  for _, wd in pairs(wheels.wheelRotators) do
    local w = scalars(wd)
    w.name = wd.name
    -- tire pressure (Pa) when the wheel is a pressure wheel
    pcall(function()
      if wd.pressureGroup and v.data.pressureGroups and obj.getGroupPressure then
        local gid = v.data.pressureGroups[wd.pressureGroup]
        if gid then w.pressure = num(obj:getGroupPressure(gid)) end
      end
    end)
    table.insert(out, w)
  end
  return out
end

local function powertrainData()
  local out = {}
  if not powertrain or not powertrain.getDevices then return out end
  for name, dev in pairs(powertrain.getDevices()) do
    local d = scalars(dev)
    d.name = name
    d.type = dev.type
    if dev.outputAV1 then d.rpmOut = num(dev.outputAV1 * 9.5493) end
    if dev.thermals then scalars(dev.thermals, d) end
    out[name] = d
  end
  return out
end

local function energyData()
  local out = {}
  if not energyStorage or not energyStorage.getStorages then return out end
  for name, st in pairs(energyStorage.getStorages()) do
    local d = scalars(st)
    d.name = name
    out[name] = d
  end
  return out
end

local function controllerNames()
  local names = {}
  pcall(function()
    for _, c in pairs(controller.getAllControllers()) do
      table.insert(names, c.name or c.typeName or "?")
    end
  end)
  return names
end

local function sendSpec()
  local spec = { t = "spec", engine = {}, gearbox = {}, controllers = controllerNames() }
  pcall(function()
    local engines = powertrain.getDevicesByType("combustionEngine")
    local e = engines and engines[1]
    if not e then
      local motors = powertrain.getDevicesByType("electricMotor")
      e = motors and motors[1]
      spec.engine.electric = e ~= nil
    end
    if e then
      spec.engine.maxRPM = num(e.maxRPM or 0)
      spec.engine.idleRPM = num(e.idleRPM or 0)
      spec.engine.maxAvailableRPM = num(e.maxAvailableRPM or e.maxRPM or 0)
      spec.engine.revLimiterRPM = num(e.revLimiterRPM or e.maxRPM or 0)
      if e.getTorqueData then
        local td = e:getTorqueData()
        if td then
          spec.engine.maxPower = num(td.maxPower or 0)
          spec.engine.maxTorque = num(td.maxTorque or 0)
          spec.engine.maxPowerRPM = num(td.maxPowerRPM or 0)
          spec.engine.maxTorqueRPM = num(td.maxTorqueRPM or 0)
        end
      end
    end
  end)
  pcall(function()
    for _, gtype in ipairs({ "manualGearbox", "automaticGearbox", "dctGearbox", "cvtGearbox", "sequentialGearbox", "electricMotor" }) do
      local g = powertrain.getDevicesByType(gtype)
      if g and g[1] and g[1].gearRatios then
        spec.gearbox.type = gtype
        spec.gearbox.minGearIndex = g[1].minGearIndex
        spec.gearbox.maxGearIndex = g[1].maxGearIndex
        local ratios = {}
        for i = (g[1].minGearIndex or -1), (g[1].maxGearIndex or 6) do
          ratios[tostring(i)] = num(g[1].gearRatios[i] or 0)
        end
        spec.gearbox.ratios = ratios
        break
      end
    end
  end)
  pcall(function()
    local dm = controller.getController("driveModes")
    if dm and dm.getCurrentDriveModeKey then spec.driveMode = dm.getCurrentDriveModeKey() end
  end)
  spec.energy = energyData()
  pcall(function() spec.mass = num(obj.getMass and obj:getMass() or 0) end)
  pcall(function()
    if v.data.information then scalars(v.data.information, spec) end
  end)
  send(spec)
end

local function updateGFX(dt)
  if starterTimer > 0 then
    starterTimer = starterTimer - dt
    if starterTimer <= 0 then pcall(function() controller.mainController.setStarter(false) end) end
  end
  if not isActive() then return end
  local ev = electrics.values
  fastTimer = fastTimer + dt
  wheelTimer = wheelTimer + dt
  fullTimer = fullTimer + dt
  ptTimer = ptTimer + dt
  specTimer = specTimer + dt

  if fastTimer >= FAST then
    fastTimer = 0
    local e = {}
    for _, k in ipairs(fastKeys) do
      local val = ev[k]
      if type(val) == "number" then e[k] = num(val) elseif val ~= nil then e[k] = val end
    end
    local msg = { t = "veh", e = e }
    pcall(function()
      msg.g = { num(sensors.gx2 or sensors.gx or 0), num(sensors.gy2 or sensors.gy or 0), num(sensors.gz2 or sensors.gz or 0) }
    end)
    pcall(function()
      msg.pos = vecTbl(obj:getPosition())
      msg.vel = vecTbl(obj:getVelocity())
      msg.dir = vecTbl(obj:getDirectionVector())
    end)
    if wheelTimer >= WHEEL then
      wheelTimer = 0
      msg.wheels = wheelData()
    end
    send(msg)
  end

  if fullTimer >= FULL then
    fullTimer = 0
    send({ t = "electrics", e = scalars(ev) })
  end

  if ptTimer >= PT then
    ptTimer = 0
    local msg = { t = "pt", pt = powertrainData(), energy = energyData() }
    pcall(function() msg.damage = num(beamstate.damage or 0) end)
    send(msg)
  end

  if specTimer >= SPEC then
    specTimer = 0
    sendSpec()
  end
end

-- ---------------------------------------------------------------- commands
local function ctrl(name)
  local ok, c = pcall(controller.getController, name)
  if ok then return c end
end

local actions = {}
actions.lights = function(a) electrics.setLightsState(a.value or 0) end
actions.toggleLights = function() electrics.toggle_lights() end
actions.highbeam = function() electrics.setLightsState(electrics.values.lights == 2 and 1 or 2) end
actions.fog = function() electrics.toggle_fog_lights() end
actions.signalL = function() electrics.toggle_left_signal() end
actions.signalR = function() electrics.toggle_right_signal() end
actions.hazard = function() electrics.toggle_warn_signal() end
actions.horn = function(a) electrics.horn(a.value and true or false) end
actions.ignition = function(a) controller.mainController.setEngineIgnition(a.value and true or false) end
actions.starter = function()
  controller.mainController.setStarter(true)
  starterTimer = 1.2
end
actions.parkingbrake = function(a) input.event("parkingbrake", a.value and 1 or 0, 2) end
actions.shiftUp = function() controller.mainController.shiftUp() end
actions.shiftDown = function() controller.mainController.shiftDown() end
actions.shiftTo = function(a) controller.mainController.shiftToGearIndex(a.index or 0) end
actions.refuel = function()
  for _, st in pairs(energyStorage.getStorages()) do
    if st.setRemainingRatio then st:setRemainingRatio(1) end
  end
end
actions.repair = function() obj:requestReset(RESET_PHYSICS) end
-- cruise control (speeds in m/s)
actions.cruiseOn = function(a)
  local c = ctrl("cruiseControl")
  if a and a.speed then c.setSpeed(a.speed) else c.holdCurrentSpeed() end
  c.setEnabled(true)
end
actions.cruiseOff = function() ctrl("cruiseControl").setEnabled(false) end
actions.cruiseResume = function() ctrl("cruiseControl").setEnabled(true) end
actions.cruiseSet = function(a) ctrl("cruiseControl").setSpeed(a.speed) end
actions.cruiseChange = function(a) ctrl("cruiseControl").changeSpeed(a.delta or 0) end
actions.cruiseHold = function() ctrl("cruiseControl").holdCurrentSpeed() end
-- stability / drive modes
actions.escToggle = function()
  local c = ctrl("esc")
  if c and c.toggleESCMode then c.toggleESCMode() else input.event("toggleESCMode", 1, 2) end
end
actions.driveModeNext = function() ctrl("driveModes").nextDriveMode() end
actions.driveModeSet = function(a) ctrl("driveModes").setDriveMode(a.key) end
-- generic: call any controller function e.g. {controller="esc", fn="toggleESCMode", args={}}
actions.controller = function(a)
  local c = ctrl(a.controller)
  local f = c and c[a.fn]
  if type(f) ~= "function" then error("no function " .. tostring(a.fn) .. " on " .. tostring(a.controller)) end
  f(unpack(a.args or {}))
end

local function cmd(json)
  local okDec, a = pcall(jsonDecode, json)
  if not okDec or type(a) ~= "table" then return end
  local f = actions[a.type]
  local ok, err = false, "unknown command " .. tostring(a.type)
  if f then ok, err = pcall(f, a) end
  send({ t = "cmdResult", id = a.id, type = a.type, ok = ok, err = (not ok) and tostring(err) or nil })
end

local function setTarget(h, p)
  host = h or host
  port = p or port
end

local function onExtensionLoaded()
  openSocket()
  specTimer = SPEC - 0.5 -- send spec shortly after spawn
end

local function onReset()
  specTimer = SPEC - 0.5
end

M.onExtensionLoaded = onExtensionLoaded
M.onReset = onReset
M.updateGFX = updateGFX
M.cmd = cmd
M.setTarget = setTarget
M.sendSpec = sendSpec

return M
