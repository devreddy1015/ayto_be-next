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
     │  │TrackNet│ │ Stroke  │ │          │  │  Auth  │  │
     │  │RTMPose │ │ Transf. │ │          │  │Storage │  │
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
    ├──► CV Pipeline (on-device preview, offline/cloud analysis)
    │      TrackNet detect → CA-Kalman track → rectify → 3D physics fit → speeds
    │      Output: per-frame shuttle position + per-flight launch/net speed
    │
    ├──► Pose Pipeline (on-device)
    │      RTMPose (BlazePose fallback) → normalize → One-Euro → joint angles
    │      Output: per-frame normalized keypoints + angles
    │
    └──► Hits + Stroke Classifier (on-device)
           fused hits → hit-centred clip → multimodal Transformer → stroke label
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

Evidence for every choice below: [`research/algorithm-review-2026-10.md`](research/algorithm-review-2026-10.md).

### Architecture
```
Live:     frame → TrackNet (YOLO fallback) → CA-Kalman tracker (gated) → speed preview + turn cue
Offline:  frames → detections → hits (fused with pose) → rectify per flight
                 → court camera (DLT / homography + recovered focal)
                 → 3D flight: gravity + quadratic-drag fit to pixels (seeded by motion-plane lifts)
                 → launch speed + net-crossing speed per flight
```

### Components (`packages/cv-core/src`)
| Module | What it does |
|--------|--------------|
| `tracknet_model.py` | U-Net heatmap tracker: multi-frame input, TrackNetV3 median-background channel, TrackNetV4 motion attention, width multiplier, sub-pixel log-parabola peak decoding, weighted BCE |
| `tracknet_detector.py` | Streaming wrapper: rolling frame buffer, running median background |
| `detector.py` | YOLO fallback; shuttle/ball classes only, never "smallest object" |
| `tracker.py` | Constant-acceleration Kalman filter with Mahalanobis gating and post-hit re-acquisition (numpy) |
| `trajectory.py` | Offline rectification: local quadratic fits, MAD outlier rejection, gap inpainting that never crosses a hit; trajectory-turn hit candidates |
| `court.py` | `CourtCamera`: 6-point DLT, or 4-corner homography + Zhang focal recovery; ray/plane lifting; FreeTrack motion planes; court-line corner detection assist |
| `speed.py` | Live EMA preview; quadratic-drag launch-speed fit; net-crossing speed; MonoTrack-style physics fit (RK4, per-shot drag) |
| `sports.py` | Court geometry, net heights and drag constants for badminton, tennis, table tennis, pickleball, padel, squash |
| `pipeline.py` | `CVPipeline`: live `process_frame`, offline `process_video` / `reanalyse`, per-flight results |

### Calibration
The user taps the 4 court corners (plus both net-post tops if visible); `detect_court_corners` proposes them from the court lines. With only the corners, the focal length is recovered from the homography. Without calibration the pipeline falls back to a rough frame-size scale and flags it (`summary["calibration"] == "rough"`).

**Camera placement:** behind a back corner, or side-on, *not* on the centre line. A camera on the centre line sits inside the motion plane of shots hit straight down the middle, where depth can't be recovered (`lift_to_plane` returns NaN there).

### Speed
Frame-to-frame differencing at 30–60 fps misses the true peak, because a shuttle sheds speed within a few frames. Per flight:
1. **Physics fit** (default): position, velocity and a per-shot drag constant (0.5–2× the sport prior) fitted so the simulated gravity + drag flight reprojects onto the 2D track (robust soft-L1 loss). Launch speed = |v| at the hit.
2. **Plane fallback**: lift onto the hitter → next-hitter motion plane, then fit `s(t) = ln(1 + k v0 t)/k` over the first 0.15 s.
3. **Net-crossing speed** reported alongside: the radar-comparable number.

On simulated flights (1.5 px noise, unknown drag ±25%, no receiver anchor) the physics fit's launch-speed error is 3 km/h median / 7.5 km/h mean. These are simulation numbers; field validation against 240 fps slow motion is pending.

## 4. Pose & Biomechanics Pipeline (Team B)

### Architecture
```
Video → RTMPose (rtmlib) | BlazePose fallback → (33,4) landmarks → hip/torso normalise
      → One-Euro smoothing → joint angles → wrist-speed swings
      → fuse_hits (+ shuttle turns, no same-side double hits) → technique DTW vs reference
```

### Keypoints
`PoseExtractor(backend="auto")` prefers RTMPose: COCO-SP AP 72–84, against BlazePose-Full's 35.4. Its COCO-17 joints are mapped into the BlazePose 33-landmark layout the rest of the stack uses. Landmarks COCO lacks get visibility 0, and angles needing them (wrist: elbow–wrist–index) are skipped rather than computed from zeros. The main player is the largest confident skeleton.

### Normalization (Critical)
All keypoints are normalized relative to:
- **Origin:** Midpoint of left_hip and right_hip
- **Scale:** Divided by torso length (hip_midpoint to shoulder_midpoint distance)

Smoothing is a One-Euro filter (1 Hz minimum cutoff, β = 10 per torso-length/s). On simulated swings it beat the previous EMA on both jitter at rest and lag during the swing; `method="ema"` remains available.

### Joint Angles Computed
| Joint | Landmarks Used | Purpose |
|-------|---------------|---------|
| Left/Right Elbow | shoulder-elbow-wrist | Arm extension during strokes |
| Left/Right Shoulder | elbow-shoulder-hip | Overhead reach detection |
| Left/Right Hip | shoulder-hip-knee | Lunge depth |
| Left/Right Knee | hip-knee-ankle | Footwork analysis |
| Left/Right Wrist | elbow-wrist-index | Racket angle proxy (BlazePose only) |

### Hit Detection
1. `StrokeDetector`: wrist-speed peaks with an adaptive threshold. This is the pose-only cue; on its own this kind of detector scored F1 0.70 in MonoTrack.
2. `fuse_hits`: a shuttle turn plus a nearby swing is a player hit; a turn without a swing is an opponent hit; a swing without a turn counts only if the shuttle was occluded (otherwise it was a feint). The same side never hits twice in a row.
3. The learned HitNet (ml-models) replaces the rules once labelled hit frames exist.

### Technique Comparison
`compare_technique` crops both strokes to ±0.6 s around the hit, runs a global DTW (angles + angular velocity) and a per-joint DTW (Morel et al.'s two-level scheme), and reports per-joint mean error and timing offset. The offset is measured against the median of all joints' alignments, so "elbow 80 ms late" isn't split across joints. `ProComparisonEngine.compare_sequence` exposes it for reference clips; the single-frame `compare` remains for the static pro table.

## 5. ML Models (Team C)

See [`packages/ml-models/RESEARCH_NOTES.md`](packages/ml-models/RESEARCH_NOTES.md).

- **Stroke classifier** (`BadmintonStrokeClassifier`): one input tensor laid out `[pose 27 | shuttle 5 | position 4]`. Pose runs through raw/velocity/acceleration gated streams; the shuttle and position streams through a dilated depthwise TCN. Pose tokens query trajectory tokens by cross-attention (BST-style), feeding a Transformer and attention pooling. ~1.67 M params at the default config. Optional adjacent-stroke fusion (two-stage).
- **HitNet**: a ~17 K-param conv + BiGRU giving per-frame no-hit / near-side / far-side probabilities, decoded by dynamic programming with a minimum gap and alternating sides.
- **Taxonomies**: per sport (`stroke_taxonomy.py`); badminton keeps the 6 product classes (smash, drop, clear, net, serve, defensive).
- **Clips**: ±round(fps/2) frames around each hit, capped at the neighbouring hits, at most 1.5 s.
- **Export**: PyTorch → ONNX (dynamo, single input; the ASF variant has two) → TFLite via onnx2tf. Target <15 ms on a Snapdragon 680, not yet measured.

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
    ├──► [Thread 1] TrackNet TFLite → shuttle detection
    ├──► [Thread 2] RTMPose (BlazePose fallback) → keypoints
    └──► [Thread 3] Stroke classifier TFLite → stroke label (per detected hit)
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
| TrackNet (width-reduced) inference | <15ms/frame | Snapdragon 680 |
| Stroke classifier inference | <15ms/clip | Snapdragon 680 |
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
