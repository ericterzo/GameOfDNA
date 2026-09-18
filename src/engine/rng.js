// Seedable RNG (mulberry32). The generator state is a single 32-bit integer
// stored on the game state as `state.rng`, so a state snapshot is fully
// replayable and serialisable.

export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Integer in [lo, hi], inclusive.
export function randInt(state, lo, hi) {
  return lo + Math.floor(rand(state) * (hi - lo + 1));
}

export function pick(state, arr) {
  return arr[Math.floor(rand(state) * arr.length)];
}

// In-place Fisher-Yates shuffle.
export function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(state) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Percentage roll. Always consumes exactly one random number.
export function chance(state, pct) {
  const r = rand(state) * 100;
  return r < pct;
}

// Weighted choice. Negative weights count as 0. Returns null if all weights are 0.
export function weightedPick(state, items, weights) {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return null;
  let r = rand(state) * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, weights[i]);
    if (r < w) return items[i];
    r -= w;
  }
  return items[items.length - 1];
}

// Derive a 32-bit seed from any string (cyrb53 folded to 32 bits).
export function seedFromString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

// Accepts a number, a numeric string or any other string and returns a 32-bit seed.
export function normaliseSeed(seed) {
  if (seed === undefined || seed === null || seed === '') return randomSeed();
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed).trim();
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  return seedFromString(s);
}
