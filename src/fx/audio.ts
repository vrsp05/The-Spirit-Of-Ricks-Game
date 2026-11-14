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
  'step-grass': [0, 1, 2, 3, 4].map(i => `step-grass-${i}`), 'step-concrete': [0, 1, 2, 3, 4].map(i => `step-concrete-${i}`),
  'step-snow': [0, 1, 2, 3, 4].map(i => `step-snow-${i}`), 'step-wood': [0, 1, 2, 3, 4].map(i => `step-wood-${i}`),
};
const GAIN: Record<string, number> = { coin: 0.7, tick: 0.5, chime: 0.6, success: 0.6, error: 0.5, sit: 0.6, door: 0.8, doorClose: 0.8, carDoor: 0.5 };
const buffers = new Map<string, AudioBuffer>();
let loading = false;
/** Fetch + decode all samples once the audio context exists (after the first click). */
export function loadSamples() {
  const a = audioCtx(); if (!a || loading) return; loading = true;
  const files = new Set(Object.values(SAMPLES).flat().concat(['ambience-birds-wind']));
  for (const f of files) {
    fetch(`${import.meta.env.BASE_URL}sfx/${f}.m4a`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
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
/** Footstep on a surface (quiet; random variant). */
export function playStep(surface: 'grass' | 'concrete' | 'snow' | 'wood', volume = 0.35) { if (!playSample(`step-${surface}`, volume)) playSound('step'); }

export type SoundName = 'tick' | 'error' | 'chime' | 'success' | 'cheer' | 'pop' | 'coin' | 'door' | 'carDoor' | 'bell' | 'whoosh' | 'sit' | 'engineStart' | 'step';
export function playSound(name: SoundName) {
  if (name !== 'step' && playSample(name === 'door' ? 'door' : name)) { if (name === 'door') setTimeout(() => playSample('doorClose'), 650); return; }
  switch (name) {
    case 'tick': tone(880, 0.06, 'square', 0.05); break;
    case 'error': tone(196, 0.18, 'sawtooth', 0.06); break;
    case 'chime': tone(784, 0.25); tone(1175, 0.35, 'sine', 0.1, 0.08); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, i * 0.09)); break;
    case 'pop': noise(0.35, 0.25, 0, 900); tone(120, 0.2, 'sine', 0.08); break;
    case 'cheer': for (let i = 0; i < 6; i++) noise(0.9, 0.05, i * 0.12, 2500); break;
    case 'coin': tone(988, 0.08, 'square', 0.06); tone(1319, 0.28, 'square', 0.06, 0.07); break;            // classic two-note pickup
    case 'door': tone(240, 0.25, 'sawtooth', 0.025, 0, 170); noise(0.12, 0.25, 0.22, 500); tone(70, 0.18, 'sine', 0.14, 0.22); break;   // creak + latch thud
    case 'carDoor': noise(0.08, 0.3, 0, 700); tone(90, 0.12, 'sine', 0.16); break;
    case 'bell': [0, 0.16].forEach(d => { tone(2350, 0.5, 'sine', 0.06, d); tone(3520, 0.35, 'sine', 0.025, d); }); break;
    case 'whoosh': noise(0.9, 0.12, 0, 900, 120); break;
    case 'sit': noise(0.1, 0.18, 0, 400); tone(110, 0.1, 'sine', 0.06); break;
    case 'engineStart': tone(55, 0.5, 'sawtooth', 0.05, 0, 95); noise(0.5, 0.06, 0, 300); break;
    case 'step': noise(0.05, 0.05, 0, 900, 200); break;
  }
}

/** Continuous engine hum for the vehicle you drive (pitch follows speed). */
export class EngineSound {
  private o: OscillatorNode | null = null; private o2: OscillatorNode | null = null; private g: GainNode | null = null; private f: BiquadFilterNode | null = null;
  update(on: boolean, speed: number, kind: 'car' | 'cart' | 'scooter') {
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
