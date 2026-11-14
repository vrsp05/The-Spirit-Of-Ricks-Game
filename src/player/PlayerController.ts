import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { ActionState } from '../input/actions';
import { Avatar } from './Avatar';
import { PARAMS, type Vehicle } from './Vehicle';

/** Where the player currently is (exterior campus or an interior). */
export interface Space {
  id: string;
  blocked(x: number, z: number, r: number): boolean;
  groundY(x: number, z: number): number;
  /** Absolute height of solid geometry at x,z (for camera occlusion); 0/undefined = open. */
  occluderTop?(x: number, z: number): number;
  interior: boolean;
}

const ROOF = 24;   // metres: above this the jetpack clears every campus roof
export class PlayerController {
  readonly avatar = new Avatar({ shirt: '#f2efe6', pants: '#3a4252', skin: '#e2b893', hair: '#4a3324', tie: '#3b5b8c' });
  readonly position = new THREE.Vector3();
  yaw = 0;              // facing, radians (0 = +z/south)
  speed = 0;
  /** Cheat code "jetpack": hold jump to fly. */
  jetpack = false;
  private thrust = false;
  /** High enough to clear the campus roofs: building collision is ignored up here. */
  private aboveRoofs() { return this.jetpack && this.position.y - this.space.groundY(this.position.x, this.position.z) > ROOF - 1.5; }
  vy = 0;
  grounded = true;
  space!: Space;
  noclip = false;
  vehicle: Vehicle | null = null;
  /** Sitting on a bench (any movement stands up). */
  seated = false;

  constructor(scene: THREE.Scene) { scene.add(this.avatar.root); }

  place(space: Space, x: number, z: number, yaw = this.yaw) {
    this.space = space; this.position.set(x, space.groundY(x, z), z); this.yaw = yaw; this.vy = 0; this.grounded = true; this.sync();
  }

  update(dt: number, input: ActionState, cameraYaw: number, enabled: boolean) {
    if (this.vehicle) { this.drive(dt, input, enabled); return; }
    if (this.seated) { this.avatar.root.position.set(this.position.x, this.position.y - 0.25, this.position.z); this.avatar.root.rotation.y = this.yaw; return; }
    let mx = 0, my = 0;
    if (enabled) { mx = input.axes.moveX; my = input.axes.moveY; }
    const mag = Math.min(1, Math.hypot(mx, my));
    const P = GAME_CONFIG.player;
    const target = mag > 0.05 ? (input.running ? P.runSpeed : P.walkSpeed) * mag * (this.noclip ? 3 : 1) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (this.grounded ? 10 : 3));
    if (mag > 0.05) {
      // camera-relative: forward = away from camera
      const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
      const rx = -fz, rz = fx;
      const dx = (fx * my + rx * mx) / (mag || 1), dz = (fz * my + rz * mx) / (mag || 1);
      const want = Math.atan2(dx, dz);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
      this.move(dx * this.speed * dt, dz * this.speed * dt, P.radius);
    } else if (this.speed > 0.05) {
      this.move(Math.sin(this.yaw) * this.speed * dt, Math.cos(this.yaw) * this.speed * dt, P.radius);
    }
    // jump + gravity (+ jetpack: hold jump to fly, glide down when you let go)
    let gy = this.space.groundY(this.position.x, this.position.z);
    // above a building's footprint you can't drop below roof level (no landing inside walls)
    if (this.jetpack && this.space.blocked(this.position.x, this.position.z, 0.3) && this.position.y > gy + 2) gy += ROOF;
    this.thrust = this.jetpack && enabled && input.isDown('jump');
    if (enabled && this.grounded && input.pressed('jump')) { this.vy = P.jumpSpeed; this.grounded = false; }
    if (this.thrust) { this.grounded = false; this.vy = Math.min(7, this.vy + 22 * dt); }
    if (!this.grounded) {
      this.vy -= P.gravity * (this.jetpack ? 0.35 : 1) * dt; if (this.jetpack) this.vy = Math.max(this.vy, -4);
      this.position.y = Math.min(this.position.y + this.vy * dt, gy + 90);
      if (this.position.y <= gy) { this.position.y = gy; this.vy = 0; this.grounded = true; }
    } else {
      this.position.y += (gy - this.position.y) * Math.min(1, dt * 20);
    }
    this.avatar.animate(dt, this.grounded ? this.speed : 0);
    this.avatar.jetFlame(this.thrust ? 1 : !this.grounded && this.jetpack ? 0.35 : 0);
    this.sync();
  }

  /** Golf cart: W/S throttle & brake/reverse, A/D steer (relative to the cart). */
  private drive(dt: number, input: ActionState, enabled: boolean) {
    const cart = this.vehicle!, C = PARAMS[cart.kind];
    const throttle = enabled ? input.axes.moveY : 0, steer = enabled ? input.axes.moveX : 0;
    const max = throttle >= 0 ? C.maxSpeed : -C.reverseSpeed;
    const tgt = Math.abs(throttle) > 0.05 ? max * Math.abs(throttle) : 0, step = C.accel * dt;
    cart.speed += Math.max(-step * 1.6, Math.min(step, tgt - cart.speed));
    this.yaw -= steer * C.turnRate * dt * Math.max(-1, Math.min(1, cart.speed / 4));
    const dx = Math.sin(this.yaw) * cart.speed * dt, dz = Math.cos(this.yaw) * cart.speed * dt;
    const before = this.position.clone();
    this.move(dx, dz, C.radius);
    const moved = this.position.distanceTo(before);
    if (moved < Math.hypot(dx, dz) * 0.5) cart.speed *= -0.25; // bump
    this.position.y = this.space.groundY(this.position.x, this.position.z);
    this.speed = Math.abs(cart.speed);
    cart.root.position.copy(this.position); cart.root.rotation.y = this.yaw;
    cart.animate(dt, steer);
    // rider in the vehicle's seat (vehicle-local x right, z forward)
    const s = cart.seat, cx = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    this.avatar.root.position.set(this.position.x + cx * s.x + sn * s.z, this.position.y + s.y, this.position.z - sn * s.x + cx * s.z);
    this.avatar.root.rotation.y = this.yaw;
    this.avatar.root.visible = !cart.hideRider;
    if (cart.pose === 'bike') this.avatar.pedal(cart.speed);
    else if (cart.pose === 'stand') this.avatar.scoot(cart.speed);
  }

  private move(dx: number, dz: number, r: number) {
    const free = this.noclip || this.aboveRoofs();
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.3) || 1;
    for (let s = 0; s < steps; s++) {
      const nx = this.position.x + dx / steps;
      if (free || !this.space.blocked(nx, this.position.z, r)) this.position.x = nx;
      const nz = this.position.z + dz / steps;
      if (free || !this.space.blocked(this.position.x, nz, r)) this.position.z = nz;
    }
  }
  private sync() { this.avatar.root.position.copy(this.position); this.avatar.root.rotation.y = this.yaw; }
}

