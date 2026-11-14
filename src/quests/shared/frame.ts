// Shared challenge frame for quest mini-games: header ("Playing as …"), body, a
// visible Hint button, optional Skip, Leave, and a shared Result / Retry / Leave
// screen. Works with mouse, keyboard and controllers (via the panel action layer).
import type { DifficultyId } from '../../config/game.config';
import type { PanelAction, QuestContext } from '../contract';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | number> = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (k === 'class') el.className = String(v); else if (k === 'text') el.textContent = String(v); else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c != null) el.append(c);
  return el;
}
/** Legend chips: L/R = sticks, 1–4 = controller buttons (keyboard keys shown alongside). */
const KEYS: Record<string, string> = { L: 'WASD', R: 'R/F', RU: 'T/G', '1': 'E', '2': 'Esc', '3': 'H', '4': 'Tab' };
export function legend(items: [string, string][]): HTMLElement {
  return h('div', { class: 'legend', 'aria-label': 'Controls' }, ...items.map(([k, label]) => h('span', { class: 'chip' },
    h('b', { class: `k k${k.length > 1 ? 'R' : k}`, text: k === 'RU' ? 'R↕' : k === 'L' ? 'L🕹' : k === 'R' ? 'R↔' : `${k}` }), h('i', { text: KEYS[k] ?? '' }), ` ${label}`)));
}
export const btn = (label: string, onClick: () => void, cls = '') => { const b = h('button', { 'data-focus': true, class: cls, type: 'button' }, label); b.addEventListener('click', onClick); return b; };

export interface ChallengeResult {
  pass: boolean; quality: number; summary: string;
  /** 0–3; default derived from quality (pass ≥ 1 star). */
  stars?: number;
  /** Optional extra content on the result screen (e.g. a 3D reveal); may return a cleanup. */
  extra?: (el: HTMLElement) => (() => void) | void;
}
export const starsFor = (pass: boolean, quality: number) => (!pass ? 0 : quality >= 0.85 ? 3 : quality >= 0.55 ? 2 : 1);
/** requestAnimationFrame loop; returns a stop function. dt in seconds (clamped). */
export function loop(fn: (dt: number, t: number) => void): () => void {
  let id = 0, last = performance.now(), stopped = false;
  const tick = (now: number) => { if (stopped) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; fn(dt, now / 1000); id = requestAnimationFrame(tick); };
  id = requestAnimationFrame(tick);
  return () => { stopped = true; cancelAnimationFrame(id); };
}
export interface ChallengeApi {
  difficulty: DifficultyId;
  /** Body handles its own actions first (return true to consume); otherwise the frame does (hint/back). */
  onAction(fn: (a: PanelAction) => boolean): void;
  /** Register what the Hint button does (returns the hint text to show, or null if none left). */
  onHint(fn: () => string | null): void;
  setStatus(text: string): void;
  finish(r: ChallengeResult): void;
  refocus(): void;
  hintsUsed(): number;
  /** Controls legend for this game (e.g. [['L', 'move'], ['R', 'colour'], ['1', 'paint'], ...]). */
  setControls(items: [string, string][]): void;
}
export type ChallengeBody = (root: HTMLElement, api: ChallengeApi) => void | (() => void);
export type Outcome = { outcome: 'pass' | 'fail' | 'skip' | 'leave'; quality: number; hints: number };

export function runChallenge(ctx: QuestContext, opts: {
  title: string; playingAs: string; intro: string; allowSkip: boolean; body: ChallengeBody;
  passText: string; failText: string; className?: string;
}): Promise<Outcome> {
  let last: Outcome = { outcome: 'leave', quality: 0, hints: 0 };
  return ctx.ui.custom('', (root, panel) => {
    let cleanup: (() => void) | void;
    let bodyHandler: ((a: PanelAction) => boolean) | null = null;
    let hintFn: (() => string | null) | null = null;
    let hints = 0;

    const attempt = () => {
      extraCleanup?.(); extraCleanup = undefined;
      cleanup?.(); bodyHandler = null; hintFn = null; hints = 0;
      const difficulty = ctx.difficulty();                     // read per attempt: a switch applies to the next attempt
      root.replaceChildren();
      const status = h('div', { class: 'ch-status', 'aria-live': 'polite' });
      const hintOut = h('div', { class: 'ch-hint', 'aria-live': 'polite' });
      const body = h('div', { class: 'ch-body' });
      const hintBtn = btn('💡 Hint', () => doHint(), 'ch-hintbtn');
      const footer = h('div', { class: 'ch-footer tools-zone' }, h('span', { class: 'tools-label', text: '④ Tools' }), hintBtn,
        opts.allowSkip ? btn('Skip challenge', () => done({ outcome: 'skip', quality: 0, hints })) : null,
        btn('Leave', () => done({ outcome: 'leave', quality: 0, hints })));
      const legendBox = h('div', { class: 'legend-box' });
      root.append(
        h('div', { class: 'ch-head' }, h('div', { class: 'ch-playing', text: `Playing as: ${opts.playingAs}` }), h('h2', { class: 'ch-title', text: opts.title }),
          h('div', { class: `ch-diff ${difficulty}`, text: difficulty === 'hard' ? 'Hard' : 'Easy' })),
        h('p', { class: 'ch-intro', text: opts.intro }), status, body, hintOut, footer, legendBox);
      const doHint = () => {
        const text = hintFn?.() ?? null;
        if (text) { hints++; hintOut.textContent = `Hint: ${text}`; ctx.world.sound('chime'); }
        else hintOut.textContent = 'No more hints for this attempt.';
      };
      const api: ChallengeApi = {
        difficulty,
        onAction: fn => { bodyHandler = fn; },
        onHint: fn => { hintFn = fn; },
        setStatus: t => { status.textContent = t; },
        finish: r => showResult(r),
        refocus: () => panel.refocus(),
        hintsUsed: () => hints,
        setControls: items => legendBox.replaceChildren(legend(items)),
      };
      cleanup = opts.body(body, api);
      panel.refocus();
    };

    let extraCleanup: (() => void) | void;
    const showResult = (r: ChallengeResult) => {
      cleanup?.(); cleanup = undefined; bodyHandler = null;
      ctx.world.sound(r.pass ? 'success' : 'error');
      const stars = r.stars ?? starsFor(r.pass, r.quality);
      const extraBox = h('div', { class: 'ch-extra' });
      root.replaceChildren(
        h('div', { class: `ch-result ${r.pass ? 'pass' : 'fail'}` },
          r.pass ? h('div', { class: 'ch-stars', 'aria-label': `${stars} of 3 stars` }, ...[0, 1, 2].map(i => h('span', { class: `star ${i < stars ? 'on' : ''}`, style: `--d:${i * 0.25}s`, text: '★' })))
            : h('div', { class: 'ch-result-icon', text: '✖' }),
          h('h2', { text: r.pass ? opts.passText : opts.failText }),
          h('p', { text: r.summary }), extraBox,
          h('div', { class: 'ch-footer' },
            ...(r.pass ? [btn('Continue', () => done({ outcome: 'pass', quality: r.quality, hints }))]
              : [btn('Retry now', () => attempt()), btn('Leave (retry later)', () => done({ outcome: 'fail', quality: 0, hints }))]))));
      if (r.extra) extraCleanup = r.extra(extraBox);
      if (!r.pass) ctx.fail('challenge failed');
      panel.refocus();
    };
    const done = (o: Outcome) => { last = o; cleanup?.(); extraCleanup?.(); extraCleanup = undefined; panel.close(o.outcome); };

    panel.onAction(a => {
      if (bodyHandler && bodyHandler(a)) return true;
      if (a === 'hint') { (root.querySelector('.ch-hintbtn') as HTMLButtonElement | null)?.click(); return true; }
      return false;                                            // nav/confirm/back fall through to focus navigation / Leave
    });
    attempt();
    return () => { cleanup?.(); extraCleanup?.(); };
  }, { wide: true, className: `challenge fullscreen ${opts.className ?? ''}` }).then(() => last);
}
