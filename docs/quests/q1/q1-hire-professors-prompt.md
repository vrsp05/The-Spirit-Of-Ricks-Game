Copy everything below into Claude:

---

# Quest 1: Hire the Professors

You are building **Quest 1 (Q1)** of a browser game made at a 24-hour hackathon. This brief has three parts:
- **Intent:** why Q1 exists and what good looks like. Use it to make decisions when the spec doesn't cover something.
- **Spec:** exactly what to build.
- **Plan:** the order to build it in, and how to check each step.

Where something is unclear, make a reasonable choice, mark it `// ASSUMPTION:` in code and in the README, and keep going.

---

## Part 1: Intent

### The game
- **What it is:** a browser game about Ricks College becoming BYU–Idaho. The campus is built from 3D voxels and seen in third person, and the world starts in sepia. Each of three quests brings back one third of the color.
- **Stack:** Node.js, TypeScript, plain HTML and Three.js, with no UI framework.
- **Controls:** keyboard and mouse, or the team's custom ESP32 Bluetooth controllers. Each controller has 2 joysticks that click and 4 buttons.
- **Repo and team:** https://github.com/vrsp05/The-Spirit-Of-Ricks-Game. A teammate is building the world (campus, movement, camera, input, minimap, quest framework) at the same time.

### What Q1 is
- **Setting:** summer 2000. On June 21, 2000, Ricks College announced it would become BYU–Idaho, a four-year university, so it needs new faculty.
- **The player:** Elder Bednar's assistant. Elder Bednar was Ricks College's president at the time; verify this.
- **The quest:** the player takes four faculty candidates through their interviews. Each interview ends in a **teaching demonstration**, and **the player plays that demo as the candidate**. The view switches to the candidate, the player solves the challenge, and the view switches back.

### What players must feel
- **It flows like a real hiring day,** not "walk up to a stranger and a minigame starts." The player picks up candidates in the Kimball Building's Personnel Services office, walks each one to their department, and watches them teach.
- **Every challenge makes sense as a lesson.** The classroom reacts to what the player does, but the player does all the solving.
- **No one gets lost or stuck** (from playtesting). Objectives name the building, map markers point to the next stop, and every challenge has a hint and can be skipped.
- **It's fun,** through small surprises: the class guessing what you draw, a projector bulb burning out, a fuse popping with smoke.

### Success looks like
- A first-time player finishes Q1 in about 10–15 minutes without asking where to go.
- All four demos work with keyboard/mouse and with controllers, with **no typing**.
- Q1 runs on its own (a standalone test page) and plugs into the world through **one adapter file**.
- All text, questions, pictures and levels live in data files the team can edit without touching code.

### Not Q1's job
The world teammate owns:
- world scale, movement, vehicles, props and coins;
- the color-grading effect itself;
- building exteriors, and which buildings exist in which era.

Q1 asks the world for things only through the host contract (Spec §6).

### Accuracy and respect
- **Real people:** President Hinckley and Elder Bednar appear respectfully, and their names and likenesses are configurable. Candidate names are fictional placeholders.
- **Facts:** verify dates and scripture values against primary sources, and keep the wording editable.
- **Copyright:** don't quote copyrighted talks at length; write game paraphrases instead.

---

## Part 2: Spec

### 1. Quest flow

1. **Get the quest.** Elder Bednar, in his office in the Kimball Building, explains why the school needs faculty, gives the player four candidate files, and sends them down the hall to **Personnel Services**.
2. **The lobby.** The four candidates wait in the Personnel Services lobby, each with a name tag and a subject. A **hiring board** on the wall shows each one as Waiting, In demo, Retry or Hired.
3. **Pick a candidate.** Talking to one plays a short intro, and the candidate says they're due for a teaching demonstration in their building.
4. **Escort.** The candidate **follows the player** to that building. The objective names it (for example, "Walk Sister Ames to the Romney Building") and a minimap marker points to the classroom door.
5. **The demo.** At the door the screen fades to a title card, for example "You are now Sister Ames · Teaching demonstration, Romney Building." The perspective switches to the candidate and the challenge opens inside the classroom (Spec §3).
6. **Result.**
   - **Pass:** the class applauds, the chair says "I'll recommend you to President Bednar," the HUD says "Back to you," the view returns to the assistant, and the candidate is marked Hired.
   - **Fail:** the player can retry right away or leave and come back later. Only that demo restarts.
7. **Report back.** When all four are hired, the objective changes to "Report to Elder Bednar in the Kimball Building." Talking to him completes Q1.

**Order rules:**
- Math and English can be done in any order, any time after step 1.
- **Art comes before Engineering.** The engineering candidate shows as "Waiting on the art demo" and can't be picked until Art is passed. The engineering demo repairs the projector that broke during the art demo.

**Finding the way:**
- The objective always names the next building or room.
- Bednar's mid-quest line points to the next stop.
- Waypoints (minimap markers plus an on-screen pointer, pinned to the edge when off-screen) mark the current target: the lobby, the escort destination, or Bednar.

**Skipping:**
- Every demo has a Skip button that hires the candidate without the test.
- `skipQuest()` hires everyone and completes Q1, for a "Skip quest" menu entry.
- A config flag turns skipping off.

### 2. Input

All four demos are fully playable with keyboard/mouse and with controllers. There is no typed text input anywhere. Mouse clicks work on every button, cell and word.

| Action | Keyboard | Controller |
|---|---|---|
| up / down / left / right | arrows, WASD | either joystick |
| confirm | Enter, Space, E | Button 1 |
| back | Esc, Backspace | Button 2 |
| alt | Q, Tab | Button 3 |
| pause | P | Button 4 |
| hint | H | left stick click |
| mirror | M | right stick click |

### 3. The teaching demo frame (shared by all four)

- **Cast:** each demo happens in a classroom with 4–5 students and the department chair watching from the back. The challenge UI sits on the room's teaching surface (chalkboard, gridded board, overhead projector or pegboard).
- **HUD while playing:** the candidate's name and portrait, a difficulty badge, the Hint, Skip and Leave buttons, a status line, and a **Class engagement** bar that fills as the player makes correct moves. Engagement is how progress is shown; pass/fail still uses each demo's own rule.
- **Reactions:** students react only to what the player does. A correct move gets a nod or "Oh, I get it." A wrong move gets confusion or "Wait, how?" Students and the chair **never** give answers. Reactions are short lines in a speech strip plus an optional cue to the world (`host.classReact`).
- **Hint:** framed as the candidate glancing at the lesson notes. It appears only when the player asks.
- **Fail:** the chair says "Let's take a short break and try that again." The player can Retry or Return.
- **Pass:** applause, a short color flash on the teaching surface (a preview of the color mechanic), and the chair's recommendation line.
- **Hard difficulty:** the chair asks one extra follow-up question at the end, as a multiple-choice prompt.
- **Difficulty:** easy, normal or hard, read from the game setting.

### 4. The four demos

#### 4.1 Math: "Binary, the Nephite way" (Romney Building, third floor, Math & Computer Science)

- **Premise:** the computer science students keep tripping on binary, and the chair asks the candidate to explain it so it sticks. The candidate uses the **gold coins of Alma 11**, which work like binary.
- **Dialogue (in data):**
  - Chair: "Our computer science students keep tripping on binary. Explain it so it sticks."
  - Candidate's opening board line: "Forget computers for a minute. The Nephites already used binary. Look at their coins."
- **Coins (gold only; verify against Alma 11:5–10):**

  | Coin | Value |
  |---|---|
  | senine | 1 |
  | seon | 2 |
  | shum | 4 |
  | limnah | 7, "the value of them all" |

  A judge earns 1 senine per day (Alma 11:3). The silver coins and fractions are left out on purpose; mention a silver coin only in the finale, as "the silver version of a limnah."
- **The idea:** any amount from 1 to 7 can be paid with at most one senine, seon and shum. Which coins you hold, written biggest to smallest, is the binary number: 101 means shum + senine = 5. A limnah equals one of each smaller coin (111).
- **Board widget:** three columns, shum · seon · senine. Each shows ✔/1 or blank/0 as coins are placed, so the binary number appears as the player works.
- **Questions** (asked by students, in data, in this order):

  | # | Question | Answer |
  |---|---|---|
  | 1 | "Pay 5 with the fewest coins." | shum + senine (101) |
  | 2 | "Pay 6." | shum + seon (110) |
  | 3 | "Pay 3." | seon + senine (011) |
  | 4 | "Why is a limnah worth 7?" (multiple choice) | "It's one of every smaller coin: 1 + 2 + 4." |
  | 5 | Finale (Alma 11:22): "Zeezrom offered Amulek six onties. An onti is the silver version of a limnah. How many days of a judge's pay is that?" (multiple choice) | 42. Class reacts: "Six weeks of work!" |

  - **Hard only:** add before the finale "Pay 9 with the fewest coins" (limnah + seon) and "Pay 13" (limnah + shum + seon).
- **Controls by difficulty:**
  - **Easy:** every question is multiple choice (4 options, shuffled each attempt; wrong options are common mistakes).
  - **Normal and hard:** coin questions use a **coin tray**. The player moves through the coins, confirm adds one to the board, back removes the last one, and alt submits. A correct total that uses more coins than needed is answered with "Right amount, but can you do it with fewer coins?" and counts as a miss.
- **Pass rule:** wrong answers allowed are 2 on easy, 1 on normal and 1 on hard (where the chair's follow-up also has to be right).
- **Hints:**
  1. "Start with the biggest coin that fits."
  2. Highlight the coins needed on the ✔/blank board.
- **Closing line:** a student says "Wait, so 101 just means shum, no seon, senine?" and the candidate answers "That's all binary is: which coins you're holding."

#### 4.2 English: "Editing for accuracy" (Smith Building, English classroom)

- **Premise:** a student, Brother Price, wrote a summary of President Hinckley's June 21, 2000 announcement, and it has mistakes. The candidate corrects it on the overhead projector.
- **Text:** a **short paraphrase written for the game**, labelled as such. Don't quote the real talk at length.
- **Errors:** 3–6 of them.
  - **Grammar or spelling:** their/there, is/are.
  - **History errors anyone can catch from information shown earlier in the game:** "Rexburg, *Utah*," "BYU–*Iowa*," "a *two-year* university," "*1900*." No obscure facts.
- **Controls:** a word cursor (left/right by word, up/down by line). Confirm flags a word and opens 3 corrections, one right and two plausible; back cancels. Mouse: click a word. A fixed word shows as a red circle and correction on the transparency.
- **Pass rule:** fix every error. Wrong flags allowed: unlimited on easy, 2 on normal, 1 on hard.
- **Reactions:** each correct catch gets a reluctant "…yeah, okay, that's fair" from Brother Price.
- **Hints:** easy highlights the sentences with errors and jumps to the next unfixed one. Normal highlights one sentence. Hard says how many errors are left.
- **Example passage** (errors in bold, fixes in brackets):
  > Brothers and sisters, today we announce a historic change. Ricks College, here in Rexburg, **Utah** [Idaho], will become a **two-year** [four-year] university. The new name will be Brigham Young University–**Iowa** [Idaho]. The school will keep its focus on teaching, and **there** [their] students will be blessed. This announcement **are** [is] made on June 21, **1900** [2000].

#### 4.3 Art: "Drawing what you see" (old Spori Building, third-floor art studio)

- **Premise:** the candidate teaches the grid method, drawing a building from an image shown by the overhead projector.
- **Subject (config, `art.subject`):**
  - `'temple'` (default): the Rexburg Temple, framed as the candidate's "vision of a temple on the hill." The temple was dedicated in 2008, after this setting, so the anachronism is deliberate. Optional music: an original arrangement of "High on the Mountain Top." The 1800s hymn is public domain, but don't use existing recordings.
  - `'tabernacle'`: the Rexburg Stake Tabernacle (1911), which really stood in 2000.
  - Ship templates for both.
- **Templates:** hand-designed pixel art, about 12 wide × 16 tall, in 5 colors, stored as string grids in data.
- **Canvas:** 20 × 24. The reference image is on the projected screen beside it.
- **Controls:** a cell cursor. Confirm paints, back erases, alt cycles colors, and **mirror** toggles symmetric painting. Mouse: click or drag to paint, right-click to erase. A **fill** tool (alt-held or a toolbar button) fills a closed area.
- **Scoring ignores position:**
  1. Try every offset of the template on the canvas.
  2. Score = matching colored cells ÷ the union of non-empty cells in the template and the drawing.
  3. Take the best offset.
  4. Optional: a cell one step off counts half.

  A Check action shows the score. Pass at 60% on easy, 75% on normal and 85% on hard.
- **Fun beats:**
  - **The class guesses** as you draw, from a list in data: "A castle?" → "Is it the Spori?" → "A wedding cake?" → the right answer. Guesses move along the list as the live score crosses thresholds.
  - **The projector bulb burns out** (normal and hard only), once, at about 40% score or after 45 seconds. The reference image flickers and goes dark, a student says "I'll get a new bulb!" and runs off, and the player draws from memory for 12 seconds (normal) or 15 seconds (hard) before the light comes back. Never on easy.
  - **Mirror moment:** the first time mirror paints a symmetric stroke, the class says "Ooh."
  - **Pass:** the drawing fills with color for a moment, then applause.
- **Hints:** easy flashes the best-aligned template outline over the drawing for 2 seconds and shows a live match meter. Normal flashes the outline. Hard shows the reference again for 3 seconds if it's hidden.
- **Handoff:** passing Art sets `projectorBroken = true` and unlocks Engineering.

#### 4.4 Engineering: "Fix it live" (Austin Building, electronics lab; unlocks after Art)

- **Premise:** partway through the interview, a Physical Plant worker (the campus maintenance office) wheels in **the overhead projector from the Spori art studio**.
  - Worker: "It keeps blowing fuses, and the art department needs it."
  - Chair, sliding it over: "Forget the lesson plan. Show us."
- **Mechanic:** modeled on *Crack the Circuit* (https://universeandmore.com/crack-the-circuit/). The projector's sealed unit shows how it **should** behave. The player wires a dot grid (about 5 × 4) on the bench pegboard so it behaves the same way.
- **Components:** battery (the mains supply, shown as a plug), lamp, fan, small power light, fuse, and switch. Lamps, the fan and the power light are all identical resistors. Brightness is bucketed into off/dim/bright; the fan shows stopped/slow/full.
- **Solver:** wires are 0 Ω, an open switch is a break, and the supply is a fixed voltage. Use nodal analysis or series/parallel reduction.
  - **Short circuit:** detect it, pop the fuse with a smoke puff and a student's "Whoa!", and show "The fuse blew — there's a short." Then a new fuse goes in and the player retries.
- **Pass:** for every switch state, the player's circuit matches the target behavior.
- **Levels:**

  | # | Goal | Teaches | Difficulty |
  |---|---|---|---|
  | 1 | Get the lamp to light | A complete circuit | all |
  | 2 | Lamp and fan both at full | Parallel; in series both run weak, which fails | all |
  | 3 | The power light glows dim while the lamp stays bright | Mixing series and parallel | normal, hard |
  | 4 | A pre-wired circuit keeps blowing the fuse: find the short and fix it with at most N wires | Short circuits | hard |

- **Wire limit:** levels 3–4 show a parts bin with a limited number of wires.
- **Controls:** the cursor jumps dot to dot. Confirm starts a wire and confirm again ends it on a neighboring dot. Alt cycles the component on the selected segment, back erases a segment, and a Test action powers the circuit. Mouse: drag between dots.
- **Pass beat:** the projector lamp throws a bright square on the classroom wall, and the class claps.
- **Hints:** easy highlights the gap in the loop or places one correct wire. Normal places one correct wire. Hard gives a text clue only, for example "The fan needs its own path to the plug."

### 5. Rooms (the world team builds them; Q1 needs anchors and cues)

Q1 needs these places, each as a world anchor. Describe them in the README for the world team. The details come from Ricks campus building records.

| Anchor | Place | Look |
|---|---|---|
| `kimball.bednarOffice` | Bednar's office | Executive office, desk, window |
| `kimball.personnelLobby` | Personnel Services lobby | Chairs for 4 candidates, a counter, the hiring board |
| `room.math` | Romney, 3rd floor | 1987 addition: drop ceiling, fluorescent panels, beige walls, blinds, tablet-arm desks, green chalkboard, beige CRT computers at the back, an out-of-date "Is your computer Y2K ready?" flyer |
| `room.english` | Smith Building classroom | Carpeted, desks in a U, overhead projector, transparencies, a framed portrait of President Hinckley |
| `room.art` | Old Spori, 3rd floor | 1903 rhyolite stone walls, creaky wooden floors, deep narrow windows, high ceilings, drafting tables, gridded board, projector on a cart, half-packed boxes, a "Last semester in the Spori" banner |
| `room.engineering` | Austin electronics lab | Cinderblock walls, fluorescent tubes (one flickering), black lab benches, oscilloscopes, a fuse panel, a resistor color-code poster, students in safety glasses |

**Shared pieces:** one room shell with swappable props, one student model with color swaps and poses (sit, hand up, nod, confused, clap), a chair NPC per room, a Physical Plant worker, and a projector prop that moves from Art to Engineering. The rooms stay sepia. The only color is the pass flash.

**In the standalone test page,** each room is a simple CSS/2D backdrop behind the overlay.

### 6. Architecture

**Q1 never touches the renderer, camera, movement or campus code directly.** It talks to the world only through this host contract:

```ts
type Difficulty = 'easy' | 'normal' | 'hard';
type SubjectId = 'math' | 'english' | 'art' | 'engineering';
type GameAction = 'up'|'down'|'left'|'right'|'confirm'|'back'|'alt'|'pause'|'hint'|'mirror';
type ClassCue = 'nod' | 'confused' | 'applause' | 'gasp' | 'ooh';
interface Waypoint { anchorId: string; label: string }

interface Q1SaveState {
  version: 2; started: boolean; reported: boolean; projectorBroken: boolean;
  candidates: Record<SubjectId, { status: 'notStarted' | 'failed' | 'hired'; attempts: number; skipped?: boolean }>;
}

interface Q1Host {
  getDifficulty(): Difficulty;
  setObjective(text: string): void;
  onInteract(anchorId: string, handler: () => void): () => void;      // returns unsubscribe
  openDialogue(lines: { speaker: string; text: string }[]): Promise<void>;
  setWaypoints(points: Waypoint[]): void;                              // minimap markers + on-screen pointer
  setFollower(characterId: string | null): void;                       // candidate escort
  enterRoom(anchorId: string, castId: SubjectId): Promise<void>;       // fade in, place students/chair, frame the teaching surface
  exitRoom(): Promise<void>;
  setPerspective(mode: 'player' | 'candidate', characterId?: string): void;
  classReact(cue: ClassCue): void;                                     // optional world animation; may be a no-op
  setQuestProgress(fraction: number): void;                            // 0..1 within Q1's third of the color
  completeQuest(): void;                                               // idempotent
  loadState(): Q1SaveState | null;
  saveState(state: Q1SaveState): void;
  onAction(handler: (a: GameAction) => void): () => void;
  pauseWorldInput(): void;
  resumeWorldInput(): void;
  getOverlayRoot(): HTMLElement;                                       // HTML layer above the 3D canvas
}
```

- **Two hosts:**
  - **`StubHost`:** the standalone test page. Buttons stand in for interactions, saving uses localStorage, rooms are CSS backdrops, and color progress is a bar.
  - **`WorldHost`:** the adapter onto the real world, and the **only** file that imports world code.
- **Shared UI, built first:**
  - **`DemoShell`:** the frame from §3, covering the title card, HUD, engagement bar, speech strip, hint, skip and leave, pass/fail screens, and the hard follow-up. Each demo implements `handleAction(a) → boolean`, `hint()`, `destroy()`, and reports `onProgress`, `onReaction`, `onPass` and `onFail`.
  - **`ChoicePanel`:** 2–4+ options, navigable by stick, arrows or mouse.
  - **`GridCursor`:** a 2D cursor over cells, dots or word tokens.
- **Rendering:** HTML/CSS plus 2D canvas overlays, in a blocky pixel style. Text stays high-contrast over sepia. All CSS is scoped under `.q1-`. No new npm dependencies, and Q1 doesn't import Three.js.
- **Folder:**
  ```
  src/quests/q1-hire-professors/
    index.ts              quest flow: order rules, escort, objectives, waypoints, progress, save, skip
    host/types.ts         the contract above
    host/StubHost.ts
    host/WorldHost.ts     written at integration
    ui/                   DemoShell, ChoicePanel, GridCursor, styles
    demos/{math,english,art,engineering}/
    data/                 candidates, dialogue, objectives, reactions, math questions, art templates + guesses, circuit levels, passage, config
    dev/                  standalone test page (own package.json with Vite + TypeScript; not shipped)
    README.md
  ```
- **Test page (`dev/`):**
  - "Talk to" buttons for Bednar, the lobby candidates and each room door.
  - A difficulty dropdown and an on-screen mock controller.
  - Live readouts: objective, waypoints, follower, perspective, room and color progress.
  - Skip Q1 and Reset save buttons.

### 7. Progress, color and saving

- **Color:** each quest restores one third of the color. Q1 reports `setQuestProgress(hired / 4)` after each hire, and calls `completeQuest()` **only** when the player reports to Bednar.
- **Saving:** save after every state change. Hired stays hired, `projectorBroken` persists, and completion is idempotent. An old or invalid save loads as a fresh state.

---

## Part 3: Plan

Work on a branch such as `quest/q1-hire-professors`, commit after each step, and check each step before moving on.

1. **Skeleton.** Host contract, StubHost, test page, DemoShell, ChoicePanel, GridCursor.
   *Check:* the test page loads, the mock controller and keyboard both move a cursor in a sample ChoicePanel, and a dummy demo can pass, fail and retry.
2. **Quest flow with placeholder demos.** Covers the Bednar intro, lobby, hiring board, escort, title card, enter/exit room, perspective switch, dev Pass/Fail buttons, report-back, order rules (Art before Engineering), skip, `skipQuest()`, saving and color progress.
   *Check:* the whole quest can be finished on the test page with placeholder demos, objectives always name the next stop, waypoints follow the target, Engineering stays locked until Art, and reloading keeps progress.
3. **Math.**
   *Check:* every answer matches Alma 11, the coin tray rejects a non-minimal answer with the "fewer coins" line, the ✔/blank board shows the binary, and all three difficulties pass and fail correctly.
4. **English.**
   *Check:* every planted error can be found and fixed with keyboard, controller and mouse, and the wrong-flag limits work.
5. **Art.**
   *Check:* a perfect drawing scores 100% at several different offsets, mirror and fill work, the guesses move along with the score, the bulb burnout happens only on normal and hard, and passing sets `projectorBroken`.
6. **Engineering.**
   *Check:* unit-test the solver. A series pair is dim, a parallel pair is bright, and a short is detected. All four levels can be solved, and the fuse pop and retry work.
7. **Polish pass.** Reactions, engagement bar, pass color flash, hard follow-up questions and README.
   *Check:* play the whole quest on each difficulty with only the mock controller.
8. **Integration**, once the world code is on `main`.
   - Read the world's quest registry, input layer, NPC/anchor/interaction system, HUD, minimap, camera, save, color effect and difficulty setting.
   - Write `WorldHost` and register Q1 with **one line**.
   - Where a hook is missing (escort follower, room enter/exit, partial color progress, the "Skip quest" menu entry), add a minimal, clearly marked one or ask the world teammate.
   - Match the world's Vite and tsconfig setup, and keep `dev/` working.

   *Check:* play Q1 start to finish in the real game.

**If time runs short:** keep all four demos at a simple working level instead of polishing one. Cut in this order: the class guessing in Art, the hard follow-up questions, Engineering level 4, then `classReact` animations (the speech strip alone is enough).

### Done when
- Q1 starts with Bednar, runs through the Personnel Services lobby, escorts each candidate to their room, and completes only after reporting back with all four hired.
- Math and English can be done in any order, Art always comes before Engineering, and Engineering repairs the projector from Art.
- Every demo switches to the candidate and back, and has three difficulties, a hint, skip, pass/fail/retry, class reactions and the engagement bar.
- Keyboard/mouse and controller (or mock controller) both work everywhere, with no typing.
- Math answers match Alma 11, Art scoring ignores position, the circuit solver tells series from parallel and catches shorts, and the English errors can be caught from in-game information.
- Color comes back in four steps that add up to one third, saves survive a reload, and `skipQuest()` works.
- All content is in `data/`, and the README covers running the test page, editing content, and what Q1 needs from the world (anchors, rooms, hooks).

### Open questions (proceed on these assumptions)
1. Art subject: the temple ("vision") or the Tabernacle? *Assumed: temple by default, with both templates shipped and a config switch.*
2. Final candidate names, dialogue and the paraphrased talk. *Assumed: placeholders in `data/`.*
3. Is summer 2000 confirmed as the setting for all quests? *Assumed: yes.*
4. Does an item from Engineering carry into Q3? *Assumed: no. Leave a clearly marked hook only.*

When you finish, report what's done, what's approximate, and which content still needs team input.
