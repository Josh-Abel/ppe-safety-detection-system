#!/bin/bash

set -e

yolo detect val \
  model=models/baseline_weights/best.pt \
  data=datasets/data.yaml \
  split=test \
  imgsz=640 \
  project=experiments/yolov11n_baseline/evaluation \
  name=yolo_val_test \
  plots=True