// Presentation data for traits and stats (icons, blurbs, labels).

export const TRAIT_INFO = {
  'Social':        { icon: '👥', blurb: 'Creatures seek their own kind more often.' },
  'Solitary':      { icon: '🚶', blurb: 'Creatures seek their own kind less often.' },
  'Bold':          { icon: '🎯', blurb: 'Creatures head for the centre more often.' },
  'Timid':         { icon: '🐚', blurb: 'Creatures head for the centre less often.' },
  'Restless':      { icon: '🌀', blurb: 'Creatures wander at random more often.' },
  'Focused':       { icon: '🧭', blurb: 'Creatures wander at random less often.' },
  'Close Bond':    { icon: '💞', blurb: 'Side-by-side neighbours breed more often.' },
  'Cold':          { icon: '❄️', blurb: 'Side-by-side neighbours breed less often.' },
  'Wandering Eye': { icon: '👀', blurb: 'Diagonal neighbours breed more often.' },
  'Shy':           { icon: '🙈', blurb: 'Diagonal neighbours breed less often.' },
  'Dominant':      { icon: '👑', blurb: 'Mixed offspring take this colour more often.' },
  'Recessive':     { icon: '🌱', blurb: 'Mixed offspring take this colour less often.' },
  'Aggressive':    { icon: '⚔️', blurb: 'Bumping into a different colour may kill it instead of breeding.' },
};

export const STAT_LABELS = {
  centre: 'Centre',
  kin: 'Kin',
  random: 'Random',
  orthoFert: 'Orthogonal fertility',
  diagFert: 'Diagonal fertility',
  dominance: 'Dominance',
  aggression: 'Aggression',
};

export const STAT_SHORT = {
  centre: 'Centre',
  kin: 'Kin',
  random: 'Random',
  orthoFert: 'Ortho fert.',
  diagFert: 'Diag fert.',
  dominance: 'Dominance',
  aggression: 'Aggression',
};

export function traitIcon(name) {
  return (TRAIT_INFO[name] || {}).icon || '🧬';
}

export function traitBlurb(name) {
  return (TRAIT_INFO[name] || {}).blurb || '';
}

// "Kin +15" style effect string for a trait definition.
export function traitEffect(def, target) {
  if (!def) return '';
  const sign = def.delta >= 0 ? '+' : '';
  const stat = STAT_SHORT[def.stat] || def.stat;
  const tgt = target ? ` vs ${capitalise(target)}` : '';
  return `${stat}${tgt} ${sign}${def.delta}`;
}

export function capitalise(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export const COLOUR_NAMES = { red: 'Red', blue: 'Blue', purple: 'Purple' };
