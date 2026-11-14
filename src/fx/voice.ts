// Spoken dialogue. Recorded voice-overs (public/voices, made with `npm run voices:generate`) play
// when a line has one; otherwise the browser's built-in speech synthesis reads it, with a
// consistent voice + pitch per speaker. Silent when muted or when Voices is off.
import { SETTINGS } from '../core/settings';

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export class VoiceActor {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  get supported() { return !!this.synth || this.recorded.size > 0; }
  /** normalized line text → recorded mp3 */
  private recorded = new Map<string, string>();
  private clip: HTMLAudioElement | null = null;
  private static norm(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  constructor() {
    fetch(`${import.meta.env.BASE_URL}voices/manifest.json`).then(r => (r.ok ? r.json() : {})).then((m: Record<string, { file: string; text: string }>) => {
      for (const v of Object.values(m)) this.recorded.set(VoiceActor.norm(v.text), v.file);
    }).catch(() => { /* no recordings yet */ });
    if (!this.synth) return;
    const load = () => {
      const all = this.synth!.getVoices();
      const en = all.filter(v => /^en(-|_|$)/i.test(v.lang));
      // prefer natural-sounding local voices; skip novelty voices macOS ships with
      const novelty = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Ralph|Fred|Kathy|Princess|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley/i;
      this.voices = (en.length ? en : all).filter(v => !novelty.test(v.name));
      if (!this.voices.length) this.voices = en.length ? en : all;
    };
    load(); this.synth.addEventListener?.('voiceschanged', load);
  }

  /** Read a line in the speaker's voice (cancels whatever is being said). */
  speak(speaker: string, text: string) {
    this.stop();
    if (!SETTINGS.voices || SETTINGS.muted || SETTINGS.voiceVolume <= 0 || !text.trim()) return;
    const file = this.recorded.get(VoiceActor.norm(text));
    if (file) { this.clip = new Audio(`${import.meta.env.BASE_URL}voices/${file}`); this.clip.volume = Math.min(1, SETTINGS.voiceVolume); void this.clip.play().catch(() => {}); return; }
    if (!this.synth) return;
    const name = speaker.replace(/\(.*?\)|·.*$/g, '').trim() || 'Narrator', h = hash(name);
    const u = new SpeechSynthesisUtterance(text.replace(/[★✔✖▸]/g, ''));
    if (this.voices.length) u.voice = this.voices[h % this.voices.length];
    const narrator = name === 'Narrator', leader = /Bednar|President/i.test(name);
    u.pitch = narrator ? 0.9 : leader ? 0.8 : 0.85 + ((h >> 8) % 40) / 100;     // 0.85–1.25 for everyone else
    u.rate = narrator ? 0.92 : leader ? 0.95 : 0.98 + ((h >> 16) % 12) / 100;
    u.volume = Math.min(1, SETTINGS.voiceVolume);
    this.synth.speak(u);
  }
  stop() { this.synth?.cancel(); if (this.clip) { this.clip.pause(); this.clip = null; } }
}
