// ============================================================================
// QUEST CONTRACT — the only API quest modules should use.
// Quest modules must NOT import renderer, player, input decoding or map code.
// Docs: docs/quest-contract.md
// ============================================================================
import type * as THREE from 'three';
import type { Anchor, DifficultyId } from '../config/game.config';
import type { InteractableDef } from '../interact/interactables';
import type { EraId } from '../world/eras';
import type { CutsceneSpec } from '../cutscene/Cutscene';

export type QuestId = 'professors' | 'construction' | 'letters';
export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';

export interface DialogueLine { speaker: string; text: string; placeholder?: boolean }

export interface PanelButton { id: string; label: string }
export interface PanelSpec {
  title: string;
  body?: string;               // plain text (escaped). Use custom() for rich content.
  buttons: PanelButton[];      // focus-navigable with keyboard & controllers
  placeholder?: boolean;       // shows a "DEV EXAMPLE" badge
}

/** Actions a custom panel can receive (keyboard, mouse-driven buttons, controllers). */
/** 4 buttons + 2 sticks: up/down/left/right = left stick; alt/alt2 = right stick right/left (R/F); rup/rdown = right stick up/down (T/G);
 *  confirm = ①, back = ②, hint = ③, tools = ④ (Tab) toggles the tools bar. */
export type PanelAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'alt' | 'alt2' | 'rup' | 'rdown' | 'hint' | 'tools';
export interface CustomPanelApi {
  close: (result: string | null) => void;
  refocus: () => void;
  /** Intercept actions (return true to consume). Without a handler, nav moves focus between [data-focus] elements. */
  onAction: (fn: (a: PanelAction) => boolean) => void;
}
/** Custom quest UI. Mark focusable controls with data-focus; call close(result). Return a cleanup fn if needed. */
export type CustomPanel = (root: HTMLElement, api: CustomPanelApi) => void | (() => void);

export interface QuestUI {
  dialogue(lines: DialogueLine[]): Promise<void>;
  panel(spec: PanelSpec): Promise<string | null>;           // null = backed out
  custom(title: string, render: CustomPanel, opts?: { placeholder?: boolean; wide?: boolean; className?: string }): Promise<string | null>;
  toast(text: string): void;
  /** Objective shown in the HUD while this quest is active; optional target location for the navigation aid. */
  setObjective(text: string, target?: string | { x: number; z: number; space?: string } | null): void;
  /** Extra waypoints (anchor ids) shown on minimap/map edges while the quest is active. */
  setWaypoints(anchorIds: string[]): void;
  /** Persistent banner at the top of the screen (e.g. "Playing as: Math candidate"); null hides it. */
  setBanner(text: string | null): void;
  /** Always-visible HUD button (e.g. "Journal (J)"); the Journal key and, if `viaMap`, the Map action trigger it too. */
  hudButton(label: string | null, onClick: (() => void) | null, viaMap?: boolean): void;
}

export interface Inspectable {
  id: string;
  object: THREE.Object3D;          // hit target (use generous invisible boxes)
  maxDistance?: number;            // metres from the player
  prompt?: string;
  enabled?: () => boolean;
  onInspect: () => void;
}

export interface QuestWorld {
  era(): EraId;
  location(id: string): Anchor;                               // raw config anchor (real metres)
  /** Resolved game-space position of an anchor (ground height included). */
  position(id: string): { x: number; y: number; z: number; space: string };
  playerPosition(): { x: number; y: number; z: number; space: string };
  /** Move the player within the current space (e.g. stand beside the board during a classroom demo). */
  placePlayer(x: number, z: number, yaw?: number): void;
  questGiverPosition(): { x: number; y: number; z: number; space: string };
  terrainHeight(x: number, z: number): number;
  /** Add a decorative object at a location; returned handle removes it. */
  addObject(obj: THREE.Object3D, at: string | { x: number; z: number; space?: string }): () => void;
  /** Persistent, quest-owned state (e.g. puzzle solved flags) visible to the world. */
  setTargetState(targetId: string, state: string): void;
  getTargetState(targetId: string): string | undefined;
  /** Translucent blueprint-blue copy of a registry building (for montages / future plans). */
  blueprintGhost(buildingId: string): THREE.Object3D | null;
  /** Point the camera from `from` at `to` until releaseCamera(). */
  focusCamera(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void;
  releaseCamera(): void;
  addInspectable(def: Inspectable): void;
  removeInspectable(id: string): void;
  /** Ambient NPCs gather around a point and cheer (celebrations). */
  gatherCrowd(x: number, z: number, seconds: number): void;
  fireworks(x: number, y: number, z: number, seconds: number): void;
  colorWave(x: number, z: number): void;
  sound(name: 'tick' | 'error' | 'chime' | 'success' | 'cheer' | 'pop'): void;
  reducedMotion(): boolean;
  voxel(w: number, h: number, d: number, color: string): THREE.Mesh;
  npc(opts: { label: string; sub?: string; shirt?: string; pants?: string; hair?: string; skin?: string }): THREE.Object3D;
  label(text: string, sub?: string): THREE.Object3D;
}

export interface QuestContext {
  readonly id: QuestId;
  readonly config: any;                                       // GAME_CONFIG.quests[id]
  difficulty(): DifficultyId;
  status(): QuestStatus;
  isActive(): boolean;
  /** Persistent per-quest data (saved locally). Values must be JSON-serialisable. */
  progress: { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void; reset(): void };
  addInteractable(def: InteractableDef): void;
  removeInteractable(id: string): void;
  ui: QuestUI;
  world: QuestWorld;
  /** Short skippable in-engine scene. `onDone` (state change) runs exactly once, also when skipped. */
  cutscene(spec: CutsceneSpec): Promise<void>;
  /** Progress within this quest's colour stage, 0..1 (the world decides the actual colour). */
  reportColorProgress(fraction: number): void;
  /** Success: advances the story (colour + optional era change) and grants the one-time reward. */
  complete(): void;
  /** A failed attempt. Never advances; the player may retry. */
  fail(reason?: string): void;
  on(event: 'started' | 'completed' | 'failed' | 'eraChanged' | 'reset', fn: (data?: unknown) => void): void;
  readonly DEV: string;
}

export interface QuestModule {
  id: QuestId;
  title: string;
  owner: string;
  placeholder: boolean;
  register(ctx: QuestContext): void;
  onStart?(): void;
  onSuspend?(): void;
  onResume?(): void;
  objective(): string;
  /** Dialogue the quest giver uses when assigning (a module may instead play its own scene in onAssign). */
  briefing(): DialogueLine[];
  /** Optional custom assignment scene (replaces the default briefing dialogue). Must call `start()` once. */
  onAssign?(start: () => void): Promise<void>;
  reminder?(): DialogueLine[];
  /** True when the player should report back to the quest giver to finish (Q1/Q2). */
  readyToReport?(): boolean;
  /** Called when the player reports; play a scene, then call ctx.complete(). */
  onReport?(): Promise<void>;
  /** 0..1 quality evidence (normalised over the quest's activities); skipped portions excluded. */
  qualityScore?(): number;
  /** 0..1 share of the quest that was skipped by the player (earns no quality/speed bonus). */
  skippedFraction?(): number;
  update?(dt: number): void;
  dispose?(): void;
}
