import { downloadBase64Image, getAnnotatedFilename } from "../utils/ppe";
import { USES_CLOUD_DEPLOYED_API } from "../api";
import DetectionsTable from "./DetectionsTable";
import PredictionSummary from "./PredictionSummary";

export default function ImageResultCard({
  filename,
  originalUrl,
  prediction,
  loading,
  error,
}) {
  const handleDownload = () => {
    if (!prediction?.output_image) {
      return;
    }
    downloadBase64Image(
      prediction.output_image,
      getAnnotatedFilename(filename),
    );
  };

  return (
    <article className="result-card">
      <header className="result-card__header">
        <h3>{filename}</h3>
        {loading ? <span className="badge badge--loading">Processing&hellip;</span> : null}
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="image-pair">
        <figure className="image-panel">
          <figcaption>Original</figcaption>
          <img src={originalUrl} alt={`Original ${filename}`} />
        </figure>
        <figure className="image-panel">
          <figcaption>Annotated</figcaption>
          {prediction?.output_image ? (
            <img src={prediction.output_image} alt={`Annotated ${filename}`} />
          ) : (
            <div className="image-placeholder">
              {loading
                ? USES_CLOUD_DEPLOYED_API
                  ? "Waiting on GCP model (this may take a few seconds)\u2026"
                  : "Running prediction\u2026"
                : "Annotated image not available."}
            </div>
          )}
        </figure>
      </div>

      {prediction ? (
        <>
          <PredictionSummary prediction={prediction} />
          <h4 className="section-title">Detected objects</h4>
          <DetectionsTable detections={prediction.detections} />
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleDownload}
            disabled={!prediction.output_image}
          >
            Download annotated image
          </button>
        </>
      ) : null}
    </article>
  );
}
