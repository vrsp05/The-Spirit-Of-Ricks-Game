// Ambient traffic with somewhere to go:
// - cars route through the street network (A*) to a parking lot or across town, keep right,
//   pull over and park for a while, then drive on;
// - cyclists and scooter riders ride the campus paths to a building entrance, go inside for a
//   while (hidden), then come back out and head somewhere else.
// Everyone keeps their distance from the vehicle ahead and stops for the player.
import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { Vehicle, type CarStyle } from '../player/Vehicle';
import { CAMPUS, everOccupied, PATH_KINDS, terrainHeight, type Vec2 } from './campusData';
import { NavGraph } from './navGraph';
import { eraLook, onCampus, pathGraph } from './Npcs';
import type { EraId } from './eras';

type Kind = 'car' | 'bike' | 'scooter';
interface Agent {
  kind: Kind; v: Vehicle; rider: Avatar | null;
  path: Vec2[]; pi: number; speed: number; cruise: number;
  x: number; z: number; yaw: number; steer: number; near: boolean; seed: number;
  wait: number;            // parked / inside a building for this many seconds
  inside: boolean;         // riders: hidden inside a building
}
export interface TrafficEvent { type: 'whoosh' | 'bell' }
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

const STYLES: Record<EraId, CarStyle[]> = {
  ricks1999: ['boxy90s', 'pickup90s', 'boxy90s'], transition: ['boxy90s', 'pickup90s', 'boxy90s'],
  byui: ['rounded2010s', 'boxy90s', 'rounded2010s'], presentFinale: ['modern', 'rounded2010s', 'modern'],
};
const PALETTE = ['#b03a2e', '#2e5e8e', '#e8e4da', '#3a3f45', '#7a8c5a', '#c9a227', '#6b3f7a', '#9aa3a8', '#1f4a3a'];
const SCOOTERS = ['#2fbf71', '#1f2328', '#e8a33d', '#3d6fa8'];

export class Traffic {
  readonly agents: Agent[] = [];
  private roads: NavGraph;
  private paths = pathGraph();
  private lots: Vec2[];
  private rnd: () => number;
  private era: string | null = null;
  private bellCooldown = 0;

  constructor(private scene: THREE.Scene, private doors: () => Vec2[] = () => [], cars = 16, bikes = 10, scooters = 8) {
    let s = 4711; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const streets = CAMPUS.roads.filter(r => !PATH_KINDS.has(r.kind) && r.kind !== 'service' && r.pts.length > 1).map(r => r.pts);
    this.roads = new NavGraph(streets, (x, z) => !everOccupied(x, z, 0), 2);
    // parking lots: destination = the street point nearest each lot
    this.lots = CAMPUS.areas.filter(a => a.kind === 'parking').map(a => {
      const c = a.poly.reduce((m, p) => [m[0] + p[0] / a.poly.length, m[1] + p[1] / a.poly.length] as Vec2, [0, 0] as Vec2);
      return this.roads.pts[this.roads.nearest(c[0], c[1])];
    });
    for (let i = 0; i < cars && this.roads.size; i++) this.spawn('car', i);
    for (let i = 0; i < bikes && this.paths.size; i++) this.spawn('bike', i);
    for (let i = 0; i < scooters && this.paths.size; i++) this.spawn('scooter', i);
  }

  private spawn(kind: Kind, i: number) {
    const g = kind === 'car' ? this.roads : this.paths, n = g.pts[g.random(this.rnd, kind === 'car' ? undefined : onCampus)];
    const v = kind === 'car' ? new Vehicle(`traffic-${i}`, 'car', 'boxy90s', PALETTE[i % PALETTE.length])
      : kind === 'bike' ? new Vehicle(`cyclist-${i}`, 'bike') : new Vehicle(`scooterist-${i}`, 'scooter', 'boxy90s', SCOOTERS[i % SCOOTERS.length]);
    const cruise = kind === 'car' ? 7 + this.rnd() * 3.5 : kind === 'bike' ? 3.4 + this.rnd() * 1.4 : 4 + this.rnd() * 1.5;
    const a: Agent = { kind, v, rider: null, path: [], pi: 0, speed: 0, cruise, x: n[0], z: n[1], yaw: this.rnd() * 6.28, steer: 0, near: false, seed: 100 + i + (kind === 'scooter' ? 50 : 0), wait: this.rnd() * 4, inside: false };
    if (kind !== 'car') { a.rider = new Avatar(eraLook('ricks1999', a.seed)); this.scene.add(a.rider.root); }
    this.scene.add(v.root); this.agents.push(a);
  }

  /** Where to next: cars → a parking lot (or a far street), riders → a building entrance. */
  private plan(a: Agent) {
    const car = a.kind === 'car', g = car ? this.roads : this.paths, doors = this.doors();
    for (let k = 0; k < 6; k++) {
      const dest: Vec2 = car ? (this.lots.length && this.rnd() < 0.65 ? this.lots[(this.rnd() * this.lots.length) | 0] : g.pts[g.random(this.rnd)])
        : doors.length ? doors[(this.rnd() * doors.length) | 0] : g.pts[g.random(this.rnd)];
      if (Math.hypot(dest[0] - a.x, dest[1] - a.z) < (car ? 60 : 30)) continue;
      const r = g.route(g.nearest(a.x, a.z), g.nearest(dest[0], dest[1]));
      if (r && r.length > 1) { a.path = car ? r : [...r, dest]; a.pi = 0; return; }
    }
    a.wait = 1.5;
  }

  /** Re-style cars for the era and re-dress riders for era + season. */
  setEra(era: EraId, season: Season = 'autumn') {
    if (era + season === this.era) return; const restyle = !this.era?.startsWith(era); this.era = era + season;
    this.agents.forEach((a, i) => {
      if (a.kind === 'car') {
        if (!restyle) return;
        const nv = new Vehicle(`traffic-${i}`, 'car', STYLES[era][i % 3], PALETTE[(i * 2 + era.length) % PALETTE.length]);
        nv.root.position.copy(a.v.root.position); nv.root.rotation.y = a.yaw; nv.root.visible = a.v.root.visible;
        this.scene.remove(a.v.root); a.v.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
        a.v = nv; this.scene.add(nv.root);
      } else a.rider?.rebuild(eraLook(era, a.seed, season));
    });
  }
  private shown = true;
  setVisible(v: boolean) { this.shown = v; for (const a of this.agents) { const vis = v && !a.inside; a.v.root.visible = vis; if (a.rider) a.rider.root.visible = vis; } }
  /** Is (x, z, r) touching a moving vehicle? (player collision) */
  hit(x: number, z: number, r: number) { return this.agents.some(a => a.v.root.visible && (a.v.root.position.x - x) ** 2 + (a.v.root.position.z - z) ** 2 < (r + (a.kind === 'car' ? 1.3 : 0.45)) ** 2); }

  update(dt: number, player: { x: number; z: number }): TrafficEvent[] {
    const events: TrafficEvent[] = [];
    this.bellCooldown -= dt;
    for (const a of this.agents) {
      const car = a.kind === 'car';
      if (a.wait > 0) {                                   // parked / inside a building
        a.wait -= dt; a.speed = 0;
        if (a.wait <= 0) { if (a.inside) { a.inside = false; const vis = this.shown; a.v.root.visible = vis; if (a.rider) a.rider.root.visible = vis; } this.plan(a); }
        if (!a.inside) this.pose(a, dt);
        continue;
      }
      if (!a.path.length) this.plan(a);
      const target = a.path[a.pi]; if (!target) continue;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      const ahead = (x: number, z: number, dist: number, width: number) => { const rx = x - a.x, rz = z - a.z, d = rx * fx + rz * fz; return d > 0 && d < dist && Math.abs(rx * fz - rz * fx) < width; };
      let want = a.cruise, hardStop = false;
      if (ahead(player.x, player.z, car ? 15 : 7, car ? 3.6 : 1.4)) { want = 0; hardStop = ahead(player.x, player.z, car ? 4.5 : 2, car ? 3.6 : 1.4); }
      else for (const b of this.agents) if (b !== a && !b.inside && (b.kind === 'car') === car && ahead(b.x, b.z, car ? 9 : 3.5, 1.6)) want = Math.min(want, b.speed * 0.7);
      // slow down for corners: the turn angle to the point after next
      const nxt = a.path[a.pi + 1];
      if (nxt) { const t1 = Math.atan2(target[0] - a.x, target[1] - a.z), t2 = Math.atan2(nxt[0] - target[0], nxt[1] - target[1]); const turn = Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))); want = Math.min(want, a.cruise * (1 - Math.min(0.6, turn * 0.5))); }
      a.speed = hardStop ? 0 : a.speed + Math.max(-12 * dt, Math.min((car ? 4 : 3) * dt, want - a.speed));
      // follow the route
      const dx = target[0] - a.x, dz = target[1] - a.z, d = Math.hypot(dx, dz);
      if (d < (car ? 2.2 : 0.8)) {
        a.pi++;
        if (a.pi >= a.path.length) {
          a.path = [];
          if (car) a.wait = 10 + this.rnd() * 25;                                     // pull over and park
          else { a.inside = true; a.wait = 15 + this.rnd() * 35; a.v.root.visible = false; if (a.rider) a.rider.root.visible = false; }   // into the building
          continue;
        }
      } else {
        const step = Math.min(d, a.speed * dt);
        a.x += dx / d * step; a.z += dz / d * step;
        const yaw = Math.atan2(dx, dz); let dy = yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        a.steer = Math.max(-1, Math.min(1, -dy * 3)); a.yaw += dy * Math.min(1, dt * (car ? 3 : 5));
      }
      this.pose(a, dt);
      // sounds near the player: a car passing by, a cyclist ringing at you
      const d2 = (a.x - player.x) ** 2 + (a.z - player.z) ** 2;
      if (car) { const near = d2 < 36 && a.speed > 3; if (near && !a.near) events.push({ type: 'whoosh' }); a.near = near; }
      else if (a.kind === 'bike' && d2 < 49 && ahead(player.x, player.z, 7, 2) && this.bellCooldown <= 0) { events.push({ type: 'bell' }); this.bellCooldown = 8; }
    }
    return events;
  }

  /** Place the vehicle (offset into its lane) and its rider. */
  private pose(a: Agent, dt: number) {
    const car = a.kind === 'car', fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const off = car ? (a.wait > 0 ? 3.6 : 2.0) : 0.7;                                // keep right; parked cars pull to the curb
    const x = a.x - fz * off, z = a.z + fx * off, y = terrainHeight(x, z);
    a.v.root.position.set(x, y, z); a.v.root.rotation.y = a.yaw; a.v.speed = a.speed; a.v.animate(dt, a.steer);
    if (a.rider) {
      const st = a.v.seat, c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
      a.rider.root.position.set(x + c * st.x + sn * st.z, y + st.y, z - sn * st.x + c * st.z); a.rider.root.rotation.y = a.yaw;
      if (a.kind === 'bike') a.rider.pedal(a.speed); else a.rider.scoot(a.speed);
      a.rider.animate(dt, 0);
    }
  }
}
