// Builds the exterior campus from data and swaps buildings/signs per era.
import * as THREE from 'three';
import { addWorldDetail, brickSet, detailTexture, gravelSet, waterNormals, windowSet } from '../render/textures';
import { GAME_CONFIG, type Anchor } from '../config/game.config';
import { ATMOSPHERE, type Season } from '../config/atmosphere';
import { SETTINGS } from '../core/settings';
import { BUILDINGS, eraState } from './buildingRegistry';
import {
  allFootprints, buildingsForEra, CAMPUS, everOccupied, nudgeFree, obb, onVehicleRoad, streetDirAt, toReal, PATH_KINDS, pointInPoly, registryPoly,
  terrainHeight, toGame, type EraBuilding, type Vec2,
} from './campusData';
import { CollisionGrid } from './collision';
import { ERAS, type EraId } from './eras';
import { meshBuilding, mergeToGeometry, rasterize, VOXEL, type BuiltMesh } from './voxelMesher';

const PX_PER_M = 4;
const B = CAMPUS.bounds;
const GW = B.maxX - B.minX, GH = B.maxZ - B.minZ;

const ASPHALT = '#4b4c50';
const AREA_COLORS: Record<string, string> = { park: '#7da35c', sport: '#6a9a4c', parking: ASPHALT, water: '#4f8fc0', wood: '#5b8a43', field: '#b3a868' };

export function textCanvas(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; border?: string } = {}): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = opts.w ?? 512; c.height = opts.h ?? 192;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#3b2f2a'; g.fillRect(0, 0, c.width, c.height);
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 10; g.strokeRect(5, 5, c.width - 10, c.height - 10); }
  g.fillStyle = opts.fg ?? '#f3ead8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = Math.min(64, Math.floor((c.height - 30) / lines.length * 0.8));
  g.font = opts.font ?? `bold ${size}px Georgia, serif`;
  lines.forEach((l, i) => {
    let s = size; while (g.measureText(l).width > c.width - 40 && s > 14) { s -= 2; g.font = `bold ${s}px Georgia, serif`; }
    g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.15);
  });
  return c;
}

function makeSign(lines: string[], width = 4, height = 1.5, colors?: { bg?: string; fg?: string }) {
  const grp = new THREE.Group();
  const tex = new THREE.CanvasTexture(textCanvas(lines, { ...colors, border: '#c9b48a' }));
  tex.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({ color: '#5a4636' });
  const face = new THREE.MeshStandardMaterial({ map: tex });
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.25), [side, side, side, side, face, face]);
  board.position.y = 0.8 + height / 2; board.castShadow = true;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.8, 0.6), new THREE.MeshStandardMaterial({ color: '#8f877c' }));
  base.position.y = 0.4;
  grp.add(board, base);
  return grp;
}

/** Nearest point on a polygon boundary to p, plus the outward normal. */
export function snapToPolygon(poly: Vec2[], p: Vec2): { point: Vec2; normal: Vec2 } {
  let best = Infinity, bp: Vec2 = p, bn: Vec2 = [0, 1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    const q: Vec2 = [a[0] + t * dx, a[1] + t * dz];
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < best) {
      best = d; bp = q;
      const L = Math.sqrt(L2); let n: Vec2 = [dz / L, -dx / L];
      if (pointInPoly(q[0] + n[0] * 0.5, q[1] + n[1] * 0.5, poly)) n = [-n[0], -n[1]];
      bn = n;
    }
  }
  return { point: bp, normal: bn };
}

/** Door model. `enterable` doors get a green frame, lamp and step so they read as usable entrances. */
export function makeDoor(enterable: boolean): THREE.Group {
  const g = new THREE.Group();
  const add = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, emissive?: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, emissive: emissive ?? '#000000' }));
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  add(2.6, 3.1, 0.3, '#6e4a2e', 0, 1.55, 0);                         // double door
  add(0.08, 3.1, 0.34, '#3b2a1c', 0, 1.55, 0);                       // centre split
  add(0.9, 1.5, 0.36, '#9fc3d6', -0.6, 2.05, 0); add(0.9, 1.5, 0.36, '#9fc3d6', 0.6, 2.05, 0);
  add(3.4, 0.3, 1.6, enterable ? '#2e8b57' : '#efe6d2', 0, 3.35, 0.6); // awning
  add(3.6, 0.22, 1.8, '#cfc6b4', 0, 0.11, 0.7);                      // step
  if (enterable) {
    add(0.25, 3.3, 0.45, '#2e8b57', -1.45, 1.65, 0.05); add(0.25, 3.3, 0.45, '#2e8b57', 1.45, 1.65, 0.05);
    add(0.5, 0.35, 0.4, '#fff3c8', 0, 3.75, 0.3, '#a08a3a');           // lamp
  }
  return g;
}

/** Point on the actual voxel wall face (rasterised footprint) along the outward normal. */
const rasterCache = new Map<Vec2[], ReturnType<typeof rasterize>>();
export function flushOnWall(poly: Vec2[], x: number, z: number, nx: number, nz: number): Vec2 {
  let r = rasterCache.get(poly); if (!r) { r = rasterize(poly); rasterCache.set(poly, r); }
  const solid = (px: number, pz: number) => {
    const i = Math.floor(px / VOXEL) - r!.i0, j = Math.floor(pz / VOXEL) - r!.j0;
    return i >= 0 && j >= 0 && i < r!.w && j < r!.h && r!.cells[j * r!.w + i] === 1;
  };
  // start outside and walk inward until the first solid voxel
  for (let t = 3; t > -3; t -= 0.05) {
    const px = x + nx * t, pz = z + nz * t;
    if (solid(px, pz)) return [px + nx * 0.2, pz + nz * 0.2];
  }
  return [x + nx * 0.2, z + nz * 0.2];
}

/** Shared building materials: brick walls, framed glass, gravel roofs (physically based; textures × vertex colours incl. baked AO). */
let BMATS: THREE.Material[] | null = null;
function buildingMaterials(): THREE.Material[] {
  if (BMATS) return BMATS;
  const brick = brickSet(), gravel = gravelSet(), win = windowSet();
  // no normal map on glass + a little roughness: sharp frame bumps on a mirror-like surface shimmered while moving
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(2.1, 2.2, 2.4), map: win.map, roughness: 0.3, metalness: 0.1, envMapIntensity: 1.4 });
  BMATS = [
    new THREE.MeshStandardMaterial({ vertexColors: true, map: brick.map, normalMap: brick.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.95, metalness: 0 }),
    glass,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: gravel.map, normalMap: gravel.normalMap, roughness: 0.95, metalness: 0 }),
  ];
  const snow = new THREE.MeshStandardMaterial({ color: '#f1f5fa', map: gravel.map, normalMap: gravel.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.8 });
  // snow ignores the roof colour but keeps the baked corner shading (separate `ao` attribute)
  snow.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ao;\nvarying float vAO;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAO;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.6, 1.0, vAO);');
  };
  snow.customProgramCacheKey = () => 'snow-roof';
  SNOW_ROOF = snow;
  // smooth white stone (temple): no brick texture, soft sheen
  BMATS.push(new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(1.05, 1.05, 1.05), roughness: 0.55, metalness: 0 }));
  return BMATS;
}
let SNOW_ROOF: THREE.Material | null = null;

/** Small golden voxel statue: robed figure with a long trumpet raised to the east. */
function moroni(tip: { x: number; y: number; z: number }): THREE.Group {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: '#e8c04a', metalness: 0.85, roughness: 0.28, emissive: '#5a4210', emissiveIntensity: 0.25 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gold); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); };
  box(0.5, 0.25, 0.5, 0, 0.12, 0);            // ball / pedestal
  box(0.42, 1.0, 0.36, 0, 0.75, 0);           // robe
  box(0.3, 0.3, 0.3, 0, 1.4, 0);              // head
  box(0.12, 0.5, 0.12, -0.1, 0.9, 0.18);      // arm holding the trumpet
  box(0.9, 0.08, 0.08, 0.5, 1.32, 0, 0.35);   // trumpet, raised
  box(0.14, 0.16, 0.16, 0.93, 1.48, 0, 0.35); // trumpet bell
  g.position.set(tip.x, tip.y, tip.z);        // +x = east
  return g;
}

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const lambert = (c: string) => new THREE.MeshStandardMaterial({ color: c });

export interface BuildingSign {
  buildingId: string;
  name: string;
  object: THREE.Mesh;
  normal: { x: number; z: number };
}
interface EraCache { group: THREE.Group; grid: CollisionGrid; buildings: EraBuilding[]; meshes: Map<string, BuiltMesh>; map: HTMLCanvasElement; buildingSigns: BuildingSign[] }

export class World {
  readonly root = new THREE.Group();
  readonly exterior = new THREE.Group();
  readonly groundCanvas: HTMLCanvasElement;
  era: EraId = GAME_CONFIG.story.startEra;
  private cache = new Map<EraId, EraCache>();
  private signs = new THREE.Group();
  get campusSignGroup() { return this.signs; }
  private obstacles: { x: number; z: number; r: number }[] = [];
  /** Sign footprints: block only in eras where the sign exists (no invisible wall before it's built). */
  private signObstacles: { x: number; z: number; r: number; eras: string[] | null }[] = [];
  private signSpots = new Map<string, Vec2>();
  /** Bench positions (seatable). yaw = direction the sitter faces. */
  benches: { x: number; z: number; yaw: number }[] = [];
  private pathMask!: Uint8Array; private maskW = 0; private maskH = 0;
  readonly sun: THREE.DirectionalLight;
  private hemi = new THREE.HemisphereLight('#dfefff', '#6b6150', 0.6);
  private sunOffset = new THREE.Vector3(50, 100, 35);
  onEraChanged: ((era: EraId) => void)[] = [];
  /** Set by the game: has a quest-gated building been built? */
  gateBuilt: (buildingId: string) => boolean = () => false;

  constructor(scene: THREE.Scene) {
    scene.add(this.root); this.root.add(this.exterior);
    this.groundCanvas = this.paintGround();
    this.computeDoorZones();
    this.exterior.add(this.makeTerrain(), this.makeCurbs(), this.makeBoundary(), this.makeSports(), this.makeProps(), this.makeSky());
    this.exterior.add(this.signs);
    // campus signs never move between eras: fix their spots now so trees/props keep clear and they collide
    for (const s of GAME_CONFIG.signs) {
      const a = GAME_CONFIG.locations[s.anchor]; if (!a) continue;
      const [x, z] = nudgeFree(...toGame(a.x, a.z), 3);
      this.signSpots.set(s.anchor, [x, z]);
      const w = (s as { width?: number }).width ?? 5, yaw = a.yaw ?? 0, ux = Math.cos(yaw), uz = -Math.sin(yaw);
      const eras = (s as { eras?: string[] }).eras ?? null;
      for (let t = -w / 2 + 1.2; t <= w / 2 - 1.2 + 1e-6; t += 1.6) this.signObstacles.push({ x: x + ux * t, z: z + uz * t, r: 1.4, eras });
    }
    if (GAME_CONFIG.world.trees) this.exterior.add(this.makeTrees());
    const hemi = this.hemi;
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.4;
    scene.add(hemi, this.sun, this.sun.target);
    this.exterior.add(this.makeWeather());
    this.setEra(this.era, true);
  }

  // ---------- ground ----------
  private paintGround(): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = Math.round(GW * PX_PER_M); c.height = Math.round(GH * PX_PER_M);
    const g = c.getContext('2d')!;
    const P = (x: number, z: number): [number, number] => [(x - B.minX) * PX_PER_M, (z - B.minZ) * PX_PER_M];
    const path = (pts: Vec2[], close = false) => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
    g.fillStyle = '#88a462'; g.fillRect(0, 0, c.width, c.height);
    const rnd = rng(7);
    for (let i = 0; i < 90000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect((rnd() * c.width) | 0, (rnd() * c.height) | 0, 4, 4); }
    for (const ring of CAMPUS.campus) { path(ring, true); g.fillStyle = 'rgba(120,170,90,0.25)'; g.fill(); }
    for (const k of ['field', 'wood', 'park', 'sport', 'water']) for (const a of CAMPUS.areas) if (a.kind === k) { path(a.poly, true); g.fillStyle = AREA_COLORS[k]; g.fill(); }
    // lawn variation: soft light/dark green patches (later layers — pitches, lots, paths, streets — paint over them)
    const rv = rng(19);
    for (let i = 0; i < 2600; i++) {
      const x = rv() * c.width, y = rv() * c.height, r = (2 + rv() * 7) * PX_PER_M, light = rv() > 0.45;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, light ? 'rgba(190,210,100,0.28)' : 'rgba(35,75,30,0.26)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 1400; i++) {                                   // a few clover / dry specks
      g.fillStyle = rv() > 0.5 ? 'rgba(220,215,140,0.25)' : 'rgba(60,110,40,0.25)';
      g.fillRect(rv() * c.width, rv() * c.height, 2 + rv() * 3, 2 + rv() * 3);
    }
    this.paintPitches(g);
    // parking lots: asphalt, light curb outline and stall stripes so they read as parking
    // parking lots: the same asphalt as the streets (one consistent surface, no stray markings)
    for (const a of CAMPUS.areas) if (a.kind === 'parking') { path(a.poly, true); g.fillStyle = ASPHALT; g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    // paths first; streets are painted over them, then crosswalks mark where paths cross
    for (const r of CAMPUS.roads) if (PATH_KINDS.has(r.kind)) { g.strokeStyle = '#d9cfb8'; g.lineWidth = r.width * PX_PER_M; path(r.pts); g.stroke(); }
    const seen = new Set<string>();
    const roads = CAMPUS.roads.filter(r => {
      if (PATH_KINDS.has(r.kind)) return false;
      const k = r.pts.map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join('|'); // OSM sometimes duplicates a way
      const kr = [...r.pts].reverse().map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join('|');
      if (seen.has(k) || seen.has(kr)) return false; seen.add(k); return true;
    }).sort((a, b) => a.width - b.width);
    for (const r of roads) { g.strokeStyle = ASPHALT; g.lineWidth = r.width * PX_PER_M; path(r.pts); g.stroke(); }
    // ---- surface textures (masked layers): asphalt grain/patches/cracks, concrete grain + joints
    const tile = (draw: (t: CanvasRenderingContext2D) => void) => { const t = document.createElement('canvas'); t.width = t.height = 256; draw(t.getContext('2d')!); return g.createPattern(t, 'repeat')!; };
    const rs = rng(77);
    const asphaltTex = tile(t => {
      for (let i = 0; i < 2600; i++) { t.fillStyle = rs() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; t.fillRect(rs() * 256, rs() * 256, 1, 1); }
      for (let i = 0; i < 4; i++) { t.fillStyle = 'rgba(0,0,0,0.045)'; t.fillRect(rs() * 220, rs() * 220, 20 + rs() * 40, 14 + rs() * 30); }      // repair patches
      t.strokeStyle = 'rgba(0,0,0,0.22)'; t.lineWidth = 1;
      for (let i = 0; i < 3; i++) { let x = rs() * 256, y = rs() * 256; t.beginPath(); t.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rs() - 0.5) * 24; y += (rs() - 0.5) * 24; t.lineTo(x, y); } t.stroke(); } // hairline cracks
    });
    const concreteTex = tile(t => { for (let i = 0; i < 1800; i++) { t.fillStyle = rs() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; t.fillRect(rs() * 256, rs() * 256, 1.5, 1.5); } });
    const masked = (shape: (m: CanvasRenderingContext2D) => void, pattern: CanvasPattern) => {
      const L = document.createElement('canvas'); L.width = c.width; L.height = c.height; const m = L.getContext('2d')!;
      m.lineCap = 'round'; m.lineJoin = 'round'; m.fillStyle = m.strokeStyle = '#000'; shape(m);
      m.globalCompositeOperation = 'source-in'; m.fillStyle = pattern; m.fillRect(0, 0, L.width, L.height); g.drawImage(L, 0, 0);
    };
    const lpath = (m: CanvasRenderingContext2D, pts: Vec2[], close = false) => { m.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? m.lineTo(x, y) : m.moveTo(x, y); }); if (close) m.closePath(); };
    masked(m => {
      for (const a of CAMPUS.areas) if (a.kind === 'parking') { lpath(m, a.poly, true); m.fill(); }
      for (const r of roads) { m.lineWidth = r.width * PX_PER_M; lpath(m, r.pts); m.stroke(); }
    }, asphaltTex);
    masked(m => { for (const r of CAMPUS.roads) if (PATH_KINDS.has(r.kind)) { m.lineWidth = r.width * PX_PER_M; lpath(m, r.pts); m.stroke(); } }, concreteTex);
    // sidewalk expansion joints every ~1.6 m (skipped on the asphalt)
    g.strokeStyle = 'rgba(70,60,45,0.28)'; g.lineWidth = 1;
    for (const r of CAMPUS.roads) {
      if (!PATH_KINDS.has(r.kind)) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, hw = r.width / 2;
        for (let t = 0.8; t < L; t += 1.6) {
          const x = ax + ux * t, z = az + uz * t; if (onVehicleRoad(x, z)) continue;
          const [x1, y1] = P(x - uz * hw, z + ux * hw), [x2, y2] = P(x + uz * hw, z - ux * hw);
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        }
      }
    }
    // centre lines on their own opaque layer with square ends, composited once: overlapping ways never double up
    const lay = document.createElement('canvas'); lay.width = c.width; lay.height = c.height;
    const lg = lay.getContext('2d')!; lg.strokeStyle = '#e9cc55'; lg.lineCap = 'butt'; lg.lineJoin = 'miter'; lg.lineWidth = 0.22 * PX_PER_M; lg.setLineDash([3 * PX_PER_M, 3 * PX_PER_M]);
    for (const r of roads) if (r.width >= 7 && !r.oneway && r.kind !== 'service') { lg.beginPath(); r.pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? lg.lineTo(x, y) : lg.moveTo(x, y); }); lg.stroke(); }
    g.globalAlpha = 0.92; g.drawImage(lay, 0, 0); g.globalAlpha = 1;
    // zebra crosswalks where footpaths cross streets
    g.fillStyle = '#efece4';
    for (const r of CAMPUS.roads) {
      if (!PATH_KINDS.has(r.kind)) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L, w = Math.max(3, r.width * 1.3);
        const segAng = Math.atan2(uz, ux);
        for (let t = 0; t <= L; t += 1.0) {
          const x = ax + ux * t, z = az + uz * t;
          const sd = streetDirAt(x, z); if (sd === null) continue;
          let diff = Math.abs(segAng - sd) % Math.PI; diff = Math.min(diff, Math.PI - diff);
          if (diff < 0.9) continue;                         // sidewalks running alongside a street are not crossings
          g.save(); g.translate((x - B.minX) * PX_PER_M, (z - B.minZ) * PX_PER_M); g.rotate(Math.atan2(uz, ux));
          g.fillRect(-0.25 * PX_PER_M, -w / 2 * PX_PER_M, 0.5 * PX_PER_M, w * PX_PER_M); g.restore();
        }
      }
    }
    // Sidewalk/path mask (raised geometry is built from the same polylines)
    const m = document.createElement('canvas'); m.width = Math.ceil(GW); m.height = Math.ceil(GH);
    const mg = m.getContext('2d')!; mg.lineCap = 'round'; mg.lineJoin = 'round'; mg.strokeStyle = '#fff';
    for (const r of CAMPUS.roads) if (PATH_KINDS.has(r.kind)) {
      mg.lineWidth = r.width; mg.beginPath(); r.pts.forEach((p, i) => { const x = p[0] - B.minX, y = p[1] - B.minZ; i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke();
    }
    const md = mg.getImageData(0, 0, m.width, m.height).data;
    this.maskW = m.width; this.maskH = m.height; this.pathMask = new Uint8Array(m.width * m.height);
    for (let i = 0; i < this.pathMask.length; i++) this.pathMask[i] = md[i * 4] > 128 ? 1 : 0;
    return c;
  }
  /** Field markings by sport, drawn in each pitch's own oriented frame. */
  private paintPitches(g: CanvasRenderingContext2D) {
    for (const a of CAMPUS.areas) {
      if (a.kind !== 'sport') continue;
      const o = obb(a.poly), L = o.length, W = o.width;
      g.save();
      g.translate((o.center[0] - B.minX) * PX_PER_M, (o.center[1] - B.minZ) * PX_PER_M);
      g.rotate(o.angle); g.scale(PX_PER_M, PX_PER_M);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.25;
      const rect = (x: number, y: number, w: number, h: number) => g.strokeRect(x, y, w, h);
      if (a.sport === 'american_football') {
        g.fillStyle = '#4f8f3c'; g.fillRect(-L / 2, -W / 2, L, W);
        g.fillStyle = '#3f7d34'; g.fillRect(-L / 2, -W / 2, L / 12, W); g.fillRect(L / 2 - L / 12, -W / 2, L / 12, W); // end zones
        rect(-L / 2 + 0.5, -W / 2 + 0.5, L - 1, W - 1);
        for (let i = 1; i < 12; i++) { const x = -L / 2 + (L / 12) * i; g.beginPath(); g.moveTo(x, -W / 2 + 0.5); g.lineTo(x, W / 2 - 0.5); g.stroke(); }
      } else if (a.sport === 'soccer') {
        g.fillStyle = '#5c9a45'; g.fillRect(-L / 2, -W / 2, L, W);
        for (let i = 0; i < 8; i++) if (i % 2) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(-L / 2 + (L / 8) * i, -W / 2, L / 8, W); } // mowing stripes
        rect(-L / 2 + 0.6, -W / 2 + 0.6, L - 1.2, W - 1.2);
        g.beginPath(); g.moveTo(0, -W / 2 + 0.6); g.lineTo(0, W / 2 - 0.6); g.stroke();
        g.beginPath(); g.arc(0, 0, W * 0.13, 0, Math.PI * 2); g.stroke();
        for (const s of [-1, 1]) { const bw = W * 0.6, bd = L * 0.16; rect(s > 0 ? L / 2 - 0.6 - bd : -L / 2 + 0.6, -bw / 2, bd, bw); }
      } else if (a.sport === 'baseball') {
        // home plate at the polygon's sharpest corner, infield toward the centroid
        const n = a.poly.length; let home = a.poly[0], sharp = Infinity;
        for (let i = 0; i < n; i++) {
          const p = a.poly[i], q = a.poly[(i + n - 1) % n], r2 = a.poly[(i + 1) % n];
          const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]), a2 = Math.atan2(r2[1] - p[1], r2[0] - p[0]);
          let d = Math.abs(a1 - a2); if (d > Math.PI) d = 2 * Math.PI - d; if (d < sharp) { sharp = d; home = p; }
        }
        g.restore(); g.save();
        const [cx, cz] = polyCentroidLocal(a.poly), dir = Math.atan2(cz - home[1], cx - home[0]);
        g.translate((home[0] - B.minX) * PX_PER_M, (home[1] - B.minZ) * PX_PER_M); g.rotate(dir); g.scale(PX_PER_M, PX_PER_M);
        const s = Math.min(L, W) * 0.38;
        g.fillStyle = '#b48a5a'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 1.35, -Math.PI / 4, Math.PI / 4); g.closePath(); g.fill();
        g.fillStyle = '#5c9a45'; g.beginPath(); g.moveTo(s * 0.18, 0); g.lineTo(s * 0.7, -s * 0.52); g.lineTo(s * 1.22, 0); g.lineTo(s * 0.7, s * 0.52); g.closePath(); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 0.25; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(L, W), -Math.max(L, W)); g.moveTo(0, 0); g.lineTo(Math.max(L, W), Math.max(L, W)); g.stroke();
        g.fillStyle = '#fff'; for (const [bx, by] of [[0, 0], [s * 0.7, -s * 0.7], [s * 1.4, 0], [s * 0.7, s * 0.7]]) g.fillRect(bx - 0.3, by - 0.3, 0.6, 0.6);
      } else if (a.sport === 'basketball' || a.sport === 'tennis' || a.sport === 'beachvolleyball') {
        g.fillStyle = a.sport === 'tennis' ? '#3f7d6a' : a.sport === 'basketball' ? '#a5734a' : '#d9c79a'; g.fillRect(-L / 2, -W / 2, L, W);
        rect(-L / 2 + 0.3, -W / 2 + 0.3, L - 0.6, W - 0.6);
        g.beginPath(); g.moveTo(0, -W / 2 + 0.3); g.lineTo(0, W / 2 - 0.3); g.stroke();
        if (a.sport === 'basketball') { g.beginPath(); g.arc(0, 0, 1.2, 0, Math.PI * 2); g.stroke(); }
      }
      g.restore();
    }
  }

  /** Viking Stadium grandstands + goals, backstops, hoops, nets and light towers on the fields. */
  private makeSports(): THREE.Group {
    const grp = new THREE.Group();
    const white = lambert('#f4f4ee'), yellow = lambert('#e8c43a'), metal = lambert('#9aa3a8'), concrete = lambert('#b9b3a8'), seat = lambert('#7c2f2f'), dark = lambert('#3a3f45');
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; grp.add(m); return m; };
    const local = (o: ReturnType<typeof obb>, du: number, dv: number): Vec2 => [o.center[0] + o.u[0] * du + o.v[0] * dv, o.center[1] + o.u[1] * du + o.v[1] * dv];
    const pitches = CAMPUS.areas.filter(a => a.kind === 'sport');
    for (const a of pitches) {
      const o = obb(a.poly), ry = -o.angle;
      const at = (du: number, dv: number) => { const [x, z] = local(o, du, dv); return [x, terrainHeight(x, z), z] as const; };
      if (a.sport === 'american_football') {
        for (const s of [-1, 1]) {
          const [x, y, z] = at(s * (o.length / 2 - 0.3), 0);
          put(new THREE.BoxGeometry(0.2, 3, 0.2), yellow, x, y + 1.5, z);
          const bar = put(new THREE.BoxGeometry(0.2, 0.2, 5.6), yellow, x, y + 3, z, ry);
          for (const t of [-2.7, 2.7]) { const [px, , pz] = at(s * (o.length / 2 - 0.3), t); put(new THREE.BoxGeometry(0.15, 5, 0.15), yellow, px, y + 5.5, pz); }
          void bar; this.obstacles.push({ x, z, r: 0.4 });
        }
      } else if (a.sport === 'soccer') {
        for (const s of [-1, 1]) {
          const gw = Math.min(7.3, o.width * 0.22);
          const [x, y, z] = at(s * (o.length / 2 - 0.6), 0);
          put(new THREE.BoxGeometry(0.15, 0.15, gw), white, x, y + 2.4, z, ry);
          for (const t of [-gw / 2, gw / 2]) { const [px, , pz] = at(s * (o.length / 2 - 0.6), t); put(new THREE.BoxGeometry(0.15, 2.4, 0.15), white, px, y + 1.2, pz); this.obstacles.push({ x: px, z: pz, r: 0.25 }); }
          const [nx, , nz] = at(s * (o.length / 2 + 0.6), 0); const net = put(new THREE.BoxGeometry(1.2, 2.2, gw), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }), nx, y + 1.1, nz, ry); net.castShadow = false;
        }
      } else if (a.sport === 'baseball') {
        const [cx, cz] = polyCentroidLocal(a.poly); let home = a.poly[0], best = -Infinity;
        for (const p of a.poly) { const d = Math.hypot(p[0] - cx, p[1] - cz); if (d > best) { best = d; home = p; } }
        const dir = Math.atan2(cz - home[1], cx - home[0]);
        const bx = home[0] - Math.cos(dir) * 2, bz = home[1] - Math.sin(dir) * 2, by = terrainHeight(bx, bz);
        put(new THREE.BoxGeometry(0.4, 4, 10), metal, bx, by + 2, bz, -dir);
        this.obstacles.push({ x: bx, z: bz, r: 1.5 });
      } else if (a.sport === 'basketball') {
        for (const s of [-1, 1]) { const [x, y, z] = at(s * (o.length / 2 - 0.4), 0); put(new THREE.BoxGeometry(0.15, 3.2, 0.15), dark, x, y + 1.6, z); put(new THREE.BoxGeometry(0.1, 1, 1.6), white, x - Math.cos(o.angle) * s * 0.1, y + 3.2, z - Math.sin(o.angle) * s * 0.1, ry); this.obstacles.push({ x, z, r: 0.3 }); }
      } else if (a.sport === 'tennis') {
        const [x, y, z] = at(0, 0); const net = put(new THREE.BoxGeometry(0.06, 1, o.width - 0.4), lambert('#222'), x, y + 0.5, z, ry); void net;
      }
    }
    // Upper fields (south-campus intramural fields): light towers + a sign
    const upper = pitches.filter(a => { const [, rz] = toReal(...polyCentroidLocal(a.poly)); return rz > 600 && (a.sport === 'soccer' || a.sport === 'baseball' || !a.sport); });
    if (upper.length) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const a of upper) for (const [x, z] of a.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      for (const [x, z] of [[minX - 2, minZ - 2], [maxX + 2, minZ - 2], [minX - 2, maxZ + 2], [maxX + 2, maxZ + 2], [(minX + maxX) / 2, minZ - 2], [(minX + maxX) / 2, maxZ + 2]]) {
        if (everOccupied(x, z) || onVehicleRoad(x, z)) continue;
        const y = terrainHeight(x, z);
        put(new THREE.BoxGeometry(0.4, 14, 0.4), metal, x, y + 7, z);
        put(new THREE.BoxGeometry(2.4, 1.2, 0.5), new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#5a5030' }), x, y + 14.2, z);
        this.obstacles.push({ x, z, r: 0.4 });
      }
      const [sx, sz] = nudgeFree((minX + maxX) / 2, minZ - 5, 1);
      const sign = makeSign(['UPPER FIELDS'], 5, 1.3, { bg: '#2f5a3a', fg: '#f6f0e2' }); sign.position.set(sx, terrainHeight(sx, sz), sz); grp.add(sign);
      this.obstacles.push({ x: sx, z: sz, r: 2.6 });
    }
    // Viking Stadium (1980, HOB p.80): stepped home grandstand + press box, smaller visitor bleachers
    for (const st of CAMPUS.areas.filter(a => a.kind === 'stadium')) {
      const o = obb(st.poly), [scx, scz] = o.center;
      const field = pitches.filter(p => p.sport === 'american_football').map(p => ({ p, c: obb(p.poly) })).sort((a, b) => Math.hypot(a.c.center[0] - scx, a.c.center[1] - scz) - Math.hypot(b.c.center[0] - scx, b.c.center[1] - scz))[0];
      // rows rise away from the field
      let toField: Vec2 = field ? [field.c.center[0] - scx, field.c.center[1] - scz] : [1, 0];
      const Lf = Math.hypot(...toField) || 1; toField = [toField[0] / Lf, toField[1] / Lf];
      const useU = Math.abs(toField[0] * o.u[0] + toField[1] * o.u[1]) > Math.abs(toField[0] * o.v[0] + toField[1] * o.v[1]);
      const depthAxis: Vec2 = useU ? o.u : o.v, lenAxis: Vec2 = useU ? o.v : o.u;
      const sign = Math.sign(toField[0] * depthAxis[0] + toField[1] * depthAxis[1]) || 1;
      const depth = useU ? o.length : o.width, len = useU ? o.width : o.length;
      const rows = 9, y0 = Math.min(...st.poly.map(p => terrainHeight(p[0], p[1])));
      const ry = -Math.atan2(lenAxis[1], lenAxis[0]);
      for (let r = 0; r < rows; r++) {
        const d = (depth / 2) - (r + 0.5) * depth / rows; // from the field side backwards
        const x = scx + depthAxis[0] * d * sign, z = scz + depthAxis[1] * d * sign, h = 0.8 + r * 0.7;
        put(new THREE.BoxGeometry(len, h, depth / rows + 0.02), concrete, x, y0 + h / 2, z, ry);
        put(new THREE.BoxGeometry(len - 0.6, 0.18, 0.5), seat, x, y0 + h + 0.09, z, ry);
      }
      const back = depth / 2 - depth / rows * 0.5;
      const bx = scx - depthAxis[0] * back * sign, bz = scz - depthAxis[1] * back * sign, top = y0 + 0.8 + rows * 0.7;
      put(new THREE.BoxGeometry(len * 0.45, 3, depth / rows * 1.6), lambert('#e9e3d6'), bx, top + 1.5, bz, ry);           // press box
      put(new THREE.BoxGeometry(len * 0.45 - 0.4, 1.2, depth / rows * 1.6 + 0.05), lambert('#4f6577'), bx, top + 2, bz, ry); // press box windows
      put(new THREE.BoxGeometry(len, 0.3, depth * 0.55), lambert('#6d7378'), scx - depthAxis[0] * depth * 0.2 * sign, top + 3.6, scz - depthAxis[1] * depth * 0.2 * sign, ry); // roof
      for (let t = -len / 2; t <= len / 2; t += 2) for (let d = -depth / 2; d <= depth / 2; d += 2) this.obstacles.push({ x: scx + lenAxis[0] * t + depthAxis[0] * d, z: scz + lenAxis[1] * t + depthAxis[1] * d, r: 1.3 });
      // visitor bleachers on the far side of the field
      if (field) {
        const fc = field.c, far = fc.width / 2 + 4;
        const fx = fc.center[0] + toField[0] * far, fz = fc.center[1] + toField[1] * far;
        const fry = -fc.angle;
        for (let r = 0; r < 4; r++) {
          const x = fx + toField[0] * r * 1.1, z = fz + toField[1] * r * 1.1, h = 0.5 + r * 0.5;
          if (everOccupied(x, z) || onVehicleRoad(x, z)) continue;
          put(new THREE.BoxGeometry(fc.length * 0.5, 0.15, 0.9), metal, x, terrainHeight(x, z) + h, z, fry);
          put(new THREE.BoxGeometry(fc.length * 0.5, h, 0.1), dark, x, terrainHeight(x, z) + h / 2, z, fry);
          this.obstacles.push({ x, z, r: 0.8 });
        }
      }
      const name = st.name ?? 'Viking Stadium';
      const [nx, nz] = nudgeFree(scx - depthAxis[0] * (depth / 2 + 4) * sign, scz - depthAxis[1] * (depth / 2 + 4) * sign, 1);
      const sgn = makeSign([name], 5, 1.3, { bg: '#5b2a24', fg: '#f6f0e2' }); sgn.position.set(nx, terrainHeight(nx, nz), nz);
      sgn.rotation.y = Math.atan2(-depthAxis[0] * sign, -depthAxis[1] * sign); grp.add(sgn); this.obstacles.push({ x: nx, z: nz, r: 2.6 });
    }
    return grp;
  }

  onPath(x: number, z: number) {
    const i = Math.floor(x - B.minX), j = Math.floor(z - B.minZ);
    return i >= 0 && j >= 0 && i < this.maskW && j < this.maskH && this.pathMask[j * this.maskW + i] === 1 && !onVehicleRoad(x, z);
  }

  private makeTerrain(): THREE.Mesh {
    const step = 2.5;
    const cols = Math.ceil(GW / step) + 1, rows = Math.ceil(GH / step) + 1;
    const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = Math.min(B.maxX, B.minX + c * step), z = Math.min(B.maxZ, B.minZ + r * step), k = r * cols + c;
      pos.set([x, terrainHeight(x, z), z], k * 3);
      uv.set([(x - B.minX) / GW, 1 - (z - B.minZ) / GH], k * 2);
    }
    const idx: number[] = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const tex = new THREE.CanvasTexture(this.groundCanvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8; // crisp marks up close, smooth in the distance
    const gm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 });
    addWorldDetail(gm, detailTexture(), 4, 0.45);                    // grass blades / asphalt grain up close
    // season on the lawns: snow patches in winter, yellowed grass in autumn (only green-dominant pixels)
    const detailHook = gm.onBeforeCompile;
    gm.onBeforeCompile = (sh, r) => {
      detailHook.call(gm, sh, r);
      sh.uniforms.snowAmt = this.seasonU.snowAmt; sh.uniforms.autumnAmt = this.seasonU.autumnAmt;
      sh.fragmentShader = sh.fragmentShader.replace('uniform sampler2D detailMap;', 'uniform sampler2D detailMap;\nuniform float snowAmt, autumnAmt;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float grassy = step(0.0, diffuseColor.g - diffuseColor.r * 1.08) * step(0.0, diffuseColor.g - diffuseColor.b * 1.35);
          float sn = texture2D(detailMap, vWorldPosD.xz / 23.0).r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.9), grassy * snowAmt * smoothstep(0.34, 0.48, sn));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.05, 0.55), grassy * autumnAmt * 0.8);`);
    };
    gm.customProgramCacheKey = () => 'terrain-detail-season';
    const m = new THREE.Mesh(g, gm);
    m.receiveShadow = true; m.name = 'terrain';
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lambert('#7f8f5c'));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set((B.minX + B.maxX) / 2, -2, (B.minZ + B.maxZ) / 2);
    m.add(skirt);
    return m;
  }

  /**
   * Streets sit one curb-height below the sidewalks: continuous curb strips run along
   * both edges of every street (skipped where another street crosses), so the level
   * change reads clearly without breaking paths into blocky slabs.
   */
  private makeCurbs(): THREE.Object3D {
    const roads = CAMPUS.roads.filter(r => !PATH_KINDS.has(r.kind) && r.kind !== 'service');
    const lots = CAMPUS.areas.filter(a => a.kind === 'parking');
    // which road covers each 1 m cell (exact half-width); -1 = several roads (intersection)
    const W = Math.ceil(GW), H = Math.ceil(GH), owner = new Int32Array(W * H);
    roads.forEach((r, ri) => {
      const hw = r.width / 2 + 0.6;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        for (let z = Math.floor(Math.min(az, bz) - hw); z <= Math.max(az, bz) + hw; z++) for (let x = Math.floor(Math.min(ax, bx) - hw); x <= Math.max(ax, bx) + hw; x++) {
          const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (z + 0.5 - az) * dz) / L2));
          const qx = ax + t * dx - x - 0.5, qz = az + t * dz - z - 0.5;
          if (qx * qx + qz * qz > hw * hw) continue;
          const ci = Math.floor(x - B.minX), cj = Math.floor(z - B.minZ); if (ci < 0 || cj < 0 || ci >= W || cj >= H) continue;
          const k = cj * W + ci; owner[k] = owner[k] === 0 || owner[k] === ri + 1 ? ri + 1 : -1;
        }
      }
    });
    const otherRoad = (x: number, z: number, ri: number) => {
      const ci = Math.floor(x - B.minX), cj = Math.floor(z - B.minZ); if (ci < 0 || cj < 0 || ci >= W || cj >= H) return true;
      const o = owner[cj * W + ci]; return o !== 0 && o !== ri + 1;
    };
    const mats: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    roads.forEach((r, ri) => {
      for (const side of [-1, 1]) for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
        const nx = -(bz - az) / L * side, nz = (bx - ax) / L * side, off = r.width / 2 + 0.15;
        const n = Math.max(1, Math.ceil(L / 2));
        for (let k = 0; k < n; k++) {
          const x0 = ax + (bx - ax) * k / n + nx * off, z0 = az + (bz - az) * k / n + nz * off;
          const x1 = ax + (bx - ax) * (k + 1) / n + nx * off, z1 = az + (bz - az) * (k + 1) / n + nz * off;
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          if (otherRoad(mx, mz, ri) || everOccupied(mx, mz) || onVehicleRoad(mx + nx * 0.6, mz + nz * 0.6) || lots.some(l => pointInPoly(mx, mz, l.poly))) continue;
          const a = new THREE.Vector3(x0, terrainHeight(x0, z0), z0), b = new THREE.Vector3(x1, terrainHeight(x1, z1), z1);
          const d = b.clone().sub(a); q.setFromUnitVectors(Z, d.clone().normalize());
          const mid = a.add(b).multiplyScalar(0.5); mid.y += 0.02;
          mats.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(0.35, 0.3, d.length() + 0.05)));
        }
      }
    });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert('#d4cdc0'), mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.receiveShadow = true; mesh.castShadow = false;
    return mesh;
  }

  /** Visible edge of the playable map: a low fence + hedge along the bounds. */
  private makeBoundary(): THREE.Object3D {
    const inset = 6, pts: THREE.Vector3[] = [];
    const corners: Vec2[] = [[B.minX + inset, B.minZ + inset], [B.maxX - inset, B.minZ + inset], [B.maxX - inset, B.maxZ - inset], [B.minX + inset, B.maxZ - inset]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 2) { const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L; pts.push(new THREE.Vector3(x, terrainHeight(x, z), z)); }
    }
    const hedge = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 1.4, 1.2), lambert('#3f6f35'), pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => { m.makeTranslation(p.x, p.y + 0.7, p.z); hedge.setMatrixAt(i, m); });
    hedge.castShadow = true;
    return hedge;
  }

  /** A small pond with a stone rim, reeds and lily pads; blocks walking. */
  private makePond(inCampus: (x: number, z: number) => boolean): THREE.Group {
    const grp = new THREE.Group();
    const water = CAMPUS.areas.find(a => a.kind === 'water' && inCampus(...(polyCentroidLocal(a.poly) as [number, number])));
    let [cx, cz] = water ? polyCentroidLocal(water.poly) : toGame(75, -95);
    // organic outline, at least ~11 m across (OSM outline scaled down by compaction is tiny)
    const R = Math.max(5.5, water ? Math.max(...water.poly.map(p => Math.hypot(p[0] - cx, p[1] - cz))) * 1.2 : 6);
    let tries = 0; while (everOccupied(cx, cz, Math.ceil(R)) && tries++ < 30) { cx += 1.5; }
    const rnd = rng(17), pts: THREE.Vector2[] = [];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = R * (0.75 + rnd() * 0.3) * (i % 2 ? 1 : 0.92); pts.push(new THREE.Vector2(cx + Math.cos(a) * r * 1.3, -(cz + Math.sin(a) * r))); }
    const yMin = Math.min(...pts.map(p => terrainHeight(p.x, -p.y)));
    // glassy water: mirror-like sky reflections (Fresnel via the environment map) broken up by moving ripples
    const ripples = waterNormals(); ripples.repeat.set(0.16, 0.16); this.waterTex.push(ripples);
    const ripples2 = ripples.clone(); ripples2.repeat.set(0.37, 0.37); this.waterTex.push(ripples2);
    const surf = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshStandardMaterial({
      color: '#2d5f73', roughness: 0.04, metalness: 0.1, normalMap: ripples, normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.5, transparent: true, opacity: 0.9 }));
    const deep = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshStandardMaterial({ color: '#1f4a3a', roughness: 1, normalMap: ripples2, normalScale: new THREE.Vector2(0.2, 0.2) }));
    // the lawn slopes: keep the water level at the rim's highest point so none of it sinks below ground
    const yMax = Math.max(...pts.map(p => terrainHeight(p.x, -p.y)), terrainHeight(cx, cz));
    surf.rotation.x = -Math.PI / 2; surf.position.y = yMax + 0.08; surf.receiveShadow = true; grp.add(surf);
    deep.rotation.x = -Math.PI / 2; deep.position.y = yMax - 0.35; grp.add(deep);
    const bed = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), lambert('#3b5a3f')); bed.rotation.x = -Math.PI / 2; bed.position.y = yMin - 0.25; grp.add(bed);
    const stone = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert('#a49c8c'), 200);
    const m = new THREE.Matrix4(); let n = 0;
    for (let i = 0; i < pts.length; i++) {
      const a2 = pts[i], b2 = pts[(i + 1) % pts.length], L = a2.distanceTo(b2);
      for (let t = 0; t < L && n < 200; t += 0.9) {
        const x = a2.x + (b2.x - a2.x) * t / L, z = -(a2.y + (b2.y - a2.y) * t / L), s = 0.6 + rnd() * 0.5;
        m.compose(new THREE.Vector3(x, terrainHeight(x, z) + s * 0.25, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 3), new THREE.Vector3(s, s * 0.5, s * 0.8));
        stone.setMatrixAt(n++, m);
      }
    }
    stone.count = n; stone.castShadow = true; grp.add(stone);
    const reed = lambert('#4f7d3a'), pad = lambert('#3f8a45');
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, r = R * (0.55 + rnd() * 0.25);
      const x = cx + Math.cos(a) * r * 1.3, z = cz + Math.sin(a) * r;
      if (i < 6) { const rd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1 + rnd() * 0.6, 0.12), reed); rd.position.set(x, yMax + 0.6, z); grp.add(rd); }
      else { const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 7), pad); lp.position.set(x * 0.6 + cx * 0.4, yMax + 0.12, z * 0.6 + cz * 0.4); grp.add(lp); }
    }
    // keep walkers out of the water
    for (let z = cz - R; z <= cz + R; z += 1.4) for (let x = cx - R * 1.3; x <= cx + R * 1.3; x += 1.4) {
      if (pointInPoly(x, z, pts.map(p => [p.x, -p.y] as Vec2))) this.obstacles.push({ x, z, r: 0.9 });
    }
    return grp;
  }

  /** Sky dome (gradient, sun disk + glow, hazy horizon matching the fog) and slow-drifting voxel clouds. */
  private clouds = new THREE.Group();
  private waterTex: THREE.Texture[] = [];
  private skyU!: { top: { value: THREE.Color }; mid: { value: THREE.Color }; horizon: { value: THREE.Color }; sun: { value: THREE.Vector3 } };
  private cloudMat!: THREE.MeshStandardMaterial;
  private seasonU = { snowAmt: { value: 0 }, autumnAmt: { value: 0 } };
  private makeSky(): THREE.Object3D {
    const grp = new THREE.Group();
    const sunDir = new THREE.Vector3(50, 100, 35).normalize();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.skyU = { top: { value: new THREE.Color('#3f7fc4') }, mid: { value: new THREE.Color('#9cc3e6') }, horizon: { value: new THREE.Color('#c8d9e6') }, sun: { value: sunDir } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }',
      fragmentShader: `uniform vec3 top, mid, horizon, sun; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = d.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
          if (h < 0.0) c = horizon;
          float s = max(dot(d, sun), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 8.0) * 0.18 + pow(s, 120.0) * 0.6);   // glow
          c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.9993, 0.9997, s));       // disk
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    grp.add(sky);
    // voxel clouds: chunky flat clusters high above the campus
    const rnd = rng(55), cubes: THREE.Matrix4[] = [], m = new THREE.Matrix4();
    for (let c = 0; c < 26; c++) {
      const a = rnd() * Math.PI * 2, r = 250 + rnd() * 900, cx = Math.cos(a) * r, cz = Math.sin(a) * r, y = 210 + rnd() * 90, n = 4 + (rnd() * 6 | 0);
      for (let k = 0; k < n; k++) {
        const w = 22 + rnd() * 30, d = 16 + rnd() * 22, hh = 7 + rnd() * 6;
        m.compose(new THREE.Vector3(cx + (rnd() - 0.5) * 60, y + (k % 2) * hh * 0.5, cz + (rnd() - 0.5) * 40), new THREE.Quaternion(), new THREE.Vector3(w, hh, d));
        cubes.push(m.clone());
      }
    }
    const cloudMat = this.cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#c9d6e3', emissiveIntensity: 0.55, roughness: 1, fog: false, transparent: true, opacity: 0.94 });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloudMat, cubes.length);
    cubes.forEach((mm, i) => im.setMatrixAt(i, mm)); im.frustumCulled = false;
    this.clouds.add(im); grp.add(this.clouds);
    return grp;
  }

  /** A few props: benches, lamp posts, a fountain, street-name signs. Decorative, not surveyed. */
  private makeProps(): THREE.Group {
    const grp = new THREE.Group(), rnd = rng(31);
    const inCampus = (x: number, z: number) => CAMPUS.campus.some(r => pointInPoly(x, z, r));
    const ok = (x: number, z: number) => !everOccupied(x, z, 1) && !onVehicleRoad(x, z) && !this.nearDoor(x, z, 4);
    const benches: { x: number; z: number; yaw: number }[] = [], lamps: { x: number; z: number }[] = [];
    for (const r of CAMPUS.roads) {
      if (r.kind !== 'footway' && r.kind !== 'pedestrian') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 8) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (!inCampus(mx, mz)) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L, off = r.width / 2 + 0.9;
        if (rnd() < 0.22 && benches.length < 45) {
          const x = mx + nx * off, z = mz + nz * off;
          if (ok(x, z) && !benches.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < 400)) benches.push({ x, z, yaw: Math.atan2(-nx, -nz) });
        } else if (rnd() < 0.3 && lamps.length < 70) {
          const x = mx - nx * off, z = mz - nz * off;
          if (ok(x, z) && !lamps.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < 225)) lamps.push({ x, z });
        }
      }
    }
    const benchSeat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), lambert('#8a5a36'), benches.length);
    const benchBack = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.5, 0.1), lambert('#8a5a36'), benches.length);
    const benchLegs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.45, 0.4), lambert('#3b3b3b'), benches.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    this.benches = benches;
    benches.forEach((b, i) => {
      const y = terrainHeight(b.x, b.z); q.setFromAxisAngle(Y, b.yaw);
      const at = (dx: number, dy: number, dz: number) => new THREE.Vector3(dx, dy, dz).applyQuaternion(q).add(new THREE.Vector3(b.x, y, b.z));
      m.compose(at(0, 0.5, 0), q, one); benchSeat.setMatrixAt(i, m);
      m.compose(at(0, 0.8, -0.22), q, one); benchBack.setMatrixAt(i, m);
      m.compose(at(0, 0.22, 0), q, new THREE.Vector3(1, 1, 0.6)); benchLegs.setMatrixAt(i, m);
      this.obstacles.push({ x: b.x, z: b.z, r: 0.7 });
    });
    const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 4, 0.16), lambert('#2e3236'), lamps.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: '#fff3c8', emissive: '#ffd27a', emissiveIntensity: 0.15 }), lamps.length);

    lamps.forEach((l, i) => {
      const y = terrainHeight(l.x, l.z);
      m.makeTranslation(l.x, y + 2, l.z); pole.setMatrixAt(i, m);
      m.makeTranslation(l.x, y + 4.1, l.z); head.setMatrixAt(i, m);
      this.obstacles.push({ x: l.x, z: l.z, r: 0.25 });
    });
    for (const o of [benchSeat, benchBack, benchLegs, pole, head]) o.castShadow = true;
    grp.add(benchSeat, benchBack, benchLegs, pole, head);

    // Small pond between the Manwaring Center and the Taylor Building (OSM water feature when present)
    grp.add(this.makePond(inCampus));

    // Street-name signs at every intersection of streets (blades for the named ones)
    const streets = CAMPUS.roads.filter(r => !PATH_KINDS.has(r.kind) && r.kind !== 'service');
    const key = (p: Vec2) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
    const atVertex = new Map<string, { p: Vec2; roads: Set<number> }>();
    streets.forEach((r, ri) => r.pts.forEach(p => { const k = key(p); const e = atVertex.get(k) ?? { p, roads: new Set() }; e.roads.add(ri); atVertex.set(k, e); }));
    const placed: Vec2[] = [];
    for (const { p, roads } of atVertex.values()) {
      const rs = [...roads].map(i => streets[i]);
      const names = [...new Set(rs.map(r => r.name).filter(Boolean) as string[])];
      const isJunction = rs.length >= 3 || (rs.length === 2 && rs[0].name !== rs[1].name);
      if (!isJunction || !names.length || placed.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 12)) continue;
      const off = Math.max(...rs.map(r => r.width)) / 2 + 1.6;
      let spot: Vec2 | null = null;
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = p[0] + dx * off, z = p[1] + dz * off;
        if (!everOccupied(x, z, 1) && !onVehicleRoad(x, z) && !this.nearDoor(x, z, 3.5) && !this.obstacles.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 1) ** 2)) { spot = [x, z]; break; }
      }
      if (!spot) continue;
      placed.push(p);
      const s = new THREE.Group(), y = terrainHeight(spot[0], spot[1]);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.1, 0.12), lambert('#4a5157')); post.position.y = 1.55; s.add(post);
      names.slice(0, 2).forEach((nm, k) => {
        const road = rs.find(r => r.name === nm)!;
        let best = 0, ang = 0;
        for (let i = 0; i < road.pts.length - 1; i++) { const d = Math.hypot(road.pts[i][0] - p[0], road.pts[i][1] - p[1]); if (i === 0 || d < best) { best = d; ang = Math.atan2(road.pts[i + 1][1] - road.pts[i][1], road.pts[i + 1][0] - road.pts[i][0]); } }
        const tex = new THREE.CanvasTexture(textCanvas([nm], { w: 512, h: 96, bg: '#1f6b3a', fg: '#ffffff', font: 'bold 54px sans-serif' })); tex.colorSpace = THREE.SRGBColorSpace;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.05), new THREE.MeshStandardMaterial({ map: tex }));
        blade.position.y = 3.0 - k * 0.5; blade.rotation.y = -ang; s.add(blade); // blade runs along its street
      });
      s.position.set(spot[0], y, spot[1]); grp.add(s); this.obstacles.push({ x: spot[0], z: spot[1], r: 0.3 });
    }
    return grp;
  }

  private makeTrees(): THREE.Group {
    // Decorative, procedurally scattered on lawns (not surveyed tree positions).
    const grp = new THREE.Group();
    const g = this.groundCanvas.getContext('2d')!;
    const img = g.getImageData(0, 0, this.groundCanvas.width, this.groundCanvas.height).data;
    const rnd = rng(99);
    const isLawn = (x: number, z: number) => {
      const px = Math.floor((x - B.minX) * PX_PER_M), py = Math.floor((z - B.minZ) * PX_PER_M);
      for (const [dx, dy] of [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6]]) {
        const k = ((py + dy) * this.groundCanvas.width + px + dx) * 4;
        const r = img[k], gg = img[k + 1], b = img[k + 2];
        if (!(gg > r + 15 && gg > b + 30)) return false;
      }
      return true;
    };
    const trees: { x: number; z: number }[] = [];
    for (let n = 0; n < 9000 && trees.length < 380; n++) {
      const x = B.minX + 12 + rnd() * (GW - 24), z = B.minZ + 12 + rnd() * (GH - 24);
      const inCampus = CAMPUS.campus.some(r => pointInPoly(x, z, r));
      if (!inCampus && rnd() > 0.3) continue;
      if (everOccupied(x, z, 2) || !isLawn(x, z) || this.onPath(x, z)) continue;
      if (trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 72)) continue;          // ~8.5 m apart
      if ([...this.obstacles, ...this.signObstacles].some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 3) ** 2)) continue; // clear of benches, lamps, fountain, signs
      if (onVehicleRoad(x, z) || everOccupied(x, z, 4) || this.nearDoor(x, z, 5)) continue;
      if (CAMPUS.areas.some(a => (a.kind === 'sport' || a.kind === 'stadium' || a.kind === 'parking') && pointInPoly(x, z, a.poly))) continue;
      trees.push({ x, z });
    }
    // Three voxel species: round broadleaf (most), layered conifer, tall white-trunk aspen (common in Rexburg).
    const N = trees.length;
    const trunk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), N * 2);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    this.swayLeaves(leafMat);
    const leaf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), leafMat, N * 6);
    const mtx = new THREE.Matrix4(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const leafIdx: number[][] = [], trunkIdx: number[][] = [];
    let li = 0, ti = 0;
    const box = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, w: number, h: number, d: number, rot: number, c: string) => {
      mtx.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, rot), new THREE.Vector3(w, h, d)); im.setMatrixAt(i, mtx); im.setColorAt(i, col.set(c));
    };
    trees.forEach(t => {
      const y = terrainHeight(t.x, t.z), s = 0.75 + rnd() * 0.5, r0 = rnd() * 1.5, kind = rnd();
      const L: number[] = [], Tk: number[] = [];
      const sp: 'conifer' | 'aspen' | 'broad' = kind < 0.24 ? 'conifer' : kind < 0.42 ? 'aspen' : 'broad';
      if (kind < 0.24) {                                                  // conifer: stacked tiers
        box(trunk, ti, t.x, y + 1.2 * s, t.z, 0.55 * s, 2.4 * s, 0.55 * s, r0, '#5a4130'); Tk.push(ti++);
        const greens = ['#2c6236', '#336d3c', '#3b7744'];
        [[3.6, 1.8, 1.6], [2.8, 1.7, 3.0], [1.9, 1.6, 4.3], [1.0, 1.4, 5.4]].forEach(([w, h, yy], k) => { box(leaf, li, t.x, y + yy * s + 0.6 * s, t.z, w * s, h * s, w * s, r0 + k * 0.4, greens[(rnd() * 3) | 0]); L.push(li++); });
      } else if (kind < 0.42) {                                           // aspen: white trunk, narrow tall crown
        box(trunk, ti, t.x, y + 2.2 * s, t.z, 0.4 * s, 4.4 * s, 0.4 * s, r0, '#e4e0d4'); Tk.push(ti++);
        box(trunk, ti, t.x, y + 1.6 * s, t.z, 0.42 * s, 0.25 * s, 0.42 * s, r0, '#3a3530'); Tk.push(ti++);   // dark bark band
        const greens = ['#7fae47', '#8cb84f', '#6f9f3e'];
        [[2.0, 2.6, 4.6, 0, 0], [1.6, 2.0, 6.4, 0.3, -0.2], [1.3, 1.4, 3.6, -0.5, 0.4]].forEach(([w, h, yy, ox, oz]) => { box(leaf, li, t.x + ox * s, y + yy * s, t.z + oz * s, w * s, h * s, w * s, r0, greens[(rnd() * 3) | 0]); L.push(li++); });
      } else {                                                            // broadleaf: big lumpy crown
        box(trunk, ti, t.x, y + 1.5 * s, t.z, 0.6 * s, 3 * s, 0.6 * s, r0, '#6b4f36'); Tk.push(ti++);
        const greens = ['#4f9a3a', '#5ea443', '#6cae49', '#478f36'];
        box(leaf, li, t.x, y + 4.4 * s, t.z, 3.6 * s, 2.6 * s, 3.6 * s, r0, greens[(rnd() * 4) | 0]); L.push(li++);
        for (let k = 0; k < 4; k++) {
          const a = r0 + k * Math.PI / 2 + rnd() * 0.5, d = 1.5 * s;
          box(leaf, li, t.x + Math.cos(a) * d, y + (3.8 + rnd() * 1.4) * s, t.z + Math.sin(a) * d, (1.8 + rnd() * 0.8) * s, (1.6 + rnd() * 0.8) * s, (1.8 + rnd() * 0.8) * s, a, greens[(rnd() * 4) | 0]); L.push(li++);
        }
        box(leaf, li, t.x, y + 6 * s, t.z, 2.2 * s, 1.4 * s, 2.2 * s, r0 + 0.7, greens[(rnd() * 4) | 0]); L.push(li++);
      }
      L.forEach((idx, k) => { this.leafMeta[idx] = { tree: leafIdx.length, sp, tier: k, of: L.length }; });
      leafIdx.push(L); trunkIdx.push(Tk);
      this.obstacles.push({ x: t.x, z: t.z, r: 0.5 });
    });
    trunk.count = ti; leaf.count = li;
    this.leafBase = Array.from({ length: li }, (_, i) => { const c = new THREE.Color(); leaf.getColorAt(i, c); return c; });
    trunk.castShadow = leaf.castShadow = true; leaf.receiveShadow = true;
    grp.add(trunk, leaf);
    this.treeData = { trees, trunk, leaf, leafIdx, trunkIdx };
    return grp;
  }
  /** Wind: crowns sway a little (more at the top of each block), phase varies per tree position. */
  private windTime = { value: 0 };
  private leafMeta: { tree: number; sp: 'conifer' | 'aspen' | 'broad'; tier: number; of: number }[] = [];
  private leafBase: THREE.Color[] = [];
  private season: Season | null = null;
  /** Recolour tree crowns for the season (autumn reds/golds, spring blossom, winter snow-laden). */
  private applySeason(season: Season) {
    const td = this.treeData; if (!td || season === this.season) return;
    this.season = season;
    const pick = <T,>(a: T[], k: number) => a[Math.abs(Math.floor(k)) % a.length];
    const autumn = ['#d9822b', '#c4501f', '#e3b23c', '#a8361c', '#b8a23a', '#d96a28'], gold = ['#e8c23a', '#f0d050', '#dcb02e'];
    const c = new THREE.Color();
    this.leafMeta.forEach((m, i) => {
      if (!m) return;
      const base = this.leafBase[i], h = (m.tree * 7919) % 100;
      if (season === 'autumn') {
        if (m.sp === 'broad') { if (h < 85) c.set(pick(autumn, m.tree * 3 + m.tier * (h % 3 === 0 ? 1 : 0))); else c.copy(base); }
        else if (m.sp === 'aspen') c.set(pick(gold, m.tree + m.tier));
        else c.copy(base);
      } else if (season === 'spring') {
        if (m.sp === 'broad' && h < 16) c.set(h < 8 ? '#f4c7d8' : '#f6f0f2'); else c.copy(base).multiplyScalar(1.08);
      } else if (season === 'winter') {
        if (m.sp === 'conifer') c.set(m.tier === m.of - 1 || (m.tier === m.of - 2 && h < 50) ? '#eef3f6' : '#2a5534');
        else c.set(m.tier === 0 || h % 4 === 0 ? '#e9eff2' : '#c3ccce');
      } else c.copy(base);
      td.leaf.setColorAt(i, c);
    });
    if (td.leaf.instanceColor) td.leaf.instanceColor.needsUpdate = true;
  }
  /** Weather particles in a box around the player: snowflakes (winter) or tumbling leaves (autumn). */
  private weather!: THREE.Points;
  private weatherVel!: Float32Array;
  private weatherKind: 'snow' | 'leaves' | null = null;
  private lastT = 0;
  private makeWeather(): THREE.Object3D {
    const N = 1600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), rnd = rng(8);
    this.weatherVel = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(rnd() - 0.5) * 90, rnd() * 40, (rnd() - 0.5) * 90], i * 3); this.weatherVel[i] = 0.6 + rnd() * 0.8; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.weather = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.weather.frustumCulled = false; this.weather.visible = false;
    return this.weather;
  }
  private setWeather(kind: 'snow' | 'leaves' | null) {
    this.weatherKind = kind; this.weather.visible = !!kind;
    if (!kind) return;
    const col = this.weather.geometry.getAttribute('color') as THREE.BufferAttribute, rnd = rng(12), c = new THREE.Color();
    const leaves = ['#d9822b', '#c4501f', '#e3b23c', '#a8361c'];
    for (let i = 0; i < col.count; i++) { c.set(kind === 'snow' ? '#ffffff' : leaves[(rnd() * 4) | 0]); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    const mat = this.weather.material as THREE.PointsMaterial; mat.size = kind === 'snow' ? 0.14 : 0.26;
    this.weather.geometry.setDrawRange(0, kind === 'snow' ? 1600 : 260);
  }
  private updateWeather(dt: number, t: number, target: THREE.Vector3) {
    if (!this.weatherKind) return;
    this.weather.visible = !SETTINGS.reducedMotion;
    const p = this.weather.geometry.getAttribute('position') as THREE.BufferAttribute, a = p.array as Float32Array;
    const fall = this.weatherKind === 'snow' ? 1.3 : 0.9, n = this.weatherKind === 'snow' ? 1600 : 260;
    for (let i = 0; i < n; i++) {
      const k = i * 3, v = this.weatherVel[i];
      a[k + 1] -= fall * v * dt;
      a[k] += Math.sin(t * (this.weatherKind === 'snow' ? 0.6 : 1.7) + i) * dt * (this.weatherKind === 'snow' ? 0.4 : 1.1);
      a[k + 2] += Math.cos(t * 0.5 + i * 1.3) * dt * 0.3;
      if (a[k + 1] < 0) a[k + 1] += 40;
    }
    p.needsUpdate = true;
    this.weather.position.set(target.x, target.y - 4, target.z);
  }
  /** Era look: sun, sky dome, clouds, season (renderer handles env light, haze, exposure, bloom). */
  applyAtmosphere(era: EraId) {
    const A = { ...ATMOSPHERE[era], season: SETTINGS.season };   // time of day per era, season chosen by the player
    this.sunOffset.set(...A.sun); this.sun.color.set(A.sunColor); this.sun.intensity = A.sunIntensity;
    this.hemi.color.set(A.hemiSky); this.hemi.groundColor.set(A.hemiGround); this.hemi.intensity = A.hemiIntensity;
    this.skyU.top.value.set(A.skyTop); this.skyU.mid.value.set(A.skyMid); this.skyU.horizon.value.set(A.horizon); this.skyU.sun.value.copy(this.sunOffset).normalize();
    this.cloudMat.emissive.set(A.cloud);
    this.seasonU.snowAmt.value = A.season === 'winter' ? 1 : 0; this.seasonU.autumnAmt.value = A.season === 'autumn' ? 1 : 0;
    this.applySeason(A.season);
    this.setWeather(A.season === 'winter' ? 'snow' : A.season === 'autumn' ? 'leaves' : null);
    const mesh = this.cache.get(era)?.group.getObjectByName('buildings') as THREE.Mesh | undefined;
    if (mesh && BMATS && SNOW_ROOF) mesh.material = [BMATS[0], BMATS[1], A.season === 'winter' ? SNOW_ROOF : BMATS[2], BMATS[3]];
  }
  private swayLeaves(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.windTime = this.windTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float windTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float ph = ip.x * 0.37 + ip.z * 0.23;
            float amt = (transformed.y + 0.5) * 0.06;
            transformed.x += sin(windTime * 1.3 + ph) * amt;
            transformed.z += cos(windTime * 1.1 + ph * 1.3) * amt * 0.7;
          #endif`);
    };
    mat.customProgramCacheKey = () => 'tree-sway';
  }
  private treeData: { trees: { x: number; z: number }[]; trunk: THREE.InstancedMesh; leaf: THREE.InstancedMesh; leafIdx: number[][]; trunkIdx: number[][] } | null = null;
  /** Remove trees that would overlap important things (NPCs, doors, carts, coins, signs). */
  clearTreesAround(points: { x: number; z: number; r: number }[]) {
    const td = this.treeData; if (!td) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    td.trees.forEach((t, i) => {
      if (!points.some(p => (p.x - t.x) ** 2 + (p.z - t.z) ** 2 < (p.r + 2.5) ** 2)) return;
      for (const k of td.trunkIdx[i]) td.trunk.setMatrixAt(k, zero); for (const k of td.leafIdx[i]) td.leaf.setMatrixAt(k, zero);
      const oi = this.obstacles.findIndex(o => o.x === t.x && o.z === t.z); if (oi >= 0) this.obstacles.splice(oi, 1);
      for (const c of this.cache.values()) { const k = c.grid.extra.findIndex(o => o.x === t.x && o.z === t.z); if (k >= 0) c.grid.extra.splice(k, 1); }
    });
    td.trunk.instanceMatrix.needsUpdate = true; td.leaf.instanceMatrix.needsUpdate = true;
  }

  // ---------- eras ----------
  private buildEra(era: EraId): EraCache {
    const buildings = buildingsForEra(era, id => this.gateBuilt(id));
    const grid = new CollisionGrid();
    grid.extra.push(...this.obstacles);
    grid.extra.push(...this.signObstacles.filter(o => !o.eras || o.eras.includes(era)).map(({ x, z, r }) => ({ x, z, r })));
    const meshes = new Map<string, BuiltMesh>();
    const group = new THREE.Group(); group.name = `era-${era}`;
    const buildingSigns: BuildingSign[] = [];
    // landmarks first; a background (context) building that overlaps one already placed is skipped
    // (coplanar walls from two buildings flicker / z-fight)
    const claimed = new Set<string>();
    const order = [...buildings].sort((x, y) => Number(x.context) - Number(y.context));
    for (const b of order) {
      if (b.state === 'site') { group.add(this.constructionSite(b.poly, grid)); continue; }
      const r = rasterize(b.poly), cells: string[] = [];
      for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (r.cells[j * r.w + i]) cells.push(`${r.i0 + i},${r.j0 + j}`);
      if (b.context && cells.some(c => claimed.has(c))) continue;
      cells.forEach(c => claimed.add(c));
      const m = meshBuilding(b.poly, b.style, { construction: b.state === 'construction', detailed: !b.context });
      meshes.set(b.key, m); grid.addBuilding(m);
    }
    const mesh = new THREE.Mesh(mergeToGeometry([...meshes.values()]), buildingMaterials());
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'buildings';
    group.add(mesh);
    for (const b of buildings) if (b.state === 'construction') group.add(this.fence(b.poly));
    // golden Angel Moroni on top of the temple spire, facing east
    for (const b of buildings) { const tip = meshes.get(b.key)?.spireTip; if (tip && b.registryId === 'temple' && b.state === 'standing') group.add(moroni(tip)); }
    for (const b of buildings) if (b.state === 'standing' && b.registryId) this.addFeatures(b, group, grid, meshes);
    for (const b of buildings) if (b.state !== 'site' && !b.context) {
      const doors = b.state === 'standing' ? this.addEntrances(b, group) : [];
      if (b.landmark && b.name) {
        const sign = this.addWallPlaque(b, group, doors[0] ?? null);
        if (sign) buildingSigns.push(sign);
      }
    }
    return { group, grid, buildings, meshes, map: this.paintMap(buildings), buildingSigns };
  }

  /** Building name on the wall (above an entrance when there is one) — never blocks a path. */
  private addWallPlaque(b: EraBuilding, group: THREE.Group, door: { x: number; z: number; nx: number; nz: number } | null): BuildingSign | undefined {
    let spot = door;
    if (!spot) {
      const [cx, cz] = polyAvg(b.poly), R = Math.max(...b.poly.map(p => Math.hypot(p[0] - cx, p[1] - cz))) + 30;
      for (const ang of [0, 0.6, -0.6, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const s = snapToPolygon(b.poly, [cx + Math.sin(ang) * R, cz + Math.cos(ang) * R]);
        const ox = s.point[0] + s.normal[0] * 4, oz = s.point[1] + s.normal[1] * 4;
        if (everOccupied(ox, oz)) continue;                     // faces another building
        const f = flushOnWall(b.poly, s.point[0], s.point[1], s.normal[0], s.normal[1]);
        spot = { x: f[0], z: f[1], nx: s.normal[0], nz: s.normal[1] }; break;
      }
    }
    if (!spot) return;
    const lines = b.state === 'construction' ? [b.name!, '(under construction)'] : [b.name!];
    const tex = new THREE.CanvasTexture(textCanvas(lines, { w: 768, h: 128, bg: '#2a3a4f', fg: '#f6f0e2', border: '#c9b48a' })); tex.colorSpace = THREE.SRGBColorSpace;
    const side = lambert('#5a4636');
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 0.12), [side, side, side, side, new THREE.MeshStandardMaterial({ map: tex }), side]);
    const y = terrainHeight(spot.x, spot.z) + (door ? 4.6 : 3.4);
    plaque.position.set(spot.x + spot.nx * 0.12, y, spot.z + spot.nz * 0.12); plaque.rotation.y = Math.atan2(spot.nx, spot.nz);
    plaque.name = `building-name-sign:${b.registryId}`;
    group.add(plaque);
    return b.registryId ? { buildingId: b.registryId, name: b.name!, object: plaque, normal: { x: spot.nx, z: spot.nz } } : undefined;
  }

  /** Decorative door spots for a footprint (deterministic: where sidewalks end at its walls). */
  entranceSpotsFor(poly: Vec2[], landmark: boolean): { x: number; z: number; nx: number; nz: number }[] {
    const spots: { x: number; z: number; nx: number; nz: number }[] = [];
    const cands: { x: number; z: number; d: number }[] = [];
    for (const r of CAMPUS.roads) {
      if (!PATH_KINDS.has(r.kind)) continue;
      for (const [x, z] of [r.pts[0], r.pts[r.pts.length - 1]]) { // a path that ends at a wall = an entrance
        if (pointInPoly(x, z, poly)) continue;
        const s = snapToPolygon(poly, [x, z]); const d = Math.hypot(s.point[0] - x, s.point[1] - z);
        if (d < 4) cands.push({ x, z, d });
      }
    }
    cands.sort((a, c) => a.d - c.d);
    // keep decorative doors away from the real (enterable) entrances
    const real = Object.values(GAME_CONFIG.interiors).map(i => { const a = GAME_CONFIG.locations[i.exteriorDoor]; const d = this.doorPlacement(a); return [d.x, d.z] as Vec2; });
    const chosen: Vec2[] = [...real];
    const realCount = real.length;
    for (const c of cands) {
      if (chosen.length - realCount >= (landmark ? 3 : 1)) break;
      if (chosen.some((p, i) => Math.hypot(p[0] - c.x, p[1] - c.z) < (i < realCount ? 12 : 18))) continue;
      chosen.push([c.x, c.z]);
    }
    for (const [x, z] of chosen.slice(realCount)) {
      const s = snapToPolygon(poly, [x, z]);
      const f = flushOnWall(poly, s.point[0], s.point[1], s.normal[0], s.normal[1]);
      spots.push({ x: f[0], z: f[1], nx: s.normal[0], nz: s.normal[1] });
    }
    return spots;
  }

  /** Visible (decorative) entrances; returns the door spots. */
  private addEntrances(b: EraBuilding, group: THREE.Group) {
    const spots = this.entranceSpotsFor(b.poly, b.landmark);
    for (const sp of spots) { const door = makeDoor(false); door.position.set(sp.x, terrainHeight(sp.x, sp.z), sp.z); door.rotation.y = Math.atan2(sp.nx, sp.nz); group.add(door); }
    return spots;
  }

  /** Every entrance (decorative + enterable) in any era — a clear zone is kept in front of each. */
  doorZones: { x: number; z: number }[] = [];
  private computeDoorZones() {
    for (const b of BUILDINGS) {
      const poly = registryPoly(b.id); if (!poly) continue;
      for (const sp of this.entranceSpotsFor(poly, !!b.landmark)) this.doorZones.push({ x: sp.x + sp.nx * 2, z: sp.z + sp.nz * 2 });
    }
    for (const i of Object.values(GAME_CONFIG.interiors)) { const d = this.doorPlacement(GAME_CONFIG.locations[i.exteriorDoor]); this.doorZones.push({ x: d.x + d.nx * 2, z: d.z + d.nz * 2 }); }
  }
  /** True when (x,z) is within `r` m of the space in front of any entrance. */
  nearDoor(x: number, z: number, r = 4) { return this.doorZones.some(d => (d.x - x) ** 2 + (d.z - z) ** 2 < r * r); }

  /** Recognisable stylized details for specific buildings (registry `features`). */
  private addFeatures(b: EraBuilding, group: THREE.Group, grid: CollisionGrid, meshes: Map<string, BuiltMesh>) {
    const entry = BUILDINGS.find(x => x.id === b.registryId); const feats = entry?.features; if (!feats?.length) return;
    const [cx, cz] = polyAvg(b.poly);
    const base = Math.min(...b.poly.map(p => terrainHeight(p[0], p[1])));
    const wallTop = terrainHeight(cx, cz) + entry!.style.levels * (entry!.style.floorHeight ?? 4);
    const white = lambert('#f4f0e6'), brick = lambert(entry!.style.wall), glass = lambert('#7fa3bb'), roof = lambert('#5e6d6a');
    const put = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
    if (feats.includes('finial')) {
      // slim white finial on the central peak
      let peakTop = wallTop; const mm = meshes.get(b.key); if (mm) for (const v of mm.tops) peakTop = Math.max(peakTop, v);
      put(new THREE.Mesh(new THREE.BoxGeometry(0.35, 4, 0.35), white), cx, peakTop + 2, cz);
    }
    if (feats.includes('steeple')) {
      // Chapel steeple at the entrance side facing the main quad (north). Stylized.
      const s = snapToPolygon(b.poly, [cx, cz - 200]);
      const x = s.point[0] - s.normal[0] * 3, z = s.point[1] - s.normal[1] * 3;
      put(new THREE.Mesh(new THREE.BoxGeometry(5, wallTop - base + 6, 5), brick), x, (wallTop + base + 6) / 2, z);
      put(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 5.6), white), x, wallTop + 6.3, z);
      put(new THREE.Mesh(new THREE.BoxGeometry(3.6, 4, 3.6), white), x, wallTop + 8.6, z);
      for (const [dx, dz] of [[1.81, 0], [-1.81, 0], [0, 1.81], [0, -1.81]]) put(new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.05 : 1.4, 2.2, dz ? 0.05 : 1.4), lambert('#3a4650')), x + dx, wallTop + 8.8, z + dz);
      const spire = put(new THREE.Mesh(new THREE.ConeGeometry(2.4, 12, 4), white), x, wallTop + 16.6, z); spire.rotation.y = Math.PI / 4;
      // grand entry doors under the steeple
      put(new THREE.Mesh(new THREE.BoxGeometry(3.4, 4, 0.5), white), s.point[0] + s.normal[0] * 0.3, base + 2, s.point[1] + s.normal[1] * 0.3).rotation.y = Math.atan2(s.normal[0], s.normal[1]);
    }
    if (feats.includes('portico')) {
      // Grand glass entrance with tall columns, facing the Manwaring Center (east). Stylized.
      const s = snapToPolygon(b.poly, [cx + 300, cz]);
      const yaw = Math.atan2(s.normal[0], s.normal[1]), along = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const out = new THREE.Vector3(s.normal[0], 0, s.normal[1]);
      const p0 = new THREE.Vector3(s.point[0], base, s.point[1]);
      const h = wallTop - base + 2, width = 26;
      const glassWall = put(new THREE.Mesh(new THREE.BoxGeometry(width, h - 1, 0.4), glass), p0.x + out.x * 0.3, base + (h - 1) / 2, p0.z + out.z * 0.3); glassWall.rotation.y = yaw;
      for (let i = 0; i <= 6; i++) {
        const t = -width / 2 + (width / 6) * i;
        const c = put(new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 1.1), white), p0.x + along.x * t + out.x * 4, base + h / 2, p0.z + along.z * t + out.z * 4);
        grid.extra.push({ x: c.position.x, z: c.position.z, r: 0.7 });
      }
      const canopy = put(new THREE.Mesh(new THREE.BoxGeometry(width + 3, 1.2, 6), white), p0.x + out.x * 2.6, base + h + 0.6, p0.z + out.z * 2.6); canopy.rotation.y = yaw;
      const band = put(new THREE.Mesh(new THREE.BoxGeometry(width + 3.2, 0.5, 6.2), roof), p0.x + out.x * 2.6, base + h + 1.4, p0.z + out.z * 2.6); band.rotation.y = yaw;
    }
  }

  /** Empty, fenced site with material piles for a quest-gated building not yet built. */
  private constructionSite(poly: Vec2[], grid: CollisionGrid): THREE.Object3D {
    const grp = new THREE.Group();
    grp.add(this.fence(poly, 1.5));
    const [cx, cz] = polyAvg(poly), rnd = rng(Math.abs(Math.round(cx * 13 + cz * 7)) + 1);
    // cells inside the footprint (1 m), used for the draped dirt pad and pile placement
    const cells: Vec2[] = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    for (let z = Math.floor(minZ); z <= maxZ; z += 2) for (let x = Math.floor(minX); x <= maxX; x += 2) if (pointInPoly(x + 1, z + 1, poly)) cells.push([x + 1, z + 1]);
    const pad = new THREE.InstancedMesh(new THREE.BoxGeometry(2.02, 0.3, 2.02), lambert('#9c8460'), cells.length);
    const mm = new THREE.Matrix4();
    cells.forEach(([x, z], i) => { mm.makeTranslation(x, terrainHeight(x, z) - 0.08, z); pad.setMatrixAt(i, mm); });
    pad.receiveShadow = true; grp.add(pad);
    const lumber = lambert('#b58a52'), brick = lambert('#a4543a'), steel = lambert('#7d858c');
    const nPiles = Math.min(12, Math.max(4, Math.round(cells.length / 40)));
    for (let i = 0; i < nPiles && cells.length; i++) {
      const [x, z] = cells[(rnd() * cells.length) | 0];
      const y = terrainHeight(x, z), kind = i % 3;
      const pile = new THREE.Group();
      if (kind === 0) for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 0.3), lumber); b.position.set(0, 0.15 + k * 0.26, (k % 2) * 0.32 - 0.16); pile.add(b); }
      if (kind === 1) for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.9), brick); b.position.set((k % 3) * 0.95 - 0.95, 0.23 + Math.floor(k / 3) * 0.46, 0); pile.add(b); }
      if (kind === 2) for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4), steel); b.position.set(k * 0.35 - 0.35, 0.15, 0); pile.add(b); }
      pile.position.set(x, y, z); pile.rotation.y = rnd() * Math.PI; pile.traverse(o => (o as THREE.Mesh).castShadow = true);
      grp.add(pile); grid.extra.push({ x, z, r: 1.4 });
    }
    // a small crane-like mast so the site reads from a distance
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, 0.6), lambert('#e3b23c')); mast.position.set(cx, terrainHeight(cx, cz) + 7, cz); mast.castShadow = true;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.5), lambert('#e3b23c')); jib.position.set(cx + 3.5, terrainHeight(cx, cz) + 13.8, cz); jib.castShadow = true;
    grp.add(mast, jib); grid.extra.push({ x: cx, z: cz, r: 0.6 });
    return grp;
  }

  private fence(poly: Vec2[], outset = 2.5): THREE.Object3D {
    const pts: THREE.Vector3[] = [];
    const [cx, cz] = polyAvg(poly);
    for (const [x, z] of poly) { const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz) || 1; const fx = x + dx / L * outset, fz = z + dz / L * outset; pts.push(new THREE.Vector3(fx, terrainHeight(fx, fz), fz)); }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), lambert('#e07b24'), 500);
    let n = 0; const m = new THREE.Matrix4();
    for (let i = 0; i < pts.length && n < 500; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]; const L = a.distanceTo(b);
      for (let t = 0; t < L && n < 500; t += 1.5) { const p = a.clone().lerp(b, t / L); m.makeTranslation(p.x, p.y + 0.8, p.z); posts.setMatrixAt(n++, m); }
    }
    posts.count = n; return posts;
  }

  private paintMap(buildings: EraBuilding[]): HTMLCanvasElement {
    const s = 1.5, c = document.createElement('canvas'); c.width = Math.round(GW * s); c.height = Math.round(GH * s);
    const g = c.getContext('2d')!;
    g.drawImage(this.groundCanvas, 0, 0, c.width, c.height);
    for (const b of buildings) {
      g.beginPath(); b.poly.forEach((p, i) => { const x = (p[0] - B.minX) * s, y = (p[1] - B.minZ) * s; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = b.state === 'site' ? 'rgba(217,163,95,0.5)' : b.context ? '#b8ab98' : b.state === 'construction' ? '#d9a35f' : '#a8573d'; g.fill();
      g.strokeStyle = '#3b2a20'; g.lineWidth = 1; if (b.state === 'site') g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
    }
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    for (const b of buildings) if (b.landmark && b.name) {
      const [x, z] = polyAvg(b.poly);
      const short = b.name.replace(/ (Building|Center|Performing Arts Center|Student Center)$/, '').replace(/^(Spencer W\.|John W\.|John L\.|George S\.|Joseph Fielding|Hyrum|Eliza R\.|David O\.|Ezra Taft|Mark|Jacob|Oscar A\.|Gordon B\.|Thomas E\.|John) /, '') + (b.state === 'site' ? ' (site)' : '');
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3;
      g.strokeText(short, (x - B.minX) * s, (z - B.minZ) * s); g.fillText(short, (x - B.minX) * s, (z - B.minZ) * s);
    }
    return c;
  }

  setEra(era: EraId, force = false) {
    if (era === this.era && !force && this.cache.has(era)) return;
    for (const c of this.cache.values()) this.exterior.remove(c.group);
    let c = this.cache.get(era);
    if (!c) { c = this.buildEra(era); this.cache.set(era, c); }
    this.exterior.add(c.group);
    this.era = era;
    this.applyAtmosphere(era);
    this.refreshSigns();
    this.onEraChanged.forEach(f => f(era));
  }
  /** Rebuild buildings (e.g. after a quest-gated building is built). */
  refreshBuildings() {
    for (const c of this.cache.values()) { this.exterior.remove(c.group); c.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    this.cache.clear(); this.setEra(this.era, true);
  }

  private refreshSigns() {
    this.signs.clear();
    const inst = ERAS[this.era].institution;
    for (const s of GAME_CONFIG.signs) {
      const a = GAME_CONFIG.locations[s.anchor]; if (!a) continue;
      const text = (s.text as Record<string, string>)[inst]; if (!text || s.hideInEras?.includes(this.era)) continue;
      const lines = text.split('\n');
      const banner = s.banner[inst];
      const sign = makeSign(banner ? [...lines, banner] : lines, 6, 2.4, { bg: inst === 'byui' ? '#1f3550' : '#5b2a24', fg: '#f6f0e2' });
      const [x, z] = this.signSpots.get(s.anchor) ?? toGame(a.x, a.z);
      sign.position.set(x, terrainHeight(x, z), z); sign.rotation.y = a.yaw ?? 0;
      this.signs.add(sign);
    }
  }

  get grid() { return this.cache.get(this.era)!.grid; }
  get mapCanvas() { return this.cache.get(this.era)!.map; }
  get eraBuildings() { return this.cache.get(this.era)!.buildings; }
  get buildingSigns(): readonly BuildingSign[] { return this.cache.get(this.era)?.buildingSigns ?? []; }
  get buildingOccluder() { return this.cache.get(this.era)?.group.getObjectByName('buildings'); }
  blocked(x: number, z: number, r: number) { return this.grid.blocked(x, z, r); }
  groundY(x: number, z: number) { return terrainHeight(x, z); }

  /** Resolve an anchor with `building` to a point on that building's wall + outward normal (game metres). */
  doorPlacement(a: Anchor): { x: number; z: number; nx: number; nz: number } {
    const [gx, gz] = toGame(a.x, a.z);
    const poly = a.building ? registryPoly(a.building) : undefined;
    if (!poly) return { x: gx, z: gz, nx: 0, nz: 1 };
    const s = snapToPolygon(poly, [gx, gz]);
    const f = flushOnWall(poly, s.point[0], s.point[1], s.normal[0], s.normal[1]); // on the voxel wall face
    return { x: f[0], z: f[1], nx: s.normal[0], nz: s.normal[1] };
  }
  buildingStanding(id: string): boolean {
    const b = BUILDINGS.find(x => x.id === id); return !!b && eraState(b, ERAS[this.era].year) === 'standing';
  }
  updateSun(target: THREE.Vector3) {
    this.clouds.rotation.y = (performance.now() / 1000) * 0.0025;                // slow drift
    this.clouds.position.set(target.x, 0, target.z);
    const t = performance.now() / 1000; this.windTime.value = t;
    const dt = Math.min(0.1, this.lastT ? t - this.lastT : 0); this.lastT = t; this.updateWeather(dt, t, target);
    this.waterTex.forEach((tx, i) => tx.offset.set(t * (i ? -0.011 : 0.007), t * (i ? 0.006 : 0.009)));
    // Snap the shadow camera to whole shadow-map texels in light space: otherwise shadow edges
    // shimmer/swim on walls and windows every time the player moves.
    const sc = this.sun.shadow.camera, texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const dir = this.sunOffset.clone().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right).normalize();
    const u = Math.round(target.dot(right) / texel) * texel, v = Math.round(target.dot(up) / texel) * texel, w = target.dot(dir);
    const snapped = right.multiplyScalar(u).add(up.multiplyScalar(v)).add(dir.clone().multiplyScalar(w));
    this.sun.position.copy(snapped).add(this.sunOffset);
    this.sun.target.position.copy(snapped);
  }
}

function polyAvg(p: Vec2[]): Vec2 { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export { VOXEL, allFootprints };

function polyCentroidLocal(p: Vec2[]): Vec2 { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
