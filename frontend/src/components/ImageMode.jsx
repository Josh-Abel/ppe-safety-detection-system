import { useEffect, useRef, useState } from "react";
import { fetchImageFileFromUrl, predictImage } from "../api";
import { isValidImageFile } from "../utils/ppe";
import ImageResultCard from "./ImageResultCard";

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export default function ImageMode() {
  const [results, setResults] = useState([]);
  const [globalError, setGlobalError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const objectUrlsRef = useRef([]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateResult = (id, patch) => {
    setResults((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const runPredictions = async (newResults) => {
    setResults((current) => [...newResults, ...current]);

    await Promise.all(
      newResults.map(async (item) => {
        try {
          const prediction = await predictImage(item.file, {
            conf: 0.25,
            includeImage: true,
          });
          updateResult(item.id, { prediction, loading: false, error: "" });
        } catch (error) {
          updateResult(item.id, {
            loading: false,
            error: error.message || "Prediction request failed.",
          });
        }
      }),
    );
  };

  const createResultItems = (files) =>
    files.map((file) => {
      const originalUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(originalUrl);
      return {
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        filename: file.name,
        file,
        originalUrl,
        prediction: null,
        loading: true,
        error: "",
      };
    });

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    setGlobalError("");

    const validFiles = [];
    for (const file of files) {
      if (!isValidImageFile(file)) {
        setGlobalError(`Invalid file type: ${file.name}. Please upload an image file.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setGlobalError(
          `${file.name} is too large. Maximum image size is ${MAX_IMAGE_SIZE_MB} MB.`,
        );
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    await runPredictions(createResultItems(validFiles));
  };

  const handleUrlSubmit = async (event) => {
    event.preventDefault();

    const trimmedUrl = imageUrl.trim();
    if (!trimmedUrl) {
      setGlobalError("Please enter an image URL.");
      return;
    }

    setGlobalError("");
    setUrlLoading(true);

    try {
      const file = await fetchImageFileFromUrl(trimmedUrl, MAX_IMAGE_BYTES);
      await runPredictions(createResultItems([file]));
      setImageUrl("");
    } catch (error) {
      setGlobalError(error.message || "Could not load image from URL.");
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <section className="mode-panel">
      <p className="mode-note">
        This is a prototype demo, not a real safety compliance system.
      </p>

      <label className="upload-label">
        <span className="btn btn--primary">Choose image(s)</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          hidden
        />
      </label>
      <p className="hint">
        Upload one or more images (max {MAX_IMAGE_SIZE_MB} MB each). Supported formats
        include JPG, PNG, WEBP, and BMP.
      </p>

      <form className="url-form" onSubmit={handleUrlSubmit}>
        <label className="url-form__label" htmlFor="image-url">
          Or paste an image URL
        </label>
        <div className="url-form__row">
          <input
            id="image-url"
            type="url"
            className="url-form__input"
            placeholder="https://example.com/worker.jpg"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            disabled={urlLoading}
          />
          <button
            type="submit"
            className="btn btn--secondary"
            disabled={urlLoading || !imageUrl.trim()}
          >
            {urlLoading ? "Loading..." : "Load from URL"}
          </button>
        </div>
        <p className="hint">
          The remote site must allow browser access (CORS). If loading fails, download
          the image and upload it locally instead.
        </p>
      </form>

      {globalError ? <div className="error-banner">{globalError}</div> : null}

      <div className="results-grid">
        {results.length === 0 ? (
          <p className="empty-state">
            Upload an image or load one from a URL to run PPE detection.
          </p>
        ) : (
          results.map((result) => (
            <ImageResultCard
              key={result.id}
              filename={result.filename}
              originalUrl={result.originalUrl}
              prediction={result.prediction}
              loading={result.loading}
              error={result.error}
            />
          ))
        )}
      </div>
    </section>
  );
}
