# PPE Safety Detector

An end-to-end computer vision project for detecting personal protective equipment (PPE) in worksite images.

The goal of this project is not only to train an object detection model, but to build the foundation for a production-style ML system. The project includes dataset inspection, model training, evaluation, saved experiment artifacts, a Dockerized inference API, and a frontend demo.

## Project Overview

This project fine-tunes a YOLOv11 object detection model to detect PPE-related objects in worksite images.

Detected classes:

* gloves
* helmet
* pants
* vest

The current baseline model is trained using YOLOv11n and saved in:

```text
models/baseline_weights/best.pt
```

The project currently includes:

* Dataset inspection and mini EDA
* YOLOv11n baseline training
* Model evaluation on the test split
* Per-class performance analysis
* Confusion matrices and precision-recall curves
* Failure case analysis
* Latency summary
* Saved model weights
* Reproducible experiment artifacts

Current product layer:

* CLI inference for image files, image folders, and camera sources
* FastAPI backend with image, video, and streaming inference endpoints
* Docker container for reproducible backend deployment
* Prediction logging to CSV for basic observability
* React + Vite frontend demo deployed on Vercel (Image Mode, Video Mode, Live Camera Mode)
* Live API deployed on Google Cloud Run

## Live Demo

**Web app:** https://ppe-safety-detection-system-mu.vercel.app/

**API:** https://ppe-safety-api-987363068505.europe-west1.run.app

**Interactive docs:** https://ppe-safety-api-987363068505.europe-west1.run.app/docs

The React frontend is deployed on Vercel and calls the FastAPI backend on Google Cloud Run. You can also run the frontend locally (see [Frontend](#frontend)).

Test health:

```bash
curl https://ppe-safety-api-987363068505.europe-west1.run.app/health
```

Test image prediction (requires cloning the repo so `sample_data/example_images/image1.jpg` is available locally):

```bash
curl -X POST "https://ppe-safety-api-987363068505.europe-west1.run.app/predict?conf=0.25&include_image=false" \
  -F "file=@sample_data/example_images/image1.jpg"
```

The first request after idle time may be slow due to Cloud Run cold start.

## Repository Structure

```text
.
├── app
├── datasets
│   └── data.yaml
├── docs
├── experiments
│   └── yolov11n_baseline
│       ├── evaluation
│       │   ├── predict_labels
│       │   └── yolo_val_test
│       ├── sample_predictions
│       └── train
├── frontend
├── models
│   └── baseline_weights
│       └── best.pt
├── notebooks
│   ├── model_evaluation.ipynb
│   └── ppe_dataset_eda.ipynb
├── sample_data
│   └── example_images
├── scripts
├── Dockerfile
└── .dockerignore
```

## Dataset

This project uses a PPE object detection dataset from Roboflow Universe exported in YOLOv11 format.

Dataset source:

```text
https://universe.roboflow.com/ppe1-qla6c/ppe-gzzdx/dataset/2
```

The full dataset is not committed to GitHub. Before running the notebooks or training scripts, download the dataset and place it in the `datasets/` directory.

Expected local structure:

```text
datasets/
  train/images/
  train/labels/
  valid/images/
  valid/labels/
  test/images/
  test/labels/
  data.yaml
```

The repository includes `datasets/data.yaml` so the expected dataset configuration and class names are visible without committing the full dataset.

## Current Model

The current baseline model uses:

```text
YOLOv11n
```

Training artifacts are saved in:

```text
experiments/yolov11n_baseline/train/
```

Important files include:

```text
args.yaml
results.csv
results.png
confusion_matrix.png
confusion_matrix_normalized.png
BoxPR_curve.png
BoxF1_curve.png
BoxP_curve.png
BoxR_curve.png
```

The trained baseline weights are saved in:

```text
models/baseline_weights/best.pt
```

## Evaluation

Evaluation artifacts are saved in:

```text
experiments/yolov11n_baseline/evaluation/
```

This includes:

```text
failure_cases.csv
latency_summary.csv
test_metrics_yolo_val.csv
threshold_metrics_conf025_iou05.csv
predict_labels/
yolo_val_test/
```

The evaluation notebook includes:

* YOLO validation metrics
* Per-class performance
* Confusion matrix analysis
* Precision-recall curves
* Fixed-threshold diagnostics
* Latency analysis
* Failure case review
* Sample prediction visualization

Sample rendered predictions are saved in:

```text
experiments/yolov11n_baseline/sample_predictions/
```

These images are included so the evaluation notebook can show representative model outputs without committing the full prediction image directory.

## Notebooks

### Dataset EDA

```text
notebooks/ppe_dataset_eda.ipynb
```

This notebook inspects the dataset structure, class distribution, annotation quality, image dimensions, bounding box statistics, and sample images.

### Model Evaluation

```text
notebooks/model_evaluation.ipynb
```

This notebook evaluates the trained YOLO model using saved metrics, prediction outputs, failure cases, latency measurements, and sample predictions.

Before running the notebooks, make sure the dataset is downloaded into the expected `datasets/` structure.

## Setup

Create and activate a Python environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

The notebooks also use pandas, matplotlib, seaborn, and pyyaml. Install those as needed for analysis workflows.

## Inference CLI

Run inference on one image or a folder of images:

```bash
python3 scripts/predict.py \
  --weights models/baseline_weights/best.pt \
  --source sample_data/example_images \
  --output experiments/yolov11n_baseline/inference \
  --conf 0.25
```

When `--output` is provided, the command writes annotated images to that directory. If `--output` is omitted, no image files are saved. Add `--display` to show annotated images while debugging. Add `--include-image` to include the annotated image as base64 data in the JSON response.

For a camera source, pass a camera index such as `--source 0`. Press `q` to stop when using `--display`.

Example command to run from the camera:
```bash
python3 scripts/predict.py \                                                  
  --weights models/baseline_weights/best.pt \
  --source 0 \                         
  --conf 0.25 --display
```

Prediction metadata is appended to:

```text
app/logging/predictions.csv
```

Each row includes the input filename, optional output filename, image dimensions, latency, detection count, detected classes, average confidence, and a low-confidence flag. The low-confidence flag is set when any detection has confidence below `0.50`.

## Inference API

Start the FastAPI backend locally:

```bash
uvicorn app.main:app --reload
```

Interactive docs are available at `http://127.0.0.1:8000/docs`.

### `GET /health`

```bash
curl http://127.0.0.1:8000/health
```

Returns `{ "status": "ok", "model_loaded": true }`.

### `POST /predict` — image inference

```bash
curl -X POST "http://127.0.0.1:8000/predict?conf=0.25&include_image=true" \
  -F "file=@sample_data/example_images/image1.jpg"
```

**Query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `conf` | `0.25` | YOLO confidence threshold |
| `include_image` | `true` | Return annotated image as base64 data URI |

**Response:**

```json
{
  "detections": [
    { "class_name": "helmet", "confidence": 0.92, "bbox": [104, 82, 221, 194] }
  ],
  "latency_ms": 86,
  "image_width": 640,
  "image_height": 480,
  "output_image": "data:image/jpeg;base64,..."
}
```

To decode and save the annotated image from the terminal:

```bash
curl -s -X POST "http://127.0.0.1:8000/predict?conf=0.25&include_image=true" \
  -F "file=@sample_data/example_images/image1.jpg" \
| python3 -c "import sys,json,base64; data=json.load(sys.stdin); img=data['output_image'].split(',')[1]; open('output_prediction.jpg','wb').write(base64.b64decode(img))"
```

### `POST /predict-video` — full video inference

Uploads a video file and returns a fully annotated output video alongside per-frame detections.

```bash
curl -X POST "http://127.0.0.1:8000/predict-video?conf=0.25" \
  -F "file=@sample_data/example_video.mp4"
```

**Query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `conf` | `0.25` | YOLO confidence threshold |

**Constraints enforced server-side:**

* Max file size: 50 MB
* Frame sampling: up to 8 fps output (source frames are skipped to stay within this budget)
* Hard cap of 160 processed frames regardless of source FPS

**Response:**

```json
{
  "frame_count": 48,
  "fps": 7.5,
  "duration_sec": 6.4,
  "video_width": 1280,
  "video_height": 720,
  "total_latency_ms": 3820,
  "output_video": "data:video/mp4;base64,...",
  "frames": [
    {
      "frame_index": 0,
      "timestamp_sec": 0.0,
      "latency_ms": 74,
      "detections": [
        { "class_name": "helmet", "confidence": 0.88, "bbox": [104, 82, 221, 194] }
      ]
    }
  ]
}
```

The annotated video is H.264 MP4 (browser-compatible). The backend tries `avc1` via OpenCV first; if that codec is unavailable it falls back to `mp4v` and transcodes to H.264 using `ffmpeg`.

### `POST /predict-video-stream` — video inference with SSE progress

Same as `/predict-video` but returns a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) stream so clients can track per-frame progress in real time. The stream emits three event types:

```text
data: {"type": "progress", "processed": 12, "total": 48}

data: {"type": "done", "result": { ...same shape as /predict-video response... }}

data: {"type": "error", "message": "..."}
```

The frontend uses this endpoint to drive the real-time progress bar in Video Mode.

### Prediction logging

Every `/predict` call appends a row to:

```text
app/logging/predictions.csv
```

Each row contains: timestamp, input filename, output filename, image dimensions, latency, detection count, detected classes, average confidence, and a low-confidence flag (set when any detection confidence is below `0.50`).

## Docker

The backend is packaged as a Docker container using the root `Dockerfile`. The image includes Python dependencies, the FastAPI app, baseline model weights, and system libraries needed for OpenCV and video encoding (`ffmpeg`).

### Simple workflow

Every time you want to package the backend:

```bash
docker build -t ppe-safety-api .
```

Then every time you want to run it:

```bash
docker run -p 8000:8000 ppe-safety-api
```

Then test:

```bash
curl http://localhost:8000/health
```

Then:

```bash
curl -X POST "http://localhost:8000/predict?conf=0.25&include_image=false" \
  -F "file=@sample_data/example_images/image1.jpg"
```

Interactive API docs are available at `http://localhost:8000/docs` while the container is running.

### Production (Google Cloud Run)

The same Docker image is deployed to Google Cloud Run:

```text
https://ppe-safety-api-987363068505.europe-west1.run.app
```

See [Live Demo](#live-demo) for curl examples against the deployed service.

## Frontend

A React + Vite demo is in `frontend/`. The deployed app is at https://ppe-safety-detection-system-mu.vercel.app/. It connects to the FastAPI backend and provides three modes.

### Running the frontend

Use two terminals from the project root.

**Terminal 1 — backend:**

```bash
uvicorn app.main:app --reload
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite (default `http://localhost:5173`). The backend allows CORS from `localhost:5173` and `127.0.0.1:5173` during local development.

Override the backend URL with an environment variable in `frontend/.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Image Mode

Upload one or more image files or paste an image URL. Each image is sent to `POST /predict` and the UI shows:

* Side-by-side original and annotated previews
* Detection count, PPE safety summary, latency, and dimensions
* Detected objects table (sorted by class, then confidence)
* Download button for the annotated output image

Accepted formats: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.tif`, `.tiff`, `.webp` (max 10 MB each).

### Video Mode

Upload a short video file and receive a fully annotated output video. The UI shows:

1. Original video preview with duration validation
2. **Analyze Video** button — uploads to `POST /predict-video-stream`
3. Real-time progress bar driven by SSE events as the backend processes each frame
4. Annotated video player with inline playback controls
5. Overall PPE safety summary across all frames
6. Stats: frames processed, output fps, source duration, resolution, total latency
7. Collapsible per-frame detection counts
8. **Download annotated video** button (H.264 MP4)

Accepted formats: `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv` (max 50 MB, max 20 seconds).

### Live Camera Mode

Uses `getUserMedia` to stream the webcam through the detector in near-real time. The UI shows:

* Start/Stop Camera and Start/Stop Detection controls
* Live viewport — annotated frames replace the raw feed while detection is running
* Frames are captured at up to 640 px wide and sent to `POST /predict` as soon as the previous request resolves (no fixed timer)
* Latest PPE safety summary and detections table update below the viewport

## Training

The baseline model was trained using the Ultralytics YOLO CLI.

Example training command:

```bash
yolo detect train \
  model=yolo11n.pt \
  data=datasets/data.yaml \
  epochs=20 \
  batch=16 \
  imgsz=640 \
  project=experiments/yolov11n_baseline \
  name=train \
  plots=True
```

The full training configuration is saved in:

```text
experiments/yolov11n_baseline/train/args.yaml
```

## Evaluation Command

Example test evaluation command:

```bash
yolo detect val \
  model=models/baseline_weights/best.pt \
  data=datasets/data.yaml \
  split=test \
  imgsz=640 \
  project=experiments/yolov11n_baseline/evaluation \
  name=yolo_val_test \
  plots=True
```

## MLOps Workflow

This project follows a lightweight end-to-end ML workflow.

### 1. Problem Definition

Detect visible PPE items in worksite images and return structured predictions that could support a safety inspection workflow.

### 2. Data Engine

The dataset was downloaded from Roboflow in YOLO format. It was inspected for class distribution, annotation quality, image dimensions, object density, and potential failure modes.

### 3. Model Development

A YOLOv11n model was fine-tuned as a lightweight object detection baseline. YOLOv11n was selected because it is small, fast, and suitable for prototype deployment.

### 4. Evaluation

The model was evaluated using YOLO object detection metrics and additional diagnostic analysis. Evaluation includes per-class performance, confusion matrices, precision-recall curves, latency, and failure cases.

### 5. Deployment

A FastAPI inference server serves the model via REST endpoints. The backend is packaged in a Docker container and deployed to Google Cloud Run. The React + Vite frontend is deployed on Vercel for browser-based image, video, and live camera inference.

### 6. Observability

Every inference request is logged to `app/logging/predictions.csv`. Each row captures timestamp, latency, detection count, predicted classes, average confidence, and a low-confidence flag. Low-confidence predictions can be reviewed later for future data collection or active learning.

## Known Limitations

This is a prototype model and should not be used as a real safety compliance system.

The model may struggle with:

* small PPE items
* crowded scenes
* partially occluded workers
* low-light images
* unusual camera angles
* PPE that blends into the background
* images that differ significantly from the training data

## Future Improvements

* Add confidence and latency monitoring dashboards
* Try larger YOLO variants (YOLOv11s/m)
* Use low-confidence predictions for active learning

## Project Status

```text
EDA                        complete
Baseline YOLO training     complete
Evaluation                 complete
Baseline weights saved     complete
Inference API              complete  (image, video, video-stream endpoints)
Prediction logging         complete
Frontend demo              complete  (Vercel — Image, Video, Live Camera Mode)
Cloud deployment           complete  (FastAPI on Google Cloud Run)
```
