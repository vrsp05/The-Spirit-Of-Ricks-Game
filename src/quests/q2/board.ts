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
  let cursor = { x: Math.floor(W / 2), y: Math.floor(H / 2) }, onBoard = false;
  // controller flow: choose a piece in the trays with the stick (selIdx), ① picks it up, then move/rotate/place on the board
  let selIdx = 0;
  let hintsLeft = mode.hints, hints = 0, resets = 0, invalid = 0, fadeDecoys = false, hintPiece: string | null = null, hintCells = new Set<string>();
  const history: Placement[][] = [];
  let result: BoardOutcome = { outcome: 'leave', hints: 0, resets: 0, invalid: 0 };

  return ctx.ui.custom('', (root, panel) => {
    let disposed = false;
    const msg = h('div', { class: 'bp-msg', 'aria-live': 'polite' });
    const progress = h('div', { class: 'bp-progress' });
    const grid = h('div', { class: 'bp-board', style: `grid-template-columns: repeat(${W}, 1fr); aspect-ratio: ${W} / ${H}` });
    const cells: HTMLElement[][] = [];
    for (let y = 0; y < H; y++) { cells.push([]); for (let x = 0; x < W; x++) {
      const c = h('div', { class: `bp-cell ${lvl.footprint[y][x] === '#' ? 'target' : 'void'}` }); c.dataset.x = String(x); c.dataset.y = String(y);
      grid.append(c); cells[y].push(c);
    } }
    const heldShape = h('div', { class: 'bp-held-shape hidden', 'aria-hidden': 'true' });
    grid.append(heldShape);
    // tower crane: the trolley rides the jib above the cursor column; placing drops the load
    const trolley = h('div', { class: 'bp-trolley' }, h('div', { class: 'bp-cable' }), h('div', { class: 'bp-hook', text: '⚓' }));
    const jib = h('div', { class: 'bp-jib' });
    const site = h('div', { class: 'bp-site' }, jib, trolley, grid, h('div', { class: 'bp-done hidden' }));
    const t0 = performance.now();
    const trayL = h('div', { class: 'bp-tray' }), trayR = h('div', { class: 'bp-tray' });
    const trayBtns = new Map<string, HTMLButtonElement>();
    order.forEach((p, i) => {
      const b = h('button', { class: 'bp-piece', 'data-focus': true, type: 'button', 'aria-label': `Piece ${p.id}` }) as HTMLButtonElement;
      let returnOnClick = false;
      b.addEventListener('pointerdown', e => {
        if (e.button !== 0 || finished) return;
        returnOnClick = held?.id === p.id;
        if (!returnOnClick) pick(p.id);
      });
      b.addEventListener('click', e => {
        if (finished) return;
        // Pointer-down already picked the piece. Do not reset its orientation on click.
        if (e.detail === 0) { if (held?.id === p.id) returnPiece(); else pick(p.id); }
        else if (returnOnClick && held?.id === p.id) returnPiece();
        returnOnClick = false;
      });
      trayBtns.set(p.id, b); (i % 2 ? trayR : trayL).append(b);
    });
    const rotateLeft = btn('↶ Rotate left', () => rotate(-1));
    const rotateRight = btn('↷ Rotate right', () => rotate(1));
    const returnButton = btn('Return piece', () => returnPiece());
    const mirrorButton = lvl.allowFlip ? btn('Mirror', () => flip()) : null;
    const pieceTools = h('div', { class: 'bp-piece-tools tools-zone', 'aria-label': 'Held piece controls' },
      rotateLeft, rotateRight, mirrorButton, returnButton);
    const tools = h('div', { class: 'ch-footer tools-zone' }, h('span', { class: 'tools-label', text: '④ Tools' }),
      btn('Undo', () => undo()), btn('Reset', () => reset()), btn('💡 Hint', () => hint(), 'ch-hintbtn'),
      btn('Assist: fade decoys', () => { fadeDecoys = !fadeDecoys; render(); }),
      opts.allowSkip ? btn('Skip blueprint', () => done('skip')) : null, btn('Leave', () => done('leave')));
    root.append(
      h('div', { class: 'ch-head' }, h('div', { class: 'ch-playing', text: 'Architectural blueprint' }), h('h2', { class: 'ch-title', text: `Blueprint: ${lvl.label}` }), h('div', { class: `ch-diff ${diff}`, text: diff === 'hard' ? 'Hard' : 'Easy' })),
      h('p', { class: 'ch-intro', text: 'Fill every square of the footprint exactly once — no gaps, no overlaps. Some pieces are decoys and do not belong. This is a stylized plan, not a historical floor plan.' }),
      progress, pieceTools, h('div', { class: 'bp-wrap' }, trayL, site, trayR), msg,
      h('p', { class: 'small', text: 'Controller: choose a piece with the stick, ① picks it up, move it with the stick, rotate with L / R, ① places it, ② puts it back. Mouse: click a piece, then click the board; right-click or wheel rotates. Keyboard: WASD, Enter, R/F rotate, Esc puts it back.' }),
      tools, h('div', { class: 'legend-box' }, legend([['L', 'choose piece · move it'], ['1', 'pick up · place'], ['R', 'rotate (Joy-Con L / R)'], ['2', 'put back · choose again'], ['3', 'hint'], ['4', 'tools']])));
    const confirmKey = root.querySelector('.k1 + i');
    if (confirmKey) confirmKey.textContent = 'Enter / Space';

    const drawPieceButton = (id: string) => {
      const b = trayBtns.get(id)!, p = board.piece(id)!, isHeld = held?.id === id, placed = board.placed.has(id);
      const cs = orient(p.cells, isHeld ? held!.rot : 0, isHeld ? held!.flip : false);
      const w = Math.max(...cs.map(c => c[0])) + 1, hh = Math.max(...cs.map(c => c[1])) + 1;
      const mini = h('div', { class: 'mini', style: `grid-template-columns: repeat(${w}, 12px)` });
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) mini.append(h('i', { style: cs.some(c => c[0] === x && c[1] === y) ? `background:${color(id)}` : '' }));
      b.replaceChildren(mini, placed ? h('span', { class: 'placed-tag', text: 'placed' }) : '');
      b.classList.toggle('held', isHeld); b.classList.toggle('is-placed', placed);
      b.setAttribute('aria-pressed', String(isHeld)); b.disabled = finished;
      b.classList.toggle('faded', fadeDecoys && !!p.decoy); b.classList.toggle('hinted', hintPiece === id);
      b.classList.toggle('bp-sel', !held && !finished && order[selIdx]?.id === id);
    };
    const ghostCells = () => {
      if (!held) return { cells: [] as [number, number][], err: null as string | null };
      const p: Placement = { piece: held.id, rot: held.rot, flip: held.flip, x: cursor.x, y: cursor.y };
      return { cells: board.cellsOf(p), err: board.check(p) };
    };
    const layoutBoard = () => {
      if (!site.clientWidth || !root.offsetWidth) return;
      const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
      const css = getComputedStyle(grid), px = (value: string) => parseFloat(value) || 0;
      const trimX = px(css.paddingLeft) + px(css.paddingRight) + px(css.borderLeftWidth) + px(css.borderRightWidth);
      const trimY = px(css.paddingTop) + px(css.paddingBottom) + px(css.borderTopWidth) + px(css.borderBottomWidth);
      const gapX = px(css.columnGap), gapY = px(css.rowGap);
      const maxHeight = Math.max(120, Math.min(window.innerHeight * .56 / scale, window.innerHeight / scale - 360));
      const size = Math.max(1, Math.floor(Math.min((site.clientWidth - trimX - gapX * (W - 1)) / W, (maxHeight - trimY - gapY * (H - 1)) / H)));
      // Square tracks prevent a quarter-turn from stretching the piece.
      grid.style.gridTemplateColumns = `repeat(${W}, ${size}px)`;
      grid.style.gridTemplateRows = `repeat(${H}, ${size}px)`;
      grid.style.width = `${W * size + gapX * (W - 1) + trimX}px`;
      grid.style.height = `${H * size + gapY * (H - 1) + trimY}px`;
      grid.style.maxHeight = 'none'; grid.style.aspectRatio = 'auto';
    };
    const render = () => {
      if (disposed) return;
      layoutBoard();
      const g = onBoard || held ? ghostCells() : { cells: [], err: null };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = cells[y][x], id = board.pieceAt(x, y), k = `${x},${y}`;
        c.style.background = id ? color(id) : '';
        c.classList.toggle('filled', !!id);
        c.classList.toggle('cursor', onBoard && !held && x === cursor.x && y === cursor.y); c.classList.toggle('hint', hintCells.has(k));
      }
      heldShape.classList.toggle('hidden', !held);
      heldShape.classList.toggle('invalid', !!g.err);
      heldShape.replaceChildren();
      if (held) {
        // A separate preview keeps the entire shape visible, even beyond a board edge.
        const first = cells[0][0], stepX = W > 1 ? cells[0][1].offsetLeft - first.offsetLeft : first.offsetWidth + 2;
        const stepY = H > 1 ? cells[1][0].offsetTop - first.offsetTop : first.offsetHeight + 2;
        heldShape.style.left = `${first.offsetLeft + cursor.x * stepX}px`;
        heldShape.style.top = `${first.offsetTop + cursor.y * stepY}px`;
        heldShape.dataset.piece = held.id; heldShape.dataset.rotation = String(held.rot); heldShape.dataset.flip = String(held.flip);
        const shape = orient(board.piece(held.id)!.cells, held.rot, held.flip);
        heldShape.style.width = `${Math.max(...shape.map(c => c[0])) * stepX + first.offsetWidth}px`;
        heldShape.style.height = `${Math.max(...shape.map(c => c[1])) * stepY + first.offsetHeight}px`;
        for (const [x, y] of shape) heldShape.append(h('div', { class: 'bp-held-cell', 'data-x': x, 'data-y': y,
          style: `left:${x * stepX}px;top:${y * stepY}px;width:${first.offsetWidth}px;height:${first.offsetHeight}px;background:${color(held.id)}` }));
      } else { delete heldShape.dataset.piece; delete heldShape.dataset.rotation; delete heldShape.dataset.flip; }
      for (const button of [rotateLeft, rotateRight, returnButton, mirrorButton]) if (button) button.disabled = !held || finished;
      grid.classList.toggle('active', onBoard);
      trolley.style.left = `${grid.offsetLeft + ((cursor.x + 0.5) / W) * grid.offsetWidth}px`; trolley.classList.toggle('loaded', !!held);
      jib.style.left = `${grid.offsetLeft - 10}px`; jib.style.width = `${grid.offsetWidth + 20}px`;
      for (const id of trayBtns.keys()) drawPieceButton(id);
      progress.textContent = `${lvl.label} · covered ${Math.round(board.coverage() * 100)}% · hints left ${hintsLeft}${held ? ` · holding a piece (rotation ${held.rot * 90}°)` : ' · no piece selected'}`;
    };
    const say = (t: string) => { msg.textContent = t; };
    const pick = (id: string) => {
      if (finished) return;
      const cur = board.placed.get(id);
      if (cur) { history.push(board.snapshot()); board.remove(id); opts.save(board.snapshot()); held = { id, rot: cur.rot, flip: cur.flip }; cursor = { x: cur.x, y: cur.y }; }
      else held = { id, rot: 0, flip: false };
      selIdx = Math.max(0, order.findIndex(p => p.id === id));
      onBoard = true; say('Move the piece over the footprint with the stick, rotate with L / R, place it with ①. ② puts it back.'); render(); ctx.world.sound('tick');
    };
    const returnPiece = () => {
      if (!held) return;
      held = null; onBoard = false; opts.save(board.snapshot()); say('Piece returned to the tray. Choose a piece with the stick.'); render();
    };
    const rotate = (direction: 1 | -1 = 1) => { if (held && !finished) { held.rot = (held.rot + direction + 4) % 4; render(); } };
    const flip = () => { if (held && lvl.allowFlip) { held.flip = !held.flip; render(); } };
    const tryPlace = () => {
      if (finished) return;
      if (!held) { const id = board.pieceAt(cursor.x, cursor.y); if (id) pick(id); return; }
      const p: Placement = { piece: held.id, rot: held.rot, flip: held.flip, x: cursor.x, y: cursor.y };
      let err = board.check(p);
      if (err && mode.snapAssist) {          // generous snapping on Easy: try neighbouring offsets
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const q = { ...p, x: p.x + dx, y: p.y + dy }; if (!board.check(q)) { p.x = q.x; p.y = q.y; err = null; break; }
        }
      }
      if (err) { invalid++; say(`Can't place it there: ${err}`); ctx.world.sound('error'); return; }
      history.push(board.snapshot()); board.place(p); held = null; onBoard = false; hintCells.clear(); hintPiece = null;
      { const next = order.findIndex(q => !board.placed.has(q.id)); if (next >= 0) selIdx = next; }
      ctx.world.sound('tick'); opts.save(board.snapshot());
      render();
      board.cellsOf(p).forEach(([x, y], k) => { const c = cells[y][x]; c.classList.remove('drop'); void c.offsetWidth; c.style.animationDelay = `${k * 0.02}s`; c.classList.add('drop'); });
      trolley.classList.add('dropping'); setTimeout(() => trolley.classList.remove('dropping'), 350);
      if (board.isComplete()) { celebrate(); return; }
      if (board.coverage() === 1 && board.hasDecoy()) say('Every square is covered, but a decoy piece doesn’t belong in this plan. Swap it out.');
      else say('Placed. Choose the next piece with the stick.');
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
      finished = true; held = null; render();
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
    grid.addEventListener('pointerup', e => { const c = cellAt(e); if (!c) return; cursor = c; if (e.button === 2) { rotate(); return; } if (e.button === 0) tryPlace(); });
    grid.addEventListener('contextmenu', e => e.preventDefault());
    grid.addEventListener('wheel', e => { if (held && e.deltaY !== 0) { e.preventDefault(); rotate(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
    // The shared action layer activates focused controls; suppress native double clicks.
    root.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
    /** Stick in the trays: move to the nearest piece in that direction (by where the pieces are on screen). */
    const moveSel = (dx: number, dy: number) => {
      const rects = order.map(p => trayBtns.get(p.id)!.getBoundingClientRect());
      const c = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }), from = c(rects[selIdx]);
      let best = -1, bestScore = Infinity;
      rects.forEach((r, i) => {
        if (i === selIdx) return;
        const to = c(r), vx = to.x - from.x, vy = to.y - from.y, along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
        if (along <= 4) return;
        const score = along + across * 2.5; if (score < bestScore) { bestScore = score; best = i; }
      });
      if (best >= 0) { selIdx = best; ctx.world.sound('tick'); render(); trayBtns.get(order[best].id)!.scrollIntoView({ block: 'nearest' }); }
    };
    panel.onAction((a: PanelAction) => {
      if (finished) { if (a === 'confirm') done('solved'); return true; }
      if (a === 'hint') { hint(); return true; }
      if (!held) {
        // choosing a piece
        if (a === 'left') moveSel(-1, 0); else if (a === 'right') moveSel(1, 0);
        else if (a === 'up') moveSel(0, -1); else if (a === 'down') moveSel(0, 1);
        else if (a === 'confirm') pick(order[selIdx].id);
        else return a === 'alt' || a === 'alt2' || a === 'rup' || a === 'rdown';
        return true;
      }
      // holding a piece: move it, rotate with L / R (right stick ← →, R / F, T / G), ① places, ② puts it back
      if (a === 'alt' || a === 'rup') { rotate(1); return true; }
      if (a === 'alt2' || a === 'rdown') { rotate(-1); return true; }
      if (a === 'left') cursor.x = Math.max(0, cursor.x - 1); else if (a === 'right') cursor.x = Math.min(W - 1, cursor.x + 1);
      else if (a === 'up') cursor.y = Math.max(0, cursor.y - 1); else if (a === 'down') cursor.y = Math.min(H - 1, cursor.y + 1);
      else if (a === 'confirm') { tryPlace(); return true; }
      else if (a === 'back') { returnPiece(); return true; }
      else return false;
      render(); return true;
    });
    render(); requestAnimationFrame(() => render());   // re-run once laid out (crane needs sizes)
    window.addEventListener('resize', render);
    return () => { disposed = true; window.removeEventListener('resize', render); };
  }, { wide: true, className: 'challenge fullscreen blueprint' }).then(() => result);
}
