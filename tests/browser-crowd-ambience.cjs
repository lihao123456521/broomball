/* Observe real local recordings and native Web Audio through the live match UI. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'artifacts');

(async () => {
 fs.mkdirSync(out, {recursive: true});
 const report = {passed: [], evidence: {}, errors: [], network: []};
 const browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']});
 let page;
 try {
  page = await browser.newPage({viewport: {width: 1280, height: 720}});
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route(/^https?:\/\//, route => {report.network.push(route.request().url());return route.abort();});
  await page.addInitScript(() => {
   // These observers forward to the original browser methods. They neither
   // replace decoding/playback nor infer active loops solely from game state.
   window.__nativeCrowdSources = [];
   const create = AudioContext.prototype.createBufferSource;
   AudioContext.prototype.createBufferSource = function(...args) {
    const source = create.apply(this, args), record = {source, context: this, starts: 0, stopAt: null, ended: false};
    const start = source.start.bind(source), stop = source.stop.bind(source);
    source.start = (...values) => {const result = start(...values);record.starts++;return result;};
    source.stop = (...values) => {const result = stop(...values);record.stopAt = values[0] ?? this.currentTime;return result;};
    source.addEventListener('ended', () => {record.ended = true;});
    __nativeCrowdSources.push(record);return source;
   };
   window.__nativeCrowdSnapshot = () => __nativeCrowdSources.map(record => ({
    loop: record.source.loop, duration: record.source.buffer?.duration || 0, starts: record.starts,
    contextState: record.context.state,
    live: record.starts > 0 && !record.ended && (record.stopAt === null || record.context.currentTime < record.stopAt)
   }));
  });
  const check = async (name, run) => {await run();report.passed.push(name);console.log('PASS', name);};
  const snapshot = () => page.evaluate(() => ({...__BROOMBALL__.matchAudio.state,
   loops: __nativeCrowdSnapshot().filter(source => source.loop && source.live),
   recorded: __nativeCrowdSnapshot().filter(source => !source.loop && source.live && source.duration > 5)}));
  const keepQuiet = () => page.evaluate(() => {
   const g = __BROOMBALL__;g.match.stealCooldown = 1000;
   for (const unit of [...g.rivals, ...g.allies]) {unit.speed = 0;unit.stun = 1000;}
  });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href, {waitUntil: 'load'});
  await page.waitForFunction(() => !!window.__BROOMBALL__);
  await page.evaluate(() => Promise.all([BroomModels.ready, __BROOMBALL__.modelScenery]));

  await check('Local startup stays quiet until an actual match and the licensed recordings are bundled', async () => {
   const initial = await snapshot();assert.equal(initial.ambiencePlaying, false);assert.equal(initial.loops.length, 0);
   const assets = await page.evaluate(() => ({ambienceBytes: BroomCrowdAudio.ambience.length,
    cheerBytes: BroomCrowdAudio.cheer.length, metadata: BroomCrowdAudio.metadata}));
   assert(assets.ambienceBytes > 100000 && assets.cheerBytes > 100000);
   assert.equal(assets.metadata.author, 'Gregor Quendel');assert.equal(assets.metadata.license, 'CC BY 4.0');
   assert(assets.metadata.tracks.ambience.duration > 20);assert(assets.metadata.tracks.cheer.duration >= 6);
   report.evidence.assets = assets.metadata;
  });

  await check('Start, entrance and kickoff retain one audible native crowd loop', async () => {
   const standard = page.locator('[data-mode="standard"]');if (await standard.count()) await standard.click();
   await page.locator('#startBtn').click();
   assert.equal(await page.evaluate(() => __BROOMBALL__.matchAudio.prepare()), true);
   await page.waitForFunction(() => __BROOMBALL__.matchAudio.state.ambiencePlaying);
   const entrance = await snapshot();assert.equal(entrance.loops.length, 1);assert.equal(entrance.crowdReady, true);
   assert.equal(entrance.loops[0].contextState, 'running');assert(entrance.crowdVolume > 0);
   if (await page.locator('#skipEntrance').isVisible()) await page.locator('#skipEntrance').click();
   await keepQuiet();
   await page.waitForFunction(() => __BROOMBALL__.match.state === 'playing');
   const playing = await snapshot();assert.equal(playing.loops.length, 1);assert.equal(playing.ambienceStarts, entrance.ambienceStarts);
   report.evidence.start = {entrance, playing};
  });

  await check('Repeated live updates and ball effects do not restart or layer background recordings', async () => {
   const before = await snapshot();
   await page.evaluate(async () => {
    const audio = __BROOMBALL__.matchAudio;
    for (let i = 0; i < 120; i++) audio.update({active: true, speaking: __BROOMBALL__.commentary.state.speaking});
    await audio.prepare();audio.play('pass');
   });
   await page.waitForTimeout(250);
   const after = await snapshot();assert.equal(after.loops.length, 1);assert.equal(after.ambienceStarts, before.ambienceStarts);
   report.evidence.continuous = {before, after};
  });

  await check('Pause immediately stops native crowd playback and resume creates only one fresh loop', async () => {
   const result = await page.evaluate(() => {
    const g = __BROOMBALL__, before = g.matchAudio.state.ambienceStarts;
    g.pauseMatch();const paused = {...g.matchAudio.state};
    const pausedLoops = __nativeCrowdSnapshot().filter(source => source.loop && source.live).length;
    g.resumeMatch();const resumed = {...g.matchAudio.state};
    const resumedLoops = __nativeCrowdSnapshot().filter(source => source.loop && source.live).length;
    return {before, paused, pausedLoops, resumed, resumedLoops};
   });
   assert.equal(result.paused.ambiencePlaying, false);assert.equal(result.paused.activeCrowdSources, 0);assert.equal(result.pausedLoops, 0);
   assert.equal(result.resumed.ambiencePlaying, true);assert.equal(result.resumedLoops, 1);
   assert.equal(result.resumed.ambienceStarts, result.before + 1);report.evidence.pause = result;
  });

  await check('Crowd volume mutes only the crowd and commentary can be disabled independently', async () => {
   const result = await page.evaluate(() => {
    const g = __BROOMBALL__;g.setCommentaryEnabled(true);
    const announced = g.commentary.announce('crowd-volume-test', '', {clip: 'goal-gryffindor', priority: 4, cooldown: 0});
    const activeKey = g.commentary.state.activeKey, voiceVolume = g.commentary.state.volume;
    g.matchAudio.cheer();g.setCrowdVolume(0);
    const muted = {...g.matchAudio.state}, preservedKey = g.commentary.state.activeKey;
    const acceptedWhileMuted = g.matchAudio.cheer(), effectWhileMuted = g.matchAudio.play('pass');
    g.setCrowdVolume(.65);const restored = {...g.matchAudio.state};
    g.setCommentaryEnabled(false);const commentaryOff = {...g.matchAudio.state};
    return {announced, activeKey, preservedKey, voiceVolume, finalVoiceVolume: g.commentary.state.volume,
     muted, acceptedWhileMuted, effectWhileMuted, restored, commentaryOff,
     storedVolume: JSON.parse(localStorage.getItem('broomball-comfort')).crowdVolume};
   });
   assert(result.announced);assert.equal(result.preservedKey, result.activeKey);assert.equal(result.finalVoiceVolume, result.voiceVolume);
   assert.equal(result.muted.ambiencePlaying, false);assert.equal(result.muted.activeCrowdSources, 0);
   assert.equal(result.acceptedWhileMuted, false);assert.equal(result.effectWhileMuted, true);
   assert(result.restored.ambiencePlaying && result.commentaryOff.ambiencePlaying);assert.equal(result.storedVolume, .65);
   assert.equal((await snapshot()).loops.length, 1);report.evidence.volume = result;
  });

  await check('A real goal layers the recorded cheer over the existing stadium bed', async () => {
   const before = await snapshot();
   await page.evaluate(() => __BROOMBALL__.scoreGoal('player'));
   const after = await snapshot();
   assert.equal(after.recordedCheers, before.recordedCheers + 1);
   assert.equal(after.activeCrowdSources, 1);assert.equal(after.recorded.length, 1);
   assert.equal(after.loops.length, 1);assert.equal(after.ambienceStarts, before.ambienceStarts);
   report.evidence.goal = {before, after};
  });

  await check('Restart replaces the loop once and menu/full-time release all crowd nodes', async () => {
   const before = await snapshot();
   await page.evaluate(() => __BROOMBALL__.restartMatch());
   const restarted = await snapshot();
   assert.equal(restarted.loops.length, 1);assert.equal(restarted.ambienceStarts, before.ambienceStarts + 1);
   // The new entrance is allowed one fresh recorded cheer, but no old goal tail.
   assert(restarted.activeCrowdSources <= 1);assert(restarted.recorded.length <= 1);
   await page.evaluate(() => __BROOMBALL__.returnToMenu());
   const menu = await snapshot();assert.equal(menu.loops.length, 0);assert.equal(menu.activeCrowdSources, 0);
   await page.waitForTimeout(120);assert.equal((await snapshot()).ambiencePlaying, false);
   await page.evaluate(() => {
    const g = __BROOMBALL__;g.startMatch('standard');
    Object.assign(g.match, {state: 'playing', paused: false, tutorial: null, timeLeft: .01, kickoff: 0});
    g.matchAudio.cheer();g.update(.02);
   });
   const ended = await snapshot();assert.equal(await page.evaluate(() => __BROOMBALL__.match.state), 'ended');
   assert.equal(ended.loops.length, 0);assert.equal(ended.activeCrowdSources, 0);
   report.evidence.restart = {before, restarted, menu, ended};
  });

  await check('Small-screen crowd controls are reachable and the selected volume survives reload', async () => {
   await page.setViewportSize({width: 800, height: 600});
   await page.evaluate(() => {__BROOMBALL__.startMatch('standard');__BROOMBALL__.pauseMatch();});
   const bounds = {};
   for (const id of ['commentaryVolume', 'crowdVolume', 'resumeBtn', 'menuPauseBtn']) {
    const input = page.locator('#'+id);await input.scrollIntoViewIfNeeded();assert(await input.isVisible());
    const rect = await input.boundingBox();
    assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x+rect.width <= 800 && rect.y+rect.height <= 600, id);
    bounds[id] = rect;
   }
   await page.locator('#crowdVolume').evaluate(input => {input.value = '37';input.dispatchEvent(new Event('input', {bubbles: true}));});
   assert.equal(await page.locator('#crowdVolumeValue').textContent(), '37%');
   await page.screenshot({path: path.join(out, 'crowd-pause-800.png')});
   await page.locator('#menuPauseBtn').click();await page.reload({waitUntil: 'load'});
   await page.waitForFunction(() => !!window.__BROOMBALL__);
   assert.equal(await page.evaluate(() => __BROOMBALL__.settings.crowdVolume), .37);
   const loaded = await snapshot();assert.equal(loaded.crowdVolume, .37);assert.equal(loaded.ambiencePlaying, false);
   report.evidence.smallViewport = {bounds, loaded};
  });

  assert.deepEqual(report.errors, []);assert.deepEqual(report.network, []);
  console.log('BROWSER_CROWD_AMBIENCE_PASS', report.passed.length);
 } catch (error) {
  report.failure = String(error);
  if (page) await page.screenshot({path: path.join(out, 'crowd-ambience-failure.png')}).catch(() => {});
  throw error;
 } finally {
  fs.writeFileSync(path.join(out, 'crowd-ambience-browser.json'), JSON.stringify(report, null, 2));
  await browser.close();
 }
})().catch(error => {console.error(error);process.exitCode = 1;});
