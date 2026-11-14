// Blueprint footprint puzzle UI (mouse, keyboard and controllers).
// Centre: target footprint. Sides: trays of required pieces and decoys.
import tilingData from './data/tiling.json';
import type { PanelAction, QuestContext } from '../contract';
import { btn, h, legend } from '../shared/frame';
import { Board, orient, solve, type Placement, type TilingLevel } from './tiling';

export const TILING = tilingData as unknown as { note: string; modes: Record<string, { taylor: string; icenter: string; hints: number; snapAssist: boolean }>; levels: TilingLevel[] };
export const levelFor = (building: string, diff: string) => TILING.levels.find(l => l.id === (TILING.modes[diff] as any)[building])!;

const COLORS = ['#e8a33d', '#5fb36b', '#4f8fd6', '#d9614c', '#9b6cd6', '#3fb5b0', '#c9b23a', '#d67aa9', '#7d9b3a', '#b0703f', '#5f7fa8', '#a8a35f'];

export interface BoardOutcome { outcome: 'solved' | 'skip' | 'leave'; hints: number; resets: number; invalid: number }

export function openBlueprint(ctx: QuestContext, building: string, opts: { allowSkip: boolean; saved: Placement[]; save: (ps: Placement[]) => void }): Promise<BoardOutcome> {
  const diff = ctx.difficulty(); const lvl = levelFor(building, diff); const mode = TILING.modes[diff];
  const board = new Board(lvl); board.restore(opts.saved ?? []);
  const all = [...lvl.pieces, ...lvl.decoys];
  // stable shuffled tray order split across both sides
  const order = [...all].sort((a, b) => (a.id.charCodeAt(a.id.length - 1) * 7 + a.cells.length) % 5 - (b.id.charCodeAt(b.id.length - 1) * 7 + b.cells.length) % 5);
  const color = (id: string) => COLORS[all.findIndex(p => p.id === id) % COLORS.length];
  const W = Math.max(...lvl.footprint.map(r => r.length)), H = lvl.footprint.length;
  let held: { id: string; rot: number; flip: boolean } | null = null;
  let cursor = { x: Math.floor(W / 2), y: Math.floor(H / 2) }, onBoard = true;
  let hintsLeft = mode.hints, hints = 0, resets = 0, invalid = 0, fadeDecoys = false, hintPiece: string | null = null, hintCells = new Set<string>();
  const history: Placement[][] = [];
  let result: BoardOutcome = { outcome: 'leave', hints: 0, resets: 0, invalid: 0 };

  return ctx.ui.custom('', (root, panel) => {
    const msg = h('div', { class: 'bp-msg', 'aria-live': 'polite' });
    const progress = h('div', { class: 'bp-progress' });
    const grid = h('div', { class: 'bp-board', style: `grid-template-columns: repeat(${W}, 1fr); aspect-ratio: ${W} / ${H}` });
    const cells: HTMLElement[][] = [];
    for (let y = 0; y < H; y++) { cells.push([]); for (let x = 0; x < W; x++) {
      const c = h('div', { class: `bp-cell ${lvl.footprint[y][x] === '#' ? 'target' : 'void'}` }); c.dataset.x = String(x); c.dataset.y = String(y);
      grid.append(c); cells[y].push(c);
    } }
    // tower crane: the trolley rides the jib above the cursor column; placing drops the load
    const trolley = h('div', { class: 'bp-trolley' }, h('div', { class: 'bp-cable' }), h('div', { class: 'bp-hook', text: '⚓' }));
    const jib = h('div', { class: 'bp-jib' });
    const site = h('div', { class: 'bp-site' }, jib, trolley, grid, h('div', { class: 'bp-done hidden' }));
    const t0 = performance.now();
    const trayL = h('div', { class: 'bp-tray' }), trayR = h('div', { class: 'bp-tray' });
    const trayBtns = new Map<string, HTMLButtonElement>();
    order.forEach((p, i) => {
      const b = h('button', { class: 'bp-piece', 'data-focus': true, type: 'button', 'aria-label': `Piece ${p.id}` }) as HTMLButtonElement;
      b.addEventListener('click', () => pick(p.id));
      b.addEventListener('pointerdown', () => { if (!held || held.id !== p.id) pick(p.id); });
      trayBtns.set(p.id, b); (i % 2 ? trayR : trayL).append(b);
    });
    const tools = h('div', { class: 'ch-footer tools-zone' }, h('span', { class: 'tools-label', text: '④ Tools' }),
      btn('Undo', () => undo()), btn('Reset', () => reset()), btn('💡 Hint', () => hint(), 'ch-hintbtn'),
      btn('Assist: fade decoys', () => { fadeDecoys = !fadeDecoys; render(); }),
      opts.allowSkip ? btn('Skip blueprint', () => done('skip')) : null, btn('Leave', () => done('leave')));
    root.append(
      h('div', { class: 'ch-head' }, h('div', { class: 'ch-playing', text: 'Architectural blueprint' }), h('h2', { class: 'ch-title', text: `Blueprint: ${lvl.label}` }), h('div', { class: `ch-diff ${diff}`, text: diff === 'hard' ? 'Hard' : 'Easy' })),
      h('p', { class: 'ch-intro', text: 'Fill every square of the footprint exactly once — no gaps, no overlaps. Some pieces are decoys and do not belong. This is a stylized plan, not a historical floor plan.' }),
      progress, h('div', { class: 'bp-wrap' }, trayL, site, trayR), msg,
      h('p', { class: 'small', text: 'Mouse: drag or click a piece, then click the board; right-click rotates; click a placed piece to pick it up.' }),
      tools, h('div', { class: 'legend-box' }, legend([['L', 'move piece'], ['R', 'choose piece'], ['RU', 'rotate'], ['1', 'place / pick up'], ['2', 'return piece'], ['3', 'hint'], ['4', 'tools']])));

    const drawPieceButton = (id: string) => {
      const b = trayBtns.get(id)!, p = board.piece(id)!, isHeld = held?.id === id, placed = board.placed.has(id);
      const cs = orient(p.cells, isHeld ? held!.rot : 0, isHeld ? held!.flip : false);
      const w = Math.max(...cs.map(c => c[0])) + 1, hh = Math.max(...cs.map(c => c[1])) + 1;
      const mini = h('div', { class: 'mini', style: `grid-template-columns: repeat(${w}, 12px)` });
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) mini.append(h('i', { style: cs.some(c => c[0] === x && c[1] === y) ? `background:${color(id)}` : '' }));
      b.replaceChildren(mini, placed ? h('span', { class: 'placed-tag', text: 'placed' }) : '');
      b.classList.toggle('held', isHeld); b.classList.toggle('is-placed', placed);
      b.classList.toggle('faded', fadeDecoys && !!p.decoy); b.classList.toggle('hinted', hintPiece === id);
    };
    const ghostCells = () => {
      if (!held) return { cells: [] as [number, number][], err: null as string | null };
      const p: Placement = { piece: held.id, rot: held.rot, flip: held.flip, x: cursor.x, y: cursor.y };
      return { cells: board.cellsOf(p), err: board.check(p) };
    };
    const render = () => {
      const g = onBoard || held ? ghostCells() : { cells: [], err: null };
      const gset = new Set(g.cells.map(c => c.join(',')));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = cells[y][x], id = board.pieceAt(x, y), k = `${x},${y}`;
        c.style.background = id ? color(id) : '';
        c.classList.toggle('filled', !!id); c.classList.toggle('ghost-ok', gset.has(k) && !g.err); c.classList.toggle('ghost-bad', gset.has(k) && !!g.err);
        c.classList.toggle('cursor', onBoard && x === cursor.x && y === cursor.y); c.classList.toggle('hint', hintCells.has(k));
      }
      grid.classList.toggle('active', onBoard);
      trolley.style.left = `${grid.offsetLeft + ((cursor.x + 0.5) / W) * grid.offsetWidth}px`; trolley.classList.toggle('loaded', !!held);
      jib.style.left = `${grid.offsetLeft - 10}px`; jib.style.width = `${grid.offsetWidth + 20}px`;
      for (const id of trayBtns.keys()) drawPieceButton(id);
      progress.textContent = `${lvl.label} · covered ${Math.round(board.coverage() * 100)}% · hints left ${hintsLeft}${held ? ` · holding a piece (rotation ${held.rot * 90}°)` : ''}`;
    };
    const say = (t: string) => { msg.textContent = t; };
    const pick = (id: string) => {
      const cur = board.placed.get(id);
      if (cur) { history.push(board.snapshot()); board.remove(id); held = { id, rot: cur.rot, flip: cur.flip }; cursor = { x: cur.x, y: cur.y }; }
      else held = { id, rot: 0, flip: false };
      onBoard = true; say('Move the piece over the footprint and place it.'); render(); ctx.world.sound('tick');
    };
    const rotate = () => { if (held) { held.rot = (held.rot + 1) % 4; render(); } };
    const flip = () => { if (held && lvl.allowFlip) { held.flip = !held.flip; render(); } };
    const tryPlace = () => {
      if (!held) { const id = board.pieceAt(cursor.x, cursor.y); if (id) pick(id); return; }
      const p: Placement = { piece: held.id, rot: held.rot, flip: held.flip, x: cursor.x, y: cursor.y };
      let err = board.check(p);
      if (err && mode.snapAssist) {          // generous snapping on Easy: try neighbouring offsets
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const q = { ...p, x: p.x + dx, y: p.y + dy }; if (!board.check(q)) { p.x = q.x; p.y = q.y; err = null; break; }
        }
      }
      if (err) { invalid++; say(`Can't place it there: ${err}`); ctx.world.sound('error'); return; }
      history.push(board.snapshot()); board.place(p); held = null; hintCells.clear(); hintPiece = null;
      ctx.world.sound('tick'); opts.save(board.snapshot());
      render();
      board.cellsOf(p).forEach(([x, y], k) => { const c = cells[y][x]; c.classList.remove('drop'); void c.offsetWidth; c.style.animationDelay = `${k * 0.02}s`; c.classList.add('drop'); });
      trolley.classList.add('dropping'); setTimeout(() => trolley.classList.remove('dropping'), 350);
      if (board.isComplete()) { celebrate(); return; }
      if (board.coverage() === 1 && board.hasDecoy()) say('Every square is covered, but a decoy piece doesn’t belong in this plan. Swap it out.');
      else say('Placed.');
      render();
    };
    const undo = () => { const s = history.pop(); if (!s) { say('Nothing to undo.'); return; } board.restore(s); held = null; opts.save(board.snapshot()); render(); };
    const reset = () => { history.push(board.snapshot()); board.restore([]); held = null; resets++; opts.save([]); say('Board reset.'); render(); };
    const hint = () => {
      if (hintsLeft <= 0) { say('No hints left for this blueprint.'); return; }
      // outline one useful piece and the region where it fits with the current placements
      const unplaced = lvl.pieces.filter(p => !board.placed.has(p.id));
      const fixedOk = board.snapshot().filter(p => !board.piece(p.piece)?.decoy);
      let sol: Placement[] | null = null;
      const sub = { ...lvl, footprint: lvl.footprint.map((r, y) => [...r].map((c, x) => (c === '#' && !fixedOk.some(p => board.cellsOf(p).some(([cx, cy]) => cx === x && cy === y)) ? '#' : '.')).join('')) };
      sol = solve(sub, unplaced.map(p => p.id));
      const target = sol?.[0] ?? lvl.solution.find(s => !board.placed.has(s.piece));
      if (!target) { say('Remove the pieces that don’t belong (decoys or misplaced pieces).'); return; }
      hintsLeft--; hints++; hintPiece = target.piece;
      hintCells = new Set(board.cellsOf(target).map(c => c.join(',')));
      say(sol ? 'Hint: the highlighted piece fits in the outlined area.' : 'Hint: your current layout can’t be finished — try removing a piece. The outline shows where a piece goes in one solution.');
      ctx.world.sound('chime'); render();
    };
    let finished = false;
    const celebrate = () => {
      finished = true;
      const secs = Math.round((performance.now() - t0) / 1000);
      const stars = hints === 0 && invalid <= 2 && resets === 0 ? 3 : hints <= 1 && invalid <= 6 ? 2 : 1;
      const box = site.querySelector('.bp-done') as HTMLElement;
      box.replaceChildren(h('div', { class: 'ch-stars' }, ...[0, 1, 2].map(i => h('span', { class: `star ${i < stars ? 'on' : ''}`, style: `--d:${i * 0.25}s`, text: '★' }))),
        h('h2', { text: 'Blueprint approved!' }), h('p', { text: `${secs} s · ${hints} hint(s) · ${invalid} bad drop(s)` }), btn('Build it! ▶', () => done('solved'), 'primary'));
      box.classList.remove('hidden'); ctx.world.sound('success'); panel.refocus();
      (box.querySelector('button') as HTMLButtonElement).classList.add('focused');
    };
    const done = (o: BoardOutcome['outcome']) => { result = { outcome: o, hints, resets, invalid }; panel.close(o); };
    // mouse on the board
    const cellAt = (e: PointerEvent) => { const t = (e.target as HTMLElement).closest('.bp-cell') as HTMLElement | null; return t ? { x: +t.dataset.x!, y: +t.dataset.y! } : null; };
    grid.addEventListener('pointermove', e => { const c = cellAt(e); if (c && held) { cursor = c; render(); } });
    grid.addEventListener('pointerup', e => { const c = cellAt(e); if (!c) return; cursor = c; if (e.button === 2) { rotate(); return; } tryPlace(); });
    grid.addEventListener('contextmenu', e => e.preventDefault());
    grid.addEventListener('wheel', e => { if (held) { e.preventDefault(); rotate(); } }, { passive: false });
    /** Right stick left/right: hold the next/previous piece that isn't placed yet (no tray navigation needed). */
    const cyclePiece = (dir: 1 | -1) => {
      const free = order.filter(p => !board.placed.has(p.id)); if (!free.length) { say('All pieces are on the board.'); return; }
      const i = held ? free.findIndex(p => p.id === held!.id) : -1;
      const next = free[((i + dir) % free.length + free.length) % free.length];
      held = { id: next.id, rot: 0, flip: false }; onBoard = true; say('Move the piece with the left stick; ① places it.'); render(); ctx.world.sound('tick');
    };
    panel.onAction((a: PanelAction) => {
      if (finished) { if (a === 'confirm') done('solved'); return true; }
      if (a === 'alt') { cyclePiece(1); return true; }
      if (a === 'alt2') { cyclePiece(-1); return true; }
      if (a === 'rup') { rotate(); return true; }
      if (a === 'rdown') { if (lvl.allowFlip) flip(); else if (held) { held.rot = (held.rot + 3) % 4; render(); } return true; }
      if (a === 'hint') { hint(); return true; }
      if (!onBoard) return false;
      if (a === 'left') cursor.x = Math.max(0, cursor.x - 1); else if (a === 'right') cursor.x = Math.min(W - 1, cursor.x + 1);
      else if (a === 'up') cursor.y = Math.max(0, cursor.y - 1); else if (a === 'down') cursor.y = Math.min(H - 1, cursor.y + 1);
      else if (a === 'confirm') { tryPlace(); return true; }
      else if (a === 'back') { if (!held) return false; held = null; say('Piece returned to the tray.'); render(); return true; }
      else return false;
      render(); return true;
    });
    render(); requestAnimationFrame(() => render());   // re-run once laid out (crane needs sizes)
  }, { wide: true, className: 'challenge fullscreen blueprint' }).then(() => result);
}
