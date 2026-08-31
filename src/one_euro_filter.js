/**
 * One Euro filter — Casiez, Roussel & Vogel (CHI 2012),
 * "1e Filter: A Simple Speed-based Low-pass Filter for Noisy Input in
 * Interactive Systems". https://gery.casiez.net/1euro/
 *
 * An adaptive low-pass filter: it smooths hard when a signal is nearly still
 * (killing jitter) and barely at all when it moves fast (killing lag). That
 * tradeoff is exactly what sport motion needs — a held plank position should
 * not shimmer, and a sprinting wrist should not lag behind the video.
 */

/** Exponential smoothing with an externally supplied alpha. */
class LowPassFilter {
  constructor() {
    this.hasLastValue = false;
    this.lastValue = 0;
  }

  filter(value, alpha) {
    const result = this.hasLastValue
      ? alpha * value + (1 - alpha) * this.lastValue
      : value;
    this.lastValue = result;
    this.hasLastValue = true;
    return result;
  }

  reset() {
    this.hasLastValue = false;
    this.lastValue = 0;
  }
}

/** Filters one scalar signal. Use one instance per axis per landmark. */
export class OneEuroFilter {
  /**
   * @param minCutoff Cutoff in Hz at zero speed. Lower = smoother when still.
   * @param beta Speed coefficient. Higher = less lag on fast motion.
   * @param dCutoff Cutoff in Hz for the speed estimate itself.
   */
  constructor({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.valueFilter = new LowPassFilter();
    this.speedFilter = new LowPassFilter();
    this.lastValue = 0;
    this.lastTimestamp = null;
  }

  /**
   * @param value Raw sample.
   * @param timestamp Sample time in milliseconds, monotonically increasing.
   */
  filter(value, timestamp) {
    // First sample, or a non-advancing clock: nothing to differentiate against.
    if (this.lastTimestamp == null || timestamp <= this.lastTimestamp) {
      this.lastTimestamp = timestamp;
      this.lastValue = value;
      this.speedFilter.reset();
      return this.valueFilter.filter(value, 1.0);
    }

    const rate = 1000 / (timestamp - this.lastTimestamp);
    const speed = (value - this.lastValue) * rate;
    const smoothedSpeed = this.speedFilter.filter(
      speed,
      alpha(this.dCutoff, rate)
    );

    // The adaptive step: cutoff rises with speed, so fast motion passes through.
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedSpeed);

    this.lastTimestamp = timestamp;
    this.lastValue = value;
    return this.valueFilter.filter(value, alpha(cutoff, rate));
  }

  reset() {
    this.valueFilter.reset();
    this.speedFilter.reset();
    this.lastValue = 0;
    this.lastTimestamp = null;
  }
}

function alpha(cutoff, rate) {
  const tau = 1 / (2 * Math.PI * cutoff);
  const te = 1 / rate;
  return 1 / (1 + tau / te);
}

/**
 * Applies a OneEuroFilter to every axis of every landmark in a pose, holding
 * per-landmark state across frames.
 */
export class LandmarkSmoother {
  constructor(config) {
    this.config = config;
    this.filters = new Map();
  }

  /**
   * Drop all state — call when tracking is lost, so the next acquisition does
   * not get dragged toward wherever the athlete was standing before.
   */
  reset() {
    this.filters.clear();
  }

  /**
   * @param landmarks A single pose's landmark array.
   * @param timestamp Frame time in milliseconds.
   * @return A new array of smoothed landmarks; input is not mutated.
   */
  smooth(landmarks, timestamp) {
    return landmarks.map((landmark, i) => ({
      ...landmark,
      x: this.filterAxis(i, "x", landmark.x, timestamp),
      y: this.filterAxis(i, "y", landmark.y, timestamp),
      z: this.filterAxis(i, "z", landmark.z, timestamp),
    }));
  }

  filterAxis(index, axis, value, timestamp) {
    if (value == null) {
      return value;
    }
    const key = `${index}:${axis}`;
    let filter = this.filters.get(key);
    if (filter == null) {
      filter = new OneEuroFilter(this.config);
      this.filters.set(key, filter);
    }
    return filter.filter(value, timestamp);
  }
}
