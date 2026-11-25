// Outdoor ambience, synthesized with WebAudio (no files): wind with slow gusts, leaves rustling in
// the gusts, and birdsong (short chirp phrases, panned around you). Season-aware: no birds in winter
// and a colder, stronger wind; fewer birds in autumn. Nearly silent indoors; softer during cutscenes.
// Also: the murmur of a crowd (outdoors near groups of students, and in busy rooms), a faint room tone
// indoors, ball bounces and sneaker squeaks echoing in the Hart, and the Rexburg wind whistling in big gusts.
import type { Season } from '../config/atmosphere';
import { SETTINGS } from '../core/settings';
import { audioCtx, sampleBuffer, SampleLoop } from './audio';

export class Ambience {
  private a: AudioContext | null = null;
  private out!: GainNode;
  private wind!: GainNode; private windFilter!: BiquadFilterNode;
  private leaves!: GainNode;
  private t = 0; private nextBird = 2; private level = 0;
  private rec: { src: AudioBufferSourceNode; gain: GainNode } | null = null;   // recorded birds + wind loop (CC0)
  private winterWind = new SampleLoop('wind-winter');
  // crowd murmur: three formant-like noise bands whose levels wander at syllable speed
  private murmur: { g: GainNode; bands: GainNode[]; ph: number[] } | null = null;
  private room!: GainNode; private whistle!: GainNode; private whistleF!: BiquadFilterNode;
  private nextBounce = 1; private dribble = 0;
  private crowds = { foodcourt: new SampleLoop('crowd-foodcourt'), auditorium: new SampleLoop('crowd-auditorium') };

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
    // indoor bus (not muted by the outdoor fade)
    this.room = a.createGain(); this.room.gain.value = 0; this.room.connect(a.destination);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const tone = a.createGain(); tone.gain.value = 0.05; src.connect(lp).connect(tone).connect(this.room);
    // murmur (its own gain, outdoors or in)
    const mg = a.createGain(); mg.gain.value = 0; mg.connect(a.destination);
    const bands: GainNode[] = [];
    for (const [f, q] of [[480, 2.2], [1150, 2.6], [2500, 3]] as [number, number][]) {
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = a.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(mg); bands.push(g);
    }
    this.murmur = { g: mg, bands, ph: [0, 1.7, 3.1] };
    // wind whistle (narrow band, sweeping with the gusts)
    this.whistleF = a.createBiquadFilter(); this.whistleF.type = 'bandpass'; this.whistleF.frequency.value = 900; this.whistleF.Q.value = 18;
    this.whistle = a.createGain(); this.whistle.gain.value = 0; src.connect(this.whistleF).connect(this.whistle).connect(this.out);
  }

  /** A ball bounce (and now and then a sneaker squeak) somewhere in the gym. */
  private gymSound(a: AudioContext, vol: number) {
    const pan = a.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = a.createGain(); g.gain.value = vol; pan.connect(g).connect(a.destination);
    const t = a.currentTime + 0.02;
    const hit = (at: number, amp: number) => {
      const o = a.createOscillator(), e = a.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(48, at + 0.12);
      e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(amp, at + 0.004); e.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      o.connect(e).connect(pan); o.start(at); o.stop(at + 0.2);
    };
    hit(t, 0.5); hit(t + 0.11, 0.12); hit(t + 0.23, 0.05);   // the hit plus the gym's echo
    if (Math.random() < 0.18) {
      const o = a.createOscillator(), e = a.createGain(), s0 = t + 0.05 + Math.random() * 0.2; o.type = 'triangle';
      o.frequency.setValueAtTime(2300, s0); o.frequency.linearRampToValueAtTime(3300 + Math.random() * 600, s0 + 0.07);
      e.gain.setValueAtTime(0, s0); e.gain.linearRampToValueAtTime(0.05, s0 + 0.01); e.gain.exponentialRampToValueAtTime(0.001, s0 + 0.09);
      o.connect(e).connect(pan); o.start(s0); o.stop(s0 + 0.12);
    }
  }

  /** Call every frame. */
  update(dt: number, ctx: { outdoor: boolean; season: Season; cinematic: boolean; room?: string; crowd?: number }) {
    const vol = SETTINGS.muted ? 0 : SETTINGS.ambienceVolume;
    // indoor crowds (food court chatter, auditorium murmur) and recorded winter wind, when fetched
    const k = ctx.cinematic ? 0.5 : 1;
    this.crowds.foodcourt.update(ctx.room === 'bldg-manwaring' ? vol * 0.5 * k : 0);
    this.crowds.auditorium.update(ctx.room === 'bldg-icenter' ? vol * 0.4 * k : 0);
    this.winterWind.update(ctx.outdoor && ctx.season === 'winter' ? vol * 0.35 * k : 0);
    if (!this.a) { if (vol <= 0) return; const a = audioCtx(); if (!a || a.state !== 'running') return; this.init(a); }
    const a = this.a!; this.t += dt;
    const target = vol * (ctx.outdoor ? 1 : 0.06) * (ctx.cinematic ? 0.5 : 1);
    this.level += (target - this.level) * Math.min(1, dt * 1.5);
    this.out.gain.setTargetAtTime(this.level, a.currentTime, 0.1);
    // gusts: two slow sines multiplied
    const gust = 0.5 + 0.5 * Math.sin(this.t * 0.13) * Math.sin(this.t * 0.41 + 1.3);
    const winter = ctx.season === 'winter';
    // the Rexburg wind whistles past corners in the strongest gusts
    const strong = Math.max(0, gust - 0.72) / 0.28;
    this.whistle.gain.setTargetAtTime(strong * (winter ? 0.05 : 0.025), a.currentTime, 0.6);
    this.whistleF.frequency.setTargetAtTime(760 + strong * 520 + Math.sin(this.t * 0.9) * 90, a.currentTime, 0.4);
    // indoors: a soft room tone, plus a murmur in busy rooms; outdoors the murmur follows nearby crowds
    const room = ctx.room ?? 'exterior', busyRoom = /manwaring|strike|icenter|hart|crossroads/.test(room) ? 1 : /mckay|kimball-office|home/.test(room) ? 0.12 : 0.45;
    const k2 = ctx.cinematic ? 0.5 : 1, inRoom = !ctx.outdoor && room !== 'exterior' && room !== 'title';
    this.room.gain.setTargetAtTime(inRoom ? vol * 0.6 * k2 : 0, a.currentTime, 0.4);
    const crowd = ctx.outdoor ? Math.min(1, ctx.crowd ?? 0) : inRoom ? busyRoom : 0;
    if (this.murmur) {
      this.murmur.g.gain.setTargetAtTime(vol * crowd * 0.09 * k2, a.currentTime, 0.6);
      this.murmur.bands.forEach((b, i) => {
        this.murmur!.ph[i] += dt * (3 + i * 1.3 + Math.random() * 2);
        const syll = 0.35 + 0.65 * Math.abs(Math.sin(this.murmur!.ph[i])) * (0.6 + Math.random() * 0.4);
        b.gain.setTargetAtTime([1, 0.6, 0.25][i] * syll, a.currentTime, 0.05);
      });
    }
    // the Hart: balls bouncing on the courts
    if (room === 'bldg-hart' && vol > 0) {
      this.nextBounce -= dt;
      if (this.nextBounce <= 0) {
        this.gymSound(a, vol * 0.22 * k2);
        if (this.dribble > 0) { this.dribble--; this.nextBounce = 0.4 + Math.random() * 0.12; } else { this.dribble = 2 + Math.floor(Math.random() * 6); this.nextBounce = 0.8 + Math.random() * 2.5; }
      }
    }
    this.wind.gain.setTargetAtTime(winter && this.winterWind.available() ? 0 : (winter ? 0.035 : 0.018) * (0.4 + gust * 0.8), a.currentTime, 0.5);   // gentle: a soft breeze, not a gale
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
