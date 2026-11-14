// Pick-up sports on the campus courts and fields.
// Basketball: walk into the ball to pick it up (you dribble while moving), press E to shoot at the
// nearest hoop — a lofted shot that's less accurate from farther away; it scores when it drops
// through the rim. Soccer: run into the ball to dribble it, press E to kick; a goal counts when the
// ball crosses the goal line between the posts. Simple, forgiving physics (gravity, bounce, rolling).
import * as THREE from 'three';
import { CAMPUS, obb, terrainHeight } from './campusData';

interface Ball {
  kind: 'basketball' | 'soccer'; mesh: THREE.Mesh; p: THREE.Vector3; v: THREE.Vector3; r: number;
  home: THREE.Vector3; held: boolean; resetIn: number; idle: number;
  hoops: { c: THREE.Vector3; board: THREE.Vector3; n: THREE.Vector3 }[];        // basketball: rim centres + backboard plane
  goals: { c: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; half: number; line: number }[];  // soccer
  score: number;
}
export interface BallEvent { type: 'score' | 'goal' | 'bounce' | 'kick'; text?: string }

export class BallGames {
  readonly balls: Ball[] = [];
  private t = 0;

  constructor(scene: THREE.Scene) {
    const tex = (kind: Ball['kind']) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
      if (kind === 'basketball') { g.fillStyle = '#d9662a'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#2a1408'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke(); }
      else { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#1d1d1d'; for (const [x, y] of [[16, 16], [48, 16], [32, 40], [8, 52], [56, 52]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); } }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const rimMat = new THREE.MeshStandardMaterial({ color: '#e0541f', metalness: 0.4, roughness: 0.4 });
    for (const a of CAMPUS.areas) {
      if (a.kind !== 'sport' || (a.sport !== 'basketball' && a.sport !== 'soccer')) continue;
      const o = obb(a.poly), U = new THREE.Vector3(o.u[0], 0, o.u[1]), V = new THREE.Vector3(o.v[0], 0, o.v[1]);
      const at = (du: number, dv: number) => { const x = o.center[0] + o.u[0] * du + o.v[0] * dv, z = o.center[1] + o.u[1] * du + o.v[1] * dv; return new THREE.Vector3(x, terrainHeight(x, z), z); };
      const kind = a.sport as Ball['kind'], r = kind === 'basketball' ? 0.2 : 0.25;
      const home = at(0, 0).add(new THREE.Vector3(0, r, 0));
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshStandardMaterial({ map: tex(kind), roughness: 0.7 }));
      mesh.castShadow = true; mesh.position.copy(home); scene.add(mesh);
      const b: Ball = { kind, mesh, p: home.clone(), v: new THREE.Vector3(), r, home, held: false, resetIn: 0, idle: 0, hoops: [], goals: [], score: 0 };
      if (kind === 'basketball') for (const s of [-1, 1]) {
        const board = at(s * (o.length / 2 - 0.4), 0), c = at(s * (o.length / 2 - 0.4 - 0.55), 0); c.y += 3.05; board.y += 3.2;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16), rimMat); rim.rotation.x = Math.PI / 2; rim.position.copy(c); scene.add(rim);
        b.hoops.push({ c, board, n: U.clone().multiplyScalar(-s) });
      } else for (const s of [-1, 1]) {
        const gw = Math.min(7.3, o.width * 0.22);
        b.goals.push({ c: at(s * (o.length / 2 - 0.6), 0), u: U.clone().multiplyScalar(s), v: V, half: gw / 2, line: o.length / 2 - 0.6 });
      }
      this.balls.push(b);
    }
  }

  /** The ball you're holding / standing next to (for the HUD prompt). */
  nearby(p: THREE.Vector3): Ball | null {
    for (const b of this.balls) if (b.held || (Math.hypot(b.p.x - p.x, b.p.z - p.z) < (b.kind === 'soccer' ? 1.8 : 1.3) && b.p.y - terrainHeight(b.p.x, b.p.z) < 1.5)) return b;
    return null;
  }
  prompt(p: THREE.Vector3): string | null {
    const b = this.nearby(p); if (!b) return null;
    return b.kind === 'basketball' ? (b.held ? 'Shoot at the hoop' : 'Pick up the basketball') : 'Kick the ball';
  }
  /** E pressed: shoot / pick up / kick. Returns true if a ball handled it. */
  action(p: THREE.Vector3, yaw: number): boolean {
    const b = this.nearby(p); if (!b) return false;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (b.kind === 'soccer') { b.v.copy(fwd).multiplyScalar(15).add(new THREE.Vector3(0, 4, 0)); b.idle = 0; return true; }
    if (!b.held) { b.held = true; return true; }
    // shoot: a lofted arc at the nearest rim, with error growing with distance
    const hoop = b.hoops.reduce((m, h) => (h.c.distanceTo(p) < m.c.distanceTo(p) ? h : m), b.hoops[0]);
    b.held = false; b.p.copy(p).addScaledVector(fwd, 0.4); b.p.y += 2.1;
    const d = Math.hypot(hoop.c.x - b.p.x, hoop.c.z - b.p.z), T = 0.75 + d * 0.06, err = Math.min(0.6, 0.04 + d * 0.022);
    const target = hoop.c.clone().add(new THREE.Vector3((Math.random() - 0.5) * err, 0, (Math.random() - 0.5) * err));
    b.v.set((target.x - b.p.x) / T, (target.y - b.p.y) / T + 0.5 * 9.8 * T, (target.z - b.p.z) / T);
    return true;
  }

  update(dt: number, player: { p: THREE.Vector3; yaw: number; speed: number; active: boolean }): BallEvent[] {
    const ev: BallEvent[] = []; this.t += dt;
    for (const b of this.balls) {
      if (b.resetIn > 0) { b.resetIn -= dt; if (b.resetIn <= 0) { b.p.copy(b.home); b.v.set(0, 0, 0); } b.mesh.position.copy(b.p); continue; }
      if (b.held) {
        if (!player.active) { b.held = false; continue; }
        const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
        const g = terrainHeight(player.p.x, player.p.z), dribble = player.speed > 0.5 ? Math.abs(Math.sin(this.t * 7)) : 0.6;
        b.p.set(player.p.x + fwd.x * 0.55 + fwd.z * 0.3, g + b.r + dribble * 0.85, player.p.z + fwd.z * 0.55 - fwd.x * 0.3); b.v.set(0, 0, 0);
        b.mesh.position.copy(b.p); b.mesh.rotation.x += dt * player.speed * 3; continue;
      }
      const prev = b.p.clone();
      b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt);
      const g = terrainHeight(b.p.x, b.p.z) + b.r;
      if (b.p.y < g) {
        b.p.y = g; if (b.v.y < -1.5) ev.push({ type: 'bounce' });
        b.v.y = -b.v.y * (b.kind === 'basketball' ? 0.62 : 0.45); if (Math.abs(b.v.y) < 0.6) b.v.y = 0;
        const f = Math.max(0, 1 - dt * (b.kind === 'soccer' ? 1.1 : 0.9)); b.v.x *= f; b.v.z *= f;
      }
      // the player bumps / dribbles the ball
      if (player.active) {
        const dx = b.p.x - player.p.x, dz = b.p.z - player.p.z, d = Math.hypot(dx, dz);
        if (d < 0.65 && b.p.y - terrainHeight(b.p.x, b.p.z) < 1.2) {
          if (b.kind === 'basketball' && Math.hypot(b.v.x, b.v.z) < 4) b.held = true;
          else { const push = Math.max(2.5, player.speed * 1.4); b.v.x = dx / (d || 1) * push; b.v.z = dz / (d || 1) * push; if (b.kind === 'soccer') b.v.y = Math.max(b.v.y, 0.8); }
        }
      }
      // basketball: backboard + rim + scoring
      for (const h of b.hoops) {
        const toBoard = (b.p.x - h.board.x) * -h.n.x + (b.p.z - h.board.z) * -h.n.z, prevTo = (prev.x - h.board.x) * -h.n.x + (prev.z - h.board.z) * -h.n.z;
        if (prevTo < 0 && toBoard >= 0 && Math.abs(b.p.y - h.board.y) < 0.55) { const vn = b.v.x * h.n.x + b.v.z * h.n.z; b.v.x -= 1.6 * vn * h.n.x; b.v.z -= 1.6 * vn * h.n.z; b.p.copy(prev); }
        const hd = Math.hypot(b.p.x - h.c.x, b.p.z - h.c.z);
        if (prev.y > h.c.y && b.p.y <= h.c.y && hd < 0.3) { b.score += 2; ev.push({ type: 'score', text: `Swish! ${b.score} points` }); b.v.x *= 0.2; b.v.z *= 0.2; }
        else if (Math.abs(b.p.y - h.c.y) < 0.12 && Math.abs(hd - 0.3) < b.r * 0.7) { const nx = (b.p.x - h.c.x) / (hd || 1), nz = (b.p.z - h.c.z) / (hd || 1), vn = b.v.x * nx + b.v.z * nz; if (vn * (hd - 0.3) < 0) { b.v.x -= 1.5 * vn * nx; b.v.z -= 1.5 * vn * nz; b.v.y = Math.abs(b.v.y) * 0.4; } }
      }
      // soccer: goals (under the crossbar = height above the field)
      for (const gl of b.goals) {
        const du = (b.p.x - gl.c.x) * gl.u.x + (b.p.z - gl.c.z) * gl.u.z, dv = (b.p.x - gl.c.x) * gl.v.x + (b.p.z - gl.c.z) * gl.v.z;
        if (du > 0.1 && du < 1.8 && Math.abs(dv) < gl.half && b.p.y - gl.c.y < 2.4 + b.r) { b.score += 1; ev.push({ type: 'goal', text: `GOAL! (${b.score})` }); b.v.multiplyScalar(0.1); b.resetIn = 2.5; }
      }
      // wandered off for good: back to the court
      b.idle = Math.hypot(b.p.x - b.home.x, b.p.z - b.home.z) > 70 ? b.idle + dt : 0;
      if (b.idle > 15) { b.idle = 0; b.p.copy(b.home); b.v.set(0, 0, 0); }
      b.mesh.position.copy(b.p);
      const sp = Math.hypot(b.v.x, b.v.z); if (sp > 0.05) { b.mesh.rotation.x += (b.v.z / b.r) * dt; b.mesh.rotation.z -= (b.v.x / b.r) * dt; }
    }
    return ev;
  }
  setVisible(v: boolean) { for (const b of this.balls) b.mesh.visible = v; }
}
