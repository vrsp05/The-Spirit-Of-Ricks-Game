// Pure reward maths (unit-tested). One currency for all quests.
// total = base + quality + speed + hardBonus, each awarded once per quest (immutable receipt).

export interface RewardTuning { base: number; qualityMax: number; speedMax: number; hardBonus: number }
export interface RewardReceipt {
  questId: string;
  base: number; quality: number; speed: number; hardBonus: number; total: number;
  activeSeconds: number; targetSeconds: number; qualityScore: number; skippedFraction: number;
  difficulty: string; devSkipped: boolean; at: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** Speed share: 1 at/below target, falling linearly to 0 at twice the target. */
export function speedShare(activeSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0) return 0;
  return clamp01((2 * targetSeconds - activeSeconds) / targetSeconds);
}

export function computeReward(input: {
  questId: string; tuning: RewardTuning; difficulty: string; activeSeconds: number; targetSeconds: number;
  qualityScore: number; skippedFraction: number; devSkipped: boolean; at?: string;
}): RewardReceipt {
  const { tuning: t } = input;
  const at = input.at ?? new Date().toISOString();
  if (input.devSkipped) {
    return { questId: input.questId, base: 0, quality: 0, speed: 0, hardBonus: 0, total: 0, activeSeconds: input.activeSeconds,
      targetSeconds: input.targetSeconds, qualityScore: 0, skippedFraction: 1, difficulty: input.difficulty, devSkipped: true, at };
  }
  const played = 1 - clamp01(input.skippedFraction);           // skipped portions earn no bonus
  const quality = Math.round(t.qualityMax * clamp01(input.qualityScore) * played);
  const speed = Math.round(t.speedMax * speedShare(input.activeSeconds, input.targetSeconds) * played);
  const hardBonus = input.difficulty === 'hard' ? t.hardBonus : 0;
  return {
    questId: input.questId, base: t.base, quality, speed, hardBonus, total: t.base + quality + speed + hardBonus,
    activeSeconds: Math.round(input.activeSeconds), targetSeconds: input.targetSeconds, qualityScore: clamp01(input.qualityScore),
    skippedFraction: clamp01(input.skippedFraction), difficulty: input.difficulty, devSkipped: false, at,
  };
}

/** Quest timer: only advances while the quest is active and the game is not paused/in a cutscene/disconnected. */
export function advanceTimer(current: number, dt: number, running: boolean): number {
  return running && dt > 0 && dt < 1 ? current + dt : current;
}
