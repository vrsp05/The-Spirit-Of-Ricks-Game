// Manwaring Center fun: the school store (clothes, accessories, food — paid with your coins) and
// bowling at the Strike Zone on the lower level (aim, then power; five frames).
import type { AvatarLook } from '../player/Avatar';
import { OUTFITS } from '../player/outfits';
import { esc } from '../ui/ui';
import type { LifeHost } from './host';
import type { Progress } from './progress';
import { DECOR } from './studentLife';

export interface Accessory { id: string; name: string; price: number; look: Partial<AvatarLook> }
export const ACCESSORIES: Accessory[] = [
  { id: 'beanie', name: 'School beanie', price: 12, look: { hat: 'beanie', hatColor: '#1f4e8c' } },
  { id: 'cap', name: 'Baseball cap', price: 10, look: { hat: 'cap', hatColor: '#7a2b2b' } },
  { id: 'shades', name: 'Sunglasses', price: 10, look: { glasses: true } },
  { id: 'scarf', name: 'Striped scarf', price: 12, look: { scarf: '#1f4e8c' } },
  { id: 'backpack', name: 'Backpack', price: 20, look: { backpack: '#2f3e57' } },
];
export interface Food { name: string; price: number; color: string; line: string }
export const STORE_FOOD: Food[] = [
  { name: 'Huckleberry ice cream', price: 4, color: '#7a3f8a', line: 'Purple, sweet and very Idaho.' },
  { name: 'Hot chocolate', price: 3, color: '#6b4a30', line: 'Perfect for a windy Rexburg day.' },
  { name: 'Soft pretzel', price: 3, color: '#b0753e', line: 'Warm, salty, perfect.' },
  { name: 'Fry sauce & fries', price: 4, color: '#e6c33a', line: 'Fry sauce: the true taste of the region.' },
  { name: 'Chocolate chip cookie', price: 2, color: '#7a4a28', line: 'Still warm from the oven.' },
];
const owned = (p: Progress, id: string) => p.stat(`own:${id}`) > 0;
/** Accessories you're wearing, merged on top of your outfit. */
export function accessoryLook(p: Progress): Partial<AvatarLook> {
  return Object.assign({}, ...ACCESSORIES.filter(a => p.stat(`wear:${a.id}`) > 0).map(a => a.look));
}
/** Store outfits you've bought (others show in the wardrobe once owned). */
export const ownsOutfit = (p: Progress, id: string) => !OUTFITS.find(o => o.id === id)?.price || owned(p, id);

export interface StoreHooks { wallet(): number; eat(f: Food): void; refreshLook(): void; storeName(): string; era(): string; decorChanged?(): void }

/** The school store: three shelves (clothes, accessories, food). */
export function openStore(h: LifeHost, p: Progress, k: StoreHooks, only?: 'food') {
  const show = (tab: 'clothes' | 'acc' | 'food' | 'decor') => {
    const items = tab === 'decor'
      ? DECOR.map(d => ({ label: `${owned(p, `decor-${d.id}`) ? '✓ ' : ''}${d.name} — ${owned(p, `decor-${d.id}`) ? 'in your apartment' : `${d.price} coins`}`, action: () => { if (owned(p, `decor-${d.id}`)) return; buy(`decor-${d.id}`, d.price, d.name, () => { p.add('decorOwned'); k.decorChanged?.(); h.toast(`🛋️ ${d.name} is waiting in your apartment.`); }); } }))
      : tab === 'clothes'
      ? OUTFITS.filter(o => o.price && (!o.sold || o.sold.includes(k.era()) || owned(p, o.id))).map(o => ({ label: `${owned(p, o.id) ? '✓ ' : ''}${o.name} — ${owned(p, o.id) ? 'owned (wear it from the wardrobe)' : `${o.price} coins`}`, action: () => buy(o.id, o.price!, o.name, () => h.toast(`👕 ${o.name} is in your wardrobe now.`)) }))
      : tab === 'acc'
        ? ACCESSORIES.map(a => ({ label: `${owned(p, a.id) ? (p.stat(`wear:${a.id}`) ? '✓ wearing · ' : 'owned · ') : ''}${a.name} — ${owned(p, a.id) ? (p.stat(`wear:${a.id}`) ? 'take off' : 'put on') : `${a.price} coins`}`, action: () => {
          if (owned(p, a.id)) { p.set(`wear:${a.id}`, p.stat(`wear:${a.id}`) ? 0 : 1); k.refreshLook(); h.ui.pop(s); show('acc'); return; }
          buy(a.id, a.price, a.name, () => { p.set(`wear:${a.id}`, 1); k.refreshLook(); });
        } }))
        : STORE_FOOD.map(f => ({ label: `${f.name} — ${f.price} coins`, action: () => { if (!pay(f.price)) return; h.ui.clear(); k.eat(f); } }));
    const s = h.ui.menu(tab === 'decor' ? `${k.storeName()} — home decor` : tab === 'clothes' ? `${k.storeName()} — clothes` : tab === 'acc' ? `${k.storeName()} — accessories` : only ? 'Strike Zone Grill' : `${k.storeName()} — snacks`,
      [...items, { label: 'Back', action: () => { h.ui.pop(s); if (!only) top(); } }], { subtitle: `You have ${k.wallet()} coins.`, onBack: () => { h.ui.pop(s); if (!only) top(); } });
    const buy = (id: string, price: number, name: string, after: () => void) => { if (!pay(price)) return; p.set(`own:${id}`, 1); h.sound('coin'); h.toast(`🛍️ Bought: ${name}`); after(); h.save(); h.ui.pop(s); show(tab); };
  };
  const pay = (price: number) => { if (!p.spend(price, k.wallet())) { h.sound('error'); h.toast('Not enough coins. Try the campus jobs, happenings and quests!'); return false; } p.add('purchases'); return true; };
  const top = () => {
    const s = h.ui.menu(k.storeName(), [
      { label: '👕 Clothes', action: () => { h.ui.pop(s); show('clothes'); } },
      { label: '🧢 Accessories', action: () => { h.ui.pop(s); show('acc'); } },
      { label: '🍦 Snacks', action: () => { h.ui.pop(s); show('food'); } },
      { label: '🛋️ Home decor (for your apartment)', action: () => { h.ui.pop(s); show('decor'); } },
      { label: 'Leave the store', action: () => h.ui.pop(s) },
    ], { subtitle: `School spirit wear, gear and snacks. You have ${k.wallet()} coins.`, onBack: () => h.ui.pop(s) });
  };
  if (only) show('food'); else top();
}

/** Score one game (frames of [roll1, roll2]); strikes add 10, spares add 5 (a simplified bonus). */
export function bowlingScore(frames: [number, number][]) { return frames.reduce((s, [a, b]) => s + a + b + (a === 10 ? 10 : a + b === 10 ? 5 : 0), 0); }
/** Pins knocked down: aim -1..1 (0 = centre), power 0..1 (best around 0.85), out of `standing` pins. */
export function pinsFor(aim: number, power: number, standing: number, r = Math.random) {
  const quality = Math.max(0, Math.min(1, 1.12 - Math.abs(aim) * 1.25 - Math.abs(power - 0.85) * 1.6));
  return Math.max(0, Math.min(standing, Math.round(standing * quality + (r() - 0.5) * 2.2)));
}

/** Bowl a five-frame game. */
export function bowl(h: LifeHost, p: Progress): Promise<void> {
  const FRAMES = 5, frames: [number, number][] = [];
  let roll = 0, r1 = 0, standing = 10, aim = 0, power = 0, phase: 'aim' | 'power' | 'roll' = 'aim', t = 0, last = performance.now(), raf = 0;
  return h.ui.custom('Strike Zone — bowling', (root, api) => {
    root.innerHTML = `<p class="sub">Press <kbd>Space</kbd> / Ⓐ to stop the aim, then again to set the power. ${FRAMES} frames.</p>
      <div class="bowl"><div class="pins"></div><div class="lane"><div class="aim"></div><div class="ball"></div></div><div class="pow"><div class="powfill"></div></div><div class="sheet"></div><div class="msg"></div></div>
      <div class="items"><button data-focus data-act="go">Bowl!</button><button data-focus data-act="quit">Leave the lane</button></div>`;
    const $ = (q: string) => root.querySelector(q) as HTMLElement;
    const paint = () => {
      $('.pins').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < 10 - standing ? 'down' : ''}"></i>`).join('');
      $('.sheet').innerHTML = Array.from({ length: FRAMES }, (_, i) => { const f = frames[i]; return `<span>${f ? (f[0] === 10 ? 'X' : `${f[0]} ${f[0] + f[1] === 10 ? '/' : f[1]}`) : i === frames.length ? (roll ? `${10 - standing} ·` : '·') : ''}</span>`; }).join('') + `<b>${bowlingScore(frames)}</b>`;
    };
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (phase === 'aim') aim = Math.sin(t * 2.6);
      if (phase === 'power') power = (Math.sin(t * 3.4 - Math.PI / 2) + 1) / 2;
      $('.aim').style.left = `${50 + aim * 42}%`; $('.ball').style.left = `${50 + aim * 42}%`; $('.powfill').style.width = `${(phase === 'aim' ? 0 : power) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    const act = () => {
      if (phase === 'aim') { phase = 'power'; t = 0; return; }
      if (phase !== 'power') return;
      phase = 'roll'; h.sound('bounce');
      const down = pinsFor(aim, power, standing);
      setTimeout(() => {
        standing -= down; h.sound(down >= 7 ? 'cheer' : down ? 'pop' : 'error');
        $('.msg').textContent = roll === 0 && standing === 0 ? 'STRIKE! 🎳' : roll === 1 && standing === 0 ? 'Spare!' : down === 0 ? 'Gutter ball…' : `${down} pin${down === 1 ? '' : 's'}`;
        if (roll === 0) { r1 = down; if (standing === 0) { frames.push([10, 0]); p.add('strikes'); standing = 10; } else roll = 1; }
        else { frames.push([r1, down]); roll = 0; standing = 10; }
        paint();
        if (frames.length >= FRAMES) {
          const score = bowlingScore(frames), coins = Math.floor(score / 15);
          p.best('bowlBest', score); p.add('bowlGames'); if (coins) p.earn(coins);
          $('.msg').textContent = `Final score: ${score}!${coins ? ` +${coins} coins` : ''}`; h.save();
          setTimeout(() => api.close('done'), 1800);
        } else { phase = 'aim'; t = Math.random() * 3; }
      }, 700);
    };
    root.querySelector('[data-act="go"]')!.addEventListener('click', act);
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => api.close(null));
    api.onAction(a => { if (a === 'confirm') { act(); return true; } if (a === 'back') { api.close(null); return true; } return false; });
    paint(); loop();
    return () => cancelAnimationFrame(raf);
  }, { className: 'bowl-panel' }).then(() => { const b = p.stat('bowlBest'); if (b) h.toast(`🎳 Best bowling score: ${b}`, 2500); });
}

/** Text for the store's front sign in each era. */
export const storeNameFor = (institution: string) => (institution === 'byui' ? 'University Store' : 'Bookstore');
export const storeHtml = (name: string) => `<p class="sub">${esc(name)}</p>`;
