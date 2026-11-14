import { GAME_CONFIG } from '../config/game.config';
import type { ButtonName, InputSource, SourceFrame } from './actions';

// Keyboard + mouse. Supports the entire game without controllers.
const KEY_BUTTONS: Record<string, ButtonName[]> = {
  KeyE: ['interact'], Enter: ['confirm'], NumpadEnter: ['confirm'], Space: ['confirm', 'jump'],
  Escape: ['pause', 'back'], Backspace: ['back'],
  KeyM: ['map'], ShiftLeft: ['run'], ShiftRight: ['run'], KeyC: ['cameraReset'],
  Backquote: ['devToggle'], F1: ['devToggle'],
};

export class KeyboardMouseSource implements InputSource {
  id = 'keyboard';
  private keys = new Set<string>();
  private tapped = new Set<string>(); // keys pressed since last poll (so sub-frame taps are not lost)
  private look = { x: 0, y: 0 };
  private zoom = 0;
  private dragging = false;
  private lastSeen = 0;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      this.keys.add(e.code); this.tapped.add(e.code); this.lastSeen = performance.now();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'F1', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { this.dragging = true; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', e => { this.dragging = false; canvas.releasePointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      const s = GAME_CONFIG.input.mouseSensitivity;
      this.look.x -= e.movementX * s; this.look.y += e.movementY * s; this.lastSeen = performance.now();
    });
    canvas.addEventListener('wheel', e => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  poll(f: SourceFrame) {
    const k = (c: string) => this.keys.has(c) || this.tapped.has(c);
    const x = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    const y = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    if (x) f.axes.moveX = x;
    if (y) f.axes.moveY = y;
    for (const [code, btns] of Object.entries(KEY_BUTTONS)) if (k(code)) btns.forEach(b => f.buttons.add(b));
    this.tapped.clear();
    f.lookDelta = { ...this.look }; this.look = { x: 0, y: 0 };
    f.zoomDelta = this.zoom; this.zoom = 0;
  }
  status() { return { id: this.id, label: 'Keyboard & mouse', kind: 'keyboard', connected: true, lastSeenMs: this.lastSeen ? performance.now() - this.lastSeen : undefined }; }
}
