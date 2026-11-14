// Art-demo music: the team's recording of "High on the Mountain Top" (music: Ebenezer
// Beesley, 1854). Drop the file at the path in data/art.json → "music.src" (served from
// /public). If the file isn't there yet, nothing plays. Respects the game's mute setting.
import { SETTINGS } from '../../core/settings';

export interface MusicData { src: string; volume: number; enabled: boolean }

/** Starts the recording (if present); returns a function that fades it out. */
export function playMusic(m: MusicData | undefined): () => void {
  if (!m?.enabled || SETTINGS.muted) return () => {};
  let el: HTMLAudioElement | null = null, fade = 0;
  try {
    el = new Audio(m.src); el.loop = false; el.volume = m.volume;
    el.addEventListener('error', () => { el = null; });            // no file yet → stay silent
    void el.play().catch(() => { el = null; });
  } catch { return () => {}; }
  return () => {
    const a = el; if (!a) return; el = null; clearInterval(fade);
    fade = window.setInterval(() => { a.volume = Math.max(0, a.volume - 0.05); if (a.volume <= 0.01) { a.pause(); clearInterval(fade); } }, 60);
  };
}
