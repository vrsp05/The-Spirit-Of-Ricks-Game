// Developer tools — only loaded with ?dev=1. Toggle the panel with ` or F1.
// Teleport, era/colour preview, quest complete/reset, collision + input views,
// mock controllers, ending replay. Not part of ordinary play.
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { MockController } from '../input/mockController';
import { QUEST_ORDER } from '../quests/QuestManager';
import { ERA_ORDER, ERAS } from '../world/eras';
import { VOXEL } from '../world/voxelMesher';
import { toReal } from '../world/campusData';
import type { Game } from '../game';

export function installDevTools(game: Game) {
  const panel = document.createElement('div'); panel.className = 'dev-panel';
  const inputView = document.createElement('div'); inputView.className = 'input-view hidden';
  document.body.append(panel, inputView);
  let collisionMesh: THREE.InstancedMesh | null = null;

  const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); b.blur(); }; return b; };
  const section = (title: string) => { const h = document.createElement('h3'); h.textContent = title; panel.appendChild(h); const d = document.createElement('div'); panel.appendChild(d); return d; };
  panel.innerHTML = '<b>DEV TOOLS</b> <small>(` / F1 to hide)</small>';

  const tp = section('Teleport');
  const sel = document.createElement('select');
  for (const [id, a] of Object.entries(GAME_CONFIG.locations)) { const o = document.createElement('option'); o.value = id; o.textContent = `${id}${a.space ? ' (' + a.space + ')' : ''}`; sel.appendChild(o); }
  tp.append(sel, btn('Go', () => teleport(sel.value)), btn('STC door', () => teleport('door.stc.main')), btn('Copy position', () => {
    const p = game.player.position;
    const [rx, rz] = game.spaceId === 'exterior' ? toReal(p.x, p.z) : [p.x - game.interiors.origin(game.spaceId).x, p.z - game.interiors.origin(game.spaceId).z];
    const s = `{ x: ${rx.toFixed(1)}, z: ${rz.toFixed(1)}${game.spaceId !== 'exterior' ? `, space: '${game.spaceId}'` : ''} }`;
    navigator.clipboard?.writeText(s); game.ui.toast(`Anchor (real metres): ${s}`);
  }));
  const era = section('Era preview');
  ERA_ORDER.forEach(e => era.appendChild(btn(ERAS[e].label.split(' · ')[0], () => game.setEra(e))));
  const col = section('Colour stage');
  GAME_CONFIG.colorStages.forEach((v, i) => col.appendChild(btn(`${i} (${v})`, () => { game.colorStage = i; game.renderer.setColor(v, true); })));
  const qs = section('Quests');
  for (const id of QUEST_ORDER) {
    const row = document.createElement('div'); row.textContent = id + ' ';
    row.append(btn('complete', () => game.quests.forceComplete(id)), btn('reset', () => game.quests.reset(id)));
    qs.appendChild(row);
  }
  qs.appendChild(btn('Complete all → finale route', () => { for (const id of QUEST_ORDER) if (game.quests.status(id) !== 'completed') game.quests.forceComplete(id); }));
  const dbg = section('Debug');
  dbg.append(
    btn('Toggle collision view', () => toggleCollision()),
    btn('Toggle input view', () => inputView.classList.toggle('hidden')),
    btn('Toggle noclip', () => { game.player.noclip = !game.player.noclip; game.ui.toast(`noclip ${game.player.noclip}`); }),
    btn('Replay ending', () => void game.finale.start()),
    btn('Overhead view (north up)', () => { game.overhead = game.overhead ? null : { x: game.player.position.x, z: game.player.position.z, span: 260 }; }),
  );
  const sc = section('Cutscenes & effects (no rewards)');
  const csSel = document.createElement('select');
  const refreshCs = () => { csSel.replaceChildren(...[...game.cutscenes.history.keys()].map(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; return o; })); };
  sc.append(csSel, btn('Refresh list', refreshCs), btn('Replay', () => { const s = game.cutscenes.history.get(csSel.value); if (s) void game.cutscenes.play({ ...s, replay: true }); }),
    btn('Fireworks here', () => { const p = game.player.position; game.effects.fireworks(p.x, p.y + 20, p.z, 5); game.effects.colorWave(p.x, p.y, p.z); }));
  const df = section('Difficulty');
  df.append(btn('Easy', () => { game.difficulty = 'easy'; game.ui.toast('Difficulty: Easy'); }), btn('Hard', () => { game.difficulty = 'hard'; game.ui.toast('Difficulty: Hard'); }));
  const mc = section('Mock controllers');
  for (let i = 0; i < 2; i++) mc.appendChild(btn(`Toggle mock ${i + 1}`, () => toggleMock(i)));

  function teleport(id: string) {
    const r = game.resolve(id);
    if (r.space !== game.spaceId) {
      if (r.space === 'exterior') void game.exitInterior(true).then(() => game.player.place(game.space, r.x, r.z));
      else void game.enterInterior(r.space).then(() => game.player.place(game.space, r.x, r.z + 2));
    } else game.player.place(game.space, r.x, r.z + (id.startsWith('door') || id.startsWith('cart') ? 2.5 : 1.5));
  }
  function toggleCollision() {
    if (collisionMesh) { collisionMesh.removeFromParent(); collisionMesh = null; return; }
    collisionMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(VOXEL * 0.9, 0.3, VOXEL * 0.9), new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.6, depthTest: false }), 20000);
    collisionMesh.renderOrder = 20; game.renderer.scene.add(collisionMesh);
  }
  function refreshCollision() {
    if (!collisionMesh) return;
    const p = game.player.position, grid = game.world.grid, m = new THREE.Matrix4(); let n = 0;
    for (let z = p.z - 40; z < p.z + 40; z += VOXEL) for (let x = p.x - 40; x < p.x + 40; x += VOXEL) {
      if (n >= 20000) break;
      if (grid.topAt(x, z) > 0) { m.makeTranslation(Math.floor(x / VOXEL) * VOXEL + VOXEL / 2, p.y + 0.3, Math.floor(z / VOXEL) * VOXEL + VOXEL / 2); collisionMesh.setMatrixAt(n++, m); }
    }
    collisionMesh.count = n; collisionMesh.instanceMatrix.needsUpdate = true;
  }
  const mocks: (MockController | null)[] = [null, null];
  function toggleMock(i: number) {
    let mk = mocks[i];
    if (!mk) { mk = new MockController(i, game.input); mocks[i] = mk; game.mocks.push(mk); mk.el.style.left = i === 0 ? '16px' : '360px'; }
    if (mk.el.isConnected) { mk.stop(); mk.el.remove(); } else { document.body.appendChild(mk.el); mk.start(); }
  }

  let t = 0;
  game.devHooks.push(dt => {
    if (game.input.state.pressed('devToggle')) panel.classList.toggle('hidden');
    t += dt; if (t < 0.25) return; t = 0;
    refreshCollision();
    if (!inputView.classList.contains('hidden')) {
      const a = game.input.state;
      const lines = [`ACTIONS move(${a.axes.moveX.toFixed(2)}, ${a.axes.moveY.toFixed(2)}) look(${a.axes.lookX.toFixed(2)}, ${a.axes.lookY.toFixed(2)}) run=${a.running}`,
        `player (${game.player.position.x.toFixed(1)}, ${game.player.position.z.toFixed(1)}) y=${game.player.position.y.toFixed(1)} space=${game.spaceId}`];
      for (const s of game.input.sources) {
        const st = s.status(), raw = s.raw?.();
        lines.push(`${st.label.padEnd(28).slice(0, 28)} ${st.connected ? 'OK ' : '-- '} ${st.lastSeenMs !== undefined ? Math.round(st.lastSeenMs) + 'ms' : ''} ${st.detail ?? ''}`);
        if (raw) lines.push(`   axes ${raw.axes.map(v => v.toFixed(2).padStart(5)).join(' ')}  btn ${raw.buttons.map(b => (b ? '■' : '□')).join('')}`);
      }
      inputView.textContent = lines.join('\n');
    }
  });
}
