# Natural female English game audio

The active recordings use **Joanna – Warm & Conversational**, a public, ACTIVE female British-English voice from **HeyGen Voice** (`776f9d2ff401499a8f1f2bcb4ca46004`, locale `en-GB`). These are neural speech recordings, not a human recording or a voice clone.

There are 81 locally playable WAV files: 65 complete commentary cues, 13 incantations, and 3 compatibility cues. The same voice is used throughout. The runtime does not call the speech service. The original recordings are retained unchanged under `natural/originals/`; `natural/generation.json` keeps the returned audio references, duration and word/character timestamps. `natural/plan.json` records the exact submitted English copy and destination of every cue.

The active commentary copy uses short spoken sentences and natural contractions. Routine possession/pass/shot narration is spaced by at least twelve seconds, with a one-second breath after a completed sentence and a 24-second cooldown on repeating the same routine copy across event keys; goals, time reminders and match results keep their higher priority. Playback remains at original pitch and speed. WAV format is mono, 44.1 kHz, 16-bit PCM.

The playable copies now have gentle offline leveling to reduce jumps in loudness between sentences. The importer measures RMS in non-overlapping 10 ms windows, using a −45 dBFS gate **only for measurement**. It applies one constant gain to each complete recording, attenuating towards −20 dBFS active speech RMS with a −1.5 dBFS peak ceiling; quieter recordings are never amplified. Because attenuation can move quiet windows below the measurement gate, the importer rechecks the result and refines that one gain from the original samples. Across the 81 files, measured active speech RMS spread falls from 7.07 dB to 0.31 dB. This is a simple gated RMS measurement, not a LUFS or subjective listening score.

The first and last 176 samples (just under 4 ms at 44.1 kHz) have a linear edge fade to zero. No pauses, breaths, words or samples are removed, and the constant gain preserves the delivery's internal dynamics. There is no compressor, pitch change, time stretch, added reverb or regeneration. The original source files remain byte-for-byte unchanged. These checks establish signal integrity and more consistent levels; they do not replace listening to the game.

`natural/catalog.js` supplies the accepted spoken copy and voice identity. `commentary/manifest.json` records the 65 active commentary files, and `natural/manifest.json` records all 81 files with source, text, duration, sample rate, peak and RMS. Each entry also records the original SHA-256 hash and the exact gain, edge fade, measurement settings and source/output levels under `processing`. Peak and RMS fields describe the playable copy. The `emphasis` field lists names present in the text for compatibility; it is not evidence of an auditory stress or SSML review.

To re-import already generated audio, run:

```text
python3 tools/import-natural-voice.py assets/voice/natural/plan.json assets/voice/natural/generation.json
```

This tool validates and levels saved recordings directly from `natural/originals/`. Re-running it produces identical files rather than applying processing again to already-leveled audio. It never creates or retries a speech generation. A new service generation remains a separate action. One provider 502 occurred during the original batch; subsequent generation resumed only after the user's explicit approval, and all 81 planned recordings were then completed.

Run `python3 tests/natural-voice.py` to check every PCM sample against its source, verify unchanged original hashes and metadata, check headroom and measured levels, and perform two byte-identical re-imports in a temporary directory.

The older Samantha system-voice builder is retained as a legacy development tool and is not the source of current recordings. `assets/commentary/` is an archived male-voice set and is not referenced by the game.
