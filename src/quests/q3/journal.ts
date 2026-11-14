// Card journal: four collectible clue cards (ivory paper, gold border, burgundy/navy accents,
// letter emblem, small line illustration). Browse, flip, request hints, open the map.
// Navigable with mouse, keyboard and controllers; respects reduced motion.
import type { QuestContext } from '../contract';
import { btn, h, legend } from '../shared/frame';

export interface Card { letter: string; destination: string; anchor: string; art: string; scripture: { text: string; ref: string } | null; note: string; hints: { broad: string; view: string } }
export type CardState = 'unfound' | 'found' | 'placed';

const ART: Record<string, string> = {
  books: '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="6" y="10" width="10" height="26"/><rect x="18" y="6" width="9" height="30"/><rect x="29" y="12" width="11" height="24"/><path d="M44 36 L52 8 L58 10 L50 37 Z"/><line x1="2" y1="37" x2="62" y2="37"/></svg>',
  temple: '<svg viewBox="0 0 64 40" aria-hidden="true"><line x1="32" y1="2" x2="32" y2="8"/><path d="M29 8 L35 8 L35 14 L29 14 Z"/><path d="M26 14 L38 14 L38 20 L26 20 Z"/><rect x="12" y="20" width="40" height="16"/><rect x="18" y="24" width="4" height="8"/><rect x="42" y="24" width="4" height="8"/><rect x="29" y="27" width="6" height="9"/><line x1="4" y1="37" x2="60" y2="37"/></svg>',
  track: '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="6" y="8" width="52" height="26" rx="13"/><rect x="14" y="14" width="36" height="14" rx="7"/><line x1="32" y1="8" x2="32" y2="14"/></svg>',
  note: '<svg viewBox="0 0 64 40" aria-hidden="true"><ellipse cx="24" cy="32" rx="6" ry="4"/><line x1="30" y1="32" x2="30" y2="6"/><path d="M30 6 Q42 10 40 20"/><ellipse cx="44" cy="28" rx="5" ry="3.5"/><line x1="49" y1="28" x2="49" y2="8"/></svg>',
};

export function openJournal(ctx: QuestContext, opts: { cards: Card[]; state: (l: string) => CardState; noteLabel: string; intro?: boolean;
  hintsAllowed: { view: boolean }; onHint: (letter: string, kind: 'broad' | 'view') => void; openMap: () => void }): Promise<void> {
  return ctx.ui.custom('', (root, panel) => {
    const flipped = new Set<string>();
    const hintText = new Map<string, string>();
    const wrap = h('div', { class: `journal ${opts.intro && !ctx.world.reducedMotion() ? 'intro' : ''}` });
    root.append(h('div', { class: 'journal-head' }, h('h2', { text: 'Journal — clue cards' }), h('p', { class: 'small', text: 'Confirm/click a card to flip it. Each card names a place; the letter hides in the architecture or surroundings there.' })), wrap,
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
        const face = h('button', { class: 'card-face', 'data-focus': true, type: 'button', 'aria-label': `Card ${c.letter}: ${c.destination}, ${st}. Press to flip.` });
        if (!isBack) {
          face.append(h('div', { class: 'emblem', text: c.letter }), h('div', { class: 'card-art' }), h('div', { class: 'dest', text: c.destination }),
            c.scripture ? h('blockquote', {}, h('p', { text: `“${c.scripture.text}”` }), h('cite', { text: `— ${c.scripture.ref}` })) : h('p', { class: 'no-scripture', text: '(no scripture on this card)' }),
            h('div', { class: `status ${st}`, text: st === 'unfound' ? 'Not found yet' : st === 'found' ? 'Found — place it on the sign' : 'Placed on the sign' }));
          (face.querySelector('.card-art') as HTMLElement).innerHTML = ART[c.art] ?? '';
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
