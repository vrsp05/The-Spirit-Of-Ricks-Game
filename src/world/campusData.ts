// Typed access to the generated campus data + curated registry, with runtime
// COMPACTION (GAME_CONFIG.world): positions are scaled by `scale` so streets and
// empty space shrink, while each building footprint is allowed to grow back
// toward real size (up to `buildingScale`) wherever it doesn't collide with a
// coexisting building or a street. Relative layout and north are preserved.
import raw from './data/campus.generated.json';
import { BUILDINGS, BuildingEntry, BuildingStyle, eraState } from './buildingRegistry';
import { ERA_ORDER, ERAS, EraId } from './eras';
import { GAME_CONFIG } from '../config/game.config';

export type Vec2 = [number, number];
export interface OsmBuilding { osm: string; name: string | null; type: string; levels: number | null; height: number | null; poly: Vec2[] }
export interface Road { osm: string; kind: string; name: string | null; width: number; oneway?: boolean; pts: Vec2[] }
export interface Area { osm: string; kind: string; sport?: string | null; name?: string | null; poly: Vec2[] }
interface Terrain { x0: number; z0: number; step: number; cols: number; rows: number; baseElevationM: number; heights: number[] }
interface CampusData {
  attribution: string; bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  terrain: Terrain; buildings: OsmBuilding[]; roads: Road[]; areas: Area[]; campus: Vec2[][];
}

export const WORLD_SCALE = GAME_CONFIG.world.scale;
const S = WORLD_SCALE;
const RAW = raw as unknown as CampusData;
const sp = (p: Vec2): Vec2 => [p[0] * S, p[1] * S];
const sPoly = (poly: Vec2[]) => poly.map(sp);
export const PATH_KINDS = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track']);

/** Real-world metres -> game metres. */
export function toGame(x: number, z: number): Vec2 { return [x * S, z * S]; }
export function toReal(x: number, z: number): Vec2 { return [x / S, z / S]; }

// Road widths shrink less than distances so streets/paths stay usable.
const roadWidth = (r: Road) => PATH_KINDS.has(r.kind) ? Math.max(2.6, r.width * 0.85)
  : r.kind === 'service' ? Math.max(5.5, r.width) : Math.max(8.5, r.width * 0.8); // wide enough for the golf cart

export const CAMPUS: CampusData = {
  attribution: RAW.attribution,
  bounds: { minX: RAW.bounds.minX * S, maxX: RAW.bounds.maxX * S, minZ: RAW.bounds.minZ * S, maxZ: RAW.bounds.maxZ * S },
  terrain: { ...RAW.terrain, x0: RAW.terrain.x0 * S, z0: RAW.terrain.z0 * S, step: RAW.terrain.step * S, heights: RAW.terrain.heights.map(h => h * S) },
  buildings: RAW.buildings, // real-metre footprints; use footprint() for game geometry
  roads: RAW.roads.map(r => ({ ...r, pts: sPoly(r.pts), width: roadWidth(r) })),
  areas: RAW.areas.map(a => ({ ...a, poly: sPoly(a.poly) })),
  campus: RAW.campus.map(sPoly),
};

const T = CAMPUS.terrain;
/** Ground height (game metres) at game x,z — bilinear. */
export function terrainHeight(x: number, z: number): number {
  const fc = (x - T.x0) / T.step, fr = (z - T.z0) / T.step;
  const c0 = Math.max(0, Math.min(T.cols - 2, Math.floor(fc)));
  const r0 = Math.max(0, Math.min(T.rows - 2, Math.floor(fr)));
  const ac = Math.min(1, Math.max(0, fc - c0)), ar = Math.min(1, Math.max(0, fr - r0));
  const h = (r: number, c: number) => T.heights[r * T.cols + c];
  return (h(r0, c0) * (1 - ac) + h(r0, c0 + 1) * ac) * (1 - ar) + (h(r0 + 1, c0) * (1 - ac) + h(r0 + 1, c0 + 1) * ac) * ar;
}

export function pointInPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function polyCentroid(poly: Vec2[]): Vec2 {
  let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length];
}

const osmById = new Map(RAW.buildings.map(b => [b.osm, b]));
const registeredOsm = new Set(BUILDINGS.filter(b => b.osm).map(b => b.osm!));

// Kirkham (demolished 2019) is not in OSM. Rough block on the Visual Arts Studio site (real metres).
function kirkhamRealPoly(): Vec2[] {
  const vas = osmById.get('w980712328');
  const [cx, cz] = vas ? polyCentroid(vas.poly) : [105, -425];
  const hw = 30, hd = 26;
  return [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]];
}
function realPoly(b: BuildingEntry): Vec2[] | undefined {
  if (b.id === 'kirkham') return kirkhamRealPoly();
  return b.poly && b.poly.length ? b.poly : osmById.get(b.osm!)?.poly;
}

// ---------------------------------------------------------------- compaction
const constructionTargets = new Set((GAME_CONFIG.quests.construction.targets as { buildingId: string | null }[]).map(t => t.buildingId).filter(Boolean) as string[]);
export function isQuestGated(id: string) { return constructionTargets.has(id); }

const CELL = 1;
const gi0 = Math.floor(CAMPUS.bounds.minX), gj0 = Math.floor(CAMPUS.bounds.minZ);
const GW = Math.ceil(CAMPUS.bounds.maxX) - gi0 + 1, GH = Math.ceil(CAMPUS.bounds.maxZ) - gj0 + 1;
const eraGrids = ERA_ORDER.map(() => new Uint8Array(GW * GH));
const roadGrid = new Uint8Array(GW * GH);
const compacted = new Map<string, Vec2[]>();

(function rasterRoads() {
  // sports fields and the stadium also block building growth
  for (const a of CAMPUS.areas) {
    if (a.kind !== 'sport' && a.kind !== 'stadium') continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of a.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    for (let z = Math.floor(minZ); z <= maxZ; z++) for (let x = Math.floor(minX); x <= maxX; x++) {
      if (!pointInPoly(x + 0.5, z + 0.5, a.poly)) continue;
      const i2 = x - gi0, j2 = z - gj0; if (i2 >= 0 && j2 >= 0 && i2 < GW && j2 < GH) roadGrid[j2 * GW + i2] = 1;
    }
  }
  for (const r of CAMPUS.roads) {
    if (PATH_KINDS.has(r.kind)) continue;
    const hw = r.width / 2 + 0.5;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      for (let z = Math.floor(Math.min(az, bz) - hw); z <= Math.max(az, bz) + hw; z++) for (let x = Math.floor(Math.min(ax, bx) - hw); x <= Math.max(ax, bx) + hw; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (z + 0.5 - az) * dz) / L2));
        const qx = ax + t * dx - x - 0.5, qz = az + t * dz - z - 0.5;
        if (qx * qx + qz * qz <= hw * hw) { const i2 = x - gi0, j2 = z - gj0; if (i2 >= 0 && j2 >= 0 && i2 < GW && j2 < GH) roadGrid[j2 * GW + i2] = 1; }
      }
    }
  }
})();

function cellsOf(poly: Vec2[]): number[] {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const out: number[] = [];
  for (let z = Math.floor(minZ); z <= maxZ; z += CELL) for (let x = Math.floor(minX); x <= maxX; x += CELL) {
    if (!pointInPoly(x + 0.5, z + 0.5, poly)) continue;
    const i = x - gi0, j = z - gj0; if (i >= 0 && j >= 0 && i < GW && j < GH) out.push(j * GW + i);
  }
  return out;
}
function scaledAround(real: Vec2[], f: number): Vec2[] {
  const [cx, cz] = polyCentroid(real);
  return real.map(([x, z]) => [cx * S + (x - cx) * f, cz * S + (z - cz) * f] as Vec2);
}
function presenceMask(id: string | null, b?: BuildingEntry): number {
  let m = 0;
  ERA_ORDER.forEach((e, i) => {
    if (b) { if (isQuestGated(b.id) || eraState(b, ERAS[e].year) !== 'absent') m |= 1 << i; }
    else if (e === 'presentFinale' || GAME_CONFIG.world.contextBuildingsInHistoricalEras) m |= 1 << i;
  });
  return id ? m : m;
}

(function compact() {
  const items: { key: string; real: Vec2[]; mask: number; prio: number; area: number }[] = [];
  const area = (p: Vec2[]) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(a / 2); };
  for (const b of BUILDINGS) { const r = realPoly(b); if (r) items.push({ key: b.id, real: r, mask: presenceMask(b.id, b), prio: b.landmark ? 0 : 1, area: area(r) }); }
  for (const b of RAW.buildings) if (!registeredOsm.has(b.osm)) items.push({ key: b.osm, real: b.poly, mask: presenceMask(null), prio: 2, area: area(b.poly) });
  items.sort((a, b) => a.prio - b.prio || b.area - a.area);
  const maxF = Math.max(S, GAME_CONFIG.world.buildingScale);
  for (const it of items) {
    let chosen: Vec2[] | null = null, chosenCells: number[] = [];
    for (let f = maxF; f >= S - 1e-6; f -= 0.04) {
      const poly = scaledAround(it.real, Math.max(f, S));
      const cells = cellsOf(poly);
      let ok = true;
      for (const c of cells) {
        // keep ~1 m clearance: test the cell and its 4 neighbours
        for (const n of [c, c - 1, c + 1, c - GW, c + GW]) {
          if (n < 0 || n >= GW * GH) continue;
          if (roadGrid[n] && f > S + 1e-6) { ok = false; break; }
          for (let e = 0; e < eraGrids.length; e++) if ((it.mask >> e) & 1 && eraGrids[e][n]) { ok = false; break; }
          if (!ok) break;
        }
        if (!ok) break;
      }
      if (ok || f - 0.04 < S - 1e-6) { chosen = poly; chosenCells = cells; break; }
    }
    compacted.set(it.key, chosen!);
    for (const c of chosenCells) for (let e = 0; e < eraGrids.length; e++) if ((it.mask >> e) & 1) eraGrids[e][c] = 1;
  }
})();

/** True if any building occupies this game-space point in any era (for placing props/anchors). */
export function everOccupied(x: number, z: number, margin = 0): boolean {
  for (let dz = -margin; dz <= margin; dz++) for (let dx = -margin; dx <= margin; dx++) {
    const i = Math.floor(x + dx) - gi0, j = Math.floor(z + dz) - gj0;
    if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
    for (const g of eraGrids) if (g[j * GW + i]) return true;
  }
  return false;
}
/** Nearest point to (x,z) that is clear of every building (any era) by `margin` m and off streets. */
export function nudgeFree(x: number, z: number, margin = 2): Vec2 {
  const ok = (px: number, pz: number) => !everOccupied(px, pz, margin) && !onVehicleRoad(px, pz);
  if (ok(x, z)) return [x, z];
  for (let r = 1; r < 50; r += 1) for (let k = 0; k < 24; k++) {
    const nx = x + Math.cos(k * Math.PI / 12) * r, nz = z + Math.sin(k * Math.PI / 12) * r;
    if (ok(nx, nz)) return [nx, nz];
  }
  return [x, z];
}
/** Oriented bounding box of a polygon (u = long axis). */
export function obb(poly: Vec2[]) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
  let u: Vec2 = [Math.cos(ang), Math.sin(ang)], v: Vec2 = [-u[1], u[0]];
  const ext = (ax: Vec2) => { let mn = Infinity, mx = -Infinity; for (const p of poly) { const d = p[0] * ax[0] + p[1] * ax[1]; mn = Math.min(mn, d); mx = Math.max(mx, d); } return [mn, mx]; };
  let [u0, u1] = ext(u), [v0, v1] = ext(v);
  if (v1 - v0 > u1 - u0) { [u, v] = [v, [-v[0], -v[1]]]; [u0, u1] = ext(u); [v0, v1] = ext(v); }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { u, v, length: u1 - u0, width: v1 - v0, center: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv] as Vec2, angle: Math.atan2(u[1], u[0]) };
}
export function onVehicleRoad(x: number, z: number): boolean {
  const i = Math.floor(x) - gi0, j = Math.floor(z) - gj0;
  return i >= 0 && j >= 0 && i < GW && j < GH && !!roadGrid[j * GW + i];
}

// ---------------------------------------------------------------- per-era building lists
/** A building as it should appear in a given era. */
export interface EraBuilding {
  key: string;
  registryId: string | null;
  name: string | null;
  poly: Vec2[];               // game metres
  style: BuildingStyle;
  state: 'standing' | 'construction' | 'site'; // site = quest-gated, not yet built
  landmark: boolean;
  context: boolean;
}

const contextStyle = (b: OsmBuilding): BuildingStyle => {
  const residential = ['house', 'detached', 'apartments', 'residential', 'dormitory'].includes(b.type);
  const levels = b.levels ?? (b.height ? Math.max(1, Math.round(b.height / 3.2)) : residential ? 2 : 1);
  return residential
    ? { wall: '#d2b48f', trim: '#f0e6d4', roof: '#8a5f4d', glass: '#55687a', roofType: b.type === 'house' || b.type === 'detached' ? 'hip' : 'flat', levels, floorHeight: 3 }
    : { wall: '#c4b8a6', trim: '#e9e1d4', roof: '#857d73', glass: '#55687a', roofType: 'flat', levels, floorHeight: 3.5 };
};

/** gate(id) -> true once a quest-gated building has been built. */
export function buildingsForEra(era: EraId, gateBuilt: (id: string) => boolean = () => false): EraBuilding[] {
  const year = ERAS[era].year;
  const inst = ERAS[era].institution === 'byui' ? 'byui' : 'ricks';
  const out: EraBuilding[] = [];
  for (const b of BUILDINGS) {
    let st: EraBuilding['state'] | 'absent' = eraState(b, year);
    if (isQuestGated(b.id)) st = gateBuilt(b.id) ? 'standing' : 'site';
    if (st === 'absent') continue;
    const poly = compacted.get(b.id); if (!poly) continue;
    const name = inst === 'byui' ? (b.names.byui ?? b.names.ricks ?? null) : (b.names.ricks ?? b.names.byui ?? null);
    out.push({ key: b.id, registryId: b.id, name, poly, style: b.style, state: st, landmark: !!b.landmark, context: false });
  }
  if (era === 'presentFinale' || GAME_CONFIG.world.contextBuildingsInHistoricalEras) {
    for (const b of RAW.buildings) {
      if (registeredOsm.has(b.osm) || ['roof', 'pavilion', 'carport'].includes(b.type)) continue;
      out.push({ key: b.osm, registryId: null, name: b.name, poly: compacted.get(b.osm)!, style: contextStyle(b), state: 'standing', landmark: false, context: true });
    }
  }
  return out;
}

export function registryEntry(id: string): BuildingEntry | undefined { return BUILDINGS.find(b => b.id === id); }
/** Game-space footprint for a registry building regardless of era. */
export function registryPoly(id: string): Vec2[] | undefined { return compacted.get(id); }
export function allFootprints(): Vec2[][] { return [...compacted.values()]; }
