# Natural female English game audio

The active recordings use **Joanna – Warm & Conversational**, a public, ACTIVE female British-English voice from **HeyGen Voice** (`776f9d2ff401499a8f1f2bcb4ca46004`, locale `en-GB`). These are neural speech recordings, not a human recording or a voice clone.

There are 81 locally playable WAV files: 65 complete commentary cues, 13 incantations, and 3 compatibility cues. The same voice is used throughout. The runtime does not call the speech service. The original recordings are retained unchanged under `natural/originals/`; `natural/generation.json` keeps the returned audio references, duration and word/character timestamps. `natural/plan.json` records the exact submitted English copy and destination of every cue.

The active commentary copy uses short spoken sentences and natural contractions. Routine possession/pass/shot narration is spaced by at least twelve seconds; goals, time reminders and match results keep their higher priority. Playback remains at original pitch and speed, without heavy processing. WAV format is mono, 44.1 kHz, 16-bit PCM.

`natural/catalog.js` supplies the accepted spoken copy and voice identity. `commentary/manifest.json` records the 65 active commentary files, and `natural/manifest.json` records all 81 files with source, text, duration, sample rate, peak and RMS. The `emphasis` field lists names present in the text for compatibility; it is not evidence of an auditory stress or SSML review.

To re-import already generated audio, run:

```text
python3 tools/import-natural-voice.py assets/voice/natural/plan.json assets/voice/natural/generation.json
```

This tool validates and copies saved recordings. It never creates or retries a speech generation. A new service generation remains a separate authorized action. One provider 502 occurred during this batch; subsequent generation resumed only after the user's explicit approval, and all 81 planned recordings were then completed.

The older Samantha system-voice builder is retained as a legacy development tool and is not the source of current recordings. `assets/commentary/` is an archived male-voice set and is not referenced by the game.
