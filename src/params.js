/**
 * Configuration and the BlazePose 33-landmark topology.
 *
 * The landmark names and their ordering are defined by MediaPipe's pose
 * landmarker model; see
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */

export const DEFAULT_LINE_WIDTH = 2;
export const DEFAULT_RADIUS = 4;

export const VIDEO_SIZE = {
  "640 X 480": { width: 640, height: 480 },
  "640 X 360": { width: 640, height: 360 },
  "360 X 270": { width: 360, height: 270 },
};

/**
 * MediaPipe fetches its Wasm runtime at load time rather than through the
 * bundler, so it is served from this app's own origin — see
 * scripts/copy-wasm.mjs, which stages it into dist/. Serving it ourselves keeps
 * the runtime locked to the installed @mediapipe/tasks-vision version and means
 * the app needs no third-party CDN to start.
 */
export const WASM_PATH = "/wasm";

/**
 * Model variants, staged into dist/models by scripts/fetch-assets.mjs and
 * served from this origin. Ordered least to most accurate: `heavy` is the one
 * for offline form analysis (and needs `yarn fetch-assets --all`), `full` is
 * the sensible live default, `lite` is for low-end mobile and is visibly
 * noisier on fast limbs.
 */
export const MODEL_ASSETS = {
  lite: "/models/pose_landmarker_lite.task",
  full: "/models/pose_landmarker_full.task",
  heavy: "/models/pose_landmarker_heavy.task",
};

export const STATE = {
  camera: { targetFPS: 60, sizeOption: "640 X 480" },
  model: "full",
  landmarker: {
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  },
  /** Landmarks below this visibility are not drawn. */
  visibilityThreshold: 0.5,
  render3D: false,
  /**
   * Metrics are computed for one declared camera view at a time. Each metric
   * names the views it is valid in (see metrics/definitions.js); the view set
   * here decides which of them are computed and shown.
   */
  metrics: {
    enabled: true,
    view: "side",
    /** Armed by ?record=1: starts recording at the first detected pose. */
    autoRecord: false,
    /** Rolling span the metrics are computed over, in milliseconds. */
    windowMs: 3000,
    /** Frames retained. At 60fps this is ten seconds, comfortably over windowMs. */
    bufferFrames: 600,
  },
  smoothing: {
    enabled: true,
    /**
     * Tuned against a 60fps jitter/ramp sweep. beta is the lag/jitter dial:
     * raising it tracks fast motion more tightly at a small jitter cost.
     *   beta 0.0 -> lag 0.28   beta 1.0 -> lag 0.10
     *   beta 0.5 -> lag 0.15   beta 1.5 -> lag 0.08  (jitter is flat across all)
     * Sport motion wants low lag, so this sits high.
     */
    normalized: { minCutoff: 1.0, beta: 1.5, dCutoff: 1.0 },
    /** World landmarks are in metres, so speeds are ~3x larger; beta scales down. */
    world: { minCutoff: 1.0, beta: 0.5, dCutoff: 1.0 },
  },
};

/** The 33 BlazePose landmarks, in model output order. */
export const POSE_LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];

export const POSE_LANDMARKS = Object.fromEntries(
  POSE_LANDMARK_NAMES.map((name, i) => [name.toUpperCase(), i])
);

/**
 * Index sets by body side. Two naming conventions coexist in the model's own
 * landmark names — `left_shoulder` but `mouth_left` — and the odd/left,
 * even/right index parity only holds from the shoulders down, so match the
 * side as a word anywhere in the name rather than by prefix or parity.
 */
export const KEYPOINT_INDEX_BY_SIDE = {
  left: indicesOnSide("left"),
  right: indicesOnSide("right"),
  middle: POSE_LANDMARK_NAMES.map((_, i) => i).filter(
    (i) => side(POSE_LANDMARK_NAMES[i]) == null
  ),
};

function side(name) {
  const parts = name.split("_");
  if (parts.includes("left")) return "left";
  if (parts.includes("right")) return "right";
  return null;
}

function indicesOnSide(wanted) {
  return POSE_LANDMARK_NAMES.map((name, i) =>
    side(name) === wanted ? i : -1
  ).filter((i) => i >= 0);
}
