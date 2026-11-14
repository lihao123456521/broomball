# English match commentary

65 self-contained AAC recordings (about 1.6 MB total). A clip contains a complete sentence: the game never stitches individual names or words into speech. The browser preloads and reuses these files. The four houses and all twelve playable characters have dedicated calls.

The recordings use the locally installed macOS Daniel English (UK) voice. `game-commentary-lines.js` contains their exact scripts. `manifest.json` records each sentence, emphasized names, SSML, voice, duration and file size. Recordings use medium conversational speed with a slightly lower baseline pitch; house and player names receive strong emphasis, 88% local rate, +1 semitone and +2 dB relative prosody. SSML is applied during audio creation, never read as markup by the browser.

Optional rebuilding on macOS (with Daniel installed, Node and Swift):

```sh
node tools/commentary-catalog.cjs > /tmp/broomball-commentary.json
swift tools/build-commentary.swift /tmp/broomball-commentary.json assets/commentary
```

The build uses AVSpeechSynthesizer to render complete SSML utterances, finalizes PCM files, then uses afconvert for 64 kbps mono AAC. Generation checks nonempty output and bounded duration. Runtime has no dependency on macOS or a speech service. The engine's fixed English system voice is only a fallback for missing or undecodable recordings; subtitles remain available when audio is blocked.
