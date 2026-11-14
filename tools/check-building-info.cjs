// Browser checks against a running game. Uses an isolated save and settings.
// node tools/check-building-info.cjs [URL] [path-to-playwright]
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.argv[3] || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:5173';
const cards = require('../src/world/data/building-info.json');

(async () => {
  const out = path.resolve(process.argv[4] || 'output/opening_cutscene/building-info-check');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => localStorage.setItem('spirit-of-ricks.settings', JSON.stringify({ muted: true, music: false, voices: false, graphics: 'low' })));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game, { timeout: 120000 });
    await page.evaluate(() => {
      const g = window.__game;
      g.continueGame({ version: 3, savedAt: 'fixture', difficulty: 'easy', era: 'ricks1999', colorStage: 0,
        quests: { professors: { status: 'active', data: {} }, construction: { status: 'locked', data: {} }, letters: { status: 'locked', data: {} } },
        targets: {}, rewards: {}, player: null, coins: [], introSeen: true, finaleReached: false });
    });
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const aimAt = async (id, distance = 8, cameraSide = 1) => {
      await page.evaluate(({ id, distance, cameraSide }) => {
        const g = window.__game, sign = g.world.buildingSigns.find(s => s.buildingId === id);
        if (!sign) throw new Error(`No visible sign: ${id}`);
        const p = sign.object.getWorldPosition(g.player.position.clone());
        g.spaceId = 'exterior'; g.interiors.show(null); g.world.exterior.visible = true;
        g.player.place(g.exteriorSpace, p.x + sign.normal.x * distance, p.z + sign.normal.z * distance);
        // Isolate input checks from props/collision at these teleported test positions.
        g.player.noclip = true;
        g.player.speed = 0;
        g.camFocus = { from: p.clone().add(p.clone().set(sign.normal.x * 11 * cameraSide, 1, sign.normal.z * 11 * cameraSide)), to: p };
      }, { id, distance, cameraSide });
      await settle();
    };
    const clickSign = () => {
      const viewport = page.viewportSize();
      return page.locator('#app canvas').click({ position: { x: viewport.width / 2, y: viewport.height / 2 } });
    };
    const card = page.getByRole('dialog');
    const close = () => page.getByRole('button', { name: 'Close building information', exact: true }).click();
    const checkBuiltSigns = async () => {
      await page.setViewportSize({ width: 800, height: 500 });
      await page.evaluate(() => { const g = window.__game; g.world.gateBuilt = () => true; g.world.refreshBuildings(); g.world.setEra('presentFinale'); });
      for (const id of ['taylor', 'icenter']) {
        await aimAt(id); await clickSign(); await card.waitFor();
        assert.equal(await card.locator('[data-building-id]').getAttribute('data-building-id'), id);
        const expected = cards.find(c => c.id === id);
        assert.deepEqual(await card.locator('section > p').allTextContents(), [expected.about, expected.fact]);
        await close();
      }
      console.log('PASS Taylor and I-Center cards become available when construction is complete');
    };
    if (process.env.RICKS_BUILDING_INFO_GATED_ONLY) {
      await checkBuiltSigns(); assert.deepEqual(errors, []); return;
    }

    await aimAt('kimball');
    assert.ok(await page.locator('.building-sign-hint').isVisible());
    await clickSign();
    await card.waitFor();
    assert.equal(await card.locator('h1').textContent(), 'Spencer W. Kimball Building');
    assert.deepEqual(await card.locator('section h2').allTextContents(), ['About', 'Interesting fact']);
    assert.deepEqual(await card.locator('section > p').allTextContents(), [cards[0].about, cards[0].fact]);
    assert.equal(await card.getAttribute('aria-modal'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close building information');
    const frozenPosition = await page.evaluate(() => window.__game.player.position.toArray());
    const questTime = await page.evaluate(() => window.__game.quests.activeSeconds('professors'));
    const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('spirit-of-ricks.save')));
    await page.keyboard.down('w'); await settle(); await page.waitForTimeout(250); await page.keyboard.up('w');
    assert.deepEqual(await page.evaluate(() => window.__game.player.position.toArray()), frozenPosition);
    assert.equal(await page.evaluate(() => window.__game.quests.activeSeconds('professors')), questTime);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close building information');
    await page.screenshot({ path: path.join(out, 'building-card-desktop.png') });
    await page.keyboard.press('Escape');
    await card.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__game.pauseOpen), false);
    assert.equal(await page.evaluate(() => window.__game.buildingInfoOpen), false);
    await page.keyboard.down('w');
    try { await page.waitForFunction(before => window.__game.player.position.toArray().some((n, i) => n !== before[i]), frozenPosition); }
    finally { await page.keyboard.up('w'); }
    assert.notDeepEqual(await page.evaluate(() => window.__game.player.position.toArray()), frozenPosition);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('spirit-of-ricks.save')).rewards), savedBefore.rewards);
    console.log('PASS actual plaque click, content, focus, movement/timer freeze, Esc close, and resumed movement');

    await aimAt('kimball');
    await page.keyboard.press('e');
    await card.waitFor(); await close();
    await card.waitFor({ state: 'detached' });
    await aimAt('kimball', 30);
    await clickSign(); await settle();
    assert.equal(await card.count(), 0);
    assert.equal(await page.locator('.building-sign-hint').count(), 0);
    await aimAt('kimball', -8);
    await clickSign(); await settle();
    assert.equal(await card.count(), 0);
    await aimAt('kimball', 8, -10);
    await clickSign(); await settle();
    assert.equal(await card.count(), 0, 'A building wall must block clicking its sign');
    await aimAt('kimball');
    await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(700, 450); await page.mouse.move(640, 400); await page.mouse.up();
    await settle(); assert.equal(await card.count(), 0, 'An orbit drag returning to its start is not a click');
    await page.mouse.click(640, 400, { button: 'right' });
    await settle(); assert.equal(await card.count(), 0);

    await aimAt('mckay');
    await clickSign(); await card.waitFor();
    assert.ok((await card.locator('.building-info-fact').textContent()).includes('2010'), 'Later history remains available in 1999');
    await close();
    // Card contents do not depend on viewport size; use fewer pixels for this sweep.
    await page.setViewportSize({ width: 800, height: 500 });
    const seen = new Set();
    for (const era of ['ricks1999', 'transition', 'byui', 'presentFinale']) {
      const visible = await page.evaluate(era => {
        const g = window.__game; g.world.setEra(era);
        return g.world.buildingSigns.map(s => s.buildingId);
      }, era);
      for (const id of visible) {
        await aimAt(id);
        await clickSign(); await card.waitFor();
        assert.equal(await card.locator('[data-building-id]').getAttribute('data-building-id'), id);
        const expected = cards.find(c => c.id === id);
        assert.deepEqual(await card.locator('section > p').allTextContents(), [expected.about, expected.fact]);
        await close(); seen.add(id);
      }
      assert.equal(await page.evaluate(() => [...window.__game.inspectables.keys()].filter(k => k.startsWith('building-info:')).length), visible.length);
    }
    assert.ok(seen.has('spori-original') && seen.has('spori-new') && seen.has('stc'));
    assert.ok(!seen.has('rigby') && !seen.has('visual-arts'), 'Buildings without existing plaques remain deferred');
    await page.evaluate(() => window.__game.world.refreshBuildings());
    await aimAt('kimball'); await clickSign(); await card.waitFor(); await close();
    console.log(`PASS all ${seen.size} plaque entries across four eras, full dated facts, and rebuild synchronization`);
    await checkBuiltSigns();

    for (const viewport of [{ width: 390, height: 844 }, { width: 640, height: 360 }]) {
      await page.setViewportSize(viewport);
      await aimAt('kimball');
      await page.locator('#app canvas').click({ position: { x: viewport.width / 2, y: viewport.height / 2 } });
      await card.waitFor();
      const bounds = await card.locator('.panel').evaluate(el => {
        const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, horizontalOverflow: el.scrollWidth > el.clientWidth };
      });
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= viewport.width && bounds.bottom <= viewport.height && !bounds.horizontalOverflow);
      await page.getByRole('button', { name: 'Close building information' }).scrollIntoViewIfNeeded();
      if (viewport.width === 390) await page.screenshot({ path: path.join(out, 'building-card-mobile.png') });
      await close();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS keyboard interaction, range/wall/drag guards, portrait and small-screen layout, no browser errors; screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
