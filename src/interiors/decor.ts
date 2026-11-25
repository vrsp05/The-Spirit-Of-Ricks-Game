// Interior decoration kit: floor materials, a dressing pass for every room (baseboards, a chair rail,
// windows with daylight, wall lights) and small furniture builders (plants, lockers, sofas, computers…).
// Furniture that should stop the player is registered with solid(); InteriorManager.space() reads it.
import * as THREE from 'three';
import { textCanvas } from '../world/World';

export interface Rect { x0: number; z0: number; x1: number; z1: number; h?: number; color?: string }
export type FloorStyle = 'wood' | 'tile' | 'carpet' | 'court' | 'checker' | 'terrazzo' | 'mcTile' | 'darkTile' | 'sport' | 'patternCarpet';

// ---------------------------------------------------------------- materials (shared, so rooms stay cheap)
const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const k = color + JSON.stringify(extra);
  let m = mats.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.set(k, m); }
  return m;
}
const geos = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number) { const k = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`; let g = geos.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); geos.set(k, g); } return g; }
/** A box centred at (x, y, z). */
export function box(g: THREE.Object3D, w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m;
}
/** Furniture the player can't walk through (room-local rectangle). */
export function solid(g: THREE.Object3D, r: Rect) { ((g.userData.solids ??= []) as Rect[]).push(r); }
export const solidsOf = (g: THREE.Object3D): Rect[] => g.userData.solids ?? [];

const shade = (hex: string, f: number) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

// ---------------------------------------------------------------- floors
/** Canvas texture for a W×D m floor. */
export function floorTexture(style: FloorStyle, base: string, W: number, D: number): THREE.CanvasTexture {
  const px = Math.min(24, Math.floor(2048 / Math.max(W, D)));
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(W * px)); c.height = Math.max(8, Math.round(D * px));
  const g = c.getContext('2d')!;
  let s = 99; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (style === 'wood' || style === 'court') {
    const plank = 0.22 * px;
    for (let y = 0, row = 0; y < c.height; y += plank, row++) {
      let x = -r() * 3 * px;
      while (x < c.width) { const L = (1.2 + r() * 1.6) * px; g.fillStyle = shade(base, 0.86 + r() * 0.2); g.fillRect(x, y, L - 1, plank - 1); x += L; }
    }
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < c.height; y += plank) g.fillRect(0, y + plank - 1, c.width, 1);
    if (style === 'court') {
      // basketball court lines (two courts side by side, like the gym layout)
      g.strokeStyle = '#f4efe2'; g.lineWidth = Math.max(2, px * 0.08);
      const m = (v: number, axis: 'x' | 'z') => (v + (axis === 'x' ? W : D) / 2) * px;
      for (const cx of [-13, 13]) {
        g.strokeRect(m(cx - 9, 'x'), m(-14, 'z'), 18 * px, 28 * px);
        g.beginPath(); g.moveTo(m(cx - 9, 'x'), m(0, 'z')); g.lineTo(m(cx + 9, 'x'), m(0, 'z')); g.stroke();
        g.beginPath(); g.arc(m(cx, 'x'), m(0, 'z'), 1.8 * px, 0, Math.PI * 2); g.stroke();
        for (const sz of [-1, 1]) {
          g.strokeRect(m(cx - 2.4, 'x'), m(sz > 0 ? 14 - 5.8 : -14, 'z'), 4.8 * px, 5.8 * px);
          g.beginPath(); g.arc(m(cx, 'x'), m(sz * 12.6, 'z'), 6.7 * px, sz > 0 ? Math.PI * 1.05 : Math.PI * 0.05, sz > 0 ? Math.PI * 1.95 : Math.PI * 0.95); g.stroke();
        }
        g.fillStyle = 'rgba(122,43,43,0.35)'; g.fillRect(m(cx - 2.4, 'x'), m(-14, 'z'), 4.8 * px, 5.8 * px); g.fillRect(m(cx - 2.4, 'x'), m(8.2, 'z'), 4.8 * px, 5.8 * px);
      }
    }
  } else if (style === 'tile') {
    const t = 0.6 * px;
    for (let y = 0, j = 0; y < c.height; y += t, j++) for (let x = 0, i = 0; x < c.width; x += t, i++) {
      g.fillStyle = shade(base, (i + j) % 7 === 0 ? 0.9 : 0.97 + r() * 0.05); g.fillRect(x, y, t, t);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, t, 1); g.fillRect(x, y, 1, t);
    }
  } else if (style === 'terrazzo') {
    // polished light terrazzo with grey border bands (Kimball atrium)
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < c.width * c.height / 10; i++) { g.fillStyle = shade(base, 0.8 + r() * 0.35); g.fillRect(r() * c.width, r() * c.height, 1.5, 1.5); }
    g.fillStyle = 'rgba(90,92,96,0.55)';
    for (let x = 0; x < c.width; x += 6 * px) g.fillRect(x, 0, 0.35 * px, c.height);
    for (let y = 0; y < c.height; y += 6 * px) g.fillRect(0, y, c.width, 0.35 * px);
  } else if (style === 'mcTile') {
    // large grey/white rectangular tiles in a random pattern (Manwaring Center)
    const tw = 1.2 * px, th = 0.6 * px, tones = [1.0, 0.93, 0.82, 0.7];
    for (let y = 0; y < c.height; y += th) for (let x = 0; x < c.width; x += tw) {
      g.fillStyle = shade(base, tones[(r() * tones.length) | 0]); g.fillRect(x, y, tw, th);
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x, y, tw, 1); g.fillRect(x, y, 1, th);
    }
  } else if (style === 'darkTile') {
    // big charcoal porcelain tiles (Science and Technology Center)
    const t = 1.2 * px;
    for (let y = 0; y < c.height; y += t / 2) for (let x = (Math.round(y / (t / 2)) % 2) * t / 2; x < c.width + t; x += t) {
      g.fillStyle = shade(base, 0.92 + r() * 0.14); g.fillRect(x - t / 2, y, t, t / 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - t / 2, y, t, 1); g.fillRect(x - t / 2, y, 1, t / 2);
    }
  } else if (style === 'sport') {
    // blue sport floor with red, yellow and white lines (Hart fitness center)
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < c.width * c.height / 30; i++) { g.fillStyle = shade(base, 0.9 + r() * 0.2); g.fillRect(r() * c.width, r() * c.height, 2, 2); }
    const lw = Math.max(2, px * 0.09);
    for (const [col, off] of [['#f4f1e8', 0.2], ['#e6c33a', 0.45], ['#d9452b', 0.7]] as [string, number][]) {
      g.fillStyle = col; g.fillRect(0, c.height * off, c.width, lw); g.fillRect(c.width * (off * 0.9 + 0.05), 0, lw, c.height);
    }
  } else if (style === 'patternCarpet') {
    // grey commercial carpet with a darker geometric pattern (McKay Library)
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < c.width * c.height / 14; i++) { g.fillStyle = shade(base, 0.8 + r() * 0.35); g.fillRect(r() * c.width, r() * c.height, 2, 2); }
    g.strokeStyle = shade(base, 0.72); g.lineWidth = Math.max(1, px * 0.06);
    for (let y = 0; y < c.height; y += 1.6 * px) for (let x = 0; x < c.width; x += 1.6 * px) { g.strokeRect(x + 0.3 * px, y + 0.3 * px, 1.0 * px, 1.0 * px); }
  } else if (style === 'carpet') {
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < c.width * c.height / 18; i++) { g.fillStyle = shade(base, 0.85 + r() * 0.3); g.fillRect(r() * c.width, r() * c.height, 2, 2); }
  } else {
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) { g.fillStyle = (i + j) % 2 ? base : shade(base, 0.92); g.fillRect(i * px, j * px, px, px); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  if (style === 'checker') tex.magFilter = THREE.NearestFilter;
  return tex;
}

// ---------------------------------------------------------------- the dressing pass (every room)
const SKY = () => mat('#cfe6f5', { emissive: '#bfe0f2', emissiveIntensity: 0.65, roughness: 0.2 });
/**
 * Baseboards and a chair rail along the outer walls, windows with daylight on the north/east/west walls
 * (skipped where an inner wall meets the outer wall), and wall lights between them.
 */
export function dressRoom(g: THREE.Object3D, W: number, D: number, wall: string, walls: Rect[], opts: { windows?: boolean; height?: number } = {}) {
  const base = mat(shade(wall, 0.45)), rail = mat(shade(wall, 0.8)), lower = mat(shade(wall, 0.9));
  const H = opts.height ?? 3.6;
  // north wall + side walls: baseboard, lower wainscot band, chair rail
  box(g, W, 0.16, 0.05, base, 0, 0.08, -D / 2 + 0.03, false);
  box(g, W, 0.9, 0.02, lower, 0, 0.55, -D / 2 + 0.012, false);
  box(g, W, 0.07, 0.06, rail, 0, 1.02, -D / 2 + 0.03, false);
  for (const sx of [-1, 1]) {
    box(g, 0.05, 0.16, D, base, sx * (W / 2 - 0.03), 0.08, 0, false);
    box(g, 0.02, 0.9, D, lower, sx * (W / 2 - 0.012), 0.55, 0, false);
    box(g, 0.06, 0.07, D, rail, sx * (W / 2 - 0.03), 1.02, 0, false);
  }
  // a crown moulding along the top so walls don't end abruptly
  box(g, W + 0.8, 0.12, 0.5, mat(shade(wall, 1.04)), 0, H + 0.06, -D / 2 - 0.2, false);
  for (const sx of [-1, 1]) box(g, 0.5, 0.12, D + 0.8, mat(shade(wall, 1.04)), sx * (W / 2 + 0.2), H + 0.06, 0, false);
  if (opts.windows === false) return;
  const touches = (x: number, z: number) => walls.some(r => x + 1.1 > r.x0 && x - 1.1 < r.x1 && z + 0.6 > r.z0 && z - 0.6 < r.z1 && (r.h ?? H) > 1.2);
  const frameM = mat('#f4f1e8'), sconce = mat('#fff3cf', { emissive: '#ffd98a', emissiveIntensity: 0.9 });
  const windowAt = (x: number, z: number, ry: number) => {
    const w = new THREE.Group(); w.position.set(x, 0, z); w.rotation.y = ry;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), SKY()); pane.position.set(0, 2.0, 0.02); w.add(pane);
    box(w, 1.7, 0.08, 0.08, frameM, 0, 2.69, 0.04, false); box(w, 1.7, 0.1, 0.18, frameM, 0, 1.31, 0.08, false);
    box(w, 0.08, 1.4, 0.08, frameM, -0.81, 2.0, 0.04, false); box(w, 0.08, 1.4, 0.08, frameM, 0.81, 2.0, 0.04, false);
    box(w, 0.05, 1.3, 0.05, frameM, 0, 2.0, 0.05, false); box(w, 1.5, 0.05, 0.05, frameM, 0, 2.0, 0.05, false);
    g.add(w);
  };
  const lightAt = (x: number, z: number, ry: number) => { const l = box(g, 0.3, 0.22, 0.12, sconce, x, 2.95, z, false); l.rotation.y = ry; };
  const step = 4.5;
  for (let x = -W / 2 + 2.5; x <= W / 2 - 2.5; x += step) {
    const z = -D / 2 + 0.01;
    if (!touches(x, -D / 2 + 0.3)) windowAt(x, z, 0); else lightAt(x, z + 0.06, 0);
  }
  for (const sx of [-1, 1]) for (let z = -D / 2 + 2.5; z <= D / 2 - 2.5; z += step) {
    const x = sx * (W / 2 - 0.01);
    if (!touches(sx * (W / 2 - 0.3), z)) windowAt(x, z, -sx * Math.PI / 2); else lightAt(x - sx * 0.06, z, -sx * Math.PI / 2);
  }
}

// ---------------------------------------------------------------- furniture
export function plant(g: THREE.Object3D, x: number, z: number, s = 1) {
  box(g, 0.5 * s, 0.5 * s, 0.5 * s, '#8a5a3a', x, 0.25 * s, z);
  for (const [dx, dy, dz, k] of [[0, 0.75, 0, 0.5], [0.15, 1.05, 0.1, 0.4], [-0.14, 1.0, -0.12, 0.42], [0.05, 1.3, -0.05, 0.3]]) box(g, k * s, k * s, k * s, k > 0.41 ? '#3d7a3a' : '#4f8f45', x + dx * s, dy * s, z + dz * s);
}
export function rug(g: THREE.Object3D, x: number, z: number, w: number, d: number, color: string, border = '#e8d9b5') {
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(border)); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.012, z); r.receiveShadow = true; g.add(r);
  const i = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), mat(color)); i.rotation.x = -Math.PI / 2; i.position.set(x, 0.016, z); i.receiveShadow = true; g.add(i);
}
/** A flat picture / poster / sign on a wall (canvas text). */
export function poster(g: THREE.Object3D, lines: string[], x: number, y: number, z: number, ry: number, w = 1.2, h = 0.8, bg = '#2d3a46', fg = '#f6f0e2') {
  const tex = new THREE.CanvasTexture(textCanvas(lines, { w: 512, h: Math.round(512 * h / w), bg, fg })); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
}
/** A framed landscape painting (procedural: sky, mountains, fields). */
export function painting(g: THREE.Object3D, x: number, y: number, z: number, ry: number, w = 1.4, h = 0.95, seed = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w); const p = c.getContext('2d')!;
  let s = seed * 7919 + 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sky = p.createLinearGradient(0, 0, 0, c.height); sky.addColorStop(0, ['#7fb0d8', '#e8a77a', '#9cc6e0'][seed % 3]); sky.addColorStop(1, '#f3e7cf'); p.fillStyle = sky; p.fillRect(0, 0, 256, c.height);
  p.fillStyle = '#6d7f96'; p.beginPath(); p.moveTo(0, c.height * 0.65); for (let i = 0; i <= 8; i++) p.lineTo(i * 32, c.height * (0.32 + r() * 0.3)); p.lineTo(256, c.height); p.lineTo(0, c.height); p.fill();
  p.fillStyle = '#f4f4f0'; p.beginPath(); p.moveTo(110, c.height * 0.36); p.lineTo(128, c.height * 0.28); p.lineTo(146, c.height * 0.36); p.fill();
  p.fillStyle = ['#6f8f4a', '#9a8a4a', '#5f7f45'][seed % 3]; p.fillRect(0, c.height * 0.7, 256, c.height * 0.3);
  p.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 6; i++) p.fillRect(0, c.height * (0.74 + i * 0.045), 256, 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
  box(grp, w + 0.14, h + 0.14, 0.05, '#6b4a2a', 0, 0, 0, false);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); pic.position.z = 0.03; grp.add(pic);
  g.add(grp); return grp;
}
export function clock(g: THREE.Object3D, x: number, y: number, z: number, ry: number) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const p = c.getContext('2d')!;
  p.fillStyle = '#f8f6f0'; p.beginPath(); p.arc(64, 64, 60, 0, Math.PI * 2); p.fill(); p.lineWidth = 6; p.strokeStyle = '#2a2d31'; p.stroke();
  p.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; p.beginPath(); p.moveTo(64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48); p.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54); p.stroke(); }
  p.lineWidth = 5; p.beginPath(); p.moveTo(64, 64); p.lineTo(64 + 26, 64 - 18); p.stroke(); p.lineWidth = 3; p.beginPath(); p.moveTo(64, 64); p.lineTo(64 - 8, 64 - 42); p.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshStandardMaterial({ map: tex })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
}
/** Bulletin board with a few pinned flyers. */
export function bulletin(g: THREE.Object3D, x: number, y: number, z: number, ry: number, w = 2) {
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
  box(grp, w + 0.1, 1.1, 0.04, '#6b4a2a', 0, 0, 0, false); box(grp, w, 1.0, 0.03, '#b48a5a', 0, 0, 0.015, false);
  const cols = ['#f4f1e8', '#ffe28a', '#bfe0f2', '#f6c1c9', '#c8e6b5'];
  for (let i = 0; i < Math.round(w * 2.5); i++) { const f = box(grp, 0.28, 0.36, 0.01, cols[i % cols.length], -w / 2 + 0.25 + (i * 0.37) % (w - 0.4), ((i * 37) % 3 - 1) * 0.28, 0.035, false); f.rotation.z = ((i * 13) % 5 - 2) * 0.04; }
  g.add(grp); return grp;
}
/** A row of lockers against a wall from x0 to x1 at z, facing ±z. */
export function lockers(g: THREE.Object3D, x0: number, x1: number, z: number, facing: 1 | -1, color = '#3f5f8a') {
  const n = Math.floor((x1 - x0) / 0.5); if (n < 1) return;
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.25 + i * 0.5;
    box(g, 0.48, 1.9, 0.45, i % 2 ? color : shade(color, 0.92), x, 0.95, z + facing * 0.23);
    box(g, 0.3, 0.04, 0.01, '#1c2430', x, 1.6, z + facing * 0.46, false); box(g, 0.3, 0.04, 0.01, '#1c2430', x, 1.5, z + facing * 0.46, false);
    box(g, 0.04, 0.12, 0.02, '#c9c9c9', x + 0.15, 1.1, z + facing * 0.47, false);
  }
  solid(g, { x0, x1, z0: Math.min(z, z + facing * 0.46), z1: Math.max(z, z + facing * 0.46) });
}
export function fountain(g: THREE.Object3D, x: number, z: number, ry: number) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
  box(grp, 0.6, 0.9, 0.4, '#b8bfc4', 0, 0.45, 0.2); box(grp, 0.5, 0.06, 0.3, '#8a9399', 0, 0.92, 0.2); box(grp, 0.05, 0.08, 0.05, '#c9c9c9', 0, 0.98, 0.12);
  g.add(grp);
}
export function trash(g: THREE.Object3D, x: number, z: number, color = '#3a4a3a') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.75, 10), mat(color)); m.position.set(x, 0.38, z); m.castShadow = true; g.add(m);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), mat('#222')); rim.position.set(x, 0.76, z); g.add(rim);
}
export function sofa(g: THREE.Object3D, x: number, z: number, ry: number, color = '#4f6d8a', len = 2.2) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
  box(grp, len, 0.42, 0.9, color, 0, 0.21, 0); box(grp, len, 0.6, 0.22, shade(color, 0.85), 0, 0.6, -0.34);
  for (const s of [-1, 1]) box(grp, 0.2, 0.55, 0.9, shade(color, 0.85), s * (len / 2 - 0.1), 0.35, 0);
  for (let i = 0; i < Math.floor(len / 0.7); i++) box(grp, 0.62, 0.12, 0.6, shade(color, 1.08), -len / 2 + 0.45 + i * 0.66, 0.47, 0.05, false);
  g.add(grp);
  const c = Math.abs(Math.cos(ry)) > 0.5, hw = c ? len / 2 : 0.45, hd = c ? 0.45 : len / 2;
  solid(g, { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
}
export function coffeeTable(g: THREE.Object3D, x: number, z: number, w = 1.2, d = 0.6) {
  box(g, w, 0.06, d, '#6b4a30', x, 0.42, z); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.06, 0.4, 0.06, '#4a3020', x + sx * (w / 2 - 0.06), 0.2, z + sz * (d / 2 - 0.06), false);
  box(g, 0.3, 0.04, 0.22, '#c9a44a', x - 0.2, 0.47, z, false); box(g, 0.22, 0.05, 0.3, '#8d2f2f', x + 0.25, 0.47, z + 0.05, false);
  solid(g, { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
}
/** A desktop computer (monitor + keyboard) on a surface at height y, facing ry. */
export function computer(g: THREE.Object3D, x: number, y: number, z: number, ry: number, era90s = false) {
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
  const screen = mat('#3a6ea8', { emissive: '#4f8fd6', emissiveIntensity: 0.5 });
  if (era90s) { box(grp, 0.45, 0.4, 0.42, '#d8d2c2', 0, 0.22, -0.05); box(grp, 0.34, 0.26, 0.01, screen, 0, 0.25, 0.165, false); }
  else { box(grp, 0.56, 0.34, 0.04, '#1c1c1c', 0, 0.32, -0.05); box(grp, 0.5, 0.28, 0.01, screen, 0, 0.32, -0.025, false); box(grp, 0.06, 0.15, 0.06, '#1c1c1c', 0, 0.08, -0.07, false); }
  box(grp, 0.45, 0.02, 0.15, era90s ? '#d8d2c2' : '#2a2a2a', 0, 0.01, 0.22, false);
  g.add(grp);
}
export function deskLamp(g: THREE.Object3D, x: number, y: number, z: number) {
  box(g, 0.16, 0.03, 0.16, '#2a2a2a', x, y + 0.015, z, false); box(g, 0.03, 0.35, 0.03, '#2a2a2a', x, y + 0.2, z, false);
  box(g, 0.2, 0.12, 0.2, mat('#2f5f3a'), x, y + 0.4, z, false); box(g, 0.14, 0.02, 0.14, mat('#fff3cf', { emissive: '#ffd98a', emissiveIntensity: 1 }), x, y + 0.33, z, false);
}
export function vending(g: THREE.Object3D, x: number, z: number, ry: number, color = '#b8423a') {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
  box(grp, 1.0, 1.9, 0.8, color, 0, 0.95, 0);
  box(grp, 0.62, 1.3, 0.02, mat('#2a3440', { emissive: '#203040', emissiveIntensity: 0.6 }), -0.12, 1.15, 0.41, false);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) box(grp, 0.1, 0.16, 0.05, ['#d9452b', '#e6c33a', '#3d6fa8', '#3f8f4a'][(r + c) % 4], -0.33 + c * 0.14, 0.62 + r * 0.3, 0.38, false);
  box(grp, 0.18, 0.5, 0.02, '#1c1c1c', 0.33, 1.2, 0.41, false);
  g.add(grp);
  const c = Math.abs(Math.cos(ry)) > 0.5; solid(g, { x0: x - (c ? 0.5 : 0.4), x1: x + (c ? 0.5 : 0.4), z0: z - (c ? 0.4 : 0.5), z1: z + (c ? 0.4 : 0.5) });
}
/** Flag on a stand (simple stripes; generic, not any specific flag). */
export function flagStand(g: THREE.Object3D, x: number, z: number, colors: string[]) {
  box(g, 0.4, 0.06, 0.4, '#c9a43a', x, 0.03, z); box(g, 0.05, 2.5, 0.05, '#c9a43a', x, 1.28, z, false); box(g, 0.1, 0.1, 0.1, '#e6c33a', x, 2.55, z, false);
  colors.forEach((c, i) => box(g, 0.02, 0.9 / colors.length, 0.95, c, x, 2.4 - (i + 0.5) * 0.9 / colors.length, z + 0.5, false));
}
export function globe(g: THREE.Object3D, x: number, z: number) {
  box(g, 0.3, 0.8, 0.3, '#5a3a22', x, 0.4, z);
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat('#3d6fa8')); s.position.set(x, 1.1, z); g.add(s);
  const land = new THREE.Mesh(new THREE.SphereGeometry(0.285, 8, 6, 0, 2.2, 0.6, 1.3), mat('#5f8f45')); land.position.set(x, 1.1, z); g.add(land);
}
export function waterCooler(g: THREE.Object3D, x: number, z: number) {
  box(g, 0.4, 1.0, 0.4, '#e8e6e0', x, 0.5, z);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 12), mat('#9fd0ef', { transparent: true, opacity: 0.7, roughness: 0.1 })); b.position.set(x, 1.24, z); g.add(b);
}
/** A pendant light (ceiling cord + glowing shade) hanging at height y. */
export function pendant(g: THREE.Object3D, x: number, z: number, y = 2.9, ceiling = 3.6) {
  box(g, 0.02, ceiling - y, 0.02, '#2a2a2a', x, (ceiling + y) / 2, z, false);
  const shadeM = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.25, 12), mat('#2f3a30')); shadeM.position.set(x, y, z); g.add(shadeM);
  box(g, 0.2, 0.04, 0.2, mat('#fff3cf', { emissive: '#ffe0a0', emissiveIntensity: 1.2 }), x, y - 0.13, z, false);
}
/** A low wall-mounted TV / display screen (emissive). */
export function screen(g: THREE.Object3D, x: number, y: number, z: number, ry: number, w = 1.6, lines?: string[], bg = '#1f4e8c') {
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry;
  box(grp, w + 0.1, w * 0.6, 0.06, '#1c1c1c', 0, 0, 0, false);
  if (lines) { const p = poster(grp, lines, 0, 0, 0.035, 0, w, w * 0.52, bg); (p.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#ffffff'); (p.material as THREE.MeshStandardMaterial).emissiveMap = (p.material as THREE.MeshStandardMaterial).map; (p.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5; }
  else box(grp, w, w * 0.52, 0.01, mat('#3a6ea8', { emissive: '#4f8fd6', emissiveIntensity: 0.55 }), 0, 0, 0.035, false);
  g.add(grp); return grp;
}
export function pillar(g: THREE.Object3D, x: number, z: number, color = '#e8e2d6') {
  box(g, 0.8, 3.6, 0.8, color, x, 1.8, z); box(g, 1.0, 0.2, 1.0, shade(color, 0.85), x, 0.1, z, false); box(g, 1.0, 0.2, 1.0, shade(color, 0.85), x, 3.5, z, false);
  solid(g, { x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 });
}
export function bookcase(g: THREE.Object3D, x: number, z: number, w: number, ry: number, seed = 1) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
  box(grp, w, 2.0, 0.4, '#5a3a22', 0, 1.0, 0);
  const covers = ['#8d2f2f', '#2f5f9e', '#3b6d3b', '#c9a44a', '#5a3a6b', '#e8e2d6'];
  for (let r = 0; r < 4; r++) for (let i = 0, xx = -w / 2 + 0.1; xx < w / 2 - 0.12; i++) { const bw = 0.06 + ((i * 7 + r * 3 + seed) % 4) * 0.02; box(grp, bw, 0.32, 0.28, covers[(i + r + seed) % covers.length], xx + bw / 2, 0.3 + r * 0.46, 0.08, false); xx += bw + 0.01; }
  g.add(grp);
  const c = Math.abs(Math.cos(ry)) > 0.5; solid(g, { x0: x - (c ? w / 2 : 0.2), x1: x + (c ? w / 2 : 0.2), z0: z - (c ? 0.2 : w / 2), z1: z + (c ? 0.2 : w / 2) });
}

// ---------------------------------------------------------------- architecture (atriums, halls)
/** A round column floor-to-ceiling (Kimball atrium, Manwaring balcony supports). Solid. */
export function column(g: THREE.Object3D, x: number, z: number, h = 3.6, r = 0.4, color = '#f4f1ea') {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat(color)); c.position.set(x, h / 2, z); c.castShadow = c.receiveShadow = true; g.add(c);
  box(g, r * 2.4, 0.14, r * 2.4, shade(color, 0.88), x, 0.07, z, false);
  solid(g, { x0: x - r - 0.05, x1: x + r + 0.05, z0: z - r - 0.05, z1: z + r + 0.05 });
}
const GLASS = () => mat('#cfe7f0', { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1 });
/** A glass railing between two points at height y (balconies, stairs). */
export function glassRail(g: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y: number, h = 1.0) {
  const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(L, h, 0.03), GLASS()); pane.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2); pane.rotation.y = -a; g.add(pane);
  const top = box(g, L, 0.06, 0.08, '#b9bec4', (x0 + x1) / 2, y + h, (z0 + z1) / 2, false); top.rotation.y = -a;
}
/**
 * An upper-floor walkway around the north and side walls at height y (two-storey atriums):
 * a white slab with a fascia, a glass railing on the open edge, lights under it.
 */
export function balcony(g: THREE.Object3D, W: number, D: number, y: number, depth = 2.4, color = '#f2f0ec', sides: ('n' | 'e' | 'w')[] = ['n', 'e', 'w']) {
  const under = mat('#fff3cf', { emissive: '#ffe4a8', emissiveIntensity: 1.1 });
  const slab = (cx: number, cz: number, w: number, d: number) => { box(g, w, 0.35, d, color, cx, y, cz); };
  if (sides.includes('n')) { slab(0, -D / 2 + depth / 2, W, depth); glassRail(g, -W / 2 + (sides.includes('w') ? depth : 0), -D / 2 + depth, W / 2 - (sides.includes('e') ? depth : 0), -D / 2 + depth, y + 0.17);
    for (let x = -W / 2 + 3; x < W / 2 - 2; x += 4) box(g, 0.5, 0.04, 0.5, under, x, y - 0.19, -D / 2 + depth / 2, false); }
  for (const s of ['e', 'w'] as const) if (sides.includes(s)) {
    const sx = s === 'e' ? 1 : -1, z0 = -D / 2 + (sides.includes('n') ? depth : 0), len = D / 2 + D / 2 - (sides.includes('n') ? depth : 0) - 4;
    slab(sx * (W / 2 - depth / 2), z0 + len / 2, depth, len); glassRail(g, sx * (W / 2 - depth), z0, sx * (W / 2 - depth), z0 + len, y + 0.17);
    for (let z = z0 + 2; z < z0 + len; z += 4) box(g, 0.5, 0.04, 0.5, under, sx * (W / 2 - depth / 2), y - 0.19, z, false);
  }
}
/** A straight staircase rising along +z from (x, z) by `rise` over `run` metres (decorative; its footprint is solid). */
export function stairs(g: THREE.Object3D, x: number, z: number, w: number, run: number, rise: number, color = '#e8e4dc', ry = 0) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; g.add(grp);
  const n = Math.max(4, Math.round(rise / 0.18)), sd = run / n;
  for (let i = 0; i < n; i++) { box(grp, w, (i + 1) * (rise / n), sd, i % 2 ? color : shade(color, 0.95), 0, (i + 1) * (rise / n) / 2, -i * sd - sd / 2); box(grp, w, 0.02, 0.05, '#9aa0a6', 0, (i + 1) * (rise / n) + 0.01, -i * sd - 0.03, false); }
  for (const sx of [-1, 1]) glassRail(grp, sx * w / 2, 0, sx * w / 2, -run, rise / 2, 1.0 + rise / 2);
  const c = Math.abs(Math.cos(ry)) > 0.5, hw = c ? w / 2 : run / 2, hd = c ? run / 2 : w / 2, ox = c ? 0 : -Math.sin(ry) * run / 2, oz = c ? -Math.cos(ry) * run / 2 : 0;
  solid(g, { x0: x + ox - hw, x1: x + ox + hw, z0: z + oz - hd, z1: z + oz + hd });
}
/** A flat overlay on the floor with its own material (a zone of carpet, terrazzo or a sport floor). */
export function floorZone(g: THREE.Object3D, x: number, z: number, w: number, d: number, style: FloorStyle, base: string) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTexture(style, base, w, d), roughness: style === 'terrazzo' || style === 'darkTile' ? 0.35 : 0.8 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.receiveShadow = true; g.add(m); return m;
}
/** A glowing round globe light hanging from the ceiling. */
export function globeLight(g: THREE.Object3D, x: number, z: number, y: number, ceiling: number, r = 0.35) {
  box(g, 0.02, ceiling - y, 0.02, '#2a2a2a', x, (ceiling + y) / 2, z, false);
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat('#fff8e8', { emissive: '#ffe9b8', emissiveIntensity: 1.3 })); s.position.set(x, y, z); g.add(s);
}
export { GLASS as glassMat, shade };
