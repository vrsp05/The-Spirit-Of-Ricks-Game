// Small voxel humanoid used for the player, NPCs and the finale team avatars.
// Likenesses are generic and replaceable (colours + label only).
import * as THREE from 'three';
import { textCanvas } from '../world/World';

export interface AvatarLook { shirt: string; pants: string; skin: string; hair: string; shoes?: string; tie?: string; jacket?: string }

export class Avatar {
  readonly root = new THREE.Group();
  private legL: THREE.Object3D; private legR: THREE.Object3D;
  private armL: THREE.Object3D; private armR: THREE.Object3D;
  private phase = 0;
  private label?: THREE.Sprite;

  constructor(look: AvatarLook, scale = 1) {
    const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w: number, h: number, d: number, c: string) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.castShadow = true; return m; };
    const body = new THREE.Group(); body.scale.setScalar(scale); this.root.add(body);
    const limb = (w: number, h: number, c: string, x: number, y: number, footC?: string) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
      const m = box(w, h, w, c); m.position.y = -h / 2; pivot.add(m);
      if (footC) { const f = box(w, 0.12, w * 1.3, footC); f.position.set(0, -h + 0.06, 0.05); pivot.add(f); }
      body.add(pivot); return pivot;
    };
    this.legL = limb(0.26, 0.8, look.pants, -0.15, 0.8, look.shoes ?? '#2a221c');
    this.legR = limb(0.26, 0.8, look.pants, 0.15, 0.8, look.shoes ?? '#2a221c');
    const torso = box(0.62, 0.72, 0.34, look.jacket ?? look.shirt); torso.position.y = 1.16; body.add(torso);
    if (look.jacket) { const shirt = box(0.2, 0.6, 0.02, look.shirt); shirt.position.set(0, 1.2, 0.18); body.add(shirt); }
    if (look.tie) { const tie = box(0.08, 0.45, 0.03, look.tie); tie.position.set(0, 1.22, 0.19); body.add(tie); }
    this.armL = limb(0.2, 0.7, look.jacket ?? look.shirt, -0.42, 1.5);
    this.armR = limb(0.2, 0.7, look.jacket ?? look.shirt, 0.42, 1.5);
    for (const a of [this.armL, this.armR]) { const hand = box(0.18, 0.16, 0.18, look.skin); hand.position.y = -0.76; a.add(hand); }
    const head = box(0.48, 0.48, 0.46, look.skin); head.position.y = 1.78; body.add(head);
    const hair = box(0.52, 0.16, 0.5, look.hair); hair.position.y = 2.06; body.add(hair);
    const back = box(0.52, 0.3, 0.1, look.hair); back.position.set(0, 1.9, -0.22); body.add(back);
    for (const x of [-0.11, 0.11]) { const eye = box(0.07, 0.07, 0.02, '#1d1d1d'); eye.position.set(x, 1.8, 0.235); body.add(eye); }
  }

  setLabel(text: string, sub?: string, height = 3.0) {
    if (this.label) this.root.remove(this.label);
    this.label = makeLabel(text, sub); this.label.position.y = height;
    this.root.add(this.label);
  }

  /** speed in m/s drives the walk cycle. */
  animate(dt: number, speed: number) {
    if (this.seated) return;
    if (speed > 0.1) this.phase += dt * (4 + speed * 1.1); else this.phase *= 0.85;
    const a = Math.sin(this.phase) * Math.min(0.9, speed * 0.16 + (speed > 0.1 ? 0.25 : 0));
    this.legL.rotation.x = a; this.legR.rotation.x = -a; this.armL.rotation.x = -a * 0.8; this.armR.rotation.x = a * 0.8;
  }
  /** Seated pose (driving): legs forward, arms reaching to the wheel. */
  sit(on: boolean) {
    this.seated = on;
    this.legL.rotation.x = this.legR.rotation.x = on ? -Math.PI / 2 : 0;
    this.armL.rotation.x = this.armR.rotation.x = on ? -0.9 : 0;
  }
  seated = false;
  wave(t: number) { this.armR.rotation.x = -2.6 + Math.sin(t * 8) * 0.3; this.armR.rotation.z = 0.2; }
}

/** Floating, always-readable text label. */
export function makeLabel(text: string, sub?: string): THREE.Sprite {
  const c = textCanvas(sub ? [text, sub] : [text], { w: 512, h: sub ? 128 : 80, bg: 'rgba(30,24,20,0.72)', font: 'bold 34px sans-serif' });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.6, 2.6 * c.height / c.width, 1); sp.renderOrder = 10;
  return sp;
}
