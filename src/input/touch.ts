// On-screen touch controls for phones and tablets: a virtual stick (move), action buttons, and the camera
// on the rest of the screen (one finger drags to look around, two fingers pinch to zoom). It is just another
// InputSource, so the whole game (menus included — those are tappable buttons) works unchanged.
import type { ButtonName, InputSource, SourceFrame } from './actions';

export const isTouchDevice = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };   // the main pointer is a finger (not touch laptops with a mouse)

const BUTTONS: { label: string; b: ButtonName[]; big?: boolean; title: string }[] = [
  { label: 'R', b: ['alt'], title: 'Throw / pass' }, { label: '⤒', b: ['jump'], title: 'Jump' }, { label: 'E', b: ['interact', 'confirm'], big: true, title: 'Interact' },
  { label: '🛹', b: ['ride'], title: 'Longboard' }, { label: '🏃', b: [], title: 'Sprint (toggle)' }, { label: '↩', b: ['back'], title: 'Back' },
];
const TOP: { label: string; b: ButtonName[]; title: string }[] = [
  { label: '🗺️', b: ['map'], title: 'Map' }, { label: '📱', b: ['phone'], title: 'Phone' }, { label: '📷', b: ['photo'], title: 'Camera' }, { label: '⏸', b: ['pause'], title: 'Pause' },
];

export class TouchSource implements InputSource {
  id = 'touch';
  private root: HTMLElement;
  private stick = { x: 0, y: 0 };
  private held = new Set<ButtonName>(); private tapped = new Set<ButtonName>();
  private sprint = false;
  private look = { x: 0, y: 0 }; private zoom = 0;
  private fingers = new Map<number, { x: number; y: number }>(); private pinch = 0;
  private lastSeen = 0;

  constructor(parent: HTMLElement, canvas: HTMLElement, private sensitivity = 0.006) {
    this.root = document.createElement('div'); this.root.className = 'touch-ui hidden';
    this.root.innerHTML = `<div class="touch-stick"><div class="touch-knob"></div></div><div class="touch-btns"></div><div class="touch-top"></div>`;
    parent.appendChild(this.root);
    // the stick
    const pad = this.root.querySelector('.touch-stick') as HTMLElement, knob = pad.querySelector('.touch-knob') as HTMLElement;
    let sid = -1;
    const move = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      this.stick = { x: dx, y: -dy }; knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`; this.lastSeen = performance.now();
    };
    pad.addEventListener('pointerdown', e => { sid = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ } move(e); e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === sid) move(e); });
    const release = (e: PointerEvent) => { if (e.pointerId !== sid) return; sid = -1; this.stick = { x: 0, y: 0 }; knob.style.transform = ''; };
    pad.addEventListener('pointerup', release); pad.addEventListener('pointercancel', release);
    // buttons
    const mk = (box: Element, d: { label: string; b: ButtonName[]; big?: boolean; title: string }) => {
      const el = document.createElement('button'); el.type = 'button'; el.textContent = d.label; el.title = d.title; el.setAttribute('aria-label', d.title); if (d.big) el.className = 'big';
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation(); this.lastSeen = performance.now();
        if (d.title.startsWith('Sprint')) { this.sprint = !this.sprint; el.classList.toggle('on', this.sprint); return; }
        d.b.forEach(b => { this.held.add(b); this.tapped.add(b); });
      });
      const up = () => d.b.forEach(b => this.held.delete(b));
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
      box.appendChild(el);
    };
    BUTTONS.forEach(d => mk(this.root.querySelector('.touch-btns')!, d));
    TOP.forEach(d => mk(this.root.querySelector('.touch-top')!, d));
    // camera: drag on the 3D view; pinch to zoom
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.pinch = 0; } });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch' || !this.fingers.has(e.pointerId)) return;
      const prev = this.fingers.get(e.pointerId)!; this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.lastSeen = performance.now();
      if (this.fingers.size === 1) { this.look.x -= (e.clientX - prev.x) * this.sensitivity; this.look.y += (e.clientY - prev.y) * this.sensitivity; }
      else if (this.fingers.size === 2) {
        const [a, b] = [...this.fingers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) { const k = d - this.pinch; if (Math.abs(k) > 18) { this.zoom += k > 0 ? -1 : 1; this.pinch = d; } } else this.pinch = d;
      }
    });
    const lift = (e: PointerEvent) => { this.fingers.delete(e.pointerId); this.pinch = 0; };
    canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  }
  setVisible(v: boolean) { this.root.classList.toggle('hidden', !v); document.body.classList.toggle('touch', v); }
  poll(f: SourceFrame) {
    if (this.stick.x || this.stick.y) { f.axes.moveX = this.stick.x; f.axes.moveY = this.stick.y; }
    this.held.forEach(b => f.buttons.add(b)); this.tapped.forEach(b => f.buttons.add(b)); this.tapped.clear();
    if (this.sprint && (this.stick.x || this.stick.y)) f.buttons.add('run');
    f.lookDelta = { ...this.look }; this.look = { x: 0, y: 0 };
    f.zoomDelta = this.zoom; this.zoom = 0;
  }
  status() { return { id: this.id, label: 'Touch screen', kind: 'touch', connected: true, lastSeenMs: this.lastSeen ? performance.now() - this.lastSeen : undefined }; }
}
