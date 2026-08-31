/**
 * Stage MediaPipe's runtime assets into the build output.
 *
 * Neither the Wasm runtime nor the model weights go through the bundler —
 * MediaPipe fetches both over HTTP at load time — so they have to exist as real
 * files under dist/. Serving them from our own origin means the app starts with
 * no third-party CDN, works offline, keeps the Wasm locked to the installed
 * @mediapipe/tasks-vision version, and does not tell Google's servers when
 * someone opens the page.
 *
 * Downloads are cached in .assets/ (gitignored) so a rebuild is offline too.
 *
 * Usage: node scripts/fetch-assets.mjs [--all]
 *   --all  also fetch the 29MB `heavy` model
 */
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = resolve(root, ".assets/models");
const distDir = resolve(root, "dist");

const MODEL_BASE =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker";
// `heavy` is large and only worth fetching for offline analysis, so it is
// opt-in; the app's default model is `full`.
const DEFAULT_MODELS = ["lite", "full"];
const ALL_MODELS = [...DEFAULT_MODELS, "heavy"];

const models = process.argv.includes("--all") ? ALL_MODELS : DEFAULT_MODELS;

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function fetchModel(name) {
  const file = `pose_landmarker_${name}.task`;
  const cached = resolve(cacheDir, file);

  if (await exists(cached)) {
    console.log(`model ${name}: cached`);
  } else {
    const url = `${MODEL_BASE}/pose_landmarker_${name}/float16/1/${file}`;
    console.log(`model ${name}: downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`failed to fetch ${url}: ${response.status}`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    await writeFile(cached, body);
    console.log(`model ${name}: saved ${(body.length / 1048576).toFixed(1)}MB`);
  }

  await cp(cached, resolve(distDir, "models", file));
}

await mkdir(cacheDir, { recursive: true });
await mkdir(resolve(distDir, "models"), { recursive: true });

await cp(
  resolve(root, "node_modules/@mediapipe/tasks-vision/wasm"),
  resolve(distDir, "wasm"),
  { recursive: true }
);
console.log("wasm runtime: staged from node_modules");

for (const name of models) {
  await fetchModel(name);
}
console.log(`staged ${models.length} model(s) into dist/models`);
