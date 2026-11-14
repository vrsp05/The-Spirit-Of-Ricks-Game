// A voxel golf cart the player can drive (fun transport; not a historical claim).
import * as THREE from 'three';

export class GolfCart {
  readonly root = new THREE.Group();
  speed = 0;
  private wheels: THREE.Object3D[] = [];
  constructor(public id: string, color = '#f4f1e8') {
    const m = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c)); b.position.set(x, y, z); b.castShadow = true; this.root.add(b); return b;
    };
    box(1.5, 0.5, 2.6, color, 0, 0.65, 0);            // body
    box(1.4, 0.35, 0.8, '#3a3f45', 0, 1.05, -0.15);    // seat
    box(1.4, 0.6, 0.12, '#3a3f45', 0, 1.35, -0.45);    // backrest
    box(1.5, 0.5, 0.6, color, 0, 0.95, 1.05);          // front cowl
    // roof posts + canopy high enough for a seated driver's head (seat top 1.22 + seated height ~1.35)
    for (const [x, z] of [[-0.68, -1.05], [0.68, -1.05], [-0.68, 0.95], [0.68, 0.95]]) box(0.08, 1.85, 0.08, '#c9c9c9', x, 2.0, z);
    box(1.7, 0.12, 2.4, '#2f6d4f', 0, 2.95, -0.05);    // canopy
    box(1.1, 0.8, 0.05, '#9fc3d6', 0, 1.6, 1.3);       // windscreen
    box(0.5, 0.08, 0.5, '#222', 0.35, 1.45, 0.75);     // steering wheel
    for (const [x, z] of [[-0.75, -0.85], [0.75, -0.85], [-0.75, 0.85], [0.75, 0.85]]) this.wheels.push(box(0.25, 0.5, 0.5, '#1c1c1c', x, 0.25, z));
  }
  animate(dt: number) { for (const w of this.wheels) w.rotation.x += this.speed * dt * 4; }
}
