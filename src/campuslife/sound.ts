// Live music on campus (all synthesized, no files): the street musician's guitar, the "Play Me"
// piano, the pop-up choir, and the rain. Everything goes through a gain that follows distance,
// and respects Mute / the effects volume.
import { audioCtx } from '../fx/audio';
import { SETTINGS } from '../core/settings';

/** Note name → frequency ("C4", "F#4", "Bb3"). */
export function freq(n: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n); if (!m) return 440;
  const semis: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const s = semis[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (s / 12);
}

/** A sound source with its own volume (distance falloff), feeding the speakers. */
export class Voice {
  private g: GainNode | null = null;
  level = 1;
  out(): { a: AudioContext; dest: GainNode } | null {
    const a = audioCtx(); if (!a || SETTINGS.sfxVolume <= 0) return null;
    if (!this.g || this.g.context !== a) { this.g = a.createGain(); this.g.connect(a.destination); }
    this.g.gain.setTargetAtTime(this.level * SETTINGS.sfxVolume, a.currentTime, 0.1);
    return { a, dest: this.g };
  }
  /** Plucked string (guitar). */
  pluck(f: number, when = 0, gain = 0.12, dur = 1.2) {
    const o = this.out(); if (!o) return;
    const { a, dest } = o, t = a.currentTime + when;
    const osc = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
    osc.type = 'triangle'; osc.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(dest); osc.start(t); osc.stop(t + dur + 0.05);
  }
  /** Piano-ish tone (two detuned partials, quick decay). */
  piano(f: number, when = 0, gain = 0.16) {
    const o = this.out(); if (!o) return;
    const { a, dest } = o, t = a.currentTime + when;
    for (const [mul, type, k] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]] as const) {
      const osc = a.createOscillator(), g = a.createGain(); osc.type = type; osc.frequency.value = f * mul * (mul === 1 ? 1 : 1.002);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * k, t + 0.004); g.gain.exponentialRampToValueAtTime(gain * k * 0.25, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      osc.connect(g).connect(dest); osc.start(t); osc.stop(t + 1.9);
    }
  }
  /** Sung vowel ("ooh"): a soft vibrato with a slow attack. */
  sing(f: number, when: number, dur: number, gain = 0.05) {
    const o = this.out(); if (!o) return;
    const { a, dest } = o, t = a.currentTime + when;
    const osc = a.createOscillator(), vib = a.createOscillator(), vg = a.createGain(), g = a.createGain(), lp = a.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = f; vib.frequency.value = 5.2; vg.gain.value = f * 0.012; vib.connect(vg).connect(osc.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.18); g.gain.setValueAtTime(gain, t + dur - 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(lp).connect(g).connect(dest); osc.start(t); vib.start(t); osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
}

// ---------------------------------------------------------------- tunes (original melodies)
/** A tune: [note or chord root, beats]. Chords are strummed by the guitar. */
export interface Tune { name: string; bpm: number; chords: [string[], number][]; melody: [string | null, number][] }
const C = ['C3', 'G3', 'C4', 'E4'], G = ['G2', 'D3', 'G3', 'B3'], Am = ['A2', 'E3', 'A3', 'C4'], F = ['F2', 'C3', 'F3', 'A3'], Em = ['E2', 'B2', 'E3', 'G3'], D = ['D3', 'A3', 'D4', 'F#4'];
export const TUNES: Tune[] = [
  { name: 'Rexburg Breeze', bpm: 104, chords: [[C, 4], [G, 4], [Am, 4], [F, 4], [C, 4], [G, 4], [F, 4], [C, 4]],
    melody: [['E4', 1], ['G4', 1], ['C5', 2], ['B4', 1], ['G4', 1], ['D4', 2], ['C4', 1], ['E4', 1], ['A4', 2], ['G4', 1], ['F4', 1], ['A4', 2],
      ['G4', 1], ['E4', 1], ['C4', 2], ['D4', 1], ['G4', 1], ['B4', 2], ['A4', 1], ['G4', 1], ['F4', 2], ['E4', 3], [null, 1]] },
  { name: 'Snow on the Hill', bpm: 84, chords: [[Am, 4], [F, 4], [C, 4], [G, 4], [Am, 4], [F, 4], [G, 4], [Am, 4]],
    melody: [['A4', 2], ['C5', 1], ['B4', 1], ['A4', 2], ['F4', 2], ['G4', 2], ['E4', 2], ['G4', 2], ['B4', 2],
      ['C5', 2], ['B4', 1], ['A4', 1], ['F4', 2], ['A4', 2], ['G4', 1], ['B4', 1], ['D5', 2], ['A4', 4]] },
  { name: 'Viking Stomp', bpm: 132, chords: [[D, 4], [G, 4], [D, 4], [Em, 2], [G, 2], [D, 4], [G, 4], [Em, 4], [D, 4]],
    melody: [['D4', 1], ['F#4', 1], ['A4', 1], ['A4', 1], ['B4', 1], ['A4', 1], ['G4', 2], ['F#4', 1], ['A4', 1], ['D5', 2], ['B4', 1], ['G4', 1], ['E4', 2],
      ['D4', 1], ['F#4', 1], ['A4', 2], ['G4', 1], ['B4', 1], ['D5', 2], ['B4', 1], ['G4', 1], ['E4', 2], ['D4', 4]] },
];

/** Plays a tune in a loop, scheduling notes a little ahead of time. */
export class TunePlayer {
  private beat = 0; private ci = 0; private cBeat = 0; private mi = 0; private mBeat = 0;
  constructor(public voice: Voice, public tune: Tune, private style: 'guitar' | 'choir') {}
  setTune(t: Tune) { this.tune = t; this.beat = this.ci = this.cBeat = this.mi = this.mBeat = 0; }
  /** Advance by dt seconds (call every frame while audible). */
  update(dt: number) {
    const spb = 60 / this.tune.bpm;
    this.beat += dt / spb;
    const T = this.tune;
    while (this.cBeat <= this.beat + 0.2) {
      const [ch, len] = T.chords[this.ci], when = Math.max(0, (this.cBeat - this.beat) * spb);
      if (this.style === 'guitar') { ch.forEach((n, i) => this.voice.pluck(freq(n), when + i * 0.025, 0.07, 1.6)); for (let b = 1; b < len; b++) ch.slice(1).forEach((n, i) => this.voice.pluck(freq(n), when + b * spb + i * 0.02, 0.035, 0.9)); }
      else ch.slice(1).forEach(n => this.voice.sing(freq(n), when, len * spb, 0.028));
      this.cBeat += len; this.ci = (this.ci + 1) % T.chords.length;   // chords and melody are both 32 beats, so they stay in step
    }
    while (this.mBeat <= this.beat + 0.2) {
      const [n, len] = T.melody[this.mi], when = Math.max(0, (this.mBeat - this.beat) * spb);
      if (n) { if (this.style === 'guitar') this.voice.pluck(freq(n), when, 0.11, Math.min(1.6, len * spb + 0.3)); else this.voice.sing(freq(n), when, len * spb * 0.95, 0.05); }
      this.mBeat += len; this.mi = (this.mi + 1) % T.melody.length;
    }
  }
}

// ---------------------------------------------------------------- piano songs (traditional / public domain)
export interface PianoSong { name: string; notes: string[] }
export const PIANO_SONGS: PianoSong[] = [
  { name: 'C major scale', notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] },
  { name: 'Hot Cross Buns', notes: ['E4', 'D4', 'C4', 'E4', 'D4', 'C4', 'C4', 'C4', 'C4', 'C4', 'D4', 'D4', 'D4', 'D4', 'E4', 'D4', 'C4'] },
  { name: 'Twinkle, Twinkle, Little Star', notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4', 'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'] },
  { name: 'Ode to Joy', notes: ['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4', 'E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'D4', 'C4', 'C4'] },
];
/** Keyboard layout for the piano: white keys on A S D F G H J K, black keys on W E T Y U. */
export const PIANO_KEYS: { note: string; key: string; code: string; black: boolean }[] = [
  { note: 'C4', key: 'A', code: 'KeyA', black: false }, { note: 'C#4', key: 'W', code: 'KeyW', black: true },
  { note: 'D4', key: 'S', code: 'KeyS', black: false }, { note: 'D#4', key: 'E', code: 'KeyE', black: true },
  { note: 'E4', key: 'D', code: 'KeyD', black: false }, { note: 'F4', key: 'F', code: 'KeyF', black: false },
  { note: 'F#4', key: 'T', code: 'KeyT', black: true }, { note: 'G4', key: 'G', code: 'KeyG', black: false },
  { note: 'G#4', key: 'Y', code: 'KeyY', black: true }, { note: 'A4', key: 'H', code: 'KeyH', black: false },
  { note: 'A#4', key: 'U', code: 'KeyU', black: true }, { note: 'B4', key: 'J', code: 'KeyJ', black: false },
  { note: 'C5', key: 'K', code: 'KeyK', black: false },
];

/** Rain on the ground: filtered noise loop (fades in/out). */
export class RainSound {
  private src: AudioBufferSourceNode | null = null; private g: GainNode | null = null;
  update(level: number) {
    const a = level > 0.01 ? audioCtx() : null;
    if (!a) { if (this.g && this.src) { const s = this.src; this.g.gain.setTargetAtTime(0, s.context.currentTime, 0.3); setTimeout(() => { try { s.stop(); } catch { /* */ } }, 1500); this.src = null; this.g = null; } return; }
    if (!this.src) {
      const len = a.sampleRate * 2, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 3 : 0.6);
      this.src = a.createBufferSource(); this.src.buffer = buf; this.src.loop = true;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      this.g = a.createGain(); this.g.gain.value = 0; this.src.connect(lp).connect(hp).connect(this.g).connect(a.destination); this.src.start();
    }
    this.g!.gain.setTargetAtTime(level * 0.09 * SETTINGS.ambienceVolume, a.currentTime, 0.6);
  }
}
