// ============================================================================
// QUEST 1 — Hire the professors (refined, docs/quests/q1/q1-hire-professors-prompt.md).
// Fall 1999. Bednar sends the assistant to Personnel Services in the Kimball Building,
// where four fictional candidates wait. The assistant walks one candidate at a time to
// their department; at the demo door the player plays the candidate's teaching
// demonstration (a classroom-framed challenge). Art must be passed before Engineering
// (Engineering repairs the projector that broke in the art demo). Reporting back to
// Bednar after all four are hired completes the quest.
// Content: ./data/*.json (dialogue, classroom, math, art, circuit, english).
// ============================================================================
import * as THREE from 'three';
import dialogue from './data/dialogue.json';
import type { QuestContext, QuestModule } from '../contract';
import { runChallenge, type ChallengeBody } from '../shared/frame';
import { bednarSteps, shoulderCam } from '../shared/scenes';
import { withClassroom } from './classroom';
import { mathChallenge } from './math';
import { artChallenge } from './art';
import { circuitChallenge } from './circuit';
import { englishChallenge } from './english';

export interface Candidate { id: 'math' | 'engineering' | 'art' | 'english'; label: string; anchor: string; lobby: string; building: string; challenge: 'math' | 'art' | 'circuit' | 'english'; shirt: string; requires?: string }

const BODIES: Record<Candidate['challenge'], { body: ChallengeBody; title: string; intro: string; pass: string; fail: string }> = {
  math: { body: mathChallenge, title: 'Binary, the Nephite way', intro: 'The computer science students keep tripping on binary. Use the gold coins of Alma 11 to explain it so it sticks — answer each student’s question.', pass: 'Hired: math candidate!', fail: 'The class is still lost' },
  art: { body: artChallenge, title: 'Drawing what you see', intro: 'Teach the grid method: copy the projected reference onto the board, square by square. Anywhere on the board counts. Mirror and fill save time.', pass: 'Hired: art candidate!', fail: 'The drawing doesn’t match closely enough' },
  circuit: { body: circuitChallenge, title: 'Fix it live', intro: 'Physical Plant just wheeled in the Spori’s overhead projector — it keeps blowing fuses. Rotate the wire tiles to repair each circuit in front of the class.', pass: 'Hired: engineering candidate!', fail: 'The projector still doesn’t work' },
  english: { body: englishChallenge, title: 'Editing for accuracy', intro: 'Brother Price’s summary of the Kimball Building dedication is on the projector — with mistakes. Stamp each wrong word as it crosses the lamp line, then pick the correction.', pass: 'Hired: English candidate!', fail: 'Too many wrong stamps' },
};
const D = dialogue as {
  assign: { speaker: string; text: string }[]; report: { speaker: string; text: string }[];
  reminder: string; readyReminder: string; greetings: Record<string, string>; waiting: Record<string, string>;
  busy: string; arrive: string; notYet: string; boardTitle: string;
};

export function createProfessors(): QuestModule {
  let ctx: QuestContext;
  const cands = () => ctx.config.candidates as Candidate[];
  const hired = () => ctx.progress.get<Record<string, boolean>>('hired', {});
  const skipped = () => ctx.progress.get<Record<string, boolean>>('skipped', {});
  const quality = () => ctx.progress.get<Record<string, number>>('quality', {});
  const attempts = () => ctx.progress.get<Record<string, number>>('attempts', {});
  const escorting = () => ctx.progress.get<string | null>('escort', null);
  const remaining = () => cands().filter(c => !hired()[c.id]);
  const byId = (id: string) => cands().find(c => c.id === id)!;
  const locked = (c: Candidate) => !!c.requires && !hired()[c.requires];
  const short = (c: Candidate) => c.label.replace(' candidate', '');

  // ---------- hiring board (floating labels in the Kimball hall) ----------
  let removeBoard: (() => void) | null = null;
  const boardText = () => cands().map(c => `${short(c)}: ${hired()[c.id] ? 'HIRED' : escorting() === c.id ? 'in demo' : locked(c) ? 'waiting on art demo' : 'waiting'}`).join('  ·  ');
  const refreshBoard = () => {
    removeBoard?.(); removeBoard = null;
    if (!ctx.isActive() || ctx.world.era() !== 'ricks1999') return;
    const lbl = ctx.world.label(D.boardTitle, boardText());
    removeBoard = ctx.world.addObject(lbl, 'q1.lobby.board');
  };

  // ---------- escort (follower owned by Q1, moved in update) ----------
  let follower: THREE.Object3D | null = null, followerSpace = '', removeFollower: (() => void) | null = null;
  const spawnFollower = () => {
    despawnFollower();
    const id = escorting(); if (!id || !ctx.isActive()) return;
    const c = byId(id), p = ctx.world.playerPosition();
    follower = ctx.world.npc({ label: c.label, sub: `→ ${c.building}`, shirt: c.shirt, pants: '#2c2540' });
    removeFollower = ctx.world.addObject(follower, { x: 0, z: 0 });
    follower.position.set(p.x + 1.2, p.y, p.z + 1.2); followerSpace = p.space;
  };
  const despawnFollower = () => { removeFollower?.(); removeFollower = null; follower = null; };

  const updateObjective = () => {
    const rem = remaining(), n = 4 - rem.length, esc = escorting();
    refreshBoard();
    ctx.reportColorProgress(n / 4);
    if (!rem.length) { ctx.ui.setWaypoints([]); ctx.ui.setObjective('All four hired — report to President Bednar in the Kimball Building', 'npc.bednar.office'); return; }
    if (esc) {
      const c = byId(esc);
      ctx.ui.setWaypoints([c.anchor]);
      ctx.ui.setObjective(`Hire the professors (${n}/4) — walk the ${c.label} to the ${c.building}`, c.anchor);
      return;
    }
    const next = rem.find(c => !locked(c)) ?? rem[0];
    ctx.ui.setWaypoints(rem.filter(c => !locked(c)).map(c => c.lobby));
    ctx.ui.setObjective(`Hire the professors (${n}/4) — pick up a candidate in Personnel Services (Kimball Building)`, next.lobby);
  };

  async function lobbyTalk(c: Candidate) {
    if (hired()[c.id]) { ctx.ui.toast(`${c.label} is already hired.`); return; }
    const esc = escorting();
    if (esc === c.id) { await ctx.ui.dialogue([{ speaker: c.label, text: D.arrive.replace('{building}', c.building) }]); return; }
    if (esc) { await ctx.ui.dialogue([{ speaker: c.label, text: D.busy.replace('{other}', byId(esc).label) }]); return; }
    if (locked(c)) { await ctx.ui.dialogue([{ speaker: c.label, text: D.waiting[c.id] ?? D.notYet }]); return; }
    const cp = ctx.world.position(c.lobby), pp = ctx.world.playerPosition();
    const cam = shoulderCam(cp, pp);
    await ctx.cutscene({ id: `q1-greet-${c.id}`, steps: [
      { camera: { from: { ...cam.pos, y: cam.pos.y + 1.5 }, to: cam.pos, dur: 0.9 }, look: cam.look, say: { speaker: c.label, text: D.greetings[c.id] ?? 'Hello!' } },
    ], onDone: () => { ctx.progress.set('escort', c.id); } });
    spawnFollower();
    ctx.ui.toast(`The ${c.label} is following you to the ${c.building}.`);
    updateObjective();
  }

  async function demo(c: Candidate) {
    if (hired()[c.id]) { ctx.ui.toast(`${c.label} is already hired.`); return; }
    if (escorting() !== c.id) {
      ctx.ui.toast(locked(c) ? (D.waiting[c.id] ?? D.notYet) : `Pick up the ${c.label} in Personnel Services (Kimball Building) first.`);
      return;
    }
    const cp = ctx.world.position(c.anchor), pp = ctx.world.playerPosition();
    const cam = shoulderCam(pp, cp);
    await ctx.cutscene({ id: `q1-demo-${c.id}`, steps: [
      { camera: { from: { ...cam.pos, y: cam.pos.y + 2 }, to: cam.pos, dur: 1.0 }, look: cam.look, say: { speaker: 'Teaching demonstration', text: `You are now the ${c.label} — ${c.building}.` } },
    ] });
    ctx.world.focusCamera(cam.pos, cam.look);
    ctx.ui.setBanner(`Playing as: ${c.label}`);
    ctx.progress.set('attempts', { ...attempts(), [c.id]: (attempts()[c.id] ?? 0) + 1 });
    const def = BODIES[c.challenge];
    const r = await runChallenge(ctx, { title: def.title, playingAs: c.label, intro: def.intro, allowSkip: ctx.config.allowSkipChallenge,
      body: withClassroom(ctx, c.id, def.body), passText: def.pass, failText: def.fail, className: `ch-${c.challenge} q1-demo` });
    ctx.ui.setBanner(null); ctx.world.releaseCamera();
    if (r.outcome === 'pass' || r.outcome === 'skip') {
      ctx.progress.set('hired', { ...hired(), [c.id]: true });
      if (c.id === 'art') ctx.progress.set('projectorBroken', true);
      if (r.outcome === 'skip') ctx.progress.set('skipped', { ...skipped(), [c.id]: true });
      else ctx.progress.set('quality', { ...quality(), [c.id]: Math.max(0, Math.min(1, r.quality)) });
      ctx.progress.set('escort', null); despawnFollower();
      ctx.ui.toast(r.outcome === 'skip' ? `${c.label} hired (demo skipped — no bonus)` : `${c.label} hired! (${4 - remaining().length}/4) Back to you.`);
      if (c.id === 'art' && !hired().engineering) ctx.ui.toast('The art studio’s projector just burned out — the engineering candidate can demo now.');
      updateObjective();
    }
  }

  return {
    id: 'professors', title: 'Hire the professors', owner: 'Quest 1 teammate', placeholder: false,
    register(c) {
      ctx = c;
      for (const cand of cands()) {
        // Waiting in the Personnel Services lobby (Kimball hall)
        ctx.addInteractable({
          id: `lobby-${cand.id}`, kind: 'npc', at: cand.lobby, radius: 2.2, eras: ['ricks1999'],
          visual: ctx.world.npc({ label: cand.label, sub: 'Personnel Services', shirt: cand.shirt, pants: '#2c2540' }),
          enabled: () => ctx.isActive() && !hired()[cand.id] && escorting() !== cand.id,
          prompt: () => locked(cand) ? `${cand.label} (waiting on the art demo)` : `Talk to the ${cand.label}`,
          objective: () => ctx.isActive() && !escorting() && !hired()[cand.id] && !locked(cand),
          onInteract: () => lobbyTalk(cand),
        });
        // Demo door beside the department entrance
        const door = new THREE.Group();
        const sign = ctx.world.voxel(1.2, 0.8, 0.12, '#2d3a46'); sign.position.set(0, 1.5, 0); door.add(sign);
        const post = ctx.world.voxel(0.12, 1.1, 0.12, '#5b4636'); post.position.set(0, 0.55, 0); door.add(post);
        const lbl = ctx.world.label('Teaching demonstration', cand.building); lbl.position.y = 2.4; door.add(lbl);
        ctx.addInteractable({
          id: `demo-${cand.id}`, kind: 'generic', at: cand.anchor, radius: 3, eras: ['ricks1999'], visual: door,
          enabled: () => ctx.isActive() && escorting() === cand.id,
          prompt: () => `Start the ${short(cand).toLowerCase()} teaching demonstration`,
          objective: () => ctx.isActive() && escorting() === cand.id,
          onInteract: () => demo(cand),
        });
      }
      ctx.on('started', () => { updateObjective(); spawnFollower(); });
      ctx.on('completed', () => { despawnFollower(); removeBoard?.(); removeBoard = null; });
      ctx.on('reset', () => { despawnFollower(); removeBoard?.(); removeBoard = null; });
      ctx.on('eraChanged', () => refreshBoard());
      if (ctx.isActive()) { updateObjective(); spawnFollower(); }
    },
    async onAssign(start) {
      if (!ctx) { start(); return; }
      await ctx.cutscene({ id: 'q1-assign', steps: bednarSteps(ctx, D.assign), onDone: start });
    },
    update(dt) {
      if (!follower) return;
      const p = ctx.world.playerPosition();
      const dx = p.x - follower.position.x, dz = p.z - follower.position.z, d = Math.hypot(dx, dz);
      if (p.space !== followerSpace || d > 25) { follower.position.set(p.x - 1.4, p.y, p.z + 1.4); followerSpace = p.space; return; }
      if (d > 1.8) {
        const k = Math.min(1, (d - 1.6) * dt * 3.5);
        follower.position.x += dx * k; follower.position.z += dz * k;
      }
      follower.position.y += (p.y - follower.position.y) * Math.min(1, dt * 8);
      follower.rotation.y = Math.atan2(dx, dz);
    },
    objective: () => `Hire the professors (${4 - (ctx ? remaining().length : 4)}/4)`,
    briefing: () => D.assign,
    reminder: () => remaining().length
      ? [{ speaker: D.assign[0].speaker, text: D.reminder.replace('{list}', remaining().map(c => `${short(c)} (${c.building})`).join(', ')) }]
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
    dispose() { despawnFollower(); removeBoard?.(); },
  };
}
