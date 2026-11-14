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

export interface BuiltMesh { positions: number[]; colors: number[]; normals: number[]; base: number; wallTop: number; raster: Raster; tops: Float32Array }

const tmpC = new THREE.Color();
function pushQuad(m: BuiltMesh, a: number[], b: number[], c: number[], d: number[], n: number[], col: string | THREE.Color, shade = 1) {
  tmpC.set(col as any).multiplyScalar(shade);
  for (const p of [a, b, c, a, c, d]) { m.positions.push(p[0], p[1], p[2]); m.normals.push(n[0], n[1], n[2]); m.colors.push(tmpC.r, tmpC.g, tmpC.b); }
}

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
  const m: BuiltMesh = { positions: [], colors: [], normals: [], base, wallTop, raster: r, tops: top };
  const wall = opts.construction ? '#b5a588' : style.wall;
  const roofCol = opts.construction ? '#9b8f7c' : style.roof;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const k = j * r.w + i; if (!r.cells[k]) continue;
    const x0 = (r.i0 + i) * VOXEL, x1 = x0 + VOXEL, z0 = (r.j0 + j) * VOXEL, z1 = z0 + VOXEL;
    const t = top[k];
    const isRoofCell = t > wallTop + 0.01;
    pushQuad(m, [x0, t, z0], [x0, t, z1], [x1, t, z1], [x1, t, z0], [0, 1, 0], isRoofCell || style.roofType === 'flat' ? roofCol : style.trim, ((i + j) & 1) ? 1 : 0.95);
    // side faces toward lower neighbours
    const sides: [number, number, number[], number[][]][] = [
      [1, 0, [1, 0, 0], [[x1, 0, z1], [x1, 0, z0]]],
      [-1, 0, [-1, 0, 0], [[x0, 0, z0], [x0, 0, z1]]],
      [0, 1, [0, 0, 1], [[x0, 0, z1], [x1, 0, z1]]],
      [0, -1, [0, 0, -1], [[x1, 0, z0], [x0, 0, z0]]],
    ];
    for (const [di, dj, nrm, [p, q]] of sides) {
      const ii = i + di, jj = j + dj;
      const inside = ii >= 0 && jj >= 0 && ii < r.w && jj < r.h && r.cells[jj * r.w + ii];
      const nt = inside ? top[jj * r.w + ii] : base;
      if (nt >= t - 0.001) continue;
      const shade = nrm[0] !== 0 ? 0.86 : nrm[2] > 0 ? 1.0 : 0.78;
      const quad = (y0: number, y1: number, col: string) => pushQuad(m, [q[0], y0, q[2]], [q[0], y1, q[2]], [p[0], y1, p[2]], [p[0], y0, p[2]], nrm, col, shade);
      if (inside) { quad(nt, t, isRoofCell ? roofCol : style.trim); continue; }
      // exterior wall: plinth, floors with window bands (or plain for context buildings)
      quad(base, gAvg, '#8f877c');
      if (opts.construction) {
        for (let y = gAvg; y < wallTop - 0.01; y += fh) quad(y, Math.min(wallTop, y + fh), ((i + j + Math.round(y / fh)) & 1) ? '#7f6f58' : wall);
      } else if (!opts.detailed) {
        quad(gAvg, wallTop, wall);
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

export function mergeToGeometry(meshes: BuiltMesh[]): THREE.BufferGeometry {
  let len = 0; for (const m of meshes) len += m.positions.length;
  const pos = new Float32Array(len), col = new Float32Array(len), nor = new Float32Array(len);
  let o = 0;
  for (const m of meshes) { pos.set(m.positions, o); col.set(m.colors, o); nor.set(m.normals, o); o += m.positions.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
