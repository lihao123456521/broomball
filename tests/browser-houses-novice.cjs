/* Offline browser regression for house selection and ball handling. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts');
const baseline = process.argv.includes('--baseline');
const baselineRevision = baseline ? process.env.BROOMBALL_BASELINE || '031de47c31901ffd58f5fd92955b9681135a802e' : null;
const prefix = baseline ? 'houses-novice-baseline' : 'houses-novice';
const documentPath = path.join(root, baseline ? `.${prefix}-${process.pid}.html` : 'index.html');
const url = pathToFileURL(documentPath).href;
const report = { baseline, baselineRevision, url, passed: [], failed: [], evidence: {}, pageErrors: [], blockedRequests: [] };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  let browser;
  let page;
  try {
    if (baseline) {
      const original = execFileSync('git', ['show', `${baselineRevision}:index.html`], { cwd: root, maxBuffer: 2 ** 24 });
      fs.writeFileSync(documentPath, original, { flag: 'wx' });
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
      args: ['--enable-unsafe-swiftshader']
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(8000);
    await page.clock.install();
    await page.route(/^https?:\/\//, route => {
      report.blockedRequests.push(route.request().url());
      return route.abort();
    });
    page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));

    const game = (callback, argument) => page.evaluate(callback, argument);
    const advance = ms => page.clock.runFor(ms);
    const screenshot = name => page.screenshot({ path: path.join(out, `${prefix}-${name}.png`) });
    const check = async (name, run) => {
      try {
        await run();
        report.passed.push(name);
        console.log('PASS', name);
      } catch (error) {
        report.failed.push({ name, error: error.stack });
        console.error('FAIL', name, error.message);
        await screenshot('failure-' + report.failed.length).catch(() => {});
      }
    };
    const waitForPlay = async () => {
      for (let i = 0; i < 20; i++) {
        if (await game(() => window.__BROOMBALL__.match.state === 'playing')) return;
        await advance(170);
      }
      assert.fail('Countdown never entered play');
    };
    const start = async mode => {
      await game(() => window.__BROOMBALL__.returnToMenu());
      await advance(32);
      await page.locator(`.mode-option[data-mode="${mode}"]`).click();
      await page.locator('#startBtn').click();
      await waitForPlay();
    };
    const status = () => game(() => {
      const g = window.__BROOMBALL__;
      return {
        carrier: g.carrier === 'player' ? 'player' : g.allies.includes(g.carrier) ? 'ally' : g.carrier ? 'rival' : null,
        player: g.player.pos.toArray(),
        ball: g.quaffle.position.toArray(),
        velocity: g.quaffleVel.toArray(),
        distance: g.player.pos.distanceTo(g.quaffle.position),
        kickoff: g.match.kickoff,
        protection: g.match.stealCooldown,
        stats: { ...g.match.stats },
        spells: g.match.cooldowns.slice()
      };
    });
    // Keep the actual game loop and keyboard handlers. Fixtures position the ball and isolate other players.
    const stage = async (mode = 'standard') => {
      await start(mode);
      await game(() => {
        const g = window.__BROOMBALL__;
        g.clearInput();
        g.match.kickoff = 0;
        g.match.stealCooldown = 0;
        g.player.pos.set(0, 10, 0);
        g.setAim(Math.PI, 0);
        g.setCarrier(null);
        g.quaffle.position.set(40, 26, 35);
        for (const unit of [...g.rivals, ...g.allies]) {
          unit.mesh.position.set(-35, 34, 38);
          unit.speed = 0;
          unit.stun = 60;
        }
        for (const bludger of g.bludgers) bludger.frozen = 60;
      });
      await advance(380);
    };
    const freeBall = (position, velocity = [0, 0, 0]) => game(({ position, velocity }) => {
      const g = window.__BROOMBALL__;
      g.quaffle.position.fromArray(position);
      g.quaffleVel.fromArray(velocity);
    }, { position, velocity });
    await check('Standard kickoff lets W reach and collect the contested ball', async () => {
      await start('standard');
      const opening = await status();
      const crossing = [];
      await page.keyboard.down('w');
      try {
        for (let i = 0; i < 12; i++) {
          await advance(180);
          crossing.push(await status());
        }
      } finally {
        await page.keyboard.up('w');
      }
      report.evidence.kickoffW = { opening, crossing };
      assert.equal(opening.carrier, null, 'Standard opens with a free ball');
      assert.ok(crossing.some(sample => sample.carrier === 'player'), 'W reaches and picks up the opening ball on the first crossing');
      await screenshot('kickoff');
    });

    await check('A manual shot has a slower measurable flight', async () => {
      await stage();
      await freeBall([0, 10.5, 0]);
      await advance(80);
      const held = await status();
      assert.equal(held.carrier, 'player', 'Positioning beside the ball still requires live pickup');
      await page.keyboard.press('f');
      const release = await status();
      await advance(220);
      const flight = await status();
      const speed = Math.hypot(...release.velocity);
      report.evidence.shot = { held, release, flight, speed };
      assert.equal(release.carrier, null);
      assert.ok(speed >= 20 && speed <= 28, 'Manual shots are slower than the 39 m/s baseline');
      assert.ok(flight.ball[2] > release.ball[2] + 2, 'The ball travels along the manual aim direction');
      assert.equal(flight.stats.shots, 1);
    });

    if (!baseline) {
    await check('T requests a nearby allied ball through a real return flight and catch', async () => {
      await stage();
      await game(() => {
        const g = window.__BROOMBALL__, sender = g.allies[0];
        g.match.elapsed = 3;
        sender.mesh.position.set(0, 10, 25);
        sender.stun = 0;
        g.setCarrier(sender);
      });
      assert.equal((await status()).carrier, 'ally');
      await page.keyboard.press('t');
      const release = await status();
      assert.equal(release.carrier, null, 'Request releases the allied ball instead of giving instant possession');
      assert.ok(Math.abs(Math.hypot(...release.velocity) - 22) < 0.01, 'Return pass launches at 22 m/s');
      await advance(180);
      const flight = await status();
      assert.equal(flight.carrier, null, 'Ball remains in flight before reaching the player');
      assert.ok(flight.distance < release.distance - 2, 'Live frames move the returned ball toward the player');
      await screenshot('return-pass-flight');
      await advance(1300);
      const caught = await status();
      assert.equal(caught.carrier, 'player', 'Live pass trajectory reaches and is received by the player');
      assert.equal(caught.stats.passes, 0, 'An allied return does not count as a player-thrown pass');
      report.evidence.nearbyReturnPass = { release, flight, caught };
    });

    await check('T asks a distant carrier to approach before returning the ball', async () => {
      await stage();
      await game(() => {
        const g = window.__BROOMBALL__, sender = g.allies[0];
        g.match.elapsed = 3;
        sender.mesh.position.set(45, 10, 0);
        sender.speed = 14;
        sender.stun = 0;
        g.setCarrier(sender);
      });
      const senderDistance = () => game(() => {
        const g = window.__BROOMBALL__;
        return { distance: g.allies[0].mesh.position.distanceTo(g.player.pos), request: g.match.callForPass };
      });
      await page.keyboard.press('t');
      const requested = { ...await status(), ...await senderDistance() };
      assert.equal(requested.carrier, 'ally', 'Out-of-range request keeps the ball with its carrier');
      assert.ok(requested.request > 0 && requested.distance > 38);
      // The teammate must turn and accelerate before it can close the gap.
      // Observe that approach without assuming an immediate sideways velocity.
      const approachSamples = [];
      let approaching;
      for (let i = 0; i < 20; i++) {
        await advance(100);
        approaching = { ...await status(), ...await senderDistance() };
        approachSamples.push(approaching);
        if (approaching.distance < requested.distance - 1) break;
      }
      assert.equal(approaching.carrier, 'ally');
      assert.ok(approaching.distance < requested.distance - 1, 'The carrier turns and accelerates toward the player');
      const samples = [];
      for (let i = 0; i < 35; i++) {
        await advance(100);
        const sample = { ...await status(), sender: await senderDistance() };
        samples.push(sample);
        if (sample.carrier === 'player') break;
      }
      const flight = samples.filter(sample => sample.carrier === null);
      assert.ok(flight.length >= 3, 'The approach is followed by an observable return flight');
      assert.ok(flight[0].sender.distance <= 38.1, 'Return starts after entering request range');
      assert.ok(flight.at(-1).distance < flight[0].distance - 5);
      assert.equal(samples.at(-1).carrier, 'player', 'The approaching teammate completes the return and catch');
      report.evidence.distantReturnPass = { requested, approaching, approachSamples, samples };
    });

    await check('A moving player can request a return, brake after reacting, and catch it', async () => {
      await stage();
      await game(() => {
        const g = window.__BROOMBALL__, sender = g.allies[0];
        g.match.elapsed = 3;
        g.setAim(0, 0);
        sender.mesh.position.set(0, 10, 25);
        sender.stun = 0;
        g.setCarrier(sender);
      });
      await page.keyboard.down('w');
      await advance(350);
      await page.keyboard.press('t');
      const release = await status();
      await advance(650);
      const reacting = await status();
      assert.equal(reacting.carrier, null, 'Moving away leaves the requested ball in flight');
      assert.ok(reacting.distance > 10, 'The player has not received a teleporting return');
      assert.match(await page.locator('#assistHint').textContent(), /X.*减速.*接球/, 'In-flight HUD tells a moving player how to receive the return');
      await page.keyboard.down('x');
      const samples = [];
      try {
        for (let i = 0; i < 30; i++) {
          await advance(100);
          const sample = await status();
          samples.push(sample);
          if (sample.carrier === 'player') break;
        }
      } finally {
        await page.keyboard.up('x');
        await page.keyboard.up('w');
      }
      assert.equal(samples.at(-1).carrier, 'player', 'X brakes held W enough to catch the live return');
      report.evidence.movingReturnPass = { release, reacting, samples };
    });

    await check('Continuing to fly away from a return gives guidance and an explicit miss', async () => {
      await stage();
      await game(() => {
        const g = window.__BROOMBALL__, sender = g.allies[0];
        g.match.elapsed = 3;
        g.player.pos.set(0, 10, 35);
        g.setAim(0, 0);
        sender.mesh.position.set(0, 10, 60);
        sender.stun = 0;
        g.setCarrier(sender);
      });
      await page.keyboard.down('w');
      const samples = [];
      let guidance, miss;
      try {
        await advance(350);
        await page.keyboard.press('t');
        await advance(80);
        guidance = await page.locator('#assistHint').textContent();
        assert.match(guidance, /X.*减速.*接球/);
        for (let i = 0; i < 4; i++) {
          await advance(1000);
          samples.push(await status());
        }
        miss = await game(() => window.__BROOMBALL__.match.message);
      } finally {
        await page.keyboard.up('w');
      }
      assert.ok(samples.every(sample => sample.carrier !== 'player'), 'A player who continually flies away does not receive a teleporting catch');
      assert.ok(samples[1].distance > 10, 'Sustained 22 m/s flight remains ahead of the slow return');
      assert.match(miss, /传球落空/, 'A return that expires explicitly tells the player it missed');
      report.evidence.unreceivedMovingReturn = { guidance, samples, miss };
    });
    }

    await check('Keyboard turning ramps in and settles promptly after release', async () => {
      await stage();
      const direction = () => game(() => {
        const g = window.__BROOMBALL__;
        const vector = g.camera.getWorldDirection(new window.THREE.Vector3());
        return Math.atan2(vector.x, -vector.z);
      });
      const angleStep = (before, after) => Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)));
      const samples = [await direction()];
      await page.keyboard.down('ArrowRight');
      try {
        for (let i = 0; i < 8; i++) {
          await advance(60);
          samples.push(await direction());
        }
      } finally {
        await page.keyboard.up('ArrowRight');
      }
      const released = samples.at(-1);
      await advance(180);
      const settled = await direction();
      await advance(180);
      const stable = await direction();
      const steps = samples.slice(1).map((angle, i) => angleStep(samples[i], angle));
      report.evidence.keyboardTurn = { samples, steps, released, settled, stable };
      assert.ok(angleStep(samples[0], released) > 0.25, 'A deliberate turn visibly changes the view');
      assert.ok(steps[0] < Math.max(...steps.slice(2)) * 0.85, 'Turn starts below its sustained rate');
      assert.ok(angleStep(released, stable) < 0.28, 'Release does not cause a long coast');
      assert.ok(angleStep(settled, stable) < 0.025, 'Turning settles quickly');
    });

    await check('Four house choices appear in the main menu', async () => {
      await game(() => window.__BROOMBALL__.returnToMenu());
      await advance(32);
      const options = page.locator('.house-option[data-house]');
      assert.equal(await options.count(), 4);
      const ids = await options.evaluateAll(buttons => buttons.map(button => button.dataset.house));
      assert.equal(new Set(ids).size, 4);
      report.evidence.houseOptions = ids;
      await screenshot('menu');
    });

    if (baseline) return;

    await check('Countdown mouse look eases while the player remains still', async () => {
      await game(() => window.__BROOMBALL__.returnToMenu());
      await advance(32);
      await page.locator('#startBtn').click();
      const before = await game(() => {
        const g = window.__BROOMBALL__;
        g.setAim(0, 0);
        const result = { state: g.match.state, position: g.player.pos.toArray(), aim: g.getAimState() };
        g.handleLookInput(210, -80);
        return result;
      });
      assert.equal(before.state, 'countdown');
      await advance(50);
      const during = await game(() => {
        const g = window.__BROOMBALL__;
        return { state: g.match.state, position: g.player.pos.toArray(), aim: g.getAimState() };
      });
      assert.equal(during.state, 'countdown');
      assert.deepEqual(during.position, before.position, 'Looking around does not move the countdown player');
      assert.ok(Math.abs(during.aim.yaw - before.aim.yaw) > 0.02, 'Countdown frames advance the smoothed camera yaw');
      assert.ok(Math.abs(during.aim.yaw - before.aim.yaw) < Math.abs(during.aim.targetYaw - before.aim.yaw), 'Countdown look remains smoothed');
      report.evidence.countdownLook = { before, during };
    });

    await check('Mouse look input eases toward the requested direction', async () => {
      await stage();
      // Exercise the pointer-lock event's input boundary without simulating a native pointer device.
      const input = await game(() => {
        const g = window.__BROOMBALL__;
        g.setAim(0, 0);
        const initial = g.getAimState();
        g.handleLookInput(210, -80);
        return { initial, queued: g.getAimState() };
      });
      const read = () => game(() => window.__BROOMBALL__.getAimState());
      await advance(50);
      const moving = await read();
      await advance(300);
      const settled = await read();
      report.evidence.mouseLook = { ...input, moving, settled };
      assert.equal(input.queued.yaw, input.initial.yaw, 'A pointer delta does not snap the current yaw');
      assert.ok(Math.abs(input.queued.targetYaw - input.initial.yaw) > 0.2);
      assert.ok(Math.abs(input.queued.targetPitch - input.initial.pitch) > 0.05);
      const travel = Math.abs(moving.yaw - input.initial.yaw);
      assert.ok(travel > 0.02 && travel < Math.abs(input.queued.targetYaw - input.initial.yaw));
      assert.ok(Math.abs(settled.yaw - settled.targetYaw) < 0.02);
      assert.ok(Math.abs(settled.pitch - settled.targetPitch) < 0.02);
    });

    await check('The ball marker identifies the visible ball and points toward an offscreen ball', async () => {
      await stage();
      const marker = page.locator('#ballMarker');
      const readMarker = () => game(() => {
        const g = window.__BROOMBALL__;
        const node = document.getElementById('ballMarker');
        const rect = node.getBoundingClientRect();
        const position = g.quaffle.position.clone().project(g.camera);
        return {
          location: node.dataset.location,
          text: document.getElementById('ballMarkerText').textContent,
          center: [rect.x + rect.width / 2, rect.y + rect.height / 2],
          projected: [(1 + position.x) * innerWidth / 2, (1 - position.y) * innerHeight / 2],
          viewport: [innerWidth, innerHeight]
        };
      });
      await freeBall([6, 13, 26], [2, 0, 0]);
      await advance(80);
      const visible = await readMarker();
      assert.equal(visible.location, 'onscreen');
      assert.ok(await marker.isVisible());
      assert.match(visible.text, /球/);
      assert.ok(Math.hypot(...visible.center.map((coordinate, i) => coordinate - visible.projected[i])) < 100);
      await screenshot('ball-onscreen');
      await freeBall([30, 15, -28]);
      await advance(80);
      const offscreen = await readMarker();
      assert.equal(offscreen.location, 'offscreen');
      assert.ok(await marker.isVisible());
      assert.ok(offscreen.center.every((coordinate, i) => coordinate > 0 && coordinate < offscreen.viewport[i]));
      const edge = Math.min(...offscreen.center, ...offscreen.center.map((coordinate, i) => offscreen.viewport[i] - coordinate));
      assert.ok(edge < 140, 'Offscreen marker stays near a viewport edge');
      await screenshot('ball-offscreen');
      await freeBall([0, 10.5, 0]);
      await advance(80);
      assert.equal((await status()).carrier, 'player');
      assert.equal(await marker.getAttribute('data-location'), 'hidden');
      report.evidence.ballMarker = { visible, offscreen };
    });

    await check('House selection persists and synchronizes teams, uniforms and map', async () => {
      await game(() => window.__BROOMBALL__.returnToMenu());
      await advance(32);
      const readHouse = () => game(() => {
        const g = window.__BROOMBALL__;
        const decor = g.scene.getObjectByName('HouseStands');
        const uniforms = [g.player, ...g.allies, ...g.rivals].map(({ mesh }) => ({
          id: mesh.userData.houseId,
          coat: '#' + mesh.userData.rig.body.children[0].material.color.getHexString(),
          scarf: '#' + mesh.userData.rig.scarfTail.children[0].material.color.getHexString()
        }));
        return {
          home: g.match.homeHouse,
          away: g.match.awayHouse,
          uniforms,
          decor: decor && {
            home: decor.userData.homeHouse,
            away: decor.userData.awayHouse,
            stands: decor.children.filter(child => child.name.startsWith('HouseStand:')).map(child => child.name.split(':')[1])
          },
          homeScore: document.querySelector('#playerScore').parentElement.textContent,
          awayScore: document.querySelector('#rivalScore').parentElement.textContent,
          homeGoal: g.homeGoals[1].z,
          awayGoal: g.awayGoals[1].z
        };
      });
      const houses = await game(() => window.__BROOMBALL__.houses);
      assert.equal(houses.length, 4);
      const byId = new Map(houses.map(house => [house.id, house]));
      const uniform = id => ({ id, coat: byId.get(id).color, scarf: byId.get(id).secondary });
      const changes = [];
      for (const id of report.evidence.houseOptions) {
        await page.locator(`.house-option[data-house="${id}"]`).click();
        await advance(32);
        const active = await readHouse();
        assert.equal(active.home, id);
        assert.notEqual(active.home, active.away);
        assert.deepEqual(active.uniforms, [...Array(3).fill(uniform(id)), ...Array(4).fill(uniform(active.away))]);
        assert.equal(active.decor.home, id);
        assert.equal(active.decor.away, active.away);
        assert.deepEqual(active.decor.stands.slice().sort(), Array.from(byId.keys()).sort());
        assert.ok(active.homeScore.includes(byId.get(id).name));
        assert.ok(active.awayScore.includes(byId.get(active.away).name));
        assert.ok(active.homeGoal > 0 && active.awayGoal < 0, 'House choice keeps goal directions');
        changes.push(active);
      }
      assert.equal(new Set(changes.map(change => change.homeScore.replace(/\d/g, '').trim())).size, 4);
      const nonLegacyHouse = changes.find(change => change.home === 'hufflepuff').home;
      await page.locator(`.house-option[data-house="${nonLegacyHouse}"]`).click();
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
      await advance(40);
      assert.equal((await readHouse()).home, nonLegacyHouse);
      await start('standard');
      const match = await readHouse();
      await page.keyboard.press('2');
      await advance(40);
      assert.equal(await game(() => window.__BROOMBALL__.match.selected), 1);
      assert.deepEqual(await readHouse(), match, 'Switching characters keeps the chosen uniform and team colors');
      const goalInfo = await game(() => window.__BROOMBALL__.getShotInfo().goal.toArray());
      assert.ok(goalInfo[2] < 0, 'Shooting aims at the away goals');
      report.evidence.houses = { changes, match };
      await screenshot('selected-house');
    });

    await check('The end screen uses the selected teams and avoids legacy hardcoded labels', async () => {
      await game(() => {
        const g = window.__BROOMBALL__;
        g.match.snitchActive = true;
        g.catchSnitch('player');
      });
      assert.ok(await page.locator('#ending').isVisible());
      const result = await page.locator('#ending').innerText();
      report.evidence.result = result;
      assert.match(result, /赫奇帕奇.*获胜/);
      assert.match(result, /150/);
      assert.doesNotMatch(result, /狮队|鹰队|LIONS|RAVENS|�/);
      await screenshot('ending');
    });

    await check('The file build runs without requests or page exceptions', async () => {
      assert.deepEqual(report.blockedRequests, []);
      assert.deepEqual(report.pageErrors, []);
    });
  } catch (error) {
    report.failed.push({ name: 'Browser test setup', error: error.stack });
    console.error(error);
  } finally {
    if (browser) await browser.close();
    if (baseline && fs.existsSync(documentPath)) fs.unlinkSync(documentPath);
    fs.writeFileSync(path.join(out, `${prefix}.json`), JSON.stringify(report, null, 2));
    console.log(`${report.passed.length} passed, ${report.failed.length} failed`);
    if (report.failed.length || report.pageErrors.length || report.blockedRequests.length) process.exitCode = 1;
  }
})();
