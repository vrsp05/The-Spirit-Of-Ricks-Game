import { describe, expect, it } from 'vitest';
import { MATH, coin, fewestCoins, makeRound, units } from '../src/quests/q1/math';
import { ART, floodFill, refGrid, scoreDrawing, type Grid } from '../src/quests/q1/art';
import { CIRCUIT, parseLevel, scramble, simulate, sides, stepsToSolved, testBoard } from '../src/quests/q1/circuit';
import { ENGLISH, preparePassage } from '../src/quests/q1/english';

const V = (name: string) => MATH.reference.find(r => r.gold === name || r.silver === name)!.value;

describe('math (Nephite Market, Alma 11)', () => {
  it('reference table matches Alma 11:5–19', () => {
    expect([V('senine'), V('senum'), V('seon'), V('amnor'), V('shum'), V('ezrom'), V('limnah'), V('onti')]).toEqual([1, 1, 2, 2, 4, 4, 7, 7]);
    expect(V('limnah')).toBe(V('senine') + V('seon') + V('shum'));
    expect([V('shiblon'), V('shiblum'), V('leah'), V('antion')]).toEqual([0.5, 0.25, 0.125, 1.5]);
  });
  it('tray coin values come from the reference card', () => {
    for (const c of MATH.coins) expect(c.value, c.id).toBe(V(c.id));
  });
  it('every order is payable with its tray, and change orders add up', () => {
    for (const o of MATH.orders) {
      expect(fewestCoins(o.target, o.coins), o.id).not.toBeNull();
      if (o.paidWith) expect(units(coin(o.paidWith).value) - units(o.price!), o.id).toBe(units(o.target));
      for (const id of o.coins) expect(coin(id), id).toBeTruthy();
    }
  });
  it('fewest-coin DP finds the optimum', () => {
    expect(fewestCoins(7, ['senine', 'seon', 'shum', 'limnah'])).toEqual(['limnah']);
    expect(fewestCoins(3.5, ['senine', 'seon', 'antion'])!.length).toBe(2);
    expect(fewestCoins(4.125, ['senum', 'amnor', 'ezrom', 'leah'])!.length).toBe(2);
    expect(fewestCoins(1.25, ['senum', 'shiblon', 'shiblum', 'leah'])!.length).toBe(2);
    expect(fewestCoins(0.1, ['senum'])).toBeNull();
  });
  it('rounds: Easy 5 basic customers (pass 3), Hard 6 with ≥3 advanced (pass 5)', () => {
    const e = makeRound('easy'); expect(e).toHaveLength(5); expect(e.every(o => o.tier === 'basic')).toBe(true); expect(MATH.modes.easy.pass).toBe(3);
    const h = makeRound('hard'); expect(h).toHaveLength(6); expect(h.filter(o => o.tier === 'advanced').length).toBeGreaterThanOrEqual(3); expect(MATH.modes.hard.pass).toBe(5);
    expect(new Set(h.map(o => o.id)).size).toBe(6);
    expect(MATH.modes.hard.patience).toBeLessThan(MATH.modes.easy.patience);
  });
});

describe('art scoring', () => {
  const blank = (): Grid => Array.from({ length: ART.canvas.height }, () => Array(ART.canvas.width).fill(null));
  const ref = refGrid();
  const paint = (ox: number, oy: number) => { const c = blank(); ref.forEach((r, y) => r.forEach((v, x) => { if (v) c[y + oy][x + ox] = v; })); return c; };
  it('perfect copy scores 1 at any offset', () => {
    for (const [ox, oy] of [[0, 0], [3, 4], [8, 8]]) { const s = scoreDrawing(paint(ox, oy), ref); expect(s.score).toBeCloseTo(1); expect([s.ox, s.oy]).toEqual([ox, oy]); }
  });
  it('empty canvas scores 0; wrong colours and extra paint lower the score', () => {
    expect(scoreDrawing(blank(), ref).score).toBe(0);
    const c = paint(2, 2); c[0][0] = 'g'; c[23][19] = 'w';
    expect(scoreDrawing(c, ref).score).toBeLessThan(1);
    const recolor = paint(2, 2).map(r => r.map(v => (v ? 'b' : v)));
    expect(scoreDrawing(recolor, ref).score).toBeLessThan(0.3);
  });
  it('flood fill fills one 4-connected region only', () => {
    const g = blank(); for (let y = 0; y < ART.canvas.height; y++) g[y][5] = 'w';   // wall splits the canvas
    expect(floodFill(g, 0, 0, 'b')).toBe(5 * ART.canvas.height);
    expect(g[0][6]).toBe(null); expect(floodFill(g, 0, 0, 'b')).toBe(0);
  });
  it('thresholds are 60% (Easy) and 85% (Hard)', () => { expect(ART.modes.easy.pass).toBe(0.6); expect(ART.modes.hard.pass).toBe(0.85); });
});

describe('circuit (Light the Temple)', () => {
  const lvl = (id: string) => CIRCUIT.levels.find(l => l.id === id)!;
  it('every level is solved in its data orientation, for every switch state', () => {
    for (const l of CIRCUIT.levels) expect(testBoard(l, parseLevel(l)).pass, l.id).toBe(true);
  });
  it('scrambling never leaves a level solved, and rotating back solves it', () => {
    for (const l of CIRCUIT.levels) for (let k = 0; k < 20; k++) {
      const b = parseLevel(l); scramble(b, l, 1);
      expect(testBoard(l, b).pass, l.id).toBe(false);
      for (const row of b.tiles) for (const t of row) t.rot = 0;
      expect(testBoard(l, b).pass).toBe(true);
    }
  });
  it('stepsToSolved respects tile symmetry', () => {
    const b = parseLevel(lvl('one-bulb')); const straight = b.tiles[0][1];       // 'WE'
    straight.rot = 2; expect(stepsToSolved(straight)).toBe(0);
    straight.rot = 1; expect(stepsToSolved(straight)).toBe(1);
    const corner = b.tiles[0][0]; corner.rot = 2; expect(stepsToSolved(corner)).toBe(2); corner.rot = 3; expect(stepsToSolved(corner)).toBe(1);
  });
  it('a broken loop leaves the bulb off; a direct wire is a short', () => {
    const l = lvl('one-bulb'), b = parseLevel(l);
    b.tiles[0][1].rot = 1; expect(simulate(b, {}).bulbs.L.brightness).toBe('off');
    // short: battery + straight down to − through column 0 (replace the battery tile neighbours)
    const s = parseLevel({ ...l, rows: ['ES WS', 'B+N NS', 'NE WN'], labels: {} });
    expect(simulate(s, {}).short).toBe(true);
  });
  it('series bulbs are dim and parallel bulbs bright', () => {
    const sp = simulate(parseLevel(lvl('spire')), {});
    expect(sp.bulbs.S1.brightness).toBe('dim'); expect(sp.bulbs.S2.brightness).toBe('dim'); expect(sp.bulbs.W.brightness).toBe('bright');
    const par = simulate(parseLevel(lvl('two-parallel')), {});
    expect(par.bulbs.A.brightness).toBe('bright'); expect(par.bulbs.B.brightness).toBe('bright');
  });
  it('the switch controls only the door light', () => {
    const b = parseLevel(lvl('switch-one'));
    expect(simulate(b, { SW: false }).bulbs.D.brightness).toBe('off'); expect(simulate(b, { SW: true }).bulbs.D.brightness).toBe('bright');
    expect(simulate(b, { SW: false }).bulbs.A.brightness).toBe('bright');
  });
  it('live wires are reported for drawing', () => {
    const b = parseLevel(lvl('one-bulb')); const live = simulate(b, {}).live;
    expect(live.has('0,0')).toBe(true); expect(live.has('1,1')).toBe(false);   // decoy carries nothing
    expect(sides(b.tiles[1][0])).toEqual([0, 2]);
  });
  it('Easy plays 3 circuits, Hard 4', () => { expect(CIRCUIT.modes.easy.levels).toHaveLength(3); expect(CIRCUIT.modes.hard.levels).toHaveLength(4); });
});

describe('english answer keys', () => {
  it('every planted error exists, has 3 options and includes the correct one', () => {
    for (const diff of ['easy', 'hard']) {
      const { errorAt } = preparePassage(diff);
      const p = ENGLISH.passages[diff];
      expect(errorAt.size).toBe(p.errors.length); expect(p.errors.length).toBeGreaterThanOrEqual(3); expect(p.errors.length).toBeLessThanOrEqual(6);
      for (const e of p.errors) { expect(e.options).toHaveLength(3); expect(e.options).toContain(e.correct); expect(e.correct).not.toBe(e.word); }
    }
  });
  it('the corrected passage contains the verified facts', () => {
    for (const diff of ['easy', 'hard']) {
      const { tokens, errorAt } = preparePassage(diff); for (const [i, e] of errorAt) tokens[i] = e.correct;
      const text = tokens.join(' ');
      expect(text).toContain('June 21, 2000'); expect(text).toContain('Rexburg, Idaho'); expect(text).toContain('four-year');
      if (diff === 'hard') expect(text).toContain('Brigham Young University–Idaho');
    }
  });
  it('wrong-stamp allowance: Easy unlimited, Hard 2; Hard press is faster', () => { expect(ENGLISH.modes.easy.wrongAllowance).toBe(-1); expect(ENGLISH.modes.hard.wrongAllowance).toBe(2); expect(ENGLISH.modes.hard.speed).toBeGreaterThan(ENGLISH.modes.easy.speed); });
});
