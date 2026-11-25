// Campus happenings: short, spontaneous moments that pop up while you walk around outside.
//   hat      the wind steals a student's cap — chase it and bring it back
//   books    someone drops their books — help pick them up
//   frisbee  "Heads up!" — catch the frisbee (stand where the ring is), five throws
//   choir    a pop-up choir starts singing — walk up and sing along
//   fight    winter: a snowball fight · summer: water balloons (R / ✕ throws)
import * as THREE from 'three';
import type { Walker } from '../world/Npcs';
import type { LifeHost } from './host';
import type { Progress } from './progress';
import { itemModel } from './collectibles';
import { freq, Voice } from './sound';
import { chatFor } from '../world/npcChatter';

interface Happening { kind: string; status(): string; update(dt: number): boolean; end(): void }
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOne = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const fmt = (s: number) => `0:${String(Math.max(0, Math.ceil(s))).padStart(2, '0')}`;

export class CampusEvents {
  private cur: Happening | null = null;
  private wait = 25;
  private last = '';
  /** Choir voices (kept so the audio graph is reused). */
  private voice = new Voice();
  constructor(private h: LifeHost, private p: Progress) {}
  get active() { return !!this.cur; }
  tracker() { return this.cur?.status() ?? null; }
  abort() { if (this.cur) { this.cur.end(); this.cur = null; this.wait = 30; } }

  update(dt: number) {
    const pl = this.h.player();
    if (this.cur) {
      if (pl.space !== 'exterior') { this.abort(); return; }
      if (!this.cur.update(dt)) { this.cur.end(); this.cur = null; this.wait = rand(35, 75); }
      return;
    }
    if (pl.space !== 'exterior' || pl.driving === 'heli' || pl.driving === 'plane' || pl.seated || !this.h.canPlay() || this.h.sideBusy()) return;
    this.wait -= dt; if (this.wait > 0) return;
    this.wait = 6;                                  // couldn't start one? try again shortly
    this.start();
  }
  /** Start a happening now (dev / testing: pass a kind). */
  start(kind?: string): boolean {
    const season = this.h.season();
    const kinds = ['hat', 'books', 'frisbee', 'choir', ...(season === 'winter' || season === 'summer' ? ['fight'] : [])].filter(k => k !== this.last);
    const order = kind ? [kind] : kinds.sort(() => Math.random() - 0.5);
    for (const k of order) {
      const ev = k === 'hat' ? this.hat() : k === 'books' ? this.books() : k === 'frisbee' ? this.frisbee() : k === 'choir' ? this.choir() : k === 'fight' ? this.fight() : null;
      if (ev) { this.cur = ev; this.last = k; return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- helpers
  private near(min: number, max: number, n = 1): Walker[] {
    const pl = this.h.player();
    return this.h.npcs.walkers.filter(w => { const d = Math.hypot(w.x - pl.x, w.z - pl.z); return d >= min && d <= max && this.h.npcs.available(w); })
      .sort(() => Math.random() - 0.5).slice(0, n);
  }
  private free(x: number, z: number, r = 0.5) { return !this.h.world.blocked(x, z, r); }
  private reward(coins: number, text: string) {
    this.p.add('events'); if (coins) { this.p.earn(coins); this.h.sound('coin'); }
    this.h.toast(`${text}${coins ? ` +${coins} coins` : ''}`, 3500); this.h.save();
  }
  private gy(x: number, z: number) { return this.h.world.groundY(x, z); }
  private face(w: Walker, x: number, z: number, dt: number) { const d = Math.atan2(x - w.x, z - w.z) - w.yaw; w.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 6); }
  private walkTo(w: Walker, x: number, z: number, dt: number, speed = 2.4) {
    const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { w.avatar.animate(dt, 0); return true; }
    const st = Math.min(d, speed * dt), nx = w.x + dx / d * st, nz = w.z + dz / d * st;
    if (this.free(nx, nz, 0.3)) { w.x = nx; w.z = nz; } else { w.x += dz / d * st * 0.5; w.z -= dx / d * st * 0.5; }
    this.face(w, x, z, dt); w.avatar.animate(dt, speed); return false;
  }

  // ---------------------------------------------------------------- the wind takes a hat
  private hat(): Happening | null {
    const [w] = this.near(6, 22); if (!w) return null;
    const pl = this.h.player(), look = w.avatar.look, color = look.hat && look.hat !== 'none' ? look.hatColor ?? '#2f4f7f' : pickOne(['#2f4f7f', '#7a2b2b', '#3f6f4a', '#d1a12f']);
    w.avatar.rebuild({ ...look, hat: 'none' });
    const hat = itemModel({ shape: 'cap', color }); hat.scale.setScalar(0.9); hat.userData.life = 'hat'; this.h.scene.add(hat);
    let ang = Math.atan2(w.x - pl.x, w.z - pl.z) + rand(-0.9, 0.9), speed = 5.5, hx = w.x, hz = w.z, hy = 1.8, t = 0, turn = 1.2;
    let state: 'flying' | 'carried' | 'done' = 'flying', left = 35, finished = false;
    this.h.world.gust.set(Math.sin(ang) * 7, Math.cos(ang) * 7);
    this.h.npcs.speak(w, pickOne(['My hat!!', 'Noooo, my hat!', 'Hey! Come back, hat!']), 2.5);
    this.h.sound('whoosh');
    this.h.toast(`🧢 The wind took ${w.name}’s hat — catch it!`, 3000);
    this.h.npcs.claim(w, dt => {
      if (finished) return false;
      if (state === 'flying') { this.face(w, hx, hz, dt); w.avatar.animate(dt, 0); if (Math.random() < dt * 0.25) this.h.npcs.speak(w, pickOne(['Can you grab it?', 'It’s getting away!', 'This wind!']), 2); }
      else if (state === 'carried') { const p = this.h.player(); this.face(w, p.x, p.z, dt); w.avatar.animate(dt, 0); }
      else { w.avatar.wave(t * 2); }
      return true;
    });
    return {
      kind: 'hat',
      status: () => state === 'flying' ? `🧢 Catch ${w.name}’s hat! · ${fmt(left)}` : `🧢 Bring the hat back to ${w.name}`,
      update: dt => {
        t += dt; const p = this.h.player();
        if (state === 'flying') {
          left -= dt;
          turn -= dt; if (turn <= 0) { turn = rand(0.8, 1.6); ang += rand(-0.7, 0.7); }
          speed = Math.max(1.4, speed - dt * 0.35);
          const nx = hx + Math.sin(ang) * speed * dt, nz = hz + Math.cos(ang) * speed * dt;
          if (this.free(nx, nz, 0.3)) { hx = nx; hz = nz; } else ang += Math.PI * rand(0.6, 1.4);
          hy = Math.max(0.15, hy - dt * 0.5);
          hat.position.set(hx, this.gy(hx, hz) + hy + Math.abs(Math.sin(t * 4)) * 0.35, hz); hat.rotation.set(Math.sin(t * 3) * 0.6, t * 5, Math.cos(t * 2.4) * 0.5);
          this.h.world.gust.set(Math.sin(ang) * (3 + speed), Math.cos(ang) * (3 + speed));
          if (Math.hypot(p.x - hx, p.z - hz) < 1.5 && !p.driving) { state = 'carried'; hat.visible = false; this.h.holdItem(color); this.h.sound('pop'); this.h.toast(`Got it! Take it back to ${w.name}.`, 2200); this.h.world.gust.set(0, 0); }
          if (left <= 0) { this.h.npcs.speak(w, 'Oh well… it’s halfway to Idaho Falls now.', 3); w.avatar.rebuild({ ...look }); return false; }
        } else if (state === 'carried') {
          if (Math.hypot(p.x - w.x, p.z - w.z) < 2.4) {
            state = 'done'; this.h.holdItem(null); w.avatar.rebuild({ ...look, hat: 'cap', hatColor: color });
            this.h.npcs.speak(w, this.h.playerName() ? `Thank you, ${this.h.playerName()}! You’re fast!` : 'Thank you! You’re fast!', 3);
            this.p.add('hats'); this.reward(8, `🧢 You saved ${w.name}’s hat!`); t = 0;
          }
        } else return t < 1.8;
        return true;
      },
      end: () => { finished = true; hat.removeFromParent(); this.h.holdItem(null); this.h.world.gust.set(0, 0); },
    };
  }

  // ---------------------------------------------------------------- dropped books
  private books(): Happening | null {
    const [w] = this.near(5, 16); if (!w) return null;
    const cols = ['#8d2f2f', '#2f5f9e', '#3b6d3b', '#c9a44a', '#5a3a6b'], items: { m: THREE.Object3D; x: number; z: number }[] = [];
    for (let k = 0; k < 40 && items.length < 4; k++) {
      const a = rand(0, Math.PI * 2), r = rand(1.4, 4), x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
      if (!this.free(x, z, 0.4) || items.some(i => Math.hypot(i.x - x, i.z - z) < 1)) continue;
      const m = itemModel({ shape: 'book', color: cols[items.length] }); m.scale.setScalar(0.7); m.rotation.set(-Math.PI / 2, 0, rand(0, 6)); m.position.set(x, this.gy(x, z) + 0.06, z); m.userData.life = 'book';
      this.h.scene.add(m); items.push({ m, x, z });
    }
    if (items.length < 3) { items.forEach(i => i.m.removeFromParent()); return null; }
    let got = 0, done = false, finished = false, left = 40, t = 0;
    this.h.npcs.speak(w, pickOne(['Oh no, my books!', 'Whoops! My books!', 'Not my notes!']), 2.5);
    this.h.sound('pop');
    this.h.toast(`📚 ${w.name} dropped their books — help pick them up!`, 3000);
    this.h.npcs.claim(w, dt => {
      if (finished) return false;
      const p = this.h.player(); this.face(w, p.x, p.z, dt);
      if (done) w.avatar.wave(t * 2); else { w.avatar.animate(dt, 0); w.avatar.reach(0.1 + Math.abs(Math.sin(t * 2)) * 0.2); }
      return true;
    });
    return {
      kind: 'books',
      status: () => done ? '' : got < items.length ? `📚 Pick up ${w.name}’s books (${got}/${items.length}) · ${fmt(left)}` : `📚 Give the books back to ${w.name}`,
      update: dt => {
        t += dt; left -= dt; const p = this.h.player();
        if (done) return t < 2;
        for (const i of items) if (i.m.visible && Math.hypot(p.x - i.x, p.z - i.z) < 1.3) { i.m.visible = false; got++; this.h.sound('tick'); if (got === items.length) this.h.holdItem('#8d2f2f'); }
        if (got === items.length && Math.hypot(p.x - w.x, p.z - w.z) < 2.4) {
          done = true; t = 0; this.h.holdItem(null);
          this.h.npcs.speak(w, pickOne(['You’re a lifesaver!', 'Thanks so much!', 'My finals thank you!']), 3);
          this.reward(6, `📚 You helped ${w.name}!`);
        }
        if (left <= 0) { this.h.npcs.speak(w, 'It’s okay, I got the rest. Thanks anyway!', 3); return false; }
        return true;
      },
      end: () => { finished = true; items.forEach(i => i.m.removeFromParent()); this.h.holdItem(null); },
    };
  }

  // ---------------------------------------------------------------- frisbee
  private frisbee(): Happening | null {
    const pl = this.h.player(); if (pl.driving) return null;
    const [w] = this.near(9, 17); if (!w) return null;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), new THREE.MeshStandardMaterial({ color: pickOne(['#ff6b3d', '#2fbf71', '#3d8bff', '#ffd23d']), roughness: 0.4 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 28), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.userData.life = 'ring'; this.h.scene.add(disc, ring);
    let state: 'ready' | 'toYou' | 'back' | 'missed' = 'ready', t = 0, dur = 1, throws = 0, catches = 0, streak = 0, best = 0, misses = 0, finished = false;
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    const hand = () => new THREE.Vector3(w.x + Math.sin(w.yaw) * 0.4, this.gy(w.x, w.z) + 1.3, w.z + Math.cos(w.yaw) * 0.4);
    disc.position.copy(hand());
    this.h.npcs.speak(w, this.h.playerName() && w.met ? `Hey ${this.h.playerName()}! Catch!` : 'Heads up! Want to throw?', 2.5);
    this.h.toast('🥏 Frisbee! Stand inside the yellow ring to catch it.', 3500);
    this.h.npcs.claim(w, dt => {
      if (finished) return false;
      const p = this.h.player(); this.face(w, p.x, p.z, dt); w.avatar.animate(dt, 0);
      if (state === 'ready' && t > 0.6) w.avatar.reach(Math.min(1, (t - 0.6) * 2), 0); else if (state === 'back') w.avatar.reach(0.6);
      return true;
    });
    return {
      kind: 'frisbee',
      status: () => `🥏 Frisbee: ${catches} caught · ${streak} in a row`,
      update: dt => {
        t += dt; const p = this.h.player();
        if (state === 'ready') {
          disc.position.copy(hand());
          if (t > 1.2) {
            // throw to a spot near you, a few metres off — you have to move to catch it
            let tx = p.x, tz = p.z;
            for (let k = 0; k < 20; k++) { const a = rand(0, Math.PI * 2), r = rand(1.8, 3.6) + throws * 0.35; tx = p.x + Math.cos(a) * r; tz = p.z + Math.sin(a) * r; if (this.free(tx, tz, 0.6)) break; }
            from.copy(disc.position); to.set(tx, this.gy(tx, tz) + 1.2, tz); dur = Math.hypot(tx - from.x, tz - from.z) / 8 + 0.7;
            ring.position.set(tx, this.gy(tx, tz) + 0.05, tz); ring.visible = true; state = 'toYou'; t = 0; throws++; this.h.sound('whoosh');
          }
        } else if (state === 'toYou' || state === 'back') {
          const k = Math.min(1, t / dur);
          disc.position.lerpVectors(from, to, k); disc.position.y += Math.sin(k * Math.PI) * 2.4; disc.rotation.y += dt * 20; disc.rotation.z = 0.2;
          if (k >= 1) {
            if (state === 'back') { state = 'ready'; t = 0; return throws < 6 && misses < 2; }
            ring.visible = false;
            if (Math.hypot(p.x - to.x, p.z - to.z) < 1.5 && !p.driving) {
              catches++; streak++; best = Math.max(best, streak); this.h.sound('tick');
              this.h.toast(streak >= 2 ? `Caught! ${streak} in a row 🔥` : 'Caught it!', 1300);
              this.h.npcs.speak(w, pickOne(['Nice catch!', 'Wow!', 'Great hands!', 'You’re good at this!']), 1.8);
              from.copy(disc.position); to.copy(hand()); dur = Math.hypot(to.x - from.x, to.z - from.z) / 9 + 0.5; state = 'back'; t = 0;
            } else {
              misses++; streak = 0; state = 'missed'; t = 0; disc.position.y = this.gy(to.x, to.z) + 0.05; disc.rotation.z = 0;
              this.h.npcs.speak(w, pickOne(['So close!', 'Almost!', 'My bad, bad throw!']), 1.8); this.h.sound('error');
            }
          }
        } else if (state === 'missed' && t > 1.4) { state = 'ready'; t = 0; disc.position.copy(hand()); if (throws >= 6 || misses >= 2) return false; }
        return true;
      },
      end: () => {
        finished = true; disc.removeFromParent(); ring.removeFromParent();
        this.p.best('frisbeeStreak', best);
        if (catches) { this.h.npcs.speak(w, `${catches} catches! Good game!`, 3); this.reward(catches * 2 + (best >= 5 ? 5 : 0), `🥏 Frisbee: ${catches} catches${best >= 5 ? ', a perfect streak!' : '.'}`); }
      },
    };
  }

  // ---------------------------------------------------------------- pop-up choir
  private choir(): Happening | null {
    const pl = this.h.player();
    // a clear spot 12–28 m away on open ground
    let cx = 0, cz = 0, ok = false;
    for (let k = 0; k < 40 && !ok; k++) { const a = rand(0, Math.PI * 2), r = rand(12, 26); cx = pl.x + Math.cos(a) * r; cz = pl.z + Math.sin(a) * r; ok = this.free(cx, cz, 3.2); }
    if (!ok) return null;
    const singers = this.h.npcs.walkers.filter(w => this.h.npcs.available(w) && Math.hypot(w.x - cx, w.z - cz) < 70).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, 6);
    if (singers.length < 4) return null;
    const faceYaw = Math.atan2(pl.x - cx, pl.z - cz);
    const slots = singers.map((_, i) => { const a = faceYaw + Math.PI + (i - (singers.length - 1) / 2) * 0.42; return [cx + Math.sin(a) * 2.6, cz + Math.cos(a) * 2.6] as [number, number]; });
    let t = 0, singing = false, joined = false, finished = false, beat = 0, idx = 0;
    // an original, hymn-like round in four-part harmony (root, third, fifth + melody)
    const prog = [['C4', 'E4', 'G4', 'E5'], ['F3', 'A3', 'C4', 'F5'], ['G3', 'B3', 'D4', 'D5'], ['C4', 'E4', 'G4', 'C5'], ['A3', 'C4', 'E4', 'C5'], ['F3', 'A3', 'C4', 'A4'], ['G3', 'B3', 'D4', 'B4'], ['C4', 'E4', 'G4', 'C5']];
    const lyrics = ['♪ Ooh ♪', '♫ Aah ♫', '♪ La la la ♪', '♫ Ooh-ooh ♫', '♪ Hallelu— ♪', '♫ Mmm ♫'];
    singers.forEach((w, i) => this.h.npcs.claim(w, dt => {
      if (finished) return false;
      if (!singing) { if (this.walkTo(w, slots[i][0], slots[i][1], dt, 2.6)) this.face(w, cx + Math.sin(faceYaw) * 6, cz + Math.cos(faceYaw) * 6, dt); }
      else { w.avatar.animate(dt, 0); w.avatar.talking = true; w.avatar.updateMouth(dt); w.avatar.gesture(t + i, w.seed); this.face(w, cx + Math.sin(faceYaw) * 6, cz + Math.cos(faceYaw) * 6, dt); }
      return true;
    }));
    this.h.toast('🎶 A pop-up choir is gathering nearby — go listen!', 3500);
    this.h.addInteractable({ id: 'life:choir', at: { x: cx + Math.sin(faceYaw) * 3.5, z: cz + Math.cos(faceYaw) * 3.5 }, radius: 4, prompt: () => (joined ? 'Singing along ♪' : 'Sing along with the choir'), enabled: () => singing && !joined,
      onInteract: () => { joined = true; this.h.toast('🎶 You’re singing along!', 2500); this.h.sound('chime'); } });
    return {
      kind: 'choir',
      status: () => singing ? (joined ? '🎶 Singing with the choir!' : '🎶 Pop-up choir — walk up and sing along') : '🎶 A choir is gathering…',
      update: dt => {
        t += dt; const p = this.h.player();
        const dist = Math.hypot(p.x - cx, p.z - cz);
        this.voice.level = Math.max(0, 1 - dist / 55) * 1.4;
        if (!singing && (t > 9 || singers.every((w, i) => Math.hypot(w.x - slots[i][0], w.z - slots[i][1]) < 0.4))) { singing = true; t = 0; }
        if (singing) {
          beat -= dt;
          if (beat <= 0) {
            const ch = prog[idx % prog.length]; beat = 2.2; idx++;
            ch.forEach((n, k) => this.voice.sing(freq(n), 0, 2.15, k === 3 ? 0.05 : 0.035));
            if (joined) this.voice.sing(freq(ch[3]) / 2, 0, 2.15, 0.04);
            const s = pickOne(singers); this.h.npcs.speak(s, pickOne(lyrics), 2);
          }
          if (joined) { this.h.avatar.talking = true; }
          if (t > 30) return false;
        }
        return true;
      },
      end: () => {
        finished = true; this.h.removeInteractable('life:choir'); this.h.avatar.talking = false;
        for (const w of singers) w.avatar.talking = false;
        if (singing) { this.h.npcs.speak(singers[0], 'Thanks for listening!', 3); this.h.sound('cheer'); }
        if (joined) { this.p.add('choir'); this.reward(5, '🎶 What a performance!'); } else if (singing) this.p.add('events');
      },
    };
  }

  // ---------------------------------------------------------------- snowball / water-balloon fight
  private fight(): Happening | null {
    const pl = this.h.player(); if (pl.driving) return null;
    const snow = this.h.season() === 'winter';
    const foes = this.near(5, 32, 3); if (foes.length < 2) return null;
    interface Ball { m: THREE.Mesh; v: THREE.Vector3; mine: boolean; life: number }
    const balls: Ball[] = [], geo = new THREE.SphereGeometry(0.14, 8, 6);
    const mats = snow ? [new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })] : ['#ff5d8f', '#4fd1ff', '#ffd23d', '#7be07b'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
    let you = 0, them = 0, left = 70, finished = false, cool = 0, t = 0;
    const WIN = 6, posts = foes.map((_, i) => ({ a: rand(0, Math.PI * 2) + i * 2.1, r: rand(7.5, 10.5), wait: rand(1.5, 3), side: 0 }));
    const throwBall = (from: THREE.Vector3, target: THREE.Vector3, mine: boolean) => {
      const d = Math.hypot(target.x - from.x, target.z - from.z), sp = 15, tt = Math.max(0.15, d / sp);
      const v = new THREE.Vector3((target.x - from.x) / tt, (target.y - from.y + 0.5 * 9.8 * tt * tt) / tt, (target.z - from.z) / tt);
      const m = new THREE.Mesh(geo, pickOne(mats)); m.position.copy(from); this.h.scene.add(m); balls.push({ m, v, mine, life: 3 });
      this.h.sound('whoosh');
    };
    const word = snow ? 'Snowball' : 'Water balloon';
    this.h.npcs.speak(foes[0], snow ? 'SNOWBALL FIGHT!' : 'WATER BALLOON FIGHT!', 2.5);
    this.h.toast(`${snow ? '❄️' : '💦'} ${word} fight! Press R (or ✕) to throw — first to ${WIN} hits wins.`, 4500);
    foes.forEach((w, i) => this.h.npcs.claim(w, dt => {
      if (finished) return false;
      const p = this.h.player(), q = posts[i];
      q.side += dt; const a = q.a + Math.sin(q.side * 0.7 + i) * 0.35;
      const tx = p.x + Math.cos(a) * q.r, tz = p.z + Math.sin(a) * q.r;
      if (this.walkTo(w, tx, tz, dt, 3.2) || Math.hypot(tx - w.x, tz - w.z) < 2) this.face(w, p.x, p.z, dt);
      q.wait -= dt;
      if (q.wait <= 0 && Math.hypot(p.x - w.x, p.z - w.z) < 16) {
        q.wait = rand(2.2, 3.8); w.avatar.reach(1, 0);
        const miss = Math.random() < 0.45 ? rand(0.9, 1.8) : 0, ma = rand(0, Math.PI * 2);
        throwBall(new THREE.Vector3(w.x, this.gy(w.x, w.z) + 1.7, w.z), new THREE.Vector3(p.x + Math.cos(ma) * miss, p.y + 1.2, p.z + Math.sin(ma) * miss), false);
      }
      return true;
    }));
    return {
      kind: 'fight',
      status: () => `${snow ? '❄️' : '💦'} ${word} fight · You ${you} – ${them} Them · R to throw · ${fmt(left)}`,
      update: dt => {
        t += dt; left -= dt; cool -= dt; const p = this.h.player();
        if (this.h.takeThrow() && cool <= 0) {
          cool = 0.45;
          // aim at the closest opponent in front (or simply the closest)
          const fwd = (w: { x: number; z: number }) => Math.cos(Math.atan2(w.x - p.x, w.z - p.z) - p.yaw);
          const tgt = [...foes].sort((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) * (fwd(a) > 0.5 ? 1 : 3)) - (Math.hypot(b.x - p.x, b.z - p.z) * (fwd(b) > 0.5 ? 1 : 3)))[0];
          this.h.avatar.reach(1, 0);
          throwBall(new THREE.Vector3(p.x, p.y + 1.7, p.z), new THREE.Vector3(tgt.x, this.gy(tgt.x, tgt.z) + 1.2, tgt.z), true);
        }
        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i]; b.life -= dt; b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt);
          let gone = b.life <= 0 || b.m.position.y < this.gy(b.m.position.x, b.m.position.z);
          if (!gone && b.mine) {
            const hit = foes.find(w => Math.hypot(w.x - b.m.position.x, w.z - b.m.position.z) < 0.75 && Math.abs(this.gy(w.x, w.z) + 1.2 - b.m.position.y) < 1);
            if (hit) { gone = true; you++; this.h.sound('splat'); this.h.npcs.speak(hit, pickOne(['Oof!', 'Hey!', 'Nice shot!', 'Ack!', snow ? 'Cold!!' : 'So wet!']), 1.4); }
          } else if (!gone && Math.hypot(p.x - b.m.position.x, p.z - b.m.position.z) < 0.6 && Math.abs(p.y + 1.2 - b.m.position.y) < 0.9) {
            gone = true; them++; this.h.sound('splat'); this.h.toast(snow ? 'Splat! You got hit.' : 'Splash! You got soaked.', 1000);
          }
          if (gone) { b.m.removeFromParent(); balls.splice(i, 1); }
        }
        return you < WIN && them < WIN && left > 0;
      },
      end: () => {
        finished = true; for (const b of balls) b.m.removeFromParent();
        const won = you > them;
        if (won) this.p.add('snowballWins');
        this.h.npcs.speak(foes[0], won ? pickOne(['You win! Rematch tomorrow!', 'Okay, okay, you’re the champion!']) : pickOne(['Ha! Better luck next time!', 'We win! Good fight though!']), 3);
        this.reward(won ? 15 : 4, won ? `${snow ? '❄️' : '💦'} You won the ${word.toLowerCase()} fight ${you}–${them}!` : `${snow ? '❄️' : '💦'} Good fight! (${you}–${them})`);
      },
    };
  }

  /** Small talk a friend makes while hanging out with you. */
  static friendLine(era: Parameters<typeof chatFor>[0]) { return chatFor(era).lines[0]; }
}
