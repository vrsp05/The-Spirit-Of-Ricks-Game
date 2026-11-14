THE SPIRIT OF RICKS - OPENING CUTSCENE

Integrated into the current main game without replacing its updated graphics,
audio settings, gameplay avatars, or quest modules.

PLACEMENT AND FLOW
- New Game plays this 48-second opening before the player gets control.
- It begins on campus and moves to President Bednar's Kimball Building office.
- The phone call finishes first; the title appears at 30-34 seconds.
- The assistant then knocks, is invited in, and enters the office.
- At the end, or when skipped, gameplay begins in the office before Quest 1.
- Continue does not replay the opening.

PREVIEW
Use Watch opening on the title screen, or append /?cutscene=preview to the
local dev-server URL. Preview returns to the title screen without saving.
The separate Desktop delivery folder still contains its standalone preview.

CONTROLS
Pause/Resume: on-screen button, Enter, E, Space, or controller confirm.
Skip: on-screen button, Esc, Backspace, or controller back/pause.
The timeline also pauses while the browser tab is hidden.
Subtitles and Bednar's animated mouth are retained; there is no spoken track.

FILES
OpeningCutscene.ts: camera, props, telephone, assistant entrance, and handoff.
opening.script.ts: dialogue and timing.
opening.css: subtitles, letterbox, title, and controls.
Game integration: ../game.ts and ../main.ts.
Gameplay avatar poses: ../player/Avatar.ts; current wardrobes remain intact.

The old Desktop integration patches target game-foundation 281f458. Do not
apply them to this already-integrated, newer main checkout.

HISTORICAL FRAMING
The deliberately fictional 1999 setting follows the approved script. The
public announcement was in June 2000. The player's role and staging are fiction.
The question and response follow Bednar's recollection in A Conversation on
Leadership (February 24, 2010).
https://broadcast.lds.org/elearning/hrd/LDSLeader/RESOURCES/Bednar_Script_no%20timecodes%5B1%5D.pdf
https://www.byui.edu/newsroom/25-years/ricks-to-become-byu-idaho-examining-the-june-21-2000-announcement
