// Everything "campus life" remembers between sessions: coins earned and spent, counters (stats),
// unlocked achievements, friendships with students, collectibles found, photo challenges done,
// and the campus clock. Saved as one optional block in the save file (SaveData.life).

export interface LifeSave {
  coins: number; spent: number;
  stats: Record<string, number>;
  achievements: string[];
  /** Conversations per student name. */
  friends: Record<string, number>;
  collected: string[];
  photos: string[];
  /** Campus clock (minutes since Monday 00:00). */
  minutes?: number;
  /** Interiors visited (for the explorer achievement). */
  visited?: string[];
}

export interface Achievement { id: string; icon: string; title: string; text: string; test: (p: Progress) => boolean; secret?: boolean }

export const FRIEND_LEVELS = [
  { at: 1, name: 'Acquaintance' },
  { at: 3, name: 'Friend' },
  { at: 6, name: 'Good friend' },
  { at: 10, name: 'Best friend' },
] as const;
export function friendLevel(talks: number): number { let l = -1; FRIEND_LEVELS.forEach((f, i) => { if (talks >= f.at) l = i; }); return l; }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'social', icon: '👋', title: 'Friendly Face', text: 'Talk to 10 different students.', test: p => Object.keys(p.friends).length >= 10 },
  { id: 'social2', icon: '🗣️', title: 'Everybody Knows Your Name', text: 'Talk to 25 different students.', test: p => Object.keys(p.friends).length >= 25 },
  { id: 'bff', icon: '🤝', title: 'Best Friends', text: 'Become best friends with a student.', test: p => Object.values(p.friends).some(t => friendLevel(t) >= 3) },
  { id: 'events5', icon: '✨', title: 'Right Place, Right Time', text: 'Take part in 5 campus happenings.', test: p => p.stat('events') >= 5 },
  { id: 'events15', icon: '🌟', title: 'Campus Regular', text: 'Take part in 15 campus happenings.', test: p => p.stat('events') >= 15 },
  { id: 'hat', icon: '🧢', title: 'Gone with the Wind', text: 'Catch a hat the Rexburg wind stole.', test: p => p.stat('hats') >= 1 },
  { id: 'frisbee', icon: '🥏', title: 'Frisbee Pro', text: 'Catch 5 frisbee throws in a row.', test: p => p.stat('frisbeeStreak') >= 5 },
  { id: 'snowball', icon: '❄️', title: 'Snowball Champion', text: 'Win a snowball fight.', test: p => p.stat('snowballWins') >= 1 },
  { id: 'choir', icon: '🎶', title: 'Sing Along', text: 'Join a pop-up choir.', test: p => p.stat('choir') >= 1 },
  { id: 'collect10', icon: '📦', title: 'Treasure Hunter', text: 'Find 10 campus collectibles.', test: p => p.collected.size >= 10 },
  { id: 'collectAll', icon: '🏛️', title: 'Campus Historian', text: 'Find every collectible in every era.', test: p => p.collected.size >= p.collectibleTotal && p.collectibleTotal > 0 },
  { id: 'piano', icon: '🎹', title: 'Play Me!', text: 'Play a whole song on the campus piano.', test: p => p.stat('songs') >= 1 },
  { id: 'busker', icon: '🎸', title: 'Patron of the Arts', text: 'Tip the street musician.', test: p => p.stat('tips') >= 1 },
  { id: 'photo1', icon: '📷', title: 'Say Cheese', text: 'Take a photo with the camera (P).', test: p => p.stat('photosTaken') >= 1 },
  { id: 'photoAll', icon: '🖼️', title: 'Campus Photographer', text: 'Complete every photo challenge.', test: p => p.photos.size >= p.photoTotal && p.photoTotal > 0 },
  { id: 'ollie', icon: '🛹', title: 'Ollie!', text: 'Land 10 ollies on the longboard.', test: p => p.stat('ollies') >= 10 },
  { id: 'board1k', icon: '🛣️', title: 'Cruising', text: 'Ride 1 km on your longboard or sled.', test: p => p.stat('boardMeters') >= 1000 },
  { id: 'sled', icon: '🛷', title: 'Downhill!', text: 'Go sledding in the snow.', test: p => p.stat('sledMeters') >= 50 },
  { id: 'night', icon: '🌙', title: 'Night Owl', text: 'Walk around campus after midnight.', test: p => p.stat('nightOwl') >= 1 },
  { id: 'dawn', icon: '🌅', title: 'Early Bird', text: 'Be outside at sunrise.', test: p => p.stat('earlyBird') >= 1 },
  { id: 'devotional', icon: '⛪', title: 'Tuesday Devotional', text: 'Be on campus when everyone heads to devotional.', test: p => p.stat('devotional') >= 1 },
  { id: 'explorer', icon: '🚪', title: 'Explorer', text: 'Step inside 12 different buildings.', test: p => p.visited.size >= 12 },
  { id: 'rain', icon: '☔', title: 'Singing in the Rain', text: 'Stay outside during a rain shower.', test: p => p.stat('rain') >= 1 },
  { id: 'driver', icon: '🚗', title: 'Road Warrior', text: 'Finish the shuttle, rally and parking jobs.', test: p => ['shuttle', 'rally', 'parking'].every(j => p.stat(`job:${j}`) > 0) },
  { id: 'pilot', icon: '✈️', title: 'Top Gun', text: 'Graduate from Flight School.', test: p => p.stat('job:flight') > 0 },
  { id: 'heli', icon: '🚁', title: 'Rooftop Pilot', text: 'Finish the rooftop helicopter deliveries.', test: p => p.stat('job:heli') > 0 },
  { id: 'sprinter', icon: '🏃', title: 'Treadmill Sprinter', text: 'Run the 400 m treadmill sprint in under 65 seconds.', test: p => p.stat('treadBest') > 0 && p.stat('treadBest') < 650 },
  { id: 'bookworm', icon: '📚', title: 'Bookworm', text: 'Find 15 books in the McKay Library.', test: p => p.stat('booksFound') >= 15 },
  { id: 'stargazer', icon: '🔭', title: 'Stargazer', text: 'Connect the constellations in the Romney planetarium.', test: p => p.stat('planetariumDone') >= 1 },
  { id: 'musician', icon: '🎻', title: 'Concert Hall', text: 'Score 80% playing along in the Snow concert hall.', test: p => p.stat('rhythmBest') >= 80 },
  { id: 'mechanic', icon: '🔧', title: 'Grease Monkey', text: 'Fix 6 cars in the Austin shops.', test: p => p.stat('carsFixed') >= 6 },
  { id: 'pong', icon: '🏓', title: 'Ping-Pong Champ', text: 'Win a game of ping-pong at the Strike Zone.', test: p => p.stat('pongWins') >= 1 },
  { id: 'worker', icon: '💼', title: 'Working Student', text: 'Work 5 part-time shifts.', test: p => p.stat('jobShifts') >= 5 },
  { id: 'intramurals', icon: '🏆', title: 'Intramural Champions', text: 'Win the 3-on-3 tournament.', test: p => p.stat('imTitles') >= 1 },
  { id: 'racer', icon: '🏃', title: 'Fastest on Campus', text: 'Win the stadium race.', test: p => p.stat('raceWins') >= 1 },
  { id: 'student', icon: '🎒', title: 'Model Student', text: 'Attend 10 classes.', test: p => p.stat('classes') >= 10 },
  { id: 'date', icon: '🍦', title: 'Ice Cream Social', text: 'Go out with a friend.', test: p => p.stat('dates') >= 1 },
  { id: 'pet', icon: '🐹', title: 'Roommate', text: 'Adopt a pet for your apartment.', test: p => p.stat('pet') > 0 },
  { id: 'decorator', icon: '🛋️', title: 'Home Sweet Home', text: 'Buy 3 decorations for your apartment.', test: p => p.stat('decorOwned') >= 3 },
  { id: 'strong', icon: '🏋️', title: 'Two Plates', text: 'Bench press 225 lb (102 kg) in the Hart.', test: p => p.stat('benchBest') >= 225 },
  { id: 'splash', icon: '🎯', title: 'Splash Brother', text: 'Score 18 points in the three-point contest.', test: p => p.stat('threesBest') >= 18 },
  { id: 'league', icon: '🏅', title: 'League Champions', text: 'Win the Hart 2-on-2 League with Kenzie.', test: p => p.stat('leagueTitles') >= 1 },
  { id: 'oriented', icon: '🧭', title: 'Oriented', text: 'Finish the campus orientation.', test: p => p.stat('tourDone') >= 1 },
  { id: 'board', icon: '📌', title: 'Bulletin Board Regular', text: 'Finish 10 daily bulletin-board tasks.', test: p => p.stat('dailyDone') >= 10 },
  { id: 'sharpshooter', icon: '🏀', title: 'Sharpshooter', text: 'Score 30 points in the Hart shooting challenge.', test: p => p.stat('hoopsBest') >= 30 },
  { id: 'strike', icon: '🎳', title: 'Strike!', text: 'Bowl a strike at the Strike Zone.', test: p => p.stat('strikes') >= 1 },
  { id: 'shopper', icon: '🛍️', title: 'Campus Shopper', text: 'Buy something at the school store.', test: p => p.stat('purchases') >= 1 },
  { id: 'rich', icon: '💰', title: 'Saving Up', text: 'Earn 300 coins from campus life.', test: p => p.coins >= 300 },
];

export class Progress {
  coins = 0; spent = 0;
  private stats: Record<string, number> = {};
  achievements = new Set<string>();
  friends: Record<string, number> = {};
  collected = new Set<string>();
  photos = new Set<string>();
  visited = new Set<string>();
  /** Totals (set by the systems that own them) for the "all of them" achievements. */
  collectibleTotal = 0; photoTotal = 0;
  /** Called with each newly unlocked achievement. */
  onUnlock: (a: Achievement) => void = () => {};

  stat(k: string) { return this.stats[k] ?? 0; }
  add(k: string, n = 1) { this.stats[k] = this.stat(k) + n; this.check(); }
  /** Set a value directly (best times). */
  set(k: string, v: number) { this.stats[k] = v; this.check(); }
  /** Keep the best value (streaks). */
  best(k: string, v: number) { if (v > this.stat(k)) { this.stats[k] = v; this.check(); } }
  earn(n: number) { this.coins += n; this.check(); }
  /** Spend coins (false if you can't afford it). `wallet` = every coin you own, from all sources. */
  spend(n: number, wallet: number) { if (wallet < n) return false; this.spent += n; return true; }

  check() {
    for (const a of ACHIEVEMENTS) if (!this.achievements.has(a.id) && a.test(this)) { this.achievements.add(a.id); this.onUnlock(a); }
  }

  snapshot(minutes: number): LifeSave {
    return { coins: this.coins, spent: this.spent, stats: { ...this.stats }, achievements: [...this.achievements], friends: { ...this.friends },
      collected: [...this.collected], photos: [...this.photos], minutes, visited: [...this.visited] };
  }
  load(d: LifeSave | undefined) {
    this.coins = d?.coins ?? 0; this.spent = d?.spent ?? 0; this.stats = { ...(d?.stats ?? {}) };
    this.achievements = new Set(d?.achievements ?? []); this.friends = { ...(d?.friends ?? {}) };
    this.collected = new Set(d?.collected ?? []); this.photos = new Set(d?.photos ?? []); this.visited = new Set(d?.visited ?? []);
  }
}
