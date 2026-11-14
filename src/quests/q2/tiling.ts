// Pure footprint-tiling engine (unit-tested). Grid cells are [x, y] integers.
// A puzzle is solved when every footprint cell is covered exactly once (computed from
// actual occupancy, not piece counts or placement order) and no decoy is on the board.

export type Cell = [number, number];
export interface PieceDef { id: string; cells: Cell[]; decoy?: boolean }
export interface Placement { piece: string; rot: number; flip: boolean; x: number; y: number }
export interface TilingLevel {
  id: string; building: string; label: string; allowFlip: boolean;
  footprint: string[];               // '#' = target cell, '.' = empty
  pieces: PieceDef[]; decoys: PieceDef[];
  solution: Placement[];             // one known solution (validated in tests)
}

export const footprintCells = (lvl: TilingLevel): Cell[] => {
  const out: Cell[] = []; lvl.footprint.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') out.push([x, y]); })); return out;
};
const norm = (cells: Cell[]): Cell[] => {
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as Cell).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
/** Rotate by rot × 90° clockwise, optionally mirrored first; normalised to (0,0). */
export function orient(cells: Cell[], rot: number, flip: boolean): Cell[] {
  let c: Cell[] = cells.map(([x, y]) => [flip ? -x : x, y]);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) c = c.map(([x, y]) => [-y, x]);
  return norm(c);
}
export const shapeKey = (cells: Cell[]) => norm(cells).map(c => c.join(',')).join(';');

export class Board {
  readonly target = new Set<string>();
  readonly occ = new Map<string, string>();       // cell -> piece id
  readonly placed = new Map<string, Placement>();
  constructor(readonly level: TilingLevel) { for (const [x, y] of footprintCells(level)) this.target.add(`${x},${y}`); }
  piece(id: string) { return [...this.level.pieces, ...this.level.decoys].find(p => p.id === id); }
  cellsOf(p: Placement): Cell[] { return orient(this.piece(p.piece)!.cells, p.rot, p.flip).map(([x, y]) => [x + p.x, y + p.y] as Cell); }
  /** Why a placement is invalid (null when it fits). */
  check(p: Placement): string | null {
    if (p.flip && !this.level.allowFlip) return 'Flipping is not allowed on this blueprint.';
    for (const [x, y] of this.cellsOf(p)) {
      const k = `${x},${y}`;
      if (!this.target.has(k)) return 'Part of the piece is outside the footprint.';
      const o = this.occ.get(k); if (o && o !== p.piece) return 'It overlaps a piece that is already placed.';
    }
    return null;
  }
  place(p: Placement): string | null {
    const prev = this.placed.get(p.piece); if (prev) this.remove(p.piece);
    const err = this.check(p);
    if (err) { if (prev) this.place(prev); return err; }
    for (const [x, y] of this.cellsOf(p)) this.occ.set(`${x},${y}`, p.piece);
    this.placed.set(p.piece, p); return null;
  }
  remove(id: string) { const p = this.placed.get(id); if (!p) return; for (const [x, y] of this.cellsOf(p)) this.occ.delete(`${x},${y}`); this.placed.delete(id); }
  pieceAt(x: number, y: number) { return this.occ.get(`${x},${y}`) ?? null; }
  coverage() { let n = 0; for (const k of this.target) if (this.occ.has(k)) n++; return n / this.target.size; }
  hasDecoy() { return [...this.placed.keys()].some(id => this.piece(id)?.decoy); }
  /** Complete = every target cell covered exactly once by non-decoy pieces. */
  isComplete() { if (this.hasDecoy()) return false; for (const k of this.target) if (!this.occ.has(k)) return false; return true; }
  snapshot(): Placement[] { return [...this.placed.values()]; }
  restore(ps: Placement[]) { this.occ.clear(); this.placed.clear(); for (const p of ps) this.place(p); }
}

/** Backtracking exact-cover solver (small boards). Returns a solution using `pieceIds` or null. */
export function solve(level: TilingLevel, pieceIds: string[]): Placement[] | null {
  const target = footprintCells(level).map(c => c.join(','));
  const tset = new Set(target);
  const defs = pieceIds.map(id => [...level.pieces, ...level.decoys].find(p => p.id === id)!);
  const variants = defs.map(d => {
    const seen = new Set<string>(); const out: { rot: number; flip: boolean; cells: Cell[] }[] = [];
    for (const flip of level.allowFlip ? [false, true] : [false]) for (let rot = 0; rot < 4; rot++) {
      const c = orient(d.cells, rot, flip), k = shapeKey(c); if (!seen.has(k)) { seen.add(k); out.push({ rot, flip, cells: c }); }
    }
    return out;
  });
  const occ = new Set<string>(); const used = new Array(defs.length).fill(false); const sol: Placement[] = [];
  const firstEmpty = () => target.find(k => !occ.has(k));
  const rec = (): boolean => {
    const e = firstEmpty(); if (!e) return used.every(Boolean);
    const [ex, ey] = e.split(',').map(Number);
    for (let i = 0; i < defs.length; i++) {
      if (used[i]) continue;
      for (const v of variants[i]) {
        // anchor: the variant's first cell (top-left in sorted order) goes on the first empty cell
        const [ax, ay] = v.cells[0]; const ox = ex - ax, oy = ey - ay;
        const cells = v.cells.map(([x, y]) => `${x + ox},${y + oy}`);
        if (cells.some(k => !tset.has(k) || occ.has(k))) continue;
        cells.forEach(k => occ.add(k)); used[i] = true; sol.push({ piece: defs[i].id, rot: v.rot, flip: v.flip, x: ox, y: oy });
        if (rec()) return true;
        cells.forEach(k => occ.delete(k)); used[i] = false; sol.pop();
      }
    }
    return false;
  };
  return rec() ? sol : null;
}
