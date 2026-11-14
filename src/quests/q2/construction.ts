// ============================================================================
// QUEST 2 — Build Taylor and the I-Center (symbolic blueprint puzzles).
// TEAM DECISION: both sites start as fenced construction sites (world.gatedBuildings);
// solving a blueprint plays a short build montage and the building appears permanently.
// Report to Bednar after both puzzles to complete the quest.
// Content: ./data/tiling.json (levels), ./data/dialogue.json.
// ============================================================================
import * as THREE from 'three';
import dialogue from './data/dialogue.json';
import type { QuestContext, QuestModule } from '../contract';
import { bednarSteps } from '../shared/scenes';
import { openBlueprint } from './board';
import type { Placement } from './tiling';

interface Bld { id: 'taylor' | 'icenter'; label: string; anchor: string }
const D = dialogue as { assign: { speaker: string; text: string }[]; report: { speaker: string; text: string }[]; reminder: string; readyReminder: string; montage: Record<string, { speaker: string; text: string }[]>; sites: Record<string, string> };

export function createConstruction(): QuestModule {
  let ctx: QuestContext;
  const blds = () => ctx.config.buildings as Bld[];
  const solved = (b: Bld) => ctx.world.getTargetState(b.id) === 'solved' || ctx.status() === 'completed';
  const stats = () => ctx.progress.get<Record<string, { hints: number; resets: number; invalid: number; skipped: boolean }>>('stats', {});
  const remaining = () => blds().filter(b => !solved(b));

  const updateObjective = () => {
    const rem = remaining();
    ctx.ui.setWaypoints(rem.map(b => b.anchor));
    if (rem.length) ctx.ui.setObjective(`Solve the blueprints (${2 - rem.length}/2) — ${rem.map(b => b.label).join(' · ')}`, rem[0].anchor);
    else { ctx.ui.setWaypoints([]); ctx.ui.setObjective('Both blueprints solved — report to President Bednar in the Kimball Building', 'npc.bednar.office'); }
    ctx.reportColorProgress((2 - rem.length) / 2);
  };

  /** Blueprint ghost rises over the site, then the real building takes its place. */
  async function montage(b: Bld) {
    const site = ctx.world.position(b.anchor);
    const ghost = ctx.world.blueprintGhost(b.id);
    let remove: (() => void) | null = null;
    const cam = { x: site.x + 26, y: site.y + 18, z: site.z + 22 }, look = { x: site.x - 4, y: site.y + 4, z: site.z - 6 };
    const lines = D.montage[b.id] ?? [];
    await ctx.cutscene({
      id: `q2-montage-${b.id}`,
      steps: [
        { camera: { from: { ...cam, y: cam.y + 12 }, to: cam, dur: 1.4 }, look, run: () => {
          if (ghost && !remove) { remove = ctx.world.addObject(ghost, { x: 0, z: 0 }); ghost.position.set(0, 0, 0); ghost.scale.set(1, 0.02, 1); }
        }, tick: (_dt, k) => { if (ghost) ghost.scale.y = Math.max(0.02, k); }, say: lines[0] },
        { look, say: lines[1], run: () => { remove?.(); remove = null; ctx.world.setTargetState(b.id, 'solved'); ctx.world.sound('success'); } },
      ],
      cleanup: () => { remove?.(); remove = null; },
      onDone: () => { if (ctx.world.getTargetState(b.id) !== 'solved') ctx.world.setTargetState(b.id, 'solved'); },
    });
  }

  async function inspect(b: Bld) {
    if (!ctx.isActive()) { ctx.ui.toast('President Bednar hasn’t assigned the blueprints yet.'); return; }
    if (solved(b)) { ctx.ui.toast(`${b.label}: blueprint already solved.`); return; }
    const key = `board:${b.id}`;
    const r = await openBlueprint(ctx, b.id, { allowSkip: ctx.config.allowSkipChallenge, saved: ctx.progress.get<Placement[]>(key, []), save: ps => ctx.progress.set(key, ps) });
    if (r.outcome === 'leave') return;
    const s = stats(); s[b.id] = { hints: r.hints, resets: r.resets, invalid: r.invalid, skipped: r.outcome === 'skip' }; ctx.progress.set('stats', s);
    if (r.outcome !== 'solved') ctx.ui.toast('Blueprint skipped — no bonus for this one.');
    ctx.progress.set(`board:${b.id}`, []);
    await montage(b);                       // sets the solved state (building appears) exactly once
    updateObjective();
  }

  return {
    id: 'construction', title: 'Build the campus', owner: 'Quest 2 teammate', placeholder: false,
    register(c) {
      ctx = c;
      for (const b of blds()) {
        const grp = new THREE.Group();
        if (b.id === 'icenter') {
          // survey stakes + "future site" board (only before the real building exists)
          for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { const s = ctx.world.voxel(0.2, 1.2, 0.2, '#e07b24'); s.position.set(x, 0.6, z); grp.add(s); }
          const roll = ctx.world.voxel(1.2, 0.25, 0.25, '#3c78c8'); roll.position.set(0, 0.9, 0); grp.add(roll);
          const table = ctx.world.voxel(1.6, 0.8, 1, '#8a6d4b'); table.position.set(0, 0.4, 0); grp.add(table);
        } else {
          const easel = ctx.world.voxel(0.15, 1.6, 0.15, '#6b4f36'); easel.position.set(0, 0.8, 0); grp.add(easel);
          const sheet = ctx.world.voxel(1.4, 1, 0.08, '#3c78c8'); sheet.position.set(0, 1.4, 0.1); grp.add(sheet);
        }
        ctx.addInteractable({
          id: `site-${b.id}`, kind: 'site', at: b.anchor, radius: 3.5, visual: grp,
          objective: () => ctx.isActive() && !solved(b),
          prompt: () => solved(b) ? `${b.label} — blueprint solved` : D.sites[b.id] ?? 'Inspect blueprint',
          onInteract: () => inspect(b),
        });
      }
      ctx.on('started', updateObjective);
      if (ctx.isActive()) updateObjective();
    },
    async onAssign(start) { await ctx.cutscene({ id: 'q2-assign', steps: bednarSteps(ctx, D.assign), onDone: start }); },
    objective: () => `Solve the blueprints (${2 - (ctx ? remaining().length : 2)}/2)`,
    briefing: () => D.assign,
    reminder: () => remaining().length ? [{ speaker: D.assign[0].speaker, text: D.reminder.replace('{list}', remaining().map(b => b.label).join(', ')) }] : [{ speaker: D.assign[0].speaker, text: D.readyReminder }],
    readyToReport: () => !!ctx && remaining().length === 0,
    async onReport() { await ctx.cutscene({ id: 'q2-report', steps: bednarSteps(ctx, D.report), onDone: () => ctx.complete() }); },
    qualityScore: () => {
      const played = blds().filter(b => stats()[b.id] && !stats()[b.id].skipped);
      if (!played.length) return 0;
      return played.reduce((s, b) => { const st = stats()[b.id]; return s + Math.max(0, 1 - 0.15 * st.hints - 0.1 * st.resets - 0.02 * st.invalid); }, 0) / played.length;
    },
    skippedFraction: () => blds().filter(b => stats()[b.id]?.skipped).length / blds().length,
  };
}
