# The Spirit of Ricks

A [single-player voxel browser game](https://vrsp05.github.io/The-Spirit-Of-Ricks-Game/) about Ricks College becoming BYU–Idaho, built for a 24-hour hackathon.

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
| `npm test` | Unit tests (Alma 11 coins + fewest-coin DP, art scoring + fill, tile-circuit solver + scrambles, English keys, rewards, quest idempotency, save migration) |
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
- **Quest 1, Hire the professors (fall 1999):** Bednar assigns it in his Kimball office. Four candidates wait in Personnel Services; you walk each one to a teaching demonstration inside their department's classroom (Romney, Smith, Spori, Austin) and play it as the candidate. Walking in plays a short scene; after the first pickup the others wait outside their buildings. Each demo has hints, retry, skip and a Hard follow-up. Details: `docs/quests/q1/`.
  - **Binary, the Nephite way** (math): a guided tutorial, then students' questions on the chalkboard, explained with the Alma 11 gold coins.
  - **Editing for accuracy** (English): Brother Price's summary of the Kimball dedication is projected on the whiteboard; mark mistakes and the fixes appear in red ink.
  - **Drawing what you see** (art): paint the temple concept on the studio board from the projected reference — until the old projector shorts out.
  - **Fix it live** (engineering): repair that projector on the lab bench; its lamp and fan react as you wire the circuit.
  - When all four are hired, report back to Bednar.
- **Y2K Rescue (1999):** collect backup disks from the library, Smith, Romney and Hart Buildings, then in the Austin Building's computer lab decide which century each two-digit year belongs to (19xx, 20xx — or even 18xx) before midnight (Hard: more records and a countdown).
- **Vikings Game Night (1999):** round up the band director (find his drumsticks first), the Viking mascot and the cheer captain (pick tonight's cheer), then make the halftime free throws in the Hart Building — stop the ball in the green zone (3 of 5; Hard: 4 with a smaller, faster zone).
- **Quest 2, Build the campus (2001):** solve footprint puzzles for Taylor and the I-Center, then report to Bednar. The held-piece preview shows only the complete shape. Rotate with the visible buttons, T/G, right-click, or the mouse wheel; rotation preserves the shape. **Return piece**, Esc, or clicking its selected tray button clears your hand. A successful placement also leaves no piece selected.
- **The Time Capsule (2001):** four students each offer two keepsakes (you choose) and a letter to the future; bury the capsule on the Kimball quad. In the present day its plaque says it was opened at the celebration and lists what you chose.
- **Snow Day (2011):** against the clock, shovel the drifts blocking five doorways, send four stranded students to the Center, then join the devotional (7 min; Hard 5). Run out of time and it restarts.
- **Quest 3, Find and place B Y U I (2011):**
  - Bednar hands over four illustrated clue cards, which you can reread any time in the Journal (J).
  - Letters are camouflaged in the architecture at the library, temple approach, Hart Building and Snow Building. Find them by looking and pressing Interact.
  - Placing the 4th letter on the sign by the roundabout sets off the celebration: full colour, fireworks, a cheering crowd.
- **Side quests (optional):** six errands from people around campus with a yellow **!** over their heads (**?** = come back to them). Progress is saved; each pays coins once. The pause menu's **Side quests** page lists them and where to find each person.
  - **The Lost Student ID** (Megan, Manwaring Center): find her dropped ID card and bring it back.
  - **Freshman Tour** (Tyler, Kimball Building): he follows you to the library, the student center and the gym.
  - **Campus Courier** (Brother Jensen, Smith Building): deliver a package across campus before time runs out (carts and bikes allowed).
  - **Campus Trivia** (Kenzie, Taylor Building): five questions built from the game's own history data (presidents, building dates), matched to the current era. Four right to pass; replayable for fun.
  - **Hoops Challenge** (Coach Dana, outdoor court): sink 3 baskets in 90 s (Hard: 5 in 75 s).
  - **Gone with the Wind** (Priya, Romney Building): catch the scattered activity flyers against the clock.
- **Campus life:** students stop to chat with each other in speech bubbles, make small talk while walking in groups, sit on benches, check their phones, and wave or say hi as you pass — by name once you've met. Talk to one (E) to chat, **ask for directions** (the pointer and minimap lead you there), or ask who needs help. Walk up to two people talking and they'll pull you into the conversation.
- **Day and night:** a campus clock runs while you play (1 real minute = 1 game hour, shown next to the era). Sunrise and sunset warm the sky, night turns it blue with stars, and the lamp posts light the paths. Class changes fill the paths every hour on weekdays, everyone heads to devotional on Tuesday mornings, and campus is quiet at night. Sleeping in your bed skips to 7:00. Settings → **Day & night cycle** turns it off.
- **Weather:** Rexburg wind gusts push you (and the leaves and snow) around, and passing rain showers send umbrellas up all over campus (a snow squall in winter).
- **Campus happenings:** short surprises while you walk around outside — the wind steals a student's hat (chase it down), someone drops their books, a frisbee comes your way (stand in the ring), a pop-up choir starts singing (walk up and sing along), and in winter a snowball fight (summer: water balloons; **R** throws).
- **Collectibles:** six keepsakes per era (24 in all) sparkle beside the buildings — a Vikings pennant, a mix CD, a flip phone, a temple snow globe… Students can tip you off, and found ones go on the shelf in your apartment.
- **Music:** a street musician by the Manwaring Center plays original tunes (tip 5 coins to request one; a crowd gathers), and a painted **Play Me!** piano by the Snow Building plays with the keyboard (A–K white keys, W E T Y U black keys) with a song guide.
- **Longboard and sled (B):** grab your longboard anywhere outside — hills speed you up, Space does an ollie. In winter it's a sled that runs downhill.
- **Camera (P):** frame a shot and press Space/E/P. Ten photo challenges (the Kimball Building, golden hour, campus at night, a crowd, from above, live music…) and an album of your latest photos you can save.
- **Friends:** chat with the same students to become Acquaintances, Friends, Good friends and Best friends. Friends greet you warmly, give gifts, and can walk around campus with you.
- **Vehicle jobs:** five instructors wait at the big campus parking lot (🚗 icons) — **Campus Shuttle** (pick up three students and drive them to class), **Campus Rally** (street checkpoints against the clock, best time saved), **Parking Pro** (park straight in the marked spaces), **Flight School** (the plane: fly through six sky rings and land back at the lot) and **Rooftop Delivery** (the helicopter: land supply crates on campus roofs).
- **Manwaring Center:** the Crossroads food court, the presidents gallery and the school store (Bookstore, later University Store) where coins buy clothes, accessories (beanie, cap, sunglasses, scarf, backpack) and snacks. Stairs lead down to the **Strike Zone**: eight bowling lanes you can play (aim, then power; five frames), an arcade and the grill.
- **Hart Building:** students play pick-up basketball and run on the treadmills. Minigames with records: the **400 m treadmill sprint** (alternate ← →), real basketball on the court (dribble, hold E to load a shot and let go, rebounds off the rim and backboard; a 60-second shooting challenge and **1-on-1 to 11 against Jace**), the **bench press contest** (tap to lock out heavier and heavier bars) and a weekly **intramural 3-on-3 tournament** with your friends. A **campus records board** ranks you against the best students.
- **More things to do in the buildings:** find books by call number in the McKay Library, connect constellations in the Romney planetarium, play along in the Snow concert hall, diagnose and fix cars in the Austin shops, ping-pong at the Strike Zone, and a lap race around the stadium field against Coach Reed's runners.
- **Student life:** a class schedule (walk into the right building on time for a bonus and a streak), part-time jobs (library shifts, the Crossroads grill, campus tour guide), ice cream and country dancing with friends, a pet for your apartment (goldfish or hamster — feed it every day) and decorations from the school store.
- **Seasons:** Halloween pumpkins in autumn, Christmas lights and a big tree in winter, a graduation banner in spring, and Fourth of July flags and night fireworks in summer.
- **Phone (Q):** messages from friends and campus, your classes, records, friends, photos and the map. In 1999–2001 it's a pager.
- **Achievements:** 44 to unlock. Pause → **Campus life** shows achievements, friends, the collection and the photo album.
- **Rewards:** each quest pays once: base 100, plus up to 50 for quality and 50 for speed, plus 25 on Hard. Quest timers pause during menus and cutscenes.
- **Cutscenes:** short, skippable, subtitled in-engine scenes. Reduced-motion and mute settings are in the pause menu.
- **Places:** every main building has a room that shows what it's for, modelled on the official 360° campus-tour photos at byui.edu: the Kimball atrium (terrazzo, white columns), the Manwaring Center's Crossroads and Strike Zone, the BYU-I Center's fan of maroon seats, the McKay Library's stacks, study tables and Tutoring Center, the Hart fitness center and gym, the Taylor foyer and chapel (organ and piano), the Snow concert hall, the Romney natural science museum (dinosaur, minerals, planetarium), the Austin shops (a car on a lift, welding, maker lab), the STC computer labs with 3D printers and study rooms, the Benson greenhouse and wildlife exhibit, the Clarke nursing lab and preschool, the Spori art gallery, the ETC robotics lab and the Visual Arts studios. Plus classrooms, offices and residence halls. Viking Stadium and the upper fields. Benches, lamps, a fountain and street signs.
- **Getting around:** golf carts, bikes, scooters, your longboard, collectible coins, walking students you can talk to, an objective pointer, minimap and full map markers, and green entrance icons.
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

## Building information

Walk near a building's existing name sign and click it to open a card with **About** and **Interesting fact**. A nearby hint points out the interaction; aiming the center reticle at the sign also allows E/controller Interact. Player movement and quest timers pause while reading. Close with **Esc** or **×**.

Cards include the complete approved text regardless of the game era. Data for all 27 curated building entries, including source attribution, lives in `src/world/data/building-info.json`; only buildings that already have plaques expose cards. Buildings without signs remain deferred.

To import edits from the reference file: `node tools/import-building-info.cjs "path/to/building_info_cards.txt"`. Browser regression check: `node tools/check-building-info.cjs http://localhost:5173` with Playwright available, or pass its module path after the URL.

## Opening and ending cutscenes

- New Game plays the 48-second opening: campus, Kimball office telephone call, title, then the assistant knocking and entering. Gameplay begins in President Bednar's office before Quest 1.
- Completing Quest 3 by placing the fourth letter on the BYUI lawn sign starts the 40-second ending immediately. The sign placement leads into the torch ceremony, drones, Vikings, and the STC presentation reveal with the `BYUI iHack 2026` sign.
- Title-screen **Watch opening** and **Watch ending** options preview either scene without changing the saved game. Direct links: `/?cutscene=preview` and `/?cutscene=ending`.
- Pause with Enter or the on-screen button; skip with Esc. Continue resumes ordinary progress, or finishes an ending that was pending when the game was closed.
- Sources live in `src/opening_cutscene/` and `src/ending_cutscene/`. The ending's approved portrait models are isolated in `CutsceneAvatar.ts` so the current gameplay wardrobes and animations remain intact.
- Browser regression check: run the dev server, then `node tools/check-cutscenes.cjs http://localhost:5173` with Playwright available (or pass its module path after the URL).

## Credits and licences

- **Code:** MIT (see [LICENSE](LICENSE)).
- **Map data:** © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/).
- **Elevation:** USGS 3DEP (public domain).
- **History:** *History of Buildings at BYU-Idaho* (Moser, 2003) and dated news articles, listed in [docs/sources.md](docs/sources.md).
- **Real people** are depicted respectfully with generic, replaceable voxel figures. Dialogue is placeholder until the team writes it.
