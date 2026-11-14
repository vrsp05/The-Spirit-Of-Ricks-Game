// 1A. Math — "Binary, the Nephite way" (Romney Building, Math & Computer Science).
// The CS students keep tripping on binary; the candidate explains it with the gold coins
// of Alma 11 (senine 1, seon 2, shum 4, limnah 7 = 1 + 2 + 4). Students ask; the player
// answers. Easy: every question is multiple choice. Hard: pay questions use a coin tray
// and must use the fewest coins. Data: data/math.json (values checked against Alma 11).
import data from './data/math.json';
import type { ChallengeBody } from '../shared/frame';
import { btn, h } from '../shared/frame';
import { classroom } from './classroom';

export interface Coin { id: string; metal: 'gold' | 'silver'; value: number }
export interface Question { id: string; kind: 'pay' | 'choice'; who: string; ask: string; target?: number; modes: string[]; options: string[]; correct: string; explain: string; reaction?: string }
export const MATH = data as unknown as {
  source: string; story: string; reference: { gold: string; silver: string; value: number; note: string }[];
  coins: Coin[]; tray: string[]; questions: Question[];
  opening: { who: string; text: string }[]; closing: { student: string; candidate: string };
  modes: Record<string, { misses: number; hints: number; tray: boolean }>;
};

export const coin = (id: string) => MATH.coins.find(c => c.id === id)!;
/** All values are multiples of a leah (⅛); work in integer leahs. */
export const units = (v: number) => Math.round(v * 8);

/** Fewest coins (unbounded) summing exactly to `target`; returns the coin ids or null. */
export function fewestCoins(target: number, ids: string[]): string[] | null {
  const T = units(target); if (T < 0) return null;
  const best: (string[] | null)[] = Array(T + 1).fill(null); best[0] = [];
  for (let t = 1; t <= T; t++) for (const id of ids) {
    const u = units(coin(id).value), prev = t - u >= 0 ? best[t - u] : null;
    if (prev && (!best[t] || prev.length + 1 < best[t]!.length)) best[t] = [...prev, id];
  }
  return best[T];
}
/** "shum + senine" → ['shum','senine'] */
export const parseCombo = (s: string) => s.split('+').map(t => t.trim()).filter(Boolean);
export const comboValue = (ids: string[]) => ids.reduce((n, id) => n + coin(id).value, 0);
/** Binary digits for shum·seon·senine (amounts 0–7 paid with at most one of each). */
export const bits = (ids: string[]) => ['shum', 'seon', 'senine'].map(id => (ids.includes(id) ? 1 : 0));
export const questionsFor = (diff: string) => MATH.questions.filter(q => q.modes.includes(diff));

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const mathChallenge: ChallengeBody = (root, api) => {
  const mode = MATH.modes[api.difficulty];
  const qs = questionsFor(api.difficulty);
  const cls = classroom();
  let qi = 0, misses = 0, right = 0, hintsLeft = mode.hints, hintStep = 0, sel = 0, busy = false;
  let hand: string[] = [], opts: string[] = [], gone = new Set<string>(), hintCoins: string[] = [], dead = false;
  const later = (fn: () => void, ms: number) => window.setTimeout(() => { if (!dead) fn(); }, ms);

  const qEl = h('div', { class: 'q1-bin-q' });
  const board = h('div', { class: 'q1-bin-board' });
  const work = h('div', {});
  const score = h('div', { class: 'q1-bin-score' });
  root.append(h('div', { class: 'q1-bin' }, qEl, board, work, score));

  const q = () => qs[qi];
  const usesTray = () => mode.tray && q()?.kind === 'pay';
  const renderBoard = () => {
    const held = usesTray() ? hand : [];
    const b = bits(held), extra = held.filter(id => id === 'limnah').length;
    board.replaceChildren(...(['shum', 'seon', 'senine'] as const).map((id, k) =>
      h('div', { class: `q1-bin-col ${b[k] ? 'on' : ''} ${hintCoins.includes(id) ? 'hl' : ''}` }, h('span', { class: 'bit', text: b[k] ? '✔' : '·' }), h('span', { text: `${id} (${coin(id).value})` }), h('span', { text: String(b[k]) }))),
      h('div', { class: 'q1-bin-num', text: held.length ? `= ${b.join('')}${extra ? ' + limnah' : ''}` : '= 1 0 1 ?' }));
  };
  const renderScore = () => score.textContent = `Question ${Math.min(qi + 1, qs.length)} of ${qs.length} · misses ${misses} / ${mode.misses} allowed`;
  const renderQ = () => {
    const cur = q(); if (!cur) return;
    qEl.replaceChildren(h('b', { text: `${cur.who}: ` }), `“${cur.ask}”`);
    if (usesTray()) {
      const sum = comboValue(hand);
      work.replaceChildren(
        h('div', { class: 'q1-tray' }, ...MATH.tray.map((id, k) => { const c = h('div', { class: `q1-coin ${k === sel ? 'sel' : ''} ${hintCoins.includes(id) ? 'hinted' : ''}` }, h('span', {}, id, h('i', { text: String(coin(id).value) }))); c.addEventListener('click', () => { sel = k; add(); }); return c; })),
        h('div', { class: 'q1-hand' }, hand.length ? '' : 'Your hand is empty — ① puts the selected coin down.', ...hand.map(id => h('div', { class: 'q1-coin' }, h('span', {}, id, h('i', { text: String(coin(id).value) })))), hand.length ? h('b', { text: ` = ${sum} of ${cur.target}` }) : ''));
    } else {
      work.replaceChildren(h('div', { class: 'q1-choices' }, ...opts.map((o, k) => {
        const b = btn(o, () => { sel = k; choose(); }, `${k === sel ? 'sel' : ''} ${gone.has(o) ? 'gone' : ''}`); b.removeAttribute('data-focus'); return b;
      })));
    }
    renderBoard(); renderScore();
  };
  const load = () => {
    hand = []; gone = new Set(); hintCoins = []; hintStep = 0; sel = 0; busy = false;
    const cur = q(); if (!cur) return end();
    opts = shuffle([...cur.options]);
    renderQ();
  };
  const answered = (ok: boolean, nonMinimal = false) => {
    const cur = q(); busy = true;
    if (ok) { right++; cls?.react('nod', cur.reaction); api.setStatus(`✔ ${cur.explain}`); }
    else {
      misses++;
      cls?.react('confused', nonMinimal ? 'Right amount — but can you do it with fewer coins?' : undefined);
      api.setStatus(`${nonMinimal ? 'Right amount, but not the fewest coins. ' : '✖ Not quite. '}${cur.explain}`);
      if (misses > mode.misses) { later(() => api.finish({ pass: false, quality: 0, summary: `${misses} misses — the class is still confused. (${mode.misses} allowed.)` }), 1200); return; }
    }
    later(() => { qi++; load(); }, 1500);
  };
  const choose = () => { if (busy || usesTray()) return; const o = opts[sel]; if (gone.has(o)) return; answered(o === q().correct); };
  const add = () => {
    if (busy || !usesTray()) return;
    const cur = q(); hand.push(MATH.tray[sel]); hintCoins = [];
    const sum = comboValue(hand), best = fewestCoins(cur.target!, MATH.tray)!.length;
    if (sum === cur.target) { answered(hand.length <= best, hand.length > best); renderQ(); return; }
    if (sum > cur.target!) api.setStatus('That’s more than the student asked for — take a coin back (②).');
    else api.setStatus('');
    renderQ();
  };
  const end = () => {
    cls?.react('nod', MATH.closing.student, 'Sister Hall');
    later(() => cls?.react('nod', MATH.closing.candidate, 'You'), 1600);
    later(() => api.finish({ pass: misses <= mode.misses, quality: Math.max(0, right / qs.length - api.hintsUsed() * 0.05),
      summary: `${right} of ${qs.length} questions answered right (${misses} miss${misses === 1 ? '' : 'es'}). The class gets binary now.` }), 3200);
  };

  api.setControls(mode.tray
    ? [['L', 'choose coin / answer'], ['1', 'put coin down / answer'], ['2', 'take coin back'], ['RU', 'clear hand'], ['3', 'hint'], ['4', 'tools']]
    : [['L', 'choose answer'], ['1', 'answer'], ['3', 'hint'], ['4', 'tools']]);
  api.onHint(() => {
    if (hintsLeft <= 0 || busy) return null;
    const cur = q(); hintsLeft--; hintStep++;
    if (cur.kind === 'pay') {
      if (hintStep === 1) return 'Start with the biggest coin that fits, then fill in the rest.';
      hintCoins = parseCombo(cur.correct); renderQ();
      return `Look at the board — the highlighted coins add up to ${cur.target}.`;
    }
    const wrong = opts.filter(o => o !== cur.correct && !gone.has(o));
    if (wrong[0]) { gone.add(wrong[0]); renderQ(); }
    return cur.id === 'zeezrom' ? 'A limnah (or an onti) is 7 days of a judge’s pay. Six of them is…' : 'Add up 1 + 2 + 4.';
  });
  api.onAction(a => {
    if (busy) return true;
    const n = usesTray() ? MATH.tray.length : opts.length;
    if (a === 'left' || a === 'up' || a === 'alt2') { sel = (sel + n - 1) % n; renderQ(); return true; }
    if (a === 'right' || a === 'down' || a === 'alt') { sel = (sel + 1) % n; renderQ(); return true; }
    if (a === 'confirm') { usesTray() ? add() : choose(); return true; }
    if (a === 'back') { if (usesTray() && hand.length) { hand.pop(); renderQ(); } return true; }
    if (a === 'rup' || a === 'rdown') { if (usesTray()) { hand = []; renderQ(); } return true; }
    return false;
  });

  MATH.opening.forEach((l, i) => later(() => cls?.react(i ? 'nod' : 'confused', l.text, l.who), 200 + i * 2200));
  load();
  return () => { busy = true; dead = true; };
};
