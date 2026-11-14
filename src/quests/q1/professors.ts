// ============================================================================
// QUEST 1 — Hire the professors.
// Bednar assigns it in his Kimball office. Four fictional candidates wait at their
// department buildings (configurable anchors). Each challenge has Easy/Hard data,
// hints, retry, and an optional player-facing skip (recorded separately). Reporting
// back to Bednar after all four are hired completes the quest.
// Content: ./data/*.json (math, art, circuit, english, dialogue).
// ============================================================================
import * as THREE from 'three';
import dialogue from './data/dialogue.json';
import type { QuestContext, QuestModule } from '../contract';
import { runChallenge, type ChallengeBody } from '../shared/frame';
import { bednarSteps, shoulderCam } from '../shared/scenes';
import { mathChallenge } from './math';
import { artChallenge } from './art';
import { circuitChallenge } from './circuit';
import { englishChallenge } from './english';

interface Candidate { id: string; label: string; anchor: string; building: string; challenge: 'math' | 'art' | 'circuit' | 'english' }
const BODIES: Record<Candidate['challenge'], { body: ChallengeBody; title: string; intro: string; pass: string; fail: string }> = {
  math: { body: mathChallenge, title: 'Nephite Market', intro: 'Customers line up at your barley stall. Count out exact payments and change with Alma 11 coins before they lose patience. Fewest coins = ★ perfect!', pass: 'Hired: math candidate!', fail: 'Too many customers walked away' },
  art: { body: artChallenge, title: 'Paint a future temple concept', intro: 'Copy the concept onto the canvas (anywhere counts). Use mirror and the fill bucket to paint fast — the finished piece gets built in voxels!', pass: 'Hired: art candidate!', fail: 'The painting doesn’t match closely enough' },
  circuit: { body: circuitChallenge, title: 'Light the Temple', intro: 'Rotate the wire tiles until current flows. Bulbs light up live — make each one glow the way the plan asks.', pass: 'Hired: engineering candidate!', fail: 'The circuit isn’t right yet' },
  english: { body: englishChallenge, title: 'Red Pen Rush', intro: 'The press is printing the announcement — with mistakes! Stamp each wrong word as it crosses the red line, then pick the correction.', pass: 'Hired: English candidate!', fail: 'Too many wrong stamps' },
};
const D = dialogue as { assign: { speaker: string; text: string }[]; report: { speaker: string; text: string }[]; reminder: string; readyReminder: string; greetings: Record<string, string> };

export function createProfessors(): QuestModule {
  let ctx: QuestContext;
  const cands = () => ctx.config.candidates as Candidate[];
  const hired = () => ctx.progress.get<Record<string, boolean>>('hired', {});
  const skipped = () => ctx.progress.get<Record<string, boolean>>('skipped', {});
  const quality = () => ctx.progress.get<Record<string, number>>('quality', {});
  const attempts = () => ctx.progress.get<Record<string, number>>('attempts', {});
  const remaining = () => cands().filter(c => !hired()[c.id]);

  const updateObjective = () => {
    const rem = remaining();
    ctx.ui.setWaypoints(rem.map(c => c.anchor));
    if (rem.length) ctx.ui.setObjective(`Hire the professors (${4 - rem.length}/4) — next: ${rem[0].label.replace(' candidate', '')} at the ${rem[0].building}`, rem[0].anchor);
    else { ctx.ui.setWaypoints([]); ctx.ui.setObjective('All four hired — report to President Bednar in the Kimball Building', 'npc.bednar.office'); }
    ctx.reportColorProgress((4 - rem.length) / 4);
  };

  async function interview(c: Candidate) {
    if (!ctx.isActive()) { await ctx.ui.dialogue([{ speaker: c.label, text: 'I’m waiting to hear from President Bednar about the open position.' }]); return; }
    if (hired()[c.id]) { ctx.ui.toast(`${c.label} is already hired.`); return; }
    // The camera takes the candidate's point of view
    const cp = ctx.world.position(c.anchor), pp = ctx.world.playerPosition();
    const cam = shoulderCam(cp, pp);
    await ctx.cutscene({ id: `q1-greet-${c.id}`, steps: [
      { camera: { from: { ...cam.pos, y: cam.pos.y + 2 }, to: cam.pos, dur: 0.9 }, look: cam.look, say: { speaker: c.label, text: D.greetings[c.id] ?? 'Hello!' } },
    ] });
    ctx.world.focusCamera(cam.pos, cam.look);
    ctx.ui.setBanner(`Playing as: ${c.label}`);
    ctx.progress.set('attempts', { ...attempts(), [c.id]: (attempts()[c.id] ?? 0) + 1 });
    const def = BODIES[c.challenge];
    const r = await runChallenge(ctx, { title: def.title, playingAs: c.label, intro: def.intro, allowSkip: ctx.config.allowSkipChallenge, body: def.body, passText: def.pass, failText: def.fail, className: `ch-${c.challenge}` });
    ctx.ui.setBanner(null); ctx.world.releaseCamera();
    if (r.outcome === 'pass' || r.outcome === 'skip') {
      ctx.progress.set('hired', { ...hired(), [c.id]: true });
      if (r.outcome === 'skip') ctx.progress.set('skipped', { ...skipped(), [c.id]: true });
      else ctx.progress.set('quality', { ...quality(), [c.id]: Math.max(0, Math.min(1, r.quality)) });
      ctx.ui.toast(r.outcome === 'skip' ? `${c.label} hired (challenge skipped — no bonus)` : `${c.label} hired! (${4 - remaining().length}/4)`);
      updateObjective();
    }
  }

  return {
    id: 'professors', title: 'Hire the professors', owner: 'Quest 1 teammate', placeholder: false,
    register(c) {
      ctx = c;
      for (const cand of cands()) {
        const grp = new THREE.Group();
        const npc = ctx.world.npc({ label: cand.label, sub: cand.building, shirt: '#6d4b8d', pants: '#2c2540' }); grp.add(npc);
        const desk = ctx.world.voxel(1.6, 0.8, 0.7, '#7b5a3e'); desk.position.set(0, 0.4, 0.9); grp.add(desk);
        ctx.addInteractable({
          id: `candidate-${cand.id}`, kind: 'npc', at: cand.anchor, radius: 3, visual: grp, eras: ['ricks1999'],
          enabled: () => ctx.isActive(),                            // candidates only appear once the quest starts
          prompt: () => hired()[cand.id] ? `${cand.label} (hired)` : `Talk to the ${cand.label}`,
          objective: () => ctx.isActive() && !hired()[cand.id],
          onInteract: () => interview(cand),
        });
      }
      ctx.on('started', updateObjective);
      if (ctx.isActive()) updateObjective();
    },
    async onAssign(start) {
      await ctx.cutscene({ id: 'q1-assign', steps: bednarSteps(ctx, D.assign), onDone: start });
    },
    objective: () => `Hire the professors (${4 - (ctx ? remaining().length : 4)}/4)`,
    briefing: () => D.assign,
    reminder: () => remaining().length
      ? [{ speaker: D.assign[0].speaker, text: D.reminder.replace('{list}', remaining().map(c => `${c.label.replace(' candidate', '')} (${c.building})`).join(', ')) }]
      : [{ speaker: D.assign[0].speaker, text: D.readyReminder }],
    readyToReport: () => !!ctx && remaining().length === 0,
    async onReport() {
      await ctx.cutscene({ id: 'q1-report', steps: bednarSteps(ctx, D.report), onDone: () => ctx.complete() });
    },
    qualityScore: () => {
      const played = cands().filter(c => hired()[c.id] && !skipped()[c.id]);
      return played.length ? played.reduce((s, c) => s + (quality()[c.id] ?? 0), 0) / played.length : 0;
    },
    skippedFraction: () => cands().filter(c => skipped()[c.id]).length / cands().length,
  };
}
