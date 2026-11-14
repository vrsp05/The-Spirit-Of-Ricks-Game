// 1A. Math — "Binary, the Nephite way" (Romney Building, Math & Computer Science).
// The CS students keep tripping on binary; the candidate explains it with the gold coins
// of Alma 11 (senine 1, seon 2, shum 4, limnah 7 = 1 + 2 + 4). Students ask; the player
// answers. Easy: every question is multiple choice. Hard: pay questions use a coin tray
// and must use the fewest coins. Data: data/math.json (values checked against Alma 11).
import data from './data/math.json';
import type { ChallengeBody } from '../shared/frame';
import { btn, h } from '../shared/frame';
import { classroom } from './classroom';
import { chalk, text } from './room3d';

export interface Coin { id: string; metal: 'gold' | 'silver'; value: number }
export interface Question { id: string; kind: 'pay' | 'choice'; who: string; ask: string; target?: number; modes: string[]; options: string[]; correct: string; explain: string; reaction?: string; bits?: number[]; boardNote?: string }
export const MATH = data as unknown as {
  source: string; story: string; reference: { gold: string; silver: string; value: number; note: string }[];
  coins: Coin[]; tray: string[]; questions: Question[];
  opening: { who: string; text: string }[]; howItWorks: string[]; tutorial: { who: string; ask: string; target: number; steps: { coin: string; say: string }[]; wrong: string; done: string }; closing: { student: string; candidate: string };
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
  let phase: 'intro' | 'ask' | 'review' = 'intro', reveal: number[] | null = null, revealExtra = '', tutStep = 0;
  const tut = MATH.tutorial;
  const later = (fn: () => void, ms: number) => window.setTimeout(() => { if (!dead) fn(); }, ms);

  const qEl = h('div', { class: 'q1-bin-q' });
  const board = h('div', { class: 'q1-bin-board' });
  const work = h('div', {});
  const fb = h('div', { class: 'q1-bin-fb', 'aria-live': 'polite' });
  const score = h('div', { class: 'q1-bin-score' });
  root.append(h('div', { class: 'q1-bin' }, qEl, board, fb, work, score));

  const q = () => qs[qi];
  const usesTray = () => mode.tray && q()?.kind === 'pay';
  const renderBoard = () => {
    const held = usesTray() && phase === 'ask' ? hand : [];
    const b = reveal ?? bits(held), extra = held.filter(id => id === 'limnah').length;
    const blank = !reveal && !held.length;
    const value = b[0] * 4 + b[1] * 2 + b[2];
    board.replaceChildren(...(['shum', 'seon', 'senine'] as const).map((id, k) =>
      h('div', { class: `q1-bin-col ${b[k] && !blank ? 'on' : ''} ${hintCoins.includes(id) ? 'hl' : ''}` }, h('span', { class: 'bit', text: blank ? '?' : b[k] ? '✔' : '·' }), h('span', { text: `${id} (${coin(id).value})` }), h('span', { text: blank ? '?' : String(b[k]) }))),
      h('div', { class: 'q1-bin-num', text: blank ? '= ? ? ?' : reveal ? `= ${b.join(' ')} → ${value}${revealExtra}` : `= ${b.join(' ')}${extra ? ' + limnah' : ''}` }));
  };
  // ---- 3D classroom surfaces (chalkboard + coin poster) ----
  const room = cls?.room ?? null;
  const drawPoster = () => {
    const p = room?.get('poster'); if (!p) return;
    const g = p.g; g.fillStyle = '#efe3c2'; g.fillRect(0, 0, p.w, p.h); g.strokeStyle = '#7a5a2a'; g.lineWidth = 14; g.strokeRect(7, 7, p.w - 14, p.h - 14);
    const serif = 'Georgia, serif';
    let y = text(p, 'ALMA 11', p.w / 2, 40, 64, '#5a3a12', 'center', serif);
    y = text(p, 'Nephite gold coins', p.w / 2, y, 40, '#5a3a12', 'center', serif) + 20;
    for (const id of ['senine', 'seon', 'shum', 'limnah']) {
      g.fillStyle = '#d9a52b'; g.beginPath(); g.arc(110, y + 38, 36, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#6b4a0e'; g.lineWidth = 5; g.stroke();
      text(p, String(coin(id).value), 110, y + 14, 44, '#3a2600', 'center', serif);
      text(p, id, 175, y + 8, 46, '#2a211a', 'left', serif);
      text(p, id === 'limnah' ? '“the value of them all”' : id === 'senine' ? 'a judge’s pay for one day' : `${coin(id).value} senines`, 175, y + 52, 26, '#5a4a3a', 'left', serif);
      y += 110;
    }
    y += 10; text(p, 'An onti (silver) is worth the same as a limnah: 7.', p.w / 2, y, 26, '#5a3a12', 'center', serif, p.w - 60);
    p.refresh();
  };
  const drawBoard = () => {
    const b = room?.get('board'); if (!b) return;
    chalk(b);
    const cur = q();
    if (phase === 'intro' || !cur) {
      text(b, 'TUTORIAL', b.w - 70, 30, 30, '#9cff57', 'right');
      const y = text(b, `${tut.who}:`, 70, 36, 38, '#ffe08a');
      text(b, `“${tut.ask}”`, 70, y, 44, '#f1efe6', 'left', undefined, b.w - 300);
    } else {
      const y = text(b, `${cur.who}:`, 70, 36, 38, '#ffe08a');
      text(b, `“${cur.ask}”`, 70, y, cur.ask.length > 70 ? 34 : 44, '#f1efe6', 'left', undefined, b.w - 140);
    }
    const held = phase === 'intro' ? hand : usesTray() && phase === 'ask' ? hand : [];
    const bs = reveal ?? bits(held), blank = !reveal && !held.length;
    const cols = ['shum', 'seon', 'senine'], cx = [b.w * 0.25, b.w * 0.42, b.w * 0.59], top = b.h * 0.56;
    cols.forEach((id, k) => {
      const hl = hintCoins.includes(id);
      if (hl) { b.g.strokeStyle = '#9cff57'; b.g.lineWidth = 6; b.g.setLineDash([16, 10]); b.g.strokeRect(cx[k] - 95, top - 20, 190, 230); b.g.setLineDash([]); }
      text(b, blank ? '?' : bs[k] ? '✔' : '·', cx[k], top, 84, bs[k] && !blank ? '#ffd34d' : '#f1efe6', 'center');
      text(b, `${id} (${coin(id).value})`, cx[k], top + 100, 34, '#f1efe6', 'center');
      text(b, blank ? '?' : String(bs[k]), cx[k], top + 145, 44, '#f1efe6', 'center');
    });
    const value = bs[0] * 4 + bs[1] * 2 + bs[2];
    const num = blank ? '= ? ? ?' : reveal ? `= ${bs.join(' ')} → ${value}` : `= ${bs.join(' ')}`;
    text(b, num, b.w * 0.70, top + 40, 72, '#ffd34d');
    if (reveal && revealExtra) text(b, revealExtra.trim(), b.w * 0.70, top + 130, 34, '#ffe08a', 'left', undefined, b.w * 0.28);
    b.refresh();
  };
  const renderScore = () => score.textContent = phase === 'intro' ? 'Tutorial — not scored' : `Question ${Math.min(qi + 1, qs.length)} of ${qs.length} · misses ${misses} / ${mode.misses} allowed`;
  // ---- guided tutorial: "Pay 5", walked through coin by coin (not scored) ----
  const renderIntro = () => {
    qEl.replaceChildren(h('b', { text: `Tutorial — ${tut.who}: ` }), `“${tut.ask}”`);
    const step = tut.steps[tutStep];
    hintCoins = step ? [step.coin] : [];
    if (!step) { reveal = bits(hand); revealExtra = '  (shum + senine)'; }
    const tray = h('div', { class: 'q1-tray' }, ...MATH.tray.map((id, k) => {
      const c = h('div', { class: `q1-coin ${k === sel ? 'sel' : ''} ${step && id === step.coin ? 'hinted' : ''}` }, h('span', {}, id, h('i', { text: String(coin(id).value) })));
      c.addEventListener('click', () => { sel = k; tutAdd(); }); return c;
    }));
    const handEl = h('div', { class: 'q1-hand' }, ...hand.map(id => h('div', { class: 'q1-coin' }, h('span', {}, id, h('i', { text: String(coin(id).value) })))), hand.length ? h('b', { text: ` = ${comboValue(hand)} of ${tut.target}` }) : '');
    fb.className = `q1-bin-fb ${step ? '' : 'ok'}`; fb.textContent = step ? `Step ${tutStep + 1}: ${step.say}` : `✔ ${tut.done}`;
    const parts: (HTMLElement | string)[] = [tray, handEl];
    if (!step) { const b = btn('Start the lesson ▶', () => startLesson(), 'q1-next sel'); b.removeAttribute('data-focus'); parts.push(b); }
    work.replaceChildren(...parts);
    renderBoard(); renderScore(); drawBoard();
  };
  const tutAdd = () => {
    const step = tut.steps[tutStep]; if (!step) return;
    const id = MATH.tray[sel];
    if (id !== step.coin) { fb.className = 'q1-bin-fb bad'; fb.textContent = `${tut.wrong} (${step.say})`; return; }
    hand.push(id); tutStep++; cls?.react('nod', tutStep >= tut.steps.length ? 'Ohhh — 1 0 1 is 5!' : undefined);
    sel = Math.max(0, MATH.tray.indexOf(tut.steps[tutStep]?.coin ?? 'senine'));
    renderIntro();
  };
  const startLesson = () => { hand = []; phase = 'ask'; reveal = null; revealExtra = ''; load(); };
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
        const mark = phase === 'review' ? (o === cur.correct ? 'right' : k === sel ? 'wrong' : '') : '';
        const b = btn(o, () => { if (phase === 'review') return next(); sel = k; choose(); }, `${k === sel && phase === 'ask' ? 'sel' : ''} ${gone.has(o) ? 'gone' : ''} ${mark}`); b.removeAttribute('data-focus'); return b;
      })));
    }
    if (phase === 'review') { const b = btn(qi + 1 < qs.length ? 'Next question ▶' : 'Finish the lesson ▶', () => next(), 'q1-next'); b.removeAttribute('data-focus'); work.append(b); }
    renderBoard(); renderScore(); drawBoard();
  };
  const load = () => {
    hand = []; gone = new Set(); hintCoins = []; hintStep = 0; sel = 0; busy = false; phase = 'ask'; reveal = null; revealExtra = ''; fb.textContent = ''; fb.className = 'q1-bin-fb';
    const cur = q(); if (!cur) return end();
    opts = shuffle([...cur.options]);
    renderQ();
  };
  const answered = (ok: boolean, nonMinimal = false) => {
    const cur = q(); busy = true; phase = 'review';
    if (cur.bits) { reveal = cur.bits; revealExtra = cur.boardNote ?? (cur.kind === 'pay' ? `  (${cur.correct})` : ''); }
    else if (cur.kind === 'pay') { reveal = null; }
    if (ok) { right++; cls?.react('nod', cur.reaction); fb.className = 'q1-bin-fb ok'; fb.textContent = `✔ Right! ${cur.explain}`; }
    else {
      misses++;
      cls?.react('confused', nonMinimal ? 'Right amount — but can you do it with fewer coins?' : undefined);
      fb.className = 'q1-bin-fb bad';
      fb.textContent = `${nonMinimal ? 'Right amount, but not the fewest coins. ' : '✖ Not quite. '}${cur.explain}`;
      if (misses > mode.misses) { renderQ(); later(() => api.finish({ pass: false, quality: 0, summary: `${misses} misses — the class is still confused. (${mode.misses} allowed.)` }), 2200); return; }
    }
    busy = false; renderQ();
  };
  const next = () => { if (phase !== 'review') return; qi++; load(); };
  const choose = () => {
    if (busy || usesTray() || phase !== 'ask') return; const cur = q(), o = opts[sel]; if (gone.has(o)) return;
    const valid = cur.kind === 'pay' && comboValue(parseCombo(o)) === cur.target;
    answered(o === cur.correct, valid && o !== cur.correct);
  };
  const add = () => {
    if (busy || !usesTray() || phase !== 'ask') return;
    const cur = q(); hand.push(MATH.tray[sel]); hintCoins = [];
    const sum = comboValue(hand), best = fewestCoins(cur.target!, MATH.tray)!.length;
    if (sum === cur.target) { answered(hand.length <= best, hand.length > best); renderQ(); return; }
    if (sum > cur.target!) api.setStatus('That’s more than the student asked for — take a coin back (②).');
    else api.setStatus('');
    renderQ();
  };
  const end = () => {
    busy = true; work.replaceChildren(); qEl.replaceChildren(h('b', { text: 'Lesson complete. ' }), 'The class is talking it over…');
    cls?.react('nod', MATH.closing.student, 'Sister Hall');
    later(() => cls?.react('nod', MATH.closing.candidate, 'You'), 1600);
    later(() => api.finish({ pass: misses <= mode.misses, quality: Math.max(0, right / qs.length - api.hintsUsed() * 0.05),
      summary: `${right} of ${qs.length} questions answered right (${misses} miss${misses === 1 ? '' : 'es'}). The class gets binary now.` }), 3200);
  };

  api.setControls(mode.tray
    ? [['L', 'choose coin / answer'], ['1', 'put coin down / answer'], ['2', 'take coin back'], ['RU', 'clear hand'], ['3', 'hint'], ['4', 'tools']]
    : [['L', 'choose answer'], ['1', 'answer'], ['3', 'hint'], ['4', 'tools']]);
  api.onHint(() => {
    if (hintsLeft <= 0 || busy || phase !== 'ask') return null;
    const cur = q(); hintsLeft--; hintStep++;
    if (cur.kind === 'pay') {
      if (hintStep === 1) return 'Start with the biggest coin that fits, then fill in the rest.';
      hintCoins = parseCombo(cur.correct); renderQ();
      return `Look at the board — the highlighted coins add up to ${cur.target}.`;
    }
    const wrong = opts.filter(o => o !== cur.correct && !gone.has(o));
    if (wrong[0]) { gone.add(wrong[0]); renderQ(); }
    if (cur.id === 'zeezrom') return 'A limnah (or an onti) is 7 days of a judge’s pay. Six of them is…';
    if (cur.id === 'read011') { hintCoins = ['seon', 'senine']; renderQ(); return 'A 1 means the coin is in your hand. Add up the coins marked 1.'; }
    return 'Add up 1 + 2 + 4.';
  });
  api.onAction(a => {
    if (busy) return true;
    if (a === 'rup' && room) { room.nextView(); const vb = (root.closest('.ch-body') as (HTMLElement & { q1ViewBtn?: HTMLElement }) | null)?.q1ViewBtn; if (vb) vb.textContent = `👁 View: ${room.viewLabel(room.current)} (T)`; return true; }
    if (phase === 'intro') {
      const n4 = MATH.tray.length;
      if (a === 'left' || a === 'up' || a === 'alt2') { sel = (sel + n4 - 1) % n4; renderIntro(); return true; }
      if (a === 'right' || a === 'down' || a === 'alt') { sel = (sel + 1) % n4; renderIntro(); return true; }
      if (a === 'confirm') { tut.steps[tutStep] ? tutAdd() : startLesson(); return true; }
      return a !== 'back' && a !== 'hint';
    }
    if (phase === 'review') { if (a === 'confirm') next(); return a !== 'back' && a !== 'hint'; }
    const n = usesTray() ? MATH.tray.length : opts.length;
    if (a === 'left' || a === 'up' || a === 'alt2') { sel = (sel + n - 1) % n; renderQ(); return true; }
    if (a === 'right' || a === 'down' || a === 'alt') { sel = (sel + 1) % n; renderQ(); return true; }
    if (a === 'confirm') { usesTray() ? add() : choose(); return true; }
    if (a === 'back') { if (usesTray() && hand.length) { hand.pop(); renderQ(); } return true; }
    if (a === 'rup' && room) { room.nextView(); const vb = (root.closest('.ch-body') as (HTMLElement & { q1ViewBtn?: HTMLElement }) | null)?.q1ViewBtn; if (vb) vb.textContent = `👁 View: ${room.viewLabel(room.current)} (T)`; return true; }
    if (a === 'rup' || a === 'rdown') { if (usesTray()) { hand = []; renderQ(); } return true; }
    return false;
  });

  MATH.opening.forEach((l, i) => later(() => cls?.react(i ? 'nod' : 'confused', l.text, l.who), 200 + i * 2200));
  drawPoster();
  sel = MATH.tray.indexOf(tut.steps[0].coin);
  renderIntro();
  return () => { busy = true; dead = true; };
};
