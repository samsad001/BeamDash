-- BeamDash game-engine extension.
-- * receives commands from the BeamDash server (UDP) and runs / forwards them
-- * streams world data: all vehicles, navigation route, road network, ADAS state
-- * sends car details (model / config info) and tuning variables on spawn
-- * runs the ADAS layer: forward collision warning, AEB, blind spot, adaptive cruise,
--   traffic-sign (speed limit) recognition from the road network

local M = {}

local CFG_FILE = "settings/beamDash.json"
local cfg = { serverHost = "127.0.0.1", serverPort = 4445, listenPort = 4446 }

local udp = nil
local chunkQueue = {}
local chunkId = 0
local worldTimer, adasTimer, tsrTimer = 0, 0, 0
local infoDelay, mapDelay = -1, -1
local levelName = nil

local adas = {
  fcw = true, fcwSens = 2, aeb = false, bsm = true, tsr = true,
  acc = false, accGap = 2, accSet = 0,
}
local adasState = { lead = nil, fcw = 0, bsmL = false, bsmR = false, aeb = false }
local aebBraking = false
local speedLimit, roadName = nil, nil
local watchedId = nil

local function r(v, d)
  if type(v) ~= "number" or v ~= v then return 0 end
  local m = 10 ^ (d or 2)
  return math.floor(v * m + 0.5) / m
end

local function scalars(t, out, maxStr)
  out = out or {}
  if type(t) ~= "table" then return out end
  for k, v in pairs(t) do
    if type(k) == "string" then
      local tv = type(v)
      if tv == "number" then out[k] = r(v, 3)
      elseif tv == "boolean" then out[k] = v
      elseif tv == "string" and #v <= (maxStr or 200) then out[k] = v end
    end
  end
  return out
end

-- ------------------------------------------------------------------ network
local function getSocket()
  local ok, s = pcall(require, "socket.socket")
  if ok and type(s) == "table" and s.udp then return s end
  ok, s = pcall(require, "socket")
  if ok and type(s) == "table" and s.udp then return s end
  return rawget(_G, "socket")
end

local function loadCfg()
  local ok, d = pcall(jsonReadFile, CFG_FILE)
  if ok and type(d) == "table" then
    for k, v in pairs(d) do cfg[k] = v end
  else
    pcall(jsonWriteFile, CFG_FILE, cfg, true)
  end
end

local function openSocket()
  if udp then pcall(function() udp:close() end) end
  udp = nil
  local s = getSocket()
  if not s then log("E", "beamDash", "LuaSocket unavailable") return end
  udp = s.udp()
  udp:settimeout(0)
  local ok, err = udp:setsockname("0.0.0.0", cfg.listenPort)
  if not ok then log("E", "beamDash", "could not bind command port " .. tostring(cfg.listenPort) .. ": " .. tostring(err)) end
end

local function rawSend(str)
  if udp then pcall(function() udp:sendto(str, cfg.serverHost, cfg.serverPort) end) end
end

-- messages bigger than one datagram are split; the server reassembles them
local function send(msg)
  local ok, str = pcall(jsonEncode, msg)
  if not ok or not str then return end
  if #str < 60000 then rawSend(str) return end
  chunkId = chunkId + 1
  local size = 48000
  local n = math.ceil(#str / size)
  for i = 1, n do
    table.insert(chunkQueue, string.format("BDC|%d|%d|%d|", chunkId, i, n) .. str:sub((i - 1) * size + 1, i * size))
  end
end

-- two datagrams per frame keeps big messages (road network) from overflowing the receiver
local function flushChunks()
  for _ = 1, 2 do
    local c = table.remove(chunkQueue, 1)
    if not c then return end
    rawSend(c)
  end
end

-- ------------------------------------------------------------------ helpers
local function playerVeh()
  return be:getPlayerVehicle(0)
end

local function queueVeh(cmd)
  local v = playerVeh()
  if v then v:queueLuaCommand(cmd) end
end

local function tellVehicleTarget(veh)
  veh = veh or playerVeh()
  if veh then
    veh:queueLuaCommand(string.format("if beamDashVeh then beamDashVeh.setTarget(%q,%d) end", cfg.serverHost, cfg.serverPort))
  end
end

local function sendInfo()
  local veh = playerVeh()
  if not veh then return end
  local info = { t = "info", vid = veh:getID() }
  pcall(function() info.jbeam = veh:getJBeamFilename() end)
  pcall(function()
    local d = core_vehicles.getCurrentVehicleDetails()
    if d then
      info.model = scalars(d.model)
      if d.model and type(d.model.Years) == "table" then info.model.Years = d.model.Years end
      info.current = scalars(d.current)
      local ckey = d.current and d.current.config_key
      local c = d.configs and ckey and d.configs[ckey]
      if c then
        info.config = scalars(c)
        if type(c.Years) == "table" then info.config.Years = c.Years end
      end
    end
  end)
  send(info)
end

local function sendVars()
  local out = { t = "vars", vars = {}, values = {} }
  pcall(function()
    local vd = core_vehicle_manager.getPlayerVehicleData()
    if vd and vd.vdata and vd.vdata.variables then
      for name, var in pairs(vd.vdata.variables) do out.vars[name] = scalars(var) end
    end
    if vd and vd.config and vd.config.vars then
      for k, v in pairs(vd.config.vars) do out.values[k] = v end
    end
  end)
  send(out)
end

local function sendMap()
  local ok, err = pcall(function()
    local m = map.getMap()
    if not m or not m.nodes then return end
    local idx, nodes, edges, seen = {}, {}, {}, {}
    local i = 0
    for name, n in pairs(m.nodes) do
      i = i + 1
      idx[name] = i
      nodes[i] = { r(n.pos.x, 1), r(n.pos.y, 1), r(n.pos.z, 1), r(n.radius or 3, 1) }
    end
    for name, n in pairs(m.nodes) do
      local a = idx[name]
      for other, link in pairs(n.links or {}) do
        local b = idx[other]
        if b then
          local key = a < b and (a .. ":" .. b) or (b .. ":" .. a)
          if not seen[key] then
            seen[key] = true
            edges[#edges + 1] = { a - 1, b - 1, r(link.drivability or 1, 2), link.oneWay and 1 or 0, r(link.speedLimit or 0, 1) }
          end
        end
      end
    end
    send({ t = "map", level = levelName, nodes = nodes, edges = edges })
  end)
  if not ok then log("E", "beamDash", "map export failed: " .. tostring(err)) end
end

local function routeData()
  local gm = rawget(_G, "core_groundMarkers")
  local rp = gm and gm.routePlanner
  local path = rp and rp.path
  if type(path) ~= "table" or #path < 2 then return nil end
  local pts, len, prev = {}, 0, nil
  local step = math.max(1, math.floor(#path / 400))
  for i = 1, #path do
    local p = path[i].pos or path[i]
    if prev then len = len + math.sqrt((p.x - prev.x) ^ 2 + (p.y - prev.y) ^ 2) end
    prev = p
    if i % step == 1 or step == 1 or i == #path then pts[#pts + 1] = { r(p.x, 1), r(p.y, 1) } end
  end
  return { pts = pts, len = r(len, 0) }
end

local function nearestNode(x, y)
  local m = map.getMap()
  local best, bestD = nil, 1e18
  for name, n in pairs(m.nodes) do
    local d = (n.pos.x - x) ^ 2 + (n.pos.y - y) ^ 2
    if d < bestD then best, bestD = name, d end
  end
  return best, best and m.nodes[best].pos
end

-- ------------------------------------------------------------------ ADAS
local accGaps = { 1.0, 1.5, 2.0, 2.6 }
local fcwTTC = { 1.4, 2.0, 2.7 }

local function updateAdas()
  local myId = be:getPlayerVehicleID(0)
  local me = map.objects and map.objects[myId]
  if not me then adasState.lead = nil return end
  local fwd = vec3(me.dirVec.x, me.dirVec.y, 0)
  local fl = fwd:length()
  if fl < 1e-3 then return end
  fwd = fwd / fl
  local right = vec3(fwd.y, -fwd.x, 0)
  local mySpd = me.vel:dot(fwd)

  local leadGap, leadSpd, leadId = 1e9, 0, nil
  local bsmL, bsmR = false, false
  for id, o in pairs(map.objects) do
    if id ~= myId and o.pos then
      local rel = o.pos - me.pos
      local lon, lat = rel:dot(fwd), rel:dot(right)
      if math.abs(rel.z) < 6 then
        if lon > 1 and lon < 160 and math.abs(lat) < 2.0 + lon * 0.012 and lon < leadGap then
          leadGap, leadSpd, leadId = lon, o.vel:dot(fwd), id
        end
        if adas.bsm and lon > -13 and lon < 2.5 and math.abs(lat) > 1.5 and math.abs(lat) < 5.5 then
          if lat < 0 then bsmL = true else bsmR = true end
        end
      end
    end
  end

  adasState.bsmL, adasState.bsmR = bsmL, bsmR
  adasState.fcw = 0
  if leadId then
    local gap = math.max(0, leadGap - 4.5)
    local closing = mySpd - leadSpd
    local ttc = closing > 0.5 and gap / closing or 99
    adasState.lead = { id = leadId, gap = r(gap, 1), spd = r(leadSpd, 2), ttc = r(ttc, 2) }
    if adas.fcw and mySpd > 3 then
      local thr = fcwTTC[adas.fcwSens] or 2.0
      if ttc < thr * 0.55 then adasState.fcw = 2 elseif ttc < thr then adasState.fcw = 1 end
    end
    -- automatic emergency braking
    local wantBrake = adas.aeb and mySpd > 3 and ttc < 0.9
    if wantBrake and not aebBraking then
      aebBraking = true
      queueVeh("input.event('brake', 1, 2)")
    elseif aebBraking and (not wantBrake) and (ttc > 1.6 or mySpd < 1) then
      aebBraking = false
      queueVeh("input.event('brake', 0, 2)")
    end
    -- adaptive cruise: follow the lead car at the chosen time gap
    if adas.acc and adas.accSet > 0 then
      local want = adas.accSet
      local desiredGap = (accGaps[adas.accGap] or 2.0) * math.max(mySpd, 5) + 4
      if gap < desiredGap * 1.6 then
        want = math.min(adas.accSet, math.max(0, leadSpd + (gap - desiredGap) * 0.35))
      end
      queueVeh(string.format("if beamDashVeh then beamDashVeh.cruiseSetSpeed(%f) end", want))
      adasState.accTarget = r(want, 2)
    end
  else
    adasState.lead = nil
    if aebBraking then aebBraking = false queueVeh("input.event('brake', 0, 2)") end
    if adas.acc and adas.accSet > 0 then
      queueVeh(string.format("if beamDashVeh then beamDashVeh.cruiseSetSpeed(%f) end", adas.accSet))
      adasState.accTarget = r(adas.accSet, 2)
    end
  end
  adasState.aeb = aebBraking
end

local function updateTsr()
  speedLimit, roadName = nil, nil
  if not adas.tsr then return end
  pcall(function()
    local veh = playerVeh()
    if not veh then return end
    local pos = veh:getPosition()
    local n1, n2, dist = map.findClosestRoad(pos)
    if n1 and dist and dist < 15 then
      local m = map.getMap()
      local link = m.nodes[n1] and m.nodes[n1].links and m.nodes[n1].links[n2]
      if link and link.speedLimit and link.speedLimit > 0 then speedLimit = r(link.speedLimit, 2) end
      roadName = n1
    end
  end)
end

local function sendWorld()
  local myId = be:getPlayerVehicleID(0)
  local vehicles = {}
  for id, o in pairs(map.objects or {}) do
    if o.pos then
      vehicles[#vehicles + 1] = {
        id = id, me = (id == myId),
        x = r(o.pos.x, 1), y = r(o.pos.y, 1), z = r(o.pos.z, 1),
        hx = r(o.dirVec and o.dirVec.x or 0, 3), hy = r(o.dirVec and o.dirVec.y or 1, 3),
        spd = r(o.vel and o.vel:length() or 0, 2), dmg = r(o.damage or 0, 0),
      }
    end
  end
  local msg = {
    t = "world", level = levelName, myId = myId, vehicles = vehicles,
    route = routeData(), adas = adas, adasState = adasState,
    speedLimit = speedLimit, road = roadName, queued = #chunkQueue, watched = watchedId,
  }
  pcall(function()
    local tod = core_environment.getTimeOfDay()
    if tod then msg.tod = r(tod.time, 4) end
  end)
  pcall(function() msg.paused = simTimeAuthority.getPause() end)
  send(msg)
end

-- ------------------------------------------------------------------ commands
local geActions = {}
geActions.hello = function(a)
  if a.needInfo then infoDelay = 0.1 end
  if a.needMap then mapDelay = 0.3 end
end
geActions.getInfo = function() sendInfo() sendVars() end
geActions.getVars = function() sendVars() end
geActions.getMap = function() sendMap() end
geActions.setVars = function(a)
  local vd = core_vehicle_manager.getPlayerVehicleData()
  local vars = {}
  if vd and vd.config and vd.config.vars then for k, v in pairs(vd.config.vars) do vars[k] = v end end
  for k, v in pairs(a.values or {}) do vars[k] = v end
  core_vehicle_partmgmt.setConfigVars(vars)
  infoDelay = 2
end
geActions.reset = function() queueVeh("obj:requestReset(RESET_PHYSICS)") end
geActions.navTo = function(a)
  local _, pos = nearestNode(a.x, a.y)
  if not pos then error("no road network") end
  if core_groundMarkers.setPath then core_groundMarkers.setPath(vec3(pos.x, pos.y, pos.z))
  else core_groundMarkers.setFocus(vec3(pos.x, pos.y, pos.z)) end
end
geActions.navClear = function()
  if core_groundMarkers.setPath then core_groundMarkers.setPath(nil) else core_groundMarkers.setFocus(nil) end
end
geActions.adas = function(a)
  for k, v in pairs(a.settings or {}) do
    if adas[k] ~= nil then adas[k] = v end
  end
end
geActions.accOn = function(a)
  adas.acc = true
  adas.accSet = a.speed or 0
  queueVeh(string.format("beamDashVeh.cmd(%q)", jsonEncode({ type = "cruiseOn", speed = adas.accSet })))
end
geActions.accSet = function(a) adas.accSet = math.max(0, a.speed or adas.accSet) end
geActions.accOff = function()
  adas.acc = false
  adas.accSet = 0
  queueVeh(string.format("beamDashVeh.cmd(%q)", jsonEncode({ type = "cruiseOff" })))
end
geActions.timeOfDay = function(a)
  local tod = core_environment.getTimeOfDay()
  tod.time = a.value
  if a.play ~= nil then tod.play = a.play end
  core_environment.setTimeOfDay(tod)
end
geActions.pause = function(a) simTimeAuthority.pause(a.value and true or false) end
-- spectate another vehicle's live data (AI traffic, a parked car...). vid = nil stops watching.
geActions.watch = function(a)
  if watchedId then
    local old = be:getObjectByID(watchedId)
    if old then old:queueLuaCommand("if beamDashVeh then beamDashVeh.setWatched(false) end") end
  end
  watchedId = nil
  if a.vid and a.vid ~= be:getPlayerVehicleID(0) then
    local v = be:getObjectByID(a.vid)
    if not v then error("no vehicle " .. tostring(a.vid)) end
    tellVehicleTarget(v)
    v:queueLuaCommand("if beamDashVeh then beamDashVeh.setWatched(true) end")
    watchedId = a.vid
  end
end

local function handleCommand(str, ip, port)
  local ok, a = pcall(jsonDecode, str)
  if not ok or type(a) ~= "table" then return end
  -- a server running elsewhere (VM / other PC) announces itself with "hello":
  -- from then on telemetry goes back to whoever said hello
  if a.type == "hello" and ip and ip ~= cfg.serverHost then
    cfg.serverHost = ip
    tellVehicleTarget()
  end
  local f = geActions[a.type]
  if f then
    local okRun, err = pcall(f, a)
    send({ t = "cmdResult", id = a.id, type = a.type, ok = okRun, err = (not okRun) and tostring(err) or nil })
  else
    -- everything else is a vehicle-side command
    queueVeh(string.format("if beamDashVeh then beamDashVeh.cmd(%q) end", str))
  end
end

-- ------------------------------------------------------------------ hooks
local function onUpdate(dtReal)
  if not udp then return end
  for _ = 1, 20 do
    local data, ip, port = udp:receivefrom()
    if not data then break end
    handleCommand(data, ip, port)
  end
  flushChunks()

  if infoDelay >= 0 then
    infoDelay = infoDelay - dtReal
    if infoDelay < 0 then sendInfo() sendVars() tellVehicleTarget() end
  end
  if mapDelay >= 0 then
    mapDelay = mapDelay - dtReal
    if mapDelay < 0 then sendMap() end
  end

  adasTimer = adasTimer + dtReal
  if adasTimer >= 0.1 then adasTimer = 0 pcall(updateAdas) end
  tsrTimer = tsrTimer + dtReal
  if tsrTimer >= 0.5 then tsrTimer = 0 updateTsr() end
  worldTimer = worldTimer + dtReal
  if worldTimer >= 0.1 then worldTimer = 0 pcall(sendWorld) end
end

local function onExtensionLoaded()
  loadCfg()
  openSocket()
  pcall(function() levelName = getCurrentLevelIdentifier() end)
  infoDelay, mapDelay = 1, 2
  send({ t = "hello", listenPort = cfg.listenPort })
  log("I", "beamDash", "BeamDash bridge loaded -> " .. cfg.serverHost .. ":" .. cfg.serverPort)
end

local function onExtensionUnloaded()
  if udp then pcall(function() udp:close() end) end
  udp = nil
end

local function onVehicleSwitched(oldId, newId)
  infoDelay = 0.8
  local v = newId and be:getObjectByID(newId)
  tellVehicleTarget(v)
end

local function onVehicleSpawned(vid)
  local v = be:getObjectByID(vid)
  tellVehicleTarget(v)
  if vid == be:getPlayerVehicleID(0) then infoDelay = 1.5 end
end

local function onClientPostStartMission()
  pcall(function() levelName = getCurrentLevelIdentifier() end)
  mapDelay = 3
  infoDelay = 2
end

M.onUpdate = onUpdate
M.onExtensionLoaded = onExtensionLoaded
M.onExtensionUnloaded = onExtensionUnloaded
M.onVehicleSwitched = onVehicleSwitched
M.onVehicleSpawned = onVehicleSpawned
M.onClientPostStartMission = onClientPostStartMission

return M
