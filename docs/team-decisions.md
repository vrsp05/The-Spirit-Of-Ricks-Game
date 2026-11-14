# Open team decisions

Items marked **open** still need a team decision; until then the game uses a clearly labelled placeholder. Decided items record what the playtest settled. Change the config key; no engine code needs to change.

| # | Decision | Status | Config key / file | Input needed |
|---|---|---|---|---|
| 1 | Quest 1 content (questions, art reference, circuits, passage) | implemented from the refined prompt (`docs/quests/q1/`): Personnel Services lobby in the Kimball hall, escort, classroom-framed teaching demos, binary math, Art → Engineering projector thread; needs team review | `src/quests/q1/data/*.json` | Approve wording and thresholds after playtest; ask the world team for a lobby alcove |
| 2 | Candidate locations | decided: candidates wait in Personnel Services (`q1.lobby.*`, Kimball hall); demo doors at math → Romney, engineering → Austin, art → original Spori, English → **Smith** (the English department's building; Snow was performing arts) | `q1.lobby.*`, `candidate.*` in `GAME_CONFIG.locations` | — |
| 3 | English passage | decided: a labelled fictional student summary of the Kimball Building dedication (Sept 7, 1999); facts verified against the Church News, Sept 11, 1999. Replaces the June 2000 announcement, which postdates Q1 and names BYU–Idaho (decision 22) | `q1/data/english.json` | — |
| 4 | Quest 2 buildings | **decided (team, overrides the quest prompt)**: Taylor Building and I-Center. Both are fenced construction sites until their blueprint is solved, then appear permanently in any era | `world.gatedBuildings`, `quests.construction.buildings` | — |
| 5 | Story framing of building Taylor (opened 1997) and the I-Center (dedicated 2010) in 2001 | open: currently symbolic montage text with the real dates | Quest 2 (Gio) | Story owner |
| 6 | Quest 2 mechanics | **playable puzzle restored to main at Gio's request**. Focused fixes: show only the held shape, rotate in 90-degree steps while preserving its proportions, and allow returning a piece to leave the hand empty. Existing puzzles, hints, building montages, and reporting remain in place | `src/quests/q2/`, registered in `src/quests/index.ts` | Playtest the three piece-handling fixes |
| 7 | Letter hiding places and hints | implemented as provisional camouflage (B library bays, Y temple-approach hedges, U Hart curved walls, I Snow column among note poles) | `q3/data/cards.json`, `q3/camo.ts`, `letter.*` | Refine second-stage hints after playtest |
| 8 | Difficulty | decided: Easy / Hard only, tuning in each quest's data | `GAME_CONFIG.difficulty`, `q*/data/*.json` `modes` | Playtest tuning |
| 9 | Era flow | Q1 1999 → (report) Spring 2001 → Q2 → (report) 2011 → Q3 → present day + STC | `GAME_CONFIG.story` | — |
| 10 | Final dialogue | open: authored placeholder lines, labelled as game dialogue | `q*/data/dialogue.json`, `q3/data/cards.json`, `src/story/story.ts` | Story owner |
| 11 | Bednar | decided: office in the Kimball Building; continues as fictional quest guide in 2011 | `GAME_CONFIG.questGiver` | — |
| 12 | Reward tuning | implemented: base 100, quality ≤50, speed ≤50, Hard +25; speed targets per quest and mode | `GAME_CONFIG.rewards` | Playtest timings |
| 13 | Other accessible interiors | open | `GAME_CONFIG.interiors` | List of rooms |
| 14 | Controller transport (custom BLE vs BLE HID) | open | `docs/controller-protocol.md` | Hardware owner |
| 15 | Controller pins / firmware | open | — | Hardware owner |
| 16 | Undated modern buildings in historical eras | open (default: hidden) | `world.contextBuildingsInHistoricalEras` | — |
| 17 | Team avatars | open | `GAME_CONFIG.finale.avatars` | Team |
| 18 | Game title | open | `GAME_CONFIG.title` | Team |
| 19 | World compaction | decided: about 60% | `world.scale`, `world.buildingScale` | Playtest |
| 20 | Colour look | open (send a 90s reference photo) | `GAME_CONFIG.look`, `colorStages` | Reference image |
| 21 | Coins | decided: one currency (quest rewards + pickups); no shop | `GAME_CONFIG.rewards`, `coins` | — |
| 22 | BYU–Idaho naming | decided: nothing says BYU–Idaho until the letters are placed (2011 era is labelled "Rexburg, Idaho") | `src/world/eras.ts` | — |
| 23 | I-Center name before the finale | "Campus Center" | `buildingRegistry.ts` | — |
| 24 | Ambient NPCs | implemented: 18 walkers with era-specific, non-repeating lines | `GAME_CONFIG.npcs` | More lines welcome |
| 25 | Stadium and upper fields | implemented | `tools/geo-config.mjs` | — |
| 26 | Taylor appearance | beige/white with a tall central peak (official pages only mention a "characteristic peak"); a stylized guess until photos arrive | `buildingRegistry.ts` (`roofType: 'peak'`), `voxelMesher.ts` | **Reference photos** |
| 27 | Campus palette | decided: beige brick + white trim for all campus buildings | `buildingRegistry.ts` (`brick`, `pale`) | — |
| 28 | Vehicles | parked cars change with the era (90s boxy/pickup → 2010s rounded → modern), all drivable; bicycles rideable; golf carts kept | `src/player/Vehicle.ts`, `game.setupVehicles` | — |
| 29 | Building names | wall plaques (above an entrance when one exists) instead of freestanding signs | `World.addWallPlaque` | — |
| 30 | NPC info cards | removed; a bobbing marker shows who to talk to; quest NPCs appear only while their quest is active | `game.setupMarkers`, quest modules | — |
| 31 | Building spacing | decided: ≥ 8 m between campus buildings (two cars side by side), ≥ 3 m between houses; paths ≥ 3.2 m; buildings may shrink to keep the gaps | `world.buildingGap`, `houseGap`, `minBuildingScale` | — |
| 32 | Entrances | decided: no prop, tree, sign, vehicle or quest NPC within the clear zone in front of any entrance | `World.doorZones` | — |
| 33 | Minigame presentation | decided: full-screen, voxel style; fully playable with 4 buttons + 2 sticks | `src/quests/shared/frame.ts`, `styles.css` | — |
| 34 | Colour stages | decided: stage 0 = lightly coloured 90s photo → more saturated after each quest → fully saturated at the end | `colorStages`, `look` | Fine-tune after playtest |
| — | Era looks (graphics pass) | Fall 1999 warm afternoon + autumn leaves · Spring 2001 clear morning · 2011 winter (snow roofs, snowfall) · present-day sunny summer afternoon (night removed) | `src/config/atmosphere.ts` | Team to confirm seasons and times of day |
