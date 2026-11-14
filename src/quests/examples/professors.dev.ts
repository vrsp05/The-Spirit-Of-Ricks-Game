// ============================================================================
// DEVELOPMENT EXAMPLE — NOT FINAL QUEST CONTENT.
// Owner: Quest 1 teammate. Replace interactions, dialogue, order and pass rules.
// Shows: four NPC anchors (one inside a quest room), attempts, retry, completion.
// ============================================================================
import type { QuestContext, QuestModule } from '../contract';

// Whiteboard concepts (NOT final mechanics) — shown only as dev notes.
const CONCEPTS: Record<string, string> = {
  math: 'Whiteboard concept: convert money.',
  engineering: 'Whiteboard concept: build a small circuit tied to the future Rexburg Temple (a future-facing plan in 1999).',
  art: 'Whiteboard concept: paint the future Rexburg Temple (a future-facing plan in 1999).',
  english: 'Whiteboard concept: fix/edit a talk. Needs a verified, team-approved source — no invented quotes.',
};

export function createProfessorsDev(): QuestModule {
  let ctx: QuestContext;
  const recruited = () => ctx.progress.get<Record<string, boolean>>('recruited', {});
  const subjects = () => ctx.config.subjects as { id: string; label: string; anchor: string; where: string }[];
  const remaining = () => subjects().filter(s => !recruited()[s.id]);

  return {
    id: 'professors', title: 'Recruit professors', owner: 'Quest 1 teammate (TBD)', placeholder: true,

    register(c) {
      ctx = c;
      for (const s of subjects()) {
        ctx.addInteractable({
          id: `prof-${s.id}`, kind: 'npc', at: s.anchor, radius: 2.6,
          visual: ctx.world.npc({ label: `${s.label} professor`, sub: s.where, shirt: '#7d5a8c', pants: '#2c2540' }),
          prompt: () => recruited()[s.id] ? `${s.label} professor (recruited)` : `Talk to the ${s.label} professor`,
          objective: () => ctx.isActive() && !recruited()[s.id],
          onInteract: async () => {
            if (!ctx.isActive()) {
              await ctx.ui.dialogue([{ speaker: `${s.label} professor`, text: `${ctx.DEV} I can't help yet — the assignment hasn't been given.`, placeholder: true }]);
              return;
            }
            if (recruited()[s.id]) { ctx.ui.toast(`${s.label} professor already recruited.`); return; }
            const r = await ctx.ui.panel({
              title: `${s.label} professor`, placeholder: true,
              body: `Placeholder activity. The Quest 1 owner defines the real interaction, framing and pass rules.\n\n${CONCEPTS[s.id] ?? ''}\n\nDifficulty available to quests: ${ctx.difficulty()}`,
              buttons: [{ id: 'pass', label: 'Simulate a successful attempt' }, { id: 'fail', label: 'Simulate a failed attempt' }, { id: 'leave', label: 'Leave' }],
            });
            if (r === 'pass') {
              ctx.progress.set('recruited', { ...recruited(), [s.id]: true });
              ctx.ui.toast(`${s.label} professor recruited (${4 - remaining().length}/4)`);
              if (!remaining().length) ctx.complete(); else updateObjective();
            } else if (r === 'fail') {
              ctx.progress.set('attempts', ctx.progress.get('attempts', 0) + 1);
              ctx.fail(`${s.id}: dev failed attempt`);
            }
          },
        });
      }
      ctx.on('started', updateObjective);
      ctx.on('failed', () => ctx.ui.toast('Attempt failed — you can try again.'));
      if (ctx.isActive()) updateObjective();
    },

    objective: () => `Recruit professors (${4 - (ctx ? remaining().length : 4)}/4)`,
    briefing: () => [
      { speaker: 'President Bednar', text: `${'[PLACEHOLDER]'} Assignment dialogue for Quest 1 goes here. Please recruit four professors.`, placeholder: true },
    ],
    reminder: () => [{ speaker: 'President Bednar', text: `[PLACEHOLDER] Professors still to recruit: ${remaining().map(s => `${s.label} (${s.where})`).join(', ')}.`, placeholder: true }],
  };

  function updateObjective() {
    const next = remaining()[0];
    ctx.ui.setObjective(`Recruit professors (${4 - remaining().length}/4)${next ? ` — find the ${next.label} professor at the ${next.where}` : ''}`, next ? next.anchor : null);
  }
}
