// What campus life needs from the game (implemented in game.ts).
import type * as THREE from 'three';
import type { DialogueLine } from '../quests/contract';
import type { SoundName } from '../fx/audio';
import type { NpcCrowd } from '../world/Npcs';
import type { World } from '../world/World';
import type { EraId } from '../world/eras';
import type { UI } from '../ui/ui';
import type { Avatar } from '../player/Avatar';

export type Side = 'n' | 's' | 'e' | 'w';
export interface PlayerInfo { x: number; y: number; z: number; yaw: number; space: string; driving: string | false; seated: boolean; speed: number }

export interface LifeHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  npcs: NpcCrowd;
  world: World;
  ui: UI;
  avatar: Avatar;
  era(): EraId;
  season(): 'spring' | 'summer' | 'autumn' | 'winter';
  player(): PlayerInfo;
  playerName(): string;
  /** Push the player (wind gusts), respecting collisions. */
  nudgePlayer(dx: number, dz: number): void;
  /** Free outdoor spot by a building wall (game metres), facing away from it. */
  spotBy(building: string, side: Side, out?: number): { x: number; z: number; yaw: number } | null;
  /** Closest door of a standing building (game metres). */
  doorOf(building: string): [number, number] | null;
  addInteractable(def: { id: string; at: { x: number; z: number; space?: string }; radius: number; prompt: string | (() => string); visual?: THREE.Object3D; npc?: boolean; enabled?: () => boolean; onInteract: () => void | Promise<void> }): void;
  removeInteractable(id: string): void;
  talk(npc: THREE.Object3D, lines: DialogueLine[]): Promise<void>;
  choose(title: string, body: string, buttons: { id: string; label: string }[]): Promise<string | null>;
  toast(text: string, ms?: number): void;
  sound(name: SoundName): void;
  /** Every coin you own right now (story, side quests, pickups, campus life). */
  wallet(): number;
  /** The player is free to do things (playing, no menu open, no scripted scene). */
  canPlay(): boolean;
  /** A timed side quest is running (happenings wait). */
  sideBusy(): boolean;
  /** "alt" (R / ✕) pressed this frame — consumed (throwing snowballs). */
  takeThrow(): boolean;
  holdItem(color: string | null): void;
  /** Sit the player down / stand them up (piano bench). */
  seat(x: number, z: number, yaw: number): void;
  stand(): void;
  save(): void;
}
