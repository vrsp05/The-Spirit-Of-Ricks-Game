// ============================================================================
// STORY MISSION — Y2K Rescue (Fall 1999).
// The college's computers store years with two digits. Before midnight on Dec 31,
// collect the backup disks from four departments, bring them to the computer lab
// in the Austin Building, and fix the dates (19xx or 20xx? — or even 18xx!).
// Report to Bednar to finish. Fictional mission; Y2K itself was real.
// ============================================================================
import * as THREE from 'three';
import type { QuestContext, QuestModule } from '../contract';
import { bednarSteps } from '../shared/scenes';
import { BEDNAR, bob, prop, say } from './kit';

interface Dept { id: string; anchor: string; label: string; color: string }
const DEPTS: Dept[] = [
  { id: 'library', anchor: 'y2k.library', label: 'McKay Library', color: '#3d6fa8' },
  { id: 'english', anchor: 'y2k.smith', label: 'Smith Building', color: '#c0392b' },
  { id: 'math', anchor: 'y2k.romney', label: 'Romney Building', color: '#2f8f5a' },
  { id: 'athletics', anchor: 'y2k.hart', label: 'Hart Building', color: '#d1a12f' },
];
const LAB = 'y2k.lab';
/** Records with two-digit years; the context says which century is right (in fall 1999). */
export const Y2K_RECORDS: { text: string; yy: string; answer: 18 | 19 | 20 }[] = [
  { text: 'Student record — date of birth: 03/14/', yy: '81', answer: 19 },
  { text: 'Freshman — expected graduation: 04/', yy: '02', answer: 20 },
  { text: 'Library book — due back: 01/12/', yy: '00', answer: 20 },
  { text: 'Snow Building — first opened: 09/', yy: '79', answer: 19 },
  { text: 'Missionary — expected return: 06/', yy: '01', answer: 20 },
  { text: 'Transcript — printed: 11/', yy: '98', answer: 19 },
  { text: 'Parking permit — expires: 08/', yy: '00', answer: 20 },
  { text: 'History file — academy founded: 11/', yy: '88', answer: 18 },
  { text: 'Scholarship — first payment: 01/', yy: '03', answer: 20 },
  { text: 'Alumni office — class of ', yy: '72', answer: 19 },
  { text: 'Computer lab — machines bought: 02/', yy: '97', answer: 19 },
  { text: 'Kimball Building — dedicated: 09/', yy: '99', answer: 19 },
];

const D = {
  assign: say(BEDNAR,
    '{player}, the people in our computer center are worried. Many of our machines store the year with only two digits.',
    'When the clock turns from ’99 to ’00, they might think it’s 1900. Grades, records, library books — all confused.',
    'Collect the backup disks from the library, the Smith, Romney and Hart Buildings, and take them to the computer lab in the Austin Building.',
    'Then help fix the dates before midnight. I’m counting on you.'),
  reminder: 'Backup disks still to collect: {list}. Then the computer lab in the Austin Building.',
  labReminder: 'You have all the disks — take them to the computer lab in the Austin Building and fix the dates.',
  report: say(BEDNAR, 'The lab called — midnight came and every computer kept working. Well done, {player}.', 'Most people will never know how close we came. That’s the best kind of success.'),
};

export function createY2K(): QuestModule {
  let ctx: QuestContext;
  const got = () => ctx.progress.get<string[]>('disks', []);
  const fixed = () => ctx.world.getTargetState('fixed') === 'yes' || ctx.status() === 'completed';
  const left = () => DEPTS.filter(d => !got().includes(d.id));
  const visuals: THREE.Object3D[] = [];
  let t = 0;

  const updateObjective = () => {
    if (!ctx.isActive()) return;
    const l = left();
    if (l.length) { ctx.ui.setObjective(`Y2K: collect the backup disks (${4 - l.length}/4) — ${l.map(d => d.label).join(' · ')}`, l[0].anchor); ctx.ui.setWaypoints(l.map(d => d.anchor)); }
    else if (!fixed()) { ctx.ui.setObjective('Y2K: take the disks to the computer lab (Austin Building) and fix the dates', LAB); ctx.ui.setWaypoints([]); }
    else { ctx.ui.setObjective('Y2K fixed — report to President Bednar in the Kimball Building', 'npc.bednar.office'); ctx.ui.setWaypoints([]); }
    ctx.reportColorProgress((4 - l.length) / 5 + (fixed() ? 0.2 : 0));
  };

  /** The date-fixing minigame. Resolves with the number of wrong answers, or null if the player left. */
  function fixDates(): Promise<number | null> {
    const hard = ctx.difficulty() === 'hard', n = hard ? 9 : 6, limit = hard ? 75 : 0;
    const recs = [...Y2K_RECORDS].sort(() => Math.random() - 0.5).slice(0, n);
    let i = 0, wrong = 0, t0 = performance.now(), raf = 0;
    return ctx.ui.custom('Y2K — fix the dates', (root, api) => {
      root.innerHTML = `<p class="sub">Each record stores only the last two digits of the year. Which century is it? (It’s fall 1999.)</p>
        <div class="y2k-screen"><div class="y2k-count"></div><div class="y2k-rec"></div><div class="y2k-msg"></div></div>
        <div class="items y2k-btns"><button data-focus data-c="18">18<b>??</b></button><button data-focus data-c="19">19<b>??</b></button><button data-focus data-c="20">20<b>??</b></button></div>
        <div class="items"><button data-focus data-c="leave">Leave for now</button></div>`;
      const rec = root.querySelector('.y2k-rec') as HTMLElement, msg = root.querySelector('.y2k-msg') as HTMLElement, count = root.querySelector('.y2k-count') as HTMLElement;
      const show = () => {
        const r = recs[i];
        rec.innerHTML = `${r.text}<span class="yy">${r.yy}</span>`;
        root.querySelectorAll<HTMLElement>('.y2k-btns b').forEach(b => { b.textContent = r.yy; });
      };
      const tick = () => {
        const secs = (performance.now() - t0) / 1000;
        count.textContent = `Record ${i + 1} of ${n}${limit ? ` · ⏱ ${Math.max(0, Math.ceil(limit - secs))} s to midnight` : ''}`;
        if (limit && secs > limit) { cancelAnimationFrame(raf); ctx.world.sound('error'); ctx.ui.toast('Midnight came too soon! The backups are safe — try the dates again.'); api.close('timeout'); return; }
        raf = requestAnimationFrame(tick);
      };
      root.querySelectorAll<HTMLElement>('[data-c]').forEach(b => b.addEventListener('click', () => {
        const c = b.dataset.c!;
        if (c === 'leave') { api.close(null); return; }
        const r = recs[i];
        if (Number(c) === r.answer) {
          ctx.world.sound('tick'); msg.textContent = `✔ ${r.answer}${r.yy}`; msg.className = 'y2k-msg ok';
          i++; if (i >= n) { api.close('done'); return; }
          show();
        } else {
          wrong++; ctx.world.sound('error'); msg.className = 'y2k-msg bad';
          msg.textContent = Number(c) === 20 && r.answer === 19 ? '✖ That’s in the future!' : Number(c) === 18 ? '✖ That’s far too long ago!' : '✖ Wrong century — read the record again.';
        }
      }));
      show(); tick();
      return () => cancelAnimationFrame(raf);
    }, { className: 'y2k-panel' }).then(r => (r === 'done' ? wrong : r === 'timeout' ? -1 : null));
  }

  async function lab() {
    if (!ctx.isActive()) { ctx.ui.toast('The computer lab. Everything hums along… for now.'); return; }
    if (fixed()) { ctx.ui.toast('All dates fixed. Report to President Bednar.'); return; }
    if (left().length) { ctx.ui.toast(`Bring all the backup disks first (${4 - left().length}/4).`); return; }
    await ctx.ui.dialogue(say('Brother Tanner · Computer lab', 'You brought all four boxes? Perfect! Now the tricky part.', 'The computers only see two digits. Tell them which century each year belongs to.'));
    for (;;) {
      const w = await fixDates();
      if (w === null) return;
      if (w < 0) continue;
      ctx.progress.set('wrong', ctx.progress.get('wrong', 0) + w);
      break;
    }
    // midnight!
    const p = ctx.world.position(LAB);
    await ctx.cutscene({ id: 'y2k-midnight', steps: [
      { camera: { from: { x: p.x + 10, y: p.y + 4, z: p.z + 10 }, to: { x: p.x + 7, y: p.y + 6, z: p.z + 7 }, dur: 1.2 }, look: { x: p.x, y: p.y + 3, z: p.z }, say: { speaker: 'Brother Tanner · Computer lab', text: '11:59:58… 11:59:59…' } },
      { look: { x: p.x, y: p.y + 8, z: p.z }, run: () => { ctx.world.fireworks(p.x, p.y + 2, p.z, 5); ctx.world.sound('cheer'); }, say: { speaker: 'Brother Tanner · Computer lab', text: '01/01/2000 — and every system still works! Happy New Year!' } },
    ], onDone: () => { ctx.world.setTargetState('fixed', 'yes'); } });
    if (!fixed()) ctx.world.setTargetState('fixed', 'yes');
    updateObjective();
  }

  return {
    id: 'y2k', title: 'Y2K Rescue', owner: 'Extra story missions', placeholder: false,
    register(c) {
      ctx = c; visuals.length = 0;
      for (const d of DEPTS) {
        const box = prop(ctx, [[0.7, 0.4, 0.5, d.color, 0, 0.2, 0], [0.6, 0.05, 0.42, '#f4f1e8', 0, 0.42, 0], [0.16, 0.02, 0.16, '#2a2d31', -0.15, 0.45, 0], [0.16, 0.02, 0.16, '#2a2d31', 0.12, 0.45, 0.05]]);
        const holder = new THREE.Group(); holder.add(box); visuals.push(box);
        ctx.addInteractable({ id: `disk-${d.id}`, kind: 'generic', at: d.anchor, radius: 2.4, eras: ['ricks1999'], visual: holder,
          enabled: () => ctx.isActive() && !got().includes(d.id),
          objective: () => ctx.isActive() && !got().includes(d.id),
          prompt: `Take the ${d.label} backup disks`,
          onInteract: () => {
            ctx.progress.set('disks', [...got(), d.id]); holder.visible = false; ctx.world.sound('chime');
            ctx.ui.toast(`💾 ${d.label} backup disks (${got().length}/4)`); updateObjective();
          } });
        if (got().includes(d.id) || ctx.status() === 'completed') holder.visible = false;
        ctx.on('reset', () => { holder.visible = true; });
      }
      const tech = ctx.world.npc({ label: 'Brother Tanner · Computer lab', shirt: '#e8e2d0', pants: '#2b3550', hair: '#4a3324' });
      ctx.addInteractable({ id: 'lab', kind: 'npc', at: LAB, radius: 3, eras: ['ricks1999'], visual: tech,
        objective: () => ctx.isActive() && !left().length && !fixed(),
        prompt: () => (ctx.isActive() && !fixed() ? 'Computer lab: fix the dates' : 'Talk to Brother Tanner (computer lab)'), onInteract: () => lab() });
      ctx.on('started', updateObjective);
      if (ctx.isActive()) updateObjective();
    },
    async onAssign(start) { await ctx.cutscene({ id: 'y2k-assign', steps: bednarSteps(ctx, D.assign), onDone: start }); },
    objective: () => (ctx && left().length ? `Collect the backup disks (${4 - left().length}/4)` : 'Fix the dates in the computer lab'),
    briefing: () => D.assign,
    reminder: () => say(BEDNAR, fixed() ? 'The dates are fixed? Wonderful — tell me everything.' : left().length ? D.reminder.replace('{list}', left().map(d => d.label).join(', ')) : D.labReminder),
    readyToReport: () => !!ctx && fixed(),
    async onReport() { await ctx.cutscene({ id: 'y2k-report', steps: bednarSteps(ctx, D.report), onDone: () => ctx.complete() }); },
    qualityScore: () => Math.max(0, 1 - 0.1 * ctx.progress.get('wrong', 0)),
    skippedFraction: () => 0,
    update(dt) { t += dt; for (const v of visuals) bob(v, t); },
  };
}
