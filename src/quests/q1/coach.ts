// Tutorial coach marks for the first question of each teaching demo: the screen dims except
// one highlighted spot, and a small note explains it, with Next ▸ / Skip tutorial
// (like a mobile-game tutorial). Targets are screen rectangles: a region on a 3D board
// (Room3D.screenRegion) or an element of the strip.
import { btn, h } from '../shared/frame';

export interface CoachRect { left: number; top: number; width: number; height: number }
export interface CoachStep { text: string; target: () => CoachRect | null }

/** Shows the steps one by one inside `host`. Returns controls so controller buttons can drive it too (confirm = next, back = skip). */
export function coach(host: HTMLElement, steps: CoachStep[], onDone: () => void): { next: () => void; end: () => void } {
  const layer = h('div', { class: 'q1-coach', role: 'dialog', 'aria-label': 'Tutorial' });
  const hole = h('div', { class: 'q1-coach-hole' });
  const note = h('div', { class: 'q1-coach-note' });
  layer.append(hole, note); host.append(layer);
  let i = 0, raf = 0, ended = false;
  const end = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); layer.remove(); window.removeEventListener('keydown', onKey, true); onDone(); };
  const place = () => {
    const r = steps[i]?.target(), W = window.innerWidth, H = window.innerHeight;
    if (r && r.width > 2) {
      const pad = 8, x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(W - x - 4, r.width + pad * 2), hh = Math.min(H - y - 4, r.height + pad * 2);
      Object.assign(hole.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
      const nw = Math.min(340, W - 32), below = y + hh + 14, above = y - 14;
      const nh = note.offsetHeight || 120;
      const ny = below + nh < H - 8 ? below : Math.max(8, above - nh);
      Object.assign(note.style, { left: `${Math.max(16, Math.min(W - nw - 16, x + w / 2 - nw / 2))}px`, top: `${ny}px`, width: `${nw}px` });
    } else {
      hole.style.display = 'none';
      Object.assign(note.style, { left: `${W / 2 - 170}px`, top: `${H * 0.3}px`, width: '340px' });
    }
    raf = requestAnimationFrame(place);   // follows the camera while it settles
  };
  const show = () => {
    const s = steps[i]; if (!s) { end(); return; }
    const next = btn(i + 1 < steps.length ? 'Next ▸' : 'Got it ▸', () => { i++; show(); }, 'q1-coach-next'); next.removeAttribute('data-focus');
    const skip = btn('Skip tutorial', () => end(), 'q1-coach-skip'); skip.removeAttribute('data-focus');
    note.replaceChildren(h('div', { class: 'q1-coach-step', text: `Tutorial ${i + 1} / ${steps.length}` }), h('p', { text: s.text }), h('div', { class: 'q1-coach-row' }, skip, next));
  };
  // Enter / Space = next, Esc = skip (captured so the demo doesn't also act on them)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); i++; show(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
  };
  window.addEventListener('keydown', onKey, true);
  show(); place();
  return { next: () => { i++; show(); }, end };
}
