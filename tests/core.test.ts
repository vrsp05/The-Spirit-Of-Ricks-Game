import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceTimer, computeReward, speedShare } from '../src/quests/rewards';
import { QuestManager, freshQuestState } from '../src/quests/QuestManager';
import type { QuestModule } from '../src/quests/contract';

const T = { base: 100, qualityMax: 50, speedMax: 50, hardBonus: 25 };
describe('rewards', () => {
  it('base + quality + speed + hard bonus = total', () => {
    const r = computeReward({ questId: 'q', tuning: T, difficulty: 'hard', activeSeconds: 100, targetSeconds: 300, qualityScore: 1, skippedFraction: 0, devSkipped: false });
    expect([r.base, r.quality, r.speed, r.hardBonus, r.total]).toEqual([100, 50, 50, 25, 225]);
  });
  it('Easy has no hard bonus; slow and sloppy still earns the base', () => {
    const r = computeReward({ questId: 'q', tuning: T, difficulty: 'easy', activeSeconds: 10000, targetSeconds: 300, qualityScore: 0, skippedFraction: 0, devSkipped: false });
    expect(r.total).toBe(100); expect(r.hardBonus).toBe(0);
  });
  it('skipped portions earn no quality/speed; dev-skipped quests earn nothing', () => {
    const half = computeReward({ questId: 'q', tuning: T, difficulty: 'easy', activeSeconds: 0, targetSeconds: 300, qualityScore: 1, skippedFraction: 0.5, devSkipped: false });
    expect(half.quality).toBe(25); expect(half.speed).toBe(25);
    expect(computeReward({ questId: 'q', tuning: T, difficulty: 'hard', activeSeconds: 0, targetSeconds: 300, qualityScore: 1, skippedFraction: 0, devSkipped: true }).total).toBe(0);
  });
  it('speed share: full at target, zero at 2× target', () => { expect(speedShare(300, 300)).toBe(1); expect(speedShare(450, 300)).toBe(0.5); expect(speedShare(600, 300)).toBe(0); });
  it('timer only runs when allowed (pauses/cutscenes excluded)', () => {
    expect(advanceTimer(10, 0.5, true)).toBe(10.5); expect(advanceTimer(10, 0.5, false)).toBe(10); expect(advanceTimer(10, 5, true)).toBe(10); // huge gaps (tab hidden) ignored
  });
});

function makeManager() {
  const onCompleted = vi.fn();
  const svc: any = {
    ui: { dialogue: async () => {}, panel: async () => null, custom: async () => null, toast: () => {}, setBanner: () => {}, hudButton: () => {} },
    world: {}, addInteractable: () => {}, removeInteractable: () => {}, difficulty: () => 'easy', cutscene: async () => {},
    onCompleted, onFailed: () => {}, onTargetsChanged: () => {}, onColorProgress: () => {}, persist: () => {},
  };
  const qm = new QuestManager(svc);
  let ctxRef: any;
  const mod: QuestModule = { id: 'professors', title: 'Q1', owner: 't', placeholder: false, register: c => { ctxRef = c; }, objective: () => '', briefing: () => [], qualityScore: () => 0.5 };
  qm.register(mod);
  qm.init(freshQuestState());
  return { qm, onCompleted, ctx: () => ctxRef };
}
describe('quest state idempotency', () => {
  let m: ReturnType<typeof makeManager>;
  beforeEach(() => { m = makeManager(); });
  it('completing twice awards one receipt and fires once', () => {
    m.qm.start('professors'); m.qm.tick(120, true); m.qm.tick(0.5, true);
    m.ctx().complete(); m.ctx().complete();
    expect(m.onCompleted).toHaveBeenCalledTimes(1);
    expect(m.qm.receipt('professors')!.total).toBe(100 + 25 + 50);
    expect(m.qm.status('y2k')).toBe('available');   // the next mission in the story order opens
  });
  it('timer pauses when not running', () => {
    m.qm.start('professors'); m.qm.tick(0.5, true); m.qm.tick(0.5, false); m.qm.tick(0.25, true);
    expect(m.qm.activeSeconds('professors')).toBeCloseTo(0.75);
  });
  it('a reset quest can never mint a second reward', () => {
    m.qm.start('professors'); m.ctx().complete(); const first = m.qm.receipt('professors');
    m.qm.reset('professors'); m.qm.init(m.qm.state); m.qm.start('professors'); m.ctx().complete();
    expect(m.qm.receipt('professors')).toBe(first); expect(m.qm.totalRewardCoins()).toBe(first!.total);
  });
  it('dev skip completes with a zero receipt', () => {
    m.qm.forceComplete('professors');
    expect(m.qm.status('professors')).toBe('completed'); expect(m.qm.receipt('professors')!.devSkipped).toBe(true); expect(m.qm.totalRewardCoins()).toBe(0);
  });
});

describe('save migration', () => {
  it('v2 saves migrate to v4 (Easy/Hard, empty receipts, quest progress restarts, new missions added)', async () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    store['spirit-of-ricks.save'] = JSON.stringify({ version: 2, savedAt: 'x', difficulty: 'challenging', era: 'byui', colorStage: 2, quests: { professors: { status: 'completed', data: {} } }, targets: { a: 'b' }, player: { space: 'exterior', x: 1, z: 2, yaw: 0 }, coins: ['coin-1'], introSeen: true, finaleReached: false });
    const { loadSave } = await import('../src/save/save');
    const d = loadSave()!;
    expect(d.version).toBe(4); expect(d.quests.y2k.status).toBe('locked'); expect(d.difficulty).toBe('hard'); expect(d.rewards).toEqual({}); expect(d.coins).toEqual(['coin-1']);
    expect(d.quests.professors.status).toBe('available'); expect(d.era).toBe('ricks1999');
  });
});
