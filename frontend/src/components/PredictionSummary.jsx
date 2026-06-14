import { buildSafetySummary } from "../utils/ppe";

export default function PredictionSummary({ prediction }) {
  if (!prediction) {
    return null;
  }

  const { detections, latency_ms, image_width, image_height } = prediction;
  const summary = buildSafetySummary(detections);

  return (
    <div className={`summary summary--${summary.type}`}>
      <p className="summary__title">Prediction summary</p>
      <ul className="summary__list">
        <li>
          <strong>Detections:</strong> {detections.length}
        </li>
        <li>
          <strong>Safety summary:</strong> {summary.message}
        </li>
        <li>
          <strong>Latency:</strong> {latency_ms} ms
        </li>
        {image_width && image_height ? (
          <li>
            <strong>Dimensions:</strong> {image_width} x {image_height}
          </li>
        ) : null}
      </ul>
      <p className="summary__disclaimer">
        Prototype demo only — not a real safety compliance system.
      </p>
    </div>
  );
}
