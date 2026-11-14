// Q1 teaching-demo classroom: a strip of students + the department chair above every
// challenge, one-line reactions, a "Class engagement" bar, the pass colour flash and the
// Hard follow-up question. Wraps a ChallengeBody so the demos stay independent.
// Content: data/classroom.json. Styles are injected once and scoped under .q1-.
import data from './data/classroom.json';
import type { ChallengeApi, ChallengeBody, ChallengeResult } from '../shared/frame';
import { btn, h } from '../shared/frame';
import type { QuestContext } from '../contract';
import type { Hotspot, Room3D } from './room3d';
import { coach, type CoachStep } from './coach';

export type Cue = 'nod' | 'confused' | 'ooh' | 'gasp' | 'applause';
export interface RoomDef {
  id: string; place: string; chair: string; wall: string; floor: string; board: string;
  students: { name: string; shirt: string; hair: string; skin: string }[];
  props: string[];
  followUp: { q: string; options: string[]; correct: string };
  intro: { title: string; whisper: string; chair: string; frame: string; verdict: string; thanks: string; after?: { who: 'chair' | 'candidate'; text: string }[] };
  /** The dismissable "How this works" card: what the demo teaches and how playing it delivers the lesson. */
  brief: { teach: string; how: string };
}
export const CLASSROOM = data as unknown as { rooms: Record<string, RoomDef>; lines: Record<Cue, string[]>; passLine: string };

export interface Classroom {
  /** The 3D classroom when the demo runs in the room (null for the old full-screen layout). */
  room: Room3D | null;
  react(cue: Cue, text?: string, who?: string): void;
  /** 0..1, visual only. */
  engagement(f: number): void;
  bump(delta: number): void;
}
let current: Classroom | null = null;
/** The classroom of the demo that is open right now (null outside demos). */
export const classroom = (): Classroom | null => current;

const SOUND: Partial<Record<Cue, 'tick' | 'error' | 'cheer' | 'pop' | 'chime'>> = { nod: 'tick', confused: 'error', applause: 'cheer', gasp: 'pop' };

/** Rooms whose "How this works" card was already shown this session (it opens by itself once). */
const briefSeen = new Set<string>();

export function withClassroom(ctx: QuestContext, roomId: string, body: ChallengeBody, room3d: Room3D | null = null, playingAs = 'the candidate'): ChallengeBody {
  injectStyles();
  const room = CLASSROOM.rooms[roomId];
  return (root, api) => {
    const people = room.students.map(s => person(s.shirt, s.hair, s.skin, s.name));
    const chair = person('#2b2f3a', '#8a8378', '#e0b896', room.chair, true);
    const speech = h('div', { class: 'q1-speech', 'aria-live': 'polite', text: `${room.chair} watches from the back of the room.` });
    const fill = h('div', { class: 'q1-eng-fill' });
    const strip = h('div', { class: 'q1-room', style: `--wall:${room.wall};--floor:${room.floor};--board:${room.board}` },
      h('div', { class: 'q1-place', text: room.place }),
      h('div', { class: 'q1-props' }, ...room.props.map(p => h('span', { class: 'q1-prop', text: p }))),
      h('div', { class: 'q1-people' }, ...people.map(p => p.el), h('div', { class: 'q1-gap' }), chair.el),
      speech,
      h('div', { class: 'q1-eng' }, h('span', { text: 'Class engagement' }), h('div', { class: 'q1-eng-bar' }, fill)));
    const stage = h('div', { class: 'q1-stage' });
    // ---- views: F  < Chalkboard >  R  (right stick left/right, Joy-Con L/R) ----
    const viewName = h('span', { class: 'q1-vn' });
    const arrow = (sym: string, key: string, d: 1 | -1) => { const b = h('button', { class: 'q1-ar', 'aria-label': d > 0 ? 'Next view' : 'Previous view' }, h('small', { text: key }), h('b', { text: sym })); b.addEventListener('click', () => stepView(d)); return b; };
    const switcher = h('div', { class: 'q1-vw', title: 'Camera view' }, arrow('<', 'F', -1), viewName, arrow('>', 'R', 1));
    const paintView = () => { if (room3d) viewName.textContent = room3d.viewLabel(room3d.current); };
    const stepView = (d: 1 | -1) => { if (!room3d) return; const vs = room3d.views(); room3d.view(vs[(vs.indexOf(room3d.current) + d + vs.length) % vs.length]); paintView(); };
    // ---- pop-ups: first-demo intro, "How this works" card ----
    let card: HTMLElement | null = null, cardClose: (() => void) | null = null;
    const host = () => root.closest('.screen') ?? document.body;
    const closeCard = () => { card?.remove(); card = null; const f = cardClose; cardClose = null; f?.(); api.refocus(); };
    const popup = (cls: string, tag: string, paras: (HTMLElement | string)[][], okLabel: string, foot: string, then?: () => void) => {
      if (card) closeCard();
      const ok = btn(okLabel, () => closeCard(), 'q1-card-ok'); ok.removeAttribute('data-focus');
      card = h('div', { class: `q1-card ${cls}`, role: 'dialog', 'aria-label': tag }, h('div', { class: 'q1-card-tag', text: tag }), ...paras.map(p => h('p', {}, ...p)),
        h('div', { class: 'q1-card-foot' }, h('span', { text: foot }), ok));
      cardClose = then ?? null; host().append(card);
    };
    // ---- tutorial coach marks (first time in each room this session, after the card) ----
    const domRect = (sel: string) => () => { const e = host().querySelector(sel) as HTMLElement | null; return e && e.offsetParent ? e.getBoundingClientRect() : null; };
    const reg = (name: string) => () => room3d?.screenRegion(name) ?? null;
    const STEPS: Record<string, CoachStep[]> = {
      math: [
        { text: 'This is the student’s question. You answer it as the teacher.', target: reg('question') },
        { text: 'These are the Nephite gold coins from Alma 11: senine 1, seon 2, shum 4, limnah 7. Click a coin on the board to put it down.', target: reg('answers') },
        { text: 'Each column is one coin. ✔ means it’s in your hand (1); empty means it isn’t (0). That row of 1s and 0s is binary.', target: reg('columns') },
        { text: 'Stuck? Hint, Brief and More are written on the board. The class’s reactions show down here.', target: reg('tools') },
      ],
      english: [
        { text: 'This is Brother Price’s write-up of the dedication. Click any word that looks wrong.', target: reg('page') },
        { text: 'Pick the correction in the red bubble. Your progress shows here: fix every mistake to finish proofreading.', target: domRect('.q1-eng-hud') },
        { text: 'Not sure of a fact? Press F / R (right stick ← →) to look at the Church News clipping on the wall.', target: domRect('.q1-vw') },
        { text: 'Hint, Brief and More are written on the screen.', target: reg('tools') },
      ],
      art: [
        { text: 'Paint right on the board, square by square. Click and drag to paint; right-click erases.', target: reg('canvas') },
        { text: 'The picture to copy is projected on the side wall. Press F / R (right stick ← →) to look at it.', target: domRect('.q1-vw') },
        { text: 'Pick colours here, and Check painting when it looks close.', target: domRect('.art-side') },
        { text: 'Hint, Brief and More are written on the board.', target: reg('tools') },
      ],
      engineering: [
        { text: 'This is the projector’s circuit board, opened up on the bench. Click a tile to turn it (right-click turns it back).', target: reg('circuit') },
        { text: 'Get power from + through the lamp and back to −. The lamp and fan show here when they work.', target: domRect('.cx-side') },
        { text: 'Press F / R (right stick ← →) to switch between the bench and the wall board with the goal.', target: domRect('.q1-vw') },
        { text: 'Hint, Brief and More are written on the circuit board.', target: reg('tools') },
      ],
    };
    let coachCtl: { next: () => void; end: () => void } | null = null;
    const startCoach = () => { const steps = STEPS[roomId]; if (!room3d || !steps || !root.isConnected) return; coachCtl = coach(host() as HTMLElement, steps, () => { coachCtl = null; api.refocus(); }); };
    const openCard = (then?: () => void) => {
      if (card) { closeCard(); return; }
      popup('', 'How this works', [
        [h('b', { text: `You're playing as ${playingAs}. ` }), 'This is their teaching demonstration, and you deliver it: the lesson moves forward as you work through it.'],
        [h('b', { text: 'The lesson: ' }), room.brief.teach],
        [h('b', { text: 'How to play: ' }), room.brief.how]], 'Got it ▸', 'Reopen any time with Brief (B, or ④ on a controller).', then);
    };
    /** The very first demo of the quest: a small window explaining what a teaching demo is. */
    const openIntro = () => popup('q1-intro', 'Your first teaching demonstration', [
      [h('b', { text: `You're now playing as ${playingAs}. ` }), 'They are giving a teaching demonstration to a real class, and you deliver it for them.'],
      ['Complete the challenge, and the demonstration is delivered successfully: the class learns it, and the department chair can recommend the candidate to President Bednar.']],
      'Start ▸', 'Each department has its own demo.', () => openCard(startCoach));
    // ---- chalk Hint / Brief / More written on the board (clickable) ----
    const more = h('div', { class: 'q1-more' });
    const toggleMore = (on?: boolean) => more.classList.toggle('open', on ?? !more.classList.contains('open'));
    const hintNow = () => (host().querySelector('.ch-hintbtn') as HTMLButtonElement | null)?.click();
    const TOOLS: Record<string, { surface: string; corner: 'bl' | 'tr' | 'tl'; size: number; color: string; font?: string }[]> = {
      math: [{ surface: 'board', corner: 'bl', size: 32, color: '#cfe6c8' }],
      art: [{ surface: 'board', corner: 'bl', size: 32, color: '#cfe6c8' }],
      english: [{ surface: 'board', corner: 'tr', size: 30, color: '#2f5d8a', font: '"Marker Felt", "Comic Sans MS", cursive' }],
      engineering: [{ surface: 'peg', corner: 'bl', size: 26, color: '#cfe6c8' }, { surface: 'board', corner: 'tl', size: 30, color: '#cfe6c8' }],
    };
    const drawTools = () => {
      if (!room3d) return;
      for (const [ti, t] of (TOOLS[roomId] ?? []).entries()) room3d.setOverlay(t.surface, sfc => {
        const g = sfc.g, items: [string, () => void][] = [['Hint', hintNow], ['Brief', () => openCard()], ['More…', () => toggleMore()]];
        g.font = `${t.size}px ${t.font ?? '"Comic Sans MS", "Chalkboard SE", cursive'}`; g.textBaseline = 'top'; g.textAlign = 'left';
        const ws = items.map(([l]) => g.measureText(l).width), gap = t.size * 1.1, total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
        let x = t.corner === 'tr' ? sfc.w - 50 - total : t.corner === 'tl' ? 46 : 40;
        const y = t.corner === 'bl' ? sfc.h - t.size - 26 : 30;
        const spots: Hotspot[] = [];
        items.forEach(([label, act], k) => {
          g.fillStyle = t.color; g.fillText(label, x, y);
          g.strokeStyle = t.color; g.lineWidth = 2; g.setLineDash([5, 6]); g.beginPath(); g.moveTo(x, y + t.size * 1.12); g.lineTo(x + ws[k], y + t.size * 1.12); g.stroke(); g.setLineDash([]);
          spots.push({ x: x - 8, y: y - 8, w: ws[k] + 16, h: t.size * 1.4 + 8, on: act });
          x += ws[k] + gap;
        });
        room3d.setHotspots(t.surface, spots, 'ui');
        if (ti === 0) room3d.setRegion('tools', t.surface, { x: (t.corner === 'tr' ? sfc.w - 50 - total : t.corner === 'tl' ? 46 : 40) - 14, y: y - 14, w: total + 28, h: t.size * 1.5 + 22 });
      });
    };
    if (room3d) {
      paintView();
      const mini = h('div', { class: 'q1-mini' }, h('span', { class: 'q1-place', text: room.place }), speech, h('div', { class: 'q1-eng' }, h('span', { text: 'Class' }), h('div', { class: 'q1-eng-bar' }, fill)), switcher);
      if (!ctx.progress.get<boolean>('demoIntroSeen', false)) { ctx.progress.set('demoIntroSeen', true); briefSeen.add(roomId); window.setTimeout(openIntro, 400); }
      else if (!briefSeen.has(roomId)) { briefSeen.add(roomId); window.setTimeout(() => openCard(startCoach), 400); }
      const onKey = (e: KeyboardEvent) => { if (!root.isConnected || e.repeat) return; if (e.code === 'KeyB' && !coachCtl) openCard(); };
      window.addEventListener('keydown', onKey);
      (root as HTMLElement & { q1Cleanup?: () => void }).q1Cleanup = () => { window.removeEventListener('keydown', onKey); card?.remove(); card = null; cardClose = null; more.remove(); coachCtl?.end(); };
      root.append(mini, stage);
      // Skip / Leave live in the "More…" pop-up (opened from the chalk on the board, or Tab)
      const footer = root.parentElement?.querySelector(':scope > .ch-footer.tools-zone');
      // (④ / Tab enters tools mode, which shows this pop-up so a controller can reach Brief, Skip and Leave)
      const closeMore = btn('Close', () => toggleMore(false)); closeMore.removeAttribute('data-focus');
      if (footer) { footer.prepend(btn('Brief', () => { toggleMore(false); openCard(); })); more.append(footer, closeMore); host().append(more); }
      root.closest('.panel')?.classList.add('q1-inroom-panel');
      drawTools();
    } else root.append(strip, stage);

    let eng = 0.15, speechTimer = 0;
    const setEng = (f: number) => { eng = Math.max(0, Math.min(1, f)); fill.style.width = `${Math.round(eng * 100)}%`; };
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    const cls: Classroom = {
      room: room3d,
      react(cue, text, who) {
        const speaker = who ?? (cue === 'applause' ? '' : room.students[Math.floor(Math.random() * room.students.length)].name);
        const line = text ?? pick(CLASSROOM.lines[cue]);
        speech.replaceChildren(speaker ? h('b', { text: `${speaker}: ` }) : '', line);
        speech.className = `q1-speech show ${cue}`;
        const all = cue === 'applause' || cue === 'ooh' || cue === 'gasp';
        const targets = all ? people : [people[Math.floor(Math.random() * people.length)]];
        if (who === room.chair) chair.pose(cue); else targets.forEach(p => p.pose(cue));
        if (room3d && line && !line.startsWith('*')) {
          const idx = speaker ? room3d.studentIndex(speaker) : -1;
          const t3 = who === room.chair ? room3d.who('chair') : idx >= 0 ? room3d.who(idx) : all ? room3d.who('random') : speaker && speaker !== 'You' && !speaker.startsWith('You') ? room3d.who('random') : [];
          // no speech bubble: the line is shown in the strip (bubbles cut long lines off)
          if (all || cue === 'nod') room3d.hop(all ? room3d.who('all') : t3);
        } else if (room3d && cue === 'applause') room3d.hop(room3d.who('all'));
        const snd = SOUND[cue]; if (snd) ctx.world.sound(snd);
        if (cue === 'nod' || cue === 'ooh') cls.bump(0.12); else if (cue === 'confused') cls.bump(-0.08);
        clearTimeout(speechTimer); speechTimer = window.setTimeout(() => { speech.className = 'q1-speech'; }, 2600);
      },
      engagement: setEng,
      bump: d => setEng(eng + d),
    };
    setEng(eng);
    current = cls;

    // Wrap finish: pass → colour flash + applause (+ Hard follow-up), then the shared result screen.
    let finished = false;
    const wrapped: ChallengeApi = {
      ...api,
      onAction: fn => api.onAction(a => {
        if (coachCtl) { if (a === 'confirm') coachCtl.next(); else if (a === 'back') coachCtl.end(); return true; }   // controller drives the tutorial
        if (card && (a === 'confirm' || a === 'back')) { closeCard(); return true; }
        if (more.classList.contains('open') && a === 'back') { toggleMore(false); return true; }
        // the view changes with left/right (right stick ← →, R/F keys, Joy-Con L/R); the minigame's own
        // right-stick-sideways action (colour, rotate, …) moves to right stick up
        if (room3d && (a === 'alt' || a === 'alt2')) { stepView(a === 'alt' ? 1 : -1); return true; }
        if (room3d && a === 'rup') return fn('alt');
        return fn(a);
      }),
      finish: (r: ChallengeResult) => {
        if (finished) return; finished = true;
        if (!r.pass) { cls.react('confused', 'Let’s take a short break and try that again.', room.chair); window.setTimeout(() => api.finish(r), 900); return; }
        setEng(1); stage.classList.add('q1-flash');
        const end = (res: ChallengeResult) => window.setTimeout(() => api.finish(res), 1100);
        const applaud = () => cls.react('applause', CLASSROOM.passLine.replace('{chair}', room.chair), room.chair);
        if (api.difficulty !== 'hard') { applaud(); end(r); return; }
        cls.react('nod', 'Good. One more question before I decide.', room.chair);
        window.setTimeout(() => followUp(stage, room, api, ok => {
          if (ok) { applaud(); end({ ...r, summary: `${r.summary} You also answered the chair's follow-up question.` }); }
          else api.finish({ pass: false, quality: 0, summary: `The demo went well, but the follow-up answer was off. The answer was: ${room.followUp.correct}` });
        }), 1300);
      },
    };
    const cleanup = body(stage, wrapped);
    return () => { if (current === cls) current = null; clearTimeout(speechTimer); (root as HTMLElement & { q1Cleanup?: () => void }).q1Cleanup?.(); if (typeof cleanup === 'function') cleanup(); };
  };
}

function followUp(stage: HTMLElement, room: RoomDef, api: ChallengeApi, done: (ok: boolean) => void) {
  api.onAction(() => false);                                   // let nav/confirm drive the buttons
  const opts = [...room.followUp.options].sort(() => Math.random() - 0.5);
  stage.replaceChildren(h('div', { class: 'q1-follow' },
    h('div', { class: 'q1-follow-who', text: `${room.chair} has one more question:` }),
    h('h3', { text: room.followUp.q }),
    h('div', { class: 'q1-follow-opts' }, ...opts.map(o => btn(o, () => done(o === room.followUp.correct))))));
  api.setStatus('Hard mode: answer the chair’s follow-up question.');
  api.refocus();
}

function person(shirt: string, hair: string, skin: string, name: string, isChair = false) {
  const el = h('div', { class: `q1-person ${isChair ? 'chair' : ''}`, title: name },
    h('div', { class: 'q1-hair', style: `background:${hair}` }),
    h('div', { class: 'q1-head', style: `background:${skin}` }),
    h('div', { class: 'q1-body', style: `background:${shirt}` }),
    h('div', { class: 'q1-name', text: name }));
  let t = 0;
  return { el, pose(cue: Cue) { el.dataset.pose = cue; clearTimeout(t); t = window.setTimeout(() => { delete el.dataset.pose; }, 1400); } };
}

let styled = false;
function injectStyles() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.dataset.q1 = '';
  s.textContent = `
.q1-room{position:relative;display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"place props eng" "people people people" "speech speech speech";gap:4px 12px;padding:8px 12px 10px;margin:0 0 10px;border:3px solid #3a2c22;border-radius:8px;background:linear-gradient(var(--wall) 0 68%,var(--floor) 68%);image-rendering:pixelated}
.q1-place{grid-area:place;font:700 13px/1.2 monospace;color:#2a211a;background:rgba(255,250,235,.8);padding:3px 8px;border-radius:4px;justify-self:start}
.q1-props{grid-area:props;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center}
.q1-prop{font:11px monospace;background:var(--board);color:#f3efe2;padding:2px 6px;border-radius:3px;opacity:.9}
.q1-eng{grid-area:eng;display:flex;align-items:center;gap:6px;font:700 11px monospace;color:#2a211a}
.q1-eng-bar{width:140px;height:12px;background:#2a211a;border:2px solid #2a211a;border-radius:3px;overflow:hidden}
.q1-eng-fill{height:100%;background:linear-gradient(90deg,#e0a83a,#7fd06a);transition:width .4s}
.q1-people{grid-area:people;display:flex;align-items:flex-end;gap:22px;min-height:96px;padding-top:6px}
.q1-gap{flex:1}
.q1-person{position:relative;width:64px;display:flex;flex-direction:column;align-items:center;transition:transform .2s}
.q1-person .q1-hair{width:34px;height:8px}.q1-person .q1-head{width:34px;height:26px}.q1-person .q1-body{width:46px;height:34px;border-radius:4px 4px 0 0}
.q1-person .q1-name{margin-top:3px;font:10px/1.2 monospace;text-align:center;color:#2a211a;background:rgba(255,250,235,.8);padding:1px 3px;border-radius:2px}
.q1-person.chair{width:110px}.q1-person.chair .q1-body{width:52px;height:40px;border-top:5px solid #7a2b2b}
.q1-person[data-pose=nod]{animation:q1nod .5s 2}.q1-person[data-pose=confused]{transform:rotate(-8deg)}
.q1-person[data-pose=ooh],.q1-person[data-pose=applause]{animation:q1hop .35s 3}.q1-person[data-pose=gasp]{transform:translateY(-6px) scale(1.05)}
@keyframes q1nod{50%{transform:translateY(3px)}}@keyframes q1hop{50%{transform:translateY(-7px)}}
.q1-speech{grid-area:speech;min-height:1.6em;font:15px/1.4 Georgia,serif;color:#2a211a;background:#fffaf0;border:2px solid #3a2c22;border-radius:6px;padding:5px 12px;opacity:.6;transition:opacity .2s}
.q1-speech.show{opacity:1}.q1-speech.confused{border-color:#b04a3a}.q1-speech.applause,.q1-speech.ooh{border-color:#4f9a45}
.q1-stage{position:relative}
.q1-stage.q1-flash{animation:q1flash 1.2s ease-out}
@keyframes q1flash{0%{filter:saturate(1)}30%{filter:saturate(2.4) brightness(1.15)}100%{filter:saturate(1)}}
.q1-follow{padding:18px;border:3px dashed #b9761d;border-radius:8px;background:#fffaf0}
.q1-follow-who{font:700 13px monospace;color:#7a4f1a}.q1-follow h3{margin:6px 0 12px;font-family:Georgia,serif;color:#2a211a}
.q1-follow-opts{display:flex;flex-direction:column;gap:8px}
@media (prefers-reduced-motion:reduce){.q1-person,.q1-stage.q1-flash{animation:none!important}}
/* In-room demos: the 3D classroom stays visible; only a strip along the bottom */
.screen.fullscreen.q1-inroom{background:transparent!important;pointer-events:none}
.screen.fullscreen.q1-inroom .panel{animation:q1up .45s ease-out;pointer-events:auto;top:auto!important;bottom:0;height:auto!important;max-height:46dvh;background:rgba(20,15,11,.86)!important;background-image:none!important;padding:8px max(14px,calc((100vw - 1240px)/2))!important;gap:4px;border-top:3px solid #0b0b0b!important}
.screen.fullscreen.q1-inroom.q1-closeup .panel{max-height:60dvh;background:rgba(20,15,11,.80)!important}
.q1-closeup .cx-board{max-height:38dvh!important;width:auto!important;max-width:100%}
.q1-closeup .cx-wrap{align-items:flex-start}
.q1-closeup .art-canvas{max-height:40dvh!important;aspect-ratio:1/1;width:auto!important}
.q1-closeup .art-refbox{display:none}
.q1-inroom .ch-intro,.q1-inroom .legend-box{display:none}
.q1-inroom .ch-head{padding:3px 8px}.q1-inroom .ch-title{font-size:16px!important}
.q1-inroom .ch-footer{padding:4px!important}
.q1-mini{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.q1-mini .q1-place{font:700 12px monospace;color:#2a211a;background:rgba(255,250,235,.85);padding:3px 8px;border-radius:4px}
.q1-mini .q1-speech{flex:1;min-width:240px;opacity:1;font-size:14px;padding:3px 10px}
.q1-mini .q1-eng{color:#f3ecdc}
.q1-viewbtn{padding:4px 10px!important;font-size:12px!important}
.q1-inroom .ch-head{display:none}
.q1-mini{flex-wrap:nowrap}
.q1-mini .q1-speech{min-width:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.3}
.q1-mini .q1-place{display:none}
body:has(.q1-inroom) .hud-help{visibility:hidden}
.q1-mini .ch-footer{display:flex;gap:6px;margin:0 0 0 auto;padding:0!important;border:0!important;background:none!important;flex:none}
.q1-mini .tools-label{display:none}
.q1-mini .ch-footer button,.q1-mini .q1-viewbtn{padding:3px 8px!important;font-size:11px!important;white-space:nowrap}
.q1-inroom .ch-hint:empty{display:none}
body:has(.q1-inroom) .hud-top,body:has(.q1-inroom) .hud-mini,body:has(.q1-inroom) .hud-pointer,body:has(.q1-inroom) .hud-coins{visibility:hidden}
.screen.fullscreen.q1-inroom .panel.q1-inroom-panel{background:#7a5634!important;border-top:4px solid #4f3820!important;box-shadow:inset 0 6px 0 rgba(255,255,255,.06)}
.q1-mini{gap:16px!important}
.q1-mini .q1-speech{background:#fffaf0!important;color:#2a211a;border:0!important;border-radius:3px;transform:rotate(-.4deg);max-width:56%;font:14px/1.35 Georgia,serif;padding:6px 12px!important;box-shadow:0 2px 0 rgba(0,0,0,.25)}
.q1-mini .q1-eng{color:#f1e6d0}
.q1-vw{display:flex;align-items:flex-end;gap:8px;margin-left:auto;flex:none}
.screen .q1-vw button.q1-ar,.screen .q1-vw button.q1-ar:hover,.screen .q1-vw button.q1-ar:focus{all:unset;display:flex;flex-direction:column;align-items:center;gap:2px;padding:0 2px!important;color:#fff3c4!important;cursor:pointer;border:0!important;background:none!important;box-shadow:none!important;min-height:0!important;min-width:0!important}
.q1-ar small{font:11px monospace;color:#2a211a;background:#efe3c2;border-radius:3px;padding:0 5px}
.q1-ar b{font:500 22px system-ui,sans-serif;line-height:1}
.q1-ar:hover b{color:#ffd34d}
.q1-vn{font:15px Georgia,serif;color:#fff3c4;min-width:150px;text-align:center;padding-bottom:2px}
.q1-inroom .q1-bin-work,.q1-inroom .q1-eng-line,.q1-inroom .q1-eng-choice,.q1-inroom .art-wrap>div:first-child,.q1-inroom .art-refbox,.q1-inroom .cx-boardbox{display:none!important}
.q1-inroom .q1-bin-fb,.q1-inroom .q1-bin-score,.q1-inroom .q1-eng-hud,.q1-inroom .cx-side,.q1-inroom .art-side{color:#fbf1dc}
.q1-inroom .ch-hint{background:#fff3a8;color:#2a211a;border-radius:3px;display:inline-block;padding:3px 10px!important;margin:4px 0 0!important}
.q1-more{position:absolute;left:50%;bottom:30dvh;transform:translateX(-50%);display:flex;visibility:hidden;flex-direction:column;align-items:stretch;gap:8px;pointer-events:auto;background:#fffaf0;border:3px solid #3a2c22;border-radius:10px;padding:12px 14px;z-index:6;box-shadow:0 10px 24px rgba(0,0,0,.4)}
.q1-more.open,.screen.tools-mode .q1-more{visibility:visible}
.q1-more .ch-footer{display:flex!important;flex-direction:column;gap:6px;padding:0!important;border:0!important;background:none!important}
.q1-more .tools-label,.q1-more .ch-hintbtn{display:none!important}
.q1-intro{border-color:#7a4f1a}
.q1-coach{position:fixed;inset:0;z-index:20;pointer-events:auto}
.q1-coach-hole{position:absolute;border:3px solid #ffd34d;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,.58);pointer-events:none;transition:all .25s}
.q1-coach-note{position:absolute;background:#fffaf0;color:#2a211a;border:3px solid #3a2c22;border-radius:10px;padding:10px 14px;font:15px/1.45 Georgia,serif;box-shadow:0 8px 22px rgba(0,0,0,.45)}
.q1-coach-note p{margin:4px 0 8px}
.q1-coach-step{font:700 11px monospace;letter-spacing:.06em;text-transform:uppercase;color:#7a4f1a}
.q1-coach-row{display:flex;justify-content:space-between;gap:10px}
.q1-coach-row button{padding:4px 10px!important;font-size:12px!important}
.q1-card{position:absolute;left:50%;top:18%;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));pointer-events:auto;background:#fffaf0;color:#2a211a;border:3px solid #3a2c22;border-radius:10px;padding:14px 18px 12px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:15px/1.45 Georgia,serif;z-index:5;animation:q1up .3s ease-out}
.q1-card p{margin:6px 0}
.q1-card-tag{font:700 12px monospace;letter-spacing:.06em;text-transform:uppercase;color:#7a4f1a}
.q1-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;font:12px monospace;color:#6b5a48}
.q1-inroom .ch-hint{font-size:13px;padding:2px 8px;margin:0}
.q1-inroom .q1-follow{padding:8px 12px}.q1-inroom .q1-follow h3{margin:2px 0 6px;font-size:16px}
.q1-inroom .q1-follow-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.q1-inroom .q1-bin-q,.q1-inroom .q1-bin-board,.q1-inroom .q1-bin-how,.q1-inroom .ch-status{display:none}
.screen.fullscreen.q1-inroom:not(.q1-closeup) .panel{max-height:40dvh}
.q1-inroom .ch-result{padding:6px}.q1-inroom .ch-result h2{font-size:18px!important}
.q1-inroom .art-reveal{max-height:28dvh}
/* English in-room: keep the paper strip laid out but invisible (it drives timing) */
.q1-measure{position:absolute!important;left:0;right:0;top:0;visibility:hidden;pointer-events:none;height:0;overflow:hidden}
.q1-measure .rp-press{height:90px}
.q1-inroom .rp-choice{position:static;margin:4px 0}.q1-inroom .rp-toast{position:static}
/* bottom lectern panel: big enough to read from the couch */
.q1-mini{gap:20px!important}
.q1-mini .q1-speech{font:19px/1.35 Georgia,serif!important;max-width:58%;padding:8px 14px!important}
.q1-mini .q1-eng,.q1-eng{font:700 16px monospace!important;gap:8px}
.q1-mini .q1-eng-bar,.q1-eng-bar{width:180px;height:18px}
.q1-vn{font:20px Georgia,serif!important;min-width:180px}
.q1-ar b{font:500 30px system-ui,sans-serif!important}
.q1-ar small{font:14px monospace!important;padding:1px 6px}
.q1-mini .ch-footer button,.q1-mini .q1-viewbtn{font-size:15px!important;padding:5px 10px!important}
.q1-inroom .q1-bin-fb,.q1-inroom .q1-eng-hud,.q1-inroom .cx-side,.q1-inroom .art-side{font-size:20px!important;line-height:1.4}
.q1-inroom .q1-bin-score{font-size:16px!important}
.q1-inroom .ch-hint{font-size:18px!important;padding:5px 12px!important}
.q1-inroom .q1-choices button{font-size:22px!important;padding:8px 18px!important;min-width:64px}
.q1-inroom .q1-follow h3{font-size:20px!important}.q1-inroom .q1-follow-opts button{font-size:17px!important}
.q1-inroom .ch-result h2{font-size:22px!important}.q1-inroom .ch-result{font-size:17px}
.screen.fullscreen.q1-inroom:not(.q1-closeup) .panel{max-height:44dvh}
/* Art: dark chalkboard so white stone shows up */
.q1-demo .art-canvas .cell{background-color:#34463d}
.q1-demo .art-canvas{background:#1d2a24}
@keyframes q1up{from{translate:0 60px;opacity:0}to{translate:0 0;opacity:1}}
/* English: page on the whiteboard; strip shows the current line + corrections */
.q1-eng-hud{font:700 13px monospace;color:#9fe6ff}
.q1-eng-line{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.q1-eng-line button{padding:4px 8px!important;font:600 14px Georgia,serif!important;text-transform:none!important}
.q1-eng-line button.sel{outline:3px solid #ffd34d!important;background:#fff3c4!important}
.q1-eng-line button.fixed{color:#c0392b!important;font-style:italic!important}
.q1-eng-lbl{font:700 12px monospace;color:#e8dcc2;margin-right:4px}
.q1-eng-choice{display:flex;flex-wrap:wrap;gap:6px;align-items:center;color:#f3ecdc;min-height:34px}
.q1-eng-choice button{text-transform:none!important}.q1-eng-choice button.sel{outline:3px solid #ffd34d!important}
.q1-page{width:100%;max-width:1000px;display:block;margin:0 auto 8px;border:3px solid #0b0b0b}
/* Art & Engineering in the room: you work on the 3D board; the DOM grid is just a small mouse pad */
.screen.fullscreen.q1-inroom.q1-pad .panel{max-height:40dvh}
.q1-pad .art-wrap,.q1-pad .cx-wrap{display:flex;gap:14px;align-items:flex-start}
.q1-pad .art-canvas{height:22dvh!important;width:calc(22dvh * 20 / 24)!important;max-height:none!important;opacity:.85}
.q1-pad .art-refbox{display:none}
.q1-pad .cx-board{height:20dvh!important;width:auto!important;max-height:none!important;opacity:.85}
.q1-pad .art-wrap>div:first-child::before,.q1-pad .cx-boardbox::before{content:"mouse pad";display:block;font:700 10px monospace;color:#a9a08c;text-transform:uppercase}
/* Math: binary board */
.q1-bin{display:grid;gap:12px}
.q1-bin-q{font:18px/1.4 Georgia,serif;color:#2a211a;background:#fffaf0;border:2px solid #3a2c22;border-radius:6px;padding:10px 14px}
.q1-bin-q b{font-family:monospace}
.q1-bin-board{display:flex;gap:10px;justify-content:center;background:var(--board,#2f4a3c);border-radius:6px;padding:12px}
.q1-bin-col{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:84px;color:#eef3ea;font:700 13px monospace}
.q1-bin-col .bit{font-size:30px;line-height:1}.q1-bin-col.on .bit{color:#ffd34d}.q1-bin-col.hl{outline:3px dashed #9cff57;outline-offset:3px}
.q1-bin-num{align-self:center;font:700 26px monospace;color:#ffd34d;padding-left:8px}
.q1-tray{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.q1-coin{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 35% 30%,#ffe9a0,#d9a52b 60%,#9a6f15);border:3px solid #6b4a0e;font:700 13px monospace;color:#3a2600;cursor:pointer}
.q1-coin i{display:block;font-style:normal;font-size:20px}
.q1-coin.sel{outline:4px solid #ffd34d;outline-offset:3px}.q1-coin.hinted{box-shadow:0 0 0 5px #9cff57}
.q1-hand{display:flex;gap:6px;min-height:46px;align-items:center;justify-content:center;font:13px monospace}
.q1-hand .q1-coin{width:42px;height:42px;font-size:9px}.q1-hand .q1-coin i{font-size:12px}
.q1-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.q1-choices button.sel{outline:4px solid #ffd34d}.q1-choices button.gone{opacity:.35;text-decoration:line-through}
.q1-bin-fb{min-height:1.5em;font:16px/1.4 Georgia,serif;text-align:center;padding:6px 10px;border-radius:6px}
.q1-bin-fb.ok{background:#e3f4dc;color:#24521c;border:2px solid #4f9a45}.q1-bin-fb.bad{background:#f8e1dc;color:#7a2216;border:2px solid #b04a3a}
.q1-choices button.right{background:#d8f0cf!important;border-color:#4f9a45!important}.q1-choices button.wrong{background:#f6d6cf!important;border-color:#b04a3a!important}
.q1-next{margin-top:10px;display:block;margin-left:auto;margin-right:auto}
.q1-bin-how{font:16px/1.5 Georgia,serif;background:#fffaf0;color:#2a211a;border:2px solid #3a2c22;border-radius:6px;padding:10px 14px 10px 34px;margin:0 0 10px}
.q1-bin-score{font:13px monospace;text-align:center;color:inherit}
/* Art: projector */
.art-refbox.q1-dark .art-ref{filter:brightness(.06)}
.art-refbox.q1-dark .ref-title::after{content:" — shorted out!";color:#b04a3a}
`;
  document.head.append(s);
}
