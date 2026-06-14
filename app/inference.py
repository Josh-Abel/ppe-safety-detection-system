from __future__ import annotations

import base64
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
from ultralytics import YOLO

from app.prediction_logger import write_prediction_log
from app.schemas import Detection, PredictionResponse, VideoFrameResult, VideoPredictionResponse

IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
DEFAULT_MODEL_PATH = "models/baseline_weights/best.pt"

# Cloud Run serves one model instance for all requests. Ultralytics fuses Conv+BN on
# first predict; concurrent first-use races can raise AttributeError: 'Conv' has no 'bn'.
_INFERENCE_LOCK = threading.Lock()


def _run_predict(model: YOLO, source: Any, conf: float) -> list[Any]:
    with _INFERENCE_LOCK:
        return model.predict(source=source, conf=conf, verbose=False)


def load_model(weights_path: str | Path = DEFAULT_MODEL_PATH) -> YOLO:
    model = YOLO(str(weights_path))
    with _INFERENCE_LOCK:
        if hasattr(model.model, "fuse") and not model.model.is_fused():
            model.model.fuse()
        # Warm up predictor initialization before concurrent traffic arrives.
        warmup = np.zeros((640, 640, 3), dtype=np.uint8)
        model.predict(source=warmup, conf=0.25, verbose=False)
    return model


def read_image(image_path: str | Path) -> np.ndarray:
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")
    return image


def read_image_bytes(image_bytes: bytes) -> np.ndarray:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode uploaded image bytes")
    return image


def encode_image_base64(image: np.ndarray, image_format: str = ".jpg") -> str:
    ok, buffer = cv2.imencode(image_format, image)
    if not ok:
        raise ValueError("Could not encode output image")
    mime_type = "image/png" if image_format.lower() == ".png" else "image/jpeg"
    payload = base64.b64encode(buffer).decode("utf-8")
    return f"data:{mime_type};base64,{payload}"


def discover_images(source: str | Path) -> list[Path]:
    path = Path(source)
    if path.is_file():
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image extension: {path.suffix}")
        return [path]
    if path.is_dir():
        images = sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)
        if not images:
            raise ValueError(f"No supported image files found in: {path}")
        return images
    raise ValueError(f"Source is not an image file or directory: {source}")


def _detections_from_result(result: Any) -> list[Detection]:
    detections: list[Detection] = []
    names = result.names

    if result.boxes is None:
        return detections

    for box in result.boxes:
        class_id = int(box.cls[0].item())
        confidence = float(box.conf[0].item())
        xyxy = box.xyxy[0].tolist()
        bbox = [int(round(value)) for value in xyxy]
        detections.append(
            Detection(
                class_name=str(names.get(class_id, class_id)),
                confidence=round(confidence, 4),
                bbox=bbox,
            )
        )

    return detections


def predict_image(
    model: YOLO,
    image: np.ndarray,
    conf: float = 0.25,
    include_image: bool = True,
    save_path: str | Path | None = None,
    filename_input: str = "",
    log_prediction: bool = True,
) -> tuple[PredictionResponse, np.ndarray]:
    start = time.perf_counter()
    results = _run_predict(model, image, conf)
    latency_ms = int(round((time.perf_counter() - start) * 1000))

    result = results[0]
    annotated = result.plot()
    image_height, image_width = image.shape[:2]

    filename_output = None
    if save_path is not None:
        output_path = Path(save_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(output_path), annotated):
            raise ValueError(f"Could not write output image: {output_path}")
        filename_output = str(output_path)

    output_image = encode_image_base64(annotated) if include_image else None
    detections = _detections_from_result(result)
    response = PredictionResponse(
        detections=detections,
        latency_ms=latency_ms,
        image_width=image_width,
        image_height=image_height,
        output_image=output_image,
    )
    if log_prediction:
        write_prediction_log(
            filename_input=filename_input,
            filename_output=filename_output,
            image_width=image_width,
            image_height=image_height,
            latency_ms=latency_ms,
            detections=detections,
        )
    return response, annotated


def predict_path(
    model: YOLO,
    image_path: str | Path,
    conf: float = 0.25,
    include_image: bool = True,
    output_dir: str | Path | None = None,
    log_prediction: bool = True,
) -> tuple[PredictionResponse, np.ndarray]:
    image = read_image(image_path)
    save_path = None
    if output_dir is not None:
        save_path = Path(output_dir) / Path(image_path).name
    return predict_image(
        model,
        image,
        conf=conf,
        include_image=include_image,
        save_path=save_path,
        filename_input=str(image_path),
        log_prediction=log_prediction,
    )


def predict_bytes(
    model: YOLO,
    image_bytes: bytes,
    conf: float = 0.25,
    include_image: bool = True,
    filename_input: str = "uploaded image",
    log_prediction: bool = True,
) -> tuple[PredictionResponse, np.ndarray]:
    image = read_image_bytes(image_bytes)
    return predict_image(
        model,
        image,
        conf=conf,
        include_image=include_image,
        filename_input=filename_input,
        log_prediction=log_prediction,
    )


# Maximum frames processed per video request (caps CPU time regardless of source FPS).
_VIDEO_MAX_FRAMES = 160
# Target inference rate; source frames are skipped to stay at or below this.
_VIDEO_TARGET_FPS = 8.0


def _has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def _transcode_to_h264(input_path: str, output_path: str) -> None:
    """Re-encode a video to H.264 MP4 using ffmpeg."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", input_path,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "28",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path,
        ],
        check=True,
        capture_output=True,
    )


def predict_video_bytes(
    model: YOLO,
    video_bytes: bytes,
    conf: float = 0.25,
    filename_input: str = "uploaded video",
    progress_callback: "Callable[[int, int], None] | None" = None,
) -> tuple[VideoPredictionResponse, bytes]:
    import os
    import tempfile

    tmp_in_path: str | None = None
    tmp_out_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in:
            tmp_in.write(video_bytes)
            tmp_in_path = tmp_in.name

        cap = cv2.VideoCapture(tmp_in_path)
        if not cap.isOpened():
            raise ValueError("Could not open the uploaded video file.")

        original_fps: float = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width: int = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height: int = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames: int = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec: float = total_frames / original_fps if original_fps > 0 else 0.0

        # Skip every N source frames so inference runs at ≤ _VIDEO_TARGET_FPS.
        frame_step: int = max(1, round(original_fps / _VIDEO_TARGET_FPS))
        output_fps: float = original_fps / frame_step

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_out:
            tmp_out_path = tmp_out.name

        # Prefer avc1 (H.264) — the only codec browsers can play inline.
        # Fall back to mp4v if the local OpenCV build doesn't support avc1;
        # we'll transcode with ffmpeg afterward in that case.
        fourcc_h264 = cv2.VideoWriter_fourcc(*"avc1")
        writer = cv2.VideoWriter(tmp_out_path, fourcc_h264, output_fps, (width, height))
        used_h264 = writer.isOpened()
        if not used_h264:
            writer.release()
            fourcc_mp4v = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(tmp_out_path, fourcc_mp4v, output_fps, (width, height))

        # Best-effort estimate of how many frames will be processed.
        total_to_process: int = (
            min(_VIDEO_MAX_FRAMES, (total_frames + frame_step - 1) // frame_step)
            if total_frames > 0
            else 0
        )

        frame_results: list[VideoFrameResult] = []
        source_frame_idx: int = 0
        processed: int = 0
        t_start = time.perf_counter()

        while processed < _VIDEO_MAX_FRAMES:
            ok, frame = cap.read()
            if not ok:
                break

            if source_frame_idx % frame_step == 0:
                t_frame = time.perf_counter()
                results = _run_predict(model, frame, conf)
                latency_ms = int(round((time.perf_counter() - t_frame) * 1000))

                result = results[0]
                annotated = result.plot()
                writer.write(annotated)

                detections = _detections_from_result(result)
                frame_results.append(
                    VideoFrameResult(
                        frame_index=source_frame_idx,
                        timestamp_sec=round(source_frame_idx / original_fps, 3),
                        detections=detections,
                        latency_ms=latency_ms,
                    )
                )
                processed += 1
                if progress_callback is not None:
                    progress_callback(processed, total_to_process)

            source_frame_idx += 1

        total_latency_ms = int(round((time.perf_counter() - t_start) * 1000))
        cap.release()
        writer.release()

        # If avc1 wasn't available and ffmpeg is installed, transcode to H.264
        # so the browser can play the result inline.
        if not used_h264 and _has_ffmpeg():
            transcoded_path = tmp_out_path + "_h264.mp4"
            try:
                _transcode_to_h264(tmp_out_path, transcoded_path)
                os.unlink(tmp_out_path)
                tmp_out_path = transcoded_path
            except subprocess.CalledProcessError:
                pass  # keep mp4v output as last resort

        with open(tmp_out_path, "rb") as fh:
            out_bytes = fh.read()

        output_video = "data:video/mp4;base64," + base64.b64encode(out_bytes).decode()

        response = VideoPredictionResponse(
            frame_count=len(frame_results),
            fps=round(output_fps, 2),
            duration_sec=round(duration_sec, 2),
            video_width=width,
            video_height=height,
            frames=frame_results,
            output_video=output_video,
            total_latency_ms=total_latency_ms,
        )
        return response, out_bytes

    finally:
        if tmp_in_path and os.path.exists(tmp_in_path):
            os.unlink(tmp_in_path)
        if tmp_out_path and os.path.exists(tmp_out_path):
            os.unlink(tmp_out_path)
        # Clean up transcoded file if it was created but not yet renamed.
        transcoded = (tmp_out_path or "") + "_h264.mp4"
        if os.path.exists(transcoded):
            os.unlink(transcoded)
