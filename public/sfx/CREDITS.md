# Sound effect credits

All files in this folder are **CC0 1.0 (public domain)**: free for commercial use, no attribution required. They were converted to AAC (`.m4a`) so every browser can play them.

| Files | Source | Author | License |
|---|---|---|---|
| door-open, door-close, coin, coin-2 | [RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney (kenney.nl) | CC0 |
| tick, chime, success, error | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 |
| car-door, sit | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney (kenney.nl) | CC0 |
| ambience-birds-wind | ["Birds and Wind - Ambient"](https://opengameart.org/node/93987) | spring-spring (OpenGameArt) | CC0 |

The car engine, bike bell, pass-by whoosh, fireworks, cheering and **footsteps** are synthesized in code (`src/fx/audio.ts`). Footsteps are built from a soft heel + toe contact shaped per surface (concrete, tile, wood, carpet, grass, snow) and follow the character's walk cycle; the earlier recorded impact one-shots sounded like gunshots when repeated.
