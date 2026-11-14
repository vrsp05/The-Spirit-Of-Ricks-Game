// 1D. English — "Editing for accuracy" (Smith Building): Brother Price's summary of the
// Kimball Building dedication (Sept 7, 1999) is projected as a whole page on the
// whiteboard. Move along the words, mark a mistake, and pick the correction — it is
// written in red ink right on the page. Data: data/english.json (fictional student
// summary; facts from the Church News, Sept 11, 1999).
import data from './data/english.json';
import type { ChallengeBody } from '../shared/frame';
import { btn, h } from '../shared/frame';
import { classroom } from './classroom';
import { text, type Hotspot, type Surface } from './room3d';

export interface EnglishError { word: string; correct: string; options: string[]; why: string }
export const ENGLISH = data as unknown as {
  label: string; facts: string[]; passages: Record<string, { text: string; errors: EnglishError[] }>;
  modes: Record<string, { wrongAllowance: number; hints: number; hintStyle: 'glow' | 'count'; speed?: number }>;
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

/** Greedy word wrap: returns lines of token indices that fit in maxW. */
export function layoutLines(tokens: string[], measure: (t: string) => number, maxW: number, space: number): number[][] {
  const lines: number[][] = [[]]; let w = 0;
  tokens.forEach((t, i) => {
    const tw = measure(t), need = lines[lines.length - 1].length ? space + tw : tw;
    if (w + need > maxW && lines[lines.length - 1].length) { lines.push([i]); w = tw; } else { lines[lines.length - 1].push(i); w += need; }
  });
  return lines;
}
/** Sentence number for each token (a token ending in . ! ? closes a sentence). */
export const sentenceOf = (tokens: string[]) => { let s = 0; return tokens.map(t => { const id = s; if (/[.!?]$/.test(t)) s++; return id; }); };

/** The Church News fact clipping on the bulletin board (also drawn before the demo starts). */
export function drawFactClipping(p: Surface) {
  const SERIF = 'Georgia, serif', g = p.g; g.fillStyle = '#f4efe2'; g.fillRect(0, 0, p.w, p.h); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(p.w / 2, 30, 14, 0, 7); g.fill();
  let y = text(p, 'CHURCH NEWS · Sept. 11, 1999', p.w / 2, 60, 30, '#222', 'center', SERIF);
  y = text(p, 'Fact sheet', p.w / 2, y + 4, 40, '#222', 'center', SERIF) + 10;
  for (const f of ENGLISH.facts) y = text(p, '• ' + f, 40, y + 8, 27, '#222', 'left', SERIF, p.w - 80);
  p.refresh();
}

export const englishChallenge: ChallengeBody = (root, api) => {
  const mode = ENGLISH.modes[api.difficulty];
  const { tokens, errorAt } = preparePassage(api.difficulty);
  const sent = sentenceOf(tokens);
  const room = classroom()?.room ?? null;
  const fixed = new Map<number, string>();               // token → correction written in red
  let cur = 0, wrong = 0, hintsLeft = mode.hints, over = false, flashBad = -1, flashT = 0, glow = new Set<number>();
  let choosing: { i: number; opts: string[]; sel: number } | null = null;

  // ---- the page (projected on the whiteboard, or a local canvas without a room) ----
  const local = room ? null : (() => { const c = h('canvas', { class: 'q1-page', width: 1400, height: 480 }) as HTMLCanvasElement; return { canvas: c, g: c.getContext('2d')!, w: 1400, h: 480, refresh: () => {} } as Surface; })();
  const page = () => room?.get('board') ?? local;
  const FONT = 42, LH = 70, MX = 70, TOP = 96, SERIF = 'Georgia, serif';
  let lines: number[][] = [], pos: { x: number; y: number; w: number }[] = [];
  const layout = () => {
    const p = page(); if (!p) return;
    p.g.font = `${FONT}px ${SERIF}`;
    const space = p.g.measureText(' ').width * 1.6;
    lines = layoutLines(tokens, t => p.g.measureText(t).width, p.w - MX * 2, space);
    pos = [];
    const top = Math.max(TOP, Math.round((p.h - lines.length * LH) / 2) + 24);   // short passages sit centred, not stuck to the top
    lines.forEach((ln, li) => { let x = MX; for (const i of ln) { const w = p.g.measureText(tokens[i]).width; pos[i] = { x, y: top + li * LH, w }; x += w + space; } });
  };
  const draw = () => {
    const p = page(); if (!p) return; const g = p.g;
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, p.w, p.h);
    g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(24, 20, p.w - 48, p.h - 40);
    text(p, 'The Kimball Building — summary by Brother Price', MX, 26, 30, '#555', 'left', SERIF);
    g.font = `${FONT}px ${SERIF}`; g.textBaseline = 'top'; g.textAlign = 'left';
    tokens.forEach((t, i) => {
      const q = pos[i]; if (!q) return;
      if (glow.has(sent[i])) { g.fillStyle = 'rgba(255,214,80,.35)'; g.fillRect(q.x - 6, q.y - 4, q.w + 12, FONT + 12); }
      if (i === cur && !over) { g.fillStyle = choosing ? 'rgba(220,60,40,.25)' : 'rgba(255,200,40,.55)'; g.fillRect(q.x - 6, q.y - 4, q.w + 12, FONT + 12); }
      const fx = fixed.get(i);
      g.fillStyle = fx ? '#777' : i === flashBad && flashT > 0 ? '#c0392b' : '#1a1a1a';
      g.fillText(t, q.x, q.y);
      if (fx) {
        g.strokeStyle = '#c0392b'; g.lineWidth = 4; g.beginPath(); g.moveTo(q.x - 4, q.y + FONT * 0.55); g.lineTo(q.x + q.w + 4, q.y + FONT * 0.55); g.stroke();
        g.fillStyle = '#c0392b'; g.font = `italic ${Math.round(FONT * 0.62)}px ${SERIF}`; g.fillText(fx, q.x, q.y - FONT * 0.62); g.font = `${FONT}px ${SERIF}`;
      }
      if (i === flashBad && flashT > 0) { g.strokeStyle = '#c0392b'; g.lineWidth = 4; g.beginPath(); g.ellipse(q.x + q.w / 2, q.y + FONT / 2, q.w / 2 + 12, FONT * 0.8, 0, 0, 7); g.stroke(); }
    });
    // clicking a word on the page marks it
    const spots: Hotspot[] = over ? [] : tokens.map((_, i) => ({ x: pos[i].x - 6, y: pos[i].y - 6, w: pos[i].w + 12, h: FONT + 14, on: () => { if (choosing) return; cur = i; mark(); } }));
    // correction bubble in red ink, right above the chosen word, with a tail pointing at it
    if (choosing && !over) {
      const c = choosing, q = pos[c.i], BF = 34, padX = 18, gap = 26, items = [...c.opts, '✕'];
      g.font = `italic ${BF}px ${SERIF}`;
      const ws = items.map(o => g.measureText(o).width), bw = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1) + padX * 2, bh = BF + 26;
      const bx = Math.max(30, Math.min(p.w - bw - 30, q.x + q.w / 2 - 40)), by = Math.max(8, q.y - bh - 24), tx = Math.max(bx + 24, Math.min(bx + bw - 24, q.x + q.w / 2));
      g.fillStyle = '#ffffff'; g.strokeStyle = '#c0392b'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(bx + 12, by); g.lineTo(bx + bw - 12, by); g.quadraticCurveTo(bx + bw, by, bx + bw, by + 12); g.lineTo(bx + bw, by + bh - 12); g.quadraticCurveTo(bx + bw, by + bh, bx + bw - 12, by + bh);
      g.lineTo(tx + 14, by + bh); g.lineTo(tx, by + bh + 20); g.lineTo(tx - 14, by + bh);
      g.lineTo(bx + 12, by + bh); g.quadraticCurveTo(bx, by + bh, bx, by + bh - 12); g.lineTo(bx, by + 12); g.quadraticCurveTo(bx, by, bx + 12, by); g.closePath(); g.fill(); g.stroke();
      let x = bx + padX;
      items.forEach((o, k) => {
        const sel = k === c.sel;
        if (sel) { g.fillStyle = 'rgba(255,211,77,.55)'; g.fillRect(x - 8, by + 8, ws[k] + 16, bh - 16); }
        g.fillStyle = k === items.length - 1 ? '#777' : '#c0392b'; g.textBaseline = 'top'; g.fillText(o, x, by + 13);
        const ox = x;
        spots.unshift({ x: ox - 8, y: by, w: ws[k] + 16, h: bh, on: () => { if (k === items.length - 1) { choosing = null; renderAll(); } else { c.sel = k; pick(); } } });
        x += ws[k] + gap;
      });
      g.font = `${FONT}px ${SERIF}`;
    }
    if (pos.length) { const ys = pos.map(q => q.y); room?.setRegion('page', 'board', { x: MX - 20, y: Math.min(...ys) - 16, w: p.w - MX * 2 + 40, h: Math.max(...ys) - Math.min(...ys) + FONT + 32 }); }
    room?.setHotspots('board', spots);
    p.refresh();
  };

  // ---- bottom strip: progress, the current line as clickable words (mouse), corrections ----
  const hud = h('div', { class: 'q1-eng-hud' });
  const lineRow = h('div', { class: 'q1-eng-line' });
  const choice = h('div', { class: 'q1-eng-choice' });
  if (local) root.append(local.canvas);
  root.append(hud, lineRow, choice);
  const lineOf = (i: number) => lines.findIndex(l => l.includes(i));
  const renderStrip = () => {
    const allow = mode.wrongAllowance >= 0 ? ` / ${mode.wrongAllowance}` : '';
    hud.textContent = `✎ Fixed ${fixed.size} of ${errorAt.size} · wrong marks ${wrong}${allow}`;
    const li = Math.max(0, lineOf(cur));
    lineRow.replaceChildren(h('span', { class: 'q1-eng-lbl', text: `Line ${li + 1}:` }), ...(lines[li] ?? []).map(i => {
      const b = btn(fixed.get(i) ?? tokens[i], () => { cur = i; mark(); }, `${i === cur ? 'sel' : ''} ${fixed.has(i) ? 'fixed' : ''}`); b.removeAttribute('data-focus'); return b;
    }));
    if (!choosing) { choice.replaceChildren(h('span', { class: 'small', text: 'Move along the page and press ① on a word that is wrong.' })); return; }
    const c = choosing;
    choice.replaceChildren(h('b', { text: `Replace “${tokens[c.i]}” with: ` }), ...c.opts.map((o, k) => { const b = btn(o, () => { c.sel = k; pick(); }, k === c.sel ? 'sel' : ''); b.removeAttribute('data-focus'); return b; }),
      (() => { const b = btn('Cancel', () => { choosing = null; renderAll(); }); b.removeAttribute('data-focus'); return b; })());
  };
  const renderAll = () => { draw(); renderStrip(); };

  const finishIfDone = () => {
    if (fixed.size < errorAt.size) return;
    over = true; draw();
    window.setTimeout(() => api.finish({ pass: true, quality: Math.max(0, 1 - wrong * 0.12 - api.hintsUsed() * 0.06),
      summary: `All ${errorAt.size} mistakes corrected on the page, with ${wrong} wrong mark${wrong === 1 ? '' : 's'}.` }), 700);
  };
  const mark = () => {
    if (over || choosing) return;
    if (fixed.has(cur)) { api.setStatus('Already corrected.'); return; }
    const e = errorAt.get(cur);
    if (!e) {
      wrong++; flashBad = cur; flashT = 1; classroom()?.react('confused', `“${tokens[cur]}” is fine, actually.`, 'Brother Price');
      if (mode.wrongAllowance >= 0 && wrong > mode.wrongAllowance) { over = true; renderAll(); window.setTimeout(() => api.finish({ pass: false, quality: 0, summary: `Too many wrong marks (${wrong}). Check the Church News clipping and try again.` }), 900); return; }
      renderAll(); return;
    }
    choosing = { i: cur, opts: [...e.options].sort(() => Math.random() - 0.5), sel: 0 }; renderAll();
  };
  const pick = () => {
    if (!choosing) return; const c = choosing, e = errorAt.get(c.i)!, o = c.opts[c.sel];
    if (o === e.correct) {
      fixed.set(c.i, o); choosing = null; glow.delete(sent[c.i]); api.setStatus(`✔ ${e.why}`);
      classroom()?.react('nod', '…yeah, okay, that’s fair.', 'Brother Price'); classroom()?.bump(0.1);
      renderAll(); finishIfDone();
    } else {
      wrong++; c.opts.splice(c.sel, 1); c.sel = 0; classroom()?.react('confused');
      api.setStatus(`“${o}” isn’t right here.`);
      if (mode.wrongAllowance >= 0 && wrong > mode.wrongAllowance) { over = true; choosing = null; renderAll(); window.setTimeout(() => api.finish({ pass: false, quality: 0, summary: `Too many wrong marks (${wrong}).` }), 900); return; }
      renderAll();
    }
  };
  const move = (dx: number, dy: number) => {
    if (dy) {
      const li = lineOf(cur), nl = Math.max(0, Math.min(lines.length - 1, li + dy)); if (nl === li) return;
      const x = pos[cur].x; cur = lines[nl].reduce((b, i) => (Math.abs(pos[i].x - x) < Math.abs(pos[b].x - x) ? i : b), lines[nl][0]);
    } else cur = Math.max(0, Math.min(tokens.length - 1, cur + dx));
    renderAll();
  };

  api.setControls([['L', 'move along the page'], ['1', 'mark word / choose'], ['2', 'cancel'], ['RU', 'view'], ['3', 'hint']]);
  api.onHint(() => {
    if (hintsLeft <= 0) return null;
    const rem = [...errorAt.keys()].filter(i => !fixed.has(i)); if (!rem.length) return null;
    hintsLeft--;
    if (mode.hintStyle === 'count') return `${rem.length} mistake(s) left. Compare dates, places and names with the Church News clipping on the bulletin board.`;
    glow.add(sent[rem[0]]); draw();
    return 'The sentence with the next mistake is highlighted on the page.';
  });
  api.onAction(a => {
    if (a === 'rup' && room) { room.nextView(); const vb = (root.closest('.ch-body') as (HTMLElement & { q1ViewBtn?: HTMLElement }) | null)?.q1ViewBtn; if (vb) vb.textContent = `👁 View: ${room.viewLabel(room.current)} (T)`; return true; }
    if (over) return true;
    if (choosing) {
      if (a === 'left' || a === 'up' || a === 'alt2') choosing.sel = (choosing.sel + choosing.opts.length - 1) % choosing.opts.length;
      else if (a === 'right' || a === 'down' || a === 'alt') choosing.sel = (choosing.sel + 1) % choosing.opts.length;
      else if (a === 'confirm') { pick(); return true; }
      else if (a === 'back') { choosing = null; renderAll(); return true; }
      else return a === 'rdown';
      renderAll(); return true;
    }
    if (a === 'left' || a === 'alt2') { move(-1, 0); return true; }
    if (a === 'right' || a === 'alt') { move(1, 0); return true; }
    if (a === 'up') { move(0, -1); return true; }
    if (a === 'down') { move(0, 1); return true; }
    if (a === 'confirm') { mark(); return true; }
    if (a === 'back' || a === 'rdown') return true;
    return false;
  });

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__english = { tokens, errors: [...errorAt.entries()].map(([i, e]) => ({ i, correct: e.correct })), cur: () => cur, choosing: () => choosing };   // test hook (dev builds only)
  const clip = room?.get('poster'); if (clip) drawFactClipping(clip);
  let raf = 0, last = performance.now();
  const tick = (now: number) => { const dt = (now - last) / 1000; last = now; if (flashT > 0) { flashT -= dt; if (flashT <= 0) draw(); } raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  layout(); renderAll();
  return () => cancelAnimationFrame(raf);
};
