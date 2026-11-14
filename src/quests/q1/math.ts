// 1A. Math — "Binary, the Nephite way" (Romney Building, Math & Computer Science).
// The CS students keep tripping on binary; the candidate explains it with the gold coins
// of Alma 11 (senine 1, seon 2, shum 4, limnah 7 = 1 + 2 + 4). Students ask; the player
// answers. Easy: every question is multiple choice. Hard: pay questions use a coin tray
// and must use the fewest coins. Data: data/math.json (values checked against Alma 11).
import data from './data/math.json';
import type { ChallengeBody } from '../shared/frame';
import { btn, h } from '../shared/frame';
import { classroom } from './classroom';
import { chalk, text, type Hotspot, type Surface } from './room3d';

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

/** The Alma 11 gold-coin poster on the classroom wall (also drawn before the demo starts). */
export function drawCoinPoster(p: Surface) {
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
}

let tutorialDone = false;
export const mathChallenge: ChallengeBody = (root, api) => {
  const mode = MATH.modes[api.difficulty];
  const qs = questionsFor(api.difficulty);
  const cls = classroom();
  let qi = 0, misses = 0, right = 0, hintsLeft = mode.hints, hintStep = 0, sel = 0, busy = false;
  let hand: string[] = [], opts: string[] = [], gone = new Set<string>(), hintCoins: string[] = [], dead = false;
  let failed = false;
  let phase: 'intro' | 'ask' | 'review' = 'intro', reveal: number[] | null = null, revealExtra = '', tutStep = 0;
  const tut = MATH.tutorial;
  const later = (fn: () => void, ms: number) => window.setTimeout(() => { if (!dead) fn(); }, ms);

  const qEl = h('div', { class: 'q1-bin-q' });
  const board = h('div', { class: 'q1-bin-board' });
  const work = h('div', { class: 'q1-bin-work' });
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
  const drawPoster = () => { const p = room?.get('poster'); if (p) drawCoinPoster(p); };
  const drawBoard = () => {
    const b = room?.get('board'); if (!b) return;
    chalk(b);
    const g = b.g, cur = q(), tutorial = phase === 'intro' || !cur;
    const who = tutorial ? tut.who : cur.who, ask = tutorial ? tut.ask : cur.ask;
    const L = b.w * 0.6;                                   // left: the question and the binary columns; right: what you click
    if (tutorial) text(b, 'TUTORIAL', L - 20, 28, 26, '#9cff57', 'right');
    let y = text(b, `${who}:`, 60, 28, 30, '#ffe08a');
    y = text(b, `“${ask}”`, 60, y, ask.length > 60 ? 30 : 38, '#f1efe6', 'left', undefined, L - 120);
    const held = phase === 'intro' ? hand : usesTray() && phase === 'ask' ? hand : [];
    const bs = reveal ?? bits(held), blank = !reveal && !held.length;
    const cols = ['shum', 'seon', 'senine'], cx = [b.w * 0.1, b.w * 0.2, b.w * 0.3], top = Math.max(y + 22, b.h * 0.38);
    cols.forEach((id, k) => {
      if (hintCoins.includes(id)) { g.strokeStyle = '#9cff57'; g.lineWidth = 5; g.setLineDash([14, 9]); g.strokeRect(cx[k] - 66, top - 10, 132, 160); g.setLineDash([]); }
      text(b, blank ? '?' : bs[k] ? '✔' : '·', cx[k], top, 64, bs[k] && !blank ? '#ffd34d' : '#f1efe6', 'center');
      text(b, `${id} (${coin(id).value})`, cx[k], top + 76, 26, '#f1efe6', 'center');
      text(b, blank ? '?' : String(bs[k]), cx[k], top + 106, 36, '#f1efe6', 'center');
    });
    const value = bs[0] * 4 + bs[1] * 2 + bs[2];
    text(b, blank ? '= ? ? ?' : reveal ? `= ${bs.join(' ')} → ${value}` : `= ${bs.join(' ')}`, b.w * 0.37, top + 30, 50, '#ffd34d');
    if (reveal && revealExtra) text(b, revealExtra.trim(), b.w * 0.37, top + 96, 26, '#ffe08a', 'left', undefined, L - b.w * 0.37 - 10);
    // ---- right column: chalk answers / coins / buttons you click ----
    const X = b.w * 0.63, RW = b.w - X - 40, spots: Hotspot[] = [];
    g.strokeStyle = 'rgba(241,239,230,.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(X - 24, 30); g.lineTo(X - 24, b.h - 30); g.stroke();
    const chalkBtn = (label: string, by: number, bh: number, on: boolean, act: () => void, color = '#f1efe6') => {
      g.strokeStyle = on ? '#ffd34d' : color; g.lineWidth = on ? 5 : 3; if (!on) g.setLineDash([12, 8]); g.strokeRect(X, by, RW, bh); g.setLineDash([]);
      text(b, label, X + 18, by + (bh - 32) / 2, 30, on ? '#ffd34d' : color, 'left', undefined, RW - 30);
      spots.push({ x: X, y: by, w: RW, h: bh, on: act });
    };
    const coinsRow = (onPick: (k: number) => void, hinted: string | null) => {
      MATH.tray.forEach((id, k) => {
        const r = 46, ccx = X + r + 6 + k * ((RW - 2 * r - 12) / 3), ccy = 92;
        g.fillStyle = 'rgba(255,211,77,.12)'; g.beginPath(); g.arc(ccx, ccy, r, 0, 7); g.fill();
        g.strokeStyle = k === sel ? '#ffd34d' : '#f1efe6'; g.lineWidth = k === sel ? 6 : 3; g.beginPath(); g.arc(ccx, ccy, r, 0, 7); g.stroke();
        if (hinted === id) { g.strokeStyle = '#9cff57'; g.lineWidth = 4; g.setLineDash([10, 7]); g.beginPath(); g.arc(ccx, ccy, r + 10, 0, 7); g.stroke(); g.setLineDash([]); }
        text(b, String(coin(id).value), ccx, ccy - 28, 36, '#ffd34d', 'center'); text(b, id, ccx, ccy + 12, 20, '#f1efe6', 'center');
        spots.push({ x: ccx - r, y: ccy - r, w: r * 2, h: r * 2, on: () => { sel = k; onPick(k); } });
      });
      text(b, 'Click a coin to put it down', X, 152, 22, '#cfd8cf');
      const total = comboValue(hand);
      text(b, hand.length ? `Hand: ${hand.join(' + ')} = ${total}` : 'Hand: empty', X, 190, 28, '#f1efe6', 'left', undefined, RW);
    };
    if (phase === 'intro') {
      const step = tut.steps[tutStep];
      coinsRow(() => tutAdd(), step?.coin ?? null);
      if (!step) chalkBtn('Start the lesson ▸', b.h - 150, 70, true, () => startLesson(), '#9cff57');
    } else if (cur && usesTray()) {
      coinsRow(() => { if (phase === 'ask') add(); }, hintCoins[0] ?? null);
      if (phase === 'ask' && hand.length) chalkBtn('Take back the last coin', b.h - 230, 60, false, () => { hand.pop(); renderQ(); });
      if (phase === 'review' && !failed) chalkBtn(qi + 1 < qs.length ? 'Next question ▸' : 'Finish the lesson ▸', b.h - 150, 70, true, () => next(), '#9cff57');
    } else if (cur) {
      const n = opts.length, bh = 64, gap = 14, y0 = 34;
      opts.forEach((o, k) => {
        const by = y0 + k * (bh + gap), isRight = o === cur.correct;
        if (phase === 'review') {
          const col = isRight ? '#9cff57' : k === sel ? '#ff8a7a' : 'rgba(241,239,230,.45)';
          g.strokeStyle = col; g.lineWidth = isRight ? 5 : 3; g.strokeRect(X, by, RW, bh);
          text(b, `${isRight ? '✔ ' : k === sel ? '✗ ' : ''}${o}`, X + 18, by + 16, 30, col, 'left', undefined, RW - 30);
        } else if (gone.has(o)) {
          g.strokeStyle = 'rgba(241,239,230,.25)'; g.lineWidth = 2; g.strokeRect(X, by, RW, bh);
          text(b, o, X + 18, by + 16, 30, 'rgba(241,239,230,.3)', 'left', undefined, RW - 30);
          g.strokeStyle = 'rgba(241,239,230,.5)'; g.beginPath(); g.moveTo(X + 12, by + bh / 2); g.lineTo(X + RW - 12, by + bh / 2); g.stroke();
        } else chalkBtn(o, by, bh, k === sel, () => { sel = k; choose(); });
      });
      if (phase === 'review' && !failed) chalkBtn(qi + 1 < qs.length ? 'Next question ▸' : 'Finish the lesson ▸', y0 + n * (bh + gap) + 6, 62, true, () => next(), '#9cff57');
    }
    room?.setRegion('question', 'board', { x: 40, y: 20, w: L - 60, h: y - 10 });
    room?.setRegion('columns', 'board', { x: cx[0] - 80, y: top - 16, w: b.w * 0.37 + 300 - cx[0], h: 170 });
    room?.setRegion('answers', 'board', { x: X - 10, y: 24, w: RW + 20, h: phase === 'intro' || usesTray() ? 200 : 330 });
    room?.setHotspots('board', spots);
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
  const startLesson = () => { tutorialDone = true; hand = []; phase = 'ask'; reveal = null; revealExtra = ''; load(); };
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
    if (phase === 'review' && !failed) { const b = btn(qi + 1 < qs.length ? 'Next question ▶' : 'Finish the lesson ▶', () => next(), 'q1-next'); b.removeAttribute('data-focus'); work.append(b); }
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
      if (misses > mode.misses) { failed = true; renderQ(); later(() => api.finish({ pass: false, quality: 0, summary: `${misses} misses — the class is still confused. (${mode.misses} allowed.)` }), 2200); return; }
    }
    busy = false; renderQ();
  };
  const next = () => { if (phase !== 'review' || failed) return; qi++; load(); };
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
  if (tutorialDone) startLesson(); else renderIntro();   // the tutorial plays once; retries go straight to the lesson
  return () => { busy = true; dead = true; };
};
