// The tutorial board. A fixed 6x6 position played on the real engine with a
// fixed seed, so the scripted lesson always shows the same events: the
// player's placement, a collision birth, a DNA pickup by Red and, at the start
// of the next generation, a death of old age.
//
// The seed was found by scripts/find-tutorial-seed.js and is verified by the
// test suite; re-run the finder if the engine's random draws change.

import { createGame, applyInput } from '../engine/index.js';

export const TUTORIAL_SEED = 40;
export const TUTORIAL_GRID = 6;
export const TUTORIAL_RED_CELL = { x: 3, y: 0 };
export const TUTORIAL_BLUE_CELL = { x: 5, y: 2 };

const CREATURES = [
  { colour: 'red', x: 1, y: 1, age: 3 },   // a pair of fertile reds side by side
  { colour: 'red', x: 2, y: 1, age: 3 },
  { colour: 'red', x: 1, y: 4, age: 5 },   // reaches 6 this generation, dies at the next
  { colour: 'blue', x: 4, y: 4, age: 3 },  // a pair of fertile blues
  { colour: 'blue', x: 4, y: 3, age: 2 },
];

// One DNA symbol on a centre cell just below the red pair, three far away.
const DNA = [
  { x: 2, y: 2 },
  { x: 5, y: 0 },
  { x: 0, y: 5 },
  { x: 5, y: 5 },
];

export function buildTutorialState(seed = TUTORIAL_SEED) {
  const s = createGame({ config: { gridSize: TUTORIAL_GRID, generationCap: 25 }, seed });
  s.rng = s.seed; // the setup DNA draw is discarded below, so restart the stream
  s.creatures = {};
  s.nextId = 1;
  for (const c of CREATURES) {
    const id = s.nextId++;
    s.creatures[id] = { id, colour: c.colour, age: c.age, x: c.x, y: c.y, bornGen: 1 };
  }
  s.dna = DNA.map((d) => d.y * s.n + d.x);
  s.gen = 3;
  s.phase = 'placement';
  s.turn = 'red';
  s.placementStep = 0;
  s.setupPlaced = { red: 3, blue: 3 };
  s.tutorial = true;
  return s;
}

// The ids of the pre-placed creatures, in CREATURES order.
export const TUTORIAL_IDS = { redA: 1, redB: 2, redOld: 3, blueA: 4, blueB: 5 };

// Plays the scripted part of the tutorial and returns what happened, for the
// seed finder and the tests.
export function runTutorialScript(seed = TUTORIAL_SEED) {
  const start = buildTutorialState(seed);
  const r1 = applyInput(start, { type: 'place', cell: TUTORIAL_RED_CELL });
  const r2 = applyInput(r1.state, { type: 'place', cell: TUTORIAL_BLUE_CELL });
  const resolution = [...r1.events, ...r2.events];
  let s = r2.state;
  while (s.phase === 'dna') s = applyInput(s, { type: 'chooseDna', colour: 'red' }).state;
  let nextEvents = [];
  if (s.phase === 'between') {
    const r = applyInput(s, { type: 'nextGeneration' });
    s = r.state;
    nextEvents = r.events;
  }
  return { afterResolution: r2.state, resolution, nextEvents, final: s };
}

// Which lessons a given seed's playthrough supports.
export function scenarioChecks(seed = TUTORIAL_SEED) {
  const { afterResolution, resolution, nextEvents, final } = runTutorialScript(seed);
  const pickups = resolution.filter((e) => e.type === 'pickup');
  const collisionBirths = resolution.filter((e) => e.type === 'birth' && e.via === 'collision' && e.parentColours.every((c) => c === 'red'));
  const adjacencyBirths = resolution.filter((e) => e.type === 'birth' && e.via !== 'collision');
  const deaths = nextEvents.filter((e) => e.type === 'death');
  return {
    onePickupByRed: pickups.length === 1 && pickups[0].colour === 'red' && pickups[0].chooser === 'red',
    redCollisionBirth: collisionBirths.length >= 1,
    adjacencyBirth: adjacencyBirths.length >= 1,
    notEnded: !resolution.some((e) => e.type === 'ended') && afterResolution.phase === 'dna',
    oldRedDies: deaths.some((e) => e.id === TUTORIAL_IDS.redOld),
    redPlacesNext: final.phase === 'placement' && final.turn === 'red' && final.gen === 4,
  };
}
