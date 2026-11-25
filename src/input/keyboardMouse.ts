import { GAME_CONFIG } from '../config/game.config';
import type { ButtonName, InputSource, SourceFrame } from './actions';
import { SETTINGS } from '../core/settings';

/** Keys the player can rebind (Settings → Controls → Rebind keys). Arrow keys always move, Esc always pauses. */
export const REMAPPABLE: { id: string; label: string; def: string; button?: ButtonName }[] = [
  { id: 'up', label: 'Move forward', def: 'KeyW' }, { id: 'down', label: 'Move back', def: 'KeyS' },
  { id: 'left', label: 'Move left', def: 'KeyA' }, { id: 'right', label: 'Move right', def: 'KeyD' },
  { id: 'interact', label: 'Interact', def: 'KeyE', button: 'interact' }, { id: 'jump', label: 'Jump', def: 'Space', button: 'jump' },
  { id: 'run', label: 'Sprint (hold)', def: 'ShiftLeft', button: 'run' }, { id: 'map', label: 'Map', def: 'KeyM', button: 'map' },
  { id: 'ride', label: 'Longboard', def: 'KeyB', button: 'ride' }, { id: 'photo', label: 'Camera', def: 'KeyP', button: 'photo' },
  { id: 'phone', label: 'Phone', def: 'KeyQ', button: 'phone' }, { id: 'alt', label: 'Throw / pass', def: 'KeyR', button: 'alt' },
  { id: 'journal', label: 'Journal', def: 'KeyJ', button: 'journal' }, { id: 'cameraReset', label: 'Reset camera', def: 'KeyC', button: 'cameraReset' },
];
export const keyFor = (id: string) => SETTINGS.keymap[id] || REMAPPABLE.find(r => r.id === id)?.def || '';
/** "KeyE" → "E", "Space" → "Space", "ShiftLeft" → "Shift". */
export const keyName = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/(Left|Right)$/, '') || code;

// Keyboard + mouse. Supports the entire game without controllers.
const KEY_BUTTONS: Record<string, ButtonName[]> = {
  KeyE: ['interact'], Enter: ['confirm'], NumpadEnter: ['confirm'], Space: ['confirm', 'jump'],
  Escape: ['pause', 'back'], Backspace: ['back'],
  KeyM: ['map'], ShiftLeft: ['run'], ShiftRight: ['run'], KeyC: ['cameraReset'],
  Backquote: ['devToggle'], F1: ['devToggle'],
  KeyR: ['alt'], KeyF: ['alt2'], KeyT: ['rUp'], KeyG: ['rDown'], KeyH: ['hint'], KeyJ: ['journal'], Tab: ['tools'], KeyP: ['photo'], KeyB: ['ride'], KeyQ: ['phone'],
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
      if (!this.dragging || e.pointerType === 'touch') return;
      const s = GAME_CONFIG.input.mouseSensitivity;
      this.look.x -= e.movementX * s; this.look.y += e.movementY * s; this.lastSeen = performance.now();
    });
    canvas.addEventListener('wheel', e => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  poll(f: SourceFrame) {
    const k = (c: string) => this.keys.has(c) || this.tapped.has(c);
    const x = (k(keyFor('right')) || k('ArrowRight') ? 1 : 0) - (k(keyFor('left')) || k('ArrowLeft') ? 1 : 0);
    const y = (k(keyFor('up')) || k('ArrowUp') ? 1 : 0) - (k(keyFor('down')) || k('ArrowDown') ? 1 : 0);
    if (x) f.axes.moveX = x;
    if (y) f.axes.moveY = y;
    for (const [code, btns] of Object.entries(this.effective())) if (k(code)) btns.forEach(b => f.buttons.add(b));
    this.tapped.clear();
    f.lookDelta = { ...this.look }; this.look = { x: 0, y: 0 };
    f.zoomDelta = this.zoom; this.zoom = 0;
  }
  /** KEY_BUTTONS with the player's rebinds applied (cached until the keymap changes). */
  private eff: { sig: string; map: Record<string, ButtonName[]> } | null = null;
  private effective() {
    const sig = JSON.stringify(SETTINGS.keymap); if (this.eff?.sig === sig) return this.eff.map;
    const map: Record<string, ButtonName[]> = {}; for (const [c, b] of Object.entries(KEY_BUTTONS)) map[c] = [...b];
    for (const r of REMAPPABLE) {
      const to = SETTINGS.keymap[r.id]; if (!to || to === r.def) continue;
      const moved: ButtonName[] = r.button ? [r.button] : [];
      if (r.button) { map[r.def] = (map[r.def] ?? []).filter(b => b !== r.button); if (r.id === 'run') map.ShiftRight = (map.ShiftRight ?? []).filter(b => b !== 'run'); }
      for (const b of moved) (map[to] ??= []).push(b);
    }
    this.eff = { sig, map }; return map;
  }
  status() { return { id: this.id, label: 'Keyboard & mouse', kind: 'keyboard', connected: true, lastSeenMs: this.lastSeen ? performance.now() - this.lastSeen : undefined }; }
}
