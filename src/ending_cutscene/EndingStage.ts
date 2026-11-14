import * as THREE from 'three';
import { CutsceneAvatar as Avatar } from './CutsceneAvatar';
import { textCanvas } from '../world/World';
import { ENDING, GLYPHS } from './ending.script';

const smooth = THREE.MathUtils.smoothstep;

export function block(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, unlit = false) {
  const material = unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: .85 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = !unlit; parent.add(mesh); return mesh;
}

export function lettering(parent: THREE.Object3D, text: string[], w: number, h: number, x: number, y: number, z: number) {
  const texture = new THREE.CanvasTexture(textCanvas(text, { w: 1024, h: 256, bg: '#123c67', fg: '#fff6df', border: '#d5b779' }));
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

export function voxelGlyph(parent: THREE.Object3D, ch: string, size: number, color: string) {
  const group = new THREE.Group();
  GLYPHS[ch].forEach((row, r) => [...row].forEach((c, col) => {
    if (c === '1') block(group, size * .88, size * .88, size * .55, color, (col - 2) * size, (6 - r) * size, 0);
  }));
  parent.add(group); return group;
}

/** A small, reusable stadium set with the same box-based avatar/material system. */
export class EndingStage {
  readonly scene = new THREE.Scene();
  readonly bednar = new Avatar({ shirt: '#ffffff', jacket: '#2b2f3a', pants: '#2b2f3a', tie: '#7a2b2b', hair: '#9a958e', skin: '#e0b896', mouth: true, expression: 'happy' });
  readonly player = new Avatar({ shirt: '#f2efe6', pants: '#3a4252', skin: '#e2b893', hair: '#4a3324', tie: '#3b5b8c' });
  readonly vikings: Avatar[] = [];
  readonly crowd: Avatar[] = [];
  readonly ceremonyGuests: { id: string; avatar: Avatar }[] = [];
  readonly flame = new THREE.Group();
  readonly drones: THREE.InstancedMesh;
  private droneGlow: THREE.InstancedMesh;
  private light25: THREE.Vector3[];
  private lightBYUI: THREE.Vector3[];
  private torchLight = new THREE.PointLight('#ffad42', 0, 14, 2);
  private handheld = new THREE.Group();
  private legacyBanner: THREE.Mesh;
  private vikingsBanner: THREE.Mesh;
  private matrix = new THREE.Matrix4();

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color('#071b37'); scene.fog = new THREE.Fog('#071b37', 80, 160);
    scene.add(new THREE.HemisphereLight('#d2e5ff', '#365239', 1.3));
    const key = new THREE.DirectionalLight('#fff1d7', 2.3); key.position.set(12, 24, 18); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -24; key.shadow.camera.right = 24;
    key.shadow.camera.top = 24; key.shadow.camera.bottom = -24; key.shadow.normalBias = .15; scene.add(key);
    const rim = new THREE.DirectionalLight('#6c9eff', 1.0); rim.position.set(-14, 15, -8); scene.add(rim);
    block(scene, 100, .3, 110, '#295f3e', 0, -.2, 10);
    for (let z = -25; z <= 50; z += 7) block(scene, 55, .015, .12, '#c8d9c2', 0, -.035, z);
    // Grandstands use the same stepped concrete/seat construction as World.makeSports.
    for (let row = 0; row < 7; row++) {
      const h = .8 + row * .7, z = -10 - row * 1.2;
      block(scene, 60, h, 1.22, '#7a8995', 0, h / 2, z);
      block(scene, 59, .15, .5, '#42658b', 0, h + .08, z);
    }
    block(scene, 18, 2.7, 2, '#8895a1', 0, 7, -18.5);
    block(scene, 16, .9, .08, '#477896', 0, 7.5, -17.45);
    block(scene, 62, .25, 7, '#4d647b', 0, 9, -17);
    for (const x of [-24, 24]) for (const z of [-17, 17]) {
      block(scene, .35, 18, .35, '#738797', x, 9, z);
      block(scene, 3.4, 1.5, .4, '#dbeaff', x, 18, z, true);
      for (let i = 0; i < 4; i++) block(scene, .55, .85, .05, '#fff9d4', x - 1.15 + i * .77, 18, z + .23, true);
    }
    // Stage, short stairs and a restrained gold trim.
    block(scene, 20, 1, 8, '#354a65', 0, .5, 0);
    block(scene, 20, .12, .12, '#d5b779', 0, 1.04, 4.02);
    for (let i = 0; i < 3; i++) block(scene, 3, .25 * (i + 1), .65, '#61748b', -7.5, .125 * (i + 1), 5.6 - i * .65);
    block(scene, 15, 3.4, .3, '#172c49', 0, 6, -3.5);
    this.legacyBanner = lettering(scene, ['LIGHT THE LEGACY', 'BYU–IDAHO · 2026'], 14.6, 3.05, 0, 6, -3.32);
    this.vikingsBanner = lettering(scene, ['THE VIKINGS', 'ARE BACK!'], 14.6, 3.05, 0, 6, -3.31);
    scene.add(this.bednar.root); this.bednar.root.position.set(-2.4, 1, 0);
    // Portrait-inspired voxel likenesses. No floating names or identification labels.
    const susan = new Avatar({ shirt: '#22252b', jacket: '#b3263f', pants: '#edc7a4', skirt: '#282c35', hair: '#493124', hairStyle: 'cropped', skin: '#edc7a4', mouth: true, expression: 'happy' });
    susan.root.scale.setScalar(.94); susan.root.position.set(-3.25, 1, -.25);
    // Dark scarf and a small red floral clasp, all made from square blocks.
    block(susan.root, .25, .12, .055, '#252329', 0, 1.48, .215);
    block(susan.root, .12, .28, .055, '#252329', -.04, 1.29, .22);
    block(susan.root, .14, .14, .055, '#d05262', 0, 1.35, .255);
    block(susan.root, .06, .06, .02, '#27252a', 0, 1.35, .29);
    const meredith = new Avatar({ shirt: '#fffaf0', jacket: '#1c304e', pants: '#202c3f', hair: '#8b8178', hairStyle: 'bald', skin: '#e0b48f', tie: '#68a9d3', mouth: true, expression: 'happy' });
    meredith.root.scale.setScalar(1.04); meredith.root.position.set(-5.05, 1, -.25);
    for (const y of [1.08, 1.21, 1.34]) block(meredith.root, .08, .025, .012, '#2d527b', 0, y, .212);
    const jennifer = new Avatar({ shirt: '#1b2d49', jacket: '#7fb6de', pants: '#e8bc99', skirt: '#273c59', hair: '#a98c63', hairStyle: 'long', skin: '#e8bc99', mouth: true, expression: 'happy' });
    jennifer.root.scale.setScalar(.97); jennifer.root.position.set(-6.85, 1, -.25);
    block(jennifer.root, .26, .10, .055, '#192b45', 0, 1.48, .22);
    block(jennifer.root, .15, .37, .055, '#192b45', -.025, 1.25, .22);
    for (const y of [1.16, 1.29, 1.42]) block(jennifer.root, .035, .035, .01, '#d3dce4', -.025, y, .255);
    for (const x of [-.28, .28]) block(jennifer.root, .035, .33, .03, '#c5ad84', x, 1.58, .19);
    for (const person of [{ id: 'susan-bednar', avatar: susan }, { id: 'alvin-f-meredith-iii', avatar: meredith }, { id: 'jennifer-meredith', avatar: jennifer }]) {
      person.avatar.root.name = person.id; scene.add(person.avatar.root); this.ceremonyGuests.push(person);
    }
    // The held torch is attached to the actual animated hand.
    this.bednar.attachToRightHand(this.handheld);
    block(this.handheld, .10, .7, .10, '#a77b36', 0, .3, 0);
    block(this.handheld, .25, .15, .25, '#d4b56d', 0, .65, 0);
    block(this.handheld, .18, .32, .18, '#ff9c2c', 0, .86, 0, true);
    block(this.handheld, .10, .24, .10, '#ffe9a0', 0, .88, .03, true);
    // Ceremonial torch: a square pedestal and stepped bowl.
    block(scene, 1.2, .2, 1.2, '#8e9eaa', 0, 1.1, .9);
    block(scene, .5, 1.3, .5, '#b6a473', 0, 1.8, .9);
    block(scene, 1.15, .2, 1.15, '#c5b786', 0, 2.5, .9);
    block(scene, 1.55, .23, 1.55, '#d4c69b', 0, 2.7, .9);
    block(scene, 1.1, .04, 1.1, '#3e3023', 0, 2.84, .9);
    this.flame.position.set(0, 2.85, .9); scene.add(this.flame);
    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * .27, z = (Math.floor(i / 3) - 1) * .27;
      block(this.flame, .29, .9, .29, i % 2 ? '#ffb42d' : '#ff7323', x, .45, z, true);
    }
    block(this.flame, .3, 1.05, .3, '#fff1a7', 0, .52, .1, true);
    this.torchLight.position.set(0, 3.7, 1); scene.add(this.torchLight);
    // Recognizable voxel Viking costumes; generic figures, not detailed likenesses.
    for (let i = 0; i < 3; i++) {
      const thor = i === 1;
      const av = new Avatar({ shirt: thor ? '#1c5fb1' : '#3668a1', pants: '#27364c', hair: '#704627', skin: '#e0b48f' });
      if (thor) av.root.scale.setScalar(1.2);
      av.root.position.set(2.6 + i * 2, 1, .5);
      block(av.root, .59, .22, .55, '#a3adba', 0, 2.06, 0);
      block(av.root, .62, .08, .57, '#d6ba70', 0, 1.99, .01);
      block(av.root, .35, .31, .10, thor ? '#a76e39' : '#7a5335', 0, 1.61, .27);
      block(av.root, .24, .16, .10, thor ? '#a76e39' : '#7a5335', 0, 1.41, .26);
      block(av.root, .64, .10, .37, '#d6ba70', 0, .86, .01);
      for (const side of [-1, 1]) {
        block(av.root, .22, .16, .2, '#eee3c7', side * .37, 2.16, 0);
        block(av.root, .16, .25, .16, '#eee3c7', side * .47, 2.31, 0);
      }
      this.vikings.push(av); scene.add(av.root);
    }
    scene.add(this.player.root); this.player.root.position.set(-1.5, 0, 6.5); this.player.root.rotation.y = Math.PI;
    const colors = ['#2668b2', '#e9eee9', '#387da4', '#e2cf9d'];
    for (let i = 0; i < 24; i++) {
      const av = new Avatar({ shirt: colors[i % 4], pants: '#273449', skin: i % 3 ? '#e0b48f' : '#a8714a', hair: '#4a3324' }, .92);
      const col = i % 6, row = Math.floor(i / 6);
      av.root.position.set(-11 + col * 4.5 + (row % 2) * .6, 0, 10 + row * 3);
      av.root.rotation.y = Math.PI; scene.add(av.root); this.crowd.push(av);
    }
    this.light25 = this.pointsFor('25'); this.lightBYUI = this.pointsFor('BYUI');
    const count = Math.max(this.light25.length, this.lightBYUI.length);
    this.drones = new THREE.InstancedMesh(new THREE.BoxGeometry(.17, .17, .17), new THREE.MeshBasicMaterial(), count);
    this.droneGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(.38, .38, .38), new THREE.MeshBasicMaterial({ transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending }), count);
    for (let i = 0; i < count; i++) {
      const color = new THREE.Color(i % 6 === 0 ? '#ffd572' : i % 3 === 0 ? '#73b7ff' : '#e9f6ff');
      this.drones.setColorAt(i, color); this.droneGlow.setColorAt(i, color);
    }
    this.drones.frustumCulled = this.droneGlow.frustumCulled = false;
    scene.add(this.drones, this.droneGlow);
    this.update(0);
  }

  private pointsFor(text: string) {
    const points: THREE.Vector3[] = [], width = (text.length * 6 - 1) * .65;
    [...text].forEach((ch, ci) => GLYPHS[ch].forEach((row, r) => [...row].forEach((pixel, col) => {
      if (pixel !== '1') return;
      for (const offset of [-.1, .1]) points.push(new THREE.Vector3((ci * 6 + col) * .65 - width / 2 + offset, 18 + (6 - r) * .65, -3));
    })));
    return points;
  }

  update(t: number) {
    const light = smooth(t, ENDING.torchAt, ENDING.torchAt + .7);
    this.flame.visible = light > 0;
    this.flame.children.forEach((child, i) => {
      child.scale.y = light * (.8 + .3 * Math.sin(t * 8 + i * 1.7));
      child.position.y = .45 * child.scale.y;
    });
    this.torchLight.intensity = light * (38 + Math.sin(t * 9) * 5);
    const approach = smooth(t, 8.8, 9.7);
    this.bednar.root.position.x = THREE.MathUtils.lerp(-2.1, -1.5, approach) - .4 * smooth(t, 10.5, 11.5);
    this.bednar.poseArms(-1.35, 0, .08);
    const touch = smooth(t, 9, 9.7) * (1 - smooth(t, 10.4, 11.4));
    this.handheld.rotation.set(1.35, 0, -.08 - .5 * touch);
    this.bednar.root.rotation.y = t >= 25 ? -.12 : 0;
    const cue = ENDING.cues.find(c => t >= c.start && t < c.end);
    this.bednar.mouthOpen(cue ? Math.max(0, Math.sin((t - cue.start) * 22)) * (.75 + .25 * Math.sin(t * 7.3)) : 0);
    this.legacyBanner.visible = t < ENDING.vikingsAt; this.vikingsBanner.visible = t >= ENDING.vikingsAt;
    const cheer = smooth(t, 20, 20.5);
    this.vikings.forEach((av, i) => {
      av.root.visible = t >= 20;
      av.poseArms((-2.5 + Math.sin(t * 5 + i) * .2) * cheer, (-2.4 - Math.sin(t * 5 + i) * .2) * cheer, .25 * cheer, -.25 * cheer);
    });
    this.crowd.forEach((av, i) => {
      const wave = smooth(t, 10.1, 10.7) * (.85 + .15 * Math.sin(t * 4 + i));
      av.poseArms(-2.5 * wave, i % 2 ? -2.2 * wave : 0, .15 * wave, -.15 * wave);
    });
    this.player.poseArms(-2.4 * cheer, -2.2 * cheer, .2 * cheer, -.2 * cheer);
    const rise = smooth(t, 12, 14), morph = smooth(t, 16.5, 18);
    this.drones.visible = this.droneGlow.visible = t >= 12;
    for (let i = 0; i < this.drones.count; i++) {
      const a = this.light25[Math.floor(i * this.light25.length / this.drones.count)], b = this.lightBYUI[i % this.lightBYUI.length];
      const x = THREE.MathUtils.lerp(a.x, b.x, morph), y = THREE.MathUtils.lerp(a.y, b.y, morph);
      this.matrix.makeTranslation(x, THREE.MathUtils.lerp(7 + (i % 7) * .12, y, rise), -3 + (1 - rise) * (i % 5));
      this.drones.setMatrixAt(i, this.matrix); this.droneGlow.setMatrixAt(i, this.matrix);
    }
    this.drones.instanceMatrix.needsUpdate = this.droneGlow.instanceMatrix.needsUpdate = true;
  }
}
