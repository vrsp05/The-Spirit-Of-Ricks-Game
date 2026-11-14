# Build prompt: Ricks College to BYU–Idaho game

Read the repository's `AGENTS.md` and follow it throughout. Its scope, verification, safety, and token efficiency rules apply here. In particular, inspect only files relevant to the current milestone; use focused searches and concise reports. Do not reread the whole repository or repeat these instructions in your output.

## Mission and ownership

Build a playable foundation for a **24-hour hackathon**, single-player browser game: a fictional, respectful adventure representing the transformation of Ricks College into BYU–Idaho. There are four team members. Three teammates own the exact story content, dialogue, quizzes, puzzles, quest locations, and quest rules. You own the accurate outdoor campus, historical world states, player/camera/input, interactions, integration interfaces, and a functional ending scaffold. Integrate teammate quest modules without requiring them to modify the renderer or movement systems. Provide working examples, explicitly labeled as development examples, never as final quest content.

The player is **an assistant to David A. Bednar**, who assigns the three main quests. The player does **not** play Bednar. The adventure begins in **1999**, then advances through clearly signposted time transitions to a **present-day finale**. Quests are symbolic gameplay, not claims that these events happened. Historically real people must be depicted respectfully; keep their dialogue, names, and likenesses replaceable. Do not present fictional minigames as historical facts.

## Decisions confirmed by the team

- Browser game: Three.js, voxel-style 3D; third-person character with an elevated, orbiting camera.
- Campus geography should be **very accurate**: relative building positions, footprints where reliable, roads, pedestrian paths, slopes, landmarks, and key sightlines. Render this geography in a coherent stylized voxel aesthetic; do not arbitrarily rearrange or compress it without consulting the team. Simplify mesh detail and peripheral buildings to meet performance and time limits, while maintaining geographic accuracy.
- Explore the main campus and a modest amount of the immediate surrounding area; most gameplay is outside. Some quest rooms and the STC first floor are enterable.
- Keyboard/mouse and two identical custom ESP32 controllers must feed the same single player. The keyboard path must support the entire game even if hardware is unavailable.
- Opening campus is in sepia; each completed main quest increases color, with full color after the BYUI letter quest. Show appropriate changes in buildings and signs as time advances.
- Three main quests, in order: recruit professors, construct buildings, find BYUI letters. Each supports attempts and retry; only success advances. Afterward, travel to the STC, where four replaceable team avatars celebrate winning the hackathon.
- Selectable difficulty; menu, pause, and browser-local save/resume.

## Explicitly undecided: keep configurable, do not invent canon

The team has **not** finalized: exact quest mechanics or questions; professor locations and interiors; the three construction targets; the precise rules for finding letters and hints; difficulty effects; final dialogue and story transitions; which other interiors are accessible; controller Bluetooth transport and final hardware pins. Implement minimal interfaces and unmistakably marked examples to allow development. Do not fill gaps with authoritative-sounding answers or lock them into the world model. Record each open decision in a short `docs/team-decisions.md` with a status of `open`, the affected config key, and what input is needed. Do not write large speculative designs.

### Quest 1 — Recruit professors

Current subject concepts, **not final mechanics**:

| Subject | Story activity suggested by whiteboard |
| --- | --- |
| Math | Convert money |
| Engineering | Build a small circuit associated with the future Rexburg Temple |
| Art | Paint the future Rexburg Temple |
| English | Fix/edit a talk attributed in the whiteboard to President Hinckley |

Support four separate NPC/room anchors and an overall quest completion state. Keep building assignments configurable. The teammate who owns this quest specifies the actual interactions, historical framing, content, order of professors, pass conditions, and retry behavior. Temple-related activities must be framed as a fictional future-facing plan in 1999 unless the team chooses another time setting; a later landmark must not silently appear in the 1999 world. Do not write purported quotes or a real talk for the English activity without a verified, team-approved source.

### Quest 2 — Construct buildings

This is a **symbolic construction minigame** representing campus transformation, rather than a factual claim that the player built the buildings. Support three separately configurable building targets, blueprint pickup anchors, a puzzle panel, success/failure events, and a visible state change for each target. The specific buildings, blueprint counts and positions, construction mechanics, and puzzles are **open decisions**. Do not choose final targets yourself.

An earlier whiteboard idea named the BYU–Idaho Center and Taylor. A later team clarification requires three buildings that existed **before** the institution became BYU–Idaho; therefore the I-Center is **not** a valid target under the current requirement. This creates a timeline problem: a building present in the 1999 opening cannot literally be built by the player afterward. Keep pre-existing geography historically accurate; implement symbolic build/reveal sequences, a clearly labeled earlier time vignette, or another team-approved explanation. **Do not erase a building from the 1999 map merely to make this quest work.** Keep target IDs configurable and stop before finalizing the chronology if the quest cannot be represented coherently.

### Quest 3 — Find BYUI

Support one collectible each for B, Y, U, and I, candidate outdoor anchor spots, optional hint hooks, independent collection state, retry/error hooks if the teammate needs them, and an event that restores full color on successful completion. Locations, order, randomization, hint rules, puzzles, and difficulty behavior are **open decisions**. Use clearly labeled dev anchors until the quest teammate provides actual placements. Do not invent mandatory wrong-answer mechanics for a scavenger hunt.

### Shared quest contract

Create a small documented registration interface with stable quest IDs (`professors`, `construction`, `letters`), location IDs, start/suspend/resume/dispose behavior as needed, progress and difficulty access, objective/dialogue/panel functions, completion/failure events, and world-state changes. Quest UI must accept action-layer input from both keyboard and controllers, with focus navigation. Quest modules must not need to edit core renderer, player movement, controller decoding, or map geometry. Give each teammate an example integration and clear ownership boundary. Placeholder quests may demonstrate integration and a complete dev-only walkthrough; they must not masquerade as finalized game content.

## Accurate campus reconstruction: source and validation workflow

Research **only the areas and assets required by the current milestone**. For each source, record URL/credit, date if known, purpose, and what it cannot prove. Useful references already identified:

- [BYU–Idaho university history](https://www.byui.edu/about/history): historical narrative and period imagery, including a 1999 aerial.
- [University compilation of building histories](https://content.byui.edu/file/18087cb9-1eb2-41e6-a11f-30f3216c0cb6/1/CampusBuildingHistories.pdf): construction and renovation dates; verify individual entries.
- [University account of the 2000 announcement](https://www.byui.edu/newsroom/25-years/ricks-to-become-byu-idaho-examining-the-june-21-2000-announcement): transition context.
- [Official campus map](https://maps.byui.edu/) and [official floor-plan access](https://www.byui.edu/campus-construction-projects/campus-floor-plans): present campus orientation and available interiors.
- [BYU–Idaho Through the Years](https://storymaps.arcgis.com/stories/c8b39eda3bd84b5bbe888e1cf066f448): potential period imagery.
- OpenStreetMap, if coverage and license terms allow: building footprints, roads, pedestrian paths, and geographic coordinates. Street-level photographs, if accessible and permitted, come from a separate imagery source such as Mapillary or official photos. **OpenStreetMap is not a street-view image service.**

First compare a small sample of modern footprints and road alignments against official maps; check coordinate systems, coverage, missing buildings, dates, attribution, and whether source data can be bundled. Next compare 1999 aerials and building histories before assigning historical visibility or facades. Use a reproducible local transformation from geographic coordinates to game coordinates; preserve north orientation, relative positions, paths, slope, and plausible movement scale. Keep positions and footprints in data, separate from renderer meshes. Record uncertainty for every historically approximate building. Never treat a modern map as proof of what existed in 1999. Package the necessary reference-derived game data locally; gameplay must not need a live mapping API. Respect licenses and attribution for every imported dataset or image.

Prioritize correct site layout, recognizable silhouette, and navigable routes over individual windows or interiors. Put extra detail near spawn, quest locations, major landmarks, the STC approach, and the finale. Do not invent arbitrary filler buildings. For approximate geometry, label the approximation in source notes. Use a small accuracy review: compare an overhead game capture to the chosen reference for several named landmarks and routes before calling the map accurate. Tune travel speed through playtests; do not silently shrink the campus to hit a traversal target.

## Historical time states

Model at least `ricks1999`, `transition`, `byui`, and `presentFinale` (names may change, behavior must be clear). Assign each important building stable ID, position/footprint/height, date range, historical visual variant, per-era visibility, references, approximation flag, entrances, collision, and any quest anchor. Keep three construction targets independently configurable.

Start in a verified 1999 Ricks-era setting. Use short signposted transitions when the story advances in time; explicitly distinguish timeline transitions from symbolic color restoration. Introduce later buildings only in eras consistent with researched dates. The original and replacement Spori variants must remain distinct; likewise, verify the proper era for the I-Center, STC, and Rexburg Temple. Historical claims should be grounded in the named sources, and any artistic simplification should be labeled as fiction in project notes. A modern STC can appear in the present-day finale after a clear transition; do not place it on the 1999 map. Do not lock in how long the player spends in each era; that remains a story decision.

## Game feel, visuals, and input

- Small voxel player/NPCs; stepped terrain where helpful, recognizable roof and facade forms, modular trees/benches/signs, clear daylight, good silhouettes. Blender with browser-ready GLB is optional; procedural geometry is acceptable. Reuse materials/geometry or instancing to avoid a draw call per decorative cube.
- WASD movement relative to camera, Shift run, mouse orbit/zoom, E interact, Escape pause. Elevated third-person follow camera with sensible pitch/zoom limits and occlusion handling. Walking, slopes, usable doorways, collision, camera visibility indoors, and correct exterior return are more important than optional jumping.
- One action layer for movement, look, run, interact, back, map, pause, menu navigation, and confirm. Gameplay and quest UIs consume actions, not raw keys or Bluetooth packets. Opening a UI suspends world movement.
- Shared interactable type for NPCs, doors, blueprint anchors, construction sites, letters, and finale triggers. Use named locations; keep relocation in config.
- Starting scene: player assistant receives the assignment from a configurable Bednar NPC, positioned at a historically plausible, team-editable campus anchor. The earlier draft positioned a Hinckley NPC as quest giver near Manwaring; that **conflicts with the team's updated decision**. Keep any Hinckley appearance as unconfirmed story content, not a default quest giver.

## Two custom controllers and firmware

Each ESP32-WROOM controller has two joysticks with stick clicks, four buttons, and four diagnostic LEDs. Both controllers connect wirelessly over Bluetooth to control the same player; USB-C is for flashing, not game input. Webcam is out of scope. Keep transport swappable: Web Bluetooth custom BLE and BLE HID Gamepad API are candidates; the team has not selected one. Implement a mock input first and document the transport decision before committing to firmware details. Check current browser/hardware compatibility before promising pairing support.

Provide a short shared controller protocol document early so the hardware teammate can work independently. A suggested custom BLE report (if that route is selected): `version`, `controllerId`, `seq`, four signed joystick axes `lx,ly,rx,ry`, and one bitmask for four buttons plus both stick clicks. Define byte order, range, notification cadence, reconnect behavior, UUID ownership, and error handling in the protocol. Optional diagnostic LED command is not gameplay. If BLE HID is selected, adapt game input via the Gamepad API and use an appropriate hardware test path; do not promise in-browser LED controls for HID without verified support.

Default action mapping: left stick move, click run toggle; right stick orbit, click reset camera; four buttons interact/confirm, back, map/objective, pause. Make mapping configurable. When two controllers are used, merge inputs so either can play independently; for each axis take the larger deflection and accept a button from either, with dead zones and calibration. Menus, dialogue, and all quest UI must support keyboard/mouse and controller navigation. Pair/connect status and reconnect/fallback are needed where supported. Add a virtual mock controller and a focused test view for raw axes/buttons and connection health. Provide a reference ESP32 sketch after transport selection; the hardware teammate owns final pins, assembly, and firmware signoff. If producing the sketch, verify pin assignments against the exact board, use ADC1 for analog input where Wi-Fi/Bluetooth conflicts arise, power joystick modules safely, debounce buttons, and document the wiring tested.

## Interiors, UI, save, finale

Provide reusable quest room scaffolds with configurable doors, NPC anchors, camera behavior, and consistent entry/exit. Exact rooms/buildings remain undecided. Build a usable STC first-floor arrival and route to a simple celebration space. If precise floor-plan details are unavailable, label it an approximation. Four replaceable voxel avatars, celebration staging, editable text, and replay/restart finish the game; do not invent team names or likenesses.

Include start/continue, difficulty choice, controls help, controller status, pause/resume, current objective, context-sensitive interaction prompt, navigation aid, and save reset. Save progress, era, difficulty, and color state locally with a versioned schema. Make UI navigable with both input methods. Difficulty must be readable by quests; leave its gameplay effects configurable until the team defines them.

Use dev-only controls to teleport to quest anchors/STC, preview world eras and color stages, complete/reset quests, inspect collisions and input, and replay the ending. Keep these controls out of ordinary play.

## Milestones and proof of work

Recommended technical base: TypeScript, Vite, Three.js, local assets, and browser storage. No backend or multiplayer unless separately requested. Keep world data, historical states, renderer, player, input adapters, quest modules, and save/UI separate enough that teammates can work concurrently. Avoid speculative scaffolding. Start with a runnable vertical slice and a geographically grounded campus coordinate system.

1. **First playable slice:** app starts; assistant and Bednar assignment interaction; keyboard movement and camera; action layer; small verified 1999 campus area; mock controller; one interior; one sample quest interaction. Name every placeholder.
2. **Campus coverage:** expand data-driven world to the main campus and nearby roads/paths with verified building locations, walkable slopes, recognizable landmarks, collision, and geographic comparison screenshots. Simplify visual detail while preserving the layout.
3. **Integration:** historical eras, quest anchors and modules, controller protocol/test tools, save/difficulty and color progression. Connect real controllers when hardware and transport are confirmed.
4. **Final route:** present-day transition, STC first floor, finale, production build, focused playthrough, and replacement of quest placeholders when teammates deliver content.

Keep milestones runnable. At each milestone, report implemented behavior, verified commands/flows, geographic and historical approximations, and exact open team decisions. Test the affected flow and build; do not claim engine or hardware tests you could not perform. If available time is short, retain accurate core geography and a complete playable path; reduce visual decoration and peripheral detail, and explain the reduction. Do not replace missing quest content with invented final content.

## Immediate next action

Inspect the available project/environment only as far as needed to build milestone 1. Give a short plan with the initial geographic reference area, coordinate strategy, files to create or change, and validation steps. Continue with authorized reversible implementation, using `AGENTS.md` for scoped inspection and honest reporting. Ask the team only when an unresolved choice would force a false historical claim or lock in a major gameplay/story decision.
