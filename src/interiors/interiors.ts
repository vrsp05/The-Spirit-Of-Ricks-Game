// Reusable interior scaffolds. Each interior lives at its own far-away origin and
// is shown only while the player is inside it. Entry/exit always pairs with a
// configured exterior door anchor so the player returns to the right spot.
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Space } from '../player/PlayerController';
import { textCanvas } from '../world/World';

interface Rect { x0: number; z0: number; x1: number; z1: number; h?: number; color?: string }
export interface InteriorDef {
  id: string; label: string; width: number; depth: number; exteriorDoor: string;
  floor: string; wall: string; walls: Rect[]; props: Rect[]; signs: { text: string[]; x: number; z: number; ry: number }[];
}

// Layout extras per interior. STC layout is an APPROXIMATION (no verified floor
// plan used): entrance lobby + opening into a celebration hall to the north.
const LAYOUTS: Record<string, Partial<InteriorDef>> = {
  // Simple, not a floor plan: entrance hall leading north into the president's office.
  'kimball-office': {
    floor: '#8b6f55', wall: '#ece4d4',
    walls: [
      { x0: -7, z0: -2.3, x1: -1.6, z1: -1.8 }, { x0: 1.6, z0: -2.3, x1: 7, z1: -1.8 },   // office wall with doorway
      { x0: -7, z0: -1.8, x1: -2.6, z1: 11, h: 3.6, color: '#d8cfbe' },                   // hall side blocks
      { x0: 2.6, z0: -1.8, x1: 7, z1: 11, h: 3.6, color: '#d8cfbe' },
    ],
    props: [
      { x0: -2.4, z0: -9.2, x1: 2.4, z1: -8.0, h: 0.95, color: '#5a3a22' },   // desk
      { x0: -6.6, z0: -10.6, x1: -3.4, z1: -10.2, h: 2.4, color: '#4a3020' }, // bookshelves
      { x0: 3.4, z0: -10.6, x1: 6.6, z1: -10.2, h: 2.4, color: '#4a3020' },
      { x0: -5.5, z0: -5, x1: -4.3, z1: -3.8, h: 0.6, color: '#6b2f2a' },     // chairs
      { x0: 4.3, z0: -5, x1: 5.5, z1: -3.8, h: 0.6, color: '#6b2f2a' },
    ],
    signs: [
      { text: ['Office of the President'], x: 0, z: -10.9, ry: 0 },
      { text: ['Kimball Building'], x: 0, z: -2.0, ry: Math.PI },
    ],
  },
  'dev-quest-room': {
    floor: '#b9a68a', wall: '#e6dccb',
    props: [{ x0: -5, z0: -4, x1: 5, z1: -2.6, h: 0.9, color: '#6f5037' }, { x0: -7.4, z0: -5.8, x1: 7.4, z1: -5.5, h: 2.6, color: '#f7f7f2' }],
    signs: [{ text: ['QUEST ROOM SCAFFOLD', '(development example)'], x: 0, z: -5.4, ry: 0 }],
  },
  'stc-first-floor': {
    floor: '#cfc9be', wall: '#eeeae2',
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
      const L = LAYOUTS[id] ?? {};
      const def: InteriorDef = { id, label: cfg.label, width: cfg.width, depth: cfg.depth, exteriorDoor: cfg.exteriorDoor,
        floor: L.floor ?? '#b9a68a', wall: L.wall ?? '#e6dccb', walls: L.walls ?? [], props: L.props ?? [], signs: L.signs ?? [] };
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
    const W = d.width, D = d.depth, H = 3.6;
    // checker floor
    const fc = document.createElement('canvas'); fc.width = W * 8; fc.height = D * 8;
    const fx = fc.getContext('2d')!;
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) { fx.fillStyle = (i + j) % 2 ? d.floor : shade(d.floor, 0.92); fx.fillRect(i * 8, j * 8, 8, 8); }
    const ft = new THREE.CanvasTexture(fc); ft.magFilter = THREE.NearestFilter; ft.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: ft }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const wallMat = new THREE.MeshLambertMaterial({ color: d.wall });
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
    for (const p of d.props) addBox(p, p.h ?? 1, new THREE.MeshLambertMaterial({ color: p.color ?? '#7a6a5a' }));
    // exit mat
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), new THREE.MeshLambertMaterial({ color: '#6b2f2a' }));
    mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.02, D / 2 - 0.8); g.add(mat);
    for (const s of d.signs) {
      const tex = new THREE.CanvasTexture(textCanvas(s.text, { w: 512, h: 128, bg: '#2d3a46' })); tex.colorSpace = THREE.SRGBColorSpace;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex }));
      p.position.set(s.x, 2.6, s.z); p.rotation.y = s.ry === Math.PI ? 0 : s.ry; g.add(p);
    }
    return g;
  }

  space(id: string): Space {
    const d = this.defs.get(id)!, o = this.origin(id);
    const rects: Rect[] = [...d.walls, ...d.props];
    return {
      id, interior: true,
      groundY: () => 0,
      blocked: (x, z, r) => {
        const lx = x - o.x, lz = z - o.z;
        if (lx - r < -d.width / 2 || lx + r > d.width / 2 || lz - r < -d.depth / 2) return true;
        if (lz + r > d.depth / 2 - 0.2) return true; // exit is via the door interactable
        return rects.some(q => lx + r > q.x0 && lx - r < q.x1 && lz + r > q.z0 && lz - r < q.z1);
      },
      occluderTop: () => 0,
    };
  }
  show(id: string | null) { for (const [k, g] of this.groups) g.visible = k === id; }
}

function shade(hex: string, f: number) { const c = new THREE.Color(hex).multiplyScalar(f); return '#' + c.getHexString(); }
