THE SPIRIT OF RICKS - ENDING CUTSCENE

Integrated into the current main game. This replaces the old STC walk-in
celebration trigger while preserving current quest content and graphics.

PLACEMENT AND FLOW
- Collecting the last letter alone does not start the ending.
- Placing the fourth letter on the BYUI sign near the roundabout completes
  Quest 3 and starts the 40-second ending as all three quests are complete.
- The first shot places I on the sign and restores full color.
- Next come the 2026 torch ceremony, drone formations, and Vikings.
- The final camera pullback reveals the cheering team presenting the scene
  on a large screen in the STC atrium, with the sign BYUI iHack 2026.
- Bednar, Susan Bednar, Alvin F. Meredith III, and Jennifer Meredith smile
  together on the podium. Guests and presenters have no floating names.
- Skip and normal completion both offer Replay ending, Keep exploring, and
  Title screen. Keep exploring retains full color in the present-day era.
- Continue resumes a finished game without replaying the ending. If the game
  closed before the ending finished, Continue plays the pending ending.
- The final quest's reward remains recorded exactly once.

PREVIEW
Use Watch ending on the title screen, or append /?cutscene=ending to the
local dev-server URL. Preview does not alter saved progress.
The separate Desktop delivery folder still contains its standalone preview.
Pause with Enter or the on-screen button; skip with Esc or the skip button.
There is no spoken dialogue track. Browser-tab hiding pauses the timeline.

FILES
EndingCutscene.ts: timeline, camera, sign, menus, preview, and restoration.
EndingStage.ts: ceremony set, torch, drones, Vikings, and audience.
STCPresentation.ts: screen, cheering team, atrium, and final pullback.
CutsceneAvatar.ts: approved ceremony and presenter models, isolated from
  the newer gameplay avatar's wardrobes, knees, blinking, and animation.
ending.script.ts and ending_cutscene.txt: timing and approved adaptation.
ending.css: ending-specific layout.
Game wiring: ../game.ts, ../main.ts, ../finale/finale.ts, ../quests/q3/letters.ts,
  ../world/World.ts, and ../render/Renderer.ts.

The Desktop integration patches target game-foundation 281f458. Do not apply
those older patches to this already-integrated, newer main checkout.

DESIGN AND REFERENCES
A simplified fictional tribute to Light the Legacy. Dialogue and formations
are adapted for the game. The STC atrium and team likenesses follow the
approved photo references; personal source photographs are not bundled.
https://byuiscroll.org/light-the-legacy-in-the-midst-of-miracles/
https://www.byui.edu/radio/the-spot-the-vikings-return
https://www.byui.edu/president/
https://newsroom.churchofjesuschrist.org/article/bednars-to-host-face-to-face-for-young-adults-on-september-12
