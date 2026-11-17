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
    const engine = createMatchAudio({createContext: () => context, crowdAssets: null});
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
  await page.addScriptTag({path: path.resolve(__dirname, '../assets/audio/crowd/catalog.js')});
  const crowd = await page.evaluate(async () => {
   const rms = (data, start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) { if (!Number.isFinite(data[i])) throw Error('Nonfinite crowd PCM'); sum += data[i] * data[i]; }
    return Math.sqrt(sum / (end - start));
   };
   async function render({speaking = false, muted = false, cheer = false} = {}) {
    const rate = 22050, seconds = cheer ? 9 : 40, context = new OfflineAudioContext(1, rate * seconds, rate);
    const engine = createMatchAudio({createContext: () => context});
    engine.unlock(); const ready = await engine.prepare();
    if (muted) engine.setCrowdVolume(0);
    engine.update({active: !cheer, speaking});
    for (let i = 0; i < 120; i++) engine.update({active: !cheer, speaking});
    if (cheer) engine.cheer();
    const before = engine.state, buffer = await context.startRendering(), data = buffer.getChannelData(0);
    let peak = 0;
    for (const sample of data) { if (!Number.isFinite(sample)) throw Error('Nonfinite crowd PCM'); peak = Math.max(peak, Math.abs(sample)); }
    const bins = [];
    for (let second = 1; second < seconds - 1; second++) bins.push(rms(data, second * rate, (second + 1) * rate));
    engine.stop();
    return {ready, peak, bins, start: data[0], tail: rms(data, (seconds - 1) * rate, seconds * rate), before, after: engine.state};
   }
   const bed = await render(), ducked = await render({speaking: true}), muted = await render({muted: true}), cheer = await render({cheer: true});
   // Use the native decoder but hold delivery, exercising pause during loading.
   const context = new OfflineAudioContext(1, 22050, 22050), decode = context.decodeAudioData.bind(context);
   let release;
   const gate = new Promise(resolve => {release = resolve;});
   context.decodeAudioData = async data => { const decoded = await decode(data); await gate; return decoded; };
   const engine = createMatchAudio({createContext: () => context});
   engine.unlock(); engine.update({active: true}); engine.update({paused: true});
   release(); await engine.prepare(); const latePause = engine.state;
   engine.update({paused: false}); const resumed = engine.state;
   for (let i = 0; i < 100; i++) engine.update({paused: false, active: true});
   const repeated = engine.state;
   engine.cheer(); engine.setCrowdVolume(0); const silence = engine.state;
   engine.setCrowdVolume(.8); const unmuted = engine.state;
   engine.update({active: false}); const ended = engine.state;
   engine.update({active: true}); engine.stop(); const stopped = engine.state;
   const broken = createMatchAudio({createContext: () => new OfflineAudioContext(1, 22050, 22050), crowdAssets: {ambience: 'not-a-wav', cheer: '!'}});
   broken.unlock(); broken.update({active: true}); const failedReady = await broken.prepare();
   return {bed, ducked, muted, cheer, latePause, resumed, repeated, silence, unmuted, ended, stopped, failedReady, failedState: broken.state};
  });
  assert(crowd.bed.ready && crowd.bed.before.ambiencePlaying);
  assert.equal(crowd.bed.before.ambienceStarts, 1, 'Repeated frames share one loop');
  assert(crowd.bed.bins.every(value => value > .005), 'Crowd stays audible through the 36-second loop boundary');
  assert(crowd.bed.peak < 1 && Math.abs(crowd.bed.start) === 0);
  assert.equal(crowd.bed.after.ambiencePlaying, false);
  console.log('PASS real crowd PCM is continuously audible across a loop and repeated frames never stack loops');
  for (let i = 0; i < crowd.bed.bins.length; i++) {
   const ratio = crowd.ducked.bins[i] / crowd.bed.bins[i];
   assert(ratio > .54 && ratio < .56, 'Narration keeps an audible 55% crowd bed: ' + ratio);
  }
  assert.equal(crowd.muted.peak, 0);assert.equal(crowd.muted.before.ambiencePlaying, false);
  console.log('PASS narration smoothly lowers the recorded bed, and the crowd volume can fully mute it');
  assert.equal(crowd.cheer.before.recordedCheers, 1);assert.equal(crowd.cheer.before.activeCrowdSources, 1);
  assert(crowd.cheer.peak > .05 && crowd.cheer.peak < 1 && crowd.cheer.bins[2] > .01);
  assert.equal(crowd.cheer.tail, 0);assert.equal(crowd.cheer.after.activeSources, 0);
  console.log('PASS goals use the complete real cheering recording and release their audio nodes');
  assert.equal(crowd.latePause.ambiencePlaying, false);assert.equal(crowd.latePause.ambienceStarts, 0);
  assert(crowd.resumed.ambiencePlaying);assert.equal(crowd.repeated.ambienceStarts, crowd.resumed.ambienceStarts);
  assert(!crowd.silence.ambiencePlaying && crowd.silence.activeCrowdSources === 0);
  assert(crowd.unmuted.ambiencePlaying);
  assert(!crowd.ended.ambiencePlaying && crowd.ended.activeCrowdSources === 0);
  assert(!crowd.stopped.active && !crowd.stopped.ambiencePlaying && crowd.stopped.activeSources === 0);
  assert.equal(crowd.failedReady, false);assert.equal(crowd.failedState.ambiencePlaying, false);
  console.log('PASS loading during pause, resume, mute, match end and broken assets cannot leave stale crowd playback');
  const out = path.join(__dirname, 'artifacts');fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'match-audio.json'), JSON.stringify({...result, crowd}, null, 2));
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
