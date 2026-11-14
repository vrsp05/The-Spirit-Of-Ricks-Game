# Controller protocol (draft v1)

**Status:** transport not selected (team decision #14). Code: `src/input/controllerProtocol.ts` (report format, calibration, health) and `src/input/transports.ts` (Gamepad API and Web Bluetooth adapters). Keep this file and the code in sync.

## Hardware assumptions
Each controller is an ESP32-WROOM with two joysticks (each with a click), four buttons and four diagnostic LEDs. Two identical controllers drive **one** player. USB-C is for flashing only.

## Option A — BLE HID gamepad (browser Gamepad API)
- The firmware presents itself as a standard HID gamepad (e.g. with an ESP32 BLE-gamepad library). The OS pairs it and the browser sees it through `navigator.getGamepads()`.
- Expected mapping: axes 0/1 = left stick, axes 2/3 = right stick. Button indices for bits 0..5 are configurable in `GAME_CONFIG.input.gamepadButtonIndices` (default `[0,1,2,3,10,11]`). Non-standard HID descriptors often report different indices; check them in the dev input view (`?dev=1`) and adjust.
- Pros: no browser pairing UI, works in Chrome, Edge, Firefox and Safari once the OS has paired the device.
- Cons: no in-browser LED control (diagnostic LEDs must be driven by firmware). The two controllers are told apart only by gamepad index.

## Option B — custom BLE GATT (Web Bluetooth)
- Chrome/Edge on desktop and Android only. **Safari and Firefox do not support Web Bluetooth.** Pairing needs a user click (Controllers menu → "Pair BLE controller N").
- Placeholder UUIDs are owned by the hardware teammate. Change them in both the firmware and `controllerProtocol.ts`:
  - Service `e5b9c3ee-259e-403e-8cd9-c18c3cc5f6a7`
  - Report characteristic (notify) `2590e78d-7a0b-40d1-95dd-21d1e2e31d00`
  - LED characteristic (write without response, optional) `2c391e0d-2cc7-483d-884c-a49265c21ad0`

### Report (14 bytes, little-endian)
| Offset | Type | Field | Notes |
|---|---|---|---|
| 0 | u8 | version | `1` |
| 1 | u8 | controllerId | 0 or 1 (set in firmware) |
| 2 | u16 | seq | +1 per report, wraps at 65535; used to count drops |
| 4 | i16 | lx | −32767…32767, + = right |
| 6 | i16 | ly | + = stick pushed forward (away from player) |
| 8 | i16 | rx | |
| 10 | i16 | ry | |
| 12 | u8 | buttons | bit0 B1, bit1 B2, bit2 B3, bit3 B4, bit4 left click, bit5 right click |
| 13 | u8 | flags | bit0 low battery (optional); others 0 |

- **Cadence:** notify at 50 Hz while any input changes, plus a heartbeat of at least 5 Hz when idle.
- **Health:** no report for 1 s marks the controller *stale*; its input is treated as neutral and the other controller and keyboard keep working.
- **Errors:** wrong version or a short packet is counted and ignored.
- **Reconnect:** on disconnect the browser retries with exponential backoff (0.5 s → 8 s) as long as the user hasn't disconnected.
- **Calibration and dead zone:** firmware sends raw centred values. The game subtracts the centre captured by "Calibrate" and applies `GAME_CONFIG.input.deadZone` (0.15).
- **LED byte (optional, diagnostics only, not gameplay):** bits 0–3 = LEDs 1–4.

## Action mapping (both options)
| Input | Action |
|---|---|
| Left stick | move (and menu navigation) |
| Left click | run toggle |
| Right stick | orbit camera |
| Right click | reset camera |
| B1 | interact / confirm |
| B2 | back |
| B3 | map / objective |
| B4 | pause |

Configure this in `GAME_CONFIG.input.controllerButtons`.

### Inside minigames (4 buttons + 2 sticks only)
| Input | Keyboard | Minigame action |
|---|---|---|
| Left stick | WASD / arrows | move cursor / focus |
| Right stick ← → | F / R | cycle (colour, piece, wire direction) |
| Right stick ↑ ↓ | T / G | secondary (mirror, rotate, test) |
| B1 | E / Enter | do it (paint, place, select, flip) |
| B2 | Esc / Backspace | erase / cancel / leave |
| B3 | H | hint |
| B4 | Tab | tools bar (check, undo, reset, skip, leave) |

Stick clicks are not needed in any minigame. Every minigame shows this legend at the bottom. **Merging:** for each axis the largest deflection wins; any controller can press a button.

## Testing without hardware
Open `?dev=1` and use **Toggle mock 1/2** to show on-screen controllers. They encode real v1 reports and decode them through the same path as BLE. **Toggle input view** shows raw axes and buttons, connection state, packet age and drop counts.

## Firmware notes for the hardware owner (not yet verified on hardware)
- Read joysticks on **ADC1** pins only; ADC2 is unavailable while the radio is active. Power the joystick potentiometers from 3.3 V, never 5 V.
- Debounce buttons (about 5–10 ms) and use internal pull-ups.
- A reference sketch will be written **after** the transport is chosen. Pins must be verified against the exact board.

## Nintendo Switch Joy-Cons
Code: `src/input/joycon.ts` (mapping, tested in `tests/joycon.test.ts`), wired up in `GamepadHub`. Any Joy-Con works (the OLED Switch ships standard Joy-Cons). Pair over Bluetooth: hold the sync button on the rail until the lights run, then pick "Joy-Con (L)/(R)" in the OS Bluetooth settings.
- Chrome / Edge / Safari report a "standard" mapping. Both Joy-Cons connected appear as one "Joy-Con L+R" pad (upright, two sticks); a single Joy-Con appears held sideways (one stick).
- Firefox reports raw HID buttons; a single Joy-Con held sideways is supported best-effort (stick from the hat switch).
- Layout (by button label; browsers report Joy-Con A as index 0, B as 1): A = action/use (E) and confirm, B = back + jump, + or − = menu (pause; tools bar in minigames), X/Y = map (hint in minigames), left stick = move, right stick = camera, ZR/R = sprint (hold), D-pad = menus. A single sideways Joy-Con: SL/SR turn the camera.
