// Browser-local, versioned save. Bump SAVE_VERSION and add a migration when the schema changes.
import type { EraId } from '../world/eras';
import type { QuestStatus } from '../quests/contract';
import type { RewardReceipt } from '../quests/rewards';

export const SAVE_VERSION = 3;
const KEY = 'spirit-of-ricks.save';

export interface SaveData {
  version: number;
  savedAt: string;
  difficulty: 'easy' | 'hard';
  era: EraId;
  colorStage: number;                 // index into GAME_CONFIG.colorStages
  quests: Record<string, { status: QuestStatus; data: Record<string, unknown> }>;
  targets: Record<string, string>;    // quest target states (puzzle solved flags, etc.)
  rewards: Record<string, RewardReceipt>; // immutable per-quest reward receipts
  player: { space: string; x: number; z: number; yaw: number } | null; // null = start at spawn
  coins: string[];                    // collected coin ids
  introSeen: boolean;
  finaleReached: boolean;
  playerName?: string;                // asked when a new game starts
  outfit?: string;                    // wardrobe choice (player/outfits.ts)
  sideQuests?: Record<string, { status: 'available' | 'active' | 'ready' | 'done'; earned: number; data: Record<string, unknown> }>; // optional errands (sidequests/)
}

type Migration = (old: any) => any;
const MIGRATIONS: Record<number, Migration> = {
  // v1 positions used the uncompacted map: respawn at the start point, no coins yet.
  1: (v1) => ({ ...v1, version: 2, player: null, coins: [] }),
  // v2 → v3: Easy/Hard only, reward receipts; quest content was replaced, so progress restarts at Quest 1.
  2: (v2) => ({ ...v2, version: 3, difficulty: v2.difficulty === 'challenging' ? 'hard' : 'easy', rewards: {}, targets: {},
    quests: { professors: { status: 'available', data: {} }, construction: { status: 'locked', data: {} }, letters: { status: 'locked', data: {} } },
    era: 'ricks1999', colorStage: 0, player: null }),
};

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    let d = JSON.parse(raw);
    while (d && d.version < SAVE_VERSION && MIGRATIONS[d.version]) d = MIGRATIONS[d.version](d);
    if (!d || d.version !== SAVE_VERSION) { console.warn('Save schema mismatch; ignoring.'); return null; }
    return d as SaveData;
  } catch (e) { console.warn('Could not read save', e); return null; }
}
export function writeSave(d: SaveData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify({ ...d, version: SAVE_VERSION, savedAt: new Date().toISOString() })); return true; }
  catch (e) { console.warn('Could not write save', e); return false; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
