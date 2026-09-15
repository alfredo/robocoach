/**
 * Metric definitions, each declaring which camera views it is valid in.
 *
 * The view gate is the point of this file. Side-on, the far arm is occluded and
 * its landmarks are the model's best guess, so a left/right symmetry figure
 * still computes and still looks plausible while meaning nothing. Rather than
 * leave that to a caller to remember, each metric names the views it is honest
 * in, and the readout renders only those.
 *
 * Every `compute` takes a span of samples and returns a number, or null when
 * there is not enough history to answer.
 */
import { nearSide } from "./sample";
import { unwrap } from "./geometry";

export const VIEWS = ["side", "front"];

function range(values) {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values) - Math.min(...values);
}

/**
 * How much higher one arm is than the other, in degrees.
 *
 * Compares elevation MAGNITUDE, not the signed angle. The sign says which way
 * along x the arm went, so two arms held out symmetrically to either side carry
 * opposite signs and their raw difference is ~180 for what is in fact a
 * symmetric shape. Magnitude also sidesteps the sign flapping that happens when
 * an arm passes near vertical and its x component is close to zero.
 *
 * The tradeoff: this cannot see a fault where the arms are equally high but
 * travelling in opposite directions. Detecting that needs the swing direction
 * per arm, which is a rep-level question rather than a per-frame one.
 */
function armElevationGap(sample) {
  return Math.abs(Math.abs(sample.armAngle.left) - Math.abs(sample.armAngle.right));
}

function rms(values) {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, v) => sum + v * v, 0);
  return Math.sqrt(total / values.length);
}

export const METRICS = [
  {
    id: "swing_range",
    label: "Swing range",
    unit: "°",
    views: ["side"],
    precision: 0,
    help: "Peak-to-peak travel of the upper arm relative to the trunk.",
    compute: (samples) => {
      const side = nearSide(samples);
      // Unwrapped: the swing goes overhead, straight through the angle's
      // wrap point, and a raw peak-to-peak would read ~358 instead of ~2.
      return range(unwrap(samples.map((s) => s.armAngle[side])));
    },
  },
  {
    id: "elbow_min",
    label: "Straightest elbow",
    unit: "°",
    views: ["side"],
    precision: 0,
    help: "Lowest elbow angle seen; divers want the swing arm near 180.",
    compute: (samples) => {
      const side = nearSide(samples);
      return Math.min(...samples.map((s) => s.elbow[side]));
    },
  },
  {
    id: "elbow_min_both",
    label: "Straightest elbow",
    unit: "°",
    views: ["front"],
    precision: 0,
    help: "Lowest elbow angle across both arms.",
    compute: (samples) =>
      Math.min(...samples.map((s) => Math.min(s.elbow.left, s.elbow.right))),
  },
  {
    id: "symmetry_peak",
    label: "Worst L/R gap",
    unit: "°",
    views: ["front"],
    precision: 0,
    help: "Largest instantaneous difference in how high the two arms are.",
    compute: (samples) => Math.max(...samples.map(armElevationGap)),
  },
  {
    id: "symmetry_rms",
    label: "Typical L/R gap",
    unit: "°",
    views: ["front"],
    precision: 1,
    help: "RMS difference in arm elevation across the window.",
    compute: (samples) => rms(samples.map(armElevationGap)),
  },
  {
    id: "trunk_rock",
    label: "Trunk rock",
    unit: "°",
    views: ["side"],
    precision: 1,
    help: "Sagittal trunk movement; a swing drill wants this small.",
    compute: (samples) => range(samples.map((s) => s.trunkTilt)),
  },
  {
    id: "trunk_sway",
    label: "Trunk sway",
    unit: "°",
    views: ["front"],
    precision: 1,
    help: "Lateral trunk movement; a swing drill wants this small.",
    compute: (samples) => range(samples.map((s) => s.trunkTilt)),
  },
];

export function metricsForView(view) {
  return METRICS.filter((m) => m.views.includes(view));
}

/**
 * Evaluate every metric valid in `view`. Metrics that throw or return a
 * non-finite value report as null rather than propagating: one bad frame should
 * blank a figure, not kill the render loop.
 */
export function evaluate(view, samples) {
  return metricsForView(view).map((metric) => {
    let value = null;
    if (samples.length > 0) {
      try {
        const computed = metric.compute(samples);
        value = Number.isFinite(computed) ? computed : null;
      } catch {
        value = null;
      }
    }
    return { ...metric, value };
  });
}
