// Your phone (Q): messages from friends and campus, your class schedule, records, photos, the map.
// In 1999–2001 it's a pager: a green screen with messages and the time only.
import { esc } from '../ui/ui';
import type { EraId } from '../world/eras';
import type { LifeHost } from './host';

export interface PhoneApp { id: string; icon: string; name: string; open: () => void }
export interface PhoneData { era: EraId; time: string; weather: string; messages: { from: string; text: string }[]; apps: PhoneApp[] }

export function openPhone(h: LifeHost, d: PhoneData) {
  const pager = d.era === 'ricks1999' || d.era === 'transition';
  const el = document.createElement('div'); el.className = `screen phone-screen ${pager ? 'pager' : ''}`;
  const close = () => h.ui.pop(s);
  if (pager) {
    let i = 0;
    const render = () => {
      const m = d.messages[i];
      el.innerHTML = `<div class="pager-body"><div class="pager-lcd"><div class="pager-top">${esc(d.time)} · ${i + 1}/${Math.max(1, d.messages.length)} ✉</div><div class="pager-msg">${m ? `${esc(m.from.toUpperCase())}: ${esc(m.text)}` : 'NO NEW PAGES'}</div></div>
        <div class="pager-btns"><button data-focus data-a="prev">◀</button><button data-focus data-a="next">▶</button><button data-focus data-a="close">OFF</button></div><div class="pager-brand">Pager</div></div>`;
      el.querySelector('[data-a="prev"]')!.addEventListener('click', () => { i = (i + d.messages.length - 1) % Math.max(1, d.messages.length); h.sound('tick'); render(); });
      el.querySelector('[data-a="next"]')!.addEventListener('click', () => { i = (i + 1) % Math.max(1, d.messages.length); h.sound('tick'); render(); });
      el.querySelector('[data-a="close"]')!.addEventListener('click', close);
    };
    render();
  } else {
    el.innerHTML = `<div class="phone-body"><div class="phone-status"><span>${esc(d.time)}</span><span>${esc(d.weather)}</span><span>▮▮▮ 🔋</span></div>
      <div class="phone-apps">${d.apps.map(a => `<button data-focus data-app="${a.id}"><span>${a.icon}</span>${esc(a.name)}</button>`).join('')}</div>
      <div class="phone-msgs"><b>Messages</b>${d.messages.map(m => `<div class="phone-msg"><b>${esc(m.from)}</b> ${esc(m.text)}</div>`).join('') || '<div class="phone-msg">No new messages.</div>'}</div>
      <button data-focus data-app="close" class="phone-home">⌂</button></div>`;
    el.querySelectorAll<HTMLElement>('[data-app]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.app!; if (id === 'close') { close(); return; } h.sound('tick'); d.apps.find(a => a.id === id)?.open(); }));
  }
  const s = h.ui.push(el, { onBack: close, onPause: close });
  h.sound('pop');
}
