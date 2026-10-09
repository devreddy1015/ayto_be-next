# Ayto — SportIQ

Professional-grade sports analytics from any smartphone. No radar guns, no motion capture suits — just a phone, a court, and AI.

## Project Structure

```
ayto/
├── packages/
│   ├── cv-core/              # Team A — Shuttle/ball detection, tracking, speed
│   ├── pose-biomechanics/    # Team B — Body keypoints, joint angles, stroke events
│   ├── ml-models/            # Team C — Multimodal stroke classifier, HitNet, export
│   ├── mobile-app/           # Team D — Expo / React Native app + web dashboard
│   └── data-research/        # Team E — Video collection, preprocessing
├── research/                 # Algorithm reviews with verified evidence
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

Each package's `src/` is importable as top-level modules (the tests and
`packages/core` put them on `sys.path`). Algorithm choices and the evidence
behind them are in [`research/`](research/README.md).

### CV Core (Team A)
TrackNet heatmap detection (TrackNetV3 background input + V4 motion attention;
YOLO only as fallback) → constant-acceleration Kalman tracking → offline
trajectory rectification → court-keypoint calibration → MonoTrack-style
gravity + drag 3D flight fit → launch and net-crossing speed. Sport geometry
for badminton, tennis, table tennis, pickleball, padel and squash lives in
`sports.py`.

```python
from pipeline import CVPipeline   # packages/cv-core/src on sys.path

pipe = CVPipeline(sport="badminton", tracknet_path="models/tracknet.pt")
pipe.process_video("rally.mp4", corners_px=[nl, nr, fr, fl])  # 4 taps on the court corners
print(pipe.get_summary()["flights"])  # launch_speed_kmh, net_speed_kmh, method
```

Train the detector with `python train_tracknet.py --data TrackNetV2 --background --motion`.

### Pose & Biomechanics (Team B)
RTMPose (via optional `rtmlib`; BlazePose fallback) → hip/torso normalisation
→ One-Euro smoothing → joint angles → wrist-peak swings fused with shuttle
turns (`fuse_hits`) → two-level DTW technique comparison (`compare_technique`).

```python
from keypoints import PoseExtractor   # packages/pose-biomechanics/src on sys.path
from normalize import normalize_and_smooth
from stroke_events import StrokeDetector

with PoseExtractor() as extractor:
    kps = normalize_and_smooth(extractor.extract_from_video("rally.mp4"), fps=60)
events = StrokeDetector(fps=60).detect(kps)
```

### ML Models (Team C)
Multimodal stroke classifier (pose + shuttle trajectory + court position with
cross-attention, BST-style; optional adjacent-stroke fusion), HitNet hit
detector, per-sport taxonomies. Train → evaluate → export to ONNX/TFLite.

```bash
python packages/ml-models/src/train.py --config packages/ml-models/configs/default.yaml
python packages/ml-models/src/export.py --model models/stroke_classifier.ckpt --output models/stroke_classifier.onnx
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
# ayto_be-next
