// Virtual on-screen controller. It encodes real protocol reports and decodes
// them through the same path as BLE, so the full pipeline is exercised.
import type { InputManager } from './actions';
import { ControllerDevice, decodeReport, encodeReport, PROTOCOL_VERSION } from './controllerProtocol';

export class MockController {
  device: ControllerDevice;
  el: HTMLElement;
  private sticks = [[0, 0], [0, 0]];
  private buttons = 0;
  private seq = 0;
  private timer = 0;

  constructor(private controllerId: number, input: InputManager) {
    this.device = new ControllerDevice(`mock-${controllerId}`, `Mock controller ${controllerId + 1}`, 'mock');
    input.add(this.device);
    this.el = document.createElement('div');
    this.el.className = 'mock-controller';
    this.el.innerHTML = `<div class="mc-title">Mock controller ${controllerId + 1} <small>(dev)</small></div>
      <div class="mc-row"><div class="mc-stick" data-s="0"><div class="mc-knob"></div></div>
      <div class="mc-btns">${['1 Interact', '2 Back', '3 Map', '4 Pause', 'L3 Run', 'R3 Cam'].map((l, i) => `<button data-b="${i}">${l}</button>`).join('')}</div>
      <div class="mc-stick" data-s="1"><div class="mc-knob"></div></div></div>`;
    this.el.querySelectorAll<HTMLElement>('.mc-stick').forEach(pad => this.bindStick(pad, +pad.dataset.s!));
    this.el.querySelectorAll<HTMLButtonElement>('button[data-b]').forEach(b => {
      const bit = 1 << +b.dataset.b!;
      b.addEventListener('pointerdown', e => { this.buttons |= bit; b.classList.add('on'); e.preventDefault(); });
      const up = () => { this.buttons &= ~bit; b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
    });
  }
  private bindStick(pad: HTMLElement, s: number) {
    const knob = pad.querySelector<HTMLElement>('.mc-knob')!;
    const set = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      this.sticks[s] = [x, y]; knob.style.transform = `translate(${x * 28}px, ${-y * 28}px)`;
    };
    pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); set(e); });
    pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) set(e); });
    pad.addEventListener('pointerup', () => { this.sticks[s] = [0, 0]; knob.style.transform = ''; });
  }
  start() { if (!this.timer) this.timer = window.setInterval(() => this.send(), 20); }  // 50 Hz
  stop() { clearInterval(this.timer); this.timer = 0; this.device.connected = false; }
  private send() {
    const q = (v: number) => Math.round(v * 32767);
    const buf = encodeReport({ version: PROTOCOL_VERSION, controllerId: this.controllerId, seq: this.seq++,
      lx: q(this.sticks[0][0]), ly: q(this.sticks[0][1]), rx: q(this.sticks[1][0]), ry: q(this.sticks[1][1]), buttons: this.buttons, flags: 0 });
    const r = decodeReport(new DataView(buf));
    if ('error' in r) this.device.reportError(r.error); else this.device.ingest(r);
  }
}
