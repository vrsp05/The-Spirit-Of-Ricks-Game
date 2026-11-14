// Game orchestrator: wires world, player, input, UI, quests, interiors, save and finale.
import * as THREE from 'three';
import { GAME_CONFIG, type Anchor } from './config/game.config';
import { InputManager } from './input/actions';
import { KeyboardMouseSource } from './input/keyboardMouse';
import { GamepadHub, WebBluetoothController } from './input/transports';
import { MockController } from './input/mockController';
import { InteractionSystem, type InteractableDef } from './interact/interactables';
import { InteriorManager } from './interiors/interiors';
import { Avatar, makeLabel } from './player/Avatar';
import { CameraRig } from './player/CameraRig';
import { PlayerController, type Space } from './player/PlayerController';
import { QuestManager, QUEST_ORDER, freshQuestState, voxelBox } from './quests/QuestManager';
import type { QuestId } from './quests/contract';
import { createQuestModules } from './quests';
import { Renderer } from './render/Renderer';
import { clearSave, loadSave, writeSave, type SaveData } from './save/save';
import { STORY } from './story/story';
import { esc, UI } from './ui/ui';
import { CAMPUS, everOccupied, nudgeFree, PATH_KINDS, pointInPoly, terrainHeight, toGame } from './world/campusData';
import { GolfCart } from './player/GolfCart';
import { ERAS, type EraId } from './world/eras';
import { makeDoor, World } from './world/World';
import { NpcCrowd } from './world/Npcs';
import { Finale } from './finale/finale';

type Mode = 'title' | 'playing' | 'finale';
type At = string | { x: number; z: number; space?: string };

export class Game {
  readonly renderer: Renderer;
  readonly world: World;
  readonly interiors: InteriorManager;
  readonly player: PlayerController;
  readonly cameraRig: CameraRig;
  readonly input = new InputManager();
  readonly gamepads: GamepadHub;
  readonly ble: WebBluetoothController[] = [];
  readonly mocks: MockController[] = [];
  readonly ui: UI;
  readonly interactions: InteractionSystem;
  readonly quests: QuestManager;
  readonly finale: Finale;
  mode: Mode = 'title';
  difficulty = GAME_CONFIG.difficulty.default;
  colorStage = 0;
  introSeen = false;
  finaleReached = false;
  spaceId = 'exterior';
  private exteriorSpace: Space;
  private clock = new THREE.Clock();
  private titleT = 0;
  private autosaveT = 0;
  private busy = false;     // scripted sequence in progress
  devHooks: ((dt: number) => void)[] = [];
  /** Dev: top-down camera for accuracy comparison screenshots (north up). */
  overhead: { x: number; z: number; span: number } | null = null;
  readonly carts: { cart: GolfCart; id: string }[] = [];
  npcs!: NpcCrowd;
  /** Enterable doors (shown on the minimap / map). */
  readonly entrances: { id: string; x: number; z: number; eras: EraId[] | null; label: string }[] = [];
  private coins: { id: string; mesh: THREE.Object3D; x: number; z: number }[] = [];
  collectedCoins = new Set<string>();
  private markers: THREE.Object3D[] = [];
  private markerT = 0;

  constructor(container: HTMLElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(container);
    this.world = new World(this.renderer.scene);
    this.interiors = new InteriorManager(this.renderer.scene);
    this.player = new PlayerController(this.renderer.scene);
    this.cameraRig = new CameraRig(this.renderer.camera);
    this.ui = new UI(uiRoot);
    this.input.add(new KeyboardMouseSource(this.renderer.canvas));
    this.gamepads = new GamepadHub(this.input);
    if (WebBluetoothController.supported()) for (let i = 0; i < 2; i++) this.ble.push(new WebBluetoothController(i, this.input));
    this.exteriorSpace = {
      id: 'exterior', interior: false,
      blocked: (x, z, r) => this.world.blocked(x, z, r) || (!this.player.noclip && !!this.npcs?.hit(x, z, r)),
      groundY: (x, z) => this.world.groundY(x, z),
      occluderTop: (x, z) => this.world.grid.topAt(x, z),
    };
    this.interactions = new InteractionSystem(
      at => this.resolve(at),
      (obj, x, z, space) => { obj.position.set(x, this.groundAt(x, z, space), z); this.renderer.scene.add(obj); },
      obj => obj.removeFromParent(),
    );
    this.quests = new QuestManager({
      ui: { dialogue: l => this.ui.dialogue(l), panel: s => this.ui.panel(s), custom: (t, r, o) => this.ui.custom(t, r, o), toast: t => this.ui.toast(t) },
      world: {
        era: () => this.world.era,
        location: id => this.location(id),
        terrainHeight: (x, z) => terrainHeight(x, z),
        addObject: (obj, at) => { const p = this.resolve(at); obj.position.set(p.x, this.groundAt(p.x, p.z, p.space), p.z); this.renderer.scene.add(obj); return () => obj.removeFromParent(); },
        voxel: voxelBox,
        npc: o => { const a = new Avatar({ shirt: o.shirt ?? '#6b5b95', pants: o.pants ?? '#333', hair: o.hair ?? '#3b2a20', skin: o.skin ?? '#d9a982' }); a.setLabel(o.label, o.sub); return a.root; },
        label: (t, s) => makeLabel(t, s),
      },
      addInteractable: d => this.interactions.add(d),
      removeInteractable: id => this.interactions.remove(id),
      difficulty: () => this.difficulty,
      onCompleted: id => this.onQuestCompleted(id),
      onFailed: () => this.save(),
      onTargetsChanged: () => { this.world.refreshBuildings(); if (this.spaceId === 'exterior') this.unstick(); },
      persist: () => this.save(),
    });
    for (const m of createQuestModules()) this.quests.register(m);
    this.finale = new Finale(this);
    this.world.onEraChanged.push(era => this.quests.eraChanged(era));
    this.world.gateBuilt = id => this.gateBuilt(id);
    const sp = this.resolve('spawn');
    this.player.place(this.exteriorSpace, sp.x, sp.z, this.location('spawn').yaw ?? 0);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    this.setupCoreInteractables();
    this.setupCarts();
    this.npcs = new NpcCrowd(this.renderer.scene);
    this.setupCoins();
    this.setupMarkers();
    this.clearTrees();
    this.showTitle();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------- locations ----------------
  location(id: string): Anchor {
    const a = GAME_CONFIG.locations[id];
    if (!a) { console.warn('Unknown location', id); return { x: 0, z: 0 }; }
    return a;
  }
  /**
   * Anchor id or coordinates -> game position + space id.
   * Named anchors are real-world metres (scaled + snapped here); explicit coordinates are
   * already game metres (exterior) or room-local metres (interior).
   */
  resolve(at: At): { x: number; z: number; space: string } {
    if (typeof at === 'string') return this.resolveAnchor(at);
    const space = at.space ?? 'exterior';
    if (space !== 'exterior' && this.interiors.defs.has(space)) return { ...this.interiors.toWorld(space, at.x, at.z), space };
    return { x: at.x, z: at.z, space };
  }
  private anchorCache = new Map<string, { x: number; z: number; space: string }>();
  private resolveAnchor(id: string) {
    const hit = this.anchorCache.get(id); if (hit) return hit;
    const a = this.location(id), space = a.space ?? 'exterior';
    let out: { x: number; z: number; space: string };
    if (space !== 'exterior') out = { ...this.interiors.toWorld(space, a.x, a.z), space };
    else if (a.building) { const d = this.world.doorPlacement(a); const o = a.offset ?? 2.5; out = { x: d.x + d.nx * o, z: d.z + d.nz * o, space }; }
    else {
      // compaction may have grown a building over this spot: nudge clear (signs use the same rule)
      const isSign = GAME_CONFIG.signs.some(s => s.anchor === id);
      let [x, z] = toGame(a.x, a.z);
      if (isSign) [x, z] = nudgeFree(x, z, 3);
      else if (everOccupied(x, z, 1)) [x, z] = nudgeFree(x, z, 1);
      out = { x, z, space };
    }
    this.anchorCache.set(id, out); return out;
  }
  private groundAt(x: number, z: number, space: string) { return space === 'exterior' ? this.world.groundY(x, z) : 0; }
  /** Quest-gated buildings appear once their construction target is built (or the quest is done). */
  gateBuilt(buildingId: string): boolean {
    const t = (GAME_CONFIG.quests.construction.targets as { id: string; buildingId: string | null }[]).find(t => t.buildingId === buildingId);
    if (!t) return true;
    return this.quests.state.targets[`construction:${t.id}`] === 'built' || this.quests.status('construction') === 'completed';
  }
  get space(): Space { return this.spaceId === 'exterior' ? this.exteriorSpace : this.interiors.space(this.spaceId); }

  // ---------------- core interactables (quest giver, doors, finale) ----------------
  private setupCoreInteractables() {
    const qg = GAME_CONFIG.questGiver;
    const bednar = new Avatar({ shirt: '#ffffff', jacket: '#2b2f3a', pants: '#2b2f3a', tie: '#7a2b2b', hair: '#6d655c', skin: '#e0b896' });
    bednar.setLabel(qg.displayName, qg.subtitle);
    const allEras = Object.keys(ERAS) as EraId[];
    this.interactions.add({
      id: 'core:quest-giver', kind: 'npc', at: qg.anchor, radius: 3.8, visual: bednar.root,
      eras: allEras.filter(e => !qg.hiddenInEras.includes(e)),
      prompt: () => `Talk to ${qg.displayName}`,
      objective: () => !this.quests.active() && !this.quests.allComplete(),
      onInteract: () => this.talkToQuestGiver(),
    });
    const bl = this.location(qg.anchor); bednar.root.rotation.y = bl.yaw ?? 0;

    for (const [id, def] of this.interiors.defs) {
      const cfg = (GAME_CONFIG.interiors as any)[id] as { eras: EraId[] | null; label: string };
      const anchor = this.location(def.exteriorDoor);
      const d = this.world.doorPlacement(anchor);
      const door = makeDoor(true);
      const tag = makeLabel('ENTRANCE', def.label.split(' — ')[0]); tag.scale.multiplyScalar(1.7); tag.position.set(0, 5.6, 0.6); door.add(tag);
      door.rotation.y = Math.atan2(d.nx, d.nz);
      this.entrances.push({ id, x: d.x, z: d.z, eras: cfg.eras, label: def.label.split(' — ')[0] });
      // The door visual sits on the wall; the interaction point is just outside.
      this.interactions.add({
        id: `core:door-${id}`, kind: 'door', at: { x: d.x + d.nx * 1.8, z: d.z + d.nz * 1.8 }, radius: 2.6,
        eras: cfg.eras, prompt: `Enter: ${def.label}`,
        onInteract: () => this.enterInterior(id),
      });
      this.interactions.add({ id: `core:doorvis-${id}`, kind: 'generic', at: { x: d.x + d.nx * 0.75, z: d.z + d.nz * 0.75 }, radius: 0, eras: cfg.eras, visual: door, prompt: '', onInteract: () => {} });
      // Coordinates tagged with an interior space are room-local.
      this.interactions.add({ id: `core:exit-${id}`, kind: 'door', at: { x: 0, z: def.depth / 2 - 0.6, space: id }, radius: 2.4, prompt: 'Exit to campus', onInteract: () => this.exitInterior() });
    }
    // Finale trigger inside the STC (approximate celebration hall)
    const stage = { x: 0, z: -9 };
    const marker = new THREE.Group();
    const ring = voxelBox(3, 0.1, 3, '#ffd34d'); ring.position.y = 0.05; marker.add(ring);
    this.interactions.add({
      id: 'core:finale', kind: 'finale', at: { ...stage, space: 'stc-first-floor' }, radius: 3, visual: marker,
      enabled: () => this.quests.allComplete() && this.mode !== 'finale', objective: () => true,
      prompt: 'Join the celebration', onInteract: () => this.finale.start(),
    });
  }

  // ---------------- golf carts ----------------
  private setupCarts() {
    for (const id of Object.keys(GAME_CONFIG.locations).filter(k => k.startsWith('cart-'))) {
      const cart = new GolfCart(id), p = this.resolve(id);
      cart.root.position.set(p.x, this.world.groundY(p.x, p.z), p.z); cart.root.rotation.y = this.location(id).yaw ?? 0;
      this.renderer.scene.add(cart.root);
      this.carts.push({ cart, id });
      this.interactions.add({
        id: `core:${id}`, kind: 'generic', at: { x: p.x, z: p.z }, radius: 2.8,
        enabled: () => !this.player.vehicle, prompt: 'Drive the golf cart',
        onInteract: () => this.enterCart(cart, id),
      });
    }
  }
  private enterCart(cart: GolfCart, id: string) {
    this.player.vehicle = cart; this.player.yaw = cart.root.rotation.y; this.player.avatar.sit(true);
    this.player.position.copy(cart.root.position);
    this.interactions.remove(`core:${id}`);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.distance = 14;
    this.ui.toast('W/S drive · A/D steer · E to get out');
  }
  exitCart() {
    const cart = this.player.vehicle; if (!cart) return;
    const entry = this.carts.find(c => c.cart === cart)!;
    this.player.vehicle = null; cart.speed = 0; this.player.avatar.sit(false);
    // step out to the side
    const sx = Math.cos(this.player.yaw) * 1.8, sz = -Math.sin(this.player.yaw) * 1.8;
    const p = this.player.position, side = !this.exteriorSpace.blocked(p.x + sx, p.z + sz, 0.45) ? 1 : -1;
    this.player.place(this.exteriorSpace, p.x + sx * side, p.z + sz * side, this.player.yaw);
    this.unstick();
    this.interactions.add({
      id: `core:${entry.id}`, kind: 'generic', at: { x: cart.root.position.x, z: cart.root.position.z }, radius: 2.8,
      enabled: () => !this.player.vehicle, prompt: 'Drive the golf cart', onInteract: () => this.enterCart(cart, entry.id),
    });
  }

  /** Keep trees off NPCs, doors, carts, coins, signs and quest objects. */
  private clearTrees() {
    const pts: { x: number; z: number; r: number }[] = [];
    for (const it of this.interactions.items.values()) if (it.space === 'exterior') pts.push({ x: it.x, z: it.z, r: Math.max(2, it.radius ?? 2) });
    for (const c of this.carts) pts.push({ x: c.cart.root.position.x, z: c.cart.root.position.z, r: 2.5 });
    for (const c of this.coins) pts.push({ x: c.x, z: c.z, r: 1 });
    for (const w of this.npcs?.walkers ?? []) for (const p of w.route) pts.push({ x: p[0], z: p[1], r: 0.5 });
    for (const s of GAME_CONFIG.signs) { const p = this.resolve(s.anchor); pts.push({ x: p.x, z: p.z, r: 4 }); }
    this.world.clearTreesAround(pts);
  }

  // ---------------- coins (just for fun) ----------------
  private setupCoins() {
    let s = 4242; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const paths = CAMPUS.roads.filter(r => PATH_KINDS.has(r.kind) && r.pts.length > 1);
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10), mat = new THREE.MeshLambertMaterial({ color: '#ffcc33', emissive: '#6b4a00' });
    for (let tries = 0; tries < 4000 && this.coins.length < GAME_CONFIG.coins.count; tries++) {
      const r = paths[(rnd() * paths.length) | 0], i = (rnd() * (r.pts.length - 1)) | 0, t = rnd();
      const x = r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * t, z = r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * t;
      if (!CAMPUS.campus.some(c => pointInPoly(x, z, c)) || everOccupied(x, z, 1)) continue;
      if (this.coins.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < 18 * 18)) continue;
      const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = Math.PI / 2; mesh.castShadow = true;
      const holder = new THREE.Group(); holder.add(mesh); holder.position.set(x, this.world.groundY(x, z) + 1, z);
      this.renderer.scene.add(holder);
      this.coins.push({ id: `coin-${this.coins.length}`, mesh: holder, x, z });
    }
  }
  private updateCoins(dt: number) {
    const p = this.player.position, R = GAME_CONFIG.coins.radius + (this.player.vehicle ? 1 : 0);
    for (const c of this.coins) {
      const show = this.spaceId === 'exterior' && !this.collectedCoins.has(c.id);
      c.mesh.visible = show; if (!show) continue;
      c.mesh.rotation.y += dt * 3;
      if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < R * R && Math.abs(c.mesh.position.y - 1 - p.y) < 2.5) {
        this.collectedCoins.add(c.id);
        this.ui.toast(`+1 coin (${this.collectedCoins.size}/${this.coins.length})`, 1500);
      }
    }
  }

  // ---------------- objective markers ----------------
  private setupMarkers() {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffd34d' });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.35), mat); bar.position.y = 0.75;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat); dot.position.y = 0;
      g.add(bar, dot); g.visible = false; this.renderer.scene.add(g); this.markers.push(g);
    }
  }
  /** All interactables currently flagged as objectives, in the current space+era. */
  private objectiveItems() {
    return [...this.interactions.items.values()].filter(it => it.objective?.() && (!it.eras || it.eras.includes(this.world.era)) && (it.enabled ? it.enabled() : true));
  }
  private updateMarkers(dt: number) {
    this.markerT += dt;
    const items = this.objectiveItems().filter(it => it.space === this.spaceId);
    this.markers.forEach((m, i) => {
      const it = items[i]; m.visible = !!it && this.mode === 'playing';
      if (!it) return;
      m.position.set(it.x, this.groundAt(it.x, it.z, it.space) + 3.9 + Math.sin(this.markerT * 3 + i) * 0.25, it.z);
      m.rotation.y = this.markerT * 1.5;
    });
  }
  private markerPoints(): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = [];
    for (const it of this.objectiveItems()) {
      const p = this.targetPoint({ x: it.x, z: it.z, space: it.space === 'exterior' ? undefined : '__world:' + it.space });
      if (p && !pts.some(q => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.z - p.z) < 0.5)) pts.push(p);
    }
    return pts;
  }
  private targetLabel(t: At | null): string | null {
    if (!t || typeof t !== 'string') return null;
    const a = this.location(t), space = a.space ?? 'exterior';
    if (space !== this.spaceId && space !== 'exterior') return this.interiors.defs.get(space)?.label.split(' — ')[0] ?? null;
    return a.label?.replace(/^DEV:\s*/, '').replace(/\s*\(.*\)$/, '') ?? null;
  }

  private npcTalking = false;
  private async talkToNpc(w: NpcCrowd['walkers'][number]) {
    if (this.npcTalking) return;
    this.npcTalking = true; this.busy = true; w.talking = 6;
    const lines = GAME_CONFIG.npcs.lines[ERAS[this.world.era].institution === 'byui' ? 'present' : 'ricks'];
    const line = lines[(Math.random() * lines.length) | 0];
    try { await this.ui.dialogue([{ speaker: GAME_CONFIG.npcs.title, text: line }]); } finally { this.busy = false; this.npcTalking = false; w.talking = 1.5; }
  }

  async talkToQuestGiver() {
    const active = this.quests.active();
    if (active) { await this.ui.dialogue(this.quests.reminder(active)); return; }
    const next = this.quests.nextAvailable();
    if (next) {
      if (next === 'professors') await this.ui.dialogue(STORY.bednarGreeting());
      await this.ui.dialogue(this.quests.briefing(next));
      this.quests.start(next);
      this.ui.toast(`New assignment: ${this.quests.modules.get(next)?.title}`);
      return;
    }
    if (this.quests.allComplete()) await this.ui.dialogue(STORY.allQuestsDone());
  }

  // ---------------- story progression ----------------
  private async onQuestCompleted(id: QuestId) {
    this.busy = true;
    try {
      this.colorStage = this.quests.completedCount();
      this.renderer.setColor(GAME_CONFIG.colorStages[this.colorStage] ?? 1);
      this.ui.toast(this.colorStage >= QUEST_ORDER.length ? STORY.fullColorToast : STORY.colorToast, 4500);
      this.save();
      await new Promise(r => setTimeout(r, 1800));
      const nextEra = GAME_CONFIG.story.eraAfterQuest[id];
      if (nextEra && nextEra !== this.world.era) await this.timeTransition(nextEra);
      if (this.quests.allComplete()) {
        await this.ui.dialogue(STORY.allQuestsDone());
        await this.timeTransition(GAME_CONFIG.story.finaleEra, STORY.presentDaySubtitle);
      }
      this.save();
    } finally { this.busy = false; }
  }

  async timeTransition(era: EraId, subtitle?: string) {
    if (this.player.vehicle) this.exitCart();
    if (this.spaceId !== 'exterior') await this.exitInterior(true);
    await this.ui.card(ERAS[era].cardTitle, subtitle ?? ERAS[era].label, 2600);
    this.setEra(era);
  }

  setEra(era: EraId) {
    this.world.setEra(era);
    if (this.spaceId === 'exterior') this.unstick();
  }
  /** After an era change a new building may occupy the player's spot — move to the nearest free point. */
  private unstick() {
    const p = this.player.position, r = GAME_CONFIG.player.radius;
    if (!this.exteriorSpace.blocked(p.x, p.z, r)) return;
    for (let rad = 2; rad < 120; rad += 2) for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
      if (!this.exteriorSpace.blocked(x, z, r)) { this.player.place(this.exteriorSpace, x, z); return; }
    }
  }

  // ---------------- interiors ----------------
  async enterInterior(id: string) {
    if (this.player.vehicle) this.exitCart();
    await this.ui.fade(() => {
      this.spaceId = id; this.world.exterior.visible = false; this.interiors.show(id);
      const p = this.interiors.entryPoint(id);
      this.player.place(this.interiors.space(id), p.x, p.z, Math.PI);
      this.cameraRig.reset(Math.PI); this.cameraRig.pitch = 0.9; this.cameraRig.distance = 9; this.cameraRig.snap(this.player.position);
    });
    this.save();
  }
  async exitInterior(instant = false) {
    const id = this.spaceId; if (id === 'exterior') return;
    const go = () => {
      const def = this.interiors.defs.get(id)!;
      const d = this.world.doorPlacement(this.location(def.exteriorDoor));
      this.spaceId = 'exterior'; this.interiors.show(null); this.world.exterior.visible = true;
      this.player.place(this.exteriorSpace, d.x + d.nx * 3, d.z + d.nz * 3, Math.atan2(d.nx, d.nz));
      this.unstick();
      this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    };
    if (instant) go(); else await this.ui.fade(go);
    this.save();
  }

  // ---------------- objective / navigation ----------------
  currentObjective(): { text: string; target: At | null } {
    if (this.finaleReached) return { text: 'Celebrate!', target: null };
    if (this.quests.allComplete()) {
      if (this.world.era !== GAME_CONFIG.story.finaleEra) return { text: 'Travelling to the present day…', target: null };
      return this.spaceId === 'stc-first-floor'
        ? { text: 'Walk into the celebration hall', target: { x: 0, z: -9, space: 'stc-first-floor' } }
        : { text: 'Go to the Science and Technology Center', target: 'door-stc' };
    }
    const o = this.quests.objective();
    if (o) return { text: o.text, target: o.target };
    return { text: `Talk to ${GAME_CONFIG.questGiver.displayName} in ${GAME_CONFIG.questGiver.where}`, target: GAME_CONFIG.questGiver.anchor };
  }
  private targetPoint(t: At | null): { x: number; z: number } | null {
    if (!t) return null;
    let p: { x: number; z: number; space: string };
    if (typeof t !== 'string' && t.space?.startsWith('__world:')) p = { x: t.x, z: t.z, space: t.space.slice(8) };
    else p = this.resolve(t);
    if (p.space === this.spaceId) return p;
    if (this.spaceId === 'exterior' && this.interiors.defs.has(p.space)) {
      const d = this.world.doorPlacement(this.location(this.interiors.defs.get(p.space)!.exteriorDoor)); return { x: d.x, z: d.z };
    }
    if (this.spaceId !== 'exterior') return this.interiors.exitPoint(this.spaceId);
    return null;
  }

  // ---------------- save ----------------
  snapshot(): SaveData {
    return {
      version: 2, savedAt: '', difficulty: this.difficulty, era: this.world.era, colorStage: this.colorStage,
      quests: this.quests.state.quests, targets: this.quests.state.targets,
      player: { space: this.spaceId, x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw },
      coins: [...this.collectedCoins],
      introSeen: this.introSeen, finaleReached: this.finaleReached,
    };
  }
  save() { if (this.mode !== 'title') writeSave(this.snapshot()); }

  newGame(difficulty: string) {
    this.difficulty = difficulty; this.colorStage = 0; this.introSeen = false; this.finaleReached = false;
    this.collectedCoins.clear(); if (this.player.vehicle) this.exitCart();
    this.quests.init(freshQuestState());
    this.world.refreshBuildings();
    this.clearTrees();
    this.setEra(GAME_CONFIG.story.startEra);
    this.renderer.setColor(GAME_CONFIG.colorStages[0], true);
    if (this.spaceId !== 'exterior') { this.spaceId = 'exterior'; this.interiors.show(null); this.world.exterior.visible = true; }
    const s = this.resolve('spawn');
    this.player.place(this.exteriorSpace, s.x, s.z, this.location('spawn').yaw ?? 0);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    this.beginPlay(true);
  }
  continueGame(d: SaveData) {
    this.difficulty = d.difficulty; this.colorStage = d.colorStage; this.introSeen = d.introSeen; this.finaleReached = false;
    this.collectedCoins = new Set(d.coins ?? []); if (this.player.vehicle) this.exitCart();
    this.quests.init({ quests: d.quests, targets: d.targets ?? {} });
    this.world.refreshBuildings();
    this.clearTrees();
    this.setEra(d.era);
    this.renderer.setColor(GAME_CONFIG.colorStages[d.colorStage] ?? 1, true);
    if (!d.player) { const sp = this.resolve('spawn'); d.player = { space: 'exterior', x: sp.x, z: sp.z, yaw: this.location('spawn').yaw ?? 0 }; }
    if (d.player.space !== 'exterior' && this.interiors.defs.has(d.player.space)) {
      this.spaceId = d.player.space; this.world.exterior.visible = false; this.interiors.show(d.player.space);
      this.player.place(this.interiors.space(d.player.space), d.player.x, d.player.z, d.player.yaw);
    } else {
      this.spaceId = 'exterior'; this.interiors.show(null); this.world.exterior.visible = true;
      this.player.place(this.exteriorSpace, d.player.x, d.player.z, d.player.yaw); this.unstick();
    }
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    this.beginPlay(false);
  }
  private async beginPlay(intro: boolean) {
    this.ui.clear(); this.mode = 'playing'; this.ui.showHud(true);
    if (intro && !this.introSeen) {
      this.busy = true;
      await this.ui.card(ERAS[GAME_CONFIG.story.startEra].cardTitle, STORY.introSubtitle, 3200);
      this.introSeen = true; this.busy = false;
    }
    this.save();
  }

  // ---------------- menus ----------------
  showTitle() {
    this.mode = 'title'; this.ui.clear(); this.ui.showHud(false);
    const save = loadSave();
    const s = this.ui.menu(GAME_CONFIG.title, [
      { label: save ? `Continue (${ERAS[save.era]?.label ?? save.era})` : 'Continue', disabled: !save, action: () => save && this.continueGame(save) },
      { label: 'New game', action: () => this.chooseDifficulty() },
      { label: 'Controls', action: () => this.showControls() },
      { label: 'Controllers', action: () => this.showControllers() },
      { label: 'Reset saved game', disabled: !save, action: () => this.confirmReset() },
    ], { subtitle: GAME_CONFIG.disclaimer, className: 'title-screen', footer: `Map data © OpenStreetMap contributors (ODbL) · elevation USGS 3DEP · see docs/sources.md` });
    void s;
  }
  private chooseDifficulty() {
    const s = this.ui.menu('Choose difficulty', GAME_CONFIG.difficulty.options.map(o => ({
      label: o.label + (o.id === GAME_CONFIG.difficulty.default ? ' (default)' : ''), action: () => { this.ui.pop(s); this.newGame(o.id); },
    })), { subtitle: 'Difficulty effects are not decided yet; quests can read this setting.', onBack: () => this.ui.pop(s) });
  }
  private confirmReset() {
    const s = this.ui.menu('Reset saved game?', [
      { label: 'Yes, delete my local save', action: () => { clearSave(); this.ui.pop(s); this.mode === 'title' ? this.showTitle() : this.quitToTitle(false); } },
      { label: 'Cancel', action: () => this.ui.pop(s) },
    ], { onBack: () => this.ui.pop(s) });
  }
  showControls() {
    const rows = [
      ['Move', 'W A S D / arrows', 'Left stick'], ['Sprint', 'Hold Shift', 'Left stick click (toggle)'], ['Jump', 'Space', 'Button 2'],
      ['Golf cart', 'E to get in/out · W/S drive · A/D steer', 'Button 1 · left stick'],
      ['Camera', 'Drag mouse · wheel zoom · C reset', 'Right stick · right click reset'],
      ['Interact / confirm', 'E · Enter · Space', 'Button 1'], ['Back', 'Esc · Backspace', 'Button 2'],
      ['Map / objective', 'M', 'Button 3'], ['Pause', 'Esc', 'Button 4'], ['Menus', 'Arrows/WASD + Enter, or mouse', 'Left stick + Button 1'],
    ];
    const html = `<table><tr><th>Action</th><th>Keyboard / mouse</th><th>Controller</th></tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const s = this.ui.menu('Controls', [{ label: 'Back', action: () => this.ui.pop(s) }], { html, onBack: () => this.ui.pop(s) });
  }
  showControllers() {
    const html = `<div class="ctrl-status"></div><p class="sub">Two controllers can play at once; either one moves the same player. Transport (custom BLE vs. BLE HID gamepad) is not decided yet — see docs/controller-protocol.md.</p>`;
    const items = [
      ...this.ble.map((b, i) => ({ label: `Pair BLE controller ${i + 1} (custom protocol)`, action: () => { b.pair().catch(e => this.ui.toast(String(e.message ?? e))); } })),
      { label: 'Calibrate connected controllers (centre sticks first)', action: () => { this.allControllers().forEach(c => c.calibrate()); this.ui.toast('Calibrated.'); } },
      { label: 'Back', action: () => this.ui.pop(s) },
    ];
    const s = this.ui.menu('Controllers', items, { html, onBack: () => this.ui.pop(s) });
    const box = s.el.querySelector('.ctrl-status')!;
    const paint = () => {
      box.innerHTML = `<table>${this.input.statuses().map(st => `<tr><td>${esc(st.label)}</td><td>${st.connected ? '🟢 connected' : '⚪ ' + esc(st.detail ?? 'not connected')}</td></tr>`).join('')}
        ${!WebBluetoothController.supported() ? '<tr><td colspan=2>Web Bluetooth unavailable in this browser (Chrome/Edge desktop support it). Keyboard always works.</td></tr>' : ''}</table>`;
    };
    paint(); const t = setInterval(paint, 500); s.cleanup = () => clearInterval(t);
  }
  allControllers() { return [...this.gamepads.list(), ...this.ble.map(b => b.device), ...this.mocks.map(m => m.device)]; }

  showPause() {
    this.quests.suspendAll();
    const close = () => { this.ui.pop(s); this.quests.resumeAll(); };
    const s = this.ui.menu('Paused', [
      { label: 'Resume', action: close },
      { label: 'Controls', action: () => this.showControls() },
      { label: 'Controllers', action: () => this.showControllers() },
      { label: 'Skip current quest', disabled: this.quests.allComplete(), action: () => this.confirmSkip() },
      { label: 'Save game', action: () => { this.save(); this.ui.toast('Game saved in this browser.'); } },
      { label: 'Save and quit to title', action: () => this.quitToTitle(true) },
      { label: 'Reset saved game', action: () => this.confirmReset() },
    ], { subtitle: `${ERAS[this.world.era].label} · difficulty: ${this.difficulty}`, onBack: close });
    s.onPause = close;
  }
  private confirmSkip() {
    const id = this.quests.active() ?? this.quests.nextAvailable(); if (!id) return;
    const title = this.quests.modules.get(id)?.title ?? id;
    const s = this.ui.menu(`Skip "${title}"?`, [
      { label: 'Yes, skip to the next quest', action: () => { this.ui.clear(); this.quests.resumeAll(); this.quests.forceComplete(id); } },
      { label: 'Cancel', action: () => this.ui.pop(s) },
    ], { subtitle: 'Counts the quest as completed (colour, era and buildings advance).', onBack: () => this.ui.pop(s) });
  }
  quitToTitle(save: boolean) { if (save) this.save(); this.finale.stop(); this.showTitle(); }

  // ---------------- frame loop ----------------
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.gamepads.update();
    this.input.update(dt);
    const a = this.input.state;
    for (const h of this.devHooks) h(dt);
    const uiBlocking = this.ui.update(a);

    if (this.mode === 'title') {
      this.markers.forEach(m => m.visible = false);
      this.npcs.setVisible(true); this.npcs.update(dt, new THREE.Vector3(1e6, 0, 1e6), (x, z, r) => this.world.blocked(x, z, r));
      this.titleT += dt * 0.05;
      const [tx, tz] = toGame(40, -150);
      const c = this.renderer.camera, center = new THREE.Vector3(tx, 0, tz);
      c.position.set(center.x + Math.sin(this.titleT) * 140, 85, center.z + Math.cos(this.titleT) * 140);
      c.lookAt(center.x, 20, center.z);
      this.world.updateSun(center);
    } else if (this.mode === 'finale') {
      this.finale.update(dt);
      this.markers.forEach(m => m.visible = false);
      this.npcs.setVisible(false);
      this.interactions.update(this.player.position.x, this.player.position.z, this.spaceId, this.world.era); // refresh marker visibility
    } else {
      const canAct = !uiBlocking && !this.busy && !this.interactions.busy;
      this.player.update(dt, a, this.cameraRig.yaw, canAct);
      this.cameraRig.follow = !!this.player.vehicle;
      this.cameraRig.update(dt, uiBlocking ? null : a, this.player.position, this.space, this.player.yaw);
      this.world.updateSun(this.player.position);
      this.quests.update(dt);
      const focusRaw = this.interactions.update(this.player.position.x, this.player.position.z, this.spaceId, this.world.era);
      const focus = this.player.vehicle ? null : focusRaw;
      this.npcs.setVisible(this.spaceId === 'exterior');
      if (this.spaceId === 'exterior') this.npcs.update(dt, this.player.position, (x, z, r) => this.world.blocked(x, z, r) || Math.hypot(x - this.player.position.x, z - this.player.position.z) < r + 0.6);
      const npc = !focus && !this.player.vehicle && this.spaceId === 'exterior' ? this.npcs.nearest(this.player.position.x, this.player.position.z, 2.4) : null;
      this.updateCoins(dt); this.updateMarkers(dt);
      if (canAct) {
        if (this.player.vehicle && a.pressed('interact')) { a.consume('interact'); this.exitCart(); }
        else if (focus && a.pressed('interact')) { a.consume('interact'); void this.interactions.trigger(); }
        else if (npc && a.pressed('interact')) { a.consume('interact'); void this.talkToNpc(npc); }
        else if (a.pressed('pause')) { a.consume('pause'); this.showPause(); }
        else if (a.pressed('map') && this.spaceId === 'exterior') { a.consume('map'); this.ui.bigMap(() => {}); }
      }
      const obj = this.currentObjective();
      const interiorLabel = this.spaceId !== 'exterior' ? this.interiors.defs.get(this.spaceId)!.label : null;
      this.ui.updateHud({
        objective: obj.text, era: ERAS[this.world.era].label,
        prompt: canAct ? (this.player.vehicle ? 'Get out of the golf cart' : focus ? this.interactions.promptText(focus) : npc ? `Talk to ${GAME_CONFIG.npcs.title.toLowerCase()}` : null) : null,
        px: this.player.position.x, pz: this.player.position.z, pyaw: this.player.yaw, camYaw: this.cameraRig.yaw,
        map: this.world.mapCanvas, target: this.targetPoint(obj.target), interior: interiorLabel,
        markers: this.markerPoints(), targetLabel: this.targetLabel(obj.target),
        doors: this.spaceId === 'exterior' ? this.entrances.filter(e => !e.eras || e.eras.includes(this.world.era)) : [],
        coins: this.coins.length ? `● ${this.collectedCoins.size}/${this.coins.length} coins` : '', driving: !!this.player.vehicle,
      });
      this.autosaveT += dt; if (this.autosaveT > 20) { this.autosaveT = 0; this.save(); }
    }
    if (this.overhead) {
      const c = this.renderer.camera, o = this.overhead, h = o.span / 2 / Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
      c.position.set(o.x, h, o.z + 0.001); c.up.set(0, 0, -1); this.renderer.scene.fog = null; c.lookAt(o.x, 0, o.z); c.far = h + 500; c.updateProjectionMatrix();
    } else if (this.renderer.camera.up.z !== 0) { this.renderer.camera.up.set(0, 1, 0); this.renderer.scene.fog = this.renderer.fog; this.renderer.camera.far = 2500; this.renderer.camera.updateProjectionMatrix(); }
    this.renderer.render(dt);
    this.ui.setMapColor(this.renderer.colorAmount);
  }
}

export { CAMPUS };
export type { InteractableDef };
