// Nintendo Switch Joy-Cons (any model — the OLED Switch ships the same Joy-Cons) via the Gamepad API.
// Pair them with the computer over Bluetooth (hold the small sync button on the rail until the lights
// run). How they show up depends on the browser:
// - Chrome / Edge / Safari: "standard" mapping. Both Joy-Cons together appear as one "Joy-Con L+R"
//   pad (held upright, two sticks); a single Joy-Con appears held sideways (one stick, SL/SR on top).
// - Firefox: raw HID buttons (mapping ""), single Joy-Cons only; handled best-effort, held sideways.
// Layout (by the label on the button, tested on real Joy-Cons):
//   A = action / use (E: talk, doors, carts, balls; confirm in menus)   B = back + jump
//   + or − = menu (pause; the tools bar in minigames)   X / Y = map (hint in minigames)
//   left stick = move, right stick = camera, ZR/R = sprint (hold), D-pad = menu navigation.
//   One Joy-Con sideways: its stick moves, SL/SR turn the camera.
import type { ButtonName } from './actions';

export type JoyConKind = 'pair' | 'left' | 'right';
export interface JoyConFrame { axes: [number, number, number, number]; buttons: Set<ButtonName> } // lx, ly(+fwd), rx, ry(+up)

interface PadLike { id: string; mapping: string; axes: readonly number[]; buttons: readonly { pressed: boolean }[] }

/** Is this gamepad a Joy-Con (or the charging grip / L+R pair)? Nintendo vendor 057e, products 2006/2007/200e. */
export function joyConKind(gp: { id: string }): JoyConKind | null {
  const id = gp.id.toLowerCase();
  const nintendo = id.includes('joy-con') || id.includes('joycon') || /057e/.test(id);
  if (!nintendo) return null;
  if (/l\s*\+\s*r|l\/r|200e|charging grip/.test(id)) return 'pair';
  if (/\(l\)|product: 2006|2006-/.test(id) || /joy-con \(l|joy-con l\b/.test(id)) return 'left';
  if (/\(r\)|product: 2007|2007-/.test(id) || /joy-con \(r|joy-con r\b/.test(id)) return 'right';
  return /2009|pro controller/.test(id) ? null : 'pair';   // unknown Nintendo pad: treat as a full controller
}

const ACT: Record<'A' | 'B' | 'X' | 'Y' | 'plus' | 'minus' | 'run' | 'reset' | 'l3', ButtonName[]> = {
  A: ['interact'], B: ['back', 'jump'], X: ['map'], Y: ['map'], plus: ['pause'], minus: ['pause'],
  run: ['run'], reset: ['cameraReset'], l3: ['runToggle'],
};

/** Read one Joy-Con gamepad into stick axes + game buttons. */
export function readJoyCon(gp: PadLike, kind: JoyConKind): JoyConFrame {
  const b = (i: number) => !!gp.buttons[i]?.pressed;
  const out: JoyConFrame = { axes: [0, 0, 0, 0], buttons: new Set() };
  const add = (k: keyof typeof ACT) => ACT[k].forEach(x => out.buttons.add(x));

  if (gp.mapping === 'standard') {
    // Joy-Cons come through by label: 0 = A, 1 = B, 2/3 = X/Y, 4 L 5 R 6 ZL 7 ZR 8 − 9 + 10 L3 11 R3 12-15 d-pad
    if (b(0)) add('A'); if (b(1)) add('B'); if (b(2)) add('X'); if (b(3)) add('Y');
    if (b(9)) add('plus'); if (b(8)) add('minus'); if (b(10)) add('l3');
    if (b(12)) out.buttons.add('navUp'); if (b(13)) out.buttons.add('navDown'); if (b(14)) out.buttons.add('navLeft'); if (b(15)) out.buttons.add('navRight');
    if (kind === 'pair') {
      out.axes = [gp.axes[0] ?? 0, -(gp.axes[1] ?? 0), gp.axes[2] ?? 0, -(gp.axes[3] ?? 0)];
      if (b(7) || b(5)) add('run'); if (b(11) || b(6)) add('reset');
    } else {
      // one Joy-Con held sideways: the browser already rotates the stick and face buttons; SL/SR = 4/5
      out.axes = [gp.axes[0] ?? 0, -(gp.axes[1] ?? 0), (b(5) ? 1 : 0) - (b(4) ? 1 : 0), 0];
      if (b(6) || b(7)) add('run');
    }
    return out;
  }

  // Raw HID (Firefox). Button bits of the Joy-Con's simple report:
  //   L: 0 ←  1 ↓  2 ↑  3 →  4 SL  5 SR  8 −  10 stick  14 L  15 ZL
  //   R: 0 A  1 X  2 B  3 Y  4 SL  5 SR  9 +  11 stick  14 R  15 ZR
  // Joy-Con (R) uses its labels; Joy-Con (L) held sideways uses positions (bottom / right / top / left):
  const [bottom, right, top, left] = kind === 'right' ? [2, 0, 1, 3] /* by label: A = action, B = back */ : [0, 2, 3, 1] /* ← ↑ → ↓ */;
  if (b(right)) add('A'); if (b(bottom)) add('B'); if (b(top)) add('X'); if (b(left)) add('Y');
  if (b(9)) add('plus'); if (b(8)) add('minus'); if (b(10) || b(11)) add('l3');
  if (b(14) || b(15)) add('run');
  // stick: analog axes if the browser gives them, otherwise the 8-way hat (last axis; -1..1 in 8 steps, >1 = centred)
  let x = gp.axes[0] ?? 0, y = 0 - (gp.axes[1] ?? 0);
  const hat = gp.axes.length > 2 ? gp.axes[gp.axes.length - 1] : 2;
  if (Math.abs(x) < 0.2 && Math.abs(y) < 0.2 && hat >= -1.05 && hat <= 1.05) {
    const a = Math.round((hat + 1) / (2 / 7)) * (Math.PI / 4);   // 0 = up, clockwise
    x = Math.sin(a); y = Math.cos(a);
  }
  out.axes = [x, y, (b(5) ? 1 : 0) - (b(4) ? 1 : 0), 0];
  return out;
}

