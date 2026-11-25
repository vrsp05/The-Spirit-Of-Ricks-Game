// Small shared helpers for the extra story missions (Y2K, Vikings game night, time capsule, snow day).
// Contract-only: everything goes through QuestContext.
import * as THREE from 'three';
import type { DialogueLine, QuestContext } from '../contract';

/** Speaker label used for the president in quest dialogue (fictional depiction, not real quotes). */
export const BEDNAR = 'President Bednar (game character)';
export const say = (speaker: string, ...texts: string[]): DialogueLine[] => texts.map(text => ({ speaker, text }));

/** A character standing at an anchor, turned to the anchor's yaw. */
export function person(ctx: QuestContext, label: string, look: { shirt?: string; pants?: string; hair?: string; skin?: string }) {
  return ctx.world.npc({ label, ...look });
}

/** A chunky voxel prop made of boxes: [w, h, d, color, x, y, z]. */
export function prop(ctx: QuestContext, parts: [number, number, number, string, number, number, number][]): THREE.Group {
  const g = new THREE.Group();
  for (const [w, h, d, c, x, y, z] of parts) { const m = ctx.world.voxel(w, h, d, c); m.position.set(x, y, z); g.add(m); }
  return g;
}

/** Slowly spin + bob a pickup so it reads as "take me". */
export function bob(o: THREE.Object3D, t: number) { o.rotation.y = t * 1.6; o.position.y = 0.15 + Math.sin(t * 2.4) * 0.1; }

/** A canvas-text plane (plaques, signs). */
export function plaque(lines: string[], w = 1.6, h = 1, bg = '#3a2a1c', fg = '#f3e2b8'): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = Math.min(54, (c.height - 40) / lines.length * 0.7);
  lines.forEach((l, i) => { g.font = `${i === 0 ? 'bold ' : ''}${Math.round(i === 0 ? size : size * 0.8)}px Georgia, serif`; g.fillText(l, c.width / 2, (c.height / (lines.length + 1)) * (i + 1)); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
}

/** Game-metre point next to an anchor (sideways along its facing, then outwards). */
export function near(ctx: QuestContext, anchor: string, side: number, out = 0) {
  const p = ctx.world.position(anchor), yaw = ctx.world.location(anchor).yaw ?? 0;
  return { x: p.x + Math.cos(yaw) * side + Math.sin(yaw) * out, z: p.z - Math.sin(yaw) * side + Math.cos(yaw) * out };
}
