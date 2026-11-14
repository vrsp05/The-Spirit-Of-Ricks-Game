// Story text. EVERYTHING here is placeholder copy for the story owners to replace.
// Keep historical framing respectful; do not add quotes attributed to real people
// without a verified, team-approved source.
import { GAME_CONFIG } from '../config/game.config';
import type { DialogueLine } from '../quests/contract';

const B = () => GAME_CONFIG.questGiver.displayName;

export const STORY = {
  introSubtitle: 'You are an assistant to the president of Ricks College.',
  bednarGreeting: (): DialogueLine[] => [
    { speaker: B(), text: '[PLACEHOLDER] Welcome. I have some assignments for you.', placeholder: true },
  ],
  allQuestsDone: (): DialogueLine[] => [
    { speaker: B(), text: '[PLACEHOLDER] Every assignment is complete. Story transition to the present day goes here.', placeholder: true },
  ],
  presentDaySubtitle: 'The letters are in place. Head to the Science and Technology Center.',
  colorToast: 'Colour returns to campus (symbolic progress, not a change in time)',
  fullColorToast: 'Full colour restored!',
};
