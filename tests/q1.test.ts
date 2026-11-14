import { describe, expect, it } from 'vitest';
import { MATH, bits, coin, comboValue, fewestCoins, parseCombo, questionsFor } from '../src/quests/q1/math';
import { ART as ART_DATA, guessIndex } from '../src/quests/q1/art';
import { CLASSROOM } from '../src/quests/q1/classroom';
import { GAME_CONFIG } from '../src/config/game.config';
import { ART, floodFill, refGrid, scoreDrawing, type Grid } from '../src/quests/q1/art';
import { CIRCUIT, parseLevel, scramble, simulate, sides, stepsToSolved, testBoard } from '../src/quests/q1/circuit';
import { ENGLISH, layoutLines, preparePassage, sentenceOf } from '../src/quests/q1/english';

const V = (name: string) => MATH.reference.find(r => r.gold === name || r.silver === name)!.value;

describe('math (Binary, the Nephite way — Alma 11 gold coins)', () => {
  it('reference table matches Alma 11:5–19', () => {
    expect([V('senine'), V('senum'), V('seon'), V('amnor'), V('shum'), V('ezrom'), V('limnah'), V('onti')]).toEqual([1, 1, 2, 2, 4, 4, 7, 7]);
    expect(V('limnah')).toBe(V('senine') + V('seon') + V('shum'));
  });
  it('coin values come from the reference card; the tray is gold only', () => {
    for (const c of MATH.coins) expect(c.value, c.id).toBe(V(c.id));
    expect(MATH.tray).toEqual(['senine', 'seon', 'shum', 'limnah']);
    expect(MATH.tray.every(id => coin(id).metal === 'gold')).toBe(true);
  });
  it('every pay answer is the fewest-coin combination and adds up', () => {
    for (const q of MATH.questions.filter(q => q.kind === 'pay')) {
      const ids = parseCombo(q.correct);
      expect(comboValue(ids), q.id).toBe(q.target);
      expect(ids.length, q.id).toBe(fewestCoins(q.target!, MATH.tray)!.length);
      if (q.bits && q.target! <= 7 && q.id !== 'pay7') expect(q.bits, q.id).toEqual(bits(ids));
      if (q.bits && q.target! > 7) expect(q.bits[0] * 4 + q.bits[1] * 2 + q.bits[2] + 7, q.id).toBe(q.target);
      expect(q.options, q.id).toContain(q.correct); expect(new Set(q.options).size).toBe(q.options.length);
    }
  });
  it('binary digits: 5 = 101, 6 = 110, 3 = 011, limnah = 111', () => {
    expect(bits(['shum', 'senine'])).toEqual([1, 0, 1]);
    expect(bits(['shum', 'seon'])).toEqual([1, 1, 0]);
    expect(bits(['seon', 'senine'])).toEqual([0, 1, 1]);
    expect(bits(['shum', 'seon', 'senine'])).toEqual([1, 1, 1]); expect(comboValue(['shum', 'seon', 'senine'])).toBe(V('limnah'));
  });
  it('Zeezrom finale: six onties = 42 days of a judge’s pay (Alma 11:3, 22)', () => {
    const z = MATH.questions.find(q => q.id === 'zeezrom')!;
    expect(Number(z.correct)).toBe(6 * V('onti'));
    expect(questionsFor('easy').at(-1)!.id).toBe('zeezrom'); expect(questionsFor('hard').at(-1)!.id).toBe('zeezrom');
  });
  it('modes: Easy 5 multiple-choice questions (2 misses), Hard adds pay 9 and 13 with the tray (1 miss)', () => {
    expect(questionsFor('easy')).toHaveLength(5); expect(MATH.modes.easy.tray).toBe(false); expect(MATH.modes.easy.misses).toBe(2);
    expect(questionsFor('hard').map(q => q.id)).toEqual(expect.arrayContaining(['pay9', 'pay13'])); expect(MATH.modes.hard.tray).toBe(true); expect(MATH.modes.hard.misses).toBe(1);
  });
  it('fewest-coin DP finds the optimum', () => {
    expect(fewestCoins(7, MATH.tray)).toEqual(['limnah']);
    expect(fewestCoins(13, MATH.tray)!.length).toBe(3);
    expect(fewestCoins(0.1, ['senine'])).toBeNull();
  });
});

describe('quest flow config', () => {
  const cands = GAME_CONFIG.quests.professors.candidates as { id: string; anchor: string; lobby: string; building: string; requires?: string }[];
  it('engineering requires art (it repairs the art studio projector)', () => {
    expect(cands.find(c => c.id === 'engineering')!.requires).toBe('art');
    expect(cands.filter(c => c.requires).map(c => c.id)).toEqual(['engineering']);
  });
  it('every candidate has a Kimball lobby anchor and a demo door anchor', () => {
    const L = GAME_CONFIG.locations as Record<string, { space?: string; building?: string }>;
    for (const c of cands) { expect(L[c.lobby]?.space, c.id).toBe('kimball-office'); expect(L[c.anchor]?.building, c.id).toBeTruthy(); }
  });
  it('English demonstrates in the Smith Building', () => {
    const e = cands.find(c => c.id === 'english')!;
    expect(e.building).toBe('Smith Building'); expect((GAME_CONFIG.locations as Record<string, { building?: string }>)[e.anchor].building).toBe('smith');
  });
  it('every candidate has a classroom with a Hard follow-up whose answer is an option', () => {
    for (const c of cands) { const r = CLASSROOM.rooms[c.id]; expect(r, c.id).toBeTruthy(); expect(r.followUp.options).toContain(r.followUp.correct); }
  });
  it('every walk-in sets up the demo: the chair asks the candidate, and the candidate frames the lesson', () => {
    for (const c of cands) { const i = CLASSROOM.rooms[c.id].intro; expect(i.chair, c.id).toMatch(/\{name\}.*\?/); expect(i.frame.length, c.id).toBeGreaterThan(20); }
  });
  it('nothing in Q1 data names BYU–Idaho (Fall 1999)', async () => {
    const fs = await import('node:fs');
    for (const f of fs.readdirSync('src/quests/q1/data')) expect(fs.readFileSync(`src/quests/q1/data/${f}`, 'utf8'), f).not.toMatch(/BYU|Brigham Young University/);
  });
});

describe('art scoring', () => {
  const blank = (): Grid => Array.from({ length: ART.canvas.height }, () => Array(ART.canvas.width).fill(null));
  const ref = refGrid();
  const paint = (ox: number, oy: number) => { const c = blank(); ref.forEach((r, y) => r.forEach((v, x) => { if (v) c[y + oy][x + ox] = v; })); return c; };
  it('perfect copy scores 1 at any offset', () => {
    for (const [ox, oy] of [[0, 0], [2, 1], [ART.canvas.width - ref[0].length, ART.canvas.height - ref.length]]) { const s = scoreDrawing(paint(ox, oy), ref); expect(s.score).toBeCloseTo(1); expect([s.ox, s.oy]).toEqual([ox, oy]); }
  });
  it('empty canvas scores 0; wrong colours and extra paint lower the score', () => {
    expect(scoreDrawing(blank(), ref).score).toBe(0);
    const c = paint(2, 2); c[0][0] = 'g'; c[ART.canvas.height - 1][ART.canvas.width - 1] = 'w';
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
  it('the projector always shorts out — later on Easy than on Hard — and stays dead', () => {
    expect(ART_DATA.modes.easy.shortAtSeconds).toBeGreaterThan(ART_DATA.modes.hard.shortAtSeconds!);
    expect(ART_DATA.modes.hard.shortAtSeconds).toBeGreaterThan(0);
    expect(guessIndex(0)).toBe(-1); expect(guessIndex(1)).toBe(ART_DATA.guesses.length - 1);
    for (let i = 1; i < ART_DATA.guesses.length; i++) expect(ART_DATA.guesses[i].at).toBeGreaterThan(ART_DATA.guesses[i - 1].at);
  });
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
  it('Easy plays 3 circuits, Hard 5 (ending with Find the short)', () => { expect(CIRCUIT.modes.easy.levels).toHaveLength(3); expect(CIRCUIT.modes.hard.levels).toHaveLength(5); expect(CIRCUIT.modes.hard.levels.at(-1)).toBe('find-short'); });
  it('Find the short starts shorted and is fixed by turning the bridging wire back', () => {
    const l = lvl('find-short'), b = parseLevel(l); const [x, y, r] = (l as unknown as { startShort: [number, number, number] }).startShort;
    b.tiles[y][x].rot = r; expect(simulate(b, {}).short).toBe(true); expect(testBoard(l, b).pass).toBe(false);
    b.tiles[y][x].rot = 0; expect(simulate(b, {}).short).toBe(false); expect(testBoard(l, b).pass).toBe(true);
  });
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
  it('the corrected passage contains the verified Kimball dedication facts (Church News 1999)', () => {
    for (const diff of ['easy', 'hard']) {
      const { tokens, errorAt } = preparePassage(diff); for (const [i, e] of errorAt) tokens[i] = e.correct;
      const text = tokens.join(' ');
      expect(text).toContain('September 7, 1999'); expect(text).toContain('Rexburg, Idaho'); expect(text).toContain('Spencer W. Kimball Building');
      expect(text).toContain('named for President Kimball'); expect(text).toContain('Gordon B. Hinckley dedicated'); expect(text).toContain('Ricks College');
    }
  });
  it('wrong-mark allowance: Easy unlimited, Hard 2', () => { expect(ENGLISH.modes.easy.wrongAllowance).toBe(-1); expect(ENGLISH.modes.hard.wrongAllowance).toBe(2); });
  it('the whole page wraps into lines that fit and keep every word in order', () => {
    const { tokens } = preparePassage('hard');
    const lines = layoutLines(tokens, t => t.length * 10, 400, 10);
    expect(lines.flat()).toEqual(tokens.map((_, i) => i));
    for (const l of lines) expect(l.reduce((w, i, k) => w + tokens[i].length * 10 + (k ? 10 : 0), 0)).toBeLessThanOrEqual(400);
    const s = sentenceOf(tokens); expect(s[0]).toBe(0); expect(Math.max(...s)).toBeGreaterThanOrEqual(2);
  });
});

describe('art subjects', () => {
  it('templates are rectangular, symmetric grids in palette colours that fit the canvas (the temple is small: 9 × 10)', () => {
    const ids = new Set(ART_DATA.palette.map(p => p.id));
    for (const [k, rows] of Object.entries(ART_DATA.references!)) {
      for (const r of rows) { expect(r, k).toHaveLength(rows[0].length); expect([...r].every(c => c === '.' || ids.has(c)), k).toBe(true); }
    }
    const t = ART_DATA.references!.temple;
    expect([t[0].length, t.length]).toEqual([9, 10]);
    expect(t.every(r => r === [...r].reverse().join(''))).toBe(true);
    expect(t[0].length).toBeLessThanOrEqual(ART.canvas.width); expect(t.length).toBeLessThanOrEqual(ART.canvas.height);
    expect(ART_DATA.references!.tabernacle.every(r => r === [...r].reverse().join(''))).toBe(true);
  });
});

describe('math tutorial', () => {
  it('walks through Pay 5 with the fewest coins, coin by coin, ending at 101', () => {
    const t = MATH.tutorial, ids = t.steps.map(s => s.coin);
    expect(comboValue(ids)).toBe(t.target);
    expect(ids.length).toBe(fewestCoins(t.target, MATH.tray)!.length);
    expect(bits(ids)).toEqual([1, 0, 1]);
    expect(questionsFor('easy').some(q => q.target === t.target && q.kind === 'pay')).toBe(false);
  });
});

describe('art music', () => {
  it('points at the team recording in public/audio (silent until the file is added)', () => {
    expect(ART_DATA.music!.src).toMatch(/^music\/.+\.(mp3|ogg|m4a|wav)$/); expect(ART_DATA.music!.enabled).toBe(false); // the background playlist covers it
  });
});
