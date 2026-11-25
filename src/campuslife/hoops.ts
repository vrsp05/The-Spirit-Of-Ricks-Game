// Real basketball on the Hart's south half court. The ball has physics (gravity, bounces, the rim and the
// backboard); you pick it up by running into it, dribble while you move, hold E (Ⓐ) to load a shot and let
// go to shoot — the power meter decides how deep the shot goes. Modes:
//   free       shootaround: count your makes
//   challenge  60 seconds, as many points as you can (2s and 3s) — your record is saved
//   threes     three-point contest: five racks around the arc, five balls each, the last one is the money ball
//   game       to 11: 1-on-1 vs Jace, or 2-on-2 with Kenzie (R passes / calls for the ball) — league games count
//              toward the Hart 2-on-2 League table
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

/** The five three-point racks (corner, wing, top, wing, corner), just behind the arc. */
export const RACKS = [-80, -42, 0, 42, 80].map(deg => {
  const a = THREE.MathUtils.degToRad(deg), r = COURT.threeR + 0.55;
  return { x: COURT.hoop.x + Math.sin(a) * r, z: COURT.hoop.z - Math.cos(a) * r };
});
/** Three-point contest score for one rack: four 1-point balls and a 2-point money ball. */
export const threesValue = (ball: number) => (ball === 4 ? 2 : 1);

// ------------------------------------------------------------------ the Hart 2-on-2 League
export interface LeagueTeam { name: string; players: [string, string]; skill: number; shirt: string }
export const LEAGUE_TEAMS: LeagueTeam[] = [
  { name: 'You & Kenzie', players: ['You', 'Kenzie'], skill: 1, shirt: '#2d5f9a' },
  { name: 'Hart Attack', players: ['Jace', 'Dallin'], skill: 1, shirt: '#7a2b2b' },
  { name: 'Night Owls', players: ['Wyatt', 'Ivy'], skill: 0.85, shirt: '#3a3550' },
  { name: 'Snow Birds', players: ['Mateo', 'Brooke'], skill: 1.15, shirt: '#e8e8ee' },
];
/** Round r (0–2): you play team r + 1; the other two play each other (simulated). */
export const leagueOpponent = (round: number) => 1 + (round % 3);
export function leagueTable(p: Progress) {
  return LEAGUE_TEAMS.map((t, i) => ({ i, name: t.name, w: p.stat(`lg:w:${i}`), l: p.stat(`lg:l:${i}`) }))
    .sort((a, b) => b.w - a.w || a.l - b.l || a.i - b.i);
}
/** Records your league game and simulates the other one. Returns the season result when the season ends. */
export function recordLeagueGame(p: Progress, won: boolean, rng = Math.random): { round: number; champion?: boolean; otherResult: string } {
  const round = p.stat('lgRound'), opp = leagueOpponent(round);
  p.add(`lg:${won ? 'w' : 'l'}:0`); p.add(`lg:${won ? 'l' : 'w'}:${opp}`);
  const others = [1, 2, 3].filter(i => i !== opp), [a, b] = others;
  const pa = LEAGUE_TEAMS[a].skill / (LEAGUE_TEAMS[a].skill + LEAGUE_TEAMS[b].skill), aWins = rng() < pa;
  p.add(`lg:w:${aWins ? a : b}`); p.add(`lg:l:${aWins ? b : a}`);
  const s1 = 11, s2 = 4 + Math.floor(rng() * 6);
  const otherResult = `${LEAGUE_TEAMS[aWins ? a : b].name} beat ${LEAGUE_TEAMS[aWins ? b : a].name} ${s1}–${s2}`;
  if (round + 1 < 3) { p.set('lgRound', round + 1); return { round: round + 1, otherResult }; }
  const table = leagueTable(p), top = table[0].w, champion = p.stat('lg:w:0') >= top;
  if (champion) p.add('leagueTitles');
  p.add('lgSeasons');
  for (let i = 0; i < 4; i++) { p.set(`lg:w:${i}`, 0); p.set(`lg:l:${i}`, 0); }
  p.set('lgRound', 0);
  return { round: 3, champion, otherResult };
}

type Team = 'us' | 'them';
interface Baller { a: Avatar; name: string; team: Team; x: number; z: number; yaw: number; shootIn: number; skill: number; mark: number /* -1 = you */ }
type Holder = 'you' | number | null;   // number = index into ai

export class Hoops {
  mode: 'free' | 'challenge' | 'threes' | 'game' | null = 'free';
  private ball: THREE.Mesh; private p = new THREE.Vector3(); private v = new THREE.Vector3();
  private holder: Holder = null; private lastShooter: Holder = null; private shotFrom = new THREE.Vector3(); private scoredThis = false; private noGrab = 0;
  private charging = 0; private chargeT = 0; private t = 0; private meterEl: HTMLElement | null = null;
  private makes = 0; private pts = 0; private left = 0; private us = 0; private them = 0; private bounceSnd = 0;
  private ai: Baller[] = [];
  private league = false; private oppName = 'Jace'; private over = false;
  // three-point contest
  private rack = 0; private rackBall = 0; private nextBallIn = 0; private racks: THREE.Group[] = [];
  /** Called when a league game ends (game.ts shows the table). */
  onLeagueResult: (r: ReturnType<typeof recordLeagueGame>, won: boolean, score: string) => void = () => {};

  constructor(private h: LifeHost, private p0: Progress, private g: THREE.Group, private origin: THREE.Vector3) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    x.fillStyle = '#d9662a'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#2a1408'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 32); x.lineTo(64, 32); x.moveTo(32, 0); x.lineTo(32, 64); x.arc(32, 32, 22, 0, Math.PI * 2); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballR * 1.25, 16, 12), mat); this.ball.castShadow = true; g.add(this.ball);
    // ball racks for the three-point contest (shown only during it)
    const frame = new THREE.MeshStandardMaterial({ color: '#30353b', roughness: 0.6 }), money = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.6 });
    for (const r of RACKS) {
      const grp = new THREE.Group(); grp.position.set(r.x, 0, r.z); grp.rotation.y = Math.atan2(COURT.hoop.x - r.x, COURT.hoop.z - r.z) + Math.PI / 2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.32), frame); base.position.y = 0.28; grp.add(base);
      for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballR * 1.2, 12, 8), i === 4 ? money : mat); b.position.set(-0.52 + i * 0.26, 0.7, 0); grp.add(b); }
      grp.visible = false; g.add(grp); this.racks.push(grp);
    }
    this.resetBall();
  }
  private resetBall(at = COURT.check) { this.holder = null; this.p.set(at.x, COURT.ballR, at.z + 1.5); this.v.set(0, 0, 0); }
  private local(w: THREE.Vector3) { return new THREE.Vector3(w.x - this.origin.x, w.y, w.z - this.origin.z); }
  private teamOf(h: Holder): Team | null { return h === null ? null : h === 'you' ? 'us' : this.ai[h]?.team ?? null; }

  // ---------------------------------------------------------------- modes
  startChallenge() { this.end(); this.mode = 'challenge'; this.pts = 0; this.makes = 0; this.left = 60; this.resetBall(); this.h.toast('🏀 Shooting challenge: 60 seconds! Grab the ball, hold E to load a shot, let go to shoot. Threes count 3.', 5000); this.h.sound('tick'); }
  startThrees() {
    this.end(); this.mode = 'threes'; this.pts = 0; this.makes = 0; this.left = 75; this.rack = 0; this.rackBall = 0; this.nextBallIn = 0.3;
    this.racks.forEach(r => { r.visible = true; r.children.slice(1).forEach(b => { b.visible = true; }); });
    this.h.toast('🎯 Three-point contest! 5 racks × 5 balls, 75 seconds. Stand at the glowing rack; the white money ball is worth 2.', 6000); this.h.sound('tick');
  }
  private baller(name: string, team: Team, shirt: string, seed: number, skill: number, mark: number, x: number, z: number): Baller {
    const a = new Avatar({ ...eraLook('presentFinale', seed), shirt, shorts: true, hat: 'none' }); this.g.add(a.root);
    return { a, name, team, x, z, yaw: Math.PI, shootIn: 0, skill, mark };
  }
  startOneOnOne() {
    this.end(); this.mode = 'game'; this.us = 0; this.them = 0; this.league = false; this.oppName = 'Jace';
    this.ai = [this.baller('Jace', 'them', '#7a2b2b', 4411, 1, -1, COURT.hoop.x + 2, COURT.hoop.z - 3)];
    this.checkBall('us');
    this.h.toast('🏀 1-on-1 vs Jace, first to 11! Hold E to shoot · near Jace, tap E to steal · beyond the arc = 3 points.', 6000); this.h.sound('tick');
  }
  /** 2-on-2 with Kenzie against a league team (1–3). League games count toward the table. */
  startTwoOnTwo(opp: number, league = true) {
    this.end(); this.mode = 'game'; this.us = 0; this.them = 0; this.league = league;
    const T = LEAGUE_TEAMS[opp], H = COURT.hoop; this.oppName = T.name;
    this.ai = [
      this.baller('Kenzie', 'us', LEAGUE_TEAMS[0].shirt, 2207, 1.05, 2, H.x - 4, H.z - 6),
      this.baller(T.players[0], 'them', T.shirt, 4411 + opp * 17, T.skill, -1, H.x + 2, H.z - 3),
      this.baller(T.players[1], 'them', T.shirt, 5120 + opp * 31, T.skill, 0, H.x - 3, H.z - 2),
    ];
    this.checkBall('us');
    this.h.toast(`🏀 2-on-2 vs ${T.name}, first to 11! R passes to Kenzie (or calls for the ball) · hold E to shoot · tap E near a ball-handler to steal.`, 7000); this.h.sound('tick');
  }
  /** Ends the current game mode (back to a free shootaround). */
  end() {
    for (const b of this.ai) b.a.root.removeFromParent(); this.ai = [];
    this.racks.forEach(r => { r.visible = false; });
    if (this.holder !== null && this.holder !== 'you') this.holder = null;
    this.mode = 'free'; this.charging = 0; this.meter(false); this.over = false;
  }
  private checkBall(to: Team) {
    this.lastShooter = null;
    const ai = this.ai.findIndex(b => b.team === to);
    if (to === 'them' && ai >= 0) { const b = this.ai[ai]; this.holder = ai; b.x = COURT.check.x; b.z = COURT.check.z; b.shootIn = 1.2 + Math.random(); }
    else { this.holder = null; this.p.set(COURT.check.x, COURT.ballR + 0.4, COURT.check.z); this.v.set(0, 2, 0); }
  }
  tracker() {
    if (this.mode === 'challenge') return `🏀 Shooting challenge · ${this.pts} pts (${this.makes} makes) · ⏱ ${Math.ceil(this.left)} s`;
    if (this.mode === 'threes') return `🎯 Three-point contest · ${this.pts} pts · ${this.rack >= 5 ? 'last ball in the air…' : `rack ${this.rack + 1}/5, ball ${this.rackBall + 1}/5`} · ⏱ ${Math.ceil(this.left)} s`;
    if (this.mode === 'game') {
      const two = this.ai.length > 1, who = this.teamOf(this.holder);
      return `🏀 ${two ? '2-on-2' : '1-on-1'} · You${two ? ' & Kenzie' : ''} ${this.us} – ${this.them} ${this.oppName}${this.league ? ' · league game' : ''} · first to 11${this.holder === 'you' ? ` · hold E to shoot${two ? ' · R pass' : ''}` : who === 'us' ? ' · R: call for it' : who === 'them' ? ' · tap E near them to steal' : ' · get the ball!'}`;
    }
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

  private shoot(who: Holder, from: THREE.Vector3, yaw: number, power: number, skill = 1) {
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
  /** A chest pass (a flat lob) from one spot to another; whoever is closest catches it. */
  private pass(fromX: number, fromZ: number, toX: number, toZ: number, passer: Holder) {
    const from = new THREE.Vector3(fromX, 1.3, fromZ), to = new THREE.Vector3(toX, 1.15, toZ);
    this.holder = null; this.lastShooter = null; this.p.copy(from); this.v.copy(shotVelocity(from, to, 18)); this.noGrab = 0;
    this.passer = passer; this.passGrace = 0.35; this.h.sound('whoosh');
  }
  private passer: Holder = null; private passGrace = 0;
  private canGrab(who: Holder) { return this.noGrab <= 0 && !(this.passGrace > 0 && who === this.passer); }

  // ---------------------------------------------------------------- frame
  update(dt: number, pw: THREE.Vector3, yaw: number, speed: number, a: ActionState, canAct: boolean) {
    this.t += dt; this.noGrab -= dt; this.bounceSnd -= dt; this.passGrace -= dt;
    const pl = this.local(pw), two = this.ai.length > 1;
    // ---- three-point contest: a fresh ball in your hands at the current rack
    if (this.mode === 'threes') this.nextBallIn -= dt;
    if (this.mode === 'threes' && this.holder !== 'you' && this.rack < 5) {
      const R = RACKS[this.rack], at = Math.hypot(pl.x - R.x, pl.z - R.z) < 1.4;
      if (this.nextBallIn <= 0 && at) { this.holder = 'you'; this.racks[this.rack].children[1 + this.rackBall].visible = false; this.h.sound('tick'); }
    }
    // ---- input (you have the ball): hold E to load, release to shoot; R passes to Kenzie
    if (this.holder === 'you' && canAct) {
      if (two && !this.charging && a.pressed('alt')) {
        a.consume('alt'); const k = this.ai.find(b => b.team === 'us')!; this.pass(pl.x, pl.z, k.x, k.z, 'you');
      } else {
        if (a.pressed('interact')) { a.consume('interact'); a.consume('confirm'); this.charging = 1; this.chargeT = 0; }
        if (this.charging) {
          if (a.isDown('interact')) { this.chargeT += dt; this.meter(true, this.power()); this.h.avatar.poseArms(-2.7, -2.7); }
          else {
            const pow = this.power(); this.charging = 0; this.meter(false); this.h.avatar.poseArms(-2.9, -2.9);
            if (this.mode === 'threes') this.threesShot(pl);
            this.shoot('you', pl, yaw, pow);
          }
        }
      }
    } else if (this.charging) { this.charging = 0; this.meter(false); }
    // ---- call for the ball (Kenzie has it)
    if (typeof this.holder === 'number' && this.ai[this.holder]?.team === 'us' && canAct && a.pressed('alt')) {
      a.consume('alt'); const k = this.ai[this.holder]; this.pass(k.x, k.z, pl.x, pl.z, this.holder);
    }
    // ---- steal (tap E next to an opponent who's dribbling)
    if (typeof this.holder === 'number' && this.ai[this.holder]?.team === 'them' && canAct && a.pressed('interact')) {
      const b = this.ai[this.holder];
      if (Math.hypot(pl.x - b.x, pl.z - b.z) < 1.5) {
        a.consume('interact'); a.consume('confirm');
        if (Math.random() < 0.4) { this.holder = 'you'; this.h.sound('success'); this.h.toast('Steal! 🏀', 1200); } else { this.h.sound('error'); this.noGrab = 0.4; }
      }
    }
    // ---- the ball
    if (this.holder !== null) {
      const b = this.holder === 'you' ? null : this.ai[this.holder];
      const hx = b ? b.x : pl.x, hz = b ? b.z : pl.z, hy = b ? b.yaw : yaw;
      const moving = b ? true : speed > 0.5, fx = Math.sin(hy), fz = Math.cos(hy);
      const bounce = moving && !this.charging ? Math.abs(Math.sin(this.t * 7.5)) : 0.85;
      if (moving && !this.charging && Math.abs(Math.sin(this.t * 7.5)) < 0.12 && this.bounceSnd <= 0) { this.bounceSnd = 0.25; if (!b) this.h.sound('bounce'); }
      this.p.set(hx + fx * 0.45 + fz * 0.3, this.charging ? 2.3 : COURT.ballR + bounce * 0.9, hz + fz * 0.45 - fx * 0.3); this.v.set(0, 0, 0);
    } else this.physics(dt);
    this.ball.position.copy(this.p); this.ball.rotation.x += dt * (this.holder !== null ? speed : Math.hypot(this.v.x, this.v.z)) * 3;
    // ---- grabbing a loose ball
    const loose = this.holder === null && this.p.y < 1.9;
    if (loose && this.mode !== 'threes' && this.canGrab('you') && Math.hypot(this.p.x - pl.x, this.p.z - pl.z) < 0.85) { this.holder = 'you'; this.h.sound('tick'); }
    // ---- the other players
    if (!this.over) this.ai.forEach((b, i) => this.updateBaller(b, i, dt, pl));
    // ---- the clock
    if (this.mode === 'challenge') {
      this.left -= dt;
      if (this.left <= 0) { const rec = this.pts > this.p0.stat('hoopsBest'); if (rec) { this.p0.set('hoopsBest', this.pts); this.p0.earn(15); } this.p0.add('hoopsGames'); this.h.sound(rec ? 'cheer' : 'success');
        this.h.toast(`⏱ Time! ${this.pts} points (${this.makes} makes).${rec ? ' NEW RECORD! +15 coins' : ` Record: ${this.p0.stat('hoopsBest')}`}`, 5000); this.h.save(); this.end(); }
    }
    if (this.mode === 'threes') {
      this.left -= dt;
      this.racks.forEach((r, i) => { (r.children[0] as THREE.Mesh).scale.y = i === this.rack ? 1 + Math.abs(Math.sin(this.t * 4)) * 0.15 : 1; });
      if (this.left <= 0 || (this.rack >= 5 && this.holder === null && this.nextBallIn <= -1.2)) this.finishThrees();
    }
  }
  /** Counts a three-point-contest attempt and lines up the next ball. */
  private pendingValue = 0;
  private threesShot(pl: THREE.Vector3) {
    const R = RACKS[this.rack], at = Math.hypot(pl.x - R.x, pl.z - R.z) < 1.6;
    this.pendingValue = at ? threesValue(this.rackBall) : 0;
    if (!at) this.h.toast('Shoot from the rack!', 1200);
    this.rackBall++;
    if (this.rackBall >= 5) { this.rack++; this.rackBall = 0; if (this.rack < 5) this.h.toast(`Rack ${this.rack + 1} →`, 1400); }
    this.nextBallIn = 1.6;   // the next ball comes once this shot is down (sooner if it goes in)
  }
  private finishThrees() {
    const rec = this.pts > this.p0.stat('threesBest'); if (rec) { this.p0.set('threesBest', this.pts); this.p0.earn(15); }
    this.p0.add('threesGames'); this.h.sound(rec ? 'cheer' : 'success');
    this.h.toast(`🎯 Three-point contest: ${this.pts} of 30 points.${rec ? ' NEW RECORD! +15 coins' : ` Record: ${this.p0.stat('threesBest')}`}`, 5000);
    this.h.save(); if (this.holder === 'you') this.holder = null; this.end();
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
    if (!this.scoredThis && this.lastShooter !== null && prev.y >= COURT.hoop.y && this.p.y < COURT.hoop.y && hd < COURT.rimR - COURT.ballR * 0.3) { this.scoredThis = true; this.scored(); }
  }
  private scored() {
    const who = this.lastShooter ?? 'you', pts = shotPoints(this.shotFrom.x, this.shotFrom.z);
    this.v.x *= 0.15; this.v.z *= 0.15; this.h.sound('success');
    if (this.mode === 'challenge') { this.pts += pts; this.makes++; this.h.toast(pts === 3 ? 'Three! 🔥' : 'Swish!', 900); return; }
    if (this.mode === 'threes') { this.nextBallIn = Math.min(this.nextBallIn, 0.35); this.pts += this.pendingValue; this.makes++; this.h.toast(this.pendingValue === 2 ? '💰 Money ball!' : this.pendingValue ? 'Splash!' : 'Off the rack — no points', 800); this.pendingValue = 0; return; }
    if (this.mode === 'game') {
      if (this.over) return;   // the final whistle already blew
      const team = this.teamOf(who) ?? 'us', two = this.ai.length > 1;
      if (team === 'us') this.us += pts; else this.them += pts;
      const name = who === 'you' ? 'You' : this.ai[who as number]?.name ?? '';
      this.h.toast(team === 'us' ? `${who === 'you' ? (pts === 3 ? '🔥 Three! ' : '🏀 Bucket! ') : `${name} scores! `}${this.us}–${this.them}` : `${name} scores. ${this.us}–${this.them}`, 1500);
      if (this.us >= 11 || this.them >= 11) {
        this.over = true;
        const won = this.us > this.them, score = `${Math.max(this.us, this.them)}–${Math.min(this.us, this.them)}`;
        if (two) {
          if (won) { this.p0.add('twoOnTwoWins'); this.p0.earn(20); }
          this.h.sound(won ? 'cheer' : 'error');
          if (this.league) { const r = recordLeagueGame(this.p0, won); this.onLeagueResult(r, won, score); }
          else this.h.toast(won ? `🏆 You and Kenzie win ${score}! +20 coins` : `${this.oppName} win ${score}.`, 5000);
        } else {
          if (won) { this.p0.add('oneOnOneWins'); this.p0.earn(20); }
          this.h.sound(won ? 'cheer' : 'error'); this.h.toast(won ? `🏆 You beat Jace ${score}! +20 coins` : `Jace wins ${score}. Talk to him for a rematch!`, 5000);
        }
        this.h.save();
        setTimeout(() => this.end(), 1200); return;
      }
      setTimeout(() => { if (this.mode === 'game') this.checkBall(team === 'us' ? 'them' : 'us'); }, 900);
      return;
    }
    this.makes++; this.p0.add('shootaroundMakes'); this.h.toast(`${pts === 3 ? 'Three!' : 'Swish!'} (${this.makes})`, 900);
  }
  private pos(i: number | -1, pl: THREE.Vector3) { return i === -1 ? { x: pl.x, z: pl.z } : { x: this.ai[i].x, z: this.ai[i].z }; }
  /** One AI player: offense with the ball, spacing off the ball, man-to-man defence, chasing loose balls. */
  private updateBaller(b: Baller, i: number, dt: number, pl: THREE.Vector3) {
    const H = COURT.hoop, teamHas = this.teamOf(this.holder);
    let tx = b.x, tz = b.z, sp = 0, face: number | null = null;
    if (this.holder === i) {
      // drive to the basket, pull up for a jumper, finish at the rim — or kick it to a teammate
      const d = Math.hypot(H.x - b.x, H.z - b.z); b.shootIn -= dt;
      tx = H.x + Math.sin(this.t * 0.6 + i) * 1.5; tz = H.z - 1.4; sp = 5.2;
      const defenders = this.ai.map((o, k) => ({ o, k })).filter(q => q.o.team !== b.team).map(q => this.pos(q.k, pl));
      if (b.team === 'them') defenders.push({ x: pl.x, z: pl.z });
      const guarded = defenders.some(q => Math.hypot(q.x - b.x, q.z - b.z) < 1.2);
      const mate = b.team === 'us' ? -1 : this.ai.findIndex((o, k) => k !== i && o.team === b.team);
      if (guarded && this.ai.length > 1 && Math.random() < dt * 0.6 && (b.team === 'them' ? mate >= 0 : true)) {
        const m = this.pos(mate, pl); if (mate !== i) { this.pass(b.x, b.z, m.x, m.z, i); return this.moveBaller(b, tx, tz, 0, dt, null, pl); }
      }
      if (d < 1.8 || (b.shootIn <= 0 && d < 7.5)) {
        const skill = (d < 1.8 ? (guarded ? 1.2 : 2.4) : (guarded ? 0.55 : 0.9)) * b.skill, pow = 0.5 + (Math.random() - 0.5) * (d < 1.8 ? 0.12 : 0.34) / skill;
        b.yaw = Math.atan2(H.x - b.x, H.z - b.z); b.a.poseArms(-2.9, -2.9);
        if (guarded && Math.random() < 0.18) { this.holder = null; this.p.set(b.x, 2.2, b.z); this.v.set((Math.random() - 0.5) * 3, 2, -3); this.lastShooter = null; this.noGrab = 0.2; this.h.toast('🖐️ Blocked!', 1000); this.h.sound('kick'); }
        else this.shoot(i, new THREE.Vector3(b.x, 0, b.z), b.yaw, pow, skill);
        b.shootIn = 1.5 + Math.random() * 2;
      }
    } else if (teamHas === b.team) {
      // a teammate has it: get open on the wing, away from the ball
      const hp = this.holder === 'you' ? { x: pl.x, z: pl.z } : this.pos(this.holder as number, pl);
      const side = hp.x < H.x ? 1 : -1; tx = H.x + side * 5; tz = H.z - 3.5 + Math.sin(this.t * 0.8 + i) * 1.2; sp = 4.5;
    } else if (teamHas !== null) {
      // defence: stay between your man and the basket
      const m = this.pos(b.mark, pl), dx = H.x - m.x, dz = H.z - m.z, d = Math.hypot(dx, dz) || 1;
      tx = m.x + (dx / d) * 1.15; tz = m.z + (dz / d) * 1.15; sp = 6.2 * Math.min(1.1, b.skill); face = Math.atan2(m.x - b.x, m.z - b.z);
      const markHasBall = b.mark === -1 ? this.holder === 'you' : this.holder === b.mark;
      if (markHasBall && Math.hypot(m.x - b.x, m.z - b.z) < 0.95 && Math.random() < dt * 0.35 * b.skill && !(this.holder === 'you' && this.charging)) {
        this.holder = i; b.shootIn = 1 + Math.random(); this.h.sound('error'); this.h.toast(`${b.name} stole it!`, 1200);
      }
    } else {
      // loose ball: the closest player of each team chases it; the others drift back
      const mates: (number | -1)[] = this.ai.map((o, k) => (o.team === b.team ? k : null)).filter((k): k is number => k !== null);
      if (b.team === 'us') mates.push(-1);
      const dist = (k: number | -1) => { const q = this.pos(k, pl); return Math.hypot(this.p.x - q.x, this.p.z - q.z); };
      const closest = mates.reduce((a, k) => (dist(k) < dist(a) ? k : a), mates[0]);
      if (closest === i || this.mode !== 'game') { tx = this.p.x + this.v.x * 0.35; tz = this.p.z + this.v.z * 0.35; sp = 6.5; }
      else { tx = H.x + (b.team === 'us' ? -4 : 3); tz = H.z - 4.5; sp = 4; }
      if (this.p.y < 1.9 && this.canGrab(i) && Math.hypot(this.p.x - b.x, this.p.z - b.z) < 0.8) { this.holder = i; b.shootIn = 0.8 + Math.random() * 1.5; }
    }
    this.moveBaller(b, tx, tz, sp, dt, face, pl);
  }
  private moveBaller(b: Baller, tx: number, tz: number, sp: number, dt: number, face: number | null, pl: THREE.Vector3) {
    // keep a little space from the other players
    for (const o of this.ai) if (o !== b) { const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz); if (d < 0.7 && d > 1e-3) { b.x += dx / d * (0.7 - d) * 0.5; b.z += dz / d * (0.7 - d) * 0.5; } }
    const ddx = tx - b.x, ddz = tz - b.z, dd = Math.hypot(ddx, ddz);
    if (dd > 0.15 && sp > 0) { const st = Math.min(dd, sp * dt); b.x += ddx / dd * st; b.z += ddz / dd * st; }
    b.x = Math.max(COURT.x0 + 0.4, Math.min(COURT.x1 - 0.4, b.x)); b.z = Math.max(COURT.z0 + 0.4, Math.min(COURT.z1 - 0.4, b.z));
    const fy = face ?? (dd > 0.3 ? Math.atan2(ddx, ddz) : Math.atan2(pl.x - b.x, pl.z - b.z));
    let dy = fy - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += dy * Math.min(1, dt * 8);
    b.a.root.position.set(b.x, 0, b.z); b.a.root.rotation.y = b.yaw; b.a.animate(dt, dd > 0.15 && sp > 0 ? sp : 0);
  }
}
