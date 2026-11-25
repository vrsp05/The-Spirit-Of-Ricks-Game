// Campus collectibles: little keepsakes hidden around the buildings, different in every era.
// Found ones go on the display shelf in your apartment. Fictional props with era flavour;
// the "BYU–Idaho" name only appears on present-day items (story rule).
import * as THREE from 'three';
import type { EraId } from '../world/eras';

export type Shape = 'pennant' | 'disc' | 'card' | 'book' | 'box' | 'cap' | 'phone' | 'mitten' | 'globe' | 'trophy' | 'robot' | 'cup' | 'brick';
type Side = 'n' | 's' | 'e' | 'w';
export interface Collectible {
  id: string; era: EraId; name: string; text: string; shape: Shape; color: string;
  /** Hidden next to this building (outside, on one side; `out` = metres from the wall). */
  building: string; side: Side; out?: number;
}

export const COLLECTIBLES: Collectible[] = [
  // ---- Fall 1999
  { id: 'r-pennant', era: 'ricks1999', name: 'Vikings pennant', text: 'Go Vikes! A felt pennant from a Ricks College game night.', shape: 'pennant', color: '#7a2b2b', building: 'hart', side: 'w', out: 7 },
  { id: 'r-mixcd', era: 'ricks1999', name: 'Mix CD', text: '“Fall ’99 Jams” in marker. Someone burned it for a friend.', shape: 'disc', color: '#c9d6e3', building: 'manwaring', side: 'e', out: 8 },
  { id: 'r-y2k', era: 'ricks1999', name: 'Y2K flyer', text: '“Is your computer ready for the year 2000?” Everyone was a little worried.', shape: 'card', color: '#e6c33a', building: 'smith', side: 'e', out: 6 },
  { id: 'r-yearbook', era: 'ricks1999', name: '1999 yearbook', text: 'Full of signatures: “Have a great summer!” “Stay cool!”', shape: 'book', color: '#5b2a24', building: 'mckay', side: 's', out: 7 },
  { id: 'r-pager', era: 'ricks1999', name: 'Lost pager', text: 'It beeps. Someone’s roommate wants them to call back.', shape: 'phone', color: '#2a2d31', building: 'romney', side: 'w', out: 6 },
  { id: 'r-kimball', era: 'ricks1999', name: 'Dedication program', text: 'From the brand-new Kimball Building’s dedication this fall.', shape: 'card', color: '#f4f1e8', building: 'kimball', side: 's', out: 9 },
  // ---- Spring 2001
  { id: 't-paper', era: 'transition', name: 'Campus newspaper', text: 'Headline: “Big changes ahead — four-year degrees coming to Rexburg!”', shape: 'card', color: '#e8e2d6', building: 'kimball', side: 'w', out: 8 },
  { id: 't-ticket', era: 'transition', name: 'Last-season ticket', text: 'A ticket from the final season of Viking athletics. A keeper.', shape: 'card', color: '#b8423a', building: 'hart', side: 'e', out: 7 },
  { id: 't-brick', era: 'transition', name: 'Old Spori brick', text: 'A brick saved from the old Spori Building. So much history.', shape: 'brick', color: '#9a4a32', building: 'smith', side: 'n', out: 7 },
  { id: 't-hardhat', era: 'transition', name: 'Hard hat', text: 'Left by a construction crew. Campus is growing fast.', shape: 'cap', color: '#e6b422', building: 'taylor', side: 'e', out: 7 },
  { id: 't-camera', era: 'transition', name: 'Disposable camera', text: '27 photos taken. Nobody knows what’s on it.', shape: 'box', color: '#3d6fa8', building: 'austin', side: 'n', out: 7 },
  { id: 't-trophy', era: 'transition', name: 'Intramural trophy', text: '“Champions — Spring 2001.” A small plastic trophy.', shape: 'trophy', color: '#d1a12f', building: 'benson', side: 's', out: 7 },
  // ---- 2011
  { id: 'b-flip', era: 'byui', name: 'Flip phone', text: 'Still has 3 bars. Very vintage now.', shape: 'phone', color: '#5a5a62', building: 'manwaring', side: 'w', out: 8 },
  { id: 'b-mp3', era: 'byui', name: 'MP3 player', text: '1,000 songs in your pocket! It has a tiny click wheel.', shape: 'box', color: '#e0e0d8', building: 'snow', side: 'e', out: 8 },
  { id: 'b-mitten', era: 'byui', name: 'Lost mitten', text: 'One red mitten. Its partner is out there somewhere.', shape: 'mitten', color: '#b8423a', building: 'romney', side: 's', out: 6 },
  { id: 'b-globe', era: 'byui', name: 'Temple snow globe', text: 'Shake it: snow falls on a tiny temple on a hill.', shape: 'globe', color: '#d8e8f4', building: 'temple', side: 's', out: 12 },
  { id: 'b-center', era: 'byui', name: 'Center program', text: 'From the first big meeting in the brand-new Center. It seats thousands!', shape: 'book', color: '#2f4f7f', building: 'icenter', side: 'w', out: 10 },
  { id: 'b-cocoa', era: 'byui', name: 'Hot cocoa cup', text: 'Still a little warm. Winters here are serious.', shape: 'cup', color: '#7a4a28', building: 'hinckley', side: 'n', out: 7 },
  // ---- Present day
  { id: 'p-pin', era: 'presentFinale', name: 'BYU–Idaho pin', text: 'A shiny enamel pin from the bookstore.', shape: 'disc', color: '#1f4e8c', building: 'kimball', side: 'n', out: 8 },
  { id: 'p-robot', era: 'presentFinale', name: 'Tiny robot', text: 'A robotics-club project from the STC labs. It waves!', shape: 'robot', color: '#9aa3a8', building: 'stc', side: 'w', out: 9 },
  { id: 'p-sticker', era: 'presentFinale', name: 'Laptop sticker', text: '“I ♥ Rexburg”. Wind not included.', shape: 'card', color: '#4aa3a0', building: 'hinckley', side: 's', out: 7 },
  { id: 'p-tumbler', era: 'presentFinale', name: 'Water tumbler', text: 'Covered in stickers. Every student has one.', shape: 'cup', color: '#d96a5a', building: 'manwaring', side: 'w', out: 8 },
  { id: 'p-drone', era: 'presentFinale', name: 'Drone propeller', text: 'From the celebration drone show. What a night!', shape: 'trophy', color: '#2c2c34', building: 'ricks-building', side: 'n', out: 9 },
  { id: 'p-postcard', era: 'presentFinale', name: 'Old-campus postcard', text: '“Greetings from Ricks College” — a postcard from long ago, found today.', shape: 'card', color: '#c8b48a', building: 'taylor', side: 'w', out: 7 },
];

const mat = (c: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...extra });
const box = (g: THREE.Object3D, w: number, h: number, d: number, c: string | THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
};
/** A small model of the item (about 0.5 m, so it reads from a distance; the shelf scales it down). */
export function itemModel(c: Pick<Collectible, 'shape' | 'color'>): THREE.Group {
  const g = new THREE.Group(), col = c.color;
  switch (c.shape) {
    case 'pennant': { box(g, 0.04, 0.6, 0.04, '#6b4a30', 0, 0, -0.3); const s = new THREE.Shape(); s.moveTo(0, 0.25); s.lineTo(0.62, 0.06); s.lineTo(0, -0.12);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat(col, { side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; m.position.set(0, 0.03, -0.28); g.add(m); break; }
    case 'disc': { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), mat(col, { metalness: 0.6, roughness: 0.2 })); m.rotation.x = Math.PI / 2; g.add(m);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10), mat('#2a2d31')); h.rotation.x = Math.PI / 2; g.add(h); break; }
    case 'card': box(g, 0.5, 0.36, 0.03, col); box(g, 0.36, 0.05, 0.035, '#2a2d31', 0, 0.08, 0); box(g, 0.3, 0.03, 0.035, '#5a5a5a', 0, -0.02, 0); break;
    case 'book': box(g, 0.42, 0.52, 0.1, col); box(g, 0.4, 0.5, 0.11, '#f4f1e8', 0.02, 0, 0); box(g, 0.24, 0.06, 0.115, '#d1a12f', 0, 0.12, 0); break;
    case 'box': box(g, 0.36, 0.24, 0.16, col); box(g, 0.12, 0.12, 0.05, '#2a2d31', 0.08, 0.02, 0.08); break;
    case 'cap': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(col)); g.add(m); box(g, 0.5, 0.03, 0.5, col, 0, 0, 0.08); break; }
    case 'phone': box(g, 0.2, 0.38, 0.06, col); box(g, 0.15, 0.16, 0.065, '#7fb3d6', 0, 0.07, 0); break;
    case 'mitten': box(g, 0.24, 0.32, 0.1, col); box(g, 0.08, 0.14, 0.1, col, 0.15, 0.02, 0); box(g, 0.26, 0.07, 0.11, '#f4f1e8', 0, -0.17, 0); break;
    case 'globe': { box(g, 0.3, 0.08, 0.3, '#6b4a30', 0, -0.2, 0); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat(col, { transparent: true, opacity: 0.55, roughness: 0.05 })));
      box(g, 0.1, 0.16, 0.1, '#f4f1e8', 0, -0.06, 0); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), mat('#d1a12f')); sp.position.y = 0.08; g.add(sp); break; }
    case 'trophy': box(g, 0.26, 0.06, 0.26, '#3a3f45', 0, -0.22, 0); box(g, 0.06, 0.2, 0.06, col, 0, -0.1, 0); box(g, 0.3, 0.22, 0.2, col, 0, 0.1, 0); box(g, 0.06, 0.12, 0.04, col, 0.18, 0.12, 0); box(g, 0.06, 0.12, 0.04, col, -0.18, 0.12, 0); break;
    case 'robot': box(g, 0.26, 0.26, 0.2, col); box(g, 0.2, 0.18, 0.18, col, 0, 0.24, 0); box(g, 0.05, 0.05, 0.02, '#4fd1ff', -0.05, 0.26, 0.1); box(g, 0.05, 0.05, 0.02, '#4fd1ff', 0.05, 0.26, 0.1);
      box(g, 0.06, 0.2, 0.06, col, 0.18, 0, 0); box(g, 0.06, 0.2, 0.06, col, -0.18, 0, 0); break;
    case 'cup': { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.42, 14), mat(col)); g.add(m); box(g, 0.3, 0.05, 0.3, '#2a2d31', 0, 0.23, 0); break; }
    case 'brick': box(g, 0.42, 0.18, 0.2, col); box(g, 0.44, 0.02, 0.22, '#c9c0b0', 0, 0.1, 0); break;
  }
  return g;
}

/** Collectibles of one era (for the HUD counter and the shelf). */
export const collectiblesIn = (era: EraId) => COLLECTIBLES.filter(c => c.era === era);
