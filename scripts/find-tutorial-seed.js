// Searches seeds for the tutorial board until one supports every lesson.
// Usage: node scripts/find-tutorial-seed.js [maxSeeds]

import { scenarioChecks } from '../src/tutorial/scenario.js';

const max = Number(process.argv[2] || 200000);
const required = ['onePickupByRed', 'redCollisionBirth', 'notEnded', 'oldRedDies', 'redPlacesNext'];
let best = null;
for (let seed = 1; seed <= max; seed++) {
  const c = scenarioChecks(seed);
  if (!required.every((k) => c[k])) continue;
  if (c.adjacencyBirth) {
    console.log(`seed ${seed}: all lessons including an adjacency birth`);
    best = seed;
    break;
  }
  if (best === null) {
    best = seed;
    console.log(`seed ${seed}: required lessons only (no adjacency birth), continuing to look`);
  }
}
if (best === null) console.log('no seed found');
else console.log(`use TUTORIAL_SEED = ${best}`);
