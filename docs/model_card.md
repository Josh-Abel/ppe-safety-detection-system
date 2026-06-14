# Model Card: YOLOv11n PPE Detector

## Model

- Architecture: YOLOv11n
- Task: Object detection
- Classes: gloves, helmet, pants, vest
- Weights: `models/baseline_weights/best.pt`

## Intended use

This model is intended as a prototype safety-inspection tool for detecting visible PPE in worksite images.

## Not intended for

This model should not be used as a final compliance or safety enforcement system. It may miss small, occluded, or partially visible PPE items.

## Training

The model was fine-tuned using the Ultralytics YOLO CLI.

Training configuration is saved in:

`experiments/yolov11n_baseline/train/args.yaml`

## Evaluation

Evaluation outputs are saved in:

`experiments/yolov11n_baseline/evaluation/`

Key evaluation artifacts include:

- YOLO validation metrics
- Confusion matrix
- Precision-recall curves
- Failure cases
- Latency summary

## Known limitations

The model may struggle with:

- small gloves
- crowded scenes
- partial occlusion
- unusual camera angles
- low-light images
- PPE that is visually similar to background objects

## Future improvements

- Add more diverse training examples
- Use active learning on low-confidence predictions
- Try larger YOLO variants
- Evaluate on real worksite images outside the original dataset
- Add monitoring for prediction confidence and latency