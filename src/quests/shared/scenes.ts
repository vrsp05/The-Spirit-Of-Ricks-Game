// Reusable story-scene builders on top of ctx.cutscene (quest-agnostic).
import type { CutStep } from '../../cutscene/Cutscene';
import type { DialogueLine, QuestContext } from '../contract';

type P = { x: number; y: number; z: number };
const add = (p: P, x: number, y: number, z: number) => ({ x: p.x + x, y: p.y + y, z: p.z + z });

/** Camera framing Bednar from over the assistant's shoulder, then a closer shot; one step per line. */
export function bednarSteps(ctx: QuestContext, lines: DialogueLine[], extra: Partial<CutStep>[] = []): CutStep[] {
  const b = ctx.world.questGiverPosition(), p = ctx.world.playerPosition();
  const dx = b.x - p.x, dz = b.z - p.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const over = { x: p.x - ux * 2.6 + uz * 1.1, y: p.y + 2.6, z: p.z - uz * 2.6 - ux * 1.1 };
  const close = { x: b.x - ux * 3.2 - uz * 1.4, y: b.y + 2.1, z: b.z - uz * 3.2 + ux * 1.4 };
  const face = add(b, 0, 1.8, 0);
  return lines.map((l, i) => ({
    camera: i === 0 ? { from: add(over, 0, 1.5, 0), to: over, dur: 1.2 } : i === 1 ? { from: over, to: close, dur: 1.4 } : undefined,
    look: face, say: { speaker: l.speaker, text: l.text }, ...(extra[i] ?? {}),
  }));
}

/** Camera behind a world point looking at another (for candidate POV and site shots). */
export function shoulderCam(from: P, to: P, back = 2.4, up = 1.9) {
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
  return { pos: { x: from.x - (dx / L) * back + (dz / L) * 0.7, y: from.y + up, z: from.z - (dz / L) * back - (dx / L) * 0.7 }, look: add(to, 0, 1.4, 0) };
}
