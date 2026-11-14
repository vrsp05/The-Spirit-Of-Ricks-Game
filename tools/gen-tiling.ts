// Generates Quest 2 footprint puzzles: partitions each stylized footprint into the
// required number of pieces, adds decoys, and records one known solution.
// Run: npx vite-node tools/gen-tiling.ts  → src/quests/q2/data/tiling.json
// The output is plain data and can be hand-edited; tests re-validate it.
import { writeFileSync } from 'node:fs';
import { orient, shapeKey, solve, type Cell, type PieceDef, type Placement, type TilingLevel } from '../src/quests/q2/tiling';

// Stylized plans DERIVED from the buildings' character (not real floor plans).
const SPECS = [
  { id: 'taylor-easy', building: 'taylor', label: 'John Taylor Building', pieces: 5, decoys: 1, min: 3, max: 6, rotateAll: false, seed: 11,
    footprint: ['...#...', '..###..', '#######', '#######', '##...##'] },
  { id: 'taylor-hard', building: 'taylor', label: 'John Taylor Building', pieces: 7, decoys: 2, min: 4, max: 7, rotateAll: true, seed: 23,
    footprint: ['....#....', '...###...', '..#####..', '#########', '#########', '###.#.###', '##......#'] },
  { id: 'icenter-easy', building: 'icenter', label: 'Campus Center', pieces: 6, decoys: 2, min: 4, max: 7, rotateAll: false, seed: 37,
    footprint: ['.######.', '########', '########', '########', '.##..##.'] },
  { id: 'icenter-hard', building: 'icenter', label: 'Campus Center', pieces: 9, decoys: 3, min: 4, max: 8, rotateAll: true, seed: 41,
    footprint: ['..######..', '.########.', '##########', '##########', '##########', '.########.', '..##..##..'] },
];

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const cellsOf = (fp: string[]): Cell[] => fp.flatMap((r, y) => [...r].flatMap((c, x) => (c === '#' ? [[x, y] as Cell] : [])));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function partition(cells: Cell[], k: number, min: number, max: number, rnd: () => number): Cell[][] | null {
  const key = (c: Cell) => c.join(',');
  const set = new Set(cells.map(key));
  for (let attempt = 0; attempt < 5000; attempt++) {
    const owner = new Map<string, number>();
    const seeds = [...cells].sort(() => rnd() - 0.5).slice(0, k);
    seeds.forEach((c, i) => owner.set(key(c), i));
    const sizes = new Array(k).fill(1);
    let changed = true;
    while (changed) {
      changed = false;
      const order = [...Array(k).keys()].sort(() => rnd() - 0.5).sort((a, b) => sizes[a] - sizes[b]);
      for (const i of order) {
        if (sizes[i] >= max) continue;
        const frontier: string[] = [];
        for (const [c, o] of owner) if (o === i) for (const [dx, dy] of N4) {
          const [x, y] = c.split(',').map(Number), n = `${x + dx},${y + dy}`;
          if (set.has(n) && !owner.has(n)) frontier.push(n);
        }
        if (frontier.length) { owner.set(frontier[(rnd() * frontier.length) | 0], i); sizes[i]++; changed = true; }
      }
    }
    if (owner.size !== cells.length || sizes.some(s => s < min || s > max)) continue;
    const pieces: Cell[][] = Array.from({ length: k }, () => []);
    for (const [c, o] of owner) pieces[o].push(c.split(',').map(Number) as Cell);
    const keys = pieces.map(p => shapeKey(p));
    if (new Set(keys).size < k - 1) continue; // avoid many identical shapes
    return pieces;
  }
  return null;
}

function randomPoly(size: number, rnd: () => number): Cell[] {
  const cells: Cell[] = [[0, 0]]; const has = (x: number, y: number) => cells.some(c => c[0] === x && c[1] === y);
  while (cells.length < size) {
    const [x, y] = cells[(rnd() * cells.length) | 0], [dx, dy] = N4[(rnd() * 4) | 0];
    if (!has(x + dx, y + dy)) cells.push([x + dx, y + dy]);
  }
  return orient(cells, 0, false);
}
const allKeys = (cells: Cell[]) => new Set([0, 1, 2, 3].flatMap(r => [shapeKey(orient(cells, r, false)), shapeKey(orient(cells, r, true))]));

const levels: TilingLevel[] = [];
for (const s of SPECS) {
  const rnd = rng(s.seed);
  const parts = partition(cellsOf(s.footprint), s.pieces, s.min, s.max, rnd);
  if (!parts) throw new Error(`could not partition ${s.id}`);
  const prefix = s.building === 'taylor' ? 'tay' : 'ic';
  const pieces: PieceDef[] = [], solution: Placement[] = [];
  parts.forEach((region, i) => {
    const rot = s.rotateAll || i < 2 ? ((rnd() * 3) | 0) + 1 : 0;        // displayed rotated; solution rotates back
    const id = `${prefix}-${String(i + 1).padStart(2, '0')}`;
    pieces.push({ id, cells: orient(region, (4 - rot) % 4, false) });
    solution.push({ piece: id, rot, flip: false, x: Math.min(...region.map(c => c[0])), y: Math.min(...region.map(c => c[1])) });
  });
  const used = new Set(pieces.flatMap(p => [...allKeys(p.cells)]));
  const decoys: PieceDef[] = [];
  while (decoys.length < s.decoys) {
    const d = randomPoly(3 + ((rnd() * 4) | 0), rnd);
    if ([...allKeys(d)].some(k => used.has(k))) continue;
    [...allKeys(d)].forEach(k => used.add(k));
    decoys.push({ id: `${prefix}-decoy-${decoys.length + 1}`, cells: d, decoy: true });
  }
  const lvl: TilingLevel = { id: s.id, building: s.building, label: s.label, allowFlip: false, footprint: s.footprint, pieces, decoys, solution };
  if (!solve(lvl, pieces.map(p => p.id))) throw new Error(`unsolvable ${s.id}`);
  levels.push(lvl);
  console.log(s.id, 'pieces', pieces.map(p => p.cells.length).join(','), 'decoys', decoys.length);
}
writeFileSync('src/quests/q2/data/tiling.json', JSON.stringify({
  note: 'Stylized footprint plans derived from the buildings (not historical floor plans). Generated by tools/gen-tiling.ts; editable. Tests validate solvability and decoys.',
  modes: { easy: { taylor: 'taylor-easy', icenter: 'icenter-easy', hints: 3, snapAssist: true }, hard: { taylor: 'taylor-hard', icenter: 'icenter-hard', hints: 1, snapAssist: false } },
  levels,
}, null, 1));
