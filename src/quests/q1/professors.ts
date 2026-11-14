// ============================================================================
// QUEST 1 — Hire the professors (refined, docs/quests/q1/q1-hire-professors-prompt.md).
// Fall 1999. Bednar sends the assistant to Personnel Services in the Kimball Building,
// where four fictional candidates wait. The assistant walks one candidate at a time to
// their department; at the demo door the player plays the candidate's teaching
// demonstration (a classroom-framed challenge), then comes back for the next one. Art
// must be passed before Engineering (Engineering repairs the projector that dies in the
// art demo; nobody foreshadows it). Reporting back to
// Bednar after all four are hired completes the quest.
// Content: ./data/*.json (dialogue, classroom, math, art, circuit, english).
// ============================================================================
import * as THREE from 'three';
import dialogue from './data/dialogue.json';
import type { QuestContext, QuestModule } from '../contract';
import { runChallenge, type ChallengeBody } from '../shared/frame';
import { bednarSteps, shoulderCam } from '../shared/scenes';
import { CLASSROOM, withClassroom } from './classroom';
import { Room3D, type RoomId } from './room3d';
import { drawCoinPoster, mathChallenge } from './math';
import { artChallenge, drawProjectedRef } from './art';
import { circuitChallenge } from './circuit';
import { drawFactClipping, englishChallenge } from './english';

export interface Candidate { id: 'math' | 'engineering' | 'art' | 'english'; name?: string; label: string; anchor: string; lobby: string; building: string; challenge: 'math' | 'art' | 'circuit' | 'english'; shirt: string; requires?: string; wait?: [number, number] }

const BODIES: Record<Candidate['challenge'], { body: ChallengeBody; title: string; intro: string; pass: string; fail: string }> = {
  math: { body: mathChallenge, title: 'Binary, the Nephite way', intro: 'The computer science students keep tripping on binary. Use the gold coins of Alma 11 to explain it so it sticks — answer each student’s question.', pass: 'Hired: math candidate!', fail: 'The class is still lost' },
  art: { body: artChallenge, title: 'Drawing what you see', intro: 'Teach the grid method: copy the projected reference onto the board, square by square. Anywhere on the board counts. Watch out — that old projector won’t last the whole demo.', pass: 'Hired: art candidate!', fail: 'The drawing doesn’t match closely enough' },
  circuit: { body: circuitChallenge, title: 'Fix it live', intro: 'A student just carried in the art studio’s overhead projector; it shorted out during the art demo. Rotate the wire tiles to repair its circuits in front of the class.', pass: 'Hired: engineering candidate!', fail: 'The projector still doesn’t work' },
  english: { body: englishChallenge, title: 'Editing for accuracy', intro: 'Brother Price’s summary of the Kimball Building dedication is projected on the whiteboard — with mistakes. Move along the page, mark each wrong word and write the correction in red.', pass: 'Hired: English candidate!', fail: 'Too many wrong marks' },
};
const D = dialogue as {
  assign: { speaker: string; text: string }[]; report: { speaker: string; text: string }[];
  reminder: string; readyReminder: string; greetings: Record<string, string>; waiting: Record<string, string>;
  busy: string; arrive: string; notYet: string; boardTitle: string;
  walk: Record<string, string[]>; othersWait: string; backFor: string; notHere: string;
};

export function createProfessors(): QuestModule {
  let ctx: QuestContext;
  const cands = () => ctx.config.candidates as Candidate[];
  const hired = () => ctx.progress.get<Record<string, boolean>>('hired', {});
  const skipped = () => ctx.progress.get<Record<string, boolean>>('skipped', {});
  const quality = () => ctx.progress.get<Record<string, number>>('quality', {});
  const attempts = () => ctx.progress.get<Record<string, number>>('attempts', {});
  const escorting = () => ctx.progress.get<string | null>('escort', null);
  const firstPicked = () => ctx.progress.get<boolean>('firstPicked', false);
  const remaining = () => cands().filter(c => !hired()[c.id]);
  const byId = (id: string) => cands().find(c => c.id === id)!;
  const locked = (c: Candidate) => !!c.requires && !hired()[c.requires];
  const short = (c: Candidate) => c.label.replace(' candidate', '');
  /** "Sister Ames (math candidate)" — fictional names; falls back to the role label. */
  const who = (c: Candidate) => c.name ? `${c.name} (${short(c).toLowerCase()} candidate)` : c.label;
  const nameOf = (c: Candidate) => c.name ?? c.label;

  // ---------- hiring board (floating labels in the Kimball hall) ----------
  let removeBoard: (() => void) | null = null;
  const boardText = () => cands().map(c => `${short(c)}: ${hired()[c.id] ? 'HIRED' : escorting() === c.id ? 'in demo' : locked(c) ? 'after art' : 'waiting'}`).join('  ·  ');
  const refreshBoard = () => {
    removeBoard?.(); removeBoard = null;
    if (!ctx.isActive() || ctx.world.era() !== 'ricks1999') return;
    const lbl = ctx.world.label(D.boardTitle, boardText());
    removeBoard = ctx.world.addObject(lbl, 'q1.lobby.board');
  };

  // ---------- 3D classrooms ----------
  const rooms = new Map<string, Room3D>();
  let demoRoom: Room3D | null = null;
  const buildRooms = () => {
    if (rooms.size || ctx.world.era() !== 'ricks1999') return;
    for (const c of cands()) { try { rooms.set(c.id, new Room3D(ctx, c.id as RoomId)); } catch (e) { console.warn('Q1 room', c.id, e); } }
    // walls are dressed before any demo: coin poster, fact clipping, projected reference
    const wall = (id: string) => rooms.get(id)?.get('poster');
    const m = wall('math'), e = wall('english'), a = wall('art');
    if (m) drawCoinPoster(m); if (e) drawFactClipping(e); if (a) drawProjectedRef(a, !hired().art);
    rooms.get('art')?.signal('beam', !hired().art);
  };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__q1rooms = rooms;   // test hook (dev builds only)
  const destroyRooms = () => { rooms.forEach(r => r.destroy()); rooms.clear(); };
  const roomAnchor = (c: Candidate) => `q1.room.${c.id}`;

  // ---------- escort (follower owned by Q1, moved in update) ----------
  let follower: THREE.Object3D | null = null, followerSpace = '', removeFollower: (() => void) | null = null;
  const spawnFollower = () => {
    despawnFollower();
    const id = escorting(); if (!id || !ctx.isActive()) return;
    const c = byId(id), p = ctx.world.playerPosition();
    follower = ctx.world.npc({ label: nameOf(c), sub: `${c.label} → ${c.building}`, shirt: c.shirt, pants: '#2c2540' });
    removeFollower = ctx.world.addObject(follower, { x: 0, z: 0 });
    follower.position.set(p.x + 1.4, p.y, p.z); followerSpace = p.space; lastP = { x: p.x, z: p.z };
  };
  const despawnFollower = () => { removeFollower?.(); removeFollower = null; follower = null; };

  const updateObjective = () => {
    const rem = remaining(), n = 4 - rem.length, esc = escorting();
    refreshBoard();
    ctx.reportColorProgress(n / 4);
    if (!rem.length) { ctx.ui.setWaypoints([]); ctx.ui.setObjective('All four hired — report to President Bednar in the Kimball Building', 'npc.bednar.office'); return; }
    if (esc) {
      const c = byId(esc);
      ctx.ui.setWaypoints([roomAnchor(c)]);
      ctx.ui.setObjective(`Hire the professors (${n}/4) — walk ${who(c)} to the ${c.building} classroom`, { x: 0, z: -2.6, space: `q1-room-${c.id}` });
      return;
    }
    const next = rem.find(c => !locked(c)) ?? rem[0];
    ctx.ui.setWaypoints(rem.filter(c => !locked(c)).map(c => c.lobby));
    ctx.ui.setObjective(`Hire the professors (${n}/4) — ${n ? 'back to' : 'pick up a candidate in'} Personnel Services (Kimball Building)${n ? ' for the next candidate' : ''}`, next.lobby);
  };

  // ---------- walk-and-talk ----------
  let talkTimers: number[] = [];
  const startTalk = (c: Candidate) => { talkTimers.forEach(clearTimeout); talkTimers = (D.walk[c.id] ?? []).map((t, i) => window.setTimeout(() => { if (escorting() === c.id && !demoRoom && follower) ctx.ui.toast(`${nameOf(c)}: “${t}”`); }, 4000 + i * 9000)); };

  async function lobbyTalk(c: Candidate) {
    if (hired()[c.id]) { ctx.ui.toast(`${c.label} is already hired.`); return; }
    const esc = escorting();
    if (esc === c.id) { await ctx.ui.dialogue([{ speaker: who(c), text: D.arrive.replace('{building}', c.building) }]); return; }
    if (esc) { await ctx.ui.dialogue([{ speaker: who(c), text: D.busy.replace('{other}', byId(esc).label) }]); return; }
    if (locked(c)) { await ctx.ui.dialogue([{ speaker: who(c), text: D.waiting[c.id] ?? D.notYet }]); return; }
    const pp = ctx.world.playerPosition();
    const cam = shoulderCam(ctx.world.position(c.lobby), pp);
    const lines = [D.greetings[c.id] ?? 'Hello!'];
    await ctx.cutscene({ id: `q1-greet-${c.id}`, steps: lines.map((t, i) => ({
      ...(i === 0 ? { camera: { from: { ...cam.pos, y: cam.pos.y + 1.5 }, to: cam.pos, dur: 0.9 } } : {}), look: cam.look, say: { speaker: who(c), text: t } })),
      onDone: () => { ctx.progress.set('escort', c.id); } });
    const first = !firstPicked();
    ctx.progress.set('firstPicked', true);
    spawnFollower(); startTalk(c);
    ctx.ui.toast(`${nameOf(c)} (${short(c).toLowerCase()} candidate) is following you to the ${c.building}.`);
    if (first) window.setTimeout(() => ctx.ui.toast(`${nameOf(c)}: “${D.othersWait}”`), 2500);
    updateObjective();
  }

  let demoBusy = false, lastSpace = '', lastP = { x: 0, z: 0 }, dirX = 0, dirZ = 1;
  /** The classroom walk-in: students turn to the door, the candidate walks to the front,
   *  the chair sets the problem, and the title is chalked on the board. Short on repeat visits. */
  const walkIn = async (c: Candidate, room: Room3D, full: boolean) => {
    const I = CLASSROOM.rooms[c.id].intro, spot = room.teachSpot(), ask = I.chair.replace('{name}', nameOf(c));
    const door = room.w(0, 0, 5.2), doorEye = room.w(4.6, 3.2, 6.4), classLook = room.w(-1, 1.2, -1.5);
    // aisle route along the west wall so the candidate doesn't walk through desks
    const path = [door, room.w(-6.6, 0, 4.6), room.w(-6.6, 0, spot.z - room.w(0, 0, 0).z + 0.4), { x: spot.x, y: spot.y, z: spot.z }];
    const along = (k: number) => {
      const seg = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z)), total = seg.reduce((a, b) => a + b, 0);
      let d = k * total, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const a = path[i], b = path[i + 1], t = seg[i] ? Math.min(1, d / seg[i]) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ry: Math.atan2(b.x - a.x, b.z - a.z) };
    };
    const boardLook = c.id === 'engineering' ? room.w(0, 1.6, -5.4) : room.w(0, 1.6, -6.8);
    const boardEye = c.id === 'engineering' ? room.w(1.4, 3.1, 0.6) : room.w(0, 1.8, 0.9);
    const chairNpc = room.who('chair')[0], chairPos = chairNpc.position;
    const steps: Parameters<QuestContext['cutscene']>[0]['steps'] = [];
    if (full) {
      steps.push({ camera: { from: doorEye, to: room.w(3.6, 2.8, 5.0), dur: 1.4 }, look: classLook, dur: 2.2,
        say: { speaker: CLASSROOM.rooms[c.id].students[1]?.name ?? 'A student', text: I.whisper },
        run: () => { room.faceDoor(true); room.hop([room.who(1)[0]]); if (follower) { follower.position.set(door.x, door.y, door.z); follower.rotation.y = Math.PI; } } });
      steps.push({ camera: { from: room.w(-1.6, 2.7, -6.0), to: room.w(-2.6, 2.4, -6.2), dur: 3.0 }, look: room.w(-6.4, 1.1, 1.5), dur: 3.0,
        run: () => room.faceDoor(false),
        tick: (_dt, k) => { if (follower) { const q = along(k); follower.position.set(q.x, spot.y, q.z); follower.rotation.y = q.ry; } } });
      steps.push({ camera: { from: room.w(-2.6, 2.4, -6.2), to: room.w(2.2, 2.6, 0.8), dur: 1.2 }, look: { x: chairPos.x, y: chairPos.y + 1.8, z: chairPos.z },
        run: () => { if (follower) { follower.position.set(spot.x, spot.y, spot.z); follower.rotation.y = 0; } room.hop([chairNpc]); },
        say: { speaker: CLASSROOM.rooms[c.id].chair, text: ask } });
    }
    // the candidate answers the chair and frames the lesson (also on retries, so the demo never starts cold)
    // (art: shoot along the board so the projector beam isn't between camera and candidate)
    const off = c.id === 'art' ? { x: 3.0, z: -0.5 } : { x: 2.4, z: 3.2 };
    const faceCam = { x: spot.x + off.x, y: spot.y + 2.0, z: spot.z + off.z }, faceRy = Math.atan2(off.x, off.z) * 0.8;
    steps.push({ camera: { from: full ? room.w(2.2, 2.6, 0.8) : room.w(0.8, 2.4, 3), to: faceCam, dur: 1.0 }, look: { x: spot.x, y: spot.y + 1.6, z: spot.z },
      run: () => { if (follower) { follower.position.set(spot.x, spot.y, spot.z); follower.rotation.y = faceRy; } },
      say: { speaker: who(c), text: I.frame } });
    steps.push({ camera: { from: faceCam, to: boardEye, dur: 1.4 }, look: boardLook, dur: 2.0,
      run: () => { if (follower) { follower.position.set(spot.x, spot.y, spot.z); follower.rotation.y = 0; } },
      tick: (_dt, k) => room.writeTitle(I.title, k * 1.25) });
    room.showCeiling(true);
    await ctx.cutscene({ id: `q1-walkin-${c.id}${full ? '' : '-short'}`, steps, cleanup: () => room.faceDoor(false) });
  };
  const outro = async (c: Candidate, room: Room3D) => {
    const I = CLASSROOM.rooms[c.id].intro, spot = room.teachSpot();
    room.standHired(nameOf(c), c.shirt);
    await ctx.cutscene({ id: `q1-outro-${c.id}`, steps: [
      { camera: { from: room.w(0, 2.6, -5.5), to: room.w(1.6, 2.4, -4.6), dur: 1.2 }, look: room.w(-2, 1.4, 2), run: () => { room.hop(room.who('all')); ctx.world.sound('cheer'); },
        say: { speaker: CLASSROOM.rooms[c.id].chair, text: I.verdict } },
      { look: { x: spot.x, y: spot.y + 1.7, z: spot.z }, camera: { from: room.w(1.6, 2.4, -4.6), to: { x: spot.x + 2.6, y: spot.y + 2.0, z: spot.z + 3.0 }, dur: 1.0 }, say: { speaker: who(c), text: I.thanks } },
      // art: make it obvious the projector died and where it's going (the engineering demo picks it up)
      ...(I.after ?? []).map((l, i) => ({
        ...(i === 0 ? { camera: { from: { x: spot.x + 2.6, y: spot.y + 2.0, z: spot.z + 3.0 }, to: room.w(0.4, 2.9, 0.4), dur: 1.2 } } : {}),
        look: room.w(-3.6, 0.9, -4.4),
        run: i === 0 ? () => { room.signal('beam', false); const a = room.get('poster'); if (a) drawProjectedRef(a, false); } : undefined,
        say: { speaker: l.who === 'chair' ? CLASSROOM.rooms[c.id].chair : who(c), text: l.text } })),
    ] });
  };

  /** Walking into a classroom without its candidate: the chair says where they are. */
  const emptyRoom = async (id: string, room: Room3D) => {
    const chair = room.who('chair')[0].position;
    await ctx.cutscene({ id: `q1-empty-${id}`, steps: [{ camera: { from: room.w(2.6, 2.8, 2.0), to: room.w(2.0, 2.4, 0.6), dur: 1.0 }, look: { x: chair.x, y: chair.y + 1.6, z: chair.z },
      run: () => room.hop([room.who('chair')[0]]), say: { speaker: CLASSROOM.rooms[id].chair, text: D.notHere } }] });
  };

  async function demo(c: Candidate, opts: { auto?: boolean } = {}) {
    if (demoBusy) return;
    if (hired()[c.id]) { ctx.ui.toast(`${c.label} is already hired.`); return; }
    if (escorting() !== c.id) {
      ctx.ui.toast(locked(c) ? (D.waiting[c.id] ?? D.notYet) : `Pick up the ${c.label} in Personnel Services (Kimball Building) first.`);
      return;
    }
    demoBusy = true;
    const room = rooms.get(c.id) ?? null;
    demoRoom = room;
    if (room) await walkIn(c, room, (attempts()[c.id] ?? 0) === 0 && opts.auto !== false);
    else {
      const pp = ctx.world.playerPosition(), cam = shoulderCam(pp, { x: pp.x + 1, y: pp.y, z: pp.z + 8 });
      await ctx.cutscene({ id: `q1-demo-${c.id}`, steps: [{ camera: { from: { ...cam.pos, y: cam.pos.y + 1.5 }, to: cam.pos, dur: 1.0 }, look: cam.look, say: { speaker: 'Teaching demonstration', text: `You are now the ${c.label} — ${c.building}.` } }] });
    }
    room?.start(c.id === 'engineering' ? 'bench' : 'board');
    ctx.ui.setBanner(`You are now ${nameOf(c)}, the ${short(c).toLowerCase()} candidate`);
    window.setTimeout(() => { if (demoRoom === room) ctx.ui.setBanner(`Playing as: ${who(c)}`); }, 2600);
    ctx.progress.set('attempts', { ...attempts(), [c.id]: (attempts()[c.id] ?? 0) + 1 });
    const def = BODIES[c.challenge];
    const r = await runChallenge(ctx, { title: def.title, playingAs: who(c), intro: def.intro, allowSkip: ctx.config.allowSkipChallenge,
      body: withClassroom(ctx, c.id, def.body, room, who(c)), passText: def.pass, failText: def.fail,
      className: `ch-${c.challenge} q1-demo ${room ? 'q1-inroom' : ''} ${room && (c.id === 'art' || c.id === 'engineering') ? 'q1-pad' : ''}` });
    room?.stop();
    ctx.ui.setBanner(null); ctx.world.releaseCamera();
    if ((r.outcome === 'pass' || r.outcome === 'skip') && room) { despawnFollower(); room.showCeiling(true); await outro(c, room); }
    room?.showCeiling(false);
    demoRoom = null; demoBusy = false;
    if (r.outcome === 'pass' || r.outcome === 'skip') {
      ctx.progress.set('hired', { ...hired(), [c.id]: true });
      if (c.id === 'art') ctx.progress.set('projectorBroken', true);
      if (r.outcome === 'skip') ctx.progress.set('skipped', { ...skipped(), [c.id]: true });
      else ctx.progress.set('quality', { ...quality(), [c.id]: Math.max(0, Math.min(1, r.quality)) });
      ctx.progress.set('escort', null); despawnFollower();
      const left = remaining().length;
      ctx.ui.toast(`${nameOf(c)} hired as ${short(c).toLowerCase()} professor${r.outcome === 'skip' ? ' (demo skipped, no bonus)' : '!'} (${4 - left}/4). ${left ? D.backFor : ''}`);
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
          visual: ctx.world.npc({ label: nameOf(cand), sub: `${cand.label} · Personnel Services`, shirt: cand.shirt, pants: '#2c2540' }),
          enabled: () => ctx.isActive() && !hired()[cand.id] && escorting() !== cand.id,
          prompt: () => locked(cand) ? `${cand.label} (after the art demo)` : `Talk to the ${cand.label}`,
          objective: () => ctx.isActive() && !escorting() && !hired()[cand.id] && !locked(cand),
          onInteract: () => lobbyTalk(cand),
        });
        // Teaching spot inside the department classroom (the building's demo door leads in)
        ctx.addInteractable({
          id: `demo-${cand.id}`, kind: 'generic', at: { x: 0, z: -2.6, space: `q1-room-${cand.id}` }, radius: 2.6, eras: ['ricks1999'],
          enabled: () => ctx.isActive() && escorting() === cand.id,
          prompt: () => `Start the ${short(cand).toLowerCase()} teaching demonstration`,
          objective: () => ctx.isActive() && escorting() === cand.id,
          onInteract: () => demo(cand),
        });
      }
      buildRooms();
      ctx.on('started', () => { buildRooms(); updateObjective(); spawnFollower(); });
      ctx.on('completed', () => { despawnFollower(); removeBoard?.(); removeBoard = null; });
      ctx.on('reset', () => { despawnFollower(); removeBoard?.(); removeBoard = null; });
      ctx.on('eraChanged', () => { refreshBoard(); if (ctx.world.era() !== 'ricks1999') destroyRooms(); else buildRooms(); });
      if (ctx.isActive()) { updateObjective(); spawnFollower(); }
    },
    async onAssign(start) {
      if (!ctx) { start(); return; }
      await ctx.cutscene({ id: 'q1-assign', steps: bednarSteps(ctx, D.assign), onDone: start });
    },
    update(dt) {
      rooms.forEach(r => r.update(dt));
      const here = ctx.isActive() ? ctx.world.playerPosition().space : '';
      if (here !== lastSpace) {
        const was = lastSpace; lastSpace = here;
        const esc = escorting();
        if (esc && here === `q1-room-${esc}` && was !== here && !hired()[esc] && !demoBusy) window.setTimeout(() => demo(byId(esc), { auto: true }), 700);
        else if (here.startsWith('q1-room-') && was !== here && !demoBusy) {
          const id = here.slice(8), room = rooms.get(id);
          if (room && cands().some(c => c.id === id) && !hired()[id] && esc !== id) window.setTimeout(() => emptyRoom(id, room), 700);
        }
      }
      if (!follower || demoRoom) return;
      const p = ctx.world.playerPosition();
      if (p.space !== followerSpace || Math.hypot(p.x - follower.position.x, p.z - follower.position.z) > 25) { follower.position.set(p.x + 1.4, p.y, p.z); followerSpace = p.space; lastP = { x: p.x, z: p.z }; return; }
      // walk beside the player (not between the player and the camera): offset to the side of travel
      const mx = p.x - lastP.x, mz = p.z - lastP.z, ml = Math.hypot(mx, mz);
      if (ml > 0.02) { dirX = mx / ml; dirZ = mz / ml; lastP = { x: p.x, z: p.z }; }
      const tx = p.x + dirZ * 1.5 + dirX * 0.3, tz = p.z - dirX * 1.5 + dirZ * 0.3;
      const dx = tx - follower.position.x, dz = tz - follower.position.z, d = Math.hypot(dx, dz);
      if (d > 0.15) { const k = Math.min(1, dt * 5); follower.position.x += dx * k; follower.position.z += dz * k; follower.rotation.y = Math.atan2(dirX, dirZ); }
      follower.position.y += (p.y - follower.position.y) * Math.min(1, dt * 8);
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
    dispose() { despawnFollower(); removeBoard?.(); destroyRooms(); },
  };
}
