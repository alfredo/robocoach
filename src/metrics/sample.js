/**
 * Reduces one frame of landmarks to the scalar signals the metrics are built
 * from. Kept separate from the metric definitions so that the per-frame cost is
 * paid once, no matter how many metrics read the result.
 */
import * as geo from "./geometry";

/**
 * @param world A single pose's `worldLandmarks`, already smoothed.
 * @param t Frame timestamp in milliseconds.
 */
export function buildSample(world, t) {
  return {
    t,
    armAngle: {
      left: geo.armAngleFromTrunk(world, "left"),
      right: geo.armAngleFromTrunk(world, "right"),
    },
    elbow: {
      left: geo.elbowAngle(world, "left"),
      right: geo.elbowAngle(world, "right"),
    },
    visibility: {
      left: geo.armVisibility(world, "left"),
      right: geo.armVisibility(world, "right"),
    },
    trunkTilt: geo.trunkTilt(world),
  };
}

/**
 * Which arm faces the camera, by mean landmark visibility over a span of
 * samples. In a side view the far arm is occluded and its angles are guesses,
 * so side-view metrics follow the near arm rather than averaging the two.
 */
export function nearSide(samples) {
  let left = 0;
  let right = 0;
  for (const s of samples) {
    left += s.visibility.left;
    right += s.visibility.right;
  }
  return left >= right ? "left" : "right";
}
