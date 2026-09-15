/**
 * A fixed-capacity ring of per-frame samples.
 *
 * Every metric is a question about a span of time — a range, a peak, a
 * difference between two events — but the render loop only ever holds the
 * current frame. This is the history those questions are asked against.
 *
 * It stores derived scalars rather than raw landmarks: that is what the metrics
 * consume, and it keeps a few seconds of history to a few tens of kilobytes.
 * If a future metric needs the landmarks themselves, this is where they would
 * be added.
 */
export class FrameBuffer {
  /** @param capacity Number of samples to retain. At 60fps, 600 is ten seconds. */
  constructor(capacity = 600) {
    if (!(capacity > 0)) {
      throw new Error(`FrameBuffer capacity must be positive, got ${capacity}`);
    }
    this.capacity = capacity;
    this.items = [];
    this.start = 0;
  }

  get size() {
    return this.items.length;
  }

  push(sample) {
    if (this.items.length < this.capacity) {
      this.items.push(sample);
      return;
    }
    // Full: overwrite the oldest slot and advance the start marker.
    this.items[this.start] = sample;
    this.start = (this.start + 1) % this.capacity;
  }

  clear() {
    this.items = [];
    this.start = 0;
  }

  /** Oldest to newest. */
  toArray() {
    if (this.items.length < this.capacity) {
      return this.items.slice();
    }
    return this.items
      .slice(this.start)
      .concat(this.items.slice(0, this.start));
  }

  last() {
    if (this.items.length === 0) {
      return null;
    }
    const index =
      this.items.length < this.capacity
        ? this.items.length - 1
        : (this.start + this.capacity - 1) % this.capacity;
    return this.items[index];
  }

  /**
   * Samples from the last `ms` milliseconds, oldest to newest. Empty if there
   * is no history yet.
   */
  window(ms) {
    const newest = this.last();
    if (newest == null) {
      return [];
    }
    const cutoff = newest.t - ms;
    return this.toArray().filter((s) => s.t >= cutoff);
  }
}
