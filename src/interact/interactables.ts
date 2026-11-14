// Shared interactable type for NPCs, doors, blueprints, construction sites,
// letters and finale triggers. Positions come from named locations (config).
import * as THREE from 'three';
import type { EraId } from '../world/eras';

export type InteractableKind = 'npc' | 'door' | 'blueprint' | 'site' | 'letter' | 'finale' | 'sign' | 'generic';

export interface InteractableDef {
  id: string;
  kind: InteractableKind;
  /** Named location id from GAME_CONFIG.locations, or explicit coordinates. */
  at: string | { x: number; z: number; space?: string };
  radius?: number;                       // interaction radius (m), default 2.2
  prompt: string | (() => string);       // e.g. "Talk to …"
  enabled?: () => boolean;
  eras?: EraId[] | null;                 // null/undefined = all eras
  visual?: THREE.Object3D;               // placed at the location, removed with the interactable
  onInteract: () => void | Promise<void>;
  /** Show a floating marker when this is the current objective. */
  objective?: () => boolean;
}

export interface Interactable extends InteractableDef {
  x: number; z: number; space: string;
}

export class InteractionSystem {
  readonly items = new Map<string, Interactable>();
  focused: Interactable | null = null;
  busy = false;

  constructor(
    private resolve: (at: InteractableDef['at']) => { x: number; z: number; space: string },
    private placeVisual: (obj: THREE.Object3D, x: number, z: number, space: string) => void,
    private removeVisual: (obj: THREE.Object3D) => void,
  ) {}

  add(def: InteractableDef): Interactable {
    if (this.items.has(def.id)) this.remove(def.id);
    const p = this.resolve(def.at);
    const it: Interactable = { ...def, ...p };
    this.items.set(def.id, it);
    if (def.visual) this.placeVisual(def.visual, p.x, p.z, p.space);
    return it;
  }
  remove(id: string) {
    const it = this.items.get(id); if (!it) return;
    if (it.visual) this.removeVisual(it.visual);
    this.items.delete(id);
    if (this.focused?.id === id) this.focused = null;
  }
  isAvailable(it: Interactable, space: string, era: EraId) {
    return it.space === space && (!it.eras || it.eras.includes(era)) && (it.enabled ? it.enabled() : true);
  }
  /** Update visibility + find the nearest usable interactable. */
  update(px: number, pz: number, space: string, era: EraId) {
    let best: Interactable | null = null, bestD = Infinity;
    for (const it of this.items.values()) {
      const avail = this.isAvailable(it, space, era);
      if (it.visual) it.visual.visible = it.space === space && (!it.eras || it.eras.includes(era)) && (it.enabled ? it.enabled() : true);
      if (!avail) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d < (it.radius ?? 2.2) && d < bestD) { best = it; bestD = d; }
    }
    this.focused = best;
    return best;
  }
  promptText(it: Interactable) { return typeof it.prompt === 'function' ? it.prompt() : it.prompt; }
  async trigger() {
    const it = this.focused; if (!it || this.busy) return;
    this.busy = true;
    try { await it.onInteract(); } finally { this.busy = false; }
  }
}
