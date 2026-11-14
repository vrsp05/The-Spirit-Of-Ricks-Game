// Tiny synthesized sound effects (WebAudio; no audio files). Respects the mute setting.
import { SETTINGS } from '../core/settings';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (SETTINGS.muted) return null;
  try { ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, delay = 0) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, gain = 0.15, delay = 0, lowpass = 1200) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(), t = a.currentTime + delay;
  f.type = 'lowpass'; f.frequency.value = lowpass; g.gain.value = gain;
  s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start(t);
}

export function playSound(name: 'tick' | 'error' | 'chime' | 'success' | 'cheer' | 'pop') {
  switch (name) {
    case 'tick': tone(880, 0.06, 'square', 0.05); break;
    case 'error': tone(196, 0.18, 'sawtooth', 0.06); break;
    case 'chime': tone(784, 0.25); tone(1175, 0.35, 'sine', 0.1, 0.08); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, i * 0.09)); break;
    case 'pop': noise(0.35, 0.25, 0, 900); tone(120, 0.2, 'sine', 0.08); break;
    case 'cheer': for (let i = 0; i < 6; i++) noise(0.9, 0.05, i * 0.12, 2500); break;
  }
}
