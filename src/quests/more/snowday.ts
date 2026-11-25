// ============================================================================
// STORY MISSION — Snow Day (2011).
// A blizzard buried the doorways the morning of a big devotional at the Center.
// Against the clock: shovel the drifts (press Interact a few times each) and send
// the stranded students on their way, then meet everyone at the Center.
// Report to Bednar. Fictional event; the naming stays neutral ("the Center").
// ============================================================================
import * as THREE from 'three';
import type { QuestContext, QuestModule } from '../contract';
import { bednarSteps } from '../shared/scenes';
import { BEDNAR, say } from './kit';

const DRIFTS = ['snow.drift.kimball', 'snow.drift.taylor', 'snow.drift.mckay', 'snow.drift.smith', 'snow.drift.romney'];
const STUDENTS: { id: string; anchor: string; name: string; shirt: string; line: string }[] = [
  { id: 'a', anchor: 'snow.student.hart', name: 'Becca · Student', shirt: '#8d3b2f', line: 'My boots are full of snow and I can’t find the path! Which way to the Center?' },
  { id: 'b', anchor: 'snow.student.austin', name: 'Tom · Student', shirt: '#3f6f8a', line: 'I slipped and my notes went everywhere… Is the devotional still on?' },
  { id: 'c', anchor: 'snow.student.snow', name: 'Lily · Student', shirt: '#d1a12f', line: 'I’ve been waiting for a ride that’s never coming. Can I walk with the crowd?' },
  { id: 'd', anchor: 'snow.student.taylor', name: 'Sam · Student', shirt: '#4a5a3a', line: 'Is it just me or is this the most snow ever? I don’t want to miss devotional!' },
];
const CENTER = 'snow.center';
const SCOOPS = 3;

const D = {
  assign: say(BEDNAR,
    '{player}! A blizzard came through last night, and today thousands are coming to the devotional at the Center.',
    'Drifts are blocking the doors of the Kimball, Taylor, McKay, Smith and Romney Buildings, and some students are stranded.',
    'Grab a shovel, clear the doorways, point the students to the Center — and be there yourself before it starts. Hurry!'),
  report: say(BEDNAR, 'Every seat filled, even in a blizzard. Now that’s dedication.', 'Thank you, {player}. Go warm up — you’ve earned some hot chocolate.'),
};

export function createSnowDay(): QuestModule {
  let ctx: QuestContext;
  const scoops = () => ctx.progress.get<Record<string, number>>('scoops', {});
  const sent = () => ctx.progress.get<string[]>('sent', []);
  const arrived = () => ctx.world.getTargetState('devotional') === 'yes' || ctx.status() === 'completed';
  const driftsLeft = () => DRIFTS.filter(d => (scoops()[d] ?? 0) < SCOOPS);
  const studentsLeft = () => STUDENTS.filter(s => !sent().includes(s.id));
  const limit = () => (ctx.difficulty() === 'hard' ? 300 : 420);
  const mounds = new Map<string, THREE.Object3D>(), walkers = new Map<string, { obj: THREE.Object3D; t: number }>();
  let timeLeft = 0, paused = false;

  const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
  const updateObjective = () => {
    if (!ctx.isActive()) return;
    const dl = driftsLeft().length, sl = studentsLeft().length;
    if (dl || sl) {
      ctx.ui.setObjective(`Snow day ⏱ ${fmt(timeLeft)} — doorways cleared ${DRIFTS.length - dl}/${DRIFTS.length} · students helped ${STUDENTS.length - sl}/${STUDENTS.length}`, dl ? driftsLeft()[0] : studentsLeft()[0].anchor);
      ctx.ui.setWaypoints([...driftsLeft(), ...studentsLeft().map(s => s.anchor)]);
    } else if (!arrived()) { ctx.ui.setObjective(`Snow day ⏱ ${fmt(timeLeft)} — get to the Center for the devotional!`, CENTER); ctx.ui.setWaypoints([]); }
    else { ctx.ui.setObjective('Devotional saved — report to President Bednar in the Kimball Building', 'npc.bednar.office'); ctx.ui.setWaypoints([]); }
    ctx.reportColorProgress(((DRIFTS.length - dl) + (STUDENTS.length - sl)) / (DRIFTS.length + STUDENTS.length + 1) + (arrived() ? 0.12 : 0));
  };
  const syncMounds = () => { for (const [id, m] of mounds) { const s = scoops()[id] ?? 0, k = ctx.status() === 'completed' ? 0 : 1 - s / SCOOPS; m.visible = k > 0.01; m.scale.set(1, Math.max(0.05, k), 1); } };

  function shovel(id: string) {
    if (!ctx.isActive()) return;
    const s = (scoops()[id] ?? 0) + 1;
    ctx.progress.set('scoops', { ...scoops(), [id]: s }); ctx.world.sound(s >= SCOOPS ? 'chime' : 'pop'); syncMounds();
    if (s >= SCOOPS) ctx.ui.toast(`Doorway cleared! (${DRIFTS.length - driftsLeft().length}/${DRIFTS.length})`);
    updateObjective();
  }
  async function student(s: (typeof STUDENTS)[number], obj: THREE.Object3D) {
    if (!ctx.isActive() || sent().includes(s.id)) { await ctx.ui.dialogue(say(s.name, 'Brr! What a winter.')); return; }
    await ctx.ui.dialogue([...say(s.name, s.line), ...say('You', 'Follow the cleared paths to the Center — you’ll make it!'), ...say(s.name, 'Thank you! See you there!')]);
    ctx.progress.set('sent', [...sent(), s.id]); ctx.world.sound('chime');
    walkers.set(s.id, { obj, t: 0 }); updateObjective();
  }
  async function center() {
    if (!ctx.isActive()) { ctx.ui.toast('The Center. It seats thousands!'); return; }
    if (arrived()) { ctx.ui.toast('The devotional is underway. Report to President Bednar.'); return; }
    if (driftsLeft().length || studentsLeft().length) { ctx.ui.toast('Not everyone can get here yet — clear the doorways and help the students first.'); return; }
    const p = ctx.world.position(CENTER);
    ctx.world.gatherCrowd(p.x, p.z, 20);
    await ctx.cutscene({ id: 'snowday-devotional', steps: [
      { camera: { from: { x: p.x + 16, y: p.y + 9, z: p.z + 16 }, to: { x: p.x + 10, y: p.y + 5, z: p.z + 10 }, dur: 1.5 }, look: { x: p.x, y: p.y + 2, z: p.z },
        say: { speaker: 'Narrator', text: `Snow-covered coats, red cheeks, and every seat filled — with ${fmt(timeLeft)} to spare.` }, run: () => ctx.world.sound('cheer') },
    ], onDone: () => ctx.world.setTargetState('devotional', 'yes') });
    ctx.progress.set('left', timeLeft);
    if (!arrived()) ctx.world.setTargetState('devotional', 'yes');
    updateObjective();
  }
  function restart() {
    ctx.progress.set('scoops', {}); ctx.progress.set('sent', []); ctx.progress.set('retries', ctx.progress.get('retries', 0) + 1);
    walkers.clear(); for (const s of STUDENTS) { const o = studentObjs.get(s.id); if (o) o.visible = true; }
    syncMounds(); timeLeft = limit(); updateObjective();
  }
  const studentObjs = new Map<string, THREE.Object3D>();

  return {
    id: 'snowday', title: 'Snow Day', owner: 'Extra story missions', placeholder: false,
    register(c) {
      ctx = c; mounds.clear(); walkers.clear(); studentObjs.clear(); timeLeft = limit();
      const snow = '#eef3f8';
      for (const id of DRIFTS) {
        const g = new THREE.Group();
        for (const [w, h, d, x, z] of [[3.2, 1.2, 1.6, 0, 0], [2.2, 1.7, 1.2, 0.4, -0.2], [1.4, 0.8, 1.0, -1.3, 0.5]] as const) { const m = ctx.world.voxel(w, h, d, snow); m.position.set(x, h / 2, z); g.add(m); }
        const shovelProp = ctx.world.voxel(0.08, 1.3, 0.08, '#6b4a30'); shovelProp.position.set(1.7, 0.65, 0.5); shovelProp.rotation.z = 0.3;
        const holder = new THREE.Group(); holder.add(g, shovelProp); mounds.set(id, g);
        ctx.addInteractable({ id: `drift-${id}`, kind: 'site', at: id, radius: 3.2, eras: ['byui'], visual: holder,
          enabled: () => ctx.isActive() && (scoops()[id] ?? 0) < SCOOPS,
          objective: () => ctx.isActive() && (scoops()[id] ?? 0) < SCOOPS,
          prompt: () => `Shovel the snowdrift (${scoops()[id] ?? 0}/${SCOOPS})`, onInteract: () => shovel(id) });
      }
      for (const s of STUDENTS) {
        const npc = ctx.world.npc({ label: s.name, shirt: s.shirt }); studentObjs.set(s.id, npc);
        ctx.addInteractable({ id: `student-${s.id}`, kind: 'npc', at: s.anchor, radius: 3, eras: ['byui'], visual: npc,
          enabled: () => !sent().includes(s.id) || !ctx.isActive(),
          objective: () => ctx.isActive() && !sent().includes(s.id), prompt: `Talk to ${s.name}`, onInteract: () => student(s, npc) });
        if (sent().includes(s.id) || ctx.status() === 'completed') npc.visible = false;
      }
      ctx.addInteractable({ id: 'center', kind: 'site', at: CENTER, radius: 4, eras: ['byui'],
        objective: () => ctx.isActive() && !driftsLeft().length && !studentsLeft().length && !arrived(),
        prompt: () => (ctx.isActive() && !arrived() ? 'Join the devotional at the Center' : 'The Center'), onInteract: () => center() });
      syncMounds();
      ctx.on('started', () => { timeLeft = limit(); updateObjective(); });
      ctx.on('reset', () => restart());
      if (ctx.isActive()) updateObjective();
    },
    async onAssign(start) { await ctx.cutscene({ id: 'snowday-assign', steps: bednarSteps(ctx, D.assign), onDone: start }); },
    onSuspend() { paused = true; }, onResume() { paused = false; },
    objective: () => 'Clear the snow and get everyone to the devotional',
    briefing: () => D.assign,
    reminder: () => say(BEDNAR, arrived() ? 'Everyone made it? Tell me!' : 'Hurry, {player} — the devotional starts soon! Doorways, students, then the Center.'),
    readyToReport: () => !!ctx && arrived(),
    async onReport() { await ctx.cutscene({ id: 'snowday-report', steps: bednarSteps(ctx, D.report), onDone: () => ctx.complete() }); },
    qualityScore: () => Math.min(1, ctx.progress.get('left', 0) / (limit() * 0.4)) * Math.max(0.4, 1 - 0.2 * ctx.progress.get('retries', 0)),
    skippedFraction: () => 0,
    update(dt) {
      if (!ctx) return;
      // students you helped walk off toward the Center, then disappear into the crowd
      for (const [id, w] of walkers) {
        w.t += dt; const c = ctx.world.position(CENTER), o = w.obj, dx = c.x - o.position.x, dz = c.z - o.position.z, d = Math.hypot(dx, dz);
        if (d > 1) { o.position.x += dx / d * 2.4 * dt; o.position.z += dz / d * 2.4 * dt; o.rotation.y = Math.atan2(dx, dz); o.position.y = ctx.world.terrainHeight(o.position.x, o.position.z); }
        if (w.t > 6) { o.visible = false; walkers.delete(id); }
      }
      if (!ctx.isActive() || arrived() || paused || ctx.world.era() !== 'byui') return;
      const before = Math.ceil(timeLeft); timeLeft -= dt;
      if (Math.ceil(timeLeft) !== before) updateObjective();
      if (timeLeft <= 0) {
        ctx.world.sound('error');
        void ctx.ui.dialogue(say(BEDNAR, 'The devotional had to start without everyone. Let’s try that again — quickly, {player}!'));
        restart();
      }
    },
  };
}
