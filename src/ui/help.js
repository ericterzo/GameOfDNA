// "How to Play" content with small illustrated boards built from the same
// CSS classes as the real board.

import { DNA_SVG } from './board.js';
import { DEFAULT_TRAITS, DEFAULT_CONFIG } from '../engine/index.js';
import { traitIcon, traitBlurb, traitEffect } from './traitInfo.js';

// pieces: [{x, y, colour, age}], dna: [{x,y}], marks: [{x, y, cls}]
function mini(n, { pieces = [], dna = [], marks = [], colour = 'red' } = {}) {
  let cells = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const m = marks.find((k) => k.x === x && k.y === y);
      cells += `<div class="cell ${m ? m.cls : ''}"></div>`;
    }
  }
  const ps = pieces.map((p) => `<div class="piece creature ${p.colour}" style="--x:${p.x};--y:${p.y}"><div class="body"><span class="age">${p.age ?? 1}</span></div></div>`).join('');
  const ds = dna.map((d) => `<div class="piece dna" style="--x:${d.x};--y:${d.y}"><div class="body">${DNA_SVG}</div></div>`).join('');
  return `<div class="mini-wrap" style="--n:${n};--turn-col:var(--${colour})"><div class="board" style="--n:${n}">${cells}<div class="layer">${ds}${ps}</div></div></div>`;
}

function fig(board, caption) {
  return `<div class="fig">${board}<div class="cap">${caption}</div></div>`;
}

const traitRows = Object.entries(DEFAULT_TRAITS).map(([name, def]) => `<tr><td>${traitIcon(name)} ${name}<span class="t-eff">${traitEffect(def, { range: DEFAULT_CONFIG.traitMagnitude })}</span></td><td>${traitBlurb(name)}</td></tr>`).join('');

export const HELP_HTML = `
<div class="help">
  <h3>The idea</h3>
  <p>Two players, <span class="pill red">Red</span> and <span class="pill blue">Blue</span>, seed creatures onto a grid. Each generation the creatures move, breed and age on their own. Your inputs are where you place new creatures and which colour receives each trait found in <span class="pill dna">DNA</span>. <span class="pill purple">Purple</span> hybrids belong to nobody.</p>

  <h3>Winning</h3>
  <ul>
    <li><b>Board majority:</b> Red or Blue holds more than half of all cells. Hard win, checked at the end of every generation.</li>
    <li><b>Full board</b> or <b>generation cap</b> (25 by default, editable in Settings): whoever has more creatures wins. A <b>hard win</b> if they also outnumber Purple, otherwise a <b>soft win</b>. Equal counts is a draw.</li>
    <li><b>Wipe-out:</b> a player with no creatures and no legal cell to place on loses immediately.</li>
  </ul>

  <h3>Setup</h3>
  <p>Pick a grid from 6×6 to 10×10. Four DNA symbols appear. Red and Blue then alternate placing 3 creatures each.</p>
  ${fig(mini(4, {
    pieces: [{ x: 1, y: 1, colour: 'red' }],
    dna: [{ x: 3, y: 0 }],
    marks: [
      { x: 0, y: 0, cls: 'legal' }, { x: 2, y: 0, cls: 'legal' },
      { x: 0, y: 2, cls: 'legal' }, { x: 2, y: 2, cls: 'legal' }, { x: 3, y: 2, cls: 'legal' },
      { x: 3, y: 1, cls: 'legal' }, { x: 0, y: 3, cls: 'legal' }, { x: 1, y: 3, cls: 'legal' },
      { x: 2, y: 3, cls: 'legal' }, { x: 3, y: 3, cls: 'legal' },
    ],
  }), '<b>Placement rule.</b> A creature may go on any empty cell that has no DNA and no creature directly above, below, left or right of it. Diagonal contact is fine. Legal cells glow in your colour.')}

  <h3>One generation</h3>
  <ol>
    <li><b>Deaths:</b> creatures aged 6 are removed.</li>
    <li><b>Placement:</b> each player may place one creature if they have fewer than 5 on the board (any number with Constant spawning on). A player who cannot place is skipped automatically. The starting player alternates each generation.</li>
    <li><b>Movement:</b> every creature takes one step, in random order.</li>
    <li><b>Breeding:</b> neighbouring creatures may produce offspring.</li>
    <li><b>Ageing:</b> every creature that existed before this generation ages by one.</li>
    <li><b>DNA:</b> symbols collected this generation are replaced on random free cells, keeping four on the board while there is room.</li>
  </ol>

  <h3>Movement</h3>
  <p>Each step is one of three moods, weighted by the colour's stats: <b>Centre</b> (step towards the middle), <b>Kin</b> (step towards the nearest creature of the same colour) or <b>Random</b>. Steps off the board are wasted.</p>
  ${fig(mini(3, {
    pieces: [{ x: 0, y: 1, colour: 'red', age: 3 }, { x: 1, y: 1, colour: 'blue', age: 2 }],
    marks: [{ x: 0, y: 1, cls: '' }],
  }), '<b>Collision.</b> Stepping into an occupied cell is a bump. If the colours differ, the mover may <b>kill</b> the occupant (its Aggression %). Otherwise the two <b>breed</b> for certain, if both are fertile and neither has bred this generation.')}

  <h3>Breeding</h3>
  <p>After movement, every pair of fertile neighbours rolls once: <b>30%</b> for side-by-side pairs, <b>10%</b> for diagonal pairs (the average of both colours' fertility). Each creature breeds at most once per generation. The offspring appears on a free cell next to one of the parents, and picks up any DNA there.</p>
  ${fig(mini(3, {
    pieces: [{ x: 0, y: 0, colour: 'red', age: 4 }, { x: 1, y: 1, colour: 'blue', age: 3 }, { x: 2, y: 2, colour: 'purple', age: 1 }],
  }), '<b>Offspring colour.</b> Red × Red is Red, Blue × Blue is Blue. Red × Blue is Purple. Red × Purple is 80% Red, 20% Purple (likewise for Blue). Dominance traits shift these odds. Purple never breeds with Purple.')}

  <h3>Lifecycle</h3>
  <div class="lifecycle">
    <div class="lc"><b>1</b>born</div>
    <div class="lc"><b>1</b>grows</div>
    <div class="lc fertile"><b>2</b>fertile</div>
    <div class="lc fertile"><b>3</b>fertile</div>
    <div class="lc fertile"><b>4</b>fertile</div>
    <div class="lc fertile"><b>5</b>fertile</div>
  </div>
  <p>A creature shows its age as a number. It becomes fertile at age 2, reaches 6 at the end of its sixth generation (shown dimmed and cracked) and is removed at the start of the next one. Placed creatures move in the generation they are placed; newborns wait until the next.</p>

  <h3>DNA and traits</h3>
  <p>A creature collects DNA by moving or being born onto it. The trait inside is revealed only then. If the collector is Red or Blue, that player chooses which colour receives it. If the collector is Purple, the player with <b>fewer creatures</b> chooses. Traits take effect from the next generation.</p>
  <p>The size of each trait is rolled when it is found, between <b>15 and 30</b>: you might find a Dominant +20 or a Cold -18. Movement traits (Social, Solitary, Bold, Timid, Restless, Focused) turn up 60% of the time, breeding traits 40%.</p>
  <p>Each colour holds at most <b>10 traits</b>. When an eleventh arrives the oldest is pushed out, which can suddenly unbalance stats that had cancelled out. The choice window warns you which trait a full colour would lose. Opposite traits do not cancel each other; they simply add up.</p>
  ${fig(mini(2, { dna: [{ x: 0, y: 0 }], pieces: [{ x: 1, y: 1, colour: 'purple', age: 2 }] }), '<b>Aggressive on Purple.</b> When a player gives Aggressive to Purple it targets the <b>other</b> player\'s colour, and is listed as "Aggressive vs Red" or "vs Blue". Purple is never aggressive towards Purple.')}
  <table class="trait-table">${traitRows}</table>

  <h3>Options</h3>
  <ul>
    <li><b>Remove Aggressive trait</b> (Settings): Aggressive is never drawn from DNA, so bumps between colours always breed. Traits already assigned stay until they are pushed out.</li>
    <li><b>Constant spawning</b> (Settings): the five-creature placement limit is lifted, so each player places one creature every generation while a legal cell exists.</li>
  </ul>

  <h3>Reading the screen</h3>
  <ul>
    <li>The top bar shows the generation, whose action is expected, and live creature counts.</li>
    <li>The trait panel lists each colour's traits, oldest at the top. A dashed line marks the trait that will be replaced next.</li>
    <li>The stats section shows the movement shares, fertility, dominance and aggression each colour currently has, plus the offspring odds for each mixed pairing.</li>
  </ul>
</div>
`;
