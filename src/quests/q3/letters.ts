// ============================================================================
// QUEST 3 — Find and place B Y U I (2010 or later).
// Bednar hands over four clue cards (journal). Letters are camouflaged in the
// architecture/surroundings of four destinations and found by looking (reticle or
// mouse) and pressing Interact. Found letters are placed on the sign near the
// roundabout in any order; ONLY the fourth placement completes the quest and
// triggers the celebration (full colour, fireworks, crowd) and the one-time reward.
// Content: ./data/cards.json.
// ============================================================================
import * as THREE from 'three';
import cardsData from './data/cards.json';
import type { QuestContext, QuestModule } from '../contract';
import { bednarSteps } from '../shared/scenes';
import { bigLetter, buildSign, camoB, camoI, camoU, camoY, notePole } from './camo';
import { openJournal, type Card, type CardState } from './journal';

const C = cardsData as unknown as { noteLabel: string; cards: Card[]; dialogue: { assign: { speaker: string; text: string }[]; reminder: string; allPlaced: string };
  modes: Record<string, { proximityMeters: number; proximityFeedback: boolean; viewHint: boolean }> };
const LETTER_ERAS = ['byui', 'presentFinale'];

export function createLetters(): QuestModule {
  let ctx: QuestContext;
  const objs: THREE.Object3D[] = [];
  let sign: { group: THREE.Group; slots: THREE.Vector3[] } | null = null;
  const signGlyphs = new Map<string, THREE.Group>();
  const found = () => ctx.progress.get<string[]>('found', []);
  const placed = () => ctx.progress.get<string[]>('placed', []);
  const cardsGiven = () => ctx.progress.get<boolean>('cards', false) || ctx.status() === 'completed';
  const state = (l: string): CardState => placed().includes(l) ? 'placed' : found().includes(l) ? 'found' : 'unfound';
  const eraOk = () => LETTER_ERAS.includes(ctx.world.era());

  const journal = (intro = false) => openJournal(ctx, {
    cards: C.cards, state, noteLabel: C.noteLabel, intro, hintsAllowed: { view: C.modes[ctx.difficulty()].viewHint },
    onHint: () => ctx.progress.set('hints', ctx.progress.get('hints', 0) + 1),
    openMap: () => { /* the game's map is on M; journal closes first */ ctx.ui.toast('Press M (or the map button) for the map. Letters are not marked — use the clues!'); },
  });
  const registerJournalButton = () => { if (cardsGiven()) ctx.ui.hudButton('Journal (J)', () => void journal()); };

  const updateObjective = () => {
    const f = found().length, p = placed().length;
    if (f < 4) ctx.ui.setObjective(`Find the hidden letters (${f}/4 found${p ? `, ${p} placed` : ''}) — using the clues in your Journal (J), find the building where each letter is hidden`, f > p ? ctx.config.signAnchor : null);
    else if (p < 4) ctx.ui.setObjective(`Place the letters on the sign by the roundabout (${p}/4)`, ctx.config.signAnchor);
    ctx.reportColorProgress(p / 4);
  };

  const syncVisibility = () => {
    for (const o of objs) o.visible = eraOk();
    if (sign) sign.group.visible = eraOk();
  };

  function silhouetteFlash(obj: THREE.Object3D) {
    const glow = new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.85, depthTest: false });
    const flashes: THREE.Mesh[] = [];
    obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) { const c = new THREE.Mesh(m.geometry, glow); c.position.copy(m.position); c.rotation.copy(m.rotation); c.scale.copy(m.scale).multiplyScalar(1.08); c.renderOrder = 30; m.parent!.add(c); flashes.push(c); } });
    setTimeout(() => flashes.forEach(f => f.removeFromParent()), 1600);
  }

  function discover(letter: string, obj: THREE.Object3D) {
    if (!ctx.isActive() || found().includes(letter)) return;
    ctx.progress.set('found', [...found(), letter]);
    silhouetteFlash(obj); ctx.world.sound('chime');
    ctx.ui.toast(`You found the letter ${letter}! (${found().length}/4) — its card is updated.`);
    updateObjective();
  }

  function addSignGlyph(l: string, animate: boolean) {
    if (!sign || signGlyphs.has(l)) return;
    const i = ['B', 'Y', 'U', 'I'].indexOf(l), g = bigLetter(l);
    const slot = sign.slots[i];
    g.position.copy(slot); sign.group.add(g); signGlyphs.set(l, g);
    if (animate && !ctx.world.reducedMotion()) {
      g.position.y += 3; g.scale.setScalar(0.4); const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 700); g.position.y = slot.y + 3 * (1 - k) * (1 - k); g.scale.setScalar(0.4 + 0.6 * k); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }

  async function signPanel() {
    if (ctx.status() === 'completed') { ctx.ui.toast('The sign is complete.'); return; }
    if (!ctx.isActive()) return;
    for (;;) {
      const ready = found().filter(l => !placed().includes(l));
      const r = await ctx.ui.panel({
        title: `The sign (${placed().length}/4 letters)`,
        body: ready.length ? 'Choose a found letter to fit into its slot.' : 'You have no unplaced letters. Find more using your Journal (J).',
        buttons: [...ready.map(l => ({ id: l, label: `Place ${l}` })), { id: 'leave', label: 'Step back' }],
      });
      if (!r || r === 'leave') return;
      ctx.progress.set('placed', [...placed(), r]);
      addSignGlyph(r, placed().length < 4); ctx.world.sound('tick'); updateObjective();
      if (placed().length === 4) { ctx.complete(); return; }
    }
  }

  return {
    id: 'letters', title: 'Find and place B Y U I', owner: 'Quest 3 teammate', placeholder: false,
    register(c) {
      ctx = c; objs.length = 0; signGlyphs.clear(); sign = null;
      const builders: Record<string, () => THREE.Group> = { B: camoB, Y: camoY, U: camoU, I: camoI };
      for (const card of C.cards) {
        const obj = builders[card.letter]();
        ctx.world.addObject(obj, card.anchor); objs.push(obj);
        ctx.world.addInspectable({ id: `letter-${card.letter}`, object: obj, maxDistance: 34, prompt: 'Inspect',
          enabled: () => ctx.isActive() && eraOk() && !found().includes(card.letter), onInspect: () => discover(card.letter, obj) });
        if (card.letter === 'I') {
          // decorative "note" poles: wrong identifications (counted for quality, never blocking)
          [-5, -2.6, 2.6, 5].forEach((dx, k) => {
            const pole = notePole(); ctx.world.addObject(pole, card.anchor); pole.position.x += dx; objs.push(pole);
            ctx.world.addInspectable({ id: `decoy-${k}`, object: pole, maxDistance: 34, prompt: 'Inspect',
              enabled: () => ctx.isActive() && eraOk() && !found().includes('I'),
              onInspect: () => { ctx.progress.set('wrong', ctx.progress.get('wrong', 0) + 1); ctx.ui.toast('A decorative music-note pole — look for one line standing on its own.'); } });
          });
        }
      }
      sign = buildSign();
      sign.group.name = 'quest-byui-sign';
      const sa = GAME_CONFIG_SIGN_YAW(ctx);
      ctx.world.addObject(sign.group, ctx.config.signAnchor); sign.group.rotation.y = sa;
      for (const l of placed()) addSignGlyph(l, false);
      ctx.addInteractable({ id: 'sign', kind: 'sign', at: ctx.config.signAnchor, radius: 6, eras: LETTER_ERAS as any,
        objective: () => ctx.isActive() && found().length > placed().length,
        prompt: () => ctx.status() === 'completed' ? 'The completed sign' : `Place letters on the sign (${placed().length}/4)`, onInteract: () => signPanel() });
      ctx.on('eraChanged', syncVisibility);
      ctx.on('started', () => { updateObjective(); registerJournalButton(); });
      ctx.on('completed', () => registerJournalButton());
      syncVisibility(); registerJournalButton();
      if (ctx.isActive()) updateObjective();
      if (ctx.status() === 'completed') for (const g of signGlyphs.values()) (g.userData.material as THREE.MeshStandardMaterial).emissive.set('#1d3f9a');
    },
    async onAssign(start) {
      // Bednar offers four card props, one by one, then they fan out into the journal
      const b = ctx.world.questGiverPosition(), p = ctx.world.playerPosition();
      const props: THREE.Mesh[] = []; let removes: (() => void)[] = [];
      const showCards = () => {
        C.cards.forEach((card, i) => {
          const cv = document.createElement('canvas'); cv.width = 128; cv.height = 180; const g = cv.getContext('2d')!;
          g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 128, 180); g.strokeStyle = '#c9a43a'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 168);
          g.fillStyle = '#6b1f2a'; g.font = 'bold 96px Georgia'; g.textAlign = 'center'; g.fillText(card.letter, 64, 120);
          const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.02), new THREE.MeshBasicMaterial({ map: tex }));
          removes.push(ctx.world.addObject(m, ctx.world.questGiverPosition().space === 'exterior' ? { x: b.x, z: b.z } : 'npc.bednar.office'));
          m.position.set(b.x + (i - 1.5) * 0.36, b.y + 1.35, b.z + 0.5); m.rotation.y = (i - 1.5) * -0.12; props.push(m);
        });
      };
      const lines = C.dialogue.assign;
      const steps = bednarSteps(ctx, lines);
      steps[1] = { ...steps[1], run: showCards };
      steps.splice(2, 0, { dur: 2.4, look: { x: b.x, y: b.y + 1.4, z: b.z }, tick: (_dt, k) => {
        props.forEach((m, i) => { const ki = Math.max(0, Math.min(1, k * 4 - i)); m.position.lerpVectors(new THREE.Vector3(b.x + (i - 1.5) * 0.36, b.y + 1.35, b.z + 0.5), new THREE.Vector3(p.x, p.y + 1.2, p.z), ki); });
      } });
      await ctx.cutscene({ id: 'q3-handoff', steps, onDone: () => { ctx.progress.set('cards', true); start(); }, cleanup: () => { removes.forEach(r => r()); removes = []; props.length = 0; } });
      registerJournalButton();
      await journal(true);
    },
    objective: () => `Find the hidden letters (${ctx ? found().length : 0}/4)`,
    briefing: () => C.dialogue.assign,
    reminder: () => [{ speaker: C.dialogue.assign[0].speaker, text: C.dialogue.reminder }],
    update() {
      if (!ctx || !ctx.isActive() || !eraOk()) return;
      const m = C.modes[ctx.difficulty()]; if (!m.proximityFeedback) return;
      const pp = ctx.world.playerPosition(); if (pp.space !== 'exterior') return;
      const near = ctx.progress.get<string[]>('near', []);
      for (const card of C.cards) {
        if (found().includes(card.letter) || near.includes(card.letter)) continue;
        const lp = ctx.world.position(card.anchor);
        if (Math.hypot(lp.x - pp.x, lp.z - pp.z) < m.proximityMeters) { ctx.progress.set('near', [...near, card.letter]); ctx.ui.toast(`You're in the right area for ${card.letter}. Look closely at the surroundings.`); }
      }
    },
    qualityScore: () => Math.max(0, 1 - 0.08 * ctx.progress.get('hints', 0) - 0.1 * ctx.progress.get('wrong', 0)),
    skippedFraction: () => 0,
    dispose() {
      // Continue/New game re-register the module: retire its previous sign and props.
      for (const object of objs) object.removeFromParent(); objs.length = 0;
      sign?.group.removeFromParent(); sign = null; signGlyphs.clear();
      if (ctx) {
        for (const card of C.cards) ctx.world.removeInspectable(`letter-${card.letter}`);
        for (let i = 0; i < 4; i++) ctx.world.removeInspectable(`decoy-${i}`);
        ctx.removeInteractable('sign');
      }
    },
  };
}

function GAME_CONFIG_SIGN_YAW(ctx: QuestContext) { return ctx.world.location(ctx.config.signAnchor).yaw ?? 0; }
