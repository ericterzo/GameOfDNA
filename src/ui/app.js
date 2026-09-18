// Application controller: screens, settings, persistence and the match flow.
// The engine decides everything; this file only asks it for inputs and
// animates what it returns.

import {
  createGame,
  applyInput,
  placementStatus,
  currentDnaChoice,
  countColours,
  opponentOf,
  mergeConfig,
  traitDelta,
  COLOURS,
  DEFAULT_CONFIG,
  STATE_VERSION,
} from '../engine/index.js';
import { BoardView } from './board.js';
import { traitsHtml, statsHtml, dnaModalHtml, endModalHtml, resultTitle } from './panels.js';
import { sound } from './sound.js';
import { HELP_HTML } from './help.js';
import { COLOUR_NAMES } from './traitInfo.js';
import { COACH, summariseResolution } from './tutorial.js';
import { buildTutorialState, TUTORIAL_RED_CELL, TUTORIAL_BLUE_CELL } from '../tutorial/scenario.js';

const SAVE_KEY = 'creatures.save.v1';
const SETTINGS_KEY = 'creatures.settings.v1';
const DEFAULT_SETTINGS = {
  speed: 1,
  sound: true,
  shapes: false,
  autoContinue: false,
  gridSize: 8,
  cap: true,
  statsOpen: false,
  noAggressive: false,
  constantSpawning: false,
  generationCap: 25,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let settings = loadSettings();
let state = null;
let board = null;
let busy = false;
let paused = false;
let selectedCell = null;
let legalKeys = new Set();
let lastTraitAdded = null;
let playCtl = null;
let toastTimer = null;
let helpReturn = 'screen-menu';
let lastSkips = [];
let lastEvents = [];
let tutorial = null; // { step } while the tutorial is running

function clampCap(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SETTINGS.generationCap;
  return Math.min(999, n);
}

// Rule options chosen in Settings, expressed as engine config overrides.
function ruleConfig() {
  return {
    placementCap: settings.constantSpawning ? 0 : DEFAULT_CONFIG.placementCap,
    disabledTraits: settings.noAggressive ? ['Aggressive'] : [],
    generationCap: settings.cap ? clampCap(settings.generationCap) : 0,
  };
}

// Rule options also apply to the match in progress.
function applyRulesToMatch() {
  if (!state || state.phase === 'ended' || tutorial) return;
  state = { ...state, config: { ...state.config, ...ruleConfig() } };
  saveGame();
  if (busy || !$('#screen-match').classList.contains('active')) return;
  renderAll();
  if (state.phase === 'placement' || state.phase === 'setup') placementUI();
}

function bindRuleToggle(el, key) {
  if (!el) return;
  el.checked = settings[key];
  el.onchange = () => {
    settings[key] = el.checked;
    saveSettings();
    applyRulesToMatch();
  };
}

function skipText(events) {
  return events
    .filter((e) => e.type === 'placementSkipped')
    .map((e) => `${COLOUR_NAMES[e.player]} skipped: ${e.reason === 'cap' ? `already has ${e.count} creatures` : 'no legal cell'}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Persistence

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

function saveGame() {
  if (tutorial) return; // the tutorial board never replaces a real match
  try {
    if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Brings a saved match from an older state version up to date, or returns
// null when it cannot be used.
function migrateState(s) {
  if (!s || typeof s !== 'object' || !s.creatures || !s.traits) return null;
  if (s.version === STATE_VERSION) return s;
  if (s.version !== 1) return null;
  const old = s.config || {};
  const cfg = mergeConfig({
    gridSize: s.n,
    generationCap: old.generationCap ?? DEFAULT_CONFIG.generationCap,
    placementCap: old.placementCap ?? DEFAULT_CONFIG.placementCap,
    autoSkipPlacement: old.autoSkipPlacement ?? true,
    disabledTraits: old.disabledTraits || [],
  });
  // Version 1 traits had fixed sizes; keep them as they were.
  const fixedDelta = (name) => {
    const oldDef = old.traits && old.traits[name];
    if (oldDef && oldDef.delta !== undefined) return oldDef.delta;
    return traitDelta(cfg.traits[name], cfg);
  };
  for (const colour of COLOURS) for (const t of s.traits[colour] || []) if (t.delta == null) t.delta = fixedDelta(t.name);
  for (const p of s.pendingDna || []) if (p.delta == null) p.delta = fixedDelta(p.trait);
  s.config = cfg;
  s.version = STATE_VERSION;
  return s;
}

function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Screens

function show(id) {
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === id);
  window.scrollTo(0, 0);
  if (id === 'screen-menu') {
    const saved = loadGame();
    const cont = $('#btn-continue');
    cont.hidden = !(saved && saved.phase !== 'ended');
    if (saved && saved.phase !== 'ended') {
      cont.textContent = saved.gen === 0 ? 'Continue (setup)' : `Continue (Gen ${saved.gen})`;
    }
  }
}

function toast(msg, ms = 2200) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

function openModal(id, html) {
  const m = $(`#${id}`);
  if (html !== undefined) m.querySelector('.card').innerHTML = html;
  m.hidden = false;
  return m;
}

function closeModal(id) {
  const m = $(`#${id}`);
  m.hidden = true;
  m.querySelector('.card').innerHTML = '';
}

function hideModals() {
  for (const m of $$('.modal')) {
    m.hidden = true;
    m.querySelector('.card').innerHTML = '';
  }
}

function confirmDialog(title, text, okLabel = 'Yes') {
  return new Promise((resolve) => {
    const m = openModal('modal-confirm', `
      <h3>${title}</h3>
      <p class="explain">${text}</p>
      <div class="actions">
        <button class="btn danger" data-ok>${okLabel}</button>
        <button class="btn" data-cancel>Cancel</button>
      </div>`);
    m.querySelector('[data-ok]').onclick = () => { closeModal('modal-confirm'); resolve(true); };
    m.querySelector('[data-cancel]').onclick = () => { closeModal('modal-confirm'); resolve(false); };
  });
}

// ---------------------------------------------------------------------------
// New game / settings screens

function buildNewGameScreen() {
  const chips = $('#grid-chips');
  chips.innerHTML = '';
  for (let n = 6; n <= 10; n++) {
    const b = document.createElement('button');
    b.className = 'chip' + (n === settings.gridSize ? ' selected' : '');
    b.textContent = `${n}×${n}`;
    b.dataset.n = n;
    b.onclick = () => {
      settings.gridSize = n;
      saveSettings();
      for (const c of chips.children) c.classList.toggle('selected', Number(c.dataset.n) === n);
    };
    chips.appendChild(b);
  }
  const cap = $('#cap-toggle');
  cap.checked = settings.cap;
  cap.onchange = () => {
    settings.cap = cap.checked;
    saveSettings();
    applyRulesToMatch();
  };
  $('#cap-desc').textContent = `End the match after ${clampCap(settings.generationCap)} generations. Change the number in Settings.`;
}

function buildSettingsScreen() {
  const speedChips = $('#speed-chips');
  speedChips.innerHTML = '';
  for (const sp of [1, 2, 4]) {
    const b = document.createElement('button');
    b.className = 'chip' + (sp === settings.speed ? ' selected' : '');
    b.textContent = `${sp}×`;
    b.onclick = () => {
      setSpeed(sp);
      for (const c of speedChips.children) c.classList.toggle('selected', c === b);
    };
    speedChips.appendChild(b);
  }
  const snd = $('#sound-toggle');
  snd.checked = settings.sound;
  snd.onchange = () => {
    settings.sound = snd.checked;
    sound.setEnabled(settings.sound);
    saveSettings();
    if (settings.sound) sound.play('tap');
  };
  const shapes = $('#shapes-toggle');
  shapes.checked = settings.shapes;
  shapes.onchange = () => {
    settings.shapes = shapes.checked;
    saveSettings();
    if (board) board.setShapes(settings.shapes);
  };
  const auto = $('#auto-toggle');
  auto.checked = settings.autoContinue;
  auto.onchange = () => {
    settings.autoContinue = auto.checked;
    saveSettings();
  };
  bindRuleToggle($('#no-aggressive-toggle'), 'noAggressive');
  bindRuleToggle($('#constant-spawn-toggle'), 'constantSpawning');
  const capInput = $('#gen-cap-input');
  capInput.value = clampCap(settings.generationCap);
  capInput.onchange = () => {
    settings.generationCap = clampCap(capInput.value);
    capInput.value = settings.generationCap;
    saveSettings();
    applyRulesToMatch();
  };
}

function setSpeed(sp) {
  settings.speed = sp;
  saveSettings();
  if (board) board.setSpeed(sp);
  for (const c of $$('.speed-group .chip')) c.classList.toggle('selected', Number(c.dataset.speed) === sp);
}

// ---------------------------------------------------------------------------
// Match

function startMatch({ gridSize, seed }) {
  tutorial = null;
  state = createGame({ config: { gridSize, ...ruleConfig() }, seed });
  lastTraitAdded = null;
  lastSkips = [];
  lastEvents = [];
  saveGame();
  enterMatch();
}

function enterMatch() {
  show('screen-match');
  hideModals();
  board.setShapes(settings.shapes);
  board.setSpeed(settings.speed);
  board.sync(state);
  board.measure();
  $('#stats-details').open = settings.statsOpen || isWideLayout();
  renderAll();
  routePhase();
}

function isWideLayout() {
  return window.matchMedia('(orientation: landscape) and (min-width: 700px)').matches;
}

function renderAll() {
  renderTopBar();
  $('#traits').innerHTML = traitsHtml(state, lastTraitAdded);
  $('#stats').innerHTML = statsHtml(state);
}

function renderTopBar(override) {
  const cap = state.config.generationCap;
  $('#top-gen').textContent = state.gen === 0 ? 'Setup' : `Gen ${state.gen}${cap ? `/${cap}` : ''}`;
  const dot = $('#top-turn .dot');
  const label = $('#top-turn .label');
  let colour = null;
  let text = '';
  if (override) {
    text = override.text;
    colour = override.colour || null;
  } else {
    switch (state.phase) {
      case 'setup':
      case 'placement':
        colour = state.turn;
        text = `${COLOUR_NAMES[state.turn]} places`;
        break;
      case 'dna':
        colour = state.pendingDna[0].chooser;
        text = `${COLOUR_NAMES[colour]} picks`;
        break;
      case 'between':
        text = 'Gen done';
        break;
      case 'ended':
        text = 'Game over';
        break;
      default:
        text = '';
    }
  }
  dot.className = 'dot' + (colour ? ` ${colour}` : '');
  label.textContent = text;
  label.title = text;
  // While an animation is playing, show what is on the board rather than the final state.
  updateCounts(override ? board.counts() : countColours(state));
}

function updateCounts(counts) {
  $('#cnt-red').textContent = counts.red;
  $('#cnt-blue').textContent = counts.blue;
  $('#cnt-purple').textContent = counts.purple;
}

function setBanner(main, { colour = null, sub = '' } = {}) {
  const b = $('#banner');
  b.className = 'banner' + (colour ? ` ${colour}` : '');
  b.innerHTML = `<div class="main">${main}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
}

function setControls(nodes) {
  const c = $('#controls');
  c.innerHTML = '';
  for (const n of nodes) c.appendChild(n);
}

function button(label, { cls = 'btn', onClick, disabled = false, id } = {}) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.disabled = disabled;
  if (id) b.id = id;
  if (onClick) b.onclick = onClick;
  return b;
}

function speedGroup(withSkip) {
  const g = document.createElement('div');
  g.className = 'speed-group';
  for (const sp of [1, 2, 4]) {
    const b = document.createElement('button');
    b.className = 'chip' + (sp === settings.speed ? ' selected' : '');
    b.dataset.speed = sp;
    b.textContent = `${sp}×`;
    b.onclick = () => setSpeed(sp);
    g.appendChild(b);
  }
  if (withSkip) {
    const s = document.createElement('button');
    s.className = 'chip';
    s.textContent = 'Skip ⏭';
    s.onclick = () => {
      if (playCtl) playCtl.skipped = true;
    };
    g.appendChild(s);
  }
  return g;
}

function routePhase() {
  if (tutorial) {
    tutorialRoute();
    return;
  }
  hideModals();
  $('#banner').classList.remove('coach');
  switch (state.phase) {
    case 'setup':
    case 'placement':
      placementUI();
      break;
    case 'dna':
      dnaUI();
      break;
    case 'between':
      betweenUI();
      break;
    case 'ended':
      endUI();
      break;
    default:
      break;
  }
}

// -- Placement ---------------------------------------------------------

function placementUI() {
  renderTopBar();
  const st = placementStatus(state);
  const name = COLOUR_NAMES[st.player];
  selectedCell = null;
  legalKeys = new Set(st.legal.map((c) => c.y * state.n + c.x));

  if (state.phase === 'setup') {
    const k = state.setupPlaced[st.player] + 1;
    setBanner(`${name}: place creature ${k} of ${state.config.initialPlacements}`, { colour: st.player, sub: 'Setup · tap a glowing cell, then Confirm' });
  } else if (st.canPlace) {
    const cap = state.config.placementCap;
    const skipped = skipText(lastSkips.filter((e) => e.player !== st.player && e.gen === state.gen));
    const onBoard = `${st.count}${cap > 0 ? ` of ${cap}` : ''} on the board`;
    setBanner(`${name}'s turn: place a creature`, { colour: st.player, sub: skipped ? `${skipped} · ${onBoard}` : `${onBoard} · tap a glowing cell, then Confirm` });
  }

  if (!st.canPlace) {
    board.clearHighlights();
    const why = st.reason === 'cap'
      ? `${name} already has ${st.count} creatures`
      : `${name} has no legal cell to place on`;
    setBanner(`${name} cannot place`, { colour: st.player, sub: why });
    setControls([button('Pass', { cls: 'btn primary', onClick: () => submit({ type: 'pass' }) })]);
    return;
  }

  board.setLegal(st.legal, st.player);
  setControls([
    button('Confirm placement', { cls: `btn ${st.player}`, id: 'btn-confirm', disabled: true, onClick: confirmPlacement }),
  ]);
}

function onCellTap(x, y) {
  if (busy || !state) return;
  if (state.phase !== 'setup' && state.phase !== 'placement') return;
  const k = y * state.n + x;
  if (!legalKeys.has(k)) return;
  sound.unlock();
  if (selectedCell && selectedCell.x === x && selectedCell.y === y) {
    confirmPlacement();
    return;
  }
  selectedCell = { x, y };
  board.setPreview(selectedCell);
  sound.play('tap');
  const b = $('#btn-confirm');
  if (b) b.disabled = false;
}

function confirmPlacement() {
  if (!selectedCell) return;
  const cell = selectedCell;
  selectedCell = null;
  submit({ type: 'place', cell });
}

// -- DNA ---------------------------------------------------------------

function dnaUI({ coach = '' } = {}) {
  renderTopBar();
  const choice = currentDnaChoice(state);
  setBanner(`${COLOUR_NAMES[choice.chooser]} chooses a trait`, { colour: choice.chooser, sub: `${state.pendingDna.length} DNA choice${state.pendingDna.length === 1 ? '' : 's'} pending` });
  setControls([]);
  const m = openModal('modal-dna', dnaModalHtml(state, choice, { coach }));
  let picked = null;
  const confirm = m.querySelector('#dna-confirm');
  const warning = m.querySelector('#dna-warning');
  for (const b of m.querySelectorAll('.circle-btn')) {
    b.onclick = () => {
      picked = b.dataset.colour;
      for (const o of m.querySelectorAll('.circle-btn')) o.classList.toggle('selected', o === b);
      confirm.disabled = false;
      // Remind the chooser what a full colour would lose.
      const drop = b.dataset.drop;
      warning.hidden = !drop;
      warning.textContent = drop || '';
      sound.play('tap');
    };
  }
  confirm.onclick = () => {
    if (!picked) return;
    closeModal('modal-dna');
    submit({ type: 'chooseDna', colour: picked });
  };
}

// -- Between generations -----------------------------------------------

function betweenUI() {
  renderTopBar();
  const dying = Object.values(state.creatures).filter((c) => c.age >= state.config.deathAge).length;
  const next = state.gen + 1;
  const first = COLOUR_NAMES[opponentOf(firstOfGen(state.gen))];
  const sub = [
    dying ? `${dying} creature${dying === 1 ? '' : 's'} at age 6 will die` : 'No deaths coming',
    `${first} places first in Gen ${next}`,
  ].join(' · ');
  setBanner(`Generation ${state.gen} complete`, { sub });
  setControls([button(`Start generation ${next}`, { cls: 'btn primary', onClick: () => submit({ type: 'nextGeneration' }) })]);
  if (settings.autoContinue) {
    setTimeout(() => {
      if (state && state.phase === 'between' && !busy && $('#screen-match').classList.contains('active')) {
        submit({ type: 'nextGeneration' });
      }
    }, 900 / settings.speed);
  }
}

function firstOfGen(gen) {
  const first = state.config.firstPlacer;
  return gen % 2 === 1 ? opponentOf(first) : first;
}

// -- End ---------------------------------------------------------------

function endUI() {
  renderTopBar();
  setBanner(resultTitle(state.result), { colour: state.result.winner || null, sub: 'Game over' });
  setControls([button('Show result', { cls: 'btn primary', onClick: showEndModal })]);
  showEndModal();
}

function showEndModal() {
  const m = openModal('modal-end', endModalHtml(state));
  m.querySelector('[data-action="rematch"]').onclick = () => {
    closeModal('modal-end');
    startMatch({ gridSize: state.n });
  };
  m.querySelector('[data-action="view-board"]').onclick = () => closeModal('modal-end');
  m.querySelector('[data-action="menu"]').onclick = () => {
    closeModal('modal-end');
    show('screen-menu');
  };
}

// -- Submitting inputs and animating results ---------------------------

function makeController() {
  const ctl = {
    skipped: false,
    async wait(ms) {
      if (ctl.skipped) return;
      await sleep(ms / settings.speed);
      while (paused && !ctl.skipped) await sleep(80);
    },
    sound(name) {
      if (!ctl.skipped) sound.play(name);
    },
    onEvent(e) {
      if (e.type === 'movementStart') renderTopBar({ text: 'Moving' });
      else if (e.type === 'adjacencyStart') renderTopBar({ text: 'Breeding' });
      else if (e.type === 'age') renderTopBar({ text: 'Ageing' });
      else if (e.type === 'birth' || e.type === 'kill' || e.type === 'death' || e.type === 'placed') updateCounts(board.counts());
    },
  };
  return ctl;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function submit(input) {
  if (busy || !state) return;
  let r;
  try {
    r = applyInput(state, input);
  } catch (err) {
    console.error(err);
    toast(err.message);
    return;
  }
  sound.unlock();
  state = r.state;
  saveGame();
  busy = true;
  board.clearHighlights();
  selectedCell = null;
  legalKeys = new Set();

  const resolving = r.events.some((e) => e.type === 'movementStart');
  const deaths = r.events.filter((e) => e.type === 'death').length;
  lastSkips = r.events.filter((e) => e.type === 'placementSkipped').map((e) => ({ ...e, gen: state.gen }));
  if (resolving) {
    const skipped = skipText(r.events);
    setBanner(`Resolving generation ${state.gen}`, { sub: skipped || 'Creatures move, breed and age' });
    setControls([speedGroup(true)]);
    renderTopBar({ text: 'Resolving' });
  } else if (deaths) {
    setBanner(`Generation ${state.gen} begins`, { sub: `${deaths} creature${deaths === 1 ? '' : 's'} die of old age` });
    setControls([speedGroup(true)]);
    renderTopBar({ text: 'Deaths' });
  }

  playCtl = makeController();
  board.setSpeed(settings.speed);
  try {
    await board.play(r.events, state, playCtl);
  } finally {
    busy = false;
    playCtl = null;
  }
  lastTraitAdded = r.events.find((e) => e.type === 'traitAdded') || null;
  lastEvents = r.events;
  if (state.phase === 'ended' && r.events.some((e) => e.type === 'ended')) sound.play('win');
  renderAll();
  routePhase();
}

// ---------------------------------------------------------------------------
// Pause menu

function openPause() {
  paused = true;
  const m = openModal('modal-pause', `
    <h3>Paused</h3>
    <div class="row"><span>Animation speed</span><div class="speed-group" id="pause-speed"></div></div>
    <label class="row-toggle"><span>Sound</span><input type="checkbox" class="switch" id="pause-sound"></label>
    <label class="row-toggle"><span>Colour-blind shapes</span><input type="checkbox" class="switch" id="pause-shapes"></label>
    <label class="row-toggle"><span>Auto-continue to next generation</span><input type="checkbox" class="switch" id="pause-auto"></label>
    <div class="field-label">Rules</div>
    <label class="row-toggle"><span>Remove Aggressive trait</span><input type="checkbox" class="switch" id="pause-no-aggressive"></label>
    <label class="row-toggle"><span>Constant spawning<br><span class="desc">Place one creature every generation, no limit</span></span><input type="checkbox" class="switch" id="pause-constant-spawn"></label>
    <div class="seed-line">${state.n}×${state.n} · seed ${state.seed}</div>
    <div class="actions">
      <button class="btn primary" data-act="resume">Resume</button>
      <button class="btn" data-act="help">How to Play</button>
      <button class="btn" data-act="menu">Main menu (keeps this match)</button>
      <button class="btn danger" data-act="abandon">Abandon match</button>
    </div>`);
  const sg = speedGroup(false);
  m.querySelector('#pause-speed').replaceWith(sg);
  const snd = m.querySelector('#pause-sound');
  snd.checked = settings.sound;
  snd.onchange = () => {
    settings.sound = snd.checked;
    sound.setEnabled(settings.sound);
    saveSettings();
  };
  const shapes = m.querySelector('#pause-shapes');
  shapes.checked = settings.shapes;
  shapes.onchange = () => {
    settings.shapes = shapes.checked;
    saveSettings();
    board.setShapes(settings.shapes);
  };
  const auto = m.querySelector('#pause-auto');
  auto.checked = settings.autoContinue;
  auto.onchange = () => {
    settings.autoContinue = auto.checked;
    saveSettings();
  };
  bindRuleToggle(m.querySelector('#pause-no-aggressive'), 'noAggressive');
  bindRuleToggle(m.querySelector('#pause-constant-spawn'), 'constantSpawning');
  m.querySelector('[data-act="resume"]').onclick = closePause;
  m.querySelector('[data-act="help"]').onclick = () => {
    closePause();
    helpReturn = 'screen-match';
    show('screen-help');
  };
  if (tutorial) {
    // The tutorial board is not a saved match: leaving it just returns to the menu.
    const menuBtn = m.querySelector('[data-act="menu"]');
    menuBtn.textContent = 'Exit tutorial';
    menuBtn.onclick = () => {
      closePause();
      exitTutorial();
    };
    m.querySelector('[data-act="abandon"]').hidden = true;
    return;
  }
  m.querySelector('[data-act="menu"]').onclick = () => {
    closePause();
    show('screen-menu');
  };
  m.querySelector('[data-act="abandon"]').onclick = async () => {
    closePause();
    const ok = await confirmDialog('Abandon match?', 'The current match will be deleted. This cannot be undone.', 'Abandon');
    if (!ok) return;
    clearSavedGame();
    state = null;
    show('screen-menu');
  };
}

// ---------------------------------------------------------------------------
// Tutorial: a fixed board on the real engine, with a coach under the board.

function startTutorial() {
  sound.unlock();
  state = buildTutorialState();
  tutorial = { step: 'welcome' };
  lastTraitAdded = null;
  lastSkips = [];
  lastEvents = [];
  enterMatch();
}

function exitTutorial() {
  tutorial = null;
  state = null;
  hideModals();
  $('#banner').classList.remove('coach');
  show('screen-menu');
}

function coach(step, buttons) {
  setBanner(step.title, { sub: step.text });
  $('#banner').classList.add('coach');
  setControls(buttons);
}

function tutorialRoute() {
  hideModals();
  const t = tutorial;
  renderTopBar();
  board.clearHighlights();
  if (state.phase === 'ended') {
    coach(COACH.ended, [button(COACH.ended.button, { cls: 'btn primary', onClick: exitTutorial })]);
    return;
  }
  // Advance the lesson from what the engine just did.
  if (t.step === 'place' && state.phase === 'placement' && state.turn === 'blue') t.step = 'bluePlaces';
  else if (t.step === 'bluePlaces' && (state.phase === 'dna' || state.phase === 'between')) t.step = 'moved';
  else if (t.step === 'dna' && state.phase === 'between') t.step = 'ageing';
  else if (t.step === 'ageing' && state.phase === 'placement') t.step = 'death';

  switch (t.step) {
    case 'welcome':
      coach(COACH.welcome, [button(COACH.welcome.button, { cls: 'btn primary', onClick: () => { t.step = 'place'; tutorialRoute(); } })]);
      break;
    case 'place':
      selectedCell = null;
      legalKeys = new Set([TUTORIAL_RED_CELL.y * state.n + TUTORIAL_RED_CELL.x]);
      board.setLegal([TUTORIAL_RED_CELL], 'red');
      coach(COACH.place, [button('Confirm placement', { cls: 'btn red', id: 'btn-confirm', disabled: true, onClick: confirmPlacement })]);
      break;
    case 'bluePlaces':
      coach(COACH.bluePlaces, []);
      setTimeout(() => {
        if (tutorial && state && state.phase === 'placement' && state.turn === 'blue' && !busy) submit({ type: 'place', cell: TUTORIAL_BLUE_CELL });
      }, 900 / settings.speed);
      break;
    case 'moved': {
      const step = COACH.moved(summariseResolution(lastEvents));
      coach(step, [button(step.button, { cls: 'btn primary', onClick: () => { t.step = state.phase === 'dna' ? 'dna' : 'ageing'; tutorialRoute(); } })]);
      break;
    }
    case 'dna':
      if (state.phase === 'dna') {
        dnaUI({ coach: COACH.dna(currentDnaChoice(state)) });
        $('#banner').classList.add('coach');
      } else {
        t.step = 'ageing';
        tutorialRoute();
      }
      break;
    case 'ageing': {
      const dying = Object.values(state.creatures).filter((c) => c.age >= state.config.deathAge).length;
      const step = COACH.ageing(dying);
      coach(step, [button(step.button, { cls: 'btn primary', onClick: () => submit({ type: 'nextGeneration' }) })]);
      break;
    }
    case 'death':
      coach(COACH.death, [button(COACH.death.button, { cls: 'btn primary', onClick: () => { t.step = 'winning'; tutorialRoute(); } })]);
      break;
    default:
      coach(COACH.winning, [
        button(COACH.winning.button, { cls: 'btn primary', onClick: exitTutorial }),
        button('Keep playing this board', { cls: 'btn', onClick: keepPlayingTutorial }),
      ]);
  }
}

async function keepPlayingTutorial() {
  const saved = loadGame();
  if (saved && saved.phase !== 'ended') {
    const ok = await confirmDialog('Replace your saved match?', 'Continuing from the tutorial board will replace the match in progress.', 'Replace');
    if (!ok) return;
  }
  tutorial = null;
  state = { ...state, config: { ...state.config, ...ruleConfig() } };
  delete state.tutorial;
  saveGame();
  renderAll();
  routePhase();
}

function closePause() {
  paused = false;
  closeModal('modal-pause');
  // Keep the settings screen in step with changes made from the pause menu.
  buildSettingsScreen();
}

// ---------------------------------------------------------------------------
// Init

function init() {
  sound.setEnabled(settings.sound);
  board = new BoardView({
    wrap: $('#board-wrap'),
    board: $('#board'),
    fx: $('#fx'),
    onCellTap,
  });
  buildNewGameScreen();
  buildSettingsScreen();
  $('#help-content').innerHTML = HELP_HTML;

  // Menu
  $('[data-action="new"]').onclick = () => {
    buildNewGameScreen();
    show('screen-new');
  };
  $('#btn-continue').onclick = () => {
    const saved = loadGame();
    if (!saved) return toast('No saved match');
    tutorial = null;
    state = saved;
    lastTraitAdded = null;
    lastSkips = [];
    lastEvents = [];
    saveGame(); // persists any migration from an older save format
    enterMatch();
  };
  $('[data-action="help"]').onclick = () => {
    helpReturn = 'screen-menu';
    show('screen-help');
  };
  $('[data-action="tutorial"]').onclick = startTutorial;
  $('[data-action="settings"]').onclick = () => {
    buildSettingsScreen();
    show('screen-settings');
  };
  for (const b of $$('[data-action="menu"]')) b.onclick = () => show('screen-menu');
  $('#help-back').onclick = () => {
    show(helpReturn);
    if (helpReturn === 'screen-match' && state) {
      board.measure();
    }
  };

  // New game
  $('[data-action="start"]').onclick = async () => {
    const saved = loadGame();
    if (saved && saved.phase !== 'ended') {
      const ok = await confirmDialog('Start a new match?', 'A match is in progress. Starting a new one will replace it.', 'Start new');
      if (!ok) return;
    }
    const seed = $('#seed-input').value.trim();
    sound.unlock();
    startMatch({ gridSize: settings.gridSize, seed: seed || undefined });
  };

  // Match
  $('[data-action="pause"]').onclick = openPause;
  $('#stats-details').addEventListener('toggle', (e) => {
    settings.statsOpen = e.target.open;
    saveSettings();
  });

  // Keep the board measured when orientation changes.
  window.addEventListener('orientationchange', () => setTimeout(() => board.measure(), 200));

  // Continue the animation loop correctly if the page was hidden.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state && !busy && $('#screen-match').classList.contains('active')) board.sync(state);
  });

  show('screen-menu');
}

init();
