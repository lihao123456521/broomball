/* Possession-led camera acceptance. Uses real match updates and keyboard events;
   isolated fixtures stop unrelated AI so every camera assertion has one cause. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'artifacts');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const report = { passed: [], failed: [], errors: [], requests: [], evidence: {} };
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route(/^https?:\/\//, route => { report.requests.push(route.request().url()); return route.abort(); });
    // Install before navigation: the game captures performance.now() at startup.
    await page.clock.install();
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__?.getMatchFocus));
    await page.evaluate(() => Promise.all([BroomModels.ready, __BROOMBALL__.modelScenery]));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const advance = milliseconds => page.clock.runFor(milliseconds);
    const check = async (name, run) => {
      try { await run(); report.passed.push(name); console.log('PASS', name); }
      catch (error) { report.failed.push({ name, message: error.message }); console.error('FAIL', name, error.message); }
    };
    const stage = async () => {
      for (const key of ['w', 'a', 's', 'd', 'j', 'k', 't', 'z', 'c', 'b', 'f', 'Tab', 'Shift']) await page.keyboard.up(key);
      await page.evaluate(() => {
        const g = __BROOMBALL__;
        g.startMatch('standard'); g.setCommentaryEnabled(false);
        Object.assign(g.match, { state: 'playing', paused: false, elapsed: 3, timeLeft: 177,
          kickoff: 0, pendingRestart: null, stealCooldown: 100, autoSwitch: true, cameraMode: 'broadcast' });
        g.clearInput(); g.setAim(0, 0);
        g.player.pos.set(0, 10, 20); g.player.previousPos.copy(g.player.pos);
        g.player.mesh.rotation.set(0, 0, 0); g.player.vel.set(0, 0, 0); g.player.stamina = 100;
        for (const u of [...g.allies, ...g.rivals]) {
          u.mesh.position.set(38, 32, 34); u.speed = 0; u.stun = 100;
          u.velocity?.set(0, 0, 0); g.resetAIFlight(u);
        }
        for (const b of g.bludgers) { b.mesh.position.set(-40, 35, 30); b.frozen = 100; }
        g.setCarrier('player');
      });
      await advance(1000);
    };
    const snapshot = () => page.evaluate(() => {
      const g = __BROOMBALL__, activity = g.getMatchFocus();
      g.camera.updateMatrixWorld(true);
      const project = p => {
        const q = p.clone().project(g.camera);
        return { x: (q.x * .5 + .5) * innerWidth, y: (1 - q.y) * .5 * innerHeight, z: q.z };
      };
      const forward = g.camera.getWorldDirection(new THREE.Vector3());
      return {
        width: innerWidth, height: innerHeight,
        phase: activity.phase, subject: activity.subject,
        position: activity.position.toArray(), ball: g.quaffle.position.toArray(), player: g.player.pos.toArray(),
        focus: [...g.cameraFraming.focus], distance: g.cameraFraming.distance,
        framingPhase: g.cameraFraming.phase, framingSubject: g.cameraFraming.subject,
        subjectScreen: project(activity.position.clone().add(new THREE.Vector3(0, 1.2, 0))),
        ballScreen: project(g.quaffle.position),
        elevation: Math.asin(-forward.y) * 180 / Math.PI,
        carrier: g.carrier === 'player' ? 'player' : g.carrier?.mesh.uuid || null,
        playerId: g.player.mesh.uuid,
      };
    });
    const assertVisible = (point, state, margin = .06) => {
      assert.ok(point.z > -1 && point.z < 1, `Subject is behind camera: ${JSON.stringify(point)}`);
      assert.ok(point.x > state.width * margin && point.x < state.width * (1 - margin), `Horizontal clipping: ${JSON.stringify(point)}`);
      assert.ok(point.y > state.height * margin && point.y < state.height * (1 - margin), `Vertical clipping: ${JSON.stringify(point)}`);
    };
    const assertCentred = state => {
      assertVisible(state.subjectScreen, state);
      assert.ok(Math.abs(state.subjectScreen.x / state.width - .5) < .12, JSON.stringify(state.subjectScreen));
      assert.ok(Math.abs(state.subjectScreen.y / state.height - .5) < .12, JSON.stringify(state.subjectScreen));
      assert.equal(state.framingPhase, state.phase); assert.equal(state.framingSubject, state.subject);
    };

    await check('The main camera follows player, teammate and distant opposition possession', async () => {
      await stage();
      const player = await snapshot(); assert.equal(player.phase, 'attack'); assert.equal(player.subject, player.playerId); assertCentred(player);
      const allyId = await page.evaluate(() => {
        const g = __BROOMBALL__; g.allies[0].mesh.position.set(-22, 14, -18); g.setCarrier(g.allies[0]); return g.allies[0].mesh.uuid;
      });
      await advance(850);
      const ally = await snapshot(); assert.equal(ally.phase, 'attack'); assert.equal(ally.subject, allyId); assertCentred(ally);
      const rivalId = await page.evaluate(() => {
        const g = __BROOMBALL__; g.player.pos.set(24, 10, 28); g.player.previousPos.copy(g.player.pos);
        g.rivals[0].mesh.position.set(-22, 12, -40); g.setCarrier(g.rivals[0]); return g.rivals[0].mesh.uuid;
      });
      await advance(850);
      const rival = await snapshot(); assert.equal(rival.phase, 'defend'); assert.equal(rival.subject, rivalId); assertCentred(rival);
      assert.ok(Math.hypot(...rival.position.map((value, i) => value - rival.player[i])) > 60, 'Opponent must be more than 60 m from the controlled player');
      assert.ok(Math.hypot(...rival.focus.map((value, i) => value - rival.player[i])) > 55, 'Camera must leave the controlled player behind');
      report.evidence.possession = { player, ally, rival };
    });

    await check('A long through pass stays visible and carries the focus away from its sender', async () => {
      await stage();
      await page.evaluate(() => {
        const g = __BROOMBALL__; g.allies[0].mesh.position.set(0, 10, -22); g.allies[0].stun = 0;
        g.allies[2].mesh.position.set(20, 10, 25); g.allies[2].stun = 0; g.setAim(0, 0);
      });
      await page.keyboard.press('k');
      assert.equal(await page.evaluate(() => __BROOMBALL__.passMode), 'through');
      const samples = [];
      for (let i = 0; i < 21; i++) {
        await advance(75); const state = await snapshot(); samples.push(state);
        assertVisible(state.ballScreen, state, .04);
        if (state.phase === 'pass') assert.equal(state.framingSubject, 'ball');
      }
      const flying = samples.filter(state => state.phase === 'pass');
      assert.ok(flying.length >= 8, 'Fixture should exercise a long ball flight');
      const first = flying[0], last = flying.at(-1);
      assert.ok(Math.hypot(...last.ball.map((value, i) => value - first.ball[i])) > 25, 'Ball must travel a meaningful distance');
      assert.ok(Math.hypot(...last.focus.map((value, i) => value - first.focus[i])) > 20, 'Focus must follow the flight');
      assert.ok(Math.hypot(...last.focus.map((value, i) => value - last.player[i])) > 25, 'Focus must not remain on the passer');
      report.evidence.longPass = samples;
    });

    await check('Shots and loose balls keep the camera following the actual ball', async () => {
      await stage(); await page.keyboard.press('f');
      const shotSamples = [];
      for (let i = 0; i < 10; i++) { await advance(100); const state = await snapshot(); assertVisible(state.ballScreen, state); shotSamples.push(state); }
      assert.ok(shotSamples.some(state => state.phase === 'shot' && state.framingSubject === 'ball'));
      assert.ok(Math.hypot(...shotSamples.at(-1).focus.map((value, i) => value - shotSamples[0].focus[i])) > 12);
      await stage();
      await page.evaluate(() => { const g = __BROOMBALL__; g.setCarrier(null); g.quaffle.position.set(-20, 18, -18); g.quaffleVel.set(14, 2, -12); });
      await advance(850); const loose = await snapshot(); assert.equal(loose.phase, 'loose'); assert.equal(loose.subject, 'ball'); assertCentred(loose);
      assert.ok(Math.hypot(...loose.focus.map((value, i) => value - loose.player[i])) > 30);
      report.evidence.ballStates = { shotSamples, loose };
    });

    await check('The default broadcast camera holds a slight overhead angle near 31 degrees', async () => {
      const samples = [report.evidence.possession?.player, report.evidence.possession?.rival,
        report.evidence.longPass?.[8], report.evidence.ballStates?.loose].filter(Boolean);
      assert.equal(samples.length, 4);
      for (const state of samples) assert.ok(state.elevation >= 28 && state.elevation <= 35, `Unexpected elevation: ${state.elevation}`);
      report.evidence.elevations = samples.map(state => state.elevation);
    });

    await check('C on defence selects the nearest available field teammate without moving the ball focus', async () => {
      await stage();
      const expected = await page.evaluate(() => {
        const g = __BROOMBALL__; g.rivals[0].mesh.position.set(-20, 12, -32);
        g.allies[0].mesh.position.set(-18, 12, -29); g.allies[0].stun = 0;
        g.allies[2].mesh.position.set(12, 10, 4); g.allies[2].stun = 0;
        g.allies[1].mesh.position.set(-20, 12, -31); g.allies[1].stun = 0;
        g.setCarrier(g.rivals[0]); return { defender: g.allies[0].mesh.uuid, carrier: g.rivals[0].mesh.uuid };
      });
      await advance(800); await page.keyboard.press('c'); await advance(200);
      const switched = await snapshot(); assert.equal(switched.playerId, expected.defender); assert.equal(switched.subject, expected.carrier); assert.equal(switched.phase, 'defend'); assertCentred(switched);
      // A stunned defender closer to the ball must not be selected.
      await stage();
      const available = await page.evaluate(() => {
        const g = __BROOMBALL__; g.rivals[0].mesh.position.set(-20, 12, -32);
        g.allies[0].mesh.position.set(-20, 12, -31); g.allies[0].stun = 8;
        g.allies[2].mesh.position.set(-12, 12, -25); g.allies[2].stun = 0;
        g.setCarrier(g.rivals[0]); return g.allies[2].mesh.uuid;
      });
      await page.keyboard.press('c'); assert.equal((await snapshot()).playerId, available);
      report.evidence.defensiveSwitch = switched;
    });

    await check('Possession remains readable in desktop and compact match views', async () => {
      const views = [];
      for (const [width, height] of [[1280, 720], [800, 600]]) {
        await page.setViewportSize({ width, height }); await stage();
        await page.evaluate(() => {
          const g = __BROOMBALL__; g.player.pos.set(0, 12, 4); g.player.previousPos.copy(g.player.pos);
          g.allies[0].mesh.position.set(15, 12, -10); g.allies[0].stun = 0;
          g.allies[2].mesh.position.set(-14, 14, -6); g.allies[2].stun = 0;
          g.rivals[0].mesh.position.set(0, 12, -4); g.rivals[0].stun = 0;
          g.setCarrier('player');
        });
        await advance(1000); const attack = await snapshot(); assertCentred(attack); assertVisible(attack.ballScreen, attack);
        await page.screenshot({ path: path.join(out, `ball-camera-attack-${width}.png`) });
        await page.evaluate(() => __BROOMBALL__.setCarrier(__BROOMBALL__.rivals[0]));
        await advance(850); const defence = await snapshot(); assertCentred(defence); assertVisible(defence.ballScreen, defence);
        await page.screenshot({ path: path.join(out, `ball-camera-defence-${width}.png`) });
        views.push({ width, height, attack, defence });
      }
      report.evidence.views = views;
    });

    assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); assert.deepEqual(report.failed, []);
    console.log('BALL_CAMERA_PASS');
  } finally {
    fs.writeFileSync(path.join(out, 'ball-camera.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
