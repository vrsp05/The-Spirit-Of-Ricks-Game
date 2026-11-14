// Transport adapters. Both feed ControllerDevice, so the action layer does not
// care which transport the team selects.
import { GAME_CONFIG } from '../config/game.config';
import type { ButtonName, InputManager, SourceFrame } from './actions';
import {
  BLE_LED_CHAR_UUID, BLE_REPORT_CHAR_UUID, BLE_SERVICE_UUID, ControllerDevice, decodeReport,
} from './controllerProtocol';
import { joyConKind, readJoyCon, type JoyConKind } from './joycon';

/** A Joy-Con (or L+R pair): sticks go through the usual calibration/dead zone, buttons use the Nintendo layout. */
class JoyConDevice extends ControllerDevice {
  extra = new Set<ButtonName>(); pressed: boolean[] = [];
  constructor(id: string, label: string, public joy: JoyConKind) { super(id, label, 'joy-con'); }
  poll(f: SourceFrame) { super.poll(f); if (!this.stale) this.extra.forEach(b => f.buttons.add(b)); }
  raw() { return { axes: this.rawAxes.slice(), buttons: this.pressed.slice() }; }
}

/** Candidate A: BLE HID gamepad (or any gamepad) via the browser Gamepad API. */
export class GamepadHub {
  private devices = new Map<number, ControllerDevice>();
  constructor(private input: InputManager) {
    window.addEventListener('gamepaddisconnected', e => {
      const d = this.devices.get(e.gamepad.index); if (d) { d.connected = false; }
    });
  }
  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      let d = this.devices.get(gp.index);
      const joy = joyConKind(gp);
      if (d && (d instanceof JoyConDevice) !== !!joy) { this.input.remove(d.id); d = undefined; }   // a different pad took this slot
      if (!d) {
        d = joy ? new JoyConDevice(`gamepad-${gp.index}`, `Joy-Con ${joy === 'pair' ? 'L+R' : joy === 'left' ? '(L), sideways' : '(R), sideways'}`, joy)
          : new ControllerDevice(`gamepad-${gp.index}`, `Gamepad ${gp.index + 1}: ${gp.id.slice(0, 40)}`, 'gamepad');
        this.devices.set(gp.index, d); this.input.add(d);
      }
      if (d instanceof JoyConDevice) { const r = readJoyCon(gp, d.joy); d.extra = r.buttons; d.pressed = gp.buttons.map(x => x.pressed); d.ingestNormalized(r.axes, 0); continue; }
      const ax = [gp.axes[0] ?? 0, -(gp.axes[1] ?? 0), gp.axes[2] ?? 0, -(gp.axes[3] ?? 0)];
      let bits = 0;
      GAME_CONFIG.input.gamepadButtonIndices.forEach((idx, bit) => { if (gp.buttons[idx]?.pressed) bits |= 1 << bit; });
      d.ingestNormalized(ax, bits);
    }
  }
  list() { return [...this.devices.values()]; }
}

/** Candidate B: custom BLE GATT service via Web Bluetooth (Chrome/Edge desktop & Android). */
export class WebBluetoothController {
  device: ControllerDevice;
  private bt: any = null;
  private ledChar: any = null;
  private wantConnected = false;
  private retry = 0;
  constructor(private slot: number, input: InputManager) {
    this.device = new ControllerDevice(`ble-${slot}`, `BLE controller ${slot + 1}`, 'ble');
    input.add(this.device);
  }
  static supported() { return typeof navigator !== 'undefined' && 'bluetooth' in navigator; }

  /** Must be called from a user gesture (button press). */
  async pair() {
    if (!WebBluetoothController.supported()) throw new Error('Web Bluetooth is not available in this browser.');
    this.bt = await (navigator as any).bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE_UUID] }] });
    this.bt.addEventListener('gattserverdisconnected', () => this.onDisconnect());
    this.wantConnected = true;
    await this.connect();
  }
  private async connect() {
    const server = await this.bt.gatt.connect();
    const svc = await server.getPrimaryService(BLE_SERVICE_UUID);
    const ch = await svc.getCharacteristic(BLE_REPORT_CHAR_UUID);
    ch.addEventListener('characteristicvaluechanged', (e: any) => {
      const r = decodeReport(e.target.value as DataView);
      if ('error' in r) this.device.reportError(r.error); else this.device.ingest(r);
    });
    await ch.startNotifications();
    try { this.ledChar = await svc.getCharacteristic(BLE_LED_CHAR_UUID); } catch { this.ledChar = null; }
    this.retry = 0; this.device.label = `BLE controller ${this.slot + 1}: ${this.bt.name ?? 'unnamed'}`;
  }
  private onDisconnect() {
    this.device.connected = false;
    if (!this.wantConnected) return;
    const delay = Math.min(8000, 500 * 2 ** this.retry++);
    setTimeout(() => this.connect().catch(err => { this.device.reportError(String(err)); this.onDisconnect(); }), delay);
  }
  disconnect() { this.wantConnected = false; this.bt?.gatt?.disconnect(); }
  /** Optional diagnostics only — not gameplay. */
  async setLeds(mask: number) { if (this.ledChar) await this.ledChar.writeValueWithoutResponse(new Uint8Array([mask & 0x0f])); }
}
