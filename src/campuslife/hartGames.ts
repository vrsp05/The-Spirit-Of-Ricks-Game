// Hart Building minigames, with records to beat:
//   treadmill   400 m sprint: alternate ← → (A / D, or the stick) to run; same key twice and you stumble.
//   shootout    60 seconds of shooting from six spots around the arc: stop the meter in the green zone;
//               three in a row puts you "on fire" (double points until you miss).
import * as THREE from 'three';
import { playStep } from '../fx/audio';
import type { LifeHost } from './host';
import type { Progress } from './progress';

/** What the minigames need from the game: move the player inside the Hart and animate them. */
export interface HartHost {
  /** Room-local → world. */
  toWorld(x: number, z: number): { x: number; z: number };
  place(x: number, z: number, yaw: number): void;
  /** A per-frame animation for the player's avatar (null clears it). */
  emote(fn: ((dt: number) => void) | null): void;
  /** Lie on your back with your feet at (x, z), head toward `yaw`'s back (null gets up). */
  lie(at: { x: number; z: number; yaw: number; height: number } | null): void;
}
export interface Spot { x: number; z: number; pts: number; name: string }
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// ---------------------------------------------------------------- treadmill
export const TREAD = { distance: 400, maxSpeed: 8.6 };
/** One stride: alternate keys speed you up (less near top speed); the same key twice is a stumble. */
export function stride(v: number, sameKey: boolean) { return sameKey ? v * 0.7 : Math.min(TREAD.maxSpeed, v + 0.62 * (1 - v / (TREAD.maxSpeed + 0.4))); }

export function treadmill(h: LifeHost, p: Progress, k: HartHost, belt: { x: number; z: number }, stand: { x: number; z: number }): Promise<void> {
  let v = 0, dist = 0, time = 0, last: 'l' | 'r' | null = null, started = false, done = false, top = 0, raf = 0, prev = performance.now(), feet = h.avatar.footfalls;
  k.place(belt.x, belt.z, Math.PI);
  k.emote(dt => { h.avatar.animate(dt, v * 1.25); h.avatar.root.position.y = 0.27; });
  const best = p.stat('treadBest') / 10;
  return h.ui.custom('Treadmill — 400 m sprint', (root, api) => {
    root.innerHTML = `<p class="sub">Alternate <kbd>←</kbd> <kbd>→</kbd> (or <kbd>A</kbd> <kbd>D</kbd>, or the stick) as fast as you can. Same key twice = stumble!${best ? ` Record: <b>${fmt(best)}</b>` : ''}</p>
      <div class="tread"><div class="tread-speed"><b>0.0</b> km/h</div><div class="tread-bar"><div class="tread-fill"></div><div class="tread-flag"></div></div>
      <div class="tread-stats"></div><div class="tread-keys"><span data-k="l">←</span><span data-k="r">→</span></div><div class="tread-msg">Start tapping to start the clock!</div></div>
      <div class="items"><button data-focus data-act="quit">Step off</button></div>`;
    const $ = (q: string) => root.querySelector(q) as HTMLElement;
    const tap = (key: 'l' | 'r') => {
      if (done) return;
      if (!started) { started = true; $('.tread-msg').textContent = 'Go go go!'; }
      const same = key === last; v = stride(v, same); last = key;
      if (same) { h.sound('error'); $('.tread-msg').textContent = 'Stumble! Alternate the keys.'; }
      root.querySelectorAll<HTMLElement>('[data-k]').forEach(e => e.classList.toggle('on', e.dataset.k === key));
    };
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (started && !done) {
        time += dt; v = Math.max(0, v - (0.8 + v * 0.14) * dt); dist += v * dt; top = Math.max(top, v);
        if (dist >= TREAD.distance) {
          done = true; dist = TREAD.distance;
          const t10 = Math.round(time * 10), rec = !best || t10 < p.stat('treadBest');
          if (rec) { p.set('treadBest', t10); p.earn(15); }
          p.best('treadTop', Math.round(top * 36)); p.add('treadRuns');
          h.sound(rec ? 'cheer' : 'success');
          $('.tread-msg').textContent = rec ? `NEW RECORD! ${fmt(time)} (+15 coins)` : `Finished in ${fmt(time)} — record ${fmt(best)}`;
          h.save(); setTimeout(() => api.close('done'), 2400);
        }
      }
      if (h.avatar.footfalls !== feet) { feet = h.avatar.footfalls; if (v > 0.6) playStep('carpet', Math.min(1, 0.4 + v / 10), true); }
      $('.tread-speed b').textContent = (v * 3.6).toFixed(1);
      $('.tread-fill').style.width = `${(dist / TREAD.distance) * 100}%`;
      $('.tread-stats').textContent = `${dist.toFixed(0)} / ${TREAD.distance} m · ${fmt(time)} · top ${(top * 3.6).toFixed(1)} km/h`;
      raf = requestAnimationFrame(loop);
    };
    // keyboard taps come straight from the keys (exact timing); controllers come through the panel actions
    let lastKeyAt = 0; const keyDown = () => performance.now() - lastKeyAt < 200;
    const onKey = (e: KeyboardEvent) => { const l = e.code === 'ArrowLeft' || e.code === 'KeyA', r = e.code === 'ArrowRight' || e.code === 'KeyD'; if (!l && !r) return; lastKeyAt = performance.now(); if (!e.repeat) tap(l ? 'l' : 'r'); };
    window.addEventListener('keydown', onKey, true);
    api.onAction(a => { if (a === 'left' || a === 'alt2') { if (!keyDown()) tap('l'); return true; } if (a === 'right' || a === 'alt') { if (!keyDown()) tap('r'); return true; } if (a === 'back') { api.close(null); return true; } return false; });
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => api.close(null));
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); };
  }, { className: 'tread-panel' }).then(() => { k.emote(null); h.avatar.root.position.y = 0; k.place(stand.x, stand.z, Math.PI); });
}

// ---------------------------------------------------------------- shooting challenge
/** Meter position 0..1 → made basket? (the green zone is narrower from three-point range). */
export function shotGoes(meter: number, pts: number) { return Math.abs(meter - 0.5) < (pts === 3 ? 0.075 : 0.11); }

export function shootout(h: LifeHost, p: Progress, k: HartHost, hoop: { x: number; y: number; z: number }, spots: Spot[]): Promise<void> {
  const T = 60, best = p.stat('hoopsBest');
  let score = 0, left = T, si = 0, streak = 0, fire = false, meter = 0, dir = 1, busy = false, done = false, raf = 0, prev = performance.now(), makes = 0, shots = 0;
  const hw = k.toWorld(hoop.x, hoop.z), rim = new THREE.Vector3(hw.x, hoop.y, hw.z);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshStandardMaterial({ color: '#d9662a', roughness: 0.6 })); ball.visible = false; h.scene.add(ball);
  let fly: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; arc: number; then: (() => void) | null } | null = null;
  const goSpot = () => { const s = spots[si % spots.length]; k.place(s.x, s.z, Math.atan2(hoop.x - s.x, hoop.z - s.z)); };
  goSpot();
  k.emote(dt => {
    if (fly) {
      fly.t += dt; const q = Math.min(1, fly.t / fly.dur);
      ball.position.lerpVectors(fly.from, fly.to, q); ball.position.y += Math.sin(q * Math.PI) * fly.arc; ball.visible = true;
      if (q >= 1) { const f = fly.then; fly = null; f?.(); }
    }
  });
  return h.ui.custom('Shooting challenge — 60 seconds', (root, api) => {
    root.innerHTML = `<p class="sub">Stop the ball in the <b style="color:#3f8f4a">green zone</b> with <kbd>Space</kbd> / Ⓐ. Threes are harder. Three in a row = 🔥 double points!${best ? ` Record: <b>${best}</b>` : ''}</p>
      <div class="shoot"><div class="shoot-top"><span class="shoot-time"></span><span class="shoot-score"></span></div><div class="shoot-spot"></div>
      <div class="ft-bar"><div class="ft-zone"></div><div class="ft-ball"></div></div><div class="shoot-msg"></div></div>
      <div class="items"><button data-focus data-act="shoot">Shoot!</button><button data-focus data-act="quit">Stop</button></div>`;
    const $ = (q: string) => root.querySelector(q) as HTMLElement;
    const paintSpot = () => { const s = spots[si % spots.length], w = (s.pts === 3 ? 0.075 : 0.11) * 2; $('.ft-zone').style.left = `${(0.5 - w / 2) * 100}%`; $('.ft-zone').style.width = `${w * 100}%`; $('.shoot-spot').textContent = `📍 ${s.name} · ${s.pts} pts${fire ? ' · 🔥 ON FIRE (×2)' : ''}`; };
    const finish = () => {
      done = true; ball.visible = false;
      const rec = score > best; if (rec) { p.set('hoopsBest', score); p.earn(15); }
      p.add('hoopsGames'); h.sound(rec ? 'cheer' : 'success');
      $('.shoot-msg').textContent = `Time! ${score} points (${makes}/${shots}).${rec ? ' NEW RECORD! +15 coins' : best ? ` Record: ${best}` : ''}`;
      h.save(); setTimeout(() => api.close('done'), 2600);
    };
    const shoot = () => {
      if (busy || done) return;
      busy = true; shots++;
      const s = spots[si % spots.length], make = shotGoes(meter, s.pts), sw = k.toWorld(s.x, s.z);
      const from = new THREE.Vector3(sw.x, 2.0, sw.z);
      h.avatar.poseArms(-2.6, -2.6);
      const miss = new THREE.Vector3(rim.x + (meter < 0.5 ? -0.35 : 0.35), rim.y + 0.1, rim.z + (meter < 0.5 ? 0.25 : -0.2));
      fly = { from, to: make ? rim.clone().add(new THREE.Vector3(0, 0.12, 0)) : miss, t: 0, dur: 0.85, arc: 2.0, then: () => {
        if (make) {
          makes++; streak++; const pts = s.pts * (fire ? 2 : 1); score += pts; h.sound('success');
          $('.shoot-msg').textContent = `${s.pts === 3 ? 'Three!' : 'Swish!'} +${pts}`;
          if (streak >= 3 && !fire) { fire = true; $('.shoot-msg').textContent += ' 🔥 You’re on fire!'; h.sound('cheer'); }
          fly = { from: rim.clone(), to: new THREE.Vector3(rim.x, 0.15, rim.z + 0.4), t: 0, dur: 0.4, arc: 0, then: next };
        } else {
          streak = 0; fire = false; h.sound('bounce'); $('.shoot-msg').textContent = meter < 0.5 ? 'Short — off the front of the rim.' : 'Long — off the back iron.';
          fly = { from: ball.position.clone(), to: new THREE.Vector3(rim.x + (Math.random() - 0.5) * 3, 0.15, rim.z - 2 - Math.random() * 2), t: 0, dur: 0.6, arc: 1, then: next };
        }
      } };
      function next() { busy = false; ball.visible = false; si++; if (!done) { goSpot(); paintSpot(); } }
    };
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!done) {
        left -= dt; if (left <= 0) { left = 0; if (!busy) finish(); else setTimeout(() => { if (!done) finish(); }, 1200); }
        if (!busy) { meter += dir * dt * 1.25; if (meter > 1) { meter = 1; dir = -1; } if (meter < 0) { meter = 0; dir = 1; } }
      }
      $('.ft-ball').style.left = `calc(${meter * 100}% - 12px)`;
      $('.shoot-time').textContent = `⏱ ${Math.ceil(left)} s`; $('.shoot-score').textContent = `${score} pts`;
      raf = requestAnimationFrame(loop);
    };
    root.querySelector('[data-act="shoot"]')!.addEventListener('click', shoot);
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => api.close(null));
    api.onAction(a => { if (a === 'confirm') { shoot(); return true; } if (a === 'back') { api.close(null); return true; } return false; });
    paintSpot(); loop();
    return () => cancelAnimationFrame(raf);
  }, { className: 'shoot-panel' }).then(() => { k.emote(null); ball.removeFromParent(); });
}

// ---------------------------------------------------------------- bench press
/** Weights in pounds, one attempt each; the bar gets heavier every time you lock it out. */
export const BENCH_WEIGHTS = [45, 65, 95, 115, 135, 155, 185, 205, 225, 245, 275, 315, 365, 405];
export const kg = (lb: number) => Math.round(lb * 0.4536);
/** How far one tap pushes the bar (0..1 of the lift) and how fast it sinks back (per second), for a weight. */
export function benchPhysics(lb: number) { return { push: 0.16 * Math.pow(45 / lb, 0.55), sink: 0.1 + lb / 900 }; }

export function benchPress(h: LifeHost, p: Progress, k: HartHost, bench: { x: number; z: number }, stand: { x: number; z: number }): Promise<void> {
  const best = p.stat('benchBest');
  let wi = 0, lift = 0, left = 0, phase: 'ready' | 'lifting' | 'rest' | 'done' = 'ready', top = 0, raf = 0, prev = performance.now(), keyAt = 0;
  // lie on the bench: feet at its south end, head to the north; a bar with plates over the chest
  const bw = k.toWorld(bench.x, bench.z), feetZ = bw.z + 0.95, H = 0.5;
  k.lie({ x: bw.x, z: feetZ, yaw: 0, height: H });
  const bar = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.7, roughness: 0.3 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 8), steel); rod.rotation.z = Math.PI / 2; bar.add(rod);
  const plates: THREE.Mesh[] = [];
  /** Real plate loading: 45 lb plates per side (bar = 45 lb), a smaller blue plate for the rest. */
  const setPlates = (lb: number) => {
    for (const m of plates) m.removeFromParent(); plates.length = 0;
    const big = Math.floor((lb - 45) / 90), small = (lb - 45) % 90 > 0 ? 1 : 0;
    for (const s of [-1, 1]) for (let i = 0; i < big + small; i++) {
      const isBig = i < big, m = new THREE.Mesh(new THREE.CylinderGeometry(isBig ? 0.22 : 0.15, isBig ? 0.22 : 0.15, 0.05, 18), new THREE.MeshStandardMaterial({ color: isBig ? '#1c1c1c' : '#2f4f9e' }));
      m.rotation.z = Math.PI / 2; m.position.x = s * (0.72 + i * 0.06); bar.add(m); plates.push(m);
    }
  };
  h.scene.add(bar);
  const chestZ = feetZ - 1.32;
  const place = () => { bar.position.set(bw.x, H + 0.2 + lift * 0.5, chestZ); };
  k.emote(() => { h.avatar.press(lift); place(); });
  return h.ui.custom('Bench press contest', (root, api) => {
    root.innerHTML = `<p class="sub">Tap <kbd>Space</kbd> / Ⓐ as fast as you can to push the bar up before time runs out. Every lift adds weight — one try each!${best ? ` Record: <b>${best} lb (${kg(best)} kg)</b>` : ''}</p>
      <div class="lift"><div class="lift-weight"></div><div class="lift-bar"><div class="lift-fill"></div><div class="lift-goal">LOCKOUT</div></div><div class="lift-time"></div><div class="lift-msg">Press Space to start the first lift.</div></div>
      <div class="items"><button data-focus data-act="push">Push!</button><button data-focus data-act="quit">Rack it (stop)</button></div>`;
    const $ = (q: string) => root.querySelector(q) as HTMLElement;
    const W = () => BENCH_WEIGHTS[Math.min(wi, BENCH_WEIGHTS.length - 1)];
    const paint = () => { $('.lift-weight').textContent = `${W()} lb · ${kg(W())} kg`; $('.lift-fill').style.height = `${lift * 100}%`; $('.lift-time').textContent = phase === 'lifting' ? `⏱ ${left.toFixed(1)} s` : ''; };
    setPlates(W());
    const finish = (msg: string) => {
      phase = 'done'; const rec = top > best;
      if (rec) { p.set('benchBest', top); p.earn(15); } p.add('benchSessions');
      h.sound(rec ? 'cheer' : 'success');
      $('.lift-msg').textContent = `${msg} Best lift today: ${top ? `${top} lb (${kg(top)} kg)` : 'none'}.${rec ? ' NEW RECORD! +15 coins' : ''}`;
      h.save(); setTimeout(() => api.close('done'), 2600);
    };
    const push = () => {
      if (phase === 'done' || phase === 'rest') return;
      if (phase === 'ready') { phase = 'lifting'; lift = 0; left = 7; $('.lift-msg').textContent = 'Push! Push! Push!'; }
      lift = Math.min(1, lift + benchPhysics(W()).push * (0.85 + Math.random() * 0.3));
      if (lift >= 1) {
        top = W(); h.sound('success'); phase = 'rest';
        $('.lift-msg').textContent = `💪 ${W()} lb — locked out!`;
        setTimeout(() => {
          if (wi >= BENCH_WEIGHTS.length - 1) { finish('You lifted the heaviest bar in the gym!'); return; }
          wi++; lift = 0; setPlates(W()); phase = 'ready'; h.sound('tick'); $('.lift-msg').textContent = `Next: ${W()} lb. Press Space when you’re ready.`;
        }, 1300);
      }
    };
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (phase === 'lifting') {
        left -= dt; lift = Math.max(0, lift - benchPhysics(W()).sink * dt);
        if (left <= 0) { h.sound('error'); lift = 0; finish(`The bar wouldn’t move at ${W()} lb.`); }
      } else if (phase === 'done' || phase === 'ready') lift = Math.max(0, lift - dt);
      paint(); raf = requestAnimationFrame(loop);
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { keyAt = performance.now(); if (!e.repeat) push(); } };
    window.addEventListener('keydown', onKey, true);
    root.querySelector('[data-act="push"]')!.addEventListener('click', () => { if (performance.now() - keyAt > 150) push(); });
    root.querySelector('[data-act="quit"]')!.addEventListener('click', () => { if (phase === 'done') return; finish('You racked the bar.'); });
    api.onAction(a => { if (a === 'confirm') { if (performance.now() - keyAt > 150) push(); return true; } if (a === 'back') { if (phase !== 'done') finish('You racked the bar.'); return true; } return false; });
    paint(); loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); };
  }, { className: 'tread-panel' }).then(() => { k.emote(null); bar.removeFromParent(); k.lie(null); k.place(stand.x, stand.z, -Math.PI / 2); });
}
