# Ayto Stroke Model Research Notes

## Direction

The stroke classifier should not stay as a pose-only BiLSTM. Badminton strokes
are subtle, fast, and highly dependent on the shuttle path and court position.
The practical target is a multimodal clip model:

```text
stroke clip
  -> player pose sequence
  -> shuttle trajectory sequence
  -> court/player position features
  -> motion-aware temporal Transformer
  -> six product labels
```

## Papers That Shape The Current Code

- **BST: Badminton Stroke-type Transformer for Skeleton-based Action Recognition
  in Racket Sports**: use pose, shuttle trajectory, and court/player position
  together; the important product lesson is that ball trajectory is not optional.
- **ShuttleSet**: use stroke-level labels, rally context, shot type, hitting
  locations, and player locations as the main public-data target.
- **ST-GCN / 2s-AGCN**: skeleton recognition improves when motion and second-order
  body information are modeled, not only raw joint coordinates.
- **TrackNetV3 / shot refinement papers**: shuttle tracks are noisy and occluded;
  training should expect missing, jittery shuttle observations and should fuse
  swing/hit cues with trajectories.
- **MonoTrack / ShuttleFlow / ShuttleNet family**: future versions should model
  court-conditioned shuttle position distributions, not just one deterministic
  stroke class.

## Implemented Upgrade

- `BadmintonStrokeClassifier` is now a motion-aware Transformer.
- Raw, velocity, and acceleration streams are fused with learned gates.
- Multi-scale temporal convolutions capture short swing phases.
- Transformer encoder captures the full stroke window.
- Attention pooling keeps the most informative frames around impact.
- Training now supports class-balanced sampling, label smoothing, mixup,
  augmentation, AMP, AdamW, warmup cosine LR, richer checkpoints, and reports.

## Data Format Recommendation

Keep each training sample as a fixed window:

```text
features: (seq_len, input_size)
label: one of smash/drop/clear/net/serve/defensive
```

Start with `input_size=27` for nine pose joints. Move to a richer vector when
preprocessing is ready:

```text
27 pose features
+ 6 pose velocity summary features
+ 4 shuttle features: x, y, confidence, speed
+ 4 court/player features: player_x, player_y, opponent_x, opponent_y
= 41 features per frame
```

Update `configs/default.yaml` `input_size` when the preprocessing output changes.

## Next Algorithm Bets

1. Train TrackNetV2/V3-style shuttle detection on broadcast data, then fine-tune
   on phone videos.
2. Build a clipper that centers windows around wrist velocity peaks and shuttle
   trajectory direction changes.
3. Train the current Transformer on VideoBadminton/ShuttleSet/BST-style features.
4. Add a second head for hit-frame detection so classification learns impact
   timing jointly.
5. Add court-conditioned shot forecasting later for coach insights.
