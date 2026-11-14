// Present-day finale in the (approximate) STC celebration hall: four replaceable
// team avatars, confetti, editable text, replay / restart.
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { Avatar } from '../player/Avatar';
import { esc } from '../ui/ui';
import type { Game } from '../game';

export class Finale {
  private group = new THREE.Group();
  private avatars: Avatar[] = [];
  private confetti: THREE.InstancedMesh;
  private bits: { p: THREE.Vector3; v: THREE.Vector3; r: number }[] = [];
  private t = 0;
  private center = new THREE.Vector3();
  active = false;

  constructor(private game: Game) {
    const N = 300;
    this.confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }), N);
    const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ffffff'];
    for (let i = 0; i < N; i++) { this.confetti.setColorAt(i, new THREE.Color(colors[i % colors.length])); this.bits.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: Math.random() * 6 }); }
    this.group.add(this.confetti);
    GAME_CONFIG.finale.avatars.forEach(a => {
      const av = new Avatar({ shirt: a.shirt, pants: a.pants, hair: a.hair, skin: a.skin });
      av.setLabel(a.label); this.avatars.push(av); this.group.add(av.root);
    });
    this.group.visible = false;
    game.renderer.scene.add(this.group);
  }

  async start() {
    const g = this.game;
    g.finaleReached = true; g.save();
    await g.ui.fade(() => {
      const c = g.interiors.toWorld('stc-first-floor', 0, -10);
      this.center.set(c.x, 0, c.z);
      this.avatars.forEach((a, i) => { a.root.position.set(c.x - 4.5 + i * 3, 0.6, c.z - 3); a.root.rotation.y = 0; });
      g.player.place(g.interiors.space('stc-first-floor'), c.x, c.z + 3, Math.PI);
      this.bits.forEach(b => this.respawn(b, true));
      this.group.visible = true; this.active = true; this.t = 0;
      g.mode = 'finale'; g.ui.showHud(false);
    });
    this.showOverlay();
  }
  private showOverlay() {
    const g = this.game, F = GAME_CONFIG.finale;
    const s = g.ui.menu(F.headline, [
      { label: 'Replay celebration', action: () => { g.ui.pop(s); this.stop(); void this.start(); } },
      { label: 'Keep exploring (present day)', action: () => { g.ui.pop(s); this.stop(); g.mode = 'playing'; g.ui.showHud(true); } },
      { label: 'Start a new game', action: () => { g.ui.pop(s); this.stop(); g.newGame(g.difficulty); } },
      { label: 'Title screen', action: () => { g.ui.pop(s); g.quitToTitle(true); } },
    ], { html: `<p class="body">${esc(F.body)}</p>`, className: 'finale-overlay' });
    s.blocksWorld = true;
  }
  stop() { this.active = false; this.group.visible = false; }

  private respawn(b: { p: THREE.Vector3; v: THREE.Vector3; r: number }, initial = false) {
    b.p.set(this.center.x + (Math.random() - 0.5) * 16, initial ? Math.random() * 10 : 9 + Math.random() * 2, this.center.z - 3 + (Math.random() - 0.5) * 10);
    b.v.set((Math.random() - 0.5) * 0.6, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 0.6);
  }
  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    this.avatars.forEach((a, i) => {
      a.root.position.y = 0.6 + Math.abs(Math.sin(this.t * 4 + i)) * 0.6;
      a.wave(this.t + i); a.root.rotation.y = Math.sin(this.t * 1.5 + i) * 0.4;
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    this.bits.forEach((b, i) => {
      b.p.addScaledVector(b.v, dt); b.r += dt * 4; if (b.p.y < 0) this.respawn(b);
      q.setFromEuler(new THREE.Euler(b.r, b.r * 0.7, 0)); m.compose(b.p, q, new THREE.Vector3(1, 1, 1)); this.confetti.setMatrixAt(i, m);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
    const cam = this.game.renderer.camera, a = this.t * 0.25;
    cam.position.set(this.center.x + Math.sin(a) * 13, 7, this.center.z - 3 + Math.cos(a) * 13);
    cam.lookAt(this.center.x, 1.5, this.center.z - 3);
    this.game.world.updateSun(this.center);
  }
}
