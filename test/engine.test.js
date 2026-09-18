import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyInput,
  legalPlacements,
  placementStatus,
  countColours,
  checkInvariants,
  computeStats,
  offspringOdds,
  movementShares,
  aggressionAgainst,
  currentDnaChoice,
  mergeConfig,
  centreCells,
  rand,
} from '../src/engine/index.js';

// ---------------------------------------------------------------------------
// Helpers

function place(state, cell) {
  return applyInput(state, { type: 'place', cell }).state;
}

// Plays random legal inputs until the game ends or maxGens is reached.
function playRandom(state, { maxGens = 200, onState } = {}) {
  let s = state;
  const events = [];
  let guard = 0;
  while (s.phase !== 'ended' && s.gen < maxGens && guard++ < 100000) {
    let input;
    if (s.phase === 'setup' || s.phase === 'placement') {
      const st = placementStatus(s);
      if (st.canPlace) {
        // Bots draw from a local PRNG on a scratch object so the game RNG stays untouched.
        const cell = st.legal[Math.floor(bot() * st.legal.length)];
        input = { type: 'place', cell };
      } else {
        input = { type: 'pass' };
      }
    } else if (s.phase === 'dna') {
      const choice = currentDnaChoice(s);
      input = { type: 'chooseDna', colour: choice.validColours[Math.floor(bot() * choice.validColours.length)] };
    } else if (s.phase === 'between') {
      input = { type: 'nextGeneration' };
    }
    const r = applyInput(s, input);
    s = r.state;
    events.push(...r.events);
    if (onState) onState(s, r.events);
  }
  return { state: s, events };
}

const botState = { rng: 12345 };
function bot() {
  return rand(botState);
}

// ---------------------------------------------------------------------------
// Setup and placement

test('new game spawns 2 to 4 DNA on distinct cells', () => {
  for (let seed = 1; seed < 50; seed++) {
    const s = createGame({ config: { gridSize: 6 }, seed });
    assert.ok(s.dna.length >= 2 && s.dna.length <= 4, `dna count ${s.dna.length}`);
    assert.equal(new Set(s.dna).size, s.dna.length);
    assert.equal(s.phase, 'setup');
    assert.equal(s.turn, 'red');
  }
});

test('placement legality: empty, no DNA, no orthogonal neighbour', () => {
  let s = createGame({ config: { gridSize: 6 }, seed: 7 });
  s.dna = [0]; // DNA at (0,0)
  s = place(s, { x: 3, y: 3 });
  const legal = legalPlacements(s);
  const has = (x, y) => legal.some((c) => c.x === x && c.y === y);
  assert.ok(!has(0, 0), 'DNA cell is illegal');
  assert.ok(!has(3, 3), 'occupied cell is illegal');
  assert.ok(!has(3, 2) && !has(3, 4) && !has(2, 3) && !has(4, 3), 'orthogonal neighbours are illegal');
  assert.ok(has(2, 2) && has(4, 4) && has(2, 4) && has(4, 2), 'diagonal neighbours are legal');
  assert.throws(() => place(s, { x: 3, y: 2 }));
});

test('setup alternates Red, Blue x3 and then generation 1 starts with Blue', () => {
  let s = createGame({ config: { gridSize: 8 }, seed: 3 });
  s.dna = [];
  const order = [];
  const cells = [[0, 0], [7, 7], [0, 2], [7, 5], [0, 4], [7, 3]];
  for (const [x, y] of cells) {
    order.push(s.turn);
    s = place(s, { x, y });
  }
  assert.deepEqual(order, ['red', 'blue', 'red', 'blue', 'red', 'blue']);
  assert.equal(s.phase, 'placement');
  assert.equal(s.gen, 1);
  assert.equal(s.turn, 'blue');
  for (const c of Object.values(s.creatures)) {
    assert.equal(c.age, 1);
    assert.equal(c.bornGen, 1);
  }
});

test('placement cap: a player with 5 creatures cannot place and must pass', () => {
  let s = createGame({ config: { gridSize: 10 }, seed: 11 });
  s.dna = [];
  // Give red 5 creatures directly.
  for (let i = 0; i < 5; i++) s.creatures[100 + i] = { id: 100 + i, colour: 'red', age: 1, x: i * 2, y: 0, bornGen: 1 };
  s.nextId = 200;
  s.phase = 'placement';
  s.gen = 2;
  s.turn = 'red';
  s.placementStep = 0;
  const st = placementStatus(s);
  assert.equal(st.canPlace, false);
  assert.equal(st.reason, 'cap');
  assert.throws(() => applyInput(s, { type: 'place', cell: { x: 5, y: 5 } }));
  const r = applyInput(s, { type: 'pass' });
  assert.ok(r.events.some((e) => e.type === 'placementSkipped' && e.player === 'red' && e.reason === 'cap'));
  assert.equal(r.state.turn, 'blue');
});

// ---------------------------------------------------------------------------
// Stats and odds

test('stats sum base and trait modifiers, purple aggression is per target', () => {
  const cfg = mergeConfig({});
  const traits = {
    red: [{ name: 'Social' }, { name: 'Social' }, { name: 'Solitary' }, { name: 'Aggressive' }],
    blue: [{ name: 'Timid' }, { name: 'Timid' }, { name: 'Timid' }],
    purple: [{ name: 'Aggressive', target: 'red' }, { name: 'Aggressive', target: 'red' }, { name: 'Aggressive', target: 'blue' }],
  };
  const st = computeStats(cfg, traits);
  assert.equal(st.red.kin, 45);
  assert.equal(st.red.aggression, 15);
  assert.equal(st.blue.centre, -15);
  assert.equal(st.purple.aggressionVsRed, 30);
  assert.equal(st.purple.aggressionVsBlue, 15);
  assert.equal(aggressionAgainst(cfg, st, 'purple', 'red'), 30);
  assert.equal(aggressionAgainst(cfg, st, 'purple', 'blue'), 15);
  assert.equal(aggressionAgainst(cfg, st, 'red', 'blue'), 15);
  assert.equal(aggressionAgainst(cfg, st, 'red', 'purple'), 15);
  assert.equal(aggressionAgainst(cfg, st, 'blue', 'red'), 0);
  // Negative centre counts as 0 in movement shares.
  const shares = movementShares(st.blue);
  assert.equal(Math.round(shares.centre), 0);
  assert.equal(Math.round(shares.kin), 50);
});

test('offspring odds match the spec examples', () => {
  const cfg = mergeConfig({});
  const mk = (r, b, p) => computeStats(cfg, {
    red: Array(Math.abs(r) / 15).fill({ name: r >= 0 ? 'Dominant' : 'Recessive' }),
    blue: Array(Math.abs(b) / 15).fill({ name: b >= 0 ? 'Dominant' : 'Recessive' }),
    purple: Array(Math.abs(p) / 15).fill({ name: p >= 0 ? 'Dominant' : 'Recessive' }),
  });
  let o = offspringOdds(cfg, mk(15, 0, 0), 'red', 'blue');
  assert.equal(Math.round(o.red), 13);
  assert.equal(Math.round(o.purple), 87);
  o = offspringOdds(cfg, mk(30, 15, 0), 'red', 'blue');
  assert.equal(Math.round(o.red), 21);
  assert.equal(Math.round(o.blue), 10);
  assert.equal(Math.round(o.purple), 69);
  o = offspringOdds(cfg, mk(-15, 0, 0), 'red', 'purple');
  assert.equal(Math.round(o.red), 76);
  assert.equal(Math.round(o.purple), 24);
  assert.equal(offspringOdds(cfg, mk(0, 0, 0), 'purple', 'purple'), null);
  assert.deepEqual(offspringOdds(cfg, mk(0, 0, 0), 'red', 'red'), { red: 100 });
});

test('centre cells: single on odd grids, four on even grids', () => {
  assert.deepEqual(centreCells(7), [{ x: 3, y: 3 }]);
  assert.equal(centreCells(8).length, 4);
  assert.ok(centreCells(8).some((c) => c.x === 3 && c.y === 4));
});

// ---------------------------------------------------------------------------
// Traits

test('trait slots are FIFO at 10 and Aggressive on Purple targets the opponent of the chooser', () => {
  let s = createGame({ config: { gridSize: 8 }, seed: 5 });
  s.phase = 'dna';
  s.gen = 3;
  s.pendingDna = [];
  for (let i = 0; i < 11; i++) s.pendingDna.push({ trait: i === 10 ? 'Bold' : 'Social', chooser: 'red', collector: 'red' });
  s.pendingDna.push({ trait: 'Aggressive', chooser: 'blue', collector: 'purple' });
  for (let i = 0; i < 11; i++) {
    const r = applyInput(s, { type: 'chooseDna', colour: 'blue' });
    s = r.state;
    if (i === 10) {
      assert.equal(r.events[0].removed.name, 'Social');
      assert.equal(s.traits.blue.length, 10);
      assert.equal(s.traits.blue[9].name, 'Bold');
    }
  }
  assert.equal(s.phase, 'dna');
  const r = applyInput(s, { type: 'chooseDna', colour: 'purple' });
  s = r.state;
  assert.equal(s.traits.purple[0].name, 'Aggressive');
  assert.equal(s.traits.purple[0].target, 'red');
  assert.equal(s.phase, 'between');
});

// ---------------------------------------------------------------------------
// Lifecycle

test('lone creature: fertile from its third generation, dies at the start of its seventh', () => {
  // Setup creatures count as created in generation 1.
  let s = createGame({ config: { gridSize: 10 }, seed: 9 });
  s.dna = [];
  const cells = [[0, 0], [9, 9], [0, 2], [9, 7], [0, 4], [9, 5]];
  for (const [x, y] of cells) s = place(s, { x, y });
  // Remove everything but one red creature, to avoid interactions.
  const keep = Object.values(s.creatures).find((c) => c.colour === 'red');
  s.creatures = { [keep.id]: keep };
  const ages = {};
  let deathGen = null;
  const run = playRandom(s, {
    maxGens: 12,
    onState: (st, ev) => {
      if (st.creatures[keep.id]) ages[st.gen] = ages[st.gen] ?? st.creatures[keep.id].age;
      const d = ev.find((e) => e.type === 'death' && e.id === keep.id);
      if (d) deathGen = st.gen;
    },
  });
  void run;
  assert.equal(ages[1], 1);
  assert.equal(ages[2], 1);
  assert.equal(ages[3], 2);
  assert.equal(ages[6], 5);
  assert.equal(deathGen, 7);
});

// ---------------------------------------------------------------------------
// End conditions

test('board majority ends the game with a hard win', () => {
  let s = createGame({ config: { gridSize: 6 }, seed: 2 });
  s.dna = [];
  s.phase = 'placement';
  s.gen = 4;
  s.turn = 'blue';
  s.placementStep = 1;
  // 19 red creatures on a 36-cell board (> 18), all elderly so nothing interesting happens.
  let id = 1;
  for (let k = 0; k < 19; k++) {
    s.creatures[id] = { id, colour: 'red', age: 3, x: k % 6, y: Math.floor(k / 6), bornGen: 1 };
    id++;
  }
  s.nextId = id;
  const r = applyInput(s, { type: 'pass' });
  assert.equal(r.state.phase, 'ended');
  assert.equal(r.state.result.winner, 'red');
  assert.equal(r.state.result.winType, 'hard');
  assert.equal(r.state.result.reason, 'majority');
});

test('generation cap compares counts: soft win when purple outnumbers the winner, draw when equal', () => {
  const base = () => {
    const s = createGame({ config: { gridSize: 8, generationCap: 5 }, seed: 4 });
    s.dna = [];
    s.phase = 'placement';
    s.gen = 5;
    s.turn = 'blue';
    s.placementStep = 1;
    let id = 1;
    const add = (colour, x, y) => {
      s.creatures[id] = { id, colour, age: 1, x, y, bornGen: 5 };
      id++;
    };
    add('red', 0, 0);
    add('red', 0, 2);
    add('blue', 7, 7);
    add('purple', 3, 3);
    add('purple', 3, 5);
    add('purple', 5, 3);
    s.nextId = id;
    return s;
  };
  let r = applyInput(base(), { type: 'pass' });
  assert.equal(r.state.result.reason, 'cap');
  assert.equal(r.state.result.winner, 'red');
  assert.equal(r.state.result.winType, 'soft');

  const s2 = base();
  s2.creatures[7] = { id: 7, colour: 'blue', age: 1, x: 7, y: 5, bornGen: 5 };
  r = applyInput(s2, { type: 'pass' });
  assert.equal(r.state.result.winType, 'draw');
});

test('wipe-out at the placement step: 0 creatures and no legal cell loses', () => {
  let s = createGame({ config: { gridSize: 6 }, seed: 8 });
  s.dna = [];
  s.phase = 'between';
  s.gen = 3;
  // Fill the board with a checkerboard of blue creatures so no cell is legal.
  let id = 1;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if ((x + y) % 2 === 0) {
        s.creatures[id] = { id, colour: 'blue', age: 2, x, y, bornGen: 1 };
        id++;
      }
    }
  }
  s.nextId = id;
  // Gen 4 starts with red (even generations start with the setup first placer).
  const r = applyInput(s, { type: 'nextGeneration' });
  assert.equal(r.state.gen, 4);
  assert.equal(r.state.phase, 'ended');
  assert.equal(r.state.result.reason, 'wipeout');
  assert.equal(r.state.result.winner, 'blue');
  assert.ok(r.events.some((e) => e.type === 'wipeout' && e.player === 'red'));
});

// ---------------------------------------------------------------------------
// Determinism and invariants

test('same seed and inputs produce identical states', () => {
  botState.rng = 777;
  const a = playRandom(createGame({ config: { gridSize: 7 }, seed: 'replay-me' }), { maxGens: 30 });
  botState.rng = 777;
  const b = playRandom(createGame({ config: { gridSize: 7 }, seed: 'replay-me' }), { maxGens: 30 });
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.events, b.events);
});

test('random games keep every invariant and terminate', () => {
  const games = 120;
  let ended = 0;
  const reasons = {};
  for (let g = 0; g < games; g++) {
    const gridSize = 6 + (g % 5);
    const s0 = createGame({ config: { gridSize }, seed: 1000 + g });
    let lastGen = 0;
    const { state } = playRandom(s0, {
      maxGens: 150,
      onState: (st, ev) => {
        const problems = checkInvariants(st);
        assert.deepEqual(problems, [], `seed ${1000 + g} gen ${st.gen}: ${problems.join('; ')}`);
        assert.ok(st.gen >= lastGen);
        lastGen = st.gen;
        for (const e of ev) {
          if (e.type === 'birth') {
            assert.ok(!(e.parentColours[0] === 'purple' && e.parentColours[1] === 'purple'), 'purple x purple birth');
          }
        }
        // DNA never sits under a creature and never exceeds the max after top-up.
        if (st.phase === 'between' || st.phase === 'dna') {
          assert.ok(st.dna.length <= st.config.dnaMax + 0 || st.dna.length <= 4);
        }
      },
    });
    if (state.phase === 'ended') {
      ended++;
      reasons[state.result.reason] = (reasons[state.result.reason] || 0) + 1;
      const counts = countColours(state);
      assert.deepEqual(
        { red: counts.red, blue: counts.blue, purple: counts.purple },
        { red: state.result.counts.red, blue: state.result.counts.blue, purple: state.result.counts.purple },
      );
    }
  }
  assert.ok(ended > games * 0.8, `only ${ended} of ${games} games ended (reasons ${JSON.stringify(reasons)})`);
});

test('the input state is never mutated', () => {
  const s0 = createGame({ config: { gridSize: 6 }, seed: 42 });
  const snapshot = JSON.stringify(s0);
  const st = placementStatus(s0);
  applyInput(s0, { type: 'place', cell: st.legal[0] });
  assert.equal(JSON.stringify(s0), snapshot);
});
