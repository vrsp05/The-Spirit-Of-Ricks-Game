// Soft music-box rendition of the opening phrase of "High on the Mountain Top"
// (music: Ebenezer Beesley, 1854 — public domain). Pitches are the verified incipit
// from hymnary.org (scale degrees 5 1 1 1 2 3 2 3 5 4 3 2 2 3 2, G major); the rhythm is
// approximated from the 6-syllable lines. Data: data/art.json → "hymn". Respects mute.
import { SETTINGS } from '../../core/settings';

export interface HymnData { key: string; tonicHz: number; degrees: number[]; beats: number[]; bpm: number; note: string }
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Scale degree (1–7, may go below 1 for the octave beneath) → frequency. */
export function degreeHz(tonicHz: number, degree: number) {
  const d = degree - 1, oct = Math.floor(d / 7), step = MAJOR[((d % 7) + 7) % 7];
  return tonicHz * Math.pow(2, (oct * 12 + step) / 12);
}

let ac: AudioContext | null = null;
export function playHymn(h: HymnData, volume = 0.07): () => void {
  if (SETTINGS.muted) return () => {};
  try { ac ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ac.state === 'suspended') void ac.resume(); } catch { return () => {}; }
  const a = ac, master = a.createGain(); master.gain.value = volume; master.connect(a.destination);
  const beat = 60 / h.bpm; let t = a.currentTime + 0.1;
  h.degrees.forEach((deg, i) => {
    // the opening "5" is the pickup below the tonic (sol below do)
    const f = degreeHz(h.tonicHz, i === 0 && deg === 5 ? deg - 7 : deg), dur = h.beats[i] * beat;
    for (const [mult, g] of [[1, 1], [2, 0.25]] as const) {
      const o = a.createOscillator(), env = a.createGain();
      o.type = 'triangle'; o.frequency.value = f * mult;
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(g, t + 0.02); env.gain.exponentialRampToValueAtTime(0.0008, t + dur * 1.6 + 0.2);
      o.connect(env).connect(master); o.start(t); o.stop(t + dur * 1.6 + 0.3);
    }
    t += dur;
  });
  return () => { try { master.gain.cancelScheduledValues(a.currentTime); master.gain.setTargetAtTime(0, a.currentTime, 0.15); } catch { /* ignore */ } };
}
