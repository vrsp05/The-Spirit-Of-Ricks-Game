// The campus clock: time of day and day of the week, running while you play (1 real second = 1 game
// minute, so a full day takes 24 minutes). It drives the day/night look, the campus schedule
// (class changes, devotional on Tuesdays, quiet nights) and some photo challenges and achievements.
import type { EraId } from '../world/eras';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
/** Game minutes per real second. */
export const CLOCK_SPEED = 1;
/** Each era starts at the time of day its look was designed for. */
export const ERA_START_HOUR: Record<EraId, number> = { ricks1999: 16.5, transition: 8.5, byui: 12, presentFinale: 15 };

export type Phase = 'night' | 'dawn' | 'morning' | 'classChange' | 'devotional' | 'afternoon' | 'evening';

export class CampusClock {
  /** Minutes since Monday 00:00 of week 0. */
  minutes = 0;
  /** Day/night cycle on (Settings); off = the era's fixed time. */
  running = true;

  constructor(hour = 9, day = 0) { this.set(hour, day); }
  set(hour: number, day = this.day) { this.minutes = (((day % 7) + 7) % 7) * 1440 + hour * 60; }
  tick(dt: number) { if (this.running) this.minutes += dt * CLOCK_SPEED; }
  get day() { return Math.floor(this.minutes / 1440) % 7; }
  get hour() { return (this.minutes % 1440) / 60; }
  get minute() { return Math.floor(this.minutes % 60); }
  get weekday() { return this.day < 5; }
  /** Sleep until the next morning (07:00). */
  sleepUntilMorning() { const h = this.hour; this.set(7, h >= 7 ? this.day + 1 : this.day); }

  /** "Tue 10:48" */
  label() {
    const h = Math.floor(this.hour), m = this.minute;
    return `${DAYS[this.day].slice(0, 3)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  /** What's going on around campus right now. */
  phase(): Phase {
    const h = this.hour;
    if (h < 5.5 || h >= 21.5) return 'night';
    if (h < 7.5) return 'dawn';
    if (this.day === 1 && h >= 10.5 && h < 11.75) return 'devotional';           // Tuesday devotional (11:00)
    if (this.weekday && h >= 8 && h < 18 && this.minute >= 50) return 'classChange'; // ten minutes between classes
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
  }
  /** Small status text for the HUD ("Class change!", "Devotional at 11:00", …). */
  note(): string | null {
    switch (this.phase()) {
      case 'classChange': return 'Class change — the paths are busy!';
      case 'devotional': return this.hour < 11 ? 'Devotional at 11:00 — everyone is heading over' : 'Devotional in progress';
      case 'night': return 'Campus is quiet tonight';
      default: return this.weekday ? null : this.day === 5 ? 'Saturday — a slow day on campus' : 'Sunday — campus is resting';
    }
  }
  /** How busy the paths are, 0..1 (night is empty, weekends slower, class change packed). */
  busyness(): number {
    const p = this.phase();
    if (p === 'night') return 0.15;
    if (p === 'classChange' || p === 'devotional') return 1;
    if (p === 'dawn') return 0.35;
    if (p === 'evening') return 0.5;
    return this.weekday ? 0.75 : 0.45;
  }
}
