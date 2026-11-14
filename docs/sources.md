# Sources, licences and approximations

## Data bundled in the game

| Source | Used for | Licence / credit | Retrieved | Can't prove |
|---|---|---|---|---|
| OpenStreetMap via Overpass API (`tools/fetch-osm.mjs`) → `data/raw/osm-campus.json` | Building footprints, roads, paths, parking, parks, campus boundary | © OpenStreetMap contributors, ODbL 1.0. Attribution is shown on the title screen and map | 2026-11-13 | What existed in 1999. Footprints are modern and include later additions |
| USGS 3DEP elevation via EPQS (`tools/fetch-elevation.mjs`) → `data/raw/elevation.json` | Terrain slope (40 m samples, 40×32 grid; ~80 m rise toward the temple hill) | Public domain (USGS) | 2026-11-13 | Fine grading, steps, retaining walls. 34 samples were missing and are filled from neighbours |

Rebuild everything with `npm run data:fetch-osm && npm run data:fetch-elevation && npm run data:build`.

**Projection:** a local tangent plane at 43.8170 N, 111.7830 W. Units are metres, x = east, z = south, north = −z. The data files stay at 1:1.

**Gameplay compaction (team decision, playtest 2026-11-13):** at runtime, positions are multiplied by `world.scale` (0.4) so streets and open space shrink. Each building footprint is then grown about its own centre toward real size (up to `world.buildingScale`, 0.62) wherever it doesn't overlap a coexisting building or a street. Heights stay real, and terrain relief is scaled with the plan so slopes keep their angle. Relative positions, north and route topology are preserved, but **distances and gaps are deliberately not to scale**. Config anchors are written in real metres and converted at runtime.

## Historical references (not bundled)

| Key | Source | Used for | Limits |
|---|---|---|---|
| HOB | Steve Moser, *History of Buildings at BYU-Idaho* (updated Jan 2003), https://content.byui.edu/file/18087cb9-1eb2-41e6-a11f-30f3216c0cb6/1/CampusBuildingHistories.pdf | First-use years: p.3. Kimball: dedicated Sep 7 1999, executive offices (p.26). Kirkham 1956 (p.27). Original Spori: completed 1903, last classes Aug 2000, demolition from Nov 29 2000, new Spori groundbreaking May 29 2001 (p.70–79). Taylor 1997 (p.87). Multi-Use building ground broken Apr 18 2001 (p.46). | Stops at 2003. Gives no footprints |
| NEWS-2002 | Church News, "New Hinckley Building dedicated at BYU-Idaho", 2002-10-26, https://www.thechurchnews.com/2002/10/26/23241392/new-hinckley-building-dedicated-at-byu-idaho/ | Hinckley Building dedicated Oct 22 2002 | — |
| NEWS-2008 | Church News, "Rexburg temple is Church's 125th", 2008-02-16, https://www.thechurchnews.com/2008/2/16/23232074/rexburg-temple-is-churchs-125th/ | Temple dedicated Feb 10 2008 | — |
| NEWS-2010 | Church News, "New BYU-Idaho Center dedicated", 2010-12-17, https://www.thechurchnews.com/2010/12/17/23227508/new-byu-idaho-center-dedicated/ | I-Center dedicated Dec 2010 | Exact day not confirmed |
| NEWS-2017 | Church News, 2017-02-14, https://www.thechurchnews.com/2017/2/14/23211586/changes-to-campus-at-byu-idaho/ ; Church newsroom, https://www.churchofjesuschrist.org/church/news/elder-andersen-dedicates-three-buildings-on-byu-idaho-campus | STC opened fall 2016, dedicated Feb 14 2017 | — |
| NEWS-2022 | Church News, 2022-10-28, https://www.thechurchnews.com/living-faith/2022/10/28/23428580/byu-idaho-president-henry-j-eyring-dedicates-three-buildings-rexburg/ | Kirkham demolished Aug 2019; Visual Arts Studio on its site; ETC dedicated 2022 | — |
| ANN | https://www.byui.edu/newsroom/25-years/ricks-to-become-byu-idaho-examining-the-june-21-2000-announcement | Announcement date June 21 2000 (used for the "Becoming BYU–Idaho" banner) | The official renaming date is not verified here |
| — | Official map https://maps.byui.edu/ | Spot check of orientation only. The viewer credits OSM among its sources | Not systematically compared yet (see accuracy-review.md) |

Not used yet: BYU–Idaho history page (1999 aerial), the ArcGIS "Through the Years" story map, official floor plans. These are the next references for 1999 footprints and the STC floor plan.

## Quest content verification (2026-11-13)
| Content | Checked against |
|---|---|
| Alma 11 coin values (senine/senum 1, seon/amnor 2, shum/ezrom 4, limnah/onti 7, shiblon ½, shiblum ¼, leah ⅛, antion 1½; judge's pay; six onties) | Alma 11:3–19, 22 — churchofjesuschrist.org/study/scriptures/bofm/alma/11 (also covered by unit tests) |
| D&C 88:118, D&C 38:27, D&C 25:12 excerpts on the clue cards | churchofjesuschrist.org scripture pages |
| Announcement facts (June 21, 2000; delivered by President Gordon B. Hinckley; two-year → four-year; Brigham Young University–Idaho; phased in over time) | byui.edu/speeches/announcement-ricks-college-to-become-byu-idaho |

All Bednar-character lines, candidate lines, card notes and the English paraphrase are **authored fiction**, labelled in game.

## Era rules (src/world/eras.ts, src/world/buildingRegistry.ts)

- `ricks1999` = fall 1999: after the Kimball dedication, before the announcement.
- `transition` = spring 2001: old Spori demolished, Hinckley under construction, new Spori not yet begun.
- `byui` = 2008: after the temple dedication, before the I-Center.
- `presentFinale` = today.
- A building appears only when its first-use year falls before the era. Buildings without a verified date appear **only in the present day**.

## Known approximations and gaps

- **Taylor Building and BYU–Idaho Center (team decision, overrides the quest prompt):** both are construction sites until Quest 2 solves their blueprints, then appear in every era. In reality Taylor opened in 1997 (HOB p.87) and the I-Center was dedicated in 2010. The montage text states the real dates.
- **Bednar in 2011:** his continued role as quest guide is fictional framing, not a claim about his historical position.
- **2011 era label:** shows "Rexburg, Idaho", not the institution name, until the letters are placed (team decision).
- **Fixed 2026-11-13:** OSM multipolygon buildings (58, including the Benson Building) and the campus boundary were missing from the first build because of an Overpass output mode. They are present now.
- **Props:** benches (sittable), lamps, the pond, street signs, crosswalks, parked cars and bicycles are decorative placements, not surveyed. Car styles per era are generic, not specific real models.
- **Era labels (artistic choice):** the middle eras are labelled "Ricks College" with no years. In reality the name changed in 2001, but the team chose that nothing says BYU–Idaho until the story's end.
- **Taylor steeple and I-Center dome/portico:** stylized recognisable details, not measured models.
- **Viking Stadium:** grandstand massing (stepped rows, press box, roof, visitor bleachers) is stylized. Its position comes from OSM `leisure=stadium` and the football pitch.
- **Upper fields:** field markings are generic per sport. Light towers and the "Upper Fields" sign are decorative. "Upper fields" is the team's name; HOB calls the area the intramural playing fields / "upper playfield".

- **Original Spori:** uses the replacement building's footprint. The facade and colour are stylized, and its palette is distinct from the new Spori.
- **Kirkham:** not in OSM. A rough 60×52 m block on the Visual Arts Studio site, sized from HOB gross area. Should be traced from the 1999 aerial.
- **Modern footprints:** Manwaring, Romney, McKay, Clarke, Benson, Hart, Smith, Austin and Snow likely include later additions.
- **Lamprecht and Chapman Halls:** shown from their naming dates (1996, 1999). The construction year was not extracted.
- **Present-day only (no verified date):** Benson greenhouses, Agricultural Engineering, Radio & Graphics, Student Health Center, Physical Plant offices and all other unregistered OSM buildings.
- **Missing from 1999:** buildings demolished before today (e.g. the women's residence halls, old stadium stands). They aren't in OSM and are not reconstructed.
- **Roads and paths:** the modern network is shown in every era. The 1999 alignment has not been checked against the aerial.
- **Heights:** OSM `building:levels` where available, otherwise registry guesses at 4 m per floor. Roof forms are stylized (flat with parapet; hip roof for Spori; single spire for the temple).
- **Decoration:** trees are procedurally scattered on lawns, not surveyed.
- **STC first floor:** an approximation, not based on a floor plan.

## Music
Three songs recorded by the team, in `public/music/`: "High on the Mountain Top", "I Need Thee Every Hour" and "The Spirit of God". They play as a looping playlist (random start) on the menus and while exploring, and pause during cutscenes, time-jump cards and the finale (`src/fx/music.ts`). Pause menu → Music: On/Off; Mute silences it too.

## Sound effects
Recorded CC0 sound effects from Kenney (RPG Audio, Interface Sounds, Impact Sounds) and a CC0 birds-and-wind ambience by spring-spring on OpenGameArt; see `public/sfx/CREDITS.md`. The engine, bike bell, whoosh and fireworks are synthesized (`src/fx/audio.ts`).

## Presidents gallery (Manwaring Center)
Principals and presidents of Bannock Stake Academy / Ricks Academy / Ricks College / BYU–Idaho with term years, from Wikipedia's [List of presidents of Brigham Young University–Idaho](https://en.wikipedia.org/wiki/List_of_presidents_of_Brigham_Young_University%E2%80%93Idaho) (checked 2026-11-14) and [byui.edu/president](https://www.byui.edu/president). The game shows names and years only, with generic silhouettes (no portraits/likenesses).
