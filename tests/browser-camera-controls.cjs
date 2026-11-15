/* Current-team camera and predictable controls. Real game updates and key events;
   fixtures freeze unrelated AI to isolate camera ownership and input behaviour. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'tests', 'artifacts');

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
    // The game captures performance.now() during load; install one clock first.
    await page.clock.install();
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__?.getBallFocus));
    await page.evaluate(() => Promise.all([BroomModels.ready, __BROOMBALL__.modelScenery]));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const advance = milliseconds => page.clock.runFor(milliseconds);
    const check = async (name, run) => {
      try { await run(); report.passed.push(name); console.log('PASS', name); }
      catch (error) { report.failed.push({ name, message: error.message }); console.error('FAIL', name, error.message); }
    };
    const release = async () => {
      for (const key of ['w', 'a', 's', 'd', 'j', 'k', 't', 'z', 'c', 'b', 'f', 'q', 'Space', 'Tab', 'Shift', 'ArrowRight', 'ArrowLeft']) await page.keyboard.up(key);
    };
    const stage = async () => {
      await release();
      await page.evaluate(() => {
        const g = __BROOMBALL__;
        g.startMatch('standard'); g.setCommentaryEnabled(false);
        Object.assign(g.match, { state: 'playing', paused: false, elapsed: 3, timeLeft: 177,
          kickoff: 0, pendingRestart: null, stealCooldown: 100, autoSwitch: true, cameraMode: 'broadcast' });
        g.clearInput(); g.setAim(0, 0);
        g.player.pos.set(0, 10, 20); g.player.previousPos.copy(g.player.pos);
        g.player.mesh.rotation.set(0, 0, 0); g.player.vel.set(0, 0, 0); g.player.stamina = 100;
        for (const unit of [...g.allies, ...g.rivals]) {
          unit.mesh.position.set(38, 32, 34); unit.speed = 0; unit.stun = 100;
          unit.velocity?.set(0, 0, 0); g.resetAIFlight(unit);
        }
        for (const ball of g.bludgers) { ball.mesh.position.set(-40, 35, 30); ball.frozen = 100; }
        g.setCarrier('player');
      });
      await advance(1100);
    };
    const snapshot = () => page.evaluate(() => {
      const g = __BROOMBALL__, activity = g.getMatchFocus(), ball = g.getBallFocus();
      g.camera.updateMatrixWorld(true);
      const project = position => {
        const p = position.clone().project(g.camera);
        return { x: (p.x * .5 + .5) * innerWidth, y: (1 - p.y) * .5 * innerHeight, z: p.z };
      };
      const forward = g.camera.getWorldDirection(new THREE.Vector3());
      return {
        width: innerWidth, height: innerHeight,
        phase: activity.phase, subject: activity.subject,
        position: activity.position.toArray(), ball: g.quaffle.position.toArray(), player: g.player.pos.toArray(),
        focus: [...g.cameraFraming.focus], distance: g.cameraFraming.distance,
        mode: g.cameraFraming.mode, cameraMode: g.match.cameraMode, cameraPosition: g.camera.position.toArray(),
        framingPhase: g.cameraFraming.phase, framingSubject: g.cameraFraming.subject,
        subjectScreen: project(g.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0))),
        ballScreen: project(g.quaffle.position), elevation: Math.asin(-forward.y) * 180 / Math.PI,
        ballPhase: ball.phase, ballFocus: ball.position.toArray(),
        carrier: g.carrier === 'player' ? 'player' : g.carrier?.mesh.uuid || null,
        playerId: g.player.mesh.uuid, playerCharacter: g.player.mesh.userData.characterId,
      };
    });
    const assertCentred = state => {
      const p = state.subjectScreen;
      assert.ok(p.z > -1 && p.z < 1, JSON.stringify(p));
      assert.ok(Math.abs(p.x / state.width - .5) < .10, JSON.stringify(p));
      assert.ok(Math.abs(p.y / state.height - .5) < .10, JSON.stringify(p));
      assert.equal(state.subject, state.playerId); assert.equal(state.framingSubject, state.playerId);
    };
    const separation = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

    await check('The main view stays on the controlled teammate across friendly and distant opposing possession', async () => {
      await stage(); const holding = await snapshot(); assertCentred(holding); assert.equal(holding.phase, 'attack');
      await page.evaluate(() => {
        const g = __BROOMBALL__; g.allies[0].mesh.position.set(-22, 14, -18); g.setCarrier(g.allies[0]);
      });
      await advance(800); const ally = await snapshot(); assertCentred(ally); assert.equal(ally.playerId, holding.playerId);
      await page.evaluate(() => {
        const g = __BROOMBALL__; g.player.pos.set(24, 10, 28); g.player.previousPos.copy(g.player.pos);
        g.rivals[0].mesh.position.set(-22, 12, -40); g.setCarrier(g.rivals[0]);
      });
      await advance(1100); const rival = await snapshot(); assertCentred(rival); assert.equal(rival.phase, 'defend');
      assert.ok(separation(rival.ballFocus, rival.player) > 80, 'Opponent must exercise a distant-possession case');
      assert.ok(separation(rival.focus, rival.player) < 1.6, 'Camera must stay with the controlled teammate');
      assert.ok(separation(rival.focus, rival.ballFocus) > 75, 'Ball ownership must not steal the main view');
      report.evidence.possession = { holding, ally, rival };
    });

    await check('A long pass leaves the passer centred until reception transfers control to a friendly receiver', async () => {
      await stage();
      const receiverId = await page.evaluate(() => {
        const g = __BROOMBALL__; g.allies[0].mesh.position.set(0, 10, -22); g.allies[0].stun = 0;
        g.setAim(0, 0); return g.allies[0].mesh.uuid;
      });
      const before = await snapshot(); await page.keyboard.press('j');
      assert.equal(await page.evaluate(() => Boolean(__BROOMBALL__.passFlight)), true, 'A real pass must launch');
      const flying = []; let received = null;
      for (let i = 0; i < 26; i++) {
        await advance(70); const state = await snapshot();
        if (state.playerId === receiverId) { received = state; break; }
        assert.equal(state.playerId, before.playerId); assertCentred(state); flying.push(state);
      }
      assert.ok(flying.length >= 8, 'Fixture should exercise a long flight');
      assert.ok(flying.some(state => separation(state.ball, state.player) > 26), 'Ball should fly well away from the passer');
      assert.ok(flying.every(state => separation(state.focus, state.player) < 1.8), 'Flight cannot pull the camera away');
      assert.ok(received, 'Reception must automatically transfer control to the teammate');
      assert.equal(received.carrier, 'player'); await advance(900); const settled = await snapshot(); assertCentred(settled);
      assert.equal(settled.playerId, receiverId); assert.ok(separation(settled.player, before.player) > 35);
      report.evidence.pass = { before, flying, received, settled };
    });

    await check('Shots and loose balls do not take the camera away from the controlled player', async () => {
      await stage(); await page.keyboard.press('f');
      const shots = [];
      for (let i = 0; i < 10; i++) { await advance(100); const state = await snapshot(); assertCentred(state); shots.push(state); }
      assert.ok(shots.some(state => state.phase === 'shot'));
      assert.ok(separation(shots.at(-1).ball, shots[0].ball) > 15);
      await stage();
      await page.evaluate(() => { const g = __BROOMBALL__; g.setCarrier(null); g.quaffle.position.set(-20, 18, -18); g.quaffleVel.set(14, 2, -12); });
      await advance(850); const loose = await snapshot(); assertCentred(loose); assert.equal(loose.phase, 'loose');
      assert.ok(separation(loose.ball, loose.player) > 30); report.evidence.ballStates = { shots, loose };
    });

    await check('C moves the camera only when control switches to an available friendly field player', async () => {
      await stage();
      const ids = await page.evaluate(() => {
        const g = __BROOMBALL__; g.rivals[0].mesh.position.set(-20, 12, -32);
        g.allies[0].mesh.position.set(-18, 12, -29); g.allies[0].stun = 0;
        g.allies[2].mesh.position.set(12, 10, 4); g.allies[2].stun = 0;
        g.allies[1].mesh.position.set(-20, 12, -31); g.allies[1].stun = 0;
        g.setCarrier(g.rivals[0]); return { defender: g.allies[0].mesh.uuid, opponent: g.rivals[0].mesh.uuid };
      });
      await advance(850); const before = await snapshot(); assertCentred(before);
      await page.keyboard.press('c'); await advance(1100); const switched = await snapshot(); assertCentred(switched);
      assert.equal(switched.playerId, ids.defender); assert.notEqual(switched.subject, ids.opponent); assert.equal(switched.carrier, ids.opponent);
      await stage();
      const available = await page.evaluate(() => {
        const g = __BROOMBALL__; g.rivals[0].mesh.position.set(-20, 12, -32);
        g.allies[0].mesh.position.set(-20, 12, -31); g.allies[0].stun = 8;
        g.allies[2].mesh.position.set(-12, 12, -25); g.allies[2].stun = 0;
        g.setCarrier(g.rivals[0]); return g.allies[2].mesh.uuid;
      });
      await page.keyboard.press('c'); assert.equal((await snapshot()).playerId, available);
      report.evidence.controlSwitch = { before, switched };
    });

    await check('Default and V close views keep a slight overhead angle, while Tab is a temporary overview', async () => {
      await stage(); const normal = await snapshot(); assertCentred(normal); assert.ok(normal.elevation > 29 && normal.elevation < 33);
      await page.keyboard.press('v'); await advance(1000); const close = await snapshot(); assertCentred(close);
      assert.equal(close.cameraMode, 'close'); assert.ok(close.elevation > 28 && close.elevation < 33);
      await page.keyboard.down('Tab'); await advance(1000); const overview = await snapshot(); assert.equal(overview.mode, 'overview');
      assert.equal(overview.cameraMode, 'close'); assert.ok(overview.cameraPosition[1] > 100);
      await page.keyboard.up('Tab'); await advance(1400); const restored = await snapshot(); assertCentred(restored); assert.equal(restored.mode, 'close');
      assert.ok(separation(restored.cameraPosition, close.cameraPosition) < .2);
      await page.keyboard.press('v'); await advance(850); assert.equal((await snapshot()).cameraMode, 'broadcast');
      report.evidence.views = { normal, close, overview, restored };
    });

    await check('W stays screen-up while mouse and arrow keys change only the aiming direction', async () => {
      await stage(); const before = await snapshot();
      await page.mouse.move(970, 330); await advance(100);
      const rightAim = await page.evaluate(() => __BROOMBALL__.getAimState().targetYaw);
      await page.keyboard.down('w'); await advance(250); await page.mouse.move(350, 335); await advance(350); await page.keyboard.up('w');
      const leftAim = await page.evaluate(() => __BROOMBALL__.getAimState().targetYaw), after = await snapshot();
      assert.ok(Math.abs(leftAim - rightAim) > .5, 'Fixture must actually change aiming direction');
      assert.ok(Math.abs(after.player[0] - before.player[0]) < .01, 'Mouse aiming must not steer W sideways');
      assert.ok(after.player[2] < before.player[2] - 7, 'W must continue screen-up');
      await stage(); await page.keyboard.down('ArrowRight'); await page.keyboard.down('w'); await advance(600); await release();
      const arrow = await snapshot(); assert.ok(Math.abs(arrow.player[0]) < .01); assert.ok(arrow.player[2] < 13);
      report.evidence.movement = { before, after, rightAim, leftAim, arrow };
    });

    await check('B overrides S as a forward press, permits sprint and gently follows height with manual override', async () => {
      await stage();
      await page.evaluate(() => { const g = __BROOMBALL__; g.rivals[0].mesh.position.set(0, 22, -24); g.setCarrier(g.rivals[0]); });
      const before = await snapshot(); await page.keyboard.down('s'); await page.keyboard.down('b'); await page.keyboard.down('Shift'); await advance(650);
      const press = await page.evaluate(() => { const g = __BROOMBALL__; return { position: g.player.pos.toArray(), speed: g.player.speed, boosting: g.player.boosting, stamina: g.player.stamina, vy: g.player.vel.y }; });
      assert.equal(press.boosting, true); assert.ok(press.speed > 30); assert.ok(press.stamina < 100);
      assert.ok(press.position[2] < before.player[2] - 9); assert.ok(press.position[1] > before.player[1] + 2);
      await page.keyboard.down('q'); await advance(500);
      const override = await page.evaluate(() => ({ position: __BROOMBALL__.player.pos.toArray(), vy: __BROOMBALL__.player.vel.y }));
      assert.ok(override.vy < -9, 'Q must override the automatic upward press'); assert.ok(override.position[1] < press.position[1] - 2);
      await release(); report.evidence.pressing = { before, press, override };
    });

    await check('Closing help from the home page resumes the 3D preview and character selection', async () => {
      await release(); await page.evaluate(() => __BROOMBALL__.returnToMenu()); await advance(300);
      await page.locator('#startHelpBtn').click(); await advance(100);
      assert.equal(await page.evaluate(() => __BROOMBALL__.match.paused), true);
      await page.locator('#closeHelpBtn').click(); await advance(300);
      const resumed = await page.evaluate(() => ({ paused: __BROOMBALL__.match.paused, preview: __BROOMBALL__.characterPreview.getStatus() }));
      assert.equal(resumed.paused, false); assert.equal(resumed.preview.active, true);
      await page.locator('.character[data-id="hermione"]').click(); await advance(400);
      const selected = await page.evaluate(() => __BROOMBALL__.characterPreview.getStatus());
      assert.equal(selected.characterId, 'hermione'); assert.equal(selected.ready, true); assert.ok(selected.renderedFrames > resumed.preview.renderedFrames);
      report.evidence.menuHelp = { resumed, selected };
    });

    await check('System modifier combinations do not trigger match actions or consume browser shortcuts', async () => {
      await stage();
      const state = await page.evaluate(() => {
        const g = __BROOMBALL__; g.switchCharacter(0); g.match.cooldowns.fill(0);
        g.allies[0].mesh.position.set(0, 10, -8); g.allies[0].stun = 0;
        g.rivals[0].mesh.position.set(0, 10, 14); g.rivals[0].stun = 0; g.setCarrier('player');
        const before = { player: g.player.mesh.uuid, selected: g.match.selected, commentary: g.settings.commentary };
        const events = [];
        // Dispatch the DOM events without asking Chrome itself to reload/open a window.
        for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) for (const code of ['KeyR', 'KeyF', 'KeyJ', 'KeyC', 'Digit2', 'KeyH', 'KeyN']) {
          const event = new KeyboardEvent('keydown', { code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : '2', [modifier]: true, bubbles: true, cancelable: true });
          window.dispatchEvent(event); events.push({ code, modifier, prevented: event.defaultPrevented });
        }
        return { before, events, after: { player: g.player.mesh.uuid, selected: g.match.selected, commentary: g.settings.commentary,
          paused: g.match.paused, charging: g.match.charging, projectiles: g.projectiles.length, passes: g.match.stats.passes, used: g.match.usedSpell } };
      });
      assert.equal(state.after.player, state.before.player); assert.equal(state.after.selected, state.before.selected);
      assert.equal(state.after.commentary, state.before.commentary); assert.equal(state.after.paused, false); assert.equal(state.after.charging, false);
      assert.equal(state.after.projectiles, 0); assert.equal(state.after.passes, 0); assert.equal(state.after.used, false);
      assert.ok(state.events.every(event => !event.prevented)); report.evidence.modifiers = state;
    });

    await check('Screen buttons match the keyboard for requesting a pass, holding a press and switching a friendly player', async () => {
      await stage();
      await page.evaluate(() => {
        const g = __BROOMBALL__; g.allies[0].mesh.position.set(0, 10, -8); g.allies[0].stun = 0; g.setCarrier(g.allies[0]);
      });
      await advance(100);
      assert.match(await page.locator('#shortPassBtn').innerText(), /要球/);
      assert.equal(await page.locator('#shortPassBtn').isEnabled(), true);
      await page.locator('#shortPassBtn').click();
      const requested = await page.evaluate(() => {
        const g = __BROOMBALL__; return { target: g.passTarget === 'player', flying: Boolean(g.passFlight), mode: g.passMode };
      });
      assert.equal(requested.target, true); assert.equal(requested.flying, true); assert.equal(requested.mode, 'short');
      await advance(1500);
      const returned = await page.evaluate(() => ({ holding: __BROOMBALL__.carrier === 'player', completed: __BROOMBALL__.match.stats.completedPasses }));
      assert.equal(returned.holding, true); assert.equal(returned.completed, 1);
      await stage();
      const defender = await page.evaluate(() => {
        const g = __BROOMBALL__; g.rivals[0].mesh.position.set(-12, 18, -12); g.rivals[0].stun = 0; g.rivals[0].speed = -2;
        g.allies[0].mesh.position.set(-15, 18, -12); g.allies[0].stun = 0;
        g.allies[2].mesh.position.set(20, 10, 12); g.allies[2].stun = 0; g.setCarrier(g.rivals[0]); return g.allies[0].mesh.uuid;
      });
      await advance(100);
      for (const id of ['shortPassBtn', 'throughPassBtn', 'shootBtn']) assert.equal(await page.locator('#' + id).isDisabled(), true, id);
      assert.equal(await page.locator('#pressBtn').isEnabled(), true);
      const button = await page.locator('#pressBtn').boundingBox(); assert.ok(button);
      const before = await snapshot(); await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down(); await advance(650);
      const held = await page.evaluate(() => ({ position: __BROOMBALL__.player.pos.toArray(), speed: __BROOMBALL__.player.speed, pressing: document.getElementById('pressBtn').classList.contains('pressing') }));
      assert.equal(held.pressing, true); assert.ok(held.speed > 18);
      assert.ok(separation(held.position, [-12, 18, -12]) < separation(before.player, [-12, 18, -12]) - 8, 'Holding the screen button must actually approach the carrier');
      await page.mouse.up(); await advance(450);
      const released = await page.evaluate(() => ({ position: __BROOMBALL__.player.pos.toArray(), speed: __BROOMBALL__.player.speed, pressing: document.getElementById('pressBtn').classList.contains('pressing') }));
      assert.equal(released.pressing, false); assert.ok(released.speed < .1);
      await advance(300); const stopped = await snapshot(); assert.ok(separation(stopped.player, released.position) < .05, 'Release must end the press');
      await page.locator('#switchPlayerBtn').click(); await advance(900); const switched = await snapshot();
      assert.equal(switched.playerId, defender); assert.notEqual(switched.subject, switched.carrier); assertCentred(switched);
      report.evidence.screenControls = { requested, returned, before, held, released, switched };
    });

    await check('The controlled friendly player remains visible in desktop and compact attack and defence views', async () => {
      const screens = [];
      for (const [width, height] of [[1280, 720], [800, 600]]) {
        await page.setViewportSize({ width, height }); await stage();
        await page.evaluate(() => {
          const g = __BROOMBALL__; g.player.pos.set(0, 12, 4); g.player.previousPos.copy(g.player.pos);
          g.allies[0].mesh.position.set(15, 12, -10); g.allies[0].stun = 0;
          g.allies[2].mesh.position.set(-14, 14, -6); g.allies[2].stun = 0;
          g.rivals[0].mesh.position.set(0, 12, -4); g.rivals[0].stun = 0; g.setCarrier('player');
        });
        await advance(1000); const attack = await snapshot(); assertCentred(attack);
        await page.screenshot({ path: path.join(out, `camera-controls-attack-${width}.png`) });
        await page.evaluate(() => __BROOMBALL__.setCarrier(__BROOMBALL__.rivals[0]));
        await advance(850); const defence = await snapshot(); assertCentred(defence); assert.equal(defence.playerId, attack.playerId);
        await page.screenshot({ path: path.join(out, `camera-controls-defence-${width}.png`) });
        screens.push({ width, height, attack, defence });
      }
      report.evidence.screens = screens;
    });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); assert.deepEqual(report.failed, []);
    console.log('CAMERA_CONTROLS_PASS');
  } finally {
    fs.writeFileSync(path.join(out, 'camera-controls.json'), JSON.stringify(report, null, 2)); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
