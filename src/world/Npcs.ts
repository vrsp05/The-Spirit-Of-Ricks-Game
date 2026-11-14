// Ambient NPCs: generic, fictional students/staff who walk campus paths, avoid
// buildings, stop and face the player nearby, and say a short line on interact.
// Not real people. Lines live in GAME_CONFIG.npcs (editable, era-aware).
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { Avatar, type AvatarLook, type HairStyle } from '../player/Avatar';
import type { EraId } from './eras';
import { CAMPUS, everOccupied, onVehicleRoad, PATH_KINDS, pointInPoly, terrainHeight, type Vec2 } from './campusData';

interface Walker {
  avatar: Avatar; route: Vec2[]; seg: number; t: number; dir: 1 | -1; speed: number;
  pause: number; x: number; z: number; yaw: number; talking: number;
  name: string; heard: number; gather: { x: number; z: number; until: number } | null; seed: number;
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

  constructor(scene: THREE.Scene, count = GAME_CONFIG.npcs.count) {
    let s = 777; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const routes = CAMPUS.roads
      .filter(r => PATH_KINDS.has(r.kind) && r.pts.length > 1)
      .map(r => r.pts.filter(([x, z]) => !everOccupied(x, z) && !onVehicleRoad(x, z)))
      .filter(pts => pts.length > 1 && CAMPUS.campus.some(c => pointInPoly(pts[0][0], pts[0][1], c)))
      .filter(pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L > 18; });
    const pick = <T,>(a: T[]) => a[(this.rnd() * a.length) | 0];
    for (let i = 0; i < count && routes.length; i++) {
      const route = pick(routes);
      const seed = i + 1;
      const avatar = new Avatar(eraLook('ricks1999', seed), 0.92 + this.rnd() * 0.12);
      const w: Walker = { avatar, route, seg: (this.rnd() * (route.length - 1)) | 0, t: this.rnd(), dir: this.rnd() < 0.5 ? 1 : -1,
        speed: 1.2 + this.rnd() * 0.7, pause: 0, x: 0, z: 0, yaw: 0, talking: 0, name: NAMES[i % NAMES.length], heard: 0, gather: null, seed };
      this.place(w);
      scene.add(avatar.root);
      this.walkers.push(w);
    }
  }

  private place(w: Walker) {
    const a = w.route[w.seg], b = w.route[w.seg + 1];
    w.x = a[0] + (b[0] - a[0]) * w.t; w.z = a[1] + (b[1] - a[1]) * w.t;
  }

  /** Re-dress everyone for the era (winter coats in 2011, flannel in 1999, …). */
  private lookKey = '';
  setEra(era: EraId, season: 'spring' | 'summer' | 'autumn' | 'winter' = 'autumn') { const k = era + season; if (k === this.lookKey) return; this.lookKey = k; for (const w of this.walkers) w.avatar.rebuild(eraLook(era, w.seed, season)); }

  setVisible(v: boolean) { for (const w of this.walkers) w.avatar.root.visible = v; }

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
      const dp = Math.hypot(player.x - w.x, player.z - w.z);
      if (w.talking > 0 || dp < 2.4) {
        // stop and face the player
        w.talking = Math.max(0, w.talking - dt);
        const want = Math.atan2(player.x - w.x, player.z - w.z);
        let d = want - w.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); w.yaw += d * Math.min(1, dt * 6);
        w.avatar.animate(dt, 0);
      } else if (w.pause > 0) {
        w.pause -= dt; w.avatar.animate(dt, 0);
      } else {
        const a = w.route[w.seg], b = w.route[w.seg + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.01;
        w.t += (w.dir * w.speed * dt) / L;
        if (w.t > 1 || w.t < 0) {
          w.seg += w.dir; w.t = w.dir > 0 ? 0 : 1;
          if (w.seg < 0 || w.seg >= w.route.length - 1) { w.dir = (w.dir * -1) as 1 | -1; w.seg = Math.max(0, Math.min(w.route.length - 2, w.seg)); w.t = w.dir > 0 ? 0 : 1; if (this.rnd() < 0.5) w.pause = 1 + this.rnd() * 3; }
        }
        const ox = w.x, oz = w.z; this.place(w);
        if (blocked(w.x, w.z, 0.35)) { w.x = ox; w.z = oz; w.dir = (w.dir * -1) as 1 | -1; w.pause = 0.5; } // a building/prop in the way: turn around
        const dx = w.x - ox, dz = w.z - oz;
        if (Math.abs(dx) + Math.abs(dz) > 1e-4) { const want = Math.atan2(dx, dz); let d = want - w.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); w.yaw += d * Math.min(1, dt * 8); }
        w.avatar.animate(dt, w.speed);
        if (this.rnd() < dt * 0.04) w.pause = 1 + this.rnd() * 2.5; // occasional stop
      }
      w.avatar.root.position.set(w.x, terrainHeight(w.x, w.z), w.z);
      w.avatar.root.rotation.y = w.yaw;
    }
  }

  /** NPC whose body overlaps a circle (player collision). */
  hit(x: number, z: number, r: number) { return this.walkers.some(w => w.avatar.root.visible && (w.x - x) ** 2 + (w.z - z) ** 2 < (r + 0.4) ** 2); }

  nearest(x: number, z: number, maxD: number): Walker | null {
    let best: Walker | null = null, bd = maxD;
    for (const w of this.walkers) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } }
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
