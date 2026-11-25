// Sound effects. Recorded samples from CC0 libraries (public/sfx, see public/sfx/CREDITS.md) are
// played when loaded; until then — or if the browser can't decode them — a synthesized fallback
// plays instead. Respects Mute and the effects volume.
import { SETTINGS } from '../core/settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Shared audio context (created/resumed on demand; null when muted or unavailable). */
export function audioCtx(): AudioContext | null {
  if (SETTINGS.muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
function out(a: AudioContext): AudioNode {
  if (!master) { master = a.createGain(); master.connect(a.destination); }
  master.gain.value = SETTINGS.sfxVolume;
  return master;
}
function ac() { const a = audioCtx(); return a && SETTINGS.sfxVolume > 0 ? a : null; }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, delay = 0, slideTo?: number) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out(a)); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, gain = 0.15, delay = 0, lowpass = 1200, highpass = 0) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(), t = a.currentTime + delay;
  f.type = 'lowpass'; f.frequency.value = lowpass; g.gain.value = gain;
  let chain: AudioNode = s.connect(f);
  if (highpass) { const h = a.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = highpass; chain = chain.connect(h); }
  s.buffer = buf; chain.connect(g).connect(out(a)); s.start(t);
}

// ---------- recorded samples ----------
const SAMPLES: Record<string, string[]> = {
  door: ['door-open'], doorClose: ['door-close'], carDoor: ['car-door'], coin: ['coin', 'coin-2'],
  tick: ['tick'], chime: ['chime'], success: ['success'], error: ['error'], sit: ['sit'],
  bell: ['bike-bell'], whoosh: ['car-pass'], bounce: ['basketball-bounce'], kick: ['ball-kick'],   // Freesound (optional)
};
const GAIN: Record<string, number> = { coin: 0.5, tick: 0.5, chime: 0.6, success: 0.6, error: 0.5, sit: 0.35, door: 0.7, doorClose: 0.6, carDoor: 0.45 };
const buffers = new Map<string, AudioBuffer>();
let loading = false;
/** Fetch + decode all samples once the audio context exists (after the first click). */
export function loadSamples() {
  const a = audioCtx(); if (!a || loading) return; loading = true;
  const files = new Set(Object.values(SAMPLES).flat().concat(['ambience-birds-wind', 'engine-car', 'engine-cart', 'engine-scooter', 'jetpack', 'wind-winter', 'crowd-foodcourt', 'crowd-auditorium']));
  // Kenney/OpenGameArt files are .m4a; Freesound downloads (npm run sounds:fetch) are .mp3 — use whichever exists
  const get = (f: string) => fetch(`${import.meta.env.BASE_URL}sfx/${f}.m4a`).then(r => (r.ok && !r.headers.get('content-type')?.includes('html') ? r : fetch(`${import.meta.env.BASE_URL}sfx/${f}.mp3`)));
  for (const f of files) {
    get(f).then(r => (r.ok && !r.headers.get('content-type')?.includes('html') ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => a.decodeAudioData(b)).then(buf => { buffers.set(f, buf); }).catch(() => { /* keep the synthesized fallback */ });
  }
}
export function sampleBuffer(name: string) { return buffers.get(name) ?? null; }
/** Play a loaded sample (random variant, slight pitch variation). Returns false if not available. */
function playSample(name: string, gain = 1, rate = 1): boolean {
  const a = ac(); const list = SAMPLES[name]; if (!a || !list) return false;
  const buf = buffers.get(list[(Math.random() * list.length) | 0]); if (!buf) return false;
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; src.playbackRate.value = rate * (0.96 + Math.random() * 0.08); g.gain.value = gain * (GAIN[name] ?? 1);
  src.connect(g).connect(out(a)); src.start();
  return true;
}
// ---------- footsteps (synthesized: heel + toe, soft attack, shaped by the surface) ----------
// Recorded "impact" one-shots sounded like gunshots when repeated several times a second. A footstep is
// really two soft contacts (heel, then the ball of the foot ~50 ms later) with a short scuff; the surface
// decides the colour: a low thud and a dry tap on concrete and tile, a hollow knock on wood, a rustle on
// grass, a granular crunch in snow, a muffled pat on carpet.
export type Surface = 'grass' | 'concrete' | 'snow' | 'wood' | 'carpet' | 'tile';
let NOISE: AudioBuffer | null = null;
function noiseBuf(a: AudioContext) {
  if (!NOISE || NOISE.sampleRate !== a.sampleRate) {
    NOISE = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = NOISE.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.85 * b + 0.15 * w; d[i] = w * 0.6 + b * 0.8; }   // white + a little pink
  }
  return NOISE;
}
const jit = (v: number, k = 0.15) => v * (1 + (Math.random() * 2 - 1) * k);
/** One filtered noise grain: smooth attack (no click), exponential decay. */
function grain(a: AudioContext, dest: AudioNode, t: number, o: { type: BiquadFilterType; f: number; q?: number; gain: number; attack?: number; decay: number; lp?: number }) {
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf(a); f.type = o.type; f.frequency.value = o.f; f.Q.value = o.q ?? 0.8;
  const at = o.attack ?? 0.004;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.gain, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + o.decay);
  let chain: AudioNode = src.connect(f);
  if (o.lp) { const l = a.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = o.lp; chain = chain.connect(l); }
  chain.connect(g).connect(dest);
  src.start(t, Math.random() * 0.8, at + o.decay + 0.05);
}
/** A soft low thump (the body weight landing). */
function thump(a: AudioContext, dest: AudioNode, t: number, freq: number, gain: number, decay: number) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.4, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(dest); o.start(t); o.stop(t + decay + 0.05);
}
let lastStep = 0;
/** A footstep. intensity: ~0.6 walking, ~1 running. indoor adds a faint room reflection. */
export function playStep(surface: Surface, intensity = 0.6, indoor = false) {
  const a = ac(); if (!a) return;
  const now = a.currentTime; if (now - lastStep < 0.08) return; lastStep = now;
  let dest: AudioNode = out(a);
  const v = a.createGain(); v.gain.value = 0.55 * Math.min(1.2, intensity); v.connect(dest); dest = v;
  if (indoor) { const d = a.createDelay(0.2), fb = a.createGain(), lp = a.createBiquadFilter(); d.delayTime.value = 0.028 + Math.random() * 0.01; fb.gain.value = 0.22; lp.type = 'lowpass'; lp.frequency.value = 1800; v.connect(d).connect(lp).connect(fb).connect(out(a)); }
  const t = now + 0.005, toe = t + jit(intensity > 0.85 ? 0.035 : 0.055, 0.2), run = intensity > 0.85;
  switch (surface) {
    case 'concrete': case 'tile':
      thump(a, dest, t, jit(surface === 'tile' ? 95 : 80), 0.09, 0.06);
      grain(a, dest, t, { type: 'bandpass', f: jit(surface === 'tile' ? 2600 : 1700), q: 0.9, gain: 0.05, decay: 0.035 });
      grain(a, dest, toe, { type: 'bandpass', f: jit(surface === 'tile' ? 3400 : 2400), q: 1.1, gain: 0.03, decay: 0.03 });
      if (Math.random() < (run ? 0.6 : 0.3)) grain(a, dest, toe + 0.02, { type: 'highpass', f: 2500, gain: 0.012, attack: 0.02, decay: 0.07 });   // grit scuff
      break;
    case 'wood':
      thump(a, dest, t, jit(115), 0.1, 0.09); thump(a, dest, t + 0.004, jit(230), 0.03, 0.06);
      grain(a, dest, t, { type: 'bandpass', f: jit(900), q: 1.2, gain: 0.04, decay: 0.05 });
      grain(a, dest, toe, { type: 'bandpass', f: jit(1300), q: 1.2, gain: 0.025, decay: 0.04 });
      if (Math.random() < 0.15) grain(a, dest, toe + 0.05, { type: 'bandpass', f: jit(650), q: 8, gain: 0.01, attack: 0.02, decay: 0.12 });   // a board creaks
      break;
    case 'carpet':
      thump(a, dest, t, jit(70), 0.07, 0.07);
      grain(a, dest, t, { type: 'lowpass', f: jit(600), gain: 0.04, attack: 0.008, decay: 0.06 });
      grain(a, dest, toe, { type: 'lowpass', f: jit(800), gain: 0.025, attack: 0.008, decay: 0.05 });
      break;
    case 'grass': {
      thump(a, dest, t, jit(65), 0.045, 0.06);
      for (let i = 0; i < 7; i++) grain(a, dest, t + i * jit(0.014, 0.4), { type: 'highpass', f: jit(2200), gain: jit(0.022, 0.4), attack: 0.003, decay: jit(0.03, 0.4), lp: 7000 });   // blades rustling
      grain(a, dest, toe, { type: 'bandpass', f: jit(3200), q: 0.6, gain: 0.015, attack: 0.01, decay: 0.08 });
      break;
    }
    case 'snow': {
      thump(a, dest, t, jit(60), 0.05, 0.08);
      const n = run ? 16 : 12;
      for (let i = 0; i < n; i++) { const k = i / n; grain(a, dest, t + k * jit(0.17, 0.2) + Math.random() * 0.01, { type: 'bandpass', f: jit(1400 + Math.random() * 2600), q: 1.5, gain: 0.035 * (1 - k * 0.6), attack: 0.002, decay: 0.012 + Math.random() * 0.02 }); }   // the crunch
      break;
    }
  }
}

export type SoundName = 'tick' | 'error' | 'chime' | 'success' | 'cheer' | 'pop' | 'coin' | 'door' | 'carDoor' | 'bell' | 'whoosh' | 'sit' | 'engineStart' | 'step' | 'bounce' | 'kick' | 'boom' | 'splat' | 'bite';
export function playSound(name: SoundName) {
  if (name !== 'step' && playSample(name === 'door' ? 'door' : name)) { if (name === 'door') setTimeout(() => playSample('doorClose'), 650); return; }
  switch (name) {
    case 'tick': tone(880, 0.06, 'square', 0.05); break;
    case 'error': tone(196, 0.18, 'sawtooth', 0.06); break;
    case 'chime': tone(784, 0.25); tone(1175, 0.35, 'sine', 0.1, 0.08); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, i * 0.09)); break;
    case 'pop': tone(420, 0.09, 'sine', 0.07, 0, 980); tone(1300, 0.05, 'triangle', 0.02, 0.02); break;   // a light "bloop" (pick-ups)
    case 'boom': { const a = ac(); if (a) { thump(a, out(a), a.currentTime, 48, 0.22, 0.7); grain(a, out(a), a.currentTime, { type: 'lowpass', f: 500, gain: 0.12, attack: 0.008, decay: 0.9 }); grain(a, out(a), a.currentTime + 0.05, { type: 'bandpass', f: 2500, q: 0.7, gain: 0.02, attack: 0.05, decay: 1.2 }); } break; }   // distant firework
    case 'splat': { const a = ac(); if (a) { grain(a, out(a), a.currentTime, { type: 'bandpass', f: 1200, q: 0.7, gain: 0.08, attack: 0.003, decay: 0.12 }); thump(a, out(a), a.currentTime, 90, 0.06, 0.08); } break; }   // snowball / water balloon
    case 'bite': { const a = ac(); if (a) for (let i = 0; i < 3; i++) grain(a, out(a), a.currentTime + i * 0.05, { type: 'bandpass', f: 2200 + i * 600, q: 1.5, gain: 0.03, attack: 0.002, decay: 0.03 }); break; }   // a crunchy bite
    case 'cheer': { const a = ac(); if (a) for (let i = 0; i < 18; i++) grain(a, out(a), a.currentTime + Math.random() * 0.6, { type: 'bandpass', f: 500 + Math.random() * 1400, q: 3, gain: 0.025, attack: 0.15, decay: 0.8 + Math.random() * 0.6 }); break; }   // a crowd of voices
    case 'kick': { const a = ac(); if (a) { thump(a, out(a), a.currentTime, 110, 0.12, 0.09); grain(a, out(a), a.currentTime, { type: 'bandpass', f: 1600, gain: 0.04, decay: 0.03 }); } break; }
    case 'bounce': { const a = ac(); if (a) { thump(a, out(a), a.currentTime, 150, 0.12, 0.12); grain(a, out(a), a.currentTime, { type: 'bandpass', f: 900, q: 2, gain: 0.03, decay: 0.05 }); } break; }
    case 'coin': tone(988, 0.08, 'square', 0.06); tone(1319, 0.28, 'square', 0.06, 0.07); break;            // classic two-note pickup
    case 'door': tone(240, 0.25, 'sawtooth', 0.025, 0, 170); noise(0.12, 0.25, 0.22, 500); tone(70, 0.18, 'sine', 0.14, 0.22); break;   // creak + latch thud
    case 'carDoor': noise(0.08, 0.12, 0, 700); tone(90, 0.12, 'sine', 0.1); break;
    case 'bell': [0, 0.16].forEach(d => { tone(2350, 0.5, 'sine', 0.06, d); tone(3520, 0.35, 'sine', 0.025, d); }); break;
    case 'whoosh': noise(0.9, 0.12, 0, 900, 120); break;
    case 'sit': noise(0.1, 0.18, 0, 400); tone(110, 0.1, 'sine', 0.06); break;
    case 'engineStart': tone(55, 0.5, 'sawtooth', 0.05, 0, 95); noise(0.5, 0.06, 0, 300); break;
    case 'step': playStep('concrete'); break;
  }
}

/** A looping recorded sample (engine, jetpack, crowd) with live gain/pitch. */
export class SampleLoop {
  private src: AudioBufferSourceNode | null = null; private g: GainNode | null = null;
  constructor(private name: string) {}
  available() { return !!buffers.get(this.name); }
  update(gain: number, rate = 1) {
    const a = gain > 0.001 ? ac() : null, buf = buffers.get(this.name);
    if (!a || !buf) { this.stop(); return; }
    if (!this.src) { this.src = a.createBufferSource(); this.g = a.createGain(); this.src.buffer = buf; this.src.loop = true; this.g.gain.value = 0; this.src.connect(this.g).connect(out(a)); this.src.start(); }
    this.g!.gain.setTargetAtTime(gain, a.currentTime, 0.15); this.src.playbackRate.setTargetAtTime(rate, a.currentTime, 0.15);
  }
  stop() { if (!this.src) return; const s = this.src, g = this.g!; g.gain.setTargetAtTime(0, s.context.currentTime, 0.08); setTimeout(() => { try { s.stop(); } catch { /* stopped */ } }, 300); this.src = null; this.g = null; }
}

/** Continuous engine hum for the vehicle you drive (pitch follows speed). Uses a recorded loop if one was fetched. */
export class EngineSound {
  private loops = { car: new SampleLoop('engine-car'), cart: new SampleLoop('engine-cart'), scooter: new SampleLoop('engine-scooter') };
  private o: OscillatorNode | null = null; private o2: OscillatorNode | null = null; private g: GainNode | null = null; private f: BiquadFilterNode | null = null;
  update(on: boolean, speed: number, kind: 'car' | 'cart' | 'scooter') {
    for (const [k, l] of Object.entries(this.loops)) if (k !== kind || !on) l.update(0);
    const rec = this.loops[kind];
    if (on && rec.available()) { this.stop(); const s = Math.min(1, Math.abs(speed) / (kind === 'scooter' ? 8.5 : 20)); rec.update(0.35 + s * 0.4, 0.8 + s * 0.7); return; }
    const a = on ? ac() : null;
    if (!a) { this.stop(); return; }
    if (!this.o) {
      this.o = a.createOscillator(); this.o2 = a.createOscillator(); this.g = a.createGain(); this.f = a.createBiquadFilter();
      this.o.type = 'sawtooth'; this.o2.type = 'square'; this.f.type = 'lowpass'; this.f.frequency.value = 420; this.g.gain.value = 0;
      this.o.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g).connect(out(a)); this.o.start(); this.o2.start();
    }
    const s = Math.min(1, Math.abs(speed) / (kind === 'scooter' ? 8.5 : 20)), base = kind === 'scooter' ? 210 : kind === 'cart' ? 70 : 42;   // scooter: thin electric whine
    const t = a.currentTime;
    this.o.frequency.setTargetAtTime(base + s * (kind === 'cart' ? 60 : 110), t, 0.15);
    this.o2!.frequency.setTargetAtTime((base + s * 110) * 0.5, t, 0.15);
    this.g!.gain.setTargetAtTime((kind === 'scooter' ? 0.012 * s : kind === 'cart' ? 0.025 : 0.04) * (0.5 + s), t, 0.2);
  }
  stop() {
    if (!this.o) return;
    const a = ctx!; this.g!.gain.setTargetAtTime(0, a.currentTime, 0.1);
    const o = this.o, o2 = this.o2; setTimeout(() => { try { o.stop(); o2!.stop(); } catch { /* already stopped */ } }, 400);
    this.o = this.o2 = null; this.g = null; this.f = null;
  }
}
