import { useEffect, useRef, useState } from "react";
import { MAX_DEPLOYED_VIDEO_BYTES, predictVideoStream } from "../api";
import { buildSafetySummary, downloadBase64Video, isValidVideoFile } from "../utils/ppe";

const MAX_VIDEO_SIZE_MB = MAX_DEPLOYED_VIDEO_BYTES / (1024 * 1024);
const MAX_VIDEO_BYTES = MAX_DEPLOYED_VIDEO_BYTES;
const MAX_VIDEO_DURATION_SEC = 20;

function dataUriToBlobUrl(dataUri) {
  const [header, base64Data] = dataUri.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "video/mp4";
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export default function VideoMode() {
  const videoRef = useRef(null);
  const previewUrlRef = useRef("");
  const outputUrlRef = useRef("");

  const [videoFile, setVideoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      if (outputUrlRef.current) {
        URL.revokeObjectURL(outputUrlRef.current);
      }
    };
  }, []);

  const resetVideoState = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = "";
    }
    setVideoFile(null);
    setPreviewUrl("");
    setOutputUrl("");
    setDurationSec(null);
    setResult(null);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    resetVideoState();
    setError("");

    if (!file) {
      return;
    }

    if (!isValidVideoFile(file)) {
      setError("Invalid file type. Please upload a video file.");
      return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video is too large. Maximum file size is ${MAX_VIDEO_SIZE_MB} MB.`);
      return;
    }

    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setVideoFile(file);
    setPreviewUrl(url);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setDurationSec(video.duration);

    if (video.duration > MAX_VIDEO_DURATION_SEC) {
      setError(
        `Video is too long (${video.duration.toFixed(1)}s). Maximum duration is ${MAX_VIDEO_DURATION_SEC} seconds.`,
      );
    }
  };

  const handleAnalyze = async () => {
    if (!videoFile) {
      return;
    }

    setAnalyzing(true);
    setResult(null);
    setError("");
    setProgress({ processed: 0, total: 0 });

    try {
      const data = await predictVideoStream(
        videoFile,
        { conf: 0.25 },
        (processed, total) => setProgress({ processed, total }),
      );
      if (outputUrlRef.current) {
        URL.revokeObjectURL(outputUrlRef.current);
      }
      const blobUrl = dataUriToBlobUrl(data.output_video);
      outputUrlRef.current = blobUrl;
      setOutputUrl(blobUrl);
      setResult(data);
    } catch (err) {
      setError(err.message || "Video analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = () => {
    if (!result?.output_video || !videoFile) {
      return;
    }
    downloadBase64Video(result.output_video, `annotated_${videoFile.name}`);
  };

  const durationBlocked = durationSec !== null && durationSec > MAX_VIDEO_DURATION_SEC;

  const allDetections = result ? result.frames.flatMap((f) => f.detections) : [];
  const summary = result ? buildSafetySummary(allDetections) : null;

  return (
    <section className="mode-panel">
      <label className="upload-label">
        <span className="btn btn--primary">Choose video</span>
        <input type="file" accept="video/*" onChange={handleFileChange} hidden />
      </label>
      <p className="hint">
        Max file size: {MAX_VIDEO_SIZE_MB} MB. Max duration: {MAX_VIDEO_DURATION_SEC} seconds.
      </p>

      {error ? <div className="error-banner">{error}</div> : null}

      {previewUrl ? (
        <div className="video-preview">
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            onLoadedMetadata={handleLoadedMetadata}
          />
          {durationSec !== null ? (
            <p className="hint">Duration: {durationSec.toFixed(1)} seconds</p>
          ) : null}
        </div>
      ) : (
        <p className="empty-state">Upload a video to preview it here.</p>
      )}

      <div className="button-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleAnalyze}
          disabled={!videoFile || analyzing || durationBlocked}
        >
          {analyzing ? "Analyzing\u2026" : "Analyze Video"}
        </button>
      </div>

      {analyzing ? (
        <div className="video-progress">
          {progress.total > 0 ? (
            <>
              <div className="video-progress__track">
                <div
                  className="video-progress__fill"
                  style={{
                    width: `${Math.round((progress.processed / progress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="video-progress__label">
                Frame {progress.processed} of {progress.total}&ensp;&mdash;&ensp;
                {Math.round((progress.processed / progress.total) * 100)}%
              </p>
            </>
          ) : (
            <p className="progress-text">Uploading video&hellip;</p>
          )}
        </div>
      ) : null}

      {result ? (
        <div className="video-results">
          <div className="results-meta">
            <span>{result.frame_count} frames processed</span>
            <span>{result.fps} fps output</span>
            <span>{result.duration_sec}s source</span>
            <span>
              {result.video_width}&times;{result.video_height}
            </span>
            <span>{result.total_latency_ms} ms total</span>
          </div>

          {summary ? (
            <div className={`summary summary--${summary.type}`}>
              <p className="summary__title">Overall PPE summary</p>
              <p className="summary__disclaimer">{summary.message}</p>
            </div>
          ) : null}

          <div className="video-preview">
            <video src={outputUrl} controls />
          </div>

          <div className="button-row">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleDownload}
            >
              Download annotated video
            </button>
          </div>

          <details className="frame-results">
            <summary className="section-title">
              Frame-level detections ({result.frames.length} frames)
            </summary>
            {result.frames.map((frame) => {
              const frameSummary = buildSafetySummary(frame.detections);
              return (
                <article key={frame.frame_index} className="frame-card">
                  <div className="frame-card__header">
                    <strong>{frame.timestamp_sec}s</strong>
                    <span>
                      {frame.detections.length}{" "}
                      {frame.detections.length === 1 ? "detection" : "detections"}
                    </span>
                    <span className="hint">{frame.latency_ms} ms</span>
                  </div>
                  <p>{frameSummary.message}</p>
                </article>
              );
            })}
          </details>
        </div>
      ) : null}
    </section>
  );
}
