/**
 * Captures a drill session as a landmark time series for offline work.
 *
 * This exists so that rep detection can be tuned against real movement instead
 * of guessed thresholds. It deliberately records landmarks rather than video:
 * the file is a few hundred kilobytes instead of hundreds of megabytes, it is
 * directly what the detector consumes, and it contains no imagery of the
 * athlete — which matters when the athletes are junior divers.
 *
 * Landmarks are stored RAW, before smoothing. Smoothing can be reapplied
 * offline with any parameters; it cannot be undone. The filter settings that
 * were active are recorded alongside so a session can be reproduced exactly.
 *
 * A second person can tap a key once per rep while the athlete works. Those
 * marks are the ground truth the detector gets scored against — without them a
 * recording says how the athlete moved but not where a human saw one rep end
 * and the next begin.
 */
const FORMAT = "robocoach-session/1";

/** Rounds to millimetre precision; the extra digits are model noise, not signal. */
function round(value) {
  return Math.round(value * 10000) / 10000;
}

export class SessionRecorder {
  /**
   * @param maxSeconds Auto-stops after this long, so a forgotten recording
   *   cannot grow without bound.
   */
  constructor({ maxSeconds = 120 } = {}) {
    this.maxSeconds = maxSeconds;
    this.reset();
  }

  reset() {
    this.recording = false;
    this.frames = [];
    this.marks = [];
    this.startedAt = null;
    this.meta = null;
  }

  start(meta) {
    this.reset();
    this.recording = true;
    this.startedAt = new Date().toISOString();
    this.meta = meta;
  }

  /** @return true if this frame was stored. */
  capture(world, t) {
    if (!this.recording) {
      return false;
    }
    if (this.frames.length > 0 && t - this.frames[0].t > this.maxSeconds * 1000) {
      this.stop();
      return false;
    }
    this.frames.push({
      t: round(t),
      world: world.map((p) => [
        round(p.x),
        round(p.y),
        round(p.z),
        round(p.visibility != null ? p.visibility : 1),
      ]),
    });
    return true;
  }

  /** Records a human-observed rep boundary at the latest frame time. */
  mark() {
    if (!this.recording || this.frames.length === 0) {
      return;
    }
    this.marks.push(this.frames[this.frames.length - 1].t);
  }

  stop() {
    this.recording = false;
  }

  get durationSeconds() {
    if (this.frames.length < 2) {
      return 0;
    }
    return (this.frames[this.frames.length - 1].t - this.frames[0].t) / 1000;
  }

  /** Mean frames per second actually achieved, which caps velocity accuracy. */
  get fps() {
    const seconds = this.durationSeconds;
    return seconds > 0 ? this.frames.length / seconds : 0;
  }

  toJSON(landmarkNames) {
    return {
      format: FORMAT,
      recordedAt: this.startedAt,
      durationSeconds: +this.durationSeconds.toFixed(2),
      frameCount: this.frames.length,
      meanFps: +this.fps.toFixed(1),
      // Landmarks here are raw; this records what the live view was smoothing with.
      smoothingAtCapture: this.meta?.smoothing,
      view: this.meta?.view,
      model: this.meta?.model,
      camera: this.meta?.camera,
      landmarkNames,
      markCount: this.marks.length,
      marks: this.marks,
      frames: this.frames,
    };
  }

  /** Approximate size of the export in bytes, for a size hint in the UI. */
  estimateBytes() {
    // Each landmark serialises to roughly 34 characters across four rounded
    // numbers plus punctuation; enough to warn before a file gets unwieldy.
    return this.frames.length * 33 * 34;
  }
}

/** Hands the session to the browser as a downloaded file. */
export function downloadSession(recorder, landmarkNames) {
  const payload = JSON.stringify(recorder.toJSON(landmarkNames));
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = (recorder.startedAt || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const link = document.createElement("a");
  link.href = url;
  link.download = `robocoach-${recorder.meta?.view || "session"}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return payload.length;
}
