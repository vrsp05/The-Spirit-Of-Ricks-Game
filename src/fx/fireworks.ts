// Lightweight fireworks (one instanced mesh, pooled particles) and an expanding colour-wave ring.
import * as THREE from 'three';
import { playSound } from './audio';

interface P { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; color: THREE.Color }

export class Effects {
  private mesh: THREE.InstancedMesh;
  private parts: P[] = [];
  private launches: { x: number; y: number; z: number; until: number; next: number }[] = [];
  private rings: { mesh: THREE.Mesh; t: number }[] = [];
  private time = 0;
  private readonly MAX = 1400;
  private tmp = new THREE.Matrix4();

  constructor(private scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), this.MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; scene.add(this.mesh);
  }

  /** Bursts above (x, y, z) for `seconds`. */
  fireworks(x: number, y: number, z: number, seconds: number, reducedMotion = false) {
    this.launches.push({ x, y, z, until: this.time + seconds, next: this.time });
    if (reducedMotion) this.launches[this.launches.length - 1].until = this.time + Math.min(seconds, 2);
  }
  private burst(x: number, y: number, z: number) {
    const palette = ['#ffd34d', '#ff5a5f', '#4fc3f7', '#9cff57', '#ffffff', '#ff9f43', '#c56cf0'];
    const c = new THREE.Color(palette[(Math.random() * palette.length) | 0]);
    const n = 70;
    for (let i = 0; i < n && this.parts.length < this.MAX; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = 9 + Math.random() * 5;
      this.parts.push({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(r * Math.cos(th) * sp, u * sp + 2, r * Math.sin(th) * sp), life: 0, max: 1.4 + Math.random() * 0.6, color: c });
    }
    playSound('boom');
  }

  /** Ring that expands across campus while colour returns. */
  colorWave(x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.5, z); this.scene.add(m); this.rings.push({ mesh: m, t: 0 });
  }

  get busy() { return this.parts.length > 0 || this.launches.length > 0 || this.rings.length > 0; }

  update(dt: number) {
    this.time += dt;
    for (const l of this.launches) if (this.time >= l.next && this.time < l.until) {
      this.burst(l.x + (Math.random() - 0.5) * 16, l.y + Math.random() * 8, l.z + (Math.random() - 0.5) * 16);
      l.next = this.time + 0.35 + Math.random() * 0.4;
    }
    this.launches = this.launches.filter(l => this.time < l.until);
    let n = 0;
    for (const p of this.parts) {
      p.life += dt; p.vel.y -= 9 * dt; p.vel.multiplyScalar(1 - dt * 0.9); p.pos.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max; if (k <= 0) continue;
      this.tmp.compose(p.pos, new THREE.Quaternion(), new THREE.Vector3(k, k, k));
      this.mesh.setMatrixAt(n, this.tmp); this.mesh.setColorAt(n, p.color); n++;
    }
    this.parts = this.parts.filter(p => p.life < p.max);
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const r of this.rings) {
      r.t += dt; const s = 2 + r.t * 90; r.mesh.scale.set(s, s, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - r.t * 0.25);
    }
    this.rings = this.rings.filter(r => { if (r.t > 3.2) { r.mesh.removeFromParent(); return false; } return true; });
  }
}
