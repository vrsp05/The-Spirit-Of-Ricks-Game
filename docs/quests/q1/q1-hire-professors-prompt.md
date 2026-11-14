Copy everything below into Claude:

---

# Quest 1: Hire the Professors (current design and how it's built)

Q1 is built and playable on the `game-foundation` branch. This brief tells you what it is, how it works and where everything lives, so you can maintain it, polish it or extend it without breaking the design.

- **Intent:** why Q1 exists and what good looks like.
- **Spec:** the design as built.
- **Plan:** what's left.

Read these first; they win over this brief if they disagree:
- `docs/quest-contract.md` and `src/quests/contract.ts`: the only API quests may use.
- `docs/team-decisions.md`.
- The Q1 code in `src/quests/q1/` and `tests/q1.test.ts`.

**Repo:** https://github.com/vrsp05/The-Spirit-Of-Ricks-Game

---

## Part 1: Intent

### The game and Q1
- **The game:** a voxel, third-person browser game (Node.js, TypeScript, plain HTML, Three.js) about Ricks College becoming BYU–Idaho.
- **Setting:** Q1 is set in **Fall 1999** (era `ricks1999`). Nothing in Q1 may say "BYU–Idaho" (team decision 22).
- **The player:** President Bednar's assistant. The college is growing and needs teachers.
- **The quest:** the player hires four faculty candidates. Each candidate gives a **teaching demonstration inside a real classroom**, and **the player plays the demo as the candidate**.

### What players should feel
- **A real hiring day, not a list of minigames:** pick up candidates in the Kimball Building's Personnel Services office, walk them to their department, and watch the class react.
- **No abrupt starts:** walking into a classroom plays a short scene that leads into the challenge.
- **Challenges are part of the world, not separate apps:** the lesson is on the chalkboard, the reference is on a poster or projected on the wall, the transcript is projected on the whiteboard, and the circuit is on a pegboard beside the broken projector. On-screen interface is only a slim strip for what really needs precision.
- **One story thread:** the art studio's old overhead projector always shorts out during the art demo, and the engineering demo repairs it.
- **Nobody gets lost or stuck:** objectives name the next place, map markers point there, and every demo has a hint and can be skipped.
- **Inputs:** keyboard/mouse and the ESP32 controllers (4 buttons, 2 sticks) both work everywhere, with no typing.

### Rules
- **Real people:** Bednar's lines are labelled game dialogue, never real quotes. Candidate and student names are fictional.
- **Temple:** the temple appears only as the art candidate's "vision of a temple on the hill" (the real Rexburg Temple was dedicated in 2008).
- **Facts:** verified against primary sources. Alma 11 for coin values; the Church News, Sept 11, 1999, for the Kimball dedication; the Ricks *Campus Building Histories* for which department was in which building.

---

## Part 2: Spec (as built)

### 1. Quest flow
1. **Bednar** (Kimball office) assigns Q1 in a cutscene (`onAssign`). The four candidates wait in Personnel Services. Art must come before engineering; Bednar says only that the departments scheduled it that way (nobody foreshadows the projector).
2. **Personnel Services** is a room off the Kimball hall (classroom walls such as the coin poster, fact clipping and projected reference are dressed as soon as the rooms are built), with a counter, waiting chairs, file cabinets, a "Faculty interviews today" sign and a floating hiring board.
   - The four candidates stand there.
   - Talking to one plays a greeting, then they follow you.
   - Toast: "Walk me over, and then come back here for the next candidate."
3. **Escort:** the candidate walks **beside** the player (never between the player and the camera) and says two walk-and-talk lines (shown as toasts, not bubbles), which set up their demo.
4. **The classroom:** each department building's entrance leads into its classroom interior. **Walking in starts the walk-in automatically**: no ring, no button. It's skippable with Esc, and only the last beat plays on later attempts.
   1. Students turn to the door and one whispers, for example "Is that the new math teacher?"
   2. The candidate walks up the side aisle to the front.
   3. The chair stands, names the class's problem and asks the candidate to teach it (for example "Our computer science students keep tripping on binary. Sister Ames, could you explain it so it finally sticks?").
   4. The candidate answers and frames the lesson (for example "Let's look at it through Nephite money: the gold coins in Alma 11."). This line (`intro.frame` in `classroom.json`) also plays on retries, so a demo never starts cold.
   5. The demo's title is chalked onto the board, the banner says "You are now the … candidate", and the bottom strip slides up.
   - **The bottom strip never scrolls:** one top row holds the class line (up to two lines), the Class meter, the view button and Hint/Skip/Leave; the demo's controls sit below it. Board text is laid out to stay fully visible from the default view (the lab's wall-board notes sit in the column the pegboard doesn't hide).
5. **The demo** (§3). A dismissable **How this works** card opens once per room per session (and with **Brief**/B): you're the candidate, the lesson moves forward as you play, what it teaches, how to play. The minimap and the task list are hidden during demos. View tabs jump straight to a view; **T** next, **G** previous. No speech bubbles: lines appear in the caption or the strip. On a pass, a small result card appears, then the **ending**: the chair's verdict over the class, then the candidate's thanks. The candidate stays at the front of the room.
6. **Next stop:** back to Personnel Services for the next candidate, a round trip around campus each time. **Skip challenge** plays the same ending as a pass. Walking into a classroom without its candidate plays one line from the chair ("They're waiting in Personnel Services"). After the art demo, a short scene shows the dead projector and the chair sending it to the Austin lab.
7. **Order:** suggested route math → English → art → engineering. Math and English can be done in any order; **engineering stays locked until art is hired**.
8. **Report:** after all four are hired, the player reports to Bednar (`readyToReport`/`onReport`) and Q1 completes.

**Persisted progress keys:** `hired`, `skipped`, `quality`, `attempts`, `escort`, `firstPicked`, `projectorBroken`.

### 2. The classroom (shared)
- **Interiors** (`GAME_CONFIG.interiors` + `LAYOUTS`, marked "CONTRACT ADDITION (Q1)"): `q1-room-math` (Romney), `q1-room-english` (Smith), `q1-room-art` (original Spori), `q1-room-engineering` (Austin). Each is 16 × 14, with its exterior door at that candidate's `candidate.*` anchor.
- **`Room3D`** (`q1/room3d.ts`) builds each room with quest-contract calls only. Modelled on a real lecture room:
  - boards spanning the front wall with a wood ledge, and a screen case above;
  - white two-person tables with gray chairs in rows, with a centre aisle;
  - gray window shades and gray carpet;
  - a drop ceiling with light panels and a hanging projector, **shown only during scenes and demos**, because the gameplay camera looks down from above.
  - Art keeps drafting tables; the lab has black benches, oscilloscopes and a fuse box.
- **Room3D also provides:**
  - live **surfaces** (canvas textures) the demos draw on: `board`, `poster`, and `peg` in the lab;
  - **camera views** the player cycles with **T** (right stick ↑): board, poster, class, plus bench in the lab;
  - speech bubbles over students and the chair, and student hops;
  - prop signals: projector lamp, fan, fuse flash, and the art projector beam.
- **The bottom strip** (`withClassroom` in `q1/classroom.ts`) wraps the shared `runChallenge` frame and adds:
  - the room name, a speech line and a small "Class" engagement meter;
  - the view button and a pass colour flash;
  - **Hard only:** the chair says "One more question before I decide," asks a multiple-choice follow-up, and recommends you only after a correct answer.

### 2b. Playing on the board (in-world layout)
- **You click the board itself.** `Room3D.pick` traces the mouse from the screen onto the board, screen or bench surface (it mirrors the game camera: Q1's `focusCamera` position and the 55° field of view), and demos register clickable areas with `setHotspots`: math answers and coins, English words and the red correction bubble (with a tail), art cells (drag to paint, right-click erases), engineering tiles.
- **Hint, Brief and More…** are chalk words drawn on the board (`setOverlay`), clickable; More… opens Skip / Leave (Tab also opens it).
- **The lectern** (bottom strip): a paper index card with the class's line, the Class meter, and the view switcher `G  < Chalkboard >  T`. Demo-specific status sits below it.
- **First demo ever:** a small window explains that you're playing the candidate and that completing the challenge delivers the demonstration. Then the room's How this works card, then tutorial coach marks (`q1/coach.ts`, once per room per session) that highlight board regions the demos mark with `setRegion`.
- **Engineering bench:** the projector (2.0 m wide) sits on the bench beside its opened circuit board (1.7 × 1.15 m on a tilted stand).

### 3. The four demos

| Demo | Room | What's in the world | What's in the strip |
|---|---|---|---|
| **Math — "Binary, the Nephite way"** | Romney 3rd floor (Math & CS) | Chalkboard: the student's question and the shum · seon · senine ✔/0-1 board, which lights up the answer. Alma 11 gold-coin poster on the side wall. | Answer choices (Easy) or the coin tray (Hard); feedback; Next. |
| **English — "Editing for accuracy"** | Smith Building | The whole of Brother Price's summary of the Kimball dedication is projected on the whiteboard. A yellow cursor moves word by word and line by line. A correction is struck through with the fix written above in red ink. A Church News fact clipping is on the bulletin board. | Progress, the current line as clickable words (mouse), correction choices. |
| **Art — "Drawing what you see"** | Original Spori 3rd floor | You paint **directly on the studio board** (brush cursor and hint outline on the board). The projector beams the temple reference onto the side wall and **always shorts out** (Easy 90 s, Hard 40 s, or right at the end if you finish first); the wall goes dark. | Colours, mirror, fill, check, match meter (Easy), small mouse pad. |
| **Engineering — "Fix it live"** | Austin electronics lab | Physical Plant brings in the Spori's projector. You rotate wire tiles **on a pegboard on the bench beside it**; its lamp lights, its fan spins, and the fuse box flashes on a short. | Goal, lamp/fan status (fan shows stopped/slow/full), small mouse pad. |

**Details:**
- **Math:**
  - **Opening:** an unscored **guided tutorial** (once per session; a retry goes straight to the lesson): "Pay 5", shum then senine, with the coin highlighted each step, ending at 1 0 1 → 5.
  - **Questions:** Pay 6 · read 011 · Pay 7 (one limnah) · why is a limnah 7 · Zeezrom's six onties = 42 days of pay. Hard adds Pay 9 and Pay 13.
  - **Rules:** misses allowed are Easy 2, Hard 1. On Hard, a right amount with too many coins counts as a miss.
- **English:** Easy has 3 mistakes, Hard 6. Wrong marks allowed: Easy unlimited, Hard 2. Hints highlight the sentence.
- **Art:** pass at 60% on Easy, 85% on Hard. Scoring ignores position, the class guesses as you draw, the first mirror stroke gets an "ooh", and passing shows a voxel reveal. Music comes from the game's background playlist (`src/fx/music.ts`, the team's recordings in `public/music/`), which includes "High on the Mountain Top". The art demo's own music hook (`art.json` → `music`) is off so the two don't overlap.
- **Engineering:** Easy plays 3 levels, Hard 5: lamp; lamp + fan in parallel; fan switch; dim power light + slow fan in series with the lamp bright; **Find the short** (the board starts sparking because one stray wire bridges + to −; find it and turn it).

### 4. Content and tests
- **Content** lives in `src/quests/q1/data/`:
  - `dialogue.json`: Bednar's lines, greetings, walk lines, waiting lines.
  - `classroom.json`: rooms, chairs, students, walk-in and verdict lines, follow-ups.
  - `math.json`, `english.json`, `art.json`, `circuit.json`.
- **Tests** (`tests/q1.test.ts`):
  - Alma 11 values, fewest coins, the binary digits, Zeezrom = 42, the tutorial;
  - English answer keys, facts and page layout;
  - Art scoring at any offset, Easy short time later than Hard, the templates;
  - circuit series/parallel/short;
  - config: art before engineering, lobby and door anchors, English in the Smith, a follow-up for every room, and no "BYU" in Q1 data.

---

## Part 3: Plan (what's left)

1. **Fail paths:** played on Easy for math: losing, Retry (straight to the lesson), Leave and walking back in (the short walk-in plays). The other demos use the same frame.
2. **Music:** handled by the background playlist; nothing to add.
3. **Tune after playtests:** walk-in shot timing, waiting-spot offsets (`wait` in `GAME_CONFIG.quests.professors.candidates`), short times in `art.json`.
4. **World teammate:** review the marked additions in `src/interiors/interiors.ts` (Kimball Personnel Services room and the four classrooms) and in `GAME_CONFIG`.
5. **Team content:** the candidates have fictional names (Sister Ames, Brother Nielsen, Sister Okada, Brother Ruiz, set in `GAME_CONFIG.quests.professors.candidates[].name`); change them freely. Dialogue is authored placeholder text.
6. **Quest 2** is Gio's: `game-foundation` only has a labelled placeholder (`src/quests/placeholders/construction.placeholder.ts`). See `docs/quests/q1/world-team-notes.md`.

**Keep while editing:**
- the quest contract only (no renderer, player or input imports);
- content in `data/`;
- `npm run typecheck` and `npm test` passing;
- every change played once in the browser (the dev build exposes `window.__game`, and the title menu has "Jump to a quest (testing) → Quest 1").
