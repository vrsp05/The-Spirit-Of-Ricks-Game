// Focused Quest 2 usability and quest-flow checks against a running game.
// node tools/check-quest2.cjs [URL] [path-to-playwright]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[3] || 'playwright');
const puzzles = require('../src/quests/q2/data/tiling.json');
const url = process.argv[2] || 'http://127.0.0.1:5173';
const normalize = cs => { const x = Math.min(...cs.map(c => c[0])), y = Math.min(...cs.map(c => c[1])); return cs.map(c => [c[0] - x, c[1] - y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]); };
function orient(cells, rot, flip = false) {
  let cs = cells.map(([x, y]) => [flip ? -x : x, y]);
  for (let i = 0; i < (rot + 4) % 4; i++) cs = cs.map(([x, y]) => [-y, x]);
  return normalize(cs);
}

(async () => {
  const out = path.resolve('output/opening_cutscene/quest2-check'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => localStorage.setItem('spirit-of-ricks.settings', JSON.stringify({ muted: true, voices: false, music: false, graphics: 'low' })));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__game, { timeout: 120000 });
    // The puzzle is DOM-based; skip GPU drawing in this isolated QA session.
    // The real game/input/UI loop and all quest callbacks continue to run.
    await page.evaluate(() => { window.__game.renderer.render = () => {}; });
    const button = name => page.getByRole('button', { name, exact: true });
    const shape = page.locator('.bp-held-shape');
    const cell = (x, y) => page.locator(`.bp-board > .bp-cell[data-x="${x}"][data-y="${y}"]`);
    const select = id => button(`Piece ${id}`).click();
    const hand = () => shape.evaluate(el => ({ id: el.dataset.piece ?? null, rot: Number(el.dataset.rotation ?? 0), flip: el.dataset.flip === 'true',
      cells: [...el.children].map(c => [+c.dataset.x, +c.dataset.y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]) }));
    const empty = async () => {
      assert.equal((await hand()).id, null); assert.equal(await page.locator('.bp-held-cell').count(), 0);
      assert.equal(await page.locator('.bp-piece.held').count(), 0); assert.ok(await button('Return piece').isDisabled());
    };
    const open = async (building, difficulty) => {
      await page.evaluate(({ building, difficulty }) => {
        const g = window.__game;
        g.continueGame({ version: 3, savedAt: 'fixture', difficulty, era: 'transition', colorStage: 1,
          quests: { professors: { status: 'completed', data: {} }, construction: { status: 'active', data: {} }, letters: { status: 'locked', data: {} } },
          targets: {}, rewards: {}, player: null, coins: [], introSeen: true, finaleReached: false });
        void g.interactions.items.get(`construction:site-${building}`).onInteract();
      }, { building, difficulty });
      await page.locator('.blueprint').waitFor();
      return puzzles.levels.find(l => l.id === `${building}-${difficulty}`);
    };
    const rotateTo = async rotation => { for (let i = 0; i < rotation; i++) await button('↷ Rotate right').click(); };
    const leave = async () => { await button('Leave').click(); await page.locator('.blueprint').waitFor({ state: 'detached' }); };

    const level = await open('taylor', 'easy');
    assert.equal(await page.evaluate(() => window.__game.quests.modules.get('construction').placeholder), false);
    await empty();
    const piece = level.pieces[0];
    await select(piece.id);
    const square = await page.locator('.bp-held-cell').first().boundingBox();
    assert.ok(Math.abs(square.width - square.height) < 1, 'Preview cells must remain square so rotation preserves proportions');
    assert.equal(await page.locator('.bp-cell.cursor').count(), 0, 'No extra cursor cell while holding a shape');
    assert.deepEqual((await hand()).cells, orient(piece.cells, 0));
    const edge = { x: level.footprint[0].length - 1, y: level.footprint.length - 1 };
    await cell(edge.x, edge.y).hover();
    assert.equal(await page.locator('.bp-held-cell').count(), piece.cells.length, 'The entire shape remains drawn at the edge');
    for (let rot = 1; rot <= 4; rot++) {
      await button('↷ Rotate right').click();
      const state = await hand(); assert.equal(state.rot, rot % 4); assert.equal(state.flip, false);
      assert.deepEqual(state.cells, orient(piece.cells, rot % 4));
      assert.equal(await page.locator('.bp-cell.cursor').count(), 0);
    }
    await button('↶ Rotate left').click(); assert.equal((await hand()).rot, 3);
    await cell(edge.x, edge.y).click({ button: 'right' }); assert.equal((await hand()).rot, 0);
    await cell(edge.x, edge.y).hover(); await page.mouse.wheel(0, -120);
    await page.waitForFunction(() => document.querySelector('.bp-held-shape').dataset.rotation === '3');
    await page.keyboard.press('t');
    await page.waitForFunction(() => document.querySelector('.bp-held-shape').dataset.rotation === '0');
    await page.keyboard.press('g');
    await page.waitForFunction(() => document.querySelector('.bp-held-shape').dataset.rotation === '3');
    assert.deepEqual((await hand()).cells, orient(piece.cells, 3));
    await page.screenshot({ path: path.join(out, 'held-shape-only.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.bp-held-shape').dataset.piece);
    await empty(); assert.equal(await page.locator('.blueprint').count(), 1);
    await select(piece.id); await select(piece.id); await empty();
    await select(piece.id); await cell(edge.x, edge.y).click();
    assert.ok((await page.locator('.bp-msg').textContent()).includes("Can't place"));
    assert.equal((await hand()).id, piece.id);
    await button('Return piece').click(); await empty();
    await page.screenshot({ path: path.join(out, 'empty-hand.png') });
    console.log('PASS shape-only preview, intact rotation at board edges, buttons/right-click/wheel/T/G, and return after rejected placement');

    const placement = level.solution[0];
    await select(placement.piece); await rotateTo(placement.rot);
    await cell(placement.x, placement.y).hover(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.quests.data('construction')['board:taylor']?.length === 1);
    await empty();
    const saved = () => page.evaluate(() => window.__game.quests.data('construction')['board:taylor']);
    assert.deepEqual(await saved(), [placement]);
    const part = orient(level.pieces.find(p => p.id === placement.piece).cells, placement.rot)[0];
    await cell(placement.x + part[0], placement.y + part[1]).click();
    assert.equal((await hand()).id, placement.piece); assert.equal((await hand()).rot, placement.rot);
    await button('Return piece').click(); await empty(); assert.deepEqual(await saved(), []);
    await leave();
    await page.evaluate(() => { void window.__game.interactions.items.get('construction:site-taylor').onInteract(); });
    await page.locator('.blueprint').waitFor(); await empty();
    assert.equal(await page.locator('.bp-cell.filled').count(), 0);
    await leave();
    console.log('PASS empty hand after placement, pickup with retained orientation, and return-to-tray persistence after reopening');

    for (const building of ['taylor', 'icenter']) {
      const hard = await open(building, 'hard'), p = hard.pieces[0];
      await select(p.id);
      await page.keyboard.press('g');
      await page.waitForFunction(() => document.querySelector('.bp-held-shape').dataset.rotation === '3');
      assert.equal((await hand()).flip, false, 'Counterclockwise rotation must not mirror on Hard');
      assert.deepEqual((await hand()).cells, orient(p.cells, 3));
      if (hard.allowFlip) { await button('Mirror').click(); assert.equal((await hand()).flip, true); }
      else assert.equal(await button('Mirror').count(), 0);
      await page.keyboard.press('t');
      await page.waitForFunction(() => document.querySelector('.bp-held-shape').dataset.rotation === '0');
      assert.equal((await hand()).flip, hard.allowFlip, 'Rotation preserves handedness');
      await button('Return piece').click(); await empty(); await leave();
    }

    // Solve both real Easy boards through their UI, including a drag placement.
    await open('taylor', 'easy');
    for (const building of ['taylor', 'icenter']) {
      if (building === 'icenter') {
        await page.evaluate(() => { void window.__game.interactions.items.get('construction:site-icenter').onInteract(); });
        await page.locator('.blueprint').waitFor();
      }
      const puzzle = puzzles.levels.find(l => l.id === `${building}-easy`);
      for (let i = 0; i < puzzle.solution.length; i++) {
        const placement = puzzle.solution[i];
        if (i === 0) {
          await button(`Piece ${placement.piece}`).scrollIntoViewIfNeeded();
          const tray = await button(`Piece ${placement.piece}`).boundingBox();
          await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2); await page.mouse.down();
          await cell(placement.x, placement.y).scrollIntoViewIfNeeded();
          const destination = await cell(placement.x, placement.y).boundingBox();
          await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 5 });
          for (let rot = 0; rot < placement.rot; rot++) {
            await page.mouse.wheel(0, 120);
            await page.waitForFunction(rotation => document.querySelector('.bp-held-shape').dataset.rotation === String(rotation), rot + 1);
          }
          await page.mouse.up();
        } else {
          await select(placement.piece); await rotateTo(placement.rot); await cell(placement.x, placement.y).click();
        }
        await empty();
      }
      await page.getByRole('heading', { name: 'Blueprint approved!', exact: true }).waitFor();
      await button('Build it! ▶').click();
      await page.waitForFunction(() => window.__game.cutscenes.active);
      await page.keyboard.press('Escape');
      await page.waitForFunction(id => window.__game.quests.state.targets[`construction:${id}`] === 'solved' && !window.__game.cutscenes.active, building);
      assert.equal(await page.evaluate(id => window.__game.gateBuilt(id), building), true);
    }
    assert.ok(await page.evaluate(() => window.__game.quests.readyToReport('construction')));
    assert.equal(await page.evaluate(() => window.__game.quests.status('construction')), 'active');
    await page.evaluate(() => { void window.__game.quests.modules.get('construction').onReport(); });
    await page.waitForFunction(() => window.__game.cutscenes.active);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game.quests.status('construction') === 'completed');
    assert.ok(await page.evaluate(() => !!window.__game.quests.state.rewards.construction));
    await button('Continue').click();
    await page.waitForFunction(() => window.__game.world.era === 'byui');
    await open('taylor', 'easy'); await select(piece.id);
    await cell(2, 2).hover();
    await page.screenshot({ path: path.join(out, 'held-shape-on-board.png') });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const resized = await page.locator('.bp-held-cell').first().boundingBox();
    assert.ok(Math.abs(resized.width - resized.height) < 1, 'Resizing must preserve square cells and shape proportions');
    assert.equal(await page.locator('.bp-cell.cursor').count(), 0);
    await button('Return piece').click(); await empty(); await leave();
    assert.deepEqual(errors, []);
    console.log(`PASS both Hard rotation controls, both Easy solutions, build montages, report-to-Bednar completion, reward, and no browser errors; screenshots: ${out}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
