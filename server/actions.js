// Named actions for macros, Stream Deck, KDE shortcuts and the Deck page.
// Each action resolves to a game command, a cluster UI event, or a media command.
'use strict';

const LIST = [
  // lights & signals
  { id: 'signal-left', label: 'Left signal', group: 'Lights & signals', game: { type: 'signalL' } },
  { id: 'signal-right', label: 'Right signal', group: 'Lights & signals', game: { type: 'signalR' } },
  { id: 'hazard', label: 'Hazard lights', group: 'Lights & signals', game: { type: 'hazard' } },
  { id: 'lights-cycle', label: 'Headlights (cycle)', group: 'Lights & signals', game: { type: 'toggleLights' } },
  { id: 'lights-off', label: 'Headlights off', group: 'Lights & signals', game: { type: 'lights', value: 0 } },
  { id: 'lights-low', label: 'Low beam', group: 'Lights & signals', game: { type: 'lights', value: 1 } },
  { id: 'high-beam', label: 'High beam', group: 'Lights & signals', game: { type: 'highbeam' } },
  { id: 'fog', label: 'Fog lights', group: 'Lights & signals', game: { type: 'fog' } },
  { id: 'horn', label: 'Horn (hold)', group: 'Lights & signals', hold: true, game: { type: 'horn', value: true }, release: { type: 'horn', value: false } },
  // cruise & ADAS
  { id: 'cruise-toggle', label: 'Cruise on / off', group: 'Cruise & assist' },
  { id: 'cruise-set', label: 'Cruise set (hold speed)', group: 'Cruise & assist' },
  { id: 'cruise-resume', label: 'Cruise resume', group: 'Cruise & assist', game: { type: 'cruiseResume' } },
  { id: 'cruise-off', label: 'Cruise off', group: 'Cruise & assist' },
  { id: 'cruise-plus', label: 'Cruise + (step)', group: 'Cruise & assist', params: 'step=5&unit=kmh' },
  { id: 'cruise-minus', label: 'Cruise − (step)', group: 'Cruise & assist', params: 'step=5&unit=kmh' },
  { id: 'acc-toggle', label: 'Adaptive cruise on / off', group: 'Cruise & assist' },
  { id: 'acc-gap', label: 'ACC distance (cycle)', group: 'Cruise & assist' },
  { id: 'fcw-toggle', label: 'Collision warning on / off', group: 'Cruise & assist', adas: 'fcw' },
  { id: 'aeb-toggle', label: 'Emergency braking on / off', group: 'Cruise & assist', adas: 'aeb' },
  { id: 'bsm-toggle', label: 'Blind spot on / off', group: 'Cruise & assist', adas: 'bsm' },
  { id: 'tsr-toggle', label: 'Speed-limit signs on / off', group: 'Cruise & assist', adas: 'tsr' },
  { id: 'esc-mode', label: 'ESC mode', group: 'Cruise & assist', game: { type: 'escToggle' } },
  { id: 'drive-mode', label: 'Drive mode (next)', group: 'Cruise & assist', game: { type: 'driveModeNext' } },
  // car
  { id: 'engine-start', label: 'Start engine', group: 'Car', game: { type: 'starter' } },
  { id: 'engine-off', label: 'Engine off', group: 'Car', game: { type: 'ignition', value: false } },
  { id: 'parking-brake', label: 'Parking brake (toggle)', group: 'Car' },
  { id: 'shift-up', label: 'Shift up', group: 'Car', game: { type: 'shiftUp' } },
  { id: 'shift-down', label: 'Shift down', group: 'Car', game: { type: 'shiftDown' } },
  { id: 'repair', label: 'Repair / reset car', group: 'Car', game: { type: 'repair' } },
  { id: 'refuel', label: 'Refuel / recharge', group: 'Car', game: { type: 'refuel' } },
  { id: 'nav-clear', label: 'Clear GPS route', group: 'Car', game: { type: 'navClear' } },
  { id: 'pause', label: 'Pause / resume game', group: 'Car' },
  // cluster (like steering-wheel buttons)
  { id: 'cluster-next', label: 'Cluster: next page', group: 'Cluster', ui: 'next' },
  { id: 'cluster-prev', label: 'Cluster: previous page', group: 'Cluster', ui: 'prev' },
  { id: 'cluster-ok', label: 'Cluster: OK / select', group: 'Cluster', ui: 'ok' },
  { id: 'cluster-back', label: 'Cluster: back', group: 'Cluster', ui: 'back' },
  { id: 'cluster-hold', label: 'Cluster: hold OK (reset)', group: 'Cluster', ui: 'hold' },
  { id: 'design-next', label: 'Cluster: next design', group: 'Cluster', ui: 'design-next' },
  { id: 'design-prev', label: 'Cluster: previous design', group: 'Cluster', ui: 'design-prev' },
  { id: 'cluster-hide', label: 'Cluster: show / hide controls', group: 'Cluster', ui: 'hide' },
  // trip computer
  { id: 'trip-a-reset', label: 'Reset Trip A', group: 'Trip computer', trip: 'a' },
  { id: 'trip-b-reset', label: 'Reset Trip B', group: 'Trip computer', trip: 'b' },
  { id: 'economy-reset', label: 'Reset fuel economy', group: 'Trip computer', trip: 'econ' },
  { id: 'start-reset', label: 'Reset "since start"', group: 'Trip computer', trip: 'start' },
  // media (desktop player via playerctl)
  { id: 'media-play-pause', label: 'Media play / pause', group: 'Media', media: 'play-pause' },
  { id: 'media-next', label: 'Media next track', group: 'Media', media: 'next' },
  { id: 'media-prev', label: 'Media previous track', group: 'Media', media: 'previous' },
];
const BY_ID = Object.fromEntries(LIST.map((a) => [a.id, a]));

const truthy = (v) => v === true || (typeof v === 'number' && v > 0.5);

// returns { game } | { ui } | { media } | { trip } | { error }
function resolve(id, q, cache) {
  const a = BY_ID[id];
  if (!a) return { error: `unknown action "${id}"` };
  if (q.state === 'up') return a.release ? { game: a.release } : { none: true };
  if (a.ui) return { ui: a.ui };
  if (a.trip) return { trip: a.trip };
  if (a.media) return { media: a.media };
  if (a.game) return { game: a.game };
  const e = cache.electrics || {};
  const adas = (cache.world && cache.world.adas) || {};
  const cruiseOn = truthy(e.cruiseControlActive);
  const speed = Math.abs(e.wheelspeed || e.airspeed || 0);
  const toMs = (v) => (q.unit === 'mph' ? v / 2.23694 : v / 3.6);
  if (a.adas) return { game: { type: 'adas', settings: { [a.adas]: !adas[a.adas] } } };
  switch (id) {
    case 'cruise-toggle':
      if (cruiseOn || adas.acc) return { game: { type: adas.acc ? 'accOff' : 'cruiseOff' } };
      return { game: { type: 'cruiseOn' } };
    case 'cruise-set':
      return { game: adas.acc ? { type: 'accSet', speed } : { type: 'cruiseOn' } };
    case 'cruise-off':
      return { game: { type: adas.acc ? 'accOff' : 'cruiseOff' } };
    case 'cruise-plus':
    case 'cruise-minus': {
      const delta = toMs(+(q.step || 5)) * (id === 'cruise-plus' ? 1 : -1);
      if (adas.acc) return { game: { type: 'accSet', speed: Math.max(0, (adas.accSet || speed) + delta) } };
      return { game: { type: 'cruiseChange', delta } };
    }
    case 'acc-toggle':
      return { game: adas.acc ? { type: 'accOff' } : { type: 'accOn', speed: Math.max(speed, toMs(30)) } };
    case 'acc-gap':
      return { game: { type: 'adas', settings: { accGap: ((adas.accGap || 2) % 4) + 1 } } };
    case 'parking-brake':
      return { game: { type: 'parkingbrake', value: !truthy(e.parkingbrake) } };
    case 'pause':
      return { game: { type: 'pause', value: !(cache.world && cache.world.paused) } };
  }
  return { error: `action "${id}" has no handler` };
}

module.exports = { LIST, resolve };
