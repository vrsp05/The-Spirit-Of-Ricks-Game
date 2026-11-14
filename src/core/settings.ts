// Per-viewer accessibility/audio settings (browser storage; safe if storage is blocked).
const KEY = 'spirit-of-ricks.settings';

export interface Settings {
  reducedMotion: boolean; muted: boolean; graphics: 'high' | 'low'; music: boolean;
  /** 0–1 volumes (Audio settings in the title and pause menus). */
  musicVolume: number; sfxVolume: number; ambienceVolume: number; voiceVolume: number;
  /** Characters read their lines aloud (browser speech synthesis). */
  voices: boolean;
}

function systemReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function load(): Settings {
  const d: Settings = { reducedMotion: systemReducedMotion(), muted: false, graphics: 'high', music: true, musicVolume: 0.3, sfxVolume: 0.8, ambienceVolume: 0.6, voiceVolume: 0.9, voices: true };
  try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(d, JSON.parse(raw)); } catch { /* ignore */ }
  return d;
}

export const SETTINGS: Settings = load();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* ignore */ } }
