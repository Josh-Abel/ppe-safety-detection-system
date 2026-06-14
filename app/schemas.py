from typing import List, Optional, Tuple

from pydantic import BaseModel


class Detection(BaseModel):
    class_name: str
    confidence: float
    bbox: Tuple[int, int, int, int]


class PredictionResponse(BaseModel):
    detections: List[Detection]
    latency_ms: int
    image_width: int
    image_height: int
    output_image: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


class VideoFrameResult(BaseModel):
    frame_index: int
    timestamp_sec: float
    detections: List[Detection]
    latency_ms: int


class VideoPredictionResponse(BaseModel):
    frame_count: int
    fps: float
    duration_sec: float
    video_width: int
    video_height: int
    frames: List[VideoFrameResult]
    output_video: Optional[str] = None
    total_latency_ms: int
