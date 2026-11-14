// Per-viewer accessibility/audio settings (browser storage; safe if storage is blocked).
const KEY = 'spirit-of-ricks.settings';

export interface Settings { reducedMotion: boolean; muted: boolean }

function systemReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function load(): Settings {
  const d: Settings = { reducedMotion: systemReducedMotion(), muted: false };
  try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(d, JSON.parse(raw)); } catch { /* ignore */ }
  return d;
}

export const SETTINGS: Settings = load();
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* ignore */ } }
