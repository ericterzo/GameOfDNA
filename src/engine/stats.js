// Stat computation: base values plus active trait modifiers, and the derived
// percentages the rules and the UI both need.

import { COLOURS, traitDelta } from './config.js';

const floor0 = (v) => (v > 0 ? v : 0);

// Returns { red: {...}, blue: {...}, purple: {...} }.
// Purple carries aggressionVsRed / aggressionVsBlue instead of a single aggression.
export function computeStats(config, traits) {
  const out = {};
  for (const colour of COLOURS) {
    const st = { ...config.baseStats };
    if (colour === 'purple') {
      st.aggressionVsRed = config.baseStats.aggression;
      st.aggressionVsBlue = config.baseStats.aggression;
      delete st.aggression;
    }
    for (const t of traits[colour] || []) {
      const def = config.traits[t.name];
      if (!def) continue;
      const delta = t.delta ?? traitDelta(def, config);
      if (def.stat === 'aggression' && colour === 'purple') {
        if (t.target === 'red') st.aggressionVsRed += delta;
        else if (t.target === 'blue') st.aggressionVsBlue += delta;
      } else {
        st[def.stat] += delta;
      }
    }
    out[colour] = st;
  }
  return out;
}

// Effective aggression % of `mover` colour against `target` colour.
export function aggressionAgainst(config, stats, mover, target) {
  if (mover === target) return 0;
  let v;
  if (mover === 'purple') {
    if (target === 'red') v = stats.purple.aggressionVsRed;
    else if (target === 'blue') v = stats.purple.aggressionVsBlue;
    else v = 0;
  } else {
    v = stats[mover].aggression;
  }
  return Math.min(config.aggressionCap, floor0(v));
}

// Movement mode shares in % for one colour's stats.
export function movementShares(st) {
  const c = floor0(st.centre);
  const k = floor0(st.kin);
  const r = floor0(st.random);
  const total = c + k + r;
  if (total <= 0) return { centre: 0, kin: 0, random: 100 };
  return { centre: (c / total) * 100, kin: (k / total) * 100, random: (r / total) * 100 };
}

// Raw offspring weights for a pairing of two colours (unordered).
// Returns an object of colour -> weight (already floored at 0), or null when the
// pairing cannot breed (Purple x Purple).
export function offspringWeights(config, stats, a, b) {
  if (a === b) {
    if (a === 'purple') return null;
    return { [a]: 100 };
  }
  const has = (x) => a === x || b === x;
  let base;
  if (has('red') && has('blue')) base = config.pairing.redBlue;
  else if (has('red') && has('purple')) base = config.pairing.redPurple;
  else base = config.pairing.bluePurple;

  const w = {};
  for (const [colour, v] of Object.entries(base)) {
    let val = v;
    if (colour === a || colour === b) val += stats[colour].dominance;
    w[colour] = floor0(val);
  }
  let total = 0;
  for (const v of Object.values(w)) total += v;
  if (total <= 0) {
    // Everything floored to 0: fall back to the base weights.
    for (const [colour, v] of Object.entries(base)) w[colour] = floor0(v);
  }
  return w;
}

// Weights normalised to percentages.
export function offspringOdds(config, stats, a, b) {
  const w = offspringWeights(config, stats, a, b);
  if (!w) return null;
  let total = 0;
  for (const v of Object.values(w)) total += v;
  const out = {};
  for (const [colour, v] of Object.entries(w)) out[colour] = total > 0 ? (v / total) * 100 : 0;
  return out;
}

export function pairingOdds(config, stats) {
  return {
    redBlue: offspringOdds(config, stats, 'red', 'blue'),
    redPurple: offspringOdds(config, stats, 'red', 'purple'),
    bluePurple: offspringOdds(config, stats, 'blue', 'purple'),
  };
}

export function fertilityPct(st, kind) {
  return floor0(kind === 'diagonal' ? st.diagFert : st.orthoFert);
}
