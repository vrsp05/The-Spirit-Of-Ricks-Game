# Q1 demos: in-world layout plan (for review)

**Status:** built (Nov 14, 2026), following the approved mockup. Changes from the first draft: views are a `G  < name >  T` switcher (no tabs); Hint, Brief and More… are written in chalk on the board itself; the English bubble has a tail; the projector is bigger than its circuit board. A small window explains teaching demos the first time any demo starts.

## The problem
The demo happens on the board, but you play it in a black bar at the bottom of the screen. The two feel unrelated, and the bar crams buttons, words and sentences together.

## The idea
**You play on the board itself.** The bottom of the screen becomes a slim wooden **lectern edge** that holds only what can't live on the board: the class's line, a few tools, and the views.

```
┌──────────────────────────── the room (camera view) ─────────────────────────────┐
│                                                                                   │
│     CHALKBOARD / SCREEN / BENCH  ← you click and pick things here                │
│     (answers, words, paint cells, wire tiles are drawn here and react here)      │
│                                                                                   │
├─[Chalkboard][Coin poster][Class]──────────────────────────────── T / G ──────────┤  ← view tabs, like folder tabs
│ ┌ index card ─────────────────────┐   Class ▓▓▓░░    ( 💡 Hint ) ( ⓘ Brief ) ( ⋯ ) │  ← wooden lectern edge
│ │ Sister Hall: "Pay 6 with the    │                                    Skip/Leave │
│ │ fewest coins."                  │                                    in the ⋯   │
│ └─────────────────────────────────┘                                    menu       │
└───────────────────────────────────────────────────────────────────────────────────┘
```

- **Lectern edge** (about 18% of the screen, fixed height, never scrolls):
  - a warm wood band, not black;
  - a paper **index card** for the current line, in a serif, like a teacher's note;
  - round "stamp" buttons with generous spacing (at least 36 px tall, 12 px gaps);
  - **Skip** and **Leave** move into a small ⋯ menu, so they're not next to Hint.
- **View tabs** sit on the lectern's top edge like folder tabs. Click one to jump straight to it; **T** goes to the next view and **G** to the previous.

## Per demo

| Demo | On the board / bench (you click here) | On the lectern |
|---|---|---|
| **Math** | Answer choices are chalked as boxes on the right of the board. The Hard coin tray is a chalk row of the four coins along the bottom; click a coin to add it. The ✔/0-1 columns light up as now. | The student's question, then the feedback. |
| **English** | Click a word on the projected page. The correction choices pop up in red ink right above that word, also on the page. | Progress ("2 of 3 fixed"). |
| **Art** | Paint directly on the drawing board with the mouse. The small mouse pad goes away. | Chalk-tray colour swatches; Mirror, Bucket, Check. |
| **Engineering** | The projector sits **on the bench** with its circuit board opened up flat beside it (see below). Click the tiles on the bench. | Lamp and fan status. |

## Engineering bench (replaces the pegboard)
- The real overhead projector is about 0.5 m wide. The opened circuit board lies on the bench next to it at **1.4 m × 0.9 m**: large for a circuit board, but readable, like a teaching trainer board. It's tilted about 15° toward the camera.
- A ribbon of wires runs from the projector to the board, so it's clearly *its* circuit.
- **Views:** Bench (looking down at the projector and board, the tiles big enough to click) ↔ Board (the wall board with the goal chalked on it) ↔ Class. **T** / **G** move between them.

## Tutorial coach marks (first question of every demo)
These work like a mobile-game tutorial:
- The screen dims, except for one highlighted spot.
- A small note points at that spot and explains it.
- **Next ▸** goes to the next note; **Skip tutorial** ends it.

They show once per session per demo. Math replaces its current guided "Pay 5" with these:

- **Math:**
  1. "This is the student's question."
  2. "These are the Nephite coins: senine 1, seon 2, shum 4, limnah 7."
  3. "Each column is one coin: ✔ means you used it (1), empty means you didn't (0)."
  4. "Pick the coins: start with the biggest one that fits." Then the guided Pay 5 continues.
- **English:**
  1. "This is Brother Price's page."
  2. "Click a word that's wrong."
  3. "Pick the correction; it's written in red."
  4. "Fix every mistake."
- **Art:**
  1. "This is the picture to copy."
  2. "Paint on the board, square by square."
  3. "Pick colours here."
  4. "Check when it looks close. Watch the projector."
- **Engineering:**
  1. "This is the projector's circuit."
  2. "Click a tile to turn it."
  3. "Get power from + through the lamp back to −."
  4. "The lamp and fan show if it works."

## How it's built (technical)
- **Clicking on the board:**
  - The camera is exactly where Q1 points it (`focusCamera`), so Room3D can cast a ray from the mouse onto the board / screen / bench surface and get the canvas pixel under it.
  - Each demo already knows where it drew things, so a pixel maps to an answer box, a word, a cell or a tile.
  - This needs either one tiny contract addition, `world.screenRay(x, y)`, or Q1 mirroring the game camera's field of view (55°). The contract addition is cleaner; it's a world-team decision.
- **Keyboard and controller keep working:** a highlight cursor moves over the board items with the arrows and stick, and ① picks the highlighted item.
- **Coach marks:** a small shared helper (`q1/coach.ts`) that highlights a screen rectangle. Board items are converted from 3D to a screen position.
- **Order** (each step is playable by itself):
  1. Lectern restyle and coach-mark helper.
  2. English (clicking the page; the biggest crowding problem).
  3. Math.
  4. Art (painting on the board).
  5. Engineering bench rebuild.

  Each step gets a playthrough and screenshots.

## Questions for you
1. Is the **lectern edge** look right, or would you rather the bottom bar disappear entirely, with even the class line shown on the board or in the caption?
2. Should Skip and Leave go in a ⋯ menu, or stay visible?
3. Is the engineering **bench layout** (projector plus a flat, tilted circuit board beside it) what you pictured?
