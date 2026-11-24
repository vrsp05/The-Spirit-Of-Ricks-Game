// Drivable vehicles: golf carts, era-styled parked cars, bicycles, scooters, and the cheat-code aircraft
// (a helicopter and a small propeller plane — see PlayerController.fly).
import * as THREE from 'three';

export type VehicleKind = 'cart' | 'car' | 'bike' | 'scooter' | 'heli' | 'plane';
export const isAircraft = (k: VehicleKind) => k === 'heli' || k === 'plane';
export type CarStyle = 'boxy90s' | 'pickup90s' | 'rounded2010s' | 'modern';
export interface VehicleParams { maxSpeed: number; reverseSpeed: number; accel: number; turnRate: number; radius: number }

export const PARAMS: Record<VehicleKind, VehicleParams> = {
  cart: { maxSpeed: 17, reverseSpeed: 6, accel: 9, turnRate: 2.0, radius: 0.95 },
  car: { maxSpeed: 22, reverseSpeed: 7, accel: 10, turnRate: 1.7, radius: 1.25 },
  bike: { maxSpeed: 10, reverseSpeed: 2, accel: 7, turnRate: 2.6, radius: 0.5 },
  scooter: { maxSpeed: 8.5, reverseSpeed: 1.5, accel: 6, turnRate: 2.8, radius: 0.45 },
  heli: { maxSpeed: 22, reverseSpeed: 0, accel: 1.6, turnRate: 2.5, radius: 1.4 },     // run = 34 m/s
  plane: { maxSpeed: 42, reverseSpeed: 0, accel: 9, turnRate: 1.1, radius: 1.6 },     // run = 60 m/s; lifts off from 16 m/s
};

export class Vehicle {
  readonly root = new THREE.Group();
  /** Everything that leans/pitches (wheels stay on the ground, except on bikes). */
  readonly body = new THREE.Group();
  speed = 0;
  private wheels: THREE.Object3D[] = [];
  private frontWheels: THREE.Object3D[] = [];
  private lamps: THREE.MeshStandardMaterial[] = [];
  private tails: THREE.MeshStandardMaterial[] = [];
  private steerS = 0; private lastSpeed = 0; private pitch = 0;
  private pedals: THREE.Object3D | null = null;
  /** Aircraft: spinning rotors / propeller (axis + relative rate) and the engine's spin-up (0..1). */
  private rotors: { o: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[] = [];
  private spin = 0;
  /** Rider placement in vehicle-local space (x right, y up, z forward). */
  seat = { x: 0, y: 0.42, z: 0 };
  hideRider = false;
  pose: 'sit' | 'bike' | 'stand' = 'sit';
  eras: string[] | null = null;
  constructor(public id: string, public kind: VehicleKind, style: CarStyle = 'boxy90s', color = '#f4f1e8') {
    this.root.add(this.body);
    const paint = new Set([color]);
    const m = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: paint.has(c) ? 0.38 : c === '#5d7f99' || c === '#9fc3d6' ? 0.08 : 0.8, metalness: paint.has(c) ? 0.25 : 0 });
    const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c)); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b;
    };
    /** Wheel with a hub cap so the spin is visible; front wheels also steer. */
    const wheel = (w: number, h: number, x: number, y: number, z: number, parent: THREE.Object3D = this.root) => {
      const wl = box(w, h, h, '#1c1c1c', x, y, z, parent); wl.rotation.order = 'YXZ';
      const cap = box(0.04, h * 0.42, h * 0.16, '#c9c9c9', Math.sign(x || 1) * (w / 2 + 0.01), 0, 0, wl); cap.castShadow = false;
      this.wheels.push(wl); if (z > 0) this.frontWheels.push(wl); return wl;
    };
    const lamp = (b: THREE.Mesh, tail = false) => { const mt = b.material as THREE.MeshStandardMaterial; mt.emissive.set(tail ? '#ff2a1a' : '#fff3c0'); mt.emissiveIntensity = tail ? 0.25 : 0.35; (tail ? this.tails : this.lamps).push(mt); };
    if (kind === 'cart') {
      box(1.5, 0.5, 2.6, color, 0, 0.65, 0); box(1.4, 0.35, 0.8, '#3a3f45', 0, 1.05, -0.15); box(1.4, 0.6, 0.12, '#3a3f45', 0, 1.35, -0.45);
      box(1.5, 0.5, 0.6, color, 0, 0.95, 1.05);
      for (const [x, z] of [[-0.68, -1.05], [0.68, -1.05], [-0.68, 0.95], [0.68, 0.95]]) box(0.08, 1.85, 0.08, '#c9c9c9', x, 2.0, z);
      box(1.7, 0.12, 2.4, '#2f6d4f', 0, 2.95, -0.05); box(1.1, 0.8, 0.05, '#9fc3d6', 0, 1.6, 1.3); box(0.5, 0.08, 0.5, '#222', 0.35, 1.45, 0.75);
      for (const [x, z] of [[-0.75, -0.85], [0.75, -0.85], [-0.75, 0.85], [0.75, 0.85]]) wheel(0.25, 0.5, x, 0.25, z);
      lamp(box(0.3, 0.14, 0.05, '#fff6c8', -0.45, 0.85, 1.36)); lamp(box(0.3, 0.14, 0.05, '#fff6c8', 0.45, 0.85, 1.36));
      this.seat = { x: 0.35, y: 0.42, z: -0.05 };
    } else if (kind === 'car') {
      const glass = '#5d7f99', dark = '#1c1c1c', light = '#fff6c8', tail = '#b3261e';
      if (style === 'boxy90s') {          // squared-off 1990s sedan
        box(1.8, 0.7, 4.4, color, 0, 0.7, 0); box(1.6, 0.6, 2.2, color, 0, 1.35, -0.2);
        box(1.62, 0.45, 2.0, glass, 0, 1.37, -0.2); box(1.82, 0.12, 4.42, '#9a9a9a', 0, 0.45, 0);
      } else if (style === 'pickup90s') { // 1990s pickup with a bed
        box(1.9, 0.8, 4.8, color, 0, 0.75, 0); box(1.8, 0.7, 1.6, color, 0, 1.5, 0.6); box(1.82, 0.5, 1.4, glass, 0, 1.55, 0.6);
        box(1.7, 0.1, 2.2, '#3a3a3a', 0, 1.18, -1.2);
      } else if (style === 'rounded2010s') { // softer 2010s hatchback/crossover
        box(1.85, 0.75, 4.3, color, 0, 0.75, 0); box(1.75, 0.65, 2.6, color, 0, 1.45, -0.1); box(1.77, 0.5, 2.3, glass, 0, 1.47, -0.1);
        box(1.7, 0.3, 0.4, color, 0, 1.15, 1.95);
      } else {                              // modern EV-like: low, long glass roof, light bar
        box(1.9, 0.65, 4.6, color, 0, 0.68, 0); box(1.8, 0.55, 3.0, glass, 0, 1.28, -0.1); lamp(box(1.86, 0.06, 0.08, light, 0, 0.9, 2.3));
      }
      lamp(box(0.35, 0.18, 0.06, light, -0.6, 0.85, 2.21)); lamp(box(0.35, 0.18, 0.06, light, 0.6, 0.85, 2.21));
      lamp(box(0.35, 0.16, 0.06, tail, -0.6, 0.85, -2.21), true); lamp(box(0.35, 0.16, 0.06, tail, 0.6, 0.85, -2.21), true);
      box(1.5, 0.08, 0.06, '#222', 0, 0.62, 2.22);                                       // grille
      void dark;
      for (const [x, z] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, 1.4], [0.9, 1.4]]) wheel(0.28, 0.66, x, 0.33, z);
      this.hideRider = true; this.seat = { x: -0.4, y: 0.2, z: 0 };
    } else if (kind === 'scooter') {
      // electric kick scooter: low deck, two small wheels, tall stem + handlebar, a little headlight
      const body = color === '#f4f1e8' ? '#2fbf71' : color;
      wheel(0.07, 0.24, 0, 0.12, 0.42, this.body); wheel(0.07, 0.24, 0, 0.12, -0.38, this.body);
      box(0.2, 0.06, 0.88, '#1f2328', 0, 0.16, 0); box(0.16, 0.012, 0.7, '#3a3f45', 0, 0.195, -0.02);      // deck + grip tape
      box(0.06, 0.95, 0.06, body, 0, 0.66, 0.4); box(0.5, 0.05, 0.05, '#1f2328', 0, 1.13, 0.4);             // stem + bar
      box(0.12, 0.06, 0.16, body, 0, 0.2, -0.42); lamp(box(0.08, 0.05, 0.03, '#fff6c8', 0, 0.95, 0.44));   // rear fender + light
      this.pose = 'stand'; this.seat = { x: 0, y: 0.2, z: -0.05 };
    } else if (kind === 'heli') {
      // small helicopter: glass cabin (you can see the pilot), tail boom + rotor, skids, a big two-blade main rotor
      const glass = new THREE.MeshStandardMaterial({ color: '#a9d2e6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38 });
      const body = color === '#f4f1e8' ? '#c0392b' : color, dark = '#2a2d31';
      box(1.9, 0.3, 2.8, body, 0, 0.62, 0.3); box(1.9, 0.25, 2.5, body, 0, 2.4, 0.2); box(1.9, 1.75, 0.3, body, 0, 1.5, -1.0);
      box(1.7, 0.55, 0.7, body, 0, 0.95, 1.5); box(0.6, 0.3, 0.5, dark, 0, 0.92, 0.1);                       // nose + seat
      for (const [w, h, d, x, y, z] of [[0.04, 1.5, 2.2, -0.93, 1.5, 0.4], [0.04, 1.5, 2.2, 0.93, 1.5, 0.4], [1.8, 1.2, 0.04, 0, 1.65, 1.82]] as const) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass); g.position.set(x, y, z); this.body.add(g);
      }
      box(0.45, 0.45, 3.6, body, 0, 1.75, -2.8); box(0.1, 1.1, 0.7, body, 0, 2.25, -4.45); box(1.3, 0.08, 0.5, body, 0, 1.85, -4.3);
      box(1.9, 0.1, 0.16, '#f4f1e8', 0, 1.25, 1.6);                                                          // stripe
      for (const x of [-0.85, 0.85]) { box(0.12, 0.1, 3.2, dark, x, 0.06, 0.2); box(0.08, 0.6, 0.08, dark, x, 0.35, 1.0); box(0.08, 0.6, 0.08, dark, x, 0.35, -0.6); }
      box(0.18, 0.45, 0.18, dark, 0, 2.7, 0.2);
      const main = new THREE.Group(); main.position.set(0, 2.95, 0.2); this.body.add(main);
      box(8.4, 0.06, 0.34, dark, 0, 0, 0, main); box(0.34, 0.06, 8.4, dark, 0, 0, 0, main); box(0.4, 0.16, 0.4, '#8a8f94', 0, 0, 0, main);
      const tail = new THREE.Group(); tail.position.set(0.12, 2.25, -4.45); this.body.add(tail);
      box(0.04, 1.3, 0.16, dark, 0, 0, 0, tail);
      this.rotors.push({ o: main, axis: 'y', rate: 26 }, { o: tail, axis: 'x', rate: 40 });
      lamp(box(0.3, 0.12, 0.05, '#fff6c8', 0, 0.85, 1.86)); lamp(box(0.1, 0.1, 0.1, '#ff2a1a', 0, 2.85, -4.45), true);
      this.pose = 'sit'; this.seat = { x: 0, y: 0.02, z: 0.15 };
    } else if (kind === 'plane') {
      // small high-wing propeller plane: fuselage, glass cockpit, wing, tail, three wheels, a spinning propeller
      const glass = new THREE.MeshStandardMaterial({ color: '#a9d2e6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38 });
      const body = color === '#f4f1e8' ? '#f2efe8' : color, trim = '#2f5f9e', dark = '#2a2d31';
      box(1.3, 1.4, 3.6, body, 0, 1.3, 0.4); box(1.0, 1.0, 1.0, trim, 0, 1.3, 2.7);                       // fuselage + cowl
      box(0.9, 0.9, 2.4, body, 0, 1.5, -2.5); box(0.55, 0.55, 0.8, body, 0, 1.6, -4.0);                    // tail cone
      const cg = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.75, 1.7), glass); cg.position.set(0, 2.38, 0.9); this.body.add(cg);
      box(1.3, 0.12, 0.5, body, 0, 2.7, -0.1);                                                              // cabin roof behind the glass
      box(10, 0.14, 1.5, body, 0, 2.82, 0.6); box(0.6, 0.15, 1.52, trim, -4.7, 2.83, 0.6); box(0.6, 0.15, 1.52, trim, 4.7, 2.83, 0.6);   // wing + tips
      for (const x of [-1.6, 1.6]) box(0.08, 1.3, 0.08, '#c9c9c9', x, 2.15, 0.8);                           // wing struts
      box(3.4, 0.1, 0.8, body, 0, 1.75, -4.1); box(0.1, 1.3, 0.9, trim, 0, 2.4, -4.2);                       // tail planes
      box(1.32, 0.18, 3.62, trim, 0, 1.05, 0.4);                                                             // stripe
      for (const [x, z] of [[-0.9, 0.7], [0.9, 0.7], [0, 2.4]]) { box(0.08, 0.5, 0.08, dark, x, 0.45, z); wheel(0.16, 0.44, x, 0.22, z); }
      const prop = new THREE.Group(); prop.position.set(0, 1.3, 3.25); this.body.add(prop);
      box(0.16, 2.3, 0.06, dark, 0, 0, 0, prop); box(0.3, 0.3, 0.3, '#c9c9c9', 0, 0, 0, prop);
      this.rotors.push({ o: prop, axis: 'z', rate: 45 });
      lamp(box(0.2, 0.1, 0.05, '#fff6c8', -4.7, 2.75, 1.37)); lamp(box(0.12, 0.12, 0.12, '#ff2a1a', 0, 3.1, -4.2), true);
      this.pose = 'sit'; this.seat = { x: 0, y: 0.22, z: 0.75 };
    } else {
      // bicycle: frame, two wheels, handlebar, seat, pedals
      const frame = '#c0392b';
      wheel(0.08, 0.7, 0, 0.35, 0.55, this.body); wheel(0.08, 0.7, 0, 0.35, -0.55, this.body);
      box(0.07, 0.07, 1.0, frame, 0, 0.62, 0); box(0.07, 0.55, 0.07, frame, 0, 0.62, -0.25); box(0.07, 0.5, 0.07, frame, 0, 0.65, 0.48);
      box(0.6, 0.06, 0.06, '#333', 0, 0.95, 0.5); box(0.22, 0.06, 0.3, '#222', 0, 0.92, -0.25);
      this.pedals = new THREE.Group(); this.pedals.position.set(0, 0.35, 0); this.body.add(this.pedals);
      box(0.4, 0.05, 0.05, '#555', 0, 0.15, 0, this.pedals); box(0.4, 0.05, 0.05, '#555', 0, -0.15, 0, this.pedals);
      this.pose = 'bike'; this.seat = { x: 0, y: 0.15, z: -0.25 };
    }
  }
  /** Aircraft attitude + rotors. power 0..1 (engine), pitch/bank in radians. */
  fly(dt: number, power: number, pitch: number, bank: number) {
    this.spin += (power - this.spin) * Math.min(1, dt * 1.5);
    for (const r of this.rotors) r.o.rotation[r.axis] += this.spin * r.rate * dt;
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 4);
    this.body.rotation.z += (bank - this.body.rotation.z) * Math.min(1, dt * 4);
    if (this.kind === 'plane') for (const w of this.wheels) w.rotation.x += this.speed * dt * 4;
  }
  /** steer: −1..1 (A/D). Wheels spin with speed, front wheels steer, the body leans and pitches. */
  animate(dt: number, steer = 0) {
    for (const w of this.wheels) w.rotation.x += this.speed * dt * (this.kind === 'bike' ? 2.9 : this.kind === 'scooter' ? 8 : 3);
    if (this.pedals) this.pedals.rotation.x += this.speed * dt * 1.5;
    this.steerS += (steer - this.steerS) * Math.min(1, dt * 8);
    for (const w of this.frontWheels) w.rotation.y = -this.steerS * 0.45;
    const sp = Math.min(1, Math.abs(this.speed) / PARAMS[this.kind].maxSpeed);
    const accel = (this.speed - this.lastSpeed) / Math.max(dt, 1e-3); this.lastSpeed = this.speed;
    this.pitch += (Math.max(-1, Math.min(1, accel / 12)) * 0.03 - this.pitch) * Math.min(1, dt * 5);
    // cars/carts roll outward in a turn; bikes lean into it
    const lean = this.kind === 'bike' || this.kind === 'scooter';
    this.body.rotation.z = (lean ? -1 : 0.35) * this.steerS * sp * (lean ? 0.3 : 0.12);
    this.body.rotation.x = lean ? 0 : -this.pitch;
    for (const t of this.tails) t.emissiveIntensity = accel < -4 ? 1.8 : 0.25;   // brake lights
  }
}
