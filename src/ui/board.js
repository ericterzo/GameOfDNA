// Board renderer: draws the grid, creatures and DNA symbols, and animates the
// engine's event log. Pieces are absolutely positioned DOM nodes moved with
// CSS transforms, which animates smoothly on phones.

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const DNA_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <path d="M7 3c0 4.5 10 5.5 10 10S7 15.5 7 21" />
  <path d="M17 3c0 4.5-10 5.5-10 10s10 3.5 10 8" />
  <path d="M8.5 6.5h7" /><path d="M8.5 17.5h7" /><path d="M9.5 12h5" />
</svg>`;

const MARKS = { red: '▲', blue: '●', purple: '◆' };

export class BoardView {
  constructor({ wrap, board, fx, onCellTap }) {
    this.wrap = wrap;
    this.board = board;
    this.fx = fx;
    this.onCellTap = onCellTap;
    this.n = 0;
    this.cells = [];
    this.pieces = new Map();
    this.dna = new Map();
    this.layer = null;
    this.deathAge = 6;
    this.shapes = false;

    this.board.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell || !this.onCellTap) return;
      this.onCellTap(Number(cell.dataset.x), Number(cell.dataset.y));
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.board);
    }
    window.addEventListener('resize', () => this.measure());
  }

  setGrid(n) {
    if (n === this.n) return;
    this.n = n;
    this.board.innerHTML = '';
    this.board.style.setProperty('--n', n);
    this.wrap.style.setProperty('--n', n);
    this.cells = [];
    const centre = new Set();
    if (n % 2 === 1) {
      const m = (n - 1) / 2;
      centre.add(m * n + m);
    } else {
      const a = n / 2 - 1;
      const b = n / 2;
      centre.add(a * n + a);
      centre.add(a * n + b);
      centre.add(b * n + a);
      centre.add(b * n + b);
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const el = document.createElement('div');
        el.className = 'cell';
        if (centre.has(y * n + x)) el.classList.add('centre');
        el.dataset.x = x;
        el.dataset.y = y;
        this.board.appendChild(el);
        this.cells.push(el);
      }
    }
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    this.board.appendChild(this.layer);
    this.pieces.clear();
    this.dna.clear();
    this.fx.setAttribute('viewBox', `0 0 ${n} ${n}`);
    this.fx.setAttribute('preserveAspectRatio', 'none');
    this.measure();
  }

  measure() {
    const w = this.board.clientWidth;
    if (w && this.n) this.wrap.style.setProperty('--cs', `${w / this.n}px`);
  }

  setSpeed(x) {
    this.wrap.style.setProperty('--spd', x);
  }

  setShapes(on) {
    this.shapes = !!on;
    this.wrap.classList.toggle('shapes', this.shapes);
    for (const p of this.pieces.values()) this.applyMark(p);
  }

  cellEl(x, y) {
    return this.cells[y * this.n + x];
  }

  // Reconcile the DOM with a state snapshot, without transitions.
  sync(state) {
    this.setGrid(state.n);
    this.deathAge = state.config.deathAge;
    this.wrap.classList.add('no-anim');
    const live = new Set();
    for (const c of Object.values(state.creatures)) {
      live.add(c.id);
      let p = this.pieces.get(c.id);
      if (!p) {
        p = this.addCreature(c, false);
      } else {
        if (p.colour !== c.colour) {
          p.el.classList.remove(p.colour);
          p.el.classList.add(c.colour);
          p.colour = c.colour;
          this.applyMark(p);
        }
        this.position(p.el, c.x, c.y);
        this.setAge(p, c.age);
        p.body.className = 'body';
      }
    }
    for (const [id, p] of this.pieces) {
      if (!live.has(id)) {
        p.el.remove();
        this.pieces.delete(id);
      }
    }
    const want = new Set(state.dna);
    for (const [k, d] of this.dna) {
      if (!want.has(k)) {
        d.el.remove();
        this.dna.delete(k);
      }
    }
    for (const k of want) if (!this.dna.has(k)) this.addDna(k, false);
    this.clearFx();
    // Force style flush so the next changes animate again.
    void this.board.offsetWidth;
    this.wrap.classList.remove('no-anim');
  }

  addCreature(c, pop) {
    const el = document.createElement('div');
    el.className = `piece creature ${c.colour}`;
    el.dataset.id = c.id;
    const body = document.createElement('div');
    body.className = 'body';
    const ageEl = document.createElement('span');
    ageEl.className = 'age';
    body.appendChild(ageEl);
    el.appendChild(body);
    this.position(el, c.x, c.y);
    const p = { el, body, ageEl, colour: c.colour, age: c.age, id: c.id };
    this.setAge(p, c.age);
    this.applyMark(p);
    if (pop) body.classList.add('pop');
    this.layer.appendChild(el);
    this.pieces.set(c.id, p);
    return p;
  }

  applyMark(p) {
    let mark = p.body.querySelector('.mark');
    if (this.shapes) {
      if (!mark) {
        mark = document.createElement('span');
        mark.className = 'mark';
        p.body.appendChild(mark);
      }
      mark.textContent = MARKS[p.colour] || '';
    } else if (mark) {
      mark.remove();
    }
  }

  position(el, x, y) {
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', y);
  }

  setAge(p, age) {
    p.age = age;
    p.ageEl.textContent = age;
    p.el.classList.toggle('dying', age >= this.deathAge);
  }

  addDna(k, pop) {
    const x = k % this.n;
    const y = Math.floor(k / this.n);
    const el = document.createElement('div');
    el.className = 'piece dna';
    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = DNA_SVG;
    if (pop) body.classList.add('pop');
    el.appendChild(body);
    this.position(el, x, y);
    this.layer.appendChild(el);
    const d = { el, body };
    this.dna.set(k, d);
    return d;
  }

  removeDna(k) {
    const d = this.dna.get(k);
    if (!d) return;
    d.el.remove();
    this.dna.delete(k);
  }

  counts() {
    const out = { red: 0, blue: 0, purple: 0 };
    for (const p of this.pieces.values()) out[p.colour]++;
    return out;
  }

  // -- Highlights -----------------------------------------------------

  setLegal(cells, colour) {
    this.clearHighlights();
    this.wrap.style.setProperty('--turn-col', `var(--${colour})`);
    for (const c of cells) this.cellEl(c.x, c.y).classList.add('legal');
  }

  setPreview(cell) {
    for (const el of this.cells) {
      if (el.classList.contains('preview')) {
        el.classList.remove('preview');
        const g = el.querySelector('.ghost');
        if (g) g.remove();
      }
    }
    if (!cell) return;
    const el = this.cellEl(cell.x, cell.y);
    el.classList.add('preview');
    const ghost = document.createElement('span');
    ghost.className = 'ghost';
    ghost.textContent = '1';
    el.appendChild(ghost);
  }

  clearHighlights() {
    for (const el of this.cells) {
      el.classList.remove('legal', 'preview');
      const g = el.querySelector('.ghost');
      if (g) g.remove();
    }
  }

  // -- Effects --------------------------------------------------------

  clearFx() {
    while (this.fx.firstChild) this.fx.removeChild(this.fx.firstChild);
  }

  linkFlash(a, b) {
    const pa = this.pieces.get(a);
    const pb = this.pieces.get(b);
    if (!pa || !pb) return;
    const ax = Number(pa.el.style.getPropertyValue('--x')) + 0.5;
    const ay = Number(pa.el.style.getPropertyValue('--y')) + 0.5;
    const bx = Number(pb.el.style.getPropertyValue('--x')) + 0.5;
    const by = Number(pb.el.style.getPropertyValue('--y')) + 0.5;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', ax);
    line.setAttribute('y1', ay);
    line.setAttribute('x2', bx);
    line.setAttribute('y2', by);
    line.setAttribute('class', 'link');
    this.fx.appendChild(line);
    setTimeout(() => line.remove(), 900);
  }

  animate(body, cls) {
    body.classList.remove(cls);
    void body.offsetWidth;
    body.classList.add(cls);
  }

  setDir(body, dir) {
    const v = DIR_VEC[dir] || [0, 0];
    body.style.setProperty('--bx', v[0]);
    body.style.setProperty('--by', v[1]);
  }

  // -- Event playback -------------------------------------------------

  // ctl: { skipped, wait(ms), sound(name), onEvent(e) }
  async play(events, finalState, ctl) {
    for (const e of events) {
      if (ctl.skipped) break;
      await this.step(e, ctl);
      if (ctl.onEvent) ctl.onEvent(e, this);
    }
    this.sync(finalState);
  }

  async step(e, ctl) {
    switch (e.type) {
      case 'death': {
        const p = this.pieces.get(e.id);
        if (!p) return;
        this.animate(p.body, 'fade');
        ctl.sound('death');
        await ctl.wait(380);
        p.el.remove();
        this.pieces.delete(e.id);
        return;
      }
      case 'placed': {
        this.addCreature({ id: e.id, colour: e.colour, x: e.cell.x, y: e.cell.y, age: 1 }, true);
        ctl.sound('place');
        await ctl.wait(340);
        return;
      }
      case 'move': {
        const p = this.pieces.get(e.id);
        if (!p) return;
        this.position(p.el, e.to.x, e.to.y);
        await ctl.wait(290);
        return;
      }
      case 'blocked': {
        const p = this.pieces.get(e.id);
        if (!p) return;
        this.setDir(p.body, e.dir);
        this.animate(p.body, 'nudge');
        await ctl.wait(230);
        return;
      }
      case 'collision': {
        const m = this.pieces.get(e.moverId);
        const o = this.pieces.get(e.occupantId);
        if (m) {
          this.setDir(m.body, e.dir);
          this.animate(m.body, 'bump');
        }
        if (o) {
          this.setDir(o.body, e.dir);
          this.animate(o.body, 'shake');
        }
        ctl.sound('bump');
        await ctl.wait(300);
        return;
      }
      case 'kill': {
        const v = this.pieces.get(e.victimId);
        ctl.sound('kill');
        if (v) {
          this.animate(v.body, 'killed');
          await ctl.wait(380);
          v.el.remove();
          this.pieces.delete(e.victimId);
        }
        return;
      }
      case 'birth': {
        if (e.via !== 'collision') this.linkFlash(e.parents[0], e.parents[1]);
        this.addCreature({ id: e.id, colour: e.colour, x: e.cell.x, y: e.cell.y, age: 1 }, true);
        ctl.sound('birth');
        await ctl.wait(360);
        return;
      }
      case 'pickup': {
        const k = e.cell.y * this.n + e.cell.x;
        const d = this.dna.get(k);
        ctl.sound('pickup');
        if (d) {
          this.animate(d.body, 'sparkle');
          await ctl.wait(320);
          this.removeDna(k);
        }
        return;
      }
      case 'age': {
        for (const id of e.ids) {
          const p = this.pieces.get(id);
          if (!p) continue;
          this.setAge(p, p.age + 1);
          this.animate(p.body, 'agebump');
        }
        if (e.ids.length) ctl.sound('age');
        await ctl.wait(320);
        return;
      }
      case 'dnaSpawn': {
        for (const c of e.cells) this.addDna(c.y * this.n + c.x, true);
        await ctl.wait(300);
        return;
      }
      default:
        return;
    }
  }
}
