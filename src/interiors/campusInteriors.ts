// Walk-in interiors for campus buildings (layouts are stylized approximations, not floor plans):
// - classroom buildings: a corridor with classrooms on both sides, some empty, some in session;
// - BYU–Idaho Center (Campus Center): auditorium with rows of seats, a stage and a pulpit;
// - Manwaring Center: food court (counters with staff, tables with students) and a gallery of
//   the school's presidents that grows as the eras advance (names + years, no portraits);
// - Hinckley Building: a long hall of offices (cashier, HR, parking services, …).
// Importing this module registers the interiors and their door anchors in GAME_CONFIG, so the
// game creates the doors, prompts and exits like any other interior. Each building gets its own
// entrance on the side farthest from existing interior doors (so Quest 1's demo doors stay as they are).
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { BUILDINGS, eraState } from '../world/buildingRegistry';
import { registryPoly, toReal } from '../world/campusData';
import { ERAS, type EraId } from '../world/eras';
import { Avatar } from '../player/Avatar';
import { eraLook } from '../world/Npcs';
import { textCanvas } from '../world/World';
import { PRESIDENTS } from '../world/presidents';
import { Vehicle } from '../player/Vehicle';
import { balcony, bookcase, bulletin, clock, coffeeTable, column, computer, deskLamp, floorZone, fountain, glassMat, glassRail, globe, globeLight, lockers, mat, painting, pendant, plant, poster, rug, screen, sofa, solid, stairs, trash, vending, waterCooler, type FloorStyle } from './decor';

export interface Rect { x0: number; z0: number; x1: number; z1: number; h?: number; color?: string }
export interface CampusLayout {
  floorStyle?: FloorStyle; windows?: boolean; height?: number;
  floor?: string; wall?: string; walls?: Rect[]; props?: Rect[]; blockers?: Rect[];
  signs?: { text: string[]; x: number; z: number; ry: number; y?: number; sx?: number; sy?: number }[];
  /** Furniture and people, built the first time the player walks in. */
  decorate?: (g: THREE.Group) => void;
  /** Called on entry with the current era (e.g. the presidents gallery). */
  onEra?: (era: EraId) => void;
}
export const CAMPUS_LAYOUTS: Record<string, CampusLayout> = {};

const ERA_IDS: EraId[] = ['ricks1999', 'transition', 'byui', 'presentFinale'];
const CLASSROOM_BUILDINGS = ['smith', 'kirkham', 'ricks-building'];
type Kind = 'classrooms' | 'auditorium' | 'foodcourt' | 'offices' | 'library' | 'gym' | 'residence' | 'chapel' | 'theater' | 'museum' | 'shop' | 'lab' | 'greenhouse' | 'nursing' | 'gallery' | 'engineering' | 'studio';
const SPECIAL: Record<string, Exclude<Kind, 'classrooms'>> = { taylor: 'chapel', snow: 'theater', romney: 'museum', austin: 'shop', stc: 'lab', benson: 'greenhouse', clarke: 'nursing', 'spori-original': 'gallery', 'spori-new': 'gallery', etc: 'engineering', 'visual-arts': 'studio', icenter: 'auditorium', manwaring: 'foodcourt', hinckley: 'offices', mckay: 'library', hart: 'gym', rigby: 'residence', biddulph: 'residence', lamprecht: 'residence', chapman: 'residence' };

let seed = 1234; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const lambert = (c: string) => mat(c);   // shared per colour (rooms have hundreds of boxes)
function box(g: THREE.Object3D, w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? lambert(c) : c); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m;
}
function plaque(g: THREE.Object3D, lines: string[], x: number, y: number, z: number, ry: number, w = 3, bg = '#2d3a46') {
  const tex = new THREE.CanvasTexture(textCanvas(lines, { w: 512, h: 128, bg })); tex.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex })); p.position.set(x, y, z); p.rotation.y = ry; g.add(p); return p;
}
// ---------------------------------------------------------------- people who move
/** Indoor people and what they do: sit and write, pace and talk, or walk a loop of points. */
interface Actor { a: Avatar; kind: 'seated' | 'idle' | 'talker' | 'walker' | 'runner' | 'cyclist'; pts: [number, number][]; i: number; speed: number; wait: number; seed: number; x: number; z: number; yaw: number }
const actorsOf = (g: THREE.Object3D): Actor[] => (g.userData.actors ??= []);
/** Where the people who stay put are (room-local), so the player bumps into them instead of walking through.
 *  People walking a route are left out: they'd wall off a corridor when several pass at once. */
export const actorSpots = (g: THREE.Object3D): [number, number][] => (g.userData.actors as Actor[] | undefined)?.filter(c => c.kind === 'seated' || c.kind === 'idle' || c.kind === 'runner' || c.kind === 'cyclist').map(c => [c.x, c.z]) ?? [];
function addActor(g: THREE.Object3D, a: Avatar, kind: Actor['kind'], x: number, z: number, yaw: number, pts: [number, number][] = [], speed = 1.1) {
  actorsOf(g).push({ a, kind, pts, i: 0, speed, wait: rnd() * 3, seed: rnd() * 100, x, z, yaw }); return a;
}
/** A seated person (desk, auditorium seat, food court table) facing `yaw`. */
function seated(g: THREE.Object3D, x: number, z: number, yaw: number, look = eraLook('presentFinale', (rnd() * 1e6) | 0)) {
  const a = new Avatar(look, 0.95); a.sit(true); a.root.position.set(x, -0.32, z); a.root.rotation.y = yaw; g.add(a.root); return addActor(g, a, 'seated', x, z, yaw);
}
function standing(g: THREE.Object3D, x: number, z: number, yaw: number, look = eraLook('presentFinale', (rnd() * 1e6) | 0), kind: Actor['kind'] = 'idle', pts: [number, number][] = []) {
  const a = new Avatar(look); a.root.position.set(x, 0, z); a.root.rotation.y = yaw; g.add(a.root); return addActor(g, a, kind, x, z, yaw, pts, 0.9 + rnd() * 0.5);
}
/** Someone walking a loop of points (pausing at each). */
function walker(g: THREE.Object3D, pts: [number, number][], look = eraLook('presentFinale', (rnd() * 1e6) | 0)) {
  const [x, z] = pts[0]; return standing(g, x, z, 0, look, 'walker', pts);
}
/** Animate everyone in a room (called every frame while the player is inside). */
/** Extra per-room animation (the pick-up basketball game, treadmill belts…), run while you're inside. */
const ticksOf = (g: THREE.Object3D): ((dt: number, t: number) => void)[] => (g.userData.ticks ??= []);
export function updateActors(g: THREE.Object3D, dt: number, t: number) {
  for (const f of ticksOf(g)) f(dt, t);
  for (const c of actorsOf(g)) {
    const a = c.a;
    if (c.kind === 'seated') { a.seatedIdle(t, c.seed, dt); continue; }
    if (c.kind === 'runner') { a.animate(dt, c.speed); continue; }                         // running in place on a treadmill
    if (c.kind === 'cyclist') { a.pedal(c.speed); a.animate(dt, 0); continue; }
    if (c.kind === 'idle') { a.animate(dt, 0); continue; }
    // talkers pace between their points while talking; walkers loop their route
    const target = c.pts[c.i];
    if (c.wait > 0 || !target) {
      c.wait -= dt; a.animate(dt, 0);
      if (c.kind === 'talker') { a.talking = true; a.updateMouth(dt); a.gesture(t, c.seed); }
      continue;
    }
    const dx = target[0] - c.x, dz = target[1] - c.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { c.i = (c.i + 1) % c.pts.length; c.wait = c.kind === 'talker' ? 2 + rnd() * 4 : 0.5 + rnd() * 3; continue; }
    const step = Math.min(d, c.speed * dt); c.x += dx / d * step; c.z += dz / d * step;
    let dy = Math.atan2(dx, dz) - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 7);
    a.root.position.set(c.x, a.root.position.y, c.z); a.root.rotation.y = c.yaw; a.animate(dt, c.speed);
    if (c.kind === 'talker') { a.talking = true; a.updateMouth(dt); }
  }
}
const wallX = (x0: number, x1: number, z: number, gaps: [number, number][] = [], h?: number): Rect[] => {
  const out: Rect[] = []; let s = x0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) { if (a > s) out.push({ x0: s, z0: z - 0.15, x1: a, z1: z + 0.15, h }); s = b; }
  if (x1 > s) out.push({ x0: s, z0: z - 0.15, x1, z1: z + 0.15, h }); return out;
};
const wallZ = (z0: number, z1: number, x: number): Rect => ({ x0: x - 0.15, z0, x1: x + 0.15, z1 });

// ---------------------------------------------------------------- classrooms
/** Building-specific looks for the classroom buildings (STC: dark porcelain tile and white walls, like its atrium). */
const CLASSROOM_LOOK: Record<string, { floor: string; wall: string; floorStyle: FloorStyle }> = {
  stc: { floor: '#4a4c50', wall: '#f2f2f0', floorStyle: 'darkTile' }, etc: { floor: '#4a4c50', wall: '#f2f2f0', floorStyle: 'darkTile' },
  'visual-arts': { floor: '#9a9894', wall: '#f4f2ee', floorStyle: 'darkTile' }, 'ricks-building': { floor: '#d8d4cc', wall: '#ece8e0', floorStyle: 'mcTile' },
  'spori-new': { floor: '#d8d4cc', wall: '#ece8e0', floorStyle: 'mcTile' }, hinckley: { floor: '#d8d4cc', wall: '#ece8e0', floorStyle: 'mcTile' },
};
function classrooms(name: string, num: number, id = ''): CampusLayout {
  const walls: Rect[] = [], props: Rect[] = [], signs: CampusLayout['signs'] = [];
  const north = [[-20, -10], [-10, 0], [0, 10], [10, 20]], south = [[-20, -11], [-11, -2], [2, 11], [11, 20]];
  walls.push(...wallX(-20, 20, -2, north.map(([a, b]) => [(a + b) / 2 - 0.8, (a + b) / 2 + 0.8] as [number, number])));
  walls.push(...wallX(-20, -2, 2, south.slice(0, 2).map(([a, b]) => [(a + b) / 2 - 0.8, (a + b) / 2 + 0.8] as [number, number])));
  walls.push(...wallX(2, 20, 2, south.slice(2).map(([a, b]) => [(a + b) / 2 - 0.8, (a + b) / 2 + 0.8] as [number, number])));
  for (const x of [-10, 0, 10]) walls.push(wallZ(-13, -2.15, x));
  for (const x of [-11, 11]) walls.push(wallZ(2.15, 13, x));
  walls.push(wallZ(2.15, 13, -2), wallZ(2.15, 13, 2));                                   // entry corridor
  const rooms: { x0: number; x1: number; z0: number; z1: number; board: 'n' | 's'; n: number }[] = [];
  north.forEach(([a, b], i) => rooms.push({ x0: a, x1: b, z0: -13, z1: -2, board: 'n', n: num + 1 + i * 2 }));
  south.forEach(([a, b], i) => rooms.push({ x0: a, x1: b, z0: 2, z1: 13, board: 's', n: num + 2 + i * 2 }));
  for (const r of rooms) {
    const cx = (r.x0 + r.x1) / 2;
    const rows = r.board === 'n' ? [-7.5, -5.5] : [7.2, 9.2], cols = [cx - 2.6, cx, cx + 2.6];
    for (const z of rows) for (const x of cols) props.push({ x0: x - 0.55, z0: z - 0.3, x1: x + 0.55, z1: z + 0.3, h: 0.75, color: '#8a6d4b' });
    signs.push({ text: [`Room ${r.n}`], x: cx, z: r.board === 'n' ? -1.8 : 1.8, ry: r.board === 'n' ? Math.PI : 0 });
  }
  return {
    floor: CLASSROOM_LOOK[id]?.floor ?? '#a39d90', wall: CLASSROOM_LOOK[id]?.wall ?? '#e8e2d6', floorStyle: CLASSROOM_LOOK[id]?.floorStyle ?? 'tile', walls, props, signs: [{ text: [name], x: 0, z: 1.6, ry: Math.PI }, ...signs],
    decorate: g => {
      seed = num * 31 + 7;
      // the corridor: lockers between the classroom doors, notice boards, a drinking fountain, bins, plants, lights
      for (const [a, b] of [[-19.6, -16.2], [-13.8, -6.2], [-3.8, 3.8], [6.2, 13.8], [16.2, 19.6]] as [number, number][]) lockers(g, a, b, -1.85, 1, ['#3f5f8a', '#7a2b2b', '#3f6f4a'][(num / 100) % 3 | 0]);
      bulletin(g, -11, 1.65, 1.83, Math.PI, 2.4); bulletin(g, 11, 1.65, 1.83, Math.PI, 2.4);
      fountain(g, 9.2, 1.85, Math.PI); trash(g, -19.4, 1.3); trash(g, 3.0, 1.4, '#2f4f7f'); plant(g, 19.3, 1.3, 0.9);
      clock(g, 0, 3.0, -1.84, 0);
      for (let x = -16; x <= 16; x += 8) pendant(g, x, 0, 3.0);
      poster(g, ['WELCOME BACK', 'STUDENTS!'], -1.84, 2.2, 7, Math.PI / 2, 1.6, 0.8, '#7a2b2b');
      poster(g, ['Study group', 'Tue · Thu 7pm'], 1.84, 2.0, 6, -Math.PI / 2, 1.2, 0.8, '#3f6f4a');
      poster(g, ['Lost & found', 'ask the front desk'], 1.84, 2.0, 10, -Math.PI / 2, 1.2, 0.8, '#2d3a46');
      for (const r of rooms) {
        const cx = (r.x0 + r.x1) / 2, n = r.board === 'n';
        // board + teacher's desk
        const bz = n ? -12.8 : 12.6;
        if (n) { box(g, 6, 1.6, 0.06, '#2f4a3a', cx, 1.9, bz); box(g, 6.2, 0.1, 0.15, '#c9b48a', cx, 1.05, bz + 0.05); }
        else { box(g, 3.2, 1.4, 0.06, '#f4f4f0', r.x0 + 2.3, 1.9, 2.25); }
        box(g, 1.6, 0.8, 0.7, '#5a3a22', cx + 2.5, 0.4, n ? -11.6 : 11.4);
        const rows = n ? [-7.5, -5.5] : [7.2, 9.2], cols = [cx - 2.6, cx, cx + 2.6];
        const inSession = rnd() < 0.6;
        for (const z of rows) for (const x of cols) {
          box(g, 0.45, 0.45, 0.45, '#3a4a5a', x, 0.22, z + (n ? 0.65 : -0.65));          // chair
          if (inSession && rnd() < 0.8) { const st = seated(g, x, z + (n ? 0.65 : -0.65), n ? Math.PI : 0); st.root.position.y = -0.3; }
        }
        if (inSession) { const tz = n ? -11.2 : 11.0; standing(g, cx - 2, tz, n ? 0 : Math.PI, eraLook('byui', (rnd() * 1e6) | 0), 'talker', [[cx - 2.4, tz], [cx + 1.2, tz]]); }
        // the teacher's desk: a lamp, books and an apple; a clock over the door; posters on the side walls
        const dz = n ? -11.6 : 11.4;
        deskLamp(g, cx + 3.0, 0.8, dz); box(g, 0.3, 0.12, 0.22, '#8d2f2f', cx + 2.2, 0.86, dz); box(g, 0.28, 0.1, 0.2, '#2f5f9e', cx + 2.2, 0.97, dz); box(g, 0.12, 0.12, 0.12, '#c0392b', cx + 1.9, 0.86, dz + 0.1);
        clock(g, cx + 3, 3.0, n ? -2.16 : 2.16, n ? Math.PI : 0);
        const wx = r.x1 - 0.17, topic = [['The water cycle'], ['Parts of speech'], ['Periodic table'], ['World map'], ['Shakespeare'], ['Algebra rules']][(rnd() * 6) | 0];
        poster(g, topic, wx, 2.0, (r.z0 + r.z1) / 2, -Math.PI / 2, 1.4, 0.9, ['#2f5f9e', '#3f6f4a', '#7a5a3a', '#5a3a6b'][(rnd() * 4) | 0]);
        if (!inSession && rnd() < 0.7) box(g, 0.35, 0.45, 0.25, ['#2f3e57', '#7a2b2b', '#b8742c'][(rnd() * 3) | 0], cx - 1, 0.22, rows[0] + (n ? 0.9 : -0.9));   // a forgotten backpack
        if (rnd() < 0.5) plant(g, r.x0 + 0.6, n ? -12.4 : 12.4, 0.8);
      }
    },
  };
}

// ---------------------------------------------------------------- auditorium (I-Center)
function auditorium(): CampusLayout {
  // Photos: thousands of maroon seats in curved rows fanning out from the stage, white curved walls
  // washed with blue light, a balcony front with lights, a wood stage with the choir seats behind it.
  const SX = 0, SZ = -27, blockers: Rect[] = [], seats: { x: number; z: number; yaw: number }[] = [];
  const aisles = [-0.62, -0.22, 0.22, 0.62];                      // angles (rad) left free for walking toward the stage
  for (let r = 13; r <= 46; r += 1.4) {
    for (let a = -1.05; a <= 1.05; a += 0.62 / r * 1.0) {
      if (aisles.some(q => Math.abs(a - q) < 1.05 / r)) continue;
      const x = SX + Math.sin(a) * r, z = SZ + Math.cos(a) * r;
      if (Math.abs(x) > 27 || z > 23.5 || z < -12) continue;
      seats.push({ x, z, yaw: Math.atan2(SX - x, SZ - z) });
    }
  }
  for (const st of seats) blockers.push({ x0: st.x - 0.3, z0: st.z - 0.3, x1: st.x + 0.3, z1: st.z + 0.3 });
  return {
    floor: '#3a3036', wall: '#eceae6', floorStyle: 'carpet', windows: false, blockers, height: 9,
    props: [{ x0: -20, z0: -24.5, x1: 20, z1: -14.5, h: 1.1, color: '#9a7650' }],                       // stage (wood)
    signs: [{ text: ['Auditorium'], x: 0, z: 23, ry: Math.PI }],
    decorate: g => {
      seed = 99;
      const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.12, 0.5), lambert('#7a2a35'), seats.length);
      const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.62, 0.08), lambert('#6b2430'), seats.length);
      const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.08, 0.5), lambert('#c9a44a'), seats.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), people: typeof seats = [];
      seats.forEach((st, i) => {
        q.setFromAxisAngle(up, st.yaw);
        const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
        m.compose(new THREE.Vector3(st.x, 0.45, st.z), q, one); seat.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(st.x - fx * 0.25, 0.78, st.z - fz * 0.25), q, one); back.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(st.x + Math.cos(st.yaw) * 0.29, 0.6, st.z - Math.sin(st.yaw) * 0.29), q, one); arm.setMatrixAt(i, m);
        if (rnd() < 0.035 && people.length < 60) people.push(st);
      });
      for (const im of [seat, back, arm]) { im.frustumCulled = false; im.castShadow = true; g.add(im); }
      for (const st of people) seated(g, st.x, st.z, st.yaw);
      // the stage: pulpit, choir seats in tiers, organ pipes, a light wood backdrop, flowers, footlights
      box(g, 1.1, 1.25, 0.8, '#5a3a22', 0, 1.1 + 0.62, -16.2); box(g, 1.2, 0.08, 0.9, '#3a2614', 0, 1.1 + 1.27, -16.2);
      for (let i = 0; i < 4; i++) for (let x = -14; x <= 14; x += 0.7) box(g, 0.5, 0.45, 0.5, '#7a2a35', x, 1.1 + 0.22 + i * 0.45, -20.5 - i * 0.9);
      for (let i = 0; i < 22; i++) box(g, 0.35, 3 + Math.sin(i * 0.7) * 1.2 + 2, 0.35, '#c9a43a', -7.5 + i * 0.7, 1.1 + 2.6, -24.2);
      for (let x = -19; x <= 19; x += 2.2) box(g, 2.0, 8, 0.2, x % 4 ? '#c8a57a' : '#b89468', x, 4.6, -24.8);
      standing(g, 0, -16.9, 0, { shirt: '#ffffff', jacket: '#2b2f3a', pants: '#2b2f3a', tie: '#7a2b2b', hair: '#6d655c', skin: '#e0b896', hairStyle: 'short' }, 'talker', [[-0.4, -16.9], [0.4, -16.9]]).root.position.y = 1.1;
      const st = new THREE.Group(); st.position.y = 1.1; g.add(st); plant(st, -2.2, -16, 0.9); plant(st, 2.2, -16, 0.9);
      for (let x = -19; x <= 19; x += 2) box(g, 0.3, 0.12, 0.2, mat('#fff3cf', { emissive: '#ffd98a', emissiveIntensity: 1 }), x, 1.16, -14.45, false);
      screen(g, -22, 6, -24.6, 0, 6, ['Welcome'], '#2a3a4f'); screen(g, 22, 6, -24.6, 0, 6, ['Welcome'], '#2a3a4f');
      // white walls washed with blue light; a balcony front with a row of lights along the sides and back
      const blue = mat('#5a8cff', { emissive: '#3d6bff', emissiveIntensity: 1.4 });
      for (const sx of [-1, 1]) for (let z = -20; z <= 20; z += 5) box(g, 0.06, 4.5, 0.5, blue, sx * 27.95, 2.6, z, false);
      for (const sx of [-1, 1]) { box(g, 0.6, 0.9, 44, '#e8e4dc', sx * 27.6, 5.4, 0); for (let z = -20; z <= 21; z += 1.6) box(g, 0.1, 0.1, 0.1, mat('#fff3cf', { emissive: '#ffe4a8', emissiveIntensity: 1.5 }), sx * 27.25, 5.4, z, false); }
      for (let i = 0; i < 6; i++) walker(g, [[-8 - i, 22], [-2 - i * 0.3, 2], [2 + i * 0.3, 2], [8 + i, 22]]);   // people finding seats
      for (const x of [-27.7, 27.7]) poster(g, ['EXIT'], x, 2.6, 21, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0.8, 0.3, '#8d2f2f');
    },
  };
}

// ---------------------------------------------------------------- food court + presidents gallery (Manwaring)
/** Optional photos: put team-approved images at public/presidents/<slug>.jpg (e.g. alvin-f-meredith-iii.jpg). */
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photos = new Map<string, HTMLImageElement | null>();
function photo(p: { name: string }, onLoad: () => void): HTMLImageElement | null {
  const k = slug(p.name);
  if (!photos.has(k)) {
    photos.set(k, null);
    const img = new Image(); let tried = 0;
    img.onload = () => { photos.set(k, img); onLoad(); };
    img.onerror = () => { if (++tried === 1) img.src = `${import.meta.env.BASE_URL}presidents/${k}.png`; };
    img.src = `${import.meta.env.BASE_URL}presidents/${k}.jpg`;
  }
  return photos.get(k) ?? null;
}
function portraitCanvas(p: typeof PRESIDENTS[number], year: number, img: HTMLImageElement | null) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const g = c.getContext('2d')!;
  g.fillStyle = '#5a3a1a'; g.fillRect(0, 0, 256, 320); g.fillStyle = '#c9a43a'; g.fillRect(10, 10, 236, 300);
  g.fillStyle = '#efe7d6'; g.fillRect(22, 22, 212, 276);
  if (img) {                                                                             // photo, cropped to fill the portrait area
    const W = 196, H = 200, r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
    g.save(); g.beginPath(); g.rect(30, 30, W, H); g.clip(); g.drawImage(img, 30 + (W - w) / 2, 30 + (H - h) / 2, w, h); g.restore();
  } else {
    g.fillStyle = '#9a9286'; g.beginPath(); g.arc(128, 105, 42, 0, Math.PI * 2); g.fill();  // generic silhouette until a photo is added
    g.beginPath(); g.ellipse(128, 215, 70, 55, 0, Math.PI, 0); g.fill(); g.fillRect(58, 214, 140, 18);
  }
  g.fillStyle = '#2a211b'; g.textAlign = 'center'; g.font = 'bold 19px Georgia';
  const words = p.name.split(' '); const l1 = words.slice(0, Math.ceil(words.length / 2)).join(' '), l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
  g.fillText(l1, 128, 252); g.fillText(l2, 128, 272);
  g.font = '14px system-ui'; g.fillStyle = '#5a3a1a';
  // real-world terms always; the current president (today) is marked, and so is whoever led the school in this era
  g.fillText(`${p.title} · ${p.to === null ? `${p.from}–present` : `${p.from}–${p.to}`}`, 128, 292);
  const thenServing = p.from <= year && (p.to === null || p.to > year) && year < 2023;
  if (p.to === null || thenServing) { g.fillStyle = '#8d3b2f'; g.font = 'bold 12px system-ui'; g.fillText(p.to === null ? 'CURRENT PRESIDENT' : `PRESIDENT IN ${Math.floor(year)}`, 128, 44); }
  return c;
}
function foodcourt(): CampusLayout {
  const props: Rect[] = [], tables: [number, number][] = [];
  for (const [a, b] of [[-20, -11], [-8, 1], [4, 13], [16, 22]] as [number, number][]) props.push({ x0: a, z0: -16.4, x1: b, z1: -15.2, h: 1.05, color: '#8a5a3a' });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = -12 + i * 8, z = -7 + j * 6; tables.push([x, z]); props.push({ x0: x - 0.7, z0: z - 0.7, x1: x + 0.7, z1: z + 0.7, h: 0.75, color: '#c9b48a' }); }
  let frames: { mesh: THREE.Mesh; p: typeof PRESIDENTS[number] }[] = [];
  let title: THREE.Mesh | null = null;
  let store: THREE.Mesh | null = null, welcome: THREE.Mesh | null = null;
  return {
    floor: '#dad6ce', wall: '#ebe8e2', floorStyle: 'mcTile', props, height: 7.6,
    signs: [{ text: ['The Crossroads'], x: 0, z: 17.6, ry: Math.PI }],
    decorate: g => {
      seed = 7;
      // the Crossroads: blue carpet under the tables, a two-storey hall with a balcony, wood-slat bands up high, globe lights
      floorZone(g, 0, 2, 34, 24, 'carpet', '#2f3e6b');
      balcony(g, 50, 36, 3.9, 2.6, '#f2f0ec');
      for (const x of [-17, -6, 6, 17]) column(g, x, -15.4 + 2.6, 3.9, 0.3, '#f2f0ec');
      for (const [x, z, w, d] of [[0, -17.95, 50, 0.1], [-24.95, 0, 0.1, 36], [24.95, 0, 0.1, 36]] as [number, number, number, number][]) for (let k = 0; k < 6; k++) box(g, w || 0.1, 0.12, d || 0.1, '#a8774a', x, 6.3 + k * 0.2, z, false);
      for (let x = -12; x <= 12; x += 8) for (const z of [-4, 4, 12]) globeLight(g, x, z, 4.6, 7.6, 0.42);
      // the University Store (Bookstore before the name change) along the east wall, the Welcome Center by the south doors
      box(g, 0.3, 3.4, 9.4, '#2a2d31', 24.8, 1.7, 10); const gl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.7, 8.6), glassMat()); gl.position.set(24.62, 1.45, 10); g.add(gl);
      for (let k = 0; k < 4; k++) box(g, 0.4, 1.6, 1.6, ['#f4f1e8', '#3d6fa8', '#c0392b', '#e6c33a'][k], 24.55, 0.8, 6.6 + k * 2.2);
      store = plaque(g, ['BOOKSTORE'], 24.6, 3.25, 10, -Math.PI / 2, 5, '#1f2a3a');
      screen(g, 24.5, 2.1, 4.4, -Math.PI / 2, 1.2, ['New semester', 'textbooks'], '#1f4e8c'); screen(g, 24.5, 2.1, 15.6, -Math.PI / 2, 1.2, ['Spirit wear', '20% off'], '#7a2b2b');
      box(g, 4.2, 1.05, 0.9, '#7b5a3e', 14, 0.52, 15.6); solid(g, { x0: 11.9, x1: 16.1, z0: 15.15, z1: 16.05 });
      // stairs down to the Strike Zone (lower level) in the south-west corner
      box(g, 3.2, 0.02, 3.4, '#1c1c1e', -22.4, 0.015, 13.6, false); glassRail(g, -20.8, 11.9, -20.8, 15.3, 0); glassRail(g, -24, 11.9, -20.8, 11.9, 0);
      for (let k = 0; k < 5; k++) box(g, 3.0, 0.02, 0.5, k % 2 ? '#c9c4ba' : '#b9b4aa', -22.4, 0.02, 12.3 + k * 0.6, false);
      poster(g, ['↓ STRIKE ZONE', 'bowling · arcade · grill'], -24.94, 2.6, 13.6, Math.PI / 2, 2.6, 0.9, '#5a2f9e');
      welcome = plaque(g, ['Information'], 14, 2.3, 16.1, Math.PI, 3, '#2d3a46'); standing(g, 14, 16.6, Math.PI, eraLook('byui', 515));
      const stalls: [string, number][] = [['Grill', -15.5], ['Pizza', -3.5], ['Deli & Salads', 8.5], ['Smoothies', 19]];
      for (const [nm, x] of stalls) {
        plaque(g, [nm], x, 3.0, -17.4, 0, 4, '#8d3b2f');
        standing(g, x - 1.2, -16.9, 0, { shirt: '#b8423a', pants: '#2b2f3a', hair: '#2a1d14', skin: ['#e0b48f', '#c68c64', '#f0c9a4'][(rnd() * 3) | 0], hat: 'cap', hatColor: '#b8423a' }, 'talker', [[x - 2, -16.9], [x + 0.6, -16.9]]);
        for (let k = 0; k < 2; k++) if (rnd() < 0.7) standing(g, x + (k - 0.5) * 1.1, -13.8 - k * 0.9, Math.PI);   // customers in line
        box(g, 1.4, 0.5, 0.4, '#f0e6d0', x + 1, 1.3, -15.8);                                                   // food display
      }
      for (const [x, z] of tables) {
        const seats: [number, number, number][] = [[x, z - 1.05, 0], [x, z + 1.05, Math.PI], [x - 1.05, z, Math.PI / 2], [x + 1.05, z, -Math.PI / 2]];
        for (const [sx, sz] of seats) box(g, 0.45, 0.45, 0.45, '#5a6a7a', sx, 0.22, sz);
        if (rnd() < 0.6) for (const [sx, sz, yaw] of seats) if (rnd() < 0.6) seated(g, sx, sz, yaw);
        box(g, 0.3, 0.05, 0.3, '#ffffff', x + 0.2, 0.78, z);                                                  // a tray
      }
      for (let i = 0; i < 8; i++) {                                                                       // trays from the counters to a table
        const sx = stalls[i % 4][1], [tx, tz] = tables[(i * 5) % tables.length];
        walker(g, [[sx, -13], [tx + 1.6, tz + 1.6], [tx + 1.6, 16], [sx + 2, -12.5]]);
      }
      // menu boards over the counters, vending machines and a recycling station on the east wall, plants, lights
      const menus: Record<string, string[]> = { Grill: ['Burger · Fries', 'Grilled cheese'], Pizza: ['Pepperoni slice', 'Cheese · Veggie'], 'Deli & Salads': ['Turkey club', 'Garden salad'], Smoothies: ['Berry blast', 'Mango crush'] };
      for (const [nm, x] of stalls) screen(g, x + 2.2, 2.1, -17.92, 0, 1.4, menus[nm], '#2a2a2a');
      vending(g, 24.4, -8, -Math.PI / 2, '#b8423a'); vending(g, 24.4, -6.6, -Math.PI / 2, '#2f4f7f');
      for (const [i, c] of (['#2f4f7f', '#3f6f4a', '#7a7a7a'] as string[]).entries()) trash(g, 24.5, 3 + i * 0.6, c);
      poster(g, ['RECYCLE'], 24.97, 1.4, 3.6, -Math.PI / 2, 1.4, 0.4, '#3f6f4a');
      for (const [x, z] of [[-23.6, -16.6], [23.6, -16.6], [-23.6, 16.4], [23.6, 16.4], [-16, 16.6], [16, 16.6]]) plant(g, x, z, 1.1);
      // presidents gallery along the west wall
      title = plaque(g, ['Presidents of Ricks College'], -24.6, 3.3, 0, Math.PI / 2, 6, '#2a211b');
      frames = PRESIDENTS.map((p, i) => {
        const tex = new THREE.CanvasTexture(portraitCanvas(p, 1999, null)); tex.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshBasicMaterial({ map: tex }));
        mesh.position.set(-24.62, i % 2 ? 1.4 : 2.75, -14 + Math.floor(i / 2) * 3.1 + (i % 2) * 1.55); mesh.rotation.y = Math.PI / 2; g.add(mesh);
        return { mesh, p };
      });
    },
    onEra: era => {
      const year = ERAS[era].year;
      for (const f of frames) {
        f.mesh.visible = true;                                   // the whole line, through today's president
        const paint = () => { const m = f.mesh.material as THREE.MeshBasicMaterial; (m.map as THREE.CanvasTexture).image = portraitCanvas(f.p, year, photos.get(slug(f.p.name)) ?? null); m.map!.needsUpdate = true; };
        photo(f.p, paint); paint();
      }
      const byui = ERAS[era].institution === 'byui';
      const t = byui ? 'Presidents of Ricks College and BYU–Idaho' : 'Presidents of Ricks College';
      const relabel = (m: THREE.Mesh | null, text: string, bg: string) => { if (!m) return; const mt = m.material as THREE.MeshBasicMaterial; mt.map?.dispose(); mt.map = new THREE.CanvasTexture(textCanvas([text], { w: 512, h: 128, bg })); mt.map.colorSpace = THREE.SRGBColorSpace; mt.needsUpdate = true; };
      relabel(store, byui ? 'UNIVERSITY STORE' : 'BOOKSTORE', '#1f2a3a'); relabel(welcome, byui ? 'Welcome Center' : 'Information', '#2d3a46');
      if (title) { const m = title.material as THREE.MeshBasicMaterial; m.map = new THREE.CanvasTexture(textCanvas([t], { w: 512, h: 128, bg: '#2a211b' })); m.map.colorSpace = THREE.SRGBColorSpace; m.needsUpdate = true; }
    },
  };
}

// ---------------------------------------------------------------- offices (Hinckley)
function offices(): CampusLayout {
  const W = 64, names = ['Cashier', 'Human Resources', 'Parking Services', 'Admissions', 'Financial Aid', 'Student Records & Registration', 'Academic Advising', 'Student Employment', 'Scholarships', 'International Services', 'Veterans Services', 'Housing', 'Accessibility Services', 'Career Services'];
  const units: { x: number; side: 'n' | 's'; name: string }[] = [];
  let k = 0;
  for (let x = -W / 2 + 4; x < W / 2; x += 8) { units.push({ x, side: 'n', name: names[k++ % names.length] }); if (Math.abs(x) > 4) units.push({ x, side: 's', name: names[k++ % names.length] }); }
  const walls: Rect[] = [
    ...wallX(-W / 2, W / 2, -2, units.filter(u => u.side === 'n').map(u => [u.x - 0.7, u.x + 0.7] as [number, number])),
    ...wallX(-W / 2, -2, 2, units.filter(u => u.side === 's' && u.x < 0).map(u => [u.x - 0.7, u.x + 0.7] as [number, number])),
    ...wallX(2, W / 2, 2, units.filter(u => u.side === 's' && u.x > 0).map(u => [u.x - 0.7, u.x + 0.7] as [number, number])),
  ];
  for (let x = -W / 2 + 8; x < W / 2; x += 8) { walls.push(wallZ(-7, -2.15, x)); if (Math.abs(x) > 2.5) walls.push(wallZ(2.15, 7, x)); }
  walls.push(wallZ(2.15, 7, -2), wallZ(2.15, 7, 2));
  const props: Rect[] = units.map(u => ({ x0: u.x - 1.4, z0: u.side === 'n' ? -5.6 : 4.2, x1: u.x + 1.4, z1: u.side === 'n' ? -4.8 : 5.0, h: 1.05, color: '#7b5a3e' }));
  return {
    floor: '#b3a894', wall: '#ece6da', floorStyle: 'tile', walls, props,
    signs: [{ text: ['Student services', '(layout is an approximation)'], x: 0, z: 1.8, ry: Math.PI },
      ...units.map(u => ({ text: [u.name], x: u.x, z: u.side === 'n' ? -1.8 : 1.8, ry: u.side === 'n' ? Math.PI : 0 }))],
    decorate: g => {
      seed = 55;
      for (const u of units) if (rnd() < 0.75) standing(g, u.x, u.side === 'n' ? -6.2 : 5.6, u.side === 'n' ? 0 : Math.PI, eraLook('byui', (rnd() * 1e6) | 0));
      // each office: a computer on the counter, waiting chairs, a plant, a "now serving" display
      for (const u of units) {
        const n = u.side === 'n', cz = n ? -5.2 : 4.6;
        computer(g, u.x + 0.7, 1.05, cz, n ? 0 : Math.PI); box(g, 0.25, 0.04, 0.3, '#f4f1e8', u.x - 0.6, 1.07, cz, false);
        for (const dx of [-0.8, 0.8]) box(g, 0.5, 0.45, 0.5, '#3f5a6b', u.x + dx, 0.22, n ? -3.6 : 3.0);
        plant(g, u.x + 3.3, n ? -6.4 : 6.4, 0.8);
        screen(g, u.x - 2.6, 2.3, n ? -2.17 : 2.17, n ? Math.PI : 0, 0.8, [`Now serving`, `${10 + ((rnd() * 80) | 0)}`], '#1f4e8c');
      }
      for (let x = -28; x <= 28; x += 8) pendant(g, x, 0, 3.0);
      plant(g, -31.4, 1.3); plant(g, 31.4, 1.3); waterCooler(g, -31.4, -1.2);
      for (const sx of [-1, 1]) { painting(g, sx * 24, 2.0, -1.84, 0, 1.6, 1.0, sx > 0 ? 2 : 1); painting(g, sx * 16, 2.0, 1.84, Math.PI, 1.6, 1.0, sx > 0 ? 3 : 4); }   // on the walls between office doors
      for (let i = 0; i < 7; i++) { const zz = -0.8 + (i % 3) * 0.8, a0 = -28 + rnd() * 10, b0 = 18 + rnd() * 10; walker(g, i % 2 ? [[a0, zz], [b0, zz]] : [[b0, zz], [a0, zz]]); }   // people in the hall
    },
  };
}

// ---------------------------------------------------------------- library (McKay)
function library(): CampusLayout {
  // Photos: grey patterned carpet, square white columns, round white tables with black chairs, grey booth
  // sofas, low bookshelves around the edges and the stacks further in, a band of windows, plants.
  const props: Rect[] = [];
  for (let r = 0; r < 4; r++) for (const side of [-1, 1]) props.push({ x0: side > 0 ? 5 : -19, z0: -13.6 + r * 2.4, x1: side > 0 ? 19 : -5, z1: -13.1 + r * 2.4, h: 2.2, color: '#4a4f55' });   // the stacks (metal shelving)
  for (let r = 0; r < 4; r++) props.push({ x0: -3.4, z0: -13.6 + r * 2.4, x1: 3.4, z1: -13.1 + r * 2.4, h: 2.2, color: '#4a4f55' });
  const rounds: [number, number][] = []; for (const x of [-7, 7, 14]) for (const z of [1, 8]) rounds.push([x, z]);
  for (const z of [3, 7.5]) props.push({ x0: -17.5, z0: z - 0.5, x1: -12.5, z1: z + 0.5, h: 0.75, color: '#d8d4cc' });   // tutoring tables
  return {
    floor: '#80838a', wall: '#efede9', floorStyle: 'patternCarpet', props, signs: [{ text: ['Library — quiet study'], x: 0, z: 13.6, ry: Math.PI }],
    decorate: g => {
      seed = 21;
      // books on the stacks
      const covers = ['#7a2b2b', '#2f4f7f', '#3f6f4a', '#c9a43a', '#5a3a5a', '#e8e2d6', '#8a5a3a'];
      const books = (x0: number, x1: number, zc: number) => { for (let x = x0; x < x1; x += 0.42) for (let k = 0; k < 4; k++) for (const face of [-0.31, 0.31]) box(g, 0.38, 0.36, 0.1, covers[(rnd() * 7) | 0], x, 0.3 + k * 0.5, zc + face, false); };
      for (let r = 0; r < 4; r++) { const zc = -13.35 + r * 2.4; books(-18.8, -5.2, zc); books(5.3, 18.8, zc); books(-3.2, 3.2, zc); poster(g, [`${['000–299', '300–599', '600–899', '900–999'][r]}`], -4.95, 2.45, zc, Math.PI / 2, 0.8, 0.3, '#2d3a46'); }
      for (let i = 0; i < 5; i++) { const z = -12.15 + (i % 4) * 2.4; walker(g, [[-18, z], [-4, z], [4.3, z], [18, z]]); }   // browsing the stacks
      // the Tutoring Center: tables with tutors and students, a whiteboard and a sign
      poster(g, ['TUTORING CENTER'], -20.95, 3.0, 5.2, Math.PI / 2, 4, 0.7, '#1f4e8c');
      box(g, 0.05, 1.3, 3.2, '#f8f8f6', -20.94, 1.7, 5.2, false); poster(g, ['x² + 2x = 8', 'x = 2 or x = −4'], -20.9, 1.7, 5.2, Math.PI / 2, 3, 1.1, '#f8f8f6', '#1f4e8c');
      for (const z of [3, 7.5]) { for (const dx of [-1.5, 0, 1.5]) box(g, 0.32, 0.05, 0.24, covers[(rnd() * 7) | 0], -15 + dx, 0.78, z, false);
        standing(g, -15.8, z - 1.0, 0, eraLook('byui', z * 31 | 0), 'talker', [[-16.2, z - 1.0], [-15.4, z - 1.0]]); seated(g, -14, z + 1.0, Math.PI); seated(g, -16, z + 1.0, Math.PI); }
      // square white columns on a grid
      for (const x of [-10.5, 0, 10.5]) for (const z of [-4.5, 4.5]) { box(g, 0.8, 3.6, 0.8, '#f4f2ee', x, 1.8, z); solid(g, { x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45 }); }
      // round white tables with black chairs
      for (const [x, z] of rounds) {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 20), mat('#f4f4f2')); top.position.set(x, 0.74, z); g.add(top);
        box(g, 0.1, 0.72, 0.1, '#2a2a2a', x, 0.36, z); solid(g, { x0: x - 0.75, x1: x + 0.75, z0: z - 0.75, z1: z + 0.75 });
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, cx = x + Math.sin(a) * 1.15, cz = z + Math.cos(a) * 1.15; box(g, 0.45, 0.45, 0.45, '#1f1f22', cx, 0.22, cz); box(g, 0.45, 0.5, 0.06, '#1f1f22', cx + Math.sin(a) * 0.2, 0.7, cz + Math.cos(a) * 0.2); if (rnd() < 0.4) seated(g, cx, cz, a + Math.PI); }
        box(g, 0.3, 0.05, 0.22, ['#8d2f2f', '#2f5f9e', '#3f6f4a'][(rnd() * 3) | 0], x + 0.2, 0.78, z, false);
      }
      // grey booth sofas facing each other in the middle
      for (const x of [-3.2, 3.2]) { sofa(g, x, -0.6, 0, '#6e7073', 2.4); sofa(g, x, 2.6, Math.PI, '#6e7073', 2.4); box(g, 1.2, 0.5, 0.8, '#d8d4cc', x, 0.25, 1.0); solid(g, { x0: x - 0.6, x1: x + 0.6, z0: 0.6, z1: 1.4 }); if (rnd() < 0.7) seated(g, x - 0.5, -0.5, 0); }
      // low bookshelves along the side walls, under the windows
      for (const z of [-2, 3, 8]) { bookcase(g, -20.6, z, 3.4, Math.PI / 2, (z * 7) | 0); bookcase(g, 20.6, z, 3.4, -Math.PI / 2, (z * 5) | 0); }
      // help desk with a librarian; computers; plants; a globe; a quiet sign and a clock
      box(g, 4, 1.05, 0.9, '#d8d4cc', -14, 0.52, 12.4); solid(g, { x0: -16, x1: -12, z0: 11.95, z1: 12.85 });
      computer(g, -15, 1.05, 12.4, Math.PI); computer(g, -13.2, 1.05, 12.4, Math.PI); poster(g, ['Help desk'], -14, 2.2, 12.9, 0, 1.4, 0.4, '#2d3a46');
      standing(g, -14, 11.5, 0, eraLook('byui', 4242));
      for (let x = 8; x <= 17; x += 1.8) { box(g, 1.4, 0.75, 0.8, '#d8d4cc', x, 0.37, 12.6); solid(g, { x0: x - 0.7, x1: x + 0.7, z0: 12.2, z1: 13 }); computer(g, x, 0.75, 12.6, Math.PI); if (rnd() < 0.5) seated(g, x, 11.7, Math.PI); }
      globe(g, -19.6, 12.6); for (const [x, z] of [[-20, -15], [20, -15], [-5.6, 12.8], [5.6, 12.8], [-10.5, 0.2], [10.5, 0.2]]) plant(g, x, z, 1.1);
      poster(g, ['Quiet please'], -20.97, 2.6, -9, Math.PI / 2, 1.4, 0.45, '#3f6f4a'); clock(g, 20.97, 3.0, -9, -Math.PI / 2);
      for (let x = -15; x <= 15; x += 7.5) for (const z of [1, 9]) pendant(g, x, z, 3.2);
    },
  };
}
// ---------------------------------------------------------------- gym (Hart)
/** Hart gym spots (room-local): the hoops, the shooting spots for the minigame, the free treadmill. */
export const HART = {
  hoopX: -13, hoopY: 3.05, hoopZ: 12.55,
  shots: [{ x: -13, z: 8.4, pts: 2, name: 'free throw' }, { x: -16.8, z: 9.6, pts: 2, name: 'left elbow' }, { x: -9.2, z: 9.6, pts: 2, name: 'right elbow' },
    { x: -19.6, z: 12, pts: 3, name: 'left corner three' }, { x: -6.4, z: 12, pts: 3, name: 'right corner three' }, { x: -13, z: 5.8, pts: 3, name: 'top of the key' }],
  treadmill: { x: 4, z: -7.6 }, treadmillStand: { x: 4, z: -5.8 },
  bench: { x: 14.5, z: 10.5 }, benchStand: { x: 15.6, z: 10.5 },
};
/** Four students playing pick-up on the north half court: they dribble, pass and shoot at the north hoop. */
function pickupGame(g: THREE.Object3D) {
  const looks = [0, 1, 2, 3].map(i => ({ ...eraLook('presentFinale', 4400 + i), shirt: i < 2 ? '#7a2b2b' : '#f4f1e8', shorts: true, hat: 'none' as const }));
  const P = looks.map((l, i) => { const a = new Avatar(l); a.root.position.set(-16 + i * 2, 0, -6); g.add(a.root); return { a, x: -16 + i * 2, z: -6, tx: -13, tz: -6, yaw: 0, sp: 0 }; });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat('#d9662a')); g.add(ball);
  const hoop = new THREE.Vector3(HART.hoopX, HART.hoopY, -HART.hoopZ);
  let holder = 0, flight: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; h: number; shot: boolean; make: boolean; next: number } | null = null, hold = 1.5, drop = 0;
  const newSpot = (p: (typeof P)[number]) => { p.tx = -20 + Math.random() * 14; p.tz = -12 + Math.random() * 10; };
  P.forEach(newSpot);
  ticksOf(g).push((dt, t) => {
    for (const [i, p] of P.entries()) {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3 || Math.random() < dt * 0.15) newSpot(p);
      const v = i === holder && !flight ? 2.2 : 3.2, st = Math.min(d, v * dt);
      if (d > 0.3) { p.x += dx / d * st; p.z += dz / d * st; }
      const look = flight ? Math.atan2(flight.to.x - p.x, flight.to.z - p.z) : Math.atan2(P[holder].x - p.x, P[holder].z - p.z);
      const fy = i === holder && !flight ? Math.atan2(dx, dz) : look; let dy = fy - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 6);
      p.a.root.position.set(p.x, 0, p.z); p.a.root.rotation.y = p.yaw; p.a.animate(dt, d > 0.3 ? v : 0);
    }
    if (flight) {
      flight.t += dt; const k = Math.min(1, flight.t / flight.dur);
      ball.position.lerpVectors(flight.from, flight.to, k); ball.position.y += Math.sin(k * Math.PI) * flight.h;
      if (k >= 1) {
        if (flight.shot && flight.make) { drop = 0.6; flight = { from: hoop.clone(), to: new THREE.Vector3(hoop.x, 0.15, hoop.z + 0.3), t: 0, dur: 0.45, h: 0, shot: false, make: false, next: flight.next }; }
        else if (flight.shot) { const out = new THREE.Vector3(hoop.x + (Math.random() - 0.5) * 3, 0.15, hoop.z + 2 + Math.random() * 2); flight = { from: ball.position.clone(), to: out, t: 0, dur: 0.6, h: 1.2, shot: false, make: false, next: flight.next }; }
        else { holder = flight.next; flight = null; hold = 1 + Math.random() * 2; }
      }
      return;
    }
    // dribbling: the ball bounces beside the holder's right hand
    const h = P[holder], fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    ball.position.set(h.x + fx * 0.35 + fz * 0.3, 0.15 + Math.abs(Math.sin(t * 7)) * 0.75, h.z + fz * 0.35 - fx * 0.3);
    hold -= dt; void drop;
    if (hold > 0) return;
    const near = Math.hypot(h.x - hoop.x, h.z - hoop.z) < 7;
    const next = (holder + 1 + ((Math.random() * 3) | 0)) % 4;
    if (near && Math.random() < 0.5) {                       // shoot!
      const make = Math.random() < 0.55;
      const aim = make ? hoop.clone().add(new THREE.Vector3(0, 0.05, 0)) : hoop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.15, 0.25));
      flight = { from: new THREE.Vector3(h.x, 2.1, h.z), to: aim, t: 0, dur: 1.0, h: 1.6, shot: true, make, next };
      h.a.poseArms(-2.4, -2.4);
    } else {
      const r = P[next]; flight = { from: ball.position.clone().setY(1.2), to: new THREE.Vector3(r.x, 1.2, r.z), t: 0, dur: Math.max(0.35, Math.hypot(r.x - h.x, r.z - h.z) / 9), h: 0.4, shot: false, make: false, next };
    }
  });
}
function gym(): CampusLayout {
  return {
    floor: '#c8955a', wall: '#f2f2f0', floorStyle: 'court', height: 6.5, props: [{ x0: -26, z0: -18, x1: -0.5, z1: -16.8, h: 1.2, color: '#7c2f2f' }], signs: [{ text: ['Hart gym · Fitness center'], x: 0, z: 15.6, ry: Math.PI }],
    decorate: g => {
      seed = 33;
      fitness(g);
      for (const s2 of [-1, 1]) {
        box(g, 0.15, 3.2, 0.15, '#3a3f45', -13, 1.6, s2 * 13.2); box(g, 1.8, 1.05, 0.08, '#f4f4ee', -13, 3.35, s2 * 13.05); box(g, 0.6, 0.45, 0.09, '#c0392b', -13, 3.25, s2 * 13.05);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20), mat('#e8622a')); rim.rotation.x = Math.PI / 2; rim.position.set(HART.hoopX, HART.hoopY, s2 * HART.hoopZ); g.add(rim);
        const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.14, 0.4, 12, 1, true), mat('#f4f4f0', { wireframe: true })); net.position.set(HART.hoopX, HART.hoopY - 0.2, s2 * HART.hoopZ); g.add(net);
      }
      pickupGame(g);
      for (let i = 0; i < 3; i++) walker(g, [[-25, -14 + i], [-1, -14 + i], [-1, 14 - i], [-25, 14 - i]]);                // jogging laps around the court
      // stepped bleachers (people sit on the steps), a scoreboard, banners, a ball rack, a water fountain
      for (let k = 0; k < 3; k++) box(g, 25.5, 0.4 * (k + 1), 0.4, k % 2 ? '#8d3b3b' : '#7c2f2f', -13.25, 0.2 * (k + 1), -16.9 - k * 0.4);
      for (let i = 0; i < 5; i++) { const st = seated(g, -24 + i * 5 + rnd(), -17.2 - (i % 2) * 0.4, 0); st.root.position.y = 0.5 + (i % 2) * 0.4; }
      screen(g, -13, 3.4, -17.95, 0, 3.2, ['HOME 42 · GUEST 38'], '#1c1c1c');
      for (const [x, t, c] of [[-27.95, 'INTRAMURALS', '#2f4f7f']] as [number, string, string][]) poster(g, [t], x, 2.6, -4, x < 0 ? Math.PI / 2 : -Math.PI / 2, 3.2, 1, c);
      box(g, 1.6, 0.9, 0.6, '#3a3f45', -25, 0.45, 15); solid(g, { x0: -25.8, x1: -24.2, z0: 14.7, z1: 15.3 });
      for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#d9662a')); b.position.set(-25.6 + i * 0.4, 1.1, 15); g.add(b); }
      fountain(g, -0.4, 15, -Math.PI / 2); clock(g, -13, 3.1, 17.95, Math.PI);
    },
  };
}
/** The Hart fitness center (east half): blue sport floor, white walls with a blue stripe, rows of bikes and
 *  treadmills, weight racks on black rubber mats, big fans up high (from the campus-tour photos). */
function fitness(g: THREE.Object3D) {
  floorZone(g, 14, 0, 28, 36, 'sport', '#2f5fb0');
  box(g, 0.3, 2.2, 30, '#e8e8e6', 0.2, 1.1, -1); solid(g, { x0: 0, x1: 0.4, z0: -16, z1: 14 });            // low divider between the court and the fitness area
  for (const [x, z, w, d] of [[14, -17.95, 28, 0.06], [27.95, 0, 0.06, 36]] as [number, number, number, number][]) { box(g, w || 0.06, 0.25, d || 0.06, '#1f4e8c', x, 2.4, z, false); box(g, w || 0.06, 0.08, d || 0.06, '#1f4e8c', x, 2.7, z, false); }
  poster(g, ['FITNESS CENTER'], 27.94, 3.6, -6, -Math.PI / 2, 4, 0.9, '#1f4e8c');
  // rows of exercise bikes and treadmills, people working out on some
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
    const x = 4 + i * 2.6, z = -14 + r * 3.2, bike = r < 2;
    if (bike) { box(g, 0.35, 0.6, 1.2, '#2a2d31', x, 0.3, z); box(g, 0.1, 0.9, 0.1, '#9aa3a8', x, 0.9, z - 0.45); box(g, 0.5, 0.06, 0.1, '#2a2d31', x, 1.35, z - 0.45); box(g, 0.3, 0.08, 0.35, '#1c1c1c', x, 0.95, z + 0.3); }
    else { box(g, 0.9, 0.25, 2.0, '#2a2d31', x, 0.12, z); box(g, 0.8, 0.02, 1.7, '#1c1c1c', x, 0.26, z); box(g, 0.08, 1.2, 0.08, '#9aa3a8', x - 0.38, 0.75, z - 0.8); box(g, 0.08, 1.2, 0.08, '#9aa3a8', x + 0.38, 0.75, z - 0.8); box(g, 0.8, 0.3, 0.1, mat('#3a6ea8', { emissive: '#4f8fd6', emissiveIntensity: 0.5 }), x, 1.35, z - 0.85); }
    solid(g, { x0: x - 0.5, x1: x + 0.5, z0: z - 1.0, z1: z + 1.0 });
    if (!bike && i === 0) continue;                                                          // the player's treadmill (Hart minigame)
    if (rnd() < (bike ? 0.4 : 0.6)) {
      const a = new Avatar({ ...eraLook('presentFinale', (rnd() * 1e6) | 0), shorts: true }); a.root.position.set(x, bike ? 0.25 : 0.26, z + (bike ? 0.15 : 0)); a.root.rotation.y = Math.PI; g.add(a.root);
      if (bike) a.sit(true);
      addActor(g, a, bike ? 'cyclist' : 'runner', x, z, Math.PI, [], bike ? 5 + rnd() * 4 : 4 + rnd() * 5);
    }
  }
  // free weights on black rubber mats: racks, benches, a squat cage, dumbbells
  floorZone(g, 14, 9, 22, 8, 'carpet', '#1c1c1e').position.y = 0.03;   // above the sport floor (same height = flicker)
  for (const x of [6, 12, 18]) { box(g, 1.6, 2.4, 0.12, '#3a3f45', x, 1.2, 6.2); box(g, 0.12, 2.4, 1.4, '#3a3f45', x - 0.8, 1.2, 6.9); box(g, 0.12, 2.4, 1.4, '#3a3f45', x + 0.8, 1.2, 6.9); box(g, 1.9, 0.05, 0.05, '#c9c9c9', x, 1.5, 6.9); solid(g, { x0: x - 0.9, x1: x + 0.9, z0: 6.1, z1: 7.7 }); }
  for (const x of [8.5, 14.5, 20.5]) { box(g, 0.4, 0.45, 1.3, '#1c1c1c', x, 0.22, 10.5); solid(g, { x0: x - 0.25, x1: x + 0.25, z0: 9.8, z1: 11.2 }); }
  box(g, 6, 0.5, 0.6, '#2a2d31', 14, 0.25, 12.9); for (let i = 0; i < 10; i++) box(g, 0.35, 0.18, 0.18, '#1c1c1c', 11.4 + i * 0.58, 0.6, 12.9, false); solid(g, { x0: 11, x1: 17, z0: 12.6, z1: 13.2 });
  for (let i = 0; i < 4; i++) standing(g, 7 + i * 4, 8.6 + (i % 2), rnd() * 6, undefined, 'talker', [[7 + i * 4, 8.6], [7.6 + i * 4, 9.4]]);
  // big ceiling fans up high
  for (const x of [8, 20]) for (const z of [-8, 4]) { box(g, 0.06, 1.5, 0.06, '#2a2a2a', x, 5.75, z, false); for (let k = 0; k < 4; k++) { const bl = box(g, 2.4, 0.04, 0.3, '#3a3f45', x, 5.0, z, false); bl.rotation.y = k * Math.PI / 4; } }
  waterCooler(g, 27.3, 15.5); for (const z of [-16.8, 15.8]) plant(g, 2, z);
}

// ---------------------------------------------------------------- residence hall (dorms)
function residence(name: string): CampusLayout {
  const units: number[] = []; for (let x = -18; x <= 18; x += 6) units.push(x);
  const walls: Rect[] = [...wallX(-21, 21, -2, units.map(x => [x - 0.85, x + 0.85] as [number, number]))];   // 1.7 m doorways (1.2 m was too tight to walk through)
  for (const x of units.slice(0, -1)) walls.push(wallZ(-8, -2.15, x + 3));
  return {
    floor: '#7a6a62', wall: '#ece6da', floorStyle: 'carpet', walls, props: [{ x0: -14, z0: 4, x1: -8, z1: 5.2, h: 0.6, color: '#3f5a6b' }, { x0: 8, z0: 4, x1: 14, z1: 5.2, h: 0.6, color: '#3f5a6b' }],
    signs: [{ text: [name], x: 0, z: 8.6, ry: Math.PI }, ...units.map((x, i) => ({ text: [`Apt ${101 + i}`], x, z: -1.8, ry: Math.PI }))],
    decorate: g => {
      seed = name.length * 13;
      for (const x of units) { box(g, 1.6, 0.6, 2.2, '#5a6a8a', x - 1.2, 0.3, -6.6); box(g, 0.8, 0.75, 0.6, '#8a6d4b', x + 1.6, 0.37, -7.2); }   // bed + desk in each room
      for (const x of [-11, 11]) for (const dx of [-2, 0, 2]) if (rnd() < 0.6) seated(g, x + dx, 5.7, Math.PI);               // lounge sofas
      for (let i = 0; i < 4; i++) walker(g, [[-19, -0.5 + i * 0.4], [19, -0.5 + i * 0.4]]);
      standing(g, 0, 3, Math.PI, undefined, 'talker', [[-1, 3], [1, 3]]);
      // each room: a rug, a desk lamp, a poster; the lounge: TVs, coffee tables, a pool table, mailboxes, plants
      units.forEach((x, i) => {
        rug(g, x, -4.6, 2.2, 1.6, ['#a8573d', '#3f6aa0', '#6b8f4a', '#8a5a8a'][i % 4]);
        deskLamp(g, x + 1.6, 0.75, -7.3);
        poster(g, [['GO VIKINGS', 'HOME', 'DREAM BIG', 'SKI IDAHO', 'BAND NIGHT', 'FAMILY', 'STUDY!'][i % 7]], x - 1.2, 2.0, -8.97, 0, 1.0, 0.7, ['#7a2b2b', '#2f4f7f', '#3f6f4a', '#5a3a6b'][i % 4]);
        box(g, 0.5, 1.6, 0.5, '#7a5536', x + 2.4, 0.8, -3.0);                               // dresser
      });
      for (const x of [-11, 11]) { screen(g, x, 1.3, 2.4, 0, 1.6); box(g, 1.4, 0.5, 0.4, '#3b3330', x, 0.25, 2.45); coffeeTable(g, x, 3.2); }
      box(g, 2.4, 0.8, 1.3, '#4a3020', 17.5, 0.4, 6.2); box(g, 2.2, 0.05, 1.1, '#2f6f3f', 17.5, 0.82, 6.2); solid(g, { x0: 16.3, x1: 18.7, z0: 5.55, z1: 6.85 });
      for (const [bx, bz, c] of [[17, 6, '#f4f1e8'], [17.6, 6.3, '#c0392b'], [18, 6.1, '#e6c33a']] as [number, number, string][]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(c)); b.position.set(bx, 0.9, bz); g.add(b); }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) box(g, 0.3, 0.25, 0.04, '#b8a24a', -21.95 + 0.02, 1.0 + r * 0.3, 3.2 + c * 0.34, false);
      poster(g, ['Mail'], -21.95, 2.0, 4.05, Math.PI / 2, 1.0, 0.35, '#2d3a46');
      bulletin(g, 21.95, 1.6, 5.5, -Math.PI / 2, 2.2);
      plant(g, -20.8, 8.3); plant(g, 20.8, 8.3); plant(g, -4, 8.3, 0.8); plant(g, 4, 8.3, 0.8);
    },
  };
}


// ---------------------------------------------------------------- chapel & foyer (Taylor)
function chapel(): CampusLayout {
  // Photos: a quiet foyer of cream brick with charcoal carpet, blue upholstered benches, paintings and a glass
  // curtain wall; wooden double doors lead into the chapel (pews, the stand, organ pipes).
  const walls: Rect[] = [...wallX(-20, 20, 2, [[-2.2, 2.2]], 2.9)], props: Rect[] = [];   // a low wall so the camera can see into the chapel
  for (let z = -7; z <= 0; z += 1.3) for (const [a, b] of [[-11, -1.6], [1.6, 11]] as [number, number][]) props.push({ x0: a, z0: z - 0.25, x1: b, z1: z + 0.25, h: 0.48, color: '#7a5032' });
  props.push({ x0: -12, z0: -16, x1: 12, z1: -11, h: 0.6, color: '#8a5a36' });                                       // the stand
  return {
    floor: '#3a3b3f', wall: '#ece2cb', floorStyle: 'carpet', walls, props, height: 6,
    signs: [{ text: ['Taylor Chapel'], x: 0, z: 2.25, ry: 0, y: 2.5, sx: 0.6, sy: 0.6 }],
    decorate: g => {
      seed = 61;
      floorZone(g, 0, -7, 40, 18, 'carpet', '#4a5a72');
      // brick coursing on the walls (cream brick like the photos)
      for (let y = 0.3; y < 6; y += 0.3) { box(g, 40, 0.015, 0.02, '#d6c9ac', 0, y, -15.98, false); for (const sx of [-1, 1]) box(g, 0.02, 0.015, 32, '#d6c9ac', sx * 19.98, y, 0, false); }
      // wooden double doors (open) into the chapel
      for (const sx of [-1, 1]) { const d = box(g, 1.1, 2.6, 0.08, '#b88a5a', sx * 2.7, 1.3, 2.6); d.rotation.y = sx * 0.9; }
      box(g, 4.6, 0.3, 0.4, '#9a6b44', 0, 2.75, 2);
      // pews: backs, blue cushions, hymn books; people sitting quietly
      for (let z = -7; z <= 0; z += 1.3) for (const [a, b] of [[-11, -1.6], [1.6, 11]] as [number, number][]) {
        const cx = (a + b) / 2, w = b - a;
        box(g, w, 0.7, 0.08, '#7a5032', cx, 0.8, z + 0.25); box(g, w - 0.1, 0.06, 0.4, '#3f5f8a', cx, 0.5, z);
        for (let x = a + 0.5; x < b - 0.3; x += 1.8) box(g, 0.16, 0.22, 0.12, '#2f4f2f', x, 0.75, z + 0.33, false);
        for (let x = a + 0.6; x < b - 0.3; x += 0.7) if (rnd() < 0.12) seated(g, x, z - 0.05, Math.PI);
      }
      // the stand: pulpit, sacrament table, choir seats, organ console and pipes
      const S = new THREE.Group(); S.position.y = 0.6; g.add(S);
      box(S, 1.2, 1.2, 0.8, '#6b4528', 0, 0.6, -11.8); box(S, 1.3, 0.06, 0.9, '#4a3020', 0, 1.22, -11.8);
      box(S, 4, 0.8, 0.9, '#f4f2ee', 0, 0.4, -10.2 + 0.3); box(S, 4.1, 0.05, 1.0, '#ffffff', 0, 0.82, -9.9);
      for (let r = 0; r < 3; r++) for (let x = -9; x <= 9; x += 0.7) box(S, 0.5, 0.45, 0.5, '#3f5f8a', x, 0.22 + r * 0.3, -13.2 - r * 0.8);
      for (let i = 0; i < 24; i++) box(g, 0.32, 2.5 + Math.abs(Math.sin(i * 0.5)) * 1.8, 0.32, '#c9a43a', -8 + i * 0.7, 3.6, -15.6);
      box(S, 1.6, 1.1, 0.9, '#4a3020', -8, 0.55, -12); standing(g, -8, -11.2, Math.PI).root.position.y = 0.6;   // organist
      for (const x of [-4, 4]) plant(S, x, -10.6, 1);
      box(S, 1.5, 0.3, 2.0, '#111111', 8, 0.85, -12); box(S, 1.5, 0.04, 1.6, '#111111', 8, 1.3, -12.4).rotation.x = -0.55; box(S, 1.3, 0.05, 0.2, '#f4f4f0', 8, 0.95, -11.05); for (const [lx, lz] of [[7.4, -11.2], [8.6, -11.2], [8, -12.8]]) box(S, 0.1, 0.7, 0.1, '#111111', lx, 0.35, lz);
      // the foyer: blue benches, paintings, a planter, an easel with a notice
      for (const [x, z, ry] of [[-17, 6, Math.PI / 2], [-17, 11, Math.PI / 2], [17, 6, -Math.PI / 2], [17, 11, -Math.PI / 2], [-8, 15.2, Math.PI], [8, 15.2, Math.PI]] as [number, number, number][]) {
        const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; g.add(grp);
        box(grp, 2.2, 0.12, 0.6, '#3f5f9e', 0, 0.45, 0); for (const sx of [-1, 1]) box(grp, 0.06, 0.4, 0.5, '#c9a87a', sx * 1, 0.2, 0);
        const c = Math.abs(Math.cos(ry)) > 0.5; solid(g, { x0: x - (c ? 1.1 : 0.3), x1: x + (c ? 1.1 : 0.3), z0: z - (c ? 0.3 : 1.1), z1: z + (c ? 0.3 : 1.1) });
        if (rnd() < 0.4) seated(g, x, z, ry + Math.PI);
      }
      for (const [x, z, ry, k] of [[-8, 2.25, 0, 1], [8, 2.25, 0, 2], [-19.95, 8.5, Math.PI / 2, 3], [19.95, 8.5, -Math.PI / 2, 4]] as [number, number, number, number][]) painting(g, x, 1.75, z + (ry ? 0 : 0.17), ry, 1.2, 1.4, k);
      box(g, 2.4, 0.5, 0.9, '#efeae0', 0, 0.25, 8); solid(g, { x0: -1.2, x1: 1.2, z0: 7.55, z1: 8.45 }); for (let i = 0; i < 6; i++) box(g, 0.4, 0.4, 0.4, '#3f7a3a', -1 + i * 0.4, 0.7, 8 + (i % 2) * 0.2 - 0.1);
      for (let x = -12; x <= 12; x += 6) for (const z of [6, 12]) pendant(g, x, z, 3.4, 6);
      for (let x = -12; x <= 12; x += 6) for (const z of [-12, -6, 0]) pendant(g, x, z, 4.4, 6);
      walker(g, [[-10, 13], [10, 13], [10, 5], [-10, 5]]);
    },
  };
}

// ---------------------------------------------------------------- concert hall (Snow)
function theater(): CampusLayout {
  // Photos: red seats rising toward the back, black walls and ceiling with spotlights, a light-wood
  // acoustic shell on the stage, tables and a pulpit, a catwalk along the sides.
  const props: Rect[] = [{ x0: -15, z0: -18, x1: 15, z1: -10, h: 1.0, color: '#3a2f28' }], blockers: Rect[] = [];
  const rows: number[] = []; for (let z = -6; z <= 13; z += 1.15) rows.push(z);
  for (const z of rows) for (const [a, b] of [[-16, -1.4], [1.4, 16]] as [number, number][]) blockers.push({ x0: a, z0: z - 0.35, x1: b, z1: z + 0.35 });
  return {
    floor: '#2c2a2e', wall: '#2e2d32', floorStyle: 'carpet', windows: false, props, blockers, height: 7,
    signs: [{ text: ['Concert Hall'], x: 0, z: 17.6, ry: Math.PI }],
    decorate: g => {
      seed = 71;
      floorZone(g, 0, -14, 30, 8, 'wood', '#b78a5a').position.y = 1.012;                       // stage floor
      for (let x = -14; x <= 14; x += 2) { const p = box(g, 1.9, 6, 0.2, x % 4 ? '#c8a57a' : '#d6b68a', x, 4, -17.6); p.rotation.y = (x / 14) * 0.25; }   // acoustic shell
      for (let i = 0; i < 20; i++) box(g, 0.3, 2 + Math.abs(Math.sin(i * 0.6)) * 2.2, 0.3, '#c9a43a', -6.5 + i * 0.7, 5.6, -17.2);          // organ
      box(g, 4, 0.75, 1.0, '#6b4a30', -4, 1.37, -12.5); box(g, 4, 0.75, 1.0, '#6b4a30', 4, 1.37, -12.5); box(g, 0.9, 1.2, 0.7, '#4a3020', 0, 1.6, -11);
      for (const x of [-5, -3.5, -2, 2, 3.5, 5]) box(g, 0.45, 0.45, 0.45, '#1c1c1c', x, 1.22, -13.3);
      box(g, 1.6, 0.3, 2.2, '#111111', 9, 1.75, -14); box(g, 1.6, 0.04, 1.6, '#111111', 9, 2.2, -14.6).rotation.x = -0.5;                         // grand piano
      // seats rising toward the back on low risers
      rows.forEach((z, i) => {
        const y = i * 0.07;
        for (const [a, b] of [[-16, -1.4], [1.4, 16]] as [number, number][]) {
          box(g, b - a, y + 0.02, 1.15, '#232126', (a + b) / 2, (y + 0.02) / 2, z, false);
          for (let x = a + 0.35; x < b - 0.2; x += 0.62) { box(g, 0.55, 0.12, 0.5, '#a3263a', x, y + 0.45, z); box(g, 0.55, 0.6, 0.08, '#8e1f31', x, y + 0.78, z + 0.25); if (rnd() < 0.08) { const a2 = seated(g, x, z, Math.PI); a2.root.position.y += y; } }
        }
      });
      // catwalks with spotlights along both sides; black ceiling spotlights over the stage
      balcony(g, 40, 36, 4.6, 1.6, '#232126', ['e', 'w']);
      const spot = mat('#fff7e0', { emissive: '#fff0c0', emissiveIntensity: 2 });
      for (const sx of [-1, 1]) for (let z = -14; z <= 12; z += 4) box(g, 0.3, 0.3, 0.3, spot, sx * 18.4, 5.1, z, false);
      for (let x = -12; x <= 12; x += 4) { box(g, 0.05, 1.5, 0.05, '#111', x, 6.25, -8, false); box(g, 0.35, 0.35, 0.35, spot, x, 5.4, -8, false); }
      standing(g, 0, -11.6, 0, eraLook('byui', 9191), 'talker', [[-0.6, -11.6], [0.6, -11.6]]).root.position.y = 1.0;
      for (let i = 0; i < 3; i++) walker(g, [[0, 16], [0, -5 + i * 3], [17.3, -5 + i * 3], [17.3, 16]]);
      for (const x of [-19.9, 19.9]) poster(g, ['EXIT'], x, 2.6, 15, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0.8, 0.3, '#8d2f2f');
    },
  };
}

// ---------------------------------------------------------------- natural science museum (Romney)
function museum(): CampusLayout {
  // The campus tour lists dinosaur fossils, rock and mineral collections, an arrowhead collection,
  // a seismology station and a planetarium in the Romney Building.
  const props: Rect[] = [{ x0: -9, z0: -4.5, x1: 8.5, z1: 0.5, h: 0.4, color: '#6f665a' }];
  const cases: [number, number, number][] = [[-20.4, -9, Math.PI / 2], [-20.4, -3, Math.PI / 2], [-20.4, 3, Math.PI / 2], [20.4, 3, -Math.PI / 2], [20.4, 9, -Math.PI / 2], [-8, -12.4, 0], [8, -12.4, 0], [-8, 7, Math.PI], [8, 7, Math.PI]];
  for (const [x, z, ry] of cases) { const c = Math.abs(Math.cos(ry)) > 0.5; props.push({ x0: x - (c ? 1.6 : 0.6), z0: z - (c ? 0.6 : 1.6), x1: x + (c ? 1.6 : 0.6), z1: z + (c ? 0.6 : 1.6), h: 0.9, color: '#6b4a30' }); }
  return {
    floor: '#cfc8bb', wall: '#ece6da', floorStyle: 'tile', props,
    signs: [{ text: ['Natural Science Museum'], x: 0, z: 13.6, ry: Math.PI }],
    decorate: g => {
      seed = 81;
      // a dinosaur skeleton on its platform
      const bone = mat('#d9c595'), D = new THREE.Group(); D.position.set(0.8, 0.4, -2); D.scale.setScalar(1.3); g.add(D);
      for (let i = 0; i < 14; i++) { const x = -4 + i * 0.6, y = 2.2 + Math.sin(i / 13 * Math.PI) * 0.6 - (i > 10 ? (i - 10) * 0.25 : 0); box(D, 0.35, 0.3, 0.3, bone, x, y, 0); if (i > 2 && i < 10) for (const s2 of [-1, 1]) { const r = box(D, 0.08, 1.0, 0.08, bone, x, y - 0.55, s2 * 0.35); r.rotation.x = s2 * 0.35; } }
      for (let i = 0; i < 8; i++) box(D, 0.25 - i * 0.02, 0.2, 0.2, bone, -4.4 - i * 0.45, 2.0 - i * 0.18, 0);                       // tail
      box(D, 1.2, 0.7, 0.6, bone, 4.7, 2.9, 0); box(D, 0.9, 0.2, 0.5, bone, 5.0, 2.45, 0);                                       // skull + jaw
      for (let k = 0; k < 4; k++) box(D, 0.06, 0.12, 0.06, '#f4f0e4', 4.5 + k * 0.2, 2.57, 0.2, false);
      for (const [x, s2] of [[-1.5, -1], [-1.5, 1], [2.2, -1], [2.2, 1]]) { box(D, 0.22, 1.1, 0.22, bone, x, 1.2, s2 * 0.5); box(D, 0.2, 0.9, 0.2, bone, x + 0.2, 0.45, s2 * 0.5); box(D, 0.5, 0.1, 0.3, bone, x + 0.35, 0.05, s2 * 0.5); }
      poster(g, ['Dinosaur fossils', 'found in Idaho and the West'], 0, 0.75, 0.55, 0, 2.6, 0.5, '#3a2f28');
      // display cases with rocks, minerals, arrowheads and fossils
      const glass = glassMat(), rockCols = ['#9a5a3a', '#6b6b70', '#c9a43a', '#7a3f8a', '#3f8f6a', '#d9d4c8', '#2a2a2a'];
      cases.forEach(([x, z, ry], i) => {
        const grp = new THREE.Group(); grp.position.set(x, 0.9, z); grp.rotation.y = ry; g.add(grp);
        const gb = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 1.2), glass); gb.position.y = 0.4; grp.add(gb);
        for (let k = 0; k < 9; k++) box(grp, 0.18 + rnd() * 0.15, 0.12 + rnd() * 0.18, 0.18, i % 3 === 1 ? '#8a7a66' : rockCols[(rnd() * rockCols.length) | 0], -1.3 + k * 0.32, 0.1, -0.2 + (k % 2) * 0.35);
        poster(grp, [['Minerals', 'Arrowheads', 'Fossils'][i % 3]], 0, -0.4, 0.62, 0, 1.4, 0.35, '#2d3a46');
      });
      // the seismology station and the planetarium door
      box(g, 3, 0.8, 1, '#d8d4cc', 15, 0.4, -12.4); solid(g, { x0: 13.5, x1: 16.5, z0: -12.9, z1: -11.9 }); computer(g, 14.2, 0.8, -12.4, 0);
      const wave = poster(g, ['∿∿∿╱╲∿∿╱╲╱╲∿∿∿'], 15.6, 2.2, -13.95, 0, 2.6, 0.7, '#0f2a1a', '#6cff9a'); void wave;
      poster(g, ['Seismology station', 'earthquakes around the world'], 15, 3.2, -13.95, 0, 2.8, 0.6, '#2d3a46');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2a2f45')); dome.position.set(-17, 0, 10.5); g.add(dome);
      solid(g, { x0: -22, x1: -12.6, z0: 6, z1: 14 }); box(g, 1.4, 2.2, 0.1, '#111', -14.2, 1.1, 7.2); poster(g, ['PLANETARIUM'], -14.2, 2.6, 7.1, 0, 2.2, 0.45, '#1f2a4a');
      for (let i = 0; i < 6; i++) walker(g, [[-14, -8 + i], [12, -8 + i], [12, 4 - i * 0.5], [-14, 4 - i * 0.5]]);
      standing(g, -6, 1.6, Math.PI, eraLook('byui', 6262), 'talker', [[-6.5, 1.6], [-5.5, 1.6]]);        // a guide
      for (const [x, z] of [[-21, -13], [21, -13], [21, 12.8]]) plant(g, x, z, 1);
      for (let x = -15; x <= 15; x += 7.5) for (const z of [-8, 2, 10]) pendant(g, x, z, 3.0);
    },
  };
}

// ---------------------------------------------------------------- technical shops & maker lab (Austin)
function shop(): CampusLayout {
  // The campus tour: automotive, engineering, welding/fabrication, construction, electronics and a maker lab.
  const props: Rect[] = [];
  for (const z of [-2, 4]) props.push({ x0: -4, z0: z - 0.5, x1: 4, z1: z + 0.5, h: 0.9, color: '#8a8f94' });          // workbenches
  for (const x of [8, 12, 16]) props.push({ x0: x - 1.4, z0: -14.8, x1: x + 1.4, z1: -12.4, h: 0.9, color: '#5a5f66' });   // welding tables
  for (const x of [8, 14]) props.push({ x0: x - 1.6, z0: 6.4, x1: x + 1.6, z1: 8.2, h: 0.85, color: '#d8d4cc' });           // maker lab tables
  return {
    floor: '#a3a39e', wall: '#dedad2', floorStyle: 'tile', props, height: 5.5,
    signs: [{ text: ['Technical shops'], x: 0, z: 14.6, ry: Math.PI }],
    decorate: g => {
      seed = 91;
      floorZone(g, -14, -6, 14, 12, 'carpet', '#6f706c');
      const stripe = mat('#e6c33a');
      for (const [x, z, w, d] of [[-14, 0.2, 14, 0.15], [-21, -6, 0.15, 12], [-7, -6, 0.15, 12], [12, -10.8, 14, 0.15]] as [number, number, number, number][]) { const s2 = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripe); s2.rotation.x = -Math.PI / 2; s2.position.set(x, 0.02, z); g.add(s2); }
      // automotive bay: a car up on a two-post lift, tool chests, an engine on a stand
      const car = new Vehicle('shop-car', 'car', 'boxy90s', '#3d6fa8'); car.root.position.set(-14, 1.6, -6); car.root.rotation.y = Math.PI / 2; g.add(car.root);
      for (const sz of [-1, 1]) { box(g, 0.4, 3.6, 0.4, '#c0392b', -14, 1.8, -6 + sz * 1.7); box(g, 2.2, 0.12, 0.25, '#7a7f86', -14, 1.5, -6 + sz * 1.3); solid(g, { x0: -14.3, x1: -13.7, z0: -6 + sz * 1.7 - 0.3, z1: -6 + sz * 1.7 + 0.3 }); }
      for (const x of [-20, -18.6]) { box(g, 1.2, 1.1, 0.6, '#c0392b', x, 0.55, -11.4); for (let k = 0; k < 5; k++) box(g, 1.1, 0.02, 0.02, '#9a9a9a', x, 0.2 + k * 0.2, -11.08, false); solid(g, { x0: x - 0.6, x1: x + 0.6, z0: -11.7, z1: -11.1 }); }
      box(g, 0.9, 0.7, 0.7, '#5a5f66', -9, 0.95, -1.5); box(g, 0.1, 0.6, 0.1, '#2a2a2a', -9, 0.3, -1.5); solid(g, { x0: -9.5, x1: -8.5, z0: -1.9, z1: -1.1 });
      standing(g, -12.4, -6, -Math.PI / 2, eraLook('byui', 3131), 'talker', [[-12.4, -6.6], [-12.4, -5.4]]);
      // workbenches with vises and tools; students building circuits
      for (const z of [-2, 4]) { for (const x of [-3, 0, 3]) { box(g, 0.25, 0.2, 0.2, '#3a3f45', x, 1.0, z - 0.3); if (rnd() < 0.6) standing(g, x, z + 0.9, Math.PI); } box(g, 0.6, 0.15, 0.4, '#2f8f5a', -1.5, 0.98, z + 0.1); }
      // welding booths: orange curtains, glowing sparks
      for (const x of [8, 12, 16]) {
        const cur = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 0.05), mat('#ff8a2a', { transparent: true, opacity: 0.55 })); cur.position.set(x, 1.2, -11.6); g.add(cur);
        box(g, 0.15, 0.15, 0.15, mat('#fff6c0', { emissive: '#ffd27a', emissiveIntensity: 3 }), x, 1.0, -13.5, false);
        standing(g, x - 0.6, -13.6, 0, { ...eraLook('byui', x * 17), hat: 'cap', hatColor: '#2a2a2a', shirt: '#4a4f55' });
      }
      poster(g, ['SAFETY GLASSES', 'REQUIRED'], 12, 3.2, -14.95, 0, 3, 0.8, '#c9a43a', '#1c1c1c');
      // maker lab: 3D printers and laptops
      for (const x of [8, 14]) { for (const dx of [-1, 0, 1]) { box(g, 0.6, 0.6, 0.6, '#2a2d31', x + dx, 1.15, 7); box(g, 0.4, 0.3, 0.4, mat('#cfe3ee', { transparent: true, opacity: 0.4 }), x + dx, 1.2, 7.05); box(g, 0.15, 0.1, 0.15, '#ff7a1a', x + dx, 1.0, 7.1, false); } if (rnd() < 0.8) standing(g, x, 8.9, Math.PI); }
      poster(g, ['MAKER LAB'], 11, 3.2, 14.95, Math.PI, 3, 0.8, '#1f4e8c');
      // pegboards with tools along the north wall, shop lights
      for (let x = -20; x <= 20; x += 5) { box(g, 3.6, 1.6, 0.05, '#c8a57a', x, 2.0, -14.95, false); for (let k = 0; k < 6; k++) box(g, 0.08, 0.4, 0.04, ['#c0392b', '#2a2a2a', '#9a9a9a'][k % 3], x - 1.4 + k * 0.55, 2.1, -14.9, false); }
      for (let x = -18; x <= 18; x += 6) for (const z of [-8, 2, 10]) { box(g, 0.02, 1.4, 0.02, '#2a2a2a', x, 4.8, z, false); box(g, 2.4, 0.08, 0.3, mat('#ffffff', { emissive: '#f4f8ff', emissiveIntensity: 1 }), x, 4.1, z, false); }
    },
  };
}

// ---------------------------------------------------------------- Manwaring lower level: the Strike Zone
export const STRIKE_ZONE = 'mc-strikezone';
/** Room-local spots the game wires up (stairs between floors, the bowling lane, the store counter). */
export const MC_SPOTS = { stairsDown: { x: -21.5, z: 13.2 }, stairsUp: { x: 19.5, z: 12.5 }, bowl: { x: -10.2, z: 4.2 }, store: { x: 23.2, z: 10 }, grill: { x: -17, z: 9.5 }, pong: { x: 6, z: 9.6 } };
export const LANES = 8;
function strikeZone(): CampusLayout {
  const props: Rect[] = [{ x0: -20, z0: -15, x1: 20, z1: 2.4, h: 0.12, color: '#2a2230' }];          // lanes (not walkable)
  props.push({ x0: -21.5, z0: 7.6, x1: -12.5, z1: 8.6, h: 1.05, color: '#c0392b' });                   // grill counter
  return {
    floor: '#3a2a5a', wall: '#2c2440', floorStyle: 'patternCarpet', windows: false, props, height: 4,
    signs: [{ text: ['STRIKE ZONE'], x: 0, z: 14.6, ry: Math.PI }],
    decorate: g => {
      seed = 404;
      const lw = 40 / LANES;
      for (let i = 0; i < LANES; i++) {
        const cx = -20 + lw * (i + 0.5);
        floorZone(g, cx, -6.3, lw - 1.1, 17.4, 'wood', '#d6a66a').position.y = 0.13;
        for (const sx of [-1, 1]) box(g, 0.35, 0.08, 17.4, '#1c1c1c', cx + sx * (lw / 2 - 0.35), 0.1, -6.3, false);     // gutters
        // pins in a triangle at the far end
        let k = 0; for (let row = 0; row < 4; row++) for (let c = 0; c <= row; c++, k++) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.42, 8), mat('#f8f6f0')); pin.position.set(cx + (c - row / 2) * 0.32, 0.34, -13.4 - row * 0.28); g.add(pin); box(g, 0.15, 0.03, 0.03, '#c0392b', pin.position.x, 0.42, pin.position.z + 0.08, false); }
        box(g, lw, 1.1, 0.4, '#151018', cx, 3.4, -14.7, false); screen(g, cx, 3.2, -14.4, 0, 2.6, [`LANE ${i + 1}`, `${(rnd() * 180) | 0}`], ['#1f4e8c', '#7a2b2b', '#3f6f4a'][i % 3]);
        box(g, 0.5, 0.5, 1.4, '#3a3f45', cx + lw / 2 - 0.1, 0.25, 3.2); solid(g, { x0: cx + lw / 2 - 0.35, x1: cx + lw / 2 + 0.15, z0: 2.5, z1: 3.9 });     // ball return
        for (let b = 0; b < 3; b++) { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(['#2f4f7f', '#8d2f2f', '#3f6f4a'][b])); ball.position.set(cx + lw / 2 - 0.1, 0.62, 2.8 + b * 0.32); g.add(ball); }
        if (i !== 2 && rnd() < 0.7) standing(g, cx - 0.4, 3.6, Math.PI, undefined, 'talker', [[cx - 0.6, 3.6], [cx, 3.2]]);
        for (const dx of [-0.6, 0.6]) { box(g, 0.5, 0.45, 0.5, '#e8862a', cx + dx, 0.22, 5.6); if (rnd() < 0.4) seated(g, cx + dx, 5.6, Math.PI); }
      }
      // neon stripes, the grill, arcade games, the stairs back up
      const neon = (c: string) => mat(c, { emissive: c, emissiveIntensity: 1.6 });
      for (const [c, y] of [['#ff4fd8', 3.95], ['#4fd1ff', 3.75]] as [string, number][]) for (const sx of [-1, 1]) box(g, 0.05, 0.06, 30, neon(c), sx * 21.95, y, 0, false);
      box(g, 9, 0.06, 0.05, neon('#ffd34d'), -17, 2.4, 8.62, false); plaque(g, ['Strike Zone Grill'], -17, 3.0, 7.55, Math.PI, 4, '#7a2b2b');
      standing(g, -17, 7.0, 0, { shirt: '#c0392b', pants: '#2a2a2a', hair: '#3b2a20', skin: '#c68c64', hat: 'cap', hatColor: '#c0392b' }, 'talker', [[-19, 7.0], [-15, 7.0]]);
      for (let i = 0; i < 5; i++) { const x = 6 + i * 2.2; box(g, 1.2, 2.0, 0.9, ['#2f4f9e', '#9e2f6b', '#2f9e7a', '#9e7a2f', '#5a2f9e'][i], x, 1.0, 13.9); box(g, 0.9, 0.7, 0.05, neon(['#4fd1ff', '#ff4fd8', '#7bff7b', '#ffd34d', '#c79bff'][i]), x, 1.5, 13.43, false); solid(g, { x0: x - 0.6, x1: x + 0.6, z0: 13.45, z1: 14.4 }); }
      poster(g, ['ARCADE'], 10.4, 3.2, 14.45, Math.PI, 3, 0.7, '#5a2f9e');
      stairs(g, 19.5, 14.6, 2.4, 3.2, 1.6, '#d8d4cc');
      // a ping-pong table
      box(g, 2.7, 0.06, 1.5, '#1f5a3a', MC_SPOTS.pong.x, 0.76, MC_SPOTS.pong.z); box(g, 2.74, 0.02, 0.02, '#f4f4f0', MC_SPOTS.pong.x, 0.8, MC_SPOTS.pong.z); box(g, 0.04, 0.16, 1.6, '#f4f4f0', MC_SPOTS.pong.x, 0.86, MC_SPOTS.pong.z);
      for (const [dx, dz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) box(g, 0.06, 0.74, 0.06, '#2a2a2a', MC_SPOTS.pong.x + dx, 0.37, MC_SPOTS.pong.z + dz);
      solid(g, { x0: MC_SPOTS.pong.x - 1.4, x1: MC_SPOTS.pong.x + 1.4, z0: MC_SPOTS.pong.z - 0.8, z1: MC_SPOTS.pong.z + 0.8 });
      for (let x = -16; x <= 16; x += 8) for (const z of [6, 11]) globeLight(g, x, z, 3.1, 4, 0.3);
    },
  };
}

// ---------------------------------------------------------------- STC: computer labs & 3D printing
function lab(): CampusLayout {
  const props: Rect[] = [];
  for (const z of [-11, -7.5, -4]) for (const [a, b] of [[-19, -9], [-7, 3]] as [number, number][]) props.push({ x0: a, z0: z - 0.45, x1: b, z1: z + 0.45, h: 0.75, color: '#e8e8e6' });
  props.push({ x0: 8, z0: -12, x1: 19, z1: -10.6, h: 0.85, color: '#d8d8d4' });                       // 3D printer bench
  return {
    floor: '#4a4c50', wall: '#f2f2f0', floorStyle: 'darkTile', props, height: 7,
    signs: [{ text: ['Computer lab · 3D printing'], x: 0, z: 13.6, ry: Math.PI }],
    decorate: g => {
      seed = 515;
      for (const [x, z, w, d] of [[0, -14.95, 44, 0.05], [-21.95, 0, 0.05, 30], [21.95, 0, 0.05, 30]] as [number, number, number, number][]) box(g, w || 0.05, 0.5, d || 0.05, '#a9adb2', x, 2.6, z, false);   // the grey band on the white walls
      balcony(g, 44, 30, 3.8, 2.4, '#f2f2f0', ['n', 'e']);
      stairs(g, -18, 12.4, 2.6, 6, 3.8, '#e8e6e2');
      for (const z of [-11, -7.5, -4]) for (const [a, b] of [[-19, -9], [-7, 3]] as [number, number][]) for (let x = a + 0.8; x < b; x += 1.6) { computer(g, x, 0.75, z - 0.15, Math.PI); box(g, 0.45, 0.45, 0.45, '#1f1f22', x, 0.22, z + 0.8); if (rnd() < 0.45) seated(g, x, z + 0.8, Math.PI); }
      for (let x = 8.8; x < 19; x += 1.4) { box(g, 0.8, 0.8, 0.8, '#2a2d31', x, 1.25, -11.3); const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), glassMat()); win.position.set(x, 1.3, -10.88); g.add(win); box(g, 0.25, 0.08 + rnd() * 0.2, 0.25, ['#ff7a1a', '#4fd1ff', '#7be07b', '#ff4fd8'][(rnd() * 4) | 0], x, 0.95, -11.3, false); box(g, 0.3, 0.04, 0.04, mat('#7bff7b', { emissive: '#3fff6a', emissiveIntensity: 1.5 }), x, 1.6, -10.88, false); }
      poster(g, ['3D PRINTING LAB'], 13.5, 2.2, -14.94, 0, 4, 0.8, '#1f4e8c'); standing(g, 12, -9.7, Math.PI, eraLook('presentFinale', 9090), 'talker', [[10.5, -9.7], [14, -9.7]]);
      // glass study rooms along the east side
      for (const z of [-2, 4]) { glassRail(g, 12, z - 2.4, 21.9, z - 2.4, 0, 2.6); glassRail(g, 12, z - 2.4, 12, z + 0.4, 0, 2.6); box(g, 3, 0.75, 1.4, '#e8e8e6', 17, 0.37, z - 1); solid(g, { x0: 15.5, x1: 18.5, z0: z - 1.7, z1: z - 0.3 }); screen(g, 21.9, 1.8, z - 1, -Math.PI / 2, 1.6); for (const dx of [-1, 1]) seated(g, 17 + dx, z - 0.1, Math.PI); }
      solid(g, { x0: 11.9, x1: 12.1, z0: -4.4, z1: 4.4 });
      // an atrium lounge in the middle: sofas, coffee tables, students studying
      for (const [x, z] of [[-12, 4], [-4, 4], [4, 7]]) { sofa(g, x, z - 1.2, 0, '#3d6fa8', 2.4); sofa(g, x, z + 1.2, Math.PI, '#4aa3a0', 2.4); coffeeTable(g, x, z); if (rnd() < 0.8) seated(g, x - 0.5, z - 1.1, 0); if (rnd() < 0.6) seated(g, x + 0.5, z + 1.1, Math.PI); }
      poster(g, ['STUDY ROOMS'], 12.1, 2.9, 1, Math.PI / 2, 2.4, 0.5, '#2d3a46');
      for (let x = -14; x <= 6; x += 10) for (const z of [-8, 2, 9]) pendant(g, x, z, 3.0, 3.6);
      for (const [x, z] of [[-21, 9], [21, 13.6], [6, 13.6]]) plant(g, x, z, 1.1);
    },
  };
}

// ---------------------------------------------------------------- Benson: greenhouse & wildlife exhibit
function greenhouse(): CampusLayout {
  const props: Rect[] = [];
  for (const z of [-10, -5.5, -1]) for (const [a, b] of [[-20, -11], [-9, 0]] as [number, number][]) props.push({ x0: a, z0: z - 0.8, x1: b, z1: z + 0.8, h: 0.9, color: '#6b4a30' });   // planting beds
  props.push({ x0: 5, z0: -13, x1: 20, z1: -6, h: 0.4, color: '#8a7a5a' });                             // wildlife diorama
  return {
    floor: '#9a9488', wall: '#eef2ee', floorStyle: 'tile', props, height: 5,
    signs: [{ text: ['Greenhouse · Wildlife exhibit'], x: 0, z: 11.6, ry: Math.PI }],
    decorate: g => {
      seed = 616;
      // the greenhouse half: gravel floor, glass walls with white frames
      floorZone(g, -10.5, -5, 23, 17, 'carpet', '#8a8270');
      for (let x = -21.9; x <= 0; x += 2.2) box(g, 0.08, 4.6, 0.08, '#f4f6f4', x, 2.3, -13.9, false);
      const greens = ['#3f7a3a', '#5a9a42', '#2f6a3a', '#7aa64a'], blooms = ['#e05a7a', '#f4d03f', '#f4f1e8', '#c94fd1'];
      for (const z of [-10, -5.5, -1]) for (const [a, b] of [[-20, -11], [-9, 0]] as [number, number][]) for (let x = a + 0.5; x < b; x += 0.8) for (const dz of [-0.4, 0.4]) {
        const h = 0.3 + rnd() * 0.7; box(g, 0.45, h, 0.45, greens[(rnd() * 4) | 0], x, 0.9 + h / 2, z + dz); if (rnd() < 0.35) box(g, 0.2, 0.2, 0.2, blooms[(rnd() * 4) | 0], x, 0.9 + h + 0.1, z + dz, false);
      }
      for (let i = 0; i < 3; i++) standing(g, -10 + i * 4, 1.6, 0, { ...eraLook('byui', 616 + i), shirt: '#3f6f4a' }, 'talker', [[-12 + i * 4, 1.6], [-9 + i * 4, 1.6]]);   // students tending plants
      // wildlife exhibit: a little mountain diorama with an elk, a moose and a fox (voxel figures)
      const D = new THREE.Group(); D.position.set(12.5, 0.4, -9.5); g.add(D);
      box(D, 6, 2.4, 2, '#8a7f70', -2, 1.2, -2.2); box(D, 4, 3.4, 1.6, '#7a7064', 3, 1.7, -2.4); for (let i = 0; i < 6; i++) box(D, 0.5, 1.6, 0.5, '#2f5a3a', -6 + i * 2.2, 0.8, -2.6 + (i % 2) * 0.6);
      const animal = (x: number, z: number, body: string, s: number, antlers: boolean) => { const a = new THREE.Group(); a.position.set(x, 0, z); a.scale.setScalar(s); D.add(a);
        box(a, 1.6, 0.8, 0.6, body, 0, 1.3, 0); box(a, 0.5, 0.5, 0.45, body, 0.95, 1.85, 0); box(a, 0.3, 0.3, 0.3, body, 1.3, 1.75, 0); for (const [lx, lz] of [[-0.6, -0.2], [-0.6, 0.2], [0.6, -0.2], [0.6, 0.2]]) box(a, 0.16, 0.9, 0.16, body, lx, 0.45, lz);
        if (antlers) for (const sz of [-1, 1]) { box(a, 0.06, 0.6, 0.06, '#e8dcc0', 0.9, 2.35, sz * 0.25); box(a, 0.4, 0.06, 0.06, '#e8dcc0', 0.9, 2.55, sz * 0.32); } };
      animal(-1.5, 0.5, '#7a5a3a', 1, true); animal(2.5, 0.8, '#3a2a20', 1.2, true); animal(0.5, 2, '#c0602a', 0.4, false);
      poster(g, ['Wildlife of the Upper Snake River Valley'], 12.5, 3.8, -14.94, 0, 7, 0.7, '#3a4a2a');
      for (let i = 0; i < 3; i++) walker(g, [[6 + i, -4.5], [19 - i, -4.5], [19 - i, 6], [6 + i, 6]]);
      for (const [x, z] of [[20.8, 10.8], [-20.8, 10.8], [3, 10.8]]) plant(g, x, z, 1.3);
    },
  };
}

// ---------------------------------------------------------------- Clarke: nursing labs & preschool
function nursing(): CampusLayout {
  const props: Rect[] = [];
  for (let i = 0; i < 5; i++) props.push({ x0: -19 + i * 3.6, z0: -11.8, x1: -17 + i * 3.6, z1: -8.8, h: 0.7, color: '#e8eef2' });   // hospital beds
  return {
    floor: '#cfd8d8', wall: '#eef2f2', floorStyle: 'tile', props,
    signs: [{ text: ['Nursing lab · Preschool'], x: 0, z: 11.6, ry: Math.PI }],
    decorate: g => {
      seed = 717;
      for (let i = 0; i < 5; i++) {
        const x = -18 + i * 3.6;
        box(g, 2.1, 0.12, 3.1, '#f8fafa', x, 0.72, -10.3); box(g, 1.8, 0.2, 0.5, '#ffffff', x, 0.86, -11.4); box(g, 2.1, 0.6, 0.1, '#9aa3a8', x, 1.0, -11.85);
        if (i % 2 === 0) { const m = seated(g, x, -10.4, 0); m.root.position.y = 0.45; } else box(g, 1.6, 0.25, 2.0, '#bcd6e6', x, 0.9, -10.0);   // manikin / blanket
        const cur = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 3.2), mat('#9fd0d8', { transparent: true, opacity: 0.6 })); cur.position.set(x + 1.75, 1.1, -10.3); g.add(cur);
        box(g, 0.4, 1.4, 0.4, '#d8dcde', x - 1.3, 0.7, -12); screen(g, x - 1.3, 1.6, -11.78, 0, 0.5, ['♥ 72'], '#0f2a1a');
        if (rnd() < 0.7) standing(g, x + 0.9, -8.4, Math.PI, { ...eraLook('byui', 717 + i), shirt: '#3d6fa8', pants: '#3d6fa8' }, 'talker', [[x + 0.5, -8.4], [x + 1.2, -8.2]]);
      }
      poster(g, ['NURSING SIMULATION LAB'], -11, 2.9, -12.95, 0, 5, 0.6, '#1f4e8c');
      // preschool corner: a play rug, little tables and chairs, toy blocks, a teacher and children
      rug(g, 12, 2, 12, 8, '#f4d03f', '#3d6fa8');
      for (const [x, z] of [[9, 0], [15, 0]]) { box(g, 1.6, 0.45, 0.9, '#7be07b', x, 0.22, z); solid(g, { x0: x - 0.8, x1: x + 0.8, z0: z - 0.45, z1: z + 0.45 }); for (const dz of [-0.8, 0.8]) box(g, 0.3, 0.25, 0.3, '#ff7a5a', x, 0.12, z + dz); }
      const cols = ['#e05a5a', '#5ab0ff', '#f4d03f', '#7be07b'];
      for (let i = 0; i < 14; i++) box(g, 0.25, 0.25, 0.25, cols[i % 4], 10 + rnd() * 5, 0.12 + (i % 3 === 0 ? 0.25 : 0), 3 + rnd() * 2, false);
      for (let i = 0; i < 4; i++) { const a = new Avatar(eraLook('byui', 7170 + i), 0.55); a.root.position.set(9 + i * 2, 0, 3.4 + (i % 2)); a.root.rotation.y = rnd() * 6; g.add(a.root); addActor(g, a, 'walker', a.root.position.x, a.root.position.z, 0, [[8 + i * 2, 3], [9 + i * 2, 5], [10 + i, 4]], 0.6); }
      standing(g, 12, 5.6, Math.PI, eraLook('byui', 7181));
      poster(g, ['PRESCHOOL LAB'], 20.95, 2.6, 2, -Math.PI / 2, 3, 0.6, '#e05a5a');
      for (const [x, z] of [[-20.6, 10.6], [20.6, 10.6]]) plant(g, x, z, 1);
    },
  };
}

// ---------------------------------------------------------------- Spori: art gallery
function gallery(): CampusLayout {
  const props: Rect[] = [];
  for (const [x, z] of [[-8, -3], [0, 3], [8, -3]]) props.push({ x0: x - 0.6, z0: z - 0.6, x1: x + 0.6, z1: z + 0.6, h: 1.1, color: '#f4f2ee' });   // plinths
  return {
    floor: '#b89a74', wall: '#f7f5f0', floorStyle: 'wood', windows: false, props, walls: [{ x0: -6, z0: -0.15, x1: 6, z1: 0.15, h: 3.2 }],
    signs: [{ text: ['Spori Gallery'], x: 0, z: 11.6, ry: Math.PI }],
    decorate: g => {
      seed = 818;
      for (let i = 0; i < 9; i++) painting(g, -17 + i * 4.2, 1.9, -12.92, 0, 2.2, 1.5, i + 1);
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) painting(g, sx * 19.92, 1.9, -9 + i * 5, -sx * Math.PI / 2, 2.2, 1.5, 10 + i + (sx > 0 ? 4 : 0));
      for (const sz of [-1, 1]) for (const x of [-3.2, 0, 3.2]) painting(g, x, 1.8, sz * 0.18, sz > 0 ? 0 : Math.PI, 2, 1.4, (x * 3 + sz + 30) | 0);
      // sculptures on plinths
      const stone = mat('#d9d4ca');
      for (const [x, z, k] of [[-8, -3, 0], [0, 3, 1], [8, -3, 2]] as [number, number, number][]) {
        if (k === 0) { const s2 = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 48, 8), mat('#b87333', { metalness: 0.6, roughness: 0.3 })); s2.position.set(x, 1.65, z); g.add(s2); }
        else if (k === 1) { box(g, 0.4, 0.9, 0.4, stone, x, 1.55, z); const h = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), stone); h.position.set(x, 2.15, z); g.add(h); }
        else { for (let i = 0; i < 4; i++) box(g, 0.5 - i * 0.1, 0.3, 0.5 - i * 0.1, ['#3d6fa8', '#e05a5a', '#f4d03f', '#f4f1e8'][i], x, 1.25 + i * 0.3, z, false); }
      }
      for (const [x, z] of [[-6, 7], [6, 7]]) { box(g, 3, 0.45, 0.7, '#2a2a2a', x, 0.22, z); solid(g, { x0: x - 1.5, x1: x + 1.5, z0: z - 0.35, z1: z + 0.35 }); seated(g, x - 0.6, z, Math.PI); }
      for (let i = 0; i < 4; i++) walker(g, [[-17 + i * 2, -10.5], [17 - i, -10.5], [17 - i, 4], [-17 + i * 2, 4]]);
      for (let x = -15; x <= 15; x += 5) box(g, 0.4, 0.12, 0.12, mat('#fff3cf', { emissive: '#ffe4a8', emissiveIntensity: 1.4 }), x, 3.3, -12.6, false);   // track lights
      poster(g, ['Student & faculty exhibition'], 0, 2.6, 12.94, Math.PI, 4, 0.6, '#2a2a2a');
    },
  };
}

// ---------------------------------------------------------------- ETC: robotics & engineering labs
function engineering(): CampusLayout {
  const props: Rect[] = [{ x0: -6, z0: -4, x1: 6, z1: 4, h: 0.15, color: '#2a2d31' }];               // robot arena
  for (const z of [-11, -8]) props.push({ x0: -19, z0: z - 0.5, x1: -9, z1: z + 0.5, h: 0.9, color: '#8a8f94' });
  props.push({ x0: 10, z0: -12.6, x1: 16, z1: -9.4, h: 1.8, color: '#5a6066' });                      // CNC machine
  return {
    floor: '#8e9196', wall: '#eceef0', floorStyle: 'darkTile', props, height: 5,
    signs: [{ text: ['Robotics lab'], x: 0, z: 12.6, ry: Math.PI }],
    decorate: g => {
      seed = 919;
      for (const sx of [-1, 1]) box(g, 12.4, 0.3, 0.1, '#e6c33a', 0, 0.3, sx * 4.05); for (const sx of [-1, 1]) box(g, 0.1, 0.3, 8.2, '#e6c33a', sx * 6.05, 0.3, 0);
      const robot = (x: number, z: number, c: string) => { const r = new THREE.Group(); r.position.set(x, 0.15, z); g.add(r); box(r, 0.8, 0.35, 0.8, c, 0, 0.3, 0); box(r, 0.3, 0.3, 0.3, '#2a2a2a', 0, 0.62, 0); for (const [wx, wz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) box(r, 0.12, 0.3, 0.3, '#1c1c1c', wx, 0.15, wz); box(r, 0.1, 0.1, 0.1, mat('#4fd1ff', { emissive: '#4fd1ff', emissiveIntensity: 2 }), 0, 0.82, 0.12, false); };
      robot(-2.5, -1, '#c0392b'); robot(2, 1.5, '#2f4f9e'); robot(0, -2.6, '#2fbf71');
      for (const [x, z] of [[-7, -2], [-7, 2], [7, 0]]) standing(g, x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, eraLook('presentFinale', (x * 13 + z) | 0), 'talker', [[x, z - 0.5], [x, z + 0.5]]);
      for (const z of [-11, -8]) for (let x = -18; x < -9; x += 2.2) { box(g, 0.5, 0.25, 0.4, '#2f8f5a', x, 1.03, z); box(g, 0.08, 0.5, 0.08, '#9aa3a8', x + 0.4, 1.15, z); if (rnd() < 0.5) standing(g, x, z + 0.9, Math.PI); }
      box(g, 5.8, 1.0, 3.0, '#3a3f45', 13, 2.3, -11); const w2 = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.05), glassMat()); w2.position.set(13, 1.2, -9.35); g.add(w2); poster(g, ['CNC'], 13, 2.6, -9.34, 0, 1.2, 0.4, '#c9a43a', '#1c1c1c');
      box(g, 0.3, 1.6, 0.3, '#e6c33a', 18, 0.8, 2); for (let k = 0; k < 3; k++) { const seg = box(g, 0.25, 1.0, 0.25, '#e6c33a', 18 + k * 0.3, 1.9 + k * 0.6, 2 - k * 0.2); seg.rotation.z = -0.5 - k * 0.3; }   // industrial robot arm
      poster(g, ['ENGINEERING TECHNOLOGY'], 0, 3.6, -13.94, 0, 6, 0.8, '#1f4e8c');
      for (let x = -15; x <= 15; x += 7.5) for (const z of [-6, 6]) pendant(g, x, z, 3.4, 5);
    },
  };
}

// ---------------------------------------------------------------- Visual Arts: studios
function studio(): CampusLayout {
  const props: Rect[] = [];
  for (const z of [-7, 1]) props.push({ x0: 8, z0: z - 1, x1: 18, z1: z + 1, h: 0.85, color: '#c8b8a0' });   // ceramics tables
  props.push({ x0: 14, z0: -12.6, x1: 19, z1: -10.4, h: 1.6, color: '#7a6a5a' });                       // kiln
  return {
    floor: '#b8b0a4', wall: '#f4f2ee', floorStyle: 'tile', props, height: 5,
    signs: [{ text: ['Art studios'], x: 0, z: 11.6, ry: Math.PI }],
    decorate: g => {
      seed = 1020;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const x = -17 + c * 3.4, z = -9 + r * 4;
        const e = new THREE.Group(); e.position.set(x, 0, z); g.add(e);
        for (const sx of [-0.35, 0.35]) { const l = box(e, 0.06, 1.8, 0.06, '#8a6440', sx, 0.9, 0); l.rotation.z = -sx * 0.25; }
        box(e, 0.06, 1.7, 0.06, '#8a6440', 0, 0.85, -0.4).rotation.x = 0.25;
        const can = box(e, 0.9, 1.1, 0.04, '#ffffff', 0, 1.4, 0.05, false);
        const ctx2 = document.createElement('canvas'); ctx2.width = 64; ctx2.height = 80; const pg = ctx2.getContext('2d')!; pg.fillStyle = '#ffffff'; pg.fillRect(0, 0, 64, 80);
        for (let k = 0; k < 6; k++) { pg.fillStyle = ['#e05a5a', '#5ab0ff', '#f4d03f', '#7be07b', '#c94fd1', '#2a2a2a'][(rnd() * 6) | 0]; pg.fillRect(rnd() * 50, rnd() * 66, 8 + rnd() * 24, 8 + rnd() * 24); }
        const t = new THREE.CanvasTexture(ctx2); t.colorSpace = THREE.SRGBColorSpace; can.material = new THREE.MeshStandardMaterial({ map: t });
        solid(g, { x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.3 });
        if (rnd() < 0.55) standing(g, x, z + 1.0, Math.PI, eraLook('presentFinale', (x * 7 + z * 3) | 0), 'talker', [[x - 0.3, z + 1.0], [x + 0.3, z + 1.0]]);
      }
      for (const z of [-7, 1]) for (let x = 9; x < 18; x += 2.4) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14), mat('#7a6a5a')); w.position.set(x, 0.92, z); g.add(w); const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 10), mat('#b06a3a')); pot.position.set(x, 1.1, z); g.add(pot); if (rnd() < 0.6) seated(g, x, z + 1.3, Math.PI); }
      box(g, 4.6, 0.3, 2, '#5a4a3a', 16.5, 1.75, -11.5); box(g, 0.3, 0.3, 0.05, mat('#ff7a1a', { emissive: '#ff5a1a', emissiveIntensity: 2 }), 16.5, 0.9, -10.37, false); poster(g, ['KILN — HOT!'], 16.5, 2.4, -10.36, 0, 1.6, 0.4, '#c0392b');
      for (let i = 0; i < 5; i++) painting(g, -16 + i * 4, 2.6, -12.92, 0, 2, 1.3, 40 + i);
      poster(g, ['VISUAL ARTS'], 0, 3.9, -12.94, 0, 5, 0.8, '#5a3a6b');
      for (let x = -15; x <= 15; x += 7.5) for (const z of [-6, 4]) pendant(g, x, z, 3.2, 5);
    },
  };
}

// ---------------------------------------------------------------- registration
/** Door anchor on the side of the building farthest from its existing interior doors. */
function doorAnchor(buildingId: string) {
  const poly = registryPoly(buildingId); if (!poly) return null;
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const sides: [number, number][] = [[cx, Math.min(...zs) - 6], [cx, Math.max(...zs) + 6], [Math.min(...xs) - 6, cz], [Math.max(...xs) + 6, cz]];
  const taken = Object.values(GAME_CONFIG.locations).filter(a => (a as { building?: string }).building === buildingId).map(a => [a.x * 0.4, a.z * 0.4]);
  const best = sides.sort((a, b) => Math.min(...taken.map(t => Math.hypot(b[0] - t[0], b[1] - t[1])), 1e9) - Math.min(...taken.map(t => Math.hypot(a[0] - t[0], a[1] - t[1])), 1e9))[0];
  const [rx, rz] = toReal(best[0], best[1]);
  return { x: rx, z: rz, building: buildingId, offset: 2.5, label: '' };
}
function register(id: string, kind: Kind, i: number) {
  const b = BUILDINGS.find(x => x.id === id); if (!b) return;
  const eras = ERA_IDS.filter(e => eraState(b, ERAS[e].year) === 'standing' || (id === 'icenter' && e !== 'ricks1999') || (id === 'taylor'));
  if (!eras.length) return;
  const name = b.names.ricks ?? b.names.byui ?? id;
  const anchor = doorAnchor(id); if (!anchor) return;
  const key = `bldg-${id}`, doorId = `door.${key}`;
  anchor.label = `${name} entrance`;
  (GAME_CONFIG.locations as Record<string, unknown>)[doorId] = anchor;
  const size = ({ classrooms: [40, 26], auditorium: [56, 50], foodcourt: [50, 36], offices: [64, 14], library: [42, 30], gym: [56, 36], residence: [44, 18], chapel: [40, 32], theater: [40, 36], museum: [44, 28], shop: [46, 30], lab: [44, 30], greenhouse: [44, 28], nursing: [42, 26], gallery: [40, 26], engineering: [42, 28], studio: [40, 26] } as Record<Kind, number[]>)[kind];
  const label = ({ classrooms: `${name} — classrooms`, auditorium: 'Campus Center — auditorium', foodcourt: `${name} — the Crossroads & presidents gallery`, offices: `${b.names.byui ?? name} — offices`, library: `${name} — library`, gym: `${name} — gym`, residence: `${name} — residence hall`, chapel: `${name} — chapel & foyer`, theater: `${name} — concert hall`, museum: `${name} — natural science museum`, shop: `${name} — technical shops & maker lab`, lab: `${name} — computer labs & 3D printing`, greenhouse: `${name} — greenhouse & wildlife exhibit`, nursing: `${name} — nursing labs & preschool`, gallery: `${name} — art gallery`, engineering: `${name} — robotics & engineering labs`, studio: `${name} — art studios` } as Record<Kind, string>)[kind];
  (GAME_CONFIG.interiors as Record<string, unknown>)[key] = { label, width: size[0], depth: size[1], exteriorDoor: doorId, eras, building: id };
  const make: Record<Kind, () => CampusLayout> = { classrooms: () => classrooms(name, 100 + i * 100, id), auditorium, foodcourt, offices, library, gym, residence: () => residence(name), chapel, theater, museum, shop, lab, greenhouse, nursing, gallery, engineering, studio };
  CAMPUS_LAYOUTS[key] = make[kind]();
}
CLASSROOM_BUILDINGS.forEach((id, i) => register(id, 'classrooms', i));
for (const [id, kind] of Object.entries(SPECIAL)) register(id, kind, 0);
// The Manwaring Center's lower level: the Strike Zone (bowling, games, grill). Reached by the stairs inside.
{
  const mc = (GAME_CONFIG.interiors as Record<string, { eras: EraId[] | null; exteriorDoor: string }>)['bldg-manwaring'];
  if (mc) { (GAME_CONFIG.interiors as Record<string, unknown>)[STRIKE_ZONE] = { label: 'Manwaring Center — Strike Zone (lower level)', width: 44, depth: 30, exteriorDoor: mc.exteriorDoor, eras: mc.eras, building: 'manwaring' }; CAMPUS_LAYOUTS[STRIKE_ZONE] = strikeZone(); }
}
