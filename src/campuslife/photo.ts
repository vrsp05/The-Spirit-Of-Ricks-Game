// Camera mode (P): frame a shot, press Space / E / P to take it. Some shots complete photo challenges
// (checked from what's actually in the frame). The last photos are kept in an album in this browser.
import * as THREE from 'three';
import { esc } from '../ui/ui';
import type { LifeHost } from './host';
import type { Progress } from './progress';
import { registryPoly } from '../world/campusData';

export interface Shot { camera: THREE.PerspectiveCamera; hour: number; daylight: number }
interface Challenge { id: string; icon: string; title: string; test: (c: Ctx) => boolean }
interface Ctx { inView: (x: number, y: number, z: number, maxD?: number) => boolean; outside: boolean; hour: number; daylight: number; season: string; raining: boolean; camH: number; npcsInView: number; playerDist: number; buildingInView: (id: string, maxD?: number) => boolean; musicInView: boolean }

export const CHALLENGES: Challenge[] = [
  { id: 'kimball', icon: '🏛️', title: 'The Kimball Building', test: c => c.buildingInView('kimball', 160) },
  { id: 'golden', icon: '🌅', title: 'Golden hour (sunrise or sunset)', test: c => c.outside && ((c.hour > 18.2 && c.hour < 20.4) || (c.hour > 5.8 && c.hour < 7.6)) },
  { id: 'night', icon: '🌙', title: 'Campus at night', test: c => c.outside && c.daylight < 0.15 },
  { id: 'crowd', icon: '👥', title: 'A crowd of students (4+)', test: c => c.npcsInView >= 4 },
  { id: 'selfie', icon: '🤳', title: 'Close-up of yourself', test: c => c.playerDist < 4.5 },
  { id: 'above', icon: '🚁', title: 'Campus from above (35 m+)', test: c => c.outside && c.camH > 35 },
  { id: 'music', icon: '🎸', title: 'Live music', test: c => c.musicInView },
  { id: 'temple', icon: '⛪', title: 'The temple on the hill', test: c => c.buildingInView('temple', 260) },
  { id: 'weather', icon: '🌧️', title: 'Bad weather (rain or a snow squall)', test: c => c.outside && c.raining },
  { id: 'snow', icon: '☃️', title: 'A snowy day', test: c => c.outside && c.season === 'winter' },
];

const ALBUM_KEY = 'spirit-of-ricks.photos';
function loadAlbum(): { url: string; at: string; tags: string[] }[] { try { return JSON.parse(localStorage.getItem(ALBUM_KEY) ?? '[]'); } catch { return []; } }

export class PhotoMode {
  active = false;
  private el: HTMLElement | null = null;
  private pending = false;
  album = loadAlbum();
  /** Things that count as "live music" (busker, piano) — set by campus life. */
  musicSpots: () => { x: number; z: number }[] = () => [];
  constructor(private h: LifeHost, private p: Progress) { p.photoTotal = CHALLENGES.length; }

  open() {
    if (this.active) return;
    this.active = true;
    const el = document.createElement('div'); el.className = 'photo-mode';
    el.innerHTML = `<div class="vf"><i></i><i></i><i></i><i></i></div>
      <div class="photo-help"><b>📷 Camera</b> · drag / right stick to aim · wheel to zoom · <kbd>Space</kbd>/<kbd>E</kbd>/<kbd>P</kbd> take photo · <kbd>Esc</kbd> close</div>
      <div class="photo-list">${CHALLENGES.map(c => `<div data-id="${c.id}" class="${this.p.photos.has(c.id) ? 'done' : ''}">${c.icon} ${esc(c.title)}</div>`).join('')}</div>
      <div class="flash"></div>`;
    this.h.ui.root.appendChild(el); this.el = el;
    this.h.ui.showHud(false);
  }
  close() { this.active = false; this.el?.remove(); this.el = null; this.h.ui.showHud(true); }
  snap() { if (this.active) this.pending = true; }

  /** Call right after the frame was rendered (the canvas still holds the image). */
  afterRender(canvas: HTMLCanvasElement, shot: Shot) {
    if (!this.pending) return; this.pending = false;
    this.h.sound('tick');
    const f = this.el?.querySelector('.flash') as HTMLElement | null; if (f) { f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
    // small JPEG for the album
    const W = 480, H = Math.round(W * canvas.height / canvas.width), c = document.createElement('canvas'); c.width = W; c.height = H;
    let url = '';
    try { c.getContext('2d')!.drawImage(canvas, 0, 0, W, H); url = c.toDataURL('image/jpeg', 0.72); } catch { /* tainted / unsupported */ }
    const done = CHALLENGES.filter(ch => ch.test(this.context(shot)));
    this.p.add('photosTaken');
    const fresh = done.filter(ch => !this.p.photos.has(ch.id));
    for (const ch of fresh) { this.p.photos.add(ch.id); this.p.earn(10); this.el?.querySelector(`[data-id="${ch.id}"]`)?.classList.add('done'); }
    this.p.check();
    if (fresh.length) { this.h.sound('success'); this.h.toast(`📸 Photo challenge${fresh.length > 1 ? 's' : ''}: ${fresh.map(c => c.title).join(', ')}! +${fresh.length * 10} coins`, 4000); }
    else this.h.toast(done.length ? `📸 Nice shot! (${done.map(c => c.icon).join(' ')})` : '📸 Nice shot! Saved to your album.', 2200);
    if (url) {
      this.album.unshift({ url, at: new Date().toLocaleString(), tags: done.map(c => c.icon) }); this.album.length = Math.min(this.album.length, 9);
      try { localStorage.setItem(ALBUM_KEY, JSON.stringify(this.album)); } catch { this.album.length = Math.min(this.album.length, 3); try { localStorage.setItem(ALBUM_KEY, JSON.stringify(this.album)); } catch { /* full */ } }
    }
    this.h.save();
  }

  private context(s: Shot): Ctx {
    const cam = s.camera; cam.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const v = new THREE.Vector3(), cp = cam.position;
    const inView = (x: number, y: number, z: number, maxD = 200) => { v.set(x, y, z); return frustum.containsPoint(v) && v.distanceTo(cp) < maxD; };
    const pl = this.h.player(), outside = pl.space === 'exterior';
    const buildingInView = (id: string, maxD = 200) => {
      if (!outside || !this.h.world.buildingStanding(id)) return false;
      const poly = registryPoly(id); if (!poly) return false;
      const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cz = poly.reduce((a, q) => a + q[1], 0) / poly.length;
      return inView(cx, this.h.world.groundY(cx, cz) + 8, cz, maxD);
    };
    const npcsInView = outside ? this.h.npcs.walkers.filter(w => w.avatar.root.visible && inView(w.x, this.h.world.groundY(w.x, w.z) + 1.4, w.z, 22)).length : 0;
    const playerDist = inView(pl.x, pl.y + 1.4, pl.z, 50) ? cp.distanceTo(new THREE.Vector3(pl.x, pl.y + 1.4, pl.z)) : 99;
    return {
      inView, outside, hour: s.hour, daylight: s.daylight, season: this.h.season(), raining: this.h.world.raining || (outside && this.h.world.showerOn),
      camH: cp.y - this.h.world.groundY(cp.x, cp.z), npcsInView, playerDist, buildingInView,
      musicInView: outside && this.musicSpots().some(m => inView(m.x, this.h.world.groundY(m.x, m.z) + 1.2, m.z, 22)),
    };
  }

  /** The album (pause menu): your last photos, each with a download link. */
  albumHtml() {
    if (!this.album.length) return '<p class="sub">No photos yet. Press P (or pick “Camera” in the pause menu) to take one.</p>';
    return `<div class="album">${this.album.map((a, i) => `<figure><img src="${a.url}" alt="Photo ${i + 1}"><figcaption>${esc(a.at)} ${a.tags.join(' ')} <a href="${a.url}" download="campus-photo-${i + 1}.jpg">Save</a></figcaption></figure>`).join('')}</div>
      <p class="sub">Challenges: ${CHALLENGES.map(c => `${this.p.photos.has(c.id) ? '✅' : '⬜'} ${c.icon} ${esc(c.title)}`).join(' · ')}</p>`;
  }
}
