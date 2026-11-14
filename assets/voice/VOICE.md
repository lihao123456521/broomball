# Offline female English voice

Every active voice recording uses the locally installed macOS **Samantha (en-US, female)** voice. No external speech service was used. These recordings replace the previous Chinese cues and the merged branch's male English commentary in active gameplay.

Audio format: mono, 22,050 Hz, 16-bit PCM WAV. Playback works offline without browser speech-synthesis voices.

## Complete commentary

`commentary/` contains 65 uninterrupted English sentences covering all four houses, the 12 named players, matchups, possession, shots, passes, goals, match results, time reminders, training, and retained legacy Snitch events. `game-commentary-lines.js` points exclusively to these female recordings. `commentary/manifest.json` records each sentence, Samantha voice provenance, language, duration, sample rate, file size, peak, and RMS.

The single-channel controller in `game-commentary.js` preserves the merged branch's event priorities, cooldowns, volume, captions, stale-callback protection, pause/reset behavior, and critical result announcements. Known incantations use local female English recordings too. If a recording fails, speech synthesis requires a recognized female English voice; male, unknown, Chinese, or absent system voices produce captions instead of an unintended narrator.

## Spell calls and compatibility cues

| File | Spoken English |
| --- | --- |
| disarm.wav | Expelliarmus! |
| stun.wav | Stupefy! |
| shield.wav | Protego! |
| arresto.wav | Arresto Momentum! |
| serpent.wav | Serpensortia! |
| obscuro.wav | Obscuro! |
| confundus.wav | Confundus! |
| patronus.wav | Expecto Patronum! |
| accio.wav | Accio! |
| impedimenta.wav | Impedimenta! |
| finite.wav | Finite Incantatem! |
| rennervate.wav | Rennervate! |
| ward.wav | Protego Totalum! |
| kickoff.wav | Kickoff! Find your teammates and move the ball. |
| goal-home.wav | What a goal! |
| goal-away.wav | They score. Regroup and build the next attack. |

The 13 incantations include the complete 12-character school roster plus the original Stupefy call. The three short event cues preserve the earlier `BroomVoice` API; current integrated narration uses the full commentary controller so two narrators do not overlap. There are 81 WAV files in total.

`game-voice.js` also maps the existing Chinese event strings to their English counterparts and never chooses a male or Chinese fallback voice. Unknown Chinese text stays silent instead of being spoken in the wrong language.

Generation: `say -v Samantha -r 185 -o cue.aiff 'English text'`, followed by `afconvert -f WAVE -d LEI16@22050 -c 1 cue.aiff cue.wav`.
