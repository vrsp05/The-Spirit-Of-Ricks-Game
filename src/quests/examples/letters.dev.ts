// ============================================================================
// DEVELOPMENT EXAMPLE — NOT FINAL QUEST CONTENT.
// Owner: Quest 3 teammate. Placement, order, randomisation and hints are OPEN.
// Shows: independent collection of B, Y, U, I + an optional hint hook.
// No wrong-answer mechanic is invented for the scavenger hunt.
// ============================================================================
import * as THREE from 'three';
import type { QuestContext, QuestModule } from '../contract';

// 5x5 pixel glyphs for voxel letters
const GLYPHS: Record<string, string[]> = {
  B: ['1111 ', '1   1', '1111 ', '1   1', '1111 '],
  Y: ['1   1', ' 1 1 ', '  1  ', '  1  ', '  1  '],
  U: ['1   1', '1   1', '1   1', '1   1', ' 111 '],
  I: ['11111', '  1  ', '  1  ', '  1  ', '11111'],
};

export function createLettersDev(): QuestModule {
  let ctx: QuestContext;
  const spinners: THREE.Object3D[] = [];
  let t = 0;
  const letters = () => Object.keys(ctx.config.anchors as Record<string, string>);
  const found = () => ctx.progress.get<string[]>('found', []);
  const remaining = () => letters().filter(l => !found().includes(l));

  function voxelLetter(ch: string) {
    const g = new THREE.Group(), inner = new THREE.Group();
    GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== '1') return; const v = ctx.world.voxel(0.4, 0.4, 0.4, '#2f5f8f'); v.position.set((x - 2) * 0.4, (4 - y) * 0.4, 0); inner.add(v);
    }));
    inner.position.y = 1.2; g.add(inner); spinners.push(inner);
    return g;
  }

  return {
    id: 'letters', title: 'Find the lost letters', owner: 'Quest 3 teammate (TBD)', placeholder: true,
    register(c) {
      ctx = c; spinners.length = 0;
      for (const l of letters()) {
        ctx.addInteractable({
          id: `letter-${l}`, kind: 'letter', at: (ctx.config.anchors as Record<string, string>)[l], radius: 2.4,
          visual: voxelLetter(l),
          enabled: () => ctx.isActive() && !found().includes(l),
          objective: () => true,
          prompt: `Collect the letter ${l}`,
          onInteract: () => {
            ctx.progress.set('found', [...found(), l]);
            ctx.ui.toast(`Found ${l}! (${found().length}/4)`);
            updateObjective();
          },
        });
      }
      // Final step (team idea): place the letters on the Ricks College sign.
      ctx.addInteractable({
        id: 'place-letters', kind: 'sign', at: ctx.config.signAnchor, radius: 5.5,
        enabled: () => ctx.isActive() && !remaining().length,
        objective: () => true,
        prompt: 'Place the letters on the sign',
        onInteract: async () => {
          await ctx.ui.dialogue([{ speaker: 'You', text: `${ctx.DEV} You fix the four letters to the sign, one by one…`, placeholder: true }]);
          ctx.complete();
        },
      });
      ctx.on('started', updateObjective);
      if (ctx.isActive()) updateObjective();
    },
    update(dt) { t += dt; spinners.forEach((s, i) => { s.rotation.y = t * 1.5 + i; s.position.y = 1.2 + Math.sin(t * 2 + i) * 0.2; }); },
    objective: () => `Find the lost letters (${4 - (ctx ? remaining().length : 4)}/4)`,
    briefing: () => [{ speaker: 'President Bednar', text: '[PLACEHOLDER] Assignment dialogue for Quest 3 (find the lost letters) goes here.', placeholder: true }],
    // Optional hint hook: the quest owner decides whether/how hints work (and difficulty effects).
    reminder: () => [{ speaker: 'President Bednar', text: `[PLACEHOLDER HINT] Still missing: ${remaining().join(', ')}. (Dev: the minimap marks the next letter.)`, placeholder: true }],
  };

  function updateObjective() {
    const next = remaining()[0];
    if (next) ctx.ui.setObjective(`Find the lost letters (${4 - remaining().length}/4)`, (ctx.config.anchors as Record<string, string>)[next]);
    else ctx.ui.setObjective('Take the letters to the Ricks College sign', ctx.config.signAnchor);
  }
}
