// Real basketball on the Hart's south half court. The ball has physics (gravity, bounces, the rim and the
// backboard); you pick it up by running into it, dribble while you move, hold E (Ⓐ) to load a shot and let
// go to shoot — the power meter decides how deep the shot goes. Modes:
//   free       shootaround: count your makes
//   challenge  60 seconds, as many points as you can (2s and 3s) — your record is saved
//   oneOnOne   to 11 against Jace: he drives, shoots, plays defence, steals and fights for rebounds
import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { eraLook } from '../world/Npcs';
import type { ActionState } from '../input/actions';
import type { LifeHost } from './host';
import type { Progress } from './progress';

/** Court geometry, room-local metres (the Hart's west court; the player plays toward the south hoop). */
export const COURT = { hoop: new THREE.Vector3(-13, 3.05, 12.55), boardZ: 13.0, rimR: 0.23, ballR: 0.12, threeR: 6.0, x0: -27.6, x1: -0.4, z0: -16.4, z1: 17.6, check: new THREE.Vector3(-13, 0, 5.2) };
const G = 9.8;

/** Launch velocity that sends a ball from `from` through `to` at the given launch angle (degrees). */
export function shotVelocity(from: THREE.Vector3, to: THREE.Vector3, angleDeg = 52): THREE.Vector3 {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz), dy = to.y - from.y, a = THREE.MathUtils.degToRad(angleDeg);
  const v2 = (G * d * d) / (2 * Math.cos(a) ** 2 * (d * Math.tan(a) - dy));
  const v = Math.sqrt(Math.max(1, v2));
  return new THREE.Vector3((dx / d) * v * Math.cos(a), v * Math.sin(a), (dz / d) * v * Math.cos(a));
}
/** Points for a made shot from this spot. */
export const shotPoints = (x: number, z: number) => (Math.hypot(x - COURT.hoop.x, z - COURT.hoop.z) > COURT.threeR ? 3 : 2);

type Who = 'you' | 'cpu' | null;
export class Hoops {
  mode: 'free' | 'challenge' | 'oneOnOne' | null = 'free';
  private ball: THREE.Mesh; private p = new THREE.Vector3(); private v = new THREE.Vector3();
  private holder: Who = null; private lastShooter: Who = null; private shotFrom = new THREE.Vector3(); private scoredThis = false; private noGrab = 0;
  private charging = 0; private chargeT = 0; private t = 0; private meterEl: HTMLElement | null = null;
  private makes = 0; private pts = 0; private left = 0; private you = 0; private cpu = 0; private bounceSnd = 0;
  private jace: { a: Avatar; x: number; z: number; yaw: number; think: number; shootIn: number } | null = null;
  constructor(private h: LifeHost, private p0: Progress, private g: THREE.Group, private origin: THREE.Vector3) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    x.fillStyle = '#d9662a'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#2a1408'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 32); x.lineTo(64, 32); x.moveTo(32, 0); x.lineTo(32, 64); x.arc(32, 32, 22, 0, Math.PI * 2); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballR * 1.25, 16, 12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })); this.ball.castShadow = true; g.add(this.ball);
    this.resetBall();
  }
  private resetBall(at = COURT.check) { this.holder = null; this.p.set(at.x, COURT.ballR, at.z + 1.5); this.v.set(0, 0, 0); }
  private local(w: THREE.Vector3) { return new THREE.Vector3(w.x - this.origin.x, w.y, w.z - this.origin.z); }

  // ---------------------------------------------------------------- modes
  startChallenge() { this.end(); this.mode = 'challenge'; this.pts = 0; this.makes = 0; this.left = 60; this.resetBall(); this.h.toast('🏀 Shooting challenge: 60 seconds! Grab the ball, hold E to load a shot, let go to shoot. Threes count 3.', 5000); this.h.sound('tick'); }
  startOneOnOne() {
    this.end(); this.mode = 'oneOnOne'; this.you = 0; this.cpu = 0;
    const a = new Avatar({ ...eraLook('presentFinale', 4411), shirt: '#7a2b2b', shorts: true, hat: 'none' }); this.g.add(a.root);
    this.jace = { a, x: COURT.hoop.x + 2, z: COURT.hoop.z - 3, yaw: Math.PI, think: 0, shootIn: 0 };
    this.checkBall('you');
    this.h.toast('🏀 1-on-1 vs Jace, first to 11! Hold E to shoot · near Jace, tap E to steal · beyond the arc = 3 points.', 6000); this.h.sound('tick');
  }
  /** Ends the current game mode (back to a free shootaround). */
  end() {
    if (this.jace) { this.jace.a.root.removeFromParent(); this.jace = null; }
    this.mode = 'free'; this.charging = 0; this.meter(false);
  }
  private checkBall(to: 'you' | 'cpu') {
    this.lastShooter = null;
    if (to === 'cpu' && this.jace) { this.holder = 'cpu'; this.jace.x = COURT.check.x; this.jace.z = COURT.check.z; this.jace.shootIn = 1.2 + Math.random(); }
    else { this.holder = null; this.p.set(COURT.check.x, COURT.ballR + 0.4, COURT.check.z); this.v.set(0, 2, 0); }
  }
  tracker() {
    if (this.mode === 'challenge') return `🏀 Shooting challenge · ${this.pts} pts (${this.makes} makes) · ⏱ ${Math.ceil(this.left)} s`;
    if (this.mode === 'oneOnOne') return `🏀 1-on-1 · You ${this.you} – ${this.cpu} Jace · first to 11${this.holder === 'you' ? ' · hold E to shoot' : this.holder === 'cpu' ? ' · tap E near him to steal' : ' · get the ball!'}`;
    return this.holder === 'you' ? `🏀 Shootaround · ${this.makes} makes · hold E to shoot` : null;
  }
  get holding() { return this.holder === 'you'; }

  // ---------------------------------------------------------------- shot power meter (HUD)
  private meter(show: boolean, k = 0, good = 0.5) {
    if (!show) { this.meterEl?.remove(); this.meterEl = null; return; }
    if (!this.meterEl) { this.meterEl = document.createElement('div'); this.meterEl.className = 'hoop-meter'; this.meterEl.innerHTML = '<i class="hm-zone"></i><i class="hm-fill"></i><span>Shot power — let go!</span>'; this.h.ui.root.appendChild(this.meterEl); }
    (this.meterEl.querySelector('.hm-fill') as HTMLElement).style.height = `${k * 100}%`;
    (this.meterEl.querySelector('.hm-zone') as HTMLElement).style.bottom = `${(good - 0.11) * 100}%`;
  }
  /** Power from the meter: it sweeps up and down while you hold E; the sweet spot is in the middle. */
  private power() { const s = (this.chargeT * 1.25) % 2; return s < 1 ? s : 2 - s; }

  private shoot(who: 'you' | 'cpu', from: THREE.Vector3, yaw: number, power: number, skill = 1) {
    const rel = new THREE.Vector3(from.x, 2.25, from.z), ideal = shotVelocity(rel, COURT.hoop.clone().add(new THREE.Vector3(0, 0.04, 0)), 52);
    const toHoop = Math.atan2(COURT.hoop.x - from.x, COURT.hoop.z - from.z); let off = Math.atan2(Math.sin(yaw - toHoop), Math.cos(yaw - toHoop));
    if (Math.abs(off) > 1.0) off = Math.sign(off) * 1.0;                                       // you have to roughly face the hoop
    const d = Math.hypot(COURT.hoop.x - from.x, COURT.hoop.z - from.z);
    const depth = 1 + (power - 0.5) * 0.2;                                                    // the middle of the meter is perfect
    const lateral = off * 0.12 + (Math.random() - 0.5) * (0.02 + d * 0.006) / skill;
    const v = ideal.multiplyScalar(depth); const c = Math.cos(lateral), s = Math.sin(lateral); const vx = v.x * c + v.z * s, vz = -v.x * s + v.z * c; v.x = vx; v.z = vz;
    this.holder = null; this.lastShooter = who; this.scoredThis = false; this.shotFrom.copy(from); this.noGrab = 0.7;
    this.p.copy(rel); this.v.copy(v); this.h.sound('whoosh');
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, pw: THREE.Vector3, yaw: number, speed: number, a: ActionState, canAct: boolean) {
    this.t += dt; this.noGrab -= dt; this.bounceSnd -= dt;
    const pl = this.local(pw);
    // ---- input (you have the ball): hold E to load, release to shoot
    if (this.holder === 'you' && canAct) {
      if (a.pressed('interact')) { a.consume('interact'); a.consume('confirm'); this.charging = 1; this.chargeT = 0; }
      if (this.charging) {
        if (a.isDown('interact')) { this.chargeT += dt; this.meter(true, this.power()); this.h.avatar.poseArms(-2.7, -2.7); }
        else { const pow = this.power(); this.charging = 0; this.meter(false); this.h.avatar.poseArms(-2.9, -2.9); this.shoot('you', pl, yaw, pow); }
      }
    } else if (this.charging) { this.charging = 0; this.meter(false); }
    // ---- steal (tap E next to Jace while he dribbles)
    if (this.holder === 'cpu' && this.jace && canAct && a.pressed('interact') && Math.hypot(pl.x - this.jace.x, pl.z - this.jace.z) < 1.5) {
      a.consume('interact'); a.consume('confirm');
      if (Math.random() < 0.4) { this.holder = 'you'; this.h.sound('success'); this.h.toast('Steal! 🏀', 1200); } else { this.h.sound('error'); this.noGrab = 0.4; }
    }
    // ---- the ball
    if (this.holder) {
      const hx = this.holder === 'you' ? pl.x : this.jace!.x, hz = this.holder === 'you' ? pl.z : this.jace!.z, hy = this.holder === 'you' ? yaw : this.jace!.yaw;
      const moving = this.holder === 'you' ? speed > 0.5 : true, fx = Math.sin(hy), fz = Math.cos(hy);
      const bounce = moving && !this.charging ? Math.abs(Math.sin(this.t * 7.5)) : 0.85;
      if (moving && !this.charging && Math.abs(Math.sin(this.t * 7.5)) < 0.12 && this.bounceSnd <= 0) { this.bounceSnd = 0.25; if (this.holder === 'you') this.h.sound('bounce'); }
      this.p.set(hx + fx * 0.45 + fz * 0.3, this.charging ? 2.3 : COURT.ballR + bounce * 0.9, hz + fz * 0.45 - fx * 0.3); this.v.set(0, 0, 0);
    } else this.physics(dt);
    this.ball.position.copy(this.p); this.ball.rotation.x += dt * (this.holder ? speed : Math.hypot(this.v.x, this.v.z)) * 3;
    // ---- grabbing a loose ball
    const loose = !this.holder && this.p.y < 1.9;
    if (loose && this.noGrab <= 0 && Math.hypot(this.p.x - pl.x, this.p.z - pl.z) < 0.85) { this.holder = 'you'; this.h.sound('tick'); }
    // ---- Jace
    if (this.jace) this.updateJace(dt, pl);
    // ---- the clock
    if (this.mode === 'challenge') {
      this.left -= dt;
      if (this.left <= 0) { const rec = this.pts > this.p0.stat('hoopsBest'); if (rec) { this.p0.set('hoopsBest', this.pts); this.p0.earn(15); } this.p0.add('hoopsGames'); this.h.sound(rec ? 'cheer' : 'success');
        this.h.toast(`⏱ Time! ${this.pts} points (${this.makes} makes).${rec ? ' NEW RECORD! +15 coins' : ` Record: ${this.p0.stat('hoopsBest')}`}`, 5000); this.h.save(); this.end(); }
    }
  }
  private physics(dt: number) {
    const prev = this.p.clone(), R = COURT.ballR, steps = 3;
    for (let k = 0; k < steps; k++) {
      const h = dt / steps; this.v.y -= G * h; this.p.addScaledVector(this.v, h);
      // floor
      if (this.p.y < R) { this.p.y = R; if (this.v.y < -1.2 && this.bounceSnd <= 0) { this.bounceSnd = 0.12; this.h.sound('bounce'); } this.v.y = -this.v.y * 0.72; if (Math.abs(this.v.y) < 0.5) this.v.y = 0; this.v.x *= 0.92; this.v.z *= 0.92; }
      // walls of the half court + divider
      if (this.p.x < COURT.x0) { this.p.x = COURT.x0; this.v.x = Math.abs(this.v.x) * 0.5; } if (this.p.x > COURT.x1) { this.p.x = COURT.x1; this.v.x = -Math.abs(this.v.x) * 0.5; }
      if (this.p.z < COURT.z0) { this.p.z = COURT.z0; this.v.z = Math.abs(this.v.z) * 0.5; } if (this.p.z > COURT.z1) { this.p.z = COURT.z1; this.v.z = -Math.abs(this.v.z) * 0.5; }
      // backboard (front face at boardZ, 1.8 × 1.05 m)
      if (this.p.z + R > COURT.boardZ && this.v.z > 0 && Math.abs(this.p.x - COURT.hoop.x) < 0.9 && this.p.y > 2.85 && this.p.y < 3.9) { this.p.z = COURT.boardZ - R; this.v.z = -this.v.z * 0.55; this.h.sound('kick'); }
      // the rim: a ring of radius rimR; push the ball off the nearest point of the ring
      const dx = this.p.x - COURT.hoop.x, dz = this.p.z - COURT.hoop.z, hd = Math.hypot(dx, dz) || 1e-6;
      const nx = COURT.hoop.x + (dx / hd) * COURT.rimR, nz = COURT.hoop.z + (dz / hd) * COURT.rimR;
      const ox = this.p.x - nx, oy = this.p.y - COURT.hoop.y, oz = this.p.z - nz, od = Math.hypot(ox, oy, oz);
      if (od < R + 0.018) { const n = new THREE.Vector3(ox, oy, oz).divideScalar(od || 1), vn = this.v.dot(n); if (vn < 0) { this.v.addScaledVector(n, -1.55 * vn); this.v.multiplyScalar(0.85); if (this.bounceSnd <= 0) { this.bounceSnd = 0.1; this.h.sound('kick'); } } this.p.addScaledVector(n, R + 0.018 - od); }
    }
    // a basket: the ball drops down through the ring
    const hd = Math.hypot(this.p.x - COURT.hoop.x, this.p.z - COURT.hoop.z);
    if (!this.scoredThis && prev.y >= COURT.hoop.y && this.p.y < COURT.hoop.y && hd < COURT.rimR - COURT.ballR * 0.3) { this.scoredThis = true; this.scored(); }
  }
  private scored() {
    const who = this.lastShooter ?? 'you', pts = shotPoints(this.shotFrom.x, this.shotFrom.z);
    this.v.x *= 0.15; this.v.z *= 0.15; this.h.sound('success');
    if (this.mode === 'challenge') { this.pts += pts; this.makes++; this.h.toast(pts === 3 ? 'Three! 🔥' : 'Swish!', 900); return; }
    if (this.mode === 'oneOnOne') {
      if (who === 'you') this.you += pts; else this.cpu += pts;
      this.h.toast(who === 'you' ? (pts === 3 ? '🔥 Three! ' : '🏀 Bucket! ') + `${this.you}–${this.cpu}` : `Jace scores. ${this.you}–${this.cpu}`, 1500);
      if (this.you >= 11 || this.cpu >= 11) {
        const won = this.you > this.cpu; if (won) { this.p0.add('oneOnOneWins'); this.p0.earn(20); }
        this.h.sound(won ? 'cheer' : 'error'); this.h.toast(won ? `🏆 You beat Jace ${this.you}–${this.cpu}! +20 coins` : `Jace wins ${this.cpu}–${this.you}. Talk to him for a rematch!`, 5000); this.h.save();
        setTimeout(() => this.end(), 1200); return;
      }
      setTimeout(() => { if (this.mode === 'oneOnOne') this.checkBall(who === 'you' ? 'cpu' : 'you'); }, 900);
      return;
    }
    this.makes++; this.p0.add('shootaroundMakes'); this.h.toast(`${pts === 3 ? 'Three!' : 'Swish!'} (${this.makes})`, 900);
  }
  private updateJace(dt: number, pl: THREE.Vector3) {
    const J = this.jace!, H = COURT.hoop;
    let tx = J.x, tz = J.z, sp = 0;
    if (this.holder === 'cpu') {
      // drive to the basket, pull up for a jumper or finish at the rim
      const d = Math.hypot(H.x - J.x, H.z - J.z); J.shootIn -= dt;
      tx = H.x + Math.sin(this.t * 0.6) * 1.5; tz = H.z - 1.4; sp = 5.2;
      const guarded = Math.hypot(pl.x - J.x, pl.z - J.z) < 1.2;
      if ((d < 1.8) || (J.shootIn <= 0 && d < 7.5)) {
        const skill = d < 1.8 ? (guarded ? 1.2 : 2.4) : (guarded ? 0.55 : 0.9), pow = 0.5 + (Math.random() - 0.5) * (d < 1.8 ? 0.12 : 0.34) / skill;
        J.yaw = Math.atan2(H.x - J.x, H.z - J.z); J.a.poseArms(-2.9, -2.9);
        if (guarded && Math.random() < 0.18) { this.holder = null; this.p.set(J.x, 2.2, J.z); this.v.set((Math.random() - 0.5) * 3, 2, -3); this.lastShooter = null; this.noGrab = 0.2; this.h.toast('🖐️ Blocked!', 1000); this.h.sound('kick'); }
        else this.shoot('cpu', new THREE.Vector3(J.x, 0, J.z), J.yaw, pow, skill);
        J.shootIn = 1.5 + Math.random() * 2;
      }
      // steals: if you crowd him he can lose it… or keep dribbling
    } else if (this.holder === 'you') {
      // defend: stay between you and the basket
      const dx = H.x - pl.x, dz = H.z - pl.z, d = Math.hypot(dx, dz) || 1;
      tx = pl.x + (dx / d) * 1.15; tz = pl.z + (dz / d) * 1.15; sp = 6.2;
      if (Math.hypot(pl.x - J.x, pl.z - J.z) < 0.95 && Math.random() < dt * 0.35 && !this.charging) { this.holder = 'cpu'; J.shootIn = 1 + Math.random(); this.h.sound('error'); this.h.toast('Jace stole it!', 1200); }
    } else {
      // loose ball: chase where it'll land
      tx = this.p.x + this.v.x * 0.35; tz = this.p.z + this.v.z * 0.35; sp = 6.5;
      if (this.p.y < 1.9 && this.noGrab <= 0 && Math.hypot(this.p.x - J.x, this.p.z - J.z) < 0.8) { this.holder = 'cpu'; J.shootIn = 0.8 + Math.random() * 1.5; }
    }
    const ddx = tx - J.x, ddz = tz - J.z, dd = Math.hypot(ddx, ddz);
    if (dd > 0.15) { const st = Math.min(dd, sp * dt); J.x += ddx / dd * st; J.z += ddz / dd * st; }
    if (this.holder !== 'cpu' || dd > 0.3) { const fy = this.holder === 'you' ? Math.atan2(pl.x - J.x, pl.z - J.z) : Math.atan2(ddx, ddz); let dy = fy - J.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); J.yaw += dy * Math.min(1, dt * 8); }
    J.a.root.position.set(J.x, 0, J.z); J.a.root.rotation.y = J.yaw; J.a.animate(dt, dd > 0.15 ? sp : 0);
  }
}
