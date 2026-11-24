// Side quests: optional errands from characters standing around campus (separate from the three story
// quests, which stay in src/quests/). Each giver has a floating icon — "!" has a job for you, "?" waits
// for you to come back, "…" means you're on it. Rewards are coins, paid once; progress is saved.
//
//   lost-id   The Lost Student ID   find a dropped ID card and bring it back
//   tour      Freshman Tour         a new student follows you to three campus buildings
//   courier   Campus Courier        deliver a package across campus before the timer runs out
//   trivia    Campus Trivia         five questions built from the game's own history data
//   hoops     Hoops Challenge       sink baskets on the outdoor court against the clock
//   flyers    Gone with the Wind    collect activity flyers the wind scattered, against the clock
import * as THREE from 'three';
import type { DialogueLine } from '../quests/contract';
import { Avatar, type AvatarLook } from '../player/Avatar';
import { eraLook, Bubble } from '../world/Npcs';
import { ERAS, type EraId } from '../world/eras';
import { BUILDINGS } from '../world/buildingRegistry';
import { CAMPUS, everOccupied, PATH_KINDS, pointInPoly } from '../world/campusData';
import { buildingName, makeTrivia } from './trivia';

export type SideStatus = 'available' | 'active' | 'ready' | 'done';
export interface SideState { status: SideStatus; earned: number; data: Record<string, unknown> }
type Side = 'n' | 's' | 'e' | 'w';

/** What the side quests need from the game (implemented in game.ts). */
export interface SideHost {
  scene: THREE.Scene;
  era(): EraId;
  difficulty(): 'easy' | 'hard';
  player(): { x: number; z: number; yaw: number; space: string; driving: boolean };
  playerName(): string;
  groundY(x: number, z: number): number;
  blocked(x: number, z: number, r: number): boolean;
  /** Free outdoor spot just outside a building's wall on one side (game metres), facing away from it. */
  spotBy(building: string, side: Side, out?: number): { x: number; z: number; yaw: number } | null;
  /** Centre of the outdoor basketball court, if there is one. */
  court(): { x: number; z: number } | null;
  addInteractable(def: { id: string; at: { x: number; z: number }; radius: number; prompt: string; visual?: THREE.Object3D; npc?: boolean; objective?: () => boolean; enabled?: () => boolean; onInteract: () => void | Promise<void> }): void;
  removeInteractable(id: string): void;
  talk(npc: THREE.Object3D, lines: DialogueLine[]): Promise<void>;
  choose(title: string, body: string, buttons: { id: string; label: string }[]): Promise<string | null>;
  toast(text: string, ms?: number): void;
  sound(name: 'tick' | 'error' | 'chime' | 'success' | 'cheer' | 'pop' | 'coin'): void;
  holdItem(color: string | null): void;
  registerSpeaker(name: string, a: Avatar): void;
  save(): void;
}

interface Giver { name: string; role: string; building: string; side: Side; seed: number; dress: Partial<AvatarLook> }
interface Def {
  id: string; title: string; summary: string; reward: number; giver: Giver;
  /** Timed quests restart from the giver after a reload (the clock can't be trusted across sessions). */
  timed?: boolean;
}
const DEFS: Def[] = [
  { id: 'lost-id', title: 'The Lost Student ID', summary: 'Megan dropped her student ID somewhere on campus.', reward: 40,
    giver: { name: 'Megan', role: 'Student', building: 'manwaring', side: 's', seed: 901, dress: { shirt: '#c94f6d', backpack: '#2f3e57' } } },
  { id: 'tour', title: 'Freshman Tour', summary: 'Tyler is new in town. Show him around campus.', reward: 60,
    giver: { name: 'Tyler', role: 'New student', building: 'kimball', side: 'e', seed: 902, dress: { shirt: '#3f7a4a', hat: 'cap', hatColor: '#3f7a4a', backpack: '#b8742c' } } },
  { id: 'courier', title: 'Campus Courier', summary: 'Brother Jensen needs a package delivered — fast.', reward: 50, timed: true,
    giver: { name: 'Brother Jensen', role: 'Mail Services', building: 'smith', side: 'w', seed: 903, dress: { shirt: '#e8e2d0', pants: '#2b3550', tie: '#2f4f7f', hairStyle: 'short', hair: '#8a8580' } } },
  { id: 'trivia', title: 'Campus Trivia', summary: 'Kenzie from the Quiz Bowl club wants to test your campus history.', reward: 30,
    giver: { name: 'Kenzie', role: 'Quiz Bowl club', building: 'taylor', side: 'n', seed: 904, dress: { shirt: '#5a3a8a', glasses: true, hairStyle: 'bun' } } },
  { id: 'hoops', title: 'Hoops Challenge', summary: 'Coach Dana dares you to sink baskets on the outdoor court.', reward: 50, timed: true,
    giver: { name: 'Coach Dana', role: 'Intramurals', building: 'hart', side: 'n', seed: 905, dress: { shirt: '#d9662a', pants: '#2a2a2a', hat: 'cap', hatColor: '#2a2a2a', shorts: true } } },
  { id: 'flyers', title: 'Gone with the Wind', summary: 'Priya’s activity flyers blew all over campus. Catch them!', reward: 45, timed: true,
    giver: { name: 'Priya', role: 'Activities club', building: 'romney', side: 'e', seed: 906, dress: { shirt: '#d1a12f', hairStyle: 'long', hair: '#1a1a1a' } } },
];

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const STANDING_ALL_ERAS = ['mckay', 'hart', 'snow', 'smith', 'austin', 'romney', 'clarke', 'manwaring', 'taylor', 'benson'];

/** Floating "!" / "?" / "…" over a giver's head. */
function icon(): { sprite: THREE.Sprite; set: (t: string) => void } {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(0.9, 0.9, 1); sprite.position.y = 2.75; sprite.renderOrder = 9;
  let cur = '';
  return { sprite, set: t => {
    if (t === cur) return; cur = t; sprite.visible = !!t; if (!t) return;
    const g = c.getContext('2d')!; g.clearRect(0, 0, 128, 128);
    g.fillStyle = t === '!' ? '#ffcc33' : t === '?' ? '#5ab0ff' : '#e8e2d6'; g.strokeStyle = '#2a211b'; g.lineWidth = 7;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#2a211b'; g.font = 'bold 76px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 64, 70);
    tex.needsUpdate = true;
  } };
}

interface Runtime {
  giver: Avatar; post: { x: number; z: number; yaw: number }; icon: ReturnType<typeof icon>; bubble: Bubble;
  x: number; z: number; yaw: number;
}

export class SideQuests {
  readonly defs = DEFS;
  private state: Record<string, SideState> = {};
  private rt = new Map<string, Runtime>();
  private time = 0;
  private cleanup: (() => void)[] = [];   // objects of the quest in progress
  /** Live, unsaved progress of the quest in progress (timer, counters). */
  private live: { timeLeft?: number; count?: number; goal?: number; targets?: { id: string; x: number; z: number; mesh: THREE.Object3D }[]; stop?: number } = {};

  constructor(private host: SideHost) {
    for (const d of DEFS) this.state[d.id] = { status: 'available', earned: 0, data: {} };
  }

  // ---------------------------------------------------------------- setup
  /** Place the quest givers (call once the world exists). */
  setup() {
    for (const d of DEFS) {
      const post = d.id === 'hoops' ? this.courtSpot() : this.host.spotBy(d.giver.building, d.giver.side, 4.5);
      if (!post) continue;
      const a = new Avatar(this.look(d), 1);
      const ic = icon(); a.root.add(ic.sprite);
      const bubble = new Bubble(this.host.scene);
      this.rt.set(d.id, { giver: a, post, icon: ic, bubble, x: post.x, z: post.z, yaw: post.yaw });
      a.root.rotation.y = post.yaw;
      this.host.registerSpeaker(d.giver.name, a);
      this.host.addInteractable({ id: `side:${d.id}`, at: { x: post.x, z: post.z }, radius: 3, npc: true, visual: a.root,
        prompt: `Talk to ${d.giver.name} (${d.giver.role})`, objective: () => this.state[d.id].status === 'ready',
        onInteract: () => this.talk(d) });
    }
  }
  private courtSpot() {
    const c = this.host.court(); if (!c) return null;
    for (let r = 9; r < 22; r += 1.5) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!this.host.blocked(x, z, 0.8)) return { x, z, yaw: Math.atan2(c.x - x, c.z - z) };
    }
    return null;
  }
  private look(d: Def): AvatarLook { return { ...eraLook(this.host.era(), d.giver.seed), ...d.giver.dress } as AvatarLook; }
  /** Re-dress the givers for the era. */
  setEra() { for (const d of DEFS) this.rt.get(d.id)?.giver.rebuild(this.look(d)); }

  // ---------------------------------------------------------------- save
  snapshot(): Record<string, SideState> { return JSON.parse(JSON.stringify(this.state)); }
  load(saved: Record<string, SideState> | undefined) {
    this.abortLive();
    for (const d of DEFS) {
      const s = saved?.[d.id];
      this.state[d.id] = s ? { status: s.status, earned: s.earned ?? 0, data: s.data ?? {} } : { status: 'available', earned: 0, data: {} };
      const st = this.state[d.id];
      // timed quests can't resume their clock: back to the giver; others pick up where they were
      if (st.status === 'active' && d.timed) st.status = 'available';
    }
    const active = DEFS.find(d => this.state[d.id].status === 'active');
    if (active) this.begin(active, true);
    if (this.state.courier.status !== 'active') this.host.holdItem(null);
    for (const [id, r] of this.rt) if (id === 'tour' && this.state.tour.status !== 'active') { r.x = r.post.x; r.z = r.post.z; }
  }
  coins() { return Object.values(this.state).reduce((s, q) => s + q.earned, 0); }
  doneCount() { return Object.values(this.state).filter(q => q.status === 'done').length; }
  status(id: string) { return this.state[id]?.status; }

  // ---------------------------------------------------------------- dialogue
  private active() { return DEFS.find(d => this.state[d.id].status === 'active' || this.state[d.id].status === 'ready') ?? null; }
  private name(b: string) { const e = BUILDINGS.find(x => x.id === b); return (e && buildingName(e, ERAS[this.host.era()].year)) ?? b; }
  private say(d: Def, text: string): DialogueLine { return { speaker: `${d.giver.name} · ${d.giver.role}`, text }; }

  /** Whose conversation is on screen (their icon hides so it doesn't fill the close-up). */
  private talkingTo: string | null = null;
  private async talk(d: Def) {
    this.talkingTo = d.id;
    try { await this.converse(d); } finally { this.talkingTo = null; }
  }
  private async converse(d: Def) {
    const st = this.state[d.id], r = this.rt.get(d.id)!, me = this.host.playerName() || 'friend';
    const talk = (lines: string[]) => this.host.talk(r.giver.root, lines.map(t => this.say(d, t)));
    if (st.status === 'ready') return this.turnIn(d);
    if (st.status === 'active') {
      await talk([this.reminder(d)]);
      const c = await this.host.choose(d.title, 'Keep going, or give up for now? (You can try again later.)', [{ id: 'keep', label: 'Keep going' }, { id: 'quit', label: 'Give up for now' }]);
      if (c === 'quit') { this.abortLive(); st.status = 'available'; this.host.toast(`Side quest paused: ${d.title}`); this.host.save(); }
      return;
    }
    if (st.status === 'done') {
      await talk([this.thanks(d, me)]);
      if ((d.id === 'trivia' || d.id === 'hoops') && !this.active()) {
        const c = await this.host.choose(d.title, 'Play again just for fun? (No coins this time.)', [{ id: 'yes', label: 'Play again' }, { id: 'no', label: 'Maybe later' }]);
        if (c === 'yes') { if (d.id === 'trivia') await this.runTrivia(d, true); else { st.data.replay = true; this.begin(d); } }
      }
      return;
    }
    // available
    const busy = this.active();
    if (busy) { await talk([`You look busy helping ${busy.giver.name}. Come back when you’re done!`]); return; }
    await talk(this.intro(d, me));
    const c = await this.host.choose(d.title, `${d.summary}\nReward: ${d.reward}${d.id === 'trivia' ? '+' : ''} coins`, [{ id: 'yes', label: 'Sure, I’ll help!' }, { id: 'no', label: 'Not right now' }]);
    if (c !== 'yes') { await talk([`No worries. I’ll be right here.`]); return; }
    if (d.id === 'trivia') { await this.runTrivia(d, false); return; }
    st.data = {}; this.begin(d);
    this.host.toast(`Side quest started: ${d.title}`); this.host.sound('chime'); this.host.save();
  }
  private intro(d: Def, me: string): string[] {
    const hard = this.host.difficulty() === 'hard';
    switch (d.id) {
      case 'lost-id': return [`Oh no, oh no… ${me}, right? I can’t find my student ID anywhere!`, 'I need it for the testing center this afternoon. I walked all over campus this morning…'];
      case 'tour': return ['Hi! I just moved here and I keep getting lost.', `Could you show me a few places? The library, the student center and the gym would be a great start.`];
      case 'courier': return ['This package has to reach the other side of campus before the office closes!', `My feet aren’t what they used to be. You look fast — and the carts and bikes are fair game.`];
      case 'trivia': return ['Quiz Bowl tryouts are next week and I need a practice partner.', 'Five questions about our school’s history. Get four right and I’ll pay you in coins!'];
      case 'hoops': return ['Hey! You look like you’ve got a jump shot.', `Sink ${hard ? 5 : 3} baskets on this court in ${hard ? 75 : 90} seconds and the prize is yours.`];
      case 'flyers': return ['The wind just ripped my box of activity flyers open!', `They’re all over campus. Catch ${hard ? 8 : 6} of them before they blow into the next county!`];
    }
    return [d.summary];
  }
  private reminder(d: Def): string {
    const st = this.state[d.id];
    switch (d.id) {
      case 'lost-id': return `I think I left it near the ${this.name(String(st.data.at))}. Please keep looking!`;
      case 'tour': return 'Lead the way! I’ll follow you.';
      case 'courier': return `The package goes to the ${this.name(String(st.data.to))}. Hurry!`;
      case 'hoops': return 'Grab the ball and shoot!';
      case 'flyers': return 'Follow the markers — the flyers are still blowing around!';
    }
    return 'Keep going!';
  }
  private thanks(d: Def, me: string): string {
    switch (d.id) {
      case 'lost-id': return `Thanks again, ${me}! I passed my test, by the way.`;
      case 'tour': return `I know my way around now — thanks to you, ${me}!`;
      case 'courier': return 'Best courier on campus. The office still talks about it.';
      case 'trivia': return 'You’re a walking history book!';
      case 'hoops': return 'Nice shooting, superstar.';
      case 'flyers': return `The activity was packed, ${me}! All thanks to you.`;
    }
    return 'Thank you!';
  }
  /** A line for students who know someone needs help (null when nobody does). */
  hintFor(): string | null {
    const open = DEFS.filter(d => this.state[d.id].status === 'available' && this.rt.has(d.id));
    if (!open.length) return null;
    const d = open[Math.floor(this.time / 20) % open.length];
    const where = d.id === 'hoops' ? 'the outdoor basketball court' : `the ${this.name(d.giver.building)}`;
    return `Actually, yes! ${d.giver.name} by ${where} looked like they needed a hand. Look for the yellow “!”.`;
  }

  private async turnIn(d: Def) {
    const st = this.state[d.id], r = this.rt.get(d.id)!;
    const extra = Number(st.data.bonus ?? 0), reward = d.reward + extra;
    const lines: Record<string, string> = {
      'lost-id': 'My ID! You found it! You’re a lifesaver.',
      flyers: 'You got them all?! The activity is saved!',
    };
    await this.host.talk(r.giver.root, [this.say(d, lines[d.id] ?? 'You did it!')]);
    this.finish(d, reward);
  }
  private finish(d: Def, reward: number) {
    const st = this.state[d.id];
    const replay = !!st.data.replay;
    this.abortLive();
    st.status = 'done';
    if (!replay) { st.earned = reward; this.host.toast(`Side quest complete: ${d.title} · +${reward} coins`, 4500); this.host.sound('success'); }
    else this.host.toast(`${d.title}: nice! (just for fun)`, 3000);
    st.data = {};
    this.host.save();
  }
  private fail(d: Def, msg: string) {
    const st = this.state[d.id];
    this.abortLive();
    st.status = st.data.replay ? 'done' : 'available'; st.data = {};
    this.host.toast(msg, 5000); this.host.sound('error'); this.host.save();
  }

  // ---------------------------------------------------------------- the quests
  private begin(d: Def, resumed = false) {
    const st = this.state[d.id], hard = this.host.difficulty() === 'hard';
    this.abortLive(); st.status = 'active';
    if (d.id === 'lost-id') {
      const choices = STANDING_ALL_ERAS.filter(b => b !== d.giver.building);
      st.data.at ??= choices[(Math.random() * choices.length) | 0];
      const sides: Side[] = ['n', 's', 'e', 'w'];
      const p = this.host.spotBy(String(st.data.at), sides[(Math.random() * 4) | 0], 3) ?? this.host.spotBy(String(st.data.at), 'n', 3);
      if (!p) { st.status = 'available'; return; }
      const card = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.28), new THREE.MeshStandardMaterial({ color: '#3d6fa8', emissive: '#1f4e8c', emissiveIntensity: 0.6 }));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.032, 0.06), new THREE.MeshStandardMaterial({ color: '#f4f1e8' })); stripe.position.z = -0.06;
      card.add(body, stripe);
      this.spawnPickup('side:lost-id:card', p.x, p.z, card, 'Pick up the student ID', () => {
        st.status = 'ready'; this.host.sound('pop'); this.host.toast(`Found it! Bring the ID back to Megan by the ${this.name(d.giver.building)}.`, 5000); this.host.save();
      });
      if (!resumed) this.host.toast(`Megan says she was near the ${this.name(String(st.data.at))}.`, 5000);
    } else if (d.id === 'tour') {
      const stops = ['mckay', 'manwaring', 'hart'];
      st.data.stop = Number(st.data.stop ?? 0);
      this.live.stop = Number(st.data.stop); this.live.targets = [];
      stops.forEach((b, i) => {
        const p = this.host.spotBy(b, (['s', 'n', 's'] as Side[])[i], 6); if (!p) return;
        this.live.targets!.push({ id: b, x: p.x, z: p.z, mesh: new THREE.Group() });
        this.host.addInteractable({ id: `side:tour:${i}`, at: p, radius: 0, prompt: '', objective: () => this.live.stop === i, onInteract: () => {} });
        this.cleanup.push(() => this.host.removeInteractable(`side:tour:${i}`));
      });
      const r = this.rt.get('tour')!; const pl = this.host.player();
      if (resumed) { r.x = pl.x + 2; r.z = pl.z + 2; }
    } else if (d.id === 'courier') {
      const from = this.rt.get('courier')!.post;
      const cands = STANDING_ALL_ERAS.filter(b => b !== 'smith').map(b => ({ b, p: this.host.spotBy(b, 'e', 3) })).filter(c => c.p) as { b: string; p: { x: number; z: number; yaw: number } }[];
      if (!cands.length) { st.status = 'available'; return; }
      const far = cands.sort((a, b) => Math.hypot(b.p.x - from.x, b.p.z - from.z) - Math.hypot(a.p.x - from.x, a.p.z - from.z))[(Math.random() * Math.min(3, cands.length)) | 0];
      st.data.to = far.b;
      const dist = Math.hypot(far.p.x - from.x, far.p.z - from.z);
      this.live.timeLeft = Math.round(hard ? dist / 4.2 + 15 : dist / 3.0 + 30);
      this.host.holdItem('#a8743d');
      const box = new THREE.Group(); const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 20), new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#806010', emissiveIntensity: 0.5 })); box.add(mat);
      this.host.addInteractable({ id: 'side:courier:drop', at: far.p, radius: 2.6, prompt: 'Deliver the package', visual: box, objective: () => true, onInteract: () => {
        const left = this.live.timeLeft ?? 0; this.state.courier.data.bonus = Math.round(Math.min(25, left / 2));
        this.host.holdItem(null); this.host.sound('success');
        this.host.toast(`Delivered with ${fmt(left)} to spare!`, 3000);
        this.finish(d, d.reward + Number(this.state.courier.data.bonus));
      } });
      this.cleanup.push(() => { this.host.removeInteractable('side:courier:drop'); this.host.holdItem(null); });
      this.host.toast(`Deliver the package to the ${this.name(far.b)} — ${fmt(this.live.timeLeft)} on the clock!`, 5000);
    } else if (d.id === 'hoops') {
      this.live.count = 0; this.live.goal = hard ? 5 : 3; this.live.timeLeft = hard ? 75 : 90;
      const c = this.host.court();
      if (c) { this.host.addInteractable({ id: 'side:hoops:court', at: c, radius: 0, prompt: '', objective: () => true, onInteract: () => {} }); this.cleanup.push(() => this.host.removeInteractable('side:hoops:court')); }
    } else if (d.id === 'flyers') {
      const n = hard ? 8 : 6; this.live.count = 0; this.live.goal = n; this.live.timeLeft = hard ? 110 : 150; this.live.targets = [];
      const post = this.rt.get('flyers')!.post;
      const pts = this.pathPoints(post.x, post.z, 22, 75, n);
      pts.forEach(([x, z], i) => {
        const m = new THREE.Group();
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), new THREE.MeshStandardMaterial({ color: ['#f4f1e8', '#ffe28a', '#bfe0f2', '#f6c1c9'][i % 4], side: THREE.DoubleSide, emissive: '#555', emissiveIntensity: 0.25 }));
        m.add(paper); m.position.set(x, this.host.groundY(x, z) + 1.2, z); this.host.scene.add(m);
        const id = `side:flyer:${i}`;
        this.live.targets!.push({ id, x, z, mesh: m });
        this.host.addInteractable({ id, at: { x, z }, radius: 0, prompt: '', objective: () => this.live.targets?.some(t => t.id === id) ?? false, onInteract: () => {} });
        this.cleanup.push(() => { m.removeFromParent(); this.host.removeInteractable(id); });
      });
    }
  }
  /** A collectible on the ground (bobbing, spinning) with an interact prompt. */
  private spawnPickup(id: string, x: number, z: number, obj: THREE.Object3D, prompt: string, onPick: () => void) {
    const holder = new THREE.Group(); holder.add(obj); obj.position.y = 0.6;
    holder.userData.spin = true; this.spinning.add(holder);
    this.host.addInteractable({ id, at: { x, z }, radius: 2.2, prompt, visual: holder, objective: () => true, onInteract: () => { this.host.removeInteractable(id); this.spinning.delete(holder); onPick(); } });
    this.cleanup.push(() => { this.host.removeInteractable(id); this.spinning.delete(holder); });
  }
  private spinning = new Set<THREE.Object3D>();
  /** Random points on campus footpaths between rMin and rMax from (x, z), spread apart. */
  private pathPoints(x: number, z: number, rMin: number, rMax: number, n: number): [number, number][] {
    const paths = CAMPUS.roads.filter(r => PATH_KINDS.has(r.kind) && r.pts.length > 1);
    const out: [number, number][] = [];
    for (let tries = 0; tries < 6000 && out.length < n; tries++) {
      const r = paths[(Math.random() * paths.length) | 0], i = (Math.random() * (r.pts.length - 1)) | 0, t = Math.random();
      const px = r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * t, pz = r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < rMin || d > rMax || everOccupied(px, pz, 1) || !CAMPUS.campus.some(c => pointInPoly(px, pz, c)) || this.host.blocked(px, pz, 0.5)) continue;
      if (out.some(o => Math.hypot(o[0] - px, o[1] - pz) < 12)) continue;
      out.push([px, pz]);
    }
    return out;
  }
  private abortLive() { for (const f of this.cleanup.splice(0)) f(); this.live = {}; }

  private async runTrivia(d: Def, replay: boolean) {
    const r = this.rt.get(d.id)!, qs = makeTrivia(ERAS[this.host.era()].year, 5);
    let right = 0;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const c = await this.host.choose(`Question ${i + 1} of ${qs.length}`, q.q, q.options.map((o, k) => ({ id: String(k), label: o })));
      if (c === null) { await this.host.talk(r.giver.root, [this.say(d, 'Quitting already? Come back anytime.')]); return; }
      const ok = Number(c) === q.answer; if (ok) right++;
      this.host.sound(ok ? 'chime' : 'error');
      await this.host.talk(r.giver.root, [this.say(d, ok ? ['Correct!', 'Yes! Exactly right.', 'Nailed it!'][i % 3] : `Not quite — it’s ${q.options[q.answer]}.`)]);
    }
    const pass = right >= 4;
    await this.host.talk(r.giver.root, [this.say(d, pass ? `${right} out of ${qs.length}! You’re hired for the team.` : `${right} out of ${qs.length}. So close — study up and try again!`)]);
    if (pass) { this.state.trivia.data = { replay }; this.finish(d, d.reward + right * 10); }
  }

  // ---------------------------------------------------------------- per frame
  /** Ball events from the outdoor courts (scores count for the hoops challenge). */
  onBallEvent(type: string) {
    if (this.state.hoops.status !== 'active' || type !== 'score') return;
    this.live.count = (this.live.count ?? 0) + 1; this.host.sound('cheer');
    if (this.live.count >= (this.live.goal ?? 3)) { this.host.toast('Challenge complete!', 2000); this.finish(DEFS.find(x => x.id === 'hoops')!, DEFS.find(x => x.id === 'hoops')!.reward); }
  }

  /** `clock`: false while menus/dialogue are open (timers wait). */
  update(dt: number, clock: boolean) {
    this.time += dt;
    const pl = this.host.player();
    for (const s of this.spinning) { s.rotation.y += dt * 2; s.position.y = this.host.groundY(s.position.x, s.position.z) + Math.sin(this.time * 3) * 0.12; }
    // givers: breathe, turn to face you when you're close, show their icon
    for (const d of DEFS) {
      const r = this.rt.get(d.id); if (!r) continue;
      const st = this.state[d.id];
      r.icon.set(st.status === 'available' ? '!' : st.status === 'ready' ? '?' : st.status === 'active' ? '…' : '');
      r.icon.sprite.position.y = 2.75 + Math.sin(this.time * 2.5 + d.giver.seed) * 0.08;
      r.icon.sprite.material.opacity = this.talkingTo === d.id ? 0 : 1;
      if (d.id === 'tour' && st.status === 'active') continue;    // the follower is moved below
      if (d.id === 'tour' && (r.x !== r.post.x || r.z !== r.post.z) && Math.hypot(pl.x - r.x, pl.z - r.z) > 45) { r.x = r.post.x; r.z = r.post.z; r.giver.root.position.set(r.x, this.host.groundY(r.x, r.z), r.z); }
      const dp = Math.hypot(pl.x - r.x, pl.z - r.z);
      const want = dp < 7 && pl.space === 'exterior' ? Math.atan2(pl.x - r.x, pl.z - r.z) : r.post.yaw;
      let dy = want - r.giver.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.giver.root.rotation.y += dy * Math.min(1, dt * 4);
      r.giver.animate(dt, 0);
      if (st.status === 'available' && dp < 14 && dp > 3.5 && Math.random() < dt * 0.08) r.bubble.say(['Excuse me!', 'Could you help me?', 'Hey, over here!', 'Hi! Got a minute?'][(Math.random() * 4) | 0], 2.5);
      r.bubble.update(dt, r.x, this.host.groundY(r.x, r.z) + 3.2, r.z, pl.space === 'exterior' && dp < 35);
    }
    const act = DEFS.find(d => this.state[d.id].status === 'active'); if (!act) return;
    if (act.id === 'tour') this.updateTour(dt, pl);
    if (clock && this.live.timeLeft !== undefined) {
      this.live.timeLeft -= dt;
      if (this.live.timeLeft <= 0) {
        this.fail(act, act.id === 'courier' ? 'Too slow — the office closed! Talk to Brother Jensen to try again.' : act.id === 'hoops' ? 'Time! Talk to Coach Dana to try again.' : 'The rest blew away! Talk to Priya to try again.');
        return;
      }
    }
    if (act.id === 'flyers' && this.live.targets) {
      for (const t of [...this.live.targets]) {
        t.mesh.rotation.y += dt * 1.5; t.mesh.rotation.z = Math.sin(this.time * 2 + t.x) * 0.5;
        t.mesh.position.y = this.host.groundY(t.x, t.z) + 1.1 + Math.sin(this.time * 2.2 + t.z) * 0.35;
        if (pl.space === 'exterior' && Math.hypot(pl.x - t.x, pl.z - t.z) < (pl.driving ? 3 : 2.2)) {
          t.mesh.removeFromParent(); this.host.removeInteractable(t.id);
          this.live.targets = this.live.targets.filter(o => o !== t); this.live.count = (this.live.count ?? 0) + 1; this.host.sound('pop');
        }
      }
      if ((this.live.count ?? 0) >= (this.live.goal ?? 6)) {
        const left = this.live.timeLeft ?? 0; this.abortLive();
        this.state.flyers.status = 'ready'; this.state.flyers.data = { bonus: Math.round(Math.min(20, left / 4)) };
        this.host.toast('Got them all! Bring the flyers back to Priya.', 4000); this.host.sound('success'); this.host.save();
      }
    }
  }
  private updateTour(dt: number, pl: { x: number; z: number; yaw: number; space: string; driving: boolean }) {
    const d = DEFS.find(x => x.id === 'tour')!, r = this.rt.get('tour')!, st = this.state.tour;
    // follow a couple of metres behind the player (outdoors), catching up when left behind
    if (pl.space === 'exterior') {
      const tx = pl.x - Math.sin(pl.yaw) * 2.2, tz = pl.z - Math.cos(pl.yaw) * 2.2;
      const dx = tx - r.x, dz = tz - r.z, dist = Math.hypot(dx, dz);
      if (dist > 30) { r.x = tx; r.z = tz; }
      else if (dist > 0.6) {
        const sp = Math.min(dist * 2.2, 8), nx = r.x + dx / dist * sp * dt, nz = r.z + dz / dist * sp * dt;
        if (!this.host.blocked(nx, nz, 0.3)) { r.x = nx; r.z = nz; } else if (dist > 6) { r.x = tx; r.z = tz; }
        r.giver.root.rotation.y = Math.atan2(dx, dz); r.giver.animate(dt, sp);
      } else { r.giver.animate(dt, 0); r.giver.root.rotation.y = Math.atan2(pl.x - r.x, pl.z - r.z); }
      r.giver.root.position.set(r.x, this.host.groundY(r.x, r.z), r.z);
    }
    r.bubble.update(dt, r.x, this.host.groundY(r.x, r.z) + 3.2, r.z, pl.space === 'exterior');
    const stops = this.live.targets ?? [], i = this.live.stop ?? 0, s = stops[i];
    if (!s) return;
    if (pl.space === 'exterior' && Math.hypot(pl.x - s.x, pl.z - s.z) < 11 && Math.hypot(r.x - s.x, r.z - s.z) < 14) {
      const lines: Record<string, string> = {
        mckay: 'The library! I’m going to live here during finals.',
        manwaring: 'The student center — so this is where the snacks are!',
        hart: 'The gym! I’m signing up for intramurals right now.',
      };
      r.bubble.say(lines[s.id] ?? 'Cool!', 4); this.host.sound('chime');
      this.live.stop = i + 1; st.data.stop = i + 1; this.host.save();
      if (this.live.stop >= stops.length) {
        this.host.toast('Tour complete! Tyler knows his way around now.', 4000);
        this.finish(d, d.reward);
      } else this.host.toast(`Next stop: the ${this.name(stops[this.live.stop].id)}`, 3500);
    }
  }

  /** Hide speech bubbles (story cutscenes, the finale). */
  hideBubbles() { for (const r of this.rt.values()) { r.bubble.left = 0; r.bubble.sprite.visible = false; } }

  /** HUD line for the side quest in progress (null = none). */
  tracker(): string | null {
    const d = this.active(); if (!d) return null;
    const st = this.state[d.id], t = this.live.timeLeft !== undefined ? ` · ⏱ ${fmt(this.live.timeLeft)}` : '';
    if (st.status === 'ready') return `${d.title}: return to ${d.giver.name}`;
    switch (d.id) {
      case 'lost-id': return `${d.title}: search near the ${this.name(String(st.data.at))}`;
      case 'tour': { const s = this.live.targets?.[this.live.stop ?? 0]; return s ? `${d.title}: show Tyler the ${this.name(s.id)} (${(this.live.stop ?? 0) + 1}/${this.live.targets!.length})` : d.title; }
      case 'courier': return `${d.title}: deliver to the ${this.name(String(st.data.to))}${t}`;
      case 'hoops': return `${d.title}: baskets ${this.live.count ?? 0}/${this.live.goal ?? 3}${t}`;
      case 'flyers': return `${d.title}: flyers ${this.live.count ?? 0}/${this.live.goal ?? 6}${t}`;
    }
    return d.title;
  }

  /** Journal rows for the pause menu. */
  journal(): { title: string; text: string; status: SideStatus }[] {
    return DEFS.filter(d => this.rt.has(d.id)).map(d => {
      const st = this.state[d.id], where = d.id === 'hoops' ? 'the outdoor basketball court' : `the ${this.name(d.giver.building)}`;
      const text = st.status === 'done' ? `Done · +${st.earned} coins` : st.status === 'available' ? `${d.giver.name} is waiting by ${where}` : (this.tracker() ?? d.summary);
      return { title: d.title, text, status: st.status };
    });
  }
}
