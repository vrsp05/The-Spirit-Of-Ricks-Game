// Samples USGS 3DEP elevation (public domain) via the EPQS service on a grid.
// Usage: npm run data:fetch-elevation -> data/raw/elevation.json
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { BBOX, ORIGIN, ELEV_STEP_M } from './geo-config.mjs';
const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * ORIGIN.lat * Math.PI / 180);
const mPerDegLon = 111412.84 * Math.cos(ORIGIN.lat * Math.PI / 180);
const dLat = ELEV_STEP_M / mPerDegLat, dLon = ELEV_STEP_M / mPerDegLon;
const rows = Math.ceil((BBOX.north - BBOX.south) / dLat) + 1;
const cols = Math.ceil((BBOX.east - BBOX.west) / dLon) + 1;
const pts = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
  pts.push({ r, c, lat: BBOX.north - r * dLat, lon: BBOX.west + c * dLon });
const out = new Array(rows * cols).fill(null);
// Reuse samples from a previous run on the same grid (only new rows/cols are fetched).
if (existsSync('data/raw/elevation.json')) {
  const old = JSON.parse(readFileSync('data/raw/elevation.json', 'utf8'));
  if (Math.abs(old.north - BBOX.north) < 1e-9 && Math.abs(old.west - BBOX.west) < 1e-9 && Math.abs(old.dLat - dLat) < 1e-12 && Math.abs(old.dLon - dLon) < 1e-12) {
    for (let r = 0; r < Math.min(rows, old.rows); r++) for (let c = 0; c < Math.min(cols, old.cols); c++) {
      const v = old.values[r * old.cols + c]; if (v != null) out[r * cols + c] = v;
    }
  }
}
const todo = pts.filter(p => out[p.r * cols + p.c] == null);
console.log('fetching', todo.length, 'of', pts.length, 'samples');
let i = 0;
async function worker() {
  while (i < todo.length) {
    const p = todo[i++];
    for (let tries = 0; tries < 4; tries++) {
      try {
        const u = `https://epqs.nationalmap.gov/v1/json?x=${p.lon}&y=${p.lat}&units=Meters&wkid=4326`;
        const j = await (await fetch(u)).json();
        const v = parseFloat(j.value);
        if (!Number.isFinite(v) || v < -1000) throw new Error('no data');
        out[p.r * cols + p.c] = Math.round(v * 100) / 100; break;
      } catch { await new Promise(r => setTimeout(r, 500 * (tries + 1))); }
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync('data/raw/elevation.json', JSON.stringify({
  source: 'USGS 3DEP via EPQS (public domain)', fetched: new Date().toISOString(),
  north: BBOX.north, west: BBOX.west, dLat, dLon, rows, cols, values: out,
}));
console.log(rows, 'x', cols, 'missing:', out.filter(v => v == null).length);
