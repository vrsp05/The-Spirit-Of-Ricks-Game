// Background music: the team's three recorded songs (public/music/*.m4a) as a looping playlist.
// Plays on the menus and while exploring; fades out during cutscenes, time-jump cards and the
// finale, then resumes where it left off. Respects Mute and the Music on/off setting.
// Browsers only allow audio after the first click/key press, so it starts on that gesture.
import { SETTINGS } from '../core/settings';

export const TRACKS = [
  { title: 'High on the Mountain Top', file: 'high-on-the-mountain-top.m4a' },
  { title: 'I Need Thee Every Hour', file: 'i-need-thee-every-hour.m4a' },
  { title: 'The Spirit of God', file: 'the-spirit-of-god.m4a' },
];

export class MusicPlayer {
  private audio = new Audio();
  private index = Math.floor(Math.random() * TRACKS.length);
  private level = 0;              // current fade level 0..1
  private unlocked = false;
  onTrack: ((title: string) => void) | null = null;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.volume = 0;
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => { this.index = (this.index + 1) % TRACKS.length; this.load(); });  // skip a track that fails to load
    this.load();
    const unlock = () => { this.unlocked = true; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  }
  private load() { this.audio.src = `${import.meta.env.BASE_URL}music/${TRACKS[this.index].file}`; }
  private next() { this.index = (this.index + 1) % TRACKS.length; this.load(); if (this.level > 0) { void this.audio.play().catch(() => {}); this.onTrack?.(TRACKS[this.index].title); } }
  get title() { return TRACKS[this.index].title; }

  /** Call every frame. allowed = not in a cutscene / card / finale. */
  update(dt: number, allowed: boolean) {
    const want = allowed && SETTINGS.music && SETTINGS.musicVolume > 0 && !SETTINGS.muted ? 1 : 0;
    this.level += Math.sign(want - this.level) * Math.min(Math.abs(want - this.level), dt / (want ? 1.5 : 0.6));   // fade in 1.5 s, out 0.6 s
    this.audio.volume = Math.max(0, Math.min(1, this.level * SETTINGS.musicVolume));   // Audio settings → Music
    if (this.level > 0 && this.audio.paused && this.unlocked) {
      const first = this.audio.currentTime === 0;
      this.audio.play().then(() => { if (first) this.onTrack?.(this.title); }).catch(() => {});
    }
    if (this.level === 0 && !this.audio.paused) this.audio.pause();   // keeps its position; resumes after the scene
  }
}
