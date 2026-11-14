/* Real AAC decoding and native HTMLAudioElement playback; no audio or speech mocks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/commentary/manifest.json'), 'utf8'));

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
      .filter(a => a.src.includes('/assets/commentary/') && !a.paused && !a.ended)
      .map(a => ({ src: a.src, time: a.currentTime, duration: a.duration, volume: a.volume, error: a.error?.code || null })));

    await check('All 65 English clips match catalog text, names and SSML emphasis', async () => {
      const lines = await page.evaluate(() => ({ catalog: BroomCommentaryClips, names: BroomCommentaryLines }));
      assert.equal(manifest.length, 65);
      assert.deepEqual(Object.keys(lines.catalog).sort(), manifest.map(line => line.id).sort());
      const names = [...Object.values(lines.names.houseNames), ...Object.values(lines.names.nameById)];
      let emphasizedNames = 0;
      for (const line of manifest) {
        assert.equal(line.language, 'en-GB');
        assert.equal(line.voice, 'Daniel');
        assert.equal(line.text, lines.catalog[line.id].text);
        assert.match(lines.catalog[line.id].src, new RegExp('/' + line.id + '\\.m4a$'));
        assert.doesNotMatch(line.text, /[\u3400-\u9fff]/);
        for (const name of names.filter(name => line.text.includes(name))) {
          assert(line.emphasis.includes(name), line.id + ' emphasizes ' + name);
          assert(line.ssml.includes('<emphasis level="strong">' + name + '</emphasis>'), line.id + ' has strong SSML emphasis');
          emphasizedNames++;
        }
      }
      evidence.catalog = { clips: manifest.length, emphasizedNames };
    });

    await check('Every real AAC file decodes to finite, non-silent browser PCM', async () => {
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
        assert.equal(clip.bytes, manifest[index].bytes, clip.id + ' bytes');
        assert(clip.duration > .5 && clip.duration <= 10, clip.id + ' duration');
        assert(Math.abs(clip.duration - manifest[index].duration) < .15, clip.id + ' duration matches manifest');
        assert(clip.finite && clip.channels >= 1 && clip.peak > .01 && clip.rms > .001, clip.id + ' audible PCM');
      }
      evidence.decoded = decoded;
    });

    await collectAudioNodes();
    await check('A start click plays one real recording without speech synthesis fallback', async () => {
      await page.screenshot({ path: path.join(out, 'commentary-audio-menu.png') });
      await page.locator('[data-mode="training"]').click();
      await page.locator('#startBtn').click();
      await page.waitForFunction(() => __BROOMBALL__.commentary.state.backend === 'audio' && window.__commentaryAudioNodes
        .some(a => a.src.endsWith('/training.m4a') && !a.paused && a.currentTime > .05));
      const active = await playing();
      assert.equal(active.length, 1);
      assert(active[0].duration > 1 && active[0].error === null);
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
      evidence.started = active[0];
    });

    await check('Routine events, player casting and live volume changes preserve the sentence', async () => {
      const before = (await playing())[0];
      const changes = await page.evaluate(() => {
        const g = __BROOMBALL__;
        const audio = __commentaryAudioNodes.find(a => a.src.endsWith('/training.m4a') && !a.paused);
        window.__activeCommentaryAudio = audio;
        const routine = g.commentary.announce('busy-pass', 'ignored', { clip: 'pass', priority: 1, cooldown: 0 });
        g.switchCharacter(2);
        const cast = g.castSpell();
        g.commentary.setVolume(.35);
        return { routine, cast, same: audio === __activeCommentaryAudio, paused: audio.paused, volume: audio.volume };
      });
      assert.equal(changes.routine, false);
      assert.equal(changes.cast, true);
      assert.equal(changes.paused, false);
      assert.equal(changes.volume, .35);
      await page.waitForTimeout(180);
      const after = (await playing())[0];
      assert(after && after.src === before.src && after.time > before.time + .08);
      assert(await page.evaluate(() => __activeCommentaryAudio === __commentaryAudioNodes.find(a => !a.paused && a.src.includes('/assets/commentary/'))));
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
      evidence.continuous = { before, after, changes };
    });

    await check('Pause and toggle stop native media, and resume never replays a stale line', async () => {
      await page.evaluate(() => __BROOMBALL__.pauseMatch());
      assert.equal((await playing()).length, 0);
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.activeKey), null);
      assert.equal(await page.evaluate(() => __activeCommentaryAudio.currentTime), 0);
      await page.screenshot({ path: path.join(out, 'commentary-audio-pause.png') });
      await page.locator('#resumeBtn').click();
      await page.waitForTimeout(180);
      assert.equal((await playing()).length, 0);
      await page.evaluate(() => {
        const g = __BROOMBALL__;
        g.commentary.announce('toggle-test', 'ignored', { clip: 'goal-gryffindor', priority: 4, cooldown: 0 });
      });
      await page.waitForFunction(() => __commentaryAudioNodes.some(a => a.src.endsWith('/goal-gryffindor.m4a') && !a.paused && a.currentTime > .05));
      await page.keyboard.press('n');
      assert.equal((await playing()).length, 0);
      await page.keyboard.press('n');
      await page.waitForTimeout(180);
      assert.equal((await playing()).length, 0);
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
    });

    await check('Short viewport keeps menu and pause controls reachable', async () => {
      await page.evaluate(() => __BROOMBALL__.returnToMenu());
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.locator('#commentaryEnabledMenu').scrollIntoViewIfNeeded();
      assert(await page.locator('#commentaryEnabledMenu').isVisible());
      await page.screenshot({ path: path.join(out, 'commentary-audio-menu-1280.png') });
      await page.locator('#startBtn').click();
      await page.evaluate(() => __BROOMBALL__.pauseMatch());
      await page.locator('#commentaryVolume').scrollIntoViewIfNeeded();
      assert(await page.locator('#commentaryVolume').isVisible());
      await page.screenshot({ path: path.join(out, 'commentary-audio-pause-1280.png') });
    });

    await check('The file entry point plays local recorded audio without HTTP', async () => {
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
      await collectAudioNodes();
      await page.locator('[data-mode="training"]').click();
      await page.locator('#startBtn').click();
      await page.waitForFunction(() => __commentaryAudioNodes.some(a => a.src.startsWith('file:') && a.src.endsWith('/training.m4a') && !a.paused && a.currentTime > .05));
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.backend), 'audio');
      assert.deepEqual(await page.evaluate(() => __speechFallbackCalls), []);
      evidence.filePlayback = (await playing())[0];
      await page.evaluate(() => __BROOMBALL__.returnToMenu());
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'commentary-audio.json'), JSON.stringify({ passed, evidence, errors }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'commentary-audio-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, 'commentary-audio-failure.json'), JSON.stringify({ passed, evidence, errors, error: String(error) }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
