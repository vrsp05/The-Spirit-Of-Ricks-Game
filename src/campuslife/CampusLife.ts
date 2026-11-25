// Campus life: everything that makes just walking around fun.
//   • the campus clock: day and night, lamp posts at night, stars; class changes, Tuesday devotional, quiet nights
//   • weather: Rexburg wind gusts that push you, passing rain showers (umbrellas!) or snow squalls
//   • happenings (events.ts): hats in the wind, dropped books, frisbee, pop-up choir, snowball fights
//   • collectibles in every era, shown on a shelf in your apartment
//   • a street musician (tip them for a song) and a "Play Me" piano you can play with the keyboard
//   • camera mode with photo challenges and an album (photo.ts)
//   • friendships: talk to the same students to become friends; friends give gifts and hang out with you
//   • achievements and campus-life coins
import * as THREE from 'three';
import { Avatar } from '../player/Avatar';
import { Bubble, eraLook, type Walker } from '../world/Npcs';
import { chatFor } from '../world/npcChatter';
import { ERAS } from '../world/eras';
import { BUILDINGS } from '../world/buildingRegistry';
import { buildingName } from '../sidequests/trivia';
import { solid } from '../interiors/decor';
import { textCanvas } from '../world/World';
import { esc } from '../ui/ui';
import { CampusClock, ERA_START_HOUR, type Phase } from './clock';
import { ACHIEVEMENTS, FRIEND_LEVELS, friendLevel, Progress, type LifeSave } from './progress';
import { COLLECTIBLES, itemModel, type Collectible } from './collectibles';
import { CampusEvents } from './events';
import { PhotoMode } from './photo';
import { freq, PIANO_KEYS, PIANO_SONGS, RainSound, TunePlayer, TUNES, Voice } from './sound';
import type { LifeHost, Side } from './host';
import { VehicleJobs, type JobHost } from './vehicleJobs';
import { Apartment, Celebrations, Classes, StadiumRace } from './studentLife';

const SIDE_NAME: Record<Side, string> = { n: 'north', s: 'south', e: 'east', w: 'west' };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOne = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
/** Little things friends tell you when you become close (true, general campus history). */
const FACTS = [
  'The school started in 1888 as a small academy in Rexburg — just a few rooms and a lot of hope.',
  'The athletic teams here were the Vikings for decades. People still talk about those games.',
  'The Kimball Building’s tower is one of the best landmarks for finding your way around.',
  'Rexburg gets serious wind and serious snow. Locals say you haven’t lived here until you’ve lost a hat.',
  'The David O. McKay Library is named after a Church president who loved education.',
];

export class CampusLife {
  readonly clock = new CampusClock(ERA_START_HOUR.ricks1999);
  readonly progress = new Progress();
  readonly events: CampusEvents;
  readonly photo: PhotoMode;
  jobs!: VehicleJobs;
  readonly classes: Classes;
  readonly race: StadiumRace;
  celebrations: Celebrations | null = null;
  apartment: Apartment | null = null;
  raceCoach: { x: number; z: number } | null = null;
  private rain = new RainSound();
  private phase: Phase | null = null;
  private seenClassChange = false;
  // weather
  private gustT = rand(30, 60); private gust = 0; private gustDir = 0;
  private showerT = rand(240, 420); private showerLeft = 0; private rainOutside = 0;
  // fixed places
  private busker: { a: Avatar; x: number; z: number; yaw: number; voice: Voice; player: TunePlayer; bubble: Bubble } | null = null;
  private piano: { x: number; z: number; yaw: number; seat: { x: number; z: number } } | null = null;
  private pianoVoice = new Voice();
  private obstacles: { x: number; z: number; r: number }[] = [];
  // collectibles
  private placed = new Map<string, { obj: THREE.Object3D; c: Collectible }>();
  private shelfSlots = new Map<string, THREE.Object3D>();
  private shelf: THREE.Group | null = null;
  private twinkleT = 0;
  // friendships
  private talkCool = new Map<string, number>();
  private hangout: { w: Walker; left: number; say: number } | null = null;
  private lastPos: { x: number; z: number } | null = null;

  constructor(private h: LifeHost) {
    this.events = new CampusEvents(h, this.progress);
    this.classes = new Classes(h, this.progress, this.clock);
    this.race = new StadiumRace(h, this.progress);
    this.photo = new PhotoMode(h, this.progress);
    this.photo.musicSpots = () => [...(this.busker ? [this.busker] : []), ...(this.piano ? [this.piano] : [])];
    this.progress.collectibleTotal = COLLECTIBLES.length;
    this.progress.onUnlock = a => { this.h.sound('success'); this.h.toast(`🏆 Achievement unlocked: ${a.icon} ${a.title}`, 4500); };
  }

  // ---------------------------------------------------------------- setup
  setup(jobHost?: JobHost) {
    if (jobHost) { this.jobs = new VehicleJobs(this.h, jobHost, this.progress); this.jobs.setup(); }
    this.setupBusker();
    this.setupPiano();
    this.setEra();
  }
  /** Era changed (or loaded): re-dress the musician, place this era's collectibles. */
  setEra() {
    const era = this.h.era();
    this.jobs?.setEra();
    if (this.busker) this.busker.a.rebuild({ ...eraLook(era, 4040, this.h.season()), hat: 'beanie', hatColor: '#3a4a6a', backpack: undefined });
    for (const [id, p] of this.placed) { this.h.removeInteractable(`life:item-${id}`); p.obj.removeFromParent(); }
    this.placed.clear();
    for (const c of COLLECTIBLES) {
      if (c.era !== era || this.progress.collected.has(c.id) || !this.h.world.buildingStanding(c.building)) continue;
      const s = this.h.spotBy(c.building, c.side, c.out ?? 7); if (!s) continue;
      const holder = new THREE.Group(), m = itemModel(c); m.position.y = 0.55; holder.add(m);
      holder.add(this.sparkle()); holder.position.set(s.x, this.h.world.groundY(s.x, s.z), s.z);
      this.h.addInteractable({ id: `life:item-${c.id}`, at: { x: s.x, z: s.z }, radius: 1.9, prompt: `Pick up: ${c.name}`, onInteract: () => this.collect(c) });
      this.h.scene.add(holder); this.placed.set(c.id, { obj: holder, c });
    }
  }
  private sparkle(): THREE.Sprite {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,230,140,0.8)'); grd.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,240,0.9)'; g.fillRect(30, 2, 4, 60); g.fillRect(2, 30, 60, 4);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.y = 1.0; s.scale.setScalar(0.9); s.userData.twinkle = true; return s;
  }
  private collect(c: Collectible) {
    if (this.progress.collected.has(c.id)) return;
    const p = this.placed.get(c.id); p?.obj.removeFromParent(); this.placed.delete(c.id); this.h.removeInteractable(`life:item-${c.id}`);
    this.progress.collected.add(c.id); this.progress.earn(5); this.refreshShelf();
    const era = this.h.era(), inEra = COLLECTIBLES.filter(x => x.era === era), got = inEra.filter(x => this.progress.collected.has(x.id)).length;
    this.h.sound('chime');
    void this.h.choose(`Found: ${c.name}`, `${c.text}\n\nIt’s going on the shelf in your apartment. (+5 coins)\n${got}/${inEra.length} found in this era · ${this.progress.collected.size}/${COLLECTIBLES.length} in all`, [{ id: 'ok', label: 'Nice!' }]);
    this.h.save();
  }

  /** The display shelf in the apartment (room-local; `g` is the apartment's group). */
  setupShelf(g: THREE.Group, homeId: string) {
    if (this.shelf) return;
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4a30', roughness: 0.7 }), glass = new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.18, roughness: 0.05 });
    const shelf = new THREE.Group(); this.shelf = shelf;
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; shelf.add(b); return b; };
    box(0.55, 2.3, 0.06, wood, -6.68, 1.15, 2.95); box(0.55, 2.3, 0.06, wood, -6.68, 1.15, 5.85); box(0.06, 2.3, 2.9, wood, -6.93, 1.15, 4.4); box(0.55, 0.08, 2.9, wood, -6.68, 2.3, 4.4);
    for (let k = 0; k < 4; k++) box(0.5, 0.04, 2.84, wood, -6.68, 0.12 + k * 0.52, 4.4);
    box(0.02, 2.2, 2.84, glass, -6.42, 1.15, 4.4);
    const tex = new THREE.CanvasTexture(textCanvas(['MY CAMPUS COLLECTION'], { w: 512, h: 96, bg: '#3a2a1c', fg: '#f6e7c4' })); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), new THREE.MeshBasicMaterial({ map: tex })); sign.position.set(-6.38, 2.55, 4.4); sign.rotation.y = Math.PI / 2; shelf.add(sign);
    g.add(shelf); solid(g, { x0: -6.95, z0: 2.9, x1: -6.35, z1: 5.9 });
    this.h.addInteractable({ id: 'life:shelf', at: { x: -5.8, z: 4.4, space: homeId }, radius: 1.6, prompt: 'Look at your collection', onInteract: () => this.showCollection() });
    this.refreshShelf();
  }
  private refreshShelf() {
    if (!this.shelf) return;
    const eras = ['ricks1999', 'transition', 'byui', 'presentFinale'];
    COLLECTIBLES.forEach(c => {
      if (!this.progress.collected.has(c.id) || this.shelfSlots.has(c.id)) return;
      const row = eras.indexOf(c.era), col = COLLECTIBLES.filter(x => x.era === c.era).indexOf(c);
      const m = itemModel(c); m.scale.setScalar(0.62); m.rotation.y = Math.PI / 2; m.position.set(-6.66, 0.14 + row * 0.52 + 0.19, 3.3 + col * 0.44);
      this.shelf!.add(m); this.shelfSlots.set(c.id, m);
    });
  }
  showCollection() {
    const eras = [['ricks1999', 'Fall 1999'], ['transition', 'Spring 2001'], ['byui', '2011'], ['presentFinale', 'Present day']] as const;
    const html = eras.map(([id, label]) => `<h3>${label}</h3><ul class="collection">${COLLECTIBLES.filter(c => c.era === id).map(c => this.progress.collected.has(c.id)
      ? `<li class="got"><b>${esc(c.name)}</b> — ${esc(c.text)}</li>` : `<li>❔ <i>Not found yet${id === this.h.era() ? ` — look around the ${esc(this.bName(c.building))}` : ''}</i></li>`).join('')}</ul>`).join('');
    const s = this.h.ui.menu(`Collection (${this.progress.collected.size}/${COLLECTIBLES.length})`, [{ label: 'Close', action: () => this.h.ui.pop(s) }],
      { subtitle: 'Keepsakes from every era. Look for something sparkling next to the buildings.', html, onBack: () => this.h.ui.pop(s), className: 'life-list' });
  }
  private bName(id: string) { const b = BUILDINGS.find(x => x.id === id); return (b && buildingName(b, ERAS[this.h.era()].year)) ?? id; }
  /** A student's tip about an uncollected item in this era (or null). */
  collectibleHint(): string | null {
    const pl = this.h.player(); const left = [...this.placed.values()].map(p => p.c);
    if (!left.length) return null;
    const c = left.sort((a, b) => { const pa = this.placed.get(a.id)!.obj.position, pb = this.placed.get(b.id)!.obj.position; return Math.hypot(pa.x - pl.x, pa.z - pl.z) - Math.hypot(pb.x - pl.x, pb.z - pl.z); })[0];
    return pickOne([`I saw something sparkly on the ${SIDE_NAME[c.side]} side of the ${this.bName(c.building)}. Maybe it’s yours?`,
      `Someone left a ${c.name.toLowerCase()} by the ${this.bName(c.building)} — ${SIDE_NAME[c.side]} side, I think.`]);
  }

  // ---------------------------------------------------------------- street musician + piano
  private setupBusker() {
    const s = this.h.spotBy('manwaring', 'n', 6) ?? this.h.spotBy('mckay', 'e', 6); if (!s) return;
    const a = new Avatar({ ...eraLook(this.h.era(), 4040), hat: 'beanie', hatColor: '#3a4a6a' });
    const guitar = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#b0753e', roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.12), wood); guitar.add(body);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: '#2a1a10' })); hole.position.z = 0.062; guitar.add(hole);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: '#4a3020' })); neck.position.set(0, 0.52, 0); guitar.add(neck);
    guitar.position.set(-0.05, 0.25, 0.3); guitar.rotation.z = -1.1; a.setProp(guitar);
    a.root.position.set(s.x, this.h.world.groundY(s.x, s.z), s.z); a.root.rotation.y = s.yaw;
    // open guitar case for tips
    const cs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: '#2a2a2a' })); cs.position.set(Math.sin(s.yaw) * 1.1 + Math.cos(s.yaw) * 0.6, 0.06, Math.cos(s.yaw) * 1.1 - Math.sin(s.yaw) * 0.6);
    const felt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: '#7a2b2b' })); felt.position.y = 0.07; cs.add(felt);
    const grp = new THREE.Group(); grp.position.set(s.x, this.h.world.groundY(s.x, s.z), s.z); grp.add(cs);
    this.h.scene.add(a.root, grp);
    const voice = new Voice();
    this.busker = { a, x: s.x, z: s.z, yaw: s.yaw, voice, player: new TunePlayer(voice, TUNES[0], 'guitar'), bubble: new Bubble(this.h.scene) };
    this.obstacles.push({ x: s.x, z: s.z, r: 0.5 });
    this.h.addInteractable({ id: 'life:busker', at: { x: s.x + Math.sin(s.yaw) * 1.6, z: s.z + Math.cos(s.yaw) * 1.6 }, radius: 2.4, prompt: 'Talk to the street musician', onInteract: () => this.talkBusker() });
  }
  private async talkBusker() {
    const b = this.busker; if (!b) return;
    const who = { speaker: 'Sam · Street musician', text: `Hey${this.h.playerName() ? `, ${this.h.playerName()}` : ''}! This one’s called “${b.player.tune.name}”. Got a request? Tips keep the music going.` };
    await this.h.talk(b.a.root, [who]);
    const id = await this.h.choose('Street musician', `You have ${this.h.wallet()} coins.`, [
      ...TUNES.map((t, i) => ({ id: String(i), label: `🎵 Request “${t.name}” (tip 5 coins)` })),
      { id: 'no', label: 'Just listening 👍' },
    ]);
    if (id === null || id === 'no') return;
    if (!this.progress.spend(5, this.h.wallet())) { this.h.toast('Not enough coins for a tip.'); this.h.sound('error'); return; }
    b.player.setTune(TUNES[Number(id)]); this.progress.add('tips'); this.h.sound('coin');
    this.h.npcs.gather(b.x + Math.sin(b.yaw) * 2, b.z + Math.cos(b.yaw) * 2, 20);
    this.h.toast(`🎸 “${TUNES[Number(id)].name}” — a little crowd gathers to listen.`, 3500); this.h.save();
  }
  private setupPiano() {
    const s = this.h.spotBy('snow', 'w', 6) ?? this.h.spotBy('smith', 's', 6); if (!s) return;
    const g = new THREE.Group(), m = (c: string, e: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...e });
    const box = (w: number, h: number, d: number, mt: THREE.Material, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    const paint = m('#2f8f8a');                                                  // a painted street piano
    box(1.5, 1.3, 0.55, paint, 0, 0.75, 0); box(1.5, 0.1, 0.75, paint, 0, 0.75, 0.3); box(1.5, 0.06, 0.62, paint, 0, 1.43, 0.0);
    box(1.36, 0.04, 0.2, m('#f4f1e8'), 0, 0.82, 0.48);
    for (let i = 0; i < 9; i++) if (![2, 6].includes(i)) box(0.07, 0.04, 0.12, m('#1c1c1c'), -0.6 + i * 0.15 + 0.075, 0.85, 0.44);
    for (const x of [-0.65, 0.65]) box(0.1, 0.7, 0.1, paint, x, 0.35, 0.55);
    const tex = new THREE.CanvasTexture(textCanvas(['PLAY ME!', 'Free for everyone'], { w: 512, h: 200, bg: '#ffd23d', fg: '#2a211b' })); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), new THREE.MeshBasicMaterial({ map: tex })); sign.position.set(0, 1.1, 0.281); g.add(sign);
    for (const [x, c] of [[-0.45, '#e05a5a'], [0.4, '#5ab0ff'], [0.05, '#7be07b']] as const) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), m(c)); d.position.set(x, 0.55, 0.281); g.add(d); }
    box(0.9, 0.08, 0.35, m('#6b4a30'), 0, 0.5, 1.05); for (const x of [-0.38, 0.38]) box(0.06, 0.48, 0.3, m('#4a3020'), x, 0.24, 1.05);   // bench
    g.position.set(s.x, this.h.world.groundY(s.x, s.z), s.z); g.rotation.y = s.yaw; this.h.scene.add(g);
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    this.piano = { x: s.x, z: s.z, yaw: s.yaw, seat: { x: s.x + fx * 1.05, z: s.z + fz * 1.05 } };
    this.obstacles.push({ x: s.x, z: s.z, r: 0.75 }, { x: s.x + Math.cos(s.yaw) * 0.5, z: s.z - Math.sin(s.yaw) * 0.5, r: 0.5 }, { x: s.x - Math.cos(s.yaw) * 0.5, z: s.z + Math.sin(s.yaw) * 0.5, r: 0.5 });
    this.h.addInteractable({ id: 'life:piano', at: { x: s.x + fx * 1.9, z: s.z + fz * 1.9 }, radius: 2.2, prompt: 'Play the piano', onInteract: () => this.playPiano() });
  }
  /** Piano screen: keyboard keys (A–K, W E T Y U) or click; a song guide lights the next key. */
  private playPiano() {
    const P = this.piano; if (!P) return;
    this.h.seat(P.seat.x, P.seat.z, P.yaw + Math.PI);
    const el = document.createElement('div'); el.className = 'screen piano-screen';
    const whites = PIANO_KEYS.filter(k => !k.black);
    el.innerHTML = `<div class="panel wide"><h2>🎹 Play Me!</h2><p class="sub">Keys <kbd>A S D F G H J K</kbd> (white) and <kbd>W E T Y U</kbd> (black), or click. Controller: ◀ ▶ pick a key, Ⓐ play. <kbd>Esc</kbd> to stand up.</p>
      <div class="songs">${PIANO_SONGS.map((s, i) => `<button data-song="${i}">${esc(s.name)}</button>`).join('')}<button data-song="-1">Free play</button></div>
      <div class="guide"></div><div class="keys">${whites.map(k => `<div class="wk" data-note="${k.note}"><span>${k.key}</span></div>`).join('')}
      ${PIANO_KEYS.filter(k => k.black).map(k => { const i = PIANO_KEYS.indexOf(k), left = whites.indexOf(PIANO_KEYS[i - 1]); return `<div class="bk" data-note="${k.note}" style="left:${(left + 1) * (100 / whites.length) - 3.2}%"><span>${k.key}</span></div>`; }).join('')}</div></div>`;
    let song = -1, idx = 0, cursor = 0, lastKey = 0;
    const guide = el.querySelector('.guide') as HTMLElement;
    const paint = () => {
      el.querySelectorAll('[data-note]').forEach(k => k.classList.toggle('next', song >= 0 && k.getAttribute('data-note') === PIANO_SONGS[song].notes[idx]));
      el.querySelectorAll('.wk').forEach((k, i) => k.classList.toggle('cursor', i === cursor));
      guide.textContent = song < 0 ? 'Free play — make some music!' : `${PIANO_SONGS[song].name}: ${idx}/${PIANO_SONGS[song].notes.length} — play the glowing key`;
    };
    const play = (note: string) => {
      this.pianoVoice.level = 1.2; this.pianoVoice.piano(freq(note));
      const k = el.querySelector(`[data-note="${note}"]`); k?.classList.add('down'); setTimeout(() => k?.classList.remove('down'), 160);
      if (song >= 0 && note === PIANO_SONGS[song].notes[idx]) {
        idx++;
        if (idx >= PIANO_SONGS[song].notes.length) {
          const first = !this.progress.stat(`song${song}`); this.progress.add(`song${song}`); this.progress.add('songs');
          if (first) this.progress.earn(10);
          this.h.sound('cheer'); this.h.toast(`🎹 You played “${PIANO_SONGS[song].name}”!${first ? ' +10 coins' : ''} People stop to listen.`, 4000);
          this.h.npcs.gather(P.x + Math.sin(P.yaw) * 4, P.z + Math.cos(P.yaw) * 4, 15);
          song = -1; idx = 0; this.h.save();
        }
      }
      paint();
    };
    el.querySelectorAll<HTMLElement>('[data-note]').forEach(k => k.addEventListener('pointerdown', e => { e.stopPropagation(); play(k.dataset.note!); }));
    el.querySelectorAll<HTMLElement>('[data-song]').forEach(b => b.addEventListener('click', () => { song = Number(b.dataset.song); idx = 0; paint(); }));
    const onKey = (e: KeyboardEvent) => { if (e.repeat) return; const k = PIANO_KEYS.find(p => p.code === e.code); if (k) { lastKey = performance.now(); play(k.note); } };
    window.addEventListener('keydown', onKey, true);
    const close = () => { this.h.ui.pop(s); };
    const s = this.h.ui.push(el, {
      noNav: true, onBack: close,
      onConfirmEmpty: () => { if (performance.now() - lastKey > 120) play(whites[cursor].note); },
      tick: a => { if (performance.now() - lastKey < 250) return; if (a.pressed('navLeft')) { cursor = (cursor + whites.length - 1) % whites.length; paint(); } if (a.pressed('navRight')) { cursor = (cursor + 1) % whites.length; paint(); } },
      cleanup: () => { window.removeEventListener('keydown', onKey, true); this.h.stand(); },
    });
    paint();
  }
  /** Busker and piano are solid. */
  hit(x: number, z: number, r: number) { return this.obstacles.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2); }

  // ---------------------------------------------------------------- friendships
  /** You finished talking with a student. Returns a level-up line to say, if any. */
  talked(w: Walker): { level: string; gift: string; coins: number } | null {
    const now = performance.now() / 1000, last = this.talkCool.get(w.name) ?? -1e9;
    if (now - last < 45) return null; this.talkCool.set(w.name, now);
    const before = friendLevel(this.progress.friends[w.name] ?? 0);
    this.progress.friends[w.name] = (this.progress.friends[w.name] ?? 0) + 1;
    const after = friendLevel(this.progress.friends[w.name]);
    this.progress.check();
    if (after <= before || after < 1) return null;
    const name = this.h.playerName() || 'friend';
    const gift = after === 1 ? { gift: `We should hang out sometime, ${name}! Oh — here, I found these coins by the vending machine. Take them!`, coins: 10 }
      : after === 2 ? { gift: `You know what? Here’s something cool I learned: ${pickOne(FACTS)}`, coins: 20 }
      : { gift: `${name}, you’re my best friend on campus. Seriously. Here — for all the good talks.`, coins: 40 };
    this.progress.earn(gift.coins); this.h.save();
    return { level: FRIEND_LEVELS[after].name, ...gift };
  }
  friendLevelOf(name: string) { return friendLevel(this.progress.friends[name] ?? 0); }
  /** A friend walks around campus with you for a while, chatting. */
  hangOut(w: Walker) {
    this.endHangout();
    const h = { w, left: 90, say: 3 }; this.hangout = h;
    this.h.npcs.claim(w, dt => {
      if (this.hangout !== h) return false;
      const p = this.h.player(), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const tx = p.x - fx * 1.4 + fz * 1.1, tz = p.z - fz * 1.4 - fx * 1.1, d = Math.hypot(tx - w.x, tz - w.z);
      if (d > 30) { w.x = tx - fx * 3; w.z = tz - fz * 3; }
      if (d > 0.6) { const sp = Math.min(9, Math.max(2.2, p.speed + d * 0.8)), st = Math.min(d, sp * dt), nx = w.x + (tx - w.x) / d * st, nz = w.z + (tz - w.z) / d * st;
        if (!this.h.world.blocked(nx, nz, 0.3)) { w.x = nx; w.z = nz; } else { w.x += (tx - w.x) / d * st; w.z += (tz - w.z) / d * st; }
        const dy = Math.atan2(tx - w.x, tz - w.z) - w.yaw; w.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, dt * 7); w.avatar.animate(dt, sp); }
      else { const dy = p.yaw - w.yaw; w.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * Math.min(1, dt * 4); w.avatar.animate(dt, 0); }
      return true;
    });
    this.h.toast(`🤝 ${w.name} is hanging out with you for a bit.`, 3000);
  }
  private endHangout() { if (!this.hangout) return; const w = this.hangout.w; this.hangout = null; this.h.npcs.speak(w, pickOne(['That was fun! See you around!', 'I’ve got class — bye!', 'Text me later!']), 3); }
  get hangingWith() { return this.hangout?.w ?? null; }

  // ---------------------------------------------------------------- rides, misc stats
  ollie(air: number) {
    if (air < 0.3) return;
    this.progress.add('ollies'); this.h.sound('tick');
    const n = this.progress.stat('ollies'); if (n <= 3 || n % 5 === 0) this.h.toast(air > 0.55 ? `Big ollie! 🛹 (${n})` : `Ollie! 🛹 (${n})`, 1200);
  }
  visited(space: string) { this.classes.entered(space); if (space === 'exterior' || space === 'home') return; this.progress.visited.add(space); this.progress.check(); }
  coinsNet() { return this.progress.coins - this.progress.spent; }

  // ---------------------------------------------------------------- frame
  update(dt: number, active: boolean) {
    const pl = this.h.player(), outside = pl.space === 'exterior';
    this.clock.tick(active ? dt : 0);
    // schedule → crowd
    const ph = this.clock.phase(), npcs = this.h.npcs;
    npcs.busyness = this.clock.busyness(); npcs.rush = ph === 'classChange';
    const centre = this.h.era() === 'byui' || this.h.era() === 'presentFinale' ? (this.h.world.buildingStanding('icenter') ? 'icenter' : 'hart') : 'hart';
    npcs.focus = ph === 'devotional' && this.clock.hour < 11.05 ? this.h.doorOf(centre) : null;
    if (ph !== this.phase && active) {
      const prev = this.phase; this.phase = ph;
      if (prev && outside) {
        if (ph === 'classChange' && !this.seenClassChange) { this.seenClassChange = true; this.h.toast('🔔 Class change! The paths fill up for ten minutes.', 3500); }
        else if (ph === 'devotional') this.h.toast(`⛪ It’s Tuesday — everyone is heading to devotional at the ${this.bName(centre)}.`, 4000);
        else if (ph === 'night') this.h.toast('🌙 Night falls. The lamps come on and campus gets quiet.', 3500);
        else if (ph === 'dawn') this.h.toast('🌅 Good morning, Rexburg!', 3000);
      }
    }
    if (active && outside) {
      const hr = this.clock.hour;
      if (hr < 4 && !this.progress.stat('nightOwl')) this.progress.add('nightOwl');
      if (hr > 5.8 && hr < 7.2 && !this.progress.stat('earlyBird')) this.progress.add('earlyBird');
      if (ph === 'devotional' && !this.progress.stat('devotional')) this.progress.add('devotional');
    }
    this.updateWeather(dt, active, outside);
    // music: the busker plays when you're nearby
    const b = this.busker;
    if (b) {
      const d = Math.hypot(pl.x - b.x, pl.z - b.z), on = outside && d < 32 && active;
      b.voice.level = on ? Math.max(0, 1 - d / 32) ** 1.3 * 1.3 : 0;
      if (on) { b.player.update(dt); if (Math.random() < dt * 0.15) b.bubble.say(pickOne(['♪ ♫ ♪', '♫ La la la ♫', `♪ “${b.player.tune.name}” ♪`]), 2); }
      b.a.animate(dt, 0); b.a.strum(performance.now() / 1000);
      b.a.root.visible = outside;
      b.bubble.update(dt, b.x, this.h.world.groundY(b.x, b.z) + 2.75, b.z, outside && d < 38);
    }
    // collectibles bob and twinkle
    this.twinkleT += dt;
    for (const { obj } of this.placed.values()) {
      obj.visible = outside; if (!outside) continue;
      const m = obj.children[0]; m.rotation.y += dt * 1.4; m.position.y = 0.55 + Math.sin(this.twinkleT * 2 + obj.position.x) * 0.08;
      const sp = obj.children[1] as THREE.Sprite; sp.material.opacity = 0.55 + Math.sin(this.twinkleT * 5 + obj.position.z) * 0.45;
    }
    // hanging out with a friend: small talk now and then
    const hg = this.hangout;
    if (hg) {
      hg.left -= active ? dt : 0; hg.say -= dt;
      if (hg.say <= 0 && outside) { hg.say = rand(8, 14); npcs.speak(hg.w, pickOne([...chatFor(this.h.era()).lines.slice(0, 1), this.collectibleHint() ?? 'This is nice. I love this campus.', 'Where to next?']), 3.5); }
      if (hg.left <= 0) this.endHangout();
    }
    // rides
    if (outside && (pl.driving === 'board' || pl.driving === 'sled') && this.lastPos) {
      const d = Math.hypot(pl.x - this.lastPos.x, pl.z - this.lastPos.z);
      if (d < 5) { this.progress.add('boardMeters', d); if (pl.driving === 'sled') this.progress.add('sledMeters', d); }
    }
    this.lastPos = { x: pl.x, z: pl.z };
    this.jobs?.update(dt, active);
    if (active) { this.classes.update(); this.race.update(dt); }
    this.celebrations?.update(dt, this.clock.hour, this.h.world.daylight, outside);
    if (!this.photo.active && !this.jobs?.active && !this.race.active) this.events.update(active ? dt : 0);
  }
  private updateWeather(dt: number, active: boolean, outside: boolean) {
    const W = this.h.world, season = this.h.season();
    if (!active) { this.rain.update(0); return; }
    // Rexburg gusts: a few seconds of strong wind that pushes you (and the leaves / snow)
    this.gustT -= dt;
    if (this.gustT <= 0 && !this.events.active) {
      this.gustT = rand(45, 110); this.gust = 4.5; this.gustDir = rand(0, Math.PI * 2);
      if (outside) { this.h.sound('whoosh'); if (Math.random() < 0.4) this.h.toast(pickOne(['💨 Whoa — a Rexburg gust!', '💨 Hold onto your hat!', '💨 That wind!']), 2200); }
    }
    if (this.gust > 0) {
      this.gust -= dt; const k = Math.sin(Math.max(0, this.gust) / 4.5 * Math.PI) * 7;
      W.gust.set(Math.sin(this.gustDir) * k, Math.cos(this.gustDir) * k);
      const pl = this.h.player();
      if (outside && !pl.driving && !pl.seated) this.h.nudgePlayer(Math.sin(this.gustDir) * k * 0.12 * dt, Math.cos(this.gustDir) * k * 0.12 * dt);
      if (this.gust <= 0) W.gust.set(0, 0);
    }
    // passing showers (rain; a snow squall in winter)
    if (this.showerLeft > 0) {
      this.showerLeft -= dt;
      if (this.showerLeft <= 0) { W.setShower(false); this.h.npcs.setRain(false); if (outside) this.h.toast(season === 'winter' ? '🌨️ The squall passes.' : '🌤️ The rain stops. Everything smells fresh.', 2500); this.showerT = rand(300, 600); }
    } else {
      this.showerT -= dt;
      if (this.showerT <= 0) {
        this.showerLeft = rand(90, 200); W.setShower(true); this.h.npcs.setRain(season !== 'winter');
        if (outside) this.h.toast(season === 'winter' ? '🌨️ A snow squall rolls in!' : '🌧️ A rain shower! Umbrellas go up all over campus.', 3000);
      }
    }
    const raining = W.raining;
    this.rain.update(raining ? (outside ? 1 : 0.25) : 0);
    if (raining && outside) { this.rainOutside += dt; if (this.rainOutside > 25 && !this.progress.stat('rain')) this.progress.add('rain'); } else this.rainOutside = 0;
  }
  /** A new era began (or a new game): the clock jumps to that era's designed time of day. */
  resetClockForEra() { this.clock.set(ERA_START_HOUR[this.h.era()], this.clock.day); this.phase = null; }

  // ---------------------------------------------------------------- menus
  achievementsHtml() {
    return `<ul class="achievements">${ACHIEVEMENTS.map(a => { const got = this.progress.achievements.has(a.id); return `<li class="${got ? 'got' : ''}"><span>${got ? a.icon : '🔒'}</span><b>${esc(a.title)}</b><br><small>${esc(a.text)}</small></li>`; }).join('')}</ul>`;
  }
  friendsHtml() {
    const rows = Object.entries(this.progress.friends).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<p class="sub">You haven’t met anyone yet. Walk up to a student and press E to say hi!</p>';
    return `<table class="friends">${rows.map(([n, t]) => { const l = friendLevel(t), next = FRIEND_LEVELS[l + 1];
      return `<tr><td><b>${esc(n)}</b></td><td>${'❤️'.repeat(l + 1)}${'🤍'.repeat(3 - l)}</td><td>${l >= 0 ? FRIEND_LEVELS[l].name : 'Met once'}</td><td><small>${next ? `${next.at - t} more chat${next.at - t === 1 ? '' : 's'} to ${next.name}` : 'Best friends!'}</small></td></tr>`; }).join('')}</table>
      <p class="sub">Chat with the same students to become friends (once every little while counts). Friends give gifts — and you can ask them to hang out.</p>`;
  }

  snapshot(): LifeSave { return this.progress.snapshot(this.clock.minutes); }
  load(d: LifeSave | undefined) {
    this.jobs?.end(false, 'Job cancelled.'); this.race.end(false, 'Race cancelled.');
    this.progress.load(d); this.endHangout(); this.events.abort();
    for (const m of this.shelfSlots.values()) m.removeFromParent(); this.shelfSlots.clear(); this.refreshShelf();
    if (d?.minutes !== undefined) this.clock.minutes = d.minutes; else this.resetClockForEra();
    this.phase = null; this.setEra();
    for (const w of this.h.npcs.walkers) w.met = (this.progress.friends[w.name] ?? 0) > 0;
  }
}
