// ============================================================================
// QUEST 2 PLACEHOLDER — Gio is building the real Quest 2 ("construction").
// Keeps the story playable until then: Bednar assigns it, and the fenced Taylor
// site offers a clearly labelled "mark Quest 2 complete" panel. Swap this module
// for the real one in src/quests/index.ts (one line). Config: GAME_CONFIG.quests.construction.
// ============================================================================
import type { QuestContext, QuestModule } from '../contract';

export function createConstructionPlaceholder(): QuestModule {
  let ctx: QuestContext;
  const site = () => (ctx.config.buildings as { anchor: string }[] | undefined)?.[0]?.anchor ?? 'construction.taylor';
  const speaker = 'President Bednar (game character)';
  return {
    id: 'construction', title: 'Build the campus (placeholder)', owner: 'Gio (Quest 2)', placeholder: true,
    register(c) {
      ctx = c;
      ctx.addInteractable({
        id: 'placeholder-site', kind: 'site', at: site(), radius: 4,
        enabled: () => ctx.isActive(), objective: () => ctx.isActive(),
        prompt: 'Quest 2 placeholder',
        onInteract: async () => {
          const r = await ctx.ui.panel({ title: 'Quest 2 is being built', placeholder: true,
            body: 'Gio is building the real Quest 2 (the construction quest). For now you can mark it complete to keep playing the story.',
            buttons: [{ id: 'done', label: 'Mark Quest 2 complete' }, { id: 'leave', label: 'Leave' }] });
          if (r === 'done') ctx.complete();
        },
      });
      ctx.on('started', () => ctx.ui.setObjective('Quest 2 (placeholder) — visit the Taylor construction site', site()));
      if (ctx.isActive()) ctx.ui.setObjective('Quest 2 (placeholder) — visit the Taylor construction site', site());
    },
    objective: () => 'Quest 2 (placeholder)',
    briefing: () => [{ speaker, text: `${ctx?.DEV ?? '[DEV]'} Quest 2 is still being built. Visit the Taylor construction site to continue the story.`, placeholder: true }],
    reminder: () => [{ speaker, text: 'The Taylor construction site is marked on your map.', placeholder: true }],
  };
}
