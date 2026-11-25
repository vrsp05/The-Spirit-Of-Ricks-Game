import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { ActionState } from '../input/actions';
import { Avatar } from './Avatar';
import { CAMPUS } from '../world/campusData';
import { isAircraft, isRide, PARAMS, type Vehicle } from './Vehicle';

/** Where the player currently is (exterior campus or an interior). */
export interface Space {
  id: string;
  blocked(x: number, z: number, r: number): boolean;
  /** Buildings only (not props, people or traffic); aircraft use this. */
  solid?(x: number, z: number, r: number): boolean;
  groundY(x: number, z: number): number;
  /** Absolute height of solid geometry at x,z (for camera occlusion); 0/undefined = open. */
  occluderTop?(x: number, z: number): number;
  interior: boolean;
}

export class PlayerController {
  readonly avatar = new Avatar({ shirt: '#f2efe6', pants: '#3a4252', skin: '#e2b893', hair: '#4a3324', tie: '#3b5b8c' });
  readonly position = new THREE.Vector3();
  yaw = 0;              // facing, radians (0 = +z/south)
  speed = 0;
  /** Cheat code "jetpack": hold jump to fly. */
  jetpack = false;
  private thrust = false;
  get thrusting() { return this.thrust; }
  /** Cheat codes ("superpowers"): ×3 speed, giant jumps, walking on your hands. */
  superSpeed = false;
  superJump = false;
  private handsDown = false;
  get handstand() { return this.handsDown; }
  setHandstand(on: boolean) { this.handsDown = on; this.avatar.setHandstand(on); }
  /** Lying on a bed (sleeping): the avatar lies at this spot until cleared. */
  lying: { x: number; y: number; z: number; yaw: number } | null = null;
  /** A short animation layered on top of the pose each frame (eating, …). */
  emote: ((dt: number) => void) | null = null;
  /** Can fly or jump over the rooftops (jetpack, super jump, aircraft). */
  private get airborneKit() { return this.jetpack || this.superJump || (!!this.vehicle && isAircraft(this.vehicle.kind)); }
  /** Rooftop height under (x,z) (absolute; 0 = open ground). Exterior only. */
  private roofTop(x: number, z: number) { return this.space.interior ? 0 : this.space.occluderTop?.(x, z) ?? 0; }
  /** What you stand on at (x,z): the roof once you're up there (jetpack, super jump, aircraft), else the ground. */
  private floorAt(x: number, z: number) {
    const gy = this.space.groundY(x, z); if (!this.airborneKit) return gy;
    const top = this.roofTop(x, z); return top > 0 && this.position.y >= top - 1.25 ? Math.max(gy, top) : gy;
  }
  /** Up in the air with a flying kit, walls only block where they rise above you (1.2 m step-up onto roofs). */
  private solidAt(x: number, z: number, r: number) {
    if (this.airborneKit && !this.space.interior && this.position.y > this.space.groundY(x, z) + 1.5) {
      const y = this.position.y + 1.2;
      return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([ox, oz]) => this.roofTop(x + ox, z + oz) > y);
    }
    if (this.vehicle && isAircraft(this.vehicle.kind)) return this.space.solid?.(x, z, r) ?? this.space.blocked(x, z, r);
    return this.space.blocked(x, z, r);
  }
  /** Aircraft: descend by itself until it touches down (E / A while flying — works on any controller). */
  autoLand = false;
  /** Horizontal velocity while flying the helicopter. */
  private hv = new THREE.Vector2();
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
    if (this.vehicle) { if (isAircraft(this.vehicle.kind)) this.fly(dt, input, cameraYaw, enabled); else this.drive(dt, input, enabled); return; }
    if (this.lying) { const l = this.lying; this.avatar.root.position.set(l.x, l.y, l.z); this.avatar.root.rotation.y = l.yaw; this.avatar.animate(dt, 0); this.emote?.(dt); return; }
    if (this.seated) { this.avatar.root.position.set(this.position.x, this.position.y - 0.25, this.position.z); this.avatar.root.rotation.y = this.yaw; return; }
    let mx = 0, my = 0;
    if (enabled) { mx = input.axes.moveX; my = input.axes.moveY; }
    const mag = Math.min(1, Math.hypot(mx, my));
    const P = GAME_CONFIG.player;
    const base = this.handsDown ? P.walkSpeed * 0.55 : input.running ? P.runSpeed : P.walkSpeed;
    const target = mag > 0.05 ? base * mag * (this.noclip ? 3 : 1) * (this.superSpeed ? 3 : 1) : 0;
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
    // up on a roof you stand on the roof (no landing inside walls)
    const gy = this.floorAt(this.position.x, this.position.z);
    // walked off a roof: fall instead of snapping to the ground
    if (this.airborneKit && this.grounded && this.position.y - gy > 1) this.grounded = false;
    this.thrust = this.jetpack && enabled && input.isDown('jump');
    if (enabled && this.grounded && !this.handsDown && input.pressed('jump')) { this.vy = this.superJump && !this.space.interior ? 24 : P.jumpSpeed; this.grounded = false; }
    if (this.thrust) { this.grounded = false; this.vy = Math.min(7, this.vy + 22 * dt); }
    if (!this.grounded) {
      this.vy -= P.gravity * (this.jetpack ? 0.35 : this.superJump ? 0.5 : 1) * dt; if (this.jetpack) this.vy = Math.max(this.vy, -4);
      this.position.y = Math.min(this.position.y + this.vy * dt, gy + 90);
      if (this.position.y <= gy) { this.position.y = gy; this.vy = 0; this.grounded = true; }
    } else {
      this.position.y += (gy - this.position.y) * Math.min(1, dt * 20);
    }
    this.avatar.animate(dt, this.grounded ? this.speed : 0);
    this.avatar.jetFlame(this.thrust ? 1 : !this.grounded && this.jetpack ? 0.35 : 0);
    this.sync();
    this.emote?.(dt);
  }

  /** Push the player (wind), with collisions. */
  nudge(dx: number, dz: number) { if (!this.vehicle && !this.seated && !this.lying) { this.move(dx, dz, GAME_CONFIG.player.radius); this.sync(); } }
  /** Height above the ground or roof below (0 = landed). */
  altitude() { return this.position.y - this.floorAt(this.position.x, this.position.z); }

  /**
   * Helicopter: the stick flies (camera-relative, like walking), hold jump to climb, F / L to descend, run = faster.
   * Plane: W/S throttle, A/D turn, hold jump to climb (from 16 m/s), F / L to dive; it stays airborne while fast enough.
   */
  private fly(dt: number, input: ActionState, cameraYaw: number, enabled: boolean) {
    const v = this.vehicle!, C = PARAMS[v.kind];
    const up = enabled && input.isDown('jump'), boost = enabled && input.running;
    if (up) this.autoLand = false;
    const down = (enabled && input.isDown('alt2')) || this.autoLand;
    const mx = enabled ? input.axes.moveX : 0, my = enabled ? input.axes.moveY : 0;
    const alt = this.altitude(), landed = alt < 0.05;
    let pitch = 0, bank = 0, power = 1;
    if (v.kind === 'heli') {
      const mag = Math.min(1, Math.hypot(mx, my)), max = boost ? 34 : C.maxSpeed;
      let tx = 0, tz = 0;
      if (mag > 0.05 && !landed) {
        const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw), dx = (fx * my - fz * mx) / mag, dz = (fz * my + fx * mx) / mag;
        tx = dx * max * mag; tz = dz * max * mag;
        let d = Math.atan2(dx, dz) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * C.turnRate);
      }
      this.hv.x += (tx - this.hv.x) * Math.min(1, dt * C.accel); this.hv.y += (tz - this.hv.y) * Math.min(1, dt * C.accel);
      const vyT = up ? 9 : down ? -7 : 0; this.vy += (vyT - this.vy) * Math.min(1, dt * 3);
      if (landed && this.vy < 0) this.vy = 0;
      // nose dips into forward flight, rolls into sideways drift
      const fwd = this.hv.x * Math.sin(this.yaw) + this.hv.y * Math.cos(this.yaw), side = this.hv.x * Math.cos(this.yaw) - this.hv.y * Math.sin(this.yaw);
      pitch = Math.max(-0.35, Math.min(0.35, fwd * 0.012)); bank = Math.max(-0.3, Math.min(0.3, side * 0.012));
      v.speed = Math.hypot(this.hv.x, this.hv.y);
    } else {
      const max = boost ? 60 : C.maxSpeed;
      if (my > 0.05) v.speed = Math.min(max, v.speed + C.accel * my * dt);
      else if (my < -0.05) v.speed = Math.max(landed ? -3 : 0, v.speed + C.accel * 1.4 * my * dt);   // on the ground: brake, then taxi backwards
      else if (landed) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 3 * dt);    // rolling friction on the ground
      else if (v.speed > max) v.speed = Math.max(max, v.speed - 6 * dt);
      const flying = v.speed >= 16;
      this.yaw -= mx * (landed ? 1.2 : C.turnRate) * dt;                          // taxiing turns even when stopped
      const vyT = flying && up ? 8 : !landed && down ? -9 : !landed && !flying ? -6 : 0;
      this.vy += (vyT - this.vy) * Math.min(1, dt * 2.5);
      if (landed && this.vy < 0) this.vy = 0;
      this.hv.set(Math.sin(this.yaw) * v.speed, Math.cos(this.yaw) * v.speed);
      pitch = landed ? 0 : -this.vy * 0.035; bank = landed ? 0 : mx * 0.55;
      power = Math.max(0.35, Math.min(1, v.speed / 30 + Math.max(0, my)));
    }
    // move: building collision only below roof height; a plane that hits a wall loses its speed
    const before = this.position.clone(), dx = this.hv.x * dt, dz = this.hv.y * dt;
    this.move(dx, dz, C.radius);
    if (this.position.distanceTo(before) < Math.hypot(dx, dz) * 0.5 && Math.abs(v.speed) > 3) { v.speed *= 0.3; this.hv.multiplyScalar(0.3); }
    const B = CAMPUS.bounds;
    this.position.x = Math.max(B.minX + 9, Math.min(B.maxX - 9, this.position.x));
    this.position.z = Math.max(B.minZ + 9, Math.min(B.maxZ - 9, this.position.z));
    this.position.y = Math.min(this.position.y + this.vy * dt, this.space.groundY(this.position.x, this.position.z) + 160);
    const floor = this.floorAt(this.position.x, this.position.z); if (this.position.y < floor) { this.position.y = floor; this.vy = Math.max(0, this.vy); }
    this.speed = v.speed; this.grounded = this.altitude() < 0.05;
    if (this.grounded && this.position.y - this.space.groundY(this.position.x, this.position.z) < 0.6) this.autoLand = false;
    v.root.position.copy(this.position); v.root.rotation.y = this.yaw;
    v.fly(dt, power, pitch, bank);
    this.seatRider(v);
  }
  private seatRider(cart: Vehicle) {
    const s = cart.seat, cx = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    this.avatar.root.position.set(this.position.x + cx * s.x + sn * s.z, this.position.y + s.y, this.position.z - sn * s.x + cx * s.z);
    this.avatar.root.rotation.y = this.yaw;
    this.avatar.root.visible = !cart.hideRider;
  }

  /** Longboard: height of the current ollie above the ground, and events for campus life. */
  private hop = 0; private hopV = 0; private air = 0; private rideT = 0;
  /** Called when a longboard ollie lands (airtime in seconds). */
  onOllie: ((airtime: number) => void) | null = null;
  /** Golf cart: W/S throttle & brake/reverse, A/D steer (relative to the cart). */
  private drive(dt: number, input: ActionState, enabled: boolean) {
    const cart = this.vehicle!, C = PARAMS[cart.kind];
    const throttle = enabled ? input.axes.moveY : 0, steer = enabled ? input.axes.moveX : 0;
    const max = throttle >= 0 ? C.maxSpeed : -C.reverseSpeed;
    const tgt = Math.abs(throttle) > 0.05 ? max * Math.abs(throttle) : 0, step = C.accel * dt;
    if (isRide(cart.kind)) {
      // gravity along the slope: downhill speeds you up (the sled mostly runs on hills), uphill slows you down
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), g0 = this.space.groundY(this.position.x, this.position.z);
      const slope = (this.space.groundY(this.position.x + fx, this.position.z + fz) - g0);
      const fric = cart.kind === 'sled' ? 0.9 : 0.35, top = cart.kind === 'sled' ? 16 : 15;
      const push = Math.abs(throttle) > 0.05 && Math.abs(cart.speed) < max * Math.abs(throttle) ? Math.sign(throttle) * C.accel : 0;
      cart.speed += (-9.8 * slope * 0.9 + push - Math.sign(cart.speed) * fric) * dt;
      if (throttle < -0.05 && cart.speed > 0) cart.speed = Math.max(0, cart.speed - C.accel * 1.8 * dt);   // brake (foot down)
      if (Math.abs(cart.speed) < 0.05 && !push) cart.speed = 0;
      cart.speed = Math.max(-C.reverseSpeed - 2, Math.min(top, cart.speed));
      // ollie (longboard): jump to hop; land it for style points
      if (cart.kind === 'board') {
        if (enabled && this.hop <= 0 && input.pressed('jump')) { this.hopV = 4.6; this.hop = 0.001; this.air = 0; }
        if (this.hop > 0) { this.air += dt; this.hopV -= 14 * dt; this.hop += this.hopV * dt; if (this.hop <= 0) { this.hop = 0; this.onOllie?.(this.air); } }
      }
    } else
    cart.speed += Math.max(-step * 1.6, Math.min(step, tgt - cart.speed));
    this.yaw -= steer * C.turnRate * dt * Math.max(-1, Math.min(1, cart.speed / 4));
    const dx = Math.sin(this.yaw) * cart.speed * dt, dz = Math.cos(this.yaw) * cart.speed * dt;
    const before = this.position.clone();
    this.move(dx, dz, C.radius);
    const moved = this.position.distanceTo(before);
    if (moved < Math.hypot(dx, dz) * 0.5) cart.speed *= -0.25; // bump
    this.position.y = this.space.groundY(this.position.x, this.position.z) + (isRide(cart.kind) ? this.hop : 0);
    this.speed = Math.abs(cart.speed);
    cart.root.position.copy(this.position); cart.root.rotation.y = this.yaw;
    cart.animate(dt, steer);
    // rider in the vehicle's seat (vehicle-local x right, z forward)
    this.seatRider(cart);
    if (cart.pose === 'bike') this.avatar.pedal(cart.speed);
    else if (cart.kind === 'board') { this.rideT += dt; this.avatar.boardPose(this.rideT, steer); this.avatar.root.rotation.y = this.yaw + Math.PI / 2; }
    else if (cart.pose === 'stand') this.avatar.scoot(cart.speed);
    if (cart.kind === 'board') cart.body.rotation.x = this.hop > 0 ? -Math.min(0.35, this.hopV * 0.08) : 0;
  }

  private move(dx: number, dz: number, r: number) {
    const free = this.noclip;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.3) || 1;
    for (let s = 0; s < steps; s++) {
      const nx = this.position.x + dx / steps;
      if (free || !this.solidAt(nx, this.position.z, r)) this.position.x = nx;
      const nz = this.position.z + dz / steps;
      if (free || !this.solidAt(this.position.x, nz, r)) this.position.z = nz;
    }
  }
  private sync() { this.avatar.root.position.copy(this.position); this.avatar.root.rotation.y = this.yaw; }
}

