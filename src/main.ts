import { Game } from './game';

let game: Game;
try {
  game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  (window as any).__game = game; // handy for console debugging and automated smoke tests
  if (new URLSearchParams(location.search).get('cutscene') === 'preview') void game.previewOpening();
  else if (new URLSearchParams(location.search).get('cutscene') === 'ending') game.previewEnding();
  if (new URLSearchParams(location.search).has('dev')) {
    import('./dev/devTools').then(m => m.installDevTools(game));
  }
} catch (e) {
  console.error(e);
  document.getElementById('ui')!.innerHTML = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f4ecdc;font:18px system-ui;text-align:center;padding:24px">
    The game could not start: ${String((e as Error)?.message ?? e).replace(/</g, '&lt;')}<br><br>A browser with WebGL 2 is required (current Chrome, Edge, Firefox or Safari).</div>`;
}
