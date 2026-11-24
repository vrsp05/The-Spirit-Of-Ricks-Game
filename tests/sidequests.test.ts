import { describe, expect, it } from 'vitest';
import { makeTrivia } from '../src/sidequests/trivia';
import { PRESIDENTS } from '../src/world/presidents';
import { chatFor, GREETINGS, GREETINGS_KNOWN, JOIN_LINES } from '../src/world/npcChatter';
import { ERAS, ERA_ORDER } from '../src/world/eras';

const seeded = (n: number) => { let s = n; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

describe('campus trivia', () => {
  for (const era of ERA_ORDER) {
    const year = ERAS[era].year;
    it(`${era}: well-formed questions with one right answer`, () => {
      for (let seed = 1; seed < 40; seed++) {
        const qs = makeTrivia(year, 5, seeded(seed));
        expect(qs.length).toBe(5);
        expect(new Set(qs.map(q => q.q)).size).toBe(5);
        for (const q of qs) {
          expect(q.options).toHaveLength(4);
          expect(new Set(q.options).size).toBe(4);
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThan(4);
        }
      }
    });
  }
  it('never says BYU–Idaho before the present day', () => {
    for (const era of ERA_ORDER.filter(e => e !== 'presentFinale')) for (let seed = 1; seed < 60; seed++)
      for (const q of makeTrivia(ERAS[era].year, 5, seeded(seed))) expect(JSON.stringify(q)).not.toMatch(/BYU/);
  });
  it('only asks about leaders who had started by that year', () => {
    const later = PRESIDENTS.filter(p => p.from > 2000).map(p => p.name);
    for (let seed = 1; seed < 60; seed++) for (const q of makeTrivia(ERAS.ricks1999.year, 5, seeded(seed)))
      for (const n of later) expect(q.options).not.toContain(n);
  });
  it('"who was leading in YEAR" answers match the presidents list', () => {
    let checked = 0;
    for (let seed = 1; seed < 200; seed++) for (const q of makeTrivia(2026, 5, seeded(seed))) {
      const m = q.q.match(/leading the school in (\d{4})/); if (!m) continue;
      const y = Number(m[1]), p = PRESIDENTS.find(x => x.name === q.options[q.answer])!;
      expect(p.from).toBeLessThan(y); expect(p.to ?? 9999).toBeGreaterThan(y); checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('NPC chatter', () => {
  it('every era has two-sided conversations, and none name BYU–Idaho early', () => {
    for (const era of ERA_ORDER) for (let seed = 1; seed < 80; seed++) {
      const c = chatFor(era, seeded(seed));
      expect(c.lines.length).toBeGreaterThanOrEqual(2);
      expect(c.topic.length).toBeGreaterThan(0);
      if (era !== 'presentFinale') expect(c.lines.join(' ')).not.toMatch(/BYU/);
    }
  });
  it('greeting and join templates use their placeholders', () => {
    expect(GREETINGS.length).toBeGreaterThan(3);
    for (const g of GREETINGS_KNOWN) expect(g).toContain('{name}');
    for (const j of JOIN_LINES) expect(j).toContain('{topic}');
  });
});
