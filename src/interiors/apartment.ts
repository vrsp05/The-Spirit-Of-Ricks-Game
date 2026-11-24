// The player's apartment: a small one-room home on a free lot near the residence halls
// (the lot is found in campusData.HOME_LOT; the building is meshed in World.buildEra).
// Inside: a bed (sleep), a kitchen with a fridge (eat), a wardrobe (change outfit), a sofa and a TV.
// Importing this module registers the interior, its door anchor and its furniture.
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { HOME_LOT, toReal } from '../world/campusData';
import { ERAS, type EraId } from '../world/eras';
import { textCanvas } from '../world/World';
import { CAMPUS_LAYOUTS } from './campusInteriors';

export const HOME_ID = 'home';
/** Room-local spots (metres) of the things you can use; game.ts adds the interactions. */
export const HOME_SPOTS = {
  bed: { x: -3.7, z: -4.2, label: 'Sleep in your bed' },
  bedLie: { x: -5.7, z: -2.95, y: 0.86, yaw: 0 },            // feet at the foot of the bed, head to the pillow (north)
  fridge: { x: 5.55, z: -4.1, label: 'Open the fridge (eat something)' },
  wardrobe: { x: -1.6, z: -4.3, label: 'Open the wardrobe (change outfit)' },
  tv: { x: -4.6, z: 1.1, label: 'Sit down and watch TV' },
  sofaSeat: { x: -6.25, z: 1.1, yaw: Math.PI / 2 },
};

const [dx, dz] = toReal(HOME_LOT.door[0], HOME_LOT.door[1]);
(GAME_CONFIG.locations as Record<string, unknown>)['door.home'] = { x: dx, z: dz, label: 'Your apartment' };
(GAME_CONFIG.interiors as Record<string, unknown>)[HOME_ID] = { label: 'Your apartment', width: 14, depth: 12, exteriorDoor: 'door.home', eras: null };

const mat = (c: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
function box(g: THREE.Object3D, w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function picture(lines: string[], w: number, h: number, bg: string, fg = '#f6f0e2') {
  const tex = new THREE.CanvasTexture(textCanvas(lines, { w: 512, h: Math.round(512 * h / w), bg, fg })); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

let pennant: THREE.Mesh | null = null, pennantInst = '';
CAMPUS_LAYOUTS[HOME_ID] = {
  floor: '#9a7652', wall: '#efe6d6', floorStyle: 'wood', windows: false,   // it has its own windows
  props: [
    { x0: -6.95, z0: -5.95, x1: -4.45, z1: -2.55, h: 0.6, color: '#f1ece2' },   // bed
    { x0: -2.6, z0: -5.95, x1: -0.6, z1: -5.15, h: 2.3, color: '#7a5536' },     // wardrobe
    { x0: 0.8, z0: -5.95, x1: 4.6, z1: -5.2, h: 0.95, color: '#e8e2d6' },       // kitchen counter
    { x0: 4.8, z0: -5.95, x1: 6.3, z1: -5.0, h: 2.0, color: '#e3e6e9' },        // fridge
    { x0: 3.4, z0: -1.6, x1: 5.4, z1: -0.2, h: 0.78, color: '#8a6440' },        // dining table
    { x0: -6.95, z0: -0.4, x1: -5.85, z1: 2.6, h: 0.5, color: '#4f6d8a' },      // sofa
    { x0: -3.0, z0: 0.2, x1: -2.45, z1: 2.0, h: 0.55, color: '#3b3330' },       // TV stand
    { x0: 6.35, z0: 0.8, x1: 6.95, z1: 3.8, h: 1.9, color: '#6b4a30' },         // bookshelf
  ],
  decorate: g => {
    // bed: headboard, pillow, blanket
    box(g, 2.5, 1.2, 0.12, '#6b4a30', -5.7, 0.6, -5.9); box(g, 1.4, 0.18, 0.6, '#ffffff', -5.7, 0.7, -5.4);
    box(g, 2.46, 0.1, 2.1, '#3f6aa0', -5.7, 0.65, -3.65); box(g, 2.48, 0.1, 0.25, '#f4f1e8', -5.7, 0.66, -4.6);
    box(g, 0.6, 0.6, 0.6, '#7a5536', -3.95, 0.3, -5.6); box(g, 0.16, 0.4, 0.16, '#d9c79a', -3.95, 0.8, -5.6);   // nightstand + lamp
    box(g, 0.34, 0.22, 0.34, mat('#fff2c4', { emissive: '#ffd98a', emissiveIntensity: 0.6 }), -3.95, 1.1, -5.6);
    // wardrobe doors, handles; a mirror beside it
    box(g, 0.02, 2.1, 0.02, '#4a3020', -1.6, 1.15, -5.14); for (const x of [-1.75, -1.45]) box(g, 0.05, 0.25, 0.05, '#d9c79a', x, 1.2, -5.12);
    box(g, 0.5, 1.4, 0.04, mat('#c9dbe6', { metalness: 0.6, roughness: 0.1 }), 0.1, 1.4, -5.93);
    // kitchen: worktop, sink, stove, upper cabinets, microwave; fridge handle
    box(g, 3.82, 0.06, 0.8, '#3d3a37', 2.7, 0.98, -5.57); box(g, 0.7, 0.04, 0.5, '#aab2b8', 1.5, 1.0, -5.55);
    box(g, 0.08, 0.3, 0.08, '#aab2b8', 1.5, 1.15, -5.85);
    for (const [x, z] of [[3.4, -5.4], [3.9, -5.4], [3.4, -5.75], [3.9, -5.75]]) box(g, 0.28, 0.03, 0.28, '#1c1c1c', x, 1.02, z);
    box(g, 3.8, 0.8, 0.4, '#d9cdb8', 2.7, 2.3, -5.75); box(g, 0.7, 0.4, 0.45, '#2a2d31', 4.1, 1.22, -5.6);
    box(g, 0.05, 0.9, 0.06, '#9aa3a8', 5.0, 1.35, -4.97);
    // table + chairs + fruit bowl
    for (const [x, z] of [[3.0, -0.9], [5.8, -0.9]]) { box(g, 0.5, 0.45, 0.5, '#6b4a30', x, 0.23, z); box(g, 0.08, 0.6, 0.5, '#6b4a30', x + (x < 4 ? -0.22 : 0.22), 0.75, z); }
    box(g, 0.5, 0.12, 0.5, '#e8e2d6', 4.4, 0.84, -0.9); box(g, 0.14, 0.14, 0.14, '#d9452b', 4.33, 0.95, -0.86); box(g, 0.14, 0.14, 0.14, '#e6c33a', 4.5, 0.95, -0.95);
    // sofa back + arms, cushions; TV on the stand facing the sofa; a rug
    box(g, 0.3, 0.6, 3.0, '#43607c', -6.8, 0.8, 1.1); box(g, 1.1, 0.35, 0.25, '#43607c', -6.4, 0.67, -0.3); box(g, 1.1, 0.35, 0.25, '#43607c', -6.4, 0.67, 2.5);
    box(g, 0.2, 0.3, 0.5, '#e6c33a', -6.55, 0.7, 0.4); box(g, 0.2, 0.3, 0.5, '#d9452b', -6.55, 0.7, 1.8);
    box(g, 0.1, 0.8, 1.4, '#1c1c1c', -2.75, 1.0, 1.1);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.68), mat('#3a6ea8', { emissive: '#4f8fd6', emissiveIntensity: 0.55 }));
    screen.position.set(-2.81, 1.0, 1.1); screen.rotation.y = -Math.PI / 2; g.add(screen);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), mat('#a8573d')); rug.rotation.x = -Math.PI / 2; rug.position.set(-4.4, 0.015, 1.1); g.add(rug);
    // books, a plant, windows with a view of the sky, a clock
    const covers = ['#8d2f2f', '#2f5f9e', '#3b6d3b', '#c9a44a', '#5a3a6b'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) box(g, 0.25, 0.4, 0.12, covers[(i + r) % covers.length], 6.28, 0.5 + r * 0.6, 1.0 + i * 0.45);
    box(g, 0.5, 0.5, 0.5, '#8a5a3a', 6.3, 0.25, 5.2); for (const [x, y, z] of [[6.3, 0.8, 5.2], [6.15, 1.1, 5.3], [6.42, 1.05, 5.05]]) box(g, 0.4, 0.4, 0.4, '#3d7a3a', x, y, z);
    const sky = mat('#bfe0f2', { emissive: '#bfe0f2', emissiveIntensity: 0.5 });
    for (const [x, z, ry] of [[-5.7, -5.99, 0], [2.7, -5.99, 0], [6.99, -2.6, -Math.PI / 2]] as const) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), sky); w.position.set(x, x === 2.7 ? 3.0 : 2.0, z); w.rotation.y = ry; g.add(w);
      const fr = box(g, 1.8, 0.1, 0.06, '#f4f1e8', x, (x === 2.7 ? 3.0 : 2.0) - 0.55, z); fr.rotation.y = ry;
    }
    const clock = picture(['12:00'], 0.6, 0.6, '#2a2d31'); clock.position.set(4.0, 2.6, -5.98); g.add(clock);
    // school pennant over the sofa (the name follows the era)
    pennant = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial()); pennant.position.set(-6.97, 2.2, 1.1); pennant.rotation.y = Math.PI / 2; g.add(pennant);
    pennantInst = '';
    const welcome = picture(['HOME SWEET HOME'], 2.4, 0.5, '#6b2f2a'); welcome.position.set(4.3, 1.05, 5.95); welcome.rotation.y = Math.PI; g.add(welcome);
  },
  onEra: (era: EraId) => {
    const inst = ERAS[era].institution; if (!pennant || inst === pennantInst) return;
    pennantInst = inst;
    const tex = new THREE.CanvasTexture(textCanvas([inst === 'byui' ? 'BYU–IDAHO' : 'RICKS COLLEGE'], { w: 512, h: 160, bg: inst === 'byui' ? '#1f4e8c' : '#5b2a24', fg: '#f6f0e2' })); tex.colorSpace = THREE.SRGBColorSpace;
    const m = pennant.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.map = tex; m.needsUpdate = true;
  },
};
