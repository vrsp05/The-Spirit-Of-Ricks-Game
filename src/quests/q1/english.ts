// 1D. English — "Red Pen Rush": the campus press prints the announcement paraphrase on a
// moving paper strip. Stamp each planted mistake as it passes the red line, then pick the
// right correction before the press rolls on. Data: data/english.json (fictional
// paraphrase, facts checked against the June 21, 2000 announcement).
import data from './data/english.json';
import type { ChallengeBody } from '../shared/frame';
import { btn, h, loop } from '../shared/frame';

export interface EnglishError { word: string; correct: string; options: string[]; why: string }
export const ENGLISH = data as unknown as {
  label: string; facts: string[]; passages: Record<string, { text: string; errors: EnglishError[] }>;
  modes: Record<string, { wrongAllowance: number; hints: number; hintStyle: 'glow' | 'count'; speed: number }>;
};

/** Tokenise and map each planted error to its token index (validated in tests). */
export function preparePassage(diff: string) {
  const p = ENGLISH.passages[diff];
  const tokens = p.text.split(' ');
  const errorAt = new Map<number, EnglishError>();
  for (const e of p.errors) {
    const i = tokens.findIndex((t, k) => t === e.word && !errorAt.has(k));
    if (i < 0) throw new Error(`English data: error word "${e.word}" not found in passage`);
    errorAt.set(i, e);
  }
  return { tokens, errorAt };
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const englishChallenge: ChallengeBody = (root, api) => {
  const mode = ENGLISH.modes[api.difficulty];
  const { tokens, errorAt } = preparePassage(api.difficulty);
  const fixed = new Set<number>(), escapedThisPass = new Set<number>();
  let x = 0, speedIdx = 2, paused = false, wrong = 0, escaped = 0, points = 0, hintsLeft = mode.hints, passes = 1;
  let choosing: { i: number; opts: string[]; sel: number } | null = null, over = false, pulse = 0;

  const strip = h('div', { class: 'rp-strip' });
  const spans = tokens.map(t => h('span', { class: 'rp-tok', text: t }));
  strip.append(h('span', { class: 'rp-mast', text: '★ THE CAMPUS PRESS ★' }), ...spans, h('span', { class: 'rp-mast', text: '— 30 —' }));
  const line = h('div', { class: 'rp-line' }, h('span', { text: 'STAMP' }));
  const press = h('div', { class: 'rp-press' }, h('div', { class: 'rp-roller top' }), strip, line, h('div', { class: 'rp-roller bottom' }));
  const choice = h('div', { class: 'rp-choice hidden' });
  const hud = h('div', { class: 'rp-hud' });
  const toast = h('div', { class: 'rp-toast' });
  const facts = h('div', { class: 'eng-facts rp-facts' }, h('div', { class: 'ref-title', text: 'News desk fact sheet' }), h('ul', {}, ...ENGLISH.facts.map(f => h('li', { text: f }))));
  root.append(h('div', { class: 'eng-label', text: ENGLISH.label.split(' Facts')[0] }), hud, h('div', { class: 'rp-stage' }, press, choice, toast), facts);
  api.setControls([['1', 'STAMP / choose'], ['L', 'pick correction'], ['2', 'cancel'], ['R', 'press speed'], ['RU', 'pause press'], ['3', 'hint'], ['4', 'tools']]);

  let offsets: number[] = [], widths: number[] = [], stripW = 0;
  const measure = () => { offsets = spans.map(s => s.offsetLeft); widths = spans.map(s => s.offsetWidth); stripW = strip.scrollWidth; };
  const lineX = () => press.clientWidth * 0.32;
  const showToast = (t: string, cls: string) => { toast.textContent = t; toast.className = `rp-toast show ${cls}`; window.setTimeout(() => { toast.className = 'rp-toast'; }, 1100); };
  const renderHud = () => {
    const allow = mode.wrongAllowance >= 0 ? ` / ${mode.wrongAllowance} allowed` : '';
    hud.replaceChildren(h('span', { text: `✎ Fixed ${fixed.size}/${errorAt.size}` }), h('span', { text: `Score ${points}` }),
      h('span', { text: `Wrong stamps ${wrong}${allow}` }), h('span', { text: `Escaped ${escaped}` }),
      h('span', { class: 'rp-speed', text: `Press speed ×${SPEEDS[speedIdx]}${paused ? ' · PAUSED' : ''}` }));
  };
  const penalise = (msg: string) => {
    wrong++; points = Math.max(0, points - 50); showToast(msg, 'bad'); renderHud();
    if (mode.wrongAllowance >= 0 && wrong > mode.wrongAllowance) { over = true; stop(); api.finish({ pass: false, quality: 0, summary: `Too many wrong stamps (${wrong}). Check the fact sheet and try again.` }); return true; }
    return false;
  };
  const stamp = () => {
    if (choosing || over) return;
    const lx = lineX(); let best = -1, bd = Infinity;
    spans.forEach((_, i) => { const c = x + offsets[i] + widths[i] / 2, d = Math.abs(c - lx); if (d < widths[i] / 2 + 18 && d < bd) { bd = d; best = i; } });
    pulse = 1;
    if (best < 0) { showToast('Whoosh — nothing under the line', ''); return; }
    if (fixed.has(best)) return;
    const e = errorAt.get(best);
    if (!e) { spans[best].classList.add('rp-ok-word'); setTimeout(() => spans[best].classList.remove('rp-ok-word'), 600); penalise(`“${tokens[best]}” was correct!`); return; }
    choosing = { i: best, opts: [...e.options].sort(() => Math.random() - 0.5), sel: 0 };
    spans[best].classList.add('rp-stamped'); renderChoice();
  };
  const renderChoice = () => {
    if (!choosing) { choice.classList.add('hidden'); return; }
    const c = choosing;
    choice.classList.remove('hidden');
    choice.replaceChildren(h('div', { class: 'rp-q', text: `Replace “${tokens[c.i]}” with…` }),
      h('div', { class: 'rp-opts' }, ...c.opts.map((o, k) => { const b = btn(o, () => { c.sel = k; pick(); }, k === c.sel ? 'sel' : ''); b.removeAttribute('data-focus'); return b; })),
      h('div', { class: 'small', text: 'L ← → choose · ① confirm · ② cancel' }));
  };
  const pick = () => {
    if (!choosing) return; const c = choosing, e = errorAt.get(c.i)!, o = c.opts[c.sel];
    if (o === e.correct) {
      fixed.add(c.i); tokens[c.i] = o; spans[c.i].textContent = o; spans[c.i].classList.remove('rp-stamped', 'rp-glow'); spans[c.i].classList.add('rp-fixed');
      points += Math.round(100 * SPEEDS[speedIdx]); choosing = null; renderChoice(); showToast(`✔ ${e.why}`, 'ok'); measure(); renderHud();
      if (fixed.size === errorAt.size) {
        over = true; stop();
        const maxPts = errorAt.size * 100;
        api.finish({ pass: true, quality: Math.max(0, Math.min(1, points / maxPts) * 0.6 + 0.4 - wrong * 0.1 - escaped * 0.05 - api.hintsUsed() * 0.05),
          summary: `All ${errorAt.size} mistakes fixed! Score ${points} · ${wrong} wrong stamp(s) · ${escaped} escaped · ${passes} pass(es) of the press.` });
      }
    } else {
      c.opts.splice(c.sel, 1); c.sel = 0;
      if (!penalise(`“${o}” isn’t right here`)) renderChoice();
    }
  };
  const cancel = () => { if (choosing) { spans[choosing.i].classList.remove('rp-stamped'); choosing = null; renderChoice(); } };

  const stop = loop(dt => {
    if (!stripW) { measure(); x = press.clientWidth * 0.6; }
    pulse = Math.max(0, pulse - dt * 4); line.style.setProperty('--p', String(pulse));
    if (choosing || paused || over) return;
    const prev = x; x -= mode.speed * SPEEDS[speedIdx] * dt;
    const lx = lineX();
    errorAt.forEach((_, i) => {
      if (fixed.has(i) || escapedThisPass.has(i)) return;
      const edge = offsets[i] + widths[i] + 18;
      if (prev + edge >= lx && x + edge < lx) { escapedThisPass.add(i); escaped++; points = Math.max(0, points - 20); showToast('A mistake slipped past! It will come round again.', 'bad'); renderHud(); }
    });
    if (x + stripW < 0) { x = press.clientWidth; passes++; escapedThisPass.clear(); }
    strip.style.transform = `translateX(${x}px)`;
  });

  api.onHint(() => {
    if (hintsLeft <= 0) return null;
    const rem = [...errorAt.keys()].filter(i => !fixed.has(i)); if (!rem.length) return null;
    hintsLeft--;
    if (mode.hintStyle === 'count') return `${rem.length} mistake(s) left. Compare places, dates and names with the fact sheet.`;
    const lx = lineX(); const next = rem.sort((a, b) => ((x + offsets[a] - lx + stripW * 2) % stripW) - ((x + offsets[b] - lx + stripW * 2) % stripW))[0];
    spans[next].classList.add('rp-glow');
    return 'The next mistake glows on the paper strip — stamp it when it reaches the red line.';
  });
  api.onAction(a => {
    if (choosing) {
      if (a === 'left' || a === 'up' || a === 'alt2') choosing.sel = (choosing.sel + choosing.opts.length - 1) % choosing.opts.length;
      else if (a === 'right' || a === 'down' || a === 'alt') choosing.sel = (choosing.sel + 1) % choosing.opts.length;
      else if (a === 'confirm') { pick(); return true; }
      else if (a === 'back') { cancel(); return true; }
      else return a === 'rup' || a === 'rdown';
      renderChoice(); return true;
    }
    if (a === 'confirm') { stamp(); return true; }
    if (a === 'alt' || a === 'right') { speedIdx = Math.min(SPEEDS.length - 1, speedIdx + 1); renderHud(); return true; }
    if (a === 'alt2' || a === 'left') { speedIdx = Math.max(0, speedIdx - 1); renderHud(); return true; }
    if (a === 'rup' || a === 'rdown') { paused = !paused; renderHud(); return true; }
    if (a === 'up' || a === 'down' || a === 'back') return true;
    return false;
  });
  press.addEventListener('pointerdown', () => stamp());
  renderHud();
  return () => stop();
};
