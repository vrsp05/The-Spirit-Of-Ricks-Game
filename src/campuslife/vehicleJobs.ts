// Vehicle jobs: missions you play with cars, golf carts, the plane and the helicopter.
//   shuttle   Campus Shuttle    pick up three students and drive them where they need to go (car or golf cart)
//   rally     Campus Rally      drive through the checkpoints on the streets against the clock (best time saved)
//   parking   Parking Pro       park neatly in three marked spaces
//   flight    Flight School     take the plane up, fly through the rings, land back at the lot
//   heli      Rooftop Delivery  fly supplies by helicopter and land them on campus rooftops
// Each has an instructor standing by the biggest campus parking lot ("!" over their head). Jobs pay
// coins (campus life) once, can be replayed for best times, and count toward achievements.
import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { eraLook, Bubble } from '../world/Npcs';
import { CAMPUS, everOccupied, onVehicleRoad, pointInPoly, registryPoly, type Vec2 } from '../world/campusData';
import { BUILDINGS } from '../world/buildingRegistry';
import { buildingName } from '../sidequests/trivia';
import { ERAS } from '../world/eras';
import type { LifeHost } from './host';
import type { Progress } from './progress';

type JobId = 'shuttle' | 'rally' | 'parking' | 'flight' | 'heli';
interface JobDef { id: JobId; title: string; giver: string; role: string; shirt: string; reward: number; vehicle: string; summary: string }
export const JOBS: JobDef[] = [
  { id: 'shuttle', title: 'Campus Shuttle', giver: 'Dave', role: 'Shuttle dispatcher', shirt: '#2f6d4f', reward: 60, vehicle: 'a car or golf cart', summary: 'Pick up three students and drive them to class.' },
  { id: 'rally', title: 'Campus Rally', giver: 'Rosa', role: 'Rally marshal', shirt: '#c0392b', reward: 45, vehicle: 'a car or golf cart', summary: 'Drive through every checkpoint before time runs out.' },
  { id: 'parking', title: 'Parking Pro', giver: 'Officer Kim', role: 'Parking Services', shirt: '#2b3550', reward: 35, vehicle: 'a car or golf cart', summary: 'Park neatly in three marked spaces.' },
  { id: 'flight', title: 'Flight School', giver: 'Captain Ruiz', role: 'Flight instructor', shirt: '#e8e2d0', reward: 80, vehicle: 'the plane', summary: 'Fly through the rings, then land back at the lot.' },
  { id: 'heli', title: 'Rooftop Delivery', giver: 'Jo', role: 'Helicopter pilot', shirt: '#d9662a', reward: 80, vehicle: 'the helicopter', summary: 'Deliver supplies to campus rooftops.' },
];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const isCar = (k: string | false) => k === 'car' || k === 'cart';

/** Extra things vehicle jobs need from the game. */
export interface JobHost {
  spawnAircraft(kind: 'heli' | 'plane'): string | null;
  /** Height of rooftops at x,z (0 = open ground). */
  roofY(x: number, z: number): number;
  /** The vehicle you're in: its heading and speed. */
  vehicle(): { kind: string; yaw: number; speed: number; altitude: number } | null;
}
interface Live { job: JobDef; left: number; t: number; step: number; objs: THREE.Object3D[]; targets: { x: number; y: number; z: number; r: number; obj: THREE.Object3D; label: string; extra?: unknown }[]; status: string; done: boolean }

/** A glowing ring (sky rings stand up; ground ones lie flat). */
function ring(r: number, color: string, flat = false) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 8, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }));
  if (flat) m.rotation.x = Math.PI / 2; return m;
}
/** A tall translucent beacon, visible from far away. */
function beacon(color: string, h = 30) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, h, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = h / 2; return m;
}

export class VehicleJobs {
  private live: Live | null = null;
  private givers: { def: JobDef; a: Avatar; x: number; z: number; yaw: number; icon: THREE.Sprite; bubble: Bubble }[] = [];
  private lot: { x: number; z: number; poly: Vec2[] } | null = null;
  private time = 0;
  constructor(private h: LifeHost, private jh: JobHost, private p: Progress) {}

  get active() { return !!this.live; }
  done(id: JobId) { return this.p.stat(`job:${id}`) > 0; }
  doneCount() { return JOBS.filter(j => this.done(j.id)).length; }
  tracker() { return this.live?.status ?? null; }
  /** Where the HUD pointer should lead. */
  target(): { x: number; z: number; label: string } | null { const t = this.live?.targets[this.live.step]; return t ? { x: t.x, z: t.z, label: t.label } : null; }

  // ---------------------------------------------------------------- setup
  setup() {
    // the biggest parking lot on campus: where the instructors wait and the aircraft take off
    const lots = CAMPUS.areas.filter(a => a.kind === 'parking' && CAMPUS.campus.some(c => pointInPoly(a.poly[0][0], a.poly[0][1], c)));
    const area = (poly: Vec2[]) => Math.abs(poly.reduce((s, q, i) => { const n = poly[(i + 1) % poly.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2;
    const big = lots.sort((a, b) => area(b.poly) - area(a.poly))[0];
    if (!big) return;
    const cx = big.poly.reduce((s, q) => s + q[0], 0) / big.poly.length, cz = big.poly.reduce((s, q) => s + q[1], 0) / big.poly.length;
    this.lot = { x: cx, z: cz, poly: big.poly };
    // instructors in a line along the lot's edge
    JOBS.forEach((def, i) => {
      let x = cx + (i - 2) * 3.2, z = cz;
      for (let k = 0; k < 30 && (this.h.world.blocked(x, z, 0.6) || !pointInPoly(x, z, big.poly)); k++) { x = cx + (i - 2) * 3.2 + rand(-8, 8); z = cz + rand(-8, 8); }
      const a = new Avatar({ ...eraLook(this.h.era(), 7000 + i), shirt: def.shirt, hat: def.id === 'flight' || def.id === 'heli' ? 'cap' : 'none', hatColor: '#2a2a2a' });
      a.root.position.set(x, this.h.world.groundY(x, z), z); a.root.rotation.y = Math.PI;
      const icon = this.icon(); a.root.add(icon); this.h.scene.add(a.root);
      const g = { def, a, x, z, yaw: Math.PI, icon, bubble: new Bubble(this.h.scene) }; this.givers.push(g);
      this.h.addInteractable({ id: `job:${def.id}`, at: { x, z }, radius: 2.8, npc: true, prompt: `Talk to ${def.giver} (${def.role})`, onInteract: () => this.talk(g) });
    });
  }
  private icon() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    g.fillStyle = '#ffcc33'; g.strokeStyle = '#2a211b'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🚗', 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(0.9, 0.9, 1); s.position.y = 2.75; s.renderOrder = 9; return s;
  }
  /** Re-dress the instructors for the era. */
  setEra() { this.givers.forEach((g, i) => g.a.rebuild({ ...eraLook(this.h.era(), 7000 + i), shirt: g.def.shirt, hat: g.def.id === 'flight' || g.def.id === 'heli' ? 'cap' : 'none', hatColor: '#2a2a2a' })); }

  private async talk(g: (typeof this.givers)[number]) {
    const d = g.def, who = `${d.giver} · ${d.role}`;
    if (this.live) { if (this.live.job === d) { const r = await this.h.choose(d.title, 'Want to stop this job?', [{ id: 'stop', label: 'Stop the job' }, { id: 'go', label: 'Keep going' }]); if (r === 'stop') this.end(false, 'Job stopped.'); } else this.h.toast(`Finish “${this.live.job.title}” first.`); return; }
    const best = this.p.stat(`jobBest:${d.id}`);
    const intro: Record<JobId, string> = {
      shuttle: 'Our shuttle drivers are all out sick! Grab a car or a golf cart and get three students to class on time.',
      rally: 'Welcome to the Campus Rally! Hop in a car or cart and hit every checkpoint on the streets before the clock runs out.',
      parking: 'Parking Services here. Think you can park neatly? Three marked spaces — nose in, straight, and stopped.',
      flight: 'Ready for your first lesson? I’ll bring the plane. Throttle up with W, climb with Space, fly through the rings, then land back here.',
      heli: 'I need a pilot for some rooftop deliveries. The helicopter is fueled. Pick up the crate, then land it on each roof I mark.',
    };
    await this.h.talk(g.a.root, [{ speaker: who, text: intro[d.id] }]);
    const r = await this.h.choose(d.title, `${d.summary}\nYou’ll need ${d.vehicle}.${this.done(d.id) ? `\nDone before${best ? ` — best ${fmt(best)}` : ''}. Replay for fun (no coins).` : `\nReward: ${d.reward} coins.`}`,
      [{ id: 'go', label: '▶ Start the job' }, { id: 'no', label: 'Not now' }]);
    if (r === 'go') this.start(d);
  }

  // ---------------------------------------------------------------- jobs
  private start(job: JobDef) {
    const L: Live = { job, left: 0, t: 0, step: 0, objs: [], targets: [], status: '', done: false };
    const add = (o: THREE.Object3D) => { this.h.scene.add(o); L.objs.push(o); return o; };
    const pl = this.h.player();
    if (job.id === 'shuttle') {
      L.left = 300;
      const blds = ['mckay', 'manwaring', 'taylor', 'romney', 'smith', 'hart', 'snow', 'austin', 'kimball', 'clarke', 'benson', 'hinckley'].filter(b => this.h.world.buildingStanding(b)).sort(() => Math.random() - 0.5);
      const names = ['Ashley', 'Ben', 'Carmen', 'Derek', 'Elena', 'Felipe'].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 3; i++) {
        const from = this.roadside(blds[i * 2]), to = this.roadside(blds[i * 2 + 1]); if (!from || !to) continue;
        const a = new Avatar(eraLook(this.h.era(), 8100 + i)); a.root.position.set(from.x, this.h.world.groundY(from.x, from.z), from.z); add(a.root);
        const pick = add(new THREE.Group()); pick.add(beacon('#ffd34d', 18)); pick.position.set(from.x, this.h.world.groundY(from.x, from.z), from.z);
        const drop = add(new THREE.Group()); drop.add(beacon('#5ab0ff', 18), ring(3.5, '#5ab0ff', true)); drop.position.set(to.x, this.h.world.groundY(to.x, to.z) + 0.2, to.z); drop.visible = false;
        L.targets.push({ x: from.x, y: 0, z: from.z, r: 6, obj: pick, label: `Pick up ${names[i]}`, extra: { a, name: names[i] } });
        L.targets.push({ x: to.x, y: 0, z: to.z, r: 8, obj: drop, label: `Drop ${names[i]} at the ${this.bName(blds[i * 2 + 1])}`, extra: { a, name: names[i], dest: this.bName(blds[i * 2 + 1]) } });
      }
    } else if (job.id === 'rally') {
      L.left = 150;
      const pts = this.roadChain(pl.x, pl.z, 8);
      pts.forEach(([x, z], i) => { const o = add(new THREE.Group()); const rg = ring(4.5, i === pts.length - 1 ? '#ffd34d' : '#ff5d8f'); rg.position.y = 3.5; o.add(rg, beacon('#ff5d8f', 14)); o.position.set(x, this.h.world.groundY(x, z), z);
        o.visible = i === 0; L.targets.push({ x, y: 0, z, r: 6.5, obj: o, label: `Checkpoint ${i + 1}/${pts.length}` }); });
    } else if (job.id === 'parking') {
      L.left = 120;
      for (const s of this.parkingSpots(3)) {
        const o = add(new THREE.Group()); const lines = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.45, depthWrite: false }));
        lines.rotation.x = -Math.PI / 2; o.add(lines, beacon('#ffd34d', 10)); const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.2, 1.6); o.add(arrow);
        o.position.set(s.x, this.h.world.groundY(s.x, s.z) + 0.05, s.z); o.rotation.y = s.yaw; o.visible = false;
        L.targets.push({ x: s.x, y: 0, z: s.z, r: 1.4, obj: o, label: 'Park in the yellow space', extra: { yaw: s.yaw } });
      }
      if (L.targets[0]) L.targets[0].obj.visible = true;
    } else if (job.id === 'flight' || job.id === 'heli') {
      const msg = this.jh.spawnAircraft(job.id === 'flight' ? 'plane' : 'heli'); if (msg) this.h.toast(msg, 3500);
      const lot = this.lot ?? { x: pl.x, z: pl.z };
      if (job.id === 'flight') {
        L.left = 240;
        const n = 6, R = rand(160, 220), a0 = Math.atan2(pl.x - lot.x, pl.z - lot.z);
        for (let i = 0; i < n; i++) {
          const a = a0 + (i + 1) * (Math.PI * 2 / (n + 1)), x = lot.x + Math.sin(a) * R, z = lot.z + Math.cos(a) * R, y = this.h.world.groundY(x, z) + rand(35, 60);
          const rg = ring(8, '#4fd1ff'); rg.position.set(x, y, z); rg.rotation.y = a + Math.PI / 2; rg.visible = i === 0; add(rg);
          L.targets.push({ x, y, z, r: 9, obj: rg, label: `Ring ${i + 1}/${n}` });
        }
        const land = add(new THREE.Group()); land.add(ring(14, '#7be07b', true), beacon('#7be07b', 40)); land.position.set(lot.x, this.h.world.groundY(lot.x, lot.z) + 0.2, lot.z); land.visible = false;
        L.targets.push({ x: lot.x, y: 0, z: lot.z, r: 25, obj: land, label: 'Land at the parking lot' });
      } else {
        L.left = 300;
        const roofs = ['mckay', 'kimball', 'manwaring', 'romney', 'taylor', 'hart', 'smith', 'snow'].filter(b => this.h.world.buildingStanding(b)).map(b => ({ b, ...this.roofSpot(b) })).filter(r => r.y > 3).sort(() => Math.random() - 0.5).slice(0, 3);
        for (const r of roofs) {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), new THREE.MeshStandardMaterial({ color: '#b0753e' }));
          const pick = add(new THREE.Group()); pick.add(crate, ring(4, '#ffd34d', true), beacon('#ffd34d', 25)); crate.position.y = 0.5; pick.position.set(lot.x + rand(-10, 10), this.h.world.groundY(lot.x, lot.z) + 0.05, lot.z + rand(-10, 10)); pick.visible = false;
          L.targets.push({ x: pick.position.x, y: pick.position.y, z: pick.position.z, r: 5, obj: pick, label: 'Land by the crate to load it', extra: { roof: false } });
          const pad = add(new THREE.Group()); const h = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 })); h.rotation.x = -Math.PI / 2;
          pad.add(ring(5, '#ffd34d', true), h, beacon('#ffd34d', 40)); pad.position.set(r.x, r.y + 0.1, r.z); pad.visible = false;
          L.targets.push({ x: r.x, y: r.y, z: r.z, r: 6, obj: pad, label: `Land on the ${this.bName(r.b)} roof`, extra: { roof: true } });
        }
        if (L.targets[0]) L.targets[0].obj.visible = true;
      }
    }
    if (!L.targets.length) { for (const o of L.objs) o.removeFromParent(); this.h.toast('This job can’t start right now — try another era.'); return; }
    this.live = L; this.h.sound('chime');
    this.h.toast(`▶ ${job.title}: ${L.targets[0].label}. Time: ${fmt(L.left)}`, 4000);
  }

  private bName(id: string) { const b = BUILDINGS.find(x => x.id === id); return (b && buildingName(b, ERAS[this.h.era()].year)) ?? id; }
  /** A point on a street near a building (cars can drive there). */
  private roadside(id: string): { x: number; z: number } | null {
    const poly = registryPoly(id); if (!poly) return null;
    const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cz = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const r of CAMPUS.roads) for (const [x, z] of r.pts) {
      const d = Math.hypot(x - cx, z - cz); if (d < bd && d > 8 && onVehicleRoad(x, z) && !this.h.world.blocked(x, z, 1.2)) { bd = d; best = { x, z }; }
    }
    return best && bd < 160 ? best : null;
  }
  /** Checkpoints along the streets, each 40–90 m from the last. */
  private roadChain(x0: number, z0: number, n: number): Vec2[] {
    const pts: Vec2[] = [], cand: Vec2[] = [];
    for (const r of CAMPUS.roads) for (let i = 0; i < r.pts.length - 1; i++) for (let t = 0; t < 1; t += 0.25) {
      const x = r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * t, z = r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * t;
      if (onVehicleRoad(x, z) && CAMPUS.campus.some(c => pointInPoly(x, z, c)) && !this.h.world.blocked(x, z, 1.5)) cand.push([x, z]);
    }
    let cx = x0, cz = z0;
    for (let k = 0; k < n; k++) {
      const opts = cand.filter(([x, z]) => { const d = Math.hypot(x - cx, z - cz); return d > 40 && d < 95 && !pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 35); });
      if (!opts.length) break;
      const p = opts[(Math.random() * opts.length) | 0]; pts.push(p); [cx, cz] = p;
    }
    return pts;
  }
  /** Free car-sized spaces in parking lots, with the direction to face. */
  private parkingSpots(n: number): { x: number; z: number; yaw: number }[] {
    const out: { x: number; z: number; yaw: number }[] = [];
    const lots = CAMPUS.areas.filter(a => a.kind === 'parking' && CAMPUS.campus.some(c => pointInPoly(a.poly[0][0], a.poly[0][1], c)));
    for (let tries = 0; tries < 4000 && out.length < n && lots.length; tries++) {
      const lot = lots[(Math.random() * lots.length) | 0], xs = lot.poly.map(q => q[0]), zs = lot.poly.map(q => q[1]);
      const x = rand(Math.min(...xs), Math.max(...xs)), z = rand(Math.min(...zs), Math.max(...zs));
      if (!pointInPoly(x, z, lot.poly) || everOccupied(x, z, 3) || this.h.world.blocked(x, z, 2.6) || out.some(o => Math.hypot(o.x - x, o.z - z) < 30)) continue;
      out.push({ x, z, yaw: (Math.round(rand(0, 4)) * Math.PI) / 2 });
    }
    return out;
  }
  private roofSpot(id: string) {
    const poly = registryPoly(id); if (!poly) return { x: 0, z: 0, y: 0 };
    const x = poly.reduce((s, q) => s + q[0], 0) / poly.length, z = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    return { x, z, y: this.jh.roofY(x, z) };
  }

  update(dt: number, active: boolean) {
    this.time += dt;
    for (const g of this.givers) {
      g.icon.visible = !this.done(g.def.id) && !this.live;
      g.a.animate(dt, 0); g.a.root.visible = this.h.player().space === 'exterior';
      g.bubble.update(dt, g.x, this.h.world.groundY(g.x, g.z) + 2.75, g.z, g.a.root.visible);
    }
    const L = this.live; if (!L || !active) return;
    L.t += dt; L.left -= dt;
    for (const o of L.objs) { if (o instanceof THREE.Mesh && o.geometry instanceof THREE.TorusGeometry) o.rotation.z += dt * 0.5; }
    const pl = this.h.player(), v = this.jh.vehicle(), tg = L.targets[L.step];
    if (pl.space !== 'exterior') { this.end(false, 'You left the job when you went inside.'); return; }
    const near = (r = tg.r) => Math.hypot(pl.x - tg.x, pl.z - tg.z) < r;
    const job = L.job.id;
    const needCar = job === 'shuttle' || job === 'rally' || job === 'parking';
    const okVeh = needCar ? isCar(pl.driving) : job === 'flight' ? pl.driving === 'plane' : pl.driving === 'heli';
    let hit = false;
    if (okVeh && tg) {
      if (job === 'shuttle') hit = near() && (v?.speed ?? 9) < 3.5;
      else if (job === 'rally') hit = near();
      else if (job === 'parking') { const yaw = (tg.extra as { yaw: number }).yaw, d = Math.abs(Math.atan2(Math.sin((v?.yaw ?? 0) - yaw), Math.cos((v?.yaw ?? 0) - yaw))); hit = near() && Math.min(d, Math.PI - d) < 0.3 && Math.abs(v?.speed ?? 9) < 0.4; }
      else if (job === 'flight') hit = L.step < L.targets.length - 1 ? near() && Math.abs(pl.y - tg.y) < tg.r : near() && (v?.altitude ?? 9) < 0.3 && Math.abs(v?.speed ?? 99) < 5;
      else hit = near() && (v?.altitude ?? 9) < 0.4 && Math.abs(pl.y - tg.y) < 1.5;
    }
    if (hit) {
      tg.obj.visible = false;
      const ex = tg.extra as { a?: Avatar; name?: string; dest?: string; roof?: boolean } | undefined;
      if (job === 'shuttle' && ex?.a) {
        if (L.step % 2 === 0) { ex.a.root.visible = false; this.h.toast(`🚐 ${ex.name} hops in: “To the ${L.targets[L.step + 1]?.extra && (L.targets[L.step + 1].extra as { dest: string }).dest}, please!”`, 3000); }
        else { ex.a.root.position.set(tg.x + 2, this.h.world.groundY(tg.x, tg.z), tg.z + 2); ex.a.root.visible = true; this.h.toast(`🚐 ${ex.name}: “Thanks for the ride!”`, 2500); }
      } else if (job === 'heli') this.h.toast(ex?.roof ? '📦 Delivered!' : '📦 Crate loaded — fly it to the roof!', 2200);
      else this.h.toast(job === 'parking' ? '🅿️ Perfect parking!' : `✔ ${tg.label}`, 1500);
      this.h.sound(job === 'parking' ? 'success' : 'chime');
      L.step++;
      const next = L.targets[L.step];
      if (!next) { this.end(true); return; }
      next.obj.visible = true;
    }
    const n = L.targets.length;
    L.status = `${{ shuttle: '🚐', rally: '🏁', parking: '🅿️', flight: '✈️', heli: '🚁' }[job]} ${L.job.title} · ${tg?.label ?? ''} (${L.step + 1}/${n}) · ⏱ ${fmt(L.left)}${okVeh ? '' : ` · get in ${L.job.vehicle}!`}`;
    if (L.left <= 0) this.end(false, 'Time’s up!');
  }
  /** Stop the current job (success pays the first time; best times are kept). */
  end(ok: boolean, msg?: string) {
    const L = this.live; if (!L) return;
    this.live = null;
    for (const o of L.objs) o.removeFromParent();
    if (!ok) { this.h.sound('error'); this.h.toast(`${L.job.title}: ${msg ?? 'job over.'} Talk to ${L.job.giver} to try again.`, 4000); return; }
    const first = !this.done(L.job.id), t = Math.max(1, Math.round(L.t)), best = this.p.stat(`jobBest:${L.job.id}`);
    this.p.set(`jobBest:${L.job.id}`, best ? Math.min(best, t) : t);
    this.p.add(`job:${L.job.id}`);
    if (first) this.p.earn(L.job.reward);
    this.h.sound('cheer');
    this.h.toast(`🏆 ${L.job.title} complete in ${fmt(t)}!${best && t < best ? ' New best time!' : ''}${first ? ` +${L.job.reward} coins` : ''}`, 5000);
    this.h.save();
  }
  /** Pause-menu list. */
  journalHtml() {
    return `<table class="side-journal">${JOBS.map(j => { const b = this.p.stat(`jobBest:${j.id}`); return `<tr class="${this.done(j.id) ? 'done' : ''}"><td>${this.done(j.id) ? '✓' : '❗'}</td><td><b>${j.title}</b> — ${j.giver}, ${j.role}<br><span>${j.summary} (${j.vehicle})${b ? ` · best ${fmt(b)}` : ''}</span></td></tr>`; }).join('')}</table>
      <p class="sub">The instructors wait at the big parking lot on campus (look for the 🚗 icons).</p>`;
  }
}
