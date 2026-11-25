// Game orchestrator: wires world, player, input, UI, quests, interiors, save and finale.
import * as THREE from 'three';
import './interiors/campusInteriors';   // registers campus building interiors + their doors (before the world is built)
import { HOME_ID, HOME_SPOTS } from './interiors/apartment';
import { HART, MC_SPOTS, STRIKE_ZONE } from './interiors/campusInteriors';
import { benchPress, kg, treadmill, type HartHost } from './campuslife/hartGames';
import { Hoops, LEAGUE_TEAMS, leagueOpponent, leagueTable } from './campuslife/hoops';
import { bookHunt, cafeteria, carRepair, intramurals, pingPong, planetarium, recordsHtml, rhythm, tourGuide } from './campuslife/minigames';
import { Apartment, Celebrations, PETS, petHunger, scheduleHtml, nextClass } from './campuslife/studentLife';
import { openPhone } from './campuslife/phone';
import { Orientation } from './campuslife/orientation';
import { Bulletin } from './campuslife/bulletin';
import { legacyCards, legacyHtml } from './campuslife/legacy';
import { accessoryLook, bowl, openStore, ownsOutfit, storeNameFor } from './campuslife/mcFun';   // the player's apartment (same: registers before the world)
import { OUTFITS, outfitById, outfitLook } from './player/outfits';
import { ATMOSPHERE } from './config/atmosphere';
import { MusicPlayer } from './fx/music';
import { Ambience } from './fx/ambience';
import { VoiceActor } from './fx/voice';
import { EngineSound, loadSamples, playStep, SampleLoop } from './fx/audio';
import { Traffic } from './world/Traffic';
import { CLOSED, textCanvas } from './world/World';
import { BallGames } from './world/ballGames';
import { GAME_CONFIG, type Anchor, type DifficultyId } from './config/game.config';
import { InputManager } from './input/actions';
import { KeyboardMouseSource, REMAPPABLE, keyFor, keyName } from './input/keyboardMouse';
import { TouchSource, isTouchDevice } from './input/touch';
import { GamepadHub, WebBluetoothController } from './input/transports';
import { MockController } from './input/mockController';
import { InteractionSystem, type InteractableDef } from './interact/interactables';
import { InteriorManager } from './interiors/interiors';
import { Avatar, makeLabel } from './player/Avatar';
import { CameraRig } from './player/CameraRig';
import { PlayerController, type Space } from './player/PlayerController';
import { QuestManager, QUEST_ERA, QUEST_ORDER, freshQuestState, voxelBox } from './quests/QuestManager';
import type { QuestId } from './quests/contract';
import { createQuestModules } from './quests';
import { Renderer } from './render/Renderer';
import { clearSave, loadSave, SAVE_VERSION, SLOT_COUNT, slotSummary, writeSave, type SaveData } from './save/save';
import { STORY } from './story/story';
import { esc, UI, type MapPoi } from './ui/ui';
import { CAMPUS, everOccupied, nudgeFree, obb, onVehicleRoad, PATH_KINDS, pointInPoly, terrainHeight, toGame } from './world/campusData';
import { isAircraft, isRide, Vehicle, type CarStyle } from './player/Vehicle';
import { ERAS, type EraId } from './world/eras';
import { makeDoor, World, type BuildingSign } from './world/World';
import { eraLook, LineBag, NpcCrowd } from './world/Npcs';
import { JOIN_LINES } from './world/npcChatter';
import { ACHIEVEMENTS } from './campuslife/progress';
import { COLLECTIBLES } from './campuslife/collectibles';
const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length, COLLECTIBLE_COUNT = COLLECTIBLES.length;
import { SideQuests } from './sidequests/SideQuests';
import { CampusLife } from './campuslife/CampusLife';
import { ERA_START_HOUR } from './campuslife/clock';
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
import { OpeningCutscene } from './opening_cutscene/OpeningCutscene';
import { BUILDING_INFO_RANGE, getBuildingInfo } from './world/buildingInfo';
import { showBuildingInfo } from './ui/buildingInfo';

type Mode = 'title' | 'playing' | 'finale' | 'cutscene';
type At = string | { x: number; z: number; space?: string };

export class Game {
  readonly renderer: Renderer;
  readonly world: World;
  readonly interiors: InteriorManager;
  readonly player: PlayerController;
  readonly cameraRig: CameraRig;
  readonly input = new InputManager();
  touch!: TouchSource;
  readonly gamepads: GamepadHub;
  readonly ble: WebBluetoothController[] = [];
  readonly mocks: MockController[] = [];
  readonly ui: UI;
  readonly interactions: InteractionSystem;
  readonly quests: QuestManager;
  readonly finale: Finale;
  readonly opening: OpeningCutscene;
  mode: Mode = 'title';
  /** Team songs: menus + exploring; silent during cutscenes, time-jump cards and the finale. */
  readonly music = new MusicPlayer();
  readonly ambience = new Ambience();
  readonly voice = new VoiceActor();
  private engine = new EngineSound();
  private jetLoop = new SampleLoop('jetpack');
  traffic!: Traffic;
  balls!: BallGames;
  playerName = '';
  /** Wardrobe choice (saved). */
  outfit = 'assistant';
  /** Re-apply the chosen season everywhere (set up in the constructor). */
  applySeason: () => void = () => {};
  private lastFootfall = 0;
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
  /** Optional errands from characters around campus (src/sidequests/). */
  sideQuests!: SideQuests;
  /** Day/night, weather, happenings, collectibles, music, photos, friends, achievements (src/campuslife/). */
  life!: CampusLife;
  /** Enterable doors (shown on the minimap / map). */
  readonly entrances: { id: string; x: number; z: number; eras: EraId[] | null; label: string }[] = [];
  private coins: { id: string; mesh: THREE.Object3D; x: number; z: number }[] = [];
  collectedCoins = new Set<string>();
  private markers: THREE.Object3D[] = [];
  private markerT = 0;
  cutscenes!: CutsceneRunner;
  bednar!: Avatar;
  effects!: Effects;
  private inspectables = new Map<string, Inspectable>();
  private buildingInfoOpen = false;
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
    this.touch = this.input.add(new TouchSource(uiRoot, this.renderer.canvas)) as TouchSource;
    this.applyAccessibility();
    this.gamepads = new GamepadHub(this.input);
    if (WebBluetoothController.supported()) for (let i = 0; i < 2; i++) this.ble.push(new WebBluetoothController(i, this.input));
    this.exteriorSpace = {
      id: 'exterior', interior: false,
      solid: (x, z, r) => this.world.blockedByBuildings(x, z, r),
      blocked: (x, z, r) => this.world.blocked(x, z, r) || (!this.player.noclip && (!!this.npcs?.hit(x, z, r) || !!this.traffic?.hit(x, z, r) || !!this.life?.hit(x, z, r))),
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
        placePlayer: (x, z, yaw) => this.player.place(this.space, x, z, yaw ?? this.player.yaw),
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
        npc: o => { const a = new Avatar({ shirt: o.shirt ?? '#6b5b95', pants: o.pants ?? '#333', hair: o.hair ?? '#3b2a20', skin: o.skin ?? '#d9a982' }); this.registerSpeaker(o.label, a); this.questAvatars.push({ a, x: NaN, z: NaN }); return a.root; }, // no floating info card; the objective marker shows who to talk to
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
    this.opening = new OpeningCutscene(this);
    this.world.onEraChanged.push(era => this.quests.eraChanged(era));
    // era time-of-day: environment light, haze, exposure; NPC wardrobes
    const atmos = (era: EraId) => {
      const A = ATMOSPHERE[era]; this.renderer.setAtmosphere(A);
      this.npcs?.setEra(era, SETTINGS.season);
      this.traffic?.setEra(era, SETTINGS.season);
      // the player wears the chosen outfit, dressed for the weather (coat + scarf in winter)
      this.applyOutfit();
    };
    this.world.onEraChanged.push(atmos); atmos(this.world.era); this.applySeason = () => { this.world.applyAtmosphere(this.world.era); atmos(this.world.era); };
    this.world.gateBuilt = id => this.gateBuilt(id);
    const sp = this.resolve('spawn');
    this.player.place(this.exteriorSpace, sp.x, sp.z, this.location('spawn').yaw ?? 0);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    this.setupCoreInteractables();
    this.setupHome();
    this.setupBuildingDoors();
    this.setupVehicles();
    this.setupBenches();
    this.npcs = new NpcCrowd(this.renderer.scene, GAME_CONFIG.npcs.count, () => this.world.activeDoors(), () => this.world.benches);
    this.npcs.setEra(this.world.era, SETTINGS.season);
    this.traffic = new Traffic(this.renderer.scene, () => this.world.activeDoors());
    this.traffic.setEra(this.world.era, SETTINGS.season);
    this.balls = new BallGames(this.renderer.scene);
    this.setupSideQuests();
    this.setupLife();
    this.setupOrientation();
    this.ui.onLine = l => (l ? this.voice.speak(l.speaker, l.text) : this.voice.stop());
    const unlockAudio = () => { loadSamples(); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
    window.addEventListener('pointerdown', unlockAudio); window.addEventListener('keydown', unlockAudio);
    for (const w of this.npcs.walkers) this.registerSpeaker(w.name, w.avatar);
    this.registerSpeaker('You', this.player.avatar);
    this.setupCoins();
    this.setupMarkers();
    this.setupClickInspect();
    this.syncBuildingInfo();
    this.world.onEraChanged.push(() => this.syncBuildingInfo());
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
      const cfg = (GAME_CONFIG.interiors as any)[id] as { eras: EraId[] | null; label: string; building?: string };
      const open = () => !cfg.building || this.world.buildingStanding(cfg.building) || this.gateBuilt(cfg.building);
      // Coordinates tagged with an interior space are room-local.
      this.interactions.add({ id: `core:exit-${id}`, kind: 'door', at: { x: 0, z: def.depth / 2 - 0.6, space: id }, radius: 2.4, prompt: 'Exit to campus', onInteract: () => this.exitInterior() });
      if (cfg.building && this.world.buildingDoors().some(d => d.id === cfg.building)) continue;   // its real doors are the entrances (setupBuildingDoors)
      const anchor = this.location(def.exteriorDoor);
      const d = this.world.doorPlacement(anchor);
      const door = makeDoor(true);
      door.add(wallSign(['ENTRANCE', def.label.split(' — ')[0]]));   // flat sign on the wall above the door
      door.rotation.y = Math.atan2(d.nx, d.nz);
      this.entrances.push({ id, x: d.x, z: d.z, eras: cfg.eras, label: def.label.split(' — ')[0] });
      // The door visual sits on the wall; the interaction point is just outside.
      this.interactions.add({
        id: `core:door-${id}`, kind: 'door', at: { x: d.x + d.nx * 1.8, z: d.z + d.nz * 1.8 }, radius: 2.6,
        eras: cfg.eras, prompt: `Enter: ${def.label}`, enabled: open,
        onInteract: () => this.enterInterior(id),
      });
      this.interactions.add({ id: `core:doorvis-${id}`, kind: 'generic', at: { x: d.x, z: d.z }, radius: 0, eras: cfg.eras, visual: door, prompt: '', onInteract: () => {} });
    }
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
    // electric scooters parked by the paths (rideable; present day only)
    const SC = ['#2fbf71', '#1f2328', '#e8a33d', '#3d6fa8'];
    let scooters = 0;
    for (let tries = 0; tries < 3000 && scooters < 10; tries++) {
      const r = paths[(rnd() * paths.length) | 0], [ax, az] = r.pts[0], [bx, bz] = r.pts[1], L = Math.hypot(bx - ax, bz - az); if (L < 4) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L, x = (ax + bx) / 2 + nx * (r.width / 2 + 0.6), z = (az + bz) / 2 + nz * (r.width / 2 + 0.6);
      if (!CAMPUS.campus.some(c => pointInPoly(x, z, c)) || everOccupied(x, z, 1) || onVehicleRoad(x, z) || this.world.nearDoor(x, z, 4) || this.carts.some(c => (c.cart.root.position.x - x) ** 2 + (c.cart.root.position.z - z) ** 2 < 64)) continue;
      const sc = new Vehicle(`scooter-${scooters}`, 'scooter', 'boxy90s', SC[scooters++ % SC.length]);
      sc.eras = ['presentFinale'];   // shared electric scooters are a recent thing: present day only
      add(sc, x, z, Math.atan2(bx - ax, bz - az));
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
    this.player.place(this.space, p.x + Math.sin(y) * 1.1, p.z + Math.cos(y) * 1.1, y); if (this.spaceId === 'exterior') this.unstick();
  }
  private vehicleLabel(v: Vehicle) { return v.kind === 'heli' ? 'Fly the helicopter' : v.kind === 'plane' ? 'Fly the plane' : v.kind === 'bike' ? 'Ride the bicycle' : v.kind === 'scooter' ? 'Ride the electric scooter' : v.kind === 'car' ? 'Drive the car' : 'Drive the golf cart'; }
  private addVehicleInteract(v: Vehicle) {
    this.interactions.add({
      id: `core:${v.id}`, kind: 'generic', at: { x: v.root.position.x, z: v.root.position.z }, radius: v.kind === 'car' ? 3.4 : 2.6,
      eras: v.eras as EraId[] | null, enabled: () => !this.player.vehicle && !this.player.seated, prompt: this.vehicleLabel(v),
      onInteract: () => this.enterCart(v, v.id),
    });
  }
  private enterCart(cart: Vehicle, id: string) {
    if (this.player.handstand) this.player.setHandstand(false);
    this.player.vehicle = cart; this.player.yaw = cart.root.rotation.y;
    this.player.position.copy(cart.root.position);
    if (cart.pose === 'sit') this.player.avatar.sit(true);
    this.interactions.remove(`core:${id}`);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.distance = isAircraft(cart.kind) ? 22 : cart.kind === 'car' ? 15 : 12;
    playSound(cart.kind === 'bike' ? 'bell' : cart.kind === 'scooter' ? 'tick' : 'carDoor'); if (cart.kind === 'car' || cart.kind === 'cart') setTimeout(() => playSound('engineStart'), 250);
    if (cart.kind === 'heli') { this.ui.toast('Helicopter: hold Space / B to climb · F / L to descend · stick or WASD to fly · Shift / ZR faster · E / A: land, then get out', 7000); return; }
    if (cart.kind === 'plane') { this.ui.toast('Plane: W / stick up = throttle · A/D turn · hold Space / B to climb (from 16 m/s) · F / L to dive · S to slow down · E / A: auto-land, then get out', 8000); return; }
    if (cart.kind === 'board') { this.ui.toast('Longboard: W push · S brake · A/D carve · Space ollie · downhill = faster · B or E to step off', 6000); return; }
    if (cart.kind === 'sled') { this.ui.toast('Sled: hills do the work! W push · S brake · A/D steer · B or E to get off', 6000); return; }
    this.ui.toast(cart.kind === 'bike' ? 'W/S pedal · A/D steer · E to get off' : cart.kind === 'scooter' ? 'W/S go/brake · A/D steer · E to step off' : 'W/S drive · A/D steer · E to get out');
  }
  exitCart(force = false) {
    const cart = this.player.vehicle; if (!cart) return;
    if (isAircraft(cart.kind) && !force) {
      const p = this.player.position, high = this.player.altitude() > 0.05 || p.y - this.world.groundY(p.x, p.z) > 0.6;
      if (high) {
        this.player.autoLand = !this.player.autoLand;
        this.ui.toast(this.player.autoLand ? `Landing… press E / A again once you’re on the ground.${cart.kind === 'plane' ? ' Then slow down with S.' : ''}` : 'Auto-landing cancelled.');
        playSound('tick'); return;
      }
      if (Math.abs(cart.speed) > 4) { this.ui.toast('Slow down first (S / stick down).'); playSound('error'); return; }
    }
    this.player.vehicle = null; this.player.autoLand = false; cart.speed = 0; this.player.avatar.sit(false); this.player.avatar.root.visible = true;
    if (isAircraft(cart.kind)) { cart.root.position.y = this.world.groundY(cart.root.position.x, cart.root.position.z); cart.fly(1, 0, 0, 0); cart.body.rotation.set(0, 0, 0); this.cameraRig.distance = GAME_CONFIG.camera.distance; }
    if (cart.kind === 'car' || cart.kind === 'cart') playSound('carDoor');
    // step out to the side
    const side = cart.kind === 'car' ? 2.4 : cart.kind === 'plane' ? 2.2 : cart.kind === 'heli' ? 2.0 : isRide(cart.kind) ? 0.9 : 1.8;
    const sx = Math.cos(this.player.yaw) * side, sz = -Math.sin(this.player.yaw) * side;
    const p = this.player.position, dir = !this.exteriorSpace.blocked(p.x - sx, p.z - sz, 0.45) ? -1 : 1;
    this.player.place(this.exteriorSpace, p.x + sx * dir, p.z + sz * dir, this.player.yaw);
    this.unstick();
    if (isRide(cart.kind)) { cart.root.removeFromParent(); playSound('tick'); } else this.addVehicleInteract(cart);
  }
  /** B: grab your longboard (a sled in winter) and ride it anywhere outside; B again to step off. */
  toggleRide() {
    if (this.player.vehicle) { if (isRide(this.player.vehicle.kind)) this.exitCart(); else this.ui.toast('You’re already riding something.'); return; }
    if (this.spaceId !== 'exterior') { this.ui.toast('Ride outside — not in the hallways!'); playSound('error'); return; }
    if (this.player.seated || this.busy) return;
    const kind = SETTINGS.season === 'winter' ? 'sled' : 'board';
    const v = new Vehicle(`ride-${kind}`, kind, 'boxy90s', ['#c0392b', '#2f6d8e', '#2fbf71', '#d1a12f'][(Math.random() * 4) | 0]);
    v.root.position.copy(this.player.position); v.root.rotation.y = this.player.yaw; this.renderer.scene.add(v.root);
    this.enterCart(v, v.id);
  }
  /** Which interior a building's doors lead into. */
  private interiorFor(buildingId: string): string | null {
    if (buildingId === 'kimball') return 'kimball-office';
    return this.interiors.defs.has(`bldg-${buildingId}`) ? `bldg-${buildingId}` : null;
  }
  /** Where you came in (so you leave by the same door). */
  private entryDoor: { space: string; x: number; z: number; nx: number; nz: number } | null = null;
  /** Every door on every campus building is an entrance into that building's interior. */
  private setupBuildingDoors() {
    const taken = [...this.interactions.items.values()].filter(it => it.kind === 'door' && it.space === 'exterior').map(it => ({ x: it.x, z: it.z }));
    this.world.buildingDoors().forEach((d, i) => {
      const room = this.interiorFor(d.id); if (!room || CLOSED.has(d.id)) return;
      const ox = d.x + d.nx * 1.8, oz = d.z + d.nz * 1.8;
      if (taken.some(t => Math.hypot(t.x - ox, t.z - oz) < 4)) return;                  // already an entrance here
      const cfg = (GAME_CONFIG.interiors as Record<string, { label: string; eras: EraId[] | null }>)[room];
      this.interactions.add({
        id: `core:bdoor-${i}`, kind: 'door', at: { x: ox, z: oz }, radius: 2.4, eras: cfg?.eras ?? null,
        enabled: () => this.world.buildingStanding(d.id) || this.gateBuilt(d.id),
        prompt: `Enter: ${(this.interiors.defs.get(room)?.label ?? room).split(' — ')[0]}`,
        onInteract: () => { this.entryDoor = { space: room, x: d.x, z: d.z, nx: d.nx, nz: d.nz }; void this.enterInterior(room); },
      });
      this.entrances.push({ id: `bdoor-${i}`, x: d.x, z: d.z, eras: cfg?.eras ?? null, label: d.id });
    });
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
  /** Quest characters (e.g. a candidate following you) walk with their legs when a quest moves them. */
  private questAvatars: { a: Avatar; x: number; z: number }[] = [];
  private animateQuestAvatars(dt: number) {
    const w = new THREE.Vector3();
    for (const q of this.questAvatars) {
      if (!q.a.root.parent || !q.a.root.visible) continue;
      q.a.root.getWorldPosition(w);
      const d = Math.hypot(w.x - q.x, w.z - q.z), speed = dt > 0 && d < 3 ? d / dt : 0;   // big jumps are teleports, not steps
      q.x = w.x; q.z = w.z; q.a.animate(dt, Math.min(7, speed));
    }
  }
  private updateMouths(dt: number) {
    const sp = this.ui.currentSpeaker;
    for (const [name, a] of this.speakers) { if (this.npcs?.speaking(a)) continue; a.talking = !!sp && sp.includes(name); a.updateMouth(dt); }   // students chatting in bubbles move their own mouths
  }
  /**
   * Face-to-face conversation: both characters turn toward each other and the camera frames
   * them side-on (a two-shot), on whichever side has room (indoors too). Released afterwards.
   */
  /**
   * Story conversations (Bednar, candidates — not students on the street) always start from the same spot:
   * the player stands 1.7 m in front of the character, facing them, on the side with the most open space
   * (picked once per character from the room geometry), so every scene gets the same camera shot.
   */
  private stageConversation(npc: THREE.Object3D) {
    const o = npc.position, ud = npc.userData as { homeYaw?: number; stageYaw?: number };
    ud.homeYaw ??= npc.rotation.y;
    if (ud.stageYaw === undefined) {
      const clear = (yaw: number) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); for (let k = 0.8; k <= 4.2; k += 0.35) if (this.space.blocked(o.x + fx * k, o.z + fz * k, 0.3)) return false; return true; };
      const tries = [0, 1, -1, 2, -2, 3, -3, 4].map(i => ud.homeYaw! + i * Math.PI / 4);
      ud.stageYaw = tries.find(clear) ?? ud.homeYaw;
    }
    const yaw = ud.stageYaw!, fx = Math.sin(yaw), fz = Math.cos(yaw), d = 1.7;
    this.player.place(this.space, o.x + fx * d, o.z + fz * d, yaw + Math.PI);
    this.player.avatar.root.rotation.y = yaw + Math.PI; npc.rotation.y = yaw;
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
  }

  private async faceToFace(other: THREE.Object3D, talk: () => Promise<void>) {
    const p = this.player.position, o = other.position;
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1;
    this.player.yaw = Math.atan2(dx, dz); this.player.avatar.root.rotation.y = this.player.yaw;
    other.rotation.y = Math.atan2(-dx, -dz);
    const mx = (p.x + o.x) / 2, mz = (p.z + o.z) / 2, px = -dz / d, pz = dx / d;
    const room = (sgn: number) => { let k = 0.5; while (k < 4.2 && !this.space.blocked(mx + px * sgn * k, mz + pz * sgn * k, 0.25)) k += 0.25; return k; };
    const a = room(1), b = room(-1), sgn = a >= b ? 1 : -1, dist = Math.max(1.6, Math.min(3.4 + d * 0.3, (sgn > 0 ? a : b) - 0.3));
    const y = this.space.groundY(mx, mz);
    this.camFocus = { from: new THREE.Vector3(mx + px * sgn * dist, y + 1.75, mz + pz * sgn * dist), to: new THREE.Vector3(mx, y + 1.45, mz) };
    try { await talk(); } finally { this.camFocus = null; this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position); }
  }

  private npcTalking = false;
  private lineBag = new LineBag();
  /** Talk to a student: a hello, then a small menu (chat, directions, goodbye). Walking up to two people
   *  who are chatting lets you join their conversation. */
  private async talkToNpc(w: NpcCrowd['walkers'][number]) {
    if (this.npcTalking) return;
    this.npcTalking = true; this.busy = true; w.talking = 999;
    const key = this.world.era === 'presentFinale' ? 'present' : this.world.era;
    const pool = GAME_CONFIG.npcs.lines[key] ?? GAME_CONFIG.npcs.lines.ricks1999;
    const who = `${w.name} · ${GAME_CONFIG.npcs.title}`, me = this.playerName || 'friend';
    const joined = this.npcs.chatInfo(w);
    if (joined) { this.npcs.endChat(w); joined.partner.talking = 999; }
    const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
    let hangOut = false;
    try {
      await this.faceToFace(w.avatar.root, async () => {
        const open: Parameters<UI['dialogue']>[0] = [];
        if (joined) {
          open.push({ speaker: who, text: pick(JOIN_LINES).replace('{topic}', joined.topic) });
          open.push({ speaker: `${joined.partner.name} · ${GAME_CONFIG.npcs.title}`, text: w.met ? `Oh, you know ${w.name}? Hi, I’m ${joined.partner.name}!` : `I’m ${joined.partner.name}, by the way. Nice to meet you!` });
          this.npcs.meet(joined.partner);
        } else if (!w.met) open.push({ speaker: who, text: `Hi! I’m ${w.name}. ${this.lineBag.next(key, pool)}` });
        else if (this.life.friendLevelOf(w.name) >= 2) open.push({ speaker: who, text: `${me}! ${['There’s my favorite person!', 'I was hoping I’d run into you!', 'Perfect timing, I was just thinking about you!'][(Math.random() * 3) | 0]} ${this.lineBag.next(key, pool)}` });
        else open.push({ speaker: who, text: `Hey, ${me}! ${this.lineBag.next(key, pool)}` });
        this.npcs.meet(w); w.heard++;
        await this.ui.dialogue(open);
        const up = this.life.talked(w);
        if (up) { playSound('success'); await this.ui.dialogue([{ speaker: who, text: up.gift }]); this.ui.toast(`🤝 ${w.name} is now your ${up.level}! +${up.coins} coins`, 4000); }
        for (let turn = 0; turn < 8; turn++) {
          const choice = await this.ui.panel({ title: `Talking with ${w.name}`, buttons: [
            { id: 'chat', label: '💬 Chat a little more' },
            { id: 'dir', label: '🧭 Ask for directions' },
            ...(this.sideQuests.hintFor() ? [{ id: 'hint', label: '❓ Anyone need help around here?' }] : []),
            ...(this.life.collectibleHint() ? [{ id: 'shiny', label: '✨ Seen anything interesting lying around?' }] : []),
            ...(this.life.friendLevelOf(w.name) >= 1 && this.life.hangingWith !== w ? [{ id: 'hang', label: '🤝 Want to walk around with me?' }] : []),
            ...(this.life.friendLevelOf(w.name) >= 1 ? [{ id: 'icecream', label: '🍦 Let’s get ice cream! (6 coins)' }, { id: 'dance', label: '💃 Go country dancing at the MC?' }] : []),
            { id: 'bye', label: '👋 Goodbye' },
          ] });
          if (choice === 'chat') await this.ui.dialogue([{ speaker: who, text: this.lineBag.next(key, pool) }]);
          else if (choice === 'dir') { if (await this.askDirections(w.name, who)) break; }
          else if (choice === 'hint') await this.ui.dialogue([{ speaker: who, text: this.sideQuests.hintFor()! }]);
          else if (choice === 'shiny') await this.ui.dialogue([{ speaker: who, text: this.life.collectibleHint() ?? 'Hmm, nothing lately.' }]);
          else if (choice === 'icecream') {
            if (!this.life.progress.spend(6, this.coinTotal())) { await this.ui.dialogue([{ speaker: who, text: 'Ha, maybe when payday comes! Try a part-time job.' }]); continue; }
            await this.ui.dialogue([{ speaker: who, text: ['Yes! Huckleberry for me.', 'Ice cream in Rexburg? Always.', 'I know the perfect place!'][(Math.random() * 3) | 0] }]);
            await this.ui.blackout('🍦 …', 1400);
            await this.ui.dialogue([{ speaker: who, text: `This was fun, ${me}. We should do this more often!` }]);
            this.life.progress.friends[w.name] = (this.life.progress.friends[w.name] ?? 0) + 2; this.life.progress.add('dates'); playSound('success'); this.ui.toast(`🍦 You and ${w.name} grew closer!`); this.save(); break;
          } else if (choice === 'dance') {
            const wed = this.life.clock.day === 2 && this.life.clock.hour >= 18;
            if (!wed) { await this.ui.dialogue([{ speaker: who, text: 'Country dancing is Wednesday nights at the MC — let’s go then! (Or right now, just for practice?)' }]); }
            await rhythm(this.lifeHost, this.life.progress, 'dance');
            this.life.progress.friends[w.name] = (this.life.progress.friends[w.name] ?? 0) + (wed ? 2 : 1); this.life.progress.add('dates'); this.save(); break;
          }
          else if (choice === 'hang') { await this.ui.dialogue([{ speaker: who, text: ['Sure! Lead the way.', 'I’d love to! I’ve got a little time before class.', 'Yes! Let’s go.'][(Math.random() * 3) | 0] }]); hangOut = true; break; }
          else { await this.ui.dialogue([{ speaker: who, text: pick([`See you around, ${me}!`, 'Bye! Have a good one.', 'Catch you later!', 'Good luck with everything!']) }]); break; }
        }
      });
    } finally { this.busy = false; this.npcTalking = false; w.talking = 1.5; if (joined) joined.partner.talking = 1.5; }
    if (hangOut) { w.talking = 0; this.life.hangOut(w); }
  }

  // ---------------- campus life ----------------
  private setupLife() {
    this.life = new CampusLife(this.lifeHost = {
      scene: this.renderer.scene, camera: this.renderer.camera, npcs: this.npcs, world: this.world, ui: this.ui, avatar: this.player.avatar,
      era: () => this.world.era, season: () => SETTINGS.season,
      player: () => ({ x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.player.yaw, space: this.spaceId, driving: this.player.vehicle?.kind ?? false, seated: this.player.seated, speed: this.player.speed }),
      playerName: () => this.playerName,
      nudgePlayer: (dx, dz) => this.player.nudge(dx, dz),
      spotBy: (b, side, out) => this.sideQuestsHost.spotBy(b, side, out),
      doorOf: id => {
        const ds = this.world.buildingDoors().filter(d => d.id === id); if (!ds.length) return null;
        const poly = registryPoly(id), cx = poly ? poly.reduce((a, q) => a + q[0], 0) / poly.length : ds[0].x, cz = poly ? poly.reduce((a, q) => a + q[1], 0) / poly.length : ds[0].z;
        const d = ds.reduce((a, q) => (Math.hypot(q.x - cx, q.z - cz) < Math.hypot(a.x - cx, a.z - cz) ? q : a));
        return [d.x + d.nx * 1.5, d.z + d.nz * 1.5];
      },
      addInteractable: d => this.interactions.add({ id: d.id, kind: d.npc ? 'npc' : 'generic', at: d.at, radius: d.radius, prompt: d.prompt, visual: d.visual, enabled: d.enabled, onInteract: d.onInteract }),
      removeInteractable: id => this.interactions.remove(id),
      talk: (npc, lines) => this.faceToFace(npc, () => this.ui.dialogue(lines)),
      choose: (title, body, buttons) => this.ui.panel({ title, body, buttons }),
      toast: (t, ms) => this.ui.toast(t, ms),
      sound: n => playSound(n),
      wallet: () => this.coinTotal(),
      canPlay: () => this.mode === 'playing' && !this.busy && !this.ui.blocking && !this.cutscenes.active && !this.pauseOpen && !this.interactions.busy,
      sideBusy: () => !!this.sideQuests.tracker(),
      takeThrow: () => { const a = this.input.state; if (a.pressed('alt')) { a.consume('alt'); return true; } return false; },
      holdItem: c => this.player.avatar.holdItem(c, 0.32),
      seat: (x, z, yaw) => { this.player.place(this.exteriorSpace, x, z, yaw); this.player.seated = true; this.player.avatar.sit(true); this.player.avatar.root.rotation.y = yaw; playSound('sit'); },
      stand: () => { if (this.player.seated) this.standUp(); },
      save: () => this.save(),
    });
    this.life.clock.running = SETTINGS.dayNight;
    this.life.setup({
      spawnAircraft: k => this.spawnAircraft(k),
      roofY: (x, z) => this.world.grid.topAt(x, z),
      vehicle: () => { const v = this.player.vehicle; return v ? { kind: v.kind, yaw: this.player.yaw, speed: v.speed, altitude: this.player.altitude() } : null; },
    });
    this.life.setupShelf(this.interiors.groups.get(HOME_ID)!, HOME_ID);
    this.setupManwaring();
    this.setupHart();
    this.setupActivities();
    this.world.onEraChanged.push(() => this.life.setEra());
    this.player.onOllie = air => this.life.ollie(air);
  }
  /** Manwaring Center: stairs to the Strike Zone, bowling, the grill and the school store. */
  private setupManwaring() {
    const MC = 'bldg-manwaring'; if (!this.interiors.defs.has(MC) || !this.interiors.defs.has(STRIKE_ZONE)) return;
    const at = (space: string, p: { x: number; z: number }) => ({ x: p.x, z: p.z, space });
    const free = () => !this.busy && !this.player.seated;
    const goTo = async (space: string, p: { x: number; z: number }, yaw: number) => {
      await this.enterInterior(space); const w = this.interiors.toWorld(space, p.x, p.z);
      this.player.place(this.space, w.x, w.z, yaw); this.cameraRig.reset(yaw); this.cameraRig.snap(this.player.position);
    };
    const hooks = { wallet: () => this.coinTotal(), eat: (f: { name: string; color: string; line: string }) => { void this.eat(f); }, refreshLook: () => { this.applyOutfit(); this.save(); },
      storeName: () => storeNameFor(ERAS[this.world.era].institution), era: () => this.world.era, decorChanged: () => this.life.apartment?.refresh() };
    this.interactions.add({ id: 'mc:down', kind: 'door', at: at(MC, MC_SPOTS.stairsDown), radius: 2.2, enabled: free, prompt: 'Go downstairs: Strike Zone (bowling & games)', onInteract: () => goTo(STRIKE_ZONE, { x: MC_SPOTS.stairsUp.x - 2.5, z: MC_SPOTS.stairsUp.z - 1 }, Math.PI) });
    this.interactions.add({ id: 'mc:up', kind: 'door', at: at(STRIKE_ZONE, MC_SPOTS.stairsUp), radius: 2.4, enabled: free, prompt: 'Go upstairs: the Crossroads', onInteract: () => goTo(MC, { x: MC_SPOTS.stairsDown.x + 2.5, z: MC_SPOTS.stairsDown.z - 1 }, Math.PI) });
    this.interactions.add({ id: 'mc:bowl', kind: 'generic', at: at(STRIKE_ZONE, MC_SPOTS.bowl), radius: 2.2, enabled: free, prompt: () => `Bowl a game${this.life.progress.stat('bowlBest') ? ` (best ${this.life.progress.stat('bowlBest')})` : ''}`, onInteract: () => bowl(this.lifeHost, this.life.progress) });
    this.interactions.add({ id: 'mc:grill', kind: 'generic', at: at(STRIKE_ZONE, MC_SPOTS.grill), radius: 2.4, enabled: free, prompt: 'Order at the Strike Zone Grill', onInteract: () => openStore(this.lifeHost, this.life.progress, hooks, 'food') });
    // the bulletin board: three daily tasks
    const board = new THREE.Group();
    const cork = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: '#b08455', roughness: 0.95 })); cork.position.y = 1.55; board.add(cork);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.36, 1.56, 0.06), new THREE.MeshStandardMaterial({ color: '#4a3524' })); frame.position.set(0, 1.55, -0.03); board.add(frame);
    for (const [x, y, c] of [[-0.7, 1.8, '#fff6a8'], [-0.1, 1.85, '#ffd1dc'], [0.55, 1.75, '#cfe9ff'], [-0.45, 1.25, '#d8ffd1'], [0.3, 1.25, '#ffffff'], [0.8, 1.35, '#ffe0b0']] as [number, number, string][]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })); n.position.set(x, y, 0.045); n.rotation.z = (Math.random() - 0.5) * 0.2; board.add(n);
    }
    for (const lx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: '#4a3524' })); leg.position.set(lx, 0.45, 0); board.add(leg); }
    this.interactions.add({ id: 'mc:board', kind: 'generic', at: at(MC, { x: 18.6, z: 12.6 }), radius: 2.4, visual: board, enabled: free,
      prompt: () => (this.bulletin.live ? 'Bulletin board — today’s tasks' : '📌 Read the bulletin board (3 new daily tasks)'),
      onInteract: () => { this.bulletin.accept(); playSound('tick'); const sc = this.ui.menu('📌 Bulletin board', [{ label: 'Got it', action: () => this.ui.pop(sc) }], { html: this.bulletin.html(), onBack: () => this.ui.pop(sc) }); this.save(); } });
    this.interactions.add({ id: 'mc:store', kind: 'generic', at: at(MC, MC_SPOTS.store), radius: 2.6, enabled: free, prompt: () => `Shop at the ${storeNameFor(ERAS[this.world.era].institution)} (clothes, accessories, snacks)`, onInteract: () => openStore(this.lifeHost, this.life.progress, hooks) });
  }
  /** Hart Building: the treadmill sprint and the 60-second shooting challenge (records saved). */
  private setupHart() {
    const H = 'bldg-hart'; if (!this.interiors.defs.has(H)) return;
    const free = () => !this.busy && !this.player.seated;
    const k: HartHost = {
      toWorld: (x, z) => this.interiors.toWorld(H, x, z),
      place: (x, z, yaw) => { const w = this.interiors.toWorld(H, x, z); this.player.place(this.space, w.x, w.z, yaw); this.player.avatar.root.rotation.y = yaw; this.cameraRig.reset(yaw); this.cameraRig.distance = 7; this.cameraRig.pitch = 0.35; this.cameraRig.snap(this.player.position); },
      emote: fn => { this.player.emote = fn; },
      lie: at => {
        if (at) {
          this.player.lying = { x: at.x, y: 0, z: at.z, yaw: at.yaw }; this.player.avatar.lie(true, at.height);
          this.camFocus = { from: new THREE.Vector3(at.x + 3.2, 2.4, at.z + 0.4), to: new THREE.Vector3(at.x, 0.75, at.z - 1.2) };   // a side shot of the bench
        } else { this.player.lying = null; this.player.avatar.lie(false); this.camFocus = null; }
      },
    };
    const run = async (f: () => Promise<void>) => { if (this.busy) return; this.busy = true; try { await f(); } finally { this.busy = false; } };
    const P = this.life.progress, tenths = (n: number) => `${Math.floor(n / 600)}:${((n % 600) / 10).toFixed(1).padStart(4, '0')}`;
    this.interactions.add({ id: 'hart:treadmill', kind: 'generic', at: { ...HART.treadmillStand, space: H }, radius: 1.8, enabled: free,
      prompt: () => `Run on the treadmill — 400 m sprint${P.stat('treadBest') ? ` (record ${tenths(P.stat('treadBest'))})` : ''}`,
      onInteract: () => run(() => treadmill(this.lifeHost, P, k, HART.treadmill, HART.treadmillStand)) });
    this.interactions.add({ id: 'hart:bench', kind: 'generic', at: { ...HART.benchStand, space: H }, radius: 1.6, enabled: free,
      prompt: () => `Bench press contest${P.stat('benchBest') ? ` (record ${P.stat('benchBest')} lb / ${kg(P.stat('benchBest'))} kg)` : ''}`,
      onInteract: () => run(() => benchPress(this.lifeHost, P, k, HART.bench, HART.benchStand)) });
    // real basketball on the south half court: shootaround, the 60-second challenge, and 1-on-1 vs Jace
    const hoops = this.hoops = new Hoops(this.lifeHost, P, this.interiors.groups.get(H)!, this.interiors.origin(H));
    const notPlaying = () => free() && !hoops.holding && hoops.mode === 'free';
    this.interactions.add({ id: 'hart:shootout', kind: 'generic', at: { x: -19.5, z: 15.6, space: H }, radius: 1.8, enabled: notPlaying,
      prompt: () => `Shooting challenge — 60 seconds${P.stat('hoopsBest') ? ` (record ${P.stat('hoopsBest')} pts)` : ''}`, onInteract: () => hoops.startChallenge() });
    const jace = new Avatar({ ...eraLook('presentFinale', 4411), shirt: '#7a2b2b', shorts: true }); jace.setLabel('Jace', '1-on-1');
    this.hartJace = jace;
    this.interactions.add({ id: 'hart:1on1', kind: 'npc', at: { x: -24.8, z: 8.5, space: H }, radius: 2.4, visual: jace.root, enabled: notPlaying,
      prompt: () => `Play 1-on-1 vs Jace — first to 11${P.stat('oneOnOneWins') ? ` (${P.stat('oneOnOneWins')} wins)` : ''}`,
      onInteract: async () => { await this.ui.dialogue([{ speaker: 'Jace · Student', text: this.life.progress.stat('oneOnOneWins') ? 'Back for more? Let’s go — make it, take it… no, just kidding. Check ball!' : 'You want to run one? First to eleven. Twos and threes. Don’t foul me!' }]); hoops.startOneOnOne(); } });
    // three-point contest (racks appear around the arc)
    this.interactions.add({ id: 'hart:threes', kind: 'generic', at: { x: -4.6, z: 15.2, space: H }, radius: 1.8, enabled: notPlaying,
      prompt: () => `Three-point contest — 5 racks${P.stat('threesBest') ? ` (record ${P.stat('threesBest')}/30)` : ''}`, onInteract: () => hoops.startThrees() });
    // the Hart 2-on-2 League: Kenzie is your teammate; three rounds, a table, a title
    const kenzie = new Avatar({ ...eraLook('presentFinale', 2207), shirt: LEAGUE_TEAMS[0].shirt, shorts: true }); kenzie.setLabel('Kenzie', '2-on-2 League');
    this.hartKenzie = kenzie;
    hoops.onLeagueResult = (r, won, score) => {
      const T = LEAGUE_TEAMS, lines = [won ? `🏆 You and Kenzie win ${score}! +20 coins` : `You lose ${score}. Shake it off.`, `Elsewhere: ${r.otherResult}.`];
      if (r.round === 3) { lines.push(r.champion ? '🏆 LEAGUE CHAMPIONS! +40 coins — your names go up on the Hart banner.' : 'The season is over — not this time. A new season starts now.'); if (r.champion) P.earn(40); }
      else lines.push(`Next up: ${T[leagueOpponent(r.round)].name}. Talk to Kenzie when you’re ready.`);
      void this.ui.dialogue(lines.map(text => ({ speaker: 'Kenzie · Teammate', text }))); this.save();
    };
    this.interactions.add({ id: 'hart:league', kind: 'npc', at: { x: -24.8, z: 4.2, space: H }, radius: 2.4, visual: kenzie.root, enabled: notPlaying,
      prompt: () => `Hart 2-on-2 League with Kenzie — game ${P.stat('lgRound') + 1} of 3${P.stat('leagueTitles') ? ` (${P.stat('leagueTitles')} 🏆)` : ''}`,
      onInteract: () => this.showLeague() });
  }
  private hartKenzie: Avatar | null = null;
  /** League table + start the next league game (or a friendly). */
  private showLeague() {
    const P = this.life.progress, hoops = this.hoops; if (!hoops) return;
    const opp = leagueOpponent(P.stat('lgRound')), T = LEAGUE_TEAMS[opp];
    const rows = leagueTable(P).map((r, k) => `<tr${r.i === 0 ? ' class="me"' : ''}><td>${k + 1}</td><td>${esc(r.name)}</td><td>${r.w}</td><td>${r.l}</td></tr>`).join('');
    const body = `<table class="league"><tr><th>#</th><th>Team</th><th>W</th><th>L</th></tr>${rows}</table><p class="sub">Round ${P.stat('lgRound') + 1} of 3 · next: <b>${esc(T.name)}</b> (${esc(T.players.join(' & '))}) · titles won: ${P.stat('leagueTitles')}</p>`;
    const sc = this.ui.menu('🏀 Hart 2-on-2 League', [
      { label: `Play ${T.name} (league game)`, action: () => { this.ui.pop(sc); hoops.startTwoOnTwo(opp, true); } },
      { label: 'Friendly vs Hart Attack', action: () => { this.ui.pop(sc); hoops.startTwoOnTwo(1, false); } },
      { label: 'Not now', action: () => this.ui.pop(sc) },
    ], { html: body, onBack: () => this.ui.pop(sc) });
  }
  /** Building minigames, part-time jobs, the stadium race, intramurals, celebrations, the pet and decor. */
  private setupActivities() {
    const P = this.life.progress, L = this.life, free = () => !this.busy && !this.player.seated;
    const run = async (f: () => Promise<unknown>) => { if (this.busy) return; this.busy = true; try { await f(); } finally { this.busy = false; } };
    const spot = (id: string, space: string, x: number, z: number, prompt: () => string, go: () => Promise<unknown> | void, r = 2.2) => {
      if (!this.interiors.defs.has(space)) return;
      this.interactions.add({ id, kind: 'generic', at: { x, z, space }, radius: r, enabled: free, prompt, onInteract: () => run(async () => { await go(); }) });
    };
    const H = this.lifeHost, rec = (k: string, f: (v: number) => string) => (P.stat(k) ? ` (best ${f(P.stat(k))})` : '');
    const choose = (title: string, body: string, opts: { id: string; label: string }[]) => this.ui.panel({ title, body, buttons: [...opts, { id: 'no', label: 'Not now' }] });
    // McKay: find books (for fun or as a paid shift)
    spot('act:library', 'bldg-mckay', -14, 10.9, () => `Library: find books by call number${rec('bookBest', v => `${(v / 10).toFixed(1)} s`)}`, async () => {
      const r = await choose('McKay Library', 'Help find books on the shelves. Or work a shift and get paid per book!', [{ id: 'play', label: '📕 Find 5 books (record)' }, { id: 'job', label: '💼 Work a library shift (paid)' }]);
      if (r === 'play' || r === 'job') await bookHunt(H, P, { paid: r === 'job' });
    });
    spot('act:planetarium', 'bldg-romney', -11.6, 8.6, () => 'Planetarium show: connect the constellations', () => planetarium(H, P));
    spot('act:concert', 'bldg-snow', 0, -8.4, () => `Play along with the concert${rec('rhythmBest', v => `${v}%`)}`, () => rhythm(H, P, 'concert'), 2.6);
    spot('act:repair', 'bldg-austin', -14, -3.0, () => `Fix cars in the shop${rec('repairBest', v => `${v} pts`)}`, () => carRepair(H, P));
    spot('act:pong', 'mc-strikezone', MC_SPOTS.pong.x, MC_SPOTS.pong.z + 1.6, () => `Play ping-pong${P.stat('pongWins') ? ` (${P.stat('pongWins')} wins)` : ''}`, () => pingPong(H, P, this.friendNames(1)[0] ?? 'Jace'));
    spot('act:cafe', 'bldg-manwaring', 19, -13.2, () => 'Work a Crossroads shift (paid)', () => cafeteria(H, P));
    spot('act:tour', 'bldg-manwaring', 14, 14.5, () => 'Work as a campus tour guide (paid)', () => tourGuide(H, P, this.world.era));
    spot('act:records', 'bldg-hart', -6, -15.4, () => 'Campus records board', () => { const s = this.ui.menu('Campus records', [{ label: 'Back', action: () => this.ui.pop(s) }], { html: recordsHtml(P), subtitle: 'Beat the campus’s best students in every event.', onBack: () => this.ui.pop(s), className: 'life-list' }); });
    spot('act:intramurals', 'bldg-hart', -23.4, 13.4, () => `Intramural 3-on-3 tournament${P.stat('imTitles') ? ` (${P.stat('imTitles')} 🏆)` : ''}`, async () => {
      const week = Math.floor(L.clock.minutes / (1440 * 7));
      if (P.stat('imWeek') > week) { this.ui.toast('This week’s tournament is over. Come back next week!', 3500); return; }
      await intramurals(H, P, this.friendNames(2), week);
    });
    // the stadium race
    const start = L.race.setup();
    if (start) {
      const coach = new Avatar({ ...eraLook(this.world.era, 9400), shirt: '#2a2a2a', hat: 'cap', hatColor: '#c0392b' }); coach.setLabel('Coach Reed', 'Stadium race');
      this.interactions.add({ id: 'act:race', kind: 'npc', at: { x: start.x + 3, z: start.z }, radius: 3, visual: coach.root, enabled: () => free() && !L.race.active,
        prompt: () => `Talk to Coach Reed — stadium race${rec('raceBest', v => `${(v / 10).toFixed(1)} s`)}`,
        onInteract: async () => { const r = await choose('Stadium race', 'One lap around the field against Wyatt, Ivy and me. Run through the four rings — sprint with Shift!', [{ id: 'go', label: '🏁 Race!' }]); if (r === 'go') L.race.begin(); } });
    }
    // seasonal celebrations
    const home = this.world.doorPlacement(this.location('door.home')), quad = this.resolve('spawn');
    L.celebrations = new Celebrations(H, () => ({ lamps: this.world.lamps, doors: this.world.buildingDoors(), quad: { x: quad.x + 12, z: quad.z + 8 } }), (x, y, z) => this.effects.fireworks(x, y, z, 1.4, SETTINGS.reducedMotion));
    L.celebrations.set(SETTINGS.season); void home;
    const prevSeason = this.applySeason; this.applySeason = () => { prevSeason(); L.celebrations?.set(SETTINGS.season); };
    // the pet and decorations in the apartment
    const hg = this.interiors.groups.get(HOME_ID)!; L.apartment = new Apartment(hg, P);
    ((hg.userData.ticks ??= []) as ((dt: number, t: number) => void)[]).push((_dt, t) => L.apartment?.tick(t));
    this.interactions.add({ id: 'home:pet', kind: 'generic', at: { x: 3.0, z: 4.5, space: HOME_ID }, radius: 1.6, enabled: free,
      prompt: () => { const k = P.stat('pet'); return k ? `Feed your ${PETS.find(p => p.id === k)!.name.toLowerCase()}` : 'Adopt a pet'; },
      onInteract: async () => {
        if (!P.stat('pet')) { const r = await this.ui.panel({ title: 'Adopt a pet', body: 'Every apartment needs a little roommate. Who will it be?', buttons: [...PETS.map(p => ({ id: String(p.id), label: `${p.icon} ${p.name}` })), { id: 'no', label: 'Maybe later' }] });
          if (!r || r === 'no') return; P.set('pet', Number(r)); P.set('petFed', L.clock.minutes); L.apartment?.refresh(); playSound('success'); this.ui.toast(`${PETS.find(p => p.id === Number(r))!.icon} Welcome home, little buddy!`); this.save(); return; }
        const hrs = petHunger(P, L.clock); P.set('petFed', L.clock.minutes); P.add('petFeeds'); playSound('pop');
        this.ui.toast(hrs > 24 ? '🥺 So hungry! Your pet gobbles up the food. Try to feed it every day.' : hrs > 8 ? '😊 Your pet happily eats.' : '🙂 Not very hungry, but it nibbles a little.', 3500); this.save();
      } });
  }
  /** Names of your closest friends (for teammates and rivals). */
  private friendNames(n: number) { const f = Object.entries(this.life.progress.friends).sort((a, b) => b[1] - a[1]).map(x => x[0]); return [...f, 'Dallin', 'Kenzie', 'Jace'].slice(0, n); }
  /** The phone (Q): a pager in 1999–2001, a smartphone later. */
  showPhone() {
    this.tourFlags.add('phone');
    const L = this.life, P = L.progress, era = this.world.era, msgs: { from: string; text: string }[] = [];
    const n = nextClass(L.clock, era); if (n) { const mins = Math.round(n.at - L.clock.minutes), when = mins <= 90 ? (mins > 0 ? `in ${mins} min` : 'now!') : `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.floor(n.at / 1440) % 7]} ${String(n.slot.hour).padStart(2, '0')}:00`; msgs.push({ from: 'Next class', text: `${n.slot.subject} — ${when}` }); }
    const f = this.friendNames(3).filter(x => P.friends[x]);
    for (const name of f) msgs.push({ from: name, text: ['Want to get ice cream later? 🍦', 'Saw you on campus today! Wave next time!', 'Intramurals this week? We need you!', 'Study group at the library tonight?'][(name.length + L.clock.day) % 4] });
    const hint = L.collectibleHint(); if (hint) msgs.push({ from: 'Campus buzz', text: hint });
    if (P.stat('pet') && petHunger(P, L.clock) > 12) msgs.push({ from: 'Home', text: 'Your pet looks hungry. 🥺' });
    if (L.celebrations?.label()) msgs.push({ from: 'Campus news', text: L.celebrations.label() });
    const sub = (title: string, html: string) => { const s = this.ui.menu(title, [{ label: 'Back', action: () => this.ui.pop(s) }], { html, onBack: () => this.ui.pop(s), className: 'life-list' }); };
    openPhone(this.lifeHost, {
      era, time: L.clock.label(), weather: this.world.raining ? '🌧️' : SETTINGS.season === 'winter' ? '❄️' : this.world.daylight < 0.2 ? '🌙' : '☀️', messages: msgs,
      apps: [
        { id: 'map', icon: '🗺️', name: 'Map', open: () => this.openMap() },
        { id: 'sched', icon: '📚', name: 'Classes', open: () => sub('Class schedule', scheduleHtml(L.clock, era, P)) },
        { id: 'records', icon: '🏆', name: 'Records', open: () => sub('Campus records', recordsHtml(P)) },
        { id: 'friends', icon: '🤝', name: 'Friends', open: () => sub('Friends', L.friendsHtml()) },
        { id: 'photos', icon: '🖼️', name: 'Photos', open: () => sub('Photo album', L.photo.albumHtml()) },
        { id: 'ach', icon: '⭐', name: 'Achievements', open: () => sub('Achievements', L.achievementsHtml()) },
      ],
    });
  }
  private lifeHost!: ConstructorParameters<typeof CampusLife>[0];
  hoops: Hoops | null = null;
  private hartJace: Avatar | null = null;
  private inHart = false;
  /** Every coin you own: story rewards, pickups, side quests and campus life (minus what you spent). */
  coinTotal() { return this.quests.totalRewardCoins() + this.collectedCoins.size * GAME_CONFIG.rewards.pickupCoin + this.sideQuests.coins() + this.life.coinsNet(); }
  /** Pause menu: campus life (achievements, friends, collection, photos). */
  showLifeMenu() {
    const P = this.life.progress, close = () => this.ui.pop(s);
    const sub = (title: string, html: string, subtitle?: string) => { const m = this.ui.menu(title, [{ label: 'Back', action: () => this.ui.pop(m) }], { html, subtitle, onBack: () => this.ui.pop(m), className: 'life-list' }); };
    const s = this.ui.menu('Campus life', [
      { label: '📷 Take photos (camera mode — P)', action: () => { this.ui.clear(); this.pauseOpen = false; this.quests.resumeAll(); this.life.photo.open(); } },
      { label: `🛹 ${SETTINGS.season === 'winter' ? 'Grab a sled' : 'Grab your longboard'} (B)`, action: () => { this.ui.clear(); this.pauseOpen = false; this.quests.resumeAll(); this.toggleRide(); } },
      { label: `🏆 Achievements (${P.achievements.size}/${ACHIEVEMENT_COUNT})`, action: () => sub('Achievements', this.life.achievementsHtml()) },
      { label: `🚗 Vehicle jobs (${this.life.jobs?.doneCount() ?? 0}/5)`, action: () => sub('Vehicle jobs', this.life.jobs?.journalHtml() ?? '') },
      { label: `🤝 Friends (${Object.keys(P.friends).length})`, action: () => sub('Friends', this.life.friendsHtml()) },
      { label: `📦 Collection (${P.collected.size}/${COLLECTIBLE_COUNT})`, action: () => this.life.showCollection() },
      { label: `🖼️ Photo album (${this.life.photo.album.length})`, action: () => sub('Photo album', this.life.photo.albumHtml(), 'Your latest photos (kept in this browser).') },
      { label: 'Back', action: close },
    ], { subtitle: `${this.life.clock.label()} · ${this.life.coinsNet()} coins earned from campus life`, onBack: close });
  }

  // ---------------- side quests ----------------
  private sideQuestsHost!: ConstructorParameters<typeof SideQuests>[0];
  private setupSideQuests() {
    const outward: Record<string, number> = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };
    this.sideQuests = new SideQuests(this.sideQuestsHost = {
      scene: this.renderer.scene,
      era: () => this.world.era,
      difficulty: () => this.difficulty,
      player: () => ({ x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw, space: this.spaceId, driving: !!this.player.vehicle }),
      playerName: () => this.playerName,
      groundY: (x, z) => this.world.groundY(x, z),
      blocked: (x, z, r) => this.world.blocked(x, z, r),
      spotBy: (building, side, out = 4.5) => {
        const poly = registryPoly(building); if (!poly) return null;
        const xs = poly.map(q => q[0]), zs = poly.map(q => q[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const ns = side === 'n' || side === 's', len = ns ? x1 - x0 : z1 - z0;
        // walk outwards from the wall's midpoint, sliding along it, until a free spot clear of doors and roads
        for (let o = out; o < out + 14; o += 1.5) for (const t of [0, 0.15, -0.15, 0.3, -0.3, 0.42, -0.42]) {
          const x = ns ? cx + t * len : side === 'e' ? x1 + o : x0 - o, z = ns ? (side === 's' ? z1 + o : z0 - o) : cz + t * len;
          if (pointInPoly(x, z, poly) || this.world.blocked(x, z, 0.9) || this.world.nearDoor(x, z, 3.5) || onVehicleRoad(x, z)) continue;
          return { x, z, yaw: outward[side] };
        }
        return null;
      },
      court: () => { const b = this.balls?.balls.find(q => q.kind === 'basketball'); return b ? { x: b.home.x, z: b.home.z } : null; },
      addInteractable: d => this.interactions.add({ id: d.id, kind: d.npc ? 'npc' : 'generic', at: d.at, radius: d.radius, prompt: d.prompt, visual: d.visual, objective: d.objective, enabled: d.enabled, onInteract: d.onInteract }),
      removeInteractable: id => this.interactions.remove(id),
      talk: (npc, lines) => this.faceToFace(npc, () => this.ui.dialogue(lines)),
      choose: (title, body, buttons) => this.ui.panel({ title, body, buttons }),
      toast: (t, ms) => this.ui.toast(t, ms),
      sound: n => playSound(n),
      holdItem: c => this.player.avatar.holdItem(c, 0.32),
      registerSpeaker: (n, a) => this.registerSpeaker(n, a),
      save: () => this.save(),
    });
    this.sideQuests.setup();
    this.world.onEraChanged.push(() => this.sideQuests.setEra());
  }
  /** Pause menu: the side-quest journal. */
  showSideJournal() {
    const rows = this.sideQuests.journal(), mark = { available: '❗', active: '▶', ready: '❓', done: '✓' } as const;
    const html = `<table class="side-journal">${rows.map(r => `<tr class="${r.status}"><td>${mark[r.status]}</td><td><b>${esc(r.title)}</b><br><span>${esc(r.text)}</span></td></tr>`).join('')}</table>`;
    const s = this.ui.menu(`Side quests (${this.sideQuests.doneCount()}/${rows.length} done)`, [{ label: 'Back', action: () => this.ui.pop(s) }],
      { subtitle: 'Look for people with a yellow “!” over their heads. Students can point you to them, too.', html, onBack: () => this.ui.pop(s) });
  }

  // ---------------- directions (ask a student; a waypoint leads you there) ----------------
  guide: { x: number; z: number; label: string; building?: string } | null = null;
  /** Places a student can point you to, standing in the current era (closest entrance of each). */
  private destinations(): { label: string; x: number; z: number; building?: string }[] {
    const inst = ERAS[this.world.era].institution, p = this.player.position;
    const out: { label: string; x: number; z: number; building?: string }[] = [];
    const want = ['mckay', 'manwaring', 'hart', 'kimball', 'snow', 'taylor', 'romney', 'smith', 'austin', 'clarke', 'benson', 'hinckley', 'icenter', 'temple', 'stc', 'ricks-building'];
    for (const id of want) {
      const b = BUILDINGS.find(x => x.id === id); if (!b || !this.world.buildingStanding(id)) continue;
      const name = (inst === 'byui' ? b.names.byui ?? b.names.ricks : b.names.ricks ?? b.names.byui); if (!name) continue;
      const doors = this.world.buildingDoors().filter(d => d.id === id);
      const poly = registryPoly(id); if (!poly && !doors.length) continue;
      const at = doors.length ? doors.reduce((a, d) => (Math.hypot(d.x - p.x, d.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? d : a))
        : { x: poly!.reduce((s2, q) => s2 + q[0], 0) / poly!.length, z: poly!.reduce((s2, q) => s2 + q[1], 0) / poly!.length };
      out.push({ label: name, x: at.x, z: at.z, building: id });
    }
    const home = this.world.doorPlacement(this.location('door.home'));
    out.push({ label: 'My apartment', x: home.x, z: home.z });
    return out;
  }
  /** First-minutes checklist (campuslife/orientation.ts). */
  orientation!: Orientation;
  /** MC bulletin board daily tasks (campuslife/bulletin.ts). */
  bulletin!: Bulletin;
  private tourFlags = new Set<string>(); private tourT = 0;
  private setupOrientation() {
    const P = this.life.progress, k = () => this.player.vehicle?.kind;
    this.orientation = new Orientation(P, {
      map: () => this.tourFlags.has('map'), phone: () => this.tourFlags.has('phone'),
      talk: () => Object.keys(P.friends).length > 0, ride: () => k() === 'board' || k() === 'sled',
      photo: () => P.stat('photosTaken') > 0, mc: () => P.visited.has('bldg-manwaring'), hart: () => P.visited.has('bldg-hart'),
      shuttle: () => P.stat('shuttleRides') > 0,
    }, (text, big) => { this.ui.toast(text, big ? 6500 : 3000); playSound(big ? 'success' : 'chime'); });
    this.bulletin = new Bulletin(P, () => Math.floor(this.life.clock.minutes / 1440), t => { this.ui.toast(t, 4000); playSound('chime'); });
  }
  /** Epilogue: one card per mission saying what you did, then the look-back screen. */
  async showLegacy() {
    this.voice.stop();
    const cards = legacyCards(id => this.quests.status(id as QuestId) === 'completed', id => this.quests.data(id as QuestId) as Record<string, unknown>);
    await this.ui.card('Your legacy', `${this.playerName}, looking back…`, 2600);
    for (const c of cards) await this.ui.card(`${c.year} — ${c.title}`, c.text, 3600);
    playSound('cheer');
    await new Promise<void>(res => { const sc = this.ui.menu('🎓 Your legacy', [{ label: 'Continue', action: () => { this.ui.pop(sc); res(); } }], { html: legacyHtml(this.life.progress, this.playerName, this.coinTotal(), esc), className: 'legacy-screen', onBack: () => { this.ui.pop(sc); res(); } }); });
  }
  /** Map icons for places to do things (current era). */
  private static POI_ICONS: Record<string, [string, string]> = {
    hart: ['🏀', 'Hart · basketball, gym'], manwaring: ['🍔', 'MC · food, bowling, store, bulletin board'], mckay: ['📚', 'Library · book hunt'],
    romney: ['🔭', 'Romney · planetarium'], snow: ['🎻', 'Snow · concert hall'], austin: ['🔧', 'Austin · car shop'], kimball: ['🎓', 'Kimball · President'],
    taylor: ['⛪', 'Taylor · chapel, piano'], stc: ['💻', 'STC · computers'], benson: ['🌱', 'Benson · greenhouse'], icenter: ['🎤', 'I-Center'], temple: ['🛕', 'Temple'],
  };
  private mapPois(): MapPoi[] {
    const out: MapPoi[] = [];
    for (const d of this.destinations()) {
      if (d.label === 'My apartment') { out.push({ x: d.x, z: d.z, icon: '🏠', label: 'Home' }); continue; }
      const k = d.building && Game.POI_ICONS[d.building]; if (k) out.push({ x: d.x, z: d.z, icon: k[0], label: k[1] });
    }
    return out;
  }
  private tourMarker(): { x: number; z: number }[] {
    const b = this.orientation.place(); if (!b || this.spaceId !== 'exterior') return [];
    if (this.tourCache?.b !== b) { const d = this.destinations().find(q => q.building === b); this.tourCache = { b, pts: d ? [{ x: d.x, z: d.z }] : [] }; }
    return this.tourCache.pts;
  }
  private tourCache: { b: string; pts: { x: number; z: number }[] } | null = null;
  openMap() { this.tourFlags.add('map'); this.ui.mapExtras = { pois: this.mapPois(), shuttle: () => this.fastTravel() }; this.ui.bigMap(() => {}); }
  /** Why fast travel isn't possible right now (null = it is). */
  private travelBlocked(): string | null {
    if (this.mode !== 'playing' || this.busy || this.cutscenes.active) return 'Not right now.';
    if (this.life.race.target() || this.life.jobs?.target()) return 'Finish (or quit) your race or job first.';
    if (this.sideQuests.tracker()) return 'You’re in the middle of a timed errand.';
    if (this.hoops && this.hoops.mode !== 'free') return 'Finish your basketball game first.';
    return null;
  }
  /** The campus shuttle: pick a building, ride there (fade), step off by its entrance. */
  async fastTravel() {
    const why = this.travelBlocked(); if (why) { this.ui.toast(`🚌 ${why}`); return; }
    const list = this.destinations(), bus = ERAS[this.world.era].institution === 'byui' ? 'BYU–Idaho shuttle' : 'Ricks College shuttle';
    const id = await this.ui.panel({ title: `🚌 ${bus}`, body: 'Where to? The shuttle drops you at the entrance.', buttons: [...list.map((d, i) => ({ id: String(i), label: `${(d.building && Game.POI_ICONS[d.building]?.[0]) || (d.label === 'My apartment' ? '🏠' : '🏛️')} ${d.label}` })), { id: 'back', label: 'Cancel' }] });
    const d = id && id !== 'back' ? list[Number(id)] : null; if (!d) return;
    if (this.player.vehicle) this.exitCart(true);
    this.standUpIfSeated();
    playSound('chime');
    await this.ui.fade(async () => {
      if (this.spaceId !== 'exterior') { this.entryDoor = null; this.spaceId = 'exterior'; this.interiors.show(null); this.world.exterior.visible = true; if (this.hoops) this.hoops.end(); }
      const door = d.building ? this.world.buildingDoors().filter(q => q.id === d.building).sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0] : null;
      const pl = door ?? (d.label === 'My apartment' ? this.world.doorPlacement(this.location('door.home')) : { x: d.x, z: d.z, nx: 0, nz: 1 });
      this.player.place(this.exteriorSpace, pl.x + pl.nx * 4, pl.z + pl.nz * 4, Math.atan2(-pl.nx, -pl.nz));
      this.unstick(); this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
      this.guide = null;
      await this.wait(400);
    });
    this.ui.toast(`🚌 ${d.label}. Thanks for riding!`, 2500);
    this.life.progress.add('shuttleRides'); this.save();
  }
  private compass(dx: number, dz: number) {
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
  }
  /** Returns true when a destination was chosen (ends the conversation). */
  private async askDirections(name: string, who: string): Promise<boolean> {
    const list = this.destinations();
    const id = await this.ui.panel({ title: `Where do you want to go?`, body: `${name} knows campus well.`, buttons: [...list.map((d, i) => ({ id: String(i), label: d.label })), { id: 'back', label: 'Never mind' }] });
    const d = id && id !== 'back' ? list[Number(id)] : null; if (!d) return false;
    const p = this.player.position, dist = Math.hypot(d.x - p.x, d.z - p.z);
    const nm = d.label === 'My apartment' ? 'Your apartment' : `The ${d.label}`;
    const text = dist < 15 ? `${nm}? It’s right here!` : `${nm}? Head ${this.compass(d.x - p.x, d.z - p.z)}, about ${Math.round(dist / 10) * 10} metres. I’ll point you — follow the marker!`;
    await this.ui.dialogue([{ speaker: who, text }]);
    if (dist >= 15) { this.guide = d; playSound('chime'); }
    return true;
  }
  private updateGuide() {
    const g = this.guide; if (!g) return;
    const p = this.player.position;
    if (this.spaceId === 'exterior' && Math.hypot(g.x - p.x, g.z - p.z) < 9) { this.guide = null; this.ui.toast(`You made it: ${g.label}!`, 2500); playSound('success'); }
    else if (this.spaceId !== 'exterior' && g.building && this.spaceId === `bldg-${g.building}`) this.guide = null;
  }

  async talkToQuestGiver() {
    // Bednar turns toward the assistant
    if (this.bednar) this.stageConversation(this.bednar.root);   // same spot, same shot, every time
    const active = this.quests.active();
    if (active && this.quests.readyToReport(active)) { await this.quests.report(active); return; }
    const talk = (lines: Parameters<UI['dialogue']>[0]) => (this.bednar ? this.faceToFace(this.bednar.root, () => this.ui.dialogue(lines)) : this.ui.dialogue(lines));
    if (active) { await talk(this.quests.reminder(active)); return; }
    const next = this.quests.nextAvailable();
    if (next) {
      if (next === 'professors' && !this.quests.data('professors').__greeted) { this.quests.data('professors').__greeted = true; await talk(STORY.bednarGreeting()); }
      await this.quests.assign(next);
      if (this.quests.status(next) === 'active') this.ui.toast(`New assignment: ${this.quests.modules.get(next)?.title}`);
      this.save();
      return;
    }
    if (this.quests.allComplete()) await talk(STORY.allQuestsDone());
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
    if (this.quests.allComplete()) {
      // The final letter already earned its once-only reward in QuestManager.
      this.voice.stop(); this.applyColor(true); this.finale.start(); return;
    }
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
    if (this.player.vehicle) this.exitCart(true);
    await this.ui.card(ERAS[era].cardTitle, subtitle ?? ERAS[era].label, 2600);
    this.setEra(era);
    this.life.resetClockForEra();
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
    if (this.player.vehicle) this.exitCart(true);
    playSound('door');
    await this.ui.fade(() => {
      this.spaceId = id; this.world.exterior.visible = false; this.interiors.show(id, this.world.era);
      const p = this.interiors.entryPoint(id);
      this.player.place(this.interiors.space(id), p.x, p.z, Math.PI);
      this.cameraRig.reset(Math.PI); this.cameraRig.pitch = 0.9; this.cameraRig.distance = 9; this.cameraRig.snap(this.player.position);
    });
    this.life.visited(id);
    this.save();
  }
  async exitInterior(instant = false) {
    const id = this.spaceId; if (id === 'exterior') return;
    if (!instant) playSound('door');
    const go = () => {
      const def = this.interiors.defs.get(id)!;
      const e = this.entryDoor?.space === id ? this.entryDoor : null; this.entryDoor = null;
      const d = e ?? this.world.doorPlacement(this.location(def.exteriorDoor));
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
    if (this.quests.allComplete()) return { text: 'Explore BYU–Idaho', target: null };
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
      version: SAVE_VERSION, savedAt: '', difficulty: this.difficulty, era: this.world.era, colorStage: this.colorStage,
      quests: this.quests.state.quests, targets: this.quests.state.targets, rewards: this.quests.state.rewards,
      player: { space: this.spaceId, x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw },
      coins: [...this.collectedCoins],
      introSeen: this.introSeen, finaleReached: this.finaleReached, playerName: this.playerName, outfit: this.outfit,
      sideQuests: this.sideQuests.snapshot(), life: this.life.snapshot(),
    };
  }
  save() { if (!this.finale.previewing && (this.mode === 'playing' || this.mode === 'finale')) writeSave(this.snapshot()); }

  newGame(difficulty: DifficultyId) {
    this.finale.stop(); this.mode = 'title';
    this.difficulty = difficulty; this.colorStage = 0; this.introSeen = false; this.finaleReached = false;
    this.outfit = 'assistant'; this.applyOutfit(); this.clearPowers();
    this.collectedCoins.clear(); if (this.player.vehicle) this.exitCart(true); this.player.seated = false; this.player.avatar.sit(false);
    this.quests.init(freshQuestState());
    this.sideQuests.load(undefined); this.guide = null;
    this.world.refreshBuildings();
    this.clearTrees();
    this.setEra(GAME_CONFIG.story.startEra);
    this.life.load(undefined); this.applyOutfit();
    this.applyColor(true);
    if (this.spaceId !== 'exterior') { this.spaceId = 'exterior'; this.interiors.show(null); this.world.exterior.visible = true; }
    const s = this.resolve('spawn');
    this.player.place(this.exteriorSpace, s.x, s.z, this.location('spawn').yaw ?? 0);
    this.cameraRig.reset(this.player.yaw); this.cameraRig.snap(this.player.position);
    void this.ui.askName(this.playerName || 'Alex', SETTINGS.season).then(({ name, season }) => { this.setPlayerName(name); if (season !== SETTINGS.season) { SETTINGS.season = season; saveSettings(); this.applySeason(); } this.beginPlay(true); });
  }
  setPlayerName(n: string) { this.playerName = n; this.ui.playerName = n; this.voice.playerName = n; if (this.npcs) this.npcs.playerName = n; }
  continueGame(d: SaveData) {
    this.finale.stop();
    this.difficulty = d.difficulty; this.colorStage = d.colorStage; this.introSeen = d.introSeen; this.finaleReached = d.finaleReached;
    this.setPlayerName(d.playerName ?? 'Alex');
    this.outfit = outfitById(d.outfit).id; this.applyOutfit(); this.clearPowers();
    this.collectedCoins = new Set(d.coins ?? []); if (this.player.vehicle) this.exitCart(true); this.player.seated = false; this.player.avatar.sit(false);
    this.quests.init({ quests: d.quests, targets: d.targets ?? {}, rewards: d.rewards ?? {} });
    this.sideQuests.load(d.sideQuests); this.guide = null;
    this.world.refreshBuildings();
    this.clearTrees();
    this.setEra(d.era);
    this.life.load(d.life); this.applyOutfit();
    this.applyColor(true);
    if (!d.player) { const sp = this.resolve('spawn'); d.player = { space: 'exterior', x: sp.x, z: sp.z, yaw: this.location('spawn').yaw ?? 0 }; }
    if (d.player.space !== 'exterior' && this.interiors.defs.has(d.player.space)) {
      this.spaceId = d.player.space; this.world.exterior.visible = false; this.interiors.show(d.player.space, d.era);
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
      this.busy = true; this.mode = 'cutscene'; this.ui.showHud(false); this.voice.stop();
      try {
        await this.opening.play();
        this.spaceId = 'kimball-office'; this.world.exterior.visible = false; this.interiors.show(this.spaceId);
        const p = this.interiors.toWorld(this.spaceId, 0, -4.5);
        this.player.place(this.interiors.space(this.spaceId), p.x, p.z, Math.PI);
        this.player.speed = 0;
        this.cameraRig.reset(Math.PI); this.cameraRig.pitch = .9; this.cameraRig.distance = 9;
        this.cameraRig.snap(this.player.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
        this.cameraRig.update(0, null, this.player.position, this.space, this.player.yaw);
        this.world.updateSun(this.player.position);
        this.interactions.update(this.player.position.x, this.player.position.z, this.spaceId, this.world.era);
        this.introSeen = true;
      } finally { this.mode = 'playing'; this.busy = false; this.ui.showHud(true); }
    }
    if (intro && !this.life.progress.stat('tourDone')) setTimeout(() => { if (this.mode === 'playing') this.orientation.start(); }, 2500);
    if (!intro && this.quests.allComplete() && !this.finaleReached) { this.finale.start(); return; }
    this.save();
  }

  previewEnding() { if (this.mode === 'title') { this.voice.stop(); this.finale.start(true); } }

  // ---------------- menus ----------------
  /** Preview the opening without changing the player's saved progress. */
  async previewOpening() {
    if (this.mode !== 'title') return;
    this.ui.clear(); this.ui.showHud(false); this.ui.setReticle(false, false); this.voice.stop(); this.mode = 'cutscene';
    try { await this.opening.play(true); }
    finally { this.showTitle(); }
  }

  showTitle() {
    this.mode = 'title'; this.ui.clear(); this.ui.showHud(false);
    const save = loadSave();
    const s = this.ui.menu(GAME_CONFIG.title, [
      { label: save ? `Continue (${ERAS[save.era]?.label ?? save.era})` : 'Continue', disabled: !save, action: () => save && this.continueGame(save) },
      { label: 'New game', action: () => this.chooseDifficulty() },
      { label: `💾 Save slot ${SETTINGS.slot}${save ? ` — ${save.playerName ?? 'Alex'}` : ' — empty'} (switch player)`, action: () => this.chooseSlot() },
      { label: 'Settings', action: () => this.showSettings() },
      { label: 'Controls', action: () => this.showControls() },
      { label: 'Jump to a quest (testing)', action: () => this.showQuestJump() },
      { label: 'Reset saved game', disabled: !save, action: () => this.confirmReset() },
    ], { subtitle: GAME_CONFIG.disclaimer, className: 'title-screen', footer: `Map data © OpenStreetMap contributors (ODbL) · elevation USGS 3DEP · see docs/sources.md` });
    // modern title: tagline under the logo + "now playing" chip for the team's music
    s.el.querySelector('h1')?.insertAdjacentHTML('afterend', '<div class="title-tag">Ricks College · BYU–Idaho · 25 years of legacy</div>');
    const chip = document.createElement('div'); chip.className = 'now-playing'; s.el.appendChild(chip);
    const paint = () => { chip.innerHTML = SETTINGS.music ? `<span class="np-note">♪</span> <span class="np-label">Now playing</span> <b>${esc(this.music.title)}</b>` : '<span class="np-note">♪</span> <span class="np-label">Music off</span> <b>Settings → Background music</b>'; };
    paint(); const t = setInterval(paint, 1000); s.cleanup = () => clearInterval(t);
  }
  /** Three save slots (brothers, sisters, roommates…): pick whose game Continue / New game uses. */
  private chooseSlot() {
    const when = (iso: string) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
    const items = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const n = i + 1, sm = slotSummary(n);
      return { label: `${n === SETTINGS.slot ? '▶ ' : ''}Slot ${n}: ${sm ? `${sm.name} · ${ERAS[sm.era]?.label ?? sm.era} · ${sm.done}/${QUEST_ORDER.length} missions · ${when(sm.savedAt)}` : 'empty — start a new game here'}`,
        action: () => { SETTINGS.slot = n; saveSettings(); this.ui.pop(sc); this.showTitle(); } };
    });
    const sc = this.ui.menu('Save slots', [...items, { label: 'Back', action: () => this.ui.pop(sc) }], { subtitle: 'Each slot is a separate game saved in this browser. Choose one, then Continue or New game.', onBack: () => this.ui.pop(sc) });
  }
  /** Testing only: start at any quest with the earlier ones marked complete (no coins). */
  private showQuestJump() {
    let diff: DifficultyId = 'easy';
    const go = (stage: number) => { this.ui.clear(); this.pauseOpen = false; this.quests.resumeAll(); this.jumpToQuest(stage, diff); };
    const s = this.ui.menu('Testing: jump to a quest', [
      { label: 'Difficulty: Easy (click to switch)', action: () => { diff = diff === 'easy' ? 'hard' : 'easy'; (s.el.querySelectorAll('button')[0] as HTMLButtonElement).textContent = `Difficulty: ${diff === 'easy' ? 'Easy' : 'Hard'} (click to switch)`; } },
      ...QUEST_ORDER.map((id, i) => ({ label: `Mission ${i + 1} — ${this.quests.modules.get(id)?.title ?? id} (${ERAS[QUEST_ERA[id]].year | 0})`, action: () => go(i + 1) })),
      { label: 'Finale — STC celebration (present day)', action: () => go(QUEST_ORDER.length + 1) },
      { label: 'Back', action: () => this.ui.pop(s) },
    ], { subtitle: 'For testing: earlier quests are marked complete and earn no coins.', onBack: () => this.ui.pop(s) });
  }
  /** Testing: start at story mission `stage` (1-based, QUEST_ORDER); QUEST_ORDER.length + 1 = the finale. Earlier missions count as skipped. */
  jumpToQuest(stage: number, diff: DifficultyId) {
    if (stage === 1) { this.newGame(diff); return; }
    const st = freshQuestState(), n = QUEST_ORDER.length, finale = stage > n;
    const done = (id: QuestId) => {
      st.quests[id] = { status: 'completed', data: { __devSkipped: true } };
      st.rewards[id] = computeReward({ questId: id, tuning: { base: 0, qualityMax: 0, speedMax: 0, hardBonus: 0 }, difficulty: diff, activeSeconds: 0, targetSeconds: 1, qualityScore: 0, skippedFraction: 1, devSkipped: true });
    };
    QUEST_ORDER.slice(0, stage - 1).forEach(done);
    if (!finale) st.quests[QUEST_ORDER[stage - 1]].status = 'available';
    if (st.quests.construction.status === 'completed') { st.targets['construction:taylor'] = 'solved'; st.targets['construction:icenter'] = 'solved'; }
    if (finale) st.quests.letters.data = { __devSkipped: true, cards: true, found: ['B', 'Y', 'U', 'I'], placed: ['B', 'Y', 'U', 'I'] };
    const era: EraId = finale ? 'presentFinale' : QUEST_ERA[QUEST_ORDER[stage - 1]];
    let player: SaveData['player'];
    if (finale) { const d = this.world.doorPlacement(this.location('door.stc.main')); player = { space: 'exterior', x: d.x + d.nx * 4, z: d.z + d.nz * 4, yaw: Math.atan2(-d.nx, -d.nz) }; }
    else { const p = this.interiors.toWorld('kimball-office', 0, -4); player = { space: 'kimball-office', x: p.x, z: p.z, yaw: Math.PI }; }
    this.continueGame({ version: SAVE_VERSION, savedAt: '', difficulty: diff, era, colorStage: stage - 1, quests: st.quests, targets: st.targets, rewards: st.rewards, player, coins: [], introSeen: true, finaleReached: false });
    this.ui.toast(finale ? 'Testing: playing the ending.' : 'Testing: talk to President Bednar to start the mission.', 5000);
  }

  private chooseDifficulty() {
    const s = this.ui.menu('Choose difficulty', GAME_CONFIG.difficulty.options.map(o => ({
      label: `${o.label} — ${o.hint}`, action: () => { this.ui.pop(s); this.newGame(o.id as DifficultyId); },
    })), { subtitle: 'You can switch later from the pause menu; it applies to your next challenge attempt.', onBack: () => this.ui.pop(s) });
  }
  private confirmReset() {
    const s = this.ui.menu('Reset saved game?', [
      { label: `Yes, delete save slot ${SETTINGS.slot}`, action: () => { clearSave(); this.ui.pop(s); this.mode === 'title' ? this.showTitle() : this.quitToTitle(false); } },
      { label: 'Cancel', action: () => this.ui.pop(s) },
    ], { onBack: () => this.ui.pop(s) });
  }
  showControls() {
    const rows = [
      ['Move', 'W A S D / arrows', 'Left stick', 'Left stick'], ['Sprint', 'Hold Shift', 'Left stick click (toggle)', 'Hold ZR / R'], ['Jump', 'Space', 'Button 2', 'B'],
      ['Golf cart', 'E to get in/out · W/S drive · A/D steer', 'Button 1 · left stick', 'A · left stick'],
      ['Helicopter', 'WASD fly · hold Space climb · hold F descend · E land / get out', 'Left stick · hold Button 2 climb · Button 1 land', 'Left stick · hold B climb · hold L/ZL descend · A land'],
      ['Plane', 'W throttle · S slow · A/D turn · hold Space climb · F dive · E land / get out', 'Left stick · hold Button 2 climb · Button 1 land', 'Left stick · hold B climb · hold L/ZL dive · A land'],
      ['Superpowers', 'Pause → Superpowers (or type a code)', 'Pause → Superpowers', '+ → Superpowers'],
      ['Longboard / sled', 'B (W push · S brake · Space ollie)', 'Pause → Campus life', '+ → Campus life'],
      ['Camera (photos)', 'P · Space/E to shoot · Esc to close', 'Pause → Campus life', '+ → Campus life'],
      ['Throw (snowball fights)', 'R', 'Button 3 / right stick', 'X / right stick'],
      ['Piano', 'A S D F G H J K · W E T Y U', 'D-pad + Button 1', 'D-pad + A'],
      ['Camera', 'Drag mouse · wheel zoom · C reset', 'Right stick · right click reset', 'Right stick'],
      ['Interact / confirm', 'E · Enter · Space', 'Button 1', 'A'], ['Back', 'Esc · Backspace', 'Button 2', 'B'],
      ['Map / objective', 'M', 'Button 3', 'X'], ['Journal (Quest 3 cards)', 'J', 'Pause menu', 'Y'], ['Pause / menu', 'Esc', 'Button 4', '+ or −'], ['Menus', 'Arrows/WASD + Enter, or mouse', 'Left stick + Button 1', 'Left stick or D-pad + A'],
      ['One Joy-Con (sideways)', '', '', 'Stick moves · SL / SR turn the camera'],
      ['Campus shuttle (fast travel)', 'M → 🚌 Campus shuttle, or Pause', 'Pause menu', '+ → Campus shuttle'],
      ['Touch screen', 'Left stick on screen moves · E / jump / board buttons on the right · drag the view to look · pinch to zoom', '', ''],
      ['Rebind keys', 'Settings → Accessibility → Rebind keys', '', ''],
    ];
    const html = `<table><tr><th>Action</th><th>Keyboard / mouse</th><th>Controller</th><th>Joy-Con</th></tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const s = this.ui.menu('Controls', [{ label: 'Back', action: () => this.ui.pop(s) }], { html, onBack: () => this.ui.pop(s) });
  }
  showControllers() {
    const html = `<div class="ctrl-status"></div><p class="sub">Two controllers can play at once; either one moves the same player. Transport (custom BLE vs. BLE HID gamepad) is not decided yet — see docs/controller-protocol.md.</p><p class="sub">Nintendo Switch Joy-Cons: pair them with this computer over Bluetooth (hold the small sync button on the rail), then press any button. Both together play like one controller; a single Joy-Con works held sideways. Chrome, Edge or Safari recommended.</p>`;
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
    this.quests.suspendAll(); this.pauseOpen = true; this.ui.mapExtras = { pois: this.mapPois(), shuttle: () => this.fastTravel() };
    const close = () => { this.ui.pop(s); this.pauseOpen = false; this.quests.resumeAll(); };
    const other = this.difficulty === 'easy' ? 'hard' : 'easy';
    const items = [
      { label: 'Resume', action: close },
      ...(this.hudBtn ? [{ label: this.hudBtn.label, action: () => { close(); this.hudBtn?.fn(); } }] : []),
      { label: `Difficulty: ${this.difficulty === 'easy' ? 'Easy' : 'Hard'} — switch to ${other === 'easy' ? 'Easy' : 'Hard'}`, action: () => {
        this.difficulty = other; this.save(); this.ui.toast(`Difficulty set to ${other === 'easy' ? 'Easy' : 'Hard'} — applies to your next challenge attempt.`); close(); this.showPause();
      } },
      ...(this.player.jetpack ? [{ label: 'Take off the jetpack', action: () => { this.player.jetpack = false; this.player.avatar.setJetpack(false); this.ui.toast('Jetpack off.'); close(); } }] : []),
      ...(this.player.handstand ? [{ label: 'Back on your feet', action: () => { this.player.setHandstand(false); close(); } }] : []),
      ...(this.player.superSpeed || this.player.superJump ? [{ label: 'Turn off superpowers', action: () => { this.player.superSpeed = this.player.superJump = false; this.ui.toast('Superpowers off.'); close(); } }] : []),
      ...(!this.life.progress.stat('tourDone') ? [{ label: this.orientation.on ? `🧭 Skip the campus orientation (${this.orientation.count()}/8)` : '🧭 Start the campus orientation (coins for learning the ropes)', action: () => { close(); if (this.orientation.on) { this.orientation.skip(); this.ui.toast('Orientation skipped. You can start it again from the pause menu.'); } else this.orientation.start(); } }] : []),
      { label: '🚌 Campus shuttle (fast travel)', action: () => { close(); void this.fastTravel(); } },
      { label: `📋 Side quests (${this.sideQuests.doneCount()}/${this.sideQuests.journal().length} done)`, action: () => this.showSideJournal() },
      { label: `🌟 Campus life — photos, friends, collection, achievements (${this.life.progress.achievements.size}/${ACHIEVEMENT_COUNT} 🏆)`, action: () => this.showLifeMenu() },
      { label: `👕 Change outfit (${outfitById(this.outfit).name})`, action: () => this.showWardrobe() },
      ...(this.finaleReached ? [{ label: '🎓 Your legacy (look back)', action: () => { close(); void this.showLegacy(); } }] : []),
      { label: '⚡ Superpowers & cheat codes', action: () => this.showCheats() },
      { label: 'Settings (sound, brightness, season…)', action: () => this.showSettings() },
      { label: 'Jump to a quest (testing)', action: () => this.showQuestJump() },
      { label: 'Controls', action: () => this.showControls() },
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
  // ---------------- superpowers (cheat codes) ----------------
  /** Every superpower: typed code(s), a menu toggle (so controllers can use them too) and what it does. */
  private powers(): { codes: string[]; label: () => string; run: () => string | null }[] {
    const P = this.player;
    return [
      { codes: ['flash', 'superspeed', 'speed'], label: () => `⚡ Super speed: ${P.superSpeed ? 'ON' : 'off'}`,
        run: () => { P.superSpeed = !P.superSpeed; return P.superSpeed ? 'Super speed on! Everything is three times faster.' : 'Super speed off.'; } },
      { codes: ['moonjump', 'superjump', 'kangaroo'], label: () => `🦘 Super jump: ${P.superJump ? 'ON' : 'off'}`,
        run: () => { P.superJump = !P.superJump; return P.superJump ? 'Super jump on! Jump onto the roofs (outdoors).' : 'Super jump off.'; } },
      { codes: ['jetpack'], label: () => `🚀 Jetpack: ${P.jetpack ? 'ON' : 'off'}`,
        run: () => { P.jetpack = !P.jetpack; P.avatar.setJetpack(P.jetpack); return P.jetpack ? 'Jetpack on! Hold Space / B to fly; let go to glide down.' : 'Jetpack off.'; } },
      { codes: ['handstand', 'hands', 'parado de manos'], label: () => `🤸 Walk on your hands: ${P.handstand ? 'ON' : 'off'}`,
        run: () => { if (P.vehicle) return 'Get out of the vehicle first.'; P.setHandstand(!P.handstand); return P.handstand ? 'Handstand! Walk around on your hands (no jumping).' : 'Back on your feet.'; } },
      { codes: ['helicopter', 'heli', 'chopper'], label: () => '🚁 Call a helicopter', run: () => this.spawnAircraft('heli') },
      { codes: ['plane', 'airplane', 'avion', 'avión'], label: () => '✈️ Call a small plane', run: () => this.spawnAircraft('plane') },
    ];
  }
  private clearPowers() {
    const P = this.player; P.superSpeed = P.superJump = false; P.jetpack = false; P.avatar.setJetpack(false);
    if (P.handstand) P.setHandstand(false);
    P.lying = null; P.emote = null; P.avatar.lie(false); P.avatar.holdItem(null);
  }
  /** Superpowers menu: a toggle for each power, plus a box to type cheat codes. */
  showCheats() {
    void this.ui.custom('Superpowers & cheat codes', (root, panel) => {
      root.innerHTML = `<p class="sub">Pick a power, or type a secret code and press Enter.</p><div class="items power-list"></div>
        <input class="name-input cheat-input" data-focus maxlength="24" autocomplete="off" spellcheck="false" placeholder="Type a code"><p class="sub cheat-msg"></p>`;
      const list = root.querySelector('.power-list') as HTMLElement, input = root.querySelector('.cheat-input') as HTMLInputElement, msg = root.querySelector('.cheat-msg') as HTMLElement;
      const apply = (p: ReturnType<typeof this.powers>[number]) => {
        const out = p.run(); msg.textContent = out ?? '';
        playSound(out && !/first|outside/i.test(out) ? 'success' : 'error');
        paint();
        if (p.codes[0] === 'helicopter' || p.codes[0] === 'plane') { if (this.player.vehicle && isAircraft(this.player.vehicle.kind)) setTimeout(() => panel.close(null), 700); }
      };
      const paint = () => list.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => { b.textContent = this.powers()[i].label(); });
      for (const p of this.powers()) {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-focus', ''); b.textContent = p.label();
        b.addEventListener('click', () => apply(p)); list.append(b);
      }
      const back = document.createElement('button'); back.type = 'button'; back.setAttribute('data-focus', ''); back.textContent = 'Back'; back.addEventListener('click', () => panel.close(null)); root.append(back);
      const run = () => {
        const code = input.value.trim().toLowerCase(); input.value = '';
        const p = this.powers().find(x => x.codes.includes(code));
        if (p) apply(p); else { msg.textContent = code ? 'Nothing happened…' : 'Type a code first.'; playSound('error'); }
      };
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') run(); else if (e.key === 'Escape') panel.close(null); });
    }, { className: 'cheats-screen' });
  }
  /** Bring the helicopter / plane next to you (one of each; it stays where you land it) and climb in. */
  private spawnAircraft(kind: 'heli' | 'plane'): string | null {
    if (this.spaceId !== 'exterior') return 'Go outside first — it won’t fit in here!';
    if (this.player.vehicle) { if (isAircraft(this.player.vehicle.kind)) return 'You’re already flying!'; this.exitCart(true); }
    if (this.player.handstand) this.player.setHandstand(false);
    this.standUpIfSeated();
    const id = `aircraft-${kind}`;
    let entry = this.carts.find(c => c.id === id);
    if (!entry) { const v = new Vehicle(id, kind); this.renderer.scene.add(v.root); entry = { cart: v, id }; this.carts.push(entry); }
    else this.interactions.remove(`core:${id}`);
    const p = this.player.position, [x, z] = nudgeFree(p.x + Math.sin(this.player.yaw) * 6, p.z + Math.cos(this.player.yaw) * 6, kind === 'plane' ? 6 : 4);
    entry.cart.root.position.set(x, this.world.groundY(x, z), z); entry.cart.root.rotation.y = this.player.yaw; entry.cart.speed = 0;
    this.enterCart(entry.cart, id);
    return kind === 'heli' ? 'Helicopter ready — you’re in the pilot seat!' : 'Plane ready — throttle up with W to take off!';
  }
  private standUpIfSeated() { if (this.player.seated) { this.player.seated = false; this.player.avatar.sit(false); } }

  // ---------------- outfits ----------------
  private applyOutfit() {
    const P = this.player; P.avatar.rebuild({ ...outfitLook(this.outfit, SETTINGS.season === 'winter'), ...(this.life ? accessoryLook(this.life.progress) : {}) });
    if (P.jetpack) P.avatar.setJetpack(true);
  }
  /** Wardrobe: pick an outfit (shown on the character right away). */
  showWardrobe() {
    const s = this.ui.menu('Wardrobe', [
      ...OUTFITS.filter(o => !this.life || ownsOutfit(this.life.progress, o.id)).map(o => ({ label: `${o.id === this.outfit ? '✓ ' : ''}${o.name} — ${o.note}`, action: () => {
        this.outfit = o.id; this.applyOutfit(); this.save(); playSound('pop'); this.ui.toast(`Changed into: ${o.name}.`); this.ui.pop(s);
      } })),
      { label: 'Back', action: () => this.ui.pop(s) },
    ], { subtitle: 'Choose what to wear. (In winter a coat goes on top when you’re outside.) More clothes and accessories at the school store in the Manwaring Center.', onBack: () => this.ui.pop(s) });
  }

  // ---------------- the apartment ----------------
  private setupHome() {
    const at = (p: { x: number; z: number }) => ({ x: p.x, z: p.z, space: HOME_ID });
    const free = () => !this.busy && !this.player.seated && !this.player.lying;
    this.interactions.add({ id: 'home:bed', kind: 'generic', at: at(HOME_SPOTS.bed), radius: 1.7, enabled: free, prompt: HOME_SPOTS.bed.label, onInteract: () => { void this.sleep(); } });
    this.interactions.add({ id: 'home:fridge', kind: 'generic', at: at(HOME_SPOTS.fridge), radius: 1.6, enabled: free, prompt: HOME_SPOTS.fridge.label, onInteract: () => this.showFridge() });
    this.interactions.add({ id: 'home:wardrobe', kind: 'generic', at: at(HOME_SPOTS.wardrobe), radius: 1.6, enabled: free, prompt: HOME_SPOTS.wardrobe.label, onInteract: () => this.showWardrobe() });
    this.interactions.add({ id: 'home:tv', kind: 'generic', at: at(HOME_SPOTS.tv), radius: 1.6, enabled: free, prompt: HOME_SPOTS.tv.label, onInteract: () => { void this.watchTv(); } });
  }
  private wait(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }
  /** Lie down, fade to black, wake up rested (and the game is saved). */
  private async sleep() {
    if (this.busy) return; this.busy = true;
    const P = this.player, L = HOME_SPOTS.bedLie, w = this.interiors.toWorld(HOME_ID, L.x, L.z);
    try {
      if (P.handstand) P.setHandstand(false);
      P.lying = { x: w.x, y: 0, z: w.z, yaw: L.yaw }; P.avatar.lie(true, L.y); playSound('sit');
      this.ui.toast(`Good night, ${this.playerName || 'friend'}…`, 2500);
      await this.wait(1600);
      await this.ui.blackout('Z z z …', 2600);
      P.lying = null; P.avatar.lie(false);
      const b = this.interiors.toWorld(HOME_ID, HOME_SPOTS.bed.x, HOME_SPOTS.bed.z);
      P.place(this.space, b.x, b.z, -Math.PI / 2);
      this.life.clock.sleepUntilMorning();
      playSound('chime'); this.ui.toast(`Good morning! It’s ${this.life.clock.label()}. You feel well rested. (Game saved.)`, 4000);
      this.save();
    } finally { P.lying = null; this.busy = false; }
  }
  private readonly FOODS = [
    { name: 'Funeral potatoes', color: '#e8c25a', line: 'Cheesy, crunchy, perfect. A Rexburg classic.' },
    { name: 'A baked Idaho potato', color: '#9a6b3e', line: 'It’s Idaho. Of course there were potatoes in the fridge.' },
    { name: 'Cereal with milk', color: '#f4f1e8', line: 'Crunchy. Cereal is a perfectly good dinner.' },
    { name: 'PB&J sandwich', color: '#c98b4a', line: 'Peanut butter and jelly — the student’s best friend.' },
    { name: 'Chocolate chip cookies', color: '#7a4a28', line: 'Fresh from a neighbour’s plate. Very kind of them.' },
    { name: 'Chocolate milk', color: '#6b4a30', line: 'Ice cold. Tastes like the creamery down the road.' },
  ];
  /** The fridge: pick something and eat it (not needed — just nice). */
  private showFridge() {
    const s = this.ui.menu('What do you want to eat?', [
      ...this.FOODS.map(f => ({ label: f.name, action: () => { this.ui.pop(s); void this.eat(f); } })),
      { label: 'Close the fridge', action: () => this.ui.pop(s) },
    ], { subtitle: 'You don’t need to eat in this game… but it’s nice.', onBack: () => this.ui.pop(s) });
  }
  async eat(f: { name: string; color: string; line: string }) {
    if (this.busy) return; this.busy = true;
    const P = this.player; let t = 0;
    try {
      P.avatar.holdItem(f.color);
      P.emote = dt => { t += dt; P.avatar.eatPose(t, t / 3); if (Math.floor(t * 3.2 / (Math.PI * 2) + 0.5) !== Math.floor((t - dt) * 3.2 / (Math.PI * 2) + 0.5)) playSound('bite'); };
      await this.wait(3000);
      this.ui.toast(`Mmm… ${f.name.toLowerCase()}. ${f.line}`, 4500);
    } finally { P.emote = null; P.avatar.holdItem(null); this.busy = false; }
  }
  /** Sit on the sofa and catch the local news (it follows the era). Move to stand up. */
  private async watchTv() {
    const P = this.player, S = HOME_SPOTS.sofaSeat, w = this.interiors.toWorld(HOME_ID, S.x, S.z);
    if (P.handstand) P.setHandstand(false);
    P.place(this.space, w.x, w.z, S.yaw); P.seated = true; P.avatar.sit(true); P.avatar.root.rotation.y = S.yaw; playSound('sit');
    const news: Record<string, string[]> = {
      ricks: ['…and up at Ricks College, the new Kimball Building has been dedicated. Students say the view of the quad is wonderful.', 'Weather: a cold front is on the way. Rexburg, find your real coats.'],
      ricksTransition: ['…big news from Rexburg: Ricks College is going to become a four-year university, BYU–Idaho.', 'Sports: this is the last season for Viking athletics. Fans are filling the stands.'],
      byui: ['…BYU–Idaho keeps growing. The new Center can seat thousands of people at once.', 'The Rexburg Idaho Temple looks beautiful tonight on the hill above campus.'],
    };
    const lines = news[ERAS[this.world.era].institution] ?? news.byui;
    await this.ui.dialogue(lines.map(text => ({ speaker: 'TV · Channel 8 News', text })));
    this.ui.toast('Move (or press E) to get up from the sofa.', 3000);
  }

  /** Settings: sound (volumes, mute, voices), brightness, season, graphics, reduced motion. Up/down to move, left/right to change. */
  showSettings() {
    void this.ui.custom('Settings', (root, panel) => {
      const list = document.createElement('div'); list.className = 'items audio-settings';
      const sliders: { el: HTMLInputElement; step: number }[] = [];
      const head = (t: string) => { const h = document.createElement('div'); h.className = 'settings-head'; h.textContent = t; list.append(h); };
      const slider = (label: string, get: () => number, set: (v: number) => void, min = 0, max = 100, step = 5, fmt = (v: number) => `${v}%`) => {
        const row = document.createElement('label'); row.className = 'audio-row';
        const name = document.createElement('span'); name.textContent = label;
        const val = document.createElement('b');
        const r = document.createElement('input'); r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.setAttribute('data-focus', '');
        r.value = String(get()); val.textContent = fmt(get());
        r.addEventListener('input', () => { set(Number(r.value)); val.textContent = fmt(Number(r.value)); saveSettings(); });
        row.append(name, r, val); list.append(row); sliders.push({ el: r, step });
      };
      const button = (label: () => string, onClick: () => void) => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-focus', ''); b.textContent = label();
        b.addEventListener('click', () => { onClick(); saveSettings(); b.textContent = label(); }); list.append(b); return b;
      };
      const V = SETTINGS as unknown as Record<string, number>;
      head('Sound');
      button(() => `Background music: ${SETTINGS.music ? 'On' : 'Off'}`, () => { SETTINGS.music = !SETTINGS.music; });
      slider('Music volume', () => Math.round(SETTINGS.musicVolume * 100), v => { V.musicVolume = v / 100; });
      slider('Sound effects', () => Math.round(SETTINGS.sfxVolume * 100), v => { V.sfxVolume = v / 100; playSound('tick'); });
      slider('Ambience (wind, birds)', () => Math.round(SETTINGS.ambienceVolume * 100), v => { V.ambienceVolume = v / 100; });
      slider('Character voices', () => Math.round(SETTINGS.voiceVolume * 100), v => { V.voiceVolume = v / 100; });
      button(() => `Sound: ${SETTINGS.muted ? 'Muted' : 'On'}`, () => { SETTINGS.muted = !SETTINGS.muted; });
      button(() => `Voices: ${SETTINGS.voices ? 'On' : 'Off'}${this.voice.supported ? '' : ' (not supported here)'}`, () => { SETTINGS.voices = !SETTINGS.voices; if (SETTINGS.voices) this.voice.speak('President Bednar', 'Voices are on.'); else this.voice.stop(); });
      head('Look');
      slider('Brightness', () => Math.round(SETTINGS.brightness * 100), v => { V.brightness = v / 100; this.renderer.setBrightness(SETTINGS.brightness); }, 60, 140, 5);
      const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
      button(() => `Season: ${SETTINGS.season[0].toUpperCase()}${SETTINGS.season.slice(1)} (whole game)`, () => { SETTINGS.season = SEASONS[(SEASONS.indexOf(SETTINGS.season) + 1) % 4]; this.applySeason(); });
      button(() => `Day & night cycle: ${SETTINGS.dayNight ? 'On (1 minute = 1 hour)' : 'Off (fixed time per era)'}`, () => { SETTINGS.dayNight = !SETTINGS.dayNight; this.life.clock.running = SETTINGS.dayNight; if (!SETTINGS.dayNight) this.applySeason(); });
      const GQ = ['high', 'medium', 'low'] as const;
      button(() => `Graphics quality: ${SETTINGS.graphics === 'high' ? 'High (sharpest)' : SETTINGS.graphics === 'medium' ? 'Medium (balanced)' : 'Low (fastest — older laptops, phones)'}`, () => { SETTINGS.graphics = GQ[(GQ.indexOf(SETTINGS.graphics) + 1) % 3]; this.renderer.setQuality(SETTINGS.graphics, this.world.sun); });
      head('Accessibility');
      const TS = [1, 1.15, 1.3, 1.5];
      button(() => `Text size: ${Math.round(SETTINGS.textScale * 100)}%`, () => { SETTINGS.textScale = TS[(TS.indexOf(SETTINGS.textScale) + 1) % TS.length] ?? 1; this.applyAccessibility(); });
      button(() => `Colour-blind friendly markers: ${SETTINGS.colorblind ? 'On (orange objectives, blue doors)' : 'Off'}`, () => { SETTINGS.colorblind = !SETTINGS.colorblind; this.applyAccessibility(); });
      button(() => `Reduced motion: ${SETTINGS.reducedMotion ? 'On' : 'Off'}`, () => { SETTINGS.reducedMotion = !SETTINGS.reducedMotion; });
      const TC = ['auto', 'on', 'off'] as const;
      button(() => `Touch controls: ${SETTINGS.touch === 'auto' ? `Automatic (${isTouchDevice() ? 'on — touch screen found' : 'off — no touch screen'})` : SETTINGS.touch === 'on' ? 'Always on' : 'Off'}`, () => { SETTINGS.touch = TC[(TC.indexOf(SETTINGS.touch) + 1) % 3]; });
      button(() => 'Rebind keys (keyboard)', () => this.showKeymap());
      head('Controllers');
      button(() => 'Controllers (pair, calibrate, status)', () => this.showControllers());
      if (this.mode === 'title') {   // the movies play from the title screen
        head('Movies');
        button(() => 'Watch opening', () => { panel.close(null); void this.previewOpening(); });
        button(() => 'Watch ending', () => { panel.close(null); this.previewEnding(); });
      }
      const back = document.createElement('button'); back.type = 'button'; back.setAttribute('data-focus', ''); back.textContent = 'Back'; back.addEventListener('click', () => panel.close(null));
      list.append(back);
      const hint = document.createElement('p'); hint.className = 'sub'; hint.textContent = 'Up/down to choose · left/right to change sliders · confirm to toggle.';
      root.append(list, hint);
      panel.onAction(a => {
        const focused = root.querySelector('.focused') as HTMLInputElement | null, sl = sliders.find(x => x.el === focused);
        if ((a === 'left' || a === 'right') && sl) { sl.el.value = String(Number(sl.el.value) + (a === 'right' ? sl.step : -sl.step)); sl.el.dispatchEvent(new Event('input')); return true; }
        return false;
      });
    }, { className: 'settings-screen' });
  }

  /** Text size and colour-blind mode (Settings → Accessibility). */
  applyAccessibility() {
    document.documentElement.style.setProperty('--text-zoom', String(SETTINGS.textScale || 1));
    this.ui.colorblind = !!SETTINGS.colorblind;
  }
  private touchOn() { return SETTINGS.touch === 'on' || (SETTINGS.touch === 'auto' && isTouchDevice()); }
  /** Rebind keyboard keys: pick an action, press the new key (a key already in use swaps with it). */
  showKeymap() {
    let waiting: string | null = null;
    const render = () => {
      const items = REMAPPABLE.map(r => ({ label: `${r.label}: ${waiting === r.id ? '… press a key (Esc cancels)' : keyName(keyFor(r.id))}`, action: () => { waiting = r.id; render(); } }));
      const sc = this.ui.menu('Rebind keys', [...items, { label: 'Reset all to defaults', action: () => { SETTINGS.keymap = {}; saveSettings(); render(); } }, { label: 'Back', action: () => { window.removeEventListener('keydown', onKey, true); this.ui.pop(sc); } }],
        { subtitle: 'Arrow keys always move and Esc always pauses. Choose an action, then press its new key.', onBack: () => { window.removeEventListener('keydown', onKey, true); this.ui.pop(sc); } });
      if (cur) this.ui.pop(cur); cur = sc;
    };
    let cur: ReturnType<UI['menu']> | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (!waiting) return;
      e.preventDefault(); e.stopPropagation();
      const id = waiting; waiting = null;
      if (e.code !== 'Escape' && !e.code.startsWith('Arrow')) {
        const clash = REMAPPABLE.find(r => r.id !== id && keyFor(r.id) === e.code);
        if (clash) SETTINGS.keymap[clash.id] = keyFor(id);   // swap
        SETTINGS.keymap[id] = e.code; saveSettings(); playSound('tick');
      }
      render();
    };
    window.addEventListener('keydown', onKey, true);
    render();
  }
  quitToTitle(save: boolean) { if (save) this.save(); this.finale.stop(); this.showTitle(); }

  // ---------------- inspectables (look-and-press discovery) ----------------
  private syncBuildingInfo() {
    for (const id of this.inspectables.keys()) if (id.startsWith('building-info:')) this.inspectables.delete(id);
    for (const sign of this.world.buildingSigns) if (getBuildingInfo(sign.buildingId)) {
      this.inspectables.set(`building-info:${sign.buildingId}`, {
        id: `building-info:${sign.buildingId}`, object: sign.object, maxDistance: BUILDING_INFO_RANGE,
        prompt: `Read about ${sign.name}`, enabled: () => this.canReadBuildingSign(sign),
        onInspect: () => { void this.openBuildingInfo(sign); },
      });
    }
  }

  private canReadBuildingSign(sign: BuildingSign) {
    if (this.mode !== 'playing' || this.spaceId !== 'exterior' || !this.world.exterior.visible || this.player.vehicle) return false;
    const p = sign.object.getWorldPosition(new THREE.Vector3());
    return p.distanceTo(this.player.position) <= BUILDING_INFO_RANGE &&
      (this.player.position.x - p.x) * sign.normal.x + (this.player.position.z - p.z) * sign.normal.z > 0;
  }

  private nearbyBuildingSign() {
    let nearest: BuildingSign | null = null, distance = Infinity;
    for (const sign of this.world.buildingSigns) {
      if (!getBuildingInfo(sign.buildingId) || !this.canReadBuildingSign(sign)) continue;
      const d = sign.object.position.distanceToSquared(this.player.position);
      if (d < distance) { nearest = sign; distance = d; }
    }
    return nearest;
  }

  private async openBuildingInfo(sign: BuildingSign) {
    const card = getBuildingInfo(sign.buildingId);
    if (!card || !this.canReadBuildingSign(sign) || this.ui.blocking || this.busy || this.cutscenes.active || this.buildingInfoOpen) return;
    this.buildingInfoOpen = true; this.player.speed = 0;
    try { await showBuildingInfo(this.ui, card, sign.name); }
    finally { this.buildingInfoOpen = false; }
  }

  private raycaster = new THREE.Raycaster();
  /** Inspectable under normalised screen coords (0,0 = centre), within its max distance of the player. */
  inspectAt(nx: number, ny: number): Inspectable | null {
    if (!this.inspectables.size || this.spaceId !== 'exterior') return null;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.renderer.camera);
    let best: Inspectable | null = null, bestD = Infinity;
    let wallDistance: number | undefined;
    for (const ins of this.inspectables.values()) {
      if (ins.enabled && !ins.enabled()) continue;
      const wp = new THREE.Vector3(); ins.object.getWorldPosition(wp);
      if (wp.distanceTo(this.player.position) > (ins.maxDistance ?? 30)) continue;
      const hit = this.raycaster.intersectObject(ins.object, true)[0];
      if (hit && ins.id.startsWith('building-info:')) {
        const wall = this.world.buildingOccluder;
        wallDistance ??= wall ? this.raycaster.intersectObject(wall, false)[0]?.distance ?? Infinity : Infinity;
        if (wallDistance < hit.distance - .05) continue;
      }
      if (hit && hit.distance < bestD) { bestD = hit.distance; best = ins; }
    }
    return best;
  }
  /** Mouse click on the 3D view inspects what is under the cursor. */
  private setupClickInspect() {
    let downAt: [number, number] | null = null;
    this.renderer.canvas.addEventListener('pointerdown', e => { downAt = e.button === 0 ? [e.clientX, e.clientY] : null; });
    this.renderer.canvas.addEventListener('pointermove', e => {
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) downAt = null;
    });
    this.renderer.canvas.addEventListener('pointercancel', () => { downAt = null; });
    this.renderer.canvas.addEventListener('pointerup', e => {
      const start = downAt; downAt = null;
      if (e.button !== 0 || !start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
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
    const show = this.spaceId === 'exterior' && this.mode !== 'finale' && this.mode !== 'cutscene';
    this.traffic.setVisible(show);
    if (!show || this.pauseOpen) return;
    const p = this.mode === 'title' ? { x: 1e6, z: 1e6 } : this.player.position;
    for (const e of this.traffic.update(dt, p)) if (this.mode === 'playing' && !this.cutscenes.active) playSound(e.type);
  }

  /** Minimap position: the player outdoors; indoors, the entrance of the building they're in. */
  private mapPosition() {
    const def = this.spaceId === 'exterior' ? null : this.interiors.defs.get(this.spaceId);
    if (!def) return { mapX: this.player.position.x, mapZ: this.player.position.z };
    const d = this.entryDoor?.space === this.spaceId ? this.entryDoor : this.world.doorPlacement(this.location(def.exteriorDoor)); return { mapX: d.x, mapZ: d.z };
  }

  /** How many students are around you outdoors (0–1), for the crowd murmur. Checked twice a second. */
  private crowdT = 0; private crowdV = 0;
  private crowdLevel(dt: number) {
    this.crowdT -= dt; if (this.crowdT > 0 || !this.npcs) return this.crowdV; this.crowdT = 0.5;
    if (this.mode !== 'playing' || this.spaceId !== 'exterior') return (this.crowdV = 0);
    const p = this.player.position; let n = 0;
    for (const w of this.npcs.walkers) if (w.avatar.root.visible && Math.hypot(w.avatar.root.position.x - p.x, w.avatar.root.position.z - p.z) < 22) n++;
    return (this.crowdV = Math.min(1, n / 10));
  }
  // ---------------- frame loop ----------------
  private frame() {
    const elapsed = this.clock.getDelta();
    const dt = Math.min(0.05, elapsed);
    this.gamepads.update();
    this.input.update(dt);
    const cinematic = this.cutscenes.active || this.mode === 'cutscene' || this.mode === 'finale' || this.ui.cardShowing;
    this.music.update(dt, !cinematic, !!this.ui.currentSpeaker);   // ducked under dialogue
    this.ambience.update(dt, { outdoor: this.spaceId === 'exterior' && this.mode !== 'finale', season: SETTINGS.season, cinematic, room: this.mode === 'title' ? 'title' : this.spaceId, crowd: this.crowdLevel(dt) });
    const veh = this.player.vehicle;
    this.engine.update(this.mode === 'playing' && !this.pauseOpen && !!veh && veh.kind !== 'bike' && !isRide(veh.kind), isAircraft(veh?.kind ?? 'car') ? Math.max(14, veh!.speed) : veh?.speed ?? 0, veh?.kind === 'cart' ? 'cart' : veh?.kind === 'scooter' ? 'scooter' : 'car');
    this.jetLoop.update(this.mode === 'playing' && !this.pauseOpen && this.player.thrusting ? 0.5 : 0, 1);
    this.updateTraffic(dt);
    if (this.spaceId !== 'exterior') this.interiors.update(dt);
    if (this.balls) {
      const out = this.spaceId === 'exterior';
      this.balls.setVisible(out);
      if (out && !this.pauseOpen) for (const e of this.balls.update(dt, { p: this.player.position, yaw: this.player.yaw, speed: this.player.speed, active: this.mode === 'playing' && !this.player.vehicle && !this.cutscenes.active })) {
        if (e.type === 'score' || e.type === 'goal') { this.ui.toast(e.text!, 1800); playSound(e.type === 'goal' ? 'cheer' : 'success'); this.sideQuests.onBallEvent(e.type); }
        else if (e.type === 'bounce') playSound('bounce');
      }
    }
    // footsteps: one each time a foot lands in the walk animation; the surface sets the sound
    const P = this.player, feet = P.avatar.footfalls;
    if (feet !== this.lastFootfall) {
      this.lastFootfall = feet;
      if (this.mode === 'playing' && !this.cutscenes.active && !P.vehicle && !P.seated && P.grounded && P.speed > 0.6) {
        const x = P.position.x, z = P.position.z, winter = SETTINGS.season === 'winter', indoor = this.spaceId !== 'exterior';
        const fs = indoor ? this.interiors.defs.get(this.spaceId)?.floorStyle : undefined;
        const surface = indoor ? (fs === 'carpet' || fs === 'patternCarpet' ? 'carpet' : fs === 'wood' || fs === 'court' || fs === 'sport' ? 'wood' : 'tile')
          : this.world.onPath(x, z) || onVehicleRoad(x, z) ? (winter && Math.random() < 0.3 ? 'snow' : 'concrete') : winter ? 'snow' : 'grass';
        playStep(surface, P.speed > 6 ? 1 : 0.6, indoor);
      }
    }
    const a = this.input.state;
    for (const h of this.devHooks) h(dt);
    const uiBlocking = this.mode === 'title' && !document.body.classList.contains('booted') ? true : this.ui.update(a);   // menus wait for the loading screen
    this.touch.setVisible(this.touchOn() && this.mode === 'playing' && !uiBlocking && !this.cutscenes.active);

    if (this.mode === 'title') {
      this.markers.forEach(m => m.visible = false);
      this.npcs.setVisible(true); this.npcs.update(dt, new THREE.Vector3(1e6, 0, 1e6), (x, z, r) => this.world.blocked(x, z, r));
      this.titleT += dt * 0.05;
      const [tx, tz] = toGame(40, -150);
      const c = this.renderer.camera, center = new THREE.Vector3(tx, 0, tz);
      c.position.set(center.x + Math.sin(this.titleT) * 140, 85, center.z + Math.cos(this.titleT) * 140);
      c.lookAt(center.x, 20, center.z);
      this.world.updateSun(center);
    } else if (this.mode === 'cutscene') {
      this.markers.forEach(m => m.visible = false); this.sideQuests.hideBubbles();
      this.opening.update(elapsed, a);
    } else if (this.mode === 'finale') {
      this.finale.update(elapsed, a);
      this.markers.forEach(m => m.visible = false);
      this.npcs.setVisible(false); this.sideQuests.hideBubbles();
      this.interactions.update(this.player.position.x, this.player.position.z, this.spaceId, this.world.era); // refresh marker visibility
    } else if (this.cutscenes.active) {
      // a story scene owns the camera; the world keeps animating, the player waits
      const skip = a.pressed('back') || a.pressed('pause'); const next = a.pressed('confirm');
      if (skip) { a.consume('back'); a.consume('pause'); } if (next) a.consume('confirm');
      this.cutscenes.update(dt, next, skip);
      this.player.update(dt, a, this.cameraRig.yaw, false);
      if (this.spaceId === 'exterior') { this.npcs.setVisible(true); this.npcs.update(dt, this.player.position, (x, z, r) => this.world.blocked(x, z, r)); }
      this.quests.update(dt); this.updateMarkers(dt); this.markers.forEach(m => m.visible = false); this.sideQuests.hideBubbles();
      this.world.updateSun(this.player.position);
      this.ui.showHud(false);
    } else {
      this.ui.showHud(true);
      const photo = this.life.photo;
      if (photo.active) {
        if (uiBlocking || a.pressed('back') || a.pressed('pause')) { a.consume('back'); a.consume('pause'); photo.close(); }
        else if (a.pressed('confirm') || a.pressed('interact') || a.pressed('photo') || a.pressed('jump')) { for (const b of ['confirm', 'interact', 'photo', 'jump'] as const) a.consume(b); photo.snap(); }
      }
      const canAct = !uiBlocking && !this.busy && !this.interactions.busy && !photo.active;
      if (photo.active) this.ui.showHud(false);
      if (!this.buildingInfoOpen) this.player.update(dt, a, this.cameraRig.yaw, canAct);
      // basketball in the Hart (before other interactions: E shoots while you have the ball)
      const inHart = this.spaceId === 'bldg-hart';
      if (this.hoops) {
        if (inHart) this.hoops.update(dt, this.player.position, this.player.yaw, this.player.speed, a, canAct && !this.player.vehicle);
        else if (this.inHart) this.hoops.end();
        if (this.hartJace) this.hartJace.root.visible = this.hoops.mode !== 'game';
        if (this.hartKenzie) this.hartKenzie.root.visible = this.hoops.mode !== 'game';
      }
      this.inHart = inHart;
      this.cameraRig.follow = !!this.player.vehicle;
      if (this.camFocus) { const c = this.renderer.camera; c.position.copy(this.camFocus.from); c.lookAt(this.camFocus.to); }
      else this.cameraRig.update(dt, uiBlocking ? null : a, this.player.position, this.space, this.player.yaw);
      this.world.updateSun(this.player.position);
      this.quests.update(dt);
      this.quests.tick(dt, !this.pauseOpen && !this.controllerLost && !this.buildingInfoOpen);
      const focusRaw = this.interactions.update(this.player.position.x, this.player.position.z, this.spaceId, this.world.era);
      const focus = this.player.vehicle ? null : focusRaw;
      this.npcs.setVisible(this.spaceId === 'exterior');
      if (this.spaceId === 'exterior') this.npcs.update(dt, this.player.position, (x, z, r) => this.world.blocked(x, z, r) || Math.hypot(x - this.player.position.x, z - this.player.position.z) < r + 0.6);
      // inspectables: whatever is under the screen-centre reticle
      const ballNear = !focus && !this.player.vehicle && this.spaceId === 'exterior' ? this.balls?.prompt(this.player.position) ?? null : null;
      const insp = !focus && !this.player.vehicle && !uiBlocking ? this.inspectAt(0, 0) : null;
      this.inspectFocus = insp;
      this.ui.setReticle([...this.inspectables.values()].some(i => !i.enabled || i.enabled()) && this.spaceId === 'exterior' && !uiBlocking, !!insp);
      const npc = !focus && !insp && !this.player.vehicle && this.spaceId === 'exterior' ? this.npcs.nearest(this.player.position.x, this.player.position.z, 2.4) : null;
      const nearbySign = canAct ? this.nearbyBuildingSign() : null;
      this.updateCoins(dt); this.updateMarkers(dt);
      this.sideQuests.update(dt, !uiBlocking && !this.pauseOpen && !this.controllerLost && !this.buildingInfoOpen); this.updateGuide();
      this.life.update(dt, !uiBlocking && !this.pauseOpen && !this.controllerLost && !this.buildingInfoOpen);
      this.tourT += dt; if (this.tourT > 0.4) { this.tourT = 0; this.orientation.update(); this.bulletin.update(); }
      this.watchControllers();
      if (canAct) {
        if (this.player.seated && (a.pressed('interact') || Math.hypot(a.axes.moveX, a.axes.moveY) > 0.4 || a.pressed('jump'))) { a.consume('interact'); this.standUp(); }
        else if (this.player.vehicle && (a.pressed('interact') || (a.pressed('ride') && isRide(this.player.vehicle.kind)))) { a.consume('interact'); a.consume('ride'); this.exitCart(); }
        else if (focus && a.pressed('interact')) { a.consume('interact'); if (focus.kind === 'npc' && focus.visual) this.stageConversation(focus.visual); void this.interactions.trigger(); }
        else if (ballNear && a.pressed('interact')) { a.consume('interact'); if (this.balls.action(this.player.position, this.player.yaw)) playSound(ballNear.startsWith('Kick') ? 'kick' : 'tick'); }
        else if (insp && a.pressed('interact')) { a.consume('interact'); insp.onInspect(); }
        else if (npc && a.pressed('interact')) { a.consume('interact'); void this.talkToNpc(npc); }
        else if (a.pressed('ride')) { a.consume('ride'); this.toggleRide(); }
        else if (a.pressed('phone')) { a.consume('phone'); this.showPhone(); }
        else if (a.pressed('photo')) { a.consume('photo'); this.life.photo.open(); }
        else if (a.pressed('pause')) { a.consume('pause'); this.showPause(); }
        else if (a.pressed('journal') && this.hudBtn) { a.consume('journal'); this.hudBtn.fn(); }
        else if (a.pressed('map')) { a.consume('map'); this.openMap(); }   // the map always opens the map (the journal has its own button: J / Joy-Con Y)
      }
      const obj = this.currentObjective();
      const interiorLabel = this.spaceId !== 'exterior' ? this.interiors.defs.get(this.spaceId)!.label : null;
      const coinTotal = this.coinTotal();
      const job = this.life.race.target() ?? this.life.jobs?.target() ?? null;
      const guidePt = job ? { x: job.x, z: job.z } : this.guide ? this.targetPoint({ x: this.guide.x, z: this.guide.z }) : null;
      const sideLine = [this.spaceId === 'bldg-hart' ? this.hoops?.tracker() ?? null : null, this.life.race.tracker(), this.life.jobs?.tracker() ?? null, this.life.events.tracker(), this.life.hangingWith ? `🤝 Hanging out with ${this.life.hangingWith.name}` : null, this.sideQuests.tracker(), this.orientation.tracker(), this.bulletin.tracker(), this.guide ? `🧭 ${this.guide.label} · ${Math.round(Math.hypot(this.guide.x - this.player.position.x, this.guide.z - this.player.position.z))} m` : null].filter(Boolean).join('\n') || null;
      this.ui.updateHud({
        objective: obj.text, era: `${ERAS[this.world.era].label} · 🕒 ${this.life.clock.label()}`,
        buildingHint: nearbySign ? 'Click the building name sign to learn more.' : null,
        prompt: canAct ? (this.player.seated ? 'Stand up (E or move)' : this.player.vehicle ? (isAircraft(this.player.vehicle.kind) && this.player.altitude() > 0.05 ? (this.player.autoLand ? 'Landing… (press again to cancel)' : 'Land here') : this.player.vehicle.kind === 'heli' ? 'Get out of the helicopter' : this.player.vehicle.kind === 'plane' ? 'Get out of the plane (stop first)' : this.player.vehicle.kind === 'bike' ? 'Get off the bicycle' : this.player.vehicle.kind === 'board' ? 'Step off the longboard' : this.player.vehicle.kind === 'sled' ? 'Get off the sled' : this.player.vehicle.kind === 'scooter' ? 'Step off the scooter' : this.player.vehicle.kind === 'car' ? 'Get out of the car' : 'Get out of the golf cart') : focus ? this.interactions.promptText(focus) : ballNear ? ballNear : insp ? (insp.prompt ?? 'Inspect') : npc ? `Talk to ${npc.name}` : null) : null,
        px: this.player.position.x, pz: this.player.position.z, ...this.mapPosition(), pyaw: this.player.yaw, camYaw: this.cameraRig.yaw,
        map: this.world.mapCanvas, eraId: this.world.era, target: guidePt ?? this.targetPoint(obj.target), interior: interiorLabel,
        markers: [...this.markerPoints(), ...this.tourMarker(), ...this.quests.waypoints().map(w => this.targetPoint(w)).filter(Boolean) as { x: number; z: number }[], ...(guidePt ? [guidePt] : [])], side: sideLine,
        targetLabel: job ? job.label : this.guide ? this.guide.label : this.targetLabel(obj.target),   // asked for directions: the pointer leads there until you arrive
        doors: this.spaceId === 'exterior' ? this.entrances.filter(e => !e.eras || e.eras.includes(this.world.era)) : [],
        coins: `● ${coinTotal} coins`, driving: this.player.vehicle?.kind ?? false,
      });
      this.autosaveT += dt; if (this.autosaveT > 20) { this.autosaveT = 0; this.save(); }
    }
    this.effects.update(dt);
    // The opening and ending drive their own subtitle-synchronized mouths.
    if (this.mode !== 'cutscene' && this.mode !== 'finale') this.updateMouths(dt);
    this.animateQuestAvatars(dt);
    this.syncVehicles();
    if (this.overhead) {
      const c = this.renderer.camera, o = this.overhead, h = o.span / 2 / Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
      c.position.set(o.x, h, o.z + 0.001); c.up.set(0, 0, -1); this.renderer.scene.fog = null; c.lookAt(o.x, 0, o.z); c.far = h + 500; c.updateProjectionMatrix();
    } else if (this.renderer.camera.up.z !== 0) { this.renderer.camera.up.set(0, 1, 0); this.renderer.scene.fog = this.renderer.fog; this.renderer.camera.far = 2500; this.renderer.camera.updateProjectionMatrix(); }
    if (SETTINGS.dayNight && this.life) {
      const story = this.mode === 'playing';   // the title, opening and finale keep each era's designed look
      this.world.setTimeOfDay(story ? (this.spaceId === 'exterior' ? this.life.clock.hour : 13) : ERA_START_HOUR[this.world.era], this.renderer.fog.color);
      this.renderer.setDaylight(this.world.daylight);
    } else this.renderer.setDaylight(1);
    this.renderer.render(dt);
    if (this.life?.photo.active) this.life.photo.afterRender(this.renderer.canvas, { camera: this.renderer.camera, hour: this.life.clock.hour, daylight: this.world.daylight });
    this.ui.setMapColor(this.renderer.colorAmount);
  }
}

export { CAMPUS };
export type { InteractableDef };

/** A flat sign mounted on the wall above a door (door-local space; the door faces +z). */
function wallSign(lines: string[]): THREE.Mesh {
  const tex = new THREE.CanvasTexture(textCanvas(lines, { w: 512, h: 128, bg: '#2a3a4f', fg: '#f6f0e2', border: '#c9b48a' })); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.position.set(0, 4.25, 0.08); return m;
}
