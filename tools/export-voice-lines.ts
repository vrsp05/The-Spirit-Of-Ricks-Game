// Collects every spoken line from the current game data into docs/voice-lines.{json,csv,md}.
// Run: npm run voices:export   (then npm run voices:generate to record them with ElevenLabs)
// Lines that contain placeholders filled in during play ({player}, {list}, …) are listed as
// "live" and are not recorded — the game reads those with the browser voice.
import { writeFileSync } from 'node:fs';
import { GAME_CONFIG } from '../src/config/game.config';
import { STORY } from '../src/story/story';
import q1 from '../src/quests/q1/data/dialogue.json';
import classroom from '../src/quests/q1/data/classroom.json';
import q3 from '../src/quests/q3/data/cards.json';
import q2 from '../src/quests/q2/data/dialogue.json';
import { OPENING } from '../src/opening_cutscene/opening.script';
import { ENDING } from '../src/ending_cutscene/ending.script';
import q2dlg from '../src/quests/q2/data/dialogue.json';

export interface VoiceLine { id: string; voice: string; speaker: string; when: string; text: string; live: boolean }
const out: VoiceLine[] = [];
const seen = new Set<string>();
const clean = (s: string) => s.replace(/\s*\(game character\)/gi, '').trim();
const add = (id: string, voice: string, speaker: string, when: string, text: string) => {
  const t = text.replace(/\s+/g, ' ').trim(); if (!t || seen.has(t)) return; seen.add(t);
  out.push({ id, voice, speaker: clean(speaker), when, text: t, live: /\{[a-z]+\}/i.test(t) });
};
const voiceOf = (speaker: string) => /Hinckley/i.test(speaker) ? 'Hinckley' : /Bednar|President/i.test(speaker) ? 'Bednar' : /^$|Narrator|Construction/i.test(speaker) ? 'Narrator' : speaker;

// story + quest dialogue ({speaker, text} objects anywhere in the data)
STORY.bednarGreeting().forEach((l, i) => add(`story-greeting-${i + 1}`, 'Bednar', l.speaker, 'First talk with Bednar', l.text));
STORY.allQuestsDone().forEach((l, i) => add(`story-done-${i + 1}`, 'Bednar', l.speaker, 'After all quests', l.text));
const walk = (node: unknown, path: string, when: string) => {
  if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${path}-${i + 1}`, when));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.speaker === 'string' && typeof o.text === 'string') add(path, voiceOf(o.speaker), o.speaker, when, o.text);
    else for (const [k, v] of Object.entries(o)) walk(v, `${path}-${k}`, when);
  }
};
walk({ assign: q1.assign, report: q1.report }, 'q1', 'Quest 1 (Bednar)');
walk(q3.dialogue, 'q3', 'Quest 3');
walk(q2, 'q2', 'Quest 2');
// opening and ending movies
OPENING.cues.forEach((c, i) => { if (!c.text.startsWith('[')) add(`opening-${i + 1}`, voiceOf(c.speaker), c.speaker || 'Narrator', 'Opening movie', c.text); });
ENDING.cues.forEach((c, i) => add(`ending-${i + 1}`, 'Bednar', 'Elder David A. Bednar', 'Ending movie', c.text));
add('q1-ready', 'Bednar', 'President Bednar', 'Quest 1 report prompt', q1.readyReminder);
add('q3-reminder', 'Bednar', 'President Bednar', 'Quest 3 reminder', q3.dialogue.reminder);

// lines that address the player by name: record them without the name (the game plays that recording
// when the line is shown with the player's name), so Bednar never switches to the browser voice
for (const l of [...out]) if (/\{player\}/.test(l.text) && !/\{(?!player\})[a-z]+\}/i.test(l.text)) {
  const t = l.text.replace(/,\s*\{player\}\s*,/g, ',').replace(/^\{player\},?\s*/, '').replace(/,?\s*\{player\}/g, '').replace(/\s+/g, ' ').trim();
  add(`${l.id}-noname`, l.voice, l.speaker, `${l.when} (played with the player's name shown)`, t.charAt(0).toUpperCase() + t.slice(1));
}
// reminders built during play: one recording for every possible "still to do" list
const subsets = <T,>(xs: T[]) => { const r: T[][] = []; const go = (start: number, acc: T[]) => { for (let j = start; j < xs.length; j++) { const n = [...acc, xs[j]]; r.push(n); go(j + 1, n); } }; go(0, []); return r; };   // in list order
const pcands = GAME_CONFIG.quests.professors.candidates as { id: string; label: string; building: string }[];
for (const set of subsets(pcands)) add(`q1-reminder-${set.map(c => c.id).join('-')}`, 'Bednar', 'President Bednar', 'Quest 1 reminder', (q1 as Record<string, string>).reminder.replace('{list}', set.map(c => `${c.label.replace(' candidate', '')} (${c.building})`).join(', ')));
const blds = (GAME_CONFIG.quests as unknown as { construction: { buildings: { id: string; label: string }[] } }).construction.buildings;
for (const set of subsets(blds)) add(`q2-reminder-${set.map(b => b.id).join('-')}`, 'Bednar', 'President Bednar', 'Quest 2 reminder', q2dlg.reminder.replace('{list}', set.map(b => b.label).join(', ')));
add('q2-ready', 'Bednar', 'President Bednar', 'Quest 2 report prompt', q2dlg.readyReminder);

// Quest 1 candidates (one voice each) and the classroom department chairs
const cands = GAME_CONFIG.quests.professors.candidates as { id: string; name?: string; label: string }[];
for (const c of cands) {
  const who = c.name ?? c.label, v = `Candidate ${c.id}`;
  for (const key of ['greetings', 'waiting', 'walk', 'waitingOutside'] as const) {
    const val = (q1 as Record<string, unknown>)[key] as Record<string, string | string[]> | undefined;
    const lines = val?.[c.id]; for (const [i, t] of (Array.isArray(lines) ? lines : lines ? [lines] : []).entries()) add(`q1-${key}-${c.id}-${i + 1}`, v, who, `Quest 1 ${key}`, t);
  }
  const room = (classroom.rooms as Record<string, { intro?: Record<string, unknown> }>)[c.id]?.intro;
  if (room) for (const k of ['chair', 'verdict', 'thanks'] as const) if (typeof room[k] === 'string') add(`q1-room-${c.id}-${k}`, `Chair ${c.id}`, 'Department chair', 'Quest 1 classroom', (room[k] as string).replace('{name}', who));
}
for (const k of ['notYet', 'othersWait'] as const) add(`q1-${k}`, `Candidate ${cands[0].id}`, cands[0].name ?? 'Candidate', 'Quest 1', (q1 as Record<string, string>)[k]);

// students: spread across four student voices so they don't all sound alike
let n = 0;
for (const [era, lines] of Object.entries(GAME_CONFIG.npcs.lines as Record<string, string[]>)) lines.forEach((t, i) => add(`student-${era}-${String(i + 1).padStart(2, '0')}`, `Student ${'ABCD'[n++ % 4]}`, 'Student', `Random student (${era})`, t));

writeFileSync('docs/voice-lines.json', JSON.stringify(out, null, 1));
const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
writeFileSync('docs/voice-lines.csv', 'id,voice,speaker,when,live,text\n' + out.map(l => [l.id, l.voice, l.speaker, l.when, l.live ? 'live' : '', l.text].map(esc).join(',')).join('\n') + '\n');
const voices = [...new Set(out.map(l => l.voice))];
let md = `# Voice lines (${out.length}; ${out.filter(l => l.live).length} live-only)\n\nGenerated by \`npm run voices:export\` from the game data. \`npm run voices:generate\` records the non-live lines with ElevenLabs into \`public/voices/\`. "live" lines contain a name or list filled in during play and use the browser voice.\n`;
for (const v of voices) { const ls = out.filter(l => l.voice === v); md += `\n## ${v} (${ls.length})\n\n| id | when | line |\n|---|---|---|\n`; for (const l of ls) md += `| ${l.id} | ${l.when}${l.live ? ' · live' : ''} | ${l.text.replace(/\|/g, '\\|')} |\n`; }
writeFileSync('docs/voice-lines.md', md);
console.log(`${out.length} lines (${out.filter(l => l.live).length} live), voices: ${voices.join(', ')}`);
