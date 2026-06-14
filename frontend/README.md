# PPE Safety Detector Frontend

Simple React demo for the PPE Safety Detector FastAPI backend.

Built with **Vite + React** and plain CSS (no UI libraries).

## Prerequisites

- Node.js 18+
- Python environment with project dependencies installed
- Trained model weights at `models/baseline_weights/best.pt`

## Install

From the project root:

```bash
cd frontend
npm install
```

## Run locally

Use two terminals.

**Terminal 1 — backend** (from project root):

```bash
uvicorn app.main:app --reload
```

**Terminal 2 — frontend**:

```bash
cd frontend
npm run dev
```

Open the URL shown by Vite (default: `http://localhost:5173`).

The backend enables CORS for `http://localhost:5173` and `http://127.0.0.1:5173` during local development.

## API configuration

The frontend calls the backend at:

```text
http://127.0.0.1:8000
```

Override with an environment variable in `frontend/.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Restart the dev server after changing `.env`.

## Modes

The app has three tabs: **Image Mode**, **Video Mode**, and **Live Camera Mode**.

### Image Mode

Fully functional. Sends images to:

```text
POST /predict?conf=0.25&include_image=true
```

**Input options:**

- Upload one or more local image files (max 10 MB each)
- Paste an image URL and click **Load from URL** (requires the remote site to allow browser access / CORS)

**For each image you get:**

- Side-by-side original and annotated previews
- Prediction summary: detection count, PPE safety summary, latency, and dimensions
- Detected objects table (sorted by class, then confidence)
- Download button for the annotated output image

**Safety summary logic** (prototype only):

Expected PPE classes: `helmet`, `vest`, `gloves`, `pants`. The summary reports whether all expected classes were detected, which are missing, or if nothing was detected.

### Video Mode

Fully functional. Uploads a video file and receives a fully annotated output video.

**Constraints:**

- Max file size: 50 MB
- Max duration: 20 seconds
- Accepted formats: `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`

**How it works:**

1. Upload a video — a preview of the original plays immediately in the browser
2. Click **Analyze Video** — the file is uploaded to the backend via a streaming SSE endpoint
3. A real-time progress bar tracks frame-by-frame processing as the backend reports it
4. When complete, the annotated video appears inline with playback controls
5. An overall PPE safety summary and per-frame statistics are shown below the video
6. A **Download annotated video** button saves the H.264 MP4 output

**Backend endpoints used:**

```text
POST /predict-video-stream   # primary — streams SSE progress events then final result
POST /predict-video          # non-streaming fallback (returns full JSON when done)
```

**Frame sampling:** the backend processes frames at up to 8 fps (skipping source frames as needed) with a hard cap of 160 frames. This keeps inference fast without sacrificing coverage on short clips.

**Output codec:** the backend writes H.264 (`avc1`) directly when the local OpenCV build supports it. If not, it falls back to `mp4v` and transcodes to H.264 using `ffmpeg` if available, ensuring browser-compatible playback.

### Live Camera Mode

Uses the browser webcam (`getUserMedia`) with separate **Start/Stop Camera** and **Start/Stop Detection** controls.

**How it works:**

- A single centered camera viewport shows the live feed
- When detection is running, bounding boxes appear on that same view (annotated frames from the backend replace the visible feed while capture continues in the background)
- Frames are captured at up to 640px wide (YOLO input size) to keep requests fast
- A continuous async loop sends the next frame as soon as the previous `/predict` request finishes (not on a fixed timer)
- Latest prediction summary and detections table appear below the viewport

**Notes:**

- Live mode is repeated image inference, not true streaming video inference
- Speed depends on your machine and backend latency
- Stop the camera when finished so the browser releases the webcam

## Error handling

The UI shows friendly messages for common issues:

- Backend not running
- Invalid file type or file too large
- Video duration exceeds the 20-second limit
- Prediction request failed
- Camera permission denied
- Image URL fetch failed (including CORS blocks)

## Project structure

```text
frontend/src/
  App.jsx                 # Header, mode tabs, layout
  api.js                  # API base URL and fetch helpers
  utils/ppe.js            # Safety summary, download helpers, file validation
  components/
    ModeTabs.jsx
    ImageMode.jsx
    VideoMode.jsx
    LiveMode.jsx
    ImageResultCard.jsx
    PredictionSummary.jsx
    DetectionsTable.jsx
```

## Prototype disclaimer

This frontend is a portfolio demo. It is **not** a real safety compliance system.

## Build for production

```bash
npm run build
npm run preview
```

Ensure the backend allows requests from your deployed frontend origin (CORS) or serve the frontend and API from the same origin.
