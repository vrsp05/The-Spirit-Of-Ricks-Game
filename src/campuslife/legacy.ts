// "Your legacy": the epilogue after the finale. A short sequence of cards — one per story mission, saying
// what *you* did in it (the professors you found, the Y2K night, the keepsakes you chose…) — and then a
// look-back screen with your campus life: friends, records, achievements, coins.
import type { Progress } from './progress';
import { ACHIEVEMENTS } from './progress';

export interface LegacyCard { year: string; title: string; text: string }
type QData = Record<string, unknown>;
const count = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o as object).length : 0);

/** One card per completed mission, written from the mission's saved data (generic text if it was skipped). */
export function legacyCards(done: (id: string) => boolean, data: (id: string) => QData): LegacyCard[] {
  const out: LegacyCard[] = [], skipped = (id: string) => !!(data(id).__devSkipped || data(id).__migrated);
  const add = (id: string, year: string, title: string, text: string, generic: string) => { if (done(id)) out.push({ year, title, text: skipped(id) ? generic : text }); };
  const hired = count(data('professors').hired);
  add('professors', 'Fall 1999', 'The new professors', `You found ${hired || 'the'} professors the college needed for a new semester.`, 'You helped the college find its new professors.');
  const wrong = Number(data('y2k').wrong ?? 0);
  add('y2k', 'December 31, 1999', 'Y2K Rescue', `Midnight came and every computer kept working${wrong === 0 ? ' — and you didn’t get a single date wrong.' : '.'}`, 'Midnight came and every computer kept working.');
  add('vikings', 'Fall 1999', 'Vikings Game Night', 'The band had its drums back, the gym roared, and the Vikings won.', 'The gym roared and the Vikings won.');
  add('construction', 'Spring 2001', 'Building the future', 'You helped plan the buildings for a growing campus.', 'You helped plan the buildings for a growing campus.');
  const items = Object.values((data('capsule').items ?? {}) as Record<string, { item: string }>).map(i => i.item);
  add('capsule', 'Spring 2001', 'The Time Capsule', items.length ? `You buried ${items.join(', ').replace(/, ([^,]*)$/, ' and $1').toLowerCase()} — opened 25 years later.` : 'You buried a time capsule under the quad.', 'You buried a time capsule under the quad.');
  add('snowday', '2011', 'Snow Day', 'You dug campus out and got everyone to devotional on time.', 'You dug campus out of the snow.');
  add('letters', 'Present day', 'B · Y · U · I', 'You found the four letters, and a new name was revealed — the same spirit, a new chapter.', 'A new name was revealed — the same spirit, a new chapter.');
  return out;
}

/** The look-back screen (HTML). */
export function legacyHtml(p: Progress, name: string, coins: number, esc: (s: string) => string): string {
  const friends = Object.entries(p.friends).sort((a, b) => b[1] - a[1]);
  const recs: [string, string][] = [];
  const r = (label: string, v: number, f: (n: number) => string = String) => { if (v) recs.push([label, f(v)]); };
  r('Shooting challenge', p.stat('hoopsBest'), n => `${n} pts`); r('Three-point contest', p.stat('threesBest'), n => `${n}/30`);
  r('Bench press', p.stat('benchBest'), n => `${n} lb`); r('Treadmill 400 m', p.stat('treadBest'), n => `${(n / 10).toFixed(1)} s`);
  r('Bowling', p.stat('bowlBest')); r('1-on-1 wins', p.stat('oneOnOneWins')); r('League titles', p.stat('leagueTitles'));
  r('Classes attended', p.stat('classes')); r('Photos taken', p.stat('photosTaken')); r('Books found', p.stat('booksFound'));
  r('Kilometres on a longboard', p.stat('boardMeters'), n => (n / 1000).toFixed(1));
  const ach = ACHIEVEMENTS.filter(a => p.achievements.has(a.id));
  return `<div class="legacy">
    <p class="legacy-lead">${esc(name)}, you were part of Ricks College becoming BYU–Idaho. Here’s the rest of your story.</p>
    <div class="legacy-grid">
      <section><h3>🤝 Friends (${friends.length})</h3>${friends.length ? `<p>${friends.slice(0, 8).map(([n, t]) => `${esc(n)}${t >= 10 ? ' 💛' : ''}`).join(' · ')}</p>` : '<p class="sub">Say hi to students next time!</p>'}</section>
      <section><h3>🏆 Achievements (${ach.length}/${ACHIEVEMENTS.length})</h3><p>${ach.map(a => `<span title="${esc(a.title)}">${a.icon}</span>`).join(' ') || '<span class="sub">None yet</span>'}</p></section>
      <section><h3>📈 Records</h3>${recs.length ? `<table>${recs.map(([a, b]) => `<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join('')}</table>` : '<p class="sub">Try the minigames around campus!</p>'}</section>
      <section><h3>🚪 Explored</h3><p>${p.visited.size} buildings · ${p.collected.size} collectibles · ● ${coins} coins</p></section>
    </div></div>`;
}
