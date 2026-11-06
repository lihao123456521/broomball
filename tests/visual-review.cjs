/* Capture the actual game at desktop sizes and check layout/scene diagnostics. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], remoteRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => { remoteRequests.push(route.request().url()); return route.abort(); });
  try {
    await page.clock.install();
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction(() => !!window.__BROOMBALL__);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
    await page.screenshot({ path: path.join(out, 'review-menu.png') });
    await page.locator('.mode-option[data-mode="training"]').click();
    await page.locator('#startBtn').click();
    await page.clock.runFor(500);
    await page.screenshot({ path: path.join(out, 'review-training.png') });
    const diagnostics = await page.evaluate(() => {
      const g = window.__BROOMBALL__;
      let staticMeshes = 0;
      g.scene.traverse(object => { if (object.name === 'StaticEnvironmentBatch') staticMeshes++; });
      return { calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, batching: g.environment?.batchStats, staticMeshes };
    });
    assert.ok(diagnostics.staticMeshes > 0, 'Environment loads and produces static batches');
    assert.ok(diagnostics.batching.originalMeshes > diagnostics.batching.batches * 3, 'Static objects are meaningfully batched');
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    await page.screenshot({ path: path.join(out, 'review-pause.png') });
    const viewports = [];
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 800, height: 600 }]) {
      await page.setViewportSize(viewport);
      await page.clock.runFor(100);
      await page.locator('#menuPauseBtn').click();
      await page.clock.runFor(100);
      const menuLayout = await page.evaluate(() => {
        const card = document.querySelector('#menu .menu-card');
        const bounds = card.getBoundingClientRect();
        return { width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, cardFits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight, scrollable: card.scrollHeight > card.clientHeight };
      });
      assert.ok(menuLayout.cardFits && !menuLayout.horizontalOverflow, 'Menu fits viewport ' + viewport.width);
      viewports.push(menuLayout);
      await page.screenshot({ path: path.join(out, `review-menu-${viewport.width}.png`) });
      await page.locator('#startBtn').click();
      await page.clock.runFor(500);
      assert.ok(await page.locator('.objective').isVisible(), 'Current objective stays visible at ' + viewport.width);
      await page.screenshot({ path: path.join(out, `review-training-${viewport.width}.png`) });
      await page.keyboard.press('Escape');
      await page.clock.runFor(100);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      const g = window.__BROOMBALL__;
      document.querySelectorAll('.overlay,.hud,#vignette').forEach(element => element.style.display = 'none');
      g.match.paused = true;
      g.camera.position.set(142, 112, 166);
      g.camera.lookAt(-30, 4, -30);
      g.camera.fov = 62;
      g.camera.updateProjectionMatrix();
    });
    await page.clock.runFor(100);
    await page.screenshot({ path: path.join(out, 'review-environment.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, [], 'Local entry must not even request CDN resources');
    const report = { diagnostics, viewports, errors, remoteRequests };
    fs.writeFileSync(path.join(out, 'visual-review.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('VISUAL_REVIEW_CAPTURE_PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
