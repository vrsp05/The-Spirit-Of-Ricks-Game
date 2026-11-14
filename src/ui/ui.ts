// DOM UI: a stack of focus-navigable screens driven by the action layer, plus HUD.
// Every screen works with keyboard, mouse and controllers (nav*/confirm/back).
import type { ActionState } from '../input/actions';
import type { ButtonName } from '../input/actions';
import type { CustomPanel, DialogueLine, PanelAction, PanelSpec } from '../quests/contract';
import type { RewardReceipt } from '../quests/rewards';
import { CAMPUS, allFootprints, buildingsForEra } from '../world/campusData';
import type { EraId } from '../world/eras';
import './styles.css';

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface Screen {
  el: HTMLElement;
  onBack?: () => void;
  onConfirmEmpty?: () => void;   // confirm with nothing focused (dialogue advance)
  onMap?: () => void;
  onPause?: () => void;
  blocksWorld: boolean;
  focusIndex: number;
  cleanup?: () => void;
  actionHandler?: (a: PanelAction) => boolean;
  /** Called every frame while this screen is on top (continuous stick input, e.g. map zoom). */
  tick?: (a: ActionState) => void;
  /** The left stick is used by the screen itself (e.g. panning the map), not for moving the focus. */
  noNav?: boolean;
  toolsMode?: boolean;
}
export interface MenuItem { label: string; action: () => void; disabled?: boolean; hint?: string }

export interface HudData {
  objective: string; era: string; prompt: string | null;
  buildingHint?: string | null;
  px: number; pz: number; pyaw: number; camYaw: number;
  map: HTMLCanvasElement | null; /** current era (the map's default view fits the buildings standing in it) */ eraId?: EraId; target: { x: number; z: number } | null; interior: string | null;
  markers: { x: number; z: number }[];   // every current objective point (minimap / map)
  /** Minimap centre (the building's entrance while indoors); defaults to px/pz. */
  mapX?: number; mapZ?: number;
  doors: { x: number; z: number; label: string }[]; // enterable entrances
  targetLabel: string | null;            // where the pointer leads ("Romney Building")
  coins: string;
  driving: boolean;
}

export class UI {
  readonly root: HTMLElement;
  private stack: Screen[] = [];
  private hud: HTMLElement;
  private objectiveEl: HTMLElement; private eraEl: HTMLElement; private promptEl: HTMLElement;
  private toastEl: HTMLElement; private mini: HTMLCanvasElement; private distEl: HTMLElement;
  private overlay: HTMLElement;
  private pointer: HTMLElement; private arrow: HTMLElement; private ptext: HTMLElement; private coinsEl: HTMLElement; private helpEl: HTMLElement;
  lastHud: HudData | null = null;
  /** Speaker of the line currently on screen (dialogue or cutscene subtitle), for mouth animation. */
  currentSpeaker: string | null = null;
  /** 0 = sepia … 1 = colour; keeps 2D maps consistent with the symbolic colour grade. */
  setMapColor(amount: number) { this.root.style.setProperty('--map-sepia', String(1 - amount)); }

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="hud hidden">
        <div class="hud-top"><div class="hud-era"></div><div class="hud-objective"></div></div>
        <div class="hud-pointer hidden"><span class="hud-arrow">▲</span><span class="hud-ptext"></span></div>
        <div class="hud-mini"><canvas width="180" height="180"></canvas><div class="hud-dist"></div>
          <div class="hud-c n">N</div><div class="hud-c e">E</div><div class="hud-c s">S</div><div class="hud-c w">W</div></div>
        <div class="hud-coins"></div>
        <button class="hud-btn hidden" tabindex="-1"></button>
        <div class="hud-banner hidden"></div>
        <div class="hud-reticle hidden">+</div>
        <div class="hud-prompt hidden"></div>
        <div class="hud-toasts"></div>
        <div class="hud-help">WASD move · Shift sprint · Space jump · drag mouse to orbit · wheel zoom · E interact · M map · Esc pause</div>
      </div>
      <div class="subtitle hidden"><div class="sub-speaker"></div><div class="sub-text"></div><div class="sub-hint"></div></div>
      <div class="screens"></div>
      <div class="fade"></div>`;
    this.hud = root.querySelector('.hud')!;
    this.objectiveEl = root.querySelector('.hud-objective')!;
    this.eraEl = root.querySelector('.hud-era')!;
    this.promptEl = root.querySelector('.hud-prompt')!;
    this.toastEl = root.querySelector('.hud-toasts')!;
    this.mini = root.querySelector('.hud-mini canvas')!;
    this.distEl = root.querySelector('.hud-dist')!;
    this.overlay = root.querySelector('.screens')!;
    this.pointer = root.querySelector('.hud-pointer')!; this.arrow = root.querySelector('.hud-arrow')!; this.ptext = root.querySelector('.hud-ptext')!;
    this.coinsEl = root.querySelector('.hud-coins')!; this.helpEl = root.querySelector('.hud-help')!;
    this.banner = root.querySelector('.hud-banner')!; this.reticle = root.querySelector('.hud-reticle')!;
    this.hudBtn = root.querySelector('.hud-btn')!; this.subEl = root.querySelector('.subtitle')!;
    this.hudBtn.addEventListener('click', () => this.hudBtnAction?.());
    // Scale the whole interface to the window so nothing ends up off-screen (laptops, zoomed browsers).
    const fit = () => {
      const z = Math.max(0.5, Math.min(1, window.innerWidth / 1280, window.innerHeight / 800));
      document.documentElement.style.setProperty('--ui-zoom', z.toFixed(3));
    };
    window.addEventListener('resize', () => { fit(); keepOnScreen(); }); fit();
    // Safety net that works in any browser: measure the corner HUD boxes and pull back any
    // that stick out of the window (independent of how the browser handles CSS scaling).
    const pinned = ['.hud-mini', '.hud-coins', '.hud-btn', '.hud-top', '.hud-help'];
    const keepOnScreen = () => {
      const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || Infinity, window.visualViewport?.width ?? Infinity);
      const vh = Math.min(window.innerHeight, document.documentElement.clientHeight || Infinity, window.visualViewport?.height ?? Infinity);
      for (const sel of pinned) {
        const el = root.querySelector<HTMLElement>(sel); if (!el || el.offsetParent === null) continue;
        el.style.marginLeft = el.style.marginTop = el.style.marginRight = el.style.marginBottom = '';
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        const k = r.width / (el.offsetWidth || r.width);                        // current scale factor
        const right = getComputedStyle(el).right !== 'auto' && getComputedStyle(el).left === 'auto';
        let dx = 0, dy = 0;
        if (r.right > vw - 6) dx = vw - 6 - r.right; if (r.left + dx < 6) dx = 6 - r.left;
        if (r.bottom > vh - 6) dy = vh - 6 - r.bottom; if (r.top + dy < 6) dy = 6 - r.top;
        // margins move the unscaled box; right-anchored boxes move with margin-right
        if (dx) { if (right) el.style.marginRight = `${-dx / k}px`; else el.style.marginLeft = `${dx / k}px`; }
        if (dy) el.style.marginTop = `${dy / k}px`;
      }
    };
    window.setInterval(keepOnScreen, 700); requestAnimationFrame(keepOnScreen);
  }
  private banner!: HTMLElement; private reticle!: HTMLElement; private hudBtn!: HTMLButtonElement; private subEl!: HTMLElement;
  private hudBtnAction: (() => void) | null = null;
  setBanner(text: string | null) { this.banner.classList.toggle('hidden', !text); if (text) this.banner.textContent = text; }
  setReticle(visible: boolean, active = false) { this.reticle.classList.toggle('hidden', !visible); this.reticle.classList.toggle('active', active); }
  setHudButton(label: string | null, action: (() => void) | null) { this.hudBtn.classList.toggle('hidden', !label); if (label) this.hudBtn.textContent = label; this.hudBtnAction = action; }
  /** Player name used for "{player}" in dialogue and for the "You" speaker. */
  playerName = '';
  /** Clean a line for display: no "(game character)" notes, {player} → the player's name. */
  cleanLine<T extends { speaker: string; text: string }>(l: T): T {
    const name = this.playerName || 'friend';
    const speaker = l.speaker.replace(/\s*\(game character\)/gi, '').replace(/^You$/, this.playerName || 'You');
    return { ...l, speaker, text: l.text.replace(/\{player\}/g, name) };
  }
  /** Called when a spoken line starts (or with null when the conversation/scene ends) — drives the voices. */
  onLine: ((line: { speaker: string; text: string } | null) => void) | null = null;
  private lastSub = '';
  subtitle(raw: { speaker: string; text: string } | null, hint: string) {
    this.currentSpeaker = raw?.speaker || null;            // raw name: drives the speaker's mouth
    const line = raw ? this.cleanLine(raw) : null;
    const key = line ? `${line.speaker}|${line.text}` : '';
    if (line && key !== this.lastSub) this.onLine?.(line);
    if (!line && !hint) this.onLine?.(null);          // scene finished / skipped
    this.lastSub = key;
    this.subEl.classList.toggle('hidden', !line && !hint);
    (this.subEl.querySelector('.sub-speaker') as HTMLElement).textContent = line?.speaker ?? '';
    (this.subEl.querySelector('.sub-text') as HTMLElement).textContent = line?.text ?? '';
    (this.subEl.querySelector('.sub-hint') as HTMLElement).textContent = hint;
  }

  get blocking() { return this.stack.some(s => s.blocksWorld); }
  get top() { return this.stack[this.stack.length - 1]; }
  showHud(v: boolean) { this.hud.classList.toggle('hidden', !v); }

  // ---------------- screen stack ----------------
  push(el: HTMLElement, opts: Partial<Omit<Screen, 'el' | 'focusIndex'>> = {}): Screen {
    const s: Screen = { el, blocksWorld: opts.blocksWorld ?? true, focusIndex: 0, ...opts };
    this.overlay.appendChild(el); this.stack.push(s);
    el.addEventListener('mousemove', e => {
      const t = (e.target as HTMLElement).closest('[data-focus]') as HTMLElement | null;
      if (t) { const i = this.focusables(s).indexOf(t); if (i >= 0) { s.focusIndex = i; this.paintFocus(s); } }
    });
    this.paintFocus(s);
    return s;
  }
  pop(s?: Screen) {
    const i = s ? this.stack.indexOf(s) : this.stack.length - 1; if (i < 0) return;
    const [r] = this.stack.splice(i, 1); r.cleanup?.(); r.el.remove();
    if (this.top) this.paintFocus(this.top);
  }
  clear() { while (this.stack.length) this.pop(); }
  private focusables(s: Screen) {
    const all = [...s.el.querySelectorAll<HTMLElement>('[data-focus]')].filter(e => !(e as HTMLButtonElement).disabled && e.offsetParent !== null);
    if (!s.actionHandler) return all;
    // minigames: the tools bar (.tools-zone) is reached with ④; otherwise focus stays in the game area
    const inTools = (e: HTMLElement) => !!e.closest('.tools-zone');
    const zone = all.filter(e => inTools(e) === !!s.toolsMode);
    return zone.length ? zone : all;
  }
  private paintFocus(s: Screen) {
    const f = this.focusables(s); if (!f.length) return;
    s.focusIndex = Math.max(0, Math.min(f.length - 1, s.focusIndex));
    f.forEach((e, i) => e.classList.toggle('focused', i === s.focusIndex));
    f[s.focusIndex].scrollIntoView?.({ block: 'nearest' });
  }

  /** Route actions to the top screen. Returns true if the UI consumed input. */
  update(a: ActionState): boolean {
    const s = this.top; if (!s) return false;
    s.tick?.(a);
    if (s.actionHandler) {
      // Minigames: 4 buttons + 2 sticks. ③ (map) = hint, ④ (pause / Tab) = tools bar, right stick = alt/alt2/rup/rdown.
      const backNow = a.pressed('back');
      const table: [PanelAction, ButtonName[]][] = [['up', ['navUp']], ['down', ['navDown']], ['left', ['navLeft']], ['right', ['navRight']],
        ['confirm', ['confirm']], ['back', ['back']], ['alt', ['alt', 'rRight']], ['alt2', ['alt2', 'rLeft']], ['rup', ['rUp']], ['rdown', ['rDown']],
        ['hint', ['hint', 'map']], ['tools', backNow ? ['tools'] : ['tools', 'pause']]];
      for (const [pa, btns] of table) {
        if (!btns.some(b => a.pressed(b))) continue;
        let used = false;
        if (pa === 'tools') { s.toolsMode = !s.toolsMode; s.focusIndex = 0; this.paintFocus(s); used = true; }
        else if (s.toolsMode && pa === 'back') { s.toolsMode = false; s.focusIndex = 0; this.paintFocus(s); used = true; }
        else if (!s.toolsMode || pa === 'hint') used = s.actionHandler(pa);
        if (used) { btns.forEach(b => a.consume(b)); if (pa === 'confirm') a.consume('interact'); if (pa === 'back' || pa === 'tools') { a.consume('pause'); a.consume('back'); } }
      }
      if (!this.stack.includes(s)) return true; // handler closed the screen
      s.el.classList.toggle('tools-mode', !!s.toolsMode);
    }
    const f = this.focusables(s);
    const move = (d: number) => { if (f.length) { s.focusIndex = (s.focusIndex + d + f.length) % f.length; this.paintFocus(s); } };
    if (!s.noNav && (a.pressed('navUp') || a.pressed('navLeft'))) move(-1);
    if (!s.noNav && (a.pressed('navDown') || a.pressed('navRight'))) move(1);
    if (a.pressed('confirm')) {
      a.consume('confirm'); a.consume('interact');
      if (f.length) f[s.focusIndex]?.click(); else s.onConfirmEmpty?.();
    } else if (a.pressed('back')) { a.consume('back'); a.consume('pause'); s.onBack?.(); }
    else if (a.pressed('pause') && s.onPause) { a.consume('pause'); s.onPause(); }
    else if (a.pressed('map') && s.onMap) { a.consume('map'); s.onMap(); }
    return s.blocksWorld;
  }

  // ---------------- builders ----------------
  menu(title: string, items: MenuItem[], opts: { subtitle?: string; html?: string; onBack?: () => void; className?: string; footer?: string } = {}): Screen {
    const el = document.createElement('div'); el.className = `screen menu ${opts.className ?? ''}`;
    el.innerHTML = `<div class="panel"><h1>${esc(title)}</h1>${opts.subtitle ? `<p class="sub">${esc(opts.subtitle)}</p>` : ''}${opts.html ?? ''}
      <div class="items"></div>${opts.footer ? `<p class="footer">${esc(opts.footer)}</p>` : ''}</div>`;
    const box = el.querySelector('.items')!;
    for (const it of items) {
      const b = document.createElement('button'); b.dataset.focus = ''; b.textContent = it.label; b.disabled = !!it.disabled;
      if (it.hint) b.title = it.hint;
      b.addEventListener('click', () => it.action()); box.appendChild(b);
    }
    return this.push(el, { onBack: opts.onBack });
  }

  dialogue(lines: DialogueLine[]): Promise<void> {
    return new Promise(resolve => {
      if (!lines.length) return resolve();
      let i = 0;
      const el = document.createElement('div'); el.className = 'screen dialogue';
      el.innerHTML = `<div class="dlg"><div class="dlg-speaker"></div><div class="dlg-text"></div><div class="dlg-next">Confirm ▸</div></div>`;
      const render = () => {
        const raw = lines[i], l = this.cleanLine(raw);
        this.currentSpeaker = raw.speaker;
        el.querySelector('.dlg-speaker')!.innerHTML = esc(l.speaker) + (l.placeholder ? ' <span class="badge">PLACEHOLDER DIALOGUE</span>' : '');
        el.querySelector('.dlg-text')!.textContent = l.text;
        this.onLine?.(l);
      };
      const next = () => { i++; if (i >= lines.length) { this.currentSpeaker = null; this.onLine?.(null); this.pop(s); resolve(); } else render(); };
      el.addEventListener('click', next);
      render();
      const s = this.push(el, { onConfirmEmpty: next, onBack: next });
    });
  }

  panel(spec: PanelSpec): Promise<string | null> {
    return new Promise(resolve => {
      const el = document.createElement('div'); el.className = 'screen menu';
      el.innerHTML = `<div class="panel"><h2>${esc(spec.title)} ${spec.placeholder ? '<span class="badge">DEV EXAMPLE</span>' : ''}</h2>
        ${spec.body ? `<p class="body">${esc(spec.body).replace(/\n/g, '<br>')}</p>` : ''}<div class="items"></div></div>`;
      const done = (r: string | null) => { this.pop(s); resolve(r); };
      for (const b of spec.buttons) {
        const btn = document.createElement('button'); btn.dataset.focus = ''; btn.textContent = b.label;
        btn.addEventListener('click', () => done(b.id)); el.querySelector('.items')!.appendChild(btn);
      }
      const s = this.push(el, { onBack: () => done(null) });
    });
  }

  custom(title: string, render: CustomPanel, opts: { placeholder?: boolean; wide?: boolean; className?: string } = {}): Promise<string | null> {
    return new Promise(resolve => {
      const el = document.createElement('div'); el.className = `screen menu ${opts.className ?? ''}`;
      el.innerHTML = `<div class="panel ${opts.wide ? 'wide' : ''}">${title ? `<h2>${esc(title)} ${opts.placeholder ? '<span class="badge">DEV EXAMPLE</span>' : ''}</h2>` : ''}<div class="custom"></div></div>`;
      let s: Screen | undefined; let handler: ((a: PanelAction) => boolean) | undefined; let closed = false;
      const close = (r: string | null) => { if (closed) return; closed = true; if (s) this.pop(s); resolve(r); };
      const cleanup = render(el.querySelector('.custom') as HTMLElement, { close, refocus: () => { if (s) { s.focusIndex = 0; this.paintFocus(s); } }, onAction: fn => { handler = fn; if (s) s.actionHandler = fn; } }); // content changed → focus its first control
      if (closed) return;
      s = this.push(el, { onBack: () => close(null), cleanup: cleanup || undefined });
      s.actionHandler = handler;
    });
  }

  /** One-time reward breakdown (skippable). */
  rewardScene(title: string, r: RewardReceipt): Promise<void> {
    return new Promise(resolve => {
      const row = (label: string, v: number, note = '') => `<tr><td>${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</td><td class="num">+${v}</td></tr>`;
      const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
      const html = r.devSkipped ? '<p class="sub">Skipped with developer tools — no reward granted.</p>' : `<table class="reward">
        ${row('Base', r.base)}${row('Quality', r.quality, `${Math.round(r.qualityScore * 100)}%`)}${row('Speed', r.speed, `${mins(r.activeSeconds)} vs target ${mins(r.targetSeconds)}`)}
        ${r.difficulty === 'hard' ? row('Hard challenge bonus', r.hardBonus) : ''}
        <tr class="total"><td>Total</td><td class="num">${r.total} coins</td></tr></table>
        <p class="sub">${r.base} + ${r.quality} + ${r.speed}${r.difficulty === 'hard' ? ` + ${r.hardBonus}` : ''} = ${r.total}</p>`;
      const s = this.menu(title, [{ label: 'Continue', action: () => { this.pop(s); resolve(); } }], { html, onBack: () => { this.pop(s); resolve(); }, className: 'reward-screen' });
    });
  }

  /** True while a full-screen story card (time jump) is showing — background music pauses. */
  cardShowing = false;
  card(title: string, subtitle: string, ms = 2600): Promise<void> {
    this.cardShowing = true;
    return new Promise(resolve => {
      const el = document.createElement('div'); el.className = 'screen card';
      el.innerHTML = `<div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>`;
      let done = false;
      const finish = () => { if (done) return; done = true; this.cardShowing = false; this.pop(s); resolve(); };
      const s = this.push(el, { onConfirmEmpty: finish, onBack: finish });
      setTimeout(finish, ms);
    });
  }

  /** Ask the player's name and season (keyboard for the name; controllers can keep the suggestion). */
  askName(suggestion: string, season: 'spring' | 'summer' | 'autumn' | 'winter'): Promise<{ name: string; season: 'spring' | 'summer' | 'autumn' | 'winter' }> {
    const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
    return new Promise(resolve => {
      const el = document.createElement('div'); el.className = 'screen menu name-screen';
      el.innerHTML = `<div class="panel"><h2>What’s your name?</h2><p class="sub">President Bednar’s new assistant needs a name. Characters will call you by it.</p>
        <input class="name-input" data-focus maxlength="18" autocomplete="off" spellcheck="false" placeholder="Your name">
        <p class="sub">Season for the whole game (you can change it later in Settings):</p>
        <div class="season-row">${SEASONS.map(x => `<button type="button" data-focus data-season="${x}">${x[0].toUpperCase()}${x.slice(1)}</button>`).join('')}</div>
        <div class="items"><button data-focus type="button" class="name-ok primary">Start</button></div></div>`;
      const input = el.querySelector('.name-input') as HTMLInputElement; input.value = suggestion;
      let pick = season, done = false;
      const paint = () => el.querySelectorAll<HTMLButtonElement>('[data-season]').forEach(b => b.classList.toggle('chosen', b.dataset.season === pick));
      el.querySelectorAll<HTMLButtonElement>('[data-season]').forEach(b => b.addEventListener('click', () => { pick = b.dataset.season as typeof pick; paint(); }));
      paint();
      const finish = () => { if (done) return; done = true; const v = input.value.trim().replace(/[<>{}]/g, '').slice(0, 18) || suggestion; this.pop(s); resolve({ name: v, season: pick }); };
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(); });   // typing doesn't move the game
      el.querySelector('.name-ok')!.addEventListener('click', finish);
      const s = this.push(el, { onBack: finish });
      setTimeout(() => { input.focus(); input.select(); }, 50);
    });
  }

  toast(text: string, ms = 3500) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
    this.toastEl.appendChild(t); setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 600);
  }

  async fade(fn: () => void | Promise<void>) {
    const f = this.root.querySelector('.fade') as HTMLElement;
    f.classList.add('on'); await new Promise(r => setTimeout(r, 350));
    await fn(); f.classList.remove('on');
  }

  // ---------------- HUD ----------------
  updateHud(d: HudData) {
    this.lastHud = d;
    this.objectiveEl.textContent = d.objective;
    this.eraEl.textContent = d.era + (d.interior ? ` · ${d.interior}` : '');
    this.promptEl.classList.toggle('hidden', !d.prompt && !d.buildingHint);
    this.promptEl.innerHTML = `${d.prompt ? `<div><kbd>E</kbd> / <kbd>①</kbd> ${esc(d.prompt)}</div>` : ''}${d.buildingHint ? `<div class="building-sign-hint"><span aria-hidden="true">ⓘ</span> ${esc(d.buildingHint)}</div>` : ''}`;
    const g = this.mini.getContext('2d')!, S = 180;
    g.fillStyle = '#2b2622'; g.fillRect(0, 0, S, S);
    if (d.map) {
      const scale = d.map.width / (CAMPUS.bounds.maxX - CAMPUS.bounds.minX); // px per metre in map canvas
      const viewM = 130, src = viewM * scale, mx = d.mapX ?? d.px, mz = d.mapZ ?? d.pz;
      const cx = (mx - CAMPUS.bounds.minX) * scale, cy = (mz - CAMPUS.bounds.minZ) * scale;
      g.drawImage(d.map, cx - src / 2, cy - src / 2, src, src, 0, 0, S, S);
      const drawMarker = (m: { x: number; z: number }, primary: boolean) => {
        let tx = (m.x - d.px) / viewM * S + S / 2, ty = (m.z - d.pz) / viewM * S + S / 2;
        const out = tx < 9 || ty < 9 || tx > S - 9 || ty > S - 9;
        g.fillStyle = primary ? '#ffd34d' : '#ffe9a3'; g.strokeStyle = '#000'; g.lineWidth = 2;
        if (out) {
          // edge pointer toward an off-screen objective
          const a = Math.atan2(ty - S / 2, tx - S / 2);
          tx = Math.max(9, Math.min(S - 9, tx)); ty = Math.max(9, Math.min(S - 9, ty));
          g.save(); g.translate(tx, ty); g.rotate(a); g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
        } else { g.beginPath(); g.arc(tx, ty, primary ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke(); }
      };
      for (const e of d.doors) {
        const tx = (e.x - d.px) / viewM * S + S / 2, ty = (e.z - d.pz) / viewM * S + S / 2;
        if (tx < 6 || ty < 6 || tx > S - 6 || ty > S - 6) continue;
        drawDoorIcon(g, tx, ty, 6);
      }
      if (!d.interior) { for (const m of d.markers) drawMarker(m, false); if (d.target) drawMarker(d.target, true); }   // indoor targets use room coordinates
    }
    const dist = d.target ? Math.round(Math.hypot(d.target.x - d.px, d.target.z - d.pz)) : 0;
    this.distEl.textContent = d.target ? `${dist} m` : '';
    // on-screen pointer: direction relative to the camera view
    this.pointer.classList.toggle('hidden', !d.target || dist < 4);
    if (d.target) {
      const dx = d.target.x - d.px, dz = d.target.z - d.pz;
      const fx = -Math.sin(d.camYaw), fz = -Math.cos(d.camYaw);
      const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz); // + = target to the right
      this.arrow.style.transform = `rotate(${ang}rad)`;
      this.ptext.textContent = `${d.targetLabel ? d.targetLabel + ' · ' : ''}${dist} m`;
    }
    this.coinsEl.textContent = d.coins;
    this.helpEl.textContent = d.driving ? 'Golf cart: W/S drive · A/D steer · E get out' : 'WASD move · Shift sprint · Space jump · drag mouse to orbit · wheel zoom · E interact · M map · Esc pause';
    if (d.interior) {   // indoors: the campus map stays visible, centred on the building you're in
      g.fillStyle = 'rgba(20,16,12,0.72)'; g.fillRect(0, S - 22, S, 22);
      g.fillStyle = '#ffd34d'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillText(`Inside: ${d.interior.split('—')[0].trim()}`.slice(0, 30), S / 2, S - 8); g.textAlign = 'start';
      g.strokeStyle = '#ffd34d'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, 13, 0, Math.PI * 2); g.stroke();
    }
    // player arrow (north-up map)
    g.save(); g.translate(S / 2, S / 2); g.rotate(-d.pyaw + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  /**
   * A zoomable campus map (canvas). Opens on the campus buildings (plus wherever you are) with a small margin;
   * wheel / +− / right stick zoom, drag (or the stick, in the full-screen map) pans, "Whole map" toggles everything.
   */
  private mapWidget(size: () => { w: number; h: number }) {
    const d = this.lastHud!, map = d.map!, B = CAMPUS.bounds, s = map.width / (B.maxX - B.minX);   // map px per game metre
    const me = { x: d.mapX ?? d.px, z: d.mapZ ?? d.pz };
    const campusRect = () => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      // the campus buildings (the temple sits off campus to the south), not the whole town around them
      const polys = d.eraId ? buildingsForEra(d.eraId).filter(b => b.registryId && b.registryId !== 'temple' && b.state !== 'site').map(b => b.poly) : allFootprints();
      for (const poly of polys) for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (!isFinite(x0)) return { x0: B.minX, x1: B.maxX, z0: B.minZ, z1: B.maxZ };
      const near = 25; x0 = Math.min(x0, me.x - near); x1 = Math.max(x1, me.x + near); z0 = Math.min(z0, me.z - near); z1 = Math.max(z1, me.z + near);
      const m = Math.max(x1 - x0, z1 - z0) * 0.03;
      return { x0: Math.max(B.minX, x0 - m), x1: Math.min(B.maxX, x1 + m), z0: Math.max(B.minZ, z0 - m), z1: Math.min(B.maxZ, z1 + m) };
    };
    const c = document.createElement('canvas'); c.className = 'map-canvas';
    const view = { cx: 0, cz: 0, mpp: 1 };                         // centre (metres) and metres per screen pixel
    const fit = (r: { x0: number; x1: number; z0: number; z1: number }) => { const { w, h } = size(); view.cx = (r.x0 + r.x1) / 2; view.cz = (r.z0 + r.z1) / 2; view.mpp = Math.max((r.x1 - r.x0) / w, (r.z1 - r.z0) / h); };
    const wholeMpp = () => { const { w, h } = size(); return Math.max((B.maxX - B.minX) / w, (B.maxZ - B.minZ) / h); };
    const clamp = () => {
      view.mpp = Math.max(0.08, Math.min(wholeMpp(), view.mpp));
      const { w, h } = size(), hw = w * view.mpp / 2, hh = h * view.mpp / 2;
      view.cx = hw * 2 >= B.maxX - B.minX ? (B.minX + B.maxX) / 2 : Math.max(B.minX + hw, Math.min(B.maxX - hw, view.cx));
      view.cz = hh * 2 >= B.maxZ - B.minZ ? (B.minZ + B.maxZ) / 2 : Math.max(B.minZ + hh, Math.min(B.maxZ - hh, view.cz));
    };
    const draw = () => {
      const { w, h } = size(); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = view.mpp * s < 1; g.fillStyle = '#2a2620'; g.fillRect(0, 0, c.width, c.height);
      const vx0 = view.cx - c.width * view.mpp / 2, vz0 = view.cz - c.height * view.mpp / 2;
      const P = (x: number, z: number) => [(x - vx0) / view.mpp, (z - vz0) / view.mpp];
      // the part of the map image inside the view (clipped to the image)
      const ix0 = Math.max(B.minX, vx0), iz0 = Math.max(B.minZ, vz0), ix1 = Math.min(B.maxX, vx0 + c.width * view.mpp), iz1 = Math.min(B.maxZ, vz0 + c.height * view.mpp);
      if (ix1 > ix0 && iz1 > iz0) { const [dx, dy] = P(ix0, iz0); g.drawImage(map, (ix0 - B.minX) * s, (iz0 - B.minZ) * s, (ix1 - ix0) * s, (iz1 - iz0) * s, dx, dy, (ix1 - ix0) / view.mpp, (iz1 - iz0) / view.mpp); }
      g.font = 'bold 12px sans-serif'; g.textAlign = 'left';
      const showDoorText = view.mpp < 0.45;   // 'Entrance' labels only when zoomed in
      for (const e of d.doors) { const [x, y] = P(e.x, e.z); drawDoorIcon(g, x, y, 7); if (showDoorText) { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText('Entrance', x + 10, y + 4); g.fillText('Entrance', x + 10, y + 4); } }
      for (const m of d.markers) { const [x, y] = P(m.x, m.z); g.fillStyle = '#ffe9a3'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke(); }
      if (d.target) { const [x, y] = P(d.target.x, d.target.z); g.fillStyle = '#ffd34d'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.stroke(); }
      const [x, y] = P(me.x, me.z); g.fillStyle = '#fff'; g.strokeStyle = '#c00'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke();
    };
    let whole = false;
    const campus = () => { whole = false; fit(campusRect()); clamp(); draw(); };
    const zoomBy = (f: number, at?: { x: number; y: number }) => {
      const ax = at ? view.cx + (at.x - c.width / 2) * view.mpp : view.cx, az = at ? view.cz + (at.y - c.height / 2) * view.mpp : view.cz;
      const before = view.mpp; view.mpp *= f; clamp(); const k = view.mpp / before;
      view.cx = ax + (view.cx - ax) * k; view.cz = az + (view.cz - az) * k; clamp(); draw();
    };
    const pan = (dxPx: number, dyPx: number) => { view.cx += dxPx * view.mpp; view.cz += dyPx * view.mpp; clamp(); draw(); };
    const toggleWhole = () => { if (whole) campus(); else { whole = true; view.mpp = wholeMpp(); clamp(); draw(); } return whole; };
    c.addEventListener('wheel', e => { e.preventDefault(); const r = c.getBoundingClientRect(); zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, { x: e.clientX - r.left, y: e.clientY - r.top }); }, { passive: false });
    let drag: { x: number; y: number } | null = null;
    c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => { if (!drag) return; pan(drag.x - e.clientX, drag.y - e.clientY); drag = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('pointerup', () => { drag = null; });
    // controller: right stick up/down zooms (and, if wanted, the left stick pans) — smooth, every frame
    let last = performance.now();
    const tick = (a: ActionState, panWithLeft: boolean) => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const zy = a.axes.lookY; if (Math.abs(zy) > 0.2) zoomBy(Math.pow(0.25, zy * dt));
      if (panWithLeft && (Math.abs(a.axes.moveX) > 0.2 || Math.abs(a.axes.moveY) > 0.2)) pan(a.axes.moveX * 500 * dt, -a.axes.moveY * 500 * dt);
    };
    campus();
    return { canvas: c, draw, campus, zoomBy, toggleWhole, tick, isWhole: () => whole };
  }

  /** Full-screen map (M / map button), available anywhere — indoors it shows the building you are in. */
  bigMap(onClose: () => void) {
    const d = this.lastHud; if (!d?.map) return;
    const el = document.createElement('div'); el.className = 'screen map';
    el.innerHTML = `<div class="map-head">Campus map — ${esc(d.era)}${d.interior ? ` · inside: ${esc(d.interior.split(' — ')[0])}` : ''} · <small>north is up · yellow = objectives · green = entrances · red = you · © OpenStreetMap contributors</small>
      <button data-focus class="map-in">＋</button><button data-focus class="map-out">－</button><button data-focus class="map-zoom">Whole map</button> <button data-focus class="map-close">Close</button></div>
      <div class="map-tip">Wheel or right stick: zoom · drag or left stick: move</div>`;
    const mw = this.mapWidget(() => ({ w: window.innerWidth - 32, h: window.innerHeight - 110 }));
    el.insertBefore(mw.canvas, el.querySelector('.map-tip'));
    const zb = el.querySelector('.map-zoom') as HTMLButtonElement;
    let sc: Screen;
    const close = () => { window.removeEventListener('resize', mw.draw); this.pop(sc); onClose(); };
    el.querySelector('.map-close')!.addEventListener('click', close);
    el.querySelector('.map-in')!.addEventListener('click', () => mw.zoomBy(1 / 1.4));
    el.querySelector('.map-out')!.addEventListener('click', () => mw.zoomBy(1.4));
    zb.addEventListener('click', () => { zb.textContent = mw.toggleWhole() ? 'Campus view' : 'Whole map'; });
    window.addEventListener('resize', mw.draw);
    sc = this.push(el, { onBack: close, onMap: close });
    sc.tick = a => mw.tick(a, true); sc.noNav = true;
  }

  /** The menu with the map beside it (pause): options on the left, a zoomable map on the right. */
  attachMap(sc: Screen) {
    if (!this.lastHud?.map) return;
    sc.el.classList.add('with-map');
    const box = document.createElement('div'); box.className = 'menu-map';
    box.innerHTML = `<div class="menu-map-head"><b>Campus map</b><span><button class="map-in" type="button">＋</button><button class="map-out" type="button">－</button><button class="map-zoom" type="button">Whole map</button></span></div>`;
    const size = () => ({ w: Math.max(200, Math.min(window.innerWidth * 0.58, window.innerWidth - 560)), h: Math.max(200, window.innerHeight - 110) });
    const mw = this.mapWidget(size);
    box.appendChild(mw.canvas);
    box.insertAdjacentHTML('beforeend', '<div class="map-tip">Wheel or right stick: zoom · drag: move · M: full-screen map</div>');
    const zb = box.querySelector('.map-zoom') as HTMLButtonElement;
    box.querySelector('.map-in')!.addEventListener('click', () => mw.zoomBy(1 / 1.4));
    box.querySelector('.map-out')!.addEventListener('click', () => mw.zoomBy(1.4));
    zb.addEventListener('click', () => { zb.textContent = mw.toggleWhole() ? 'Campus view' : 'Whole map'; });
    sc.el.appendChild(box);
    const onResize = () => mw.draw(); window.addEventListener('resize', onResize);
    const prev = sc.cleanup; sc.cleanup = () => { window.removeEventListener('resize', onResize); prev?.(); };
    sc.tick = a => mw.tick(a, false);
  }
}

/** Green door icon used for enterable entrances on the minimap / map. */
function drawDoorIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#2e8b57'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.fillRect(x - r, y - r, r * 2, r * 2); g.strokeRect(x - r, y - r, r * 2, r * 2);
  g.fillStyle = '#f4e3c2'; g.fillRect(x - r * 0.45, y - r * 0.6, r * 0.9, r * 1.5);
}
