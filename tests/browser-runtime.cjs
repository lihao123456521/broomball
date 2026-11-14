/* Frame-cadence regression using the real game loop and keyboard input. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'artifacts');
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} vs ${expected}`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: ['--enable-unsafe-swiftshader']
  });
  const report = { passed: [], evidence: {}, errors: [], blockedRequests: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route(/^https?:\/\//, route => {
      report.blockedRequests.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(() => {
      // Start before the game sets lastTime; render only the explicitly requested frames.
      let now = 0, nextId = 0;
      const callbacks = new Map();
      performance.now = () => now;
      window.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
      window.cancelAnimationFrame = id => callbacks.delete(id);
      window.__advanceRuntime = (milliseconds, render = true) => {
        now += milliseconds;
        if (!render) return;
        const current = [...callbacks.values()];
        callbacks.clear();
        for (const callback of current) callback(now);
      };
      // Pointer lock needs a native gesture and is unrelated to keyboard/timer assertions.
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
    });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
    const advance = (ms, render = true) => page.evaluate(({ ms, render }) => window.__advanceRuntime(ms, render), { ms, render });
    const snapshot = () => page.evaluate(() => {
      const g = window.__BROOMBALL__;
      return {
        state: g.match.state, paused: g.match.paused, elapsed: g.match.elapsed,
        timeLeft: g.match.timeLeft, countdown: g.match.countdown,
        cooldowns: [...g.match.cooldowns], shield: g.player.shield,
        position: g.player.pos.toArray(), speed: g.player.speed, aim: g.getAimState()
      };
    });
    const stage = async () => {
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.startMatch('standard');
        g.match.state = 'playing'; g.match.paused = false;
        g.match.elapsed = 0; g.match.timeLeft = 180; g.match.kickoff = 0;
        g.match.stealCooldown = 100; g.match.cooldowns = [10, 9, 8];
        g.player.pos.set(0, 10, 0); g.player.vel.set(0, 0, 0);
        g.player.shield = 4; g.setAim(0, 0); g.setCarrier(null);
        g.quaffle.position.set(35, 35, 40);
        for (const unit of [...g.rivals, ...g.allies]) {
          unit.mesh.position.set(35, 35, 40); unit.speed = 0; unit.stun = 100;
        }
        for (const ball of g.bludgers) { ball.mesh.position.set(-35, 35, 40); ball.frozen = 100; }
      });
    };
    const check = async (name, run) => {
      await run(); report.passed.push(name); console.log('PASS', name);
    };

    await check('Elapsed time, cooldowns and movement agree at 60 FPS, 10 FPS and 300 ms frames', async () => {
      const cadences = {
        normal: Array(60).fill(1000 / 60),
        low: Array(10).fill(100),
        slow: [300, 300, 300, 100]
      };
      const evidence = {};
      for (const [name, intervals] of Object.entries(cadences)) {
        await stage();
        await page.keyboard.down('w');
        for (const interval of intervals) await advance(interval);
        evidence[name] = await snapshot();
        await page.keyboard.up('w');
        near(evidence[name].elapsed, 1, name + ' elapsed');
        near(evidence[name].timeLeft, 179, name + ' remaining time');
        near(evidence[name].shield, 3, name + ' shield');
        evidence[name].cooldowns.forEach((value, i) => near(value, 9 - i, name + ' cooldown ' + i));
        assert.equal(evidence[name].paused, false);
      }
      for (const name of ['low', 'slow']) {
        evidence[name].position.forEach((value, i) => near(value, evidence.normal.position[i], name + ' position ' + i));
        near(evidence[name].speed, evidence.normal.speed, name + ' speed');
      }
      report.evidence.cadences = evidence;
    });

    await check('Countdown accepts keyboard yaw and pitch without moving the rider', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.match.state = 'countdown'; g.match.countdown = 3;
      });
      const before = await snapshot();
      for (const key of ['ArrowLeft', 'i', 'w', 'Space']) await page.keyboard.down(key);
      for (let i = 0; i < 10; i++) await advance(100);
      for (const key of ['ArrowLeft', 'i', 'w', 'Space']) await page.keyboard.up(key);
      const left = await snapshot();
      assert.equal(left.state, 'countdown');
      assert.deepEqual(left.position, before.position);
      near(left.countdown, 2, 'Countdown remains in real time');
      near(left.aim.targetYaw, 2.2, 'Left turn target');
      near(left.aim.targetPitch, 1.05, 'Upward pitch is clamped');
      assert.ok(left.aim.yaw > 2 && left.aim.yaw < left.aim.targetYaw, 'Yaw eases toward keyboard target');
      await page.keyboard.down('ArrowRight'); await page.keyboard.down('k');
      await advance(300);
      await page.keyboard.up('ArrowRight'); await page.keyboard.up('k');
      const right = await snapshot();
      near(right.aim.targetYaw, 1.54, 'Right turn target');
      near(right.aim.targetPitch, .705, 'Downward pitch');
      assert.deepEqual(right.position, before.position);
      report.evidence.countdownLook = { before, left, right };
    });

    await check('A long frame pauses gameplay and discards held movement without advancing clocks', async () => {
      await stage();
      await page.keyboard.down('w');
      await advance(100);
      const before = await snapshot();
      await advance(750);
      const paused = await snapshot();
      assert.equal(paused.paused, true);
      assert.ok(await page.locator('#pause').isVisible());
      near(paused.elapsed, before.elapsed, 'Stall elapsed');
      near(paused.timeLeft, before.timeLeft, 'Stall time left');
      near(paused.shield, before.shield, 'Stall shield');
      assert.deepEqual(paused.cooldowns, before.cooldowns);
      assert.deepEqual(paused.position, before.position);
      near(paused.speed, 0, 'Held movement is cleared');
      await advance(5000);
      assert.deepEqual(await snapshot(), paused, 'Paused frames keep gameplay frozen');
      await page.evaluate(() => window.__BROOMBALL__.resumeMatch());
      await advance(100);
      const resumed = await snapshot();
      assert.equal(resumed.paused, false);
      near(resumed.elapsed, before.elapsed + .1, 'Resumed elapsed');
      assert.deepEqual(resumed.position, before.position, 'Held W does not stick after automatic pause');
      await page.keyboard.up('w');
      report.evidence.longFrame = { before, paused, resumed };
    });

    await check('Resume and restart reset the time baseline after frames stop in the background', async () => {
      await stage();
      await advance(100);
      await page.evaluate(() => window.__BROOMBALL__.pauseMatch());
      await advance(5000, false);
      await page.evaluate(() => window.__BROOMBALL__.resumeMatch());
      await advance(100);
      const resumed = await snapshot();
      assert.equal(resumed.paused, false);
      near(resumed.elapsed, .2, 'Resume ignores the paused interval');
      await advance(5000, false);
      await page.evaluate(() => window.__BROOMBALL__.restartMatch());
      await advance(100);
      const restarted = await snapshot();
      assert.equal(restarted.paused, false);
      assert.equal(restarted.state, 'countdown');
      near(restarted.countdown, 2.9, 'Restart starts a fresh countdown');
      report.evidence.backgroundFrames = { resumed, restarted };
    });

    assert.deepEqual(report.errors, [], 'No unhandled game errors');
    assert.deepEqual(report.blockedRequests, [], 'The game is fully local');
    console.log('BROWSER_RUNTIME_PASS');
  } finally {
    fs.writeFileSync(path.join(out, 'runtime.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
