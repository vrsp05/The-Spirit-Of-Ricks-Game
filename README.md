# The Spirit of Ricks

A single-player voxel browser game about Ricks College becoming BYU–Idaho, built for a 24-hour hackathon.

You play an assistant to President David A. Bednar. It begins on a sepia-toned campus in fall 1999. You finish three quests: recruit professors, construct buildings, find the lost letters. Each one brings colour back and moves the campus forward in time. Placing the letters on the Ricks College sign turns it into BYU–Idaho. The story ends with a celebration in the Science and Technology Center.

> A fictional, respectful, symbolic adventure. Quests are gameplay, not claims that these events happened.

---

## Quick start

Requirements: [Node.js](https://nodejs.org/) 18+ and a WebGL 2 browser (current Chrome, Edge, Firefox or Safari).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Alma 11 coins + fewest-coin DP, art scoring + fill, tile-circuit solver + scrambles, English keys, tiling solvability, rewards, quest idempotency, save migration) |
| `npm run gen:tiling` | Regenerate the Quest 2 blueprint puzzles |
| `npm run data:fetch-osm` / `data:fetch-elevation` / `data:build` | Rebuild the campus map data (see [Map data](#map-data)) |

Add **`?dev=1`** to the URL for developer tools. Press <kbd>`</kbd> or <kbd>F1</kbd> to show or hide them.

## Controls

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move | <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows | Left stick |
| Sprint | Hold <kbd>Shift</kbd> | Left stick click (toggle) |
| Jump | <kbd>Space</kbd> | Button 2 |
| Camera | Drag mouse · wheel zoom · <kbd>C</kbd> reset | Right stick · right stick click |
| Interact / talk / enter / golf cart | <kbd>E</kbd> | Button 1 |
| Map | <kbd>M</kbd> | Button 3 |
| Pause (save, controls, skip quest) | <kbd>Esc</kbd> | Button 4 |
| Menus | Arrows/WASD + <kbd>Enter</kbd>, or mouse | Left stick + Button 1 |

Two custom ESP32 controllers can play at the same time; either one moves the same player. See [docs/controller-protocol.md](docs/controller-protocol.md).

## What's in the game

- **Campus geography:** built from OpenStreetMap footprints, roads and paths, plus USGS elevation. It's compacted for gameplay: streets and open space shrink, buildings stay big, and relative layout and north are kept.
- **World states:**
  - Fall 1999 (Ricks College).
  - Two "campus grows" stages, still named Ricks College.
  - The present day (BYU–Idaho).
  - Buildings appear and disappear by researched dates.
  - Nothing says "BYU–Idaho" until all three quests are done.
- **Colour:** each completed quest restores colour, from sepia to a warm 90s-photo grade.
- **Difficulty:** Easy or Hard, chosen at the start and switchable from the pause menu (applies to your next attempt). Each quest has its own tuning for each mode.
- **Quest 1, Hire the professors (fall 1999):** Bednar assigns it in his Kimball office. Four candidates wait at the Romney, Austin, Spori and Snow buildings, and each challenge has hints, retry and an optional skip:
  - **Nephite Market** (math): customers queue at a barley stall; count out exact payments and change in Alma 11 coins before their patience runs out (fewest coins = perfect).
  - **Paint a future temple concept** (art): pixel canvas with mirror and fill bucket; a passing painting is rebuilt as a spinning voxel model.
  - **Light the Temple** (engineering): rotate wire tiles; a live circuit solver lights the bulbs (series dim, parallel bright, switches).
  - **Red Pen Rush** (English): a printing press scrolls a labelled paraphrase of the June 21, 2000 announcement; stamp the mistakes at the red line and pick the fix.
  - Every minigame ends with a 1–3 star rating; the Quest 2 blueprints use a tower-crane drop and a "Blueprint approved!" screen.
  - When all four are hired, report back to Bednar.
- **Quest 2, Build the campus (2001):**
  - Blueprint tiling puzzles for the Taylor Building and the I-Center: fill the footprint with no gaps or overlaps, and ignore the decoy pieces.
  - Both sites stay fenced until their blueprint is solved; each building then rises in a short montage.
  - Report back to Bednar to finish.
- **Quest 3, Find and place B Y U I (2011):**
  - Bednar hands over four illustrated clue cards, which you can reread any time in the Journal (J).
  - Letters are camouflaged in the architecture at the library, temple approach, Hart Building and Snow Building. Find them by looking and pressing Interact.
  - Placing the 4th letter on the sign by the roundabout sets off the celebration: full colour, fireworks, a cheering crowd.
- **Rewards:** each quest pays once: base 100, plus up to 50 for quality and 50 for speed, plus 25 on Hard. Quest timers pause during menus and cutscenes.
- **Cutscenes:** short, skippable, subtitled in-engine scenes. Reduced-motion and mute settings are in the pause menu.
- **Places:** enterable Kimball Building (President Bednar's office), a quest room, and the STC first floor (finale). Viking Stadium and the upper fields. Benches, lamps, a fountain and street signs.
- **Getting around:** golf carts, collectible coins, walking students you can talk to, an objective pointer, minimap and full map markers, and green entrance icons.
- **Menus and saves:** title, difficulty, pause, controls, controller status, local save/continue (versioned), and "skip quest".

## Project layout

```
src/
  config/game.config.ts   ← team-editable: locations, quests, story/era mapping, finale, NPC lines, look
  quests/                 ← quest contract, manager, dev-example quests  (quest owners work here)
  world/                  ← campus data, building registry, eras, voxel mesher, collision, NPCs, World renderer
  player/                 ← avatar, player controller, camera, golf cart
  input/                  ← action layer, keyboard/mouse, Gamepad API + Web Bluetooth, mock controller
  interiors/  interact/  ui/  save/  story/  finale/  render/  dev/
tools/                    ← reproducible data pipeline (OSM + USGS → src/world/data/campus.generated.json)
data/raw/                 ← downloaded source data (bundled; the game never calls a map API)
docs/                     ← design docs (see below)
```

## Documentation

| Doc | For |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the systems fit together; where to change what |
| [docs/quest-contract.md](docs/quest-contract.md) | **Quest teammates:** the API your module uses and how to plug it in |
| [docs/team-decisions.md](docs/team-decisions.md) | Open and decided team decisions, with the config key for each |
| [docs/controller-protocol.md](docs/controller-protocol.md) | **Hardware teammate:** controller report format, BLE/HID options, mapping |
| [docs/sources.md](docs/sources.md) | Sources, licences, historical dates, approximations and artistic choices |
| [docs/accuracy-review.md](docs/accuracy-review.md) | Geographic accuracy checks and how to repeat them |

## Team workflow

- **Quest owners:**
  - Copy a file from `src/quests/examples/` and implement the `QuestModule` interface.
  - Register it in `src/quests/index.ts`.
  - Put placements and settings in your `GAME_CONFIG.quests.<id>` block.
  - Don't edit the renderer, player, input or map code. If you need something else, ask for a contract addition.
- **Story:** text lives in `src/story/story.ts`, quest `briefing()`/`reminder()`, and `GAME_CONFIG.finale` / `GAME_CONFIG.npcs`.
- **Moving things:** every location is a named anchor in `GAME_CONFIG.locations`, written in real-world metres. Use the dev panel's **Copy position** to capture new ones.
- **Testing a quest fast:** use `?dev=1` (teleport, complete/reset quests, era and colour preview) or *Pause → Skip current quest*.

## Map data

Map data is fetched once and bundled with the game:

```bash
npm run data:fetch-osm        # OpenStreetMap via Overpass → data/raw/osm-campus.json
npm run data:fetch-elevation  # USGS 3DEP via EPQS → data/raw/elevation.json (reuses existing samples)
npm run data:build            # → src/world/data/campus.generated.json
```

The bounding box and origin are in `tools/geo-config.mjs`. Historical dates, names and styles are in `src/world/buildingRegistry.ts`, and each entry cites its sources.

## Credits and licences

- **Code:** MIT (see [LICENSE](LICENSE)).
- **Map data:** © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/).
- **Elevation:** USGS 3DEP (public domain).
- **History:** *History of Buildings at BYU-Idaho* (Moser, 2003) and dated news articles, listed in [docs/sources.md](docs/sources.md).
- **Real people** are depicted respectfully with generic, replaceable voxel figures. Dialogue is placeholder until the team writes it.
