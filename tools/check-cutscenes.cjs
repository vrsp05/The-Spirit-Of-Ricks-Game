// End-to-end cutscene integration checks against a running npm run dev server.
// node tools/check-cutscenes.cjs [URL] [path-to-playwright]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[3] || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:5173';

(async () => {
  const out = path.resolve('output/opening_cutscene/main-integration-check');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem('spirit-of-ricks.settings', JSON.stringify({ muted: true, voices: false, music: false, graphics: 'low' }));
      if (!localStorage.getItem('spirit-of-ricks.save')) localStorage.setItem('spirit-of-ricks.save', JSON.stringify({
        version: 3, savedAt: 'fixture', difficulty: 'easy', era: 'ricks1999', colorStage: 0,
        quests: { professors: { status: 'available', data: {} }, construction: { status: 'locked', data: {} }, letters: { status: 'locked', data: {} } },
        targets: {}, rewards: {}, player: null, coins: [], introSeen: true, finaleReached: false,
      }));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game, { timeout: 120000 });
    const savedBefore = await page.evaluate(() => localStorage.getItem('spirit-of-ricks.save'));
    const button = name => page.getByRole('button', { name, exact: true });
    const seekOpening = t => page.evaluate(t => window.__game.opening.seek(t), t);
    const seekEnding = t => page.evaluate(t => window.__game.finale.seek(t), t);
    const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });

    await button('Watch opening').click();
    await button('Pause').click();
    await seekOpening(20.35);
    assert.ok(await page.evaluate(() => window.__game.bednar.mouth.scale.y > 1));
    await shot('opening-phone');
    await seekOpening(32);
    assert.equal(await page.locator('.oc-title').evaluate(el => Number(el.style.opacity)), 1);
    assert.equal(await page.evaluate(() => window.__game.player.avatar.root.visible), false);
    await seekOpening(35.18);
    assert.equal(await page.locator('.oc-text').textContent(), '[Knock, knock]');
    assert.ok(await page.evaluate(() => window.__game.player.avatar.root.visible));
    await seekOpening(39);
    await shot('opening-assistant');
    const paused = await page.evaluate(() => window.__game.opening.elapsed);
    await page.keyboard.press('w');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__game.opening.elapsed), paused);
    await button('Skip intro').click();
    await page.waitForFunction(() => window.__game.mode === 'title');
    assert.equal(await page.evaluate(() => localStorage.getItem('spirit-of-ricks.save')), savedBefore);
    console.log('PASS opening timeline, mouth, assistant entrance, pause, skip, and preview save safety');

    await button('Watch ending').click();
    await button('Pause').click();
    await seekEnding(7.2);
    assert.ok(await page.evaluate(() => {
      const s = window.__game.finale.stage;
      return [s.bednar, ...s.ceremonyGuests.map(p => p.avatar)].every(a => !!a.root.getObjectByName('voxel-smile'));
    }));
    await shot('ending-podium');
    await seekEnding(9.2);
    assert.equal(await page.evaluate(() => window.__game.finale.stage.flame.visible), false);
    await seekEnding(10.6);
    assert.equal(await page.evaluate(() => window.__game.finale.stage.flame.visible), true);
    await seekEnding(19);
    await shot('ending-drones');
    await seekEnding(38.5);
    assert.ok(await page.evaluate(() => {
      const p = window.__game.finale.presentation;
      return p.presenters.length === 4 && p.audience.length === 24 &&
        p.presenters.every(({ avatar }) => avatar.root.getObjectByName('left-chest-floppy') && avatar.armR.rotation.x < -2 && avatar.armL.rotation.x < -2);
    }));
    await shot('ending-stc');
    await button('Skip ending').click();
    await button('Replay ending').click();
    await button('Skip ending').click();
    await button('Title screen').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('spirit-of-ricks.save')), savedBefore);

    await page.setViewportSize({ width: 390, height: 844 });
    await button('Watch ending').click();
    await button('Pause').click();
    for (const t of [7.2, 38.5]) {
      await seekEnding(t);
      // Allow Three.js to update camera matrices before projecting heads.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.ok(await page.evaluate(t => {
        const g = window.__game;
        const avatars = t < 20 ? [g.finale.stage.bednar, ...g.finale.stage.ceremonyGuests.map(p => p.avatar)] : g.finale.presentation.presenters.map(p => p.avatar);
        return avatars.every(a => {
          const v = a.root.localToWorld(a.root.position.clone().set(0, 1.78, 0)).project(g.renderer.camera);
          return Math.abs(v.x) < .95 && Math.abs(v.y) < .85 && v.z < 1;
        });
      }, t));
    }
    await shot('ending-portrait');
    await button('Skip ending').click();
    await button('Title screen').click();
    await page.setViewportSize({ width: 1280, height: 800 });
    console.log('PASS ending podium, torch, drones, STC reveal, cheering, replay, portrait framing, and preview save safety');

    await button('New game').click();
    await page.getByRole('button', { name: /^Easy/ }).click();
    await button('Skip intro').click();
    await page.waitForFunction(() => window.__game.mode === 'playing');
    assert.equal(await page.evaluate(() => window.__game.spaceId), 'kimball-office');
    assert.ok(await page.evaluate(() => window.__game.introSeen && window.__game.player.avatar.root.visible && typeof window.__game.player.avatar.rebuild === 'function'));
    assert.equal(await page.evaluate(() => window.__game.world.exterior.visible), false);
    await shot('opening-gameplay-handoff');
    await page.evaluate(() => { const g = window.__game, save = g.snapshot(); g.quitToTitle(false); g.continueGame(save); });
    assert.equal(await page.evaluate(() => window.__game.opening.active), false);

    await page.evaluate(() => {
      const g = window.__game;
      g.quests.init({ quests: { professors: { status: 'completed', data: {} }, construction: { status: 'completed', data: {} }, letters: { status: 'active', data: { found: ['B', 'Y', 'U'], placed: ['B', 'Y', 'U'], cards: true } } }, targets: {}, rewards: {} });
      g.world.setEra('byui');
      void g.exitInterior(true);
      const sign = g.resolve('sign.byui');
      g.player.place(g.player.space, sign.x, sign.z + 4, 0);
      g.inspectables.get('letter-I').onInspect();
    });
    assert.equal(await page.evaluate(() => window.__game.finale.active), false, 'Finding I alone must not start the ending');
    await page.evaluate(() => { void window.__game.interactions.items.get('letters:sign').onInteract(); });
    await button('Place I').click();
    await page.waitForFunction(() => window.__game.finale.active && !window.__game.finale.previewing);
    assert.ok(await page.evaluate(() => window.__game.quests.allComplete() && !!window.__game.quests.state.rewards.letters));
    assert.equal(await page.evaluate(() => window.__game.renderer.colorAmount), 1);
    const reward = await page.evaluate(() => JSON.stringify(window.__game.quests.state.rewards.letters));
    await button('Skip ending').click();
    await button('Keep exploring').click();
    assert.equal(await page.evaluate(() => window.__game.world.era), 'presentFinale');
    assert.ok(await page.evaluate(() => window.__game.finaleReached && window.__game.mode === 'playing'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__game.quests.state.rewards.letters)), reward);
    await page.evaluate(() => { const g = window.__game, save = g.snapshot(); g.quitToTitle(false); g.continueGame(save); });
    assert.equal(await page.evaluate(() => window.__game.finale.active), false);
    assert.equal(await page.evaluate(() => window.__game.renderer.scene.children.filter(o => o.name === 'quest-byui-sign').length), 1);
    await page.evaluate(() => { const g = window.__game, save = g.snapshot(); save.finaleReached = false; g.quitToTitle(false); g.continueGame(save); });
    await page.waitForFunction(() => window.__game.finale.active);
    await button('Skip ending').click();
    await button('Title screen').click();
    console.log('PASS new-game office handoff, continue without intro replay, actual final-I placement, once-only reward, full color, and pending-ending resume');
    assert.deepEqual(errors, []);
    console.log(`PASS no browser errors; screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
