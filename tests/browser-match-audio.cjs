/* Render the actual sound graph to PCM, including attack/release and narration ducking. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined});
 try {
  const page = await browser.newPage();
  await page.addScriptTag({path: path.resolve(__dirname, '../game-audio.js')});
  const result = await page.evaluate(async () => {
   async function render(event, ducked = false) {
    const context = new OfflineAudioContext(1, 44100 * 3, 44100);
    const engine = createMatchAudio({createContext: () => context});
    engine.unlock();
    engine.update({speaking: ducked});
    event === 'cheer' ? engine.cheer() : engine.play(event);
    const buffer = await context.startRendering(), data = buffer.getChannelData(0);
    let peak = 0, sum = 0, step = 0;
    for (let i = 0; i < data.length; i++) {
     if (!Number.isFinite(data[i])) throw Error('Nonfinite PCM');
     peak = Math.max(peak, Math.abs(data[i])); sum += data[i] ** 2;
     if (i) step = Math.max(step, Math.abs(data[i] - data[i-1]));
    }
    const energy = (start, end) => Math.sqrt(data.slice(start, end).reduce((n, x) => n + x*x, 0)/(end-start));
    return {event, ducked, peak, rms: Math.sqrt(sum / data.length), step, start: data[0], tail: energy(88200, 132300), attack: energy(0, 88), body: energy(441, 882), activeSources: engine.state.activeSources};
   }
   const sounds = [];
   for (const name of ['catch', 'pass', 'shot', 'goal', 'cheer']) {
    sounds.push(await render(name)); sounds.push(await render(name, true));
   }
   const unavailable = createMatchAudio({createContext: () => {throw Error('No audio device');}});
   const silent = {unlocked: unavailable.unlock(), played: unavailable.play('pass')};
   const context = new OfflineAudioContext(1, 44100, 44100), engine = createMatchAudio({createContext: () => context});
   engine.unlock();engine.play('shot');engine.cheer();engine.update({paused: true});
   const stopped = {...engine.state, rejectedWhilePaused: !engine.play('pass')};
   engine.update({paused: false});const resumed = engine.play('pass');engine.stop();
   return {sounds, silent, stopped, resumed, remaining: engine.state.activeSources};
  });
  for (let i = 0; i < result.sounds.length; i += 2) {
   const normal = result.sounds[i], ducked = result.sounds[i+1];
   for (const sound of [normal, ducked]) {
    assert(sound.peak > .001 && sound.peak < .2, JSON.stringify(sound));
    assert.equal(Math.abs(sound.start), 0);assert.equal(sound.tail, 0);assert.equal(sound.activeSources, 0);
    assert(sound.step < .08, JSON.stringify(sound));
    assert(sound.attack < sound.body * .4, JSON.stringify(sound));
   }
   assert(ducked.rms < normal.rms * .8, JSON.stringify({normal, ducked}));
   console.log('PASS', normal.event, 'renders soft finite PCM and ducks beneath speech');
  }
  assert.deepEqual(result.silent, {unlocked: false, played: false});
  assert.equal(result.stopped.activeSources, 0);assert(result.stopped.paused && result.stopped.rejectedWhilePaused);
  assert(result.resumed);assert.equal(result.remaining, 0);
  console.log('PASS pause cancels effects, resume recovers, missing audio never prevents gameplay');
  const out = path.join(__dirname, 'artifacts');fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'match-audio.json'), JSON.stringify(result, null, 2));
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
