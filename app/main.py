from __future__ import annotations

import asyncio
import json
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.inference import DEFAULT_MODEL_PATH, load_model, predict_bytes, predict_video_bytes
from app.schemas import HealthResponse, PredictionResponse, VideoPredictionResponse

MODEL_PATH = os.getenv("PPE_MODEL_PATH", DEFAULT_MODEL_PATH)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "https://ppe-safety-detection-system-mu.vercel.app"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app = FastAPI(title="PPE Safety Detector API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
model = None


@app.on_event("startup")
def startup() -> None:
    global model
    model = load_model(MODEL_PATH)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=model is not None)


@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...), conf: float = 0.25, include_image: bool = True) -> PredictionResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    try:
        response, _ = predict_bytes(
            model,
            await file.read(),
            conf=conf,
            include_image=include_image,
            filename_input=file.filename or "uploaded image",
        )
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


_MAX_VIDEO_BYTES = 30 * 1024 * 1024  # 30 MB (Cloud Run request limit is ~32 MB)


@app.post("/predict-video", response_model=VideoPredictionResponse)
async def predict_video(
    file: UploadFile = File(...),
    conf: float = 0.25,
) -> VideoPredictionResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    video_bytes = await file.read()

    if len(video_bytes) > _MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Video file too large. Maximum size is {_MAX_VIDEO_BYTES // (1024 * 1024)} MB.",
        )

    try:
        response, _ = predict_video_bytes(
            model,
            video_bytes,
            conf=conf,
            filename_input=file.filename or "uploaded video",
        )
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/predict-video-stream")
async def predict_video_stream(
    file: UploadFile = File(...),
    conf: float = 0.25,
) -> StreamingResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    video_bytes = await file.read()

    if len(video_bytes) > _MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Video file too large. Maximum size is {_MAX_VIDEO_BYTES // (1024 * 1024)} MB.",
        )

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def progress_callback(processed: int, total: int) -> None:
        loop.call_soon_threadsafe(
            queue.put_nowait,
            {"type": "progress", "processed": processed, "total": total},
        )

    async def run_inference() -> None:
        try:
            result, _ = await loop.run_in_executor(
                None,
                lambda: predict_video_bytes(
                    model,
                    video_bytes,
                    conf=conf,
                    filename_input=file.filename or "uploaded video",
                    progress_callback=progress_callback,
                ),
            )
            payload = result.model_dump() if hasattr(result, "model_dump") else result.dict()
            await queue.put({"type": "done", "result": payload})
        except Exception as exc:  # noqa: BLE001
            await queue.put({"type": "error", "message": str(exc)})

    async def event_stream():
        asyncio.create_task(run_inference())
        while True:
            event = await queue.get()
            yield f"data: {json.dumps(event)}\n\n"
            if event["type"] in ("done", "error"):
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
