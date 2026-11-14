// Ambient traffic: cars drive the streets (right-hand lane, era-styled models) and cyclists ride the
// campus paths. They follow the OSM road/path network, turn onto connected streets at junctions
// (or U-turn at dead ends), keep their distance from each other and stop for the player.
import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { Vehicle, type CarStyle } from '../player/Vehicle';
import { CAMPUS, PATH_KINDS, terrainHeight, type Vec2 } from './campusData';
import { eraLook } from './Npcs';
import type { EraId } from './eras';

interface Lane { pts: Vec2[]; cum: number[]; total: number; width: number }
interface Agent {
  kind: 'car' | 'bike'; v: Vehicle; rider: Avatar | null;
  lane: number; s: number; dir: 1 | -1; speed: number; cruise: number;
  x: number; z: number; yaw: number; steer: number; near: boolean; seed: number;
}
export interface TrafficEvent { type: 'whoosh' | 'bell' }

const STYLES: Record<EraId, CarStyle[]> = {
  ricks1999: ['boxy90s', 'pickup90s', 'boxy90s'], transition: ['boxy90s', 'pickup90s', 'boxy90s'],
  byui: ['rounded2010s', 'boxy90s', 'rounded2010s'], presentFinale: ['modern', 'rounded2010s', 'modern'],
};
const PALETTE = ['#b03a2e', '#2e5e8e', '#e8e4da', '#3a3f45', '#7a8c5a', '#c9a227', '#6b3f7a', '#9aa3a8', '#1f4a3a'];

function makeLanes(roads: { pts: Vec2[]; width: number }[]): Lane[] {
  return roads.map(r => {
    const cum = [0]; for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
    return { pts: r.pts, cum, total: cum[cum.length - 1], width: r.width };
  }).filter(l => l.total > 6);
}
/** Lanes that start or end at (about) the same point. */
function junctions(lanes: Lane[]) {
  const key = (p: Vec2) => `${Math.round(p[0] / 2)},${Math.round(p[1] / 2)}`;
  const m = new Map<string, { lane: number; atStart: boolean }[]>();
  lanes.forEach((l, i) => { for (const atStart of [true, false]) { const k = key(atStart ? l.pts[0] : l.pts[l.pts.length - 1]); (m.get(k) ?? m.set(k, []).get(k)!).push({ lane: i, atStart }); } });
  return { at: (p: Vec2) => m.get(key(p)) ?? [] };
}

export class Traffic {
  readonly agents: Agent[] = [];
  private roads: Lane[]; private paths: Lane[];
  private roadJ; private pathJ;
  private rnd: () => number;
  private era: EraId | null = null;
  private bellCooldown = 0;

  constructor(private scene: THREE.Scene, cars = 10, bikes = 6) {
    let s = 4711; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const seen = new Set<string>();
    const streets = CAMPUS.roads.filter(r => !PATH_KINDS.has(r.kind) && r.kind !== 'service' && r.pts.length > 1).filter(r => {
      const k = r.pts.map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join('|'), kr = [...r.pts].reverse().map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join('|');
      if (seen.has(k) || seen.has(kr)) return false; seen.add(k); return true;
    });
    this.roads = makeLanes(streets);
    this.paths = makeLanes(CAMPUS.roads.filter(r => r.kind === 'footway' && r.pts.length > 1 && CAMPUS.campus.length > 0));
    this.roadJ = junctions(this.roads); this.pathJ = junctions(this.paths);
    for (let i = 0; i < cars && this.roads.length; i++) this.spawn('car', i);
    for (let i = 0; i < bikes && this.paths.length; i++) this.spawn('bike', i);
  }

  private spawn(kind: 'car' | 'bike', i: number) {
    const lanes = kind === 'car' ? this.roads : this.paths;
    const lane = (this.rnd() * lanes.length) | 0;
    const v = kind === 'car' ? new Vehicle(`traffic-${i}`, 'car', 'boxy90s', PALETTE[i % PALETTE.length]) : new Vehicle(`cyclist-${i}`, 'bike');
    const cruise = kind === 'car' ? 7 + this.rnd() * 3 : 3.2 + this.rnd() * 1.4;
    const a: Agent = { kind, v, rider: null, lane, s: this.rnd() * lanes[lane].total, dir: this.rnd() < 0.5 ? 1 : -1, speed: cruise, cruise, x: 0, z: 0, yaw: 0, steer: 0, near: false, seed: 100 + i };
    if (kind === 'bike') { a.rider = new Avatar(eraLook('ricks1999', a.seed)); this.scene.add(a.rider.root); }
    this.scene.add(v.root); this.agents.push(a); this.place(a, 1);
  }

  /** Re-style cars and re-dress cyclists for the era. */
  setEra(era: EraId) {
    if (era === this.era) return; this.era = era;
    this.agents.forEach((a, i) => {
      if (a.kind === 'car') {
        const nv = new Vehicle(`traffic-${i}`, 'car', STYLES[era][i % 3], PALETTE[(i * 2 + era.length) % PALETTE.length]);
        nv.root.position.copy(a.v.root.position); nv.root.rotation.y = a.yaw; nv.root.visible = a.v.root.visible;
        this.scene.remove(a.v.root); a.v.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
        a.v = nv; this.scene.add(nv.root);
      } else a.rider?.rebuild(eraLook(era, a.seed));
    });
  }
  setVisible(v: boolean) { for (const a of this.agents) { a.v.root.visible = v; if (a.rider) a.rider.root.visible = v; } }
  /** Is (x, z, r) touching a moving vehicle? (player collision) */
  hit(x: number, z: number, r: number) { return this.agents.some(a => a.v.root.visible && (a.x - x) ** 2 + (a.z - z) ** 2 < (r + (a.kind === 'car' ? 1.3 : 0.5)) ** 2); }

  private pointAt(l: Lane, s: number): { x: number; z: number; dx: number; dz: number } {
    s = Math.max(0, Math.min(l.total, s));
    let i = 1; while (i < l.cum.length - 1 && l.cum[i] < s) i++;
    const a = l.pts[i - 1], b = l.pts[i], seg = l.cum[i] - l.cum[i - 1] || 1, t = (s - l.cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
  }
  private place(a: Agent, k: number) {
    const lanes = a.kind === 'car' ? this.roads : this.paths, l = lanes[a.lane], p = this.pointAt(l, a.s);
    const fx = p.dx * a.dir, fz = p.dz * a.dir;
    const off = a.kind === 'car' ? Math.max(1.6, l.width * 0.25) : l.width * 0.25;            // keep right
    const tx = p.x - fz * off, tz = p.z + fx * off;
    const yaw = Math.atan2(fx, fz);
    let dy = yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    a.steer = Math.max(-1, Math.min(1, -dy * 4));
    a.yaw += dy * k; a.x += (tx - a.x) * k; a.z += (tz - a.z) * k;
  }

  update(dt: number, player: { x: number; z: number }): TrafficEvent[] {
    const events: TrafficEvent[] = [];
    this.bellCooldown -= dt;
    for (const a of this.agents) {
      const lanes = a.kind === 'car' ? this.roads : this.paths, J = a.kind === 'car' ? this.roadJ : this.pathJ;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      // stop for the player and for whoever is in front
      const ahead = (x: number, z: number, dist: number, width: number) => { const rx = x - a.x, rz = z - a.z, d = rx * fx + rz * fz; return d > 0 && d < dist && Math.abs(rx * fz - rz * fx) < width; };
      let target = a.cruise, hardStop = false;
      if (ahead(player.x, player.z, a.kind === 'car' ? 15 : 7, a.kind === 'car' ? 2.6 : 1.4)) {
        target = 0; hardStop = ahead(player.x, player.z, a.kind === 'car' ? 4.2 : 2, a.kind === 'car' ? 2.6 : 1.4);   // never drive through you
      }
      else for (const b of this.agents) if (b !== a && b.kind === a.kind && ahead(b.x, b.z, a.kind === 'car' ? 8 : 3, 1.6)) { target = Math.min(target, b.speed * 0.8); }
      a.speed = hardStop ? 0 : a.speed + Math.max(-12 * dt, Math.min(4 * dt, target - a.speed));
      a.s += a.dir * a.speed * dt;
      const l = lanes[a.lane];
      if (a.s < 0 || a.s > l.total) {
        const end = a.s > l.total ? l.pts[l.pts.length - 1] : l.pts[0];
        const options = J.at(end).filter(o => o.lane !== a.lane);
        if (options.length) {
          const o = options[(this.rnd() * options.length) | 0];
          a.lane = o.lane; a.dir = o.atStart ? 1 : -1; a.s = o.atStart ? 0.01 : lanes[o.lane].total - 0.01;
        } else { a.dir = (a.dir * -1) as 1 | -1; a.s = Math.max(0, Math.min(l.total, a.s)); }   // dead end: turn around
      }
      this.place(a, Math.min(1, dt * 5));
      const y = terrainHeight(a.x, a.z);
      a.v.root.position.set(a.x, y, a.z); a.v.root.rotation.y = a.yaw; a.v.speed = a.speed; a.v.animate(dt, a.steer);
      if (a.rider) {
        const st = a.v.seat, c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
        a.rider.root.position.set(a.x + c * st.x + sn * st.z, y + st.y, a.z - sn * st.x + c * st.z); a.rider.root.rotation.y = a.yaw;
        a.rider.pedal(a.speed); a.rider.animate(dt, 0);
      }
      // sounds near the player: a car passing by, a cyclist ringing at you
      const d2 = (a.x - player.x) ** 2 + (a.z - player.z) ** 2;
      if (a.kind === 'car') { const near = d2 < 36 && a.speed > 3; if (near && !a.near) events.push({ type: 'whoosh' }); a.near = near; }
      else if (d2 < 49 && ahead(player.x, player.z, 7, 2) && this.bellCooldown <= 0) { events.push({ type: 'bell' }); this.bellCooldown = 8; }
    }
    return events;
  }
}
