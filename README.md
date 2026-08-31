# RoboCoach 🤸

Real-time pose estimation in the browser, aimed at sport movement. Opens your
webcam, runs MediaPipe's BlazePose landmarker over each frame, and draws the
33-point skeleton back over the video — left side in green, right side in
orange, so limbs stay readable when they cross.

Everything runs client-side. The video never leaves the machine, and after the
first load the app fetches nothing from a third party.

## Running it

```sh
make build   # corepack enable && yarn install
make run     # stage assets, then serve on http://localhost:1234
```

The camera needs a secure context, so use `localhost` or HTTPS.

`make run` stages MediaPipe's Wasm runtime and model weights into `dist/` before
serving (see `scripts/fetch-assets.mjs`). Weights are cached in `.assets/`, so
only the first run needs the network.

## Options

Set via URL query string:

| Param | Values | Default | Effect |
| --- | --- | --- | --- |
| `model` | `lite`, `full`, `heavy` | `full` | Accuracy/speed tradeoff. `heavy` needs `make assets` first. |
| `render3d` | `1`, `0` | `0` | Rotatable 3D point cloud of the metric world landmarks. |
| `smoothing` | `1`, `0` | `1` | One Euro filter over the landmarks. Turn off to see how much it does. |

## Why this stack

Sport movement has to work from the side as well as head-on, and a 2D model
cannot do that well: side-on, the left and right limbs overlap and there is no
depth to tell them apart. MediaPipe's pose landmarker emits **33 landmarks with
3D world coordinates in metres**, including heels and toes, which is what makes
joint angles and left/right disambiguation possible from either angle.

Landmarks are smoothed with a [One Euro filter](https://gery.casiez.net/1euro/),
which adapts to speed — heavy smoothing when a position is held, almost none
when a limb is moving fast. On fast motion this matters more for stable joint
angles than the choice of model does.
