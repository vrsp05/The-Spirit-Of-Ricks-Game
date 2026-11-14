import type { BuildingInfo } from '../world/buildingInfo';
import { esc, type UI } from './ui';

/** A blocking, keyboard-accessible card using the game's shared screen stack. */
export async function showBuildingInfo(ui: UI, card: BuildingInfo, name: string) {
  const previousFocus = document.activeElement;
  await ui.custom('', (root, { close }) => {
    const dialog = root.closest('.screen')!;
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'building-info-title');
    root.innerHTML = `<article class="building-info-card" data-building-id="${esc(card.id)}">
      <header class="building-info-head"><div><p class="building-info-kicker">Discover campus</p>
        <h1 id="building-info-title">${esc(name)}</h1></div>
        <button type="button" class="building-info-close" data-focus aria-label="Close building information">×</button></header>
      <section aria-labelledby="building-info-about"><h2 id="building-info-about">About</h2><p>${esc(card.about)}</p></section>
      <section class="building-info-fact" aria-labelledby="building-info-fact"><h2 id="building-info-fact">Interesting fact</h2><p>${esc(card.fact)}</p></section>
      <p class="building-info-footer">Esc or × to close</p>
    </article>`;
    const closeButton = root.querySelector<HTMLButtonElement>('.building-info-close')!;
    closeButton.addEventListener('click', () => close(null));
    const focusClose = () => closeButton.focus({ preventScroll: true });
    queueMicrotask(() => { if (closeButton.isConnected) focusClose(); });
    dialog.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Tab') { event.preventDefault(); focusClose(); }
    });
    return () => {
      close(null);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, { className: 'building-info-screen' });
}
