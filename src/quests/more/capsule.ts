// ============================================================================
// STORY MISSION — The Time Capsule (Spring 2001).
// Big changes are coming to the college. Four students each offer two keepsakes
// for a time capsule (you choose one) plus a message to the future. Bury it on
// the Kimball quad and a plaque marks the spot — in the present day the plaque
// says it has been opened, and shows what you chose. Report to Bednar.
// Fictional event. Nothing here names BYU–Idaho before the present day.
// ============================================================================
import * as THREE from 'three';
import type { QuestContext, QuestModule } from '../contract';
import { bednarSteps } from '../shared/scenes';
import { BEDNAR, plaque, prop, say } from './kit';

interface Giver { id: string; anchor: string; name: string; shirt: string; ask: string; options: [string, string]; message: string }
export const CAPSULE_GIVERS: Giver[] = [
  { id: 'taylor', anchor: 'capsule.taylor', name: 'Amanda · Student', shirt: '#4a6a3a', ask: 'A time capsule? I love that! I have two things — which one should go in?',
    options: ['A Vikings game ticket', 'A dining-hall menu'], message: 'Dear future students: we hope you still cheer this loud.' },
  { id: 'romney', anchor: 'capsule.romney', name: 'Marcus · Student', shirt: '#3f5f8a', ask: 'For the future? Hmm… my calculator or my class schedule?',
    options: ['A graphing calculator', 'A paper class schedule'], message: 'I hope you never have to stand in line to register for classes. We did. For hours.' },
  { id: 'mckay', anchor: 'capsule.mckay', name: 'Hannah · Student', shirt: '#c94f6d', ask: 'Oh, I have just the thing! Well, two things. You pick.',
    options: ['A library card', 'A mixtape of campus favorites'], message: 'Whatever this school becomes, I hope it still feels like home.' },
  { id: 'austin', anchor: 'capsule.austin', name: 'Kyle · Student', shirt: '#b8742c', ask: 'Something for the future… my pager, or this photo of our dorm floor?',
    options: ['A pager', 'A photo of the dorm floor'], message: 'If you find this, say hi to the wind for us. It never stops.' },
];
const SITE = 'capsule.site';

const D = {
  assign: say(BEDNAR,
    'Big changes are coming, {player}. Someday people will wonder what this place was like right now.',
    'Let’s leave them something. Ask students near the Taylor, Romney, Austin and McKay Buildings what should go in a time capsule.',
    'When you have four keepsakes, bury the capsule on the quad north of the Kimball Building. Then come tell me.'),
  report: say(BEDNAR, 'A time capsule under the quad… I wonder who will open it, and what they’ll think of us.', 'Thank you, {player}. Now — I have a feeling the next few years will be busy.'),
};

export function createCapsule(): QuestModule {
  let ctx: QuestContext;
  const items = () => ctx.progress.get<Record<string, { item: string; message: string }>>('items', {});
  const buried = () => ctx.world.getTargetState('buried') === 'yes' || ctx.status() === 'completed';
  const left = () => CAPSULE_GIVERS.filter(g => !items()[g.id]);
  let siteVis: THREE.Group | null = null, plaqueMesh: THREE.Object3D | null = null;

  const updateObjective = () => {
    if (!ctx.isActive()) return;
    const l = left();
    if (l.length) { ctx.ui.setObjective(`Time capsule: collect keepsakes (${4 - l.length}/4) — ask students by the ${l.map(g => g.anchor.split('.')[1][0].toUpperCase() + g.anchor.split('.')[1].slice(1)).join(', ')}`, l[0].anchor); ctx.ui.setWaypoints(l.map(g => g.anchor)); }
    else if (!buried()) { ctx.ui.setObjective('Time capsule: bury it on the quad north of the Kimball Building', SITE); ctx.ui.setWaypoints([]); }
    else { ctx.ui.setObjective('Capsule buried — report to President Bednar in the Kimball Building', 'npc.bednar.office'); ctx.ui.setWaypoints([]); }
    ctx.reportColorProgress((4 - l.length) / 5 + (buried() ? 0.2 : 0));
  };
  const syncSite = () => { if (siteVis) { siteVis.children[0].visible = !buried(); siteVis.children[1].visible = buried(); } };

  async function talkGiver(g: Giver) {
    if (!ctx.isActive()) { await ctx.ui.dialogue(say(g.name, buried() ? 'I can’t wait for someone to open our time capsule someday.' : 'Hi! Beautiful spring day, isn’t it?')); return; }
    const mine = items()[g.id];
    if (mine) { await ctx.ui.dialogue(say(g.name, `Take good care of the ${mine.item.replace(/^An? /, '').toLowerCase()}!`)); return; }
    await ctx.ui.dialogue(say(g.name, g.ask));
    const r = await ctx.ui.panel({ title: 'What goes in the capsule?', buttons: g.options.map((o, i) => ({ id: String(i), label: o })) });
    if (r === null) return;
    const item = g.options[Number(r)];
    await ctx.ui.dialogue(say(g.name, `${item} it is! And here — a note for whoever opens it.`, `“${g.message}”`));
    ctx.progress.set('items', { ...items(), [g.id]: { item, message: g.message } }); ctx.world.sound('chime');
    ctx.ui.toast(`📦 ${item} (${4 - left().length}/4 keepsakes)`); updateObjective();
  }

  async function site() {
    const era = ctx.world.era();
    if (ctx.status() === 'completed' || buried()) {
      const list = Object.values(items());
      const lines = era === 'presentFinale'
        ? ['TIME CAPSULE — buried spring 2001, opened at the BYU–Idaho celebration.', 'Inside were:', ...list.map(i => `• ${i.item} — “${i.message}”`)]
        : ['TIME CAPSULE — buried spring 2001. Do not open until the school has a new chapter.', `${list.length} keepsakes and ${list.length} letters to the future rest here.`];
      await ctx.ui.dialogue(say('Plaque', ...lines));
      return;
    }
    if (!ctx.isActive()) { ctx.ui.toast('A nice open spot on the quad.'); return; }
    if (left().length) { ctx.ui.toast(`You need four keepsakes first (${4 - left().length}/4).`); return; }
    const p = ctx.world.position(SITE);
    const box = siteVis?.children[0];
    await ctx.cutscene({ id: 'capsule-bury', steps: [
      { camera: { from: { x: p.x + 7, y: p.y + 5, z: p.z + 7 }, to: { x: p.x + 4.5, y: p.y + 3, z: p.z + 4.5 }, dur: 1.2 }, look: { x: p.x, y: p.y + 0.5, z: p.z },
        say: { speaker: 'Narrator', text: 'Four keepsakes and four letters go into the capsule. The lid is sealed tight.' } },
      { look: { x: p.x, y: p.y, z: p.z }, dur: 2.2, tick: (_dt, k) => { if (box) box.position.y = -k * 1.2; }, say: { speaker: 'Narrator', text: 'Down it goes, under the spring grass…' } },
      { look: { x: p.x, y: p.y + 0.8, z: p.z }, run: () => { ctx.world.setTargetState('buried', 'yes'); syncSite(); ctx.world.sound('success'); },
        say: { speaker: 'Narrator', text: 'A small plaque marks the spot. Someday, someone will open it.' } },
    ], onDone: () => { if (!buried()) ctx.world.setTargetState('buried', 'yes'); syncSite(); } });
    updateObjective();
  }

  return {
    id: 'capsule', title: 'The Time Capsule', owner: 'Extra story missions', placeholder: false,
    register(c) {
      ctx = c;
      for (const g of CAPSULE_GIVERS) {
        const npc = ctx.world.npc({ label: g.name, shirt: g.shirt });
        ctx.addInteractable({ id: `giver-${g.id}`, kind: 'npc', at: g.anchor, radius: 3, eras: ['transition'], visual: npc,
          objective: () => ctx.isActive() && !items()[g.id], prompt: `Talk to ${g.name}`, onInteract: () => talkGiver(g) });
      }
      siteVis = new THREE.Group();
      const capsule = prop(ctx, [[0.9, 0.7, 0.6, '#9aa3a8', 0, 0.35, 0], [0.95, 0.08, 0.65, '#5a5f66', 0, 0.72, 0], [0.3, 0.05, 0.05, '#2a2d31', 0, 0.78, 0]]);
      const marker = new THREE.Group();
      const post = ctx.world.voxel(0.12, 0.7, 0.12, '#3a3f45'); post.position.y = 0.35; marker.add(post);
      plaqueMesh = plaque(['TIME CAPSULE', 'Spring 2001'], 0.9, 0.55); plaqueMesh.position.set(0, 0.85, 0.07); plaqueMesh.rotation.x = -0.4; marker.add(plaqueMesh);
      const mound = ctx.world.voxel(1.4, 0.12, 1.1, '#6b4a30'); mound.position.y = 0.06; marker.add(mound);
      siteVis.add(capsule, marker);
      ctx.addInteractable({ id: 'site', kind: 'site', at: SITE, radius: 2.8, eras: ['transition', 'byui', 'presentFinale'], visual: siteVis,
        enabled: () => ctx.isActive() || buried(),
        objective: () => ctx.isActive() && !left().length && !buried(),
        prompt: () => (buried() ? 'Read the time capsule plaque' : 'Bury the time capsule'), onInteract: () => site() });
      syncSite();
      const sync = () => { if (siteVis) siteVis.visible = buried() || ctx.world.era() === 'transition'; };
      ctx.on('eraChanged', sync); ctx.on('reset', syncSite); sync();
      ctx.on('started', updateObjective);
      if (ctx.isActive()) updateObjective();
    },
    async onAssign(start) { await ctx.cutscene({ id: 'capsule-assign', steps: bednarSteps(ctx, D.assign), onDone: start }); },
    objective: () => (ctx && left().length ? `Collect keepsakes (${4 - left().length}/4)` : 'Bury the time capsule'),
    briefing: () => D.assign,
    reminder: () => say(BEDNAR, buried() ? 'Is it buried? Tell me about it.' : left().length ? `Keep asking around — ${left().length} more keepsake${left().length === 1 ? '' : 's'} to go.` : 'You have everything? Then bury it on the quad north of my building.'),
    readyToReport: () => !!ctx && buried(),
    async onReport() { await ctx.cutscene({ id: 'capsule-report', steps: bednarSteps(ctx, D.report), onDone: () => ctx.complete() }); },
    qualityScore: () => 1,
    skippedFraction: () => 0,
  };
}
