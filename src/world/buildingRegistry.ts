// Curated historical metadata for important buildings. Geometry comes from
// campus.generated.json (OpenStreetMap, modern) unless `poly` overrides it.
//
// Visibility rule: a building is shown in an era when built <= era.year < demolished.
// If constructionStart <= era.year < built, a construction-site variant is shown.
// Buildings WITHOUT a verified date are only shown in the present-day era
// (a modern map is not proof of what existed in 1999). See docs/sources.md.
//
// Source keys refer to docs/sources.md:
//   HOB  = "History of Buildings at BYU-Idaho" (Moser, Jan 2003), page numbers given
//   NEWS = dated news articles listed in docs/sources.md
//   OSM  = OpenStreetMap footprint (modern)

export type RoofType = 'flat' | 'hip' | 'spire' | 'dome' | 'peak';
export interface BuildingStyle {
  wall: string; trim: string; roof: string; glass: string;
  roofType: RoofType; levels: number; floorHeight?: number;
}
export interface BuildingEntry {
  id: string;
  osm: string | null;              // e.g. "w299927991"; null when poly is supplied
  poly?: [number, number][];       // local metres, overrides OSM footprint
  names: { ricks?: string; byui?: string }; // signage name per institution era
  built: number;                   // decimal year first in use
  demolished?: number;
  constructionStart?: number;
  style: BuildingStyle;
  sources: string[];
  approximation?: string;          // what is approximate about this entry
  landmark?: boolean;              // gets a name sign + extra detail
  features?: ('steeple' | 'portico' | 'finial')[]; // stylized recognisable details (see World.addFeatures)
}

// Campus palette (team feedback): beige brick and white trim across the campus.
const brick = (levels: number, roofType: RoofType = 'flat'): BuildingStyle =>
  ({ wall: '#d4bf9b', trim: '#f6f1e6', roof: '#8f8a82', glass: '#4f6577', roofType, levels });
const pale = (levels: number, roofType: RoofType = 'flat'): BuildingStyle =>
  ({ wall: '#e6dac3', trim: '#fbf8f1', roof: '#8a8580', glass: '#4b6275', roofType, levels });

const MODERN_FOOTPRINT = 'Footprint is the modern OSM outline; later additions/renovations may be included.';

export const BUILDINGS: BuildingEntry[] = [
  { id: 'kimball', osm: 'w208858676', names: { ricks: 'Spencer W. Kimball Building', byui: 'Spencer W. Kimball Building' },
    built: 1999.68, constructionStart: 1997.5, style: pale(3), landmark: true,
    sources: ['HOB p.26 (groundbreaking Jul 1 1997; dedicated Sep 7 1999; houses executive offices)', 'OSM'] },
  { id: 'taylor', osm: 'w292008073', names: { ricks: 'John Taylor Building', byui: 'John Taylor Building' },
    built: 1997, style: { wall: '#e3d3b4', trim: '#fbf8f1', roof: '#b9b6ad', glass: '#4f6577', roofType: 'peak', levels: 2, floorHeight: 4.5 }, landmark: true, features: ['finial'],
    sources: ['HOB p.3, p.87', 'OSM', 'Team feedback: white walls (reference photos pending)'] },
  { id: 'spori-original', osm: 'w299927991', names: { ricks: 'Jacob Spori Building' },
    built: 1903.8, demolished: 2000.91, style: { wall: '#cbbd9f', trim: '#efe7d6', roof: '#5d5249', glass: '#3e4c58', roofType: 'hip', levels: 3 },
    landmark: true, sources: ['HOB p.70–79 (completed Oct 1903; last classes Aug 2000; demolition began Nov 29 2000)'],
    approximation: 'Original footprint and massing approximated from the replacement building outline (OSM). Facade is stylized; compare against period photos before final.' },
  { id: 'spori-new', osm: 'w299927991', names: { byui: 'Jacob Spori Building' },
    built: 2003, constructionStart: 2001.4, style: { wall: '#ece2cf', trim: '#ffffff', roof: '#7b6a5c', glass: '#4f6577', roofType: 'hip', levels: 4 },
    landmark: true, sources: ['HOB p.3 (New Spori 2003), p.79 (groundbreaking May 29 2001)', 'OSM'],
    approximation: 'Stylized facade; distinct palette from the original Spori.' },
  { id: 'kirkham', osm: null, poly: [], // filled in kirkhamPoly below
    names: { ricks: 'Oscar A. Kirkham Building', byui: 'Oscar A. Kirkham Building' },
    built: 1956, demolished: 2019.6, style: brick(2), landmark: true,
    sources: ['HOB p.27 (1956)', 'NEWS: Church News 2022-10-28 (demolished Aug 2019; Visual Arts Studio on site)'],
    approximation: 'NOT in OSM (demolished). Footprint is a rough block on the Visual Arts Studio site sized from HOB gross area. Replace with a trace of the 1999 aerial.' },
  { id: 'romney', osm: 'w299927993', names: { ricks: 'George S. Romney Building', byui: 'George S. Romney Building' },
    built: 1963, style: brick(4), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT + ' Romney Addition 1987 (HOB).' },
  { id: 'clarke', osm: 'w299927994', names: { ricks: 'John L. Clarke Building', byui: 'John L. Clarke Building' },
    built: 1975, style: brick(3), landmark: true, sources: ['HOB p.3 (Family Living Center, 1975)', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'hart', osm: 'w299927995', names: { ricks: 'John W. Hart Building', byui: 'John W. Hart Building' },
    built: 1969, style: pale(2), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'mckay', osm: 'w299927997', names: { ricks: 'David O. McKay Library', byui: 'David O. McKay Library' },
    built: 1976, style: brick(3), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'smith', osm: 'w299927998', names: { ricks: 'Joseph Fielding Smith Building', byui: 'Joseph Fielding Smith Building' },
    built: 1968, style: brick(3), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'benson', osm: 'r17394517', names: { ricks: 'Ezra Taft Benson Building', byui: 'Ezra Taft Benson Building' },
    built: 1975, style: brick(3), landmark: true, sources: ['HOB p.3 (phases 1975, 1978, 1984)', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'austin', osm: 'w299928002', names: { ricks: 'Mark Austin Building', byui: 'Mark Austin Building' },
    built: 1969, style: pale(2), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'manwaring', osm: 'w299928004', names: { ricks: 'Hyrum Manwaring Student Center', byui: 'Manwaring Center' },
    built: 1966, style: brick(3), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT + ' Later expansion is likely included in this outline.' },
  { id: 'snow', osm: 'w244285201', names: { ricks: 'Eliza R. Snow Performing Arts Center', byui: 'Eliza R. Snow Performing Arts Center' },
    built: 1980, style: pale(3), landmark: true, sources: ['HOB p.3', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'heating-plant', osm: 'w300167604', names: {}, built: 1963, style: pale(2), sources: ['HOB p.3, p.22', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'rigby', osm: 'w300167603', names: { ricks: 'Rigby Hall', byui: 'Rigby Hall' }, built: 1963, style: brick(3), sources: ['HOB p.3 (William F. Rigby Hall dormitory)', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'biddulph', osm: 'w300167602', names: { ricks: 'Biddulph Hall', byui: 'Biddulph Hall' }, built: 1964, style: brick(3), sources: ['HOB p.3 (Ensign Hall 1964), p.54 (renamed Biddulph Hall 1995)', 'OSM'], approximation: MODERN_FOOTPRINT },
  { id: 'lamprecht', osm: 'w299951988', names: { ricks: 'Lamprecht Hall', byui: 'Lamprecht Hall' }, built: 1996.2, style: brick(3), sources: ['HOB p.54 (named Mar 30 1996; construction year not extracted)', 'OSM'], approximation: 'Shown from naming date; actual construction earlier.' },
  { id: 'chapman', osm: 'w299951989', names: { ricks: 'Chapman Hall', byui: 'Chapman Hall' }, built: 1999.2, style: brick(3), sources: ['HOB p.54 (named Mar 20 1999; construction year not extracted)', 'OSM'], approximation: 'Shown from naming date; actual construction earlier.' },
  { id: 'pplt-shop', osm: 'w300167608', names: {}, built: 1973, style: pale(1), sources: ['HOB p.3 (Physical Plant 1973)', 'OSM'], approximation: 'Assumed to be the 1973 PPLT building.' },
  // ---- post-1999 buildings ----
  { id: 'hinckley', osm: 'w299952008', names: { byui: 'Gordon B. Hinckley Building' },
    built: 2002.8, constructionStart: 2001.29, style: pale(3), landmark: true,
    sources: ['NEWS: Church News 2002-10-26 (dedicated Oct 22 2002)', 'HOB p.46 (Multi-Use bldg, ground broken Apr 18 2001 — identity with Hinckley inferred)', 'OSM'],
    approximation: 'Construction start inferred from the HOB "Multi-Use" entry.' },
  { id: 'ricks-building', osm: 'w299952009', names: { byui: 'Thomas E. Ricks Building' }, built: 2005, style: pale(3), landmark: true, sources: ['HOB p.3 (planned 2005)', 'OSM'], approximation: 'HOB (2003) gives a planned year; completion not independently verified.' },
  { id: 'temple', osm: 'w289415710', names: { byui: 'Rexburg Idaho Temple' }, built: 2008.11,
    style: { wall: '#f4f1ea', trim: '#ffffff', roof: '#e9e4d8', glass: '#6c7f8e', roofType: 'spire', levels: 2, floorHeight: 6 },
    landmark: true, sources: ['NEWS: Church News 2008-02-16 (dedicated Feb 10 2008)', 'OSM'], approximation: 'Stylized silhouette; single spire.' },
  { id: 'icenter', osm: 'w299928003', names: { ricks: 'Campus Center', byui: 'BYU–Idaho Center' }, built: 2010.96, landmark: true, features: ['portico'],
    style: { wall: '#d8c3a0', trim: '#f4ede0', roof: '#8e9a95', glass: '#5d7d93', roofType: 'dome', levels: 3, floorHeight: 4.5 }, sources: ['NEWS: Church News 2010-12-17 (dedicated)', 'OSM'] },
  { id: 'stc', osm: 'w544705247', names: { byui: 'Science and Technology Center' }, built: 2016.7, style: pale(3), landmark: true, sources: ['NEWS: Church News 2017-02-14 (dedicated Feb 14 2017; opened fall 2016)', 'OSM'] },
  { id: 'visual-arts', osm: 'w980712328', names: { byui: 'Visual Arts Studio' }, built: 2021.3, style: pale(1), sources: ['NEWS: Church News 2022-10-28', 'OSM'] },
  { id: 'etc', osm: 'w299952010', names: { byui: 'Engineering Technology Center' }, built: 2022.8, style: pale(3), sources: ['NEWS: Church News 2022-10-28', 'OSM'] },
];

export const registryById = new Map(BUILDINGS.map(b => [b.id, b]));

export function eraState(b: BuildingEntry, year: number): 'standing' | 'construction' | 'absent' {
  if (b.demolished !== undefined && year >= b.demolished) return 'absent';
  if (year >= b.built) return 'standing';
  if (b.constructionStart !== undefined && year >= b.constructionStart) return 'construction';
  return 'absent';
}
