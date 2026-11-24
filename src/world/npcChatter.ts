// What the ambient students say to EACH OTHER (speech bubbles), what they shout when they spot you,
// and what they say when you walk up to a conversation. Fictional, era-aware small talk.
// Rule kept from the main story: nothing says "BYU–Idaho" before the present day.
import type { EraId } from './eras';

/** A short exchange: lines alternate between the two people (A, B, A, …). `topic` is used if you join in. */
export interface Chat { topic: string; lines: string[] }

const ANY: Chat[] = [
  { topic: 'the midterm', lines: ['Did you finish the reading?', 'Half of it… maybe a third.', 'Library tonight?', 'Deal.'] },
  { topic: 'the weekend', lines: ['Any plans this weekend?', 'Hiking up by the sand dunes!', 'Take me with you.', 'Bring snacks and you’re in.'] },
  { topic: 'roommates', lines: ['My roommate made funeral potatoes at midnight.', 'Was it good though?', 'Honestly? Incredible.'] },
  { topic: 'devotional', lines: ['Going to devotional on Tuesday?', 'Always. Save me a seat?', 'Front row, like always.'] },
  { topic: 'the wind', lines: ['This wind is unreal today.', 'Welcome to Rexburg.', 'My notes almost flew to Idaho Falls.'] },
  { topic: 'intramurals', lines: ['We lost the intramural game again.', 'By how much?', 'We don’t talk about it.'] },
  { topic: 'the ice cream', lines: ['Want to grab ice cream after class?', 'In this weather?', 'Ice cream has no season.'] },
  { topic: 'the group project', lines: ['Did you hear back from the group?', 'Nope. Just us again.', 'Classic group project.'] },
  { topic: 'the dance', lines: ['Are you going to the dance Friday?', 'If I can find a partner…', 'Ask the person from your lab!', 'Too nervous!'] },
  { topic: 'home', lines: ['My mom sent cookies!', 'Best mom ever.', 'You can have one. ONE.'] },
  { topic: 'the bookstore', lines: ['Textbooks cost how much?!', 'Buy used. Always buy used.', 'Lesson learned.'] },
  { topic: 'missions', lines: ['My brother just got his mission call!', 'Where to?', 'He opens it Sunday — the whole family is coming.'] },
];
const BY_ERA: Record<EraId, Chat[]> = {
  ricks1999: [
    { topic: 'Y2K', lines: ['Are you ready for Y2K?', 'I filled the bathtub with water. Just in case.', 'That seems… extreme.'] },
    { topic: 'the new Kimball Building', lines: ['Have you been inside the Kimball Building?', 'It’s so new it still smells like paint.', 'I heard the president’s office is up there.'] },
    { topic: 'the Vikings game', lines: ['Vikings game tonight!', 'I’ll bring the foam finger.', 'Go Vikes!'] },
    { topic: 'email', lines: ['Did you get my email?', 'I only check it in the computer lab.', 'Once a week? Seriously?'] },
    { topic: 'the new CD', lines: ['I burned you a mix CD.', 'Does it have the Backstreet Boys?', 'Obviously.'] },
  ],
  transition: [
    { topic: 'the big announcement', lines: ['Can you believe the school is changing?', 'Four-year degrees! Right here!', 'I might stay longer than I planned.'] },
    { topic: 'the construction', lines: ['More fences went up today.', 'Something big is coming.', 'I hope it has better parking.'] },
    { topic: 'the last season', lines: ['It’s the last season for Viking athletics.', 'I’m going to every game.', 'Me too. End of an era.'] },
    { topic: 'the old Spori', lines: ['I miss the old Spori Building.', 'It had so much history.', 'They say they’ll rebuild it.'] },
  ],
  byui: [
    { topic: 'the new Center', lines: ['Have you been in the new big Center?', 'It seats thousands!', 'Devotional there feels like a stadium.'] },
    { topic: 'the temple', lines: ['The temple looks amazing at night.', 'Let’s go Friday after class.', 'It’s a date. A friend date.'] },
    { topic: 'phones', lines: ['Did you get the new phone?', 'Mine still flips open.', 'That’s vintage now.'] },
    { topic: 'online classes', lines: ['I’m taking an online class this semester.', 'From your bed?', 'From my bed.'] },
    { topic: 'the snow', lines: ['It snowed in May again.', 'Rexburg doesn’t care about the calendar.', 'I just packed away my coat!'] },
  ],
  presentFinale: [
    { topic: 'the STC', lines: ['Have you seen the labs in the STC?', 'The robots are so cool.', 'I want to build one.'] },
    { topic: 'the celebration', lines: ['The celebration was amazing!', 'Fireworks AND drones!', 'Best night on campus ever.'] },
    { topic: 'campus history', lines: ['Did you know this used to be Ricks College?', 'My grandparents went here!', 'So did mine!'] },
    { topic: 'the app', lines: ['Did the app send you the class change?', 'It sends me everything.', 'Notifications forever.'] },
  ],
};
/** A chat for two people in this era (a mix of era-specific and timeless ones). */
export function chatFor(era: EraId, r: () => number = Math.random): Chat {
  const pool = r() < 0.55 ? BY_ERA[era] : ANY;
  return pool[(r() * pool.length) | 0];
}

/** Shouted when they notice you walking by. `{name}` = the player once they've met. */
export const GREETINGS = ['Hi!', 'Hey there!', 'Hello!', 'Howdy!', 'Morning!', 'Nice day, huh?', 'Hiya!'];
export const GREETINGS_KNOWN = ['Hey, {name}!', 'Hi {name}!', '{name}! Good to see you!', 'Oh hey, {name}!'];
/** When you walk up to two people talking: the first person invites you in. */
export const JOIN_LINES = [
  'Oh, hey! We were just talking about {topic}.',
  'Perfect timing — we were talking about {topic}.',
  'Hi! Quick question: what do you think about {topic}?',
];
/** Reactions when the player is nearby but busy people are chatting. */
export const SMALL_REACTIONS = ['Ha!', 'No way!', 'Right?!', 'Totally.', 'Hmm…', 'For real?'];
