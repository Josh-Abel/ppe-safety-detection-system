const DEPLOYED_API_BASE_URL =
  "https://ppe-safety-api-987363068505.europe-west1.run.app";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? DEPLOYED_API_BASE_URL : "http://127.0.0.1:8000");

export const USES_CLOUD_DEPLOYED_API =
  import.meta.env.PROD || API_BASE_URL.includes("run.app");

// Cloud Run rejects request bodies above ~32 MB before they reach FastAPI (HTTP 413,
// often without CORS headers), which browsers surface as a generic network failure.
export const MAX_DEPLOYED_VIDEO_BYTES = 30 * 1024 * 1024;

function raiseIfNetworkError(error, hint) {
  if (error instanceof TypeError) {
    const localHint = import.meta.env.PROD
      ? hint ||
        "Check your connection, try a smaller upload, and confirm VITE_API_BASE_URL is set on Vercel."
      : "Start the API with: uvicorn app.main:app --reload";
    throw new Error(`Could not reach the backend. ${localHint}`);
  }
  throw error;
}

async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg || String(item)).join(", ");
    }
  } catch {
    // Ignore JSON parse errors and fall back to generic message.
  }
  return `Prediction request failed (HTTP ${response.status}).`;
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed (HTTP ${response.status}).`);
    }
    return response.json();
  } catch (error) {
    raiseIfNetworkError(error);
  }
}

function getFilenameFromUrl(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const name = pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(name || "remote-image.jpg");
  } catch {
    return "remote-image.jpg";
  }
}

export async function fetchImageFileFromUrl(imageUrl, maxBytes) {
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl.trim());
  } catch {
    throw new Error("Please enter a valid image URL (http or https).");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Image URL must start with http:// or https://.");
  }

  let response;
  try {
    response = await fetch(parsedUrl.href);
  } catch {
    throw new Error(
      "Could not fetch the image. The site may block cross-origin requests (CORS), or the URL may be unreachable.",
    );
  }

  if (!response.ok) {
    throw new Error(`Could not fetch the image (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const contentType = blob.type || "application/octet-stream";

  if (!contentType.startsWith("image/")) {
    throw new Error("URL does not point to a supported image file.");
  }

  if (maxBytes && blob.size > maxBytes) {
    throw new Error(
      `Remote image is too large (${(blob.size / (1024 * 1024)).toFixed(1)} MB).`,
    );
  }

  const filename = getFilenameFromUrl(parsedUrl.href);
  return new File([blob], filename, { type: contentType });
}

export async function predictVideoStream(file, { conf = 0.25 } = {}, onProgress) {
  if (import.meta.env.PROD && file.size > MAX_DEPLOYED_VIDEO_BYTES) {
    throw new Error(
      `Video is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). ` +
        `Maximum upload size on the deployed API is ${MAX_DEPLOYED_VIDEO_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({ conf: String(conf) });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/predict-video-stream?${params.toString()}`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    const tooLargeForCloudRun =
      import.meta.env.PROD && file.size > MAX_DEPLOYED_VIDEO_BYTES;
    raiseIfNetworkError(
      error,
      tooLargeForCloudRun
        ? `Videos must be under ${MAX_DEPLOYED_VIDEO_BYTES / (1024 * 1024)} MB on the deployed API (Cloud Run upload limit).`
        : undefined,
    );
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error("Model is not loaded on the server.");
    }
    throw new Error(await parseErrorResponse(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE messages are delimited by \n\n
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;

      const event = JSON.parse(dataLine.slice(6));

      if (event.type === "progress") {
        onProgress?.(event.processed, event.total);
      } else if (event.type === "done") {
        return event.result;
      } else if (event.type === "error") {
        throw new Error(event.message || "Video analysis failed.");
      }
    }
  }

  throw new Error("Stream ended without a result.");
}

export async function predictVideo(file, { conf = 0.25 } = {}) {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({ conf: String(conf) });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/predict-video?${params.toString()}`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    raiseIfNetworkError(error);
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error("Model is not loaded on the server.");
    }
    throw new Error(await parseErrorResponse(response));
  }

  return response.json();
}

export async function predictImage(file, { conf = 0.25, includeImage = true } = {}) {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({
    conf: String(conf),
    include_image: String(includeImage),
  });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/predict?${params.toString()}`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    raiseIfNetworkError(error);
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error("Model is not loaded on the server.");
    }
    throw new Error(await parseErrorResponse(response));
  }

  const data = await response.json();

  if (includeImage && !data.output_image) {
    throw new Error("Annotated image was not returned by the server.");
  }

  return data;
}
