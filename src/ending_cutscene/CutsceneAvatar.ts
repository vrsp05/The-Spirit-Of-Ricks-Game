// Preserve the approved ceremony and presenter likenesses independently of
// gameplay avatars, whose wardrobes and joint animations continue to evolve.
import * as THREE from 'three';
import { textCanvas } from '../world/World';

export interface AvatarLook {
  shirt: string; pants: string; skin: string; hair: string;
  shoes?: string; tie?: string; jacket?: string; mouth?: boolean;
  hairStyle?: 'short' | 'cropped' | 'long' | 'bald' | 'quiff' | 'textured' | 'curly'; skirt?: string;
  glasses?: 'dark' | 'gold'; beard?: boolean; shortSleeves?: boolean; emblem?: 'floppy';
  expression?: 'happy';
}

export class CutsceneAvatar {
  readonly root = new THREE.Group();
  private legL: THREE.Object3D; private legR: THREE.Object3D;
  private armL: THREE.Object3D; private armR: THREE.Object3D;
  private phase = 0;
  private label?: THREE.Sprite;
  private headPivot = new THREE.Group();
  private mouth!: THREE.Mesh;
  private talkT = 0;
  talking = false;

  constructor(look: AvatarLook, scale = 1) {
    const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c });
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
    if (look.skirt) { const skirt = box(0.70, 0.62, 0.40, look.skirt); skirt.position.y = 0.66; body.add(skirt); }
    if (look.jacket) { const shirt = box(0.2, 0.6, 0.02, look.shirt); shirt.position.set(0, 1.2, 0.18); body.add(shirt); }
    if (look.tie) { const tie = box(0.08, 0.45, 0.03, look.tie); tie.position.set(0, 1.22, 0.19); body.add(tie); }
    this.armL = limb(0.2, 0.7, look.shortSleeves ? look.skin : look.jacket ?? look.shirt, -0.42, 1.5);
    this.armR = limb(0.2, 0.7, look.shortSleeves ? look.skin : look.jacket ?? look.shirt, 0.42, 1.5);
    for (const a of [this.armL, this.armR]) {
      const hand = box(0.18, 0.16, 0.18, look.skin); hand.position.y = -0.76; a.add(hand);
      if (look.shortSleeves) { const sleeve = box(.23, .29, .25, look.shirt); sleeve.position.y = -.13; a.add(sleeve); }
    }
    if (look.emblem === 'floppy') {
      const emblem = new THREE.Group(); emblem.name = 'left-chest-floppy'; emblem.position.set(.16, 1.32, .182);
      // Front faces +Z: the wearer's left chest is +X (viewer-right).
      const disk = box(.15, .165, .015, '#10151b'); emblem.add(disk);
      const shutter = box(.095, .035, .019, '#ccd5dc'); shutter.position.set(-.006, .052, .004); emblem.add(shutter);
      const label = box(.10, .055, .019, '#e6edf0'); label.position.set(0, -.035, .004); emblem.add(label);
      const notch = box(.025, .025, .021, look.shirt); notch.position.set(.063, .07, .005); emblem.add(notch);
      body.add(emblem);
    }
    this.headPivot.position.y = 1.78; body.add(this.headPivot);
    const head = box(0.48, 0.48, 0.46, look.skin); this.headPivot.add(head);
    const hairBlock = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = box(w, h, d, look.hair); m.position.set(x, y, z); this.headPivot.add(m); return m;
    };
    if (look.hairStyle === 'bald') {
      // Bare crown with just a little hair at the sides and back.
      for (const x of [-0.245, 0.245]) hairBlock(0.025, 0.12, 0.30, x, 0.02, -0.06);
      hairBlock(0.47, 0.10, 0.035, 0, 0.01, -0.235);
      if (!look.expression) for (const x of [-0.11, 0.11]) hairBlock(0.09, 0.025, 0.025, x, 0.09, 0.24);
    } else if (look.hairStyle === 'cropped') {
      // Short, side-parted crop with stepped fringe and clear cheeks.
      hairBlock(0.53, 0.15, 0.50, 0, 0.245, 0);
      hairBlock(0.52, 0.26, 0.11, 0, 0.08, -0.225);
      for (const x of [-0.25, 0.25]) hairBlock(0.06, 0.20, 0.32, x, 0.06, -0.02);
      hairBlock(0.24, 0.10, 0.055, -0.13, 0.15, 0.23);
      hairBlock(0.18, 0.065, 0.055, 0.08, 0.18, 0.23);
    } else if (look.hairStyle === 'long') {
      hairBlock(0.54, 0.16, 0.52, 0, 0.26, 0);
      hairBlock(0.56, 0.70, 0.13, 0, -0.10, -0.24);
      for (const x of [-0.265, 0.265]) hairBlock(0.12, 0.65, 0.40, x, -0.11, -0.02);
      hairBlock(0.26, 0.10, 0.06, -0.12, 0.16, 0.235);
      hairBlock(0.12, 0.065, 0.06, 0.08, 0.19, 0.235);
    } else if (look.hairStyle === 'quiff' || look.hairStyle === 'textured' || look.hairStyle === 'curly') {
      hairBlock(.53, .15, .50, 0, .25, 0);
      hairBlock(.53, .28, .11, 0, .08, -.225);
      for (const x of [-.25, .25]) hairBlock(.07, .19, .32, x, .08, -.035);
      if (look.hairStyle === 'quiff') {
        hairBlock(.40, .16, .31, -.045, .37, .06);
        hairBlock(.23, .10, .25, -.10, .48, .045);
        hairBlock(.16, .09, .12, .17, .33, .18);
      } else {
        for (let i = 0; i < 9; i++) {
          const x = (i % 3 - 1) * .175, z = (Math.floor(i / 3) - 1) * .16;
          const h = look.hairStyle === 'curly' ? .20 + (i % 2) * .06 : .09 + (i % 3) * .035;
          hairBlock(.18, h, .18, x, .32 + h / 2, z);
        }
        if (look.hairStyle === 'textured') for (const x of [-.17, 0, .17]) hairBlock(.11, .075, .055, x, .15, .235);
      }
    } else {
      hairBlock(0.52, 0.16, 0.5, 0, 0.28, 0);
      hairBlock(0.52, 0.3, 0.1, 0, 0.12, -0.22);
    }
    for (const x of [-0.11, 0.11]) { const eye = box(0.07, look.expression ? .05 : .07, 0.02, '#1d1d1d'); eye.position.set(x, .06, 0.235); this.headPivot.add(eye); }
    if (look.glasses) {
      const frames = new THREE.Group(); frames.name = `${look.glasses}-glasses`; this.headPivot.add(frames);
      const color = look.glasses === 'gold' ? '#bca578' : '#222936';
      const rim = (w: number, h: number, d: number, x: number, y: number, z = .26) => {
        const m = box(w, h, d, color); m.position.set(x, y, z); frames.add(m);
      };
      for (const x of [-.12, .12]) {
        for (const y of [-.048, .092]) rim(.19, .018, .023, x, y);
        for (const side of [-.095, .095]) rim(.018, .14, .023, x + side, .022);
      }
      rim(.055, .018, .025, 0, .036);
      for (const x of [-.25, .25]) rim(.018, .02, .26, x, .05, .13);
    }
    if (look.beard) {
      const beard = new THREE.Group(); beard.name = 'voxel-beard'; this.headPivot.add(beard);
      for (const x of [-.205, .205]) { const side = box(.065, .20, .035, look.hair); side.position.set(x, -.09, .235); beard.add(side); }
      const chin = box(.39, .105, .035, look.hair); chin.position.set(0, -.19, .24); beard.add(chin);
      const moustache = box(.21, .035, .035, look.hair); moustache.position.set(0, -.085, .25); beard.add(moustache);
    }
    this.mouth = box(look.expression ? .20 : .16, .035, .02, '#5a2a24');
    this.mouth.name = 'voxel-mouth'; this.mouth.position.set(0, -.12, look.beard ? .265 : .24);
    this.headPivot.add(this.mouth); this.mouthOpen(0);
    if (look.expression === 'happy') {
      const smile = new THREE.Group(); smile.name = 'voxel-smile'; smile.position.set(0, -.12, look.beard ? .285 : .26); this.headPivot.add(smile);
      const piece = (w: number, h: number, x: number, y: number, color: string) => {
        const m = box(w, h, .018, color); m.position.set(x, y, 0); smile.add(m);
      };
      piece(.20, .025, 0, -.022, '#5a2a24');
      for (const x of [-.115, .115]) piece(.035, .065, x, .008, '#5a2a24');
      piece(.17, .022, 0, .009, '#fff6df');
      for (const x of [-.11, .11]) { const brow = box(.10, .02, .02, look.hair); brow.position.set(x, .155, .24); this.headPivot.add(brow); }
    }
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
  /** Preserve ordinary dialogue mouths from the updated game. */
  updateMouth(dt: number) {
    if (this.talking) { this.talkT += dt; const o = Math.abs(Math.sin(this.talkT * 13)) * (.6 + .4 * Math.sin(this.talkT * 3.1)); this.mouth.scale.y = 1 + o * 3.2; }
    else if (this.mouth.scale.y !== 1) this.mouth.scale.y += (1 - this.mouth.scale.y) * Math.min(1, dt * 15);
  }
  /** Seated pose (driving): legs forward, arms reaching to the wheel. */
  sit(on: boolean) {
    this.seated = on;
    this.legL.rotation.x = this.legR.rotation.x = on ? -Math.PI / 2 : 0;
    this.armL.rotation.x = this.armR.rotation.x = on ? -0.9 : 0;
  }
  seated = false;
  private pedalT = 0;
  pedal(speed: number) {
    this.seated = true; this.pedalT += speed * .05;
    this.legL.rotation.x = -.9 + Math.sin(this.pedalT) * .5; this.legR.rotation.x = -.9 - Math.sin(this.pedalT) * .5;
    this.armL.rotation.x = this.armR.rotation.x = -1.1;
  }
  wave(t: number) { this.armR.rotation.x = -2.6 + Math.sin(t * 8) * 0.3; this.armR.rotation.z = 0.2; }

  /** Cinematic phone gesture, blended from 0 (rest) to 1 (receiver at ear). */
  phonePose(amount: number, glance = 0) {
    this.armR.rotation.set(-2.2 * amount, 0, 0.1 * amount);
    this.armR.scale.y = 1 - 0.25 * amount;
    this.headPivot.rotation.set(0, glance, 0);
  }

  /** A small rectangular mouth, with stepped open/closed shapes like the eyes. */
  mouthOpen(amount: number) {
    const open = Math.round(THREE.MathUtils.clamp(amount, 0, 1) * 3) / 3;
    this.mouth.scale.set(1 - open * .25, 1 + open * 2.2, 1);
  }

  /** Simple shared poses for placing letters, holding a torch and cheering. */
  poseArms(right: number, left = 0, rightZ = 0, leftZ = 0) {
    this.armR.rotation.set(right, 0, rightZ); this.armL.rotation.set(left, 0, leftZ);
    this.armR.scale.y = this.armL.scale.y = 1;
  }
  attachToRightHand(object: THREE.Object3D) {
    object.position.set(0, -0.76, 0); this.armR.add(object);
  }
  cinematicWalk(distance: number, strength = 1) {
    const step = Math.sin(distance * 5.5) * .48 * strength;
    this.legL.rotation.x = step; this.legR.rotation.x = -step;
    this.armL.rotation.set(-step * .7, 0, 0); this.armR.rotation.set(step * .7, 0, 0);
    this.armL.scale.y = this.armR.scale.y = 1;
  }
  knockPose(raised: number, contact: number) {
    this.cinematicWalk(0);
    this.armR.rotation.set((-1.3 - contact * .25) * raised, 0, .08 * raised);
    this.armR.scale.y = 1 + contact * .035;
  }
  cheer(t: number, amount = 1) {
    this.poseArms((-2.65 + Math.sin(t * 6) * .20) * amount, (-2.55 - Math.sin(t * 6 + .8) * .20) * amount, .32 * amount, -.32 * amount);
  }
}

/** Floating, always-readable text label. */
export function makeLabel(text: string, sub?: string): THREE.Sprite {
  const c = textCanvas(sub ? [text, sub] : [text], { w: 512, h: sub ? 128 : 80, bg: 'rgba(30,24,20,0.72)', font: 'bold 34px sans-serif' });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.6, 2.6 * c.height / c.width, 1); sp.renderOrder = 10;
  return sp;
}
