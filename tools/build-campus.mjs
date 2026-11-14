// Converts raw reference data into compact local game data.
//   in : data/raw/osm-campus.json (ODbL), data/raw/elevation.json (USGS, public domain)
//   out: src/world/data/campus.generated.json
// Projection: local tangent plane at ORIGIN, metres. x = east, z = south (north = -z).
// Re-run with `npm run data:build` after re-fetching. Do not hand-edit the output;
// curated historical metadata lives in src/world/buildingRegistry.ts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ORIGIN, BBOX } from './geo-config.mjs';

const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * ORIGIN.lat * Math.PI / 180);
const mPerDegLon = 111412.84 * Math.cos(ORIGIN.lat * Math.PI / 180);
const toLocal = (lat, lon) => [
  Math.round((lon - ORIGIN.lon) * mPerDegLon * 10) / 10,
  Math.round(-(lat - ORIGIN.lat) * mPerDegLat * 10) / 10,
];
const osm = JSON.parse(readFileSync('data/raw/osm-campus.json', 'utf8'));
const elev = JSON.parse(readFileSync('data/raw/elevation.json', 'utf8'));

// Fill any missing samples (service hiccups) from neighbour averages.
for (let pass = 0; pass < 10 && elev.values.some(v => v == null); pass++) {
  const next = elev.values.slice();
  for (let r = 0; r < elev.rows; r++) for (let c = 0; c < elev.cols; c++) {
    if (elev.values[r * elev.cols + c] != null) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => elev.values[(r + dr) * elev.cols + c + dc])
      .filter((v, i) => v != null && r + [1, -1, 0, 0][i] >= 0 && r + [1, -1, 0, 0][i] < elev.rows && c + [0, 0, 1, -1][i] >= 0 && c + [0, 0, 1, -1][i] < elev.cols);
    if (nb.length) next[r * elev.cols + c] = nb.reduce((a, b) => a + b, 0) / nb.length;
  }
  elev.values = next;
}
// ---------- terrain: resample USGS lat/lon grid to a local 10 m grid ----------
const [minX, maxZ] = toLocal(BBOX.south, BBOX.west);
const [maxX, minZ] = toLocal(BBOX.north, BBOX.east);
const STEP = 10;
const tx0 = Math.ceil(minX / STEP) * STEP, tz0 = Math.ceil(minZ / STEP) * STEP;
const tCols = Math.floor((maxX - tx0) / STEP) + 1, tRows = Math.floor((maxZ - tz0) / STEP) + 1;
function srcSample(lat, lon) {
  const fr = (elev.north - lat) / elev.dLat, fc = (lon - elev.west) / elev.dLon;
  const r0 = Math.max(0, Math.min(elev.rows - 2, Math.floor(fr)));
  const c0 = Math.max(0, Math.min(elev.cols - 2, Math.floor(fc)));
  const ar = Math.min(1, Math.max(0, fr - r0)), ac = Math.min(1, Math.max(0, fc - c0));
  const v = (r, c) => elev.values[r * elev.cols + c];
  return (v(r0, c0) * (1 - ac) + v(r0, c0 + 1) * ac) * (1 - ar) + (v(r0 + 1, c0) * (1 - ac) + v(r0 + 1, c0 + 1) * ac) * ar;
}
const heights = [];
let base = Infinity;
for (let r = 0; r < tRows; r++) for (let c = 0; c < tCols; c++) {
  const x = tx0 + c * STEP, z = tz0 + r * STEP;
  const lat = ORIGIN.lat - z / mPerDegLat, lon = ORIGIN.lon + x / mPerDegLon;
  const h = srcSample(lat, lon); heights.push(h); base = Math.min(base, h);
}
const terrain = {
  x0: tx0, z0: tz0, step: STEP, cols: tCols, rows: tRows,
  baseElevationM: Math.round(base * 100) / 100,
  heights: heights.map(h => Math.round((h - base) * 100) / 100),
};

// ---------- geometry helpers ----------
const ring = g => g.map(p => toLocal(p.lat, p.lon));
function stitch(ways) { // join member ways into closed rings
  const segs = ways.map(w => w.slice()); const rings = [];
  while (segs.length) {
    let cur = segs.shift();
    let guard = 0;
    while (guard++ < 500) {
      const a = cur[0], b = cur[cur.length - 1];
      if (a.lat === b.lat && a.lon === b.lon) break;
      const i = segs.findIndex(s => (s[0].lat === b.lat && s[0].lon === b.lon) || (s[s.length - 1].lat === b.lat && s[s.length - 1].lon === b.lon));
      if (i < 0) break;
      let s = segs.splice(i, 1)[0];
      if (!(s[0].lat === b.lat && s[0].lon === b.lon)) s = s.reverse();
      cur = cur.concat(s.slice(1));
    }
    rings.push(cur);
  }
  return rings;
}
function outerRings(el) {
  if (el.type === 'way') return [el.geometry];
  const outs = (el.members || []).filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry);
  return stitch(outs);
}
const area = poly => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]); return Math.abs(a / 2); };

// ---------- buildings ----------
const buildings = [];
for (const el of osm.elements) {
  const t = el.tags || {};
  if (!t.building || el.type === 'node') continue;
  for (const g of outerRings(el)) {
    if (!g || g.length < 4) continue;
    const poly = ring(g); poly.pop(); // drop duplicated closing vertex
    if (area(poly) < 12) continue;
    buildings.push({
      osm: `${el.type[0]}${el.id}`, name: t.name || null, type: t.building,
      levels: t['building:levels'] ? parseFloat(t['building:levels']) : null,
      height: t.height ? parseFloat(t.height) : null, amenity: t.amenity || null, poly,
    });
  }
}

// ---------- roads & paths ----------
const WIDTH = { motorway: 14, trunk: 14, primary: 13, secondary: 12, tertiary: 11, residential: 9, unclassified: 8, service: 5, living_street: 7, pedestrian: 6, footway: 2.6, path: 2.2, cycleway: 2.5, steps: 2.6, track: 3 };
const roads = [];
for (const el of osm.elements) {
  const t = el.tags || {};
  if (!t.highway || el.type !== 'way' || !WIDTH[t.highway]) continue;
  if (t.area === 'yes') continue;
  if (t.footway === 'sidewalk' && t.highway === 'footway') { /* keep sidewalks: they are real routes */ }
  roads.push({ osm: `w${el.id}`, kind: t.highway, name: t.name || null, width: WIDTH[t.highway], oneway: t.oneway === 'yes' || t.oneway === '-1', pts: ring(el.geometry) });
}

// ---------- areas (ground cover) ----------
const areas = [];
const areaKind = t =>
  t.amenity === 'parking' ? 'parking' :
  t.leisure === 'stadium' ? 'stadium' :
  t.leisure === 'pitch' || t.leisure === 'track' ? 'sport' :
  t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'recreation_ground' ? 'park' :
  t.natural === 'water' || t.leisure === 'swimming_pool' ? 'water' :
  t.natural === 'wood' || t.natural === 'scrub' ? 'wood' :
  t.landuse === 'farmland' || t.landuse === 'meadow' ? 'field' : null;
for (const el of osm.elements) {
  const t = el.tags || {};
  if (t.building || t.highway) continue;
  const k = areaKind(t); if (!k) continue;
  for (const g of outerRings(el)) {
    if (!g || g.length < 4) continue;
    const poly = ring(g); poly.pop();
    areas.push({ osm: `${el.type[0]}${el.id}`, kind: k, sport: t.sport || (t.leisure === 'track' ? 'running' : null), name: t.name || null, poly });
  }
}
// campus boundary
const campusEl = osm.elements.find(e => e.tags?.amenity === 'university' && e.type === 'relation');
const campus = campusEl ? outerRings(campusEl).map(g => { const p = ring(g); p.pop(); return p; }) : [];

const out = {
  generatedBy: 'tools/build-campus.mjs',
  attribution: 'Building, road and area geometry © OpenStreetMap contributors (ODbL 1.0). Elevation: USGS 3DEP via EPQS (public domain).',
  osmFetched: osm.fetched || null, elevationFetched: elev.fetched,
  origin: ORIGIN, bounds: { minX, maxX, minZ, maxZ },
  terrain, buildings, roads, areas, campus,
};
mkdirSync('src/world/data', { recursive: true });
writeFileSync('src/world/data/campus.generated.json', JSON.stringify(out));
console.log(`buildings ${buildings.length}, roads ${roads.length}, areas ${areas.length}, terrain ${tCols}x${tRows}, relief ${Math.max(...terrain.heights).toFixed(1)} m`);
