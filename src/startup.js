/**
 * The startup panel: what the app shows before it can draw anything.
 *
 * Nothing appears on screen until the camera is live and the pose model has
 * downloaded, which on a phone is several seconds and several megabytes. With
 * no indicator that wait is a blank screen, and — worse — a failure is
 * indistinguishable from a slow load. This makes both legible, and reports the
 * actual reason when it fails rather than leaving someone guessing.
 */
export class Startup {
  constructor() {
    this.root = document.getElementById("startup");
    this.message = document.getElementById("startup-message");
    this.detail = document.getElementById("startup-detail");
    this.track = document.getElementById("startup-track");
    this.bar = document.getElementById("startup-bar");
    this.retry = document.getElementById("startup-retry");
    this.track.hidden = true;
  }

  /** Names the step in progress. Clears any bar left over from a prior step. */
  stage(message, detail = "") {
    this.root.hidden = false;
    this.root.classList.remove("failed");
    this.retry.hidden = true;
    this.message.textContent = message;
    this.detail.textContent = detail;
    this.track.hidden = true;
    this.bar.style.width = "0%";
  }

  /**
   * @param fraction 0..1, or null when the server sends no content-length and
   *   the total is therefore unknown.
   */
  progress(fraction, detail = "") {
    if (fraction == null) {
      this.track.hidden = true;
    } else {
      this.track.hidden = false;
      this.bar.style.width = `${Math.round(fraction * 100)}%`;
    }
    if (detail) {
      this.detail.textContent = detail;
    }
  }

  fail(error) {
    this.root.hidden = false;
    this.root.classList.add("failed");
    this.track.hidden = true;
    const { message, detail } = describe(error);
    this.message.textContent = message;
    this.detail.textContent = detail;
    this.retry.hidden = false;
    // The underlying error still goes to the console for anyone debugging.
    console.error("startup failed:", error);
  }

  done() {
    this.root.hidden = true;
  }

  onRetry(handler) {
    this.retry.addEventListener("click", handler);
  }
}

/**
 * Turns a thrown error into something worth reading. A raw "Failed to fetch"
 * tells the person nothing they can act on.
 */
function describe(error) {
  const raw = String((error && error.message) || error);

  if (error && error.name === "NotAllowedError") {
    return {
      message: "Camera permission denied",
      detail:
        "Allow camera access for this site in your browser settings, then try again.",
    };
  }
  if (error && error.name === "NotFoundError") {
    return {
      message: "No camera found",
      detail: "This device reported no usable camera.",
    };
  }
  if (raw.includes("getUserMedia not available")) {
    return {
      message: "Camera unavailable",
      detail:
        "The camera needs a secure context. Open the app over HTTPS or on localhost.",
    };
  }
  if (raw.includes("model") || raw.includes("wasm") || raw.includes("404")) {
    return {
      message: "Could not load the pose model",
      detail:
        `${raw}. The model and Wasm runtime are staged into dist/ at build ` +
        "time; if this is a deployment, check that the build ran the asset step.",
    };
  }
  return { message: "Something went wrong starting up", detail: raw };
}

/**
 * Downloads a file, reporting progress as it goes.
 *
 * MediaPipe can take the model as a path, but then the download is opaque and
 * the biggest part of the wait has no feedback. Fetching it here buys a real
 * percentage; the bytes are handed over as `modelAssetBuffer`.
 */
export async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  // No streaming body (or no length): fall back to an opaque wait rather than
  // reporting a percentage that would be a guess.
  if (!response.body) {
    onProgress(null, 0, total);
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.length;
    onProgress(total ? received / total : null, received, total);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Reports progress for a download the app does not itself issue.
 *
 * The Wasm runtime is ~11MB — larger than the model — but MediaPipe fetches it
 * internally while building the detector, so there is no call to wrap. Without
 * this, the single biggest download in startup happens behind a motionless
 * label. Patching fetch for the duration lets the bytes be counted as they pass
 * through, without downloading anything twice.
 *
 * Degrades safely: if the runtime is ever loaded by some means other than
 * fetch, the wrapper simply never fires and the stage stays indeterminate.
 *
 * @return A function that restores the original fetch.
 */
export function trackFetchProgress(urlFragment, onProgress) {
  const original = window.fetch;
  if (typeof original !== "function") {
    return () => {};
  }

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input && input.url;
    const response = await original(input, init);
    if (!url || !url.includes(urlFragment) || !response.body) {
      return response;
    }

    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    let received = 0;

    const counted = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.length;
        onProgress(total ? received / total : null, received, total);
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    // Headers are carried over so the content type still says application/wasm
    // and streaming compilation is not lost.
    return new Response(counted, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };

  return () => {
    window.fetch = original;
  };
}

export function formatMB(bytes) {
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
