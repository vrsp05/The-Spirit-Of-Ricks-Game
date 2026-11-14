// Turns a building footprint into a voxel-style mesh on the global VOXEL grid.
// The same cell raster is used for collision (collision.ts), so what you see is
// what you bump into.
import * as THREE from 'three';
import { pointInPoly, terrainHeight, Vec2 } from './campusData';
import type { BuildingStyle } from './buildingRegistry';

export const VOXEL = 1.0;

export interface Raster { i0: number; j0: number; w: number; h: number; cells: Uint8Array }

export function rasterize(poly: Vec2[]): Raster {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const i0 = Math.floor(minX / VOXEL), j0 = Math.floor(minZ / VOXEL);
  const w = Math.floor(maxX / VOXEL) - i0 + 1, h = Math.floor(maxZ / VOXEL) - j0 + 1;
  const cells = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const cx = (i0 + i + 0.5) * VOXEL, cz = (j0 + j + 0.5) * VOXEL;
    if (pointInPoly(cx, cz, poly)) cells[j * w + i] = 1;
  }
  return { i0, j0, w, h, cells };
}

/** Chebyshev distance (in cells) to the footprint edge, for stepped hip roofs. */
function edgeDistance(r: Raster): Uint16Array {
  const d = new Uint16Array(r.w * r.h);
  const q: number[] = [];
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const k = j * r.w + i; if (!r.cells[k]) continue;
    let edge = false;
    for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= r.w || jj >= r.h || !r.cells[jj * r.w + ii]) { edge = true; break; }
    }
    if (edge) { d[k] = 1; q.push(k); } else d[k] = 0;
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % r.w, j = (k / r.w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= r.w || jj >= r.h) continue;
      const kk = jj * r.w + ii; if (r.cells[kk] && d[kk] === 0) { d[kk] = d[k] + 1; q.push(kk); }
    }
  }
  return d;
}

/** kinds: 0 = wall (brick texture), 1 = glass, 2 = roof/top (gravel texture). */
export interface BuiltMesh { positions: number[]; colors: number[]; normals: number[]; uvs: number[]; kinds: number[]; base: number; wallTop: number; raster: Raster; tops: Float32Array }

const tmpC = new THREE.Color();
const ONE4: [number, number, number, number] = [1, 1, 1, 1];
/** Quad a-b-c-d. `ao` = per-corner ambient-occlusion factors (baked into the vertex colours). */
function pushQuad(m: BuiltMesh, a: number[], b: number[], c: number[], d: number[], n: number[], col: string | THREE.Color, shade = 1, glass = false, ao: [number, number, number, number] = ONE4) {
  tmpC.set(col as any).multiplyScalar(shade);
  const kind = n[1] > 0.5 ? 2 : glass ? 1 : 0;
  const order = [0, 1, 2, 0, 2, 3], P = [a, b, c, d];
  for (const k of order) {
    const p = P[k], o = ao[k];
    m.positions.push(p[0], p[1], p[2]); m.normals.push(n[0], n[1], n[2]); m.colors.push(tmpC.r * o, tmpC.g * o, tmpC.b * o);
    // world-space UVs: walls 2 m per texture tile (bricks ~0.5 × 0.25 m), roofs 4 m per tile
    if (kind === 2) m.uvs.push(p[0] / 4, p[2] / 4);
    else if (kind === 1) m.uvs.push(k === 2 || k === 3 ? 1 : 0, k === 1 || k === 2 ? 1 : 0);   // one framed window per quad
    else m.uvs.push((n[0] !== 0 ? p[2] : p[0]) / 2, p[1] / 2);
    m.kinds.push(kind);
  }
}
/** Classic voxel corner AO: two side neighbours + the diagonal one. */
const cornerAO = (s1: boolean, s2: boolean, c: boolean) => (s1 && s2 ? 0.55 : [1, 0.78, 0.66][(s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0)]);

export function meshBuilding(poly: Vec2[], style: BuildingStyle, opts: { construction?: boolean; detailed?: boolean } = {}): BuiltMesh {
  const r = rasterize(poly);
  // Ground: buildings sit on the lowest terrain point of their footprint (plinth below).
  let gMin = Infinity, gSum = 0, n = 0;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (r.cells[j * r.w + i]) {
    const g = terrainHeight((r.i0 + i + 0.5) * VOXEL, (r.j0 + j + 0.5) * VOXEL); gMin = Math.min(gMin, g); gSum += g; n++;
  }
  const gAvg = n ? gSum / n : 0;
  const fh = style.floorHeight ?? 4;
  const levels = opts.construction ? Math.max(1, Math.ceil(style.levels / 2)) : style.levels;
  const base = gMin - 1.5;
  const wallTop = gAvg + levels * fh;
  const dist = style.roofType === 'flat' ? null : edgeDistance(r);
  const top = new Float32Array(r.w * r.h);
  let maxD = 1; if (dist) for (const v of dist) maxD = Math.max(maxD, v);
  const cx = r.i0 + r.w / 2, cz = r.j0 + r.h / 2;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const k = j * r.w + i; if (!r.cells[k]) continue;
    let t = wallTop;
    if (style.roofType === 'hip' && dist) t += Math.min(dist[k], 8) * 0.7;
    if (style.roofType === 'peak' && dist && !opts.construction) {
      // Taylor-style roofline: low stepped eaves rising steeply to one tall central peak ("draws the eye heavenward")
      const dn = Math.min(1, dist[k] / Math.max(1, maxD));
      t += dist[k] <= 1 ? 0.6 : 0.6 + Math.pow(dn, 2.4) * Math.min(13, 3 + maxD * 0.55);
    }
    if (style.roofType === 'dome' && dist && !opts.construction) {
      // broad arena dome: smooth rise from a low parapet ring to the centre
      const dn = Math.min(1, (dist[k] - 1) / Math.max(1, maxD - 1));
      t += dist[k] <= 1 ? 0.8 : 1 + Math.sqrt(1 - (1 - dn) * (1 - dn)) * Math.min(12, maxD * 0.55);
    }
    if (style.roofType === 'flat' && !opts.construction) {
      // parapet ring
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const ii = i + di, jj = j + dj; return ii < 0 || jj < 0 || ii >= r.w || jj >= r.h || !r.cells[jj * r.w + ii]; });
      if (edge) t += 0.6;
    }
    if (style.roofType === 'spire' && dist) {
      t += Math.min(dist[k], 3) * 1.2;
      const di = Math.abs(r.i0 + i + 0.5 - cx), dj = Math.abs(r.j0 + j + 0.5 - cz);
      if (di < 1.6 && dj < 1.6) t = wallTop + 18 + (di < 0.6 && dj < 0.6 ? 14 : 0);
      else if (di < 3 && dj < 3) t = Math.max(t, wallTop + 9);
    }
    top[k] = t;
  }
  const m: BuiltMesh = { positions: [], colors: [], normals: [], uvs: [], kinds: [], base, wallTop, raster: r, tops: top };
  const wall = opts.construction ? '#b5a588' : style.wall;
  const roofCol = opts.construction ? '#9b8f7c' : style.roof;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const k = j * r.w + i; if (!r.cells[k]) continue;
    const x0 = (r.i0 + i) * VOXEL, x1 = x0 + VOXEL, z0 = (r.j0 + j) * VOXEL, z1 = z0 + VOXEL;
    const t = top[k];
    const isRoofCell = t > wallTop + 0.01;
    const taller = (di: number, dj: number) => { const ii = i + di, jj = j + dj; return ii >= 0 && jj >= 0 && ii < r.w && jj < r.h && !!r.cells[jj * r.w + ii] && top[jj * r.w + ii] > t + 0.25; };
    const tAO = (sx: number, sz: number) => cornerAO(taller(sx, 0), taller(0, sz), taller(sx, sz));
    pushQuad(m, [x0, t, z0], [x0, t, z1], [x1, t, z1], [x1, t, z0], [0, 1, 0], isRoofCell || style.roofType === 'flat' ? roofCol : style.trim, ((i + j) & 1) ? 1 : 0.95,
      false, [tAO(-1, -1), tAO(-1, 1), tAO(1, 1), tAO(1, -1)]);
    // side faces toward lower neighbours
    // [di, dj, normal, [p, q] edge points, perpendicular step at p, at q]
    const sides: [number, number, number[], number[][], number[], number[]][] = [
      [1, 0, [1, 0, 0], [[x1, 0, z1], [x1, 0, z0]], [0, 1], [0, -1]],
      [-1, 0, [-1, 0, 0], [[x0, 0, z0], [x0, 0, z1]], [0, -1], [0, 1]],
      [0, 1, [0, 0, 1], [[x0, 0, z1], [x1, 0, z1]], [-1, 0], [1, 0]],
      [0, -1, [0, 0, -1], [[x1, 0, z0], [x0, 0, z0]], [1, 0], [-1, 0]],
    ];
    const filled = (ii: number, jj: number) => ii >= 0 && jj >= 0 && ii < r.w && jj < r.h && !!r.cells[jj * r.w + ii];
    for (const [di, dj, nrm, [p, q], pp, pq] of sides) {
      const ii = i + di, jj = j + dj;
      const inside = ii >= 0 && jj >= 0 && ii < r.w && jj < r.h && r.cells[jj * r.w + ii];
      const nt = inside ? top[jj * r.w + ii] : base;
      if (nt >= t - 0.001) continue;
      const shade = nrm[0] !== 0 ? 0.86 : nrm[2] > 0 ? 1.0 : 0.78;
      // inner (concave) corners: the wall next door juts out toward us → darken that vertical edge
      const cq = filled(i + di + pq[0], j + dj + pq[1]) ? 0.72 : 1, cp = filled(i + di + pp[0], j + dj + pp[1]) ? 0.72 : 1;
      // ground contact: darken the bottom ~1.6 m of exterior walls; roof steps darken where they meet the lower roof
      const gAO = (y: number) => (inside ? (y <= nt + 0.01 ? 0.7 : 1) : y <= gAvg + 0.01 ? 0.58 : Math.min(1, 0.58 + 0.42 * (y - gAvg) / 1.6));
      const quad = (y0: number, y1: number, col: string) => pushQuad(m, [q[0], y0, q[2]], [q[0], y1, q[2]], [p[0], y1, p[2]], [p[0], y0, p[2]], nrm, col, shade, col === style.glass,
        [gAO(y0) * cq, gAO(y1) * cq, gAO(y1) * cp, gAO(y0) * cp]);
      if (inside) { quad(nt, t, isRoofCell ? roofCol : style.trim); continue; }
      // exterior wall: plinth, floors with window bands (or plain for context buildings)
      quad(base, gAvg, '#8f877c');
      if (opts.construction) {
        for (let y = gAvg; y < wallTop - 0.01; y += fh) quad(y, Math.min(wallTop, y + fh), ((i + j + Math.round(y / fh)) & 1) ? '#7f6f58' : wall);
      } else if (!opts.detailed) {
        quad(gAvg, Math.min(wallTop, gAvg + 1.6), wall); if (wallTop > gAvg + 1.6) quad(gAvg + 1.6, wallTop, wall);
        const winY = gAvg + fh * 0.45; if (wallTop - gAvg > 2 && ((i + j) & 1)) quad(winY, Math.min(wallTop, winY + 1), style.glass);
      } else {
        for (let f = 0; f < levels; f++) {
          const y0 = gAvg + f * fh, y1 = y0 + fh;
          const glass = ((i + j) % 2 === 0);
          quad(y0, y0 + fh * 0.35, wall);
          quad(y0 + fh * 0.35, y0 + fh * 0.85, glass ? style.glass : wall);
          quad(y0 + fh * 0.85, y1, f === levels - 1 ? style.trim : wall);
        }
      }
      if (isRoofCell) quad(wallTop, t, roofCol);
    }
  }
  return m;
}

/** Merge building meshes into one geometry with three material groups: walls, glass, roofs. */
export function mergeToGeometry(meshes: BuiltMesh[]): THREE.BufferGeometry {
  const buckets = [0, 1, 2].map(() => ({ pos: [] as number[], nor: [] as number[], col: [] as number[], uv: [] as number[] }));
  for (const m of meshes) for (let v = 0; v < m.kinds.length; v++) {
    const b = buckets[m.kinds[v]];
    b.pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    b.nor.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]);
    b.col.push(m.colors[v * 3], m.colors[v * 3 + 1], m.colors[v * 3 + 2]);
    b.uv.push(m.uvs[v * 2], m.uvs[v * 2 + 1]);
  }
  const g = new THREE.BufferGeometry();
  const cat = (k: 'pos' | 'nor' | 'col' | 'uv') => new Float32Array(buckets.flatMap(b => b[k]));
  g.setAttribute('position', new THREE.BufferAttribute(cat('pos'), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(cat('nor'), 3));
  g.setAttribute('color', new THREE.BufferAttribute(cat('col'), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(cat('uv'), 2));
  let start = 0; buckets.forEach((b, i) => { const n = b.pos.length / 3; g.addGroup(start, n, i); start += n; });
  g.computeBoundingSphere();
  return g;
}
