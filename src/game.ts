// Game orchestrator: wires world, player, input, UI, quests, interiors, save and finale.
import * as THREE from 'three';
import { ATMOSPHERE } from './config/atmosphere';
import { MusicPlayer } from './fx/music';
import { Ambience } from './fx/ambience';
import { VoiceActor } from './fx/voice';
import { EngineSound, loadSamples, playStep } from './fx/audio';
import { Traffic } from './world/Traffic';
import { GAME_CONFIG, type Anchor, type DifficultyId } from './config/game.config';
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
import { CAMPUS, everOccupied, nudgeFree, obb, onVehicleRoad, PATH_KINDS, pointInPoly, terrainHeight, toGame } from './world/campusData';
import { Vehicle, type CarStyle } from './player/Vehicle';
import { ERAS, type EraId } from './world/eras';
import { makeDoor, World } from './world/World';
import { LineBag, NpcCrowd } from './world/Npcs';
import { Finale } from './finale/finale';
import { CutsceneRunner, type CutsceneSpec } from './cutscene/Cutscene';
import { Effects } from './fx/fireworks';
import { playSound } from './fx/audio';
import { SETTINGS, saveSettings } from './core/settings';
import type { Inspectable } from './quests/contract';
import { computeReward, type RewardReceipt } from './quests/rewards';
import { meshBuilding } from './world/voxelMesher';
import { BUILDINGS } from './world/buildingRegistry';
import { registryPoly } from './world/campusData';

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
  /** Team songs: menus + exploring; silent during cutscenes, time-jump cards and the finale. */
  readonly music = new MusicPlayer();
  readonly ambience = new Ambience();
  readonly voice = new VoiceActor();
  private engine = new EngineSound();
  traffic!: Traffic;
  private stepDist = 0;
  difficulty: DifficultyId = GAME_CONFIG.difficulty.default as DifficultyId;
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
  readonly carts: { cart: Vehicle; id: string }[] = [];   // all drivable vehicles (carts, cars, bikes)
  npcs!: NpcCrowd;
  /** Enterable doors (shown on the minimap / map). */
  readonly entrances: { id: string; x: number; z: number; eras: EraId[] | null; label: string }[] = [];
  private coins: { id: string; mesh: THREE.Object3D; x: number; z: number }[] = [];
  collectedCoins = new Set<string>();
  private markers: THREE.Object3D[] = [];
  private markerT = 0;
  cutscenes!: CutsceneRunner;
  bednar: Avatar | null = null;
  effects!: Effects;
  private inspectables = new Map<string, Inspectable>();
  inspectFocus: Inspectable | null = null;
  private camFocus: { from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private hudBtn: { label: string; fn: () => void; viaMap: boolean } | null = null;
  private pauseOpen = false;
  private connectedControllers = new Set<string>();
  readonly devMode = new URLSearchParams(location.search).has('dev');

  constructor(container: HTMLElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(container);
    this.world = new World(this.renderer.scene);
    this.renderer.setQuality(SETTINGS.graphics, this.world.sun);
    this.interiors = new InteriorManager(this.renderer.scene);
    this.player = new PlayerController(this.renderer.scene);
    this.cameraRig = new CameraRig(this.renderer.camera);
    this.ui = new UI(uiRoot);
    this.input.add(new KeyboardMouseSource(this.renderer.canvas));
    this.gamepads = new GamepadHub(this.input);
    if (WebBluetoothController.supported()) for (let i = 0; i < 2; i++) this.ble.push(new WebBluetoothController(i, this.input));
    this.exteriorSpace = {
      id: 'exterior', interior: false,
      blocked: (x, z, r) => this.world.blocked(x, z, r) || (!this.player.noclip && (!!this.npcs?.hit(x, z, r) || !!this.traffic?.hit(x, z, r))),
      groundY: (x, z) => this.world.groundY(x, z),
      occluderTop: (x, z) => this.world.grid.topAt(x, z),
    };
    this.interactions = new InteractionSystem(
      at => this.resolve(at),
      (obj, x, z, space) => { obj.position.set(x, this.groundAt(x, z, space), z); this.renderer.scene.add(obj); },
      obj => obj.removeFromParent(),
    );
    this.effects = new Effects(this.renderer.scene);
    this.cutscenes = new CutsceneRunner({
      camera: this.renderer.camera,
      subtitle: (line, hint) => this.ui.subtitle(line, hint),
      reducedMotion: () => SETTINGS.reducedMotion,
    });
    const pos3 = (p: { x: number; z: number; space: string }) => ({ ...p, y: this.groundAt(p.x, p.z, p.space) });
    this.quests = new QuestManager({
      ui: {
        dialogue: l => this.ui.dialogue(l), panel: s => this.ui.panel(s), custom: (t, r, o) => this.ui.custom(t, r, o), toast: t => this.ui.toast(t),
        setBanner: t => this.ui.setBanner(t),
        hudButton: (label, fn, viaMap = false) => { this.hudBtn = label && fn ? { label, fn, viaMap } : null; this.ui.setHudButton(label, fn); },
      },
      world: {
        era: () => this.world.era,
        location: id => this.location(id),
        position: id => pos3(this.resolve(id)),
        playerPosition: () => ({ x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, space: this.spaceId }),
        questGiverPosition: () => pos3(this.resolve(GAME_CONFIG.questGiver.anchor)),
        terrainHeight: (x, z) => terrainHeight(x, z),
        addObject: (obj, at) => { const p = this.resolve(at); obj.position.set(p.x, this.groundAt(p.x, p.z, p.space), p.z); this.renderer.scene.add(obj); return () => obj.removeFromParent(); },
        blueprintGhost: id => this.blueprintGhost(id),
        focusCamera: (from, to) => { this.camFocus = { from: new THREE.Vector3(from.x, from.y, from.z), to: new THREE.Vector3(to.x, to.y, to.z) }; },
        releaseCamera: () => { this.camFocus = null; },
        addInspectable: d => { this.inspectables.set(d.id, d); },
        removeInspectable: id => { this.inspectables.delete(id); },
        gatherCrowd: (x, z, sec) => this.npcs.gather(x, z, sec),
        fireworks: (x, y, z, sec) => this.effects.fireworks(x, y, z, sec, SETTINGS.reducedMotion),
        colorWave: (x, z) => { this.effects.colorWave(x, terrainHeight(x, z), z); this.renderer.setColor(1); },
        sound: n => playSound(n),
        reducedMotion: () => SETTINGS.reducedMotion,
        voxel: voxelBox,
        npc: o => { const a = new Avatar({ shirt: o.shirt ?? '#6b5b95', pants: o.pants ?? '#333', hair: o.hair ?? '#3b2a20', skin: o.skin ?? '#d9a982' }); this.registerSpeaker(o.label, a); return a.root; }, // no floating info card; the objective marker shows who to talk to
        label: (t, s) => makeLabel(t, s),
      },
      addInteractable: d => this.interactions.add(d),
      removeInteractable: id => this.interactions.remove(id),
      difficulty: () => this.difficulty,
      cutscene: spec => this.playCutscene(spec),
      onCompleted: (id, receipt) => this.onQuestCompleted(id, receipt),
      onFailed: () => this.save(),
      onTargetsChanged: () => { this.world.refreshBuildings(); if (this.spaceId === 'exterior') this.unstick(); },
      onColorProgress: () => this.applyColor(),
      persist: () => this.save(),
    });
    for (const m of createQuestModules()) this.quests.register(m);
    this.finale = new Finale(this);
    this.world.onEraChanged.push(era => this.quests.eraChanged(era));
    // era time-of-day: environment light, haze, exposure; NPC wardrobes
    const atmos = (era: EraId) => {
      const A = ATMOSPHERE[era]; this.renderer.setAtmosphere(A);
      this.npcs?.setEra(era);
      this.traffic?.setEra(era);
      // the player dresses for the weather too (coat + scarf in winter)
      const base = this.player.avatar.look, winter = A.season === 'winter';
      if (!!base.coat !== winter) this.player.avatar.rebuild({ ...base, coat: winter ? '#2b3a4f' : undefined, scarf: winter ? '#8d3b2f' : undefined });
    };
    this.world.onEraChanged.push(atmos); atmos(this.world.era);
    this.world.gateBuilt = id => this.gateBuilt(id);
    const sp = this.resolve('spawn');
    this.player.place(this.exteriorSpace, sp.x, sp.z, this.location('spawn').yaw ?? 0);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    this.setupCoreInteractables();
    this.setupVehicles();
    this.setupBenches();
    this.npcs = new NpcCrowd(this.renderer.scene);
    this.npcs.setEra(this.world.era);
    this.traffic = new Traffic(this.renderer.scene);
    this.traffic.setEra(this.world.era);
    this.ui.onLine = l => (l ? this.voice.speak(l.speaker, l.text) : this.voice.stop());
    const unlockAudio = () => { loadSamples(); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
    window.addEventListener('pointerdown', unlockAudio); window.addEventListener('keydown', unlockAudio);
    for (const w of this.npcs.walkers) this.registerSpeaker(w.name, w.avatar);
    this.registerSpeaker('You', this.player.avatar);
    this.setupCoins();
    this.setupMarkers();
    this.setupClickInspect();
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
    else if (a.building) {
      const d = this.world.doorPlacement(a); const o = a.offset ?? 2.5;
      let x = d.x + d.nx * o, z = d.z + d.nz * o;
      // non-door anchors (NPCs, sites, letters) must not stand in front of an entrance: slide along the wall
      if (!/^door/.test(id)) for (let k = 1; k <= 6 && this.world.nearDoor(x, z, 3.2); k++) { const t = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3; x = d.x + d.nx * o - d.nz * t; z = d.z + d.nz * o + d.nx * t; }
      out = { x, z, space };
    }
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
    if (!GAME_CONFIG.world.gatedBuildings.includes(buildingId)) return true;
    return this.quests.state.targets[`construction:${buildingId}`] === 'solved' || this.quests.status('construction') === 'completed';
  }
  get space(): Space { return this.spaceId === 'exterior' ? this.exteriorSpace : this.interiors.space(this.spaceId); }

  // ---------------- core interactables (quest giver, doors, finale) ----------------
  private setupCoreInteractables() {
    const qg = GAME_CONFIG.questGiver;
    const bednar = new Avatar({ shirt: '#ffffff', jacket: '#2b2f3a', pants: '#2b2f3a', tie: '#7a2b2b', hair: '#6d655c', skin: '#e0b896' });
    this.bednar = bednar;
    this.registerSpeaker('Bednar', bednar);
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
      this.interactions.add({ id: `core:doorvis-${id}`, kind: 'generic', at: { x: d.x, z: d.z }, radius: 0, eras: cfg.eras, visual: door, prompt: '', onInteract: () => {} });
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
  private setupVehicles() {
    const add = (v: Vehicle, x: number, z: number, yaw: number) => {
      v.root.position.set(x, this.world.groundY(x, z), z); v.root.rotation.y = yaw;
      this.renderer.scene.add(v.root); this.carts.push({ cart: v, id: v.id }); this.addVehicleInteract(v);
    };
    // golf carts at their anchors
    for (const id of Object.keys(GAME_CONFIG.locations).filter(k => k.startsWith('cart-'))) { let p = this.resolve(id); if (this.world.nearDoor(p.x, p.z, 4)) { const [nx, nz] = nudgeFree(p.x + 5, p.z, 2); p = { ...p, x: nx, z: nz }; } add(new Vehicle(id, 'cart'), p.x, p.z, this.location(id).yaw ?? 0); }
    // parked cars in the lots; the models change as time passes
    let seed = 913; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lots = CAMPUS.areas.filter(a => a.kind === 'parking' && CAMPUS.campus.some(c => pointInPoly(a.poly[0][0], a.poly[0][1], c)));
    const spots: { x: number; z: number; yaw: number }[] = [];
    for (let tries = 0; tries < 3000 && spots.length < 16 && lots.length; tries++) {
      const lot = lots[(rnd() * lots.length) | 0];
      const xs = lot.poly.map(p => p[0]), zs = lot.poly.map(p => p[1]);
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs));
      if (!pointInPoly(x, z, lot.poly) || everOccupied(x, z, 2) || spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 36)) continue;
      const o = obb(lot.poly); spots.push({ x, z, yaw: Math.PI / 2 - o.angle + (rnd() < 0.5 ? 0 : Math.PI) });
    }
    const palette = ['#b03a2e', '#2e5e8e', '#e8e4da', '#3a3f45', '#7a8c5a', '#c9a227', '#6b3f7a', '#9aa3a8'];
    const groups: { eras: EraId[]; styles: CarStyle[] }[] = [
      { eras: ['ricks1999', 'transition'], styles: ['boxy90s', 'pickup90s'] },
      { eras: ['byui'], styles: ['rounded2010s', 'boxy90s', 'rounded2010s'] },
      { eras: ['presentFinale'], styles: ['modern', 'rounded2010s', 'modern'] },
    ];
    spots.forEach((sp, i) => groups.forEach((gr, gi) => {
      const v = new Vehicle(`car-${i}-${gi}`, 'car', gr.styles[(i + gi) % gr.styles.length], palette[(i * 3 + gi) % palette.length]);
      v.eras = gr.eras; add(v, sp.x, sp.z, sp.yaw);
    }));
    // bicycles beside campus paths
    const paths = CAMPUS.roads.filter(r => r.kind === 'footway' && r.pts.length > 1);
    let bikes = 0;
    for (let tries = 0; tries < 2000 && bikes < 8; tries++) {
      const r = paths[(rnd() * paths.length) | 0], [ax, az] = r.pts[0], [bx, bz] = r.pts[1], L = Math.hypot(bx - ax, bz - az); if (L < 4) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L, x = (ax + bx) / 2 + nx * (r.width / 2 + 0.8), z = (az + bz) / 2 + nz * (r.width / 2 + 0.8);
      if (!CAMPUS.campus.some(c => pointInPoly(x, z, c)) || everOccupied(x, z, 1) || onVehicleRoad(x, z) || this.world.nearDoor(x, z, 5) || this.carts.some(c => (c.cart.root.position.x - x) ** 2 + (c.cart.root.position.z - z) ** 2 < 100)) continue;
      add(new Vehicle(`bike-${bikes++}`, 'bike'), x, z, Math.atan2(bx - ax, bz - az));
    }
  }
  /** Benches: E to sit; moving or pressing E again stands up. */
  private setupBenches() {
    this.world.benches.forEach((b, i) => this.interactions.add({
      id: `core:bench-${i}`, kind: 'generic', at: { x: b.x, z: b.z }, radius: 1.8,
      enabled: () => !this.player.vehicle && !this.player.seated, prompt: 'Sit on the bench',
      onInteract: () => {
        this.player.place(this.exteriorSpace, b.x, b.z, b.yaw); this.player.position.y = this.world.groundY(b.x, b.z);
        this.player.seated = true; this.player.avatar.sit(true); this.player.avatar.root.rotation.y = b.yaw; playSound('sit');
      },
    }));
  }
  private standUp() {
    const p = this.player.position, y = this.player.yaw;
    this.player.seated = false; this.player.avatar.sit(false);
    this.player.place(this.exteriorSpace, p.x + Math.sin(y) * 1.1, p.z + Math.cos(y) * 1.1, y); this.unstick();
  }
  private vehicleLabel(v: Vehicle) { return v.kind === 'bike' ? 'Ride the bicycle' : v.kind === 'car' ? 'Drive the car' : 'Drive the golf cart'; }
  private addVehicleInteract(v: Vehicle) {
    this.interactions.add({
      id: `core:${v.id}`, kind: 'generic', at: { x: v.root.position.x, z: v.root.position.z }, radius: v.kind === 'car' ? 3.4 : 2.6,
      eras: v.eras as EraId[] | null, enabled: () => !this.player.vehicle && !this.player.seated, prompt: this.vehicleLabel(v),
      onInteract: () => this.enterCart(v, v.id),
    });
  }
  private enterCart(cart: Vehicle, id: string) {
    this.player.vehicle = cart; this.player.yaw = cart.root.rotation.y;
    this.player.position.copy(cart.root.position);
    if (cart.pose === 'sit') this.player.avatar.sit(true);
    this.interactions.remove(`core:${id}`);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.distance = cart.kind === 'car' ? 15 : 12;
    playSound(cart.kind === 'bike' ? 'bell' : 'carDoor'); if (cart.kind !== 'bike') setTimeout(() => playSound('engineStart'), 250);
    this.ui.toast(cart.kind === 'bike' ? 'W/S pedal · A/D steer · E to get off' : 'W/S drive · A/D steer · E to get out');
  }
  exitCart() {
    const cart = this.player.vehicle; if (!cart) return;
    this.player.vehicle = null; cart.speed = 0; this.player.avatar.sit(false); this.player.avatar.root.visible = true;
    if (cart.kind !== 'bike') playSound('carDoor');
    // step out to the side
    const side = cart.kind === 'car' ? 2.4 : 1.8;
    const sx = Math.cos(this.player.yaw) * side, sz = -Math.sin(this.player.yaw) * side;
    const p = this.player.position, dir = !this.exteriorSpace.blocked(p.x - sx, p.z - sz, 0.45) ? -1 : 1;
    this.player.place(this.exteriorSpace, p.x + sx * dir, p.z + sz * dir, this.player.yaw);
    this.unstick();
    this.addVehicleInteract(cart);
  }
  /** Era-specific vehicles (cars) only show in their era — unless you're driving one. */
  private syncVehicles() {
    for (const { cart } of this.carts) cart.root.visible = this.spaceId === 'exterior' && (!cart.eras || cart.eras.includes(this.world.era) || this.player.vehicle === cart);
  }

  /** Keep trees off NPCs, doors, carts, coins, signs and quest objects. */
  private clearTrees() {
    const pts: { x: number; z: number; r: number }[] = [];
    for (const it of this.interactions.items.values()) if (it.space === 'exterior') pts.push({ x: it.x, z: it.z, r: Math.max(2, it.radius ?? 2) });
    for (const c of this.carts) pts.push({ x: c.cart.root.position.x, z: c.cart.root.position.z, r: 2.5 });
    for (const c of this.coins) pts.push({ x: c.x, z: c.z, r: 1 });
    for (const w of this.npcs?.walkers ?? []) for (const p of w.route) pts.push({ x: p[0], z: p[1], r: 0.5 });
    for (const s of GAME_CONFIG.signs) { const p = this.resolve(s.anchor); pts.push({ x: p.x, z: p.z, r: Math.max(4, ((s as { width?: number }).width ?? 0) / 2 + 1.5) }); }
    this.world.clearTreesAround(pts);
  }

  // ---------------- coins (just for fun) ----------------
  private setupCoins() {
    let s = 4242; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const paths = CAMPUS.roads.filter(r => PATH_KINDS.has(r.kind) && r.pts.length > 1);
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10), mat = new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#6b4a00' });
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
        this.collectedCoins.add(c.id); playSound('coin');
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

  private speakers = new Map<string, Avatar>();
  /** Characters whose mouths move when a line with their name is on screen. */
  registerSpeaker(name: string, a: Avatar) { this.speakers.set(name, a); }
  private updateMouths(dt: number) {
    const sp = this.ui.currentSpeaker;
    for (const [name, a] of this.speakers) { a.talking = !!sp && sp.includes(name); a.updateMouth(dt); }
  }
  private npcTalking = false;
  private lineBag = new LineBag();
  private async talkToNpc(w: NpcCrowd['walkers'][number]) {
    if (this.npcTalking) return;
    this.npcTalking = true; this.busy = true; w.talking = 6;
    const key = this.world.era === 'presentFinale' ? 'present' : this.world.era;
    const pool = GAME_CONFIG.npcs.lines[key] ?? GAME_CONFIG.npcs.lines.ricks1999;
    const line = this.lineBag.next(key, pool);
    w.heard++;
    try { await this.ui.dialogue([{ speaker: `${w.name} · ${GAME_CONFIG.npcs.title}`, text: line }]); } finally { this.busy = false; this.npcTalking = false; w.talking = 1.5; }
  }

  async talkToQuestGiver() {
    // Bednar turns toward the assistant
    if (this.bednar) { const b = this.bednar.root.position, p = this.player.position; this.bednar.root.rotation.y = Math.atan2(p.x - b.x, p.z - b.z); }
    const active = this.quests.active();
    if (active && this.quests.readyToReport(active)) { await this.quests.report(active); return; }
    if (active) { await this.ui.dialogue(this.quests.reminder(active)); return; }
    const next = this.quests.nextAvailable();
    if (next) {
      if (next === 'professors' && !this.quests.data('professors').__greeted) { this.quests.data('professors').__greeted = true; await this.ui.dialogue(STORY.bednarGreeting()); }
      await this.quests.assign(next);
      if (this.quests.status(next) === 'active') this.ui.toast(`New assignment: ${this.quests.modules.get(next)?.title}`);
      this.save();
      return;
    }
    if (this.quests.allComplete()) await this.ui.dialogue(STORY.allQuestsDone());
  }

  playCutscene(spec: CutsceneSpec): Promise<void> {
    this.save();                                   // save before an important transition
    const done = spec.onDone;
    return this.cutscenes.play({ ...spec, onDone: () => { done?.(); this.save(); } }); // …and after
  }

  /** Colour is owned by the world: completed quests set the stage; the active quest's reported progress fills part of the gap. */
  computeColor(): number {
    const st = GAME_CONFIG.colorStages, n = this.quests.completedCount();
    if (n >= QUEST_ORDER.length) return 1;
    const base = st[n] ?? 1, nextStage = st[n + 1] ?? 1;
    const active = this.quests.active();
    const f = active ? this.quests.colorProgress(active) : 0;
    return base + (nextStage - base) * f * GAME_CONFIG.colorPartialMax;
  }
  applyColor(instant = false) { this.colorStage = this.quests.completedCount(); this.renderer.setColor(this.computeColor(), instant); }

  /** Translucent blueprint-blue copy of a building footprint. */
  blueprintGhost(buildingId: string): THREE.Object3D | null {
    const poly = registryPoly(buildingId), entry = BUILDINGS.find(b => b.id === buildingId); if (!poly || !entry) return null;
    const m = meshBuilding(poly, entry.style, { detailed: true });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#5ab0ff', transparent: true, opacity: 0.32, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.7 }));
    const grp = new THREE.Group(); grp.add(mesh, edges); grp.userData.absolute = true;
    return grp;
  }

  // ---------------- story progression ----------------
  private async onQuestCompleted(id: QuestId, receipt: RewardReceipt | null) {
    this.busy = true;
    try {
      this.applyColor();
      if (receipt) { playSound('success'); await this.ui.rewardScene(`Quest complete: ${this.quests.modules.get(id)?.title ?? id}`, receipt); }
      this.save();
      const nextEra = GAME_CONFIG.story.eraAfterQuest[id];
      if (nextEra && nextEra !== this.world.era) await this.timeTransition(nextEra);
      if (this.quests.allComplete() && this.world.era !== GAME_CONFIG.story.finaleEra) {
        await this.timeTransition(GAME_CONFIG.story.finaleEra, STORY.presentDaySubtitle);
      }
      this.save();
    } finally { this.busy = false; }
  }

  async timeTransition(era: EraId, subtitle?: string) {
    if (this.player.vehicle) this.exitCart();
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
    playSound('door');
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
    if (!instant) playSound('door');
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
        : { text: 'Go to the Science and Technology Center', target: 'door.stc.main' };
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
      version: 3, savedAt: '', difficulty: this.difficulty, era: this.world.era, colorStage: this.colorStage,
      quests: this.quests.state.quests, targets: this.quests.state.targets, rewards: this.quests.state.rewards,
      player: { space: this.spaceId, x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw },
      coins: [...this.collectedCoins],
      introSeen: this.introSeen, finaleReached: this.finaleReached,
    };
  }
  save() { if (this.mode !== 'title') writeSave(this.snapshot()); }

  newGame(difficulty: DifficultyId) {
    this.difficulty = difficulty; this.colorStage = 0; this.introSeen = false; this.finaleReached = false;
    this.collectedCoins.clear(); if (this.player.vehicle) this.exitCart(); this.player.seated = false; this.player.avatar.sit(false);
    this.quests.init(freshQuestState());
    this.world.refreshBuildings();
    this.clearTrees();
    this.setEra(GAME_CONFIG.story.startEra);
    this.applyColor(true);
    if (this.spaceId !== 'exterior') { this.spaceId = 'exterior'; this.interiors.show(null); this.world.exterior.visible = true; }
    const s = this.resolve('spawn');
    this.player.place(this.exteriorSpace, s.x, s.z, this.location('spawn').yaw ?? 0);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    this.beginPlay(true);
  }
  continueGame(d: SaveData) {
    this.difficulty = d.difficulty; this.colorStage = d.colorStage; this.introSeen = d.introSeen; this.finaleReached = false;
    this.collectedCoins = new Set(d.coins ?? []); if (this.player.vehicle) this.exitCart(); this.player.seated = false; this.player.avatar.sit(false);
    this.quests.init({ quests: d.quests, targets: d.targets ?? {}, rewards: d.rewards ?? {} });
    this.world.refreshBuildings();
    this.clearTrees();
    this.setEra(d.era);
    this.applyColor(true);
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
      { label: 'Jump to a quest (testing)', action: () => this.showQuestJump() },
      { label: 'Reset saved game', disabled: !save, action: () => this.confirmReset() },
    ], { subtitle: GAME_CONFIG.disclaimer, className: 'title-screen', footer: `Map data © OpenStreetMap contributors (ODbL) · elevation USGS 3DEP · see docs/sources.md` });
    void s;
  }
  /** Testing only: start at any quest with the earlier ones marked complete (no coins). */
  private showQuestJump() {
    let diff: DifficultyId = 'easy';
    const go = (stage: 1 | 2 | 3 | 4) => { this.ui.clear(); this.pauseOpen = false; this.quests.resumeAll(); this.jumpToQuest(stage, diff); };
    const s = this.ui.menu('Testing: jump to a quest', [
      { label: 'Difficulty: Easy (click to switch)', action: () => { diff = diff === 'easy' ? 'hard' : 'easy'; (s.el.querySelectorAll('button')[0] as HTMLButtonElement).textContent = `Difficulty: ${diff === 'easy' ? 'Easy' : 'Hard'} (click to switch)`; } },
      { label: 'Quest 1 — Hire the professors (1999)', action: () => go(1) },
      { label: 'Quest 2 — Build the campus (2001)', action: () => go(2) },
      { label: 'Quest 3 — Find and place B Y U I (2011)', action: () => go(3) },
      { label: 'Finale — STC celebration (present day)', action: () => go(4) },
      { label: 'Back', action: () => this.ui.pop(s) },
    ], { subtitle: 'For testing: earlier quests are marked complete and earn no coins.', onBack: () => this.ui.pop(s) });
  }
  jumpToQuest(stage: 1 | 2 | 3 | 4, diff: DifficultyId) {
    if (stage === 1) { this.newGame(diff); return; }
    const st = freshQuestState();
    const done = (id: QuestId) => {
      st.quests[id] = { status: 'completed', data: { __devSkipped: true } };
      st.rewards[id] = computeReward({ questId: id, tuning: { base: 0, qualityMax: 0, speedMax: 0, hardBonus: 0 }, difficulty: diff, activeSeconds: 0, targetSeconds: 1, qualityScore: 0, skippedFraction: 1, devSkipped: true });
    };
    done('professors'); st.quests.construction.status = 'available';
    let era: EraId = 'transition';
    if (stage >= 3) { done('construction'); st.targets['construction:taylor'] = 'solved'; st.targets['construction:icenter'] = 'solved'; st.quests.letters.status = 'available'; era = 'byui'; }
    if (stage >= 4) { done('letters'); st.quests.letters.data = { __devSkipped: true, cards: true, found: ['B', 'Y', 'U', 'I'], placed: ['B', 'Y', 'U', 'I'] }; era = 'presentFinale'; }
    let player: SaveData['player'];
    if (stage === 4) { const d = this.world.doorPlacement(this.location('door.stc.main')); player = { space: 'exterior', x: d.x + d.nx * 4, z: d.z + d.nz * 4, yaw: Math.atan2(-d.nx, -d.nz) }; }
    else { const p = this.interiors.toWorld('kimball-office', 0, -4); player = { space: 'kimball-office', x: p.x, z: p.z, yaw: Math.PI }; }
    this.continueGame({ version: 3, savedAt: '', difficulty: diff, era, colorStage: this.quests.completedCount(), quests: st.quests, targets: st.targets, rewards: st.rewards, player, coins: [], introSeen: true, finaleReached: false });
    this.ui.toast(stage === 4 ? 'Testing: walk into the STC to trigger the finale.' : 'Testing: talk to President Bednar to start the quest.', 5000);
  }

  private chooseDifficulty() {
    const s = this.ui.menu('Choose difficulty', GAME_CONFIG.difficulty.options.map(o => ({
      label: `${o.label} — ${o.hint}`, action: () => { this.ui.pop(s); this.newGame(o.id as DifficultyId); },
    })), { subtitle: 'You can switch later from the pause menu; it applies to your next challenge attempt.', onBack: () => this.ui.pop(s) });
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
    this.quests.suspendAll(); this.pauseOpen = true;
    const close = () => { this.ui.pop(s); this.pauseOpen = false; this.quests.resumeAll(); };
    const other = this.difficulty === 'easy' ? 'hard' : 'easy';
    const items = [
      { label: 'Resume', action: close },
      ...(this.hudBtn ? [{ label: this.hudBtn.label, action: () => { close(); this.hudBtn?.fn(); } }] : []),
      { label: `Difficulty: ${this.difficulty === 'easy' ? 'Easy' : 'Hard'} — switch to ${other === 'easy' ? 'Easy' : 'Hard'}`, action: () => {
        this.difficulty = other; this.save(); this.ui.toast(`Difficulty set to ${other === 'easy' ? 'Easy' : 'Hard'} — applies to your next challenge attempt.`); close(); this.showPause();
      } },
      { label: `Reduced motion: ${SETTINGS.reducedMotion ? 'On' : 'Off'}`, action: () => { SETTINGS.reducedMotion = !SETTINGS.reducedMotion; saveSettings(); close(); this.showPause(); } },
      { label: `Graphics: ${SETTINGS.graphics === 'high' ? 'High' : 'Low (faster)'}`, action: () => { SETTINGS.graphics = SETTINGS.graphics === 'high' ? 'low' : 'high'; saveSettings(); this.renderer.setQuality(SETTINGS.graphics, this.world.sun); close(); this.showPause(); } },
      { label: `Sound: ${SETTINGS.muted ? 'Muted' : 'On'}`, action: () => { SETTINGS.muted = !SETTINGS.muted; saveSettings(); close(); this.showPause(); } },
      { label: 'Audio settings (volume, voices)…', action: () => this.showAudio() },
      { label: 'Jump to a quest (testing)', action: () => this.showQuestJump() },
      { label: 'Controls', action: () => this.showControls() },
      { label: 'Controllers', action: () => this.showControllers() },
      ...(this.devMode ? [{ label: 'Skip current quest (dev — no reward)', disabled: this.quests.allComplete(), action: () => this.confirmSkip() }] : []),
      { label: 'Save game', action: () => { this.save(); this.ui.toast('Game saved in this browser.'); } },
      { label: 'Save and quit to title', action: () => { this.pauseOpen = false; this.quitToTitle(true); } },
      { label: 'Reset saved game', action: () => this.confirmReset() },
    ];
    const s = this.ui.menu('Paused', items, { subtitle: `${ERAS[this.world.era].label} · ${this.difficulty === 'easy' ? 'Easy' : 'Hard'} · quest timers paused`, onBack: close });
    s.onPause = close;
  }
  private confirmSkip() {
    const id = this.quests.active() ?? this.quests.nextAvailable(); if (!id) return;
    const title = this.quests.modules.get(id)?.title ?? id;
    const s = this.ui.menu(`Skip "${title}"?`, [
      { label: 'Yes, skip (no reward)', action: () => { this.ui.clear(); this.pauseOpen = false; this.quests.resumeAll(); this.quests.forceComplete(id); } },
      { label: 'Cancel', action: () => this.ui.pop(s) },
    ], { subtitle: 'Developer skip: the story advances, but no coins are awarded.', onBack: () => this.ui.pop(s) });
  }
  /** Volumes for music / effects / ambience / voices + voices on/off. Left/right (or the mouse) adjusts. */
  showAudio() {
    void this.ui.custom('Audio settings', (root, panel) => {
      const rows: [keyof typeof SETTINGS, string][] = [['musicVolume', 'Music'], ['sfxVolume', 'Sound effects'], ['ambienceVolume', 'Ambience (wind, birds)'], ['voiceVolume', 'Character voices']];
      root.innerHTML = '';
      const list = document.createElement('div'); list.className = 'items audio-settings';
      const sliders: HTMLInputElement[] = [];
      for (const [key, label] of rows) {
        const row = document.createElement('label'); row.className = 'audio-row';
        const name = document.createElement('span'); name.textContent = label;
        const val = document.createElement('b');
        const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '100'; r.step = '5'; r.setAttribute('data-focus', '');
        r.value = String(Math.round((SETTINGS[key] as number) * 100)); val.textContent = `${r.value}%`;
        r.addEventListener('input', () => { (SETTINGS as unknown as Record<string, number>)[key] = Number(r.value) / 100; val.textContent = `${r.value}%`; saveSettings(); if (key === 'sfxVolume') playSound('tick'); });
        row.append(name, r, val); list.append(row); sliders.push(r);
      }
      const vbtn = document.createElement('button'); vbtn.setAttribute('data-focus', ''); vbtn.type = 'button';
      const paint = () => { vbtn.textContent = `Voices: ${SETTINGS.voices ? 'On' : 'Off'}${this.voice.supported ? '' : ' (not supported in this browser)'}`; };
      vbtn.addEventListener('click', () => { SETTINGS.voices = !SETTINGS.voices; saveSettings(); paint(); if (SETTINGS.voices) this.voice.speak('Narrator', 'Voices are on.'); else this.voice.stop(); });
      const test = document.createElement('button'); test.setAttribute('data-focus', ''); test.type = 'button'; test.textContent = 'Test a voice';
      test.addEventListener('click', () => this.voice.speak('President Bednar (game character)', 'Welcome. There is important work to do.'));
      const back = document.createElement('button'); back.setAttribute('data-focus', ''); back.type = 'button'; back.textContent = 'Back';
      back.addEventListener('click', () => panel.close(null));
      paint(); list.append(vbtn, test, back);
      const hint = document.createElement('p'); hint.className = 'sub'; hint.textContent = 'Up/down to choose · left/right to change · Sound: Muted in the pause menu silences everything.';
      root.append(list, hint);
      panel.onAction(a => {
        const focused = root.querySelector('.focused') as HTMLInputElement | null;
        if ((a === 'left' || a === 'right') && focused && sliders.includes(focused)) {
          focused.value = String(Math.max(0, Math.min(100, Number(focused.value) + (a === 'right' ? 5 : -5))));
          focused.dispatchEvent(new Event('input')); return true;
        }
        return false;
      });
    });
  }

  quitToTitle(save: boolean) { if (save) this.save(); this.finale.stop(); this.showTitle(); }

  // ---------------- inspectables (look-and-press discovery) ----------------
  private raycaster = new THREE.Raycaster();
  /** Inspectable under normalised screen coords (0,0 = centre), within its max distance of the player. */
  inspectAt(nx: number, ny: number): Inspectable | null {
    if (!this.inspectables.size || this.spaceId !== 'exterior') return null;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.renderer.camera);
    let best: Inspectable | null = null, bestD = Infinity;
    for (const ins of this.inspectables.values()) {
      if (ins.enabled && !ins.enabled()) continue;
      const wp = new THREE.Vector3(); ins.object.getWorldPosition(wp);
      if (wp.distanceTo(this.player.position) > (ins.maxDistance ?? 30)) continue;
      const hit = this.raycaster.intersectObject(ins.object, true)[0];
      if (hit && hit.distance < bestD) { bestD = hit.distance; best = ins; }
    }
    return best;
  }
  /** Mouse click on the 3D view inspects what is under the cursor. */
  private setupClickInspect() {
    let downAt: [number, number] | null = null;
    this.renderer.canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
    this.renderer.canvas.addEventListener('pointerup', e => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; // a drag (camera orbit), not a click
      if (this.mode !== 'playing' || this.ui.blocking || this.busy || this.cutscenes.active) return;
      const r = this.renderer.canvas.getBoundingClientRect();
      const hit = this.inspectAt(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      hit?.onInspect();
    });
  }

  // ---------------- controller disconnect → pause + keyboard fallback ----------------
  controllerLost = false;
  private watchControllers() {
    for (const c of this.allControllers()) {
      const st = c.status();
      if (st.connected) this.connectedControllers.add(st.id);
      else if (this.connectedControllers.has(st.id)) {
        this.connectedControllers.delete(st.id);
        if (!this.pauseOpen) { this.ui.toast(`${st.label} disconnected — game paused. Keyboard still works.`, 5000); this.showPause(); }
      }
    }
  }

  private updateTraffic(dt: number) {
    if (!this.traffic) return;
    const show = this.spaceId === 'exterior' && this.mode !== 'finale';
    this.traffic.setVisible(show);
    if (!show || this.pauseOpen) return;
    const p = this.mode === 'title' ? { x: 1e6, z: 1e6 } : this.player.position;
    for (const e of this.traffic.update(dt, p)) if (this.mode === 'playing' && !this.cutscenes.active) playSound(e.type);
  }

  // ---------------- frame loop ----------------
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.gamepads.update();
    this.input.update(dt);
    this.music.update(dt, !(this.cutscenes.active || this.mode === 'finale' || this.ui.cardShowing));
    const cinematic = this.cutscenes.active || this.ui.cardShowing;
    this.ambience.update(dt, { outdoor: this.spaceId === 'exterior' && this.mode !== 'finale', season: ATMOSPHERE[this.world.era].season, cinematic });
    const veh = this.player.vehicle;
    this.engine.update(this.mode === 'playing' && !this.pauseOpen && !!veh && veh.kind !== 'bike', veh?.speed ?? 0, veh?.kind === 'cart' ? 'cart' : 'car');
    this.updateTraffic(dt);
    // footsteps: one per ~0.8 m walked (shorter when running), surface from where you are
    const P = this.player;
    if (this.mode === 'playing' && !this.cutscenes.active && !P.vehicle && !P.seated && P.grounded && P.speed > 0.6) {
      this.stepDist += P.speed * dt;
      if (this.stepDist > (P.speed > 6 ? 1.3 : 0.8)) {
        this.stepDist = 0;
        const x = P.position.x, z = P.position.z, winter = ATMOSPHERE[this.world.era].season === 'winter';
        const hard = this.world.onPath(x, z) || onVehicleRoad(x, z);
        playStep(this.spaceId !== 'exterior' ? 'wood' : hard ? 'concrete' : winter ? 'snow' : 'grass', P.speed > 6 ? 0.45 : 0.3);
      }
    } else this.stepDist = 0.5;
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
    } else if (this.cutscenes.active) {
      // a story scene owns the camera; the world keeps animating, the player waits
      const skip = a.pressed('back') || a.pressed('pause'); const next = a.pressed('confirm');
      if (skip) { a.consume('back'); a.consume('pause'); } if (next) a.consume('confirm');
      this.cutscenes.update(dt, next, skip);
      this.player.update(dt, a, this.cameraRig.yaw, false);
      if (this.spaceId === 'exterior') { this.npcs.setVisible(true); this.npcs.update(dt, this.player.position, (x, z, r) => this.world.blocked(x, z, r)); }
      this.quests.update(dt); this.updateMarkers(dt); this.markers.forEach(m => m.visible = false);
      this.world.updateSun(this.player.position);
      this.ui.showHud(false);
    } else {
      this.ui.showHud(true);
      const canAct = !uiBlocking && !this.busy && !this.interactions.busy;
      this.player.update(dt, a, this.cameraRig.yaw, canAct);
      this.cameraRig.follow = !!this.player.vehicle;
      if (this.camFocus) { const c = this.renderer.camera; c.position.copy(this.camFocus.from); c.lookAt(this.camFocus.to); }
      else this.cameraRig.update(dt, uiBlocking ? null : a, this.player.position, this.space, this.player.yaw);
      this.world.updateSun(this.player.position);
      this.quests.update(dt);
      this.quests.tick(dt, !this.pauseOpen && !this.controllerLost);
      const focusRaw = this.interactions.update(this.player.position.x, this.player.position.z, this.spaceId, this.world.era);
      const focus = this.player.vehicle ? null : focusRaw;
      this.npcs.setVisible(this.spaceId === 'exterior');
      if (this.spaceId === 'exterior') this.npcs.update(dt, this.player.position, (x, z, r) => this.world.blocked(x, z, r) || Math.hypot(x - this.player.position.x, z - this.player.position.z) < r + 0.6);
      // inspectables: whatever is under the screen-centre reticle
      const insp = !focus && !this.player.vehicle && !uiBlocking ? this.inspectAt(0, 0) : null;
      this.inspectFocus = insp;
      this.ui.setReticle([...this.inspectables.values()].some(i => !i.enabled || i.enabled()) && this.spaceId === 'exterior' && !uiBlocking, !!insp);
      const npc = !focus && !insp && !this.player.vehicle && this.spaceId === 'exterior' ? this.npcs.nearest(this.player.position.x, this.player.position.z, 2.4) : null;
      this.updateCoins(dt); this.updateMarkers(dt);
      this.watchControllers();
      if (canAct) {
        if (this.player.seated && (a.pressed('interact') || Math.hypot(a.axes.moveX, a.axes.moveY) > 0.4 || a.pressed('jump'))) { a.consume('interact'); this.standUp(); }
        else if (this.player.vehicle && a.pressed('interact')) { a.consume('interact'); this.exitCart(); }
        else if (focus && a.pressed('interact')) { a.consume('interact'); void this.interactions.trigger(); }
        else if (insp && a.pressed('interact')) { a.consume('interact'); insp.onInspect(); }
        else if (npc && a.pressed('interact')) { a.consume('interact'); void this.talkToNpc(npc); }
        else if (a.pressed('pause')) { a.consume('pause'); this.showPause(); }
        else if (a.pressed('journal') && this.hudBtn) { a.consume('journal'); this.hudBtn.fn(); }
        else if (a.pressed('map') && this.hudBtn?.viaMap) { a.consume('map'); this.hudBtn.fn(); }
        else if (a.pressed('map') && this.spaceId === 'exterior') { a.consume('map'); this.ui.bigMap(() => {}); }
      }
      const obj = this.currentObjective();
      const interiorLabel = this.spaceId !== 'exterior' ? this.interiors.defs.get(this.spaceId)!.label : null;
      const coinTotal = this.quests.totalRewardCoins() + this.collectedCoins.size * GAME_CONFIG.rewards.pickupCoin;
      this.ui.updateHud({
        objective: obj.text, era: ERAS[this.world.era].label,
        prompt: canAct ? (this.player.seated ? 'Stand up (E or move)' : this.player.vehicle ? (this.player.vehicle.kind === 'bike' ? 'Get off the bicycle' : this.player.vehicle.kind === 'car' ? 'Get out of the car' : 'Get out of the golf cart') : focus ? this.interactions.promptText(focus) : insp ? (insp.prompt ?? 'Inspect') : npc ? `Talk to ${npc.name}` : null) : null,
        px: this.player.position.x, pz: this.player.position.z, pyaw: this.player.yaw, camYaw: this.cameraRig.yaw,
        map: this.world.mapCanvas, target: this.targetPoint(obj.target), interior: interiorLabel,
        markers: [...this.markerPoints(), ...this.quests.waypoints().map(w => this.targetPoint(w)).filter(Boolean) as { x: number; z: number }[]],
        targetLabel: this.targetLabel(obj.target),
        doors: this.spaceId === 'exterior' ? this.entrances.filter(e => !e.eras || e.eras.includes(this.world.era)) : [],
        coins: `● ${coinTotal} coins`, driving: !!this.player.vehicle,
      });
      this.autosaveT += dt; if (this.autosaveT > 20) { this.autosaveT = 0; this.save(); }
    }
    this.effects.update(dt);
    this.updateMouths(dt);
    this.syncVehicles();
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
