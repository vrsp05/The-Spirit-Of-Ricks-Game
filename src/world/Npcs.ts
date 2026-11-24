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
import { chatFor, GREETINGS, GREETINGS_KNOWN, type Chat } from './npcChatter';

export interface Walker {
  avatar: Avatar; route: Vec2[]; speed: number;
  pause: number; x: number; z: number; yaw: number; talking: number;
  name: string; heard: number; gather: { x: number; z: number; until: number } | null; seed: number;
  /** current route (points), index of the next point, where they're heading */
  path: Vec2[]; pi: number; dest: Vec2 | null;
  inside: number;                 // > 0: inside a building for this many seconds (hidden)
  leader: Walker | null; side: number;   // group members walk beside their leader
  // ---- social life ----
  /** Standing conversation with another walker (speech bubbles take turns). */
  chat: { partner: Walker; chat: Chat; li: number; t: number; starter: boolean } | null;
  chatCool: number;               // seconds before they'll start another conversation
  /** Small talk while walking in a group (leader only). */
  walkChat: { chat: Chat; li: number; t: number; who: Walker[] } | null;
  bench: { x: number; z: number; yaw: number; sitting: boolean; until: number } | null;
  phone: number;                  // > 0: stopped to check their phone
  greetCool: number; waving: number;
  /** Has the player talked to them? Then they greet you by name. */
  met: boolean;
  scan: number;
  bubble: Bubble | null;
  posed: boolean;                 // phone pose applied (undo it when they put the phone away)
}

/** A speech bubble over someone's head (a canvas sprite; redrawn only when the text changes). */
export class Bubble {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  text = ''; left = 0;
  constructor(scene: THREE.Scene) {
    this.canvas.width = 384; this.canvas.height = 128;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.sprite.scale.set(3.0, 1.0, 1); this.sprite.renderOrder = 9; this.sprite.visible = false; scene.add(this.sprite);
  }
  say(text: string, seconds: number) {
    this.left = seconds; if (text === this.text) return; this.text = text;
    const g = this.canvas.getContext('2d')!, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.font = 'bold 26px system-ui, sans-serif';
    // wrap into at most 3 lines
    const words = text.split(' '), lines: string[] = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > W - 40 && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); lines.length = Math.min(lines.length, 3);
    const lh = 28, bh = lines.length * lh + 18, bw = Math.min(W - 8, Math.max(...lines.map(l => g.measureText(l).width)) + 34), x0 = (W - bw) / 2, y0 = H - bh - 16;
    g.fillStyle = 'rgba(255,253,246,0.95)'; g.strokeStyle = 'rgba(40,30,20,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x0, y0, bw, bh, 16); g.moveTo(W / 2 - 10, y0 + bh); g.lineTo(W / 2, H - 3); g.lineTo(W / 2 + 10, y0 + bh); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,253,246,0.95)'; g.fillRect(W / 2 - 9, y0 + bh - 3, 18, 4);
    g.fillStyle = '#2a211b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + 9 + lh / 2 + i * lh));
    this.tex.needsUpdate = true;
  }
  update(dt: number, x: number, y: number, z: number, show: boolean) {
    this.left -= dt;
    this.sprite.visible = show && this.left > 0;
    if (this.sprite.visible) this.sprite.position.set(x, y, z);
  }
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

// Fictional first names for ambient students (not real people) — one each, so speech labels never collide.
const NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Drew', 'Parker', 'Rowan', 'Skyler', 'Reese', 'Emerson', 'Hayden', 'Kendall', 'Logan', 'Blake',
  'Brooke', 'Carter', 'Dallin', 'Eliza', 'Finn', 'Gracie', 'Hunter', 'Ivy', 'Jace', 'Kenzie', 'Landon', 'Maddie', 'Nate', 'Olivia', 'Porter', 'Rachel', 'Spencer', 'Tessa', 'Wyatt', 'Zoe',
  'Ammon', 'Bryce', 'Camille', 'Dax', 'Emma', 'Gavin', 'Hallie', 'Isaac', 'Jenna', 'Kade'];

export interface BenchSpot { x: number; z: number; yaw: number }
const angleTo = (from: number, to: number) => { const d = to - from; return Math.atan2(Math.sin(d), Math.cos(d)); };

export class NpcCrowd {
  readonly walkers: Walker[] = [];
  private rnd: () => number;

  private graph = pathGraph();
  private shown = true;
  /** Player's name (greetings use it once you've met someone). */
  playerName = '';
  private era: EraId = 'ricks1999';

  /** doors(): entrances of buildings standing in the current era (where people can go). benches(): where they can sit. */
  constructor(private scene: THREE.Scene, count = GAME_CONFIG.npcs.count, private doors: () => Vec2[] = () => [], private benches: () => BenchSpot[] = () => []) {
    let s = 777; this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count && this.graph.size; i++) {
      const seed = i + 1;
      const avatar = new Avatar(eraLook('ricks1999', seed), 0.92 + this.rnd() * 0.12);
      const n = this.graph.pts[this.graph.random(this.rnd, onCampus)];
      // about a third walk with a friend (groups of 2–3)
      const prev = this.walkers[this.walkers.length - 1];
      const joins = !!prev && !prev.leader && this.rnd() < 0.35, leader = joins ? prev : null;
      const w: Walker = { avatar, route: [], speed: 1.15 + this.rnd() * 0.6, pause: this.rnd() * 3, x: leader ? leader.x + 1 : n[0], z: leader ? leader.z : n[1], yaw: 0, talking: 0,
        name: NAMES[i % NAMES.length], heard: 0, gather: null, seed, path: [], pi: 0, dest: null, inside: 0, leader, side: leader ? (this.walkers.filter(x => x.leader === leader).length % 2 ? -1 : 1) : 0,
        chat: null, chatCool: 5 + this.rnd() * 30, walkChat: null, bench: null, phone: 0, greetCool: this.rnd() * 20, waving: 0, met: false, scan: this.rnd(), bubble: null, posed: false };
      scene.add(avatar.root);
      this.walkers.push(w);
    }
  }

  /** Pick a building entrance (or, now and then, a bench) and route there along the paths. */
  private plan(w: Walker) {
    if (!w.leader && this.rnd() < 0.18 && this.planBench(w)) return;
    const doors = this.doors();
    for (let k = 0; k < 6; k++) {
      const dest: Vec2 = doors.length ? doors[(this.rnd() * doors.length) | 0] : this.graph.pts[this.graph.random(this.rnd)];
      if (Math.hypot(dest[0] - w.x, dest[1] - w.z) < 25) continue;                 // somewhere worth walking to
      const r = this.graph.route(this.graph.nearest(w.x, w.z), this.graph.nearest(dest[0], dest[1]));
      if (r && r.length > 1) { w.path = [...r, dest]; w.pi = 0; w.dest = dest; w.route = w.path; return; }
    }
    w.pause = 2;                                                                    // try again shortly
  }
  /** Walk to a free bench nearby and sit for a while (only people without a group). */
  private planBench(w: Walker): boolean {
    const free = this.benches().filter(b => Math.hypot(b.x - w.x, b.z - w.z) < 70 && !this.walkers.some(o => o.bench && Math.hypot(o.bench.x - b.x, o.bench.z - b.z) < 1));
    if (!free.length) return false;
    const b = free[(this.rnd() * free.length) | 0];
    const r = this.graph.route(this.graph.nearest(w.x, w.z), this.graph.nearest(b.x, b.z));
    if (!r) return false;
    // stop just in front of the bench, then sit down on it
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    w.path = [...r, [b.x + fx * 0.7, b.z + fz * 0.7]]; w.pi = 0; w.dest = null; w.route = w.path;
    w.bench = { x: b.x, z: b.z, yaw: b.yaw, sitting: false, until: 0 };
    return true;
  }
  /** Come back out of a building (at its door, or another one) and pick the next place. */
  private exitBuilding(w: Walker) {
    w.inside = 0; const d = w.dest ?? this.graph.pts[this.graph.random(this.rnd)];
    w.x = d[0]; w.z = d[1]; w.dest = null; w.path = []; this.plan(w);
  }
  private standFromBench(w: Walker) {
    if (!w.bench) return;
    const fx = Math.sin(w.bench.yaw), fz = Math.cos(w.bench.yaw);
    if (w.bench.sitting) { w.avatar.phonePose(0); w.posed = false; w.avatar.sit(false); w.x += fx * 0.8; w.z += fz * 0.8; }
    w.bench = null; w.path = [];
  }

  /** Re-dress everyone for the era (winter coats in 2011, flannel in 1999, …). */
  private lookKey = '';
  setEra(era: EraId, season: 'spring' | 'summer' | 'autumn' | 'winter' = 'autumn') {
    this.era = era;
    const k = era + season; if (k === this.lookKey) return; this.lookKey = k;
    for (const w of this.walkers) { w.avatar.rebuild(eraLook(era, w.seed, season)); if (w.bench?.sitting) w.avatar.sit(true); }
  }

  setVisible(v: boolean) { this.shown = v; for (const w of this.walkers) { w.avatar.root.visible = v && w.inside <= 0; if (!v && w.bubble) w.bubble.sprite.visible = false; } }

  private time = 0;
  /** Gather the nearest walkers around a point to cheer (celebrations). */
  gather(x: number, z: number, seconds: number) {
    const near = [...this.walkers].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, 10);
    near.forEach((w, i) => {
      this.endChat(w); this.standFromBench(w);
      const a = (i / near.length) * Math.PI * 2, r = 7 + (i % 3) * 1.5;
      w.gather = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, until: this.time + seconds };
      if (Math.hypot(w.x - x, w.z - z) > 60) { w.x = w.gather.x + Math.cos(a) * 10; w.z = w.gather.z + Math.sin(a) * 10; } // far away: walk in from nearby
    });
  }

  // ---------------------------------------------------------------- talking
  private say(w: Walker, text: string, seconds = 2.8) { (w.bubble ??= new Bubble(this.scene)).say(text, seconds); }
  /** Is this avatar talking in a bubble conversation right now? (The game leaves its mouth to us.) */
  speaking(a: Avatar) { return this.walkers.some(w => w.avatar === a && (w.chat || w.walkChat) && a.talking); }
  private startChat(a: Walker, b: Walker) {
    const chat = chatFor(this.era, this.rnd);
    a.chat = { partner: b, chat, li: 0, t: 0, starter: true };
    b.chat = { partner: a, chat, li: 0, t: 0, starter: false };
    a.phone = b.phone = 0;
  }
  /** Stop a conversation (both people), e.g. when the player joins in or it's over. */
  endChat(w: Walker) {
    const c = w.chat; if (!c) return;
    for (const p of [w, c.partner]) { p.chat = null; p.chatCool = 40 + this.rnd() * 70; p.avatar.talking = false; if (p.bubble) p.bubble.left = 0; }
  }
  /** The conversation partner and topic, if `w` is chatting (used when the player walks up). */
  chatInfo(w: Walker) { return w.chat ? { partner: w.chat.partner, topic: w.chat.chat.topic } : null; }
  /** The player said hello: remember them. */
  meet(w: Walker) { w.met = true; }

  /** Drive a two-person conversation: one line per bubble, taking turns. Returns true while it runs. */
  private updateChat(w: Walker, dt: number) {
    const c = w.chat!; if (!c.starter) return;                         // the starter runs the clock for both
    const p = c.partner;
    c.t -= dt;
    if (c.t <= 0) {
      if (c.li >= c.chat.lines.length) { this.endChat(w); return; }
      const speaker = c.li % 2 === 0 ? w : p, listener = speaker === w ? p : w;
      const line = c.chat.lines[c.li++];
      this.say(speaker, line, 2.2 + line.length * 0.045); speaker.avatar.talking = true; listener.avatar.talking = false;
      c.t = 2.4 + line.length * 0.045;
      if (p.chat) p.chat.li = c.li;
    }
  }

  update(dt: number, player: THREE.Vector3, blocked: (x: number, z: number, r: number) => boolean) {
    this.time += dt;
    const near = (w: Walker) => Math.hypot(player.x - w.x, player.z - w.z);
    for (const w of this.walkers) {
      w.chatCool -= dt; w.greetCool -= dt; w.waving -= dt;
      if (w.gather && this.time < w.gather.until) {
        const dx = w.gather.x - w.x, dz = w.gather.z - w.z, d = Math.hypot(dx, dz);
        if (d > 0.4) {
          const step = Math.min(d, 3.2 * dt), nx = w.x + dx / d * step, nz = w.z + dz / d * step;
          if (!blocked(nx, nz, 0.3)) { w.x = nx; w.z = nz; } w.yaw = Math.atan2(dx, dz); w.avatar.animate(dt, 3);
        } else { w.avatar.wave(this.time + w.speed * 10); w.yaw = Math.atan2(player.x - w.x, player.z - w.z); }
        w.avatar.root.position.set(w.x, terrainHeight(w.x, w.z), w.z); w.avatar.root.rotation.y = w.yaw;
        w.bubble?.update(dt, 0, 0, 0, false);
        continue;
      }
      if (w.gather) { w.gather = null; w.avatar.sit(false); }
      // inside a building (hidden) — group members stay with their leader
      const inside = w.leader ? w.leader.inside : w.inside;
      if (inside > 0) {
        if (!w.leader) { w.inside -= dt; if (w.inside <= 0) this.exitBuilding(w); }
        w.avatar.root.visible = false; w.walkChat = null;
        if (w.leader) { w.x = w.leader.x + w.side; w.z = w.leader.z; }
        w.bubble?.update(dt, 0, 0, 0, false);
        continue;
      }
      w.avatar.root.visible = this.shown;
      const dp = near(w);
      let moveSpeed = 0, faceYaw: number | null = null, phoneOn = false;
      // ---- look for someone to talk to (a few times a second, not every frame)
      w.scan -= dt;
      if (w.scan <= 0) {
        w.scan = 0.6 + this.rnd() * 0.5;
        const free = (o: Walker) => !o.leader && !o.chat && !o.bench && !o.gather && o.chatCool <= 0 && o.inside <= 0 && o.talking <= 0 && !this.walkers.some(f => f.leader === o);
        if (free(w) && dp > 3) {
          const p = this.walkers.find(o => o !== w && free(o) && near(o) > 3 && Math.hypot(o.x - w.x, o.z - w.z) < 3.2);
          if (p && this.rnd() < 0.45) this.startChat(w, p);
        }
        // say hi when the player walks past (by name, once you've met)
        if (!w.chat && !w.walkChat && dp > 2 && dp < 6 && w.greetCool <= 0 && this.rnd() < 0.3) {
          const known = w.met && this.playerName;
          const pool = known ? GREETINGS_KNOWN : GREETINGS;
          this.say(w, pool[(this.rnd() * pool.length) | 0].replace('{name}', this.playerName), 2.2);
          w.waving = 1.3; w.greetCool = 50 + this.rnd() * 80;
        }
        // groups make small talk as they walk
        const followers = this.walkers.filter(f => f.leader === w);
        if (followers.length && !w.walkChat && this.rnd() < 0.05) w.walkChat = { chat: chatFor(this.era, this.rnd), li: 0, t: 0, who: [w, ...followers] };
      }
      if (w.walkChat) {
        const c = w.walkChat; c.t -= dt;
        if (c.t <= 0) {
          if (c.li >= c.chat.lines.length) { for (const p of c.who) p.avatar.talking = false; w.walkChat = null; }
          else { const sp = c.who[c.li % c.who.length], line = c.chat.lines[c.li++]; for (const p of c.who) p.avatar.talking = p === sp; this.say(sp, line, 2.2 + line.length * 0.045); c.t = 2.5 + line.length * 0.045; }
        }
      }

      if (w.talking > 0 || (dp < 2.4 && !w.bench?.sitting)) {
        // stop and face the player
        w.talking = Math.max(0, w.talking - dt);
        faceYaw = Math.atan2(player.x - w.x, player.z - w.z);
      } else if (w.chat) {
        // standing conversation: step closer if needed, face each other, take turns talking
        const p = w.chat.partner, dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
        if (d > 1.5) { const step = Math.min(d - 1.4, 1.0 * dt); w.x += dx / d * step; w.z += dz / d * step; moveSpeed = 1; }
        faceYaw = Math.atan2(dx, dz);
        this.updateChat(w, dt);
      } else if (w.bench) {
        const b = w.bench;
        if (b.sitting) {
          phoneOn = true;
          if (this.time > b.until || (dp < 1.2)) this.standFromBench(w);
        } else this.walkPath(w, dt, player, dp, v => { moveSpeed = v; }, () => {
          // arrived in front of the bench: sit (unless the player is sitting there)
          if (Math.hypot(player.x - b.x, player.z - b.z) < 1.2) { w.bench = null; w.path = []; return; }
          b.sitting = true; b.until = this.time + 15 + this.rnd() * 30;
          w.x = b.x; w.z = b.z; w.yaw = b.yaw; w.avatar.sit(true);
        });
      } else if (w.leader) {
        // walk beside the leader (a little behind), matching their pace
        const L = w.leader, fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
        const tx = L.x + fz * 0.85 * w.side - fx * 0.35, tz = L.z - fx * 0.85 * w.side - fz * 0.35;
        const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { const step = Math.min(d, (L.speed * 1.35 + d) * dt); w.x += dx / d * step; w.z += dz / d * step; moveSpeed = step / Math.max(dt, 1e-3); }
        faceYaw = d > 0.3 ? Math.atan2(dx, dz) : L.yaw;
      } else if (w.pause > 0) {
        w.pause -= dt; phoneOn = w.phone > 0; w.phone -= dt;
      } else {
        this.walkPath(w, dt, player, dp, v => { moveSpeed = v; }, () => { w.path = []; w.inside = 12 + this.rnd() * 40; w.avatar.root.visible = false; });
        if (this.rnd() < dt * 0.02) { w.pause = 1.5 + this.rnd() * 3; w.phone = this.rnd() < 0.6 ? w.pause : 0; }   // the odd stop to check a phone
      }
      if (faceYaw !== null) w.yaw += angleTo(w.yaw, faceYaw) * Math.min(1, dt * 6);
      w.avatar.animate(dt, moveSpeed);
      // poses on top of the walk cycle
      if (phoneOn) { w.avatar.phonePose(1, Math.sin(this.time * 0.7 + w.seed) * 0.2 - 0.25); w.posed = true; }
      else if (w.posed) { w.avatar.phonePose(0); w.posed = false; if (w.avatar.seated) w.avatar.sit(true); }
      if (w.waving > 0) w.avatar.wave(this.time);
      else if (w.avatar.talking && (w.chat || w.walkChat)) { w.avatar.gesture(this.time, w.seed); w.avatar.updateMouth(dt); }
      else if (w.chat || w.walkChat) w.avatar.updateMouth(dt);
      const sitY = w.bench?.sitting ? 0.05 : 0;
      w.avatar.root.position.set(w.x, terrainHeight(w.x, w.z) + sitY, w.z);
      w.avatar.root.rotation.y = w.yaw;
      w.bubble?.update(dt, w.x, terrainHeight(w.x, w.z) + (w.bench?.sitting ? 2.2 : 2.75), w.z, this.shown && dp < 38);
    }
  }
  /** Follow the current path; `arrive` runs at its end. */
  private walkPath(w: Walker, dt: number, player: THREE.Vector3, dp: number, moved: (v: number) => void, arrive: () => void) {
    if (!w.path.length) this.plan(w);
    const target = w.path[w.pi]; if (!target) return;
    const dx = target[0] - w.x, dz = target[1] - w.z, d = Math.hypot(dx, dz);
    const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), pAhead = (player.x - w.x) * fx + (player.z - w.z) * fz;
    if (pAhead > 0 && pAhead < 1.6 && dp < 1.8) return;                                          // someone in the way: wait
    if (d < 0.5) { w.pi++; if (w.pi >= w.path.length) arrive(); return; }
    const step = Math.min(d, w.speed * dt); w.x += dx / d * step; w.z += dz / d * step; moved(w.speed);
    w.yaw += angleTo(w.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 7);
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
