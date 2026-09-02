/**
 * Geometric primitives for pose metrics.
 *
 * Everything here works on the **image-plane projection of `worldLandmarks`**:
 * the x and y components only, in metres, with the origin at the hip centre.
 * The z axis is deliberately dropped. MediaPipe's depth estimate is weakly
 * supervised and far noisier than x/y, and every metric in the MVP is a joint
 * angle whose error would be dominated by that noise. Working in the projection
 * keeps the numbers trustworthy; the declared camera view is what tells us
 * which anatomical plane the projection corresponds to.
 *
 * Verified coordinate conventions (measured, not assumed — see the axis probe
 * in the commit that introduced this file):
 *   - origin is the midpoint of the hips
 *   - up is NEGATIVE y (shoulders sit at y ≈ -0.49 on a standing adult)
 *   - positive x is the athlete's LEFT, which is the right-hand side of the
 *     image when they face the camera
 *   - units are metres
 */
import { POSE_LANDMARKS as L } from "../params";

const RAD_TO_DEG = 180 / Math.PI;

/** World up, in the projection. Assumes the camera is roughly level. */
export const UP = { x: 0, y: -1 };

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function length(v) {
  return Math.hypot(v.x, v.y);
}

export function normalize(v) {
  const len = length(v);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

/** 2D cross product, i.e. the z component of the 3D cross. Sign gives turn direction. */
export function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

/**
 * Signed angle from vector `from` to vector `to`, in degrees, range (-180, 180].
 * Positive when `cross(from, to)` is positive.
 *
 * What that means visually depends on `from`, because y points down: reversing
 * the reference vector flips the handedness. Callers that expose a signed angle
 * pin its direction with a test rather than reasoning about it.
 */
export function signedAngle(from, to) {
  return RAD_TO_DEG * Math.atan2(cross(from, to), dot(from, to));
}

/** Unsigned angle at joint `b` formed by `a-b-c`, in degrees, range [0, 180]. */
export function angleAtJoint(a, b, c) {
  const ba = sub(a, b);
  const bc = sub(c, b);
  // atan2 of |cross| against dot stays stable near 0 and 180 degrees, where
  // acos(dot / |a||b|) loses precision badly.
  return RAD_TO_DEG * Math.atan2(Math.abs(cross(ba, bc)), dot(ba, bc));
}

/**
 * The trunk frame: hip centre, shoulder centre, and the unit vector pointing
 * from hips to shoulders. All arm angles are measured relative to this rather
 * than to the world, so that leaning does not masquerade as arm movement.
 */
export function trunkAxis(pose) {
  const hip = midpoint(pose[L.LEFT_HIP], pose[L.RIGHT_HIP]);
  const shoulder = midpoint(pose[L.LEFT_SHOULDER], pose[L.RIGHT_SHOULDER]);
  return { hip, shoulder, up: normalize(sub(shoulder, hip)) };
}

/**
 * Trunk tilt away from world vertical, in degrees. Positive tilts towards +x
 * (the right of the image). Read it as sagittal lean from a side view and as
 * lateral sway from a front view.
 */
export function trunkTilt(pose) {
  return signedAngle(UP, trunkAxis(pose).up);
}

/**
 * Angle of the upper arm away from hanging straight down along the trunk.
 *
 * 0 means the arm lies along the trunk pointing down; magnitude grows as the
 * arm rises, reaching 180 when it is straight overhead. The sign says which
 * way the arm went: positive towards +x, negative towards -x.
 *
 * From a side view this is the swing angle in the sagittal plane. From a front
 * view the same number reads as elevation with lateral flare mixed in, which is
 * why the front view scores symmetry rather than absolute swing.
 */
export function armAngleFromTrunk(pose, side) {
  const { up } = trunkAxis(pose);
  const down = { x: -up.x, y: -up.y };
  const shoulder = pose[side === "left" ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER];
  const elbow = pose[side === "left" ? L.LEFT_ELBOW : L.RIGHT_ELBOW];
  // Negated so that positive means +x for both this and trunkTilt. Measuring
  // from `down` rather than from `UP` reverses the cross-product sign, and
  // without this the two signed angles would disagree about which way is which.
  return -signedAngle(down, sub(elbow, shoulder));
}

/** Elbow angle in degrees; 180 is a straight arm. */
export function elbowAngle(pose, side) {
  const isLeft = side === "left";
  return angleAtJoint(
    pose[isLeft ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER],
    pose[isLeft ? L.LEFT_ELBOW : L.RIGHT_ELBOW],
    pose[isLeft ? L.LEFT_WRIST : L.RIGHT_WRIST]
  );
}

/** Mean visibility of the arm chain, used to pick the near arm in a side view. */
export function armVisibility(pose, side) {
  const isLeft = side === "left";
  const chain = [
    pose[isLeft ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER],
    pose[isLeft ? L.LEFT_ELBOW : L.RIGHT_ELBOW],
    pose[isLeft ? L.LEFT_WRIST : L.RIGHT_WRIST],
  ];
  let total = 0;
  for (const p of chain) {
    total += p.visibility != null ? p.visibility : 1;
  }
  return total / chain.length;
}

/**
 * Removes 360-degree discontinuities from a sequence of signed angles.
 *
 * A signed angle is reported in (-180, 180], so a limb passing through the
 * wrap point jumps the full range in one frame. A diving arm swing goes
 * overhead, i.e. straight through it, so an arm crossing just past vertical
 * flips +179 to -179 and any peak-to-peak measurement reads ~358 instead of
 * ~2. Unwrapping restores a continuous signal by accumulating the crossings.
 */
export function unwrap(values) {
  if (values.length === 0) {
    return [];
  }
  const out = [values[0]];
  let offset = 0;
  for (let i = 1; i < values.length; i++) {
    const step = values[i] - values[i - 1];
    if (step > 180) {
      offset -= 360;
    } else if (step < -180) {
      offset += 360;
    }
    out.push(values[i] + offset);
  }
  return out;
}
