// Campus orientation: a short checklist for the first minutes of a new game that teaches the keys and
// points you at the best places (the MC, the Hart). Each step pays a few coins; finishing pays a bonus and
// an achievement. Progress lives in campus-life stats (tourOn, tour:<step>, tourDone), so no save change.
import type { Progress } from './progress';

export interface TourStep { id: string; text: string; place?: string }
export const TOUR_STEPS: TourStep[] = [
  { id: 'map', text: 'Open the campus map (M)' },
  { id: 'talk', text: 'Say hi to a student (walk up, press E)' },
  { id: 'ride', text: 'Hop on your longboard (B)' },
  { id: 'phone', text: 'Check your phone (Q)' },
  { id: 'photo', text: 'Take a photo (P, then Space)' },
  { id: 'mc', text: 'Visit the Manwaring Center — food, bowling, the store', place: 'manwaring' },
  { id: 'hart', text: 'Visit the Hart — basketball, treadmills, weights', place: 'hart' },
  { id: 'shuttle', text: 'Ride the campus shuttle (M → 🚌)' },
];
export const TOUR_STEP_COINS = 5, TOUR_BONUS = 25;

export class Orientation {
  constructor(private p: Progress, private checks: Record<string, () => boolean>, private say: (text: string, big?: boolean) => void) {}
  get on() { return this.p.stat('tourOn') > 0 && !this.p.stat('tourDone'); }
  start() { if (this.p.stat('tourDone')) return; this.p.set('tourOn', 1); this.say('🧭 Campus orientation! Your checklist is on the right. Each step pays coins — skip it any time from the pause menu.', true); }
  skip() { this.p.set('tourOn', 0); }
  done(id: string) { return this.p.stat(`tour:${id}`) > 0; }
  count() { return TOUR_STEPS.filter(s => this.done(s.id)).length; }
  current(): TourStep | null { return TOUR_STEPS.find(s => !this.done(s.id)) ?? null; }
  /** Checks every step (any order); call a few times a second. */
  update() {
    if (!this.on) return;
    for (const s of TOUR_STEPS) {
      if (this.done(s.id) || !this.checks[s.id]?.()) continue;
      this.p.set(`tour:${s.id}`, 1); this.p.earn(TOUR_STEP_COINS);
      const n = this.count();
      if (n >= TOUR_STEPS.length) { this.p.earn(TOUR_BONUS); this.p.set('tourOn', 0); this.p.set('tourDone', 1); this.say(`🎓 Orientation complete! +${TOUR_STEP_COINS + TOUR_BONUS} coins. You know your way around — enjoy campus!`, true); return; }
      this.say(`✔ ${s.text.split(' (')[0].split(' —')[0]} · +${TOUR_STEP_COINS} coins (${n}/${TOUR_STEPS.length})`);
    }
  }
  tracker() { const c = this.current(); return this.on && c ? `🧭 Orientation ${this.count()}/${TOUR_STEPS.length}: ${c.text}` : null; }
  /** The building the current step wants you to visit (for the map marker). */
  place() { return this.on ? this.current()?.place ?? null : null; }
}
