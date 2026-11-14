// ============================================================================
// DEVELOPMENT EXAMPLE — the minigame itself is a placeholder.
// Owner: Quest 2 teammate.
// Team decision (playtest): the Taylor Building and the BYU–Idaho Center stay
// hidden (fenced sites with materials) until this quest builds them. Target 3 is
// still open. Walk to a site, open the minigame, succeed -> the building appears.
// No gathering step for now.
// ============================================================================
import * as THREE from 'three';
import type { QuestContext, QuestModule } from '../contract';

interface Target { id: string; buildingId: string | null; label: string; siteAnchor: string }

export function createConstructionDev(): QuestModule {
  let ctx: QuestContext;
  const visuals = new Map<string, THREE.Group>();
  const targets = () => ctx.config.targets as Target[];
  const built = (t: Target) => ctx.world.getTargetState(t.id) === 'built' || ctx.status() === 'completed';
  const remaining = () => targets().filter(t => !built(t));

  function drawSite(t: Target) {
    const g = visuals.get(t.id)!; g.clear();
    if (t.buildingId) {
      // The world draws the fenced site / finished building; we only add a label.
      if (!built(t)) { const l = ctx.world.label(`${t.label}`, 'construction site'); l.position.y = 3.2; g.add(l); }
      return;
    }
    // No building chosen yet: symbolic placeholder site.
    if (built(t)) {
      for (let y = 0; y < 4; y++) for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const b = ctx.world.voxel(0.8, 1, 0.8, '#e8d9b0'); b.position.set(x, y + 0.5, z); g.add(b); }
      const roof = ctx.world.voxel(5, 0.5, 5, '#c9a45c'); roof.position.y = 4.3; g.add(roof);
    } else {
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const s = ctx.world.voxel(0.25, 1.2, 0.25, '#e07b24'); s.position.set(x, 0.6, z); g.add(s); }
      const pile = ctx.world.voxel(1.6, 0.5, 1, '#a4543a'); pile.position.set(0, 0.25, 0); g.add(pile);
    }
    const l = ctx.world.label(t.label, ctx.DEV); l.position.y = 3.2; g.add(l);
  }

  return {
    id: 'construction', title: 'Construct buildings', owner: 'Quest 2 teammate (TBD)', placeholder: true,
    register(c) {
      ctx = c; visuals.clear();
      for (const t of targets()) {
        const g = new THREE.Group(); visuals.set(t.id, g);
        ctx.addInteractable({
          id: `site-${t.id}`, kind: 'site', at: t.siteAnchor, radius: 4, visual: g,
          objective: () => ctx.isActive() && !built(t),
          prompt: () => built(t) ? `${t.label} (complete)` : ctx.isActive() ? `Start building: ${t.label}` : `${t.label} — construction site`,
          onInteract: async () => {
            if (built(t)) return;
            if (!ctx.isActive()) { ctx.ui.toast('This site opens when President Bednar assigns the construction quest.'); return; }
            const r = await ctx.ui.panel({
              title: `Build: ${t.label}`, placeholder: true,
              body: 'Construction minigame placeholder. The Quest 2 owner defines the real mechanics.\n\nThis is a symbolic build — the story framing is still up to the team.',
              buttons: [{ id: 'ok', label: 'Finish the build (simulate success)' }, { id: 'bad', label: 'Mess up (simulate failure)' }, { id: 'leave', label: 'Leave' }],
            });
            if (r === 'ok') {
              ctx.world.setTargetState(t.id, 'built'); drawSite(t);
              ctx.ui.toast(`${t.label} built!`);
              if (!remaining().length) ctx.complete(); else updateObjective();
            } else if (r === 'bad') ctx.fail('build failed (dev)');
          },
        });
        drawSite(t);
      }
      ctx.on('started', updateObjective);
      ctx.on('failed', () => ctx.ui.toast('That didn’t work — try again.'));
      ctx.on('reset', () => targets().forEach(drawSite));
      ctx.on('completed', () => targets().forEach(drawSite));
      if (ctx.isActive()) updateObjective();
    },
    objective: () => `Build the construction targets (${3 - (ctx ? remaining().length : 3)}/3)`,
    briefing: () => [{ speaker: 'President Bednar', text: '[PLACEHOLDER] Assignment dialogue for Quest 2 (construction) goes here.', placeholder: true }],
    reminder: () => [{ speaker: 'President Bednar', text: `[PLACEHOLDER] Still to build: ${remaining().map(t => t.label).join(', ')}.`, placeholder: true }],
  };

  function updateObjective() {
    const next = remaining()[0];
    if (next) ctx.ui.setObjective(`Build the ${next.label} — go to its construction site (${3 - remaining().length}/3)`, next.siteAnchor);
  }
}
