# Quest contract

Each main quest is a self-contained module. The source of truth for the API is `src/quests/contract.ts`.

## Ownership
| Quest id | Owner | Placeholder to replace |
|---|---|---|
| `professors` | Quest 1 teammate | `src/quests/examples/professors.dev.ts` |
| `construction` | Quest 2 teammate | `src/quests/examples/construction.dev.ts` |
| `letters` | Quest 3 teammate | `src/quests/examples/letters.dev.ts` |

You own your module file plus your block in `GAME_CONFIG.quests.<id>` and any `locations` you add. **Do not edit** the renderer, player, input, world/map, or `game.ts`. If you need something they don't provide, ask for a contract addition.

## Lifecycle
1. **`register(ctx)`** runs at new game and at load. Add interactables here and restore visuals from `ctx.progress` and `ctx.world.getTargetState`.
2. **Status flow:** `locked` → `available` → `active` → `completed`.
   - The core marks the next quest `available` when the previous one completes.
   - When the player talks to Bednar, the core shows your `briefing()`, sets the quest `active`, and calls `onStart()`.
3. **While active:** set the HUD with `ctx.ui.setObjective(text, target)`. The target (an anchor id or coordinates) drives the minimap marker and distance.
4. **Outcomes:**
   - `ctx.fail(reason)` records a failed attempt. It never advances, and the player can retry.
   - `ctx.complete()` advances the story: colour stage +1, an optional era change from `GAME_CONFIG.story.eraAfterQuest`, and an autosave.
5. **Hooks:** `onSuspend`/`onResume` (pause menu), `update(dt)` (animations), `dispose()`.

## Context API (summary)
- **`ctx.config`:** your config block.
- **`ctx.difficulty()`:** the difficulty id. Its effects are yours to define.
- **`ctx.progress.get/set/reset`:** JSON data saved with the game.
- **`ctx.addInteractable({ id, kind, at, prompt, onInteract, enabled?, eras?, visual?, radius?, objective? })`**
  - `at` is a location id or `{x, z, space?}`.
  - **Location ids** (config anchors) are real-world metres and are scaled/snapped by the core.
  - **Explicit exterior coordinates** are game metres.
  - Coordinates with an interior `space` are **room-local**.
  - Prefer location ids so the world can be re-compacted without breaking quests.
  - Ids are namespaced to your quest automatically.
- **`ctx.ui`:**
  - `dialogue(lines)`
  - `panel({title, body, buttons, placeholder})` resolves to a button id, or `null` on Back.
  - `custom(title, render)` for your own DOM. Mark controls with `data-focus` so keyboard and controller navigation work, then call `close(result)`.
  - `toast(text)`, `setObjective(text, target)`
- **`ctx.world`:**
  - `era()`, `location(id)`, `terrainHeight(x, z)`
  - `addObject(obj, at)`, `voxel(w, h, d, color)`, `npc({label, sub, shirt…})`, `label(text, sub)`
  - `setTargetState/getTargetState` (persistent)
- **`ctx.on('started' | 'completed' | 'failed' | 'eraChanged' | 'reset', fn)`**

## Input
UI built with `panel`/`custom` receives actions, not raw keys:
- `navUp/Down/Left/Right` (arrows/WASD or left stick) move focus.
- `confirm` (E/Enter/Space or B1) activates.
- `back` (Esc/Backspace or B2) cancels.
Opening any UI pauses world movement automatically.

## Swapping in your module
```ts
// src/quests/index.ts
import { createProfessors } from './professors/professors';
export function createQuestModules() {
  return [createProfessors(), createConstructionDev(), createLettersDev()];
}
```

## Rules
- Label unfinished content with `ctx.DEV` / `placeholder: true`.
- Temple-related activities in 1999 must be framed as a future plan. The temple itself appears only from the `byui` era (dedicated 2008).
- Don't write quotes attributed to real people without a verified, team-approved source.
- **Construction:** a target with a `buildingId` hides that building (it shows as a fenced site with materials) until `setTargetState(id, 'built')` or quest completion. The world then rebuilds automatically. Keep `buildingId` in config.
