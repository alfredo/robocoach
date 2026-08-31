/**
 * @license
 * Copyright 2023 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *
 * Adapted from the tfjs-models pose-detection demo renderer to draw MediaPipe
 * PoseLandmarker output (33 landmarks, normalized 2D + metric 3D) instead of
 * MoveNet's 17 pixel-space keypoints.
 */
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import * as scatter from "scatter-gl";

import * as params from "./params";

// These anchor points allow the pose pointcloud to resize according to its
// position in the input.
const ANCHOR_POINTS = [
  [0, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [-1, -1, 0],
];

const LEFT_COLOR = "#00ff00";
const RIGHT_COLOR = "#ffa500";
const MIDDLE_COLOR = "#ff0000";

export class RendererCanvas2d {
  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    this.scatterGLEl = document.querySelector("#scatter-gl-container");
    this.scatterGL = new scatter.ScatterGL(this.scatterGLEl, {
      rotateOnStart: true,
      selectEnabled: false,
      styles: { polyline: { defaultOpacity: 1, deselectedOpacity: 1 } },
    });
    this.scatterGLHasInitialized = false;
    this.videoWidth = canvas.width;
    this.videoHeight = canvas.height;

    // Precompute the side lookup so the per-frame path is a plain array read.
    this.sideByIndex = new Array(params.POSE_LANDMARK_NAMES.length).fill(
      MIDDLE_COLOR
    );
    for (const i of params.KEYPOINT_INDEX_BY_SIDE.left) {
      this.sideByIndex[i] = LEFT_COLOR;
    }
    for (const i of params.KEYPOINT_INDEX_BY_SIDE.right) {
      this.sideByIndex[i] = RIGHT_COLOR;
    }

    this.flip(this.videoWidth, this.videoHeight);
  }

  flip(videoWidth, videoHeight) {
    // Because the image from camera is mirrored, need to flip horizontally.
    this.ctx.translate(videoWidth, 0);
    this.ctx.scale(-1, 1);

    this.scatterGLEl.style = `width: ${videoWidth}px; height: ${videoHeight}px;`;
    this.scatterGL.resize();

    this.scatterGLEl.style.display = params.STATE.render3D
      ? "inline-block"
      : "none";
  }

  /**
   * @param video The source video element.
   * @param result A PoseLandmarkerResult, already smoothed.
   */
  draw(video, result) {
    this.drawCtx(video);

    if (result == null) {
      return;
    }
    for (const landmarks of result.landmarks) {
      this.drawKeypoints(landmarks);
      this.drawSkeleton(landmarks);
    }
    if (params.STATE.render3D && result.worldLandmarks.length > 0) {
      this.drawKeypoints3D(result.worldLandmarks[0]);
    }
  }

  drawCtx(video) {
    this.ctx.drawImage(video, 0, 0, this.videoWidth, this.videoHeight);
  }

  clearCtx() {
    this.ctx.clearRect(0, 0, this.videoWidth, this.videoHeight);
  }

  /** Landmarks arrive normalized to 0..1; scale them into canvas pixels. */
  toPixels(landmark) {
    return {
      x: landmark.x * this.videoWidth,
      y: landmark.y * this.videoHeight,
    };
  }

  isVisible(landmark) {
    // Treat a missing visibility as visible, matching the model's own
    // behaviour for variants that do not emit the field.
    const visibility = landmark.visibility != null ? landmark.visibility : 1;
    return visibility >= params.STATE.visibilityThreshold;
  }

  /**
   * Draw the keypoints on the video, coloured by body side so that left and
   * right stay distinguishable in side-on views.
   */
  drawKeypoints(landmarks) {
    this.ctx.strokeStyle = "White";
    this.ctx.lineWidth = params.DEFAULT_LINE_WIDTH;

    landmarks.forEach((landmark, i) => {
      if (!this.isVisible(landmark)) {
        return;
      }
      this.ctx.fillStyle = this.sideByIndex[i];
      const { x, y } = this.toPixels(landmark);
      const circle = new Path2D();
      circle.arc(x, y, params.DEFAULT_RADIUS, 0, 2 * Math.PI);
      this.ctx.fill(circle);
      this.ctx.stroke(circle);
    });
  }

  /**
   * Draw the skeleton of a body on the video. Each bone takes the colour of its
   * side, so an occluded limb crossing the body is still readable.
   */
  drawSkeleton(landmarks) {
    this.ctx.lineWidth = params.DEFAULT_LINE_WIDTH;

    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      const from = landmarks[start];
      const to = landmarks[end];
      if (from == null || to == null) {
        continue;
      }
      if (!this.isVisible(from) || !this.isVisible(to)) {
        continue;
      }
      // A bone spanning the midline gets the colour of its far end.
      this.ctx.strokeStyle =
        this.sideByIndex[start] === MIDDLE_COLOR
          ? this.sideByIndex[end]
          : this.sideByIndex[start];

      const a = this.toPixels(from);
      const b = this.toPixels(to);
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }
  }

  /**
   * Render the metric world landmarks as a rotatable point cloud. This is the
   * view that disambiguates depth, so it is the useful one for side-on work.
   */
  drawKeypoints3D(landmarks) {
    const pointsData = landmarks.map((landmark) => [
      -landmark.x,
      -landmark.y,
      -landmark.z,
    ]);

    const dataset = new scatter.ScatterGL.Dataset([
      ...pointsData,
      ...ANCHOR_POINTS,
    ]);

    this.scatterGL.setPointColorer((i) => {
      // Hide the anchor points and any landmark the model is unsure of.
      if (landmarks[i] == null || !this.isVisible(landmarks[i])) {
        return "#ffffff";
      }
      return this.sideByIndex[i];
    });

    if (!this.scatterGLHasInitialized) {
      this.scatterGL.render(dataset);
    } else {
      this.scatterGL.updateDataset(dataset);
    }
    const sequences = PoseLandmarker.POSE_CONNECTIONS.map(({ start, end }) => ({
      indices: [start, end],
    }));
    this.scatterGL.setSequences(sequences);
    this.scatterGLHasInitialized = true;
  }
}
