from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

DEFAULT_MODEL_PATH = "models/baseline_weights/best.pt"

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run PPE YOLO inference on an image, folder, or live camera feed.")
    parser.add_argument("--weights", default=DEFAULT_MODEL_PATH, help="Path to YOLO weights file.")
    parser.add_argument("--source", required=True, help="Image path, image folder, or camera index such as 0.")
    parser.add_argument("--output", default=None, help="Optional directory for annotated output images.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold.")
    parser.add_argument("--display", action="store_true", help="Display annotated predictions for debugging.")
    parser.add_argument("--include-image", action="store_true", help="Include base64 annotated image data in JSON output.")
    return parser.parse_args()


def _is_camera_source(source: str) -> bool:
    return source.isdigit()


def _model_to_dict(model) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _prediction_to_dict(prediction, source: str, output_image_path: str | None = None) -> dict:
    payload = _model_to_dict(prediction)
    if not payload.get("output_image"):
        payload.pop("output_image", None)
    payload["source"] = source
    if output_image_path is not None:
        payload["output_image_path"] = output_image_path
    return payload


def run_image_sources(args: argparse.Namespace) -> list[dict]:
    import cv2

    from app.inference import discover_images, load_model, predict_path

    model = load_model(args.weights)
    output_dir = Path(args.output) if args.output else None
    predictions: list[dict] = []

    for image_path in discover_images(args.source):
        response, annotated = predict_path(
            model=model,
            image_path=image_path,
            conf=args.conf,
            include_image=args.include_image,
            output_dir=output_dir,
        )
        output_image_path = str(output_dir / image_path.name) if output_dir is not None else None
        predictions.append(_prediction_to_dict(response, str(image_path), output_image_path))

        if args.display:
            cv2.imshow("PPE Safety Detector", annotated)
            cv2.waitKey(0)

    if args.display:
        cv2.destroyAllWindows()

    return predictions


def run_camera(args: argparse.Namespace) -> None:
    import cv2

    from app.inference import load_model, predict_image

    model = load_model(args.weights)
    capture = cv2.VideoCapture(int(args.source))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open camera source: {args.source}")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            response, annotated = predict_image(
                model,
                frame,
                conf=args.conf,
                include_image=args.include_image,
                filename_input="live video",
            )
            print(json.dumps(_prediction_to_dict(response, f"camera:{args.source}")), flush=True)

            if args.display:
                cv2.imshow("PPE Safety Detector", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            else:
                break
    finally:
        capture.release()
        if args.display:
            cv2.destroyAllWindows()


def main() -> None:
    args = parse_args()

    if _is_camera_source(args.source):
        run_camera(args)
        return

    predictions = run_image_sources(args)
    payload = predictions[0] if len(predictions) == 1 else {"predictions": predictions}
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
