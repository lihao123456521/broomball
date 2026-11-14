/* One female announcer for every character. No arbitrary system-voice fallback. */
(() => {
  'use strict';

  const synth = window.speechSynthesis;
  const supported = !!(synth && window.SpeechSynthesisUtterance);
  const audioSupported = typeof window.Audio === 'function';
  const scriptURL = window.document?.currentScript?.src;
  const clipCache = new Map();
  const clipKey = text => String(text).replace(/[\s，,。.!！?？]/g, '').toUpperCase();
  const clips = new Map([
    ['EXPELLIARMUS', 'disarm.wav'], ['除你武器', 'disarm.wav'],
    ['STUPEFY', 'stun.wav'], ['昏昏倒地', 'stun.wav'],
    ['PROTEGO', 'shield.wav'], ['盔甲护身', 'shield.wav'],
    ['比赛开始寻找队友传切配合', 'kickoff.wav'],
    ['漂亮的进球', 'goal-home.wav'],
    ['对方进球重新组织进攻', 'goal-away.wav']
  ]);
  let currentClip = null;
  let generation = 0;
  let clipsWarmed = false;
  let voices = [];
  let pending = null;
  let retryTimer = null;

  // SpeechSynthesisVoice has no gender field. These are known female voice
  // names on macOS/iOS and Windows/Edge; an unknown voice stays silent rather
  // than unexpectedly changing the announcer to a male system default.
  const femaleNames = /(?:^|\b)(?:ting[\s-]?ting|mei[\s-]?jia|sin[\s-]?ji|samantha|victoria|karen|moira|tessa|fiona|veena|sangeeta|serena|kyoko|zira|hazel|susan|heera|aria|jenny|libby|sonia|natasha|clara|michelle|neerja|huihui|yaoyao|hanhan|xiaoxiao|xiaoyi|xiaohan|xiaomeng|xiaomo|xiaoqiu|xiaorui|xiaoshuang|xiaoxuan|xiaoyan|xiaoyou|xiaozhen|hiugaai|hiumaan|hsiaochen|hsiaoyu)(?:\b|neural)/i;
  const explicitFemale = /(?:^|[\s,;()_-])female(?:$|[\s,;()_-])|女声|女性/i;
  const explicitMale = /(?:^|[\s,;()_-])male(?:$|[\s,;()_-])|男声|男性/i;
  const normalizeLang = value => String(value || '').replace(/_/g, '-').toLowerCase();
  const clamp = (value, minimum, maximum, fallback) => Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
  const languageFor = (text, options = {}) => options.lang || (/[\u3400-\u9fff]/.test(text) ? 'zh-CN' : 'en-US');
  const isFemale = voice => !explicitMale.test(voice.name) && (femaleNames.test(voice.name) || explicitFemale.test(voice.name));

  function chooseVoice(lang) {
    const requested = normalizeLang(lang);
    const family = requested.split('-')[0];
    return voices
      .filter(voice => isFemale(voice) && normalizeLang(voice.lang).split('-')[0] === family)
      .map((voice, index) => ({
        voice,
        // Prefer the requested accent and locally installed voices for offline play.
        score: (normalizeLang(voice.lang) === requested ? 100 : 0) + (voice.localService ? 20 : 0) + (voice.default ? 1 : 0) - index / 1000
      }))
      .sort((a, b) => b.score - a.score)[0]?.voice || null;
  }

  function refreshVoices() {
    if (!supported) return;
    try { voices = synth.getVoices() || []; } catch { voices = []; }
  }

  function getStatus(lang = 'zh-CN') {
    refreshVoices();
    const voice = chooseVoice(lang);
    return {
      supported: audioSupported || supported,
      available: audioSupported || !!voice,
      voice: audioSupported ? 'Tingting · 离线女声' : voice?.name || null,
      lang: audioSupported ? 'zh-CN' : voice?.lang || lang,
      local: audioSupported || voice?.localService === true,
      clips: audioSupported ? 6 : 0,
      synthesisAvailable: !!voice,
      reason: audioSupported ? 'ready-clips' : !supported ? 'unsupported' : voice ? 'ready' : voices.length ? 'female-voice-unavailable' : 'voices-loading'
    };
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function stop() {
    generation++;
    clearRetry();
    if (pending) pending.resolve(false);
    pending = null;
    if (currentClip) {
      currentClip.pause();
      try { currentClip.currentTime = 0; } catch { /* Not yet decoded. */ }
      currentClip = null;
    }
    if (supported) synth.cancel();
  }

  function getClip(file) {
    if (!clipCache.has(file)) {
      const url = scriptURL ? new URL('assets/voice/' + file, scriptURL).href : './assets/voice/' + file;
      const audio = new window.Audio(url);
      audio.preload = 'auto';
      clipCache.set(file, audio);
    }
    return clipCache.get(file);
  }

  function flush() {
    clearRetry();
    if (!pending) return;
    refreshVoices();
    const request = pending;
    const lang = languageFor(request.text, request.options);
    const voice = chooseVoice(lang);
    if (!voice) {
      if (Date.now() < request.deadline) {
        retryTimer = setTimeout(flush, 100);
      } else {
        pending = null;
        request.resolve(false);
      }
      return;
    }

    pending = null;
    const utterance = new window.SpeechSynthesisUtterance(request.text);
    // Always assign the selected female voice. Never let the browser choose one.
    utterance.voice = voice;
    utterance.lang = voice.lang || lang;
    utterance.pitch = 1.04;
    utterance.rate = clamp(request.options.rate, .8, 1.15, 1);
    utterance.volume = clamp(request.options.volume, 0, 1, .9);
    try {
      if (synth.paused) synth.resume();
      synth.speak(utterance);
      request.resolve(true);
    } catch {
      request.resolve(false);
    }
  }

  function synthesize(text, options) {
    if (!supported) return Promise.resolve(false);
    return new Promise(resolve => {
      pending = { text, options, resolve, deadline: Date.now() + 1800 };
      flush();
    });
  }

  // The six core cues are bundled recordings of the same local female voice,
  // so they work offline even when the browser exposes no synthesis voices.
  // Arbitrary new text uses only a recognized female synthesis voice.
  async function speak(text, options = {}) {
    stop();
    text = String(text || '').trim();
    if (!text) return false;
    const requestGeneration = generation;
    const file = clips.get(clipKey(text));
    if (file && audioSupported) {
      try {
        const audio = getClip(file);
        currentClip = audio;
        audio.currentTime = 0;
        audio.volume = clamp(options.volume, 0, 1, .9);
        await audio.play();
        return requestGeneration === generation;
      } catch {
        if (requestGeneration !== generation) return false;
        currentClip = null;
      }
    }
    return synthesize(text, options);
  }

  function warmup() {
    refreshVoices();
    if (audioSupported && !clipsWarmed) {
      clipsWarmed = true;
      for (const file of new Set(clips.values())) {
        try { getClip(file).load(); } catch { /* Synthesis remains available. */ }
      }
    }
    if (pending) flush();
    return getStatus();
  }

  if (supported) {
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', warmup);
    } else {
      const previous = synth.onvoiceschanged;
      synth.onvoiceschanged = event => {
        if (typeof previous === 'function') previous.call(synth, event);
        warmup();
      };
    }
    refreshVoices();
  }

  window.BroomVoice = Object.freeze({ speak, warmup, stop, getStatus });
})();
