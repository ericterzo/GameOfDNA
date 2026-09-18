// Tiny synthesised sound effects via WebAudio. No assets needed.

let ctx = null;
let enabled = true;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq = 440, dur = 0.08, type = 'sine', gain = 0.12, slide = 0, delay = 0 }) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.12, gain = 0.1, delay = 0 }) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t0);
}

const FX = {
  tap: () => tone({ freq: 660, dur: 0.04, gain: 0.05, type: 'square' }),
  place: () => tone({ freq: 520, dur: 0.09, gain: 0.1, type: 'triangle', slide: 160 }),
  bump: () => tone({ freq: 180, dur: 0.06, gain: 0.08, type: 'square' }),
  birth: () => {
    tone({ freq: 520, dur: 0.08, gain: 0.09, type: 'triangle' });
    tone({ freq: 780, dur: 0.12, gain: 0.09, type: 'triangle', delay: 0.06 });
  },
  kill: () => {
    noise({ dur: 0.16, gain: 0.14 });
    tone({ freq: 140, dur: 0.18, gain: 0.12, type: 'sawtooth', slide: -100 });
  },
  death: () => tone({ freq: 300, dur: 0.22, gain: 0.07, type: 'sine', slide: -180 }),
  pickup: () => {
    tone({ freq: 880, dur: 0.07, gain: 0.08, type: 'sine' });
    tone({ freq: 1320, dur: 0.1, gain: 0.08, type: 'sine', delay: 0.07 });
  },
  age: () => tone({ freq: 420, dur: 0.05, gain: 0.04, type: 'sine' }),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, gain: 0.1, type: 'triangle', delay: i * 0.12 }));
  },
};

export const sound = {
  setEnabled(v) {
    enabled = !!v;
  },
  isEnabled() {
    return enabled;
  },
  // Call from a user gesture so mobile browsers allow audio.
  unlock() {
    if (unlocked || !enabled) return;
    const ac = getCtx();
    if (ac) unlocked = true;
  },
  play(name) {
    if (!enabled) return;
    const fn = FX[name];
    if (!fn) return;
    try {
      fn();
    } catch {
      /* ignore audio errors */
    }
  },
};
