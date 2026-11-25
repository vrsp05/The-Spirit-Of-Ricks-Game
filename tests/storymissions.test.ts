import { describe, expect, it } from 'vitest';
import { QUEST_ERA, QUEST_ORDER } from '../src/quests/order';
import { addStoryMissions } from '../src/save/save';
import { GAME_CONFIG } from '../src/config/game.config';
import { ERA_ORDER } from '../src/world/eras';
import { Y2K_RECORDS } from '../src/quests/more/y2k';
import { CAPSULE_GIVERS } from '../src/quests/more/capsule';

const old = (era: string, s: Record<string, string>) => ({ version: 3, era, quests: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { status: v, data: {} }])) });
const statuses = (d: any) => Object.fromEntries(QUEST_ORDER.map(id => [id, d.quests[id].status]));

describe('story order', () => {
  it('missions never go back in time, and eras change where the config says', () => {
    for (let i = 1; i < QUEST_ORDER.length; i++) {
      const a = QUEST_ORDER[i - 1], b = QUEST_ORDER[i];
      expect(ERA_ORDER.indexOf(QUEST_ERA[b])).toBeGreaterThanOrEqual(ERA_ORDER.indexOf(QUEST_ERA[a]));
      if (QUEST_ERA[a] !== QUEST_ERA[b]) expect(GAME_CONFIG.story.eraAfterQuest[a]).toBe(QUEST_ERA[b]);
      else expect(GAME_CONFIG.story.eraAfterQuest[a]).toBeUndefined();
    }
  });
  it('one colour stage per mission, plus the start; every mission has a speed target', () => {
    expect(GAME_CONFIG.colorStages).toHaveLength(QUEST_ORDER.length + 1);
    for (const id of QUEST_ORDER) expect(GAME_CONFIG.rewards.targetSec[id]).toBeTruthy();
  });
  it('every mission anchor exists', () => {
    const ids = ['y2k.library', 'y2k.lab', 'vikings.gym', 'vikings.sticks', 'capsule.site', 'snow.center', ...CAPSULE_GIVERS.map(g => g.anchor)];
    for (const id of ids) expect(GAME_CONFIG.locations[id], id).toBeTruthy();
  });
});

describe('save migration v3 → v4', () => {
  it('a fresh 1999 save opens the new 1999 missions after Q1', () => {
    const d = addStoryMissions(old('ricks1999', { professors: 'completed', construction: 'available', letters: 'locked' }));
    expect(statuses(d)).toMatchObject({ professors: 'completed', y2k: 'available', vikings: 'locked', construction: 'locked' });
  });
  it('mid-game in 2001: the 1999 missions count as done, construction keeps going', () => {
    const d = addStoryMissions(old('transition', { professors: 'completed', construction: 'active', letters: 'locked' }));
    expect(statuses(d)).toMatchObject({ y2k: 'completed', vikings: 'completed', construction: 'active', capsule: 'locked' });
    expect(d.colorStage).toBe(3);
  });
  it('in 2011 before the letters started: the snow day opens first', () => {
    const d = addStoryMissions(old('byui', { professors: 'completed', construction: 'completed', letters: 'available' }));
    expect(statuses(d)).toMatchObject({ capsule: 'completed', snowday: 'available', letters: 'locked' });
  });
  it('letters already started: everything before it is done', () => {
    const d = addStoryMissions(old('byui', { professors: 'completed', construction: 'completed', letters: 'active' }));
    expect(statuses(d)).toMatchObject({ snowday: 'completed', letters: 'active' });
  });
});

describe('mission content', () => {
  it('Y2K records are unambiguous for fall 1999', () => {
    for (const r of Y2K_RECORDS) {
      const year = r.answer * 100 + Number(r.yy);
      expect([18, 19, 20]).toContain(r.answer);
      if (/born|printed|opened|bought|dedicated|founded|class of/i.test(r.text)) expect(year).toBeLessThanOrEqual(1999);
      if (/expected|due|expires|first payment/i.test(r.text)) expect(year).toBeGreaterThanOrEqual(1999);
    }
  });
  it('nothing in 2001 names BYU–Idaho', () => {
    for (const g of CAPSULE_GIVERS) expect(JSON.stringify(g)).not.toMatch(/BYU/);
  });
});
