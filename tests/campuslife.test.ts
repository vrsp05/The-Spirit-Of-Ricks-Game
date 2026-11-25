import { describe, expect, it } from 'vitest';
import { CampusClock, ERA_START_HOUR } from '../src/campuslife/clock';
import { ACHIEVEMENTS, friendLevel, Progress } from '../src/campuslife/progress';
import { COLLECTIBLES } from '../src/campuslife/collectibles';
import { ERA_ORDER } from '../src/world/eras';
import { PIANO_KEYS, PIANO_SONGS, TUNES, freq } from '../src/campuslife/sound';

describe('campus clock', () => {
  it('tells the time and the day', () => {
    const c = new CampusClock(10.5, 1);
    expect(c.label()).toBe('Tue 10:30');
    c.tick(90);                                  // 90 s = 90 game minutes
    expect(c.label()).toBe('Tue 12:00');
  });
  it('knows the campus schedule', () => {
    expect(new CampusClock(2, 0).phase()).toBe('night');
    expect(new CampusClock(10 + 52 / 60, 3).phase()).toBe('classChange');   // Thursday 10:52
    expect(new CampusClock(10 + 52 / 60, 5).phase()).not.toBe('classChange'); // not on Saturday
    expect(new CampusClock(10.75, 1).phase()).toBe('devotional');           // Tuesday 10:45
    expect(new CampusClock(2, 0).busyness()).toBeLessThan(new CampusClock(10 + 55 / 60, 2).busyness());
  });
  it('sleeping wakes you at 7:00 the next morning', () => {
    const c = new CampusClock(23, 4); c.sleepUntilMorning(); expect(c.label()).toBe('Sat 07:00');
    const d = new CampusClock(3, 4); d.sleepUntilMorning(); expect(d.label()).toBe('Fri 07:00');
  });
  it('stops when the cycle is off', () => { const c = new CampusClock(9); c.running = false; c.tick(500); expect(c.hour).toBe(9); });
  it('has a start hour for every era', () => { for (const e of ERA_ORDER) expect(ERA_START_HOUR[e]).toBeGreaterThan(5); });
});

describe('campus life progress', () => {
  it('unlocks achievements once, and saves/loads', () => {
    const p = new Progress(), got: string[] = []; p.onUnlock = a => got.push(a.id);
    p.add('hats'); p.add('hats');
    expect(got).toEqual(['hat']);
    p.best('frisbeeStreak', 3); p.best('frisbeeStreak', 2); expect(p.stat('frisbeeStreak')).toBe(3);
    p.earn(40); expect(p.spend(50, 45)).toBe(false); expect(p.spend(30, 45)).toBe(true);
    const q = new Progress(); q.load(p.snapshot(123)); expect(q.stat('hats')).toBe(2); expect(q.achievements.has('hat')).toBe(true); expect(q.coins - q.spent).toBe(10);
  });
  it('friend levels', () => { expect(friendLevel(0)).toBe(-1); expect(friendLevel(1)).toBe(0); expect(friendLevel(3)).toBe(1); expect(friendLevel(12)).toBe(3); });
  it('achievement ids are unique', () => { expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length); });
});

describe('collectibles', () => {
  it('six per era, unique ids, and no BYU–Idaho before the present day', () => {
    expect(new Set(COLLECTIBLES.map(c => c.id)).size).toBe(COLLECTIBLES.length);
    for (const e of ERA_ORDER) expect(COLLECTIBLES.filter(c => c.era === e)).toHaveLength(6);
    for (const c of COLLECTIBLES.filter(c => c.era !== 'presentFinale')) expect(c.name + c.text).not.toMatch(/BYU/);
  });
  it('no two items of an era share a building side', () => {
    for (const e of ERA_ORDER) { const k = COLLECTIBLES.filter(c => c.era === e).map(c => c.building + c.side); expect(new Set(k).size).toBe(k.length); }
  });
});

describe('music', () => {
  it('note frequencies', () => { expect(freq('A4')).toBeCloseTo(440); expect(freq('C5')).toBeCloseTo(523.25, 1); expect(freq('A3')).toBeCloseTo(220); });
  it('piano songs only use keys on the piano', () => { const notes = new Set(PIANO_KEYS.map(k => k.note)); for (const s of PIANO_SONGS) for (const n of s.notes) expect(notes.has(n)).toBe(true); });
  it('busker tunes: chords and melody have the same length (they loop together)', () => {
    for (const t of TUNES) expect(t.melody.reduce((s, m) => s + m[1], 0)).toBe(t.chords.reduce((s, c) => s + c[1], 0));
  });
});

import { bowlingScore, pinsFor, ACCESSORIES, STORE_FOOD } from '../src/campuslife/mcFun';
import { JOBS } from '../src/campuslife/vehicleJobs';
import { OUTFITS } from '../src/player/outfits';
describe('Manwaring Center fun', () => {
  it('bowling score: strikes and spares get a bonus', () => {
    expect(bowlingScore([[10, 0], [10, 0], [10, 0], [10, 0], [10, 0]])).toBe(100);
    expect(bowlingScore([[7, 3], [0, 0], [4, 2], [9, 0], [1, 1]])).toBe(32);
  });
  it('pins never exceed the pins standing; a perfect roll clears them', () => {
    for (let i = 0; i < 200; i++) { const n = pinsFor(Math.random() * 2 - 1, Math.random(), 7); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(7); }
    expect(pinsFor(0, 0.85, 10, () => 0.5)).toBe(10);
    expect(pinsFor(1, 0.1, 10, () => 0.5)).toBe(0);
  });
  it('store items have prices; store outfits exist', () => {
    for (const a of [...ACCESSORIES, ...STORE_FOOD]) expect(a.price).toBeGreaterThan(0);
    expect(OUTFITS.filter(o => o.price).length).toBeGreaterThanOrEqual(3);
  });
  it('vehicle jobs have unique ids and rewards', () => {
    expect(new Set(JOBS.map(j => j.id)).size).toBe(JOBS.length);
    for (const j of JOBS) expect(j.reward).toBeGreaterThan(0);
  });
});

import { stride, shotGoes, TREAD } from '../src/campuslife/hartGames';
describe('Hart minigames', () => {
  it('treadmill: alternating builds speed up to a cap; the same key twice stumbles', () => {
    let v = 0; for (let i = 0; i < 200; i++) v = stride(v, false);
    expect(v).toBeLessThanOrEqual(TREAD.maxSpeed); expect(v).toBeGreaterThan(TREAD.maxSpeed * 0.8);
    expect(stride(v, true)).toBeLessThan(v);
  });
  it('shooting: the centre always goes in, the edges never; threes have a smaller zone', () => {
    expect(shotGoes(0.5, 2)).toBe(true); expect(shotGoes(0.5, 3)).toBe(true);
    expect(shotGoes(0.05, 2)).toBe(false); expect(shotGoes(0.6, 2)).toBe(true); expect(shotGoes(0.6, 3)).toBe(false);
  });
});

import { benchPhysics, BENCH_WEIGHTS } from '../src/campuslife/hartGames';
describe('bench press', () => {
  it('heavier bars need faster tapping (taps per second to lock out in 7 s)', () => {
    const rate = (lb: number) => { const b = benchPhysics(lb); return (b.sink + 1 / 7) / b.push; };
    for (let i = 1; i < BENCH_WEIGHTS.length; i++) expect(rate(BENCH_WEIGHTS[i])).toBeGreaterThan(rate(BENCH_WEIGHTS[i - 1]));
    expect(rate(45)).toBeLessThan(3); expect(rate(225)).toBeLessThan(9); expect(rate(405)).toBeGreaterThan(11);
  });
});

import { compareCall, CONSTELLATIONS, CAR_PROBLEMS, RIVALS } from '../src/campuslife/minigames';
import { scheduleFor } from '../src/campuslife/studentLife';
describe('more campus activities', () => {
  it('call numbers sort by class, number, then cutter', () => {
    expect(compareCall({ cls: 'PS', num: 100, cut: 'A1' }, { cls: 'QA', num: 5, cut: 'A1' })).toBeLessThan(0);
    expect(compareCall({ cls: 'QA', num: 76, cut: 'B2' }, { cls: 'QA', num: 300, cut: 'A1' })).toBeLessThan(0);
    expect(compareCall({ cls: 'QA', num: 76, cut: 'B2' }, { cls: 'QA', num: 76, cut: 'C1' })).toBeLessThan(0);
  });
  it('constellations only connect stars that exist', () => { for (const c of CONSTELLATIONS) for (const [a, b] of c.lines) { expect(c.stars[a]).toBeTruthy(); expect(c.stars[b]).toBeTruthy(); } });
  it('each car problem has one right part and two wrong ones', () => { for (const c of CAR_PROBLEMS) { expect(c.wrong).toHaveLength(2); expect(c.wrong).not.toContain(c.part); } });
  it('rival records are sorted sensibly and classes meet on weekdays', () => {
    for (const r of RIVALS) expect(r.marks.length).toBe(3);
    for (const e of ['ricks1999', 'byui', 'presentFinale'] as const) for (const s of scheduleFor(e)) for (const d of s.days) expect(d).toBeLessThan(5);
  });
});

import * as THREE from 'three';
import { COURT, shotVelocity, shotPoints } from '../src/campuslife/hoops';
describe('real basketball', () => {
  const fly = (from: THREE.Vector3, v: THREE.Vector3) => { const p = from.clone(), vel = v.clone(); for (let i = 0; i < 2000; i++) { const prevY = p.y; vel.y -= 9.8 / 600; p.addScaledVector(vel, 1 / 600); if (prevY >= COURT.hoop.y && p.y < COURT.hoop.y) return Math.hypot(p.x - COURT.hoop.x, p.z - COURT.hoop.z); } return 99; };
  it('the ideal shot drops through the rim from anywhere on the court', () => {
    for (const [x, z] of [[-13, 8.4], [-17, 9.6], [-19.6, 12], [-13, 5.8], [-8, 3]]) {
      const from = new THREE.Vector3(x, 2.25, z), miss = fly(from, shotVelocity(from, COURT.hoop));
      expect(miss).toBeLessThan(COURT.rimR - COURT.ballR * 0.3);
    }
  });
  it('too much or too little power misses', () => {
    const from = new THREE.Vector3(-13, 2.25, 6), v = shotVelocity(from, COURT.hoop);
    expect(fly(from, v.clone().multiplyScalar(1.12))).toBeGreaterThan(COURT.rimR);
    expect(fly(from, v.clone().multiplyScalar(0.88))).toBeGreaterThan(COURT.rimR);
  });
  it('threes from beyond the arc', () => { expect(shotPoints(-13, 10)).toBe(2); expect(shotPoints(-13, 5)).toBe(3); });
});
