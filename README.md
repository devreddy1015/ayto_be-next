# Ayto — SportIQ

Professional-grade sports analytics from any smartphone. No radar guns, no motion capture suits — just a phone, a court, and AI.

## Project Structure

```
ayto/
├── packages/
│   ├── cv-core/              # Team A — Shuttle/ball detection, tracking, speed
│   ├── pose-biomechanics/    # Team B — Body keypoints, joint angles, stroke events
│   ├── ml-models/            # Team C — BiLSTM stroke classifier, training, export
│   ├── mobile-app/           # Team D — React Native app
│   └── data-research/        # Team E — Video collection, preprocessing, research
├── data/                     # DVC-tracked datasets
├── models/                   # Model artifacts
├── dvc.yaml                  # Data pipeline definitions
└── pyproject.toml            # Project config
```

## Quick Start

```bash
# Clone and setup
git clone <repo-url> ayto && cd ayto
python -m venv .venv && source .venv/bin/activate

# Install per-module dependencies
pip install -r packages/cv-core/requirements.txt
pip install -r packages/pose-biomechanics/requirements.txt
pip install -r packages/ml-models/requirements.txt
pip install -r packages/data-research/requirements.txt

# Run tests
pytest packages/ -v

# Lint
pip install ruff
ruff check packages/
```

## Module Overview

### CV Core (Team A)
Shuttle detection via YOLOv8 + Kalman filter tracking + speed computation from pixel displacement.

```python
from packages.cv_core.src.pipeline import CVPipeline

pipeline = CVPipeline(model_path="models/shuttle_detector.pt")
results = pipeline.process_video("match.mp4")
pipeline.export_csv("output/match_tracking.csv")
print(pipeline.get_summary())
```

### Pose & Biomechanics (Team B)
MediaPipe Holistic keypoint extraction → hip-normalized pose → joint angles → stroke event detection → pro comparison.

```python
from packages.pose_biomechanics.src.keypoints import KeypointExtractor
from packages.pose_biomechanics.src.stroke_events import StrokeEventDetector

with KeypointExtractor() as extractor:
    kps = extractor.extract_from_video("rally.mp4")
    events = StrokeEventDetector(fps=60).detect(kps)
```

### ML Models (Team C)
BiLSTM + Attention stroke classifier. Train → evaluate → export to ONNX/TFLite.

```bash
python -m packages.ml_models.src.train --config packages/ml-models/configs/default.yaml
python -m packages.ml_models.src.export --model models/stroke_classifier.pt --output models/stroke_classifier.onnx
```

### Data Research (Team E)
```bash
python packages/data-research/scripts/download_videos.py --output data/raw/videos --max-videos 200
python packages/data-research/scripts/preprocess.py --input data/raw/videos --output data/processed/frames
```

## Engineering Standards

1. **On-device first** — no API calls during gameplay analysis
2. **Version everything** — code on Git, data on DVC, models on W&B
3. **Benchmark every module** — 10-video test set, track numbers not vibes
4. **Privacy by default** — video never leaves device without explicit opt-in
5. **Weekly demo** — every Friday, show a working thing

## Phase 1 Target (90 days)
- Working Android beta: shuttle speed + stroke classification in real time
- 500K annotated badminton frames
- Biomechanics comparison engine (your smash vs pro)
- 50 beta users providing feedback
- Investor demo video with real accuracy numbers
