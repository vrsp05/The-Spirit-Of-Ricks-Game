// ============================================================================
// QUEST CONTRACT — the only API quest modules should use.
// Quest modules must NOT import renderer, player, input decoding or map code.
// Docs: docs/quest-contract.md
// ============================================================================
import type * as THREE from 'three';
import type { Anchor, DifficultyId } from '../config/game.config';
import type { InteractableDef } from '../interact/interactables';
import type { EraId } from '../world/eras';

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
/** Custom quest UI. Mark focusable controls with data-focus; call close(result). */
export type CustomPanel = (root: HTMLElement, api: { close: (result: string | null) => void; refocus: () => void }) => void | (() => void);

export interface QuestUI {
  dialogue(lines: DialogueLine[]): Promise<void>;
  panel(spec: PanelSpec): Promise<string | null>;           // null = backed out
  custom(title: string, render: CustomPanel, opts?: { placeholder?: boolean }): Promise<string | null>;
  toast(text: string): void;
  /** Objective shown in the HUD while this quest is active; optional target location for the navigation aid. */
  setObjective(text: string, target?: string | { x: number; z: number; space?: string } | null): void;
}

export interface QuestWorld {
  era(): EraId;
  location(id: string): Anchor;                               // named locations from config
  terrainHeight(x: number, z: number): number;
  /** Add a decorative object at a location; returned handle removes it. */
  addObject(obj: THREE.Object3D, at: string | { x: number; z: number; space?: string }): () => void;
  /** Persistent, quest-owned visual state for construction targets etc. */
  setTargetState(targetId: string, state: string): void;
  getTargetState(targetId: string): string | undefined;
  /** Voxel helper so quests don't need to know renderer internals. */
  voxel(w: number, h: number, d: number, color: string): THREE.Mesh;
  /** Generic voxel NPC with a floating name label (likeness-free, replaceable). */
  npc(opts: { label: string; sub?: string; shirt?: string; pants?: string; hair?: string; skin?: string }): THREE.Object3D;
  /** Floating text label object. */
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
  /** Success: advances the story (colour + optional era change). */
  complete(): void;
  /** A failed attempt. Never advances; the player may retry. */
  fail(reason?: string): void;
  on(event: 'started' | 'completed' | 'failed' | 'eraChanged' | 'reset', fn: (data?: unknown) => void): void;
  /** Prefix used to label development placeholder content. */
  readonly DEV: string;
}

export interface QuestModule {
  id: QuestId;
  title: string;
  owner: string;                 // teammate responsible
  placeholder: boolean;          // true while content is a development example
  /** Called once when the game session starts (also after load). Register interactables here. */
  register(ctx: QuestContext): void;
  /** Bednar has assigned the quest. */
  onStart?(): void;
  /** Called when the game is paused / resumed (menus, saving). */
  onSuspend?(): void;
  onResume?(): void;
  /** Return the HUD objective for the active quest. */
  objective(): string;
  /** Dialogue the quest giver uses when assigning / reminding (placeholders until written). */
  briefing(): DialogueLine[];
  reminder?(): DialogueLine[];
  /** Per-frame hook (animations). dt in seconds. Not called while paused. */
  update?(dt: number): void;
  dispose?(): void;
}
