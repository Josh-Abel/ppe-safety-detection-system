#!/bin/bash

set -e

yolo detect predict \
  model=models/baseline_weights/best.pt \
  source=sample_data/test/images \
  imgsz=640 \
  conf=0.25 \
  project=experiments/yolov11n_baseline \
  name=sample_predictions \
  save=True