/* Real browser regression for flight, goal geometry and scoring direction. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'artifacts');
const offline = process.argv.includes('--file');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', target.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript');
    res.end(data);
  });
});

(async () => {
  const report = { passed: [], evidence: {}, errors: [], blockedRequests: [] };
  let browser;
  try {
    if (!offline) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
      args: ['--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.clock.install();
    if (offline) await page.route(/^https?:\/\//, route => {
      report.blockedRequests.push(route.request().url());
      return route.abort();
    });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(offline ? pathToFileURL(path.join(root, 'index.html')).href : `http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__BROOMBALL__);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const advance = ms => page.clock.runFor(ms);
    const state = () => page.evaluate(() => {
      const g = window.__BROOMBALL__;
      return { score: [g.match.playerScore, g.match.rivalScore], ball: g.quaffle.position.toArray(), velocity: g.quaffleVel.toArray(), stats: { ...g.match.stats }, carrier: g.carrier === 'player' ? 'player' : g.carrier ? 'AI' : null };
    });
    const check = async (name, run) => {
      await run();
      report.passed.push(name);
      console.log('PASS', name);
    };
    const stage = async () => {
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.startMatch('standard');
        Object.assign(g.match, { state: 'playing', paused: false, elapsed: 3, timeLeft: 180, kickoff: 0, stealCooldown: 100, snitchActive: false });
        g.player.pos.set(0, 30, 30);
        g.player.previousPos.copy(g.player.pos);
        g.player.vel.set(0, 0, 0);
        g.setAim(0, 0);
        g.setCarrier(null);
        g.quaffle.position.set(30, 30, 20);
        for (const unit of [...g.rivals, ...g.allies]) {
          unit.mesh.position.set(35, 35, 40);
          unit.speed = 0;
          unit.stun = 100;
        }
        for (const b of g.bludgers) { b.mesh.position.set(-35, 35, 40); b.frozen = 100; }
      });
      await advance(100);
    };
    const freeFlight = async (position, velocity) => {
      await page.evaluate(({ position, velocity }) => {
        const g = window.__BROOMBALL__;
        g.setCarrier(null);
        g.quaffle.position.fromArray(position);
        g.quaffleVel.fromArray(velocity);
      }, { position, velocity });
    };

    await check('A manual midfield shot stays in flight until the actual goal plane', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(-0.95, 13.85, 5);
        g.player.previousPos.copy(g.player.pos);
        g.player.mesh.rotation.set(0, 0, 0);
        g.setAim(0, 0);
        g.setCarrier('player');
      });
      await page.keyboard.press('f');
      const release = await state();
      assert.equal(release.stats.shots, 1, 'F launches a real player shot');
      assert.equal(release.carrier, null);
      assert.ok(Math.abs(Math.hypot(...release.velocity) - 24) < 0.01);
      await advance(2600);
      const beforePlane = await state();
      assert.deepEqual(beforePlane.score, [0, 0], 'No early score before the plane');
      assert.ok(beforePlane.ball[2] > -61 && beforePlane.ball[2] < -56, 'Shot has traveled for longer than the old 2.4 s timeout');
      assert.ok(Math.abs(beforePlane.ball[1] - release.ball[1]) < 0.01, 'Shot keeps its original trajectory without premature free-ball gravity');
      assert.ok(Math.abs(beforePlane.velocity[1]) < 0.01);
      await advance(400);
      const scored = await state();
      assert.deepEqual(scored.score, [10, 0], 'A real midfield flight scores after crossing');
      assert.equal(scored.stats.goals, 1);
      await advance(1800);
      assert.deepEqual((await state()).score, [10, 0], 'One flight cannot score again after resetting');
      report.evidence.midfieldShot = { release, beforePlane, scored };
    });

    const geometry = await page.evaluate(() => {
      const g = window.__BROOMBALL__;
      const goal = g.awayGoals[1];
      let hoopInnerRadius = Infinity;
      g.scene.updateMatrixWorld(true);
      // Read the rendered central hoop, including the material-batched mesh.
      g.scene.traverse(node => {
        if (!node.isMesh || node.material?.color?.getHex() !== 0x75b9ed) return;
        const positions = node.geometry.getAttribute('position');
        const point = new window.THREE.Vector3();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
          const radius = Math.hypot(point.x - goal.x, point.y - goal.y);
          if (Math.abs(point.z - goal.z) < 0.3 && radius < 5) hoopInnerRadius = Math.min(hoopInnerRadius, radius);
        }
      });
      let ballRadius = 0;
      g.quaffle.traverse(node => {
        const p = node.geometry?.parameters;
        if (node.geometry?.type === 'SphereGeometry') ballRadius = Math.max(ballRadius, p.radius);
        if (node.geometry?.type === 'TorusGeometry') ballRadius = Math.max(ballRadius, p.radius + p.tube);
      });
      return { hoopInnerRadius, ballRadius, clearance: hoopInnerRadius - ballRadius };
    });
    report.evidence.geometry = geometry;
    assert.ok(geometry.clearance > 2 && geometry.clearance < 2.5);

    for (const sign of [-1, 1]) {
      const expected = sign < 0 ? [10, 0] : [0, 10];
      await check(`An unowned ball crossing the ${sign < 0 ? 'away' : 'home'} goal scores once`, async () => {
        await stage();
        await freeFlight([0, 15, sign * 59.8], [0, 0, sign * 24]);
        await advance(200);
        const scored = await state();
        assert.deepEqual(scored.score, expected, 'Scoring follows the crossed goal rather than shot ownership');
        await advance(1000);
        assert.deepEqual((await state()).score, expected, 'Reset ball cannot retrigger the goal');
      });
      await check(`A ball entering the ${sign < 0 ? 'away' : 'home'} goal from behind does not score`, async () => {
        await stage();
        await freeFlight([0, 15, sign * 62], [0, 0, -sign * 24]);
        await advance(200);
        assert.deepEqual((await state()).score, [0, 0]);
      });
    }

    for (const [label, playerZ, ballZ] of [
      ['A player at the goal line catches a loose ball before a goal', -61, -60.9],
      ['A player behind the goal catches when their receiving radius is reached first', -65, -60.7]
    ]) {
      await check(label, async () => {
        await stage();
        await advance(400); // Let the setCarrier(null) pickup protection expire.
        await page.evaluate(({ playerZ, ballZ }) => {
          const g = window.__BROOMBALL__;
          g.player.pos.set(0, 15, playerZ);
          g.player.previousPos.copy(g.player.pos);
          g.quaffle.position.set(0, 15, ballZ);
          g.quaffleVel.set(0, 0, -24);
          g.updateQuaffle(1 / 60);
        }, { playerZ, ballZ });
        const caught = await state();
        assert.equal(caught.carrier, 'player', 'First contact with the receiving radius awards possession');
        assert.deepEqual(caught.score, [0, 0], 'A caught ball cannot also score in the same step');
      });
    }
    await check('A goal preceding contact with a player behind the goal still scores', async () => {
      await stage();
      await advance(400);
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(0, 15, -65.4);
        g.player.previousPos.copy(g.player.pos);
        g.quaffle.position.set(0, 15, -60.9);
        g.quaffleVel.set(0, 0, -24);
        g.updateQuaffle(1 / 60);
      });
      const scored = await state();
      assert.deepEqual(scored.score, [10, 0], 'Goal-plane crossing occurs before entering the 4.2 m catch radius');
      assert.equal(scored.carrier, null, 'Contact later in the old segment cannot cancel a goal');
    });
    await check('An active keeper saves a loose ball before it crosses the goal plane', async () => {
      await stage();
      await advance(400);
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        const keeper = g.rivals.find(unit => unit.role === 'keeper');
        keeper.stun = 0;
        keeper.mesh.position.set(0, 14.15, -62.5);
        g.quaffle.position.set(0, 15, -60.7);
        g.quaffleVel.set(0, 0, -24);
        g.updateQuaffle(1 / 60);
      });
      const saved = await state();
      assert.deepEqual(saved.score, [0, 0]);
      assert.ok(saved.carrier === 'AI' || saved.velocity[2] > 0, 'Keeper contact before the goal catches or deflects the ball');
    });
    await check('T receives a keeper return behind the keeper without a sender self-catch', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        const keeper = g.allies.find(unit => unit.role === 'keeper');
        g.player.pos.set(0, 15, 60);
        g.player.previousPos.copy(g.player.pos);
        keeper.mesh.position.set(0, 14, 53);
        keeper.mesh.rotation.set(0, 0, 0);
        keeper.stun = 0;
        g.setCarrier(keeper);
      });
      await page.keyboard.press('t');
      const release = await state();
      assert.equal(release.carrier, null, 'T asks the nearby keeper to release the ball');
      assert.ok(release.velocity[2] > 0, 'Keeper sends the ball backward toward the waiting player');
      await advance(60);
      const flight = await state();
      assert.equal(flight.carrier, null, 'A keeper cannot immediately catch their own released pass');
      assert.ok(flight.ball[2] > release.ball[2] + 0.5, 'The return has an observable flight');
      await advance(600);
      const caught = await state();
      assert.equal(caught.carrier, 'player', 'The returning ball reaches the waiting player');
      assert.deepEqual(caught.score, [0, 0]);
      report.evidence.keeperReturn = { release, flight, caught };
    });

    await check('A ball that fits wholly inside the visible hoop scores', async () => {
      await stage();
      await freeFlight([geometry.clearance - 0.03, 15, -59.8], [0, 0, -24]);
      await advance(200);
      assert.deepEqual((await state()).score, [10, 0]);
    });
    await check('A ball clipping the visible hoop does not score', async () => {
      await stage();
      await freeFlight([geometry.clearance + 0.03, 15, -59.8], [0, 0, -24]);
      await advance(200);
      assert.deepEqual((await state()).score, [0, 0]);
    });
    await check('A shot through the home goal awards the opposing team', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(0.95, 13.85, 59);
        g.player.previousPos.copy(g.player.pos);
        g.player.mesh.rotation.set(0, Math.PI, 0);
        g.setAim(Math.PI, 0);
        g.setCarrier('player');
      });
      await page.keyboard.press('f');
      await advance(200);
      const ownGoal = await state();
      assert.deepEqual(ownGoal.score, [0, 10], 'The crossed end determines the scoring team even for a player shot');
      assert.equal(ownGoal.stats.shots, 1);
      assert.equal(ownGoal.stats.goals, 0, 'An own goal is not a goal scored by the home team');
    });
    await check('A goal reset does not create a phantom flight through a nearby player', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(-0.95, 13.85, -59);
        g.player.mesh.rotation.set(0, 0, 0);
        g.setAim(0, 0);
        g.setCarrier('player');
        g.throwQuaffle();
        // This position lies on the old shot-to-midfield reset segment, but
        // is nowhere near the actual shot or the restarted centre ball.
        g.player.pos.set(0, 11.5, -25);
        g.player.previousPos.copy(g.player.pos);
      });
      await advance(200);
      const reset = await state();
      assert.deepEqual(reset.score, [10, 0]);
      assert.equal(reset.carrier, null, 'The old shot segment cannot award possession after a goal');
      assert.deepEqual(reset.ball, [0, 9, 0], 'The centre ball remains at the restart location');
      assert.deepEqual(reset.velocity, [0, 0, 0]);
      report.evidence.goalReset = reset;
    });
    await check('Carrying a ball through a goal does not count as a throw', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(-0.95, 13.85, -59.5);
        g.player.previousPos.copy(g.player.pos);
        g.player.mesh.rotation.set(0, 0, 0);
        g.setAim(0, 0);
        g.setCarrier('player');
      });
      await page.keyboard.down('w');
      await advance(500);
      await page.keyboard.up('w');
      const carried = await state();
      assert.equal(carried.carrier, 'player');
      assert.ok(carried.ball[2] < -61);
      assert.deepEqual(carried.score, [0, 0]);
    });
    assert.deepEqual(report.errors, [], 'No page exceptions');
    assert.deepEqual(report.blockedRequests, [], 'Offline build needs no external resources');
    console.log('BROWSER_RULES_PASS');
  } catch (error) {
    report.failure = error.stack;
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, offline ? 'rules-offline.json' : 'rules.json'), JSON.stringify(report, null, 2));
  }
})();
