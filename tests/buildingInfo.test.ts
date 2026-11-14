import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { BUILDINGS } from '../src/world/buildingRegistry';
import { BUILDING_INFO, getBuildingInfo } from '../src/world/buildingInfo';

const { parseBuildingInfo } = createRequire(import.meta.url)('../tools/import-building-info.cjs');
const sample = `01. EXAMPLE BUILDING
Game ID: example

About: A place to learn
and meet friends.

Interesting fact: An addition opened in 2010.

Source: University archives
https://example.org/history

----------------------------------------------------------------------
EDITORIAL NOTES
Do not display this note in the game.
`;

describe('building information content', () => {
  it('covers every curated building, including every named landmark', () => {
    expect(BUILDING_INFO.map(c => c.id).sort()).toEqual(BUILDINGS.map(b => b.id).sort());
    expect(new Set(BUILDING_INFO.map(c => c.id)).size).toBe(BUILDING_INFO.length);
    for (const building of BUILDINGS.filter(b => b.landmark)) {
      expect(getBuildingInfo(building.id)?.about).toBeTruthy();
      expect(getBuildingInfo(building.id)?.fact).toBeTruthy();
    }
  });
  it('keeps source attribution and later history available', () => {
    for (const card of BUILDING_INFO) expect(card.source.url).toMatch(/^https:\/\//);
    expect(getBuildingInfo('mckay')?.fact).toContain('2010');
    expect(getBuildingInfo('spori-original')?.fact).not.toEqual(getBuildingInfo('spori-new')?.fact);
  });
});

describe('reference-file import', () => {
  it('joins wrapped paragraphs and leaves editorial instructions out of the card', () => {
    expect(parseBuildingInfo(sample)).toEqual([{
      id: 'example', name: 'EXAMPLE BUILDING', about: 'A place to learn and meet friends.',
      fact: 'An addition opened in 2010.', source: { title: 'University archives', url: 'https://example.org/history' },
    }]);
  });
  it('rejects missing content and duplicate IDs instead of importing broken cards', () => {
    expect(() => parseBuildingInfo(sample.replace('Interesting fact:', 'Note:'))).toThrow();
    expect(() => parseBuildingInfo(sample + sample)).toThrow(/duplicate/);
    expect(() => parseBuildingInfo('Not a card file')).toThrow(/No building cards/);
  });
});
