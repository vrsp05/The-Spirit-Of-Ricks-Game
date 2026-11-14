// Ambient NPCs: generic, fictional students/staff with somewhere to be. Each one picks a
// building entrance, walks there along the campus path network (A* on the NavGraph), goes
// inside for a while, then comes out and heads somewhere else. Some walk together in small
// groups. They stop and face the player nearby and say a short line on interact.
// Not real people. Lines live in GAME_CONFIG.npcs (editable, era-aware).
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { Avatar, type AvatarLook, type HairStyle } from '../player/Avatar';
import type { EraId } from './eras';
import { CAMPUS, everOccupied, PATH_KINDS, pointInPoly, terrainHeight, type Vec2 } from './campusData';
import { NavGraph } from './navGraph';

interface Walker {
  avatar: Avatar; route: Vec2[]; speed: number;
  pause: number; x: number; z: number; yaw: number; talking: number;
  name: string; heard: number; gather: { x: number; z: number; until: number } | null; seed: number;
  /** current route (points), index of the next point, where they're heading */
  path: Vec2[]; pi: number; dest: Vec2 | null;
  inside: number;                 // > 0: inside a building for this many seconds (hidden)
  leader: Walker | null; side: number;   // group members walk beside their leader
}

/** On campus (where the game is played) — people spawn here so the campus feels busy. */
export const onCampus = (x: number, z: number) => CAMPUS.campus.some(c => pointInPoly(x, z, c));
/** Shared path network for everyone who walks or rides on campus paths. */
let PATHS: NavGraph | null = null;
export function pathGraph(): NavGraph {
  PATHS ??= new NavGraph(CAMPUS.roads.filter(r => PATH_KINDS.has(r.kind) && r.pts.length > 1).map(r => r.pts), (x, z) => !everOccupied(x, z, 0));
  return PATHS;
}

const HAIR = ['#2a1d14', '#4a3324', '#7a4b2a', '#c9a35a', '#1a1a1a', '#8b5a2b'];
const SKIN = ['#f0c9a4', '#e0b48f', '#c68c64', '#a8714a', '#8d5a3b'];
/** Wardrobe: the era sets the style, the season the weather layer (seeded per walker so each person stays recognisable). */
export function eraLook(era: EraId, seed: number, season: 'spring' | 'summer' | 'autumn' | 'winter' = 'autumn'): AvatarLook {
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = <T,>(a: T[]) => a[(r() * a.length) | 0];
  const skin = p(SKIN), hair = p(HAIR);
  const hairStyle: HairStyle = p(['short', 'side', 'long', 'bun', 'curly', 'short', 'long', 'buzz']);
  const glasses = r() < 0.15;
  const backpack = r() < 0.5 ? p(['#2f3e57', '#7a2b2b', '#3f5f3a', '#2a2a2a', '#b8742c']) : undefined;
  let look: AvatarLook;
  if (era === 'ricks1999' || era === 'transition') look = { skin, hair, hairStyle, glasses, backpack,       // 90s: flannel, denim, caps
    shirt: p(['#8d3b2f', '#3f5f8a', '#4a6a3a', '#7a4f2a', '#c8b48a', '#2c2c34', '#b8423a', '#e0e0d8']), pattern: r() < 0.3 ? 'flannel' : r() < 0.15 ? 'stripe' : 'plain',
    jacket: r() < 0.15 ? '#3f5f8a' : undefined, pants: p(['#3a4a6a', '#2b3550', '#8a7a5a', '#4a4a50']),
    hat: r() < 0.22 ? 'cap' : 'none', hatColor: p(['#2f4f7f', '#7a2b2b', '#2a2a2a', '#3f6f4a']), shoes: p(['#efe9de', '#2a221c', '#5a4632']) };
  else if (era === 'byui') look = { skin, hair, hairStyle, glasses, backpack,                               // 2010s: hoodies, skinny jeans
    shirt: p(['#e0e0d8', '#3d6fa8', '#2c2c34', '#7a2b2b', '#4aa3a0', '#5a5a62']), pattern: r() < 0.12 ? 'stripe' : 'plain',
    pants: p(['#22283a', '#2b2f3a', '#3a4252']), hat: r() < 0.12 ? 'cap' : 'none', hatColor: '#2f4f7f', shoes: p(['#3a2a1c', '#2a2a2a', '#d8d8d0']) };
  else look = { skin, hair, hairStyle, glasses, backpack,                                                    // today: plain tees, white sneakers
    shirt: p(['#e0e0d8', '#2c2c34', '#4aa3a0', '#d96a5a', '#3d6fa8', '#c9b23a', '#7a8c9a']), pattern: r() < 0.12 ? 'stripe' : 'plain',
    pants: p(['#3a4252', '#8a7a5a', '#2b2f3a', '#6b6b70']), shoes: p(['#f4f4f0', '#f4f4f0', '#2a2a2a']) };
  // season layer
  if (season === 'winter') {
    if (r() < 0.82) look.coat = p(['#2b2f3a', '#8d3b2f', '#3f6f8a', '#4a5a3a', '#d8c8a8', '#5a3a5a']);
    if (r() < 0.55) { look.hat = 'beanie'; look.hatColor = p(['#8d3b2f', '#2f4f7f', '#d1a12f', '#3f6f4a', '#2a2a2a', '#efe9de']); }
    if (r() < 0.45) look.scarf = p(['#b8423a', '#efe9de', '#3f5f8a', '#d1a12f']);
  } else if (season === 'autumn') { if (!look.jacket && r() < 0.25) look.coat = p(['#5a4632', '#3f4a5a', '#7a5a3a']); }
  else look.shorts = r() < (season === 'summer' ? 0.4 : 0.15);
  return look;
}

// Fictional first names for ambient students (not real people).
const NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Drew', 'Parker', 'Rowan', 'Skyler', 'Reese', 'Emerson', 'Hayden', 'Kendall', 'Logan', 'Blake'];

export class NpcCrowd {
  readonly walkers: Walker[] = [];
  private rnd: () => number;

  private graph = pathGraph();
  private shown = true;

  /** doors(): entrances of buildings standing in the current era (where people can go). */
  constructor(scene: THREE.Scene, count = GAME_CONFIG.npcs.count, private doors: () => Vec2[] = () => []) {
    let s = 777; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count && this.graph.size; i++) {
      const seed = i + 1;
      const avatar = new Avatar(eraLook('ricks1999', seed), 0.92 + this.rnd() * 0.12);
      const n = this.graph.pts[this.graph.random(this.rnd, onCampus)];
      // about a third walk with a friend (groups of 2–3)
      const prev = this.walkers[this.walkers.length - 1];
      const joins = !!prev && !prev.leader && this.rnd() < 0.35, leader = joins ? prev : null;
      const w: Walker = { avatar, route: [], speed: 1.15 + this.rnd() * 0.6, pause: this.rnd() * 3, x: leader ? leader.x + 1 : n[0], z: leader ? leader.z : n[1], yaw: 0, talking: 0,
        name: NAMES[i % NAMES.length], heard: 0, gather: null, seed, path: [], pi: 0, dest: null, inside: 0, leader, side: leader ? (this.walkers.filter(x => x.leader === leader).length % 2 ? -1 : 1) : 0 };
      scene.add(avatar.root);
      this.walkers.push(w);
    }
  }

  /** Pick a building entrance and route there along the paths. */
  private plan(w: Walker) {
    const doors = this.doors();
    for (let k = 0; k < 6; k++) {
      const dest: Vec2 = doors.length ? doors[(this.rnd() * doors.length) | 0] : this.graph.pts[this.graph.random(this.rnd)];
      if (Math.hypot(dest[0] - w.x, dest[1] - w.z) < 25) continue;                 // somewhere worth walking to
      const r = this.graph.route(this.graph.nearest(w.x, w.z), this.graph.nearest(dest[0], dest[1]));
      if (r && r.length > 1) { w.path = [...r, dest]; w.pi = 0; w.dest = dest; w.route = w.path; return; }
    }
    w.pause = 2;                                                                    // try again shortly
  }
  /** Come back out of a building (at its door, or another one) and pick the next place. */
  private exitBuilding(w: Walker) {
    w.inside = 0; const d = w.dest ?? this.graph.pts[this.graph.random(this.rnd)];
    w.x = d[0]; w.z = d[1]; w.dest = null; w.path = []; this.plan(w);
  }

  /** Re-dress everyone for the era (winter coats in 2011, flannel in 1999, …). */
  private lookKey = '';
  setEra(era: EraId, season: 'spring' | 'summer' | 'autumn' | 'winter' = 'autumn') { const k = era + season; if (k === this.lookKey) return; this.lookKey = k; for (const w of this.walkers) w.avatar.rebuild(eraLook(era, w.seed, season)); }

  setVisible(v: boolean) { this.shown = v; for (const w of this.walkers) w.avatar.root.visible = v && w.inside <= 0; }

  /** blocked(x,z,r) = current-era building/prop collision. */
  private time = 0;
  /** Gather the nearest walkers around a point to cheer (celebrations). */
  gather(x: number, z: number, seconds: number) {
    const near = [...this.walkers].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, 10);
    near.forEach((w, i) => {
      const a = (i / near.length) * Math.PI * 2, r = 7 + (i % 3) * 1.5;
      w.gather = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, until: this.time + seconds };
      if (Math.hypot(w.x - x, w.z - z) > 60) { w.x = w.gather.x + Math.cos(a) * 10; w.z = w.gather.z + Math.sin(a) * 10; } // far away: walk in from nearby
    });
  }

  update(dt: number, player: THREE.Vector3, blocked: (x: number, z: number, r: number) => boolean) {
    this.time += dt;
    for (const w of this.walkers) {
      if (w.gather && this.time < w.gather.until) {
        const dx = w.gather.x - w.x, dz = w.gather.z - w.z, d = Math.hypot(dx, dz);
        if (d > 0.4) {
          const step = Math.min(d, 3.2 * dt), nx = w.x + dx / d * step, nz = w.z + dz / d * step;
          if (!blocked(nx, nz, 0.3)) { w.x = nx; w.z = nz; } w.yaw = Math.atan2(dx, dz); w.avatar.animate(dt, 3);
        } else { w.avatar.wave(this.time + w.speed * 10); w.yaw = Math.atan2(player.x - w.x, player.z - w.z); }
        w.avatar.root.position.set(w.x, terrainHeight(w.x, w.z), w.z); w.avatar.root.rotation.y = w.yaw;
        continue;
      }
      if (w.gather) { w.gather = null; w.avatar.sit(false); }
      // inside a building (hidden) — group members stay with their leader
      const inside = w.leader ? w.leader.inside : w.inside;
      if (inside > 0) {
        if (!w.leader) { w.inside -= dt; if (w.inside <= 0) this.exitBuilding(w); }
        w.avatar.root.visible = false;
        if (w.leader) { w.x = w.leader.x + w.side; w.z = w.leader.z; }
        continue;
      }
      w.avatar.root.visible = this.shown;
      const dp = Math.hypot(player.x - w.x, player.z - w.z);
      let moveSpeed = 0;
      if (w.talking > 0 || dp < 2.4) {
        // stop and face the player
        w.talking = Math.max(0, w.talking - dt);
        const want = Math.atan2(player.x - w.x, player.z - w.z);
        let d = want - w.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); w.yaw += d * Math.min(1, dt * 6);
      } else if (w.leader) {
        // walk beside the leader (a little behind), matching their pace
        const L = w.leader, fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
        const tx = L.x + fz * 0.85 * w.side - fx * 0.35, tz = L.z - fx * 0.85 * w.side - fz * 0.35;
        const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { const step = Math.min(d, (L.speed * 1.35 + d) * dt); w.x += dx / d * step; w.z += dz / d * step; moveSpeed = step / Math.max(dt, 1e-3); }
        const want = d > 0.3 ? Math.atan2(dx, dz) : L.yaw; let dy = want - w.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); w.yaw += dy * Math.min(1, dt * 6);
      } else if (w.pause > 0) {
        w.pause -= dt;
      } else {
        if (!w.path.length) this.plan(w);
        const target = w.path[w.pi];
        if (target) {
          const dx = target[0] - w.x, dz = target[1] - w.z, d = Math.hypot(dx, dz);
          const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), pAhead = (player.x - w.x) * fx + (player.z - w.z) * fz;
          if (pAhead > 0 && pAhead < 1.6 && dp < 1.8) { /* someone in the way: wait */ }
          else if (d < 0.5) {
            w.pi++;
            if (w.pi >= w.path.length) { w.path = []; w.inside = 12 + this.rnd() * 40; w.avatar.root.visible = false; continue; }   // reached the door: go in
          } else {
            const step = Math.min(d, w.speed * dt); w.x += dx / d * step; w.z += dz / d * step; moveSpeed = w.speed;
            const want = Math.atan2(dx, dz); let dy = want - w.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); w.yaw += dy * Math.min(1, dt * 7);
          }
        }
        if (this.rnd() < dt * 0.02) w.pause = 1 + this.rnd() * 2;                    // the odd stop to check a phone
      }
      w.avatar.animate(dt, moveSpeed);
      w.avatar.root.position.set(w.x, terrainHeight(w.x, w.z), w.z);
      w.avatar.root.rotation.y = w.yaw;
    }
  }

  /** NPC whose body overlaps a circle (player collision). */
  hit(x: number, z: number, r: number) { return this.walkers.some(w => w.avatar.root.visible && (w.x - x) ** 2 + (w.z - z) ** 2 < (r + 0.4) ** 2); }

  nearest(x: number, z: number, maxD: number): Walker | null {
    let best: Walker | null = null, bd = maxD;
    for (const w of this.walkers) { if (!w.avatar.root.visible) continue; const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } }
    return best;
  }
}

/** Shuffle-bag line picker: no line repeats until every line in the pool has been used. */
export class LineBag {
  private bags = new Map<string, string[]>();
  private last = new Map<string, string>();
  next(key: string, pool: string[]): string {
    let bag = this.bags.get(key);
    if (!bag || !bag.length) {
      bag = [...pool].sort(() => Math.random() - 0.5);
      if (bag.length > 1 && bag[bag.length - 1] === this.last.get(key)) bag.unshift(bag.pop()!); // never the same line twice in a row
      this.bags.set(key, bag);
    }
    const line = bag.pop()!; this.last.set(key, line); return line;
  }
}
