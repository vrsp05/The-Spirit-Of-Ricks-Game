// Navigation graphs built from the OSM path / street network: nodes where polylines meet
// (merged within ~1.5 m), edges along them, and A* shortest routes between any two points.
// Used by walkers, cyclists, scooters (paths) and cars (streets).
import type { Vec2 } from './campusData';

export class NavGraph {
  readonly pts: Vec2[] = [];
  private adj: { to: number; d: number }[][] = [];
  private index = new Map<string, number>();
  private grid = new Map<string, number[]>();
  private cell = 12;

  constructor(lines: Vec2[][], keep: (x: number, z: number) => boolean, merge = 1.5) {
    const key = (p: Vec2) => `${Math.round(p[0] / merge)},${Math.round(p[1] / merge)}`;
    const node = (p: Vec2) => {
      const k = key(p); let i = this.index.get(k);
      if (i === undefined) {
        i = this.pts.length; this.pts.push([p[0], p[1]]); this.adj.push([]); this.index.set(k, i);
        const gk = `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`; (this.grid.get(gk) ?? this.grid.set(gk, []).get(gk)!).push(i);
      }
      return i;
    };
    for (const line of lines) {
      // densify long segments so routes can join mid-segment and corners stay smooth
      const dense: Vec2[] = [];
      for (let i = 0; i < line.length; i++) {
        if (i) { const [ax, az] = line[i - 1], [bx, bz] = line[i], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 8); for (let k = 1; k <= n; k++) dense.push([ax + (bx - ax) * k / (n + 1), az + (bz - az) * k / (n + 1)]); }
        dense.push(line[i]);
      }
      let prev = -1;
      for (const p of dense) {
        if (!keep(p[0], p[1])) { prev = -1; continue; }          // e.g. a building sits on this bit of path
        const i = node(p);
        if (prev >= 0 && prev !== i) { const d = Math.hypot(this.pts[i][0] - this.pts[prev][0], this.pts[i][1] - this.pts[prev][1]); this.adj[prev].push({ to: i, d }); this.adj[i].push({ to: prev, d }); }
        prev = i;
      }
    }
  }
  get size() { return this.pts.length; }
  degree(i: number) { return this.adj[i].length; }
  /** Nearest node to (x, z) (searching outward through the spatial grid). */
  nearest(x: number, z: number): number {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 12 && best < 0; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        for (const n of this.grid.get(`${cx + i},${cz + j}`) ?? []) { if (!this.adj[n].length) continue; const d = (this.pts[n][0] - x) ** 2 + (this.pts[n][1] - z) ** 2; if (d < bd) { bd = d; best = n; } }
      }
    }
    return best < 0 ? 0 : best;
  }
  /** A* route between two nodes → list of points (null if unreachable). */
  route(a: number, b: number): Vec2[] | null {
    if (a === b) return [this.pts[a]];
    const g = new Map<number, number>([[a, 0]]), from = new Map<number, number>(), open = new Set([a]), closed = new Set<number>();
    const h = (i: number) => Math.hypot(this.pts[i][0] - this.pts[b][0], this.pts[i][1] - this.pts[b][1]);
    const f = new Map<number, number>([[a, h(a)]]);
    let guard = 0;
    while (open.size && guard++ < 20000) {
      let cur = -1, cf = Infinity; for (const n of open) { const v = f.get(n)!; if (v < cf) { cf = v; cur = n; } }
      if (cur === b) { const out: Vec2[] = [this.pts[b]]; let c = b; while (from.has(c)) { c = from.get(c)!; out.push(this.pts[c]); } return out.reverse(); }
      open.delete(cur); closed.add(cur);
      for (const e of this.adj[cur]) {
        if (closed.has(e.to)) continue;
        const ng = g.get(cur)! + e.d;
        if (ng < (g.get(e.to) ?? Infinity)) { from.set(e.to, cur); g.set(e.to, ng); f.set(e.to, ng + h(e.to)); open.add(e.to); }
      }
    }
    return null;
  }
  /** A random node that has connections. */
  random(rnd: () => number, where?: (x: number, z: number) => boolean): number {
    for (let k = 0; k < 200; k++) { const i = (rnd() * this.pts.length) | 0; if (this.adj[i].length && (!where || where(this.pts[i][0], this.pts[i][1]))) return i; }
    for (let k = 0; k < 50; k++) { const i = (rnd() * this.pts.length) | 0; if (this.adj[i].length) return i; }
    return 0;
  }
}
