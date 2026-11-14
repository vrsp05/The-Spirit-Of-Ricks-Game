// Downloads CC0 sound effects from Freesound (freesound.org) for the game.
//   npm run sounds:fetch              fetch anything missing
//   npm run sounds:fetch -- --force   re-pick everything
// Needs FREESOUND_API_KEY in .env (free: https://freesound.org/apiv2/apply). Only CC0 sounds are
// used (public domain: no attribution required, credits written anyway). The best-rated match
// within the duration range is downloaded as its high-quality MP3 preview into public/sfx/.
// Edit WANTED to change a search; delete a file (or use --force) to pick again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const WANTED = [
  { name: 'engine-car', query: 'car engine idle loop', dur: [3, 25] },
  { name: 'engine-cart', query: 'electric golf cart motor', dur: [2, 25] },
  { name: 'engine-scooter', query: 'electric scooter riding', dur: [2, 25] },
  { name: 'bike-bell', query: 'bicycle bell ring', dur: [0.2, 3] },
  { name: 'car-pass', query: 'car passing by', dur: [1, 7] },
  { name: 'wind-winter', query: 'cold winter wind loop', dur: [15, 120] },
  { name: 'crowd-foodcourt', query: 'cafeteria crowd chatter', dur: [20, 120] },
  { name: 'crowd-auditorium', query: 'auditorium audience murmur', dur: [20, 120] },
  { name: 'basketball-bounce', query: 'basketball bounce single', dur: [0.15, 1.5] },
  { name: 'ball-kick', query: 'soccer ball kick', dur: [0.15, 1.5] },
  { name: 'jetpack', query: 'rocket thruster loop', dur: [2, 20] },
];

const env = Object.fromEntries((existsSync('.env') ? readFileSync('.env', 'utf8') : '').split('\n').map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const KEY = process.env.FREESOUND_API_KEY || env.FREESOUND_API_KEY;
if (!KEY) { console.error('Missing FREESOUND_API_KEY. Get a free key at https://freesound.org/apiv2/apply and add  FREESOUND_API_KEY=your_key  to .env (it is gitignored).'); process.exit(1); }
const force = process.argv.includes('--force');
const credPath = 'public/sfx/freesound-credits.json';
const credits = existsSync(credPath) ? JSON.parse(readFileSync(credPath, 'utf8')) : {};

for (const w of WANTED) {
  const file = `public/sfx/${w.name}.mp3`;
  if (!force && existsSync(file)) { console.log(`· ${w.name} (already there)`); continue; }
  const filter = `license:"Creative Commons 0" duration:[${w.dur[0]} TO ${w.dur[1]}]`;
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(w.query)}&filter=${encodeURIComponent(filter)}&sort=rating_desc&page_size=8&fields=id,name,username,license,previews,duration,avg_rating,num_ratings,url&token=${KEY}`;
  const r = await fetch(url); const j = await r.json();
  if (!r.ok) { console.error(`✖ ${w.name}: Freesound ${r.status} ${JSON.stringify(j).slice(0, 200)}`); if (r.status === 401) break; continue; }
  const pick = (j.results ?? []).filter(x => x.num_ratings >= 2).sort((a, b) => b.avg_rating - a.avg_rating)[0] ?? j.results?.[0];
  if (!pick) { console.error(`✖ ${w.name}: no CC0 match for "${w.query}"`); continue; }
  const a = await fetch(pick.previews['preview-hq-mp3']);
  if (!a.ok) { console.error(`✖ ${w.name}: download ${a.status}`); continue; }
  writeFileSync(file, Buffer.from(await a.arrayBuffer()));
  credits[w.name] = { title: pick.name, author: pick.username, url: pick.url, license: pick.license, duration: Math.round(pick.duration * 10) / 10 };
  console.log(`✔ ${w.name} ← "${pick.name}" by ${pick.username} (${pick.duration.toFixed(1)} s, ★${(pick.avg_rating ?? 0).toFixed(1)})`);
}
writeFileSync(credPath, JSON.stringify(credits, null, 1));
console.log('Done. Credits in public/sfx/freesound-credits.json. The game uses these automatically (synthesized fallback otherwise).');
