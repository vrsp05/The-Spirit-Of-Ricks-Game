// Exterior collision/occlusion: a top-down grid aligned with the voxel mesher.
// Each cell stores the absolute roof height of whatever building occupies it.
import { CAMPUS } from './campusData';
import { VOXEL, type BuiltMesh } from './voxelMesher';

export class CollisionGrid {
  readonly i0 = Math.floor(CAMPUS.bounds.minX / VOXEL);
  readonly j0 = Math.floor(CAMPUS.bounds.minZ / VOXEL);
  readonly w = Math.ceil(CAMPUS.bounds.maxX / VOXEL) - this.i0 + 1;
  readonly h = Math.ceil(CAMPUS.bounds.maxZ / VOXEL) - this.j0 + 1;
  readonly top = new Float32Array(this.w * this.h);
  readonly extra: { x: number; z: number; r: number }[] = []; // small round obstacles (NPCs, props)

  addBuilding(m: BuiltMesh) {
    const r = m.raster;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const k = j * r.w + i; if (!r.cells[k]) continue;
      const gi = r.i0 + i - this.i0, gj = r.j0 + j - this.j0;
      if (gi < 0 || gj < 0 || gi >= this.w || gj >= this.h) continue;
      const gk = gj * this.w + gi; this.top[gk] = Math.max(this.top[gk], m.tops[k]);
    }
  }
  topAt(x: number, z: number): number {
    const gi = Math.floor(x / VOXEL) - this.i0, gj = Math.floor(z / VOXEL) - this.j0;
    if (gi < 0 || gj < 0 || gi >= this.w || gj >= this.h) return 0;
    return this.top[gj * this.w + gi];
  }
  /** True if a circle at x,z with radius r overlaps a building cell or (unless `props` is false) a round obstacle. */
  blocked(x: number, z: number, r: number, props = true): boolean {
    const { minX, maxX, minZ, maxZ } = CAMPUS.bounds;
    if (x < minX + 7.5 || x > maxX - 7.5 || z < minZ + 7.5 || z > maxZ - 7.5) return true; // inside the boundary hedge
    const ia = Math.floor((x - r) / VOXEL), ib = Math.floor((x + r) / VOXEL);
    const ja = Math.floor((z - r) / VOXEL), jb = Math.floor((z + r) / VOXEL);
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const gi = i - this.i0, gj = j - this.j0;
      if (gi < 0 || gj < 0 || gi >= this.w || gj >= this.h) continue;
      if (this.top[gj * this.w + gi] <= 0) continue;
      const cx = Math.max(i * VOXEL, Math.min(x, (i + 1) * VOXEL));
      const cz = Math.max(j * VOXEL, Math.min(z, (j + 1) * VOXEL));
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return true;
    }
    if (props) for (const o of this.extra) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return true;
    return false;
  }
}
