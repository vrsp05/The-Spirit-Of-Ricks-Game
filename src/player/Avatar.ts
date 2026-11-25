// Small voxel humanoid used for the player, NPCs and the finale team avatars.
// Likenesses are generic and replaceable (colours, hair, clothing + label only).
// Animation: knees, body bob and lean, arm swing with elbows, idle breathing,
// blinking and the odd glance around. rebuild(look) re-dresses the same character
// (NPC wardrobes change with the era).
import * as THREE from 'three';
import { textCanvas } from '../world/World';

export type HairStyle = 'short' | 'side' | 'long' | 'bun' | 'curly' | 'buzz' | 'bald';
export type Hat = 'none' | 'cap' | 'beanie';
export type Pattern = 'plain' | 'flannel' | 'stripe';
export interface AvatarLook {
  shirt: string; pants: string; skin: string; hair: string; shoes?: string; tie?: string; jacket?: string;
  hairStyle?: HairStyle; hat?: Hat; hatColor?: string; pattern?: Pattern; shorts?: boolean;
  coat?: string; scarf?: string; backpack?: string; glasses?: boolean;
}

const texCache = new Map<string, THREE.Texture>();
/** Tiny pixel textures for shirts (flannel plaid / stripes), cached per colour. */
function patternTex(kind: Pattern, base: string): THREE.Texture | null {
  if (kind === 'plain') return null;
  const key = `${kind}${base}`; const hit = texCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  if (kind === 'flannel') {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 5, 16, 3); g.fillRect(5, 0, 3, 16);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 12, 16, 1); g.fillRect(12, 0, 1, 16);
  } else { g.fillStyle = 'rgba(255,255,255,0.55)'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 2); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t); return t;
}

export class Avatar {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private legL!: THREE.Object3D; private legR!: THREE.Object3D;
  private shinL!: THREE.Object3D; private shinR!: THREE.Object3D;
  private armL!: THREE.Object3D; private armR!: THREE.Object3D;
  private foreL!: THREE.Object3D; private foreR!: THREE.Object3D;
  private eyes: THREE.Mesh[] = [];
  private mouth!: THREE.Mesh;
  private phase = 0; private spd = 0; private time = Math.random() * 10;
  private blinkT = 2 + Math.random() * 3; private lookT = 3 + Math.random() * 4; private lookYaw = 0; private lookTarget = 0;
  private label?: THREE.Sprite;
  private talkT = 0;
  talking = false;
  seated = false;
  /** Counts each time a foot lands in the walk cycle (footstep sounds follow the legs). */
  footfalls = 0;
  private lastFoot = 0;
  private scaleF: number;

  constructor(public look: AvatarLook, scale = 1) {
    this.scaleF = scale;
    this.root.add(this.body); this.body.add(this.hips);
    this.build(look);
  }

  /** Re-dress the character (keeps pose, label and position). */
  rebuild(look: AvatarLook) {
    this.look = look;
    this.propObj?.removeFromParent();
    this.hips.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    this.hips.clear(); this.eyes = []; this.jet = null; this.held = null;
    this.build(look);
    if (this.propObj) this.torso.add(this.propObj);
    if (this.seated) this.sit(true);
  }

  private build(look: AvatarLook) {
    this.body.scale.setScalar(this.scaleF);
    const mat = (c: string, map: THREE.Texture | null = null) => new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : c, map, roughness: 0.85 });
    const box = (w: number, h: number, d: number, c: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, map: THREE.Texture | null = null) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, map)); m.castShadow = true; m.position.set(x, y, z); parent.add(m); return m;
    };
    const top = look.coat ?? look.jacket ?? look.shirt;
    const topTex = !look.coat && !look.jacket ? patternTex(look.pattern ?? 'plain', look.shirt) : null;
    const shoes = look.shoes ?? '#2a221c';
    // legs: thigh pivot at the hip, shin pivot at the knee
    const leg = (x: number) => {
      const thigh = new THREE.Group(); thigh.position.set(x, 0.8, 0); this.hips.add(thigh);
      box(0.26, 0.42, 0.26, look.pants, thigh, 0, -0.21, 0);
      const shin = new THREE.Group(); shin.position.set(0, -0.4, 0); thigh.add(shin);
      box(0.25, 0.4, 0.25, look.shorts ? look.skin : look.pants, shin, 0, -0.2, 0);
      box(0.27, 0.12, 0.34, shoes, shin, 0, -0.36, 0.05);
      return { thigh, shin };
    };
    const L = leg(-0.15), R = leg(0.15);
    this.legL = L.thigh; this.shinL = L.shin; this.legR = R.thigh; this.shinR = R.shin;
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.8; this.hips.add(this.torso);
    box(0.62, 0.72, 0.34, top, this.torso, 0, 0.36, 0, topTex);
    if (look.coat) box(0.66, 0.28, 0.38, look.coat, this.torso, 0, -0.08, 0);                       // coat hem over the hips
    if (look.jacket && !look.coat) box(0.2, 0.6, 0.02, look.shirt, this.torso, 0, 0.4, 0.18);
    if (look.tie) box(0.08, 0.45, 0.03, look.tie, this.torso, 0, 0.42, 0.19);
    if (look.scarf) { box(0.5, 0.14, 0.4, look.scarf, this.torso, 0, 0.74, 0); box(0.12, 0.34, 0.05, look.scarf, this.torso, 0.14, 0.54, 0.2); }
    if (look.backpack) { box(0.48, 0.52, 0.2, look.backpack, this.torso, 0, 0.36, -0.27); box(0.07, 0.6, 0.04, '#2a2a2a', this.torso, -0.2, 0.42, 0.18); box(0.07, 0.6, 0.04, '#2a2a2a', this.torso, 0.2, 0.42, 0.18); }
    // arms: shoulder pivot + elbow pivot
    const arm = (x: number) => {
      const up = new THREE.Group(); up.position.set(x, 0.7, 0); this.torso.add(up);
      box(0.2, 0.36, 0.2, top, up, 0, -0.18, 0, topTex);
      const fore = new THREE.Group(); fore.position.set(0, -0.34, 0); up.add(fore);
      box(0.19, 0.32, 0.19, look.coat || look.jacket || !look.shorts ? top : look.skin, fore, 0, -0.16, 0, topTex);
      box(0.18, 0.16, 0.18, look.skin, fore, 0, -0.38, 0);
      return { up, fore };
    };
    const A = arm(-0.42), B = arm(0.42);
    this.armL = A.up; this.foreL = A.fore; this.armR = B.up; this.foreR = B.fore;
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.74; this.torso.add(this.head);
    box(0.48, 0.48, 0.46, look.skin, this.head, 0, 0.24, 0);
    for (const x of [-0.11, 0.11]) { const e = box(0.07, 0.07, 0.02, '#1d1d1d', this.head, x, 0.3, 0.235); this.eyes.push(e); }
    if (look.glasses) { box(0.42, 0.04, 0.02, '#222', this.head, 0, 0.32, 0.245); for (const x of [-0.11, 0.11]) box(0.13, 0.11, 0.015, '#9fc3d6', this.head, x, 0.3, 0.244); }
    // a gentle smile: centre line with the corners turned up
    this.mouth = box(0.12, 0.035, 0.02, '#5a2a24', this.head, 0, 0.115, 0.236);
    for (const sx of [-1, 1]) { const c = box(0.045, 0.035, 0.02, '#5a2a24', this.head, sx * 0.075, 0.14, 0.236); c.castShadow = false; }   // corners sit on the head, so talking only opens the centre
    this.buildHair(look, box);
  }

  private buildHair(look: AvatarLook, box: (w: number, h: number, d: number, c: string, p: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh) {
    const H = this.head, c = look.hair, st = look.hairStyle ?? 'short';
    if (st !== 'bald') {
      if (st === 'buzz') box(0.5, 0.06, 0.48, c, H, 0, 0.5, 0);
      else box(0.52, 0.14, 0.5, c, H, 0, 0.53, 0);
      if (st !== 'buzz') box(0.52, 0.3, 0.1, c, H, 0, 0.36, -0.22);                     // back
      if (st === 'side') { box(0.3, 0.1, 0.06, c, H, -0.1, 0.44, 0.23); box(0.06, 0.2, 0.46, c, H, -0.26, 0.38, 0); }
      if (st === 'short' || st === 'curly') box(0.52, 0.08, 0.06, c, H, 0, 0.46, 0.23);  // fringe
      if (st === 'curly') for (const [x, z] of [[-0.2, 0.12], [0.2, 0.12], [0, -0.15], [-0.2, -0.15], [0.2, -0.15]]) box(0.16, 0.16, 0.16, c, H, x, 0.6, z);
      if (st === 'long') { box(0.54, 0.62, 0.12, c, H, 0, 0.2, -0.22); box(0.08, 0.5, 0.4, c, H, -0.27, 0.26, -0.02); box(0.08, 0.5, 0.4, c, H, 0.27, 0.26, -0.02); }
      if (st === 'bun') { box(0.08, 0.3, 0.4, c, H, -0.26, 0.38, -0.02); box(0.08, 0.3, 0.4, c, H, 0.26, 0.38, -0.02); box(0.22, 0.22, 0.2, c, H, 0, 0.62, -0.18); }
    }
    if (look.hat === 'cap') { const hc = look.hatColor ?? '#2f4f7f'; box(0.54, 0.16, 0.52, hc, H, 0, 0.57, 0); box(0.46, 0.04, 0.24, hc, H, 0, 0.5, 0.34); }
    if (look.hat === 'beanie') { const hc = look.hatColor ?? '#8d3b2f'; box(0.54, 0.24, 0.52, hc, H, 0, 0.58, 0); box(0.56, 0.08, 0.54, '#efe9de', H, 0, 0.47, 0); box(0.12, 0.1, 0.12, '#efe9de', H, 0, 0.74, 0); }
  }

  setLabel(text: string, sub?: string, height = 3.0) {
    if (this.label) this.root.remove(this.label);
    this.label = makeLabel(text, sub); this.label.position.y = height;
    this.root.add(this.label);
  }

  /** speed in m/s drives the walk/run cycle; at rest the character breathes, blinks and glances around. */
  animate(dt: number, speed: number) {
    this.time += dt;
    this.idleFace(dt);
    if (this.seated) return;
    if (this.lying) { for (const e of this.eyes) e.scale.y = 0.15; return; }   // asleep
    if (this.handstand) { this.handWalk(dt, speed); return; }
    this.spd += (speed - this.spd) * Math.min(1, dt * 8);
    const s = this.spd, moving = s > 0.15;
    if (moving) this.phase += dt * (4.2 + s * 1.05); else this.phase *= Math.max(0, 1 - dt * 6);
    if (moving) { const k = Math.floor(this.phase / Math.PI); if (k !== this.lastFoot) { this.lastFoot = k; this.footfalls++; } }
    const amp = moving ? Math.min(0.95, 0.3 + s * 0.13) : 0;
    const sw = Math.sin(this.phase) * amp;
    this.legL.rotation.x = -sw; this.legR.rotation.x = sw;
    // knees bend as each leg swings back and lifts
    this.shinL.rotation.x = Math.max(0, Math.sin(this.phase + 1.2)) * amp * 1.3;
    this.shinR.rotation.x = Math.max(0, Math.sin(this.phase + 1.2 + Math.PI)) * amp * 1.3;
    this.armL.rotation.x = sw * 0.85; this.armR.rotation.x = -sw * 0.85; this.armL.rotation.z = this.armR.rotation.z = 0;
    this.foreL.rotation.x = this.foreR.rotation.x = -(moving ? 0.25 + amp * 0.5 : 0.08);
    // bob, lean into a run, a little hip twist; breathing when idle
    this.hips.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.05 * (0.5 + amp) : 0;
    this.body.rotation.x = moving ? Math.min(0.2, s * 0.025) : 0;
    this.torso.rotation.y = moving ? Math.sin(this.phase) * 0.08 * amp : 0;
    this.torso.scale.y = moving ? 1 : 1 + Math.sin(this.time * 2.2) * 0.012;
  }
  private idleFace(dt: number) {
    this.blinkT -= dt;
    const closed = this.blinkT < 0.12;
    for (const e of this.eyes) e.scale.y = closed ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3.5;
    this.lookT -= dt;
    if (this.lookT < 0) { this.lookTarget = this.spd > 0.2 ? 0 : (Math.random() - 0.5) * 0.9; this.lookT = 2 + Math.random() * 4; }
    this.lookYaw += (this.lookTarget - this.lookYaw) * Math.min(1, dt * 3);
    if (!this.talking) this.head.rotation.y = this.lookYaw;
  }
  /** Mouth opens and closes while this character's line is shown. */
  updateMouth(dt: number) {
    if (this.talking) { this.talkT += dt; const o = Math.abs(Math.sin(this.talkT * 13)) * (0.6 + 0.4 * Math.sin(this.talkT * 3.1)); this.mouth.scale.y = 1 + o * 3.2; this.head.rotation.y *= 0.9; this.head.rotation.x = Math.sin(this.talkT * 2.3) * 0.05; }
    else if (this.mouth.scale.y !== 1) { this.mouth.scale.y += (1 - this.mouth.scale.y) * Math.min(1, dt * 15); this.head.rotation.x *= 0.9; }
  }

  /** Seated pose (driving, benches): thighs forward, knees bent, hands forward. */
  sit(on: boolean) {
    this.seated = on;
    this.legL.rotation.x = this.legR.rotation.x = on ? -Math.PI / 2 : 0;
    this.shinL.rotation.x = this.shinR.rotation.x = on ? Math.PI / 2 : 0;
    this.armL.rotation.x = this.armR.rotation.x = on ? -0.7 : 0;
    this.foreL.rotation.x = this.foreR.rotation.x = on ? -0.5 : 0;
    this.legL.rotation.y = this.legL.rotation.z = this.legR.rotation.y = this.legR.rotation.z = 0;
    this.armL.rotation.y = this.armL.rotation.z = this.armR.rotation.y = this.armR.rotation.z = 0;
    this.hips.position.y = 0; this.body.rotation.x = 0; this.body.rotation.z = 0; this.torso.rotation.y = 0;
  }
  private pedalT = 0;
  /** Bicycle pose: legs pedal with speed (knees pumping), arms forward on the handlebar, slight lean. */
  pedal(speed: number) {
    this.seated = true; this.pedalT += speed * 0.05;
    const p = Math.sin(this.pedalT);
    this.legL.rotation.x = -1.1 + p * 0.45; this.legR.rotation.x = -1.1 - p * 0.45;
    this.shinL.rotation.x = 1.2 - p * 0.45; this.shinR.rotation.x = 1.2 + p * 0.45;
    this.armL.rotation.x = this.armR.rotation.x = -1.0; this.foreL.rotation.x = this.foreR.rotation.x = -0.3;
    this.body.rotation.x = 0.25;
  }
  /** Standing on a scooter: legs straight (one slightly back), hands on the bar, leaning into speed. */
  scoot(speed: number) {
    this.seated = true;
    this.legL.rotation.x = 0.08; this.legR.rotation.x = -0.25; this.shinL.rotation.x = 0.05; this.shinR.rotation.x = 0.25;
    this.armL.rotation.x = this.armR.rotation.x = -1.15; this.foreL.rotation.x = this.foreR.rotation.x = -0.2;
    this.hips.position.y = 0; this.body.rotation.x = Math.min(0.12, Math.abs(speed) * 0.012); this.torso.rotation.y = 0;
  }
  /** Standing sideways on a longboard: knees bent, arms out for balance (lean = −1..1 steering). */
  boardPose(t: number, lean: number) {
    this.seated = true;
    this.legL.rotation.set(0.32, 0, 0); this.legR.rotation.set(-0.32, 0, 0); this.shinL.rotation.x = 0.35; this.shinR.rotation.x = 0.35;
    this.armL.rotation.set(-0.2, 0, -1.0 - Math.sin(t * 2) * 0.12); this.armR.rotation.set(0.2, 0, 1.0 + Math.sin(t * 2.3) * 0.12);
    this.foreL.rotation.x = this.foreR.rotation.x = -0.15;
    this.hips.position.y = -0.1; this.body.rotation.x = 0; this.body.rotation.z = lean * 0.18; this.torso.rotation.y = 0;
  }
  // ---------------------------------------------------------------- handstand, sleeping, eating
  private handstand = false;
  /** Walk on your hands: the whole body flips over the hands (arms straight "up" = down to the ground). */
  setHandstand(on: boolean) {
    this.handstand = on;
    if (!on) { this.body.rotation.z = 0; this.body.position.y = 0; this.armL.rotation.set(0, 0, 0); this.armR.rotation.set(0, 0, 0); }
  }
  private handWalk(dt: number, speed: number) {
    this.spd += (speed - this.spd) * Math.min(1, dt * 8);
    const s = this.spd, moving = s > 0.15;
    if (moving) this.phase += dt * (5 + s * 1.6); else this.phase *= Math.max(0, 1 - dt * 6);
    const amp = moving ? Math.min(0.42, 0.18 + s * 0.08) : 0, sw = Math.sin(this.phase) * amp;
    const reach = 0.8, k = this.scaleF;           // shoulder → fingertips
    this.body.rotation.set(Math.sin(this.time * 2.6) * 0.035, 0, Math.PI);   // upside down, a little wobble for balance
    this.body.position.y = (1.5 + reach * Math.cos(Math.abs(sw))) * k;
    this.hips.position.y = 0; this.torso.rotation.y = 0; this.torso.scale.y = 1;
    this.armL.rotation.set(Math.PI + sw, 0, 0); this.armR.rotation.set(Math.PI - sw, 0, 0);
    this.foreL.rotation.x = this.foreR.rotation.x = 0;
    // legs up in the air, knees bent back and swaying
    this.legL.rotation.x = 0.3 + sw * 0.5; this.legR.rotation.x = -0.15 - sw * 0.5;
    this.shinL.rotation.x = 0.7 + Math.max(0, sw) * 0.4; this.shinR.rotation.x = 0.5 + Math.max(0, -sw) * 0.4;
  }
  private lying = false;
  /** Lie on your back (feet at the root, head towards the root's −z), at `height` above the root. */
  lie(on: boolean, height = 0.62) {
    this.lying = on;
    this.body.rotation.set(on ? -Math.PI / 2 : 0, 0, 0); this.body.position.y = on ? height : 0;
    this.legL.rotation.x = this.legR.rotation.x = this.shinL.rotation.x = this.shinR.rotation.x = 0;
    this.armL.rotation.set(0, 0, on ? 0.12 : 0); this.armR.rotation.set(0, 0, on ? -0.12 : 0); this.foreL.rotation.x = this.foreR.rotation.x = 0;
    this.hips.position.y = 0; this.torso.rotation.y = 0; this.torso.scale.y = 1; this.head.rotation.set(0, 0, 0);
    if (!on) for (const e of this.eyes) e.scale.y = 1;
  }
  private umbrella: THREE.Group | null = null;
  /** An open umbrella over the head (rain); null puts it away. */
  setUmbrella(color: string | null) {
    if (this.umbrella) { this.umbrella.removeFromParent(); this.umbrella = null; }
    if (!color) return;
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), new THREE.MeshStandardMaterial({ color: '#2a2a2a' })); pole.position.y = 0.55; g.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.32, 8, 1, true), m); top.position.y = 1.15; top.castShadow = true; g.add(top);
    g.position.set(0.22, 1.25, 0.08); g.rotation.z = -0.12; this.root.add(g); this.umbrella = g;
  }
  /** Something bigger carried in front (a guitar for the street musician); null removes it. */
  private propObj: THREE.Object3D | null = null;
  setProp(o: THREE.Object3D | null) { if (this.propObj) this.propObj.removeFromParent(); this.propObj = o; if (o) this.torso.add(o); }
  /** Arms forward and up (throwing, catching, playing an instrument). k = 0..1 lift, right/left arm. */
  reach(right: number, left = right) {
    this.armR.rotation.set(-1.2 - right * 1.4, 0, 0.1); this.foreR.rotation.x = -0.3;
    this.armL.rotation.set(-1.2 - left * 1.4, 0, -0.1); this.foreL.rotation.x = -0.3;
  }
  /** Bench press while lying on your back: p = 0 bar on the chest (elbows bent) … 1 arms locked out. */
  press(p: number) {
    const arm = -0.55 - p * 1.02, fore = -(1 - p) * 1.35;
    this.armL.rotation.set(arm, 0, -0.25 * (1 - p)); this.armR.rotation.set(arm, 0, 0.25 * (1 - p));
    this.foreL.rotation.x = this.foreR.rotation.x = fore;
    for (const e of this.eyes) e.scale.y = 1;                                   // awake (lie() closes the eyes)
  }
  /** Strumming a guitar held across the body. */
  strum(t: number) {
    this.armL.rotation.set(-0.9, 0, -0.5); this.foreL.rotation.x = -1.1;
    this.armR.rotation.set(-0.5 + Math.sin(t * 14) * 0.12, 0, 0.35); this.foreR.rotation.x = -1.0;
  }
  private held: THREE.Mesh | null = null;
  /** Something in the right hand (food); null drops it. */
  holdItem(color: string | null, size = 0.2) {
    if (this.held) { this.held.removeFromParent(); this.held.geometry.dispose(); (this.held.material as THREE.Material).dispose(); this.held = null; }
    if (!color) return;
    this.held = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.8, size), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    this.held.position.set(0, -0.5, 0.12); this.foreR.add(this.held);
  }
  /** Eating: the right hand goes to the mouth and back, the mouth chews; the food gets smaller (bite = 0..1). */
  eatPose(t: number, bite: number) {
    const lift = (Math.sin(t * 3.2) + 1) / 2;
    this.armR.rotation.set(-1.0 - lift * 1.2, 0, 0.25); this.foreR.rotation.x = -1.2 - lift * 0.5;
    this.mouth.scale.y = 1 + Math.abs(Math.sin(t * 11)) * 2.2 * lift;
    if (this.held) this.held.scale.setScalar(Math.max(0.15, 1 - bite));
    this.head.rotation.x = -0.08 * lift;
  }
  private jet: { group: THREE.Group; flames: THREE.Mesh[] } | null = null;
  /** Show/hide the jetpack (two tanks on the back). */
  setJetpack(on: boolean) {
    if (!on) { if (this.jet) { this.torso.remove(this.jet.group); this.jet = null; } return; }
    if (this.jet) return;
    const g = new THREE.Group(), tank = new THREE.MeshStandardMaterial({ color: '#9aa3a8', metalness: 0.7, roughness: 0.35 });
    const flameMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 2.2, transparent: true, opacity: 0.85 });
    const flames: THREE.Mesh[] = [];
    for (const x of [-0.14, 0.14]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), tank); t.position.set(x, 0.4, -0.32); t.castShadow = true; g.add(t);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), flameMat); f.rotation.x = Math.PI; f.position.set(x, -0.05, -0.32); g.add(f); flames.push(f);
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.06), tank); strap.position.set(0, 0.55, -0.22); g.add(strap);
    this.torso.add(g); this.jet = { group: g, flames };
  }
  /** Flame size 0..1 (thrusting / gliding / off). */
  jetFlame(k: number) {
    if (!this.jet) return;
    for (const f of this.jet.flames) { f.visible = k > 0.02; f.scale.set(1, (0.4 + k * 1.4) * (0.85 + Math.random() * 0.3), 1); }
  }
  /** Seated idle: write in a notebook, look up at the board now and then, the odd raised hand. */
  seatedIdle(t: number, seed: number, dt: number) {
    this.time += dt; this.idleFace(dt);
    const writing = Math.sin(t * 0.35 + seed) > -0.2, hand = Math.sin(t * 0.11 + seed * 3) > 0.985;
    this.armR.rotation.x = hand ? -2.7 : -0.9 + (writing ? Math.sin(t * 9 + seed) * 0.06 : 0);
    this.foreR.rotation.x = hand ? 0 : -0.6 + (writing ? Math.sin(t * 13 + seed) * 0.12 : 0);
    this.head.rotation.x = writing ? 0.28 : -0.05;
  }
  /** Talking with the hands (teachers, staff, the speaker at the pulpit). */
  gesture(t: number, seed: number) {
    const k = Math.sin(t * 1.7 + seed);
    this.armR.rotation.x = -0.4 - Math.max(0, k) * 0.9; this.armR.rotation.z = 0.15;
    this.foreR.rotation.x = -0.5 - Math.max(0, Math.sin(t * 2.3 + seed)) * 0.6;
    this.armL.rotation.x = -0.2 - Math.max(0, -k) * 0.5;
  }
  wave(t: number) { this.armR.rotation.x = -2.6 + Math.sin(t * 8) * 0.3; this.armR.rotation.z = 0.2; this.foreR.rotation.x = -0.4 + Math.sin(t * 8) * 0.3; }

  /** Deterministic poses for the opening, without replacing gameplay animation. */
  phonePose(amount: number, glance = 0) {
    this.armR.rotation.set(-2.2 * amount, 0, 0.1 * amount);
    this.armR.scale.y = 1 - 0.25 * amount; this.foreR.rotation.x = 0;
    this.head.rotation.set(0, glance, 0);
  }

  mouthOpen(amount: number) {
    const open = Math.round(THREE.MathUtils.clamp(amount, 0, 1) * 3) / 3;
    this.mouth.scale.set(1 - open * .25, 1 + open * 2.2, 1);
  }

  poseArms(right: number, left = 0, rightZ = 0, leftZ = 0) {
    this.armR.rotation.set(right, 0, rightZ); this.armL.rotation.set(left, 0, leftZ);
    this.armR.scale.y = this.armL.scale.y = 1;
    this.foreR.rotation.x = this.foreL.rotation.x = 0;
  }

  cinematicWalk(distance: number, strength = 1) {
    const step = Math.sin(distance * 5.5) * .48 * strength;
    this.legL.rotation.x = step; this.legR.rotation.x = -step;
    this.shinL.rotation.x = this.shinR.rotation.x = 0;
    this.hips.position.y = 0; this.body.rotation.x = 0;
    this.torso.rotation.y = 0; this.torso.scale.y = 1;
    this.poseArms(step * .7, -step * .7);
  }

  knockPose(raised: number, contact: number) {
    this.cinematicWalk(0);
    this.armR.rotation.set((-1.3 - contact * .25) * raised, 0, .08 * raised);
    this.armR.scale.y = 1 + contact * .035;
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
