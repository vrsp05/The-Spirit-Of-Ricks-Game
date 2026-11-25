// Building minigames (each is a small panel game with a record):
//   bookHunt     McKay Library: find books on the shelf by call number (also the library job)
//   planetarium  Romney: connect the stars of each constellation
//   rhythm       Snow concert hall (and country dancing at the MC): hit the notes as they fall
//   carRepair    Austin shops: diagnose what's wrong with each car, then torque the bolts
//   pingPong     Strike Zone: return the ball in time; first to 7
//   cafeteria    Crossroads job: remember each order and serve it
//   tourGuide    tour job: answer visitors' questions about campus history
//   intramurals  Hart: a three-round 3-on-3 tournament with your friends (once a week)
import { freq, Voice, TUNES } from './sound';
import { makeTrivia } from '../sidequests/trivia';
import { ERAS, type EraId } from '../world/eras';
import type { LifeHost } from './host';
import type { Progress } from './progress';
import { shotGoes } from './hartGames';

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
type Done = (result: string | null) => void;
/** A panel with a body; `setup` gets the root, a close function and can hook actions. Resolves when closed. */
function game(h: LifeHost, title: string, cls: string, setup: (root: HTMLElement, close: Done, on: (fn: (a: string) => boolean) => void) => (() => void) | void) {
  return h.ui.custom(title, (root, api) => setup(root, r => api.close(r), fn => api.onAction(fn)), { className: `mini-panel ${cls}` });
}
/** Save a "higher is better" record; returns true if it's a new one (and pays a bonus). */
function record(h: LifeHost, p: Progress, key: string, value: number, lowerIsBetter = false, bonus = 10) {
  const old = p.stat(key), better = !old || (lowerIsBetter ? value < old : value > old);
  if (better) { p.set(key, value); if (old) { p.earn(bonus); h.toast(`🏆 New record! +${bonus} coins`, 3000); } }
  return better;
}

// ---------------------------------------------------------------- McKay: find the book
const CLASSES = ['BX', 'E', 'F', 'HQ', 'ML', 'ND', 'PS', 'QA', 'QB', 'QH', 'TK', 'Z'];
const SUBJECTS: Record<string, string> = { BX: 'Religion', E: 'U.S. history', F: 'Local history', HQ: 'Family', ML: 'Music', ND: 'Painting', PS: 'Literature', QA: 'Mathematics', QB: 'Astronomy', QH: 'Biology', TK: 'Electronics', Z: 'Libraries' };
export interface CallNo { cls: string; num: number; cut: string }
export const callText = (c: CallNo) => `${c.cls} ${c.num}.${c.cut}`;
export function compareCall(a: CallNo, b: CallNo) { return a.cls.localeCompare(b.cls) || a.num - b.num || a.cut.localeCompare(b.cut); }
export function bookHunt(h: LifeHost, p: Progress, opts: { paid?: boolean } = {}) {
  const N = 5, T = 75;
  let found = 0, left = T, raf = 0, prev = performance.now(), wrong = 0;
  return game(h, opts.paid ? 'Library shift — reshelve & find books' : 'Find the book', 'books', (root, close) => {
    const books: CallNo[] = Array.from({ length: 30 }, () => ({ cls: pick(CLASSES), num: 10 + ((Math.random() * 980) | 0), cut: `${String.fromCharCode(65 + ((Math.random() * 26) | 0))}${(Math.random() * 9 + 1) | 0}` })).sort(compareCall);
    let target = pick(books);
    root.innerHTML = `<p class="sub">Books are shelved by call number (letters, then number, then the last part). Find each one before time runs out.</p>
      <div class="bk-top"><span class="bk-target"></span><span class="bk-time"></span></div><div class="bk-shelf"></div><div class="mini-msg"></div>
      <div class="items"><button data-focus data-act="quit">Stop</button></div>`;
    const shelf = root.querySelector('.bk-shelf') as HTMLElement, msg = root.querySelector('.mini-msg') as HTMLElement;
    const cols = ['#7a2b2b', '#2f4f7f', '#3f6f4a', '#8a6a2a', '#5a3a6b', '#2a5a5a'];
    shelf.innerHTML = books.map((b, i) => `<button data-focus data-i="${i}" style="background:${cols[i % cols.length]}">${b.cls}<br>${b.num}<br>.${b.cut}</button>`).join('');
    const showTarget = () => { (root.querySelector('.bk-target') as HTMLElement).innerHTML = `📕 Find: <b>${callText(target)}</b> <small>(${SUBJECTS[target.cls]})</small> · ${found}/${N}`; };
    shelf.querySelectorAll<HTMLElement>('[data-i]').forEach(b => b.addEventListener('click', () => {
      const bk = books[Number(b.dataset.i)];
      if (compareCall(bk, target) === 0) {
        found++; h.sound('chime'); b.classList.add('got'); msg.textContent = `Found ${callText(target)}!`;
        if (found >= N) { const t = Math.round((T - left) * 10); const rec = record(h, p, 'bookBest', t, true); if (opts.paid) { p.earn(found * 3); p.add('jobShifts'); } p.add('booksFound', found);
          msg.textContent = `All ${N} found in ${(t / 10).toFixed(1)} s!${rec ? ' Best time!' : ''}${opts.paid ? ` Paid ${found * 3} coins.` : ''}`; h.save(); setTimeout(() => close('done'), 2200); return; }
        target = pick(books.filter((_, i) => !shelf.querySelector(`[data-i="${i}"]`)!.classList.contains('got'))); showTarget();
      } else { wrong++; h.sound('error'); msg.textContent = compareCall(bk, target) < 0 ? 'Not this one — the book you want is further along the shelf ▶' : '◀ Too far — the book you want comes earlier.'; }
    }));
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => close(null));
    const loop = () => { const now = performance.now(); left -= (now - prev) / 1000; prev = now; (root.querySelector('.bk-time') as HTMLElement).textContent = `⏱ ${Math.max(0, Math.ceil(left))} s`;
      if (left <= 0 && found < N) { msg.textContent = `Time! You found ${found}/${N}.`; if (opts.paid && found) { p.earn(found * 3); p.add('jobShifts'); h.save(); } setTimeout(() => close('time'), 1600); return; } raf = requestAnimationFrame(loop); };
    showTarget(); loop(); void wrong;
    return () => cancelAnimationFrame(raf);
  });
}

// ---------------------------------------------------------------- Romney planetarium: connect the stars
/** Approximate star patterns (normalised 0..1 positions; lines as index pairs). */
export const CONSTELLATIONS: { name: string; stars: [number, number][]; lines: [number, number][]; note: string }[] = [
  { name: 'The Big Dipper', note: 'Follow the two stars at the end of the bowl to find the North Star.', stars: [[0.08, 0.3], [0.24, 0.33], [0.38, 0.4], [0.5, 0.47], [0.52, 0.7], [0.76, 0.72], [0.8, 0.48]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  { name: 'Cassiopeia', note: 'The queen’s “W”, across the North Star from the Dipper.', stars: [[0.1, 0.32], [0.3, 0.64], [0.5, 0.38], [0.7, 0.66], [0.9, 0.3]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { name: 'Orion', note: 'The hunter of winter skies — find the three stars of his belt.', stars: [[0.3, 0.18], [0.68, 0.22], [0.42, 0.5], [0.5, 0.52], [0.58, 0.54], [0.33, 0.86], [0.72, 0.83]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
  { name: 'Cygnus', note: 'The swan, also called the Northern Cross, flying along the Milky Way.', stars: [[0.5, 0.12], [0.5, 0.4], [0.5, 0.85], [0.18, 0.36], [0.82, 0.44]], lines: [[0, 1], [1, 2], [3, 1], [1, 4]] },
];
export function planetarium(h: LifeHost, p: Progress) {
  return game(h, 'Planetarium — connect the stars', 'stars', (root, close) => {
    const order = shuffle(CONSTELLATIONS).slice(0, 3);
    let ci = 0, mistakes = 0, sel: number | null = null, made = new Set<string>();
    root.innerHTML = `<p class="sub">Click a star, then a star it connects to. Draw every line of the constellation.</p><div class="sky"><svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div><div class="mini-msg"></div>
      <div class="items"><button data-focus data-act="hint">Show the shape (counts as a mistake)</button><button data-focus data-act="quit">Leave the planetarium</button></div>`;
    const svg = root.querySelector('svg')!, msg = root.querySelector('.mini-msg') as HTMLElement;
    const draw = (hint = false) => {
      const c = order[ci]; if (!c) return;
      const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
      const dust = Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 37) % 100}" cy="${(i * 53) % 100}" r="0.3" fill="#9ab"/>`).join('');
      svg.innerHTML = dust + c.lines.filter(([a, b]) => made.has(key(a, b)) || hint).map(([a, b]) => `<line x1="${c.stars[a][0] * 100}" y1="${c.stars[a][1] * 100}" x2="${c.stars[b][0] * 100}" y2="${c.stars[b][1] * 100}" stroke="${made.has(key(a, b)) ? '#ffd34d' : '#ffffff44'}" stroke-width="0.8"/>`).join('')
        + c.stars.map(([x, y], i) => `<circle data-s="${i}" cx="${x * 100}" cy="${y * 100}" r="${sel === i ? 3 : 2.2}" fill="${sel === i ? '#ffd34d' : '#fff'}" style="cursor:pointer"/>`).join('');
      svg.querySelectorAll<SVGCircleElement>('[data-s]').forEach(el => el.addEventListener('click', () => clickStar(Number(el.dataset.s))));
      msg.textContent = `${c.name} (${ci + 1}/${order.length}) · lines ${made.size}/${c.lines.length}`;
    };
    const clickStar = (i: number) => {
      const c = order[ci]; if (!c) return;                      // the show is over
      if (sel === null || sel === i) { sel = i; draw(); return; }
      const a = sel, ok = c.lines.some(([x, y]) => (x === a && y === i) || (x === i && y === a)); sel = i;
      if (ok) { made.add(a < i ? `${a}-${i}` : `${i}-${a}`); h.sound('tick'); } else { mistakes++; h.sound('error'); }
      if (made.size === c.lines.length) {
        h.sound('chime'); msg.textContent = `✨ ${c.name}! ${c.note}`; ci++; made = new Set(); sel = null;
        if (ci >= order.length) { p.add('constellations', order.length); const first = !p.stat('planetariumDone'); p.add('planetariumDone'); if (first) p.earn(15); record(h, p, 'starsBest', 100 - mistakes);
          setTimeout(() => { msg.textContent = `Show complete! ${mistakes} mistake${mistakes === 1 ? '' : 's'}.${first ? ' +15 coins' : ''}`; h.save(); setTimeout(() => close('done'), 2200); }, 1800); return; }
        setTimeout(() => draw(), 1800); return;
      }
      draw();
    };
    root.querySelector('[data-act="hint"]')!.addEventListener('click', () => { mistakes++; draw(true); setTimeout(() => draw(), 1400); });
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => close(null));
    draw();
  });
}

// ---------------------------------------------------------------- rhythm (Snow concert hall, country dancing)
export function rhythm(h: LifeHost, p: Progress, mode: 'concert' | 'dance' = 'concert') {
  const KEYS = [{ code: 'KeyD', alt: 'ArrowLeft', act: 'left', label: mode === 'dance' ? '←' : 'D' }, { code: 'KeyF', alt: 'ArrowDown', act: 'down', label: mode === 'dance' ? '↓' : 'F' }, { code: 'KeyJ', alt: 'ArrowUp', act: 'up', label: mode === 'dance' ? '↑' : 'J' }, { code: 'KeyK', alt: 'ArrowRight', act: 'right', label: mode === 'dance' ? '→' : 'K' }];
  const tune = pick(TUNES), spb = 60 / tune.bpm, notes: { lane: number; t: number; f: number; hit: boolean; miss: boolean }[] = [];
  let beat = 2;
  for (const [n, len] of tune.melody) { if (n) notes.push({ lane: Math.abs(Math.round(freq(n))) % 4, t: beat * spb, f: freq(n), hit: false, miss: false }); beat += len; }
  const voice = new Voice(); voice.level = 1;
  let t = -1, raf = 0, prev = performance.now(), hits = 0, perfect = 0, combo = 0, bestCombo = 0, keyAt = 0;
  return game(h, mode === 'dance' ? 'Country dancing at the MC' : 'Concert hall — play along', 'rhythm', (root, close, on) => {
    root.innerHTML = `<p class="sub">Press ${KEYS.map(k => `<kbd>${k.label}</kbd>`).join(' ')} when a note reaches the line${mode === 'dance' ? ' (arrow keys or the stick)' : ' (or the arrow keys)'}. “${tune.name}”</p>
      <div class="rh"><div class="rh-lanes">${KEYS.map(k => `<div class="rh-lane"><span>${k.label}</span></div>`).join('')}</div><div class="rh-line"></div></div><div class="mini-msg"></div>`;
    const lanes = [...root.querySelectorAll<HTMLElement>('.rh-lane')], msg = root.querySelector('.mini-msg') as HTMLElement, field = root.querySelector('.rh') as HTMLElement;
    const els = notes.map(n => { const e = document.createElement('i'); e.className = 'rh-note'; lanes[n.lane].appendChild(e); return e; });
    const press = (lane: number) => {
      lanes[lane].classList.add('on'); setTimeout(() => lanes[lane].classList.remove('on'), 90);
      const n = notes.filter(x => x.lane === lane && !x.hit && !x.miss).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
      if (n && Math.abs(n.t - t) < 0.2) { n.hit = true; hits++; combo++; bestCombo = Math.max(bestCombo, combo); if (Math.abs(n.t - t) < 0.08) perfect++; voice[mode === 'dance' ? 'pluck' : 'piano'](n.f); msg.textContent = Math.abs(n.t - t) < 0.08 ? `Perfect! ×${combo}` : `Good ×${combo}`; }
      else { combo = 0; msg.textContent = 'Miss'; }
    };
    const onKey = (e: KeyboardEvent) => { const i = KEYS.findIndex(k => k.code === e.code || k.alt === e.code); if (i < 0 || e.repeat) return; keyAt = performance.now(); press(i); };
    window.addEventListener('keydown', onKey, true);
    on(a => { const i = KEYS.findIndex(k => k.act === a); if (i >= 0) { if (performance.now() - keyAt > 120) press(i); return true; } if (a === 'back') { close(null); return true; } return a === 'confirm'; });
    const H = () => field.clientHeight || 260, speed = 1.6;   // seconds of lead time on screen
    const loop = () => {
      const now = performance.now(); t += Math.min(0.05, (now - prev) / 1000); prev = now;
      notes.forEach((n, i) => { const y = (1 - (n.t - t) / speed) * (H() - 40); els[i].style.transform = `translateY(${y}px)`; els[i].style.opacity = n.hit ? '0' : String(Math.max(0, Math.min(1, 1 - (n.t - t - speed) * 3))); if (!n.hit && !n.miss && t - n.t > 0.2) { n.miss = true; combo = 0; } });
      if (t > notes[notes.length - 1].t + 1) {
        const pct = Math.round(hits / notes.length * 100); const rec = record(h, p, mode === 'dance' ? 'danceBest' : 'rhythmBest', pct);
        p.add(mode === 'dance' ? 'dances' : 'concerts'); if (pct >= 60) p.earn(5);
        msg.textContent = `${pct}% · ${perfect} perfect · best combo ${bestCombo}${rec ? ' · new best!' : ''}${pct >= 60 ? ' · +5 coins' : ''}`; h.sound(pct >= 60 ? 'cheer' : 'success'); h.save();
        setTimeout(() => close('done'), 2600); return;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); };
  });
}

// ---------------------------------------------------------------- Austin: car repair
export const CAR_PROBLEMS = [
  { symptom: 'It squeals every time I stop.', part: 'Brake pads', wrong: ['Spark plugs', 'Windshield wipers'] },
  { symptom: 'It just clicks when I turn the key.', part: 'Battery', wrong: ['Brake pads', 'Tires'] },
  { symptom: 'The temperature needle keeps climbing.', part: 'Coolant & radiator', wrong: ['Battery', 'Headlights'] },
  { symptom: 'It pulls to one side and one tire looks low.', part: 'Tire', wrong: ['Radiator', 'Alternator'] },
  { symptom: 'The headlights get dim while I drive.', part: 'Alternator', wrong: ['Tires', 'Brake pads'] },
  { symptom: 'The engine misfires and shakes when idling.', part: 'Spark plugs', wrong: ['Coolant & radiator', 'Battery'] },
];
export function carRepair(h: LifeHost, p: Progress) {
  const jobs = shuffle(CAR_PROBLEMS).slice(0, 3);
  let ji = 0, score = 0, stage: 'diag' | 'bolts' = 'diag', bolts = 0, needle = 0, dir = 1, raf = 0, prev = performance.now();
  return game(h, 'Austin shops — fix the car', 'repair', (root, close, on) => {
    const body = () => root.querySelector('.rp-body') as HTMLElement, msg = () => root.querySelector('.mini-msg') as HTMLElement;
    root.innerHTML = `<div class="rp-body"></div><div class="mini-msg"></div><div class="items"><button data-focus data-act="quit">Leave the shop</button></div>`;
    const show = () => {
      const j = jobs[ji];
      if (stage === 'diag') {
        body().innerHTML = `<p><b>Car ${ji + 1}/${jobs.length}.</b> The owner says: “${j.symptom}”</p><p class="sub">What needs fixing?</p><div class="items">${shuffle([j.part, ...j.wrong]).map(o => `<button data-focus data-o="${o}">🔧 ${o}</button>`).join('')}</div>`;
        body().querySelectorAll<HTMLElement>('[data-o]').forEach(b => b.addEventListener('click', () => {
          if (b.dataset.o === j.part) { score += 10; h.sound('success'); msg().textContent = `Right — the ${j.part.toLowerCase()}! Now torque the bolts.`; stage = 'bolts'; bolts = 0; show(); }
          else { h.sound('error'); msg().textContent = 'Not quite. Listen to the symptom again.'; score = Math.max(0, score - 3); }
        }));
      } else body().innerHTML = `<p>Tighten 4 bolts: press <kbd>Space</kbd> / Ⓐ when the needle is in the green.</p><div class="ft-bar"><div class="ft-zone" style="left:62%;width:16%"></div><div class="ft-ball"></div></div><p class="rp-bolts"></p><div class="items"><button data-focus data-act="torque">Torque!</button></div>`;
      if (stage === 'bolts') { (body().querySelector('.rp-bolts') as HTMLElement).textContent = '🔩'.repeat(bolts) + '⚪'.repeat(4 - bolts); body().querySelector('[data-act="torque"]')!.addEventListener('click', torque); }
    };
    const torque = () => {
      if (stage !== 'bolts') return;
      const ok = needle > 0.62 && needle < 0.78; score += ok ? 5 : needle > 0.78 ? -2 : 0;
      h.sound(ok ? 'tick' : 'error'); msg().textContent = ok ? 'Perfect torque.' : needle > 0.78 ? 'Too tight! (stripped a little)' : 'Too loose — try again.';
      if (ok || needle > 0.78) bolts++;
      if (bolts >= 4) { ji++; stage = 'diag'; if (ji >= jobs.length) { const rec = record(h, p, 'repairBest', score); p.add('carsFixed', jobs.length); p.earn(jobs.length * 4); msg().textContent = `All ${jobs.length} cars fixed! Score ${score}.${rec ? ' New best!' : ''} +${jobs.length * 4} coins`; h.sound('cheer'); h.save(); setTimeout(() => close('done'), 2400); return; } h.sound('chime'); }
      show();
    };
    on(a => { if (a === 'confirm' && stage === 'bolts') { torque(); return true; } if (a === 'back') { close(null); return true; } return false; });
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => close(null));
    const loop = () => { const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; needle += dir * dt * 1.1; if (needle > 1) { needle = 1; dir = -1; } if (needle < 0) { needle = 0; dir = 1; }
      const b = root.querySelector('.ft-ball') as HTMLElement | null; if (b) b.style.left = `calc(${needle * 100}% - 12px)`; raf = requestAnimationFrame(loop); };
    show(); loop();
    return () => cancelAnimationFrame(raf);
  });
}

// ---------------------------------------------------------------- ping-pong
export function pingPong(h: LifeHost, p: Progress, rival: string) {
  let me = 0, them = 0, x = 0.5, dir = 1, speed = 0.55, rally = 0, best = 0, raf = 0, prev = performance.now(), wait = 1.2, keyAt = 0;
  return game(h, `Ping-pong vs ${rival}`, 'pong', (root, close, on) => {
    root.innerHTML = `<p class="sub">Press <kbd>Space</kbd> / Ⓐ when the ball reaches your paddle (the left end). First to 7.</p>
      <div class="pong"><div class="pong-net"></div><div class="pong-zone"></div><div class="pong-ball"></div><span class="pong-me">You</span><span class="pong-them">${rival}</span></div>
      <div class="pong-score"></div><div class="mini-msg"></div>`;
    const ball = root.querySelector('.pong-ball') as HTMLElement, msg = root.querySelector('.mini-msg') as HTMLElement, sc = root.querySelector('.pong-score') as HTMLElement;
    const point = (mine: boolean, why: string) => { if (mine) me++; else them++; rally = 0; speed = 0.55; x = 0.5; dir = mine ? 1 : -1; wait = 1.0; msg.textContent = why; h.sound(mine ? 'success' : 'error');
      if (me >= 7 || them >= 7) { const win = me > them; if (win) { p.add('pongWins'); p.earn(8); } record(h, p, 'pongRally', best); msg.textContent = win ? `You win ${me}–${them}! +8 coins` : `${rival} wins ${them}–${me}. Rematch?`; h.save(); setTimeout(() => close('done'), 2200); wait = 99; } };
    const hit = () => {
      if (wait > 0 || dir > 0) return;
      if (x < 0.14) { dir = 1; rally++; best = Math.max(best, rally); speed = Math.min(1.6, speed + 0.06); h.sound('kick'); msg.textContent = rally > 4 ? `Rally ${rally}!` : ''; }
      else { msg.textContent = 'Too early!'; }
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'KeyE') { keyAt = performance.now(); if (!e.repeat) hit(); } };
    window.addEventListener('keydown', onKey, true);
    on(a => { if (a === 'confirm') { if (performance.now() - keyAt > 120) hit(); return true; } if (a === 'back') { close(null); return true; } return false; });
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (wait > 0) wait -= dt; else {
        x += dir * speed * dt;
        if (dir > 0 && x > 0.9) { if (Math.random() < 0.05 + rally * 0.025) point(true, `${rival} missed it!`); else { dir = -1; h.sound('kick'); } }
        if (dir < 0 && x < 0.03) point(false, 'Missed!');
      }
      ball.style.left = `${x * 100}%`; ball.style.bottom = `${20 + Math.sin(x * Math.PI * 3) ** 2 * 45}%`; sc.textContent = `${me} – ${them}`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); };
  });
}

// ---------------------------------------------------------------- Crossroads job: take the orders
const MENU = ['🍔 Burger', '🍟 Fries', '🥗 Salad', '🍕 Pizza', '🥤 Smoothie', '🍪 Cookie', '🌯 Wrap', '🍦 Ice cream'];
export function cafeteria(h: LifeHost, p: Progress) {
  const N = 6; let ci = 0, good = 0, order: string[] = [], picked: string[] = [];
  return game(h, 'Crossroads shift — serve the orders', 'cafe', (root, close) => {
    root.innerHTML = `<div class="cafe-order"></div><div class="cafe-tray"></div><div class="items cafe-menu">${MENU.map(m => `<button data-focus data-m="${m}">${m}</button>`).join('')}</div><div class="items"><button data-focus data-act="serve">✅ Serve</button></div><div class="mini-msg"></div>`;
    const ord = root.querySelector('.cafe-order') as HTMLElement, tray = root.querySelector('.cafe-tray') as HTMLElement, msg = root.querySelector('.mini-msg') as HTMLElement;
    const next = () => {
      if (ci >= N) { const pay = good * 3; p.earn(pay); p.add('jobShifts'); record(h, p, 'cafeBest', good); msg.textContent = `Shift over: ${good}/${N} orders right. Paid ${pay} coins.`; h.sound('success'); h.save(); setTimeout(() => close('done'), 2200); return; }
      order = shuffle(MENU).slice(0, 2 + Math.min(2, ci >> 1)); picked = [];
      ord.innerHTML = `Customer ${ci + 1}/${N}: <b>“${order.join(', ')}, please!”</b>`; tray.textContent = 'Tray: —';
      setTimeout(() => { if (ci < N) ord.innerHTML = `Customer ${ci + 1}/${N}: (remember the order!)`; }, 1400 + order.length * 400);
    };
    root.querySelectorAll<HTMLElement>('[data-m]').forEach(b => b.addEventListener('click', () => { picked.push(b.dataset.m!); h.sound('tick'); tray.textContent = `Tray: ${picked.join(', ')}`; }));
    root.querySelector('[data-act="serve"]')!.addEventListener('click', () => {
      const ok = picked.length === order.length && order.every(o => picked.includes(o));
      if (ok) { good++; h.sound('coin'); msg.textContent = 'Thanks!'; } else { h.sound('error'); msg.textContent = `Oops — they wanted ${order.join(', ')}.`; }
      ci++; next();
    });
    next();
  });
}

// ---------------------------------------------------------------- tour guide job: visitors' questions
export function tourGuide(h: LifeHost, p: Progress, era: EraId) {
  const qs = makeTrivia(ERAS[era].year, 4); let qi = 0, good = 0;
  return game(h, 'Campus tour guide', 'tour', (root, close) => {
    const show = () => {
      if (qi >= qs.length) { const pay = good * 4; p.earn(pay); p.add('jobShifts'); p.add('toursGiven'); root.innerHTML = `<p>The tour group thanks you! ${good}/${qs.length} questions answered. Paid ${pay} coins.</p>`; h.sound('success'); h.save(); setTimeout(() => close('done'), 2200); return; }
      const q = qs[qi];
      root.innerHTML = `<p class="sub">A visitor asks:</p><p><b>${q.q}</b></p><div class="items">${q.options.map((o, i) => `<button data-focus data-i="${i}">${o}</button>`).join('')}</div><div class="mini-msg"></div>`;
      root.querySelectorAll<HTMLElement>('[data-i]').forEach(b => b.addEventListener('click', () => { const ok = Number(b.dataset.i) === q.answer; if (ok) good++; h.sound(ok ? 'chime' : 'error'); (root.querySelector('.mini-msg') as HTMLElement).textContent = ok ? 'Great answer!' : `Hmm, it’s actually “${q.options[q.answer]}”.`; qi++; setTimeout(show, 1300); }));
    };
    show();
  });
}

// ---------------------------------------------------------------- intramurals: a 3-on-3 tournament
export function intramurals(h: LifeHost, p: Progress, team: string[], week: number) {
  const ROUNDS = [{ name: 'Quarterfinal', opp: 'The Bookworms', strength: 0.35 }, { name: 'Semifinal', opp: 'Taylor Tigers', strength: 0.5 }, { name: 'Final', opp: 'The Snow Storm', strength: 0.62 }];
  let round = 0, poss = 0, us = 0, them = 0, meter = 0, dir = 1, raf = 0, prev = performance.now(), busy = false, keyAt = 0;
  const POSS = 6;
  return game(h, `Intramural 3-on-3 — week ${week + 1}`, 'imural', (root, close, on) => {
    root.innerHTML = `<p class="sub">Your team: <b>You, ${team.join(', ')}</b>. Each possession, stop the meter in the green to score.</p>
      <div class="shoot"><div class="shoot-top"><span class="im-round"></span><span class="im-score"></span></div><div class="ft-bar"><div class="ft-zone" style="left:39%;width:22%"></div><div class="ft-ball"></div></div><div class="mini-msg"></div></div>
      <div class="items"><button data-focus data-act="shoot">Shoot!</button></div>`;
    const $ = (q: string) => root.querySelector(q) as HTMLElement;
    const paint = () => { const r = ROUNDS[round]; $('.im-round').textContent = `${r.name} vs ${r.opp}`; $('.im-score').textContent = `${us} – ${them} · ${POSS - poss} left`; };
    const shoot = () => {
      if (busy) return; busy = true; poss++;
      const make = shotGoes(meter, 2) || Math.abs(meter - 0.5) < 0.16 && Math.random() < 0.5;
      if (make) { us += 2; h.sound('success'); $('.mini-msg').textContent = `${pick(['You', ...team])} scores!`; } else { h.sound('bounce'); $('.mini-msg').textContent = 'No good.'; }
      if (Math.random() < ROUNDS[round].strength) them += 2;
      paint();
      setTimeout(() => {
        busy = false;
        if (poss < POSS) return;
        if (us === them) { us += Math.random() < 0.5 ? 1 : 0; them += us % 2 ? 0 : 1; }   // free throw tiebreak
        const won = us > them;
        if (!won) { $('.mini-msg').textContent = `Lost ${us}–${them} in the ${ROUNDS[round].name.toLowerCase()}. Good season!`; p.set('imWeek', week + 1); h.save(); setTimeout(() => close('lost'), 2400); busy = true; return; }
        h.sound('cheer');
        if (round === ROUNDS.length - 1) { p.add('imTitles'); p.earn(25); p.set('imWeek', week + 1); $('.mini-msg').textContent = `🏆 CHAMPIONS! ${us}–${them}. +25 coins`; h.save(); setTimeout(() => close('won'), 2600); busy = true; return; }
        $('.mini-msg').textContent = `Won ${us}–${them}! On to the ${ROUNDS[round + 1].name.toLowerCase()}.`; round++; poss = 0; us = 0; them = 0; paint();
      }, 900);
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { keyAt = performance.now(); if (!e.repeat) shoot(); } };
    window.addEventListener('keydown', onKey, true);
    root.querySelector('[data-act="shoot"]')!.addEventListener('click', () => { if (performance.now() - keyAt > 120) shoot(); });
    on(a => { if (a === 'confirm') { if (performance.now() - keyAt > 120) shoot(); return true; } return a === 'back'; });
    const loop = () => { const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; if (!busy) { meter += dir * dt * 1.2; if (meter > 1) { meter = 1; dir = -1; } if (meter < 0) { meter = 0; dir = 1; } } $('.ft-ball').style.left = `calc(${meter * 100}% - 12px)`; raf = requestAnimationFrame(loop); };
    paint(); loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); };
  });
}

// ---------------------------------------------------------------- campus records board
/** Students' records to beat (fictional). lower = lower is better. */
export const RIVALS: { key: string; event: string; unit: (v: number) => string; lower?: boolean; marks: [string, number][] }[] = [
  { key: 'treadBest', event: 'Treadmill 400 m', unit: v => `${(v / 10).toFixed(1)} s`, lower: true, marks: [['Coach Dana', 560], ['Tyler', 640], ['Kenzie', 720]] },
  { key: 'hoopsBest', event: 'Shooting challenge', unit: v => `${v} pts`, marks: [['Coach Dana', 34], ['Jace', 24], ['Brooke', 16]] },
  { key: 'benchBest', event: 'Bench press', unit: v => `${v} lb`, marks: [['Hunter', 245], ['Coach Dana', 185], ['Tyler', 135]] },
  { key: 'bowlBest', event: 'Bowling (5 frames)', unit: v => `${v}`, marks: [['Rosa', 92], ['Dave', 70], ['Megan', 48]] },
  { key: 'raceBest', event: 'Stadium race', unit: v => `${(v / 10).toFixed(1)} s`, lower: true, marks: [['Coach Reed', 380], ['Wyatt', 430], ['Ivy', 480]] },
  { key: 'rhythmBest', event: 'Concert hall rhythm', unit: v => `${v}%`, marks: [['Hannah', 96], ['Sam', 85], ['Marcus', 70]] },
  { key: 'bookBest', event: 'Library book hunt', unit: v => `${(v / 10).toFixed(1)} s`, lower: true, marks: [['Sister Lund', 280], ['Kenzie', 400], ['Ben', 560]] },
  { key: 'pongRally', event: 'Ping-pong longest rally', unit: v => `${v}`, marks: [['Jo', 22], ['Felipe', 14], ['Ashley', 9]] },
];
export function recordsHtml(p: Progress) {
  return `<table class="friends">${RIVALS.map(r => {
    const mine = p.stat(r.key), all: [string, number][] = [...r.marks, ...(mine ? [['You', mine] as [string, number]] : [])].sort((a, b) => (r.lower ? a[1] - b[1] : b[1] - a[1]));
    const rank = mine ? all.findIndex(x => x[0] === 'You') + 1 : 0;
    return `<tr><td><b>${r.event}</b></td><td>${all.slice(0, 3).map((x, i) => `${['🥇', '🥈', '🥉'][i]} ${x[0] === 'You' ? '<b>You</b>' : x[0]} ${r.unit(x[1])}`).join('<br>')}</td><td>${rank ? `You: #${rank} (${r.unit(mine)})` : '<small>not tried yet</small>'}</td></tr>`;
  }).join('')}</table>`;
}
export const isChampion = (p: Progress) => RIVALS.filter(r => { const m = p.stat(r.key); return m && r.marks.every(([, v]) => (r.lower ? m < v : m > v)); }).length;
