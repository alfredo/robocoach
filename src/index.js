import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import { Camera } from "./camera";
import { LandmarkSmoother } from "./one_euro_filter";
import { RendererCanvas2d } from "./renderer_canvas2d";
import { MODEL_ASSETS, POSE_LANDMARK_NAMES, STATE, WASM_PATH } from "./params";
import { FrameBuffer } from "./metrics/frame_buffer";
import { buildSample } from "./metrics/sample";
import { evaluate, VIEWS } from "./metrics/definitions";
import { Readout } from "./metrics/readout";
import { SessionRecorder, downloadSession } from "./metrics/recorder";

let camera, landmarker, renderer, rafId;
let normalizedSmoother, worldSmoother;
let frames, readout, recorder;
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
    const detected = landmarker.detectForVideo(camera.video, timestamp);
    // Recorded before smoothing: filtering can be reapplied offline with any
    // parameters, but it cannot be removed after the fact.
    if (detected.worldLandmarks.length > 0) {
      recorder.capture(detected.worldLandmarks[0], timestamp);
    }
    lastResult = smooth(detected, timestamp);
    recordSample(lastResult, timestamp);
  }

  renderer.draw(camera.video, lastResult);
  drawMetrics();
}

/**
 * Metrics run off the smoothed world landmarks, so they inherit the same
 * filtering the overlay shows. Losing the pose clears the history rather than
 * letting a stale window blend across a gap.
 */
function recordSample(result, timestamp) {
  if (!STATE.metrics.enabled) {
    return;
  }
  if (result.worldLandmarks.length === 0) {
    frames.clear();
    return;
  }
  frames.push(buildSample(result.worldLandmarks[0], timestamp));
}

function drawMetrics() {
  if (!STATE.metrics.enabled) {
    return;
  }
  const samples = frames.window(STATE.metrics.windowMs);
  let note;
  if (recorder.recording) {
    const mb = (recorder.estimateBytes() / 1048576).toFixed(1);
    note = `● REC ${recorder.durationSeconds.toFixed(0)}s · ${recorder.frames.length} frames · ${recorder.marks.length} marks · ~${mb}MB`;
  } else if (samples.length === 0) {
    note = "no pose — stand in frame";
  } else {
    note = `${(STATE.metrics.windowMs / 1000).toFixed(0)}s window · ${samples.length} frames · R to record`;
  }
  readout.draw(STATE.metrics.view, evaluate(STATE.metrics.view, samples), note);
}

function renderPrediction() {
  renderResult();
  rafId = requestAnimationFrame(renderPrediction);
}

/**
 * R toggles recording, Space marks a rep. Space is meant for a second person
 * watching: those marks are the ground truth a rep detector is scored against.
 */
function bindRecordingKeys() {
  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "r") {
      if (recorder.recording) {
        recorder.stop();
        const bytes = downloadSession(recorder, POSE_LANDMARK_NAMES);
        console.log(
          `session saved: ${recorder.frames.length} frames, ` +
            `${recorder.marks.length} marks, ${(bytes / 1048576).toFixed(2)}MB`
        );
      } else {
        recorder.start({
          view: STATE.metrics.view,
          model: STATE.model,
          smoothing: STATE.smoothing,
          camera: { width: camera.video.width, height: camera.video.height },
        });
      }
    } else if (event.code === "Space") {
      event.preventDefault();
      recorder.mark();
    }
  });
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

  const view = urlParams.get("view");
  if (view != null && VIEWS.includes(view)) {
    STATE.metrics.view = view;
  }
  if (urlParams.has("metrics")) {
    STATE.metrics.enabled = urlParams.get("metrics") !== "0";
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
  readout = new Readout(canvas);
  frames = new FrameBuffer(STATE.metrics.bufferFrames);
  recorder = new SessionRecorder();
  bindRecordingKeys();

  renderPrediction();
}

app();
