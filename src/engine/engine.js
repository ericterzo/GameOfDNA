// Creatures rules engine.
//
// Pure module: `applyInput(state, input)` returns a new state plus an event
// log; the input state is never mutated. The engine pauses whenever it needs a
// player decision (placements, DNA trait assignment, the go-ahead for the next
// generation) and the driver (UI or a headless simulator) feeds it inputs.
//
// Phases:
//   setup      -> expects { type: 'place', cell } from state.turn
//   placement  -> expects { type: 'place', cell } or { type: 'pass' } from state.turn
//   dna        -> expects { type: 'chooseDna', colour } from state.pendingDna[0].chooser
//   between    -> expects { type: 'nextGeneration' }
//   ended      -> no inputs accepted

import { COLOURS, PLAYERS, mergeConfig, opponentOf } from './config.js';
import { randInt, pick, shuffle, chance, weightedPick, normaliseSeed } from './rng.js';
import { computeStats, aggressionAgainst, offspringWeights, fertilityPct } from './stats.js';

const DIRS = [
  { dx: 0, dy: -1, name: 'up' },
  { dx: 0, dy: 1, name: 'down' },
  { dx: -1, dy: 0, name: 'left' },
  { dx: 1, dy: 0, name: 'right' },
];

const NEIGHBOURS8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],          [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

export const STATE_VERSION = 1;

// ---------------------------------------------------------------------------
// Construction

export function createGame({ config = {}, seed } = {}) {
  const cfg = mergeConfig(config);
  const seedValue = normaliseSeed(seed);
  const n = cfg.gridSize;
  const s = {
    version: STATE_VERSION,
    config: cfg,
    seed: seedValue,
    rng: seedValue,
    n,
    gen: 0,
    phase: 'setup',
    turn: cfg.firstPlacer,
    placementStep: 0,
    setupPlaced: { red: 0, blue: 0 },
    nextId: 1,
    creatures: {},
    dna: [],
    traits: { red: [], blue: [], purple: [] },
    pendingDna: [],
    result: null,
    counters: {
      births: { collision: 0, orthogonal: 0, diagonal: 0 },
      birthsByColour: { red: 0, blue: 0, purple: 0 },
      kills: { red: 0, blue: 0, purple: 0 },      // by killer colour
      killed: { red: 0, blue: 0, purple: 0 },     // by victim colour
      deaths: 0,
      pickups: { red: 0, blue: 0, purple: 0 },
      placements: { red: 0, blue: 0 },
      passes: { red: 0, blue: 0 },
      blockedMoves: 0,
      moves: 0,
      peak: { red: 0, blue: 0, purple: 0 },
      firstHalfFullGen: null,
    },
  };
  const target = randInt(s, cfg.dnaMin, cfg.dnaMax);
  spawnDna(s, target, []);
  return s;
}

// ---------------------------------------------------------------------------
// Queries (safe on any state, never mutate)

export function cellKey(n, x, y) {
  return y * n + x;
}

export function inBounds(n, x, y) {
  return x >= 0 && y >= 0 && x < n && y < n;
}

export function occupancy(state) {
  const occ = new Array(state.n * state.n).fill(0);
  for (const c of Object.values(state.creatures)) occ[c.y * state.n + c.x] = c.id;
  return occ;
}

export function creatureAt(state, x, y) {
  for (const c of Object.values(state.creatures)) if (c.x === x && c.y === y) return c;
  return null;
}

export function countColours(state) {
  const counts = { red: 0, blue: 0, purple: 0, total: 0 };
  for (const c of Object.values(state.creatures)) {
    counts[c.colour]++;
    counts.total++;
  }
  return counts;
}

export function legalPlacements(state) {
  const n = state.n;
  const occ = occupancy(state);
  const dnaSet = new Set(state.dna);
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x;
      if (occ[k] || dnaSet.has(k)) continue;
      let blocked = false;
      for (const d of DIRS) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (inBounds(n, nx, ny) && occ[ny * n + nx]) {
          blocked = true;
          break;
        }
      }
      if (!blocked) cells.push({ x, y });
    }
  }
  return cells;
}

// Who acts, whether they may place, and why not.
export function placementStatus(state) {
  if (state.phase !== 'setup' && state.phase !== 'placement') return null;
  const player = state.turn;
  const legal = legalPlacements(state);
  const counts = countColours(state);
  let canPlace = true;
  let reason = null;
  if (state.phase === 'placement' && counts[player] >= state.config.placementCap) {
    canPlace = false;
    reason = 'cap';
  } else if (legal.length === 0) {
    canPlace = false;
    reason = 'noCell';
  }
  return { player, canPlace, reason, legal, count: counts[player] };
}

export function firstPlayerOfGeneration(state, gen) {
  const first = state.config.firstPlacer;
  // Gen 1 starts with the player who placed second in setup.
  return gen % 2 === 1 ? opponentOf(first) : first;
}

export function currentStats(state) {
  return computeStats(state.config, state.traits);
}

export function currentDnaChoice(state) {
  if (state.phase !== 'dna' || state.pendingDna.length === 0) return null;
  const entry = state.pendingDna[0];
  return { ...entry, validColours: validColoursForTrait(state, entry.trait) };
}

// C9: every current trait affects Purple, so all three colours are valid. Kept
// as a hook for future traits that might not apply to Purple.
export function validColoursForTrait(state, traitName) {
  const def = state.config.traits[traitName];
  if (!def) return [...COLOURS];
  return [...COLOURS];
}

export function isFertile(state, c) {
  return c.age >= state.config.fertileAge && c.bornGen < state.gen;
}

export function centreCells(n) {
  if (n % 2 === 1) {
    const m = (n - 1) / 2;
    return [{ x: m, y: m }];
  }
  const a = n / 2 - 1;
  const b = n / 2;
  return [{ x: a, y: a }, { x: b, y: a }, { x: a, y: b }, { x: b, y: b }];
}

// ---------------------------------------------------------------------------
// Input handling

export function applyInput(state, input) {
  const s = structuredClone(state);
  const events = [];
  switch (s.phase) {
    case 'setup':
      handleSetup(s, input, events);
      break;
    case 'placement':
      handlePlacement(s, input, events);
      break;
    case 'dna':
      handleDna(s, input, events);
      break;
    case 'between':
      if (input.type !== 'nextGeneration') throw new Error(`Expected nextGeneration, got ${input.type}`);
      startGeneration(s, events);
      break;
    case 'ended':
      throw new Error('Game has ended');
    default:
      throw new Error(`Unknown phase ${s.phase}`);
  }
  return { state: s, events };
}

function handleSetup(s, input, events) {
  const player = s.turn;
  if (input.type === 'place') {
    placeCreature(s, player, input.cell, events);
    s.setupPlaced[player]++;
  } else if (input.type === 'pass') {
    if (legalPlacements(s).length > 0) throw new Error('Cannot pass while a legal cell exists during setup');
    s.setupPlaced[player]++;
    events.push({ type: 'placementSkipped', player, reason: 'noCell' });
  } else {
    throw new Error(`Unexpected input ${input.type} during setup`);
  }
  const cap = s.config.initialPlacements;
  if (s.setupPlaced.red >= cap && s.setupPlaced.blue >= cap) {
    startGeneration(s, events);
  } else {
    s.turn = opponentOf(player);
    if (s.setupPlaced[s.turn] >= cap) s.turn = player; // the other side has finished
  }
}

function handlePlacement(s, input, events) {
  const player = s.turn;
  if (input.type === 'place') {
    const counts = countColours(s);
    if (counts[player] >= s.config.placementCap) throw new Error(`${player} already has ${counts[player]} creatures`);
    placeCreature(s, player, input.cell, events);
    s.counters.placements[player]++;
  } else if (input.type === 'pass') {
    const st = placementStatus(s);
    events.push({ type: 'placementSkipped', player, reason: st.canPlace ? 'voluntary' : st.reason });
    s.counters.passes[player]++;
  } else {
    throw new Error(`Unexpected input ${input.type} during placement`);
  }

  if (s.placementStep === 0) {
    s.placementStep = 1;
    s.turn = opponentOf(player);
    enterPlacementStep(s, events);
  } else {
    resolveGeneration(s, events);
  }
}

function handleDna(s, input, events) {
  if (input.type !== 'chooseDna') throw new Error(`Expected chooseDna, got ${input.type}`);
  const entry = s.pendingDna[0];
  if (!entry) throw new Error('No pending DNA choice');
  const colour = input.colour;
  if (!COLOURS.includes(colour)) throw new Error(`Invalid colour ${colour}`);
  if (!validColoursForTrait(s, entry.trait).includes(colour)) throw new Error(`${colour} is not valid for ${entry.trait}`);
  s.pendingDna.shift();
  addTrait(s, colour, entry, events);
  if (s.pendingDna.length === 0) s.phase = 'between';
}

function placeCreature(s, player, cell, events) {
  if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) throw new Error('Placement needs a cell {x, y}');
  const legal = legalPlacements(s).some((c) => c.x === cell.x && c.y === cell.y);
  if (!legal) throw new Error(`Cell ${cell.x},${cell.y} is not a legal placement`);
  const c = addCreature(s, player, cell.x, cell.y);
  events.push({ type: 'placed', id: c.id, colour: player, cell: { x: c.x, y: c.y }, player });
  return c;
}

function addCreature(s, colour, x, y) {
  const id = s.nextId++;
  const c = { id, colour, age: 1, x, y, bornGen: Math.max(1, s.gen) };
  s.creatures[id] = c;
  return c;
}

function addTrait(s, colour, entry, events) {
  const trait = { name: entry.trait, gen: s.gen };
  const def = s.config.traits[entry.trait];
  if (def && def.stat === 'aggression' && colour === 'purple') {
    trait.target = opponentOf(entry.chooser);
  }
  s.traits[colour].push(trait);
  let removed = null;
  if (s.traits[colour].length > s.config.traitSlots) removed = s.traits[colour].shift();
  events.push({ type: 'traitAdded', colour, trait, removed, chooser: entry.chooser, collector: entry.collector });
}

// ---------------------------------------------------------------------------
// Generation flow

function startGeneration(s, events) {
  s.gen++;
  s.phase = 'placement';
  s.placementStep = 0;
  s.turn = firstPlayerOfGeneration(s, s.gen);
  events.push({ type: 'generationStart', gen: s.gen });

  // 4.1 Deaths
  for (const c of Object.values(s.creatures)) {
    if (c.age >= s.config.deathAge) {
      delete s.creatures[c.id];
      s.counters.deaths++;
      events.push({ type: 'death', id: c.id, colour: c.colour, cell: { x: c.x, y: c.y } });
    }
  }

  enterPlacementStep(s, events);
}

// Wipe-out check when a player's placement step begins.
function enterPlacementStep(s, events) {
  const player = s.turn;
  if (isWipedOut(s, player)) {
    const other = opponentOf(player);
    const otherWiped = isWipedOut(s, other);
    events.push({ type: 'wipeout', player });
    if (otherWiped) {
      events.push({ type: 'wipeout', player: other });
      endGame(s, events, { winner: null, winType: 'draw', reason: 'wipeout' });
    } else {
      endGame(s, events, { winner: other, winType: 'hard', reason: 'wipeout', loser: player });
    }
  }
}

function isWipedOut(s, player) {
  const counts = countColours(s);
  if (counts[player] > 0) return false;
  return legalPlacements(s).length === 0;
}

function endGame(s, events, result) {
  const counts = countColours(s);
  s.result = { ...result, counts, gens: s.gen };
  s.phase = 'ended';
  s.pendingDna = [];
  events.push({ type: 'ended', result: s.result });
}

function resolveGeneration(s, events) {
  const cfg = s.config;
  const stats = computeStats(cfg, s.traits);
  const occ = occupancy(s);
  const bred = new Set();
  const ctx = { stats, occ, bred };

  // 4.3 Movement
  const order = shuffle(s, Object.keys(s.creatures).map(Number));
  events.push({ type: 'movementStart', order });
  for (const id of order) {
    const c = s.creatures[id];
    if (!c) continue; // killed earlier this phase
    moveCreature(s, c, ctx, events);
  }

  // 4.4 Adjacency procreation
  const fertile = Object.values(s.creatures).filter((c) => isFertile(s, c));
  const pairs = [];
  for (let i = 0; i < fertile.length; i++) {
    for (let j = i + 1; j < fertile.length; j++) {
      const a = fertile[i];
      const b = fertile[j];
      if (a.colour === 'purple' && b.colour === 'purple') continue;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > 1 || dy > 1) continue;
      pairs.push({ a: a.id, b: b.id, kind: dx + dy === 1 ? 'orthogonal' : 'diagonal' });
    }
  }
  shuffle(s, pairs);
  if (pairs.length) events.push({ type: 'adjacencyStart', pairs: pairs.length });
  for (const p of pairs) {
    if (bred.has(p.a) || bred.has(p.b)) continue;
    const a = s.creatures[p.a];
    const b = s.creatures[p.b];
    if (!a || !b) continue;
    const pct = (fertilityPct(stats[a.colour], p.kind) + fertilityPct(stats[b.colour], p.kind)) / 2;
    if (chance(s, pct)) tryProcreate(s, a, b, p.kind, ctx, events);
  }

  // 4.6 Ageing
  const aged = [];
  for (const c of Object.values(s.creatures)) {
    if (c.bornGen < s.gen) {
      c.age++;
      aged.push(c.id);
    }
  }
  events.push({ type: 'age', ids: aged });

  // 4.7 DNA top-up
  if (s.dna.length < cfg.dnaMin) {
    const target = randInt(s, cfg.dnaMin, cfg.dnaMax);
    spawnDna(s, target, events);
  }

  // Bookkeeping
  const counts = countColours(s);
  for (const colour of COLOURS) s.counters.peak[colour] = Math.max(s.counters.peak[colour], counts[colour]);
  if (s.counters.firstHalfFullGen === null && counts.total > (s.n * s.n) / 2) s.counters.firstHalfFullGen = s.gen;

  // 4.8 End check
  checkEnd(s, events, counts);
  if (s.result) return;
  s.phase = s.pendingDna.length > 0 ? 'dna' : 'between';
}

function checkEnd(s, events, counts) {
  const cells = s.n * s.n;
  for (const p of PLAYERS) {
    if (counts[p] > cells / 2) {
      endGame(s, events, { winner: p, winType: 'hard', reason: 'majority' });
      return;
    }
  }
  if (counts.total >= cells) {
    endGame(s, events, compareCounts(counts, 'fullBoard'));
    return;
  }
  if (s.config.generationCap > 0 && s.gen >= s.config.generationCap) {
    endGame(s, events, compareCounts(counts, 'cap'));
  }
}

function compareCounts(counts, reason) {
  if (counts.red === counts.blue) return { winner: null, winType: 'draw', reason };
  const winner = counts.red > counts.blue ? 'red' : 'blue';
  const winType = counts[winner] > counts.purple ? 'hard' : 'soft';
  return { winner, winType, reason };
}

// ---------------------------------------------------------------------------
// Movement

function moveCreature(s, c, ctx, events) {
  const cfg = s.config;
  const n = s.n;
  const st = ctx.stats[c.colour];
  const weights = [st.centre, st.kin, st.random].map((v) => Math.max(0, v));
  let mode = weightedPick(s, ['centre', 'kin', 'random'], weights) || 'random';
  let target = null;

  if (mode === 'kin') {
    target = nearestKin(s, c);
    if (!target) mode = 'random';
  }
  if (mode === 'centre') {
    const cells = centreCells(n);
    target = cells.length === 1 ? cells[0] : pick(s, cells);
    if (target.x === c.x && target.y === c.y) {
      if (cfg.centreOnTarget === 'stay') {
        events.push({ type: 'stay', id: c.id, mode });
        return;
      }
      mode = 'random';
      target = null;
    }
  }

  let candidates;
  if (mode === 'random') {
    candidates = [pick(s, DIRS)];
  } else {
    const cur = Math.abs(target.x - c.x) + Math.abs(target.y - c.y);
    const better = DIRS.filter((d) => Math.abs(target.x - (c.x + d.dx)) + Math.abs(target.y - (c.y + d.dy)) < cur);
    candidates = shuffle(s, better.slice());
    if (candidates.length === 0) candidates = [pick(s, DIRS)];
  }

  let dir = candidates[0];
  if (cfg.retryBlockedStep && candidates.length > 1) {
    // C5: prefer a distance-reducing direction that is actually free.
    const free = candidates.find((d) => {
      const nx = c.x + d.dx;
      const ny = c.y + d.dy;
      return inBounds(n, nx, ny) && !ctx.occ[ny * n + nx];
    });
    if (free) dir = free;
  }

  const nx = c.x + dir.dx;
  const ny = c.y + dir.dy;
  const from = { x: c.x, y: c.y };
  if (!inBounds(n, nx, ny)) {
    s.counters.blockedMoves++;
    events.push({ type: 'blocked', id: c.id, mode, dir: dir.name, reason: 'edge', cell: from });
    return;
  }
  const occId = ctx.occ[ny * n + nx];
  if (!occId) {
    ctx.occ[c.y * n + c.x] = 0;
    c.x = nx;
    c.y = ny;
    ctx.occ[ny * n + nx] = c.id;
    s.counters.moves++;
    events.push({ type: 'move', id: c.id, mode, dir: dir.name, from, to: { x: nx, y: ny } });
    collectDnaIfPresent(s, c, events);
    return;
  }

  // Collision
  s.counters.blockedMoves++;
  const o = s.creatures[occId];
  events.push({ type: 'collision', moverId: c.id, occupantId: o.id, dir: dir.name, cell: from, target: { x: nx, y: ny } });
  if (o.colour !== c.colour) {
    const aggr = aggressionAgainst(cfg, ctx.stats, c.colour, o.colour);
    if (chance(s, aggr)) {
      delete s.creatures[o.id];
      ctx.occ[ny * n + nx] = 0;
      ctx.bred.delete(o.id);
      s.counters.kills[c.colour]++;
      s.counters.killed[o.colour]++;
      events.push({ type: 'kill', victimId: o.id, victimColour: o.colour, byId: c.id, byColour: c.colour, cell: { x: nx, y: ny } });
      if (cfg.moveIntoKilledCell) {
        ctx.occ[c.y * n + c.x] = 0;
        c.x = nx;
        c.y = ny;
        ctx.occ[ny * n + nx] = c.id;
        events.push({ type: 'move', id: c.id, mode, dir: dir.name, from, to: { x: nx, y: ny } });
        collectDnaIfPresent(s, c, events);
      }
      return;
    }
  }
  if (chance(s, cfg.collisionBirthChance)) tryProcreate(s, c, o, 'collision', ctx, events);
}

function nearestKin(s, c) {
  let best = Infinity;
  let cands = [];
  for (const o of Object.values(s.creatures)) {
    if (o.id === c.id || o.colour !== c.colour) continue;
    const d = Math.abs(o.x - c.x) + Math.abs(o.y - c.y);
    if (d < best) {
      best = d;
      cands = [o];
    } else if (d === best) {
      cands.push(o);
    }
  }
  if (cands.length === 0) return null;
  const k = cands.length === 1 ? cands[0] : pick(s, cands);
  return { x: k.x, y: k.y, id: k.id };
}

// ---------------------------------------------------------------------------
// Procreation

function tryProcreate(s, a, b, via, ctx, events) {
  if (!isFertile(s, a) || !isFertile(s, b)) return false;
  if (a.colour === 'purple' && b.colour === 'purple') return false;
  if (ctx.bred.has(a.id) || ctx.bred.has(b.id)) return false;
  ctx.bred.add(a.id);
  ctx.bred.add(b.id);

  const order = chance(s, 50) ? [a, b] : [b, a];
  for (const parent of order) {
    const empties = emptyNeighbours(s, ctx.occ, parent.x, parent.y);
    if (empties.length === 0) continue;
    const cell = pick(s, empties);
    const colour = offspringColour(s, ctx.stats, a.colour, b.colour);
    const child = addCreature(s, colour, cell.x, cell.y);
    ctx.occ[cell.y * s.n + cell.x] = child.id;
    s.counters.births[via]++;
    s.counters.birthsByColour[colour]++;
    events.push({
      type: 'birth',
      id: child.id,
      colour,
      cell,
      via,
      parents: [a.id, b.id],
      parentColours: [a.colour, b.colour],
      near: parent.id,
    });
    collectDnaIfPresent(s, child, events);
    return true;
  }
  events.push({ type: 'noRoom', parents: [a.id, b.id], via });
  return false;
}

function emptyNeighbours(s, occ, x, y) {
  const out = [];
  for (const [dx, dy] of NEIGHBOURS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(s.n, nx, ny) && !occ[ny * s.n + nx]) out.push({ x: nx, y: ny });
  }
  return out;
}

function offspringColour(s, stats, a, b) {
  const w = offspringWeights(s.config, stats, a, b);
  const colours = Object.keys(w);
  if (colours.length === 1) return colours[0];
  return weightedPick(s, colours, colours.map((c) => w[c])) || colours[0];
}

// ---------------------------------------------------------------------------
// DNA

function spawnDna(s, target, events) {
  const n = s.n;
  const occ = occupancy(s);
  const have = new Set(s.dna);
  const empties = [];
  for (let k = 0; k < n * n; k++) if (!occ[k] && !have.has(k)) empties.push(k);
  shuffle(s, empties);
  const added = [];
  while (s.dna.length < target && empties.length) {
    const k = empties.pop();
    s.dna.push(k);
    added.push({ x: k % n, y: Math.floor(k / n) });
  }
  if (added.length) events.push({ type: 'dnaSpawn', cells: added });
  return added;
}

function collectDnaIfPresent(s, c, events) {
  const k = c.y * s.n + c.x;
  const idx = s.dna.indexOf(k);
  if (idx < 0) return;
  s.dna.splice(idx, 1);

  const names = Object.keys(s.config.traits);
  const trait = weightedPick(s, names, names.map((t) => s.config.traits[t].weight ?? 1)) || names[0];

  let chooser;
  const counts = countColours(s);
  let reason = null;
  if (c.colour === 'purple') {
    if (counts.red < counts.blue) chooser = 'red';
    else if (counts.blue < counts.red) chooser = 'blue';
    else chooser = chance(s, 50) ? 'red' : 'blue';
    reason = counts.red === counts.blue ? 'tie' : 'fewer';
  } else {
    chooser = c.colour;
  }
  s.counters.pickups[c.colour]++;
  const entry = {
    trait,
    chooser,
    collector: c.colour,
    collectorId: c.id,
    cell: { x: c.x, y: c.y },
    gen: s.gen,
    counts: { red: counts.red, blue: counts.blue },
    reason,
  };
  s.pendingDna.push(entry);
  events.push({ type: 'pickup', id: c.id, colour: c.colour, cell: entry.cell, trait, chooser, reason });
}

// ---------------------------------------------------------------------------
// Debug invariants (used by tests and, later, the simulator)

export function checkInvariants(state) {
  const problems = [];
  const n = state.n;
  const seen = new Set();
  const counts = { red: 0, blue: 0, purple: 0 };
  for (const c of Object.values(state.creatures)) {
    if (!inBounds(n, c.x, c.y)) problems.push(`creature ${c.id} off board`);
    const k = c.y * n + c.x;
    if (seen.has(k)) problems.push(`two creatures in cell ${c.x},${c.y}`);
    seen.add(k);
    if (c.age < 1 || c.age > state.config.deathAge) problems.push(`creature ${c.id} age ${c.age}`);
    if (!COLOURS.includes(c.colour)) problems.push(`creature ${c.id} colour ${c.colour}`);
    counts[c.colour]++;
    if (state.dna.includes(k)) problems.push(`DNA under creature at ${c.x},${c.y}`);
  }
  if (new Set(state.dna).size !== state.dna.length) problems.push('duplicate DNA cells');
  for (const colour of COLOURS) {
    if (state.traits[colour].length > state.config.traitSlots) problems.push(`${colour} has too many traits`);
  }
  const rec = countColours(state);
  for (const colour of COLOURS) if (rec[colour] !== counts[colour]) problems.push(`count mismatch for ${colour}`);
  if (state.phase === 'placement' || state.phase === 'setup') {
    if (!PLAYERS.includes(state.turn)) problems.push(`bad turn ${state.turn}`);
  }
  return problems;
}
