/**
 * Binds the on-screen recording controls to a SessionRecorder.
 *
 * The buttons are the primary interface, not a convenience over the keyboard
 * shortcuts: the intended setup is a tablet on a tripod at the side of the gym,
 * where there is no keyboard to press. The shortcuts stay bound for laptop use.
 */
export class RecorderControls {
  /**
   * @param recorder The SessionRecorder to drive.
   * @param handlers.onStart Must return the capture metadata for the session.
   * @param handlers.onStop Called after recording stops, to save the session.
   */
  constructor(recorder, { onStart, onStop }) {
    this.recorder = recorder;
    this.onStart = onStart;
    this.onStop = onStop;

    this.toggleButton = document.getElementById("record-toggle");
    this.markButton = document.getElementById("mark-rep");
    this.status = document.getElementById("control-status");

    this.toggleButton.addEventListener("click", () => this.toggle());
    this.markButton.addEventListener("click", () => this.mark());

    window.addEventListener("keydown", (event) => {
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      if (event.key.toLowerCase() === "r") {
        this.toggle();
      } else if (event.code === "Space") {
        // Space would otherwise re-trigger whichever button has focus.
        event.preventDefault();
        this.mark();
      }
    });

    this.render();
  }

  toggle() {
    if (this.recorder.recording) {
      this.recorder.stop();
      this.onStop();
    } else {
      this.recorder.start(this.onStart());
    }
    this.render();
  }

  mark() {
    if (!this.recorder.recording) {
      return;
    }
    this.recorder.mark();
    this.render();
  }

  /** Called every frame while recording so the counters stay live. */
  render() {
    const recording = this.recorder.recording;
    this.toggleButton.textContent = recording ? "Stop & save" : "Start recording";
    this.toggleButton.setAttribute("aria-pressed", String(recording));
    this.markButton.disabled = !recording;

    if (recording) {
      const mb = (this.recorder.estimateBytes() / 1048576).toFixed(1);
      this.status.textContent =
        `● ${this.recorder.durationSeconds.toFixed(0)}s · ` +
        `${this.recorder.frames.length} frames · ` +
        `${this.recorder.marks.length} marks · ~${mb}MB`;
    } else if (this.lastSaved) {
      this.status.textContent = this.lastSaved;
    } else {
      this.status.textContent = "Ready — press Start, then Mark once per rep";
    }
  }

  /** Shows what the finished session contained, so a bad take is obvious. */
  reportSaved(filename, bytes, frameCount, markCount, fps) {
    this.lastSaved =
      `Saved ${filename} · ${frameCount} frames @ ${fps.toFixed(0)}fps · ` +
      `${markCount} marks · ${(bytes / 1048576).toFixed(1)}MB`;
    this.render();
  }
}

function isTypingTarget(target) {
  if (target == null) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
