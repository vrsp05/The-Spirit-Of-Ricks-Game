import { describe, expect, it } from 'vitest';
import { TILING } from '../src/quests/q2/board';
import { Board, footprintCells, solve } from '../src/quests/q2/tiling';

describe('footprint tiling', () => {
  for (const lvl of TILING.levels) {
    describe(lvl.id, () => {
      it('the stored solution covers every cell exactly once (by occupancy)', () => {
        const b = new Board(lvl);
        for (const p of lvl.solution) expect(b.place(p), p.piece).toBeNull();
        expect(b.isComplete()).toBe(true); expect(b.coverage()).toBe(1);
        expect(lvl.pieces.reduce((s, p) => s + p.cells.length, 0)).toBe(footprintCells(lvl).length);
      });
      it('is solvable from the required pieces alone; decoys are never needed', () => {
        expect(solve(lvl, lvl.pieces.map(p => p.id))).not.toBeNull();
        expect(lvl.solution.every(s => !lvl.decoys.some(d => d.id === s.piece))).toBe(true);
        expect(lvl.decoys.length).toBeGreaterThan(0);
      });
      it('placement order does not matter', () => {
        const b = new Board(lvl); for (const p of [...lvl.solution].reverse()) b.place(p); expect(b.isComplete()).toBe(true);
      });
      it('rejects overlaps and out-of-bounds; incomplete is not complete', () => {
        const b = new Board(lvl); const first = lvl.solution[0];
        expect(b.place(first)).toBeNull(); expect(b.isComplete()).toBe(false);
        const other = lvl.solution[1];
        expect(b.check({ ...other, x: first.x, y: first.y })).not.toBeNull();
        expect(b.check({ ...first, x: 50 })).toMatch(/outside/);
      });
      it('a decoy on the board blocks completion', () => {
        const b = new Board(lvl); for (const p of lvl.solution.slice(0, -1)) b.place(p);
        const d = lvl.decoys[0];
        // try to drop the decoy anywhere it fits; even full coverage with a decoy is not a solution
        let placed = false;
        for (let y = 0; y < lvl.footprint.length && !placed; y++) for (let x = 0; x < lvl.footprint[0].length && !placed; x++) for (let rot = 0; rot < 4 && !placed; rot++) placed = b.place({ piece: d.id, rot, flip: false, x, y }) === null;
        expect(b.isComplete()).toBe(false);
      });
    });
  }
  it('piece/decoy counts match the spec (Easy 5+1 / 6+2, Hard 7+2 / 9+3)', () => {
    const c = (id: string) => { const l = TILING.levels.find(x => x.id === id)!; return [l.pieces.length, l.decoys.length]; };
    expect(c('taylor-easy')).toEqual([5, 1]); expect(c('icenter-easy')).toEqual([6, 2]);
    expect(c('taylor-hard')).toEqual([7, 2]); expect(c('icenter-hard')).toEqual([9, 3]);
  });
  it('all piece ids are unique and solution references valid pieces/rotations', () => {
    for (const l of TILING.levels) {
      const ids = [...l.pieces, ...l.decoys].map(p => p.id); expect(new Set(ids).size).toBe(ids.length);
      for (const s of l.solution) { expect(ids).toContain(s.piece); expect([0, 1, 2, 3]).toContain(s.rot); expect(s.flip && !l.allowFlip).toBe(false); }
    }
  });
});
