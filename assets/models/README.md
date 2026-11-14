# Uploaded GLB assets

All seven user-uploaded files are preserved unchanged in `originals/`. Their SHA-256 hashes, original triangle counts and runtime counts are recorded in `manifest.json`.

| Original file | Runtime model | In-game use |
| --- | --- | --- |
| textured.glb | academy-hall | Gothic great hall on the arena perimeter |
| textured (1).glb | academy-tower | Two academy towers framing the arena |
| textured (2).glb | gatehouse | Western entrance and stone bridge |
| textured (3).glb | rampart | Academy perimeter walls |
| textured(1).glb | broom | Default equipable broom, used by the teams |
| textured (1)(1).glb | snitch | Permanent sideline Golden Cup trophy and snitch appearance |
| textured (2)(1).glb | harry-rider | Harry's actual flying character appearance |

`runtime/*.glb` are reduced derivatives. `runtime/*.js` contain the same GLB bytes as base64 so direct `file://` gameplay works without fetch requests or a local web server. The original files are never modified by the conversion.

Rebuild with `python3 assets/models/build_runtime.py` (requires Node.js and macOS `sips`). The helper locates this app's bundled Node, otherwise uses `node` from PATH. It uses official meshoptimizer 1.3 attribute-aware edge collapse at build time, with UV attributes and a 1% relative error ceiling; measured errors are in the build output. Runtime geometry preserves source UV vertices. It embeds 1024px JPEG base-color textures (2048px for Harry), and uses a single material per model. Model instances share immutable geometry/material data, marked `sharedModel`, to avoid duplicate GPU allocations.

The build helper `tools/meshopt_simplifier.mjs` is the official upstream meshoptimizer 1.3 JavaScript/WASM source from <https://github.com/zeux/meshoptimizer/blob/master/js/meshopt_simplifier.js>, retrieved 2026-11-14. It is MIT licensed; see `tools/MESHOPTIMIZER-LICENSE.md`. It is used only while building the optimized assets and is not loaded by the game.

The user supplied the model artwork; no model authorship or third-party asset license is inferred from the filenames.
