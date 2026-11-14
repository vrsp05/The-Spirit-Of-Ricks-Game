// 1A. Math — "Nephite Market": customers queue at your barley stall. Count out exact
// payments (and change) with Alma 11 coins before their patience runs out.
// Data: data/math.json (coin values from Alma 11, orders, modes). Tests validate every
// order is payable and compute the fewest-coin answer with a DP.
import data from './data/math.json';
import type { ChallengeBody } from '../shared/frame';
import { h, loop } from '../shared/frame';

export interface Coin { id: string; metal: 'gold' | 'silver'; value: number }
export interface Order { id: string; tier: string; who: string; say: string; target: number; coins: string[]; price?: number; paidWith?: string }
export const MATH = data as unknown as {
  source: string; story: string; reference: { gold: string; silver: string; value: number; note: string }[];
  coins: Coin[]; orders: Order[];
  modes: Record<string, { customers: number; pass: number; patience: number; tiers: string[]; minAdvanced?: number; hints: number; showValues: boolean }>;
};

export const coin = (id: string) => MATH.coins.find(c => c.id === id)!;
/** All values are multiples of a leah (⅛); work in integer leahs. */
export const units = (v: number) => Math.round(v * 8);

export const fmt = (v: number) => {
  const whole = Math.floor(v + 1e-9), frac = v - whole;
  const f: Record<string, string> = { '0.125': '⅛', '0.25': '¼', '0.375': '⅜', '0.5': '½', '0.625': '⅝', '0.75': '¾', '0.875': '⅞' };
  const fs = f[String(Math.round(frac * 1000) / 1000)] ?? '';
  return frac < 1e-9 ? String(whole) : `${whole || ''}${fs}`;
};

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

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Pick the customers for a difficulty. */
export function makeRound(diff: string, rnd: () => number = Math.random): Order[] {
  const m = MATH.modes[diff];
  const pool = MATH.orders.filter(o => m.tiers.includes(o.tier));
  const adv = shuffle(pool.filter(o => o.tier === 'advanced'), rnd).slice(0, m.minAdvanced ?? 0);
  const rest = shuffle(pool.filter(o => !adv.includes(o)), rnd).slice(0, m.customers - adv.length);
  // gentle ramp: basic first, then advanced
  return [...shuffle(rest, rnd), ...adv].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'basic' ? -1 : 1));
}

// ---------- pixel customers ----------
const ROBES = ['#8d3b2f', '#2f6d8d', '#6d8d2f', '#7a4f9a', '#b8742c', '#2f8d6d', '#9a3b62'];
const SKINS = ['#e8c19c', '#c9915e', '#a86b3c', '#7d4a26', '#f1d2b3'];
const HAIR = ['#2a1d14', '#5b3a1e', '#1a1a1a', '#8a6a3a', '#ccc'];
function drawCustomer(cv: HTMLCanvasElement, seed: number, mood: 'happy' | 'ok' | 'cross' | 'gone', bob: number) {
  const g = cv.getContext('2d')!; const P = 8; g.clearRect(0, 0, cv.width, cv.height);
  if (mood === 'gone') return;
  const pick = <T,>(a: T[], k: number) => a[(seed * 7 + k * 13) % a.length];
  const robe = pick(ROBES, 1), skin = pick(SKINS, 2), hair = pick(HAIR, 3), beard = seed % 3 === 0, wrap = seed % 4 === 1;
  const px = (x: number, y: number, w: number, hh: number, c: string) => { g.fillStyle = c; g.fillRect(x * P, (y + bob) * P, w * P, hh * P); };
  px(3, 9, 10, 9, robe); px(2, 11, 2, 6, robe); px(12, 11, 2, 6, robe);           // body + arms
  px(7, 9, 2, 9, 'rgba(0,0,0,.18)'); px(3, 13, 10, 1, '#d9b13b');                  // sash
  px(4, 2, 8, 7, skin);                                                            // head
  if (wrap) { px(3, 1, 10, 3, '#efe5cf'); px(3, 4, 1, 3, '#efe5cf'); px(12, 4, 1, 3, '#efe5cf'); }
  else { px(4, 1, 8, 2, hair); px(3, 2, 1, 4, hair); px(12, 2, 1, 4, hair); }
  if (beard) { px(4, 7, 8, 2, hair); px(5, 9, 6, 1, hair); }
  px(5, 4, 2, 1, '#fff'); px(9, 4, 2, 1, '#fff');
  px(6, 4, 1, 1, '#1a1a1a'); px(10, 4, 1, 1, '#1a1a1a');
  if (mood === 'cross') { px(5, 3, 2, 1, hair); px(9, 3, 2, 1, hair); }
  if (!beard || mood !== 'ok') {
    if (mood === 'happy') { px(6, 6, 4, 1, '#7a2a2a'); px(5, 5, 1, 1, '#7a2a2a'); px(10, 5, 1, 1, '#7a2a2a'); }
    else if (mood === 'cross') { px(6, 6, 4, 1, '#7a2a2a'); px(5, 7, 1, 1, '#7a2a2a'); px(10, 7, 1, 1, '#7a2a2a'); }
    else px(6, 6, 4, 1, '#7a2a2a');
  }
}

export const mathChallenge: ChallengeBody = (root, api) => {
  const mode = MATH.modes[api.difficulty];
  const round = makeRound(api.difficulty);
  let i = 0, served = 0, optimal = 0, missed = 0, hintsLeft = mode.hints, sel = 0, patience = mode.patience, streak = 0;
  let counter: string[] = [], state: 'serve' | 'leaving' | 'done' = 'serve', stateT = 0, hintCoin: string | null = null, mood: 'happy' | 'ok' | 'cross' | 'gone' = 'ok';

  const custCv = h('canvas', { class: 'mk-cust', width: 128, height: 152 }) as HTMLCanvasElement;
  const bubbleWho = h('div', { class: 'mk-who' }), bubbleSay = h('div', { class: 'mk-say' });
  const patienceFill = h('div', { class: 'mk-pfill' });
  const queue = h('div', { class: 'mk-queue', 'aria-hidden': 'true' });
  const sacks = h('div', { class: 'mk-sacks', 'aria-hidden': 'true' });
  const total = h('div', { class: 'mk-total' });
  const counterEl = h('div', { class: 'mk-counter', 'aria-label': 'Coins on the counter' });
  const tray = h('div', { class: 'mk-tray', role: 'listbox', 'aria-label': 'Your coin tray' });
  const score = h('div', { class: 'mk-score' });
  const pop = h('div', { class: 'mk-pop' });
  const refRows = MATH.reference.map(r => h('tr', { 'data-coin': `${r.gold}|${r.silver}` }, h('td', { text: r.gold || '—' }), h('td', { text: r.silver || '—' }), h('td', { class: 'num', text: fmt(r.value) })));
  const ref = h('div', { class: 'math-ref mk-ref' }, h('div', { class: 'ref-title', text: 'Alma 11 coin card (value in measures of barley)' }),
    h('table', {}, h('tr', {}, h('th', { text: 'Gold' }), h('th', { text: 'Silver' }), h('th', { text: 'Value' })), ...refRows));
  root.append(h('div', { class: 'mk-wrap' },
    h('div', { class: 'mk-stall' },
      h('div', { class: 'mk-awning' }), queue,
      h('div', { class: 'mk-front' }, custCv, h('div', { class: 'mk-bubble' }, bubbleWho, bubbleSay, h('div', { class: 'mk-patience' }, patienceFill)), pop),
      h('div', { class: 'mk-table' }, sacks, h('div', { class: 'mk-countbox' }, total, counterEl))),
    h('div', { class: 'mk-side' }, score, ref)), tray);
  api.setControls([['L', 'choose coin'], ['R', 'choose coin'], ['1', 'put coin on counter'], ['2', 'take last coin back'], ['RU', 'clear counter'], ['3', 'hint'], ['4', 'tools']]);

  const order = () => round[i];
  const sum = () => counter.reduce((s, id) => s + units(coin(id).value), 0);
  const trayCoins = () => order()?.coins ?? [];
  const coinEl = (id: string, cls = '') => {
    const c = coin(id);
    return h('div', { class: `coin ${c.metal} ${cls}` }, h('b', { text: id }), mode.showValues ? h('i', { text: fmt(c.value) }) : null);
  };
  const renderTray = () => {
    tray.replaceChildren(...trayCoins().map((id, k) => {
      const el = coinEl(id, `${k === sel ? 'sel' : ''} ${hintCoin === id ? 'hinted' : ''}`);
      el.addEventListener('click', () => { sel = k; add(); });
      return el;
    }));
  };
  const renderCounter = () => {
    const o = order(); if (!o) return;
    const s = sum(), T = units(o.target);
    counterEl.replaceChildren(...counter.map((id, k) => { const el = coinEl(id, 'small drop'); el.addEventListener('click', () => { counter.splice(k, 1); renderAll(); }); return el; }));
    total.textContent = `${fmt(s / 8)} / ${fmt(o.target)} measures`;
    total.className = `mk-total ${s > T ? 'over' : s === T ? 'exact' : ''}`;
  };
  const renderScore = () => {
    score.replaceChildren(h('div', { class: 'mk-big', text: `Served ${served}` }), h('div', { text: `Customer ${Math.min(i + 1, round.length)} of ${round.length} · need ${mode.pass}` }),
      h('div', { text: `Left angry: ${missed}` }), streak > 1 ? h('div', { class: 'mk-streak', text: `🔥 ${streak} in a row!` }) : "");
    queue.replaceChildren(...round.slice(i + 1).map((_, k) => h('span', { class: 'mk-q', style: `--c:${ROBES[(i + 1 + k) * 3 % ROBES.length]}` })));
  };
  const renderOrder = () => {
    const o = order(); if (!o) return;
    bubbleWho.textContent = o.who; bubbleSay.textContent = o.say;
    const showSacks = Math.min(12, Math.ceil(o.price ?? o.target));
    sacks.replaceChildren(...Array.from({ length: showSacks }, () => h('span', { class: 'sack' })), o.paidWith ? h('span', { class: 'mk-paid' }, 'paid: ', coinEl(o.paidWith, 'small')) : "");
  };
  const renderAll = () => { renderTray(); renderCounter(); renderScore(); };
  const showPop = (t: string, cls: string) => { pop.textContent = t; pop.className = `mk-pop show ${cls}`; window.setTimeout(() => { pop.className = 'mk-pop'; }, 900); };
  const highlightRef = (ids: string[]) => refRows.forEach(tr => { const [g, s] = (tr.dataset.coin ?? '').split('|'); tr.classList.toggle('hl', ids.includes(g) || ids.includes(s)); });

  const nextCustomer = () => {
    i++; counter = []; sel = 0; hintCoin = null; highlightRef([]);
    if (i >= round.length) return end();
    patience = mode.patience; state = 'serve'; mood = 'ok'; renderOrder(); renderAll();
  };
  const add = () => {
    if (state !== 'serve') return;
    const id = trayCoins()[sel]; if (!id) return;
    counter.push(id); hintCoin = null; api.setStatus('');
    const s = sum(), T = units(order().target);
    if (s === T) {
      const best = fewestCoins(order().target, order().coins)!.length, isBest = counter.length <= best;
      served++; streak++; if (isBest) optimal++;
      state = 'leaving'; stateT = 1.1; mood = 'happy';
      showPop(isBest ? '★ Perfect change!' : '✔ Thank you!', 'ok');
      api.setStatus(isBest ? `Exact, with the fewest coins (${best}).` : `Exact! (It could be done with ${best} coin${best > 1 ? 's' : ''}.)`);
    } else if (s > T) { showPop('Too much!', 'bad'); api.setStatus('That is more than they owe — take a coin back with ②.'); }
    renderAll();
  };
  const removeLast = () => { if (state === 'serve' && counter.length) { counter.pop(); renderAll(); } };

  const end = () => {
    state = 'done'; stop();
    const n = round.length, pass = served >= mode.pass;
    api.finish({ pass, quality: Math.max(0, served / n * 0.7 + optimal / n * 0.3 - api.hintsUsed() * 0.05),
      summary: `You served ${served} of ${n} customers (needed ${mode.pass}); ${optimal} with the fewest coins.` });
  };

  const stop = loop((dt, t) => {
    if (state === 'done') return;
    if (state === 'serve') {
      patience -= dt;
      if (patience < mode.patience * 0.3) mood = 'cross';
      if (patience <= 0) { missed++; streak = 0; state = 'leaving'; stateT = 1.1; mood = 'cross'; showPop('Left angry…', 'bad'); api.setStatus('Too slow — that customer left.'); renderScore(); }
    } else if (state === 'leaving') { stateT -= dt; if (stateT <= 0) nextCustomer(); }
    patienceFill.style.width = `${Math.max(0, patience / mode.patience) * 100}%`;
    patienceFill.classList.toggle('low', patience < mode.patience * 0.3);
    const o = order(); if (!o) return;
    const seed = MATH.orders.indexOf(o) + 3;
    const slide = state === 'leaving' ? (1.1 - stateT) * 30 : 0;
    custCv.style.transform = `translateX(${slide * (mood === 'happy' ? 1 : -1)}px)`;
    custCv.style.opacity = String(state === 'leaving' ? Math.max(0, stateT / 1.1) : 1);
    drawCustomer(custCv, seed, mood, Math.round(Math.sin(t * (mood === 'cross' ? 9 : 3)) * 0.6 + 0.6));
  });

  api.onHint(() => {
    if (hintsLeft <= 0 || state !== 'serve') return null;
    const o = order(); const s = sum(), T = units(o.target);
    if (s > T) return 'You have put down too much. Take a coin back (②).';
    const rest = fewestCoins((T - s) / 8, o.coins);
    if (!rest) return 'Those coins can’t make the rest — take some back and try bigger coins.';
    hintsLeft--; hintCoin = rest.sort((a, b) => coin(b).value - coin(a).value)[0]; sel = trayCoins().indexOf(hintCoin);
    highlightRef([hintCoin]); renderAll();
    return `Still owed: ${fmt((T - s) / 8)}. Try a ${hintCoin} (worth ${fmt(coin(hintCoin).value)}).`;
  });
  api.onAction(a => {
    const n = trayCoins().length;
    if (a === 'left' || a === 'alt2') sel = (sel + n - 1) % n;
    else if (a === 'right' || a === 'alt') sel = (sel + 1) % n;
    else if (a === 'confirm') { add(); return true; }
    else if (a === 'back') { removeLast(); return true; }
    else if (a === 'rup' || a === 'rdown') { if (state === 'serve') { counter = []; renderAll(); } return true; }
    else if (a === 'up' || a === 'down') return true;
    else return false;
    renderTray(); return true;
  });
  renderOrder(); renderAll();
  return () => stop();
};
