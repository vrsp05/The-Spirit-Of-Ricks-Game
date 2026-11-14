// 1C. Engineering — "Fix it live" (Austin electronics lab): repair the Spori's projector; rotate wire tiles so current flows from the
// battery to the bulbs. The circuit is simulated live (real nodal analysis, not pattern
// matching): wires/closed switches are zero-resistance (merged into super-nodes), bulbs
// are 1-ohm resistors, the battery fixes +1 / 0. Series bulbs glow dim, parallel bright.
// Data: data/circuit.json (rows in SOLVED orientation; the game scrambles them).
import data from './data/circuit.json';
import type { ChallengeBody } from '../shared/frame';
import { h, loop } from '../shared/frame';
import { classroom } from './classroom';
import { chalk, text } from './room3d';

export type Brightness = 'off' | 'dim' | 'bright';
export interface LevelDef { id: string; title: string; goal: string; rows: string[]; labels: Record<string, string>; expect: { switches: Record<string, boolean>; bulbs: Record<string, Brightness> }[]; hint: string; hardOnly?: boolean }
export const CIRCUIT = data as unknown as { note: string; levels: LevelDef[]; modes: Record<string, { levels: string[]; hints: number; hintStyle: 'visual' | 'text'; scramble: number }> };

const DIRS = 'NESW', DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export interface Tile { kind: 'empty' | 'wire' | 'battery' | 'bulb' | 'switch'; conn: number[]; id?: string; rot: number }
export interface Board { w: number; h: number; tiles: Tile[][] }

/** Parse a level's rows (solved orientation, rot = 0). */
export function parseLevel(l: LevelDef): Board {
  const tiles = l.rows.map(r => r.trim().split(/\s+/).map((tok): Tile => {
    if (tok === '.') return { kind: 'empty', conn: [], rot: 0 };
    if (tok.startsWith('B+')) { const d = DIRS.indexOf(tok[2]); return { kind: 'battery', conn: [d, (d + 2) % 4], rot: 0 }; }
    const [k, sides, id] = tok.split(':');
    if (k === 'U' || k === 'S') return { kind: k === 'U' ? 'bulb' : 'switch', conn: [...sides].map(c => DIRS.indexOf(c)), id, rot: 0 };
    return { kind: 'wire', conn: [...tok].map(c => DIRS.indexOf(c)), rot: 0 };
  }));
  return { w: Math.max(...tiles.map(r => r.length)), h: tiles.length, tiles };
}
/** Open sides of a tile in its current rotation (clockwise steps). */
export const sides = (t: Tile) => t.conn.map(d => (d + t.rot) % 4);
const sideSet = (t: Tile) => sides(t).sort().join('');
/** Fewest single-step rotations (either way) from the current orientation to one equivalent to the solution. */
export function stepsToSolved(t: Tile): number {
  if (t.kind !== 'wire') return 0;
  const want = t.conn.slice().sort().join('');
  let best = 4; for (let r = 0; r < 4; r++) if (t.conn.map(d => (d + r) % 4).sort().join('') === want) { const k = ((r - t.rot) % 4 + 4) % 4; best = Math.min(best, k, 4 - k); }
  return best % 4;
}

export interface SimResult { short: boolean; bulbs: Record<string, { current: number; brightness: Brightness }>; live: Set<string> }

/** Simulate the board for one switch state. `live` holds "x,y" of wire tiles carrying current. */
export function simulate(b: Board, switches: Record<string, boolean>): SimResult {
  const parent = new Map<string, string>();
  const find = (a: string): string => { let p = parent.get(a) ?? a; if (p !== a) { p = find(p); parent.set(a, p); } return p; };
  const union = (a: string, c: string) => { const ra = find(a), rc = find(c); if (ra !== rc) parent.set(ra, rc); };
  const has = (x: number, y: number, d: number) => { const t = b.tiles[y]?.[x]; return !!t && t.kind !== 'empty' && sides(t).includes(d); };
  const side = (x: number, y: number, d: number) => `${x},${y},${d}`;
  const resistors: { id: string; a: string; b: string }[] = [];
  let plus = '', minus = '';
  b.tiles.forEach((row, y) => row.forEach((t, x) => {
    const s = sides(t);
    for (const d of s) { const nx = x + DX[d], ny = y + DY[d]; if (has(nx, ny, (d + 2) % 4)) union(side(x, y, d), side(nx, ny, (d + 2) % 4)); }
    if (t.kind === 'wire') for (const d of s.slice(1)) union(side(x, y, s[0]), side(x, y, d));
    if (t.kind === 'switch' && switches[t.id!]) union(side(x, y, s[0]), side(x, y, s[1]));
    if (t.kind === 'bulb') resistors.push({ id: t.id!, a: side(x, y, s[0]), b: side(x, y, s[1]) });
    if (t.kind === 'battery') { plus = side(x, y, s[0]); minus = side(x, y, s[1]); }
  }));
  const P = find(plus), M = find(minus);
  const res: SimResult = { short: P === M, bulbs: {}, live: new Set() };
  const bulbs = resistors.map(r => ({ id: r.id, a: find(r.a), b: find(r.b) }));
  for (const r of bulbs) res.bulbs[r.id] = { current: 0, brightness: 'off' };
  if (res.short) return res;
  const adj = new Map<string, string[]>();
  for (const r of bulbs) { if (r.a === r.b) continue; (adj.get(r.a) ?? adj.set(r.a, []).get(r.a)!).push(r.b); (adj.get(r.b) ?? adj.set(r.b, []).get(r.b)!).push(r.a); }
  const comp = new Set([P, M]); const q = [P, M];
  while (q.length) { const n = q.pop()!; for (const m of adj.get(n) ?? []) if (!comp.has(m)) { comp.add(m); q.push(m); } }
  const unknown = [...comp].filter(n => n !== P && n !== M), idx = new Map(unknown.map((n, i) => [n, i]));
  const N = unknown.length, A = Array.from({ length: N }, () => new Array(N + 1).fill(0));
  const V = (n: string) => (n === P ? 1 : n === M ? 0 : null);
  for (const r of bulbs) {
    if (r.a === r.b || !comp.has(r.a) || !comp.has(r.b)) continue;
    for (const [p, o] of [[r.a, r.b], [r.b, r.a]] as const) {
      const i = idx.get(p); if (i === undefined) continue;
      A[i][i] += 1; const vo = V(o); if (vo !== null) A[i][N] += vo; else A[i][idx.get(o)!] -= 1;
    }
  }
  for (let c = 0; c < N; c++) {
    let piv = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; const d = A[c][c]; if (Math.abs(d) < 1e-12) continue;
    for (let k = c; k <= N; k++) A[c][k] /= d;
    for (let r = 0; r < N; r++) if (r !== c && A[r][c]) { const f = A[r][c]; for (let k = c; k <= N; k++) A[r][k] -= f * A[c][k]; }
  }
  const volt = (n: string) => V(n) ?? (idx.has(n) ? A[idx.get(n)!][N] : NaN);
  const liveNodes = new Set<string>();
  for (const r of bulbs) {
    if (r.a === r.b || !comp.has(r.a)) continue;
    const i = Math.abs(volt(r.a) - volt(r.b));
    res.bulbs[r.id] = { current: i, brightness: i >= 0.75 ? 'bright' : i >= 0.2 ? 'dim' : 'off' };
    if (i > 0.05) { liveNodes.add(r.a); liveNodes.add(r.b); }
  }
  b.tiles.forEach((row, y) => row.forEach((t, x) => {
    if ((t.kind === 'wire' || t.kind === 'switch' || t.kind === 'battery') && t.conn.length && sides(t).some(d => liveNodes.has(find(side(x, y, d))))) res.live.add(`${x},${y}`);
  }));
  return res;
}

/** Check the board against every expected switch state of a level. */
export function testBoard(l: LevelDef, b: Board) {
  const rows = l.expect.map(e => {
    const r = simulate(b, e.switches);
    return { e, r, ok: !r.short && Object.entries(e.bulbs).every(([id, want]) => r.bulbs[id]?.brightness === want) };
  });
  return { pass: rows.every(r => r.ok), rows };
}

/** Rotate wire tiles randomly (never leaving the level already solved). */
export function scramble(b: Board, l: LevelDef, amount: number, rnd: () => number = Math.random) {
  for (let tries = 0; tries < 50; tries++) {
    for (const row of b.tiles) for (const t of row) if (t.kind === 'wire') t.rot = rnd() < amount ? 1 + Math.floor(rnd() * 3) : 0;
    if (!testBoard(l, b).pass) return;
  }
  for (const row of b.tiles) for (const t of row) if (t.kind === 'wire' && t.conn.length < 4) { t.rot = 1; if (!testBoard(l, b).pass) return; }
}

// ---------- drawing ----------
const T = 78;
function drawBoard(cv: HTMLCanvasElement, l: LevelDef, b: Board, sim: SimResult, cur: { x: number; y: number }, hintTile: string | null, time: number, flash: number, switchState: Record<string, boolean>) {
  const g = cv.getContext('2d')!; const W = b.w * T, H = b.h * T;
  if (cv.width !== W + 16 || cv.height !== H + 16) { cv.width = W + 16; cv.height = H + 16; }
  g.save(); g.fillStyle = '#0b1622'; g.fillRect(0, 0, cv.width, cv.height); g.translate(8, 8);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const t = b.tiles[y][x], X = x * T, Y = y * T, cx = X + T / 2, cy = Y + T / 2;
    // voxel stone tile
    g.fillStyle = t.kind === 'wire' ? '#22384d' : t.kind === 'empty' ? '#14222f' : '#2c3f52'; g.fillRect(X + 2, Y + 2, T - 4, T - 4);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(X + 2, Y + 2, T - 4, 5); g.fillRect(X + 2, Y + 2, 5, T - 4);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X + 2, Y + T - 7, T - 4, 5); g.fillRect(X + T - 7, Y + 2, 5, T - 4);
    if (t.kind === 'empty') continue;
    const live = sim.live.has(`${x},${y}`) && !sim.short;
    const s = sides(t);
    const wire = (d: number, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + DX[d] * T / 2, cy + DY[d] * T / 2); g.stroke(); };
    if (t.kind === 'wire') {
      for (const d of s) wire(d, 16, '#0b0b0b');
      for (const d of s) wire(d, 10, live ? '#ffd34d' : '#a07a4a');
      if (live) { g.setLineDash([6, 10]); g.lineDashOffset = -time * 40; for (const d of s) wire(d, 4, '#fffbe0'); g.setLineDash([]); }
      g.fillStyle = live ? '#ffd34d' : '#a07a4a'; g.fillRect(cx - 7, cy - 7, 14, 14);
    } else if (t.kind === 'battery') {
      for (const d of s) wire(d, 10, live ? '#ffd34d' : '#a07a4a');
      g.fillStyle = '#0b0b0b'; g.fillRect(cx - 18, cy - 24, 36, 48);
      g.fillStyle = '#d9483b'; g.fillRect(cx - 15, cy - 21, 30, 21); g.fillStyle = '#333'; g.fillRect(cx - 15, cy, 30, 21);
      g.fillStyle = '#fff'; g.font = 'bold 18px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const pd = s[0]; g.fillText('+', cx + DX[pd] * 10, cy + DY[pd] * 11); g.fillText('−', cx - DX[pd] * 10, cy - DY[pd] * 11);
    } else if (t.kind === 'switch') {
      const on = !!switchState[t.id!];
      for (const d of s) wire(d, 10, live ? '#ffd34d' : '#a07a4a');
      g.fillStyle = '#0b0b0b'; g.fillRect(cx - 20, cy - 12, 40, 24); g.fillStyle = on ? '#4fd36f' : '#8a96a3'; g.fillRect(cx - 17, cy - 9, 34, 18);
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 12, cy + 4); g.lineTo(cx + 12, on ? cy + 4 : cy - 12); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.fillText(on ? 'ON' : 'OFF', cx, cy + T / 2 - 12);
    } else if (t.kind === 'bulb') {
      const br = sim.bulbs[t.id!]?.brightness ?? 'off';
      for (const d of s) wire(d, 10, br !== 'off' ? '#ffd34d' : '#a07a4a');
      if (br !== 'off') { const rr = br === 'bright' ? 46 : 30; const grd = g.createRadialGradient(cx, cy, 4, cx, cy, rr); grd.addColorStop(0, br === 'bright' ? 'rgba(255,240,150,.95)' : 'rgba(255,190,90,.7)'); grd.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = grd; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
      g.fillStyle = '#0b0b0b'; g.fillRect(cx - 16, cy - 16, 32, 32);
      g.fillStyle = br === 'bright' ? '#fff6b0' : br === 'dim' ? '#e0a050' : '#59636e'; g.fillRect(cx - 13, cy - 13, 26, 26);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(cx - 10, cy - 10, 8, 8);
      g.fillStyle = '#fff'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const lab = (l.labels[t.id!] ?? t.id!).toUpperCase().slice(0, 10), lw = g.measureText(lab).width + 6;
      g.fillStyle = '#0b0b0b'; g.fillRect(cx - lw / 2, Y + T - 17, lw, 14); g.fillStyle = '#fff'; g.fillText(lab, cx, Y + T - 10);
    }
    if (hintTile === `${x},${y}`) { g.strokeStyle = '#9cff57'; g.lineWidth = 4; g.setLineDash([8, 6]); g.strokeRect(X + 5, Y + 5, T - 10, T - 10); g.setLineDash([]); }
  }
  if (sim.short) { g.fillStyle = `rgba(255,60,40,${0.25 + 0.2 * Math.sin(time * 20)})`; g.fillRect(0, 0, W, H); }
  if (flash > 0) { g.fillStyle = `rgba(255,240,170,${flash * 0.6})`; g.fillRect(0, 0, W, H); }
  g.strokeStyle = '#ffd34d'; g.lineWidth = 5; g.strokeRect(cur.x * T + 3, cur.y * T + 3, T - 6, T - 6);
  g.restore();
}
export const circuitChallenge: ChallengeBody = (root, api) => {
  const mode = CIRCUIT.modes[api.difficulty];
  const levels = mode.levels.map(id => CIRCUIT.levels.find(l => l.id === id)!);
  let li = 0, board!: Board, cur = { x: 0, y: 0 }, moves = 0, par = 0, totalMoves = 0, totalPar = 0, hintsLeft = mode.hints, hintTile: string | null = null;
  let wasShort = false, shortSignalled = false, solvedT = 0, flash = 0, startT = performance.now(), switchState: Record<string, boolean> = {}, needed = new Set<string>();
  const cv = h('canvas', { class: 'cx-board', 'aria-label': 'Circuit board' }) as HTMLCanvasElement;
  const goal = h('div', { class: 'cx-goal' }), bulbsEl = h('div', { class: 'cx-bulbs' }), info = h('div', { class: 'cx-info' });
  root.append(h('div', { class: 'cx-wrap' }, h('div', { class: 'cx-boardbox' }, cv), h('div', { class: 'cx-side' }, goal, bulbsEl, info)));
  api.setControls([['L', 'move'], ['1', 'rotate ↻'], ['2', 'rotate ↺'], ['R', 'rotate'], ['RU', 'flip switch'], ['3', 'hint'], ['4', 'tools']]);

  const load = () => {
    const l = levels[li]; board = parseLevel(l);
    needed = new Set(l.expect.flatMap(e => [...simulate(board, e.switches).live]));   // tiles the solved circuit uses
    scramble(board, l, mode.scramble);
    switchState = Object.fromEntries(Object.keys(l.expect[0].switches).map(k => [k, false]));
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__circuit = { board, level: l };   // test hook (dev builds only)
    par = board.tiles.reduce((s, r, y) => s + r.reduce((q, t, x) => q + (needed.has(`${x},${y}`) ? stepsToSolved(t) : 0), 0), 0); moves = 0; hintTile = null; solvedT = 0;
    const firstWire = board.tiles.flatMap((r, y) => r.map((t, x) => ({ t, x, y }))).find(o => o.t.kind === 'wire'); cur = firstWire ? { x: firstWire.x, y: firstWire.y } : { x: 0, y: 0 };
    goal.replaceChildren(h('div', { class: 'cx-lvl', text: `Circuit ${li + 1} / ${levels.length}` }), h('div', { class: 'cx-title', text: l.title }), h('p', { text: l.goal }));
    const wb = classroom()?.room?.get('board');
    if (wb) { chalk(wb, '#22303a'); let y = text(wb, 'PROJECTOR REPAIR', wb.w / 2, 30, 52, '#ffe08a', 'center'); y = text(wb, `Circuit ${li + 1} of ${levels.length}: ${l.title}`, wb.w / 2, y + 10, 38, '#f1efe6', 'center'); text(wb, l.goal, wb.w / 2, y + 16, 32, '#cfe6ff', 'center', undefined, wb.w - 120); wb.refresh(); }
    update();
  };
  const update = () => {
    const l = levels[li], sim = simulate(board, switchState);
    const want = l.expect.find(e => Object.entries(e.switches).every(([k, v]) => switchState[k] === v)) ?? l.expect[0];
    bulbsEl.replaceChildren(...Object.entries(want.bulbs).map(([id, w]) => {
      const got = sim.short ? 'off' : sim.bulbs[id]?.brightness ?? 'off';
      const lab = l.labels[id] ?? id, word = (v: string) => (/^Fan/.test(lab) ? ({ off: 'stopped', dim: 'slow', bright: 'full' } as Record<string, string>)[v] ?? v : v);
      return h('div', { class: `cx-bulb ${got === w ? 'ok' : ''}` }, h('span', { class: `dot ${got}` }), `${lab}: `, h('b', { text: word(got) }), ` (wants ${word(w)}) ${got === w ? '✔' : ''}`);
    }), sim.short ? h('div', { class: 'cx-short', text: '⚡ The fuse blew — there’s a short (+ wired straight to −). A new fuse is in; fix the wiring.' }) : "");
    const sw = Object.keys(switchState);
    info.replaceChildren(h('div', { text: `Moves: ${moves} (best possible ${par})` }), sw.length ? h('div', { text: `Switch: ${sw.map(k => `${switchState[k] ? 'ON' : 'OFF'}`).join(', ')} — flip with right stick ↑ / T` }) : "");
    api.setStatus(sim.short ? 'Pop! The fuse blew — something connects the plug to itself.' : '');
    if (sim.short && !wasShort) classroom()?.react('gasp', 'Whoa! The fuse popped!');
    wasShort = sim.short;
    const room = classroom()?.room;
    if (room) {
      const find = (re: RegExp) => Object.entries(l.labels).find(([, v]) => re.test(v))?.[0];
      const lampId = find(/^Lamp/), fanId = find(/^Fan/);
      room.signal('lamp', sim.short || !lampId ? 'off' : sim.bulbs[lampId]?.brightness ?? 'off');
      room.signal('fan', sim.short || !fanId ? 'off' : sim.bulbs[fanId]?.brightness ?? 'off');
      if (sim.short && !shortSignalled) room.signal('fuse', true);
      shortSignalled = sim.short;
    }
    if (!solvedT && testBoard(l, board).pass) { solvedT = 1.4; flash = 1; classroom()?.react(li === levels.length - 1 ? 'ooh' : 'nod', li === levels.length - 1 ? 'The lamp is throwing light on the wall!' : undefined); classroom()?.engagement((li + 1) / levels.length); totalMoves += moves; totalPar += par; api.setStatus(l.expect.length > 1 ? 'It works in every switch position!' : 'The circuit works!'); }
  };
  const rotate = (dir: 1 | -1) => {
    if (solvedT) return;
    const t = board.tiles[cur.y][cur.x]; if (t.kind !== 'wire') { api.setStatus(t.kind === 'empty' ? '' : 'Batteries, bulbs and switches are fixed — rotate the wires.'); return; }
    t.rot = (t.rot + dir + 4) % 4; moves++; if (hintTile === `${cur.x},${cur.y}`) hintTile = null; update();
  };
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const x = Math.floor(((e.clientX - r.left) * k - 8) / T), y = Math.floor(((e.clientY - r.top) * k - 8) / T);
    if (x >= 0 && y >= 0 && x < board.w && y < board.h) { cur = { x, y }; if (board.tiles[y][x].kind === 'switch') flip(); else rotate(e.button === 2 ? -1 : 1); }
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  const flip = () => { const ks = Object.keys(switchState); if (!ks.length) { api.setStatus('No switch on this circuit.'); return; } for (const k of ks) switchState[k] = !switchState[k]; update(); };
  const stop = loop((dt, t) => {
    if (flash > 0) flash = Math.max(0, flash - dt * 1.5);
    if (solvedT) { solvedT -= dt; if (solvedT <= 0) { li++; if (li >= levels.length) return finish(); load(); } }
    if (board) drawBoard(cv, levels[li] ?? levels[levels.length - 1], board, simulate(board, switchState), cur, hintTile, t, flash, switchState);
  });
  const finish = () => {
    stop(); const secs = (performance.now() - startT) / 1000;
    const eff = totalPar / Math.max(totalPar, totalMoves);
    api.finish({ pass: true, quality: Math.max(0, 0.45 + 0.4 * eff + (secs < 60 * levels.length ? 0.15 : 0) - api.hintsUsed() * 0.05),
      summary: `The projector works again — all ${levels.length} circuits fixed! ${totalMoves} rotations (best possible ${totalPar}), ${Math.round(secs)} s.` });
  };
  api.onHint(() => {
    if (hintsLeft <= 0) return null; const l = levels[li];
    if (mode.hintStyle === 'visual') {
      const all = board.tiles.flatMap((r, y) => r.map((t, x) => ({ t, x, y, k: `${x},${y}` }))).filter(o => o.t.kind === 'wire');
      const wrongNeeded = all.filter(o => needed.has(o.k) && sideSet(o.t) !== o.t.conn.slice().sort().join(''));
      const liveNow = new Set(l.expect.flatMap(e => [...simulate(board, e.switches).live]));
      const strayDecoy = all.filter(o => !needed.has(o.k) && liveNow.has(o.k));
      const o = wrongNeeded[0] ?? strayDecoy[0];
      if (!o) return 'Every tile matches the plan — try flipping the switch.';
      hintsLeft--; hintTile = o.k; cur = { x: o.x, y: o.y };
      if (!wrongNeeded.length) return 'A spare tile (green box) is joining the circuit where it shouldn’t — turn it away.';
      return `The tile in the green box is turned the wrong way (${stepsToSolved(o.t)} turn${stepsToSolved(o.t) > 1 ? 's' : ''}).`;
    }
    hintsLeft--; return l.hint;
  });
  api.onAction(a => {
    if (a === 'left') cur.x = (cur.x + board.w - 1) % board.w; else if (a === 'right') cur.x = (cur.x + 1) % board.w;
    else if (a === 'up') cur.y = (cur.y + board.h - 1) % board.h; else if (a === 'down') cur.y = (cur.y + 1) % board.h;
    else if (a === 'confirm' || a === 'alt') { if (board.tiles[cur.y][cur.x].kind === 'switch') flip(); else rotate(1); }
    else if (a === 'back' || a === 'alt2') rotate(-1);
    else if (a === 'rdown' && classroom()?.room) { const r = classroom()!.room!; r.nextView(); const vb = (root.closest('.ch-body') as (HTMLElement & { q1ViewBtn?: HTMLElement }) | null)?.q1ViewBtn; if (vb) vb.textContent = `👁 View: ${r.viewLabel(r.current)} (G)`; }
    else if (a === 'rup' || a === 'rdown') flip();
    else return false;
    return true;
  });
  load();
  const intro = [
    window.setTimeout(() => classroom()?.react('gasp', 'It shorted out in the middle of the art demo. The art department needs it back.', 'Physical Plant worker'), 300),
    window.setTimeout(() => classroom()?.react('nod', 'Forget the lesson plan. Show us.', 'Brother Frost (engineering chair)'), 2600),
  ];
  return () => { stop(); intro.forEach(clearTimeout); };
};
