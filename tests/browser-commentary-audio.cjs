/* Real female English WAV decoding and native HTMLAudioElement playback; no audio or speech mocks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/voice/commentary/manifest.json'), 'utf8'));

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const passed = [], evidence = {}, errors = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      // Pointer lock is unrelated to native media playback. Keep keyboard controls.
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
      window.__speechFallbackCalls = [];
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = utterance => {
        window.__speechFallbackCalls.push(utterance.text);
        return speak(utterance); // Observer calls the real browser implementation.
      };
    });
    await page.goto(process.env.BROOM_GAME_URL || 'http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
    const check = async (name, run) => { await run(); passed.push(name); console.log('PASS', name); };
    const client = await page.context().newCDPSession(page);
    const collectAudioNodes = async () => {
      const prototype = await client.send('Runtime.evaluate', { expression: 'HTMLAudioElement.prototype' });
      const objects = await client.send('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId });
      await client.send('Runtime.callFunctionOn', {
        objectId: objects.objects.objectId,
        functionDeclaration: 'function(){window.__commentaryAudioNodes=Array.from(this);}',
        returnByValue: true
      });
      await client.send('Runtime.releaseObject', { objectId: objects.objects.objectId });
      await client.send('Runtime.releaseObject', { objectId: prototype.result.objectId });
    };
    const playing = () => page.evaluate(() => window.__commentaryAudioNodes
      .filter(a => a.src.includes('/assets/voice/commentary/') && !a.paused && !a.ended)
      .map(a => ({ src: a.src, time: a.currentTime, duration: a.duration, volume: a.volume, error: a.error?.code || null })));

    await check('All 65 female English clips match catalog text, names and voice provenance', async () => {
      const lines = await page.evaluate(() => ({ catalog: BroomCommentaryClips, names: BroomCommentaryLines }));
      assert.equal(manifest.length, 65);
      assert.deepEqual(Object.keys(lines.catalog).sort(), manifest.map(line => line.id).sort());
      const names = [...Object.values(lines.names.houseNames), ...Object.values(lines.names.nameById)];
      let emphasizedNames = 0;
      for (const line of manifest) {
        assert.equal(line.language, 'en-GB');
        assert.equal(line.voice, 'Joanna - Warm & Conversational');
        assert.equal(line.provider, 'HeyGen Voice');
        assert.equal(line.gender, 'female');assert.equal(line.sampleRate,44100);assert(line.peak>1000&&line.rms>50);
        assert.equal(line.text, lines.catalog[line.id].text);
        assert.match(lines.catalog[line.id].src, new RegExp('/' + line.id + '\\.wav$'));
        assert.doesNotMatch(line.text, /[\u3400-\u9fff]/);
        for (const name of names.filter(name => line.text.includes(name))) {
          assert(line.emphasis.includes(name), line.id + ' emphasizes ' + name);
          assert(line.text.includes(name), line.id + ' preserves the complete name');
          emphasizedNames++;
        }
      }
      evidence.catalog = { clips: manifest.length, emphasizedNames, voice: manifest[0].voice, provider: manifest[0].provider, language: manifest[0].language };
    });

    await check('Every real female WAV file decodes to finite, non-silent browser PCM', async () => {
      const decoded = await page.evaluate(async manifest => {
        const context = new AudioContext(), results = [];
        try {
          for (const line of manifest) {
            const response = await fetch(BroomCommentaryClips[line.id].src);
            if (!response.ok) throw new Error(line.id + ': HTTP ' + response.status);
            const bytes = await response.arrayBuffer();
            const buffer = await context.decodeAudioData(bytes.slice(0));
            let peak = 0, sum = 0, finite = true, samples = 0;
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
              const data = buffer.getChannelData(channel);
              for (const sample of data) {
                finite = finite && Number.isFinite(sample);
                peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; samples++;
              }
            }
            results.push({ id: line.id, bytes: bytes.byteLength, duration: buffer.duration, channels: buffer.numberOfChannels,
              sampleRate: buffer.sampleRate, finite, peak, rms: Math.sqrt(sum / samples) });
          }
        } finally { await context.close(); }
        return results;
      }, manifest);
      for (const [index, clip] of decoded.entries()) {
        assert.equal(clip.bytes, fs.statSync(path.join(root,'assets/voice/commentary',clip.id+'.wav')).size, clip.id + ' bytes match the actual local recording');
        assert(clip.duration > .5 && clip.duration <= 20, clip.id + ' duration');
        assert(Math.abs(clip.duration - manifest[index].duration) < .15, clip.id + ' duration matches manifest');
        assert(clip.finite && clip.channels >= 1 && clip.peak > .01 && clip.rms > .001, clip.id + ' audible PCM');
      }
      evidence.decoded = decoded;
    });

    const kickoffFile = '/kickoff-gryffindor-slytherin.wav';
    const waitForClip = file => page.waitForFunction(file => __commentaryAudioNodes
      .some(a => a.src.endsWith(file) && !a.paused && a.currentTime > .05), file);
    const announceGoal = key => page.evaluate(key => __BROOMBALL__.commentary
      .announce(key, 'ignored', { clip: 'goal-gryffindor', priority: 4, cooldown: 0 }), key);
    const keepPossession = () => page.evaluate(() => {
      const g = __BROOMBALL__;
      // Keep the live match deterministic while observing real native audio.
      for (const unit of [...g.rivals, ...g.allies]) { unit.speed = 0; unit.stun = 100; }
      g.match.stealCooldown = 100;
    });
    await collectAudioNodes();
    await check('Start and the real countdown play one kickoff recording without synthesis', async () => {
      await page.screenshot({ path: path.join(out, 'commentary-audio-menu.png') });
      await page.locator('#startBtn').click();
      if (await page.evaluate(() => __BROOMBALL__.match.state === 'entrance')) await page.locator('#skipEntrance').click();
      assert.equal(await page.evaluate(() => __BROOMBALL__.match.state), 'countdown');
      await keepPossession();
      await waitForClip(kickoffFile);
      const active = await playing();
      assert.equal(await page.evaluate(() => __BROOMBALL__.match.state), 'playing');
      assert.equal(active.length, 1);
      assert(active[0].src.endsWith(kickoffFile));
      assert(active[0].duration > 1 && active[0].error === null);
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.backend), 'audio');
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
      evidence.started = active[0];
    });

    await check('Routine events and live volume changes preserve the recorded sentence', async () => {
      const before = (await playing())[0];
      const changes = await page.evaluate(() => {
        const g = __BROOMBALL__;
        const audio = __commentaryAudioNodes.find(a => a.src.endsWith('/kickoff-gryffindor-slytherin.wav') && !a.paused);
        window.__activeCommentaryAudio = audio;
        const routine = g.commentary.announce('busy-pass', 'ignored', { clip: 'pass', priority: 1, cooldown: 0 });
        g.setCommentaryVolume(.35);
        return { routine, paused: audio.paused, volume: audio.volume, rate: audio.playbackRate };
      });
      assert.equal(changes.routine, false);
      assert.equal(changes.paused, false);
      assert.equal(changes.volume, .35);
      assert.equal(changes.rate, 1);
      await page.waitForTimeout(180);
      const after = (await playing())[0];
      assert(after && after.src === before.src && after.time > before.time + .08);
      assert(await page.evaluate(() => __activeCommentaryAudio === __commentaryAudioNodes.find(a => !a.paused && a.src.includes('/assets/voice/commentary/'))));
      evidence.continuous = { before, after, changes };
    });

    await check('A goal replaces routine commentary with one complete priority recording', async () => {
      assert.equal(await announceGoal('priority-goal'), true);
      await waitForClip('/goal-gryffindor.wav');
      const result = await page.evaluate(() => ({ oldPaused: __activeCommentaryAudio.paused,
        oldTime: __activeCommentaryAudio.currentTime, activeKey: __BROOMBALL__.commentary.state.activeKey }));
      assert.equal(result.oldPaused, true);
      assert.equal(result.oldTime, 0);
      assert.equal(result.activeKey, 'priority-goal');
      assert.equal((await playing()).length, 1);
      evidence.priority = result;
    });

    await check('Live speech ducks match effects and the natural ending releases the mix', async () => {
      await page.waitForFunction(() => __BROOMBALL__.commentary.state.speaking && __BROOMBALL__.matchAudio.state.ducked);
      const during = await page.evaluate(() => {
        const g = __BROOMBALL__, played = g.matchAudio.play('pass');
        return { played, ...g.matchAudio.state, speech: g.commentary.state.speaking };
      });
      assert.equal(during.played, true);
      assert.equal(during.ducked, true);
      assert(during.activeSources > 0);
      await page.waitForFunction(() => !__BROOMBALL__.commentary.state.speaking && !__BROOMBALL__.matchAudio.state.ducked);
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => __BROOMBALL__.matchAudio.state);
      assert.equal((await playing()).length, 0);
      assert.equal(after.ducked, false);
      assert.equal(after.activeSources, 0);
      evidence.ducking = { during, after };
    });

    await check('Pause stops speech and effects; controls persist volume and never replay stale audio', async () => {
      assert.equal(await announceGoal('pause-goal'), true);
      await waitForClip('/goal-gryffindor.wav');
      const stopped = await page.evaluate(() => {
        const g = __BROOMBALL__;
        window.__activeCommentaryAudio = __commentaryAudioNodes.find(a => a.src.endsWith('/goal-gryffindor.wav') && !a.paused);
        g.matchAudio.play('pass');
        const before = g.matchAudio.state.activeSources;
        g.pauseMatch();
        return { before, after: g.matchAudio.state.activeSources, key: g.commentary.state.activeKey };
      });
      assert(stopped.before > 0);
      assert.equal(stopped.after, 0);
      assert.equal(stopped.key, null);
      assert.equal((await playing()).length, 0);
      assert.equal(await page.evaluate(() => __activeCommentaryAudio.currentTime), 0);
      await page.locator('#commentaryEnabled').uncheck();
      await page.locator('#commentaryVolume').evaluate(input => {
        input.value = '35'; input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.equal(await page.locator('#commentaryVolumeValue').textContent(), '35%');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('broomball-comfort')).commentaryVolume), .35);
      await page.screenshot({ path: path.join(out, 'commentary-audio-pause.png') });
      await page.locator('#resumeBtn').click();
      assert.equal(await announceGoal('disabled-goal'), false);
      await page.waitForTimeout(180);
      assert.equal((await playing()).length, 0);
      await page.keyboard.press('Escape');
      await page.locator('#commentaryEnabled').check();
      await page.locator('#resumeBtn').click();
      await page.waitForTimeout(180);
      assert.equal((await playing()).length, 0);
      evidence.pause = stopped;
    });

    await check('Resume accepts the first sound immediately without waiting for an animation frame', async () => {
      const result = await page.evaluate(() => {
        const g = __BROOMBALL__;
        g.pauseMatch();
        const blocked = !g.matchAudio.play('pass');
        g.resumeMatch();
        const played = g.matchAudio.play('pass'), active = g.matchAudio.state.activeSources;
        g.matchAudio.stop();
        return {blocked, played, active, remaining: g.matchAudio.state.activeSources};
      });
      assert(result.blocked && result.played && result.active > 0);
      assert.equal(result.remaining, 0);
      evidence.immediateResume = result;
    });

    await check('Restart cancels stale speech and effects before a fresh entrance', async () => {
      assert.equal(await announceGoal('restart-goal'), true);
      await waitForClip('/goal-gryffindor.wav');
      const result = await page.evaluate(() => {
        const g = __BROOMBALL__;
        const old = __commentaryAudioNodes.find(a => a.src.endsWith('/goal-gryffindor.wav') && !a.paused);
        g.matchAudio.play('shot');
        const before = g.matchAudio.state.activeSources;
        g.restartMatch();
        return { before, after: g.matchAudio.state.activeSources, crowdSources: g.matchAudio.state.activeCrowdSources, state: g.match.state,
          oldPaused: old.paused, oldTime: old.currentTime, activeKey: g.commentary.state.activeKey };
      });
      assert(result.before > 0);
      assert.equal(result.after, result.crowdSources);
      assert(result.after <= 1);
      assert.equal(result.state, 'entrance');
      assert.equal(result.oldPaused, true);
      assert.equal(result.oldTime, 0);
      assert.equal(result.activeKey, null);
      assert.equal((await playing()).length, 0);
      assert.equal(await page.evaluate(() => __BROOMBALL__.matchAudio.state.paused), false);
      evidence.restart = result;
      await page.evaluate(() => __BROOMBALL__.returnToMenu());
    });

    await check('An 800 × 600 viewport keeps pause audio controls and actions reachable', async () => {
      await page.setViewportSize({ width: 800, height: 600 });
      await page.locator('#startBtn').click();
      if (await page.evaluate(() => __BROOMBALL__.match.state === 'entrance')) await page.locator('#skipEntrance').click();
      await page.keyboard.press('Escape');
      const bounds = {};
      for (const id of ['commentaryEnabled', 'commentaryVolume', 'resumeBtn', 'restartPauseBtn', 'menuPauseBtn']) {
        const control = page.locator('#' + id);
        await control.scrollIntoViewIfNeeded();
        assert(await control.isVisible());
        const rect = await control.boundingBox();
        assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 800 && rect.y + rect.height <= 600, id + ' is reachable');
        bounds[id] = rect;
      }
      await page.screenshot({ path: path.join(out, 'commentary-audio-pause-800.png') });
      evidence.smallViewport = bounds;
      await page.locator('#menuPauseBtn').click();
    });

    await check('The file entry point plays offline kickoff audio with no synthesis fallback', async () => {
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
      await page.evaluate(() => { __BROOMBALL__.setCommentaryEnabled(true); __BROOMBALL__.setCommentaryVolume(.35); });
      await collectAudioNodes();
      await page.locator('#startBtn').click();
      if (await page.evaluate(() => __BROOMBALL__.match.state === 'entrance')) await page.locator('#skipEntrance').click();
      await keepPossession();
      await waitForClip(kickoffFile);
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.backend), 'audio');
      const active = await playing();
      assert.equal(active.length, 1);
      assert(active[0].src.startsWith('file:'));
      assert.equal(active[0].volume, .35);
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
      evidence.filePlayback = active[0];
      await page.evaluate(() => __BROOMBALL__.returnToMenu());
      assert.equal((await playing()).length, 0);
      assert.equal(await page.evaluate(() => __BROOMBALL__.matchAudio.state.activeSources), 0);
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'commentary-audio.json'), JSON.stringify({ passed, evidence, errors }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'commentary-audio-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'commentary-audio-failure.json'), JSON.stringify({ passed, evidence, errors, error: String(error) }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
