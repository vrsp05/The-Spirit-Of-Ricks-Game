import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { ActionState } from '../input/actions';
import type { Space } from './PlayerController';

/** Elevated orbiting third-person camera with occlusion pull-in. */
export class CameraRig {
  yaw = Math.PI;                 // camera sits at target + (sin(yaw), ., cos(yaw)) * dist
  pitch = GAME_CONFIG.camera.pitch;
  distance = GAME_CONFIG.camera.distance;
  private current = GAME_CONFIG.camera.distance;
  private target = new THREE.Vector3();
  /** Swing behind the player automatically (used while driving). */
  follow = false;
  private pitchBoost = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  reset(behindYaw: number) { this.yaw = behindYaw + Math.PI; this.pitch = GAME_CONFIG.camera.pitch; this.distance = GAME_CONFIG.camera.distance; }
  snap(target: THREE.Vector3) { this.target.copy(target); this.current = this.distance; }

  update(dt: number, input: ActionState | null, follow: THREE.Vector3, space: Space, playerYaw: number) {
    const C = GAME_CONFIG.camera;
    if (input) {
      this.yaw += input.lookDelta.x + input.axes.lookX * GAME_CONFIG.input.lookSpeed * dt;
      this.pitch += input.lookDelta.y + -input.axes.lookY * GAME_CONFIG.input.lookSpeed * 0.6 * dt;
      this.distance *= 1 + input.zoomDelta * 0.1;
      if (input.pressed('cameraReset')) this.reset(playerYaw);
      const looking = input.lookDelta.x !== 0 || input.lookDelta.y !== 0 || input.axes.lookX !== 0 || input.axes.lookY !== 0;
      if (this.follow && !looking) {
        let d = playerYaw + Math.PI - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 2.5);
      }
    }
    const minPitch = space.interior ? C.interiorMinPitch : C.minPitch;
    const maxDist = space.interior ? C.interiorMaxDistance : C.maxDistance;
    this.pitch = Math.max(minPitch, Math.min(C.maxPitch, this.pitch));
    this.distance = Math.max(C.minDistance, Math.min(maxDist, this.distance));
    this.target.lerp(new THREE.Vector3(follow.x, follow.y + 1.6, follow.z), Math.min(1, dt * 12));

    // occlusion: first try tilting up to see over buildings, then pull in
    const clearDist = (pitch: number) => {
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
      for (let d = 1; d <= this.distance; d += 0.5) {
        const p = this.target.clone().addScaledVector(dir, d);
        const solid = space.occluderTop?.(p.x, p.z) ?? 0;
        if ((solid > 0 && p.y < solid + 0.3) || p.y < space.groundY(p.x, p.z) + 0.4) return Math.max(1.5, d - 0.8);
      }
      return this.distance;
    };
    let boost = 0, allowed = clearDist(this.pitch);
    if (allowed < this.distance * 0.7 && !space.interior) {
      for (const extra of [0.12, 0.24, 0.36]) {
        const p2 = Math.min(C.maxPitch, this.pitch + extra), a2 = clearDist(p2);
        if (a2 > allowed) { allowed = a2; boost = p2 - this.pitch; }
        if (a2 >= this.distance * 0.9) break;
      }
    }
    this.pitchBoost += (boost - this.pitchBoost) * Math.min(1, dt * 4);
    const pitch = this.pitch + this.pitchBoost;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
    allowed = Math.min(allowed, clearDist(pitch));
    this.current += (allowed - this.current) * Math.min(1, dt * (allowed < this.current ? 20 : 4));
    this.camera.position.copy(this.target).addScaledVector(dir, this.current);
    this.camera.lookAt(this.target);
  }
}
