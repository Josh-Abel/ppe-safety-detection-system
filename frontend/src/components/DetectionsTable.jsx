import { sortDetections } from "../utils/ppe";

export default function DetectionsTable({ detections }) {
  if (!detections || detections.length === 0) {
    return <p className="empty-state">No objects detected.</p>;
  }

  const sortedDetections = sortDetections(detections);

  return (
    <div className="table-wrap">
      <table className="detections-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Confidence</th>
            <th>Bounding box</th>
          </tr>
        </thead>
        <tbody>
          {sortedDetections.map((detection, index) => (
            <tr key={`${detection.class_name}-${detection.confidence}-${index}`}>
              <td>{detection.class_name}</td>
              <td>{detection.confidence.toFixed(2)}</td>
              <td>
                [{detection.bbox.join(", ")}]
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
