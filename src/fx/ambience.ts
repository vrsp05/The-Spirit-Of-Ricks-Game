// Outdoor ambience, synthesized with WebAudio (no files): wind with slow gusts, leaves rustling in
// the gusts, and birdsong (short chirp phrases, panned around you). Season-aware: no birds in winter
// and a colder, stronger wind; fewer birds in autumn. Nearly silent indoors; softer during cutscenes.
import type { Season } from '../config/atmosphere';
import { SETTINGS } from '../core/settings';
import { audioCtx, sampleBuffer } from './audio';

export class Ambience {
  private a: AudioContext | null = null;
  private out!: GainNode;
  private wind!: GainNode; private windFilter!: BiquadFilterNode;
  private leaves!: GainNode;
  private t = 0; private nextBird = 2; private level = 0;
  private rec: { src: AudioBufferSourceNode; gain: GainNode } | null = null;   // recorded birds + wind loop (CC0)

  private init(a: AudioContext) {
    this.a = a;
    this.out = a.createGain(); this.out.gain.value = 0; this.out.connect(a.destination);
    // 4 s of looping noise feeds both the wind (band-passed, low) and the leaves (high-passed)
    const len = a.sampleRate * 4, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6 + (Math.random() * 2 - 1) * 0.15; }
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windFilter = a.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 380; this.windFilter.Q.value = 0.6;
    this.wind = a.createGain(); this.wind.gain.value = 0;
    src.connect(this.windFilter).connect(this.wind).connect(this.out);
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    this.leaves = a.createGain(); this.leaves.gain.value = 0;
    src.connect(hp).connect(this.leaves).connect(this.out);
    src.start();
  }

  /** Call every frame. */
  update(dt: number, ctx: { outdoor: boolean; season: Season; cinematic: boolean }) {
    const vol = SETTINGS.muted ? 0 : SETTINGS.ambienceVolume;
    if (!this.a) { if (vol <= 0) return; const a = audioCtx(); if (!a || a.state !== 'running') return; this.init(a); }
    const a = this.a!; this.t += dt;
    const target = vol * (ctx.outdoor ? 1 : 0.06) * (ctx.cinematic ? 0.5 : 1);
    this.level += (target - this.level) * Math.min(1, dt * 1.5);
    this.out.gain.setTargetAtTime(this.level, a.currentTime, 0.1);
    // gusts: two slow sines multiplied
    const gust = 0.5 + 0.5 * Math.sin(this.t * 0.13) * Math.sin(this.t * 0.41 + 1.3);
    const winter = ctx.season === 'winter';
    this.wind.gain.setTargetAtTime((winter ? 0.035 : 0.018) * (0.4 + gust * 0.8), a.currentTime, 0.5);   // gentle: a soft breeze, not a gale
    this.windFilter.frequency.setTargetAtTime((winter ? 520 : 360) + gust * 260, a.currentTime, 0.3);
    this.leaves.gain.setTargetAtTime(winter ? 0.001 : 0.006 * gust * gust, a.currentTime, 0.5);
    // recorded birds-and-wind loop (spring/summer/autumn); synthesized birds only as a fallback
    const buf = sampleBuffer('ambience-birds-wind');
    if (buf && !this.rec) {
      const src = a.createBufferSource(), gain = a.createGain(); src.buffer = buf; src.loop = true; gain.gain.value = 0;
      src.connect(gain).connect(this.out); src.start(); this.rec = { src, gain };
    }
    const recOn = !!this.rec && !winter;
    if (this.rec) this.rec.gain.gain.setTargetAtTime(recOn ? (ctx.season === 'autumn' ? 0.55 : 0.8) : 0, a.currentTime, 0.8);
    if (recOn) { this.wind.gain.setTargetAtTime(0, a.currentTime, 0.5); this.leaves.gain.setTargetAtTime(0, a.currentTime, 0.5); return; }
    // birds
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      const rate = winter ? 0 : ctx.season === 'autumn' ? 0.5 : ctx.season === 'summer' ? 1.2 : 1;
      if (rate > 0 && ctx.outdoor && this.level > 0.01) this.bird(a);
      this.nextBird = rate > 0 ? (1.5 + Math.random() * 4.5) / rate : 5;
    }
  }

  /** One short phrase from one of a few "species" (rising chirps, a two-tone call, a quick trill). */
  private bird(a: AudioContext) {
    const pan = a.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = a.createGain(); g.gain.value = 0.05 + Math.random() * 0.05; pan.connect(g).connect(this.out);
    const kind = Math.floor(Math.random() * 3), base = 2200 + Math.random() * 1600;
    const notes = kind === 2 ? 6 + Math.floor(Math.random() * 5) : 2 + Math.floor(Math.random() * 3);
    let t = a.currentTime + 0.05;
    for (let i = 0; i < notes; i++) {
      const o = a.createOscillator(), e = a.createGain(), dur = kind === 2 ? 0.045 : 0.09 + Math.random() * 0.07;
      const f0 = kind === 1 ? (i % 2 ? base * 0.8 : base) : base * (0.9 + Math.random() * 0.25);
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(kind === 0 ? f0 * 1.45 : kind === 1 ? f0 * 0.95 : f0 * 1.1, t + dur);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.008); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(e).connect(pan); o.start(t); o.stop(t + dur + 0.02);
      t += dur + (kind === 2 ? 0.015 : 0.05 + Math.random() * 0.08);
    }
  }
}
