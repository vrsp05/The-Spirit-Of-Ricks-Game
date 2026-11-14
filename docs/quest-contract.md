# Quest contract

Each main quest is a self-contained module. The source of truth for the API is `src/quests/contract.ts`. Modules must not import renderer, player, input or map code.

| Quest id | Module | Content (editable data) |
|---|---|---|
| `professors` | `src/quests/q1/professors.ts` | `src/quests/q1/data/{math,art,circuit,english,dialogue}.json` |
| `construction` | **placeholder** `src/quests/placeholders/construction.placeholder.ts` (Gio is building the real Quest 2) | — |
| `letters` | `src/quests/q3/letters.ts` | `src/quests/q3/data/cards.json` |

Stable anchor ids, all in `GAME_CONFIG.locations`:
- `npc.bednar.office`
- `candidate.math` / `candidate.engineering` / `candidate.art` / `candidate.english`
- `construction.taylor` / `construction.icenter`
- `letter.B` / `letter.Y` / `letter.U` / `letter.I`
- `sign.byui`
- `door.stc.main`

## Lifecycle
1. **`register(ctx)`** runs at new game and on load. Build visuals, interactables and inspectables, and restore state from `ctx.progress`.
2. **Status flow:** `locked` → `available` → `active` → `completed`.
3. **Assign:** talking to Bednar calls `onAssign(start)` if the module defines it (e.g. a cutscene whose `onDone` is `start`). Otherwise `briefing()` is shown and the quest starts.
4. **Report:** once `readyToReport()` is true, talking to Bednar calls `onReport()`, which plays a scene and then calls `ctx.complete()`. Q1 and Q2 finish this way; Q3 completes at the sign.
5. **Complete:** `ctx.complete()` is idempotent.
   - It writes **one immutable reward receipt** (`base + quality + speed + hard bonus`).
   - It shows the reward scene, advances colour, applies `GAME_CONFIG.story.eraAfterQuest`, and autosaves.
   - Modules report evidence through `qualityScore()` (0..1) and `skippedFraction()` (0..1). Skipped portions earn no bonus; developer skips earn nothing.
6. **`ctx.fail()`** records a failed attempt and never advances.

## Context API
- **`ctx.difficulty()`:** `'easy' | 'hard'`. Read it **per attempt**; a pause-menu change applies to the next attempt.
- **`ctx.progress.get/set/reset`:** JSON saved with the game.
- **`ctx.reportColorProgress(0..1)`:** progress inside this quest's colour stage. The world decides the actual colour; only the last Q3 placement reaches full colour.
- **`ctx.cutscene({ id, steps, onDone, cleanup })`:** short in-engine scene.
  - Steps: `camera`, `look`, `say`, `dur`, `run`, `tick`.
  - Back skips the scene, Confirm advances it.
  - `onDone` runs **exactly once**, even if skipped. Dev replays never run it.
- **`ctx.ui`:**
  - `dialogue`, `panel`, `toast`.
  - `custom(title, render, { wide, className })`: the render function receives `{ close, refocus, onAction }`. `onAction` gets `up/down/left/right/confirm/back/alt/alt2/hint` from keyboard (R / F / H) or controller (Button 3 / L3 / R3 inside panels).
  - `setObjective(text, target)`, `setWaypoints(anchorIds)`.
  - `setBanner(text)`, e.g. "Playing as: …".
  - `hudButton(label, fn, viaMap)`, e.g. the Journal on J / Map.
- **`ctx.world`:**
  - **Positions:** `position(anchor)`, `playerPosition()`, `questGiverPosition()`, `terrainHeight`.
  - **Objects:** `addObject(obj, anchor)`, `voxel`, `npc`, `label`.
  - **State:** `setTargetState/getTargetState`. Construction targets listed in `world.gatedBuildings` appear once their state is `'solved'`.
  - **Camera:** `focusCamera(from, to)` / `releaseCamera()`.
  - **Look-and-press discovery:** `addInspectable({ id, object, maxDistance, enabled, onInspect })`.
  - **Celebration:** `blueprintGhost(buildingId)`, `gatherCrowd`, `fireworks`, `colorWave`, `sound`, `reducedMotion()`.

## Shared helpers
- **`shared/frame.ts` (`runChallenge`):**
  - "Playing as" header, visible Hint button, optional Skip, Leave.
  - Shared Result / Retry / Leave screen.
  - The body gets `{ difficulty, onAction, onHint, setStatus, finish }`.
- **`shared/scenes.ts`:** `bednarSteps(ctx, lines)` builds Bednar conversation shots; `shoulderCam` frames a point-of-view shot.

## Rules
- Dialogue for real people is authored game text: label it, and never present it as a quote.
- Temple-related Q1 activities are future concepts. The temple appears only from the 2011 era.
- All content stays in JSON. Facts are verified (see `docs/sources.md`).

## Minigame frame helpers (`src/quests/shared/frame.ts`)
- `runChallenge(ctx, { title, playingAs, intro, allowSkip, body, passText, failText, className })` opens a full-screen minigame with the shared header, ③ hint, ④ tools bar (Hint / Skip / Leave), the controls legend and the result screen.
- The body gets a `ChallengeApi`: `onAction` (4 buttons + 2 sticks as `PanelAction`s), `onHint`, `setStatus`, `setControls` (legend), `refocus`, `hintsUsed`, and `finish(result)`.
- `finish({ pass, quality, summary, stars?, extra? })`: `stars` (0–3) defaults from quality (≥ 0.85 → 3, ≥ 0.55 → 2, pass → 1). `extra(el)` can add content to the result screen (the art game's 3D voxel reveal) and return a cleanup.
- `loop((dt, t) => …)` is a requestAnimationFrame loop for real-time games; return its stop function from the body as the cleanup.
