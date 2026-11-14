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
interface ViewDef { label: string; from: V3; to: V3 }

const VIEWS: Record<RoomId, Record<string, ViewDef>> = {
  math: {
    board: { label: 'Chalkboard', from: { x: 0, y: 1.7, z: -0.4 }, to: { x: 0, y: 1.05, z: -6.8 } },
    poster: { label: 'Coin poster', from: { x: -1.9, y: 1.9, z: -1.6 }, to: { x: -7.8, y: 1.5, z: -1.6 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
  english: {
    board: { label: 'Projector screen', from: { x: 0, y: 1.8, z: -0.4 }, to: { x: 0, y: 1.15, z: -6.8 } },
    poster: { label: 'Fact clipping', from: { x: -2.4, y: 1.9, z: -1.6 }, to: { x: -7.8, y: 1.4, z: -1.6 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
  art: {
    board: { label: 'Drawing board', from: { x: 0, y: 1.9, z: 0.6 }, to: { x: 0, y: 0.55, z: -6.8 } },
    poster: { label: 'Projected reference', from: { x: 0.2, y: 2.2, z: -1.6 }, to: { x: -7.8, y: 0.3, z: -1.6 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
  engineering: {
    bench: { label: 'Lab bench', from: { x: 1.4, y: 3.1, z: 0.6 }, to: { x: 1.4, y: -0.5, z: -4.6 } },
    board: { label: 'Wall board', from: { x: 0, y: 2.3, z: -1.6 }, to: { x: 0, y: 2.1, z: -6.8 } },
    class: { label: 'Class', from: { x: 0.6, y: 3.0, z: -6.0 }, to: { x: 0, y: 1.1, z: 3 } },
  },
};

const DESKS: [number, number][] = [[-4.5, 0.4], [-1.5, 0.4], [1.5, 0.4], [4.5, 0.4], [-3, 2.9], [0, 2.9], [3, 2.9]];

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
  private fuseT = 0;
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
  private surface(name: string, w: number, h: number, px: number, x: number, y: number, z: number, ry: number) {
    const canvas = document.createElement('canvas'); canvas.width = Math.round(w * px); canvas.height = Math.round(h * px);
    const g = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const grp = new THREE.Group(); grp.add(mesh);
    this.place(grp, x, z, y, ry);
    const s: Surface = { canvas, g, w: canvas.width, h: canvas.height, refresh: () => { tex.needsUpdate = true; } };
    this.surfaces.set(name, s); return s;
  }
  private build() {
    const room = CLASSROOM.rooms[this.id];
    const dark = (c: string) => c;
    // front wall surface (board / screen)
    if (this.id === 'english') {
      this.box(7.4, 0.15, 0.2, '#555', 0, -6.82, 4.0);                       // screen roller
      this.surface('board', 7, 3.1, 200, 0, 2.3, -6.86, 0);
      this.box(0.9, 0.9, 0.9, '#3b3f46', 3.0, -3.4);                         // projector cart (off to the side)
      const head = this.box(0.7, 0.35, 0.7, '#22262b', 3.0, -3.4, 0.9); this.props.set('projector', head);
    } else if (this.id === 'engineering') {
      this.surface('board', 6, 2.6, 160, 0, 2.3, -6.86, 0);
      this.box(7.0, 1.0, 1.6, '#16181b', 0, -4.3);                            // black lab bench
      this.buildProjector(0, -4.3, 1.0);
      const fuse = this.box(0.8, 1.0, 0.25, '#6b6f73', 7.6, -3.5, 1.4, -Math.PI / 2); this.props.set('fuse', fuse);
      const lamp = this.ctx.world.voxel(0.25, 0.25, 0.1, '#3a3a3a'); lamp.position.set(0, 0.7, 0.15); fuse.add(lamp); this.props.set('fuseLamp', lamp);
      for (const x of [-6, 6]) { this.box(0.9, 0.55, 0.6, '#2a3a2a', x, -4.3, 1.0); }  // oscilloscopes
    } else {
      this.box(7.4, 0.12, 0.25, '#5b4636', 0, -6.82, 0.75);                  // chalk tray
      this.surface('board', 7, 3, 200, 0, 2.3, -6.86, 0);
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
    // teacher desk + desks for students
    if (this.id !== 'engineering') this.box(1.8, 0.85, 0.8, '#5a3a22', 3.6, -4.8);
    const deskColor = this.id === 'art' ? '#a07850' : this.id === 'engineering' ? '#16181b' : '#7b5a3e';
    room.students.forEach((s, i) => {
      const [x, z] = DESKS[i];
      if (this.id === 'art') this.box(1.3, 0.9, 0.9, deskColor, x, z - 0.6, 0, 0).rotation.x = -0.2;
      else this.box(1.2, 0.75, 0.7, deskColor, x, z - 0.6);
      const npc = this.ctx.world.npc({ label: s.name, shirt: s.shirt, hair: s.hair, skin: s.skin, pants: '#2c2540' });
      this.people.push(this.place(npc, x, z, 0, Math.PI));
    });
    this.chair = this.place(this.ctx.world.npc({ label: room.chair, sub: 'department chair', shirt: '#2b2f3a', pants: '#2b2f3a', hair: '#8a8378', skin: '#e0b896' }), 5.6, 5.4, 0, Math.PI);
    // flavour props
    if (this.id === 'math') { for (const x of [3.5, 5.0, 6.5]) this.box(0.8, 0.7, 0.7, '#d8d2c0', x, 6.2, 0.75); this.box(4.6, 0.75, 0.9, '#7b5a3e', 5, 6.2); }
    if (this.id === 'art') { this.box(1.6, 1.4, 0.4, '#b9b2a2', 6.8, -5.8); this.box(0.6, 0.9, 0.6, '#eae4d8', -6.6, 5.6); }
    void dark;
  }
  private buildProjector(x: number, z: number, y: number) {
    const body = this.box(0.9, 0.5, 0.9, '#2f3338', x + 1.5, z, y);
    const head = this.ctx.world.voxel(0.25, 0.9, 0.25, '#2f3338'); head.position.set(0, 0.9, -0.2); body.add(head);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: '#444' }));
    lamp.position.set(0, 0.62, 0); body.add(lamp); this.props.set('lamp', lamp);
    const fan = new THREE.Group(); const blade = this.ctx.world.voxel(0.5, 0.06, 0.08, '#9aa'); fan.add(blade); const b2 = blade.clone(); b2.rotation.y = Math.PI / 2; fan.add(b2);
    fan.position.set(0.5, 0.3, 0); fan.rotation.z = Math.PI / 2; body.add(fan); this.props.set('fan', fan);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true, opacity: 0 }));
    const gg = new THREE.Group(); gg.add(glow); this.place(gg, 0, -6.84, 2.3); this.props.set('wallGlow', glow);
  }

  // ---------- API used by demos ----------
  get(name: string) { return this.surfaces.get(name) ?? null; }
  views() { return Object.keys(VIEWS[this.id]); }
  viewLabel(name: string) { return VIEWS[this.id][name]?.label ?? name; }
  view(name: string) {
    const v = VIEWS[this.id][name]; if (!v) return; this.current = name;
    const w = (p: V3) => new THREE.Vector3(this.base.x + p.x, this.base.y + p.y, this.base.z + p.z);
    this.target = { from: w(v.from), to: w(v.to) };
    if (!this.cam) this.cam = { from: this.target.from.clone(), to: this.target.to.clone() };
  }
  nextView() { const vs = this.views(); this.view(vs[(vs.indexOf(this.current) + 1) % vs.length]); return this.current; }
  start(firstView: string) { this.active = true; this.cam = null; this.view(firstView); }
  stop() { this.active = false; this.cam = null; this.target = null; this.ctx.world.releaseCamera(); }
  /** Where the candidate stands to teach (world coords + facing the class). */
  teachSpot() { return { x: this.base.x + (this.id === 'engineering' ? -4.6 : -5.2), y: this.base.y, z: this.base.z + (this.id === 'engineering' ? -3.0 : -5.4), ry: 0 }; }

  who(i: number | 'chair' | 'all' | 'random'): THREE.Object3D[] {
    if (i === 'all') return this.people;
    if (i === 'chair') return [this.chair];
    if (i === 'random') return [this.people[Math.floor(Math.random() * this.people.length)]];
    return [this.people[i] ?? this.people[0]];
  }
  studentIndex(name: string) { return CLASSROOM.rooms[this.id].students.findIndex(s => s.name === name); }
  bubble(target: THREE.Object3D, text: string, secs = 2.8) {
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
  destroy() { this.removers.forEach(r => r()); this.removers = []; this.surfaces.clear(); }
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
