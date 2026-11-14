// Approved opening_cutscene.txt: a deliberately fictional 1999 setting.
// The question/response follows Bednar's recollection; other dialogue is adapted.
export const OPENING = {
  duration: 48,
  officeAt: 9,
  entranceAt: 34,
  entranceEnd: 40,
  titleAt: 30,
  handoffAt: 40,
  location: 'Rexburg, Idaho',
  date: '1999 · Ricks College',
  title: 'The Spirit of Ricks',
  cues: [
    { start: 12, end: 18.2, actor: 'hinckley', speaker: 'President Gordon B. Hinckley', context: 'On the telephone', text: 'David, Ricks College is going to become a four-year institution.' },
    { start: 20, end: 24, actor: 'bednar', speaker: 'President David A. Bednar', context: '', text: 'President, what would you have me do?' },
    { start: 25.5, end: 28.5, actor: 'hinckley', speaker: 'President Gordon B. Hinckley', context: 'On the telephone', text: 'Make it happen.' },
    { start: 35, end: 36.3, actor: 'action', speaker: '', context: '', text: '[Knock, knock]' },
    { start: 36.5, end: 37.3, actor: 'bednar', speaker: 'President David A. Bednar', context: '', text: 'Come in.' },
    { start: 41.2, end: 46.5, actor: 'bednar', speaker: 'President David A. Bednar', context: '', text: 'We have a great deal of work ahead of us. Let’s begin.' },
  ],
} as const;
