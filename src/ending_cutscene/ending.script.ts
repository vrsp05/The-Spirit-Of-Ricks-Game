// 30-second celebration plus a 10-second STC presentation reveal.
export const ENDING = {
  duration: 40,
  nightAt: 4,
  torchAt: 9.8,
  dronesAt: 12,
  vikingsAt: 20,
  cardAt: 28,
  presentationAt: 28.4,
  revealAt: 30.2,
  title: 'The Spirit of Ricks',
  subtitle: 'The legacy continues.',
  cues: [
    { start: 6, end: 9, text: 'The Spirit of Ricks lives on.' },
    { start: 25, end: 28, text: 'Together, we made it happen.' },
  ],
} as const;

export const GLYPHS: Record<string, string[]> = {
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '5': ['11111', '10000', '10000', '11110', '00001', '10001', '01110'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
};
