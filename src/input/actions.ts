// The single action layer. Every input device is an InputSource that writes a
// SourceFrame; InputManager merges them (largest deflection per axis wins, any
// source can press a button). Game code, UI and quests read ActionState only.

export type AxisName = 'moveX' | 'moveY' | 'lookX' | 'lookY';
export type ButtonName =
  | 'interact' | 'confirm' | 'back' | 'map' | 'pause'
  | 'run' | 'runToggle' | 'cameraReset'
  | 'navUp' | 'navDown' | 'navLeft' | 'navRight' | 'devToggle' | 'jump' | 'alt' | 'alt2' | 'hint' | 'journal' | 'tools' | 'rLeft' | 'rRight' | 'rUp' | 'rDown';

export interface SourceFrame {
  axes: Partial<Record<AxisName, number>>;   // -1..1; moveY/lookY: +1 = forward/up
  buttons: Set<ButtonName>;
  lookDelta?: { x: number; y: number };      // mouse-style relative look, radians
  zoomDelta?: number;                        // + = zoom out
}
export interface SourceStatus { id: string; label: string; kind: string; connected: boolean; detail?: string; lastSeenMs?: number }

export interface InputSource {
  id: string;
  poll(frame: SourceFrame, dt: number): void;
  status(): SourceStatus;
  raw?(): { axes: number[]; buttons: boolean[] } | null; // for the input test view
}

const ALL_BUTTONS: ButtonName[] = ['interact', 'confirm', 'back', 'map', 'pause', 'run', 'runToggle', 'cameraReset', 'navUp', 'navDown', 'navLeft', 'navRight', 'devToggle', 'jump', 'alt', 'alt2', 'hint', 'journal', 'tools', 'rLeft', 'rRight', 'rUp', 'rDown'];

export class ActionState {
  axes: Record<AxisName, number> = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
  lookDelta = { x: 0, y: 0 };
  zoomDelta = 0;
  private down = new Set<ButtonName>();
  private prev = new Set<ButtonName>();
  private consumed = new Set<ButtonName>();
  runToggled = false;

  isDown(b: ButtonName) { return this.down.has(b); }
  /** True on the first frame a button goes down (and not yet consumed). */
  pressed(b: ButtonName) { return this.down.has(b) && !this.prev.has(b) && !this.consumed.has(b); }
  consume(b: ButtonName) { this.consumed.add(b); }
  get running() { return this.isDown('run') !== this.runToggled; }

  _commit(frame: SourceFrame) {
    this.prev = this.down; this.down = new Set(frame.buttons); this.consumed.clear();
    for (const k of Object.keys(this.axes) as AxisName[]) this.axes[k] = frame.axes[k] ?? 0;
    this.lookDelta = frame.lookDelta ?? { x: 0, y: 0 };
    this.zoomDelta = frame.zoomDelta ?? 0;
    if (this.pressed('runToggle')) this.runToggled = !this.runToggled;
  }
}

export class InputManager {
  readonly sources: InputSource[] = [];
  readonly state = new ActionState();
  private navRepeat: Partial<Record<ButtonName, number>> = {};

  add(src: InputSource) { this.sources.push(src); return src; }
  remove(id: string) { const i = this.sources.findIndex(s => s.id === id); if (i >= 0) this.sources.splice(i, 1); }

  update(dt: number) {
    const merged: SourceFrame = { axes: {}, buttons: new Set(), lookDelta: { x: 0, y: 0 }, zoomDelta: 0 };
    for (const src of this.sources) {
      const f: SourceFrame = { axes: {}, buttons: new Set() };
      try { src.poll(f, dt); } catch (e) { console.warn('input source failed', src.id, e); continue; }
      for (const [k, v] of Object.entries(f.axes) as [AxisName, number][]) {
        const cur = merged.axes[k] ?? 0;
        if (Math.abs(v) > Math.abs(cur)) merged.axes[k] = v;
      }
      f.buttons.forEach(b => merged.buttons.add(b));
      if (f.lookDelta) { merged.lookDelta!.x += f.lookDelta.x; merged.lookDelta!.y += f.lookDelta.y; }
      merged.zoomDelta! += f.zoomDelta ?? 0;
    }
    // Stick-driven menu navigation with auto-repeat (keyboard sources emit nav* directly).
    // right stick (controllers) → rLeft/rRight/rUp/rDown edges (lookX = -stick x)
    const stick: [ButtonName, boolean][] = [
      ['navUp', (merged.axes.moveY ?? 0) > 0.6], ['navDown', (merged.axes.moveY ?? 0) < -0.6],
      ['navLeft', (merged.axes.moveX ?? 0) < -0.6], ['navRight', (merged.axes.moveX ?? 0) > 0.6],
      ['rRight', (merged.axes.lookX ?? 0) < -0.6], ['rLeft', (merged.axes.lookX ?? 0) > 0.6],
      ['rUp', (merged.axes.lookY ?? 0) > 0.6], ['rDown', (merged.axes.lookY ?? 0) < -0.6],
    ];
    for (const [b, active] of stick) {
      if (merged.buttons.has(b)) continue;
      if (!active) { delete this.navRepeat[b]; continue; }
      const t = this.navRepeat[b];
      if (t === undefined) { this.navRepeat[b] = 0.4; merged.buttons.add(b); }
      else { const nt = t - dt; if (nt <= 0) { this.navRepeat[b] = 0.12; this.state.isDown(b) ? null : merged.buttons.add(b); } else this.navRepeat[b] = nt; }
    }
    if (merged.buttons.has('interact')) merged.buttons.add('confirm');
    this.state._commit(merged);
  }
  statuses() { return this.sources.map(s => s.status()); }
}

export { ALL_BUTTONS };
