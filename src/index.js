import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-webgpu';

import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from '@tensorflow/tfjs-core';

import { Camera } from "./camera";
import {RendererCanvas2d} from './renderer_canvas2d';
import { STATE } from "./params";

let camera, detector, rafId;
let renderer = null;

async function renderResult() {

  if (camera.video.readyState < 2) {
    await new Promise((resolve) => {
      camera.video.onloadeddata = () => {
        resolve(video);
      };
    });
  }
  let poses = null;
  let canvasInfo = null;

  poses = await detector.estimatePoses(camera.video, {flipHorizontal: false})
  console.log(poses)
  const rendererParams = [camera.video, poses, false];
  renderer.draw(rendererParams);
}

async function renderPrediction() {
  await renderResult()
  rafId = requestAnimationFrame(renderPrediction);
}

async function createDetector() {
    let model = poseDetection.SupportedModels.MoveNet;
    let modelType = poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING;
    // let modelType = posedetection.movenet.modelType.SINGLEPOSE_THUNDER;
    const modelConfig = {modelType};
    return poseDetection.createDetector(model, modelConfig);
}

async function app() {  
  const urlParams = new URLSearchParams(window.location.search);
  camera = await Camera.setup(STATE.camera);
  await tf.ready();
  detector = await createDetector();

  const canvas = document.getElementById("output");
  canvas.width = camera.video.width;
  canvas.height = camera.video.height;
  renderer = new RendererCanvas2d(canvas);

  renderPrediction();
  console.log("Done?")
}

app();
