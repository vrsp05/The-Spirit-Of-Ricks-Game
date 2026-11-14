// Small reusable in-engine cutscene system: camera moves, subtitles, simple prop
// animations and fades. Skippable (Back), advanceable (Confirm), subtitled, and
// reduced-motion aware. `onDone` carries the state change and runs EXACTLY ONCE,
// whether the scene finishes or is skipped. Replays (dev) never call onDone.
import * as THREE from 'three';

type V3 = { x: number; y: number; z: number };
export interface CutStep {
  camera?: { from: V3; to: V3; lookFrom?: V3; dur?: number }; // move camera position from→to, looking at `lookFrom`→to.look
  look?: V3;                                                   // look-at target for this step
  say?: { speaker: string; text: string };                     // subtitle (waits for Confirm unless `dur`)
  dur?: number;                                                // auto-advance after seconds
  run?: () => void;                                            // visual-only effect at step start
  tick?: (dt: number, t01: number) => void;                    // per-frame visual animation
}
export interface CutsceneSpec { id: string; steps: CutStep[]; onDone?: () => void; cleanup?: () => void; replay?: boolean }

export interface CutsceneHost {
  camera: THREE.PerspectiveCamera;
  subtitle(text: { speaker: string; text: string } | null, hint: string): void;
  reducedMotion(): boolean;
}

export class CutsceneRunner {
  private spec: CutsceneSpec | null = null;
  private i = 0; private t = 0; private resolve: (() => void) | null = null;
  private doneCalled = false;
  readonly history = new Map<string, CutsceneSpec>();   // for dev replay
  private lookCur = new THREE.Vector3();

  constructor(private host: CutsceneHost) {}
  get active() { return !!this.spec; }

  play(spec: CutsceneSpec): Promise<void> {
    if (this.spec) this.finish(true);
    if (!spec.replay) this.history.set(spec.id, { ...spec, onDone: undefined, replay: true });
    this.spec = spec; this.i = -1; this.doneCalled = false;
    return new Promise(res => { this.resolve = res; this.next(); });
  }

  private next() {
    const s = this.spec!; this.i++; this.t = 0;
    if (this.i >= s.steps.length) { this.finish(false); return; }
    const st = s.steps[this.i];
    st.run?.();
    this.host.subtitle(st.say ?? null, st.say && !st.dur ? 'Confirm ▸   ·   Back: skip scene' : 'Back: skip scene');
    if (st.camera) {
      const look = st.look ?? st.camera.to;
      if (this.host.reducedMotion() || !st.camera.dur) this.place(st.camera.to, look);
      else { this.place(st.camera.from, st.camera.lookFrom ?? look); }
    } else if (st.look) this.lookCur.set(st.look.x, st.look.y, st.look.z);
  }
  private place(p: V3, look: V3) {
    const c = this.host.camera; c.position.set(p.x, p.y, p.z); this.lookCur.set(look.x, look.y, look.z); c.lookAt(this.lookCur);
  }

  /** Returns true while a scene owns the camera/input. */
  update(dt: number, confirm: boolean, back: boolean): boolean {
    const s = this.spec; if (!s) return false;
    if (back) { this.finish(true); return true; }
    const st = s.steps[this.i]; this.t += dt;
    const dur = st.dur ?? (st.say ? Infinity : st.camera?.dur ?? 0);
    const k = Number.isFinite(dur) && dur > 0 ? Math.min(1, this.t / dur) : 1;
    st.tick?.(dt, k);
    if (st.camera && st.camera.dur && !this.host.reducedMotion()) {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const a = st.camera.from, b = st.camera.to, look = st.look ?? b, lf = st.camera.lookFrom ?? look;
      this.host.camera.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.z + (b.z - a.z) * e);
      this.lookCur.set(lf.x + (look.x - lf.x) * e, lf.y + (look.y - lf.y) * e, lf.z + (look.z - lf.z) * e);
    }
    this.host.camera.lookAt(this.lookCur);
    if ((st.say && confirm && this.t > 0.15) || (Number.isFinite(dur) && this.t >= dur)) this.next();
    return true;
  }

  private finish(skipped: boolean) {
    const s = this.spec; if (!s) return;
    if (skipped) for (let j = Math.max(0, this.i + 1); j < s.steps.length; j++) s.steps[j].run?.(); // keep visuals consistent
    this.spec = null; this.host.subtitle(null, '');
    s.cleanup?.();
    if (!s.replay && !this.doneCalled) { this.doneCalled = true; s.onDone?.(); }
    const r = this.resolve; this.resolve = null; r?.();
  }
}
