// Automated playthrough: a bot plays each story mission from Bednar's assignment to the report, through the
// real quest modules and QuestManager (no browser). Every "turn" it walks to the current objective, presses
// E on whatever the mission marks as an objective, answers panels and minigames with scripted results, and
// stops when the mission can be reported. If a mission change ever makes one unfinishable, this fails.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GAME_CONFIG } from '../src/config/game.config';
import type { InteractableDef } from '../src/interact/interactables';
import type { Inspectable, QuestId } from '../src/quests/contract';
import { QuestManager, freshQuestState, voxelBox } from '../src/quests/QuestManager';
import { QUEST_ERA, QUEST_ORDER } from '../src/quests/order';
import { createQuestModules } from '../src/quests';
import type { EraId } from '../src/world/eras';

// --- a tiny fake DOM: quest props draw text onto canvases (plaques, signs)
beforeAll(() => {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  const el = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener() {}, appendChild() {}, remove() {}, classList: { add() {}, remove() {}, toggle() {} } });
  (globalThis as any).document ??= { createElement: el, body: el() };
  (globalThis as any).window ??= { setTimeout, clearTimeout };
  (globalThis as any).requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0);
  (globalThis as any).cancelAnimationFrame ??= (h: any) => clearTimeout(h);
});

/** Scripted results for custom-panel minigames, by panel class (default: 'done'). */
const MINIGAME: Record<string, string> = { 'ft-panel': '5', 'y2k-panel': 'done' };

function harness(id: QuestId) {
  const inter = new Map<string, InteractableDef>(), insp = new Map<string, Inspectable>();
  let era: EraId = QUEST_ERA[id], player = { x: 0, y: 0, z: 0, space: 'exterior' };
  const loc = (a: string) => { const l = (GAME_CONFIG.locations as Record<string, { x: number; z: number; yaw?: number }>)[a]; return l ?? { x: 0, z: 0 }; };
  let completed = false;
  const qm = new QuestManager({
    ui: {
      dialogue: async () => {}, toast: () => {}, setBanner: () => {}, hudButton: () => {},
      panel: async s => s.buttons[0]?.id ?? null,
      custom: async (_t, _r, o) => MINIGAME[o?.className ?? ''] ?? 'done',
    } as any,
    world: {
      era: () => era, location: (a: string) => loc(a) as any,
      position: (a: string) => ({ ...loc(a), y: 0, space: 'exterior' }),
      playerPosition: () => player, placePlayer: (x: number, z: number) => { player = { ...player, x, z }; },
      questGiverPosition: () => ({ x: 0, y: 0, z: 0, space: 'exterior' }), terrainHeight: () => 0,
      addObject: () => () => {}, blueprintGhost: () => null, focusCamera: () => {}, releaseCamera: () => {},
      addInspectable: (d: Inspectable) => { insp.set(d.id, d); }, removeInspectable: (i: string) => { insp.delete(i); },
      gatherCrowd: () => {}, fireworks: () => {}, colorWave: () => {}, sound: () => {}, reducedMotion: () => true,
      voxel: voxelBox, npc: () => new THREE.Group(), label: () => new THREE.Group(),
    } as any,
    addInteractable: d => { inter.set(d.id, d); }, removeInteractable: i => { inter.delete(i); },
    difficulty: () => 'easy',
    cutscene: async spec => { for (const s of spec.steps ?? []) { (s as any).run?.(); (s as any).tick?.(0.1, 1); } spec.onDone?.(); (spec as any).cleanup?.(); },
    onCompleted: () => { completed = true; }, onFailed: () => {}, onTargetsChanged: () => {}, onColorProgress: () => {}, persist: () => {},
  });
  return { qm, inter, insp, setEra: (e: EraId) => { era = e; }, setPlayer: (x: number, z: number) => { player = { ...player, x, z }; }, done: () => completed, loc };
}

async function play(id: QuestId) {
  const h = harness(id);
  const st = freshQuestState(), i = QUEST_ORDER.indexOf(id);
  QUEST_ORDER.forEach((q, k) => { st.quests[q].status = k < i ? 'completed' : k === i ? 'available' : 'locked'; });
  if (i > QUEST_ORDER.indexOf('construction')) { st.targets['construction:taylor'] = 'solved'; st.targets['construction:icenter'] = 'solved'; }
  // only this mission's module needs to run (fresh modules: they keep closure state)
  for (const m of createQuestModules()) if (m.id === id) h.qm.register(m);
  h.qm.init(st);
  await h.qm.assign(id);
  expect(h.qm.status(id)).toBe('active');
  let turns = 0;
  while (!h.qm.readyToReport(id) && turns++ < 400) {
    h.qm.update(0.25); h.qm.tick(0.25, true);
    const o = h.qm.objective(); const tgt = o?.target;
    if (typeof tgt === 'string') { const p = h.loc(tgt); h.setPlayer(p.x, p.z); } else if (tgt) h.setPlayer(tgt.x, tgt.z);
    const todo = [...h.inter.values()].filter(d => (!d.eras || d.eras.includes(QUEST_ERA[id])) && (d.enabled?.() ?? true) && d.objective?.());
    const looks = [...h.insp.values()].filter(d => !d.enabled || d.enabled());
    if (todo.length) { for (const d of todo) await d.onInteract(); }
    else if (looks.length) { for (const d of looks) d.onInspect(); }
  }
  expect(h.qm.readyToReport(id), `${id}: stuck after ${turns} turns — objective "${h.qm.objective()?.text}"`).toBe(true);
  await h.qm.report(id);
  expect(h.qm.status(id)).toBe('completed');
  expect(h.done()).toBe(true);
  return turns;
}

describe('automated playthrough of the story missions', () => {
  // Q1–Q3 (professors, construction, letters) solve their puzzles inside full-screen DOM panels; their logic has its own tests (q1, q2).
  const BOT: QuestId[] = ['y2k', 'vikings', 'capsule', 'snowday'];
  for (const id of BOT) it(`${id}: a bot can play it from assignment to report`, async () => { expect(await play(id)).toBeLessThan(400); });
});
