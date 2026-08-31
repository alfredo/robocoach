import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import { Camera } from "./camera";
import { LandmarkSmoother } from "./one_euro_filter";
import { RendererCanvas2d } from "./renderer_canvas2d";
import { MODEL_ASSETS, STATE, WASM_PATH } from "./params";

let camera, landmarker, renderer, rafId;
let normalizedSmoother, worldSmoother;
// detectForVideo requires strictly increasing timestamps, and re-running
// inference on a frame the camera has not replaced yet is wasted work.
let lastVideoTime = -1;
let lastResult = null;

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_ASSETS[STATE.model],
      // GPU keeps a heavier model real-time; MediaPipe falls back to CPU on
      // its own if the delegate is unavailable.
      delegate: "GPU",
    },
    // VIDEO mode carries tracking state between frames, which both steadies
    // the landmarks and avoids re-running whole-frame detection every time.
    runningMode: "VIDEO",
    ...STATE.landmarker,
  });
}

/**
 * Smoothing must be applied per pose, and the filters hold per-landmark state,
 * so this only supports a single tracked athlete. numPoses > 1 would need a
 * smoother bank keyed by a stable track id, which the task does not expose.
 */
function smooth(result, timestamp) {
  if (result.landmarks.length === 0) {
    normalizedSmoother.reset();
    worldSmoother.reset();
    return result;
  }
  if (!STATE.smoothing.enabled) {
    return result;
  }
  return {
    ...result,
    landmarks: [normalizedSmoother.smooth(result.landmarks[0], timestamp)],
    worldLandmarks:
      result.worldLandmarks.length > 0
        ? [worldSmoother.smooth(result.worldLandmarks[0], timestamp)]
        : result.worldLandmarks,
  };
}

function renderResult() {
  if (camera.video.readyState < 2) {
    return;
  }

  if (camera.video.currentTime !== lastVideoTime) {
    lastVideoTime = camera.video.currentTime;
    const timestamp = performance.now();
    lastResult = smooth(
      landmarker.detectForVideo(camera.video, timestamp),
      timestamp
    );
  }

  renderer.draw(camera.video, lastResult);
}

function renderPrediction() {
  renderResult();
  rafId = requestAnimationFrame(renderPrediction);
}

function applyUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);

  const model = urlParams.get("model");
  if (model != null && model in MODEL_ASSETS) {
    STATE.model = model;
  }
  if (urlParams.has("render3d")) {
    STATE.render3D = urlParams.get("render3d") !== "0";
  }
  if (urlParams.has("smoothing")) {
    STATE.smoothing.enabled = urlParams.get("smoothing") !== "0";
  }
}

async function app() {
  applyUrlParams();

  camera = await Camera.setup(STATE.camera);
  landmarker = await createLandmarker();

  normalizedSmoother = new LandmarkSmoother(STATE.smoothing.normalized);
  worldSmoother = new LandmarkSmoother(STATE.smoothing.world);

  const canvas = document.getElementById("output");
  canvas.width = camera.video.width;
  canvas.height = camera.video.height;
  renderer = new RendererCanvas2d(canvas);

  renderPrediction();
}

app();
