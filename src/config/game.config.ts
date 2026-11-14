// Team-editable configuration. Everything marked DEV/OPEN is a placeholder for a
// decision the team has not made yet — see docs/team-decisions.md.
//
// COORDINATES: exterior anchors are given in REAL-WORLD metres from the campus
// origin (x = east, z = south; north is -z), exactly as in the source map. The
// game compacts the world at runtime (world.scale), so anchors stay geographically
// meaningful. Interior anchors (with `space`) are room-local metres (not scaled).
// An anchor with `building` snaps to the nearest wall of that building and is
// pushed `offset` metres outside it. Dev panel "Copy position" gives real metres.
import type { EraId } from '../world/eras';

export interface Anchor { x: number; z: number; space?: string; yaw?: number; label?: string; building?: string; offset?: number }

export const GAME_CONFIG = {
  title: 'The Spirit of Ricks',
  disclaimer: 'A fictional, symbolic adventure. Quests are gameplay — not claims that these events happened.',

  player: { walkSpeed: 5, runSpeed: 11, radius: 0.45, jumpSpeed: 7, gravity: 22 },
  cart: { maxSpeed: 17, reverseSpeed: 6, accel: 9, turnRate: 2.0, radius: 0.95 },
  camera: { distance: 12, minDistance: 4, maxDistance: 40, pitch: 0.5, minPitch: 0.12, maxPitch: 1.35, interiorMaxDistance: 10, interiorMinPitch: 0.8 },

  // Stable anchor ids (quest prompt): npc.bednar.office, candidate.*, construction.*, letter.*, sign.byui, door.stc.main
  locations: {
    'spawn':                 { x: 118, z: -84, yaw: 0, label: 'Quad north of the Kimball Building' },
    // Doors snap to the named building's wall.
    'door-kimball':          { x: 125, z: -60, building: 'kimball', label: 'Kimball Building, north entrance' },
    'door.stc.main':         { x: -140, z: 236, building: 'stc', label: 'Science and Technology Center, north entrance' },
    // President Bednar's office inside the Kimball Building (executive offices, HOB p.26). Room-local.
    'npc.bednar.office':     { x: 0, z: -7, space: 'kimball-office', yaw: 0, label: 'President’s office, Kimball Building' },
    // Quest 1: candidates wait in Personnel Services (the Kimball hall for now; room-local),
    // then the assistant walks each one to a teaching-demo door beside their department building.
    'q1.lobby.math':         { x: -1.9, z: 2.5, space: 'kimball-office', yaw: Math.PI / 2, label: 'Personnel Services, Kimball Building' },
    'q1.lobby.engineering':  { x: 1.9, z: 2.5, space: 'kimball-office', yaw: -Math.PI / 2, label: 'Personnel Services, Kimball Building' },
    'q1.lobby.art':          { x: -1.9, z: 5.5, space: 'kimball-office', yaw: Math.PI / 2, label: 'Personnel Services, Kimball Building' },
    'q1.lobby.english':      { x: 1.9, z: 5.5, space: 'kimball-office', yaw: -Math.PI / 2, label: 'Personnel Services, Kimball Building' },
    'q1.lobby.board':        { x: 0, z: 0.2, space: 'kimball-office', label: 'Personnel Services hiring board' },
    'candidate.math':        { x: -12, z: -318, building: 'romney', offset: 3.5, label: 'Romney Building' },
    'candidate.engineering': { x: -82, z: 108, building: 'austin', offset: 3.5, label: 'Austin Building' },
    'candidate.art':         { x: 44, z: -395, building: 'spori-original', offset: 3.5, label: 'Spori Building' },
    // English department was in the Joseph Fielding Smith Building (Campus Building Histories).
    'candidate.english':     { x: 94, z: -238, building: 'smith', offset: 3.5, label: 'Smith Building' },
    // Quest 2 blueprint sites (Taylor stays standing: its puzzle is a retrospective; the I-Center site is a future plan).
    'construction.taylor':   { x: 40, z: -60, building: 'taylor', offset: 5, label: 'John Taylor Building' },
    'construction.icenter':  { x: -60, z: -158, building: 'icenter', offset: 5, label: 'Campus Center construction site' },
    // Quest 3: letters are camouflaged at/near these buildings; the sign sits near the roundabout
    // between the I-Center and the Manwaring Center (confirm coordinates against campus references).
    'letter.B':              { x: 20, z: -215, building: 'mckay', offset: 0.2, label: 'David O. McKay Library' },
    'letter.Y':              { x: 315, z: 640, label: 'Rexburg Idaho Temple approach' },
    'letter.U':              { x: -196, z: -232, building: 'hart', offset: 7, label: 'Hart Building / athletics area' },
    'letter.I':              { x: -40, z: -405, building: 'snow', offset: 2.2, label: 'Snow Performing Arts Center' },
    'sign.byui':             { x: -2.5, z: -76, yaw: -Math.PI / 2, label: 'BYUI letters on the lawn east of the roundabout' },
    // Golf carts (fun transport)
    'cart-1':                { x: 96, z: -96, yaw: Math.PI / 2, label: 'Golf cart by the Kimball quad' },
    'cart-2':                { x: 20, z: -330, yaw: 0, label: 'Golf cart by the Romney quad' },
  } as Record<string, Anchor>,

  questGiver: {
    id: 'bednar', anchor: 'npc.bednar.office',
    displayName: 'President David A. Bednar',   // replaceable; respectful depiction only (fictional quest guide in later eras)
    subtitle: 'President of Ricks College',      // he served 1997–2004
    where: 'his office in the Kimball Building',
    hiddenInEras: ['presentFinale'] as EraId[],
  },

  // Exactly two player-facing modes (quest prompt). Quests read the id; tuning lives in quest data.
  difficulty: {
    options: [
      { id: 'easy', label: 'Easy', hint: 'Clearer guidance and forgiving puzzles' },
      { id: 'hard', label: 'Hard', hint: 'More reasoning, fewer hints, bigger boards' },
    ],
    default: 'easy',
  },

  // Symbolic colour restoration (0 = sepia, 1 = full colour), indexed by completed main quests.
  // Quests report progress inside their stage (up to colorPartialMax of the gap); Q3's 4th letter → full.
  // Stage 0 = a lightly coloured 90s photo; each quest adds colour; the end is fully saturated.
  colorStages: [0.5, 0.68, 0.84, 1],
  colorPartialMax: 0.8,
  // Colour grade. Aim: a warm 90s photo. Send a reference picture to tune these.
  // Grade interpolates from *Start (first stage) to *End (full colour) as colour returns.
  look: { saturationStart: 0.8, saturationEnd: 1.55, warmthStart: 0.08, warmthEnd: 0.02, contrastStart: 0.97, contrastEnd: 1.04, grainStart: 0.035, grainEnd: 0.012 },

  // One currency for all quests. Awarded once per quest at real completion (immutable receipt).
  rewards: {
    base: 100, qualityMax: 50, speedMax: 50, hardBonus: 25, pickupCoin: 1,
    // Active-time targets (seconds) for the speed bonus: full bonus at/below target, 0 at 2× target.
    targetSec: {
      professors: { easy: 900, hard: 1200 },
      construction: { easy: 420, hard: 720 },
      letters: { easy: 720, hard: 960 },
    } as Record<string, Record<string, number>>,
  },

  story: {
    startEra: 'ricks1999' as EraId,
    // Which era follows each quest. Q3 needs 2010-or-later (temple + I-Center + sign site).
    eraAfterQuest: { professors: 'transition', construction: 'byui' } as Record<string, EraId>,
    finaleEra: 'presentFinale' as EraId,
  },

  // Quest-specific configuration (editable). Content lives in src/quests/*/data/*.json.
  quests: {
    professors: {
      candidates: [
        { id: 'math', label: 'Math candidate', anchor: 'candidate.math', lobby: 'q1.lobby.math', building: 'Romney Building', challenge: 'math', shirt: '#6d4b8d' },
        { id: 'english', label: 'English candidate', anchor: 'candidate.english', lobby: 'q1.lobby.english', building: 'Smith Building', challenge: 'english', shirt: '#8d3b4b' },
        { id: 'art', label: 'Art candidate', anchor: 'candidate.art', lobby: 'q1.lobby.art', building: 'Spori Building', challenge: 'art', shirt: '#3b6d8d' },
        // Engineering repairs the projector that breaks in the art demo, so art comes first.
        { id: 'engineering', label: 'Engineering candidate', anchor: 'candidate.engineering', lobby: 'q1.lobby.engineering', building: 'Austin Building', challenge: 'circuit', shirt: '#4b6d3b', requires: 'art' },
      ],
      allowSkipChallenge: true,
    },
    construction: {
      buildings: [
        { id: 'taylor', label: 'John Taylor Building', anchor: 'construction.taylor' },
        { id: 'icenter', label: 'Campus Center', anchor: 'construction.icenter' },
      ],
      allowSkipChallenge: true,
    },
    letters: {
      letters: ['B', 'Y', 'U', 'I'],
      signAnchor: 'sign.byui',
    },
  },

  interiors: {
    'kimball-office': { label: 'Kimball Building — President’s office', width: 14, depth: 22, exteriorDoor: 'door-kimball', eras: null as EraId[] | null },
    'stc-first-floor': { label: 'Science and Technology Center — first floor (approximation)', width: 48, depth: 30, exteriorDoor: 'door.stc.main', eras: ['presentFinale'] as EraId[] | null },
  },

  signs: [
    // The freestanding B Y U I letters on the lawn east of the roundabout (Quest 3 builds the plinth and
    // letters in letters.ts / camo.ts). Empty text = nothing drawn here; the entry reserves the spot:
    // trees and props keep clear and the plinth collides (circles along `width`).
    { anchor: 'sign.byui', width: 13, hideInEras: [] as string[], text: { ricks: '', ricksTransition: '', byui: '' },
      banner: {} as Record<string, string> },
  ],

  coins: { count: 30, radius: 1.3 },

  // Ambient walking NPCs (fictional students; no real people). Placeholder flavour lines —
  // edit freely. "ricks" lines are used until the finale and must not mention BYU–Idaho.
  // Ambient walking NPCs (fictional students; no real people). Flavour lines are editable.
  // Pools by era id; nothing before the finale may mention BYU–Idaho. Lines never repeat until a pool is used up.
  npcs: {
    count: 18,
    title: 'Student',
    lines: {
      ricks1999: [
        'I’ve got a chemistry test in the Romney Building in ten minutes. Pray for me.',
        'The Manwaring Center has the best snacks on campus. Don’t tell anyone.',
        'Go Vikings! Are you coming to the game at the stadium?',
        'Rexburg winters are no joke. Bring a real coat, not a fashion coat.',
        'I’m headed to the library to study. It’s the quietest place on campus.',
        'Everyone keeps joking that the computers will break when it turns 2000.',
        'The new Kimball Building looks amazing. I heard the president’s office is in there.',
        'Watch out for the golf carts. They come around corners fast.',
        'I keep finding coins on the sidewalks. Free money!',
        'Intramurals on the upper fields tonight. You in?',
        'Have you seen the old Spori Building? It’s been here forever.',
        'My roommate auditioned at the Snow Building. She was so nervous.',
        'I took a photo by the pond near the Manwaring Center. So pretty in the fall.',
        'There’s a devotional this week. Want to sit together?',
        'I’m from out of state. Idaho is way flatter than I expected… except this hill.',
        'The Hart gym is packed every night. Good luck finding a court.',
        'Professors here actually learn your name. That’s the best part.',
        'I signed up for a ballroom class. Two left feet, but I’m trying.',
      ],
      transition: [
        'Did you see? The old Spori Building is gone. They’re planning something new.',
        'There are construction fences everywhere. Something big is coming.',
        'I heard there’s a brand-new building going up near the Taylor Building.',
        'Things feel different on campus this year. Exciting different.',
        'The Hart gym is still packed every night.',
        'I can’t wait to see what they build next.',
        'Free hot chocolate at the Manwaring Center today!',
        'My professor says the campus is growing faster than ever.',
        'Watch out for the golf carts. They come around corners fast.',
        'I keep finding coins on the sidewalks. Free money!',
        'Intramurals on the upper fields tonight. You in?',
        'The pond by the Manwaring Center freezes in winter. Don’t walk on it!',
      ],
      byui: [
        'Have you been inside the big new Center? It holds thousands of people.',
        'The temple on the hill looks beautiful at night.',
        'I heard someone hid letters all over campus. Weird, right?',
        'The sign by the roundabout looks unfinished. I wonder why.',
        'Watch out for the golf carts. They come around corners fast.',
        'I keep finding coins on the sidewalks. Free money!',
        'The library is my second home during finals.',
        'Intramurals on the upper fields tonight. You in?',
        'The Snow Building has a concert every weekend.',
        'I love walking past the Hart Building when the teams are training.',
        'Campus keeps getting bigger every year.',
        'Did you know the pond by the Manwaring Center has lily pads?',
      ],
      present: [
        'Welcome to BYU–Idaho!',
        'Big devotional in the I-Center this week.',
        'The STC is where all the science happens.',
        'Can you believe this all used to be Ricks College?',
        'Heading to the upper fields for intramurals!',
        'I heard there’s a hackathon celebration in the STC today!',
        'The temple grounds are so peaceful.',
        'The I-Center track is great when it’s snowing outside.',
        'Coins on the sidewalk again? This campus is lucky.',
        'I love the new sign by the roundabout.',
      ],
    } as Record<string, string[]>,
  },

  finale: {
    // Replace labels/colours with the real team (do not invent names or likenesses).
    avatars: [
      { label: 'Team Member 1', shirt: '#2f6db5', pants: '#2b2b33', hair: '#3b2a20', skin: '#e0b48f' },
      { label: 'Team Member 2', shirt: '#c0392b', pants: '#2b2b33', hair: '#1d1a17', skin: '#c68c64' },
      { label: 'Team Member 3', shirt: '#27ae60', pants: '#33302b', hair: '#7a4b2a', skin: '#f0c9a4' },
      { label: 'Team Member 4', shirt: '#d4a017', pants: '#2b2b33', hair: '#aa7a3c', skin: '#8d5a3b' },
    ],
    headline: 'Hackathon champions!',
    body: '[PLACEHOLDER] Editable celebration text. Replace with the team’s final message.',
  },

  world: {
    // Horizontal compaction of streets/empty space (1 = real size). Positions are
    // scaled by `scale`; each building footprint grows back toward real size (up to
    // `buildingScale`) as far as it can without overlapping neighbours or streets.
    // Heights stay real, and terrain relief is scaled so slopes keep their angle.
    scale: 0.4,
    buildingScale: 0.62,
    // Minimum clear space between buildings (m): campus buildings leave room for two cars side by side.
    buildingGap: 8,
    houseGap: 3,
    // Buildings may shrink this far (below `scale`) to keep those gaps in tight real-world spots.
    minBuildingScale: 0.22,
    // TEAM DECISION (overrides the quest prompt): Taylor and the I-Center are fenced construction sites
    // until Quest 2 solves their blueprints; each then appears permanently, in any era.
    gatedBuildings: ['taylor', 'icenter'] as string[],
    // OPEN: show modern, undated OSM buildings in historical eras as neutral massing?
    contextBuildingsInHistoricalEras: false,
    trees: true,
  },

  input: {
    deadZone: 0.15,
    // Controller button index (bit in the BLE report / Gamepad API button) -> action(s)
    controllerButtons: { 0: 'interact', 1: ['back', 'jump'], 2: 'map', 3: 'pause', 4: 'runToggle', 5: 'cameraReset' } as Record<number, string | string[]>,
    // Inside puzzles/journal the same buttons act as: map → alt (rotate/cycle), L3 → alt2 (flip/mirror), R3 → hint.
    gamepadButtonIndices: [0, 1, 2, 3, 10, 11], // Gamepad API indices for bits 0..5
    lookSpeed: 2.6,     // rad/s at full right-stick deflection
    mouseSensitivity: 0.005,
  },
};

export type DifficultyId = 'easy' | 'hard';
