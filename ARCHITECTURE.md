# Ayto — Technical Architecture

## 1. System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Camera   │  │  TFLite  │  │  Session │  │  Cloud  │ │
│  │  Capture  │──│  Runtime │──│  Manager │──│  Sync   │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└──────────┬──────────┬──────────────────────────┬────────┘
           │          │                          │
     ┌─────▼──────────▼────────┐          ┌─────▼────────┐
     │   ON-DEVICE ML MODELS   │          │   SUPABASE   │
     │  ┌────────┐ ┌─────────┐ │          │  ┌────────┐  │
     │  │ YOLOv8 │ │ BiLSTM  │ │          │  │  Auth  │  │
     │  │ (det)  │ │ (class) │ │          │  │Storage │  │
     │  └────────┘ └─────────┘ │          │  │Postgres│  │
     └─────────────────────────┘          └──────────────┘
```

## 2. Data Flow — Recording Session

```
User taps Record
    │
    ▼
Camera captures 60fps video → stored in local buffer
    │
    ▼
Frame extraction (every frame for CV, every 2nd for pose)
    │
    ├──► CV Pipeline (on-device)
    │      YOLOv8 detect shuttle → Kalman filter track → speed calc
    │      Output: per-frame shuttle position + speed
    │
    ├──► Pose Pipeline (on-device)
    │      MediaPipe extract 33 keypoints → normalize → joint angles
    │      Output: per-frame normalized keypoints + angles
    │
    └──► Stroke Classifier (on-device)
           30-frame sliding window → BiLSTM+Attention → stroke label
           Output: stroke events with label + confidence
    │
    ▼
Session Aggregator
    Merge all streams by frame index → compute session stats
    │
    ▼
Session Dashboard
    Speed trend, stroke distribution, weak zone heatmap, drill recs
    │
    ▼
Cloud Sync (background, after session, opt-in)
    Upload session JSON + optional video to Supabase Storage
```

## 3. CV Pipeline (Team A)

### Architecture
```
Video → Frame Iterator → YOLOv8 Detector → Kalman Tracker → Speed Calculator → CSV
```

### Components
| Component | Input | Output | Latency Target |
|-----------|-------|--------|----------------|
| `ShuttleDetector` | BGR frame (640x640) | Bounding box + confidence | <15ms/frame |
| `ShuttleTracker` | Detection or None | Smoothed (x, y) position | <1ms/frame |
| `SpeedCalculator` | Tracked position | Speed in km/h | <1ms/frame |
| `CVPipeline` | Video file path | List[FrameResult] + CSV | Real-time at 60fps |

### Detection Strategy
1. **Primary:** Fine-tuned YOLOv8n on shuttle/ball class
2. **Fallback:** If no shuttle-specific detection, use smallest detected object by area
3. **Tracking:** Kalman filter with constant-velocity model bridges detection gaps
4. **Calibration:** Auto-calibration from frame dimensions; manual override with court corner points

### Speed Computation
```
pixel_displacement = ||pos[t] - pos[t-1]||
meters = pixel_displacement / pixels_per_meter
speed_m/s = meters * fps
speed_km/h = speed_m/s * 3.6
```

Court calibration provides `pixels_per_meter` via known court dimensions (13.4m x 6.1m).

## 4. Pose & Biomechanics Pipeline (Team B)

### Architecture
```
Video → MediaPipe Holistic → Raw Keypoints → Hip Normalizer → Joint Angles → Stroke Events
                                                                    │
                                                               Pro Comparison
```

### Normalization (Critical)
All keypoints are normalized relative to:
- **Origin:** Midpoint of left_hip and right_hip
- **Scale:** Divided by torso length (hip_midpoint to shoulder_midpoint distance)

This makes the system invariant to:
- Camera distance
- Player height
- Vertical camera angle (within reason)

### Joint Angles Computed
| Joint | Landmarks Used | Purpose |
|-------|---------------|---------|
| Left/Right Elbow | shoulder-elbow-wrist | Arm extension during strokes |
| Left/Right Shoulder | elbow-shoulder-hip | Overhead reach detection |
| Left/Right Hip | shoulder-hip-knee | Lunge depth |
| Left/Right Knee | hip-knee-ankle | Footwork analysis |
| Left/Right Wrist | elbow-wrist-index | Racket angle proxy |

### Stroke Event Detection
1. Compute wrist velocity every frame (displacement * fps)
2. Find peaks above threshold (0.8 normalized units)
3. Extract 30-frame window around each peak (15 before + 15 after)
4. Output: `StrokeEvent(frame_start, frame_peak, frame_end, wrist_vel, elbow_angle)`

## 5. ML Model (Team C)

### Architecture: BiLSTM + Attention
```
Input: (batch, 30, 132)     # 30 frames × 33 landmarks × 4 features
    │
    ▼
BatchNorm1d(132)
    │
    ▼
Bidirectional LSTM
    layers=2, hidden=128, dropout=0.3
    Output: (batch, 30, 256)
    │
    ▼
Attention Layer
    Linear(256→128) → Tanh → Linear(128→1) → Softmax
    Weighted sum → context vector (batch, 256)
    │
    ▼
Classifier Head
    Dropout(0.3) → Linear(256→128) → ReLU → Dropout(0.3) → Linear(128→6)
    │
    ▼
Output: (batch, 6) logits → Softmax → stroke class probabilities
```

### Stroke Classes
| Index | Class | Description |
|-------|-------|-------------|
| 0 | smash | Overhead power shot |
| 1 | drop | Soft shot near net |
| 2 | clear | High defensive shot to back |
| 3 | net | Net play / net shot |
| 4 | serve | Service motion |
| 5 | defensive | Defensive return / block |

### Training Configuration
- Optimizer: AdamW (lr=1e-3, weight_decay=1e-4)
- Scheduler: Cosine Annealing over 50 epochs
- Loss: CrossEntropyLoss
- Gradient clipping: max_norm=1.0
- Target: >88% F1-macro on test set

### Export Pipeline
```
PyTorch (.pt) → ONNX (.onnx) → TFLite (.tflite) via onnx2tf
```
Inference target: <15ms on Snapdragon 680 (mid-range Android)

## 6. Mobile App (Team D)

### Stack
- **Framework:** React Native + Expo
- **Camera:** Expo Camera (60fps capture)
- **ML Runtime:** TFLite React Native bridge
- **Auth + DB:** Supabase (Auth, Storage, Postgres)
- **Charts:** Recharts / Victory Native

### Screen Flow
```
Splash → Auth (Supabase) → Home → Record Session → Processing → Session Dashboard
                              │                                       │
                              └── History ─── Session Detail ──────────┘
                              └── Profile ─── Settings
                              └── Compare ─── Select Pro → Side-by-side
```

### On-Device Inference Flow
```
Camera frame (60fps)
    │
    ├──► [Thread 1] YOLOv8 TFLite → shuttle detection
    ├──► [Thread 2] MediaPipe → keypoints
    └──► [Thread 3] BiLSTM TFLite → stroke classification (every 30 frames)
    │
    ▼
UI Overlay: shuttle position marker + speed badge + stroke label
```

### Design Constraints
- Must work on ₹8,000 Android phones (2GB RAM, Snapdragon 4-series)
- Must work on 4G connections (cloud sync <500KB per session summary)
- Maximum app size: 80MB (including all models)
- Session recording: max 10 minutes to stay within memory limits

## 7. Cloud Architecture

### Supabase Schema
```sql
-- users
id, email, name, created_at

-- sessions
id, user_id, sport, duration_s, created_at

-- session_metrics
id, session_id, avg_speed_kmh, max_speed_kmh, stroke_distribution (jsonb),
detection_rate, model_version

-- stroke_events
id, session_id, frame_start, frame_end, stroke_type, confidence, elbow_angle, wrist_velocity
```

### Sync Protocol
1. Session completes on device
2. Session JSON (<50KB) uploaded to Supabase Storage
3. Metrics extracted and inserted into Postgres
4. Video upload only if user opts in (stored in Supabase Storage, 720p max)
5. Background sync — no blocking of user interaction

## 8. Performance Budgets

| Metric | Target | Measured On |
|--------|--------|-------------|
| Shuttle detection accuracy | >85% | 10-video test set |
| Stroke classification F1 | >88% | Hold-out test set |
| End-to-end latency (record → dashboard) | <3 seconds | Redmi Note 12 |
| YOLOv8 inference | <15ms/frame | Snapdragon 680 |
| BiLSTM inference | <15ms/batch | Snapdragon 680 |
| App cold start | <2 seconds | Redmi Note 12 |
| Session summary upload | <500KB | 4G connection |

## 9. Versioning Strategy

| Artifact | Tool | Location |
|----------|------|----------|
| Source code | Git | GitHub monorepo |
| Datasets | DVC | Remote storage (S3/GCS) |
| Models | W&B + DVC | W&B for experiments, DVC for production |
| Configs | Git | `packages/ml-models/configs/` |
| App builds | EAS Build | Expo Application Services |

## 10. Security & Privacy

- All ML inference runs on-device — no frames sent to any server during analysis
- Video storage is opt-in only, encrypted at rest in Supabase Storage
- User authentication via Supabase Auth (email/OTP)
- No PII in analytics data — sessions are keyed by anonymous user ID for data licensing
- GDPR/DPDP compliance roadmap tracked separately
