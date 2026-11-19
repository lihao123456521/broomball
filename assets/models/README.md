# Uploaded GLB assets

All twenty distinct user-uploaded files are preserved unchanged in `originals/`. Their SHA-256 hashes, original triangle counts and runtime counts are recorded in `manifest.json`.

| Original file | Runtime model | In-game use |
| --- | --- | --- |
| textured.glb | academy-hall | Gothic great hall on the arena perimeter |
| textured (1).glb | academy-tower | Two academy towers framing the arena |
| textured (2).glb | gatehouse | Western entrance and stone bridge |
| textured (3).glb | rampart | Academy perimeter walls |
| textured(1).glb | broom | Default equipable broom, used by the teams |
| textured (1)(1).glb | snitch | Permanent sideline Golden Cup trophy and snitch appearance |
| textured (2)(1).glb | harry-rider | Harry's actual flying character appearance |
| ground.glb | stadium-ground | Marked grass pitch |
| pillar.glb | goal-pillar | Six ring goals |
| textured(3).glb | draco-rider | Blonde Slytherin rider, Draco |
| textured (4).glb | cedric-rider | Brown-haired Hufflepuff rider, Cedric |
| textured (5).glb | blaise-rider | Slytherin rider, Blaise |
| textured (6).glb | pansy-rider | Bob-haired Slytherin rider, Pansy |
| textured(7).glb | hannah-rider | Hufflepuff rider with blonde braids, Hannah |
| textured (8).glb | cho-rider | Dark-haired Ravenclaw rider, Cho |
| textured (9).glb | luna-rider | Blonde Ravenclaw rider, Luna |
| Ron.glb | ron-rider | Gryffindor rider, Ron |
| hermine.glb | hermione-rider | Gryffindor rider, Hermione |
| eni.glb | ernie-rider | Hufflepuff rider, Ernie |
| padema.glb | padma-rider | Ravenclaw rider, Padma |

The three other files in the second delivery have the same SHA-256 digests as earlier originals. `textured(2).glb` matches the broom, `textured (1)(2).glb` matches the snitch, and `textured (2)(2).glb` matches Harry. They share the existing original and runtime copy.


`runtime/*.glb` are reduced derivatives. `runtime/*.js` contain the same GLB bytes as base64 so direct `file://` gameplay works without fetch requests or a local web server. The original files are never modified by the conversion.

Rebuild with `python3 assets/models/build_runtime.py` (requires Node.js and Python Pillow; Windows/macOS/Linux supported). The helper locates this app's bundled Node, otherwise uses `node` from PATH. It uses official meshoptimizer 1.3 attribute-aware edge collapse at build time, with UV attributes and a 1% relative error ceiling; measured errors are in the build output. Runtime geometry preserves source UV vertices. The game uses a single material per model. Harry and the pitch use 2048px JPEG base-color textures, the seven new riders use 1536px, the goal pillar uses 512px, and the other models use 1024px. Rider head geometry and UVs are locked during simplification to keep the original facial features intact for the entrance camera. The seven new riders have about 36,000 triangles each, the pitch has 10,500 and the goal pillar has 4,500. Model instances share immutable geometry/material data, marked `sharedModel`, to avoid duplicate GPU allocations.

The build helper `tools/meshopt_simplifier.mjs` is the official upstream meshoptimizer 1.3 JavaScript/WASM source from <https://github.com/zeux/meshoptimizer/blob/master/js/meshopt_simplifier.js>, retrieved 2026-11-14. It is MIT licensed; see `tools/MESHOPTIMIZER-LICENSE.md`. It is used only while building the optimized assets and is not loaded by the game.

The user supplied the model artwork; no model authorship or third-party asset license is inferred from the filenames.

## Four-rider completion (2026-11-19)

Rebuild only the four new riders with `python assets/models/build_runtime.py --completion-sources assets/models/originals`. Install Pillow with `python -m pip install Pillow`. Original filenames are retained exactly as delivered. The existing face-lock remains in use. These four models use a stricter 0.1% simplification error ceiling to avoid visible UV stretching in the collar, clothing, and hair. That quality ceiling takes precedence over the 36,000-triangle target; actual triangle counts are recorded in manifest.json. All four use 1536px textures. Their optimized GLBs and offline JS payloads are registered in the shared rider loader for menu previews, portraits, entrances, and both teams.
