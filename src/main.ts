import { Game } from './game';

let game: Game;

// Loading screen (in index.html): a progress bar with a few steps, then "press any button to start".
// The press also unlocks audio, so the title music can play when the menu fades in.
const boot = document.getElementById('boot'), fill = boot?.querySelector('.b-fill') as HTMLElement | null, step = boot?.querySelector('.b-step') as HTMLElement | null;
const STEPS = ['Loading the campus map…', 'Raising the buildings…', 'Planting the trees…', 'Waking up the students…', 'Tuning the choir…', 'Ready'];
const progress = (k: number) => { if (fill) fill.style.width = `${Math.round(k * 100)}%`; if (step) step.textContent = STEPS[Math.min(STEPS.length - 1, Math.floor(k * (STEPS.length - 1)))]; };
progress(0.05);
const skipBoot = new URLSearchParams(location.search).has('cutscene');
function startBoot(ready: Promise<void>) {
  if (!boot || skipBoot) { boot?.remove(); document.body.classList.add('booted'); return; }
  const t0 = performance.now(), MIN = 2600;   // long enough to feel like a game loading
  let done = false;
  const tick = () => { const k = Math.min(done ? 1 : 0.92, (performance.now() - t0) / MIN); progress(k); if (k < 1) requestAnimationFrame(tick); else showStart(); };
  ready.then(() => { done = true; }); requestAnimationFrame(tick);
  const showStart = () => {
    const btn = boot.querySelector('.b-start') as HTMLElement; btn.classList.add('show');
    let gone = false;
    // the start press also unlocks audio (so it must reach the game), but the menu ignores input
    // until 'booted' is set a moment later, so the press never selects a menu item
    const go = () => {
      if (gone) return; gone = true;
      window.removeEventListener('keydown', go, true); window.removeEventListener('pointerdown', go, true);
      boot.classList.add('out'); setTimeout(() => document.body.classList.add('booted'), 350);
      setTimeout(() => boot.remove(), 1000);
    };
    window.addEventListener('keydown', go, true); window.addEventListener('pointerdown', go, true);
    // controller: start when the button is let go, so the press doesn't also select a menu item
    let held = false;
    const pad = () => { if (gone) return; const down = [...(navigator.getGamepads?.() ?? [])].some(g => g?.buttons.some(b => b.pressed)); if (held && !down) { go(); return; } held = down; requestAnimationFrame(pad); };
    requestAnimationFrame(pad);
  };
}
let resolveReady!: () => void;
startBoot(new Promise<void>(r => { resolveReady = r; }));
// let the loading screen paint before the (heavy) world build
requestAnimationFrame(() => setTimeout(() => {
try {
  game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  resolveReady();
  (window as any).__game = game; // handy for console debugging and automated smoke tests
  if (new URLSearchParams(location.search).get('cutscene') === 'preview') void game.previewOpening();
  else if (new URLSearchParams(location.search).get('cutscene') === 'ending') game.previewEnding();
  if (new URLSearchParams(location.search).has('dev')) {
    import('./dev/devTools').then(m => m.installDevTools(game));
  }
} catch (e) {
  console.error(e); boot?.remove();
  document.getElementById('ui')!.innerHTML = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f4ecdc;font:18px system-ui;text-align:center;padding:24px">
    The game could not start: ${String((e as Error)?.message ?? e).replace(/</g, '&lt;')}<br><br>A browser with WebGL 2 is required (current Chrome, Edge, Firefox or Safari).</div>`;
}
}, 30));
