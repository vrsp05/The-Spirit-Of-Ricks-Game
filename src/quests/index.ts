// Quest registration (stable ids: professors, y2k, vikings, construction, capsule, snowday, letters).
// Each module only uses the contract in ./contract.ts; content lives in ./q*/data/*.json.
import type { QuestModule } from './contract';
import { createProfessors } from './q1/professors';
import { createConstruction } from './q2/construction';
import { createLetters } from './q3/letters';
import { createY2K } from './more/y2k';
import { createVikings } from './more/vikings';
import { createCapsule } from './more/capsule';
import { createSnowDay } from './more/snowday';

export function createQuestModules(): QuestModule[] {
  return [createProfessors(), createY2K(), createVikings(), createConstruction(), createCapsule(), createSnowDay(), createLetters()];
}
