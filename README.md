# Creatures

Two-player, local pass-and-play strategy game for phone and tablet browsers. Players seed creatures onto a grid; each generation the creatures move, breed and age on their own. DNA pickups grant traits that reshape how each colour behaves.

No build step, no dependencies: plain HTML, CSS and ES modules.

## Play it

### On your phone via GitHub Pages

1. In the repository settings, open **Pages**, choose **Deploy from a branch**, pick the branch and the `/ (root)` folder.
2. Open the published URL on your phone. "Add to Home Screen" gives it a full-screen icon.

### On your phone via your computer

```
npm start
```

Prints a `Network:` URL. Open it on a phone connected to the same Wi-Fi.

Note: the game uses ES modules, so it must be served over HTTP. Opening `index.html` directly from the file system will not work in most browsers.

## Tests

```
npm test
```

Runs the engine tests with Node's built-in test runner: rule checks, the spec's worked examples, determinism, and random full games with invariant checks.

## Layout

```
index.html              App shell (screens, modals)
src/engine/config.js    Every tunable value and the trait list
src/engine/rng.js       Seedable RNG (state lives on the game state)
src/engine/stats.js     Stats from traits, movement shares, offspring odds
src/engine/engine.js    The rules: createGame / applyInput -> { state, events }
src/ui/app.js           Screens, settings, persistence, match flow
src/ui/board.js         Board renderer and event animation
src/ui/panels.js        Trait panel, stats table, DNA modal, end screen
src/ui/help.js          How to Play content
src/ui/sound.js         Synthesised sound effects
test/engine.test.js     Engine tests
scripts/serve.js        Tiny static server for local testing
```

## Engine API

The engine is pure. It never mutates the state it is given.

```js
import { createGame, applyInput, placementStatus, currentDnaChoice } from './src/engine/index.js';

let state = createGame({ config: { gridSize: 8 }, seed: 'any string or number' });

// Phases and the input each one expects:
//   setup      { type: 'place', cell: {x, y} }            from state.turn
//   placement  { type: 'place', cell } or { type: 'pass' } from state.turn
//   dna        { type: 'chooseDna', colour }               from state.pendingDna[0].chooser
//   between    { type: 'nextGeneration' }
//   ended      (no inputs)
const { state: next, events } = applyInput(state, { type: 'place', cell: { x: 3, y: 3 } });
```

`events` is the log the UI animates: `placed`, `death`, `move`, `blocked`, `collision`, `kill`, `birth`, `pickup`, `age`, `dnaSpawn`, `traitAdded`, `wipeout`, `ended`.

Because the RNG state is part of the game state, a saved state (or a seed plus the sequence of inputs) replays exactly. This is the hook the headless simulator and replay mode will use.

## Rule interpretations

Where the spec left a choice open, the game currently does this. Each one is a config value in `src/engine/config.js` unless noted.

| Question | Choice |
|---|---|
| Q1 Placed creatures move in the same generation | Yes |
| Q2 Trait draw | Uniform (`traits[name].weight`) |
| Q5 After a kill | Mover stays put (`moveIntoKilledCell: false`) |
| Q6 Opposite of Aggressive | None |
| C4 Centre-mode creature already on its target | Falls back to a random step (`centreOnTarget: 'random'`) |
| C5 Blocked step | Creature stays put (`retryBlockedStep: false`) |
| C7 DNA choices | Queued and presented after the generation's animation. Traits apply next generation either way, and the chooser for a Purple pickup is fixed at the moment of collection |
| C9 Hiding Purple | All three colours always offered; the hook `validColoursForTrait` exists for future traits |
| C14 Aggression cap | None (`aggressionCap: 100`) |
| Lifespan | A creature created in generation N is on the board for N..N+5 (six generations, four fertile) and is removed at the start of N+6, matching the spec's summary in section 7 |
| Breeding with no room | A successful roll with no free cell around either parent still uses up both parents' once-per-generation breeding |
| Voluntary pass | The engine accepts a pass at any placement step (for bots); the UI only offers Pass when placing is impossible |

## Not yet built

Section 13 of the spec (headless simulator, bots, experiments, replay mode in the app) is deliberately left for later.
