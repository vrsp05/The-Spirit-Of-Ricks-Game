// Per-viewer accessibility/audio settings (browser storage; safe if storage is blocked).
const KEY = 'spirit-of-ricks.settings';

export interface Settings {
  reducedMotion: boolean; muted: boolean; graphics: 'high' | 'medium' | 'low'; music: boolean;
  /** Accessibility: text size multiplier, colour-blind friendly markers, rebound keys (action → key code). */
  textScale: number; colorblind: boolean; keymap: Record<string, string>;
  /** On-screen touch controls: auto (touch screens only), always, never. */
  touch: 'auto' | 'on' | 'off';
  /** Which save slot (1–3) Continue / Save use. */
  slot: number;
  /** 0–1 volumes (Audio settings in the title and pause menus). */
  musicVolume: number; sfxVolume: number; ambienceVolume: number; voiceVolume: number;
  /** Characters read their lines aloud (browser speech synthesis). */
  voices: boolean;
  /** One season for the whole game (trees, snow, weather, clothing), chosen by the player. */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Exposure multiplier, 0.6–1.4. */
  brightness: number;
  /** Day/night cycle (the campus clock runs; off = each era's fixed time of day). */
  dayNight: boolean;
}

function systemReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function load(): Settings {
  const d: Settings = { reducedMotion: systemReducedMotion(), muted: false, graphics: 'high', musicVolume: 0.3, sfxVolume: 0.8, ambienceVolume: 0.6, voiceVolume: 0.9, voices: true, season: 'autumn', brightness: 1, dayNight: true, music: false, textScale: 1, colorblind: false, keymap: {}, touch: 'auto', slot: 1 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const saved = JSON.parse(raw); Object.assign(d, saved); if (!saved.musicOff1) { d.music = false; (d as Settings & { musicOff1?: boolean }).musicOff1 = true; } }   // music now starts off (turn it on in Settings)
  } catch { /* ignore */ }
  return d;
}

export const SETTINGS: Settings = load();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* ignore */ } }
