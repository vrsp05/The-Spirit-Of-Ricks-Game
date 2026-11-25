# Architecture

TypeScript + Vite + Three.js. There is no backend; saves go to `localStorage`. `src/game.ts` wires everything together, and the systems talk through small interfaces.

```
 input/ ──► ActionState ──► game.ts frame loop ──► player/ (movement, cart, camera)
                              │        │
                              │        ├──► interact/ (nearest interactable, prompt, E)
                              │        ├──► ui/ (screens + HUD; consumes actions)
                              │        └──► quests/QuestManager ──► quest modules (via QuestContext)
                              ▼
            world/World (terrain, buildings per era, props, sports, signs)  ◄── world/campusData (data + compaction)
            interiors/ (rooms at far-away origins)   render/ (sepia → colour grade)   save/
```

## Frame loop (`src/game.ts`)
1. Poll input. Every device writes into one merged `ActionState`.
2. The UI screen stack takes input first. If a screen is open, the world doesn't move.
3. In `playing` mode:
   - Update the player (walk/jump, or drive a cart) and the camera.
   - Update quests, NPCs, coins and objective markers.
   - Find the nearest interactable. <kbd>E</kbd> triggers it, or talks to an NPC, or gets out of the cart.
4. Update the HUD (objective, pointer, minimap, coins), then render with the colour grade.
5. Autosave every 20 s and after every quest or world event.

## World (`src/world/`)
- **`campusData.ts`:** loads `data/campus.generated.json` and applies **compaction**.
  - Positions are multiplied by `world.scale`.
  - Each footprint grows back toward `world.buildingScale` unless it would hit a coexisting building, a street or a sports field.
  - Also provides `terrainHeight`, `buildingsForEra`, `everOccupied`, `nudgeFree` and `obb`.
- **`buildingRegistry.ts`:** curated buildings. Each entry has an id, OSM id, signage names, `built`/`demolished`/`constructionStart` years, style, `features` and sources.
  - Buildings without a verified date are shown only in the present day.
  - Construction-quest targets are **gated**: they stay a fenced site until built.
- **`eras.ts`:** four world states (`ricks1999`, `transition`, `byui`, `presentFinale`). Ids are internal; labels are what players see.
- **`voxelMesher.ts`:** turns a footprint into a voxel mesh on a 1 m grid. Roofs can be flat with a parapet, hip, spire or dome; walls have window bands.
- **`collision.ts`:** a top-down grid holding each cell's roof height, plus round obstacles (trees, props, signs). It's used for both player collision and camera occlusion.
- **`World.ts`:**
  - Paints a ground texture: grass, pitches with markings, parking stalls, asphalt, paths.
  - Builds terrain, curbs, the boundary hedge, sky, props, trees, the stadium and fields.
  - Builds per-era building meshes (cached), signs, decorative entrances and special features (Taylor steeple, I-Center dome and portico).
  - `refreshBuildings()` rebuilds after a gated building is constructed.
- **`Npcs.ts`:** ambient walkers on campus paths. They avoid buildings, face the player, and say a line from `GAME_CONFIG.npcs`. They also chat with each other in speech bubbles (`npcChatter.ts` holds the era-aware conversations, greetings and join-in lines), sit on benches, check phones and greet the player.

## Player and camera (`src/player/`)
- **`PlayerController`:** camera-relative movement, sprint, jump/gravity, collision stepping, and golf-cart driving (`vehicle`).
- **`CameraRig`:** an orbiting third-person camera. When a building blocks the view it first tilts up a little, then pulls in. It follows behind the cart while you drive.
- **`Avatar`:** the voxel humanoid used for the player, NPCs and team avatars, with walk, sit and wave poses and floating labels.

## Input (`src/input/`)
Each device is an `InputSource`:
- keyboard/mouse
- Gamepad API (BLE HID option)
- Web Bluetooth (custom BLE option)
- on-screen mock controllers

`InputManager` merges them: the largest stick deflection wins and any device can press a button. Menu navigation repeats when a stick is held. The protocol is in `docs/controller-protocol.md`.

## Story systems
- **`cutscene/Cutscene.ts`:** reusable in-engine scenes made of camera moves, subtitles, prop animation and fades. They are skippable and replayable, and their `onDone` state change runs exactly once. The game saves before and after each scene.
- **`quests/rewards.ts`:** pure reward maths and the active-time timer. `QuestManager` writes one immutable receipt per quest.
- **`fx/fireworks.ts`, `fx/audio.ts`:** pooled fireworks, the colour-wave ring, and synthesized sounds.
- **`core/settings.ts`:** reduced motion and mute, stored per viewer.

## Quests (`src/quests/`)
- **`contract.ts`:** the only API quest modules use: `QuestModule` and `QuestContext`.
- **`QuestManager.ts`:** status flow (`locked → available → active → completed`), per-quest saved progress, objectives, and target states. It hooks into the game for colour and era changes and building gates.
- **`q1/`, `q3/`:** quests 1 and 3 (Quest 2 is a placeholder in `placeholders/` while Gio builds it). Their content is JSON in `data/`; `shared/` holds the challenge frame and scene helpers.
- **Story flow** (in `game.ts`):
  1. Talk to Bednar in his office.
  2. Bednar assigns the next quest.
  3. Completing it advances the colour stage, may move to the next era, and saves.
  4. After all three are done (letters placed on the sign), the game moves to the present day and the STC finale.

## Story order (`src/quests/order.ts`)
- Seven missions: `professors → y2k → vikings` (1999) · `construction → capsule` (2001) · `snowday → letters` (2011) → finale. `GAME_CONFIG.story.eraAfterQuest` moves the era after `vikings` and `capsule`; `colorStages` has one stage per mission.
- The four extra missions live in `src/quests/more/` and use only the quest contract.
- Saves are version 4. `addStoryMissions` (save.ts) migrates v3 saves: missions from an era you've left, or before one you've started, count as done without a reward; the first unfinished mission opens.

## Side quests (`src/sidequests/`)
- **`SideQuests.ts`:** optional errands, separate from the story chain in `src/quests/`. Each has a giver avatar placed beside a building (`SideHost.spotBy`), a floating status icon, and its own runtime (pickups, a follower, a timer, flyers). It talks to the game only through the `SideHost` interface that `game.ts` implements.
- State is saved as `SaveData.sideQuests` (optional field, no save-version bump). Timed quests return to their giver after a reload.
- **`trivia.ts`:** pure question generator over `world/presidents.ts` and the building registry; era-aware and never names BYU–Idaho before the present day (tested in `tests/sidequests.test.ts`).

## Campus life (`src/campuslife/`)
- **`CampusLife.ts`:** owns everything that makes walking around fun and talks to the game only through `LifeHost` (`host.ts`, implemented in `game.ts`). Each frame it ticks the clock, drives the crowd's schedule (`NpcCrowd.busyness / rush / focus`), the weather (gusts → `World.gust`, showers → `World.setShower` + umbrellas), the busker, collectible sparkle, a friend hanging out, and the happenings.
- **`clock.ts`:** the campus clock (pure, tested). `World.setTimeOfDay(hour)` blends each era's atmosphere toward dawn/dusk/night (sun path, sky, fog, lamp glow, stars, four nearby lamp lights); `Renderer.setDaylight` dims exposure and sky light. The title, opening and finale keep each era's designed look.
- **`events.ts`:** spontaneous happenings. They borrow students with `NpcCrowd.claim(walker, script)` — a script runs instead of the walker's routine until it returns false.
- **`collectibles.ts`, `photo.ts`, `sound.ts`, `progress.ts`:** keepsake data + models; camera mode (captures the canvas right after a render; challenges are checked against the camera frustum); synthesized guitar, piano, choir and rain; stats, achievements, friendships, coins earned/spent.
- Saved as `SaveData.life` (optional, no version bump). The photo album is kept separately in browser storage (`spirit-of-ricks.photos`).

## Vehicle jobs & the Manwaring Center (`src/campuslife/vehicleJobs.ts`, `mcFun.ts`)
- `VehicleJobs` places five instructors at the largest campus parking lot and runs one job at a time (targets with rings/beacons, a timer, the HUD pointer via `jobs.target()`). It needs a small `JobHost` (spawn aircraft, roof height, the vehicle's heading/speed/altitude). Completion and best times are campus-life stats (`job:<id>`, `jobBest:<id>`).
- `mcFun.ts`: the school store (outfits with a `price` in `player/outfits.ts`, accessories merged over the outfit, snacks eaten on the spot) and the bowling minigame. The Strike Zone is a second interior (`mc-strikezone`) linked to the Crossroads by stair interactables in `game.setupManwaring()`.

## Activities (`src/campuslife/hartGames.ts`, `minigames.ts`, `studentLife.ts`, `phone.ts`)
- Panel minigames share one shape: a `ui.custom` panel, keyboard taps read straight from `keydown` (exact timing) with controller input through panel actions, and records kept as campus-life stats (`p.set` / `p.best`). The campus records board (`RIVALS`) compares them with fictional students' marks.
- `game.setupHart()` / `setupActivities()` place the interactables in each room; the Hart's pick-up game and the treadmill runners animate through per-room `ticks` (`updateActors`).
- `studentLife.ts`: the class schedule (`Classes`, attended when you enter the building), `StadiumRace` (laps around the football field), `Celebrations` (decorations by season) and the apartment `Apartment` (pet + decor owned via `own:decor-*` stats).

## Interiors (`src/interiors/`)
- Each room is built at its own far-away origin. The exterior is hidden while you're inside.
- Doors snap to their building's wall from a named anchor. The exterior door is green-framed and labelled ENTRANCE, and shows as a green icon on the maps.
- Room layouts are in `LAYOUTS`; sizes and eras are in `GAME_CONFIG.interiors`.
- **`decor.ts`:** the decoration kit. Every room gets a floor material (`floorStyle`: wood, tile, carpet, court or checker) and a dressing pass (baseboards, chair rail, windows on the north/east/west walls unless `windows: false`, wall lights). Furniture builders (lockers, plants, sofas, computers, notice boards…) register blocking furniture with `solid()`; `InteriorManager.space()` also treats seated/standing people as solid.

## UI (`src/ui/`)
- **Screens:** a stack of focus-navigable screens (menus, dialogue, panels, custom quest UI, map), all driven by actions.
- **HUD:** era label, objective, top-of-screen pointer, minimap with objective and entrance icons, coins, prompt.
- Responsive layout for small windows.

## Coordinates
- Data and config anchors are real-world metres: x = east, z = south (north is −z).
- The game converts them with `toGame` / `toReal`.
- An anchor with `building` snaps to that building's wall. An anchor with `space` is room-local.
- Explicit `{x, z}` exterior coordinates in code are game metres.

## Where to change what
| Want to… | Change |
|---|---|
| Move an NPC, door, site, letter, cart | `GAME_CONFIG.locations` |
| Change quest content | your module in `src/quests/` (+ `GAME_CONFIG.quests.<id>`) |
| Change story text / NPC chatter | `src/story/story.ts`, `GAME_CONFIG.npcs`, `GAME_CONFIG.finale` |
| Change which era follows a quest | `GAME_CONFIG.story.eraAfterQuest` |
| Tune map size / building size | `GAME_CONFIG.world.scale`, `buildingScale` |
| Tune colours | `GAME_CONFIG.look`, `GAME_CONFIG.colorStages` |
| Add a building's dates or style | `src/world/buildingRegistry.ts` |
| Add a room | `GAME_CONFIG.interiors` + `LAYOUTS` in `src/interiors/interiors.ts` |

## Rendering and atmosphere
- **Renderer** (`src/render/Renderer.ts`): render → tone mapping (Khronos PBR Neutral) + colour-stage grade → output. Screen-space AO and bloom were removed after profiling (they cut the frame rate by about 3×); the voxel AO is baked into the meshes instead. Pixel ratio is capped at 1.5. The pause menu's *Graphics: High / Low* switch drops to pixel ratio 1 and 1024 shadows on weaker laptops (`SETTINGS.graphics`).
- **Materials** are physically based (`MeshStandardMaterial`) lit by the sun, a hemisphere light and an environment map generated from each era's sky.
- **Procedural textures** (`src/render/textures.ts`): brick with mortar relief, roof gravel, framed windows, ripple normals for water, and a world-space detail layer for the ground. No image files.
- **Voxel ambient occlusion** is baked per vertex in `voxelMesher.ts` (stored in the vertex colours and in a separate `ao` attribute that the snow-roof material uses).
- **Per-era atmosphere** (`src/config/atmosphere.ts`): sun angle and colour, sky, haze, exposure and `season` (tree and grass colours, snow roofs, falling snow or leaves). Edit that file to change an era's look.
- **Characters** (`src/player/Avatar.ts`): knees and elbows, walk/run bob and lean, idle breathing, blinking and glances, hairstyles, hats, coats, scarves, backpacks and shirt patterns. NPCs re-dress per era (`eraLook` in `src/world/Npcs.ts`), and the player wears a coat and scarf in winter.
- **Vehicles** (`src/player/Vehicle.ts`): spinning wheels with hub caps, steering front wheels, body roll and pitch, brake lights.
- **No duplicate geometry:** multi-part OSM buildings are drawn once, and a background building that overlaps another is skipped (`World.buildEra`). Overlapping copies caused flickering walls and windows.

## Campus life, interiors and extras
- **Navigation** (`src/world/navGraph.ts`): A* over the OSM path network (walkers, bikes, scooters) and street network (cars).
- **NPCs** (`src/world/Npcs.ts`): 40 walkers pick building entrances (`World.activeDoors()`, buildings standing in the current era), walk there, go inside for a while and come back out; about a third walk in small groups.
- **Traffic** (`src/world/Traffic.ts`): cars route to parking lots or across town, park, drive on; cyclists and scooter riders ride to buildings and go in.
- **Interiors** (`src/interiors/campusInteriors.ts`): classroom buildings, the Campus Center auditorium, the Manwaring food court + presidents gallery (grows by era; names and years only, generic silhouettes) and the Hinckley offices. Registered into `GAME_CONFIG.interiors` on import; furniture/people are built on first entry.
- **Ball games** (`src/world/ballGames.ts`): basketball (pick up, dribble, shoot with E, rim scoring) and soccer (dribble, kick with E, goals).
- **Settings**: one season for the whole game (`SETTINGS.season`), brightness, volumes, voices, graphics, reduced motion. The new-game screen asks the player's name (`{player}` in dialogue) and season.
- **Cheat codes** (pause menu): `jetpack`.

## Voice-overs and sound effects (API keys in `.env`, never committed)
- `npm run voices:export` → `docs/voice-lines.{json,csv,md}` from the current dialogue data.
- `npm run voices:generate` (needs `ELEVENLABS_API_KEY`) → `public/voices/*.mp3` + `manifest.json`; voices per character in `tools/voices.json` (`-- --list` shows your account's voices). Only changed lines are re-recorded. Lines with `{player}` etc. stay on the browser voice.
- `npm run sounds:fetch` (needs `FREESOUND_API_KEY`) → CC0 sounds in `public/sfx/*.mp3` + `freesound-credits.json` (engine loops, bike bell, car pass-by, winter wind, food-court chatter, auditorium murmur, ball sounds, jetpack). The game uses whatever exists and synthesizes the rest.
