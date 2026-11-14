# Q1 changes outside `src/quests/q1/` (for the world teammate)

Quest 1 sticks to the quest contract, with a few marked additions in world-owned files. Please review them; each one is marked `CONTRACT ADDITION (Q1)` in the code.

## `src/interiors/interiors.ts` (LAYOUTS)
- **`kimball-office`:** now **20 m wide** (was 14).
  - The office walls are extended to match.
  - A **Personnel Services** room opens off the east side of the hall, with a doorway at z 2.4–5.8. It has a counter, waiting chairs, file cabinets, a "Personnel Services" sign and a "Faculty interviews today" sign.
  - Source for personnel offices in the Kimball: Church News, Sept 11, 1999.
- **New classroom interiors,** floor and wall colours only (Q1 builds the furniture at runtime through the contract): `q1-room-math`, `q1-room-english`, `q1-room-art`, `q1-room-engineering`.

## `src/config/game.config.ts`
- **`interiors`:**
  - `kimball-office` has width 20, and its label is now "President's office & Personnel Services".
  - The four `q1-room-*` interiors (16 × 14, `eras: ['ricks1999']`) use `candidate.*` as their exterior doors.
- **`locations`:**
  - `q1.lobby.*` and `q1.lobby.board` are room-local in `kimball-office`.
  - `q1.room.*` are the classroom centres.
  - `candidate.english` now snaps to the **Smith** building; the English department's building was the Smith, not the Snow.
- **`camera`:** `interiorMaxDistance` changed from 10 to 16 and `interiorMinPitch` from 0.8 to 0.42, which gives more room indoors. **This affects every interior.**
- **`quests.professors.candidates`:** adds `name`, `lobby`, `shirt` and `requires` (engineering requires art). `wait` is no longer used (candidates wait in Personnel Services again).

## Quest 2
- The Quest 2 implementation (`src/quests/q2/`, `tests/q2.test.ts`, `tools/gen-tiling.ts`, the `gen:tiling` script) was removed from `game-foundation`, because **Gio is building Quest 2**.
- `src/quests/placeholders/construction.placeholder.ts` keeps the story playable: Bednar assigns it, and the Taylor site offers a labelled "mark Quest 2 complete" panel. Swap it for the real module in `src/quests/index.ts`.
- Left in place for Gio: `GAME_CONFIG.quests.construction`, the `construction.*` anchors, `world.gatedBuildings` and the gate logic in `game.ts`.

## Audio (small shared change)
- `src/fx/music.ts`: `update(dt, allowed, duck)` lowers the background music to 35% while a dialogue line is on screen. `src/game.ts` passes `!!ui.currentSpeaker`.
- `src/core/settings.ts`: the default music volume went from 0.45 to 0.3 (saved settings are kept).

## Things Q1 relies on from the world
- From `QuestWorld`: `focusCamera`/`releaseCamera` (Q1 updates the camera every frame during demos), `playerPosition` (the escort), `addObject` (furniture and NPCs placed in interiors), `label` and `npc`.
- `QuestModule.update(dt)` must keep running while a custom UI screen is open, which it does today. The walk-in, escort and camera views depend on it.
- `src/core/settings.ts` `SETTINGS.muted` is read by the music player (`q1/hymn.ts`), so the mute setting also silences the art music.
- During demos Q1's injected CSS hides `.hud-top`, `.hud-mini`, `.hud-pointer`, `.hud-coins` and `.hud-help` (`body:has(.q1-inroom)`).
