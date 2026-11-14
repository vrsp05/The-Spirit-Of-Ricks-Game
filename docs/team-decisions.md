# Open team decisions

Items marked **open** still need a team decision; until then the game uses a clearly labelled placeholder. Decided items record what the playtest settled. Change the config key; no engine code needs to change.

| # | Decision | Status | Config key / file | Input needed |
|---|---|---|---|---|
| 1 | Quest 1 mechanics, questions, pass/retry rules, professor order | open | `src/quests/examples/professors.dev.ts` → replace module in `src/quests/index.ts` | Quest 1 owner: real module |
| 2 | Professor locations and which rooms are interiors | open | `GAME_CONFIG.quests.professors.subjects[].anchor`, `GAME_CONFIG.locations`, `GAME_CONFIG.interiors` | Building/room per subject |
| 3 | English activity source text | open | Quest 1 module | Verified, team-approved source (no invented quotes) |
| 4 | Construction targets | **decided (playtest 2026-11-13)**: Taylor Building and the BYU–Idaho Center. They stay hidden as fenced sites with materials until quest 2 builds them. **Third target still open** | `GAME_CONFIG.quests.construction.targets[].buildingId` | Third building |
| 5 | Story framing for building the Taylor Building and the I-Center (Taylor was actually dedicated in 1997; the I-Center in 2010) | open. Hiding Taylor in 1999 is a deliberate artistic choice, noted in sources.md | Quest 2 module, `story.ts` | Story owner |
| 6 | Construction minigame mechanics | open. No gathering step for now (playtest) | Quest 2 module | Quest 2 owner |
| 7 | Letter placements, order, randomisation, hints | open | `GAME_CONFIG.quests.letters.anchors`, Quest 3 module | Quest 3 owner |
| 8 | Difficulty effects | open | `GAME_CONFIG.difficulty` (quests read `ctx.difficulty()`) | What each level changes |
| 9 | Which era follows each quest; time spent in each era | open | `GAME_CONFIG.story.eraAfterQuest` (default: professors→`transition`, construction→`byui`, letters→`byui`, then `presentFinale`) | Story owner |
| 10 | Final dialogue, intro, transitions, finale text | open | `src/story/story.ts`, module `briefing()`/`reminder()`, `GAME_CONFIG.finale` | Story owner |
| 11 | Bednar's position | **decided**: inside the Kimball Building (entrance → short hall → office). Name label and appearance still open | `GAME_CONFIG.questGiver`, `locations.bednar`, `interiors['kimball-office']` | Team confirmation of label/appearance |
| 12 | Any Hinckley appearance | open (not the quest giver) | none yet | Story owner |
| 13 | Other accessible interiors | open | `GAME_CONFIG.interiors` + `LAYOUTS` in `src/interiors/interiors.ts` | List of rooms |
| 14 | Controller transport: custom BLE GATT vs. BLE HID gamepad | open | `src/input/controllerProtocol.ts`, `src/input/transports.ts`, `docs/controller-protocol.md` | Hardware owner (after a pairing test) |
| 15 | Final controller pins/wiring and firmware sign-off | open | firmware (not in repo yet) | Hardware owner |
| 16 | Show undated modern buildings in historical eras as neutral massing? | open (default: hidden) | `GAME_CONFIG.world.contextBuildingsInHistoricalEras` | Team: honesty vs. a fuller 1999 map |
| 17 | Team avatars: labels and colours | open | `GAME_CONFIG.finale.avatars` | Team (no invented names/likenesses) |
| 18 | Game title | open | `GAME_CONFIG.title` (currently the repo name) | Team |
| 19 | World compaction amount | decided: compact about 60% (playtest); tune after the next playtest | `GAME_CONFIG.world.scale` (0.4), `world.buildingScale` (0.62) | Playtest feel |
| 20 | Colour look ("90s photo") | open. Send a reference picture to tune | `GAME_CONFIG.look`, `GAME_CONFIG.colorStages` | Reference image |
| 21 | Coins: reward or just for fun? | decided: just for fun (no reward yet) | `GAME_CONFIG.coins` | — |
| 22 | When campus becomes BYU–Idaho | **decided (playtest 2)**: nothing says "BYU–Idaho" until all three quests are done. The middle eras are a "campus grows" progression still named Ricks College (artistic licence). Quest 3 ends by placing the found letters on the Ricks College sign | `src/world/eras.ts`, `quests.letters.signAnchor` | — |
| 23 | Name shown for the I-Center before the finale | decided: "Campus Center"; it is signed "BYU–Idaho Center" only after the finale | `buildingRegistry.ts` (`names.ricks`), construction target label | Team may prefer another name |
| 24 | NPCs walking around campus | open (planned after the world/layout pass) | — | Which NPCs, whether interactive |
| 25 | Stadium and upper fields | decided: include them. Viking Stadium (OSM + HOB p.80) and the south-campus intramural "upper fields" (HOB p.24); map extended south | `tools/geo-config.mjs` | — |
