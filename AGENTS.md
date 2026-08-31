# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

RoboCoach is a browser-only, client-side pose-estimation demo. It opens the
user's webcam, runs a TensorFlow.js pose model over each video frame, and draws
the detected keypoints and skeleton back onto a `<canvas>` overlaid on the
mirrored video feed. Everything runs in the browser — there is no backend, no
API, and no data leaves the machine.

Current pipeline (`src/index.js`):

1. `Camera.setup(STATE.camera)` requests a `getUserMedia` stream and sizes the
   `<video>` and `.canvas-wrapper` to the real stream dimensions.
2. `tf.ready()` initializes the TFJS backend (WebGL/WebGPU backends are imported
   for their side effects).
3. `createDetector()` builds a MoveNet `SINGLEPOSE_LIGHTNING` detector.
4. `renderPrediction()` runs a `requestAnimationFrame` loop: estimate poses,
   then hand `[video, poses, isModelChanged]` to `RendererCanvas2d.draw()`.

The name suggests a future coaching/form-feedback layer; none exists yet. The
repo is currently the capture + detect + render substrate for that.

## Layout

| Path | Role |
| --- | --- |
| `src/index.html` | Parcel entry point (`source` in `package.json`); holds `#output` canvas, `#video`, `#scatter-gl-container`. |
| `src/index.js` | App bootstrap and the rAF render loop. The only hand-written app file. |
| `src/camera.js` | `Camera` class + `isMobile`/`isiOS`/`isAndroid` helpers. Vendored from the tfjs-models demo. |
| `src/params.js` | `STATE`, video size presets, per-model config constants, TFJS tunable-flag maps. Vendored. |
| `src/renderer_canvas2d.js` | `RendererCanvas2d` — 2D keypoint/skeleton drawing plus optional 3D ScatterGL point cloud. Vendored. |
| `src/base.css` | Minimal layout CSS. |
| `Makefile` | `run` / `build` / `clean` wrappers. |

## Commands

```sh
make build   # corepack enable && yarn install
make run     # yarn parcel src/index.html  (dev server)
make clean   # rm -rf .parcel-cache
```

`package.json` also exposes `yarn start` (dev) and `yarn build` (production),
both of which pick up `src/index.html` via the `source` field.

There is **no test suite, no linter, and no typechecker**. Do not claim tests
pass, and do not invent a test command — if a change needs verification, say so
and verify it by loading the app in a browser (camera permission required, so a
headless run will not exercise the detection path).

## Conventions

- Plain ES modules, no framework, no TypeScript. Bundling is Parcel 2.
- Formatting is Prettier with `src/.prettierrc` (2 spaces, no tabs). Existing
  files are inconsistently formatted; match the file you are editing rather than
  reformatting it wholesale in an unrelated change.
- Node 20.10.0 per `.nvmrc`; Yarn comes from `corepack enable` (see `.envrc` and
  `README.md`).
- `camera.js`, `params.js`, and `renderer_canvas2d.js` are vendored from Google's
  Apache-2.0 tfjs-models pose-detection demo. **Keep their license headers.**
  Prefer putting new application logic in `index.js` or new files over editing
  the vendored ones; when the vendored code must change, keep the diff minimal so
  it stays diffable against upstream.

## Things that will bite you

- **`STATE.modelConfig` is `{}`.** The `BLAZEPOSE_CONFIG` / `POSENET_CONFIG` /
  `MOVENET_CONFIG` constants in `params.js` are defined but never assigned to
  `STATE.modelConfig`, and `createDetector()` builds its own `{modelType}` config
  instead. Consequences: `scoreThreshold` falls back to `0` (every keypoint is
  drawn, however low-confidence), `render3D` is falsy so the ScatterGL container
  is hidden, and `enableTracking` is off so skeletons are always white. Wiring a
  config into `STATE.modelConfig` is the intended fix, not a workaround.
- **`.envrc` says `NODE_VERSION=16.6.2` but `.nvmrc` says `20.10.0`.** Trust
  `.nvmrc`; Parcel 2 will not run happily on 16.
- `index.js` logs every pose to the console each frame — noisy, and worth
  removing before any real work lands on top of it.
- The canvas is horizontally flipped once in the `RendererCanvas2d` constructor
  (`flip()` mutates the 2D context transform), and the `<video>` is separately
  flipped via CSS. Keypoint coordinates come back in unflipped video space —
  `estimatePoses` is called with `flipHorizontal: false` — so any new overlay
  (text, HUD) drawn through `this.ctx` inherits the mirror and will render
  backwards unless you `save()`/`restore()` around it.
- Camera setup throws if `navigator.mediaDevices.getUserMedia` is missing, which
  includes non-secure origins. Serve over `localhost` or HTTPS.

## Git

Default branch is `develop`. Do not push to it directly unless asked; work on a
feature branch.
