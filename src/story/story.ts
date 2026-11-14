// Story text. EVERYTHING here is placeholder copy for the story owners to replace.
// Keep historical framing respectful; do not add quotes attributed to real people
// without a verified, team-approved source.
import { GAME_CONFIG } from '../config/game.config';
import type { DialogueLine } from '../quests/contract';

const B = () => GAME_CONFIG.questGiver.displayName;

export const STORY = {
  introSubtitle: 'You are an assistant to the president of Ricks College.',
  bednarGreeting: (): DialogueLine[] => [
    { speaker: B(), text: 'Ah, {player}, there you are. Come in, please.' },
    { speaker: B(), text: 'This college is about to grow in ways most people can’t imagine yet, and I’m going to need your help.' },
  ],
  allQuestsDone: (): DialogueLine[] => [
    { speaker: B(), text: '{player}, look at what we’ve done together. Teachers hired, buildings raised, and a new name on the sign.' },
    { speaker: B(), text: 'Go and see the campus as it is today. I think you’ll be proud of what it became.' },
  ],
  presentDaySubtitle: 'The letters are in place. Head to the Science and Technology Center.',
  colorToast: 'Colour returns to campus (symbolic progress, not a change in time)',
  fullColorToast: 'Full colour restored!',
};
