import * as THREE from 'three';
import type { Game } from '../game';
import type { ActionState } from '../input/actions';
import type { Space } from '../player/PlayerController';
import type { EraId } from '../world/eras';
import { GAME_CONFIG } from '../config/game.config';
import { OPENING } from './opening.script';
import { CAMPUS, everOccupied, onVehicleRoad, pointInPoly, registryPoly, toGame } from '../world/campusData';
import { textCanvas } from '../world/World';
import './opening.css';

const clamp = THREE.MathUtils.clamp;
const ramp = (t: number, from: number, to: number) => THREE.MathUtils.smoothstep(t, from, to);
const blend = (a: number, b: number, t: number) => THREE.MathUtils.lerp(a, b, t);

/** Native, frame-driven sequence. No timers, video, remote assets or save writes. */
export class OpeningCutscene {
  active = false;
  paused = false;
  elapsed = 0;
  private preview = false;
  private overlay?: HTMLDivElement;
  private props = new THREE.Group();
  private campusSign = new THREE.Group();
  private receiver = new THREE.Group();
  private door = new THREE.Group();
  private cameraTarget = new THREE.Vector3();
  private saved?: {
    player: THREE.Vector3; playerYaw: number; playerVisible: boolean; playerSpace: Space;
    bednar: THREE.Vector3; bednarYaw: number; bednarVisible: boolean;
    camera: THREE.Vector3; rotation: THREE.Quaternion; space: string; era: EraId; color: number;
    visuals: { object: THREE.Object3D; visible: boolean }[];
  };
  private done?: () => void;
  private lastCue = -2;
  private skipNextFrame = false;
  private onVisibility = () => { this.skipNextFrame = true; };

  constructor(private game: Game) {}

  play(preview = false): Promise<void> {
    if (this.active) throw new Error('The opening is already playing.');
    const g = this.game;
    this.preview = preview; this.elapsed = 0; this.paused = false; this.lastCue = -2;
    this.skipNextFrame = true; document.addEventListener('visibilitychange', this.onVisibility);
    this.saved = {
      player: g.player.position.clone(), playerYaw: g.player.yaw, playerVisible: g.player.avatar.root.visible, playerSpace: g.player.space,
      bednar: g.bednar.root.position.clone(), bednarYaw: g.bednar.root.rotation.y, bednarVisible: g.bednar.root.visible,
      camera: g.renderer.camera.position.clone(), rotation: g.renderer.camera.quaternion.clone(), space: g.spaceId,
      era: g.world.era, color: g.renderer.colorAmount,
      visuals: [],
    };
    for (const it of g.interactions.items.values()) if (it.visual) {
      this.saved.visuals.push({ object: it.visual, visible: it.visual.visible });
      it.visual.visible = false;
    }
    g.bednar.root.traverse(o => {
      if (o instanceof THREE.Sprite) { this.saved!.visuals.push({ object: o, visible: o.visible }); o.visible = false; }
    });
    g.world.setEra(GAME_CONFIG.story.startEra);
    g.renderer.setColor(GAME_CONFIG.colorStages[0], true);
    if (!this.props.parent) this.buildProps();
    this.buildOverlay();
    this.active = true;
    this.render();
    return new Promise(resolve => { this.done = resolve; });
  }

  update(dt: number, input: ActionState) {
    if (!this.active) return;
    if (input.pressed('back') || input.pressed('pause')) {
      input.consume('back'); input.consume('pause'); this.finish(); return;
    }
    if (!this.paused && !document.hidden) {
      if (!this.skipNextFrame) this.elapsed = Math.min(OPENING.duration, this.elapsed + dt);
      if (this.elapsed < OPENING.officeAt) this.game.npcs.update(dt, new THREE.Vector3(1e6, 0, 1e6), (x, z, r) => this.game.world.blocked(x, z, r));
    }
    this.skipNextFrame = false;
    this.render();
    if (this.elapsed >= OPENING.duration) this.finish();
  }

  /** Useful for inspecting a shot in preview mode, without changing game progress. */
  seek(seconds: number) {
    if (!this.active || !this.preview) return;
    this.elapsed = clamp(seconds, 0, OPENING.duration - 0.01); this.render();
  }


  private buildOverlay() {
    const el = document.createElement('div'); el.className = 'opening-cutscene';
    el.setAttribute('aria-label', 'Opening cutscene');
    el.innerHTML = `<div class="oc-bar top"></div><div class="oc-bar bottom"></div>
      <div class="oc-location"><strong></strong><span></span></div>
      <div class="oc-subtitles" role="status" aria-live="polite" aria-atomic="true"><div class="oc-caption"><span class="oc-speaker"></span><p class="oc-text"></p></div></div>
      <div class="oc-black"></div><div class="oc-title"><span>Ricks College · 1999</span><h1></h1></div>
      ${this.preview ? '<span class="oc-preview">Opening preview</span>' : ''}
      <div class="oc-controls"><button type="button" data-skip>Skip ▸</button></div>`;
    el.querySelector('.oc-location strong')!.textContent = OPENING.location;
    el.querySelector('.oc-location span')!.textContent = OPENING.date;
    el.querySelector('.oc-title h1')!.textContent = OPENING.title;
    el.querySelector('[data-skip]')!.addEventListener('click', () => this.finish());
    // All keyboard/controller input goes through the shared action layer.
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
    this.game.ui.root.appendChild(el); this.overlay = el;
  }

  private box(parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], color: string, unlit = false) {
    const material = unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: .8 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at); mesh.castShadow = !unlit; mesh.receiveShadow = !unlit; parent.add(mesh); return mesh;
  }

  private buildProps() {
    const g = this.game;
    this.props = new THREE.Group();
    g.interiors.groups.get('kimball-office')!.add(this.props);
    // Match the updated game's box geometry, PBR materials and environment lighting.
    const phone = new THREE.Group(); phone.position.set(1.35, 1.0, -8.45); this.props.add(phone);
    this.box(phone, [0.65, 0.14, 0.42], [0, 0, 0], '#252b2c');
    this.box(phone, [0.28, 0.025, 0.25], [-0.08, 0.09, 0.01], '#d5c9ad');
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++)
      this.box(phone, [0.045, 0.025, 0.035], [-0.17 + col * 0.075, 0.11, -0.07 + row * 0.05], '#3f4140');
    this.receiver = new THREE.Group(); this.props.add(this.receiver);
    this.box(this.receiver, [0.13, 0.46, 0.12], [0, 0, 0], '#242a2b');
    this.box(this.receiver, [0.21, 0.13, 0.2], [0, 0.23, 0.03], '#242a2b');
    this.box(this.receiver, [0.21, 0.13, 0.2], [0, -0.23, 0.03], '#242a2b');
    // Chair behind the existing desk.
    this.box(this.props, [0.9, 0.16, 0.85], [0, 0.72, -9.7], '#45372e');
    this.box(this.props, [0.9, 1.2, 0.18], [0, 1.25, -10.1], '#45372e');
    for (const x of [-0.33, 0.33]) for (const z of [-9.98, -9.42])
      this.box(this.props, [0.11, 0.65, 0.11], [x, 0.33, z], '#2f2a24');
    // A stylized window inset, not a claim about the historical office floor plan.
    const window = new THREE.Group(); window.position.set(-6.76, 2.0, -7.8); window.rotation.y = Math.PI / 2; this.props.add(window);
    this.box(window, [2.8, 1.65, 0.09], [0, 0, 0], '#e6d5b5');
    this.box(window, [2.55, 1.4, 0.04], [0, 0, 0.08], '#a8c5d0', true);
    this.box(window, [2.5, 0.27, 0.04], [0, -0.56, 0.12], '#7a885d', true);
    for (const x of [-0.75, 0.65]) {
      this.box(window, [0.08, 0.5, 0.04], [x, -0.3, 0.15], '#68553b', true);
      this.box(window, [0.45, 0.5, 0.04], [x, 0.04, 0.15], '#697c54', true);
    }
    this.box(window, [0.08, 1.43, 0.08], [0, 0, 0.2], '#e6d5b5');
    this.box(window, [2.55, 0.08, 0.08], [0, 0, 0.2], '#e6d5b5');
    // The actual office doorway is the 3.2 m gap between the hall and office.
    this.door.name = 'opening-office-door'; this.door.position.set(-1.5, 0, -2.05); this.props.add(this.door);
    this.box(this.door, [3, 3.12, .13], [1.5, 1.58, 0], '#63452d');
    for (const z of [-.075, .075]) {
      for (const y of [.85, 2.23]) this.box(this.door, [2.4, 1.03, .025], [1.5, y, z], '#785539');
      this.box(this.door, [.28, .09, .09], [2.72, 1.3, z * 1.7], '#c4a66b');
    }
    for (const x of [-1.62, 1.62]) this.box(this.props, [.18, 3.35, .22], [x, 1.675, -2.05], '#d8c6a6');
    this.box(this.props, [3.42, .18, .22], [0, 3.28, -2.05], '#d8c6a6');
    // Lift the existing hallway plaque above the new door frame.
    for (const object of g.interiors.groups.get('kimball-office')!.children) {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.PlaneGeometry && Math.abs(object.position.z + 2) < .01) {
        object.position.y = 3.48; object.scale.set(.72, .36, 1);
      }
    }
    // The refreshed game reserves its BYUI sign for Quest 3. This opening-only
    // Ricks College monument preserves the approved establishing shot in 1999.
    const { x: sx, z: sz, yaw } = this.monumentPlacement();
    this.campusSign.position.set(sx, g.world.groundY(sx, sz), sz); this.campusSign.rotation.y = yaw;
    this.box(this.campusSign, [6.4, .8, .6], [0, .4, 0], '#8f877c');
    this.box(this.campusSign, [6, 2.4, .25], [0, 2, 0], '#5b2a24');
    const texture = new THREE.CanvasTexture(textCanvas(['RICKS COLLEGE'], { w: 1024, h: 256, bg: '#5b2a24', fg: '#fff0d5', border: '#c9b48a' }));
    texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshStandardMaterial({ map: texture, roughness: .8 }));
    face.position.set(0, 2, .13); this.campusSign.add(face); g.renderer.scene.add(this.campusSign);
  }

  private monumentPlacement() {
    const world = this.game.world, [cx, cz] = toGame(176, -96);
    // Map changes can move roads/footprints beneath old cinematic coordinates.
    // Keep the entire base on lawn and check the camera's approach to the sign.
    for (let radius = 0; radius <= 80; radius += 2) for (let step = 0; step < 24; step++) {
      const x = cx + Math.cos(step * Math.PI / 12) * radius, z = cz + Math.sin(step * Math.PI / 12) * radius;
      for (const yaw of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
        const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw), frontX = Math.sin(yaw), frontZ = Math.cos(yaw);
        const lawn = [-3.4, 0, 3.4].every(side => [-.6, .6].every(front => {
          const px = x + sideX * side + frontX * front, pz = z + sideZ * side + frontZ * front;
          return !everOccupied(px, pz, .8) && !onVehicleRoad(px, pz) && !world.onPath(px, pz) && !world.blocked(px, pz, .8)
            && !CAMPUS.areas.some(a => ['parking', 'water', 'sport', 'stadium'].includes(a.kind) && pointInPoly(px, pz, a.poly));
        }));
        if (!lawn) continue;
        const base = world.groundY(x, z);
        let clearView = true;
        for (let d = 1; d <= 18; d++) {
          const px = x + frontX * d, pz = z + frontZ * d, y = base + 2 + d / 3;
          if (world.grid.topAt(px, pz) > y - .5) { clearView = false; break; }
        }
        if (clearView) return { x, z, yaw };
      }
    }
    throw new Error('No clear lawn location for the opening monument.');
  }

  private officeShot(from: number[], to: number[], aimFrom: number[], aimTo: number[], t: number) {
    const o = this.game.interiors.origin('kimball-office');
    this.shot(from.map((v, i) => v + (i === 0 ? o.x : i === 2 ? o.z : 0)),
      to.map((v, i) => v + (i === 0 ? o.x : i === 2 ? o.z : 0)),
      aimFrom.map((v, i) => v + (i === 0 ? o.x : i === 2 ? o.z : 0)),
      aimTo.map((v, i) => v + (i === 0 ? o.x : i === 2 ? o.z : 0)), t);
  }

  private shot(from: number[], to: number[], aimFrom: number[], aimTo: number[], t: number) {
    const c = this.game.renderer.camera;
    c.position.set(blend(from[0], to[0], t), blend(from[1], to[1], t), blend(from[2], to[2], t));
    this.cameraTarget.set(blend(aimFrom[0], aimTo[0], t), blend(aimFrom[1], aimTo[1], t), blend(aimFrom[2], aimTo[2], t));
    c.lookAt(this.cameraTarget); this.game.world.updateSun(this.cameraTarget);
  }

  private render() {
    if (!this.overlay || !this.saved) return;
    const g = this.game, t = this.elapsed;
    // Finish the telephone call and replace the receiver before the assistant arrives.
    const entranceTime = t - OPENING.entranceAt;
    const entering = t >= OPENING.entranceAt && t < OPENING.entranceEnd;
    // Follow the subtitle clock so pausing, seeking and replay stay in sync.
    const speaking = OPENING.cues.find(c => c.actor === 'bednar' && t >= c.start && t < c.end);
    let mouth = 0;
    if (speaking) {
      const local = t - speaking.start;
      const envelope = ramp(t, speaking.start, speaking.start + 0.12) * (1 - ramp(t, speaking.end - 0.2, speaking.end));
      mouth = Math.max(0, Math.sin(local * 22)) * (0.75 + 0.25 * Math.sin(local * 7.3)) * envelope;
    }
    g.bednar.mouthOpen(mouth);
    const indoors = t >= OPENING.officeAt;
    const handoff = t >= OPENING.handoffAt;
    g.world.exterior.visible = !indoors; g.interiors.show(indoors ? 'kimball-office' : null);
    g.npcs.setVisible(!indoors);
    g.player.avatar.root.visible = indoors && t >= OPENING.entranceAt;
    g.bednar.root.visible = indoors;
    this.props.visible = indoors;
    this.campusSign.visible = !indoors;
    const origin = g.interiors.origin('kimball-office');
    const entry = ramp(entranceTime, 4.1, 5.9), walkDistance = 3.38 * entry;
    g.player.avatar.root.position.copy(origin).add(new THREE.Vector3(0, 0, -1.12 - walkDistance));
    g.player.avatar.root.rotation.y = Math.PI;
    if (entranceTime < 3.3) {
      const raised = ramp(entranceTime, .5, .9) * (1 - ramp(entranceTime, 2.25, 2.6));
      const tap = (start: number) => ramp(entranceTime, start, start + .13) * (1 - ramp(entranceTime, start + .13, start + .35));
      g.player.avatar.knockPose(raised, tap(1.05) + tap(1.65));
    } else g.player.avatar.cinematicWalk(walkDistance, entranceTime > 4.1 && entranceTime < 5.9 ? 1 : 0);
    this.door.rotation.y = Math.PI / 2 * ramp(entranceTime, 3.35, 4.1);
    const pickup = ramp(t, 10, 11.5), replace = ramp(t, 28.8, 30);
    const phoneAmount = pickup * (1 - replace);
    g.bednar.sit(!handoff);
    g.bednar.phonePose(handoff ? 0 : phoneAmount, !handoff ? -0.7 * ramp(t, 18.2, 19) * (1 - ramp(t, 19, 20)) : 0);
    g.bednar.root.position.copy(origin).add(new THREE.Vector3(0, 0, handoff ? -7 : -9.7));
    g.bednar.root.rotation.y = 0;
    this.receiver.position.set(blend(1.35, 0.47, phoneAmount), blend(1.18, 1.84, phoneAmount), blend(-8.45, -9.24, phoneAmount));
    this.receiver.rotation.z = blend(Math.PI / 2, 0, phoneAmount);
    if (!indoors) {
      const s = this.campusSign.position, sy = s.y;
      const d = g.world.doorPlacement(g.location('door-kimball'));
      const dy = g.world.groundY(d.x, d.z), a = this.campusSign.rotation.y;
      const front = [Math.sin(a), Math.cos(a)];
      if (t < 4.8) this.shot([s.x + front[0] * 18, sy + 8, s.z + front[1] * 18], [s.x + front[0] * 13, sy + 5, s.z + front[1] * 13], [s.x, sy + 2, s.z], [s.x, sy + 2, s.z], ramp(t, 0, 4.8));
      else {
        const poly = registryPoly('kimball')!;
        const center = poly.reduce((p, q) => [p[0] + q[0] / poly.length, p[1] + q[1] / poly.length], [0, 0]);
        // High, oblique view from the opposite corner clears the near tree crowns.
        this.shot([d.x + d.nx * 44 + d.nz * 24, dy + 27, d.z + d.nz * 44 - d.nx * 24],
          [d.x + d.nx * 34 + d.nz * 18, dy + 23, d.z + d.nz * 34 - d.nx * 18],
          [center[0], dy + 5, center[1]], [center[0], dy + 5, center[1]], ramp(t, 4.8, 8.8));
      }
    } else if (entering && entranceTime < 3.35) {
      const narrow = g.renderer.camera.aspect < .8;
      this.officeShot([narrow ? -.9 : -1.9, 2.35, narrow ? 5 : 1.8], [narrow ? -.9 : -1.7, 2.2, narrow ? 4.6 : 1.2],
        [0, 1.5, -1.9], [0, 1.5, -1.9], ramp(entranceTime, 0, 3.35));
    } else if (entering) {
      this.officeShot([3.8, 2.35, -6], [3.5, 2.4, -6.7], [.1, 1.4, -1.8], [0, 1.4, -3.8], ramp(entranceTime, 3.35, 6));
    } else if (t < 20) {
      this.officeShot([4.6, 3.1, -5.1], [3.2, 2.35, -6.4], [0.3, 1.55, -9.3], [0.1, 1.7, -9.5], ramp(t, 9, 20));
    } else if (t < 30) {
      this.officeShot([1.8, 2.1, -6.1], [1.25, 2.02, -6.8], [0, 1.75, -9.55], [0, 1.78, -9.55], ramp(t, 20, 29.5));
    } else if (!handoff) {
      this.officeShot([1.25, 2.02, -6.8], [1.25, 2.02, -6.8], [0, 1.78, -9.55], [0, 1.78, -9.55], 0);
    } else {
      const p = g.interiors.toWorld('kimball-office', 0, -4.5);
      g.player.place(g.interiors.space('kimball-office'), p.x, p.z, Math.PI);
      const pitch = 0.9, distance = 9;
      this.officeShot([3.5, 2.7, -2.3], [0, 1.6 + Math.sin(pitch) * distance, -4.5 + Math.cos(pitch) * distance], [0, 1.6, -7], [0, 1.6, -4.5], ramp(t, 44.5, OPENING.duration));
    }

    let black = Math.max(1 - ramp(t, 0, 0.9), ramp(t, 8.2, 8.9) * (1 - ramp(t, 9.1, 9.8)));
    black = Math.max(black, ramp(t, OPENING.titleAt, OPENING.titleAt + .35) * (1 - ramp(t, OPENING.entranceAt - .7, OPENING.entranceAt)));
    (this.overlay.querySelector('.oc-black') as HTMLElement).style.opacity = String(black);
    (this.overlay.querySelector('.oc-title') as HTMLElement).style.opacity = String(ramp(t, OPENING.titleAt + .5, OPENING.titleAt + 1.1) * (1 - ramp(t, OPENING.entranceAt - 1.3, OPENING.entranceAt - .7)));
    (this.overlay.querySelector('.oc-location') as HTMLElement).style.opacity = String(ramp(t, 0.9, 1.7) * (1 - ramp(t, 4, 4.8)));
    const cue = OPENING.cues.findIndex(c => t >= c.start && t < c.end);
    if (cue !== this.lastCue) {
      this.lastCue = cue;
      const subtitles = this.overlay.querySelector<HTMLElement>('.oc-subtitles')!;
      subtitles.hidden = cue < 0;
      if (cue >= 0) {
        const line = OPENING.cues[cue];
        this.overlay.querySelector<HTMLElement>('.oc-speaker')!.hidden = !line.speaker;
        this.overlay.querySelector('.oc-speaker')!.textContent = line.speaker + (line.context ? ` · ${line.context}` : '');
        this.overlay.querySelector('.oc-text')!.textContent = line.text;
        if (!line.text.startsWith('[')) this.game.voice.speak(line.speaker || 'Narrator', line.text);   // ElevenLabs recording (browser voice fallback)
      }
    }
  }

  finish() {
    this.game.voice.stop();
    if (!this.active || !this.saved) return;
    const g = this.game, saved = this.saved;
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisibility); this.campusSign.visible = false;
    g.bednar.sit(false); g.bednar.phonePose(0); g.bednar.mouthOpen(0);
    g.bednar.root.position.copy(saved.bednar); g.bednar.root.rotation.y = saved.bednarYaw;
    g.player.place(saved.playerSpace, saved.player.x, saved.player.z, saved.playerYaw);
    g.player.avatar.root.visible = saved.playerVisible;
    g.player.avatar.cinematicWalk(0); this.door.rotation.y = Math.PI / 2;
    for (const v of saved.visuals) v.object.visible = v.visible;
    g.bednar.root.visible = saved.bednarVisible;
    g.world.setEra(saved.era); g.renderer.setColor(saved.color, true);
    g.world.exterior.visible = saved.space === 'exterior'; g.interiors.show(saved.space === 'exterior' ? null : saved.space);
    g.npcs.setVisible(saved.space === 'exterior');
    g.renderer.camera.position.copy(saved.camera); g.renderer.camera.quaternion.copy(saved.rotation);
    // Keep the office additions in place for a seamless handoff and reuse on replay.
    this.props.visible = true;
    this.receiver.position.set(1.35, 1.18, -8.45); this.receiver.rotation.z = Math.PI / 2;
    this.overlay?.remove(); this.overlay = undefined; this.saved = undefined;
    const done = this.done; this.done = undefined; done?.();
  }
}
