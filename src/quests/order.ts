// The story order (pure data, no imports beyond types — used by the quest manager, saves and tests).
import type { QuestId } from './contract';
import type { EraId } from '../world/eras';

export const QUEST_ORDER: QuestId[] = ['professors', 'y2k', 'vikings', 'construction', 'capsule', 'snowday', 'letters'];
/** The era each story mission is played in (the era changes after the last mission of an era). */
export const QUEST_ERA: Record<QuestId, EraId> = {
  professors: 'ricks1999', y2k: 'ricks1999', vikings: 'ricks1999',
  construction: 'transition', capsule: 'transition',
  snowday: 'byui', letters: 'byui',
};
