/**
 * Draws the metric panel over the video.
 *
 * The renderer permanently mirrors the 2D context so the camera image reads
 * correctly, which means anything drawn through it inherits that flip and comes
 * out backwards. Text especially. Every draw here happens inside a
 * save/setTransform/restore so the panel is laid out in ordinary screen
 * coordinates, and the mirror is put back untouched for the next frame.
 */
const PADDING = 12;
const LINE_HEIGHT = 22;
const PANEL_WIDTH = 260;

export class Readout {
  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
  }

  /**
   * @param view The declared camera view, shown so a mis-set view is obvious.
   * @param results Output of `evaluate()`.
   * @param note Optional status line, e.g. why values are missing.
   */
  draw(view, results, note) {
    const ctx = this.ctx;
    ctx.save();
    // Drop the renderer's mirror for the duration of the panel.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const rows = results.length + 1;
    const height = PADDING * 2 + rows * LINE_HEIGHT + (note ? LINE_HEIGHT : 0);

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, PANEL_WIDTH, height);

    ctx.textBaseline = "top";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${view} view`.toUpperCase(), PADDING, PADDING);

    ctx.font = "13px system-ui, sans-serif";
    results.forEach((metric, i) => {
      const y = PADDING + (i + 1) * LINE_HEIGHT;
      ctx.fillStyle = "#c8c8c8";
      ctx.fillText(metric.label, PADDING, y);

      const shown =
        metric.value == null
          ? "--"
          : `${metric.value.toFixed(metric.precision)}${metric.unit}`;
      ctx.fillStyle = metric.value == null ? "#8a8a8a" : "#ffffff";
      ctx.textAlign = "right";
      ctx.fillText(shown, PANEL_WIDTH - PADDING, y);
      ctx.textAlign = "left";
    });

    if (note) {
      ctx.fillStyle = "#8a8a8a";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(note, PADDING, PADDING + rows * LINE_HEIGHT);
    }

    ctx.restore();
  }
}
