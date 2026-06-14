import { useCallback, useEffect, useRef, useState } from "react";
import { predictImage } from "../api";
import DetectionsTable from "./DetectionsTable";
import PredictionSummary from "./PredictionSummary";

// Minimum pause between the end of one request and the start of the next.
// Keeps the loop as fast as the backend allows without hammering it.
const MIN_LOOP_PAUSE_MS = 100;

// Cap captured frame width to the YOLO input size — no quality loss, smaller payload.
const CAPTURE_MAX_WIDTH = 640;

export default function LiveMode() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectingRef = useRef(false); // drives the async loop

  const [cameraActive, setCameraActive] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [annotatedImage, setAnnotatedImage] = useState("");
  const [error, setError] = useState("");

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    setDetecting(false);
    setAnnotatedImage("");
    setPrediction(null);
  }, []);

  const stopCamera = useCallback(() => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, [stopDetection]);

  useEffect(() => {
    if (!cameraActive || !streamRef.current || !videoRef.current) {
      return undefined;
    }

    const video = videoRef.current;
    video.srcObject = streamRef.current;

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Autoplay can fail silently in some browsers; the stream is still attached.
      });
    }

    return undefined;
  }, [cameraActive]);

  useEffect(() => {
    const handleBeforeUnload = () => stopCamera();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopCamera();
    };
  }, [stopCamera]);

  // Continuous detection loop: fires the next request immediately after the
  // previous one finishes, so throughput is bounded only by backend latency.
  const runDetectionLoop = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    while (detectingRef.current) {
      if (video.readyState < 2) {
        // Video not ready yet — wait a tick and retry.
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }

      const startTime = Date.now();

      try {
        // Scale down to CAPTURE_MAX_WIDTH to reduce payload without losing detection quality.
        const scale = Math.min(1, CAPTURE_MAX_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (!result) {
                reject(new Error("Could not capture webcam frame."));
                return;
              }
              resolve(result);
            },
            "image/jpeg",
            0.75,
          );
        });

        if (!detectingRef.current) {
          break;
        }

        const frameFile = new File([blob], "webcam_frame.jpg", { type: "image/jpeg" });
        const result = await predictImage(frameFile, { conf: 0.25, includeImage: true });

        if (detectingRef.current) {
          setPrediction(result);
          setAnnotatedImage(result.output_image || "");
          setError("");
        }
      } catch (predictionError) {
        if (detectingRef.current) {
          setError(predictionError.message || "Live prediction failed.");
        }
      }

      // Brief pause so the browser can render and avoid a tight spin loop.
      const elapsed = Date.now() - startTime;
      const pause = Math.max(0, MIN_LOOP_PAUSE_MS - elapsed);
      if (pause > 0) {
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
    }
  }, []);

  const startCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (cameraError) {
      if (cameraError.name === "NotAllowedError") {
        setError(
          "Camera permission denied. Allow camera access in your browser settings and try again.",
        );
      } else {
        setError(cameraError.message || "Could not start camera.");
      }
    }
  };

  const startDetection = () => {
    if (!cameraActive) {
      return;
    }
    detectingRef.current = true;
    setDetecting(true);
    runDetectionLoop();
  };

  const showAnnotatedOverlay = detecting && Boolean(annotatedImage);

  return (
    <section className="mode-panel">
      <p className="hint">
        Live mode runs back-to-back predictions as fast as the backend allows.
        Speed depends on your hardware and backend latency.
      </p>

      <div className="button-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={startCamera}
          disabled={cameraActive}
        >
          Start Camera
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={stopCamera}
          disabled={!cameraActive}
        >
          Stop Camera
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={startDetection}
          disabled={!cameraActive || detecting}
        >
          Start Detection
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={stopDetection}
          disabled={!detecting}
        >
          Stop Detection
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <figure className="live-viewport">
        <figcaption>Live camera</figcaption>
        <div className="live-viewport__frame">
          <video
            ref={videoRef}
            className={`live-viewport__video ${
              !cameraActive ? "live-viewport__video--inactive" : ""
            } ${showAnnotatedOverlay ? "live-viewport__video--capture-only" : ""}`}
            playsInline
            muted
            autoPlay
          />
          {!cameraActive ? (
            <div className="live-viewport__placeholder image-placeholder">
              Start the camera to see your live feed.
            </div>
          ) : null}
          {showAnnotatedOverlay ? (
            <img
              src={annotatedImage}
              alt="Live detection with bounding boxes"
              className="live-viewport__annotated"
            />
          ) : null}
          {detecting && !annotatedImage ? (
            <div className="live-viewport__status">Running detection...</div>
          ) : null}
        </div>
      </figure>

      <canvas ref={canvasRef} hidden />

      {prediction && detecting ? (
        <>
          <PredictionSummary prediction={prediction} />
          <h4 className="section-title">Latest detections</h4>
          <DetectionsTable detections={prediction.detections} />
        </>
      ) : null}
    </section>
  );
}
