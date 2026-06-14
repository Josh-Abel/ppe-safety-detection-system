# MLOps Workflow

This project follows a lightweight end-to-end ML workflow.

## 1. Problem Definition

Detect visible PPE items in worksite images and return structured predictions that could support a safety-inspection workflow.

## 2. Data Engine

The dataset was downloaded from Roboflow in YOLOv11 format. The dataset was inspected for structure, class balance, image sizes, annotation quality, and object density.

## 3. Model Development

A YOLOv11n object detection model was fine-tuned as a lightweight baseline. YOLOv11n was selected because it is small, fast, and suitable for prototype deployment.

## 4. Evaluation

The model was evaluated using YOLO object detection metrics and additional diagnostic analysis. Evaluation includes per-class performance, confusion matrix, failure cases, and latency.

## 5. Deployment

The planned deployment is a Dockerized FastAPI inference server with a `/predict` endpoint.

## 6. Observability

The planned inference service will log prediction metadata, including timestamp, latency, number of detections, predicted classes, and confidence scores. Low-confidence predictions can be reviewed for future data collection.