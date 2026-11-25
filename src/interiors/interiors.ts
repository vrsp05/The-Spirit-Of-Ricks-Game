// Reusable interior scaffolds. Each interior lives at its own far-away origin and
// is shown only while the player is inside it. Entry/exit always pairs with a
// configured exterior door anchor so the player returns to the right spot.
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Space } from '../player/PlayerController';
import { textCanvas } from '../world/World';
import { CAMPUS_LAYOUTS, updateActors, actorSpots } from './campusInteriors';
import { box, bulletin, clock, column, dressRoom, flagStand, floorTexture, floorZone, globe, painting, pendant, plant, poster, rug, screen, solidsOf, waterCooler, deskLamp, type FloorStyle } from './decor';
import type { EraId } from '../world/eras';

interface Rect { x0: number; z0: number; x1: number; z1: number; h?: number; color?: string }
export interface InteriorDef {
  id: string; label: string; width: number; depth: number; exteriorDoor: string;
  floor: string; wall: string; walls: Rect[]; props: Rect[]; signs: { text: string[]; x: number; z: number; ry: number; y?: number; sx?: number; sy?: number }[];
  blockers?: Rect[]; decorate?: (g: THREE.Group) => void; onEra?: (era: EraId) => void;
  /** Floor material (default: checker tiles) and whether the dressing pass adds windows. */
  floorStyle?: FloorStyle; windows?: boolean;
  /** Wall height (default 3.6 m; atriums and halls are taller). */
  height?: number;
}

// Layout extras per interior. STC layout is an APPROXIMATION (no verified floor
// plan used): entrance lobby + opening into a celebration hall to the north.
const LAYOUTS: Record<string, Partial<InteriorDef>> = {
  // Simple, not a floor plan: entrance hall leading north into the president's office,
  // with Personnel Services opening off the east side of the hall. The Kimball Building
  // housed "personnel" among its administrative services (Church News, Sept 11, 1999).
  // CONTRACT ADDITION (Q1): Personnel Services room for the Quest 1 faculty candidates.
  'kimball-office': {
    floor: '#8b6f55', wall: '#ece4d4', floorStyle: 'wood',
    decorate: g => {
      // the president's office: a rug, flags, plants, paintings, a globe and a tidy desk
      rug(g, 0, -6.6, 7, 5.4, '#6b2f2a', '#c9a43a');
      flagStand(g, -3.1, -10.3, ['#7a2b2b', '#f4f1e8', '#2f4f7f']); flagStand(g, 3.1, -10.3, ['#c9a43a', '#2f4f7f']);
      plant(g, -9.3, -10.3, 1.1); plant(g, 9.3, -10.3, 1.1); globe(g, -8.6, -3.4);
      painting(g, -9.97, 2.0, -6.5, Math.PI / 2, 1.6, 1.05, 1); painting(g, 9.97, 2.0, -6.5, -Math.PI / 2, 1.6, 1.05, 2);
      deskLamp(g, -1.8, 0.95, -8.7); box(g, 0.34, 0.08, 0.26, '#2f5f9e', 1.9, 0.99, -8.5); box(g, 0.32, 0.08, 0.24, '#8d2f2f', 1.9, 1.07, -8.5); box(g, 0.5, 0.01, 0.35, '#f4f1e8', -0.6, 0.955, -8.4);
      clock(g, 0, 3.05, -10.97, 0);
      // the hall, like the real Kimball atrium: polished terrazzo, white round columns, warm wood panels
      floorZone(g, 0, 4.6, 5.2, 12.8, 'terrazzo', '#e6e2da');
      for (const z of [0.4, 9.6]) { column(g, -2.05, z, 3.6, 0.28); }
      for (let z = -1.4; z < 10.8; z += 1.2) box(g, 0.05, 2.4, 1.1, z % 2.4 < 1.2 ? '#9a6b44' : '#8d6140', -2.57, 1.2, z + 0.6, false);
      box(g, 0.05, 2.4, 3.6, '#9a6b44', 2.57, 1.2, 0.3, false); box(g, 0.05, 2.4, 2.4, '#9a6b44', 2.57, 1.2, 9.8, false);
      pendant(g, 0, 1.5, 3.0); pendant(g, 0, 6.5, 3.0);
      bulletin(g, -2.58, 1.6, 4.2, Math.PI / 2, 2.2); plant(g, -2.05, 10.2, 0.9); plant(g, 2.05, 7.9, 0.9);
      // Personnel Services: a water cooler, a plant, a clock and a notice about the interviews
      waterCooler(g, 9.5, -1.4); plant(g, 3.4, 8.1, 0.9); clock(g, 9.97, 2.8, 5.8, -Math.PI / 2);
      poster(g, ['Please take a seat —', 'we will call your name'], 9.97, 2.0, 2.0, -Math.PI / 2, 1.6, 0.7, '#3f5a6b');
    },
    walls: [
      { x0: -10, z0: -2.3, x1: -1.6, z1: -1.8 }, { x0: 1.6, z0: -2.3, x1: 10, z1: -1.8 },  // office wall with doorway
      { x0: -10, z0: -1.8, x1: -2.6, z1: 11, h: 3.6, color: '#d8cfbe' },                  // west hall block
      { x0: 2.6, z0: -1.8, x1: 3.0, z1: 2.4 }, { x0: 2.6, z0: 5.8, x1: 3.0, z1: 8.6 },    // Personnel Services wall, doorway z 2.4–5.8
      { x0: 2.6, z0: 8.6, x1: 10, z1: 11, h: 3.6, color: '#d8cfbe' },                     // block south of Personnel Services
    ],
    props: [
      { x0: -2.4, z0: -9.2, x1: 2.4, z1: -8.0, h: 0.95, color: '#5a3a22' },   // desk
      { x0: -6.6, z0: -10.6, x1: -3.4, z1: -10.2, h: 2.4, color: '#4a3020' }, // bookshelves
      { x0: 3.4, z0: -10.6, x1: 6.6, z1: -10.2, h: 2.4, color: '#4a3020' },
      { x0: -5.5, z0: -5, x1: -4.3, z1: -3.8, h: 0.6, color: '#6b2f2a' },     // chairs
      { x0: 4.3, z0: -5, x1: 5.5, z1: -3.8, h: 0.6, color: '#6b2f2a' },
      // Personnel Services: reception counter, waiting chairs, file cabinets
      { x0: 8.2, z0: -0.6, x1: 9.6, z1: 3.6, h: 1.1, color: '#7b5a3e' },
      { x0: 9.2, z0: 5.0, x1: 9.8, z1: 5.6, h: 0.5, color: '#3f5a6b' }, { x0: 9.2, z0: 6.2, x1: 9.8, z1: 6.8, h: 0.5, color: '#3f5a6b' },
      { x0: 9.2, z0: 7.4, x1: 9.8, z1: 8.0, h: 0.5, color: '#3f5a6b' },
      { x0: 3.3, z0: -1.7, x1: 4.3, z1: -1.2, h: 1.4, color: '#8a8a80' }, { x0: 4.4, z0: -1.7, x1: 5.4, z1: -1.2, h: 1.4, color: '#8a8a80' },
    ],
    signs: [
      { text: ['Office of the President'], x: 0, z: -10.9, ry: 0 },
      // over the office doorway: high and slim, so it doesn't block the view into the office (the opening scene uses the same size)
      { text: ['Kimball Building'], x: 0, z: -2.0, ry: Math.PI, y: 3.48, sx: 0.72, sy: 0.36 },
      { text: ['Personnel Services'], x: 2.5, z: 4.1, ry: -Math.PI / 2 },
      { text: ['Faculty interviews today'], x: 7.2, z: -1.7, ry: 0 },
    ],
  },
  // CONTRACT ADDITION (Q1): teaching-demo classrooms. Furniture, boards and people are placed
  // by the Q1 module (src/quests/q1/room3d.ts); only floor/wall colours live here.
  'q1-room-math': { floor: '#6e7276', wall: '#dedcd6', floorStyle: 'tile', windows: false, signs: [{ text: ['Romney · Math & Computer Science'], x: 0, z: 6.9, ry: Math.PI }] },
  'q1-room-english': { floor: '#6c6f76', wall: '#dedcd6', floorStyle: 'tile', windows: false, signs: [{ text: ['Smith Building · English'], x: 0, z: 6.9, ry: Math.PI }] },
  'q1-room-art': { floor: '#7a5a3a', wall: '#cbbfa8', floorStyle: 'wood', windows: false, signs: [{ text: ['Spori Building · Art studio'], x: 0, z: 6.9, ry: Math.PI }] },
  'q1-room-engineering': { floor: '#5a5a5a', wall: '#d9d6cc', floorStyle: 'tile', windows: false, signs: [{ text: ['Austin Building · Electronics lab'], x: 0, z: 6.9, ry: Math.PI }] },
  'dev-quest-room': {
    floor: '#b9a68a', wall: '#e6dccb', windows: false,
    props: [{ x0: -5, z0: -4, x1: 5, z1: -2.6, h: 0.9, color: '#6f5037' }, { x0: -7.4, z0: -5.8, x1: 7.4, z1: -5.5, h: 2.6, color: '#f7f7f2' }],
    signs: [{ text: ['QUEST ROOM SCAFFOLD', '(development example)'], x: 0, z: -5.4, ry: 0 }],
  },
  'stc-first-floor': {
    floor: '#d4cec3', wall: '#eeeae2', floorStyle: 'tile',
    decorate: g => {
      // plants along the walls, screens about the labs, a welcome banner (kept clear of the finale's stage area)
      for (const [x, z] of [[-23, 13.6], [23, 13.6], [-23, -2], [23, -2], [-6, 13.6], [6, 13.6]]) plant(g, x, z, 1.1);
      screen(g, -23.95, 2.2, 7, Math.PI / 2, 2.2, ['Robotics lab', 'Room 120'], '#1f4e8c');
      screen(g, 23.95, 2.2, 7, -Math.PI / 2, 2.2, ['Chemistry labs', 'Second floor'], '#3f6f4a');
      for (let x = -16; x <= 16; x += 8) pendant(g, x, 9, 2.9);
    },
    walls: [{ x0: -24, z0: -3.3, x1: -5, z1: -2.7 }, { x0: 5, z0: -3.3, x1: 24, z1: -2.7 }],
    props: [
      { x0: -3, z0: 6, x1: 3, z1: 7.5, h: 1.1, color: '#5b6b7a' },          // welcome desk
      { x0: -18, z0: 4, x1: -12, z1: 5, h: 0.5, color: '#8a6d4b' },        // benches
      { x0: 12, z0: 4, x1: 18, z1: 5, h: 0.5, color: '#8a6d4b' },
      { x0: -8, z0: -14.6, x1: 8, z1: -11.5, h: 0.6, color: '#7b5a3e' },   // stage
    ],
    signs: [
      { text: ['Science and Technology Center'], x: 0, z: -2.6, ry: Math.PI },
      { text: ['Layout is an approximation', 'not a verified floor plan'], x: 14, z: -2.6, ry: Math.PI },
    ],
  },
};

export class InteriorManager {
  readonly defs = new Map<string, InteriorDef>();
  readonly groups = new Map<string, THREE.Group>();
  private origins = new Map<string, THREE.Vector3>();

  constructor(scene: THREE.Scene) {
    let n = 0;
    for (const [id, cfg] of Object.entries(GAME_CONFIG.interiors)) {
      const L = (LAYOUTS[id] ?? CAMPUS_LAYOUTS[id] ?? {}) as Partial<InteriorDef>;
      const def: InteriorDef = { id, label: cfg.label, width: cfg.width, depth: cfg.depth, exteriorDoor: cfg.exteriorDoor,
        floor: L.floor ?? '#b9a68a', wall: L.wall ?? '#e6dccb', walls: L.walls ?? [], props: L.props ?? [], signs: L.signs ?? [],
        blockers: L.blockers, decorate: L.decorate, onEra: L.onEra, floorStyle: L.floorStyle, windows: L.windows, height: L.height };
      this.defs.set(id, def);
      this.origins.set(id, new THREE.Vector3(20000 + n++ * 300, 0, 20000));
      const g = this.build(def); g.visible = false; this.groups.set(id, g); scene.add(g);
    }
  }

  origin(id: string) { return this.origins.get(id)!; }
  /** Local (room-centred) coordinates -> world coordinates. */
  toWorld(id: string, x: number, z: number) { const o = this.origin(id); return { x: o.x + x, z: o.z + z }; }
  entryPoint(id: string) { const d = this.defs.get(id)!; return this.toWorld(id, 0, d.depth / 2 - 2); }
  exitPoint(id: string) { const d = this.defs.get(id)!; return this.toWorld(id, 0, d.depth / 2 - 0.6); }

  private build(d: InteriorDef): THREE.Group {
    const g = new THREE.Group(); g.position.copy(this.origins.get(d.id)!);
    const W = d.width, D = d.depth, H = d.height ?? 3.6;
    // floor: wood planks, tiles, carpet, a sports court or the classic checker
    const ft = floorTexture(d.floorStyle ?? 'checker', d.floor, W, D);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ft, roughness: d.floorStyle === 'wood' || d.floorStyle === 'court' ? 0.55 : d.floorStyle === 'terrazzo' || d.floorStyle === 'mcTile' || d.floorStyle === 'darkTile' ? 0.35 : 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: d.wall });
    const addBox = (r: Rect, h: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, h, r.z1 - r.z0), mat);
      m.position.set((r.x0 + r.x1) / 2, h / 2, (r.z0 + r.z1) / 2); m.castShadow = m.receiveShadow = true; g.add(m);
    };
    // outer walls (south wall has a 3 m door gap); south walls are low so the camera can see in
    const t = 0.4;
    addBox({ x0: -W / 2 - t, z0: -D / 2 - t, x1: W / 2 + t, z1: -D / 2 }, H, wallMat);
    addBox({ x0: -W / 2 - t, z0: -D / 2, x1: -W / 2, z1: D / 2 }, H, wallMat);
    addBox({ x0: W / 2, z0: -D / 2, x1: W / 2 + t, z1: D / 2 }, H, wallMat);
    addBox({ x0: -W / 2 - t, z0: D / 2, x1: -1.5, z1: D / 2 + t }, 1.2, wallMat);
    addBox({ x0: 1.5, z0: D / 2, x1: W / 2 + t, z1: D / 2 + t }, 1.2, wallMat);
    for (const r of d.walls) addBox(r, r.h ?? H, wallMat);
    for (const p of d.props) addBox(p, p.h ?? 1, new THREE.MeshStandardMaterial({ color: p.color ?? '#7a6a5a' }));
    // baseboards, chair rail, windows with daylight, wall lights
    dressRoom(g, W, D, d.wall, d.walls, { windows: d.windows, height: H });
    // exit mat
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), new THREE.MeshStandardMaterial({ color: '#6b2f2a' }));
    mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.02, D / 2 - 0.8); g.add(mat);
    for (const s of d.signs) {
      const tex = new THREE.CanvasTexture(textCanvas(s.text, { w: 512, h: 128, bg: '#2d3a46' })); tex.colorSpace = THREE.SRGBColorSpace;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex }));
      p.position.set(s.x, s.y ?? 2.6, s.z); p.scale.set(s.sx ?? 1, s.sy ?? 1, 1); p.rotation.y = s.ry === Math.PI ? 0 : s.ry; g.add(p);
    }
    return g;
  }

  space(id: string): Space {
    const d = this.defs.get(id)!, o = this.origin(id);
    const rects: Rect[] = [...d.walls, ...d.props, ...(d.blockers ?? [])];
    const g = this.groups.get(id)!;
    // furniture from the decoration pass and the people in the room are solid too
    const solids = () => solidsOf(g), people = () => actorSpots(g);
    return {
      id, interior: true,
      groundY: () => 0,
      blocked: (x, z, r) => {
        const lx = x - o.x, lz = z - o.z;
        if (lx - r < -d.width / 2 || lx + r > d.width / 2 || lz - r < -d.depth / 2) return true;
        if (lz + r > d.depth / 2 - 0.2) return true; // exit is via the door interactable
        if (rects.some(q => lx + r > q.x0 && lx - r < q.x1 && lz + r > q.z0 && lz - r < q.z1)) return true;
        if (solids().some(q => lx + r > q.x0 && lx - r < q.x1 && lz + r > q.z0 && lz - r < q.z1)) return true;
        return people().some(p => (p[0] - lx) ** 2 + (p[1] - lz) ** 2 < (r + 0.28) ** 2);
      },
      occluderTop: () => 0,
    };
  }
  private decorated = new Set<string>();
  private current: string | null = null; private t = 0;
  /** Animate the people in the room the player is in. */
  update(dt: number) { this.t += dt; const g = this.current ? this.groups.get(this.current) : null; if (g) updateActors(g, dt, this.t); }
  /** Show one interior (null = none). Furniture/people are built on first entry; era-dependent bits refresh. */
  show(id: string | null, era?: EraId) {
    for (const [k, g] of this.groups) g.visible = k === id;
    this.current = id;
    if (!id) return;
    const d = this.defs.get(id), g = this.groups.get(id);
    if (d?.decorate && g && !this.decorated.has(id)) { this.decorated.add(id); d.decorate(g); }
    if (d?.onEra && era) d.onEra(era);
  }
}

