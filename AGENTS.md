# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

RoboCoach is a browser-only pose-estimation app aimed at sport movement. It
opens the user's webcam, runs MediaPipe's BlazePose landmarker over each video
frame, smooths the result, and draws a 33-point skeleton onto a `<canvas>`
overlaid on the mirrored video. Everything runs client-side — there is no
backend, no API, and no video leaves the machine.

Pipeline (`src/index.js`):

1. `Camera.setup(STATE.camera)` requests a `getUserMedia` stream and sizes the
   `<video>` and `.canvas-wrapper` to the real stream dimensions.
2. `createLandmarker()` resolves the Wasm fileset and builds a `PoseLandmarker`
   in `VIDEO` running mode.
3. A `requestAnimationFrame` loop calls `detectForVideo`, smooths the landmarks,
   and hands the result to `RendererCanvas2d.draw()`.

The name points at a future coaching/form-feedback layer. That does not exist
yet — computing joint angles from `worldLandmarks` is the natural next step.

## Layout

| Path | Role |
| --- | --- |
| `src/index.html` | Parcel entry point (`source` in `package.json`). |
| `src/index.js` | Bootstrap, rAF loop, URL-param config, smoothing wiring. |
| `src/params.js` | `STATE`, asset paths, the 33-landmark topology, smoothing tuning. |
| `src/one_euro_filter.js` | One Euro filter + `LandmarkSmoother`. |
| `src/camera.js` | `Camera` class and mobile detection. Vendored, Apache-2.0. |
| `src/renderer_canvas2d.js` | 2D skeleton drawing + optional 3D ScatterGL cloud. Adapted from a vendored Apache-2.0 file. |
| `scripts/fetch-assets.mjs` | Stages the Wasm runtime and model weights into `dist/`. |

## Commands

```sh
make build   # corepack enable && yarn install
make run     # yarn start -> stage assets, then parcel dev server
make dist    # yarn build -> production build, then stage assets
make assets  # also fetch the 29MB `heavy` model
make clean   # rm -rf .parcel-cache dist
```

There is **no test suite, no linter, and no typechecker**. Do not claim tests
pass and do not invent a test command. To verify a change, build it and load it
in a browser; see "Verifying changes" below for how to do that without a camera.

## The asset pipeline — read before touching the build

MediaPipe fetches two things over HTTP at load time, outside the bundler:

- its **Wasm runtime**, copied out of `node_modules/@mediapipe/tasks-vision/wasm`
- the **model weights** (`.task`), downloaded from Google's model storage

`scripts/fetch-assets.mjs` stages both into `dist/` and caches the weights in
`.assets/` (gitignored). Consequences worth knowing:

- **`parcel build` alone is not a working app.** Both `yarn start` and
  `yarn build` run the staging script; a bare `parcel` invocation skips it and
  the app dies at `FilesetResolver` with a 404. This is why the Makefile calls
  the yarn scripts rather than parcel directly.
- The Wasm runtime is deliberately served from our own origin rather than a CDN,
  so it can never desync from the installed `@mediapipe/tasks-vision` version.
  If you bump that dependency, the staged Wasm updates with it automatically.
- `WASM_PATH` and `MODEL_ASSETS` in `params.js` are origin-relative. Changing
  them to CDN URLs reintroduces a third-party runtime dependency and breaks
  offline use.

## Conventions

- Plain ES modules, no framework, no TypeScript. Bundling is Parcel 2.
- Formatting is Prettier with `src/.prettierrc` (2 spaces, no tabs).
- Node 20.10.0 per `.nvmrc` and `.envrc`; Yarn comes from `corepack enable`.
- `camera.js` is vendored from Google's Apache-2.0 tfjs-models demo and
  `renderer_canvas2d.js` is adapted from it. **Keep their license headers.**

## Things that will bite you

- **The canvas context is permanently mirrored.** `RendererCanvas2d.flip()`
  applies a `translate`/`scale(-1, 1)` to the 2D context once in the
  constructor, and the `<video>` is separately mirrored via CSS. Any new overlay
  drawn through `this.ctx` — text, a HUD, an angle readout — inherits that
  mirror and renders backwards. Wrap it in `save()`/`restore()` with the
  transform reset.
- **Two coordinate spaces.** `result.landmarks` are normalized 0–1 and must be
  scaled by canvas dimensions (`toPixels()`); `result.worldLandmarks` are in
  **metres**, hip-centred, and are the ones to use for joint angles. Do not mix
  them.
- **Smoothing is single-athlete.** `LandmarkSmoother` holds per-landmark filter
  state, so raising `STATE.landmarker.numPoses` above 1 would smear filters
  across bodies. Multi-person needs a smoother bank keyed by a stable track id,
  which the task does not currently expose.
- **`detectForVideo` needs strictly increasing timestamps.** The loop guards on
  `video.currentTime` so it neither re-infers on a frame the camera has not
  replaced nor feeds a duplicate timestamp.
- **Landmark side is not index parity.** The names mix conventions
  (`left_shoulder` but `mouth_left`), and parity only holds from the shoulders
  down. Use `KEYPOINT_INDEX_BY_SIDE` from `params.js`, which matches on the name.
- Camera setup throws if `navigator.mediaDevices.getUserMedia` is missing, which
  includes non-secure origins. Serve over `localhost` or HTTPS.
- The `beta` value in `STATE.smoothing` is the lag/jitter dial and is tuned high
  for sport motion. If a change makes tracking feel laggy, check it before
  blaming the model.

## Verifying changes

There is no camera in CI or in a sandbox, but the whole pipeline can still be
exercised headlessly:

- Chromium accepts `--use-fake-device-for-media-stream` and
  `--use-fake-ui-for-media-stream` to satisfy `getUserMedia`. That gives a
  synthetic pattern with no human in it, so it verifies startup, the render loop
  and that inference does not throw — but it will never produce landmarks.
- To exercise detection, drive the modules against a real photo instead:
  `detectForVideo` accepts any `ImageSource`, including an `HTMLImageElement`,
  so a still image can stand in for a video frame across successive timestamps.
- Serve the built `dist/` with a **threaded** HTTP server. A single-threaded one
  head-of-line blocks on the concurrent Wasm and model requests and the page
  hangs. Make sure `.wasm` is served as `application/wasm`.

## Git

Default branch is `develop`. Do not push to it directly unless asked; work on a
feature branch.
