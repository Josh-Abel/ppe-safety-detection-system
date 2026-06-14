# Dataset

This project uses a PPE object detection dataset from Roboflow Universe exported in YOLOv11 format.

Dataset source: https://universe.roboflow.com/ppe1-qla6c/ppe-gzzdx/dataset/2

The dataset is excluded from GitHub because it contains many image and label files. To run the notebooks or training scripts, download the dataset and place it in the `datasets/` directory.

Expected structure:

datasets/
  train/images/
  train/labels/
  valid/images/
  valid/labels/
  test/images/
  test/labels/
  data.yaml

## Classes

The model detects the following PPE-related classes:

- gloves
- helmet
- pants
- vest

## Notes from EDA

The dataset contains worksite-style images with varied lighting, object sizes, occlusion, and crowding. The main expected challenges are small PPE items, partially visible workers, and crowded scenes.