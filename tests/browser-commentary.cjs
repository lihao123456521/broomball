/* Integrate real match events, persistent settings and a deterministic speech backend. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.join(__dirname, 'artifacts');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], passed = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
    window.__speechLog = [];
    window.__speechCancel = 0;
    window.Audio = class {
      constructor(src) { this.src = src; this.duration = 4; this.currentTime = 0; this.volume = .75; this.paused = true; }
      load() {}
      pause() { this.paused = true; window.__speechCancel++; }
      play() {
        this.paused = false;
        const line = Object.values(window.BroomCommentaryClips || {}).find(line => line.src === this.src);
        if (line) window.__speechLog.push({ text: line.text, src: this.src, volume: this.volume, backend: 'audio' });
        return Promise.resolve();
      }
    };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ name: 'Chinese local', lang: 'zh-CN', localService: true }, { name: 'English', lang: 'en-GB', localService: true }],
      addEventListener() {}, cancel() { window.__speechCancel++; },
      speak(utterance) { window.__speechLog.push({ text: utterance.text, lang: utterance.lang, pitch: utterance.pitch, rate: utterance.rate, volume: utterance.volume, voice: utterance.voice?.name }); }
    } });
  });
  try {
    await page.goto(process.env.BROOM_GAME_URL || 'http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const check = async (name, run) => { await run(); passed.push(name); console.log('PASS', name); };
    const events = () => page.evaluate(() => window.__speechLog);
    const stage = () => page.evaluate(() => {
      const g = window.__BROOMBALL__;
      g.startMatch('standard'); g.match.state = 'playing';
      g.rivals.forEach(r => r.stun = 100); g.allies.forEach(a => a.stun = 100);
      g.bludgers.forEach(b => b.frozen = 100);
    });
    await check('Menu toggle, N shortcut and volume persist across reload', async () => {
      await page.locator('#commentaryEnabledMenu').uncheck();
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.enabled), false);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#commentaryEnabledMenu').isChecked(), false);
      await stage(); await page.keyboard.press('n');
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.enabled), true);
      await page.keyboard.press('Escape');
      await page.locator('#commentaryVolume').fill('0.4');
      await page.locator('#commentaryEnabled').uncheck();
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual(await page.evaluate(() => ({ enabled: __BROOMBALL__.settings.commentary, volume: __BROOMBALL__.settings.commentaryVolume })), { enabled: false, volume: .4 });
    });
    await check('Kickoff uses one preloaded English clip with chosen houses', async () => {
      await page.locator('#commentaryEnabledMenu').check();
      await page.evaluate(() => { const g = __BROOMBALL__; g.selectHouse('ravenclaw'); g.selectOpponent('hufflepuff'); });
      await page.locator('#startBtn').click();
      await page.clock.runFor(3100);
      const kickoff = (await events()).find(u => u.text.includes('Brooms up!'));
      assert(kickoff); assert(kickoff.text.includes('Ravenclaw')); assert(kickoff.text.includes('Hufflepuff'));
      assert.equal(kickoff.backend, 'audio'); assert.match(kickoff.src, /kickoff-ravenclaw-hufflepuff/); assert.equal(kickoff.volume, .4);
    });
    await check('Goals preempt routine speech with the correct English house call', async () => {
      await page.evaluate(() => { const g = __BROOMBALL__; g.scoreGoal('player'); g.scoreGoal('rival'); });
      const log = await events();
      assert(log.some(u => u.text.includes('Goal for Ravenclaw!')));
      assert(log.some(u => u.text.includes('Goal for Hufflepuff!')));
      assert.match(await page.locator('#commentaryCaption').innerText(), /Goal for Hufflepuff!/);
      await page.screenshot({ path: path.join(out, 'commentary-goal.png') });
    });
    await check('Pause, help and menu stop immediately without replaying stale lines', async () => {
      let before = await page.evaluate(() => __speechCancel);
      await page.keyboard.press('Escape');
      assert(await page.evaluate(() => __speechCancel) > before);
      assert.equal(await page.locator('#commentaryCaption').isVisible(), false);
      const count = (await events()).length;
      await page.clock.runFor(1500);
      assert.equal((await events()).length, count);
      await page.locator('#resumeBtn').click();
      assert.equal((await events()).length, count);
      await page.evaluate(() => { const g = __BROOMBALL__; g.scoreGoal('player'); g.openHelp(); });
      assert.equal(await page.locator('#commentaryCaption').isVisible(), false);
      await page.evaluate(() => __BROOMBALL__.returnToMenu());
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.activeKey), null);
    });
    await check('Disabled commentary stays silent while character spell voice remains', async () => {
      await stage();
      await page.evaluate(() => { const g = __BROOMBALL__; g.setCommentaryEnabled(false); g.switchCharacter(2); });
      const before = (await events()).length;
      await page.evaluate(() => { const g = __BROOMBALL__; g.scoreGoal('player'); g.match.elapsed = 111; g.updateSnitch(.01); });
      assert.equal((await events()).length, before);
      await page.keyboard.press('r');
      assert.equal((await events()).length, before + 1);
      assert.equal((await events()).at(-1).lang, 'en-GB');
    });
    await check('Snitch and result events are announced and restart clears prior match', async () => {
      await stage();
      await page.evaluate(() => { const g = __BROOMBALL__; g.setCommentaryEnabled(true); g.match.elapsed = 111; g.updateSnitch(.01); });
      assert((await events()).at(-1).text.includes('Golden Snitch is out'));
      await page.evaluate(() => __BROOMBALL__.catchSnitch('player'));
      assert((await events()).at(-1).text.includes('catch the Snitch'));
      assert.equal(await page.evaluate(() => __BROOMBALL__.match.state), 'ended');
      await page.evaluate(() => __BROOMBALL__.restartMatch());
      assert.equal(await page.evaluate(() => __BROOMBALL__.commentary.state.activeKey), null);
    });
    await check('Current player names are spoken as whole English recordings', async () => {
      await stage();
      await page.evaluate(() => { const g = __BROOMBALL__; g.switchCharacter(0); g.setCarrier('player'); });
      assert.equal((await events()).at(-1).text, 'Luna Lovegood has the Quaffle!');
      await page.evaluate(() => { const g = __BROOMBALL__; g.commentary.stop(); g.throwQuaffle(); });
      assert.equal((await events()).at(-1).text, 'Luna Lovegood shoots for the hoops!');
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'commentary.json'), JSON.stringify({ passed, errors, events: await events() }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
