/* Local ball/air effects and recorded, continuously looping stadium ambience. */
(() => {
 'use strict';
 window.createMatchAudio = ({createContext = () => new (window.AudioContext || window.webkitAudioContext)(), crowdAssets = window.BroomCrowdAudio} = {}) => {
  let context = null, bus = null, ambienceBus = null, cheerBus = null, ducked = false, paused = false, active = false;
  let crowdVolume = .65, ambience = null, preparing = null, ambienceBuffer = null, cheerBuffer = null, ambienceStarts = 0, recordedCheers = 0;
  const sources = new Map();
  const level = (value, fallback = 1) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  function stopAmbience() {
   if (!ambience) return;
   const previous = ambience; ambience = null;
   previous.source.onended = null;
   try { previous.source.stop(); } catch {}
   previous.source.disconnect(); previous.gain.disconnect();
  }
  function syncAmbience() {
   if (!context || !ambienceBuffer || !active || paused || crowdVolume === 0) { stopAmbience(); return; }
   if (ambience) return;
   const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime;
   source.buffer = ambienceBuffer; source.loop = true;
   gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + .65);
   source.connect(gain).connect(ambienceBus);
   const record = {source, gain}; ambience = record;
   source.onended = () => {
    if (ambience === record) ambience = null;
    source.onended = null; source.disconnect(); gain.disconnect();
   };
   source.start(now); ambienceStarts++;
  }
  function prepare() {
   if (!context || !crowdAssets) return Promise.resolve(false);
   if (preparing) return preparing;
   const decode = async encoded => {
    if (typeof encoded !== 'string' || !encoded) return null;
    try {
     // Inline local WAV data also works from file://, without fetch or CORS.
     const bytes = Uint8Array.from(window.atob(encoded), char => char.charCodeAt(0));
     return await context.decodeAudioData(bytes.buffer);
    } catch { return null; }
   };
   preparing = Promise.all([decode(crowdAssets.ambience), decode(crowdAssets.cheer)]).then(([bed, cheer]) => {
    ambienceBuffer = bed; cheerBuffer = cheer;
    // Reconcile current intent, never the state at the start of decoding.
    syncAmbience();
    return !!(bed && cheer);
   }).catch(() => false);
   return preparing;
  }
  function unlock() {
   try {
    if (!context) {
     context = createContext(); bus = context.createGain(); ambienceBus = context.createGain(); cheerBus = context.createGain();
     bus.gain.value = ducked ? .4 : 1;
     ambienceBus.gain.value = crowdVolume * (ducked ? .55 : 1);
     cheerBus.gain.value = crowdVolume * (ducked ? .7 : 1);
     bus.connect(context.destination); ambienceBus.connect(context.destination); cheerBus.connect(context.destination);
    }
    if (context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
    prepare();
    return true;
   } catch { return false; } // Unavailable audio must never prevent starting a match.
  }
  function trackSource(source, nodes, duration, destination, crowd = false) {
   const now = context.currentTime;
   let tail = source;
   for (const node of nodes) { tail.connect(node); tail = node; }
   tail.connect(destination);
   const cleanup = () => {
    if (!sources.delete(source)) return;
    source.onended = null; source.disconnect();
    for (const node of nodes) node.disconnect();
   };
   sources.set(source, {cleanup, crowd}); source.onended = cleanup;
   source.start(now); source.stop(now + duration + .025);
  }
  function playSource(source, filter, gain, duration) { trackSource(source, [filter, gain], duration, bus); }
  function envelope(duration, peak, attack = .012) {
   const gain = context.createGain(), now = context.currentTime;
   gain.gain.setValueAtTime(0, now);
   gain.gain.linearRampToValueAtTime(peak, now + attack);
   gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
   gain.gain.linearRampToValueAtTime(0, now + duration + .02);
   return gain;
  }
  function noise(duration) {
   const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * (duration + .03)), context.sampleRate);
   const data = buffer.getChannelData(0);
   for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
   const source = context.createBufferSource(); source.buffer = buffer; return source;
  }
  function play(event, intensity = 1) {
   if (!context || paused || sources.size >= 12) return false;
   const profiles = {catch: [130, .11, .045, 900], pass: [165, .17, .055, 1300], shot: [115, .23, .075, 1800], goal: [220, .38, .055, 1100]};
   const profile = profiles[event]; if (!profile) return false;
   const [frequency, duration, volume, air] = profile;
   intensity = level(intensity); if (!intensity) return false;
   const variation = .96 + Math.random() * .08, now = context.currentTime;
   const body = context.createOscillator(), lowpass = context.createBiquadFilter();
   body.type = 'sine'; body.frequency.setValueAtTime(frequency * variation, now);
   body.frequency.exponentialRampToValueAtTime(frequency * .48, now + duration);
   lowpass.type = 'lowpass'; lowpass.frequency.value = 650;
   playSource(body, lowpass, envelope(duration, volume * intensity), duration);
   const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = air * variation; filter.Q.value = .65;
   playSource(noise(duration), filter, envelope(duration, volume * .65 * intensity, .018), duration);
   return true;
  }
  function cheer(intensity = 1) {
   if (!context || paused || sources.size >= 12 || crowdVolume === 0) return false;
   intensity = level(intensity); if (!intensity) return false;
   if (cheerBuffer) {
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime, duration = cheerBuffer.duration;
    source.buffer = cheerBuffer;
    // Keep the recorded rise and sustained applause; only soften the outer edges.
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(intensity, now + .06);
    gain.gain.setValueAtTime(intensity, now + Math.max(.06, duration - .35));
    gain.gain.linearRampToValueAtTime(0, now + duration);
    trackSource(source, [gain], duration, cheerBus, true); recordedCheers++;
    return true;
   }
   // Retained only for unavailable/corrupt assets and standalone effect tests.
   const duration = 1.8, source = noise(duration), data = source.buffer.getChannelData(0);
   let smoothed = 0;
   for (let i = 0; i < data.length; i++) {
    smoothed = smoothed * .78 + data[i] * .22;
    const t = i / context.sampleRate;
    data[i] = smoothed * (.76 + .16 * Math.sin(t * 11) + .08 * Math.sin(t * 23));
   }
   const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 720; filter.Q.value = .5;
   trackSource(source, [filter, envelope(duration, .14 * intensity, .24)], duration, cheerBus, true);
   return true;
  }
  function stopSources(crowdOnly = false) {
   for (const [source, record] of sources) {
    if (crowdOnly && !record.crowd) continue;
    try { source.stop(); } catch {} record.cleanup();
   }
  }
  function stop() { active = false; stopAmbience(); stopSources(); }
  function mixCrowd() {
   if (!context) return;
   const now = context.currentTime;
   ambienceBus.gain.setTargetAtTime(crowdVolume * (ducked ? .55 : 1), now, ducked ? .08 : .4);
   cheerBus.gain.setTargetAtTime(crowdVolume * (ducked ? .7 : 1), now, ducked ? .04 : .3);
  }
  function setCrowdVolume(value) {
   const next = level(value, crowdVolume); if (next === crowdVolume) return;
   crowdVolume = next; mixCrowd();
   if (crowdVolume === 0) stopSources(true);
   syncAmbience();
  }
  function update({speaking = false, paused: shouldPause = false, active: shouldPlay = active} = {}) {
   paused = shouldPause; active = !!shouldPlay;
   if (paused) { stopAmbience(); stopSources(); }
   else if (!active) stopSources(true);
   const next = !!speaking;
   if (next !== ducked) {
    ducked = next;
    if (bus) bus.gain.setTargetAtTime(ducked ? .4 : 1, context.currentTime, ducked ? .02 : .24);
    mixCrowd();
   }
   syncAmbience();
  }
  return {unlock, prepare, play, cheer, stop, update, setCrowdVolume,
   get state() { return {available: !!context, activeSources: sources.size, ducked, paused, active,
    ambiencePlaying: !!ambience, crowdReady: !!(ambienceBuffer && cheerBuffer), crowdVolume, ambienceStarts, recordedCheers,
    activeCrowdSources: [...sources.values()].filter(source => source.crowd).length}; }};
 };
})();
