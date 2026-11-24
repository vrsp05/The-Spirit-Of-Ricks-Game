// Campus trivia, generated from the game's own data (the presidents list and the building registry),
// so every answer matches what the player can see in the world. Era-aware: it only asks about people
// and buildings that exist by the era's year, and never names "BYU–Idaho" before the present day.
import { BUILDINGS, type BuildingEntry } from '../world/buildingRegistry';
import { PRESIDENTS, type President } from '../world/presidents';

export interface TriviaQuestion { q: string; options: string[]; answer: number }

const PRESENT = 2026;
type Rnd = () => number;
const pick = <T,>(r: Rnd, a: T[]) => a[(r() * a.length) | 0];
function shuffle<T>(r: Rnd, a: T[]): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; }

/** Name shown for a building in this year (the pre-2026 name never says BYU–Idaho). */
export function buildingName(b: BuildingEntry, year: number): string | null {
  return (year >= PRESENT ? b.names.byui ?? b.names.ricks : b.names.ricks ?? b.names.byui) ?? null;
}
function standing(year: number) {
  return BUILDINGS.filter(b => b.built <= year && (!b.demolished || b.demolished > year) && buildingName(b, year));
}
const term = (p: President) => `${p.from}–${p.to ?? 'today'}`;

/** Builds a question with the right answer plus distinct distractors (null if there aren't enough). */
function ask(r: Rnd, q: string, right: string, pool: string[]): TriviaQuestion | null {
  const wrong = shuffle(r, [...new Set(pool.filter(o => o !== right))]).slice(0, 3);
  if (wrong.length < 3) return null;
  const options = shuffle(r, [right, ...wrong]);
  return { q, options, answer: options.indexOf(right) };
}

type Gen = (r: Rnd, year: number) => TriviaQuestion | null;
const GENERATORS: Gen[] = [
  // who led the school in a given year
  (r, year) => {
    const ps = PRESIDENTS.filter(p => p.from < year), p = pick(r, ps.filter(x => (x.to ?? year) - x.from >= 2));
    const y = p.from + 1 + ((r() * Math.max(1, (p.to ?? Math.floor(year)) - p.from - 1)) | 0);
    return ask(r, `Who was leading the school in ${y}?`, p.name, ps.map(x => x.name));
  },
  // the first principal
  (r, year) => ask(r, 'Who was the very first principal of the academy, back in 1888?', PRESIDENTS[0].name, PRESIDENTS.filter(p => p.from < year).map(p => p.name)),
  // longest-serving
  (r, year) => {
    const ps = PRESIDENTS.filter(p => p.from < year), len = (p: President) => Math.min(p.to ?? year, year) - p.from;
    const best = ps.reduce((a, b) => (len(b) > len(a) ? b : a));
    return ask(r, `Which leader served the longest — about ${Math.round(len(best))} years?`, best.name, ps.map(p => p.name));
  },
  // a building named after a president: when did they serve?
  (r, year) => {
    const pairs = standing(year).flatMap(b => {
      const n = buildingName(b, year)!; const p = PRESIDENTS.find(x => x.from < year && n.includes(x.name.split(' ').slice(-1)[0]) && n.includes(x.name.split(' ')[0]));
      return p ? [{ n, p }] : [];
    });
    if (!pairs.length) return null;
    const { n, p } = pick(r, pairs);
    return ask(r, `The ${n} is named after one of the school's leaders. When did ${p.name} serve?`, term(p), PRESIDENTS.filter(x => x.from < year).map(term));
  },
  // newest / oldest of four buildings
  (r, year) => {
    const four = shuffle(r, standing(year)).filter((b, i, a) => a.findIndex(o => Math.floor(o.built) === Math.floor(b.built)) === i).slice(0, 4);
    if (four.length < 4) return null;
    const newest = r() < 0.5, right = four.reduce((a, b) => ((newest ? b.built > a.built : b.built < a.built) ? b : a));
    const q = ask(r, `Which of these buildings is the ${newest ? 'newest' : 'oldest'}?`, buildingName(right, year)!, four.map(b => buildingName(b, year)!));
    return q;
  },
  // when a building opened
  (r, year) => {
    const b = pick(r, standing(year).filter(x => x.built > 1900)), y = Math.floor(b.built);
    const wrong = shuffle(r, [-12, -8, -5, -3, 3, 5, 8, 11].map(d => y + d).filter(v => v <= Math.floor(year))).map(String);
    return ask(r, `Around what year did the ${buildingName(b, year)} open?`, String(y), wrong);
  },
  // how many leaders so far
  (r, year) => {
    const n = PRESIDENTS.filter(p => p.from < year).length;
    return ask(r, `Counting principals and presidents, how many people have led the school so far?`, String(n), [n - 3, n - 2, n - 1, n + 1, n + 2].filter(v => v > 0).map(String));
  },
];

/** `count` different questions for an era year. */
export function makeTrivia(year: number, count: number, r: Rnd = Math.random): TriviaQuestion[] {
  const out: TriviaQuestion[] = [];
  for (let tries = 0; out.length < count && tries < 200; tries++) {
    const q = GENERATORS[(r() * GENERATORS.length) | 0](r, year);
    if (q && !out.some(o => o.q === q.q)) out.push(q);
  }
  return out;
}
