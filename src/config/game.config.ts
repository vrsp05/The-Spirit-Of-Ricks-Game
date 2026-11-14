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

  locations: {
    'spawn':                 { x: 118, z: -84, yaw: 0, label: 'Quad north of the Kimball Building' },
    'campus-sign':           { x: 176, z: -96, yaw: -Math.PI / 2, label: 'Ricks College sign' },
    // Doors snap to the named building's wall.
    'door-kimball':          { x: 125, z: -60, building: 'kimball', label: 'Kimball Building, north entrance' },
    'door-romney':           { x: -12, z: -318, building: 'romney', label: 'Romney Building, south side (DEV quest room)' },
    'door-stc':              { x: -140, z: 236, building: 'stc', label: 'Science and Technology Center, north side' },
    // President Bednar's office inside the Kimball Building (executive offices, HOB p.26). Room-local.
    'bednar':                { x: 0, z: -7, space: 'kimball-office', yaw: 0, label: 'President’s office, Kimball Building' },
    // Golf carts (fun transport)
    'cart-1':                { x: 96, z: -96, yaw: Math.PI / 2, label: 'Golf cart by the Kimball quad' },
    'cart-2':                { x: 20, z: -330, yaw: 0, label: 'Golf cart by the Romney quad' },
    // ---- DEV EXAMPLE anchors: replace when quest owners deliver placements ----
    'dev-prof-math':         { x: 0, z: 2, space: 'dev-quest-room', label: 'DEV room NPC' },
    'dev-prof-engineering':  { x: -82, z: 108, building: 'austin', offset: 3, label: 'DEV: Austin Building' },
    'dev-prof-art':          { x: -20, z: -420, building: 'snow', offset: 3, label: 'DEV: Snow Building' },
    'dev-prof-english':      { x: 94, z: -238, building: 'smith', offset: 3, label: 'DEV: Smith Building' },
    'site-taylor':           { x: 40, z: -60, building: 'taylor', offset: 5, label: 'Taylor Building construction site' },
    'site-icenter':          { x: -60, z: -158, building: 'icenter', offset: 5, label: 'Campus Center construction site' },
    'dev-site-3':            { x: 44, z: -356, label: 'DEV construction site 3 (target not chosen)' },
    'dev-letter-B':          { x: 44, z: -312, label: 'DEV letter B' },
    'dev-letter-Y':          { x: -110, z: -92, label: 'DEV letter Y' },
    'dev-letter-U':          { x: 200, z: 60, label: 'DEV letter U' },
    'dev-letter-I':          { x: 62, z: 196, label: 'DEV letter I' },
  } as Record<string, Anchor>,

  questGiver: {
    id: 'bednar', anchor: 'bednar',
    displayName: 'President David A. Bednar',   // replaceable; respectful depiction only
    subtitle: 'President of Ricks College',      // he served 1997–2004
    where: 'his office in the Kimball Building',
    hiddenInEras: ['presentFinale'] as EraId[],
  },

  difficulty: {
    // OPEN: effects are undefined. Quests may read the id; nothing in core uses it.
    options: [
      { id: 'relaxed', label: 'Relaxed' },
      { id: 'standard', label: 'Standard' },
      { id: 'challenging', label: 'Challenging' },
    ],
    default: 'standard',
  },

  // Symbolic colour restoration (0 = sepia, 1 = full colour), indexed by completed main quests.
  colorStages: [0.18, 0.45, 0.72, 1],
  // Colour grade. Aim: a warm 90s photo. Send a reference picture to tune these.
  look: { saturation: 1.08, warmth: 0.05, contrast: 1.0, grain: 0.03 },

  story: {
    startEra: 'ricks1999' as EraId,
    // OPEN: which era follows each quest. Time transitions are separate from colour restoration.
    eraAfterQuest: { professors: 'transition', construction: 'byui', letters: 'byui' } as Record<string, EraId>,
    finaleEra: 'presentFinale' as EraId,
  },

  // Quest-specific configuration. Owned by each quest teammate.
  quests: {
    professors: {
      // OPEN: subjects, NPC locations, interiors, order, pass rules.
      subjects: [
        { id: 'math', label: 'Math', anchor: 'dev-prof-math', where: 'Romney Building (go inside)' },
        { id: 'engineering', label: 'Engineering', anchor: 'dev-prof-engineering', where: 'Austin Building' },
        { id: 'art', label: 'Art', anchor: 'dev-prof-art', where: 'Snow Building' },
        { id: 'english', label: 'English', anchor: 'dev-prof-english', where: 'Smith Building' },
      ],
    },
    construction: {
      // TEAM DECISION (playtest 2026-11-13): Taylor and the I-Center are hidden until
      // this quest builds them. Third target still OPEN (null = symbolic placeholder site).
      targets: [
        { id: 'target1', buildingId: 'taylor' as string | null, label: 'John Taylor Building', siteAnchor: 'site-taylor' },
        { id: 'target2', buildingId: 'icenter' as string | null, label: 'Campus Center', siteAnchor: 'site-icenter' }, // signed "BYU–Idaho Center" only after the finale
        { id: 'target3', buildingId: null as string | null, label: 'Target 3 (not chosen)', siteAnchor: 'dev-site-3' },
      ],
    },
    letters: {
      // OPEN: placement, order, randomisation, hints.
      anchors: { B: 'dev-letter-B', Y: 'dev-letter-Y', U: 'dev-letter-U', I: 'dev-letter-I' } as Record<string, string>,
      // After collecting, the letters are placed on the campus sign (team idea, playtest 2).
      signAnchor: 'campus-sign',
    },
  },

  interiors: {
    'kimball-office': { label: 'Kimball Building — President’s office', width: 14, depth: 22, exteriorDoor: 'door-kimball', eras: null as EraId[] | null },
    'dev-quest-room': { label: 'Romney Building — quest room (DEV)', width: 16, depth: 12, exteriorDoor: 'door-romney', eras: null as EraId[] | null },
    'stc-first-floor': { label: 'Science and Technology Center — first floor (approximation)', width: 48, depth: 30, exteriorDoor: 'door-stc', eras: ['presentFinale'] as EraId[] | null },
  },

  signs: [
    { anchor: 'campus-sign', text: { ricks: 'RICKS COLLEGE', ricksTransition: 'RICKS COLLEGE', byui: 'BRIGHAM YOUNG\nUNIVERSITY–IDAHO' },
      banner: {} as Record<string, string> },
  ],

  coins: { count: 30, radius: 1.3 },

  // Ambient walking NPCs (fictional students; no real people). Placeholder flavour lines —
  // edit freely. "ricks" lines are used until the finale and must not mention BYU–Idaho.
  npcs: {
    count: 18,
    title: 'Student',
    lines: {
      ricks: [
        'Hey! I\u2019ve got a big test in the Romney Building today.',
        'The Manwaring Center has the best snacks on campus.',
        'Go Vikings!',
        'Rexburg winters are no joke — bring a coat.',
        'I\u2019m headed to the library to study. Wish me luck!',
        'Did you see the construction fences? Something new is coming.',
        'Watch out for the golf carts — they come around fast.',
        'I keep finding coins on the sidewalks. Weird, right?',
        'Intramurals on the upper fields tonight. You in?',
        'Have you been inside the Kimball Building yet?',
      ],
      present: [
        'Welcome to BYU–Idaho!',
        'Big devotional in the I-Center this week.',
        'The STC is where all the science happens.',
        'Can you believe this all used to be Ricks College?',
        'Heading to the upper fields for intramurals!',
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
    // OPEN: show modern, undated OSM buildings in historical eras as neutral massing?
    contextBuildingsInHistoricalEras: false,
    trees: true,
  },

  input: {
    deadZone: 0.15,
    // Controller button index (bit in the BLE report / Gamepad API button) -> action(s)
    controllerButtons: { 0: 'interact', 1: ['back', 'jump'], 2: 'map', 3: 'pause', 4: 'runToggle', 5: 'cameraReset' } as Record<number, string | string[]>,
    gamepadButtonIndices: [0, 1, 2, 3, 10, 11], // Gamepad API indices for bits 0..5
    lookSpeed: 2.6,     // rad/s at full right-stick deflection
    mouseSensitivity: 0.005,
  },
};

export type DifficultyId = string;
