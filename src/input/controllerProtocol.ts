// Shared controller model + the CANDIDATE custom-BLE report format.
// Spec: docs/controller-protocol.md (keep both in sync). Transport is NOT
// selected yet; Gamepad API (BLE HID) and custom BLE both end in ControllerDevice.
import { GAME_CONFIG } from '../config/game.config';
import type { ButtonName, InputSource, SourceFrame, SourceStatus } from './actions';

// Placeholder UUIDs — owned by the hardware teammate; change here + in firmware together.
export const BLE_SERVICE_UUID = 'e5b9c3ee-259e-403e-8cd9-c18c3cc5f6a7';
export const BLE_REPORT_CHAR_UUID = '2590e78d-7a0b-40d1-95dd-21d1e2e31d00';
export const BLE_LED_CHAR_UUID = '2c391e0d-2cc7-483d-884c-a49265c21ad0';
export const PROTOCOL_VERSION = 1;
export const REPORT_BYTES = 14;
export const STALE_MS = 1000;

export interface ControllerReport {
  version: number; controllerId: number; seq: number;
  lx: number; ly: number; rx: number; ry: number; // int16, -32767..32767, +y = stick pushed forward
  buttons: number;  // bit0..3 = buttons 1-4, bit4 = left stick click, bit5 = right stick click
  flags: number;    // bit0 = low battery (optional)
}

/** Little-endian 14-byte report. */
export function encodeReport(r: ControllerReport): ArrayBuffer {
  const b = new ArrayBuffer(REPORT_BYTES), v = new DataView(b);
  v.setUint8(0, r.version); v.setUint8(1, r.controllerId); v.setUint16(2, r.seq & 0xffff, true);
  v.setInt16(4, r.lx, true); v.setInt16(6, r.ly, true); v.setInt16(8, r.rx, true); v.setInt16(10, r.ry, true);
  v.setUint8(12, r.buttons); v.setUint8(13, r.flags);
  return b;
}
export function decodeReport(v: DataView): ControllerReport | { error: string } {
  if (v.byteLength < REPORT_BYTES) return { error: `short report (${v.byteLength} bytes)` };
  const version = v.getUint8(0);
  if (version !== PROTOCOL_VERSION) return { error: `unsupported version ${version}` };
  return {
    version, controllerId: v.getUint8(1), seq: v.getUint16(2, true),
    lx: v.getInt16(4, true), ly: v.getInt16(6, true), rx: v.getInt16(8, true), ry: v.getInt16(10, true),
    buttons: v.getUint8(12), flags: v.getUint8(13),
  };
}

const norm = (i: number) => Math.max(-1, Math.min(1, i / 32767));

/** One physical (or mock) controller: calibration, dead zone, health. */
export class ControllerDevice implements InputSource {
  axes = [0, 0, 0, 0];              // calibrated lx, ly, rx, ry
  rawAxes = [0, 0, 0, 0];
  buttons = 0;
  center = [0, 0, 0, 0];
  connected = false;
  lastSeen = 0;
  lastSeq = -1;
  droppedPackets = 0;
  errors = 0;
  lastError = '';
  constructor(public id: string, public label: string, public kind: string) {}

  ingest(r: ControllerReport) {
    if (this.lastSeq >= 0) { const gap = (r.seq - this.lastSeq - 1 + 0x10000) & 0xffff; if (gap > 0 && gap < 1000) this.droppedPackets += gap; }
    this.lastSeq = r.seq;
    this.rawAxes = [norm(r.lx), norm(r.ly), norm(r.rx), norm(r.ry)];
    this.buttons = r.buttons; this.lastSeen = performance.now(); this.connected = true;
    this.applyCalibration();
  }
  ingestNormalized(axes: number[], buttons: number) {
    this.rawAxes = axes.slice(0, 4); this.buttons = buttons; this.lastSeen = performance.now(); this.connected = true;
    this.applyCalibration();
  }
  reportError(msg: string) { this.errors++; this.lastError = msg; }
  calibrate() { this.center = this.rawAxes.slice(); this.applyCalibration(); }
  private applyCalibration() {
    const dz = GAME_CONFIG.input.deadZone;
    this.axes = this.rawAxes.map((v, i) => {
      const c = v - this.center[i]; const m = Math.abs(c);
      return m < dz ? 0 : Math.sign(c) * Math.min(1, (m - dz) / (1 - dz));
    });
  }
  get stale() { return !this.connected || performance.now() - this.lastSeen > STALE_MS; }

  poll(f: SourceFrame) {
    if (this.stale) return; // stale = neutral; another controller or keyboard keeps working
    const [lx, ly, rx, ry] = this.axes;
    if (lx) f.axes.moveX = lx; if (ly) f.axes.moveY = ly;
    if (rx) f.axes.lookX = -rx; if (ry) f.axes.lookY = ry;
    for (let bit = 0; bit < 6; bit++) {
      if (this.buttons & (1 << bit)) {
        const action = GAME_CONFIG.input.controllerButtons[bit];
        if (action) for (const a of Array.isArray(action) ? action : [action]) f.buttons.add(a as ButtonName);
      }
    }
  }
  status(): SourceStatus {
    const age = this.lastSeen ? performance.now() - this.lastSeen : undefined;
    return { id: this.id, label: this.label, kind: this.kind, connected: this.connected && !this.stale,
      detail: this.connected ? (this.stale ? 'no data (stale)' : `dropped ${this.droppedPackets}, errors ${this.errors}`) : 'not connected', lastSeenMs: age };
  }
  raw() { return { axes: this.rawAxes.slice(), buttons: [0, 1, 2, 3, 4, 5].map(b => !!(this.buttons & (1 << b))) }; }
}
