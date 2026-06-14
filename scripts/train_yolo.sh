#!/bin/bash

set -e

yolo detect train \
  model=yolo11n.pt \
  data=datasets/data.yaml \
  epochs=20 \
  batch=16 \
  imgsz=640 \
  project=experiments/yolov11n_baseline \
  name=train \
  plots=True