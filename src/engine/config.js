// Tunable configuration for the Creatures rules engine.
// Everything the rules depend on lives here so a simulator can sweep values
// without touching the engine code.

export const COLOURS = ['red', 'blue', 'purple'];
export const PLAYERS = ['red', 'blue'];
export const STAT_KEYS = ['centre', 'kin', 'random', 'orthoFert', 'diagFert', 'dominance', 'aggression'];

// Trait list. `stat` is the stat modified, `sign` the direction, `group` the
// draw group (see traitGroupWeights), `weight` the relative draw weight inside
// its group. The size of each drawn instance is rolled from traitMagnitude.
export const DEFAULT_TRAITS = {
  'Social':        { stat: 'kin',        sign: 1,  group: 'movement', weight: 1, opposite: 'Solitary' },
  'Solitary':      { stat: 'kin',        sign: -1, group: 'movement', weight: 1, opposite: 'Social' },
  'Bold':          { stat: 'centre',     sign: 1,  group: 'movement', weight: 1, opposite: 'Timid' },
  'Timid':         { stat: 'centre',     sign: -1, group: 'movement', weight: 1, opposite: 'Bold' },
  'Restless':      { stat: 'random',     sign: 1,  group: 'movement', weight: 1, opposite: 'Focused' },
  'Focused':       { stat: 'random',     sign: -1, group: 'movement', weight: 1, opposite: 'Restless' },
  'Close Bond':    { stat: 'orthoFert',  sign: 1,  group: 'breeding', weight: 1, opposite: 'Cold' },
  'Cold':          { stat: 'orthoFert',  sign: -1, group: 'breeding', weight: 1, opposite: 'Close Bond' },
  'Wandering Eye': { stat: 'diagFert',   sign: 1,  group: 'breeding', weight: 1, opposite: 'Shy' },
  'Shy':           { stat: 'diagFert',   sign: -1, group: 'breeding', weight: 1, opposite: 'Wandering Eye' },
  'Dominant':      { stat: 'dominance',  sign: 1,  group: 'breeding', weight: 1, opposite: 'Recessive' },
  'Recessive':     { stat: 'dominance',  sign: -1, group: 'breeding', weight: 1, opposite: 'Dominant' },
  'Aggressive':    { stat: 'aggression', sign: 1,  group: 'breeding', weight: 1, opposite: null },
};

export const DEFAULT_CONFIG = {
  gridSize: 8,                 // 6 to 10
  baseStats: {
    centre: 30,
    kin: 30,
    random: 30,
    orthoFert: 30,
    diagFert: 10,
    dominance: 0,
    aggression: 0,
  },
  traits: DEFAULT_TRAITS,
  traitGroupWeights: { movement: 60, breeding: 40 },  // chance of drawing from each group
  traitMagnitude: { min: 15, max: 30 },               // size of each drawn trait instance (inclusive)
  traitSlots: 10,              // max traits per colour, oldest pushed out first
  fertileAge: 2,               // fertile when age >= this at the start of a generation
  deathAge: 6,                 // removed at the start of the generation once age >= this
  placementCap: 5,             // may place while owning fewer than this many creatures; 0 = no cap ("constant spawning")
  autoSkipPlacement: true,     // a player who cannot place is skipped without needing a Pass input
  initialPlacements: 3,        // per player during setup
  dnaMin: 4,                   // when fewer than this remain at the end of a generation...
  dnaMax: 4,                   // ...top up to a random count between dnaMin and dnaMax (4/4 keeps four on the board)
  disabledTraits: [],          // trait names never drawn from DNA (e.g. ['Aggressive'])
  generationCap: 25,           // 0 means no cap
  collisionBirthChance: 100,   // % chance a non-kill collision breeds
  pairing: {
    redBlue:    { red: 0,  blue: 0, purple: 100 },
    redPurple:  { red: 80, purple: 20 },
    bluePurple: { blue: 80, purple: 20 },
  },
  firstPlacer: 'red',          // who places first in setup; the other starts generation 1
  centreOnTarget: 'random',    // creature already on its centre target: 'random' step or 'stay'
  retryBlockedStep: false,     // C5: try the other distance-reducing direction when blocked
  moveIntoKilledCell: false,   // Q5: after a kill, does the mover step into the freed cell
  aggressionCap: 100,          // C14: max effective aggression %
};

export function mergeConfig(overrides = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...overrides };
  cfg.baseStats = { ...DEFAULT_CONFIG.baseStats, ...(overrides.baseStats || {}) };
  cfg.pairing = {
    redBlue: { ...DEFAULT_CONFIG.pairing.redBlue, ...((overrides.pairing || {}).redBlue || {}) },
    redPurple: { ...DEFAULT_CONFIG.pairing.redPurple, ...((overrides.pairing || {}).redPurple || {}) },
    bluePurple: { ...DEFAULT_CONFIG.pairing.bluePurple, ...((overrides.pairing || {}).bluePurple || {}) },
  };
  const traitSource = overrides.traits || DEFAULT_TRAITS;
  cfg.traits = {};
  for (const [name, def] of Object.entries(traitSource)) cfg.traits[name] = { ...def };
  cfg.traitGroupWeights = { ...DEFAULT_CONFIG.traitGroupWeights, ...(overrides.traitGroupWeights || {}) };
  cfg.traitMagnitude = { ...DEFAULT_CONFIG.traitMagnitude, ...(overrides.traitMagnitude || {}) };
  cfg.disabledTraits = [...(overrides.disabledTraits || DEFAULT_CONFIG.disabledTraits)];
  cfg.gridSize = Math.max(3, Math.floor(cfg.gridSize));
  return cfg;
}

// Size of a trait instance when none was rolled (older saves, hand-built states).
export function traitDelta(def, config) {
  if (!def) return 0;
  if (def.delta !== undefined) return def.delta;
  const min = (config && config.traitMagnitude && config.traitMagnitude.min) || 15;
  return (def.sign ?? 1) * min;
}

export function opponentOf(player) {
  return player === 'red' ? 'blue' : 'red';
}
