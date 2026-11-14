# Geographic accuracy review

## What was checked (2026-11-13)
- **Game vs. source data.** Top-down captures (`accuracy/overhead-ricks1999.jpg`, `accuracy/overhead-presentFinale.jpg`) were taken with the dev "Overhead view (north up)" at the same framing, about 820 m across, centred at (30, −80). They were compared against a labelled render of the raw OSM data (`accuracy/osm-reference-labels.png`). Building positions, the road grid, the two roundabouts on Viking Street, the Romney/Clarke oval quad, the diagonal residence halls (Chapman/Lamprecht, Biddulph/Rigby) and the parking lots all line up. The meshes are rasterized on a 1.5 m voxel grid, so edges can be off by up to about 0.75 m.
- **Relative layout vs. known geography.** The temple sits at the south-east high point. Snow, Spori and Romney are at the north end of campus, the Manwaring Center is central, and Kimball and Taylor are south of Viking Street. Terrain rises to the south-east, consistent with USGS data.
- **Era visibility.** In the 1999 capture there is no I-Center, Hinckley, Ricks Building, STC or temple, and the original Spori and Kirkham are present. In the present-day capture those buildings appear and the Visual Arts Studio replaces Kirkham.

## Not yet checked (needs a person)
- **Official map:** a systematic comparison against https://maps.byui.edu/. The viewer pans with inertia, so automated framing was unreliable. Suggested manual check: open the game with `?dev=1`, teleport to `spawn`, click "Overhead view", and compare 5 landmarks (Spori, Manwaring, Kimball, Hart, STC) and 2 routes (the Viking Street roundabouts; the path from Manwaring north to the Spori quad).
- **1999 aerial** (byui.edu/about/history): needed to place Kirkham, check 1999 roads/paths, and find buildings that have since been demolished.

## Scale and traversal
Scale is 1:1 metres. Walking is 4.2 m/s and running 8.5 m/s, so crossing the 1.1 km campus north to south takes about 2:10 at a run. Tune these in `GAME_CONFIG.player` after playtests; don't shrink the map.
