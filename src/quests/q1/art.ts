// 1B. Art — "Drawing what you see" (original Spori art studio): teach the grid method by
// copying the projected reference. The class guesses as you draw; on Hard the projector
// projector shorts out partway through (sooner on Hard) and you finish from memory —
// the engineering demo repairs it. Data: data/art.json.
import * as THREE from 'three';
import data from './data/art.json';
import type { ChallengeBody } from '../shared/frame';
import { btn, h } from '../shared/frame';
import { classroom } from './classroom';
import { chalk, type Surface } from './room3d';
import { playMusic, type MusicData } from './hymn';

export const ART = data as unknown as { note: string; music?: MusicData; subject: string; references?: Record<string, string[]>; subjects?: Record<string, string>; guesses: { at: number; text: string }[]; palette: { id: string; name: string; color: string }[]; reference: string[]; canvas: { width: number; height: number };
  modes: Record<string, { pass: number; liveMeter: boolean; showReference: boolean; previewSeconds?: number; hintSeconds: number; hints: number; shortAtSeconds?: number }> };

/** Index of the furthest class guess reached for a live score (−1 = none yet). */
export const guessIndex = (score: number) => ART.guesses.reduce((k, g, i) => (score >= g.at ? i : k), -1);

export type Grid = (string | null)[][];
export const refRows = (): string[] => ART.references?.[ART.subject] ?? ART.reference;
export const refGrid = (): Grid => refRows().map(r => [...r].map(c => (c === '.' ? null : c)));

/**
 * Best-offset score: the reference may be painted anywhere on the larger canvas.
 * score = matching coloured cells (same colour) / union of coloured cells (either grid), background ignored.
 */
export function scoreDrawing(canvas: Grid, ref: Grid): { score: number; ox: number; oy: number } {
  const H = canvas.length, W = canvas[0]?.length ?? 0, rh = ref.length, rw = ref[0]?.length ?? 0;
  let painted = 0; for (const row of canvas) for (const c of row) if (c) painted++;
  let refCount = 0; for (const row of ref) for (const c of row) if (c) refCount++;
  let best = { score: 0, ox: 0, oy: 0 };
  for (let oy = -rh + 1; oy < H; oy++) for (let ox = -rw + 1; ox < W; ox++) {
    let match = 0, both = 0;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const r = ref[y][x]; if (!r) continue;
      const cy = oy + y, cx = ox + x; if (cy < 0 || cx < 0 || cy >= H || cx >= W) continue;
      const c = canvas[cy][cx]; if (!c) continue;
      both++; if (c === r) match++;
    }
    const union = painted + refCount - both;
    const s = union ? match / union : 0;
    if (s > best.score) best = { score: s, ox, oy };
  }
  return best;
}

/** 4-connected flood fill of the region under (x, y) with colour v (returns cells changed). */
export function floodFill(g: Grid, x: number, y: number, v: string | null): number {
  const H = g.length, W = g[0].length, from = g[y][x]; if (from === v) return 0;
  const st: [number, number][] = [[x, y]]; let n = 0;
  while (st.length) {
    const [cx, cy] = st.pop()!; if (cx < 0 || cy < 0 || cx >= W || cy >= H || g[cy][cx] !== from) continue;
    g[cy][cx] = v; n++; st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}

/** Turn the finished painting into a spinning voxel model (result-screen reveal). */
export function voxelReveal(el: HTMLElement, canvas: Grid): () => void {
  const cells: { x: number; y: number; c: string }[] = [];
  canvas.forEach((r, y) => r.forEach((c, x) => { if (c) cells.push({ x, y, c }); }));
  if (!cells.length) return () => {};
  const minX = Math.min(...cells.map(c => c.x)), maxX = Math.max(...cells.map(c => c.x)), minY = Math.min(...cells.map(c => c.y)), maxY = Math.max(...cells.map(c => c.y));
  const cv = document.createElement('canvas'); cv.className = 'art-reveal'; cv.width = 360; cv.height = 280; el.append(cv, h('div', { class: 'small', text: 'Your concept, built in voxels' }));
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { cv.remove(); return () => {}; }
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 360 / 280, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0x404050, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(5, 10, 8); scene.add(sun);
  const geo = new THREE.BoxGeometry(0.96, 0.96, 1), mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length * 2), m = new THREE.Matrix4(), col = new THREE.Color();
  let k = 0;
  for (const c of cells) {
    const depth = c.c === 'b' ? 1 : c.c === 'g' ? 3 : 2;                                  // windows recessed, gold proud
    for (let d = 0; d < Math.min(2, depth); d++) {
      m.makeScale(1, 1, depth / 2); m.setPosition(c.x - (minX + maxX) / 2, maxY - c.y, d * depth / 2 - depth / 4);
      mesh.setMatrixAt(k, m); mesh.setColorAt(k, col.set(ART.palette.find(p => p.id === c.c)!.color)); k++;
    }
  }
  mesh.count = k; scene.add(mesh);
  const size = Math.max(maxX - minX, maxY - minY) + 4;
  let id = 0; const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / 1000, a = Math.sin(t * 0.8) * 0.9;
    cam.position.set(Math.sin(a) * size * 1.6, (maxY - minY) / 2 + size * 0.25, Math.cos(a) * size * 1.6); cam.lookAt(0, (maxY - minY) / 2, 0);
    mesh.scale.y = Math.min(1, t * 1.2);                                                        // rises from the ground
    renderer.render(scene, cam); id = requestAnimationFrame(tick);
  };
  tick();
  return () => { cancelAnimationFrame(id); geo.dispose(); mat.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
}

/** The temple reference projected on the studio wall (dark when the projector is out). */
export function drawProjectedRef(p: Surface, on: boolean) {
  const ref = refGrid(), colorOf = (id: string) => ART.palette.find(q => q.id === id)!.color;
  const g = p.g; g.fillStyle = on ? '#4f5a63' : '#151515'; g.fillRect(0, 0, p.w, p.h);
  if (on) {
    const cs = Math.floor(Math.min((p.w - 40) / ref[0].length, (p.h - 40) / ref.length)), ox = (p.w - cs * ref[0].length) / 2, oy = (p.h - cs * ref.length) / 2;
    ref.forEach((r, y) => r.forEach((c, x) => { g.fillStyle = c ? colorOf(c) : '#6f7b86'; g.fillRect(ox + x * cs, oy + y * cs, cs - 2, cs - 2); }));
  }
  p.refresh();
}

export const artChallenge: ChallengeBody = (root, api) => {
  const mode = ART.modes[api.difficulty], { width: W, height: H } = ART.canvas, ref = refGrid();
  const canvas: Grid = Array.from({ length: H }, () => Array(W).fill(null));
  let cx = Math.floor(W / 2), cy = Math.floor(H / 2), colorIdx = 0, mirror = false, bucket = false, hintsLeft = mode.hints;
  const t0 = performance.now();
  const inCanvas = true;
  const color = () => ART.palette[colorIdx];

  const cells: HTMLElement[][] = [];
  const grid = h('div', { class: 'art-canvas', role: 'grid', 'aria-label': 'Painting canvas', style: `grid-template-columns: repeat(${W}, 1fr)` });
  for (let y = 0; y < H; y++) { cells.push([]); for (let x = 0; x < W; x++) { const c = h('div', { class: 'cell' }); c.dataset.x = String(x); c.dataset.y = String(y); grid.append(c); cells[y].push(c); } }
  const refEl = h('div', { class: 'art-ref', style: `grid-template-columns: repeat(${ref[0].length}, 1fr)` });
  for (const row of ref) for (const c of row) refEl.append(h('div', { class: 'cell', style: c ? `background:${ART.palette.find(p => p.id === c)!.color}` : '' }));
  const refBox = h('div', { class: 'art-refbox' }, h('div', { class: 'ref-title', text: ART.subjects?.[ART.subject] ?? 'Projected reference' }), refEl);
  const meter = h('div', { class: 'meter' }, h('div', { class: 'meter-fill' }), h('span', { class: 'meter-text' }));
  const palette = h('div', { class: 'palette' }, ...ART.palette.map((p, i) => { const b = btn(p.name, () => { colorIdx = i; paintUI(); }, 'swatch'); b.style.setProperty('--sw', p.color); return b; }));
  const mirrorBtn = btn('Mirror: off', () => { mirror = !mirror; paintUI(); });
  const bucketBtn = btn('Bucket: off', () => { bucket = !bucket; paintUI(); });
  const undoStack: Grid[] = []; const snap = () => { undoStack.push(canvas.map(r => [...r])); if (undoStack.length > 20) undoStack.shift(); };
  const undo = () => { const u = undoStack.pop(); if (u) { u.forEach((r, y) => { canvas[y] = r; }); paintUI(); } };
  const tools = h('div', { class: 'art-tools tools-zone' }, btn('✔ Check painting', () => check(), 'primary'), mirrorBtn, bucketBtn, btn('Undo fill/clear', () => undo()), btn('Clear', () => { snap(); canvas.forEach(r => r.fill(null)); paintUI(); }));
  root.append(h('div', { class: 'art-wrap' }, h('div', {}, grid),
    h('div', { class: 'art-side' }, refBox, mode.liveMeter ? meter : null, h('div', { class: 'ref-title', text: 'Colours (right stick / R·F)' }), palette, tools)));
  palette.querySelectorAll('[data-focus]').forEach(b => b.removeAttribute('data-focus')); // colours: right stick (mouse can click)
  api.setControls(classroom()?.room ? [['L', 'move brush'], ['R', 'colour'], ['RU', '↑ view · ↓ fill bucket'], ['1', 'paint'], ['2', 'erase'], ['3', 'hint'], ['4', 'mirror / check / tools']] : [['L', 'move brush'], ['R', 'colour'], ['RU', '↑ mirror · ↓ fill bucket'], ['1', 'paint'], ['2', 'erase'], ['3', 'hint'], ['4', 'check / tools']]);

  const cls = classroom();
  const room = cls?.room ?? null;
  const colorOf = (id: string) => ART.palette.find(p => p.id === id)!.color;
  const drawProjected = (on: boolean) => { const p = room?.get('poster'); if (p) drawProjectedRef(p, on); room?.signal('beam', on); };
  const drawBoard3d = () => {
    const b = room?.get('board'); if (!b) return;
    chalk(b, '#34463d');
    const cs = Math.floor(Math.min((b.w - 60) / W, (b.h - 60) / H)), ox = (b.w - cs * W) / 2, oy = (b.h - cs * H) / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = canvas[y][x]; b.g.fillStyle = v ? colorOf(v) : 'rgba(255,255,255,.06)'; b.g.fillRect(ox + x * cs, oy + y * cs, cs - 2, cs - 2);
      if (ghost) { const r = ref[y - ghost.oy]?.[x - ghost.ox]; if (r) { b.g.strokeStyle = colorOf(r); b.g.lineWidth = 3; b.g.strokeRect(ox + x * cs + 2, oy + y * cs + 2, cs - 6, cs - 6); } }
      if (x === cx && y === cy) { b.g.strokeStyle = '#ffd34d'; b.g.lineWidth = 5; b.g.strokeRect(ox + x * cs - 3, oy + y * cs - 3, cs + 4, cs + 4); }
    }
    b.refresh();
  };
  let guessAt = -1, oohed = false, bulb: 'on' | 'out' = 'on', finished = false;
  const set = (x: number, y: number, v: string | null) => {
    canvas[y][x] = v;
    if (mirror) { const mx = W - 1 - x; canvas[y][mx] = v; if (v && !oohed && mx !== x) { oohed = true; cls?.react('ooh', 'Ooh — both sides at once!'); } }
  };
  const bulbOut = () => {
    if (bulb !== 'on' || finished) return; bulb = 'out';
    refBox.classList.add('q1-dark'); drawProjected(false); room?.signal('fuse', true);
    cls?.react('gasp', 'Pop! The projector just shorted out!');
    window.setTimeout(() => { if (!finished) cls?.react('nod', 'Keep going from memory — we’ll send it to the engineering lab.', 'Brother Sorensen (art chair)'); }, 2200);
    api.setStatus('The projector shorted out — finish the drawing from memory.');
  };
  const classWatch = () => {
    const s = scoreDrawing(canvas, ref).score;
    cls?.engagement(Math.min(1, s / mode.pass));
    const gi = guessIndex(s);
    if (gi > guessAt) { guessAt = gi; cls?.react(gi === ART.guesses.length - 1 ? 'ooh' : 'nod', ART.guesses[gi].text); }
  };
  let ghost: { ox: number; oy: number } | null = null;
  const paintUI = () => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = cells[y][x], v = canvas[y][x];
      c.style.background = v ? ART.palette.find(p => p.id === v)!.color : '';
      c.classList.toggle('cursor', inCanvas && x === cx && y === cy);
      let g = ''; if (ghost) { const ry = y - ghost.oy, rx = x - ghost.ox; const r = ref[ry]?.[rx]; if (r) g = ART.palette.find(p => p.id === r)!.color; }
      c.style.boxShadow = g ? `inset 0 0 0 3px ${g}` : '';
    }
    palette.querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('active', i === colorIdx));
    mirrorBtn.textContent = `Mirror: ${mirror ? 'on' : 'off'}`; bucketBtn.textContent = `Bucket: ${bucket ? 'on' : 'off'}`;
    if (mode.liveMeter) { const s = scoreDrawing(canvas, ref).score; (meter.firstChild as HTMLElement).style.width = `${Math.round(s * 100)}%`; (meter.lastChild as HTMLElement).textContent = `Match ${Math.round(s * 100)}% (need ${Math.round(mode.pass * 100)}%)`; }
    if (bulb !== 'out') api.setStatus(`Colour: ${color().name}${mirror ? ' · mirror on' : ''}${bucket ? ' · bucket on (mouse)' : ''}`);
    classWatch(); drawBoard3d();
    grid.classList.toggle('active', inCanvas);
  };
  const check = () => {
    const { score } = scoreDrawing(canvas, ref);
    let poppedAtEnd = false;
    if (score >= mode.pass) {
      finished = true; clearTimeout(bulbClock);
      // The projector always shorts out during the art demo — if you finished first, it pops right at the end.
      if (bulb === 'on') { poppedAtEnd = true; bulb = 'out'; refBox.classList.add('q1-dark'); drawProjected(false); room?.signal('fuse', true); cls?.react('gasp', 'Pop! The projector just shorted out — right at the end!'); }
    }
    const pass = score >= mode.pass, secs = Math.round((performance.now() - t0) / 1000);
    const snapshot = canvas.map(r => [...r]);
    const done = () => api.finish({ pass, quality: Math.min(1, score) * 0.85 + (secs < 120 ? 0.15 : secs < 240 ? 0.07 : 0) - api.hintsUsed() * 0.05,
      summary: `Your painting matches ${Math.round(score * 100)}% of the reference (needed ${Math.round(mode.pass * 100)}%) · ${secs} s.`,
      extra: pass ? el => voxelReveal(el, snapshot) : undefined });
    if (poppedAtEnd) window.setTimeout(done, 1600); else done();
  };
  // mouse
  let drag: 'paint' | 'erase' | null = null;
  const at = (e: PointerEvent) => { const t = (e.target as HTMLElement).closest('.cell') as HTMLElement | null; return t && t.dataset.x ? [+t.dataset.x, +t.dataset.y!] : null; };
  grid.addEventListener('contextmenu', e => e.preventDefault());
  grid.addEventListener('pointerdown', e => {
    const p = at(e); if (!p) return; cx = p[0]; cy = p[1];
    if (bucket) { fill(e.button === 2 ? null : color().id); return; }
    drag = e.button === 2 ? 'erase' : 'paint'; set(p[0], p[1], drag === 'paint' ? color().id : null); paintUI();
  });
  grid.addEventListener('pointermove', e => { if (!drag) return; const p = at(e); if (p) { set(p[0], p[1], drag === 'paint' ? color().id : null); paintUI(); } });
  const up = () => { drag = null; }; window.addEventListener('pointerup', up);
  // actions (keyboard + controllers)
  api.onAction(a => {
    if (a === 'alt') { colorIdx = (colorIdx + 1) % ART.palette.length; paintUI(); return true; }
    if (a === 'alt2') { colorIdx = (colorIdx + ART.palette.length - 1) % ART.palette.length; paintUI(); return true; }
    if (a === 'rup' && room) { room.nextView(); const vb = (root.closest('.ch-body') as (HTMLElement & { q1ViewBtn?: HTMLElement }) | null)?.q1ViewBtn; if (vb) vb.textContent = `👁 View: ${room.viewLabel(room.current)} (T)`; return true; }
    if (a === 'rup') { mirror = !mirror; paintUI(); return true; }
    if (a === 'rdown') { fill(color().id); return true; }
    if (a === 'left') cx = Math.max(0, cx - 1); else if (a === 'right') cx = Math.min(W - 1, cx + 1);
    else if (a === 'up') cy = Math.max(0, cy - 1);
    else if (a === 'down') cy = Math.min(H - 1, cy + 1);
    else if (a === 'confirm') set(cx, cy, color().id);
    else if (a === 'back') set(cx, cy, null);
    else return false;
    paintUI(); return true;
  });
  function fill(v: string | null) {
    snap();
    const n = floodFill(canvas, cx, cy, v);
    if (mirror) floodFill(canvas, W - 1 - cx, cy, v);
    api.setStatus(n ? `Filled ${n} squares` : 'Already that colour'); paintUI();
  }
  // reference visibility: Hard shows a short preview, then hides it
  const showRef = (v: boolean) => refEl.classList.toggle('hidden-ref', !v);
  let timer = 0;
  if (!mode.showReference) { showRef(true); api.setStatus('Memorise the reference…'); timer = window.setTimeout(() => showRef(false), (mode.previewSeconds ?? 6) * 1000); }
  const bulbClock = mode.shortAtSeconds ? window.setTimeout(bulbOut, mode.shortAtSeconds * 1000) : 0;
  api.onHint(() => {
    if (hintsLeft <= 0) return null; hintsLeft--;
    if (bulb === 'out') {
      refBox.classList.remove('q1-dark'); window.setTimeout(() => { if (bulb === 'out') refBox.classList.add('q1-dark'); }, mode.hintSeconds * 1000);
      return 'You peek at your sketch in your lesson notes — the reference shows for a moment.';
    }
    if (mode.showReference) {
      const b = scoreDrawing(canvas, ref); ghost = b.score > 0 ? { ox: b.ox, oy: b.oy } : { ox: Math.floor((W - ref[0].length) / 2), oy: Math.floor((H - ref.length) / 2) };
      paintUI(); window.setTimeout(() => { ghost = null; paintUI(); }, mode.hintSeconds * 1000);
      return 'The template is outlined where your painting lines up best.';
    }
    showRef(true); window.setTimeout(() => showRef(false), mode.hintSeconds * 1000);
    return 'The reference is visible again for a few seconds.';
  });
  drawProjected(true);
  // the temple vision plays the team's recording of "High on the Mountain Top" (if it's in public/audio)
  const stopHymn = playMusic(ART.music);
  paintUI();
  return () => { finished = true; stopHymn(); clearTimeout(timer); clearTimeout(bulbClock); window.removeEventListener('pointerup', up); };
};
