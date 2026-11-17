# Stadium crowd recordings

**Free Crowd Cheering Sounds** by **Gregor Quendel**, licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

- [Author's original release](https://gregor-quendel.itch.io/free-crowd-cheering-sounds)
- [OpenGameArt release and download](https://opengameart.org/content/free-crowd-cheering-sounds)
- [Downloaded MP3 archive](https://opengameart.org/sites/default/files/gregor_quendel_-_free_crowd_cheering_sounds_-_mp3.zip)

The two unchanged source MP3s in `originals/` are tracks **09 – Ambience and cheering**
and **04 – Strong cheering – II – Short**. They are field recordings, not generated voices.
The author's source recordings remain under CC BY 4.0; no endorsement is implied.

For this game, the ambience is downmixed to mono at 22,050 Hz, leveled, and its tail
and head crossfaded over two seconds for a continuous loop. The goal cheer uses
seconds 1–8 with a short attack, a gentle release and level adjustment. Exact
source hashes, gains and output measurements are in `manifest.json`.

`catalog.js` contains the derived WAV bytes so the browser can decode them locally
under both HTTP and `file://`. No asset service or network request is needed during
play. The pause panel provides a separate crowd-volume control and attribution.

Regenerate with Node.js, Playwright and Chrome:

```text
node tools/build-crowd-audio.cjs
```

`PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` may point to installed dependencies.
The builder also writes listening copies under the ignored `tests/artifacts/` directory.
