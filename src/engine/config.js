// Tunable configuration for the Creatures rules engine.
// Everything the rules depend on lives here so a simulator can sweep values
// without touching the engine code.

export const COLOURS = ['red', 'blue', 'purple'];
export const PLAYERS = ['red', 'blue'];
export const STAT_KEYS = ['centre', 'kin', 'random', 'orthoFert', 'diagFert', 'dominance', 'aggression'];

// Trait list. `stat` is the stat modified, `delta` the modifier per instance,
// `weight` the relative draw weight when DNA is collected.
export const DEFAULT_TRAITS = {
  'Social':        { stat: 'kin',        delta: 15,  weight: 1, opposite: 'Solitary' },
  'Solitary':      { stat: 'kin',        delta: -15, weight: 1, opposite: 'Social' },
  'Bold':          { stat: 'centre',     delta: 15,  weight: 1, opposite: 'Timid' },
  'Timid':         { stat: 'centre',     delta: -15, weight: 1, opposite: 'Bold' },
  'Restless':      { stat: 'random',     delta: 15,  weight: 1, opposite: 'Focused' },
  'Focused':       { stat: 'random',     delta: -15, weight: 1, opposite: 'Restless' },
  'Close Bond':    { stat: 'orthoFert',  delta: 15,  weight: 1, opposite: 'Cold' },
  'Cold':          { stat: 'orthoFert',  delta: -15, weight: 1, opposite: 'Close Bond' },
  'Wandering Eye': { stat: 'diagFert',   delta: 10,  weight: 1, opposite: 'Shy' },
  'Shy':           { stat: 'diagFert',   delta: -10, weight: 1, opposite: 'Wandering Eye' },
  'Dominant':      { stat: 'dominance',  delta: 15,  weight: 1, opposite: 'Recessive' },
  'Recessive':     { stat: 'dominance',  delta: -15, weight: 1, opposite: 'Dominant' },
  'Aggressive':    { stat: 'aggression', delta: 15,  weight: 1, opposite: null },
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
  traitSlots: 10,              // max traits per colour, oldest pushed out first
  fertileAge: 2,               // fertile when age >= this at the start of a generation
  deathAge: 6,                 // removed at the start of the generation once age >= this
  placementCap: 5,             // may place while owning fewer than this many creatures
  initialPlacements: 3,        // per player during setup
  dnaMin: 2,
  dnaMax: 4,
  generationCap: 100,          // 0 means no cap
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
  if (overrides.traits) {
    cfg.traits = {};
    for (const [name, def] of Object.entries(overrides.traits)) cfg.traits[name] = { ...def };
  } else {
    cfg.traits = {};
    for (const [name, def] of Object.entries(DEFAULT_TRAITS)) cfg.traits[name] = { ...def };
  }
  cfg.gridSize = Math.max(3, Math.floor(cfg.gridSize));
  return cfg;
}

export function opponentOf(player) {
  return player === 'red' ? 'blue' : 'red';
}
