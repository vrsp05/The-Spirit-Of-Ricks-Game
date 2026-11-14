Copy everything below into Claude:

---

# Quest 1 refinement: Hire the Professors

You are refining **Quest 1 (Q1)** of a browser game made at a 24-hour hackathon. A first version of Q1 already exists and works. Your job is to rework it into the refined design below **using the world's existing quest APIs**, without editing core engine files.

This brief has three parts:
- **Intent:** why and what good looks like. Use it when the spec doesn't cover something.
- **Spec:** what to build.
- **Plan:** the order to build it in, and how to check each step.

Where something is unclear, make a reasonable choice, mark it `// ASSUMPTION:` in code and in the README, and keep going.

**Repo:** https://github.com/vrsp05/The-Spirit-Of-Ricks-Game
**Base branch:** `game-foundation`. It holds the current world and the first Q1; use `main` once `game-foundation` is merged into it. Work on a branch such as `quest/q1-refine`.

Read these first. They are the source of truth and win over this brief if the two disagree:
- `docs/quest-contract.md` and `src/quests/contract.ts`: the only API quests may use.
- `docs/team-decisions.md`: settled decisions.
- `src/quests/shared/frame.ts` (`runChallenge`, `legend`, `h`, `btn`, `loop`) and `src/quests/shared/scenes.ts` (`bednarSteps`, `shoulderCam`).
- The current Q1: `src/quests/q1/` (`professors.ts`, `math.ts`, `art.ts`, `circuit.ts`, `english.ts`, `data/*.json`), plus `tests/q1.test.ts`.
- `GAME_CONFIG.locations`, `GAME_CONFIG.quests.professors` and `GAME_CONFIG.interiors` in `src/config/game.config.ts`.

---

## Part 1: Intent

### The game
- **What it is:** a voxel, third-person browser game about Ricks College becoming BYU–Idaho. It's built with Node.js, TypeScript, plain HTML and Three.js.
- **Color:** the campus begins as a lightly colored 90s photo and becomes more saturated after each quest.
- **Controls:** keyboard and mouse, or the team's ESP32 controllers (4 buttons and 2 sticks each).
- **Timeline:** Q1 is set in **Fall 1999** (era `ricks1999`). Reporting back to Bednar moves the world to Spring 2001.
- **No "BYU–Idaho" yet:** nothing in Q1 may say "BYU–Idaho" (team decision 22).

### What Q1 is
The player is President Bednar's assistant. The college is growing and needs teachers. The player meets four faculty candidates and takes each one to a **teaching demonstration** in their department. **The player plays each demo as the candidate**, then reports back to Bednar.

### What has to change from the first version (from team review)
- **It must flow like a real hiring day,** not "walk up to a stranger outside a building and a minigame starts." Candidates are picked up in the Kimball Building and taken to their department, and each challenge is framed as a lesson they teach to a class.
- **Every challenge must make sense as a lesson.** The classroom reacts to what the player does, but the player does all the solving.
- **Small surprises make it fun:** the class guessing what you draw, a projector bulb burning out, a fuse popping with smoke.
- **One story thread:** the projector that breaks in Art is the thing Engineering repairs.

### Success looks like
- A first-time player finishes Q1 in about 10–15 minutes without asking where to go.
- All four demos are fully playable with keyboard/mouse and with controllers, with no typing.
- Q1 uses only the quest contract. If a hook is truly missing, it's requested as a small, clearly marked contract addition.
- All text and levels live in `src/quests/q1/data/*.json`, and `npm test` passes.

### Keep
These parts of the current Q1 already match the design and stay:
- **Bednar cutscenes:** `onAssign`, `onReport` and `readyToReport`.
- **Perspective switch:** `setBanner("Playing as: …")` plus `focusCamera(shoulderCam…)`.
- **`runChallenge` frame:** hint, skip, leave and result/retry.
- **Scoring and progress:** `qualityScore`, `skippedFraction`, `reportColorProgress(hired/4)` and waypoints.
- **Art:** position-independent scoring, mirror and fill, and the voxel reveal.
- **Circuit solver behavior:** series is dim, parallel is bright, and shorts are detected.
- **Difficulty:** Easy and Hard only.

### Rules
- **Real people:** Bednar's lines are labelled game dialogue, never real quotes. There are no invented quotes from real people, and candidate names are fictional.
- **Temple:** the temple appears only as a future concept in 1999.
- **Facts:** verify dates and scripture values against primary sources.

---

## Part 2: Spec

### 1. Quest flow

1. **Assignment (keep `onAssign`).** Update `dialogue.json`: Bednar says the college is growing, the four candidates are waiting in **Personnel Services** down the hall, and the player should take each one to their demonstration and report back.
2. **The lobby.** The four candidates wait in a **Personnel Services lobby inside the Kimball Building**, each with a name tag and subject.
   - **Location:** new room-local anchors in the `kimball-office` space, for example `q1.lobby.math` and so on. They're Q1's own entries in `GAME_CONFIG.locations`.
   - **Hiring board:** a sign built with `world.voxel` and `world.label` shows each candidate as Waiting, In demo, Hired, or "Waiting on the art demo."
   - **The room:** if the hall in `kimball-office` is too narrow, ask the world teammate for a small lobby alcove in its layout. Until then, use the hall.
3. **Pick a candidate.** A short greeting cutscene plays (reuse the current greeting pattern). The candidate says they're due for a teaching demonstration in their building.
4. **Escort.**
   - The lobby NPC is removed and a follower NPC (owned by Q1) walks behind the player, moved in `update(dt)` using `world.playerPosition()`.
   - When the player and follower are in different spaces (interior versus exterior), hide the follower and re-place it by the door.
   - If following feels bad, fall back to "I'll meet you there": the candidate appears at the destination.
   - The objective names the destination, for example "Walk the math candidate to the Romney Building." The target is the demo door anchor.
5. **The demo door.** Each building gets a demo anchor, `candidate.<id>`, moved beside the entrance and **outside the entrance clear zone** (team decision 32).
   - Interacting with it plays a title card (a cutscene step or `ctx.ui.dialogue`): "Teaching demonstration · Romney Building." Then the banner and camera switch to the candidate and `runChallenge` opens.
6. **Result.**
   - **Pass:** applause, the chair's recommendation line, and `world.sound('cheer')`. The banner clears, the camera is released, the candidate is hired, and the board updates.
   - **Fail:** `ctx.fail()`. The player can retry right away or come back later.
7. **Report back:** keep `readyToReport` and `onReport`. Bednar's report lines mention the four hires.

**Order:**
- Math and English can be done in any order.
- **Art must be passed before Engineering.** Until then, the engineering candidate says "I'm waiting on the art department's demo," and the board shows it. Passing Art sets `progress.projectorBroken = true` and unlocks Engineering.

**Candidate placement** (`GAME_CONFIG.quests.professors.candidates` and `candidate.*` anchors):

| Subject | Building | Change |
|---|---|---|
| math | Romney | keep |
| engineering | Austin | keep |
| art | original Spori (`spori-original`) | keep |
| english | **Smith** (`smith`) | was Snow |

English moves to the Smith Building because that's where the English department was in 1999; the Snow was the performing arts center. Update team decision 2 and the Bednar lines.

### 2. The teaching demo frame (shared by all four)

Build a small `q1/classroom.ts` helper that every demo body uses inside `runChallenge`:
- **Classroom strip:** a voxel-style row along the top or side of the full-screen frame (team decision 33) showing 4–5 students and the department chair. They're drawn with DOM/canvas, and each room has its own color and props.
- **Speech strip:** one-line reactions, for example `react('nod', "Oh, I get it")`, `react('confused', "Wait, how?")`, plus `ooh`, `gasp` and `applause`. Lines come from data and play `world.sound` cues (`tick`, `error`, `pop`, `cheer`).
- **Class engagement bar:** fills with correct moves. It's for show only; pass/fail stays with each demo's own rule.
- **Who solves:** students only ask questions and react. They never give answers.
- **Hint:** framed as "glances at the lesson notes." Use the frame's `onHint`.
- **Pass beat:** a short color flash on the teaching surface, then applause.
- **Hard only:** at the end the chair asks one follow-up multiple-choice question.

Controls follow the contract's `PanelAction` mapping:
- left stick or WASD to move
- confirm ① (E)
- back ② (Esc)
- hint ③ (H)
- tools ④ (Tab)
- right stick ↔ (R/F) for alt/alt2
- right stick ↕ (T/G) for rup/rdown

Show the controls with `legend()`.

### 3. The four demos

#### 3.1 Math: "Binary, the Nephite way" (Romney, third floor, Math & Computer Science)
This replaces "Nephite Market." Reuse its coin tray, the fewest-coin DP and the reference checks.

- **Premise:** the computer science students keep tripping on binary, and the chair asks the candidate to explain it so it sticks. Fall 1999 is Y2K season, so a "Is your computer Y2K ready?" flyer fits the room.
- **Lines:**
  - Chair: "Our computer science students keep tripping on binary. Explain it so it sticks."
  - Candidate's opening board line: "Forget computers for a minute. The Nephites already used binary. Look at their coins."
- **Coins (gold only; verify against Alma 11:5–10):** senine 1, seon 2, shum 4, limnah 7 ("the value of them all"). A judge earns 1 senine a day (Alma 11:3). Leave out the silver coins and the fractions. One silver coin appears only in the finale.
- **The idea:** any amount from 1 to 7 can be paid with at most one senine, seon and shum. Which coins you hold, written biggest to smallest, is the binary number: 101 = shum + senine = 5. A limnah is one of each smaller coin (111).
- **Board widget:** three columns, shum · seon · senine, each showing ✔/1 or blank/0 as coins are placed.
- **Questions** (asked by students):

  | # | Question | Answer |
  |---|---|---|
  | 1 | "Pay 5 with the fewest coins." | shum + senine (101) |
  | 2 | "Pay 6." | shum + seon (110) |
  | 3 | "Pay 3." | seon + senine (011) |
  | 4 | "Why is a limnah worth 7?" (choice) | one of every smaller coin, 1 + 2 + 4 |
  | 5 | Finale (Alma 11:22): "Zeezrom offered Amulek six onties. An onti is the silver version of a limnah. How many days of a judge's pay is that?" (choice) | 42. Class: "Six weeks of work!" |

  - **Hard** adds "Pay 9" (limnah + seon) and "Pay 13" (limnah + shum + seon) before the finale.
- **Controls:**
  - **Easy:** all questions are multiple choice (4 shuffled options; wrong options are common mistakes).
  - **Hard:** coin questions use the tray (confirm adds a coin, back removes one, alt submits). A correct amount using too many coins gets "Right amount, but can you do it with fewer coins?" and counts as a miss.
- **Pass rule:** misses allowed are 2 on Easy and 1 on Hard.
- **Hints:**
  1. "Start with the biggest coin that fits."
  2. Highlight the needed coins on the ✔ board.
- **Closing line:** a student says "So 101 just means shum, no seon, senine?" and the candidate answers "That's all binary is: which coins you're holding."
- **Classroom look:** drop ceiling, fluorescent panels, beige walls and blinds, tablet-arm desks, a green chalkboard, and beige CRT computers at the back.

#### 3.2 English: "Editing for accuracy" (Smith Building, English classroom)
Keep the "Red Pen Rush" timing mechanic, but reskin it:
- **The page:** a transparency scrolls slowly up the overhead projector instead of a press line.
- **The marking:** the candidate stamps words with a red marker as they cross the lamp line, then picks the correction.

**Content change:** the passage is now a student's (Brother Price's) **summary of the Kimball Building's dedication** (September 1999). The old passage was a paraphrase of the June 2000 announcement, which comes after Q1's Fall 1999 setting and names BYU–Idaho, against team decision 22.
- **Text:** a labelled fictional student summary with no quotes from real people. Verify facts against the 1999 Church News article on the dedication. The building is named for President Spencer W. Kimball and was dedicated by President Hinckley.
- **Errors:** 3–6, which anyone can catch from things seen in the game:
  - "Rexburg, *Utah*"
  - "Ricks *University*" (the campus sign says Ricks College)
  - "*1899*" (the HUD says Fall 1999)
  - "the *Hinckley* Building" (the wall plaque says Spencer W. Kimball Building)
  - one their/there and one is/are
- **Wrong stamps allowed:** keep the current rules (unlimited on Easy, 2 on Hard; Hard scrolls faster).
- **Reactions:** each correct catch gets a reluctant "…yeah, okay, that's fair" from Brother Price.
- **Classroom look:** carpeted (the Smith Building really had carpeted classrooms), desks in a U, an overhead projector and a box of transparencies.
- **Team note:** update team decision 3.

#### 3.3 Art: "Drawing what you see" (original Spori, third-floor art studio)
Keep the canvas, position-independent scoring (60% on Easy, 85% on Hard), mirror, fill and the voxel reveal. Add:
- **Framing:** the candidate teaches the grid method, copying the reference shown by the overhead projector. Subject in config, `art.subject`:
  - `'temple'` (default): the existing future-temple concept, framed as the candidate's "vision of a temple on the hill." Optional music: an original arrangement of "High on the Mountain Top." The 1800s hymn is public domain, but don't use existing recordings.
  - `'tabernacle'`: the Rexburg Stake Tabernacle (1911). Add a template for it.
- **The class guesses as you draw:** "A castle?" → "Is it the Spori?" → "A wedding cake?" → the right answer. Guesses move along as the live score crosses thresholds in `art.json`.
- **The projector bulb burns out** (Hard only), once, at about 40% score or after 45 seconds. The reference flickers and goes dark, a student says "I'll get a new bulb!", and the player draws from memory for 15 seconds before it comes back. Never on Easy.
- **Mirror moment:** the first mirrored stroke makes the class say "Ooh."
- **Pass:** a color flash, then the voxel reveal, then applause. Set `projectorBroken = true`.
- **Classroom look:** 1903 rhyolite stone, creaky wood floors, deep narrow windows, drafting tables, a projector on a cart, and a "Final year in the old Spori" banner. The building was vacated in 2000.

#### 3.4 Engineering: "Fix it live" (Austin Building, electronics lab; unlocks after Art)
Keep the circuit engine (tile rotation, the live current display, the solver) and **re-theme the levels around the broken projector**:
- **Opening:**
  - A Physical Plant worker (the campus maintenance office) wheels in the Spori art studio's projector: "It keeps blowing fuses, and the art department needs it."
  - Chair: "Forget the lesson plan. Show us."
- **Levels:**

  | # | Goal | Teaches | Mode |
  |---|---|---|---|
  | 1 | Get the lamp to light | A complete circuit | Easy, Hard |
  | 2 | Lamp and cooling fan both at full | Parallel; in series both run weak | Easy, Hard |
  | 3 | The power light glows dim while the lamp stays bright | Mixing series and parallel | Easy, Hard |
  | 4 | Find and fix the short that keeps blowing the fuse | Short circuits | Hard |

  Easy plays levels 1–3 and Hard plays 1–4, the same counts the current tests expect.
- **Fan:** works like a bulb in the solver, shown as stopped, slow or full.
- **Short circuit:** the fuse pops with `world.sound('pop')`, a smoke puff and a student's "Whoa!", then a new fuse goes in and the player retries.
- **Pass:** the lamp throws a bright square on the classroom wall, and the class claps.
- **Classroom look:** cinderblock, fluorescent tubes (one flickering), black lab benches, oscilloscopes, students in safety glasses, and the projector on the bench.

### 4. Data and tests
- **Data:** all lines, questions, levels, guesses, reactions and look notes go in `src/quests/q1/data/*.json`.
- **Tests:** update `tests/q1.test.ts` to match. Keep:
  - the Alma 11 checks;
  - the fewest-coin optimum;
  - art scoring at any offset;
  - series/parallel/short in the solver;
  - the English answer keys.

  Add tests for:
  - the math binary questions and the Hard extra questions;
  - Art-before-Engineering order and the persisted `projectorBroken` flag;
  - the English facts (Kimball, Hinckley, 1999, Rexburg, Idaho, Ricks College).

### 5. Contract additions (only if needed)
Ask the world teammate first. If you must add one, keep it minimal, put it in its own commit, and mark it `// CONTRACT ADDITION (Q1):`. The likely ones:
- **A lobby alcove** in the `kimball-office` layout.
- **A way to hide or show a Q1-owned object across interior/exterior spaces,** if `addObject` plus `playerPosition` isn't enough for the escort.

---

## Part 3: Plan

Commit after each step. Run `npm run typecheck` and `npm test` each time.

1. **Flow first, with the old demo bodies still in place.**
   - Lobby anchors, the hiring board, escort (or the meet-there fallback), demo doors beside the entrances, title cards, Art-before-Engineering gating, and English moved to Smith.
   - *Check:* play the whole quest in the game. Objectives and waypoints always point to the next stop, Engineering is locked until Art, and a reload keeps progress.
2. **`classroom.ts`:** the strip, reactions, engagement bar, pass flash and the Hard follow-up.
   - *Check:* it shows in all four demos and works with the mock controller.
3. **Math → binary.** *Check:* the tests, and every answer matches Alma 11.
4. **English → Kimball dedication summary on the projector.** *Check:* the tests, and no "BYU–Idaho" anywhere in Q1 (grep for it).
5. **Art additions:** guesses, bulb burnout (Hard), the "ooh," and `projectorBroken`. *Check:* the tests, and the burnout never happens on Easy.
6. **Engineering → projector levels.** *Check:* the solver tests, all levels solvable, and the fuse pop and retry work.
7. **Polish and docs:** update `docs/team-decisions.md` (decisions 1–3), `dialogue.json` and the README notes.
   - *Check:* play all of Q1 on Easy and on Hard using only the mock controller.

**If time runs short:** cut in this order: the class guessing, the Hard follow-up questions, the escort (use meet-there), then the engagement bar animation.

### Done when
- Q1 starts with Bednar, runs through the Personnel Services lobby, takes each candidate to a demo door at their building, and completes only after reporting back with all four hired.
- Math and English can be done in any order, Art comes before Engineering, and Engineering repairs Art's projector.
- Each demo switches to the candidate and back, and has the classroom strip, reactions, a hint, skip, pass/fail/retry, and Easy/Hard.
- Keyboard/mouse and controllers both work everywhere, with no typing.
- Math answers match Alma 11, the English facts match the 1999 dedication, nothing says BYU–Idaho, and all tests pass.

### Open questions (proceed on these assumptions)
1. Art subject: temple or Tabernacle? *Assumed: temple by default, with a config switch.*
2. Lobby location: an alcove or the existing hall? *Assumed: the hall until the world teammate adds an alcove.*
3. Final candidate names and dialogue. *Assumed: placeholders in data.*

When you finish, report what's done, what's approximate, any contract additions, and which content still needs team input.
