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
- **`Npcs.ts`:** ambient walkers on campus paths. They avoid buildings, face the player, and say a line from `GAME_CONFIG.npcs`.

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
- **`q1/`, `q2/`, `q3/`:** the three quests. Their content is JSON in `data/`; `shared/` holds the challenge frame and scene helpers.
- **Story flow** (in `game.ts`):
  1. Talk to Bednar in his office.
  2. Bednar assigns the next quest.
  3. Completing it advances the colour stage, may move to the next era, and saves.
  4. After all three are done (letters placed on the sign), the game moves to the present day and the STC finale.

## Interiors (`src/interiors/`)
- Each room is built at its own far-away origin. The exterior is hidden while you're inside.
- Doors snap to their building's wall from a named anchor. The exterior door is green-framed and labelled ENTRANCE, and shows as a green icon on the maps.
- Room layouts are in `LAYOUTS`; sizes and eras are in `GAME_CONFIG.interiors`.

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
