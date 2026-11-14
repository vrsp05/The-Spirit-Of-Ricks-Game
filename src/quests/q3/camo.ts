// Camouflaged letters built into scenery (not floating collectibles), the sign, and glyphs.
import * as THREE from 'three';

const mat = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
function box(g: THREE.Group, w: number, hh: number, d: number, color: string | THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
/** Invisible, generous hit volume (raycasts still hit hidden meshes). */
function hitbox(g: THREE.Group, w: number, hh: number, d: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshBasicMaterial()); m.visible = false; m.position.set(x, y, z); g.add(m); return m;
}
function arc(g: THREE.Group, cx: number, cy: number, r: number, from: number, to: number, color: string, z = 0, t = 0.35, depth = 0.4) {
  const n = Math.max(6, Math.round(Math.abs(to - from) * r * 3));
  for (let i = 0; i <= n; i++) { const a = from + (to - from) * (i / n); box(g, t, t, depth, color, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z); }
}

/** B: a pilaster with two rounded bays in slightly darker brick on the library wall (faces +z). */
export function camoB(): THREE.Group {
  const g = new THREE.Group(), c = '#94694f';
  box(g, 0.5, 4.2, 0.45, c, -0.9, 2.3, 0);
  arc(g, -0.9, 3.35, 0.95, Math.PI / 2, -Math.PI / 2, c, 0);
  arc(g, -0.9, 1.25, 1.1, Math.PI / 2, -Math.PI / 2, c, 0);
  box(g, 0.4, 0.4, 0.45, c, -0.75, 4.3, 0); box(g, 0.4, 0.4, 0.45, c, -0.75, 0.2, 0);
  hitbox(g, 3.4, 5, 1.6, -0.3, 2.3, 0.3);
  return g;
}
/** Y: low hedges on the lawn: two lines that meet and continue as one (seen along the approach). */
export function camoY(): THREE.Group {
  const g = new THREE.Group(), c = '#3f6f35';
  const seg = (x1: number, z1: number, x2: number, z2: number) => {
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / 0.6);
    for (let i = 0; i <= n; i++) box(g, 0.7, 0.6, 0.7, c, x1 + (x2 - x1) * i / n, 0.3, z1 + (z2 - z1) * i / n);
  };
  seg(0, 0, 0, 5); seg(0, 0, -3, -4.5); seg(0, 0, 3, -4.5);
  hitbox(g, 8, 2.2, 11, 0, 1, 0.3);
  return g;
}
/** U: two curved planter walls, offset in depth, that line up into a U from the south. */
export function camoU(): THREE.Group {
  const g = new THREE.Group(), c = '#a8573d', plant = '#4f8a3a';
  const half = (side: 1 | -1, z: number) => {
    box(g, 0.45, 2.6, 0.5, c, side * 1.3, 2.7, z);
    // bottom quarter of the bowl: right half sweeps 0 → -90°, left half 180° → 270°
    arc(g, 0, 1.4, 1.3, side > 0 ? 0 : Math.PI, side > 0 ? -Math.PI / 2 : 1.5 * Math.PI, c, z, 0.45, 0.5);
    box(g, 0.6, 0.35, 0.6, plant, side * 1.3, 4.15, z);
  };
  half(-1, 0); half(1, -1.6);
  hitbox(g, 4.4, 4.6, 3.6, 0, 2, -0.6);
  return g;
}
/** I: a plain column with cap and base among decorative "note" poles (decoys are separate). */
export function camoI(): THREE.Group {
  const g = new THREE.Group(), c = '#bfae94';
  box(g, 0.5, 3.4, 0.5, c, 0, 2, 0); box(g, 1.5, 0.35, 0.6, c, 0, 3.85, 0); box(g, 1.5, 0.35, 0.6, c, 0, 0.18, 0);
  hitbox(g, 2.2, 4.6, 1.8, 0, 2, 0);
  return g;
}
export function notePole(): THREE.Group {
  const g = new THREE.Group(), c = '#bfae94';
  box(g, 0.35, 3.2, 0.35, c, 0, 1.6, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat(c)); head.position.set(-0.35, 0.6, 0); head.castShadow = true; g.add(head);
  box(g, 0.8, 0.25, 0.25, c, 0.4, 3.0, 0);
  hitbox(g, 1.6, 3.8, 1.4, 0, 1.8, 0);
  return g;
}

// 5x5 glyphs for the sign letters
const GLYPHS: Record<string, string[]> = {
  B: ['1111 ', '1   1', '1111 ', '1   1', '1111 '],
  Y: ['1   1', ' 1 1 ', '  1  ', '  1  ', '  1  '],
  U: ['1   1', '1   1', '1   1', '1   1', ' 111 '],
  I: ['11111', '  1  ', '  1  ', '  1  ', '11111'],
};
export function glyph(ch: string, color = '#f2d36b', size = 0.34): THREE.Group {
  const g = new THREE.Group(); const m = mat(color, { emissive: '#000000' });
  GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') { const b = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), m); b.position.set((x - 2) * size, (4 - y) * size, 0); b.castShadow = true; g.add(b); } }));
  g.userData.material = m;
  return g;
}

/** Freestanding big blue letters, built from the 5x5 glyphs (chunky voxel strokes). */
export function bigLetter(ch: string, color = '#1f56c8'): THREE.Group {
  const g = new THREE.Group(); const m = mat(color, { emissive: '#000000' });
  const w = 0.56, hh = 0.64, d = 0.9;
  GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '1') return;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
    b.position.set((x - 2) * w, (4 - y) * hh + hh / 2, 0); b.castShadow = true; b.receiveShadow = true; g.add(b);
  }));
  g.userData.material = m;
  return g;
}

/** The B Y U I sign on the lawn east of the roundabout: a long concrete plinth with four letter spots. */
export function buildSign(): { group: THREE.Group; slots: THREE.Vector3[] } {
  const g = new THREE.Group();
  box(g, 13.4, 0.5, 2.6, '#a8a39a', 0, 0.25, 0);          // footing
  box(g, 13, 0.4, 2.3, '#dcd8cf', 0, 0.7, 0);              // plinth
  box(g, 13.1, 0.06, 2.4, '#ece9e2', 0, 0.93, 0);          // top edge
  const slots: THREE.Vector3[] = [];
  const spot = mat('#9fb7de', { transparent: true, opacity: 0.55 });
  for (let i = 0; i < 4; i++) {
    const x = -4.65 + i * 3.1;
    box(g, 2.5, 0.03, 0.95, spot, x, 0.975, 0);           // faint footprint where the letter stands
    slots.push(new THREE.Vector3(x, 0.96, 0));
  }
  return { group: g, slots };
}
