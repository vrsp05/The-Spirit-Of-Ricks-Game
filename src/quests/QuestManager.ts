// Owns quest modules, their status/progress, timers, reward receipts, and builds each QuestContext.
import * as THREE from 'three';
import { GAME_CONFIG, type DifficultyId } from '../config/game.config';
import type { CutsceneSpec } from '../cutscene/Cutscene';
import type { InteractableDef } from '../interact/interactables';
import type { EraId } from '../world/eras';
import type { DialogueLine, QuestContext, QuestId, QuestModule, QuestStatus, QuestUI, QuestWorld } from './contract';
import { advanceTimer, computeReward, type RewardReceipt } from './rewards';

export const QUEST_ORDER: QuestId[] = ['professors', 'construction', 'letters'];

export interface QuestState {
  quests: Record<string, { status: QuestStatus; data: Record<string, unknown> }>;
  targets: Record<string, string>;
  rewards: Record<string, RewardReceipt>;   // immutable once written
}
export interface QuestServices {
  ui: Omit<QuestUI, 'setObjective' | 'setWaypoints'>;
  world: Omit<QuestWorld, 'setTargetState' | 'getTargetState'>;
  addInteractable(def: InteractableDef): void;
  removeInteractable(id: string): void;
  difficulty(): DifficultyId;
  cutscene(spec: CutsceneSpec): Promise<void>;
  onCompleted(id: QuestId, receipt: RewardReceipt | null): void;
  onFailed(id: QuestId, reason?: string): void;
  onTargetsChanged(): void;
  onColorProgress(): void;
  persist(): void;
}

type Handler = (data?: unknown) => void;

export function freshQuestState(): QuestState {
  return { quests: Object.fromEntries(QUEST_ORDER.map((id, i) => [id, { status: i === 0 ? 'available' : 'locked', data: {} }])) as QuestState['quests'], targets: {}, rewards: {} };
}

export class QuestManager {
  readonly modules = new Map<QuestId, QuestModule>();
  private contexts = new Map<QuestId, QuestContext>();
  private handlers = new Map<QuestId, Map<string, Handler[]>>();
  private objectives = new Map<QuestId, { text: string; target: string | { x: number; z: number; space?: string } | null }>();
  private waypointMap = new Map<QuestId, string[]>();
  state: QuestState = freshQuestState();

  constructor(private svc: QuestServices) {}

  register(mod: QuestModule) { this.modules.set(mod.id, mod); }

  init(state: QuestState) {
    for (const m of this.modules.values()) m.dispose?.();
    this.handlers.clear(); this.objectives.clear(); this.contexts.clear(); this.waypointMap.clear();
    this.state = { ...state, rewards: state.rewards ?? {} };
    for (const id of QUEST_ORDER) {
      const mod = this.modules.get(id); if (!mod) continue;
      const ctx = this.makeContext(id);
      this.contexts.set(id, ctx);
      mod.register(ctx);
    }
  }

  status(id: QuestId): QuestStatus { return this.state.quests[id]?.status ?? 'locked'; }
  active(): QuestId | null { return QUEST_ORDER.find(id => this.status(id) === 'active') ?? null; }
  nextAvailable(): QuestId | null { return QUEST_ORDER.find(id => this.status(id) === 'available') ?? null; }
  completedCount() { return QUEST_ORDER.filter(id => this.status(id) === 'completed').length; }
  allComplete() { return QUEST_ORDER.every(id => this.status(id) === 'completed'); }
  data(id: QuestId) { return this.state.quests[id]?.data ?? {}; }

  start(id: QuestId) {
    if (this.status(id) !== 'available') return;
    this.state.quests[id].status = 'active';
    this.modules.get(id)?.onStart?.();
    this.emit(id, 'started');
    this.svc.persist();
  }
  briefing(id: QuestId): DialogueLine[] { return this.modules.get(id)?.briefing() ?? []; }
  reminder(id: QuestId): DialogueLine[] { const m = this.modules.get(id); return m?.reminder?.() ?? [{ speaker: GAME_CONFIG.questGiver.displayName, text: m?.objective() ?? '' }]; }
  readyToReport(id: QuestId) { return this.status(id) === 'active' && !!this.modules.get(id)?.readyToReport?.(); }

  objective(): { text: string; target: string | { x: number; z: number; space?: string } | null } | null {
    const id = this.active(); if (!id) return null;
    return this.objectives.get(id) ?? { text: this.modules.get(id)?.objective() ?? '', target: null };
  }
  waypoints(): string[] { const id = this.active(); return id ? this.waypointMap.get(id) ?? [] : []; }
  colorProgress(id: QuestId): number { return Math.max(0, Math.min(1, Number(this.data(id).__color ?? 0))); }
  activeSeconds(id: QuestId): number { return Number(this.data(id).__time ?? 0); }
  receipt(id: QuestId): RewardReceipt | undefined { return this.state.rewards[id]; }
  totalRewardCoins() { return Object.values(this.state.rewards).reduce((s, r) => s + r.total, 0); }

  /** Advance the active quest's timer (call only while not paused / not in a cutscene). */
  tick(dt: number, running: boolean) {
    const id = this.active(); if (!id) return;
    const d = this.state.quests[id].data; d.__time = advanceTimer(Number(d.__time ?? 0), dt, running);
  }

  /** Dev: complete a quest as skipped (no player reward). */
  forceComplete(id: QuestId) {
    if (this.status(id) === 'completed') return;
    if (this.status(id) === 'locked' || this.status(id) === 'available') this.state.quests[id].status = 'active';
    this.state.quests[id].data.__devSkipped = true;
    this.contexts.get(id)?.complete();
  }
  reset(id: QuestId) {
    const i = QUEST_ORDER.indexOf(id);
    this.state.quests[id] = { status: i === 0 || this.status(QUEST_ORDER[i - 1]) === 'completed' ? 'available' : 'locked', data: {} };
    for (const k of Object.keys(this.state.targets)) if (k.startsWith(id + ':')) delete this.state.targets[k];
    this.objectives.delete(id); this.waypointMap.delete(id);
    // receipts are immutable: a reset quest cannot be re-rewarded
    this.emit(id, 'reset');
    this.svc.onTargetsChanged(); this.svc.onColorProgress();
    this.svc.persist();
  }
  suspendAll() { for (const m of this.modules.values()) m.onSuspend?.(); }
  resumeAll() { for (const m of this.modules.values()) m.onResume?.(); }
  update(dt: number) { for (const m of this.modules.values()) m.update?.(dt); }
  eraChanged(era: EraId) { for (const id of QUEST_ORDER) this.emit(id, 'eraChanged', era); }
  async report(id: QuestId) { const m = this.modules.get(id); if (m?.onReport && this.readyToReport(id)) await m.onReport(); }
  async assign(id: QuestId) {
    const m = this.modules.get(id); if (!m || this.status(id) !== 'available') return;
    if (m.onAssign) await m.onAssign(() => this.start(id));
    else { await this.svc.ui.dialogue(this.briefing(id)); this.start(id); }
  }

  private emit(id: QuestId, ev: string, data?: unknown) { this.handlers.get(id)?.get(ev)?.forEach(f => { try { f(data); } catch (e) { console.error(e); } }); }

  private makeContext(id: QuestId): QuestContext {
    const self = this, svc = this.svc;
    const qs = () => this.state.quests[id];
    return {
      id, config: (GAME_CONFIG.quests as any)[id], DEV: '[DEV EXAMPLE]',
      difficulty: () => svc.difficulty(),
      status: () => self.status(id),
      isActive: () => self.status(id) === 'active',
      progress: {
        get: <T,>(k: string, fb: T) => (k in qs().data ? qs().data[k] as T : fb),
        set: (k, v) => { qs().data[k] = v; svc.persist(); },
        reset: () => { const keep = { __time: qs().data.__time }; qs().data = keep; svc.persist(); },
      },
      addInteractable: def => svc.addInteractable({ ...def, id: `${id}:${def.id}` }),
      removeInteractable: iid => svc.removeInteractable(`${id}:${iid}`),
      ui: {
        ...svc.ui,
        setObjective: (text, target = null) => { self.objectives.set(id, { text, target }); },
        setWaypoints: ids => { self.waypointMap.set(id, ids); },
      },
      world: {
        ...svc.world,
        setTargetState: (t, s) => { self.state.targets[`${id}:${t}`] = s; svc.persist(); svc.onTargetsChanged(); },
        getTargetState: t => self.state.targets[`${id}:${t}`],
      },
      cutscene: spec => svc.cutscene(spec),
      reportColorProgress: f => { qs().data.__color = Math.max(0, Math.min(1, f)); svc.onColorProgress(); svc.persist(); },
      complete: () => {
        if (self.status(id) !== 'active') return;               // idempotent: never completes twice
        qs().status = 'completed';
        const next = QUEST_ORDER[QUEST_ORDER.indexOf(id) + 1];
        if (next && self.status(next) === 'locked') self.state.quests[next].status = 'available';
        self.objectives.delete(id); self.waypointMap.delete(id);
        let receipt: RewardReceipt | null = null;
        if (!self.state.rewards[id]) {                          // one immutable receipt per quest
          const m = self.modules.get(id), R = GAME_CONFIG.rewards, diff = svc.difficulty();
          receipt = computeReward({
            questId: id, tuning: { base: R.base, qualityMax: R.qualityMax, speedMax: R.speedMax, hardBonus: R.hardBonus },
            difficulty: diff, activeSeconds: Number(qs().data.__time ?? 0), targetSeconds: R.targetSec[id]?.[diff] ?? 900,
            qualityScore: m?.qualityScore?.() ?? 1, skippedFraction: m?.skippedFraction?.() ?? 0, devSkipped: !!qs().data.__devSkipped,
          });
          self.state.rewards[id] = receipt;
        }
        self.emit(id, 'completed');
        svc.persist();
        svc.onCompleted(id, receipt);
      },
      fail: reason => { self.emit(id, 'failed', reason); svc.onFailed(id, reason); },
      on: (ev, fn) => {
        if (!self.handlers.has(id)) self.handlers.set(id, new Map());
        const m = self.handlers.get(id)!; if (!m.has(ev)) m.set(ev, []); m.get(ev)!.push(fn);
      },
    };
  }
}

export function voxelBox(w: number, h: number, d: number, color: string) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  m.castShadow = true; return m;
}
