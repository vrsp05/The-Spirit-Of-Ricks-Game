// Q1 in-room teaching demos: builds each classroom's furniture, students and chair inside
// its interior, plus live "surfaces" (chalkboard, poster, projector screen) the demos draw
// on, camera views the player switches between, speech bubbles and prop signals
// (projector lamp/fan, fuse box, art projector). Uses only the quest contract.
import * as THREE from 'three';
import type { QuestContext } from '../contract';
import { CLASSROOM } from './classroom';

type V3 = { x: number; y: number; z: number };
export type RoomId = 'math' | 'english' | 'art' | 'engineering';
export interface Surface { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; w: number; h: number; refresh(): void }
/** A clickable rectangle on a surface, in canvas pixels. `on` gets the canvas point; drag = pointer moved while held. */
export interface Hotspot { x: number; y: number; w: number; h: number; on: (pt: { x: number; y: number }, kind: 'down' | 'drag', button: number) => void; drag?: boolean }
/** The game camera's vertical field of view (mirrored so clicks can be traced onto board surfaces). */
const GAME_FOV = 55;
interface ViewDef { label: string; from: V3; to: V3 }

const VIEWS: Record<RoomId, Record<string, ViewDef>> = {
  math: {
    board: { label: 'Chalkboard', from: { x: 0, y: 2.0, z: -0.9 }, to: { x: 0, y: 1.85, z: -6.8 } },
    poster: { label: 'Coin poster', from: { x: -1.9, y: 1.9, z: -1.6 }, to: { x: -7.8, y: 1.5, z: -1.6 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
  english: {
    board: { label: 'Projector screen', from: { x: 0, y: 2.0, z: -0.9 }, to: { x: 0, y: 1.85, z: -6.8 } },
    poster: { label: 'Fact clipping', from: { x: -2.4, y: 1.9, z: -1.6 }, to: { x: -7.8, y: 1.4, z: -1.6 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
  art: {
    board: { label: 'Drawing board', from: { x: 0, y: 2.25, z: -2.5 }, to: { x: 0, y: 1.45, z: -6.8 } },
    poster: { label: 'Projected reference', from: { x: 0.2, y: 2.2, z: -1.6 }, to: { x: -7.8, y: 0.3, z: -1.6 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
  engineering: {
    bench: { label: 'Lab bench', from: { x: 0.3, y: 2.8, z: -1.15 }, to: { x: 0.3, y: 1.25, z: -4.4 } },
    board: { label: 'Wall board', from: { x: 0, y: 2.3, z: -1.6 }, to: { x: 0, y: 2.1, z: -6.8 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
};

// Seats at two-person tables in rows, centre aisle (like a typical lecture room)
const DESKS: [number, number][] = [[-4.1, 0.6], [-2.3, 0.6], [2.3, 0.6], [4.1, 0.6], [-4.1, 3.2], [2.3, 3.2], [4.1, 3.2], [-2.3, 3.2]];
const TABLES: [number, number][] = [[-3.2, 0.6], [3.2, 0.6], [-3.2, 3.2], [3.2, 3.2]];

export class Room3D {
  readonly id: RoomId;
  private ctx: QuestContext;
  private base: V3;
  private removers: (() => void)[] = [];
  private surfaces = new Map<string, Surface>();
  private people: THREE.Object3D[] = [];
  private chair!: THREE.Object3D;
  private hops = new Map<THREE.Object3D, number>();
  private bubbles: { obj: THREE.Object3D; t: number; parent: THREE.Object3D }[] = [];
  private props = new Map<string, THREE.Object3D>();
  private cam: { from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private target: { from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private fanSpeed = 0;
  private ceiling!: THREE.Group;
  private fuseT = 0;
  private meshes = new Map<string, THREE.Mesh>();
  private hot = new Map<string, Hotspot[]>();          // key `${surface}:${layer}`
  private overlays = new Map<string, (s: Surface) => void>();
  private pointerOff: (() => void) | null = null;
  private regions = new Map<string, { surface: string; x: number; y: number; w: number; h: number }>();
  current = '';
  active = false;

  constructor(ctx: QuestContext, id: RoomId) {
    this.ctx = ctx; this.id = id;
    const p = ctx.world.position(`q1.room.${id}`);
    this.base = { x: p.x, y: p.y, z: p.z };
    this.build();
  }

  // ---------- building ----------
  private place(obj: THREE.Object3D, x: number, z: number, y = 0, ry = 0) {
    this.removers.push(this.ctx.world.addObject(obj, { x, z, space: `q1-room-${this.id}` }));
    obj.position.y += y; obj.rotation.y = ry;
    return obj;
  }
  private box(w: number, h: number, d: number, color: string, x: number, z: number, y = 0, ry = 0) {
    const m = this.ctx.world.voxel(w, h, d, color); m.position.y = h / 2;
    const g = new THREE.Group(); g.add(m); return this.place(g, x, z, y, ry);
  }
  private surface(name: string, w: number, h: number, px: number, x: number, y: number, z: number, ry: number, rx = 0) {
    const canvas = document.createElement('canvas'); canvas.width = Math.round(w * px); canvas.height = Math.round(h * px);
    const g = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.rotation.x = rx;
    const grp = new THREE.Group(); grp.add(mesh);
    this.place(grp, x, z, y, ry);
    const s: Surface = { canvas, g, w: canvas.width, h: canvas.height, refresh: () => { this.overlays.get(name)?.(s); tex.needsUpdate = true; } };
    this.surfaces.set(name, s); this.meshes.set(name, mesh);
    if (name === 'board') { chalk(s, this.id === 'english' ? '#f7f5ee' : this.id === 'engineering' ? '#22303a' : this.id === 'art' ? '#34463d' : '#2f4a3c'); s.refresh(); }
    else { g.fillStyle = this.id === 'art' ? '#4f5a63' : '#efe3c2'; g.fillRect(0, 0, canvas.width, canvas.height); s.refresh(); }
    return s;
  }
  private build() {
    const room = CLASSROOM.rooms[this.id];
    const dark = (c: string) => c;
    // front wall surface (board / screen)
    if (this.id === 'english') {
      this.box(7.4, 0.15, 0.2, '#555', 0, -6.82, 3.45);                      // screen roller
      this.surface('board', 7, 2.4, 200, 0, 2.2, -6.86, 0);
      this.box(0.9, 0.9, 0.9, '#3b3f46', 3.0, -3.4);                         // projector cart (off to the side)
      const head = this.box(0.7, 0.35, 0.7, '#22262b', 3.0, -3.4, 0.9); this.props.set('projector', head);
    } else if (this.id === 'engineering') {
      this.surface('board', 6, 2.2, 160, 0, 2.2, -6.86, 0);
      this.box(7.0, 1.0, 1.6, '#16181b', 0, -4.3);                            // black lab bench
      // the projector's circuit board, pulled out and lying on the bench on a low stand, tilted toward the class
      this.box(1.8, 0.3, 0.9, '#3a2f22', -0.95, -4.35, 1.0);
      this.surface('peg', 1.7, 1.15, 400, -0.95, 1.72, -4.3, 0, -Math.PI / 2 + 0.75);
      this.box(0.6, 0.04, 0.08, '#b98a3c', 0.25, -4.3, 1.04);                 // ribbon cable to the projector
      this.buildProjector(1.6, -4.3, 1.0);
      const fuse = this.box(0.8, 1.0, 0.25, '#6b6f73', 7.6, -3.5, 1.4, -Math.PI / 2); this.props.set('fuse', fuse);
      const lamp = this.ctx.world.voxel(0.25, 0.25, 0.1, '#3a3a3a'); lamp.position.set(0, 0.7, 0.15); fuse.add(lamp); this.props.set('fuseLamp', lamp);
      for (const x of [-6, 6]) { this.box(0.9, 0.55, 0.6, '#2a3a2a', x, -4.3, 1.0); }  // oscilloscopes
    } else {
      this.box(7.4, 0.12, 0.25, '#5b4636', 0, -6.82, 0.75);                  // chalk tray
      this.surface('board', 7, 2.5, 200, 0, 2.2, -6.86, 0);
    }
    // west wall surface (poster / clipping / projected reference)
    if (this.id === 'math') this.surface('poster', 2.6, 3.2, 220, -7.88, 2.1, -1.6, Math.PI / 2);
    if (this.id === 'english') this.surface('poster', 2.2, 2.8, 220, -7.88, 2.0, -1.6, Math.PI / 2);
    if (this.id === 'art') {
      this.surface('poster', 2.4, 2.8, 170, -7.88, 2.5, -1.6, Math.PI / 2);
      this.box(0.9, 0.9, 0.9, '#3b3f46', -3.6, -4.4);                        // projector cart (out of the sight line)
      this.box(0.7, 0.35, 0.7, '#22262b', -3.6, -4.4, 0.9);
      const from = new THREE.Vector3(-3.6, 1.25, -4.4), to = new THREE.Vector3(-7.8, 2.5, -1.6), dir = to.clone().sub(from);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.12, dir.length(), 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
      cone.position.copy(from.clone().add(to).multiplyScalar(0.5));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const cg = new THREE.Group(); cg.add(cone); this.place(cg, 0, 0, 0);
      this.props.set('beam', cone);
    }
    // front wall like a lecture room: boards spanning the wall with a wood ledge, pull-down screen case above
    if (this.id !== 'engineering') {
      const side = this.id === 'english' ? '#f4f4f0' : this.id === 'art' ? '#34463d' : '#2f4a3c';
      for (const x of [-5.75, 5.75]) this.box(4.3, 2.45, 0.08, side, x, -6.9, 0.98);
      this.box(15.6, 0.1, 0.22, '#7a5a3a', 0, -6.8, 0.92);
      this.box(15.6, 0.1, 0.06, '#8a6a4a', 0, -6.93, 3.44);
      if (this.id !== 'english') this.box(4.4, 0.14, 0.2, '#e8e8e2', 0, -6.75, 3.47);
    }
    // gray window shades along the east wall
    for (const z of [-4.6, -1.6, 1.4, 4.4]) this.box(0.06, 2.7, 2.7, '#6e7074', 7.9, z, 0.9);
    // ceiling (drop ceiling, light panels, hanging projector) — shown only during scenes/demos
    this.ceiling = new THREE.Group();
    const cc = document.createElement('canvas'); cc.width = 512; cc.height = 448; const cg2 = cc.getContext('2d')!;
    cg2.fillStyle = '#ecebe6'; cg2.fillRect(0, 0, 512, 448); cg2.strokeStyle = '#c9c7bf'; cg2.lineWidth = 3;
    for (let x = 0; x <= 512; x += 32) { cg2.beginPath(); cg2.moveTo(x, 0); cg2.lineTo(x, 448); cg2.stroke(); }
    for (let y = 0; y <= 448; y += 64) { cg2.beginPath(); cg2.moveTo(0, y); cg2.lineTo(512, y); cg2.stroke(); }
    const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.62; this.ceiling.add(ceil);
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 0.5], [4, 0.5], [-4, 4.5], [4, 4.5], [0, -1.8], [0, 2.6]]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshBasicMaterial({ color: '#fffdf4', side: THREE.DoubleSide }));
      l.rotation.x = Math.PI / 2; l.position.set(x, 3.6, z); this.ceiling.add(l);
    }
    if (this.id !== 'engineering') {
      const rod = this.ctx.world.voxel(0.06, 0.5, 0.06, '#d8d8d8'); rod.position.set(0, 3.35, -1.2); this.ceiling.add(rod);
      const proj = this.ctx.world.voxel(0.7, 0.22, 0.6, '#e4e4e0'); proj.position.set(0, 3.05, -1.2); this.ceiling.add(proj);
    }
    this.ceiling.visible = false; this.place(this.ceiling, 0, 0);
    // teacher desk + desks for students
    if (this.id !== 'engineering') this.box(1.8, 0.85, 0.8, '#5a3a22', 3.6, -4.8);
    // two-person tables + chairs (art keeps slanted drafting tables, the lab keeps black benches)
    const tableColor = this.id === 'art' ? '#a07850' : this.id === 'engineering' ? '#16181b' : '#e8e6df';
    for (const [x, z] of TABLES) this.box(3.0, 0.74, 0.8, tableColor, x, z - 0.7);
    DESKS.forEach(([x, z]) => { this.box(0.5, 0.45, 0.5, '#6b6f74', x, z + 0.15); this.box(0.5, 0.5, 0.08, '#6b6f74', x, z + 0.42, 0.45); });
    room.students.forEach((s, i) => {
      const [x, z] = DESKS[i];
      const npc = this.ctx.world.npc({ label: s.name, shirt: s.shirt, hair: s.hair, skin: s.skin, pants: '#2c2540' });
      this.people.push(this.place(npc, x, z, 0, Math.PI));
    });
    this.chair = this.place(this.ctx.world.npc({ label: room.chair, sub: 'department chair', shirt: '#2b2f3a', pants: '#2b2f3a', hair: '#8a8378', skin: '#e0b896' }), 5.6, 5.4, 0, Math.PI);
    // flavour props
    if (this.id === 'math') { for (const x of [3.5, 5.0, 6.5]) this.box(0.8, 0.7, 0.7, '#d8d2c0', x, 6.2, 0.75); this.box(4.6, 0.75, 0.9, '#7b5a3e', 5, 6.2); }
    if (this.id === 'art') { this.box(1.6, 1.4, 0.4, '#b9b2a2', 6.8, -5.8); this.box(0.6, 0.9, 0.6, '#eae4d8', -6.6, 5.6); }
    void dark;
  }
  /** The art studio's overhead projector (bigger than its circuit board): base with glass stage, arm and head. */
  private buildProjector(x: number, z: number, y: number) {
    const body = this.box(2.0, 0.72, 1.6, '#4a5058', x, z, y);
    const arm = this.ctx.world.voxel(0.18, 1.3, 0.18, '#3a3f45'); arm.position.set(0.75, 1.4, -0.72); body.add(arm);
    const head = this.ctx.world.voxel(0.7, 0.34, 0.6, '#3a3f45'); head.position.set(0.45, 2.05, -0.6); body.add(head);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 1.2), new THREE.MeshBasicMaterial({ color: '#444' }));   // the glass stage lights up
    lamp.position.set(-0.15, 0.77, 0.05); body.add(lamp); this.props.set('lamp', lamp);
    const fan = new THREE.Group(); const blade = this.ctx.world.voxel(0.5, 0.06, 0.08, '#9aa'); fan.add(blade); const b2 = blade.clone(); b2.rotation.y = Math.PI / 2; fan.add(b2);
    fan.position.set(1.12, 0.38, 0.2); fan.rotation.z = Math.PI / 2; body.add(fan); this.props.set('fan', fan);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true, opacity: 0 }));
    const gg = new THREE.Group(); gg.add(glow); this.place(gg, 0, -6.84, 2.3); this.props.set('wallGlow', glow);
  }

  // ---------- API used by demos ----------
  get(name: string) { return this.surfaces.get(name) ?? null; }

  // ---------- playing on the surfaces: clicks traced from the screen onto the board ----------
  /** Replace the clickable areas of one layer on a surface ('body' = the demo, 'ui' = chalk tools). */
  setHotspots(surface: string, spots: Hotspot[], layer = 'body') { this.hot.set(`${surface}:${layer}`, spots); }
  /** Something drawn on top of a surface every time it refreshes (the chalk Hint / Brief / More). */
  setOverlay(surface: string, fn: ((s: Surface) => void) | null) { if (fn) this.overlays.set(surface, fn); else this.overlays.delete(surface); this.get(surface)?.refresh(); }
  private camera() {
    if (!this.cam) return null;
    const c = new THREE.PerspectiveCamera(GAME_FOV, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 100);
    c.position.copy(this.cam.from); c.lookAt(this.cam.to); c.updateMatrixWorld(); return c;
  }
  /** Which surface (and which canvas pixel on it) is under a screen point. */
  pick(clientX: number, clientY: number): { name: string; x: number; y: number } | null {
    const c = this.camera(); if (!c) return null;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1), c);
    const list = [...this.meshes.entries()].filter(([, m]) => m.visible);
    const hit = ray.intersectObjects(list.map(([, m]) => m), false)[0];
    if (!hit?.uv) return null;
    const name = list.find(([, m]) => m === hit.object)![0], s = this.surfaces.get(name)!;
    return { name, x: hit.uv.x * s.w, y: (1 - hit.uv.y) * s.h };
  }
  /** Name an area a demo drew (for tutorial highlights), in canvas pixels on a surface. */
  setRegion(name: string, surface: string, r: { x: number; y: number; w: number; h: number }) { this.regions.set(name, { surface, ...r }); }
  /** Screen rectangle of a named region, or null if it isn't known / visible. */
  screenRegion(name: string) { const r = this.regions.get(name); return r ? this.screenRect(r.surface, r) : null; }
  /** Screen rectangle (client px) covering a canvas-pixel rectangle on a surface: for tutorial highlights. */
  screenRect(surface: string, r: { x: number; y: number; w: number; h: number }) {
    const c = this.camera(), m = this.meshes.get(surface), s = this.surfaces.get(surface); if (!c || !m || !s) return null;
    const geo = m.geometry as THREE.PlaneGeometry, W = geo.parameters.width, H = geo.parameters.height;
    m.updateMatrixWorld();
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([px, py]) => {
      const v = new THREE.Vector3((px / s.w - 0.5) * W, (0.5 - py / s.h) * H, 0).applyMatrix4(m.matrixWorld).project(c);
      return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
    });
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  private spotAt(clientX: number, clientY: number) {
    const p = this.pick(clientX, clientY); if (!p) return null;
    for (const layer of ['ui', 'body']) {
      const spot = (this.hot.get(`${p.name}:${layer}`) ?? []).find(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
      if (spot) return { spot, pt: { x: p.x, y: p.y } };
    }
    return null;
  }
  /** Mouse on the 3D boards while a demo runs (only clicks that land on the game canvas). */
  private listen(on: boolean) {
    this.pointerOff?.(); this.pointerOff = null; document.body.style.cursor = '';
    if (!on) return;
    let held: Hotspot | null = null;
    // the click lands on the game canvas, or on the demo's transparent full-screen layer above it (not on the strip or a pop-up)
    const onCanvas = (e: MouseEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'CANVAS' || t.classList.contains('q1-inroom')); };
    let btn = 0;
    const down = (e: PointerEvent) => { if (!onCanvas(e) || (e.button !== 0 && e.button !== 2)) return; const s = this.spotAt(e.clientX, e.clientY); if (!s) return; btn = e.button; held = s.spot.drag ? s.spot : null; s.spot.on(s.pt, 'down', btn); };
    const move = (e: PointerEvent) => {
      if (!onCanvas(e)) { document.body.style.cursor = ''; return; }
      const s = this.spotAt(e.clientX, e.clientY);
      document.body.style.cursor = s ? (s.spot.drag ? 'crosshair' : 'pointer') : '';
      if (held && e.buttons & 3 && s?.spot.drag) s.spot.on(s.pt, 'drag', btn);   // (demos re-register spots as they redraw)
    };
    const up = () => { held = null; };
    const menu = (e: MouseEvent) => { if (onCanvas(e)) e.preventDefault(); };
    window.addEventListener('contextmenu', menu);
    window.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    this.pointerOff = () => { window.removeEventListener('contextmenu', menu); window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }
  /** Room-local point → world coordinates. */
  w(x: number, y: number, z: number): V3 { return { x: this.base.x + x, y: this.base.y + y, z: this.base.z + z }; }
  /** Students turn to look at the door (true) or back at the board (false). */
  faceDoor(on: boolean) { for (const p of this.people) p.rotation.y = on ? 0 : Math.PI; }
  /** Chalk-write a title onto the front board, revealed left→right by t (0..1). */
  writeTitle(title: string, t: number) {
    const b = this.get('board'); if (!b) return;
    chalk(b, this.id === 'engineering' ? '#22303a' : this.id === 'english' ? '#f7f5ee' : '#2f4a3c');
    const g = b.g; g.save(); g.beginPath(); g.rect(0, 0, b.w * Math.max(0, Math.min(1, t)), b.h); g.clip();
    text(b, title, b.w / 2, b.h * 0.36, 84, this.id === 'english' ? '#1a1a1a' : '#ffe08a', 'center');
    g.restore(); b.refresh();
  }
  /** A hired candidate who stays at the front of the room after the demo. */
  standHired(label: string, shirt: string) {
    const npc = this.ctx.world.npc({ label, sub: 'hired ✔', shirt, pants: '#2c2540' });
    this.place(npc, this.id === 'engineering' ? -4.6 : -5.2, this.id === 'engineering' ? -3.0 : -5.4, 0, 0);
  }
  views() { return Object.keys(VIEWS[this.id]); }
  viewLabel(name: string) { return VIEWS[this.id][name]?.label ?? name; }
  view(name: string) {
    const v = VIEWS[this.id][name]; if (!v) return; this.current = name;
    const w = (p: V3) => new THREE.Vector3(this.base.x + p.x, this.base.y + p.y, this.base.z + p.z);
    this.target = { from: w(v.from), to: w(v.to) };
    if (!this.cam) this.cam = { from: this.target.from.clone(), to: this.target.to.clone() };
  }
  nextView() { const vs = this.views(); this.view(vs[(vs.indexOf(this.current) + 1) % vs.length]); return this.current; }
  start(firstView: string) { this.active = true; this.cam = null; this.view(firstView); this.showCeiling(true); this.listen(true); }
  showCeiling(on: boolean) { if (this.ceiling) this.ceiling.visible = on; }
  stop() { this.active = false; this.cam = null; this.target = null; this.ctx.world.releaseCamera(); this.listen(false); this.hot.clear(); this.overlays.clear(); this.regions.clear(); }
  /** Where the candidate stands to teach (world coords + facing the class). */
  teachSpot() { return { x: this.base.x + (this.id === 'engineering' ? -4.6 : -5.2), y: this.base.y, z: this.base.z + (this.id === 'engineering' ? -3.0 : -5.4), ry: 0 }; }

  who(i: number | 'chair' | 'all' | 'random'): THREE.Object3D[] {
    if (i === 'all') return this.people;
    if (i === 'chair') return [this.chair];
    if (i === 'random') return [this.people[Math.floor(Math.random() * this.people.length)]];
    return [this.people[i] ?? this.people[0]];
  }
  studentIndex(name: string) { return CLASSROOM.rooms[this.id].students.findIndex(s => s.name === name); }
  bubble(target: THREE.Object3D, text: string, secs = 3.2) {
    for (const b of this.bubbles.filter(b => b.parent === target)) { b.obj.removeFromParent(); b.t = 0; }
    const lbl = this.ctx.world.label(text.length > 46 ? text.slice(0, 44) + '…' : text);
    lbl.position.set(0, 3.2, 0); lbl.scale.multiplyScalar(1.1); target.add(lbl);
    this.bubbles.push({ obj: lbl, t: secs, parent: target });
  }
  hop(targets: THREE.Object3D[]) { for (const t of targets) this.hops.set(t, 0.9); }
  signal(name: 'lamp' | 'fan' | 'fuse' | 'beam', value: string | boolean) {
    if (name === 'lamp') {
      const lamp = this.props.get('lamp') as THREE.Mesh | undefined; const glow = this.props.get('wallGlow') as THREE.Mesh | undefined;
      if (lamp) (lamp.material as THREE.MeshBasicMaterial).color.set(value === 'bright' ? '#fff6b0' : value === 'dim' ? '#c08040' : '#444');
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = value === 'bright' ? 0.75 : value === 'dim' ? 0.25 : 0;
    } else if (name === 'fan') this.fanSpeed = value === 'bright' ? 18 : value === 'dim' ? 5 : 0;
    else if (name === 'fuse') { this.fuseT = 1.2; this.ctx.world.sound('pop'); }
    else if (name === 'beam') { const b = this.props.get('beam') as THREE.Mesh | undefined; if (b) b.visible = !!value; }
  }

  update(dt: number) {
    for (const [o, t] of this.hops) { const nt = t - dt; o.position.y = this.base.y + Math.abs(Math.sin(nt * 10)) * 0.25 * (nt > 0 ? 1 : 0); if (nt <= 0) { this.hops.delete(o); o.position.y = this.base.y; } else this.hops.set(o, nt); }
    this.bubbles = this.bubbles.filter(b => { b.t -= dt; if (b.t <= 0) { b.obj.removeFromParent(); return false; } return true; });
    const fan = this.props.get('fan'); if (fan && this.fanSpeed) fan.rotation.x += this.fanSpeed * dt;
    if (this.fuseT > 0) {
      this.fuseT -= dt; const l = this.props.get('fuseLamp') as THREE.Mesh | undefined;
      if (l) (l.material as THREE.MeshLambertMaterial).color?.set(this.fuseT > 0 && Math.sin(this.fuseT * 30) > 0 ? '#ff5533' : '#3a3a3a');
    }
    if (this.active && this.target && this.cam) {
      const k = Math.min(1, dt * 4);
      this.cam.from.lerp(this.target.from, k); this.cam.to.lerp(this.target.to, k);
      this.ctx.world.focusCamera(this.cam.from, this.cam.to);
    }
  }
  destroy() { this.listen(false); this.removers.forEach(r => r()); this.removers = []; this.surfaces.clear(); this.meshes.clear(); }
}

// ---------- drawing helpers for surfaces ----------
export function chalk(s: Surface, bg = '#2f4a3c') {
  const g = s.g; g.fillStyle = bg; g.fillRect(0, 0, s.w, s.h);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 18; g.strokeRect(9, 9, s.w - 18, s.h - 18);
  g.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % s.w, (i * 53) % s.h, 120, 3);
}
export function text(s: Surface, t: string, x: number, y: number, size: number, color = '#f1efe6', align: CanvasTextAlign = 'left', font = '"Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive', maxW?: number) {
  const g = s.g; g.fillStyle = color; g.font = `${size}px ${font}`; g.textAlign = align; g.textBaseline = 'top';
  if (!maxW) { g.fillText(t, x, y); return y + size * 1.25; }
  const words = t.split(' '); let line = ''; let yy = y;
  for (const w of words) { const test = line ? `${line} ${w}` : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); yy += size * 1.25; line = w; } else line = test; }
  if (line) { g.fillText(line, x, yy); yy += size * 1.25; }
  return yy;
}
