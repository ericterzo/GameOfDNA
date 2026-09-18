// Text for the interactive tutorial. The flow itself lives in app.js; this
// module only turns game events into the coach's words.

import { COLOUR_NAMES, traitIcon, fmtDelta } from './traitInfo.js';

export function summariseResolution(events) {
  const out = { moves: 0, blocked: 0, collisions: 0, kills: 0, pickups: 0, births: { collision: 0, orthogonal: 0, diagonal: 0 }, purpleBirths: 0, birthColours: [] };
  for (const e of events) {
    if (e.type === 'move') out.moves++;
    else if (e.type === 'blocked') out.blocked++;
    else if (e.type === 'collision') out.collisions++;
    else if (e.type === 'kill') out.kills++;
    else if (e.type === 'pickup') out.pickups++;
    else if (e.type === 'birth') {
      out.births[e.via]++;
      out.birthColours.push(e.colour);
      if (e.colour === 'purple') out.purpleBirths++;
    }
  }
  return out;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const COACH = {
  welcome: {
    title: 'Welcome to Creatures',
    text: 'Two players share one board: you are Red, your rival is Blue. Each generation the creatures move, breed and age on their own. You decide only two things: where new creatures are placed, and which colour receives each DNA trait. The number on a creature is its age.',
    button: 'Show me',
  },
  place: {
    title: 'Place a creature',
    text: 'It is generation 3 and Red places first. A creature may go on any empty cell with no DNA on it and no creature directly above, below, left or right. Diagonal neighbours are fine. Tap the glowing cell, then Confirm.',
  },
  bluePlaces: {
    title: 'Blue places too',
    text: 'Each player may place one creature per generation while they have fewer than five on the board. Blue is placing now.',
  },
  moved(summary) {
    const parts = [];
    parts.push(`Every creature took one step in a random order: ${plural(summary.moves, 'move')}${summary.blocked ? ` and ${plural(summary.blocked, 'bump')}` : ''}.`);
    parts.push('Each step is one of three moods, weighted by the colour\'s stats: towards the centre, towards the nearest creature of its own colour, or at random.');
    if (summary.births.collision) {
      parts.push(`Stepping into another creature is a collision. When both are fertile (age 2 or more) they breed on the spot: that is where ${plural(summary.births.collision, 'new creature')} came from.`);
    } else if (summary.collisions) {
      parts.push('Stepping into another creature is a collision. Fertile pairs (age 2 or more) breed on the spot; this time nobody was ready.');
    }
    const adj = summary.births.orthogonal + summary.births.diagonal;
    if (adj) parts.push(`After moving, neighbouring pairs may breed too: 30% side by side, 10% diagonally. That produced ${plural(adj, 'more birth')}.`);
    else parts.push('After moving, neighbouring pairs may also breed: 30% side by side, 10% diagonally. No pair rolled a success this time.');
    if (summary.purpleBirths) parts.push('A Red and a Blue parent produce a Purple hybrid, which belongs to nobody.');
    if (summary.pickups) parts.push('One of your creatures also walked onto a DNA symbol. Its trait is revealed next.');
    return { title: 'Generation 3 played out', text: parts.join(' '), button: summary.pickups ? 'See the DNA' : 'Next' };
  },
  dna(choice) {
    const name = `${choice.trait} ${fmtDelta(choice.delta)}`;
    return `Your creature found ${traitIcon(choice.trait)} ${name}. The player whose creature collects DNA decides which colour is changed by it. Give a helpful trait to Red, a harmful one to Blue, or push an awkward one onto Purple. Traits take effect from the next generation and each colour keeps at most ten. Tap a circle, then Confirm.`;
  },
  ageing(dying) {
    return {
      title: 'Everyone got older',
      text: `Creatures age by one at the end of each generation, except the ones born or placed this generation. ${dying ? `The cracked creature showing 6 has reached the end of its life: it will be removed as soon as the next generation starts.` : 'A creature showing 6 is at the end of its life and is removed when the next generation starts.'} Creatures live six generations and can breed for four of them.`,
      button: 'Start generation 4',
    };
  },
  death: {
    title: 'A life ends',
    text: 'The old creature faded away before anyone placed. Since a creature only breeds from age 2, keep placing new ones and steer your traits so that Red keeps growing while the old ones die off.',
    button: 'How do I win?',
  },
  winning: {
    title: 'Winning',
    text: 'Red or Blue wins outright by holding more than half of all cells. Otherwise, when the board fills or the generation cap is reached, the colour with more creatures wins: a hard win if it also outnumbers Purple, a soft win if not. Purple hybrids never win, but they take space and can turn your hard win into a soft one. That is the whole game: place well, choose traits wisely, and watch the generations unfold.',
    button: 'Finish',
  },
  ended: {
    title: 'The match ended',
    text: 'This tutorial board reached an end condition. Start a new match from the main menu to play for real.',
    button: 'Finish',
  },
};

export function colourName(c) {
  return COLOUR_NAMES[c] || c;
}
