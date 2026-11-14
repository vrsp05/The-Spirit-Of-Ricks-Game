// Quest registration (stable ids: professors, construction, letters).
// Each module only uses the contract in ./contract.ts; content lives in ./q*/data/*.json.
import type { QuestModule } from './contract';
import { createProfessors } from './q1/professors';
import { createConstruction } from './q2/construction';
import { createLetters } from './q3/letters';

export function createQuestModules(): QuestModule[] {
  return [createProfessors(), createConstruction(), createLetters()];
}
