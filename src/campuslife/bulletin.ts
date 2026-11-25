// The MC bulletin board: three small tasks a day (a campus-clock day = 24 real minutes), picked from things
// you can already do on campus. Each task watches a campus-life counter: when it has gone up by the target
// since you read the board, the task is done and pays coins. Progress lives in campus-life stats.
import type { Progress } from './progress';

export interface DailyTask { id: string; text: string; icon: string; n: number; coins: number; value: (p: Progress) => number; winter?: boolean }
const st = (k: string) => (p: Progress) => p.stat(k);
export const DAILY_TASKS: DailyTask[] = [
  { id: 'photos', icon: '📷', text: 'Take 2 photos', n: 2, coins: 8, value: st('photosTaken') },
  { id: 'books', icon: '📚', text: 'Find 3 books in the McKay Library', n: 3, coins: 12, value: st('booksFound') },
  { id: 'bowl', icon: '🎳', text: 'Bowl a game at the Strike Zone', n: 1, coins: 10, value: st('bowlGames') },
  { id: 'class', icon: '🎒', text: 'Go to a class', n: 1, coins: 10, value: st('classes') },
  { id: 'baskets', icon: '🏀', text: 'Make 5 baskets in a Hart shootaround', n: 5, coins: 10, value: st('shootaroundMakes') },
  { id: 'threes', icon: '🎯', text: 'Shoot the three-point contest', n: 1, coins: 10, value: st('threesGames') },
  { id: 'tread', icon: '🏃', text: 'Run the treadmill sprint', n: 1, coins: 8, value: st('treadRuns') },
  { id: 'bench', icon: '🏋️', text: 'Do a bench-press session', n: 1, coins: 8, value: st('benchSessions') },
  { id: 'cars', icon: '🔧', text: 'Fix 2 cars in the Austin shops', n: 2, coins: 12, value: st('carsFixed') },
  { id: 'shift', icon: '💼', text: 'Work a part-time shift', n: 1, coins: 12, value: st('jobShifts') },
  { id: 'board', icon: '🛹', text: 'Ride 300 m on your longboard or sled', n: 300, coins: 10, value: st('boardMeters') },
  { id: 'happening', icon: '✨', text: 'Join a campus happening', n: 1, coins: 12, value: st('events') },
  { id: 'shop', icon: '🛍️', text: 'Buy something at the school store', n: 1, coins: 6, value: st('purchases') },
  { id: 'chat', icon: '👋', text: 'Chat with 3 students', n: 3, coins: 8, value: p => Object.values(p.friends).reduce((a, b) => a + b, 0) },
  { id: 'pong', icon: '🏓', text: 'Win a ping-pong game', n: 1, coins: 10, value: st('pongWins') },
  { id: 'shuttle', icon: '🚌', text: 'Ride the campus shuttle', n: 1, coins: 5, value: st('shuttleRides') },
  { id: 'planets', icon: '🔭', text: 'Visit the Romney planetarium show', n: 1, coins: 10, value: st('planetariumDone') },
];

/** Deterministic pick of three different tasks for a day number. */
export function tasksForDay(day: number): DailyTask[] {
  let s = (day * 2654435761) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pool = [...DAILY_TASKS], out: DailyTask[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

export class Bulletin {
  constructor(private p: Progress, private day: () => number, private say: (t: string) => void) {}
  /** Today's board has been read (tasks are live). */
  get live() { return this.p.stat('daily:on') > 0 && this.p.stat('daily:day') === this.day(); }
  today() { return tasksForDay(this.day()); }
  /** Reading the board starts today's tasks (snapshotting each counter). */
  accept() {
    if (this.live) return;
    this.p.set('daily:day', this.day()); this.p.set('daily:on', 1);
    this.today().forEach((t, i) => { this.p.set(`daily:base:${i}`, t.value(this.p)); this.p.set(`daily:done:${i}`, 0); });
  }
  progress(i: number) { const t = this.today()[i]; return Math.max(0, Math.min(t.n, t.value(this.p) - this.p.stat(`daily:base:${i}`))); }
  isDone(i: number) { return this.p.stat(`daily:done:${i}`) > 0; }
  update() {
    if (!this.live) return;
    this.today().forEach((t, i) => {
      if (this.isDone(i) || this.progress(i) < t.n) return;
      this.p.set(`daily:done:${i}`, 1); this.p.earn(t.coins); this.p.add('dailyDone');
      const all = [0, 1, 2].every(k => this.isDone(k));
      if (all) { this.p.earn(15); this.say(`📌 All three bulletin-board tasks done! +${t.coins + 15} coins. New ones tomorrow.`); }
      else this.say(`📌 Task done: ${t.icon} ${t.text} · +${t.coins} coins`);
    });
  }
  tracker() {
    if (!this.live) return null;
    const open = this.today().map((t, i) => ({ t, i })).filter(q => !this.isDone(q.i));
    return open.length ? `📌 Today: ${open.map(q => `${q.t.icon} ${q.t.text}${q.t.n > 1 ? ` (${Math.floor(this.progress(q.i))}/${q.t.n})` : ''}`).join(' · ')}` : null;
  }
  html() {
    return `<ul class="daily">${this.today().map((t, i) => `<li class="${this.live && this.isDone(i) ? 'done' : ''}"><span>${t.icon}</span> ${t.text}${this.live && t.n > 1 ? ` <i>(${Math.floor(this.progress(i))}/${t.n})</i>` : ''} <b>+${t.coins}</b>${this.live && this.isDone(i) ? ' ✓' : ''}</li>`).join('')}</ul>
      <p class="sub">Finish all three for a +15 bonus. New tasks every campus day (24 minutes).</p>`;
  }
}
