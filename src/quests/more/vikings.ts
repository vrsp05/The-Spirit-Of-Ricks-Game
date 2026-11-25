// ============================================================================
// STORY MISSION — Vikings Game Night (Fall 1999).
// The big home game in the Hart Building is tonight. Round up the band director
// (who lost the drumsticks), the Viking mascot and the cheer captain, then take
// the halftime free-throw shot challenge in front of the crowd. Report to Bednar.
// Fictional characters; the Ricks College Vikings were real.
// ============================================================================
import * as THREE from 'three';
import type { QuestContext, QuestModule } from '../contract';
import { bednarSteps } from '../shared/scenes';
import { BEDNAR, bob, prop, say } from './kit';

interface Helper { id: 'band' | 'mascot' | 'cheer'; anchor: string; name: string; look: { shirt: string; pants?: string; hair?: string } }
const HELPERS: Helper[] = [
  { id: 'band', anchor: 'vikings.band', name: 'Mr. Hale · Band director', look: { shirt: '#2b3550', pants: '#2a2a2a', hair: '#8a8580' } },
  { id: 'mascot', anchor: 'vikings.mascot', name: 'Victor · Viking mascot', look: { shirt: '#7a2b2b', pants: '#5a3a20', hair: '#d1a12f' } },
  { id: 'cheer', anchor: 'vikings.cheer', name: 'Jess · Cheer captain', look: { shirt: '#f4f1e8', pants: '#7a2b2b', hair: '#3b2a20' } },
];
const GYM = 'vikings.gym';
const STICKS = 'vikings.sticks';
const CHEERS = ['“V-I-K-I-N-G-S, Vikings are the very best!”', '“Hey hey, ho ho, Vikings fans are here to go!”', '“Shields up, horns high — Vikings never say goodbye!”'];

const D = {
  assign: say(BEDNAR,
    'Tonight is a big home game for our Vikings in the Hart Building, and I hear the preparations are… behind.',
    'Find the band director by the Snow Building, our Viking mascot near the Romney Building, and the cheer captain by the library.',
    'Get everyone to the Hart Building. And {player} — I volunteered you for the halftime shot challenge.'),
  report: say(BEDNAR, 'I heard the cheering all the way from my office! What a night.', 'Moments like that are what people remember about this place. Thank you, {player}.'),
};

export function createVikings(): QuestModule {
  let ctx: QuestContext;
  const done = () => ctx.progress.get<string[]>('ready', []);
  const hasSticks = () => ctx.progress.get('sticks', false);
  const won = () => ctx.world.getTargetState('game') === 'won' || ctx.status() === 'completed';
  const left = () => HELPERS.filter(h => !done().includes(h.id));
  let sticksObj: THREE.Object3D | null = null, t = 0;

  const updateObjective = () => {
    if (!ctx.isActive()) return;
    const l = left();
    if (l.length) {
      const sub = !done().includes('band') && ctx.progress.get('askedBand', false) && !hasSticks() ? ' (find the drumsticks!)' : '';
      ctx.ui.setObjective(`Game night: round up the team (${3 - l.length}/3)${sub} — ${l.map(h => h.name.split(' · ')[1]).join(' · ')}`, sub ? STICKS : l[0].anchor);
      ctx.ui.setWaypoints(l.map(h => h.anchor));
    } else if (!won()) { ctx.ui.setObjective('Game night: go to the Hart Building for the halftime shot challenge', GYM); ctx.ui.setWaypoints([]); }
    else { ctx.ui.setObjective('Vikings win! Report to President Bednar in the Kimball Building', 'npc.bednar.office'); ctx.ui.setWaypoints([]); }
    ctx.reportColorProgress((3 - l.length) / 4 + (won() ? 0.25 : 0));
  };

  async function talkHelper(h: Helper) {
    if (!ctx.isActive()) { await ctx.ui.dialogue(say(h.name, 'Big game coming up! Go Vikings!')); return; }
    if (done().includes(h.id)) { await ctx.ui.dialogue(say(h.name, 'See you at the Hart Building!')); return; }
    if (h.id === 'band') {
      if (!hasSticks()) {
        await ctx.ui.dialogue(say(h.name, 'Game night? I know, I know! But our drummer lost his drumsticks somewhere on the lawn behind me.', 'No drums, no fight song. Could you look around for them?'));
        ctx.progress.set('askedBand', true); if (sticksObj) sticksObj.visible = true; updateObjective(); return;
      }
      await ctx.ui.dialogue(say(h.name, 'My drumsticks! You’re a hero. Band — grab your instruments, we’re going to the Hart!'));
    } else if (h.id === 'mascot') {
      await ctx.ui.dialogue(say(h.name, 'Rrrraaah! … Sorry, I was practicing. I’m the Viking!', 'Tell everyone the Viking is on his way. Horns on, shield up!'));
    } else {
      await ctx.ui.dialogue(say(h.name, 'Finally! We need a new cheer for tonight. Which one do you like?'));
      const pick = await ctx.ui.panel({ title: 'Pick tonight’s cheer', buttons: CHEERS.map((c, i) => ({ id: String(i), label: c })) });
      ctx.progress.set('cheer', Number(pick ?? 0));
      await ctx.ui.dialogue(say(h.name, `${CHEERS[Number(pick ?? 0)]} Perfect! The squad will love it. See you at the Hart!`));
    }
    ctx.progress.set('ready', [...done(), h.id]); ctx.world.sound('chime');
    ctx.ui.toast(`🏀 ${h.name.split(' · ')[0]} is heading to the game (${done().length}/3)`); updateObjective();
  }

  /** Halftime free throws: stop the moving marker inside the green zone. Returns shots made (null = left). */
  function freeThrows(): Promise<number | null> {
    const hard = ctx.difficulty() === 'hard', shots = 5, zone = hard ? 0.14 : 0.22, speed = hard ? 1.6 : 1.15;
    let made = 0, taken = 0, x = 0, dir = 1, last = performance.now(), raf = 0, locked = false;
    const center = 0.5 + (Math.random() - 0.5) * 0.3;
    return ctx.ui.custom('Halftime shot challenge', (root, api) => {
      root.innerHTML = `<p class="sub">Press <kbd>Space</kbd> / <kbd>E</kbd> / Ⓐ when the ball is in the green zone. Make ${hard ? 4 : 3} of ${shots}!</p>
        <div class="ft-court"><div class="ft-hoop">🏀</div><div class="ft-bar"><div class="ft-zone"></div><div class="ft-ball"></div></div><div class="ft-score"></div><div class="ft-msg"></div></div>
        <div class="items"><button data-focus data-act="shoot">Shoot!</button></div>`;
      const ball = root.querySelector('.ft-ball') as HTMLElement, zoneEl = root.querySelector('.ft-zone') as HTMLElement, score = root.querySelector('.ft-score') as HTMLElement, msg = root.querySelector('.ft-msg') as HTMLElement;
      zoneEl.style.left = `${(center - zone / 2) * 100}%`; zoneEl.style.width = `${zone * 100}%`;
      const paint = () => { score.textContent = `${'●'.repeat(made)}${'○'.repeat(taken - made)}${'·'.repeat(shots - taken)}  ${made}/${shots}`; };
      const loop = () => {
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!locked) { x += dir * speed * dt * (1 + taken * 0.12); if (x > 1) { x = 1; dir = -1; } if (x < 0) { x = 0; dir = 1; } }
        ball.style.left = `calc(${x * 100}% - 12px)`; raf = requestAnimationFrame(loop);
      };
      const shoot = () => {
        if (locked || taken >= shots) return;
        locked = true; taken++;
        const off = Math.abs(x - center), swish = off < zone / 2;
        if (swish) { made++; ctx.world.sound('success'); msg.textContent = off < zone / 6 ? 'SWISH! 🔥' : 'It’s good!'; }
        else { ctx.world.sound('error'); msg.textContent = x < center ? 'Too short — off the front rim.' : 'Too long — off the back of the rim.'; }
        paint();
        setTimeout(() => { locked = false; if (taken >= shots) api.close(String(made)); }, 900);
      };
      root.querySelector('[data-act="shoot"]')!.addEventListener('click', shoot);
      api.onAction(a => { if (a === 'confirm') { shoot(); return true; } if (a === 'back') { api.close(null); return true; } return false; });
      paint(); loop();
      return () => cancelAnimationFrame(raf);
    }, { className: 'ft-panel' }).then(r => (r === null ? null : Number(r)));
  }

  async function gym() {
    if (!ctx.isActive()) { ctx.ui.toast('The Hart Building — home of the Vikings.'); return; }
    if (won()) { ctx.ui.toast('What a game! Report to President Bednar.'); return; }
    if (left().length) { ctx.ui.toast(`The team isn’t ready yet (${3 - left().length}/3). Round everyone up first!`); return; }
    const g = ctx.world.position(GYM);
    ctx.world.gatherCrowd(g.x, g.z, 25);
    await ctx.ui.dialogue([...say('Announcer', 'Ladies and gentlemen… YOUR RICKS COLLEGE VIKINGS!'), ...say('Jess · Cheer captain', CHEERS[ctx.progress.get('cheer', 0)]),
      ...say('Announcer', 'And at halftime, a special guest from the president’s office takes the shot challenge!')]);
    const need = ctx.difficulty() === 'hard' ? 4 : 3;
    for (;;) {
      const made = await freeThrows();
      if (made === null) return;
      ctx.progress.set('best', Math.max(made, ctx.progress.get('best', 0))); ctx.progress.set('tries', ctx.progress.get('tries', 0) + 1);
      if (made >= need) break;
      await ctx.ui.dialogue(say('Announcer', `${made} of 5! So close — the crowd wants another try!`));
    }
    await ctx.cutscene({ id: 'vikings-win', steps: [
      { camera: { from: { x: g.x + 14, y: g.y + 6, z: g.z + 14 }, to: { x: g.x + 9, y: g.y + 4, z: g.z + 9 }, dur: 1.4 }, look: { x: g.x, y: g.y + 2, z: g.z },
        run: () => { ctx.world.sound('cheer'); ctx.world.fireworks(g.x, g.y + 4, g.z, 4); }, say: { speaker: 'Announcer', text: 'The crowd goes wild! And the Vikings take the win tonight!' } },
    ], onDone: () => ctx.world.setTargetState('game', 'won') });
    if (!won()) ctx.world.setTargetState('game', 'won');
    updateObjective();
  }

  return {
    id: 'vikings', title: 'Vikings Game Night', owner: 'Extra story missions', placeholder: false,
    register(c) {
      ctx = c;
      for (const h of HELPERS) {
        const npc = ctx.world.npc({ label: h.name, ...h.look });
        if (h.id === 'mascot') { const horns = prop(ctx, [[0.62, 0.22, 0.62, '#9aa3a8', 0, 2.12, 0], [0.1, 0.32, 0.1, '#f4f1e8', -0.38, 2.3, 0], [0.1, 0.32, 0.1, '#f4f1e8', 0.38, 2.3, 0]]); npc.add(horns); }
        ctx.addInteractable({ id: `helper-${h.id}`, kind: 'npc', at: h.anchor, radius: 3, eras: ['ricks1999'], visual: npc,
          objective: () => ctx.isActive() && !done().includes(h.id) && !(h.id === 'band' && ctx.progress.get('askedBand', false) && !hasSticks()),
          prompt: `Talk to ${h.name}`, onInteract: () => talkHelper(h) });
      }
      const sticks = prop(ctx, [[0.05, 0.05, 0.55, '#c9a060', -0.06, 0.1, 0], [0.05, 0.05, 0.55, '#c9a060', 0.06, 0.1, 0.03]]);
      const holder = new THREE.Group(); holder.add(sticks); sticksObj = holder;
      holder.visible = ctx.progress.get('askedBand', false) && !hasSticks();
      ctx.addInteractable({ id: 'sticks', kind: 'generic', at: STICKS, radius: 2.2, eras: ['ricks1999'], visual: holder,
        enabled: () => ctx.isActive() && ctx.progress.get('askedBand', false) && !hasSticks(),
        objective: () => ctx.isActive() && ctx.progress.get('askedBand', false) && !hasSticks(),
        prompt: 'Pick up the drumsticks', onInteract: () => { ctx.progress.set('sticks', true); holder.visible = false; ctx.world.sound('chime'); ctx.ui.toast('🥁 Found the drumsticks! Take them back to Mr. Hale.'); updateObjective(); } });
      const banner = prop(ctx, [[0.12, 2.6, 0.12, '#3a3f45', -1.3, 1.3, 0], [0.12, 2.6, 0.12, '#3a3f45', 1.3, 1.3, 0], [2.6, 0.9, 0.06, '#7a2b2b', 0, 2.2, 0]]);
      ctx.addInteractable({ id: 'gym', kind: 'site', at: GYM, radius: 3.5, eras: ['ricks1999'], visual: banner,
        objective: () => ctx.isActive() && !left().length && !won(),
        prompt: () => (ctx.isActive() && !left().length && !won() ? 'Start the game (halftime shot challenge)' : 'GAME NIGHT — Hart Building'), onInteract: () => gym() });
      ctx.on('started', updateObjective);
      if (ctx.isActive()) updateObjective();
    },
    async onAssign(start) { await ctx.cutscene({ id: 'vikings-assign', steps: bednarSteps(ctx, D.assign), onDone: start }); },
    objective: () => (ctx && left().length ? `Round up the team (${3 - left().length}/3)` : 'Halftime shot challenge at the Hart Building'),
    briefing: () => D.assign,
    reminder: () => say(BEDNAR, won() ? 'Back from the game already? Tell me how it went!' : left().length ? `Still missing: ${left().map(h => h.name.split(' · ')[1]).join(', ')}.` : 'Everyone is ready — head to the Hart Building!'),
    readyToReport: () => !!ctx && won(),
    async onReport() { await ctx.cutscene({ id: 'vikings-report', steps: bednarSteps(ctx, D.report), onDone: () => ctx.complete() }); },
    qualityScore: () => Math.min(1, ctx.progress.get('best', 0) / 5) * Math.max(0.5, 1 - 0.1 * (ctx.progress.get('tries', 1) - 1)),
    skippedFraction: () => 0,
    update(dt) { t += dt; if (sticksObj?.children[0]) bob(sticksObj.children[0], t); },
  };
}
