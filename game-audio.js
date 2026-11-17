/* Local, softly enveloped ball/air sounds. The speech recordings keep their own channel. */
(() => {
 'use strict';
 window.createMatchAudio = ({createContext = () => new (window.AudioContext || window.webkitAudioContext)()} = {}) => {
  let context = null, bus = null, ducked = false, paused = false;
  const sources = new Set();
  function unlock() {
   try {
    if (!context) { context = createContext(); bus = context.createGain(); bus.gain.value = 1; bus.connect(context.destination); }
    if (context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
    return true;
   } catch { return false; } // Unavailable audio must never prevent starting a match.
  }
  function playSource(source, filter, gain, duration) {
   const now = context.currentTime;
   source.connect(filter).connect(gain).connect(bus);
   sources.add(source);
   source.onended = () => { sources.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
   source.start(now); source.stop(now + duration + .025);
  }
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
   const [frequency, duration, level, air] = profile;
   intensity = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 1;
   const variation = .96 + Math.random() * .08, now = context.currentTime;
   // A low, falling body and a filtered brush of air replace the fixed-pitch beep.
   const body = context.createOscillator(), lowpass = context.createBiquadFilter();
   body.type = 'sine'; body.frequency.setValueAtTime(frequency * variation, now);
   body.frequency.exponentialRampToValueAtTime(frequency * .48, now + duration);
   lowpass.type = 'lowpass'; lowpass.frequency.value = 650;
   playSource(body, lowpass, envelope(duration, level * intensity), duration);
   const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = air * variation; filter.Q.value = .65;
   playSource(noise(duration), filter, envelope(duration, level * .65 * intensity, .018), duration);
   return true;
  }
  function cheer(intensity = 1) {
   if (!context || paused || sources.size >= 12) return false;
   intensity = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 1;
   // A subdued stadium swell with a slow attack, kept beneath the goal call.
   const duration = 1.8, source = noise(duration), data = source.buffer.getChannelData(0);
   let smooth = 0;
   for (let i = 0; i < data.length; i++) {
    smooth = smooth * .78 + data[i] * .22;
    const t = i / context.sampleRate;
    data[i] = smooth * (.76 + .16 * Math.sin(t * 11) + .08 * Math.sin(t * 23));
   }
   const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 720; filter.Q.value = .5;
   playSource(source, filter, envelope(duration, .14 * intensity, .24), duration);
   return true;
  }
  function stop() {
   for (const source of sources) { try { source.stop(); } catch {} source.onended?.(); }
  }
  function update({speaking = false, paused: shouldPause = false} = {}) {
   paused = shouldPause;
   if (paused) stop();
   if (!bus) return;
   const next = !!speaking;
   if (next !== ducked) {
    ducked = next;
    // Smooth attack/release avoids a pumping volume jump at sentence boundaries.
    bus.gain.setTargetAtTime(ducked ? .4 : 1, context.currentTime, ducked ? .02 : .24);
   }
  }
  return {unlock, play, cheer, stop, update, get state() { return {available: !!context, activeSources: sources.size, ducked, paused}; }};
 };
})();
