// HTML builders for the trait panel, stats section, DNA choice modal and end
// screen. Pure functions of the game state: they return markup strings.

import { COLOURS, computeStats, movementShares, pairingOdds, aggressionAgainst, opponentOf } from '../engine/index.js';
import { traitIcon, traitBlurb, traitEffect, capitalise, COLOUR_NAMES } from './traitInfo.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pct = (v) => `${Math.round(v)}%`;

export function traitsHtml(state, highlight) {
  const slots = state.config.traitSlots;
  return COLOURS.map((colour) => {
    const list = state.traits[colour];
    const full = list.length >= slots;
    const lines = list.length
      ? list.map((t, i) => {
          const def = state.config.traits[t.name];
          const isNew = highlight && highlight.colour === colour && i === list.length - 1;
          const cls = ['trait-line', full && i === 0 ? 'next-out' : '', isNew ? 'new' : ''].filter(Boolean).join(' ');
          const name = t.target ? `${t.name} vs ${COLOUR_NAMES[t.target]}` : t.name;
          return `<div class="${cls}"><span class="icon">${traitIcon(t.name)}</span><span class="name">${esc(name)}</span><span class="eff">${esc(traitEffectShort(def))}</span></div>`;
        }).join('')
      : `<div class="trait-empty">No traits yet</div>`;
    return `<div class="trait-col ${colour}"><h4><span>${COLOUR_NAMES[colour]}</span><span class="slots">${list.length}/${slots}</span></h4>${lines}</div>`;
  }).join('');
}

function traitEffectShort(def) {
  if (!def) return '';
  return `${def.delta >= 0 ? '+' : ''}${def.delta}`;
}

export function statsHtml(state) {
  const cfg = state.config;
  const stats = computeStats(cfg, state.traits);
  const shares = {};
  for (const c of COLOURS) shares[c] = movementShares(stats[c]);
  const cell = (fn) => COLOURS.map((c) => `<td class="c-${c}">${fn(c)}</td>`).join('');
  const rows = [
    ['Centre', (c) => pct(shares[c].centre) + sub(stats[c].centre)],
    ['Kin', (c) => pct(shares[c].kin) + sub(stats[c].kin)],
    ['Random', (c) => pct(shares[c].random) + sub(stats[c].random)],
    ['Ortho fertility', (c) => pct(Math.max(0, stats[c].orthoFert))],
    ['Diag fertility', (c) => pct(Math.max(0, stats[c].diagFert))],
    ['Dominance', (c) => String(stats[c].dominance)],
    ['Aggression', (c) => (c === 'purple'
      ? `<span class="sub">vs R</span> ${pct(aggressionAgainst(cfg, stats, 'purple', 'red'))}<br><span class="sub">vs B</span> ${pct(aggressionAgainst(cfg, stats, 'purple', 'blue'))}`
      : pct(aggressionAgainst(cfg, stats, c, opponentOf(c))))],
  ];
  const table = `<table><thead><tr><th></th>${COLOURS.map((c) => `<th class="c-${c}">${COLOUR_NAMES[c]}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, fn]) => `<tr><td>${label}</td>${cell(fn)}</tr>`).join('')}</tbody></table>`;

  const odds = pairingOdds(cfg, stats);
  const fmt = (o) => Object.entries(o).map(([c, v]) => `<span class="c-${c}">${COLOUR_NAMES[c][0]} ${pct(v)}</span>`).join(' · ');
  const pairs = `<div class="pairs">
    <div class="panel-title" style="margin-top:8px">Offspring odds</div>
    <div class="pair"><span><span class="c-red">Red</span> × <span class="c-blue">Blue</span></span><span class="out">${fmt(odds.redBlue)}</span></div>
    <div class="pair"><span><span class="c-red">Red</span> × <span class="c-purple">Purple</span></span><span class="out">${fmt(odds.redPurple)}</span></div>
    <div class="pair"><span><span class="c-blue">Blue</span> × <span class="c-purple">Purple</span></span><span class="out">${fmt(odds.bluePurple)}</span></div>
  </div>`;
  return table + pairs;
}

function sub(raw) {
  return ` <span class="sub">(${raw})</span>`;
}

// Preview line for the DNA modal: what changes for `colour` if it takes the trait.
export function traitPreview(state, traitName, colour, chooser) {
  const cfg = state.config;
  const def = cfg.traits[traitName];
  if (!def) return '';
  const before = computeStats(cfg, state.traits);
  const traits = structuredClone(state.traits);
  const entry = { name: traitName };
  if (def.stat === 'aggression' && colour === 'purple') entry.target = opponentOf(chooser);
  traits[colour].push(entry);
  const after = computeStats(cfg, traits);
  switch (def.stat) {
    case 'centre':
    case 'kin':
    case 'random': {
      const b = movementShares(before[colour])[def.stat];
      const a = movementShares(after[colour])[def.stat];
      return `${capitalise(def.stat)} ${pct(b)} → ${pct(a)}`;
    }
    case 'orthoFert':
      return `Ortho ${pct(Math.max(0, before[colour].orthoFert))} → ${pct(Math.max(0, after[colour].orthoFert))}`;
    case 'diagFert':
      return `Diag ${pct(Math.max(0, before[colour].diagFert))} → ${pct(Math.max(0, after[colour].diagFert))}`;
    case 'dominance':
      return `Dominance ${before[colour].dominance} → ${after[colour].dominance}`;
    case 'aggression': {
      if (colour === 'purple') {
        const t = opponentOf(chooser);
        return `vs ${COLOUR_NAMES[t]} ${pct(aggressionAgainst(cfg, before, 'purple', t))} → ${pct(aggressionAgainst(cfg, after, 'purple', t))}`;
      }
      const t = opponentOf(colour);
      return `Aggr. ${pct(aggressionAgainst(cfg, before, colour, t))} → ${pct(aggressionAgainst(cfg, after, colour, t))}`;
    }
    default:
      return '';
  }
}

export function dnaModalHtml(state, choice) {
  const def = state.config.traits[choice.trait];
  const chooserName = COLOUR_NAMES[choice.chooser];
  let explain = '';
  if (choice.collector === 'purple') {
    const why = choice.reason === 'tie'
      ? `both players have ${choice.counts.red} creatures, so the chooser was drawn at random`
      : `${chooserName} has fewer creatures (${choice.counts[choice.chooser]} vs ${choice.counts[opponentOf(choice.chooser)]})`;
    explain = `<p class="explain">Purple found DNA: ${chooserName} chooses, as ${why}.</p>`;
  } else {
    explain = `<p class="explain">${chooserName} collected DNA in generation ${choice.gen}.</p>`;
  }
  const circles = choice.validColours.map((colour) => {
    const label = colour === 'purple' && def.stat === 'aggression'
      ? `Purple: vs ${COLOUR_NAMES[opponentOf(choice.chooser)]}`
      : COLOUR_NAMES[colour];
    return `<button class="circle-btn ${colour}" data-colour="${colour}" type="button">
      <span class="circle"></span>
      <span class="c-label">${label}</span>
      <span class="c-preview">${esc(traitPreview(state, choice.trait, colour, choice.chooser))}</span>
    </button>`;
  }).join('');
  return `
    <h3 class="${choice.chooser}">${chooserName}'s choice</h3>
    ${explain}
    <div class="trait-card">
      <div class="big-icon">${traitIcon(choice.trait)}</div>
      <div>
        <div class="t-name">${esc(choice.trait)}</div>
        <div class="t-effect">${esc(traitEffect(def))}</div>
        <div class="t-blurb">${esc(traitBlurb(choice.trait))}</div>
      </div>
    </div>
    <div class="field-label">Give this trait to</div>
    <div class="circles">${circles}</div>
    <div class="actions"><button class="btn primary" id="dna-confirm" disabled>Confirm</button></div>
  `;
}

const REASON_TEXT = {
  majority: 'Board majority',
  fullBoard: 'Full board',
  cap: 'Generation cap',
  wipeout: 'Wipe-out',
};

export function resultTitle(result) {
  if (!result.winner) return 'Draw';
  const kind = result.winType === 'hard' ? 'Hard win' : 'Soft win';
  return `${COLOUR_NAMES[result.winner]} wins: ${kind}`;
}

export function endModalHtml(state) {
  const r = state.result;
  const title = resultTitle(r);
  let reason = REASON_TEXT[r.reason] || r.reason;
  if (r.reason === 'wipeout' && r.loser) reason += ` (${COLOUR_NAMES[r.loser]} had no creatures and no legal cell)`;
  if (r.reason === 'wipeout' && !r.winner) reason += ' (both players)';
  const counts = COLOURS.map((c) => `<div class="rc"><div class="num c-${c}">${r.counts[c]}</div><div class="lab">${COLOUR_NAMES[c]}</div></div>`).join('');
  return `
    <div class="result-title ${r.winner ? 'c-' + r.winner : ''}">${title}</div>
    <div class="result-reason">${reason}</div>
    <div class="result-counts">${counts}</div>
    <div class="result-meta">${r.gens} generation${r.gens === 1 ? '' : 's'} played · ${state.n}×${state.n} board</div>
    <div class="seed-line">seed ${state.seed}</div>
    <div class="actions">
      <button class="btn primary" data-action="rematch">Rematch</button>
      <button class="btn" data-action="view-board">View board</button>
      <button class="btn" data-action="menu">Main menu</button>
    </div>
  `;
}

export function reasonText(reason) {
  return REASON_TEXT[reason] || reason;
}
