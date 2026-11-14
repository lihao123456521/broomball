/* Deterministic audio/speech arbitration, cancellation and browser-failure checks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'game-commentary.js'), 'utf8');
const english = { lang: 'en-GB', name: 'Local English', localService: true };
const daniel = { lang: 'en-GB', name: 'Daniel', localService: true };
const chinese = { lang: 'zh-CN', name: 'Local Chinese', localService: true };
const clips = {
  kickoff: { text: 'Welcome to the Golden Pitch. Gryffindor versus Slytherin!', src: 'audio/kickoff.wav' },
  pass: { text: 'Harry Potter finds a teammate!', src: 'audio/pass.wav' },
  goal: { text: 'Gryffindor scores!', src: 'audio/goal.wav' },
  away: { text: 'Slytherin answers!', src: 'audio/away.wav' }
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(options = {}) {
  const spoken = [], captions = [], listeners = {}, audio = [], pending = [];
  let voices = options.voices || [], cancellations = 0, allowed = true;
  const synth = {
    getVoices() { if (options.failVoices) throw Error('voice service unavailable'); return voices; },
    speak(utterance) {
      if (options.failSpeak) throw Error('speech service unavailable');
      spoken.push(utterance);
      if (options.syncError) { utterance.onerror(); throw Error('disconnected after callback'); }
    },
    cancel() { cancellations++; if (options.failCancel) throw Error('speech service disconnected'); },
    addEventListener(event, handler) { listeners[event] = handler; }
  };
  const window = options.unsupported ? {} : {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: function(text) { this.text = text; }
  };
  if (options.audio) {
    window.BroomCommentaryClips = options.clips || clips;
    window.Audio = class {
      constructor(src) {
        this.src = src; this.duration = 3; this.currentTime = 0; this.volume = 1;
        this.paused = true; this.plays = 0; this.pauses = 0; this.loads = 0;
        audio.push(this);
      }
      load() { this.loads++; }
      pause() { this.paused = true; this.pauses++; }
      play() {
        this.plays++; this.paused = false;
        if (options.deferred && !this.src.startsWith('data:')) return new Promise((resolve, reject) => pending.push({ audio: this, resolve, reject }));
        if (options.audioFailure && !this.src.startsWith('data:')) return Promise.reject(Object.assign(Error('media failed'), { name: options.audioFailure }));
        return Promise.resolve();
      }
    };
  }
  vm.runInNewContext(source, { window });
  const engine = window.createMatchCommentary({
    enabled: options.enabled, volume: options.volume,
    canSpeak: () => allowed,
    onCaption: text => { captions.push(text); if (options.failCaption) throw Error('view unavailable'); }
  });
  return {
    engine, spoken, captions, audio, pending,
    get cancellations() { return cancellations; },
    finishSpeech() { spoken.at(-1)?.onend(); },
    finishAudio(src) { const item = src ? audio.find(a => a.src === src) : audio.findLast(a => a.plays && !a.src.startsWith('data:')); item.onended(); },
    setAllowed(value) { allowed = value; },
    changeVoices(value) { voices = value; listeners.voiceschanged(); }
  };
}
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('PASS', name); }
(async () => {
await check('English fallback pins Daniel at a natural rate and speaks complete sentences', () => {
  const f = fixture({ voices: [chinese, { ...english, localService: false }, english, daniel] });
  const sentence = 'Harry Potter is moving forward for Gryffindor!';
  assert.equal(f.engine.announce('possession', sentence), true);
  const u = f.spoken[0];
  assert.equal(u.text, sentence);
  assert.equal(u.voice, daniel); assert.equal(u.lang, 'en-GB');
  assert.equal(u.pitch, .96); assert.equal(u.rate, 1); assert.equal(u.volume, .75);
  assert.equal(f.engine.state.backend, 'speech'); assert.equal(f.engine.state.available, true);
  f.finishSpeech(); f.changeVoices([english, daniel, { ...daniel, name: 'Daniel Premium' }]);
  f.engine.announce('pass', 'Potter makes the pass.');
  assert.equal(f.spoken.at(-1).voice, daniel, 'Voice changes do not change the selected narrator');
});
await check('Routine calls never interrupt a sentence; critical calls replace stale information', () => {
  const f = fixture();
  f.engine.announce('possession', 'Gryffindor has possession.', { priority: 1 });
  const old = f.spoken[0];
  assert.equal(f.engine.announce('shot', 'Potter shoots!', { priority: 3 }), false);
  assert.equal(f.engine.announce('goal', 'Gryffindor scores!', { priority: 4, cooldown: 0 }), true);
  assert.equal(f.engine.announce('goal', 'Gryffindor scores!', { priority: 4, cooldown: 0 }), false, 'Do not restart the same active event');
  assert.equal(f.engine.announce('other-goal-key', 'Gryffindor scores!', { priority: 4, cooldown: 0 }), false, 'Do not restart identical audio copy under a new key');
  assert.equal(f.engine.announce('away-goal', 'Slytherin answers!', { priority: 4 }), true);
  old.onend(); assert.equal(f.engine.state.activeKey, 'away-goal');
  assert.equal(f.spoken.length, 3);
  f.finishSpeech(); assert.equal(f.engine.announce('away-goal', 'Slytherin scores again!', { priority: 4 }), false);
  f.engine.tick(8); assert.equal(f.engine.announce('away-goal', 'Slytherin scores again!', { priority: 4 }), true);
});
await check('The clip catalog preloads once and uses one uninterrupted recording per line', async () => {
  const f = fixture({ audio: true, voices: [daniel] });
  assert.equal(f.engine.prepare(), 4); assert.equal(f.engine.prepare(), 4);
  assert.equal(f.audio.length, 4); assert(f.audio.every(a => a.preload === 'auto' && a.loads === 1));
  assert.equal(await f.engine.unlock(), true);
  assert.equal(f.audio.filter(a => a.src.startsWith('data:')).length, 1);
  assert.equal(await f.engine.unlock(), true);
  f.engine.announce('opening', 'Fallback text', { clip: 'kickoff' }); await flush();
  const recording = f.audio.find(a => a.src === clips.kickoff.src);
  assert.equal(recording.plays, 1); assert.equal(recording.paused, false);
  assert.equal(f.engine.state.caption, clips.kickoff.text);
  assert.equal(f.engine.state.backend, 'audio'); assert.equal(f.spoken.length, 0);
  assert.equal(f.engine.announce('pass', '', { clip: 'pass', priority: 3 }), false);
  assert.equal(recording.pauses, 0, 'Routine events do not cut the active sentence');
  f.finishAudio(clips.kickoff.src);
  assert.equal(f.engine.state.activeKey, null);
});
await check('Live clip volume changes never pause or reload the playing recording', async () => {
  const f = fixture({ audio: true });
  f.engine.announce('opening', '', { clip: 'kickoff' }); await flush();
  const a = f.audio[0], pauseCount = a.pauses, loadCount = a.loads;
  f.engine.setVolume(.4); assert.equal(a.volume, .4);
  f.engine.setVolume(0); assert.equal(a.volume, 0);
  f.engine.setVolume(2); assert.equal(a.volume, 1);
  assert.equal(a.pauses, pauseCount); assert.equal(a.loads, loadCount); assert.equal(a.plays, 1);
  assert.equal(f.engine.state.activeKey, 'opening');
  f.engine.setVolume(NaN); assert.equal(f.engine.state.volume, 1);
});
await check('Critical clip preemption cancels prior playback and stale end callbacks', async () => {
  const f = fixture({ audio: true });
  f.engine.announce('opening', '', { clip: 'kickoff' }); await flush();
  const a = f.audio[0], oldEnd = a.onended;
  assert.equal(f.engine.announce('goal', '', { clip: 'goal', priority: 4 }), true); await flush();
  assert(a.paused); assert.equal(a.currentTime, 0);
  oldEnd(); assert.equal(f.engine.state.activeKey, 'goal');
  assert.equal(f.engine.announce('away', '', { clip: 'away', priority: 4 }), true); await flush();
  assert.equal(f.engine.state.caption, clips.away.text);
});
await check('Pause, off and reset stop clips without replaying delayed play promises', async () => {
  for (const action of ['pause', 'off', 'reset']) {
    const f = fixture({ audio: true, deferred: true });
    f.engine.announce('opening', '', { clip: 'kickoff' });
    const a = f.audio[0];
    if (action === 'pause') { f.setAllowed(false); f.engine.tick(.1); }
    if (action === 'off') f.engine.setEnabled(false);
    if (action === 'reset') f.engine.reset();
    assert.equal(f.engine.state.activeKey, null); assert.equal(f.engine.state.caption, '');
    a.paused = false; f.pending[0].resolve(); await flush();
    assert.equal(a.paused, true, 'A late completion is stopped again');
    assert.equal(f.spoken.length, 0);
    assert.equal(f.engine.state.activeKey, null);
  }
});
await check('Reusing a cached clip ignores old promise rejection without stopping its new play', async () => {
  const f = fixture({ audio: true, deferred: true, voices: [daniel] });
  f.engine.announce('opening', '', { clip: 'kickoff' });
  f.engine.reset();
  f.engine.announce('opening', '', { clip: 'kickoff' });
  const a = f.audio[0], pauses = a.pauses;
  f.pending[0].reject(Error('old aborted playback')); await flush();
  assert.equal(f.engine.state.activeKey, 'opening'); assert.equal(a.pauses, pauses);
  assert.equal(f.spoken.length, 0);
  f.pending[1].resolve(); await flush();
  assert.equal(a.plays, 2); assert.equal(a.paused, false);
});
await check('Failed files fall back to complete English speech, while autoplay denial keeps captions', async () => {
  const f = fixture({ audio: true, audioFailure: 'NotSupportedError', voices: [daniel] });
  f.engine.announce('opening', '', { clip: 'kickoff' }); await flush();
  assert.equal(f.engine.state.backend, 'speech');
  assert.equal(f.spoken[0].text, clips.kickoff.text); assert.equal(f.spoken[0].voice, daniel);
  const denied = fixture({ audio: true, audioFailure: 'NotAllowedError', voices: [daniel] });
  denied.engine.announce('opening', '', { clip: 'kickoff' }); await flush();
  assert.equal(denied.engine.state.backend, 'captions'); assert.equal(denied.spoken.length, 0);
  assert.equal(denied.engine.state.caption, clips.kickoff.text);
});
await check('Spell calls preserve recorded sentences and stay independent of commentary enable and volume', async () => {
  const f = fixture({ audio: true, voices: [daniel] });
  f.engine.announce('opening', '', { clip: 'kickoff' }); await flush();
  const pauses = f.audio[0].pauses;
  assert.equal(f.engine.spell('PROTEGO', { pitch: .82, rate: .9 }), false);
  assert.equal(f.audio[0].pauses, pauses); assert.equal(f.audio[0].paused, false);
  assert.equal(f.engine.state.activeKey, 'opening'); assert.equal(f.spoken.length, 0);
  assert.equal(f.engine.state.caption, clips.kickoff.text);
  f.engine.setEnabled(false); assert(f.audio[0].paused);
  assert.equal(f.engine.spell('PROTEGO', { pitch: .82, rate: .9 }), true);
  assert.equal(f.engine.state.caption, '');
  const cancels = f.cancellations;
  f.engine.setEnabled(false); f.engine.setVolume(0);
  assert.equal(f.engine.state.activeKey, 'spell'); assert.equal(f.cancellations, cancels);
  const u = f.spoken.at(-1);
  assert.equal(u.lang, 'en-GB'); assert.equal(u.volume, .9); assert.equal(u.pitch, .82); assert.equal(u.rate, .9);
  f.finishSpeech(); assert.equal(f.engine.spell('ACCIO'), true);
  const fallback = fixture({ voices: [daniel] });
  fallback.engine.announce('opening', 'Welcome to the Golden Pitch.');
  assert.equal(fallback.engine.spell('PROTEGO'), true, 'Fallback speech retains spell priority');
  assert.equal(fallback.engine.state.activeKey, 'spell');
});
await check('Late voices become English fallback and unavailable voices preserve captions', () => {
  const f = fixture();
  f.engine.announce('opening', 'Welcome to the Golden Pitch.');
  assert.equal(f.spoken[0].lang, 'en-GB');
  f.engine.reset(); f.changeVoices([chinese]); assert.equal(f.engine.state.available, false);
  f.engine.announce('goal', 'Gryffindor scores!'); assert.equal(f.spoken.length, 1);
  assert.equal(f.engine.state.backend, 'captions');
  f.engine.tick(5); assert.equal(f.engine.state.activeKey, null); assert.equal(f.engine.state.caption, '');
  f.changeVoices([daniel]); assert.equal(f.engine.state.available, true);
  f.engine.announce('next', 'Harry Potter has possession.'); assert.equal(f.spoken.at(-1).voice, daniel);
});
await check('Speech errors and missing browser APIs cannot break a match', () => {
  for (const options of [{ unsupported: true }, { failVoices: true }, { failSpeak: true }, { failCancel: true, failCaption: true }, { syncError: true }]) {
    const f = fixture(options);
    assert.equal(f.engine.announce('goal', 'Gryffindor scores!'), true);
    assert.equal(f.engine.state.caption, 'Gryffindor scores!');
    f.engine.tick(5); assert.equal(f.engine.state.caption, '');
    f.engine.reset(); assert.equal(f.engine.state.activeKey, null);
  }
});
await check('A watchdog bounds stuck playback and zero-volume startup remains caption-only', async () => {
  const f = fixture({ audio: true, deferred: true });
  f.engine.announce('opening', '', { clip: 'kickoff' });
  f.engine.tick(5); assert.equal(f.engine.state.caption, '');
  f.engine.tick(10); assert.equal(f.engine.state.activeKey, null); assert(f.audio[0].paused);
  const quiet = fixture({ audio: true, volume: 0 });
  quiet.engine.announce('opening', '', { clip: 'kickoff' });
  assert.equal(quiet.audio.length, 0); assert.equal(quiet.spoken.length, 0);
  assert.equal(quiet.engine.state.backend, 'captions'); assert.equal(quiet.engine.state.caption, clips.kickoff.text);
});
console.log(`${checks.length} commentary engine checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
