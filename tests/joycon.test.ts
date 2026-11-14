import { describe, expect, it } from 'vitest';
import { joyConKind, readJoyCon } from '../src/input/joycon';

const pad = (id: string, mapping: string, pressed: number[] = [], axes: number[] = [0, 0, 0, 0]) =>
  ({ id, mapping, axes, buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i) })) });

describe('Joy-Con', () => {
  it('recognises Joy-Cons by name and product id, and ignores other pads', () => {
    expect(joyConKind({ id: 'Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)' })).toBe('pair');
    expect(joyConKind({ id: 'Joy-Con (L) (STANDARD GAMEPAD Vendor: 057e Product: 2006)' })).toBe('left');
    expect(joyConKind({ id: 'Joy-Con (R) (STANDARD GAMEPAD Vendor: 057e Product: 2007)' })).toBe('right');
    expect(joyConKind({ id: '57e-2006-Joy-Con (L)' })).toBe('left');
    expect(joyConKind({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)' })).toBeNull();
    expect(joyConKind({ id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)' })).toBeNull();
  });
  it('pair (standard mapping): Nintendo layout, two sticks', () => {
    const r = readJoyCon(pad('Joy-Con L+R', 'standard', [0, 7, 9], [0.5, -1, 0.2, 0.3]), 'pair');
    expect([...r.buttons].sort()).toEqual(['alt', 'interact', 'pause', 'run']);   // A = action, + = menu
    expect(r.axes).toEqual([0.5, 1, 0.2, -0.3]);
    expect([...readJoyCon(pad('x', 'standard', [1]), 'pair').buttons].sort()).toEqual(['back', 'jump']);
    expect([...readJoyCon(pad('x', 'standard', [8]), 'pair').buttons]).toEqual(['pause']);   // − = menu too
    expect([...readJoyCon(pad('x', 'standard', [2, 12]), 'pair').buttons].sort()).toEqual(['map', 'navUp']);
  });
  it('single Joy-Con sideways: stick moves, SL/SR turn the camera', () => {
    const r = readJoyCon(pad('Joy-Con (R)', 'standard', [5], [0, -0.8]), 'right');
    expect(r.axes).toEqual([0, 0.8, 1, 0]);
  });
  it('raw Firefox mapping: sideways face buttons and the hat as a stick', () => {
    expect([...readJoyCon(pad('57e-2007-Joy-Con (R)', '', [0]), 'right').buttons]).toEqual(['interact']);   // A = action
    expect([...readJoyCon(pad('57e-2006-Joy-Con (L)', '', [2]), 'left').buttons]).toEqual(['interact']);    // ↑ sits where A would
    const up = readJoyCon(pad('57e-2006-Joy-Con (L)', '', [], [0, 0, 0, -1]), 'left');
    expect(up.axes[1]).toBeCloseTo(1); expect(up.axes[0]).toBeCloseTo(0);
    const centred = readJoyCon(pad('57e-2006-Joy-Con (L)', '', [], [0, 0, 0, 1.29]), 'left');
    expect(centred.axes.slice(0, 2)).toEqual([0, 0]);
  });
});
