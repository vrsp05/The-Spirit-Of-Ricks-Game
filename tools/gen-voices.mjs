// Records the game's dialogue with ElevenLabs.
//   npm run voices:export          → docs/voice-lines.json (all lines from the game data)
//   npm run voices:generate        → public/voices/<id>.mp3 + public/voices/manifest.json
//   npm run voices:generate -- --list    show the voices on your account
//   npm run voices:generate -- --force   re-record everything
// Needs ELEVENLABS_API_KEY in .env (never committed). Only lines whose text changed are re-recorded.
// Voices per character: tools/voices.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const env = Object.fromEntries((existsSync('.env') ? readFileSync('.env', 'utf8') : '').split('\n').map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Missing ELEVENLABS_API_KEY. Add a line  ELEVENLABS_API_KEY=your_key  to .env (it is gitignored).'); process.exit(1); }
const API = 'https://api.elevenlabs.io/v1', H = { 'xi-api-key': KEY };

if (process.argv.includes('--list')) {
  const r = await fetch(`${API}/voices`, { headers: H }); const j = await r.json();
  if (!r.ok) { console.error('ElevenLabs:', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
  for (const v of j.voices) console.log(`${v.voice_id}  ${v.name}  (${[v.labels?.gender, v.labels?.age, v.labels?.accent].filter(Boolean).join(', ')})`);
  process.exit(0);
}
const cfg = JSON.parse(readFileSync('tools/voices.json', 'utf8'));
const lines = JSON.parse(readFileSync('docs/voice-lines.json', 'utf8')).filter(l => !l.live);
mkdirSync('public/voices', { recursive: true });
const manPath = 'public/voices/manifest.json';
const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : {};
const force = process.argv.includes('--force');
const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hashOf = t => createHash('sha1').update(norm(t)).digest('hex').slice(0, 12);
let made = 0, skipped = 0, failed = 0;
for (const l of lines) {
  const h = hashOf(l.text), file = `${l.id}.mp3`;
  if (!force && manifest[h]?.file === file && existsSync(`public/voices/${file}`)) { skipped++; continue; }
  const voice = cfg.voices[l.voice] ?? cfg.fallback;
  const r = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: l.text, model_id: cfg.model, voice_settings: cfg.settings }) });
  if (!r.ok) { failed++; console.error(`✖ ${l.id}: ${r.status} ${(await r.text()).slice(0, 200)}`); if (r.status === 401 || r.status === 429) break; continue; }
  writeFileSync(`public/voices/${file}`, Buffer.from(await r.arrayBuffer()));
  manifest[h] = { file, voice: l.voice, text: l.text }; made++;
  console.log(`✔ ${l.id} (${l.voice})`);
  writeFileSync(manPath, JSON.stringify(manifest, null, 1));
}
writeFileSync(manPath, JSON.stringify(manifest, null, 1));
console.log(`Done: ${made} recorded, ${skipped} unchanged, ${failed} failed. The game plays these automatically (browser voice for anything missing).`);
