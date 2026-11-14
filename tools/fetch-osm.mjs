// Downloads OpenStreetMap data (ODbL, © OpenStreetMap contributors) for BBOX.
// Usage: npm run data:fetch-osm   -> data/raw/osm-campus.json
import { writeFileSync } from 'node:fs';
import { BBOX } from './geo-config.mjs';
const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const q = `[out:json][timeout:90];(
  way["building"](${b}); relation["building"](${b});
  way["highway"](${b});
  way["leisure"](${b}); way["landuse"](${b}); way["natural"](${b});
  way["amenity"="parking"](${b});
  relation["amenity"="university"](${b});
);out geom;`;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let res;
for (let attempt = 0; attempt < 6; attempt++) {
  const url = ENDPOINTS[attempt % ENDPOINTS.length];
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'voxel-campus-game-dev/0.1' },
      body: 'data=' + encodeURIComponent(q),
    });
    if (res.ok) break;
    console.warn(url, 'HTTP', res.status);
  } catch (e) { console.warn(url, e.message); }
  await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
}
if (!res?.ok) throw new Error('Overpass unavailable');
const json = await res.json();
json.fetched = new Date().toISOString();
writeFileSync('data/raw/osm-campus.json', JSON.stringify(json));
console.log('elements:', json.elements.length);
