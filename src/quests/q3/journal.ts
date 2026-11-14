// Card journal: four collectible clue cards (ivory paper, gold border, burgundy/navy accents,
// letter emblem). The front never names the building: the player works it out from the clues.
// Browse, flip, request hints, open the map.
// Navigable with mouse, keyboard and controllers; respects reduced motion.
import type { QuestContext } from '../contract';
import { btn, h, legend } from '../shared/frame';

export interface Card { letter: string; destination: string /* internal only — never shown */; anchor: string; scripture: { text: string; ref: string } | null; note: string; hints: { broad: string; view: string } }
export type CardState = 'unfound' | 'found' | 'placed';

export function openJournal(ctx: QuestContext, opts: { cards: Card[]; state: (l: string) => CardState; noteLabel: string; intro?: boolean;
  hintsAllowed: { view: boolean }; onHint: (letter: string, kind: 'broad' | 'view') => void; openMap: () => void }): Promise<void> {
  return ctx.ui.custom('', (root, panel) => {
    const flipped = new Set<string>();
    const hintText = new Map<string, string>();
    const wrap = h('div', { class: `journal ${opts.intro && !ctx.world.reducedMotion() ? 'intro' : ''}` });
    root.append(h('div', { class: 'journal-head' }, h('h2', { text: 'Journal — clue cards' }), h('p', { class: 'journal-goal', text: 'Using the hint, find the building where the letter is hidden.' }), h('p', { class: 'small', text: 'Flip a card (confirm/click) to read President Bednar’s note. The letter hides in the architecture or surroundings of that building.' })), wrap,
      h('div', { class: 'ch-footer tools-zone' }, h('span', { class: 'tools-label', text: '④ Tools' }), btn('Open map', () => { panel.close(null); opts.openMap(); }), btn('Close', () => panel.close(null))),
      h('div', { class: 'legend-box' }, legend([['L', 'choose card'], ['1', 'flip card'], ['3', 'hint for this card'], ['2', 'close'], ['4', 'tools']])));
    // ③ on the focused card: broad hint first, then (Easy) the viewpoint hint
    panel.onAction(a => {
      if (a !== 'hint') return false;
      const faces = [...wrap.querySelectorAll<HTMLElement>('.card-face')], i = Math.max(0, faces.findIndex(f => f.classList.contains('focused')));
      const c = opts.cards[i]; if (!c || opts.state(c.letter) !== 'unfound') return true;
      const kind: 'broad' | 'view' = hintText.get(c.letter) === c.hints.broad && opts.hintsAllowed.view ? 'view' : 'broad';
      hintText.set(c.letter, c.hints[kind]); flipped.add(c.letter); opts.onHint(c.letter, kind); render(); focusCard(i);
      return true;
    });
    const render = () => {
      wrap.replaceChildren(...opts.cards.map((c, i) => {
        const st = opts.state(c.letter), isBack = flipped.has(c.letter);
        const card = h('div', { class: `card ${st} ${isBack ? 'back' : ''}`, style: `--i:${i}` });
        const face = h('button', { class: 'card-face', 'data-focus': true, type: 'button', 'aria-label': `Card ${c.letter}, ${st}. Press to flip.` });
        if (!isBack) {
          face.append(h('div', { class: 'emblem', text: c.letter }), h('div', { class: 'dest', text: 'Which building? Read the clue.' }),
            c.scripture ? h('blockquote', {}, h('p', { text: `“${c.scripture.text}”` }), h('cite', { text: `— ${c.scripture.ref}` })) : h('p', { class: 'no-scripture', text: '(no scripture on this card)' }),
            h('div', { class: `status ${st}`, text: st === 'unfound' ? 'Not found yet' : st === 'found' ? 'Found — place it on the sign' : 'Placed on the sign' }));
        } else {
          face.append(h('div', { class: 'emblem small', text: c.letter }), h('div', { class: 'note-label', text: opts.noteLabel }), h('p', { class: 'note', text: c.note }),
            ...(hintText.get(c.letter) ? [h('p', { class: 'card-hint', text: hintText.get(c.letter)! })] : []));
        }
        face.addEventListener('click', () => { if (flipped.has(c.letter)) flipped.delete(c.letter); else flipped.add(c.letter); render(); focusCard(i); });
        card.append(face);
        if (isBack && st === 'unfound') {
          card.append(h('div', { class: 'card-hints' },
            btn('Broad hint', () => { hintText.set(c.letter, c.hints.broad); opts.onHint(c.letter, 'broad'); render(); focusCard(i); }),
            opts.hintsAllowed.view ? btn('Viewpoint hint', () => { hintText.set(c.letter, c.hints.view); opts.onHint(c.letter, 'view'); render(); focusCard(i); }) : null));
        }
        return card;
      }));
      panel.refocus();
    };
    const focusCard = (i: number) => { const f = wrap.querySelectorAll<HTMLElement>('.card-face')[i]; f?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); };
    render();
  }, { wide: true, className: 'journal-screen fullscreen' }).then(() => undefined);
}
