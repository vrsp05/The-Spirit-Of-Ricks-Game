// Quest registration (stable ids: professors, construction, letters).
// Each module only uses the contract in ./contract.ts; content lives in ./q*/data/*.json.
import type { QuestModule } from './contract';
import { createProfessors } from './q1/professors';
// Quest 2: Gio is building it — swap this placeholder for the real module when it lands.
import { createConstructionPlaceholder } from './placeholders/construction.placeholder';
import { createLetters } from './q3/letters';

export function createQuestModules(): QuestModule[] {
  return [createProfessors(), createConstructionPlaceholder(), createLetters()];
}
