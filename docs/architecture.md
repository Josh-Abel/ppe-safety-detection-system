# System Architecture

This project is an end-to-end computer vision service for detecting personal protective equipment (PPE) in worksite images. It spans offline model development, a production-style inference API, a browser demo, and Docker-based deployment.

## System overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Development layer                        │
│  notebooks · training scripts · evaluation · saved weights      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Inference service (backend)                 │
│  FastAPI · YOLOv11n · prediction logging                        │
│  Runs locally (uvicorn) or inside Docker (ppe-safety-api)       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST / SSE
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Demo client (frontend)                      │
│  React + Vite · Image Mode · Video Mode · Live Camera Mode    │
└─────────────────────────────────────────────────────────────────┘
```

## Current components

### 1. Model development

* Dataset inspection and EDA notebooks (`notebooks/ppe_dataset_eda.ipynb`)
* YOLOv11n baseline training and evaluation
* Saved baseline weights at `models/baseline_weights/best.pt`
* Reproducible experiment artifacts under `experiments/yolov11n_baseline/`

### 2. Backend (FastAPI)

The backend lives in `app/` and serves the trained YOLO model over HTTP.

| Module | Role |
|---|---|
| `app/main.py` | FastAPI app, CORS, route handlers |
| `app/inference.py` | Model loading, image/video inference, annotation |
| `app/schemas.py` | Pydantic request/response models |
| `app/prediction_logger.py` | Appends prediction metadata to CSV |
| `app/logging/predictions.csv` | Observability log |

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Service and model-load status |
| `POST` | `/predict` | Single-image inference |
| `POST` | `/predict-video` | Full video inference (annotated MP4 + per-frame detections) |
| `POST` | `/predict-video-stream` | Same as above, with SSE progress events |

The model is loaded once at startup from `PPE_MODEL_PATH` (defaults to `models/baseline_weights/best.pt`). Image and video uploads are decoded in memory, passed to YOLO, and returned as structured JSON (with optional base64-encoded annotated media).

### 3. Frontend (React + Vite)

The demo UI lives in `frontend/` and talks to the backend via `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`).

| Component | Mode | Backend endpoint |
|---|---|---|
| `ImageMode.jsx` | Image upload / URL | `POST /predict` |
| `VideoMode.jsx` | Video upload with progress bar | `POST /predict-video-stream` |
| `LiveMode.jsx` | Webcam stream | `POST /predict` (frame-by-frame) |

Shared UI pieces include `PredictionSummary`, `DetectionsTable`, `ImageResultCard`, and `ModeTabs`. The app is a single-page demo with three tabs; it is not a production safety-compliance product.

### 4. Docker deployment

The root `Dockerfile` packages the backend into a self-contained image:

* Base: `python:3.12-slim`
* System deps: `ffmpeg`, OpenCV runtime libraries
* App code: `app/`, `models/baseline_weights/best.pt`
* Exposes port `8000`, runs `uvicorn app.main:app --host 0.0.0.0 --port 8000`

```bash
docker build -t ppe-safety-api .
docker run -p 8000:8000 ppe-safety-api
```

The frontend is not containerized yet; it runs separately with `npm run dev` and points at the API URL.

## Deployment topologies

### Local development

```text
Terminal 1: uvicorn app.main:app --reload   →  :8000
Terminal 2: cd frontend && npm run dev      →  :5173
```

The frontend calls the backend directly. CORS is enabled for `localhost:5173` and `127.0.0.1:5173`.

### Docker (backend only)

```text
docker run -p 8000:8000 ppe-safety-api  →  :8000
```

Clients (curl, frontend, or other services) reach the API at `http://localhost:8000`. Set `VITE_API_BASE_URL=http://localhost:8000` in `frontend/.env` when using the demo against the container.

## High-level request flows

### Image inference

```text
User uploads image (browser or curl)
  → FastAPI /predict receives multipart file
  → app/inference.py decodes image and runs YOLO
  → Detections, latency, and optional annotated image returned as JSON
  → Frontend renders side-by-side preview, summary, and detections table
  → Row appended to app/logging/predictions.csv
```

### Video inference

```text
User uploads video (Video Mode)
  → FastAPI /predict-video-stream receives file
  → Frames sampled (up to 8 fps, max 160 frames)
  → SSE progress events streamed to frontend during processing
  → Annotated H.264 MP4 and per-frame detections returned on completion
  → Frontend shows progress bar, video player, and frame-level stats
```

### Live camera

```text
User starts webcam (Live Camera Mode)
  → Browser captures frames via getUserMedia
  → Each frame sent to POST /predict as soon as prior request completes
  → Annotated frame replaces live viewport; summary updates below
```

## Observability

Every `/predict` call logs timestamp, input filename, image dimensions, latency, detection count, detected classes, average confidence, and a low-confidence flag to `app/logging/predictions.csv`. This supports basic post-hoc review and future active-learning workflows.

## Known gaps

* Frontend is not Dockerized; only the API is packaged today.
* Prediction logging is file-based CSV, not a centralized monitoring stack.
* No authentication, rate limiting, or horizontal scaling layer.
