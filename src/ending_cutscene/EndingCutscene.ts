import * as THREE from 'three';
import type { Game } from '../game';
import type { ActionState } from '../input/actions';
import type { EraId } from '../world/eras';
import { GAME_CONFIG } from '../config/game.config';
import { EndingStage } from './EndingStage';
import { buildSign as buildLawnSign, bigLetter } from '../quests/q3/camo';
import { ENDING } from './ending.script';
import { STCPresentation } from './STCPresentation';
import '../opening_cutscene/opening.css';
import './ending.css';

const ramp = THREE.MathUtils.smoothstep;

/** The final letter, a full-color 2026 celebration, and a save-safe preview. */
export class EndingCutscene {
  active = false;
  previewing = false;
  completed = false;
  paused = false;
  elapsed = 0;
  readonly sign = new THREE.Group();
  readonly lastLetter = new THREE.Group();
  stage?: EndingStage;
  presentation?: STCPresentation;
  private overlay?: HTMLElement;
  private lastCue = -2;
  private skipNextFrame = false;
  private onVisibility = () => { this.skipNextFrame = true; };
  private cameraTarget = new THREE.Vector3();
  private saved?: {
    era: EraId; color: number; colorStage: number; reached: boolean;
    playerVisible: boolean; playerPosition: THREE.Vector3; playerRotation: number;
    exterior: boolean; signs: boolean; camera: THREE.Vector3; quaternion: THREE.Quaternion;
    cameraUp: THREE.Vector3; overhead: Game['overhead'];
    questSigns: { object: THREE.Object3D; visible: boolean }[];
    gateBuilt: Game['world']['gateBuilt'];
  };

  constructor(private game: Game) {}

  start(preview = false) {
    const g = this.game;
    if (this.active || (!preview && !g.quests.allComplete())) return;
    this.saved = {
      era: g.world.era, color: g.renderer.colorAmount, colorStage: g.colorStage, reached: g.finaleReached,
      playerVisible: g.player.avatar.root.visible, playerPosition: g.player.avatar.root.position.clone(), playerRotation: g.player.avatar.root.rotation.y,
      exterior: g.world.exterior.visible, signs: g.world.campusSignGroup.visible,
      camera: g.renderer.camera.position.clone(), quaternion: g.renderer.camera.quaternion.clone(), cameraUp: g.renderer.camera.up.clone(), overhead: g.overhead,
      questSigns: g.renderer.scene.children.filter(object => object.name === 'quest-byui-sign').map(object => ({ object, visible: object.visible })),
      gateBuilt: g.world.gateBuilt,
    };
    this.active = true; this.previewing = preview; this.completed = false; this.paused = false; this.elapsed = 0; this.lastCue = -2;
    this.skipNextFrame = true; document.addEventListener('visibilitychange', this.onVisibility);
    g.ui.clear(); g.ui.showHud(false); g.mode = 'finale'; g.overhead = null;
    if (preview) { g.world.gateBuilt = () => true; g.world.refreshBuildings(); }
    g.world.setEra(GAME_CONFIG.story.finaleEra); g.renderer.setColor(1, true);
    g.colorStage = 3; g.world.exterior.visible = true; g.world.campusSignGroup.visible = false;
    g.interiors.show(null); g.npcs.setVisible(false); g.renderer.camera.up.set(0, 1, 0);
    for (const sign of this.saved.questSigns) sign.object.visible = false;
    if (!this.stage) this.stage = new EndingStage();
    if (!this.presentation) this.presentation = new STCPresentation();
    this.stage.scene.environment = this.presentation.scene.environment = g.renderer.scene.environment;
    this.stage.scene.environmentIntensity = .22; this.presentation.scene.environmentIntensity = .55;
    if (!this.sign.children.length) this.buildSign();
    const p = g.resolve('sign.byui');
    this.sign.position.set(p.x, g.world.groundY(p.x, p.z), p.z);
    this.sign.rotation.y = g.location('sign.byui').yaw ?? 0;
    g.renderer.scene.add(this.sign);
    this.buildOverlay(); this.render();
    if (!preview) g.save();
  }

  private buildSign() {
    const model = buildLawnSign(); this.sign.add(model.group);
    [...'BYU'].forEach((ch, i) => {
      const letter = bigLetter(ch); letter.position.copy(model.slots[i]); this.sign.add(letter);
    });
    this.lastLetter.add(bigLetter('I')); this.sign.add(this.lastLetter);
  }

  private buildOverlay() {
    const el = document.createElement('div'); el.className = 'opening-cutscene ending-cutscene';
    el.setAttribute('aria-label', 'Ending cutscene');
    el.innerHTML = `<div class="oc-bar top"></div><div class="oc-bar bottom"></div>
      <div class="oc-location"><strong>Light the Legacy</strong><span>BYU–Idaho Stadium · 2026</span></div>
      <div class="oc-subtitles" role="status" aria-live="polite" aria-atomic="true"><div class="oc-caption"><span class="oc-speaker">Elder David A. Bednar</span><p class="oc-text"></p></div></div>
      <div class="oc-black"></div><div class="oc-title"><span>The legacy continues.</span><h1>The Spirit of Ricks</h1></div>
      ${this.previewing ? '<span class="oc-preview">Ending preview</span>' : ''}
      <div class="oc-controls"><button type="button" data-skip>Skip ▸</button></div>`;
    el.querySelector('[data-skip]')!.addEventListener('click', () => this.finish());
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
    this.game.ui.root.appendChild(el); this.overlay = el;
  }


  update(dt: number, input?: ActionState) {
    if (!this.active || this.completed) return;
    if (input?.pressed('back') || input?.pressed('pause')) {
      input.consume('back'); input.consume('pause'); this.finish(); return;
    }
    if (!this.paused && !document.hidden && !this.skipNextFrame) this.elapsed = Math.min(ENDING.duration, this.elapsed + dt);
    this.skipNextFrame = false;
    this.render();
    if (this.elapsed >= ENDING.duration) this.finish();
  }

  seek(seconds: number) {
    if (!this.active || !this.previewing || this.completed) return;
    this.elapsed = THREE.MathUtils.clamp(seconds, 0, ENDING.duration - .001); this.render();
  }

  private shot(from: number[], to: number[], aimFrom: number[], aimTo: number[], p: number) {
    const camera = this.game.renderer.camera;
    camera.position.set(...from.map((n, i) => THREE.MathUtils.lerp(n, to[i], p)) as [number, number, number]);
    this.cameraTarget.set(...aimFrom.map((n, i) => THREE.MathUtils.lerp(n, aimTo[i], p)) as [number, number, number]);
    // Preserve the complete podium group and drone lettering in narrow previews.
    const fit = Math.max(1, 1.1 / camera.aspect);
    camera.position.sub(this.cameraTarget).multiplyScalar(fit).add(this.cameraTarget);
    camera.lookAt(this.cameraTarget);
  }

  private render() {
    if (!this.overlay || !this.stage || !this.presentation) return;
    const g = this.game, t = this.elapsed, night = t >= ENDING.nightAt, presenting = t >= ENDING.presentationAt;
    g.renderer.useScene(presenting ? this.presentation.scene : night ? this.stage.scene : null);
    g.player.avatar.root.visible = !night;
    this.sign.visible = !night;
    if (!night) {
      this.lastLetter.position.set(4.65, .96, THREE.MathUtils.lerp(1.05, 0, ramp(t, 0, 1.1)));
      this.sign.updateMatrixWorld(true);
      g.player.avatar.root.position.copy(this.sign.localToWorld(new THREE.Vector3(5.5, 0, 2.1)));
      g.player.avatar.root.rotation.y = this.sign.rotation.y + Math.PI;
      g.player.avatar.poseArms(-1.4 * (1 - ramp(t, 1.2, 2)), 0);
      const vectors = [[-9, 5.8, 18], [-8, 6.4, 20], [0, 2, 0], [.3, 2, 0]].map(p => this.sign.localToWorld(new THREE.Vector3(...p as [number, number, number])).toArray());
      this.shot(vectors[0], vectors[1], vectors[2], vectors[3], ramp(t, 0, 3.7));
      g.world.updateSun(this.cameraTarget);
    } else if (presenting) {
      this.presentation.update(t, g.renderer.renderer, this.stage);
      this.presentation.frame(g.renderer.camera, t);
    } else {
      this.stage.update(t);
      if (t < 6) this.shot([17, 10, 24], [15, 9, 22], [0, 3, 0], [0, 3, 0], ramp(t, 4, 6));
      else if (t < 12) this.shot([-3.8, 3.7, 10], [-3.0, 3.8, 9.5], [-3.2, 2.5, .25], [-2.8, 2.65, .4], ramp(t, 6, 12));
      else if (t < 20) this.shot([-3.0, 3.8, 9.5], [0, 14, 16], [-2.8, 2.65, .4], [0, 20, -3], ramp(t, 12, 14));
      else if (t < 25) this.shot([14, 7, 20], [12, 6.5, 19], [2.4, 2.8, .2], [2.4, 2.8, .2], ramp(t, 20, 25));
      else this.shot([-3.5, 3.3, 10], [-3.5, 3.3, 10], [-3.0, 2.5, .2], [-3.0, 2.5, .2], 0);
    }
    const black = Math.max(ramp(t, 3.65, 3.97) * (1 - ramp(t, 4.05, 4.3)), ramp(t, 28, 28.4) * (1 - ramp(t, 28.4, 28.9)), ramp(t, 39.4, 40));
    (this.overlay.querySelector('.oc-black') as HTMLElement).style.opacity = String(black);
    // The title is now physically on the STC screen, making the pullback continuous.
    (this.overlay.querySelector('.oc-title') as HTMLElement).style.opacity = '0';
    (this.overlay.querySelector('.oc-location') as HTMLElement).style.opacity = String(ramp(t, 4.25, 4.5) * (1 - ramp(t, 5.7, 6)));
    const cue = ENDING.cues.findIndex(c => t >= c.start && t < c.end);
    if (cue !== this.lastCue) {
      this.lastCue = cue;
      this.overlay.querySelector<HTMLElement>('.oc-subtitles')!.hidden = cue < 0;
      if (cue >= 0) { this.overlay.querySelector('.oc-text')!.textContent = ENDING.cues[cue].text; this.game.voice.speak('Elder David A. Bednar', ENDING.cues[cue].text); }
    }
  }

  private finish() {
    if (!this.active || this.completed) return;
    this.game.voice.stop();
    this.elapsed = ENDING.duration; this.completed = true; this.paused = false;
    this.stage?.bednar.mouthOpen(0);
    this.overlay?.remove(); this.overlay = undefined;
    if (!this.previewing) { this.game.finaleReached = true; this.game.save(); }
    this.showMenu();
  }

  private showMenu() {
    const g = this.game;
    g.ui.menu(ENDING.title, [
      { label: 'Replay ending', action: () => {
        g.ui.clear(); this.elapsed = 0; this.completed = false; this.paused = false; this.lastCue = -2;
        this.skipNextFrame = true;
        this.buildOverlay(); this.render();
      } },
      ...(!this.previewing ? [{ label: 'Keep exploring', action: () => {
        this.stop(); g.mode = 'playing'; g.player.speed = 0;
        g.cameraRig.reset(g.player.yaw); g.cameraRig.snap(g.player.position);
        g.ui.showHud(true); g.save();
      } }] : []),
      { label: 'Title screen', action: () => {
        if (this.previewing) { this.stop(); g.showTitle(); } else g.quitToTitle(true);
      } },
    ], { subtitle: ENDING.subtitle, className: 'ending-menu' });
  }

  stop() {
    if (!this.active || !this.saved) return;
    const g = this.game, s = this.saved;
    this.active = false; this.completed = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.overlay?.remove(); this.overlay = undefined; g.ui.clear();
    g.renderer.useScene(null); this.sign.removeFromParent();
    g.player.avatar.root.position.copy(s.playerPosition); g.player.avatar.root.rotation.y = s.playerRotation;
    g.player.avatar.root.visible = s.playerVisible; g.player.avatar.poseArms(0);
    if (this.previewing) { g.world.gateBuilt = s.gateBuilt; g.world.refreshBuildings(); }
    g.world.setEra(this.previewing ? s.era : GAME_CONFIG.story.finaleEra);
    g.renderer.setColor(this.previewing ? s.color : 1, true);
    if (this.previewing) { g.colorStage = s.colorStage; g.finaleReached = s.reached; }
    g.world.campusSignGroup.visible = s.signs; g.world.exterior.visible = s.exterior;
    for (const sign of s.questSigns) sign.object.visible = sign.visible;
    g.interiors.show(g.spaceId === 'exterior' ? null : g.spaceId); g.npcs.setVisible(g.spaceId === 'exterior');
    g.renderer.camera.position.copy(s.camera); g.renderer.camera.quaternion.copy(s.quaternion); g.renderer.camera.up.copy(s.cameraUp);
    g.overhead = s.overhead; this.saved = undefined; this.previewing = false;
  }
}
