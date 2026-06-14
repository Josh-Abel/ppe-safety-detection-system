import csv
from datetime import datetime, timezone
from pathlib import Path
import sys
from threading import Lock
from typing import Optional, Sequence

from app.schemas import Detection

LOG_DIR = Path(__file__).resolve().parent / "logging"
LOG_PATH = LOG_DIR / "predictions.csv"
LOW_CONFIDENCE_THRESHOLD = 0.5

FIELDNAMES = [
    "timestamp",
    "filename_input",
    "filename_output",
    "image_width",
    "image_height",
    "latency_ms",
    "num_detections",
    "detected_classes",
    "average_confidence",
    "low_confidence_flag",
]

_CSV_LOCK = Lock()


def write_prediction_log(
    filename_input: str,
    filename_output: Optional[str],
    image_width: int,
    image_height: int,
    latency_ms: int,
    detections: Sequence[Detection],
    low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD,
) -> None:
    confidences = [detection.confidence for detection in detections]
    average_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
    detected_classes = sorted({detection.class_name for detection in detections})
    low_confidence_flag = bool(confidences) and any(
        confidence < low_confidence_threshold for confidence in confidences
    )

    row = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "filename_input": filename_input,
        "filename_output": filename_output or "",
        "image_width": image_width,
        "image_height": image_height,
        "latency_ms": latency_ms,
        "num_detections": len(detections),
        "detected_classes": ";".join(detected_classes),
        "average_confidence": average_confidence,
        "low_confidence_flag": low_confidence_flag,
    }

    with _CSV_LOCK:
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            write_header = not LOG_PATH.exists() or LOG_PATH.stat().st_size == 0
            with LOG_PATH.open("a", newline="") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
                if write_header:
                    writer.writeheader()
                writer.writerow(row)
        except OSError as exc:
            print(f"Warning: prediction log was not written: {exc}", file=sys.stderr)
