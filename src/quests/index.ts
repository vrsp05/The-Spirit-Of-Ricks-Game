// Quest registration. Teammates: swap a dev example for your module here —
// no other core file needs to change. Keep the stable ids.
import type { QuestModule } from './contract';
import { createProfessorsDev } from './examples/professors.dev';
import { createConstructionDev } from './examples/construction.dev';
import { createLettersDev } from './examples/letters.dev';

export function createQuestModules(): QuestModule[] {
  return [
    createProfessorsDev(),    // TODO(Quest 1 owner): replace with real module
    createConstructionDev(),  // TODO(Quest 2 owner): replace with real module
    createLettersDev(),       // TODO(Quest 3 owner): replace with real module
  ];
}
