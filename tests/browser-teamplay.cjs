/* Team-play acceptance: real keyboard events and actual rendered game updates.
   Isolated fixtures freeze unrelated AI so each assertion has a clear cause. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'artifacts');
const near = (a, b, label, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const report = { passed: [], failed: [], evidence: {}, errors: [], blockedRequests: [] };
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route(/^https?:\/\//, route => { report.blockedRequests.push(route.request().url()); return route.abort(); });
    // Establish one clock before the game captures performance.now().
    await page.clock.install();
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const advance = ms => page.clock.runFor(ms);
    const check = async (name, run) => {
      try { await run(); report.passed.push(name); console.log('PASS', name); }
      catch (error) { report.failed.push({ name, message: error.message }); console.error('FAIL', name, error.message); }
    };
    const stage = async () => {
      for (const key of ['w', 's', 'j', 'k', 't', 'z', 'c', 'b', 'f', 'Shift']) await page.keyboard.up(key);
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.startMatch('standard');
        Object.assign(g.match, { state: 'playing', paused: false, elapsed: 3, timeLeft: 177,
          cameraMode: 'broadcast', kickoff: 0, pendingRestart: null, stealCooldown: 100, autoSwitch: true });
        g.clearInput(); g.setAim(0, 0);
        g.player.pos.set(0, 10, 0); g.player.previousPos.copy(g.player.pos);
        g.player.mesh.rotation.set(0, 0, 0); g.player.vel.set(0, 0, 0); g.player.stamina = 100;
        g.setCarrier(null); g.quaffle.position.set(36, 30, -30);
        for (const unit of [...g.rivals, ...g.allies]) {
          unit.mesh.position.set(38, 32, 34); unit.speed = 0; unit.stun = 100;
          if (unit.velocity) unit.velocity.set(0, 0, 0);
        }
        for (const ball of g.bludgers) { ball.mesh.position.set(-40, 35, 30); ball.frozen = 100; }
      });
    };
    const setupPass = async (distance = 28) => page.evaluate(distance => {
      const g = window.__BROOMBALL__;
      g.allies[0].mesh.position.set(0, 10, -distance); g.allies[0].stun = 0;
      g.allies[2].mesh.position.set(10, 10, 2); g.allies[2].stun = 0;
      g.setCarrier('player');
    }, distance);

    await check('Balanced teams and timed modes replace the snitch race', async () => {
      const result = await page.evaluate(() => {
        const g = window.__BROOMBALL__, result = {};
        for (const mode of ['standard', 'challenge', 'training']) {
          g.startMatch(mode);
          result[mode] = { duration: String(g.match.rules.duration), snitchAt: String(g.match.rules.snitchAt),
            camera: g.match.cameraMode, state: g.match.state };
        }
        result.home = { total: 1 + g.allies.length, keepers: g.allies.filter(a => a.role === 'keeper').length };
        result.away = { total: g.rivals.length, keepers: g.rivals.filter(a => a.role === 'keeper').length };
        return result;
      });
      assert.deepEqual(result.home, { total: 4, keepers: 1 });
      assert.deepEqual(result.away, { total: 4, keepers: 1 });
      assert.equal(result.standard.duration, '180'); assert.equal(result.challenge.duration, '150');
      assert.equal(result.training.duration, 'Infinity');
      for (const mode of ['standard', 'challenge']) {
        assert.equal(result[mode].snitchAt, 'Infinity'); assert.equal(result[mode].camera, 'broadcast');
      }
      assert.equal(result.training.state, 'playing'); report.evidence.modes = result;
    });

    await check('S backpedals without passing and held J repeats do not create extra throws', async () => {
      await stage(); await setupPass(36);
      const before = await page.evaluate(() => window.__BROOMBALL__.player.pos.toArray());
      await page.keyboard.down('s'); await advance(550); await page.keyboard.up('s');
      const reverse = await page.evaluate(() => { const g=window.__BROOMBALL__;return {position:g.player.pos.toArray(),speed:g.player.speed,passes:g.match.stats.passes,holding:g.carrier==='player'}; });
      assert.ok(reverse.position[2]>before[2]+4);assert.ok(reverse.speed>8&&reverse.speed<16);assert.equal(reverse.passes,0);assert.equal(reverse.holding,true);
      await stage(); await setupPass(36);
      await page.keyboard.down('j'); await advance(100);
      await page.keyboard.down('j'); await advance(100); await page.keyboard.up('j');
      const passed = await page.evaluate(() => { const g = window.__BROOMBALL__; return { passes: g.match.stats.passes, position: g.player.pos.toArray(), mode: g.passMode, target: g.passTarget === g.allies[0] }; });
      assert.equal(passed.passes, 1); assert.deepEqual(passed.position, before);
      assert.equal(passed.mode, 'short'); assert.equal(passed.target, true);
      report.evidence.backwardAndPass = { before, reverse, passed };
    });

    await check('Directional short pass reaches its receiver and automatically changes control', async () => {
      await stage(); await setupPass();
      const ids = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        receiver: g.getPassReceiver() === g.allies[0], old: g.player.mesh.uuid, next: g.allies[0].mesh.uuid,
        nearest: g.allies[2].mesh.position.distanceTo(g.player.pos), selected: g.allies[0].mesh.position.distanceTo(g.player.pos) }; });
      assert.ok(ids.nearest < ids.selected); assert.equal(ids.receiver, true, 'Aim direction wins over the nearer sideways receiver');
      await page.keyboard.press('j'); await advance(1100);
      const caught = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        carrier: g.carrier === 'player', controlled: g.player.mesh.uuid, priorMesh: g.allies[0].mesh.uuid,
        completed: g.match.stats.completedPasses, attempts: g.match.stats.passes, target: g.passTarget }; });
      assert.equal(caught.carrier, true); assert.equal(caught.controlled, ids.next); assert.equal(caught.priorMesh, ids.old);
      assert.equal(caught.completed, 1); assert.equal(caught.attempts, 1); assert.equal(caught.target, null);
      report.evidence.shortPass = { ids, caught };
    });

    await check('Z leads the receiver on a fixed arc after release', async () => {
      await stage(); await setupPass(30);
      const planned = await page.evaluate(() => {
        const g=window.__BROOMBALL__,receiver=g.allies[0];receiver.speed=24;receiver.velocity.set(4,0,-6);
        receiver.flightDirection.copy(receiver.velocity).normalize();receiver.flightSpeed=receiver.velocity.length();
        receiver.mesh.rotation.y=Math.atan2(-receiver.velocity.x,-receiver.velocity.z);
        const p=g.planPass('player',receiver,'through');return{reachable:p.reachableDistance,feet:p.receivePosition.toArray(),destination:p.destination.toArray(),direction:receiver.flightDirection.toArray()};
      });
      await page.keyboard.press('z');
      const release = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        mode: g.passMode, target: g.passTarget === g.allies[0], destination: g.passDestination.toArray(), feet:g.passReceivePosition.toArray(),duration:g.passFlight.duration,
        velocity: g.quaffleVel.toArray(), receiver: g.allies[0].mesh.position.toArray(), position: g.quaffle.position.toArray() }; });
      assert.equal(release.mode, 'through'); assert.equal(release.target, true);
      const lead=release.feet.map((v,i)=>v-release.receiver[i]),leadDistance=Math.hypot(...lead);
      assert.ok(leadDistance>0,'A moving receiver gets a lead into their running lane');
      assert.ok(lead.reduce((sum,v,i)=>sum+v*planned.direction[i],0)/leadDistance>.999,'Lead follows the actual receiving run');
      assert.ok(leadDistance<=planned.reachable+1e-6,'The receiver can reach the lead during this flight');
      assert.deepEqual(release.feet,planned.feet);assert.deepEqual(release.destination,planned.destination);
      const chordSpeed=Math.hypot(...release.destination.map((v,i)=>v-release.position[i]))/release.duration;
      assert.ok(chordSpeed>=30&&chordSpeed<=34,'Through pass has a readable flight speed');
      await page.evaluate(() => window.__BROOMBALL__.allies[0].mesh.position.set(22, 10, -30));
      await advance(250);
      const flight = await page.evaluate(() => { const g = window.__BROOMBALL__; return { velocity: g.quaffleVel.toArray(), destination: g.passDestination.toArray(), position: g.quaffle.position.toArray() }; });
      assert.ok(flight.velocity[1]<release.velocity[1],'The lofted throw descends along its fixed arc');
      assert.deepEqual(flight.destination, release.destination);
      assert.ok(flight.position[2] < release.position[2] - 7);
      report.evidence.throughPass = { planned, release, flight, leadDistance, chordSpeed };
    });

    await check('A defender on the flight path intercepts before the intended receiver', async () => {
      await stage(); await setupPass(36);
      // Release first so the target selector is not expected to choose an obstructed lane.
      await page.keyboard.press('t');
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.rivals[0].stun = 0; g.rivals[0].mesh.position.set(0, 10, -16);
      });
      await advance(650);
      const result = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        enemyCarrier: g.carrier === g.rivals[0], completed: g.match.stats.completedPasses,
        target: g.passTarget, ownGoals: g.match.stats.goals }; });
      assert.equal(result.enemyCarrier, true); assert.equal(result.completed, 0);
      assert.equal(result.target, null); assert.equal(result.ownGoals, 0);
      report.evidence.interception = result;
    });

    await check('C changes control while the previous ball carrier retains possession', async () => {
      await stage(); await setupPass();
      const before = await page.evaluate(() => { const g = window.__BROOMBALL__; return { controlled: g.player.mesh.uuid, ball: g.quaffle.position.toArray() }; });
      await page.keyboard.press('c');
      const result = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        controlled: g.player.mesh.uuid, priorCarrierMesh: typeof g.carrier === 'object' && g.carrier?.mesh.uuid,
        allyCarrier: g.allies.includes(g.carrier), ball: g.quaffle.position.toArray(), charging: g.match.charging }; });
      assert.notEqual(result.controlled, before.controlled); assert.equal(result.priorCarrierMesh, before.controlled);
      assert.equal(result.allyCarrier, true); assert.deepEqual(result.ball, before.ball); assert.equal(result.charging, false);
      report.evidence.controlSwitch = result;
    });

    await check('F charges while held and launches one faster shot on release', async () => {
      await stage();
      await page.evaluate(() => { const g = window.__BROOMBALL__; g.player.pos.set(0, 15, -30); g.setCarrier('player'); });
      await page.keyboard.down('f'); await advance(600);
      const held = await page.evaluate(() => { const g = window.__BROOMBALL__; return { charging: g.match.charging, charge: g.match.shotCharge, holding: g.carrier === 'player', shots: g.match.stats.shots }; });
      assert.equal(held.charging, true); assert.ok(held.charge > .45); assert.equal(held.holding, true); assert.equal(held.shots, 0);
      await page.keyboard.up('f');
      const released = await page.evaluate(() => { const g = window.__BROOMBALL__; return { charging: g.match.charging, charge: g.match.shotCharge, carrier: g.carrier, speed: g.quaffleVel.length(), shots: g.match.stats.shots }; });
      assert.equal(released.charging, false); assert.equal(released.charge, 0); assert.equal(released.carrier, null);
      assert.equal(released.shots, 1); assert.ok(released.speed > 30);
      await advance(1300);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.playerScore), 10, 'A real charged shot scores by crossing the goal');
      report.evidence.chargedShot = { held, released };
    });

    await check('Pause and restart discard charge and late key release cannot shoot', async () => {
      await stage(); await page.evaluate(() => window.__BROOMBALL__.setCarrier('player'));
      await page.keyboard.down('f'); await advance(300); await page.keyboard.press('Escape');
      const paused = await page.evaluate(() => { const g = window.__BROOMBALL__; return { paused: g.match.paused, charging: g.match.charging, charge: g.match.shotCharge, shots: g.match.stats.shots }; });
      assert.equal(paused.paused, true); assert.equal(paused.charging, false); assert.equal(paused.charge, 0);
      await page.keyboard.up('f'); await advance(300);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.stats.shots), 0);
      await page.keyboard.press('Escape'); await page.keyboard.down('f'); await advance(250);
      await page.evaluate(() => window.__BROOMBALL__.restartMatch()); await page.keyboard.up('f');
      const reset = await page.evaluate(() => { const g = window.__BROOMBALL__; return { state: g.match.state, charging: g.match.charging, charge: g.match.shotCharge, passes: g.match.stats.passes, shots: g.match.stats.shots, pending: g.match.pendingRestart, passTarget: g.passTarget }; });
      assert.deepEqual(reset, { state: 'countdown', charging: false, charge: 0, passes: 0, shots: 0, pending: null, passTarget: null });
      report.evidence.reset = { paused, reset };
    });

    await check('Losing possession cancels charge and reacquiring cannot charge without F', async () => {
      await stage(); await page.evaluate(() => window.__BROOMBALL__.setCarrier('player'));
      await page.keyboard.down('f'); await advance(300);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.match.shotCharge > .2));
      await page.evaluate(() => window.__BROOMBALL__.setCarrier(null));
      await page.keyboard.up('f');
      const lost = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        charging: g.match.charging, charge: g.match.shotCharge, shots: g.match.stats.shots }; });
      assert.deepEqual(lost, { charging: false, charge: 0, shots: 0 });
      await page.evaluate(() => window.__BROOMBALL__.setCarrier('player')); await advance(400);
      const reacquired = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        charging: g.match.charging, charge: g.match.shotCharge, shots: g.match.stats.shots }; });
      assert.deepEqual(reacquired, lost);
      report.evidence.chargeLoss = { lost, reacquired };
    });

    await check('Keeper distribution counts both an attempted and completed team pass', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(-25, 10, 8); g.player.previousPos.copy(g.player.pos);
        g.allies[1].mesh.position.set(0, 10, 24); g.allies[1].stun = 0;
        g.allies[0].mesh.position.set(0, 10, 4); g.allies[0].stun = 0;
        g.setCarrier(g.allies[1]);
      });
      await advance(900);
      const result = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        attempts: g.match.stats.passes, completed: g.match.stats.completedPasses, ownBall: g.carrier === 'player' }; });
      assert.equal(result.attempts, 1); assert.equal(result.completed, 1); assert.equal(result.ownBall, true);
      assert.ok(result.completed <= result.attempts);
      report.evidence.keeperDistribution = result;
    });

    await check('B approaches and wins the ball through actual movement and pressure', async () => {
      await stage();
      await page.evaluate(() => { const g = window.__BROOMBALL__; g.rivals[0].stun = 0; g.rivals[0].mesh.position.set(0, 10, -10); g.setCarrier(g.rivals[0]); g.match.stealCooldown = 0; });
      await page.keyboard.down('b'); await advance(800); await page.keyboard.up('b');
      const result = await page.evaluate(() => { const g = window.__BROOMBALL__; return { ownBall: g.carrier === 'player', steals: g.match.stats.steals, position: g.player.pos.toArray() }; });
      assert.equal(result.ownBall, true); assert.equal(result.steals, 1); assert.ok(result.position[2] < -4);
      report.evidence.pressure = result;
    });

    await check('Each goal restarts with possession for the conceding team', async () => {
      const result = {};
      for (const scorer of ['player', 'rival']) {
        await stage(); await page.evaluate(side => window.__BROOMBALL__.scoreGoal(side), scorer);
        const pending = await page.evaluate(() => { const g = window.__BROOMBALL__; return { side: g.match.pendingRestart, delay: g.match.kickoff, carrier: g.carrier }; });
        assert.equal(pending.side, scorer === 'player' ? 'rival' : 'home'); assert.equal(pending.delay, 2); assert.equal(pending.carrier, null);
        await advance(2050);
        const restarted = await page.evaluate(() => { const g = window.__BROOMBALL__; return { home: g.carrier === 'player', away: g.rivals.includes(g.carrier), pending: g.match.pendingRestart, kickoff: g.match.kickoff }; });
        assert.equal(restarted.home, scorer === 'rival'); assert.equal(restarted.away, scorer === 'player');
        assert.equal(restarted.pending, null); assert.equal(restarted.kickoff, 0);
        result[scorer] = { pending, restarted };
      }
      report.evidence.restarts = result;
    });

    await check('Training requires an actual received pass before shooting and spell completion', async () => {
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.startMatch('training');
        // Flight/height have their own input tests; enter their resulting pickup stage.
        g.match.trainingStep = 2; g.player.pos.set(0, 9, 0); g.player.previousPos.copy(g.player.pos);
        g.player.vel.set(0, 0, 0); g.setAim(0, 0); g.setCarrier(null);
        g.quaffle.position.copy(g.player.pos);
      });
      await advance(550);
      const pickup = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        step: g.match.trainingStep, holding: g.carrier === 'player', receiverVisible: g.allies[0].mesh.visible,
        hasReceiver: g.getPassReceiver() === g.allies[0] }; });
      assert.deepEqual(pickup, { step: 3, holding: true, receiverVisible: true, hasReceiver: true });
      await advance(350);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.trainingStep), 3, 'Waiting cannot complete the pass lesson');
      await page.keyboard.press('j');
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.trainingStep), 3, 'Pressing pass alone cannot complete the lesson');
      await advance(650);
      const receipt = await page.evaluate(() => { const g = window.__BROOMBALL__; return {
        step: g.match.trainingStep, holding: g.carrier === 'player', completed: g.match.stats.completedPasses,
        passes: g.match.stats.passes, receiverVisible: g.allies[0].mesh.visible }; });
      assert.deepEqual(receipt, { step: 4, holding: true, completed: 1, passes: 1, receiverVisible: false });
      await page.evaluate(() => { const g = window.__BROOMBALL__; g.player.pos.set(0, 12.2, -30); g.player.previousPos.copy(g.player.pos); g.setAim(0, 0); });
      await advance(700);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.getShotInfo().assisted), true);
      await page.keyboard.press('f'); await advance(1700);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.trainingStep), 5);
      await page.keyboard.press('3'); await page.keyboard.press('r'); await advance(100);
      const complete = await page.evaluate(() => { const g = window.__BROOMBALL__; return { step: g.match.trainingStep, state: g.match.state }; });
      assert.equal(complete.step, 6);
      assert.ok(await page.locator('#trainingPlayBtn').isVisible());
      report.evidence.training = { pickup, receipt, complete };
    });

    await check('All six bundled female voice cues load and decode as nonempty local audio', async () => {
      const names = ['kickoff.wav', 'goal-home.wav', 'goal-away.wav', 'disarm.wav', 'stun.wav', 'shield.wav'];
      await page.evaluate(names => {
        window.__voiceProbe = {};
        window.__voiceProbeAudio = names.map(name => {
          const audio = new Audio(new URL('assets/voice/' + name, location.href));
          window.__voiceProbe[name] = null;
          audio.addEventListener('loadedmetadata', () => { window.__voiceProbe[name] = { duration: audio.duration, source: audio.currentSrc }; });
          audio.addEventListener('error', () => { window.__voiceProbe[name] = { error: audio.error?.message || 'Audio load failed' }; });
          audio.preload = 'auto'; audio.load(); return audio;
        });
      }, names);
      await page.waitForFunction(() => Object.values(window.__voiceProbe).every(Boolean), null, { timeout: 5000 });
      const loaded = await page.evaluate(() => window.__voiceProbe);
      const decoded = {};
      for (const name of names) {
        assert.ok(!loaded[name].error, name + ': ' + loaded[name].error);
        assert.ok(loaded[name].duration > .3 && loaded[name].duration < 15, name + ' has plausible spoken duration');
        assert.ok(loaded[name].source.startsWith('file:'), name + ' loads from the local game');
        const bytes = fs.readFileSync(path.join(root, 'assets', 'voice', name)).toString('base64');
        decoded[name] = await page.evaluate(async bytes => {
          const ctx = new AudioContext();
          try {
            const buffer = await ctx.decodeAudioData(Uint8Array.from(atob(bytes), c => c.charCodeAt(0)).buffer);
            let peak = 0;
            for (const value of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
            return { duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, peak };
          } finally { await ctx.close(); }
        }, bytes);
        assert.ok(decoded[name].peak > .01, name + ' contains audible samples');
        assert.ok(decoded[name].channels >= 1); near(decoded[name].duration, loaded[name].duration, name + ' decoded duration', .01);
      }
      report.evidence.voiceClips = { loaded, decoded };
    });

    await check('The file entry runs offline without JavaScript errors', async () => {
      assert.deepEqual(report.errors, []); assert.deepEqual(report.blockedRequests, []);
    });
    assert.deepEqual(report.failed, [], 'All team-play acceptance checks must pass');
  } finally {
    fs.writeFileSync(path.join(out, 'teamplay-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
