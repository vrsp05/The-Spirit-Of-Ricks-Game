// Student life: a class schedule (be on time for a bonus), the stadium race, seasonal celebrations,
// a pet in your apartment, and decorations you buy for it.
import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { eraLook } from '../world/Npcs';
import { CAMPUS, obb, terrainHeight, type Vec2 } from '../world/campusData';
import { BUILDINGS } from '../world/buildingRegistry';
import { buildingName } from '../sidequests/trivia';
import { ERAS, type EraId } from '../world/eras';
import { DAYS, type CampusClock } from './clock';
import type { LifeHost } from './host';
import type { Progress } from './progress';

const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

// ---------------------------------------------------------------- class schedule
export interface ClassSlot { days: number[]; hour: number; building: string; subject: string }
export function scheduleFor(era: EraId): ClassSlot[] {
  return [
    { days: [0, 2, 4], hour: 9, building: era === 'presentFinale' ? 'stc' : 'romney', subject: era === 'presentFinale' ? 'Intro to Programming' : 'College Algebra' },
    { days: [1, 3], hour: 10, building: 'smith', subject: 'English 101' },
    { days: [0, 1, 2, 3, 4], hour: 14, building: 'taylor', subject: 'Book of Mormon' },
    { days: [1, 3], hour: 16, building: era === 'ricks1999' || era === 'transition' ? 'austin' : 'benson', subject: era === 'ricks1999' || era === 'transition' ? 'Drafting' : 'Biology lab' },
  ];
}
const bName = (id: string, era: EraId) => { const b = BUILDINGS.find(x => x.id === id); return (b && buildingName(b, ERAS[era].year)) ?? id; };
/** The next class (or the one in progress), with minutes until it starts. */
export function nextClass(clock: CampusClock, era: EraId) {
  const now = clock.minutes, slots = scheduleFor(era), out: { slot: ClassSlot; at: number; id: number }[] = [];
  for (let d = 0; d < 8; d++) { const day = (clock.day + d) % 7, base = Math.floor(now / 1440 + d) * 1440; for (const s of slots) if (s.days.includes(day)) out.push({ slot: s, at: base + s.hour * 60, id: base / 1440 * 100 + s.hour }); }
  return out.filter(c => c.at + 50 > now).sort((a, b) => a.at - b.at)[0] ?? null;
}
export function scheduleHtml(clock: CampusClock, era: EraId, p: Progress) {
  const n = nextClass(clock, era);
  return `<table class="friends">${scheduleFor(era).map(s => `<tr><td><b>${s.subject}</b></td><td>${s.days.map(d => DAYS[d].slice(0, 3)).join(' · ')} ${String(s.hour).padStart(2, '0')}:00</td><td>${bName(s.building, era)}</td></tr>`).join('')}</table>
    <p class="sub">${n ? `Next: <b>${n.slot.subject}</b> at ${String(n.slot.hour).padStart(2, '0')}:00 in the ${bName(n.slot.building, era)} (${Math.max(0, Math.round((n.at - clock.minutes)))} min).` : ''} Walk into the building up to 15 minutes early (or 10 late) to attend. Classes attended: ${p.stat('classes')} · streak ${p.stat('classStreak')}.</p>`;
}
export class Classes {
  private reminded = 0; private attended = new Set<number>();
  constructor(private h: LifeHost, private p: Progress, private clock: CampusClock) {}
  /** Every frame: remind you before class. */
  update() {
    const n = nextClass(this.clock, this.h.era()); if (!n) return;
    const until = n.at - this.clock.minutes;
    if (until <= 20 && until > 0 && this.reminded !== n.id && !this.attended.has(n.id)) { this.reminded = n.id; this.h.toast(`📚 ${n.slot.subject} starts in ${Math.round(until)} minutes — ${bName(n.slot.building, this.h.era())}.`, 4500); }
  }
  /** You walked into a building. */
  entered(space: string) {
    const n = nextClass(this.clock, this.h.era()); if (!n || space !== `bldg-${n.slot.building}` || this.attended.has(n.id)) return;
    const d = this.clock.minutes - n.at;
    if (d < -15) return;
    this.attended.add(n.id);
    if (d <= 10) { this.p.add('classes'); this.p.add('classStreak'); this.p.earn(5); this.h.sound('chime'); this.h.toast(`✅ On time for ${n.slot.subject}! +5 coins (streak ${this.p.stat('classStreak')})`, 3500); }
    else { this.p.set('classStreak', 0); this.p.add('classes'); this.h.toast(pick([`😅 You slip into ${n.slot.subject} ${Math.round(d)} minutes late. The professor raises an eyebrow.`, `😬 Late for ${n.slot.subject}! Everyone turns to look at you.`]), 4000); }
    this.h.save();
  }
}

// ---------------------------------------------------------------- stadium race
export class StadiumRace {
  private live: { rivals: { a: Avatar; d: number; speed: number; name: string }[]; t: number; route: Vec2[]; total: number; cp: number; rings: THREE.Object3D[]; finishOrder: string[] } | null = null;
  private start: { x: number; z: number } | null = null;
  private route: Vec2[] = [];
  constructor(private h: LifeHost, private p: Progress) {}
  get active() { return !!this.live; }
  /** Laps go around the football field next to the stadium. Returns the starting point for the coach. */
  setup(): { x: number; z: number } | null {
    const fields = CAMPUS.areas.filter(a => a.kind === 'sport').map(a => ({ a, o: obb(a.poly) }));
    const field = fields.find(f => f.a.sport === 'american_football') ?? fields.sort((x, y) => y.o.length * y.o.width - x.o.length * x.o.width)[0];
    if (!field) return null;
    const o = field.o, hl = o.length / 2 + 4, hw = o.width / 2 + 4, [cx, cz] = o.center;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, u = Math.cos(a) * hl, v = Math.sin(a) * hw; this.route.push([cx + o.u[0] * u + o.v[0] * v, cz + o.u[1] * u + o.v[1] * v]); }
    this.route.push(this.route[0]);
    this.start = { x: this.route[0][0], z: this.route[0][1] };
    return this.start;
  }
  begin() {
    if (this.live || this.route.length < 4) return;
    const rings: THREE.Object3D[] = [];
    const cps = [3, 6, 9, 12].map(i => this.route[i]);
    cps.forEach(([x, z], i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.2, 8, 28), new THREE.MeshStandardMaterial({ color: i === 3 ? '#ffd34d' : '#ff5d8f', emissive: i === 3 ? '#ffd34d' : '#ff5d8f', emissiveIntensity: 0.8 })); r.position.set(x, terrainHeight(x, z) + 2.4, z); const nx = this.route[(([3, 6, 9, 12][i]) + 1) % this.route.length]; r.rotation.y = Math.atan2(nx[0] - x, nx[1] - z) + Math.PI / 2; r.visible = i === 0; this.h.scene.add(r); rings.push(r); });
    let total = 0; for (let i = 1; i < this.route.length; i++) total += Math.hypot(this.route[i][0] - this.route[i - 1][0], this.route[i][1] - this.route[i - 1][1]);
    const rivals = ['Wyatt', 'Ivy', 'Coach Reed'].map((name, i) => { const a = new Avatar({ ...eraLook(this.h.era(), 9300 + i), shirt: ['#2f4f9e', '#c0392b', '#2fbf71'][i], shorts: true }); this.h.scene.add(a.root); return { a, d: -1.2 * (i + 1), speed: 7.6 + i * 0.7 + Math.random() * 0.4, name }; });
    this.live = { rivals, t: -3, route: this.route, total, cp: 0, rings, finishOrder: [] };
    this.h.toast('🏁 On your marks… Run through the rings around the field — one lap! (Hold Shift to sprint)', 4000); this.h.sound('tick');
  }
  private posAt(d: number): { x: number; z: number; yaw: number } {
    const R = this.route; let left = Math.max(0, d);
    for (let i = 1; i < R.length; i++) { const L = Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]); if (left <= L) { const k = left / L; return { x: R[i - 1][0] + (R[i][0] - R[i - 1][0]) * k, z: R[i - 1][1] + (R[i][1] - R[i - 1][1]) * k, yaw: Math.atan2(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]) }; } left -= L; }
    const e = R[R.length - 1]; return { x: e[0], z: e[1], yaw: 0 };
  }
  tracker() { const L = this.live; if (!L) return null; return L.t < 0 ? `🏁 Race starts in ${Math.ceil(-L.t)}…` : `🏁 Stadium race · ring ${L.cp + 1}/4 · ${L.t.toFixed(1)} s`; }
  target() { const L = this.live; if (!L) return null; const r = L.rings[L.cp]; return r ? { x: r.position.x, z: r.position.z, label: `Race ring ${L.cp + 1}/4` } : null; }
  update(dt: number) {
    const L = this.live; if (!L) return;
    const pl = this.h.player();
    if (pl.space !== 'exterior' || pl.driving) { this.end(false, pl.driving ? 'No vehicles in a footrace!' : 'You left the race.'); return; }
    const prevT = L.t; L.t += dt;
    if (prevT < 0 && Math.ceil(-prevT) !== Math.ceil(-L.t)) { this.h.sound(L.t >= 0 ? 'success' : 'tick'); if (L.t >= 0) this.h.toast('GO!', 1200); }
    for (const r of L.rivals) {
      if (L.t > 0) r.d += r.speed * dt * (0.96 + Math.sin(L.t * 0.7 + r.speed) * 0.06);
      const q = this.posAt(r.d); r.a.root.position.set(q.x + Math.cos(q.yaw) * (L.rivals.indexOf(r) - 1) * 1.2, terrainHeight(q.x, q.z), q.z - Math.sin(q.yaw) * (L.rivals.indexOf(r) - 1) * 1.2); r.a.root.rotation.y = q.yaw; r.a.animate(dt, L.t > 0 && r.d < L.total ? r.speed : 0);
      if (r.d >= L.total && !L.finishOrder.includes(r.name)) L.finishOrder.push(r.name);
    }
    const ring = L.rings[L.cp];
    if (ring && L.t >= 0 && Math.hypot(pl.x - ring.position.x, pl.z - ring.position.z) < 3.6) {
      ring.visible = false; L.cp++; this.h.sound('chime');
      if (L.cp >= L.rings.length) { L.finishOrder.push('You'); const place = L.finishOrder.indexOf('You') + 1, t10 = Math.round(L.t * 10);
        const old = this.p.stat('raceBest'); if (!old || t10 < old) this.p.set('raceBest', t10);
        this.p.add('races'); if (place === 1) { this.p.add('raceWins'); this.p.earn(20); }
        this.end(true, `${['🥇 You win!', '🥈 Second place!', '🥉 Third place!', 'Fourth place — keep training!'][place - 1]} ${L.t.toFixed(1)} s${place === 1 ? ' · +20 coins' : ''}${!old || t10 < old ? ' · personal best!' : ''}`); return; }
      L.rings[L.cp].visible = true;
    }
    if (L.t > 120) this.end(false, 'Time’s up.');
  }
  end(ok: boolean, msg: string) {
    const L = this.live; if (!L) return; this.live = null;
    for (const r of L.rings) r.removeFromParent(); for (const r of L.rivals) r.a.root.removeFromParent();
    this.h.sound(ok ? 'cheer' : 'error'); this.h.toast(msg, 5000); this.h.save();
  }
}

// ---------------------------------------------------------------- seasonal celebrations
/** Decorations for the season you play in: Halloween (autumn), Christmas lights (winter),
 *  graduation (spring) and the Fourth of July (summer, with fireworks at night). */
export class Celebrations {
  private group = new THREE.Group(); private season = ''; private boomT = 0; private glow: THREE.MeshStandardMaterial[] = [];
  constructor(h: LifeHost, private spots: () => { lamps: { x: number; z: number }[]; doors: { x: number; z: number; nx: number; nz: number }[]; quad: { x: number; z: number } }, private fireworks: (x: number, y: number, z: number) => void) { h.scene.add(this.group); }
  label() { return ({ autumn: 'Halloween on campus 🎃', winter: 'Christmas lights 🎄', spring: 'Graduation week 🎓', summer: 'Fourth of July 🎆' } as Record<string, string>)[this.season] ?? ''; }
  set(season: string) {
    if (season === this.season) return; this.season = season;
    this.group.clear(); this.glow = [];
    const S = this.spots(), M = (c: string, e = 0) => { const m = new THREE.MeshStandardMaterial({ color: c, emissive: e ? c : '#000000', emissiveIntensity: e }); if (e) this.glow.push(m); return m; };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); this.group.add(b); return b; };
    if (season === 'autumn') {
      const orange = M('#e8762a'), face = M('#ffcf4a', 0.2), stem = M('#3f5f2a');
      for (const d of S.doors.slice(0, 40)) for (const s of [-1, 1]) {
        const x = d.x + d.nx * 2.2 - d.nz * s * 2.4, z = d.z + d.nz * 2.2 + d.nx * s * 2.4, y = terrainHeight(x, z);
        const pump = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), orange); pump.scale.y = 0.8; pump.position.set(x, y + 0.32, z); this.group.add(pump);
        box(0.08, 0.18, 0.08, stem, x, y + 0.7, z); const f = box(0.36, 0.14, 0.02, face, x + d.nx * 0.38, y + 0.36, z + d.nz * 0.38); f.rotation.y = Math.atan2(d.nx, d.nz);
      }
    } else if (season === 'winter') {
      const cols = ['#ff4a4a', '#4aff6a', '#4ab0ff', '#ffd34d'];
      S.lamps.slice(0, 60).forEach((l, i) => { const y = terrainHeight(l.x, l.z); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + i; box(0.12, 0.12, 0.12, M(cols[(k + i) % 4], 1.5), l.x + Math.cos(a) * 0.14, y + 0.8 + k * 0.5, l.z + Math.sin(a) * 0.14); } });
      const q = S.quad, y = terrainHeight(q.x, q.z);
      for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(3.2 - k * 0.5, 2.2, 10), M('#2f6a3a')); c.position.set(q.x, y + 1.6 + k * 1.3, q.z); this.group.add(c); }
      box(0.6, 1.2, 0.6, M('#6b4a30'), q.x, y + 0.6, q.z);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), M('#ffe066', 2)); star.position.set(q.x, y + 9.6, q.z); this.group.add(star);
      for (let k = 0; k < 40; k++) { const a = k * 2.4, r = 0.4 + (k / 40) * 2.8; box(0.18, 0.18, 0.18, M(cols[k % 4], 1.6), q.x + Math.cos(a) * r, y + 8.6 - k * 0.19, q.z + Math.sin(a) * r); }
    } else if (season === 'spring') {
      const q = S.quad, y = terrainHeight(q.x, q.z), c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!;
      g.fillStyle = '#1f3a6b'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#f4f1e8'; g.font = 'bold 48px Georgia'; g.textAlign = 'center'; g.fillText('Congratulations, Graduates!', 256, 80);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide })); ban.position.set(q.x, y + 4, q.z - 6); this.group.add(ban);
      for (const s of [-1, 1]) box(0.15, 5, 0.15, M('#3a3f45'), q.x + s * 4.1, y + 2.5, q.z - 6);
      const bal = ['#1f3a6b', '#f4f1e8', '#d1a12f'];
      for (let k = 0; k < 24; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M(bal[k % 3])); b.position.set(q.x - 4 + (k % 12) * 0.72, y + 5.2 + (k % 3) * 0.3, q.z - 6 + (k > 11 ? 0.4 : 0)); this.group.add(b); }
      for (let r = 0; r < 4; r++) for (let i = 0; i < 10; i++) box(0.5, 0.5, 0.5, M('#2a2d31'), q.x - 4.5 + i, y + 0.25, q.z - 2 + r * 1.2);   // folding chairs
    } else if (season === 'summer') {
      S.lamps.slice(0, 50).forEach(l => { const y = terrainHeight(l.x, l.z); box(0.03, 0.9, 0.03, M('#cccccc'), l.x + 0.2, y + 3.2, l.z); for (let k = 0; k < 4; k++) box(0.02, 0.1, 0.55, M(k % 2 ? '#f4f1e8' : '#b8263a'), l.x + 0.2, y + 3.55 - k * 0.1, l.z + 0.3); box(0.02, 0.2, 0.25, M('#1f3a8b'), l.x + 0.2, y + 3.5, l.z + 0.16); });
    }
  }
  update(dt: number, hour: number, daylight: number, outside: boolean) {
    this.group.visible = outside;
    const night = 1 - daylight;
    for (const m of this.glow) m.emissiveIntensity = (this.season === 'autumn' ? 0.2 : 0.4) + night * 1.6;
    if (this.season === 'summer' && outside && (hour > 21.3 || hour < 0.5) && night > 0.6) {
      this.boomT -= dt;
      if (this.boomT <= 0) { this.boomT = 1.5 + Math.random() * 2.5; const q = this.spots().quad; this.fireworks(q.x + (Math.random() - 0.5) * 60, terrainHeight(q.x, q.z) + 45 + Math.random() * 20, q.z - 40 + (Math.random() - 0.5) * 40); }
    }
  }
}

// ---------------------------------------------------------------- pet & apartment decorations
export const PETS = [{ id: 1, name: 'Goldfish', icon: '🐠' }, { id: 2, name: 'Hamster', icon: '🐹' }];
export interface DecorItem { id: string; name: string; price: number }
export const DECOR: DecorItem[] = [
  { id: 'poster', name: 'Mountain poster', price: 12 }, { id: 'lava', name: 'Lava lamp', price: 15 }, { id: 'beanbag', name: 'Bean bag', price: 20 },
  { id: 'lights', name: 'String lights', price: 18 }, { id: 'bigplant', name: 'Big leafy plant', price: 14 }, { id: 'pennant2', name: 'School pennant set', price: 10 },
];
/** Builds the pet and the decorations into the apartment (room-local), shown when owned. */
export class Apartment {
  private items = new Map<string, THREE.Object3D>(); private pet: THREE.Group | null = null; private fish: THREE.Object3D | null = null; private wheel: THREE.Object3D | null = null; private lava: THREE.Mesh[] = [];
  constructor(private g: THREE.Group, private p: Progress) {
    const m = (c: string, e = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: e ? c : '#000', emissiveIntensity: e });
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, c: THREE.Material | string, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? m(c) : c); b.position.set(x, y, z); parent.add(b); return b; };
    const add = (id: string, build: (o: THREE.Group) => void) => { const o = new THREE.Group(); build(o); o.visible = false; g.add(o); this.items.set(id, o); };
    add('poster', o => { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d')!; const gr = x.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#f4a35e'); gr.addColorStop(1, '#5a7fb0'); x.fillStyle = gr; x.fillRect(0, 0, 256, 160); x.fillStyle = '#2a3550'; x.beginPath(); x.moveTo(0, 160); x.lineTo(80, 60); x.lineTo(130, 110); x.lineTo(190, 40); x.lineTo(256, 160); x.fill(); x.fillStyle = '#f4f1e8'; x.font = 'bold 22px Georgia'; x.fillText('THE TETONS', 70, 150);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ map: t })); pl.position.set(6.97, 2.6, 2.3); pl.rotation.y = -Math.PI / 2; o.add(pl); });
    add('lava', o => { box(o, 0.18, 0.12, 0.18, '#2a2a2a', -2.72, 0.61, 0.5); const glass = box(o, 0.14, 0.4, 0.14, m('#ff6a3d', 1.2), -2.72, 0.87, 0.5); this.lava.push(glass as THREE.Mesh); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m('#ffd34d', 1.5)); b.position.set(-2.72, 0.8 + i * 0.1, 0.5); o.add(b); this.lava.push(b); } });
    add('beanbag', o => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), m('#7a2b8a')); b.scale.y = 0.6; b.position.set(-4, 0.33, 3.8); o.add(b); });
    add('lights', o => { const cols = ['#ff4a4a', '#ffd34d', '#4ab0ff', '#4aff6a']; for (let i = 0; i < 26; i++) box(o, 0.08, 0.08, 0.08, m(cols[i % 4], 1.5), -6.5 + i * 0.5, 3.15 - Math.abs(Math.sin(i * 0.6)) * 0.15, -5.9); });
    add('bigplant', o => { box(o, 0.6, 0.6, 0.6, '#c0a060', -2.6, 0.3, 4.9); for (const [x, y, z] of [[-2.6, 1.0, 4.9], [-2.4, 1.4, 5.0], [-2.8, 1.3, 4.7], [-2.6, 1.8, 4.9]]) box(o, 0.6, 0.6, 0.6, '#3d7a3a', x, y, z); });
    add('pennant2', o => { const cols = ['#7a2b2b', '#1f4e8c', '#d1a12f']; cols.forEach((c, i) => { const s = new THREE.Shape(); s.moveTo(0, 0.2); s.lineTo(0.9, 0); s.lineTo(0, -0.2); const pm = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide })); pm.position.set(-1.2 + i * 1.3, 3.0 - i * 0.1, -5.97); o.add(pm); }); });
    this.refresh();
  }
  /** Show owned decorations and the pet. */
  refresh() {
    for (const [id, o] of this.items) o.visible = this.p.stat(`own:decor-${id}`) > 0;
    const kind = this.p.stat('pet');
    if (kind && !this.pet) {
      const P = this.pet = new THREE.Group(); this.g.add(P);
      const m = (c: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, ...extra });
      const stand = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.6), m('#6b4a30')); stand.position.set(3.0, 0.4, 5.5); P.add(stand);
      if (kind === 1) {
        const tank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.45), m('#9fd0ef', { transparent: true, opacity: 0.45 })); tank.position.set(3.0, 1.08, 5.5); P.add(tank);
        const gravel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.42), m('#c9a44a')); gravel.position.set(3.0, 0.84, 5.5); P.add(gravel);
        const fish = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m('#ff8a1a')); body.scale.x = 1.6; fish.add(body); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 4), m('#ff8a1a')); tail.rotation.z = Math.PI / 2; tail.position.x = -0.13; fish.add(tail); fish.position.set(3.0, 1.1, 5.5); P.add(fish); this.fish = fish;
      } else {
        const cage = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), m('#c9c9c9', { wireframe: true })); cage.position.set(3.0, 1.05, 5.5); P.add(cage);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 16), m('#4ab0ff')); wheel.position.set(3.25, 1.02, 5.5); P.add(wheel); this.wheel = wheel;
        const ham = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m('#d9a066')); ham.scale.set(1.3, 0.9, 1); ham.position.set(2.8, 0.88, 5.5); P.add(ham); this.fish = ham;
      }
    }
  }
  /** Animate (called by the apartment's room ticks). */
  tick(t: number) {
    if (this.fish && this.p.stat('pet') === 1) { this.fish.position.set(3.0 + Math.sin(t * 0.8) * 0.3, 1.1 + Math.sin(t * 1.7) * 0.05, 5.5 + Math.cos(t * 0.8) * 0.12); this.fish.rotation.y = Math.atan2(Math.cos(t * 0.8) * 0.3, -Math.sin(t * 0.8) * 0.12) - Math.PI / 2; }
    if (this.wheel) this.wheel.rotation.z = -t * 6;
    if (this.fish && this.p.stat('pet') === 2) this.fish.position.x = 2.8 + Math.sin(t * 0.5) * 0.12;
    this.lava.forEach((b, i) => { if (i) b.position.y = 0.78 + ((t * 0.08 + i * 0.13) % 0.25); });
  }
}
/** Pet hunger: hours since last fed. */
export const petHunger = (p: Progress, clock: CampusClock) => (p.stat('pet') ? (clock.minutes - p.stat('petFed')) / 60 : 0);
