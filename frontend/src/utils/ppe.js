export const EXPECTED_PPE = ["helmet", "vest", "gloves", "pants"];

export const SUMMARY_TYPES = {
  NONE: "none",
  COMPLETE: "complete",
  PARTIAL: "partial",
};

export function buildSafetySummary(detections) {
  if (!detections || detections.length === 0) {
    return {
      type: SUMMARY_TYPES.NONE,
      message:
        "No PPE detected. Image may be unclear or no worker/PPE is visible.",
    };
  }

  const detectedClasses = new Set(
    detections.map((detection) => detection.class_name.toLowerCase()),
  );
  const missing = EXPECTED_PPE.filter((ppeClass) => !detectedClasses.has(ppeClass));

  if (missing.length === 0) {
    return {
      type: SUMMARY_TYPES.COMPLETE,
      message: "All expected PPE detected.",
    };
  }

  return {
    type: SUMMARY_TYPES.PARTIAL,
    message: `Missing or not detected: ${missing.join(", ")}.`,
  };
}

export function downloadBase64Video(dataUri, filename) {
  const [header, base64Data] = dataUri.split(",");
  if (!base64Data) {
    throw new Error("Invalid video data.");
  }

  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "video/mp4";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadBase64Image(dataUri, filename) {
  const [header, base64Data] = dataUri.split(",");
  if (!base64Data) {
    throw new Error("Invalid image data.");
  }

  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getAnnotatedFilename(originalName) {
  const baseName = originalName.replace(/\.[^/.]+$/, "") || "image";
  return `annotated_${baseName}.jpg`;
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"];

export function isValidImageFile(file) {
  if (!file) {
    return false;
  }

  if (file.type && file.type.startsWith("image/")) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function sortDetections(detections) {
  if (!detections || detections.length === 0) {
    return [];
  }

  return [...detections].sort((left, right) => {
    const classCompare = left.class_name.localeCompare(right.class_name);
    if (classCompare !== 0) {
      return classCompare;
    }
    return right.confidence - left.confidence;
  });
}

export function isValidVideoFile(file) {
  if (!file) {
    return false;
  }

  if (file.type && file.type.startsWith("video/")) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return [".mp4", ".webm", ".mov", ".avi", ".mkv"].some((extension) =>
    lowerName.endsWith(extension),
  );
}
