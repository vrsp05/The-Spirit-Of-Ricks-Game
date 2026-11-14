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

export interface Rect { x0: number; z0: number; x1: number; z1: number; h?: number; color?: string }
export interface CampusLayout {
  floor?: string; wall?: string; walls?: Rect[]; props?: Rect[]; blockers?: Rect[];
  signs?: { text: string[]; x: number; z: number; ry: number }[];
  /** Furniture and people, built the first time the player walks in. */
  decorate?: (g: THREE.Group) => void;
  /** Called on entry with the current era (e.g. the presidents gallery). */
  onEra?: (era: EraId) => void;
}
export const CAMPUS_LAYOUTS: Record<string, CampusLayout> = {};

const ERA_IDS: EraId[] = ['ricks1999', 'transition', 'byui', 'presentFinale'];
const CLASSROOM_BUILDINGS = ['taylor', 'romney', 'smith', 'austin', 'kirkham', 'clarke', 'benson', 'snow', 'spori-original', 'spori-new', 'ricks-building', 'stc', 'etc', 'visual-arts'];
const SPECIAL: Record<string, 'auditorium' | 'foodcourt' | 'offices'> = { icenter: 'auditorium', manwaring: 'foodcourt', hinckley: 'offices' };

let seed = 1234; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const lambert = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
function box(g: THREE.Object3D, w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? lambert(c) : c); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function plaque(g: THREE.Object3D, lines: string[], x: number, y: number, z: number, ry: number, w = 3, bg = '#2d3a46') {
  const tex = new THREE.CanvasTexture(textCanvas(lines, { w: 512, h: 128, bg })); tex.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex })); p.position.set(x, y, z); p.rotation.y = ry; g.add(p); return p;
}
/** A seated person (desk, auditorium seat, food court table) facing `yaw`. */
function seated(g: THREE.Object3D, x: number, z: number, yaw: number, look = eraLook('presentFinale', (rnd() * 1e6) | 0)) {
  const a = new Avatar(look, 0.95); a.sit(true); a.root.position.set(x, -0.32, z); a.root.rotation.y = yaw; g.add(a.root); return a;
}
function standing(g: THREE.Object3D, x: number, z: number, yaw: number, look = eraLook('presentFinale', (rnd() * 1e6) | 0)) {
  const a = new Avatar(look); a.root.position.set(x, 0, z); a.root.rotation.y = yaw; g.add(a.root); return a;
}
const wallX = (x0: number, x1: number, z: number, gaps: [number, number][] = [], h?: number): Rect[] => {
  const out: Rect[] = []; let s = x0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) { if (a > s) out.push({ x0: s, z0: z - 0.15, x1: a, z1: z + 0.15, h }); s = b; }
  if (x1 > s) out.push({ x0: s, z0: z - 0.15, x1, z1: z + 0.15, h }); return out;
};
const wallZ = (z0: number, z1: number, x: number): Rect => ({ x0: x - 0.15, z0, x1: x + 0.15, z1 });

// ---------------------------------------------------------------- classrooms
function classrooms(name: string, num: number): CampusLayout {
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
    floor: '#8f8a80', wall: '#e8e2d6', walls, props, signs: [{ text: [name], x: 0, z: 1.6, ry: Math.PI }, ...signs],
    decorate: g => {
      seed = num * 31 + 7;
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
        if (inSession) standing(g, cx - 1.5, n ? -11.4 : 11.2, n ? 0 : Math.PI, eraLook('byui', (rnd() * 1e6) | 0));
      }
    },
  };
}

// ---------------------------------------------------------------- auditorium (I-Center)
function auditorium(): CampusLayout {
  const blockers: Rect[] = [];
  const rows: number[] = []; for (let z = -11; z <= 18; z += 1.35) rows.push(z);
  const segs: [number, number][] = [[-27, -13.5], [-11.5, -1.5], [1.5, 11.5], [13.5, 27]];
  for (const z of rows) for (const [a, b] of segs) blockers.push({ x0: a, z0: z - 0.35, x1: b, z1: z + 0.35 });
  return {
    floor: '#5a4a5e', wall: '#e6dfd2', blockers,
    props: [{ x0: -20, z0: -24.5, x1: 20, z1: -16, h: 1.1, color: '#7a5a3a' }],                       // stage
    signs: [{ text: ['Auditorium'], x: 0, z: 23, ry: Math.PI }],
    decorate: g => {
      seed = 99;
      const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.12, 0.5), lambert('#2f3e6b'), 1200);
      const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.6, 0.08), lambert('#2f3e6b'), 1200);
      const m = new THREE.Matrix4(); let n = 0; const people: [number, number][] = [];
      for (const z of rows) for (const [a, b] of segs) for (let x = a + 0.35; x < b - 0.2; x += 0.62) {
        m.makeTranslation(x, 0.45, z); seat.setMatrixAt(n, m); m.makeTranslation(x, 0.75, z + 0.25); back.setMatrixAt(n, m); n++;
        if (rnd() < 0.06 && people.length < 45) people.push([x, z]);
      }
      seat.count = back.count = n; seat.frustumCulled = back.frustumCulled = false; seat.castShadow = back.castShadow = true; g.add(seat, back);   // instances span the hall: skip culling
      for (const [x, z] of people) seated(g, x, z - 0.05, Math.PI);
      // stage: pulpit, choir seats, organ pipes, a wide backdrop
      box(g, 1.1, 1.25, 0.8, '#5a3a22', 0, 1.1 + 0.62, -17.2); box(g, 1.2, 0.08, 0.9, '#3a2614', 0, 1.1 + 1.27, -17.2);
      for (let i = 0; i < 3; i++) for (let x = -12; x <= 12; x += 0.7) box(g, 0.5, 0.45, 0.5, '#6b2f3a', x, 1.1 + 0.22 + i * 0.4, -21.5 - i * 0.9);
      for (let i = 0; i < 18; i++) box(g, 0.35, 3 + Math.sin(i * 0.7) * 1.2 + 1.5, 0.35, '#c9a43a', -6 + i * 0.7, 1.1 + 2.2, -24.2);
      box(g, 40, 6, 0.2, '#efe9de', 0, 4, -24.8);
      standing(g, 0, -17.9, 0, { shirt: '#ffffff', jacket: '#2b2f3a', pants: '#2b2f3a', tie: '#7a2b2b', hair: '#6d655c', skin: '#e0b896', hairStyle: 'short' }).root.position.y = 1.1;
    },
  };
}

// ---------------------------------------------------------------- food court + presidents gallery (Manwaring)
/** Principals and presidents (term start year), from the school's published list. Names and years only. */
const PRESIDENTS: { name: string; from: number; to: number | null; title: string }[] = [
  { name: 'Jacob Spori', from: 1888, to: 1891, title: 'Principal' }, { name: 'Charles N. Watkins', from: 1891, to: 1894, title: 'Principal' },
  { name: 'George Cole', from: 1894, to: 1899, title: 'Principal' }, { name: 'Douglas M. Todd', from: 1899, to: 1901, title: 'Principal' },
  { name: 'Ezra C. Dalby', from: 1901, to: 1914, title: 'Principal' }, { name: 'Andrew B. Christenson', from: 1914, to: 1917, title: 'Principal' },
  { name: 'George S. Romney', from: 1917, to: 1931, title: 'President' }, { name: 'Hyrum Manwaring', from: 1931, to: 1944, title: 'President' },
  { name: 'John L. Clarke', from: 1944, to: 1971, title: 'President' }, { name: 'Henry B. Eyring', from: 1971, to: 1977, title: 'President' },
  { name: 'Bruce C. Hafen', from: 1978, to: 1985, title: 'President' }, { name: 'Joe J. Christensen', from: 1985, to: 1989, title: 'President' },
  { name: 'Steven D. Bennion', from: 1989, to: 1997, title: 'President' }, { name: 'David A. Bednar', from: 1997, to: 2004, title: 'President' },
  { name: 'Robert M. Wilkes', from: 2004, to: 2005, title: 'Interim President' }, { name: 'Kim B. Clark', from: 2005, to: 2015, title: 'President' },
  { name: 'Clark G. Gilbert', from: 2015, to: 2017, title: 'President' }, { name: 'Henry J. Eyring', from: 2017, to: 2023, title: 'President' },
  { name: 'Alvin F. Meredith III', from: 2023, to: null, title: 'President' },
];
function portraitCanvas(p: typeof PRESIDENTS[number], year: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const g = c.getContext('2d')!;
  g.fillStyle = '#5a3a1a'; g.fillRect(0, 0, 256, 320); g.fillStyle = '#c9a43a'; g.fillRect(10, 10, 236, 300);
  g.fillStyle = '#efe7d6'; g.fillRect(22, 22, 212, 276);
  g.fillStyle = '#9a9286'; g.beginPath(); g.arc(128, 105, 42, 0, Math.PI * 2); g.fill();      // generic silhouette (no likeness)
  g.beginPath(); g.ellipse(128, 215, 70, 55, 0, Math.PI, 0); g.fill(); g.fillRect(58, 214, 140, 18);
  g.fillStyle = '#2a211b'; g.textAlign = 'center'; g.font = 'bold 19px Georgia';
  const words = p.name.split(' '); const l1 = words.slice(0, Math.ceil(words.length / 2)).join(' '), l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
  g.fillText(l1, 128, 252); g.fillText(l2, 128, 272);
  g.font = '14px system-ui'; g.fillStyle = '#5a3a1a';
  const current = p.to === null || p.to > year;
  g.fillText(`${p.title} · ${p.from}–${current ? 'present' : p.to}`, 128, 292);
  return c;
}
function foodcourt(): CampusLayout {
  const props: Rect[] = [], tables: [number, number][] = [];
  for (const [a, b] of [[-20, -11], [-8, 1], [4, 13], [16, 22]] as [number, number][]) props.push({ x0: a, z0: -16.4, x1: b, z1: -15.2, h: 1.05, color: '#8a5a3a' });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = -12 + i * 8, z = -7 + j * 6; tables.push([x, z]); props.push({ x0: x - 0.7, z0: z - 0.7, x1: x + 0.7, z1: z + 0.7, h: 0.75, color: '#c9b48a' }); }
  let frames: { mesh: THREE.Mesh; p: typeof PRESIDENTS[number] }[] = [];
  let title: THREE.Mesh | null = null;
  return {
    floor: '#b8ad9a', wall: '#efe7da', props,
    signs: [{ text: ['Food Court'], x: 0, z: 17.6, ry: Math.PI }],
    decorate: g => {
      seed = 7;
      const stalls: [string, number][] = [['Grill', -15.5], ['Pizza', -3.5], ['Deli & Salads', 8.5], ['Smoothies', 19]];
      for (const [nm, x] of stalls) {
        plaque(g, [nm], x, 3.0, -17.4, 0, 4, '#8d3b2f');
        standing(g, x - 1.2, -16.9, 0, { shirt: '#b8423a', pants: '#2b2f3a', hair: '#2a1d14', skin: ['#e0b48f', '#c68c64', '#f0c9a4'][(rnd() * 3) | 0], hat: 'cap', hatColor: '#b8423a' });
        for (let k = 0; k < 2; k++) if (rnd() < 0.7) standing(g, x + (k - 0.5) * 1.1, -13.8 - k * 0.9, Math.PI);   // customers in line
        box(g, 1.4, 0.5, 0.4, '#f0e6d0', x + 1, 1.3, -15.8);                                                   // food display
      }
      for (const [x, z] of tables) {
        const seats: [number, number, number][] = [[x, z - 1.05, 0], [x, z + 1.05, Math.PI], [x - 1.05, z, Math.PI / 2], [x + 1.05, z, -Math.PI / 2]];
        for (const [sx, sz] of seats) box(g, 0.45, 0.45, 0.45, '#5a6a7a', sx, 0.22, sz);
        if (rnd() < 0.6) for (const [sx, sz, yaw] of seats) if (rnd() < 0.6) seated(g, sx, sz, yaw);
        box(g, 0.3, 0.05, 0.3, '#ffffff', x + 0.2, 0.78, z);                                                  // a tray
      }
      // presidents gallery along the west wall
      title = plaque(g, ['Presidents of Ricks College'], -24.6, 3.3, 0, Math.PI / 2, 6, '#2a211b');
      frames = PRESIDENTS.map((p, i) => {
        const tex = new THREE.CanvasTexture(portraitCanvas(p, 1999)); tex.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshBasicMaterial({ map: tex }));
        mesh.position.set(-24.62, i % 2 ? 1.4 : 2.75, -14 + Math.floor(i / 2) * 3.1 + (i % 2) * 1.55); mesh.rotation.y = Math.PI / 2; g.add(mesh);
        return { mesh, p };
      });
    },
    onEra: era => {
      const year = ERAS[era].year;
      for (const f of frames) {
        f.mesh.visible = f.p.from <= year;
        const m = f.mesh.material as THREE.MeshBasicMaterial; (m.map as THREE.CanvasTexture).image = portraitCanvas(f.p, year); m.map!.needsUpdate = true;
      }
      if (title) { const m = title.material as THREE.MeshBasicMaterial; m.map = new THREE.CanvasTexture(textCanvas([ERAS[era].institution === 'byui' ? 'Presidents of Ricks College and BYU–Idaho' : 'Presidents of Ricks College'], { w: 512, h: 128, bg: '#2a211b' })); m.map.colorSpace = THREE.SRGBColorSpace; m.needsUpdate = true; }
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
    floor: '#9a8f7e', wall: '#ece6da', walls, props,
    signs: [{ text: ['Student services', '(layout is an approximation)'], x: 0, z: 1.8, ry: Math.PI },
      ...units.map(u => ({ text: [u.name], x: u.x, z: u.side === 'n' ? -1.8 : 1.8, ry: u.side === 'n' ? Math.PI : 0 }))],
    decorate: g => {
      seed = 55;
      for (const u of units) if (rnd() < 0.75) standing(g, u.x, u.side === 'n' ? -6.2 : 5.6, u.side === 'n' ? 0 : Math.PI, eraLook('byui', (rnd() * 1e6) | 0));
      for (let i = 0; i < 5; i++) standing(g, -26 + rnd() * 52, -1 + rnd() * 2, rnd() * 6.28);                     // people in the hall
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
function register(id: string, kind: 'classrooms' | 'auditorium' | 'foodcourt' | 'offices', i: number) {
  const b = BUILDINGS.find(x => x.id === id); if (!b) return;
  const eras = ERA_IDS.filter(e => eraState(b, ERAS[e].year) === 'standing' || (id === 'icenter' && e !== 'ricks1999') || (id === 'taylor'));
  if (!eras.length) return;
  const name = b.names.ricks ?? b.names.byui ?? id;
  const anchor = doorAnchor(id); if (!anchor) return;
  const key = `bldg-${id}`, doorId = `door.${key}`;
  anchor.label = `${name} entrance`;
  (GAME_CONFIG.locations as Record<string, unknown>)[doorId] = anchor;
  const size = kind === 'classrooms' ? [40, 26] : kind === 'auditorium' ? [56, 50] : kind === 'foodcourt' ? [50, 36] : [64, 14];
  const label = kind === 'classrooms' ? `${name} — classrooms` : kind === 'auditorium' ? `${b.names.byui && id === 'icenter' ? 'Campus Center' : name} — auditorium` : kind === 'foodcourt' ? `${name} — food court & presidents gallery` : `${b.names.byui ?? name} — offices`;
  (GAME_CONFIG.interiors as Record<string, unknown>)[key] = { label, width: size[0], depth: size[1], exteriorDoor: doorId, eras, building: id };
  CAMPUS_LAYOUTS[key] = kind === 'classrooms' ? classrooms(name, 100 + i * 100) : kind === 'auditorium' ? auditorium() : kind === 'foodcourt' ? foodcourt() : offices();
}
CLASSROOM_BUILDINGS.forEach((id, i) => register(id, 'classrooms', i));
for (const [id, kind] of Object.entries(SPECIAL)) register(id, kind, 0);
