// Procedural surface textures (generated once at start-up, no image files):
// brick walls with mortar relief, roof gravel, framed windows, and a fine "detail"
// layer that adds grain to the big painted ground texture up close.
import * as THREE from 'three';

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const canvas = (size: number) => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
function toTexture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}
/** Tangent-space normal map from a greyscale height canvas (Sobel, wraps at the edges). */
function normalFromHeight(h: HTMLCanvasElement, strength: number, blur = 2): THREE.CanvasTexture {
  // blur the height first (wrapping): sharp bump edges make tiny highlights that flicker as the camera moves
  if (blur > 0) {
    const b = canvas(h.width), bg = b.getContext('2d')!; bg.filter = `blur(${blur}px)`;
    for (const dx of [-h.width, 0, h.width]) for (const dy of [-h.width, 0, h.width]) bg.drawImage(h, dx, dy);
    h = b;
  }
  const s = h.width, src = h.getContext('2d')!.getImageData(0, 0, s, s).data, out = canvas(s), og = out.getContext('2d')!, img = og.createImageData(s, s);
  const H = (x: number, y: number) => src[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, dy, 1).normalize(), k = (y * s + x) * 4;
    img.data[k] = (n.x * 0.5 + 0.5) * 255; img.data[k + 1] = (n.y * 0.5 + 0.5) * 255; img.data[k + 2] = (n.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return toTexture(out, false);
}

export interface SurfaceSet { map: THREE.Texture; normalMap: THREE.Texture }

/** Running-bond brick: 8 courses × 4 bricks per 2 m tile, colour variation, soot near the bottom of each brick, recessed mortar. */
export function brickSet(): SurfaceSet {
  const S = 256, col = canvas(S), hgt = canvas(S), g = col.getContext('2d')!, hg = hgt.getContext('2d')!, rnd = rng(3);
  g.fillStyle = '#cfc8bc'; g.fillRect(0, 0, S, S); hg.fillStyle = '#202020'; hg.fillRect(0, 0, S, S);
  const bw = S / 4, bh = S / 8, m = 3;
  for (let row = 0; row < 8; row++) for (let c = -1; c < 5; c++) {
    const x = c * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
    const v = 222 + ((rnd() * 30) | 0), warm = (rnd() * 10) | 0;
    g.fillStyle = `rgb(${v},${v - 6 - warm},${v - 16 - warm})`; g.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
    for (let i = 0; i < 40; i++) { const t = rnd(); g.fillStyle = `rgba(${t > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rnd() * 0.05})`; g.fillRect(x + m + rnd() * (bw - 2 * m), y + m + rnd() * (bh - 2 * m), 2, 2); }
    const grd = g.createLinearGradient(0, y + m, 0, y + bh - m); grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = grd; g.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
    hg.fillStyle = '#d8d8d8'; hg.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
    hg.fillStyle = '#f0f0f0'; hg.fillRect(x + m + 2, y + m + 2, bw - 2 * m - 4, bh - 2 * m - 4);
  }
  return { map: toTexture(col, true), normalMap: normalFromHeight(hgt, 1.6, 2.5) };
}

/** Flat-roof gravel / membrane with seams every metre. */
export function gravelSet(): SurfaceSet {
  const S = 256, col = canvas(S), hgt = canvas(S), g = col.getContext('2d')!, hg = hgt.getContext('2d')!, rnd = rng(11);
  g.fillStyle = '#e6e6e4'; g.fillRect(0, 0, S, S); hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) {
    const v = 190 + ((rnd() * 60) | 0), x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 1.6;
    g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(x, y, r, r);
    hg.fillStyle = `rgb(${v - 40},${v - 40},${v - 40})`; hg.fillRect(x, y, r, r);
  }
  g.strokeStyle = 'rgba(0,0,0,0.09)'; hg.strokeStyle = '#404040'; g.lineWidth = hg.lineWidth = 2;
  for (let x = 0; x <= S; x += S / 4) { for (const c of [g, hg]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); } }
  return { map: toTexture(col, true), normalMap: normalFromHeight(hgt, 0.8, 1.5) };
}

/** One window per voxel cell (UV 0..1): dark frame, mullion + transom, pane with a soft sky reflection streak. */
export function windowSet(): SurfaceSet {
  const S = 128, col = canvas(S), hgt = canvas(S), g = col.getContext('2d')!, hg = hgt.getContext('2d')!;
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S); hg.fillStyle = '#ffffff'; hg.fillRect(0, 0, S, S);   // frame (raised)
  const f = 12, mid = S / 2, tr = S * 0.3;
  const panes: [number, number, number, number][] = [[f, f, mid - f - 3, tr - f - 3], [mid + 3, f, S - mid - f - 3, tr - f - 3], [f, tr + 3, mid - f - 3, S - tr - f - 3], [mid + 3, tr + 3, S - mid - f - 3, S - tr - f - 3]];
  for (const [x, y, w, h] of panes) {
    const grd = g.createLinearGradient(x, y, x + w, y + h); grd.addColorStop(0, '#f2f6fa'); grd.addColorStop(0.45, '#c9d3dc'); grd.addColorStop(1, '#9aa7b3');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + w * 0.2, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.05, y + h); g.lineTo(x - w * 0.2, y + h); g.fill(); g.restore();
    hg.fillStyle = '#303030'; hg.fillRect(x, y, w, h);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(f, S - f - 2, S - 2 * f, 4);                                 // sill shadow
  return { map: toTexture(col, true), normalMap: normalFromHeight(hgt, 3) };
}

/** Fine greyscale grain (mean ≈ 1 after the shader's ×2) tiled every ~3 m on the ground. */
export function detailTexture(): THREE.CanvasTexture {
  const S = 256, c = canvas(S), g = c.getContext('2d')!, rnd = rng(23);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { const v = 128 + ((rnd() - 0.5) * 80) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 5, 3 + rnd() * 7); }   // clumps ~5–10 cm
  for (let i = 0; i < 40; i++) { const v = 128 + ((rnd() - 0.5) * 30) | 0, x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, `rgba(${v},${v},${v},0.5)`); grd.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  return toTexture(c, false);
}

/** Multiply a material's colour by a world-space tiled detail texture (keeps the painted map crisp, adds grain). */
export function addWorldDetail(mat: THREE.MeshStandardMaterial, detail: THREE.Texture, metresPerTile = 3, strength = 0.5) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: detail };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosD;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosD = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vWorldPosD;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dt = texture2D(detailMap, vWorldPosD.xz / ${metresPerTile.toFixed(2)}).r * 2.0;
        float dt2 = texture2D(detailMap, vWorldPosD.xz / ${(metresPerTile * 7.3).toFixed(2)}).r * 2.0;
        diffuseColor.rgb *= mix(1.0, dt * mix(1.0, dt2, 0.5), ${strength.toFixed(2)});`);
  };
  mat.customProgramCacheKey = () => `detail-${metresPerTile}-${strength}`;
}

/** Tileable ripple normal map for water (sum of wrapped sine waves + fine noise). */
export function waterNormals(): THREE.CanvasTexture {
  const S = 256, h = canvas(S), g = h.getContext('2d')!, img = g.createImageData(S, S), rnd = rng(41);
  const waves = Array.from({ length: 7 }, () => ({ kx: 1 + (rnd() * 4 | 0), ky: (rnd() * 5 | 0) - 2, ph: rnd() * 6.28, a: 0.3 + rnd() * 0.7 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0; for (const w of waves) v += Math.sin(((x * w.kx + y * w.ky) / S) * Math.PI * 2 + w.ph) * w.a;
    const c = Math.max(0, Math.min(255, 128 + v * 26 + (rnd() - 0.5) * 10)), k = (y * S + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = c; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return normalFromHeight(h, 1.6);
}
