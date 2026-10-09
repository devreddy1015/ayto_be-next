# Ayto Stroke Model Research Notes

## Pipeline

```text
phone video (30–60 fps; decimate to 30 fps)
  -> 2D pose + shuttle track + court positions        (cv-core / pose packages)
  -> HitNet: per-frame P(no hit / near side / far side)  (src/hitnet.py)
  -> decode_hits: DP over peaks, min gap, sides alternate
  -> clip_around_hits: ±0.5 s, capped at neighbouring hits, ≤ 1.5 s
  -> BadmintonStrokeClassifier on [pose | shuttle | position]  (src/model.py)
  -> optional two-stage Adjacent-Stroke Fusion over the rally
  -> per-sport class taxonomy                          (src/stroke_taxonomy.py)
```

No checkpoints have been trained yet: every accuracy figure below is from the
cited papers, not from Ayto data. Our six product classes are also coarser
than ShuttleSet's 25, so the numbers are not directly comparable.

## Papers and what we took from them

### BST: Badminton Stroke-type Transformer (arXiv 2502.21085)

Fuses 2D player pose (joints + bones), the shuttle's 2D trajectory and player
court positions with TCN + Transformer encoders, plus a Cross Transformer that
relates pose/position to the shuttle trajectory. About 1.85 M params.

| Dataset (classes) | Model | Accuracy | Macro-F1 |
| --- | --- | --- | --- |
| ShuttleSet (25) | BST-CG-AP | 0.8254 | 0.7983 |
| ShuttleSet (25) | TemPose-TF | 0.8189 | 0.7943 |
| ShuttleSet (25) | ST-GCN | 0.7758 | 0.7352 |
| ShuttleSet (25) | ProtoGCN | 0.7746 | 0.7306 |
| BadmintonDB (18) | BST-AP | 0.6517 | 0.5799 |
| BadmintonDB (18) | ST-GCN | 0.5602 | 0.4870 |

BlockGCN and SkateFormer were also beaten. Findings that shaped the code:

- **The shuttle trajectory is the main gain over pose-only models.** The
  default config now feeds a 5-channel shuttle stream.
- **How modalities are fused matters**: naively concatenating court positions
  into the pose stream hurt some metrics. Positions enter as their own small
  projection fused into the shuttle stream, and pose tokens *query* trajectory
  tokens through cross-attention (`CrossModalFusion`).
- **Clip protocol**: ±round(fps/2) frames around each hit, capped at the
  neighbouring hits, max 1.5 s (`dataset.clip_around_hits`).
- **2D pose beat MotionBERT-lifted 3D** for this task.

Where we differ, to stay under ~2 M params on a Snapdragon 680: the trajectory
stream is a dilated depthwise TCN (no per-stream Transformer); the main
Transformer runs once, after fusion; the pose stream uses raw / velocity /
acceleration streams instead of an explicit bone stream.

### TemPose-TF-ASF: Adjacent-Stroke Fusion (arXiv 2605.02558)

Feeds the predicted stroke types of the previous and next strokes back in as
context with two-stage inference (stage 1 with zeroed context, stage 2 with
stage-1 predictions). A plug-in that improved every model it was added to,
e.g. BST-CG-AP accuracy 0.838 → 0.843 and TemPose-V macro-F1 0.658 → 0.701,
for about 0.24–0.40 M extra params.

Ours (`asf: true`, `two_stage_predict`): previous/next class probabilities
`(batch, 2 × num_classes)` go through a bias-free MLP whose output is added to
the pooled clip embedding; the last layer is zero-initialised, so zero context
reproduces stage 1 exactly. ~0.11 M extra params at the default size. Training
uses ground-truth neighbour labels from rally archives with 50 % of contexts
zeroed (`asf_context_dropout`). That training recipe is our choice and has not
been checked against the paper's.

### VideoBadminton (arXiv 2403.12385)

In low-data regimes skeleton-based models beat RGB models, and generic video
transformers (MViT-V2) collapsed. Hence: stay skeleton + trajectory based and
small.

### MonoTrack HitNet (arXiv 2204.01899)

A ~16 K-param learned hit detector over shuttle + pose + court features, plus
a sequence-optimisation step:

| Hit detector (same test set) | F1 |
| --- | --- |
| HitNet + sequence optimisation | 0.946 (P 94.9 / R 94.3) |
| HitNet without optimisation | 0.866 |
| Derivative / velocity-peak detector | 0.699 |

The app currently detects hits from wrist velocity peaks
(`pose-biomechanics/src/stroke_events.py`). `hitnet.HitNet` is a ~17 K-param
conv + bidirectional GRU (default config inputs) predicting *no hit / hit by
near side / hit by far side* per frame. `decode_hits` picks local maxima of
P(hit), then runs an exact semi-Markov Viterbi pass that maximises summed hit
log-odds subject to a minimum gap, with a penalty when consecutive hits in a
rally come from the same side (resetting after a 3 s gap). It is
MonoTrack-style, not a reproduction of their exact network or optimiser.

## Input layout

One tensor `(batch, seq_len, input_size)` keeps the TFLite graph single-input:

| Block | Default width | Contents |
| --- | --- | --- |
| pose | 27 | 9 key joints × (x, y, z) |
| shuttle | 5 | x, y, visibility, dx, dy (`dataset.shuttle_features`) |
| position | 4 | hitter + opponent court (x, y), normalised |

- `shuttle_dim: 0` gives the original pose-only model;
  `StrokeClassifier(input_size=132)` (used by `packages/core`) is pose-only.
- Unobserved shuttle frames (visibility 0) are replaced by a learned *missing*
  token, so their x/y values are ignored. The fusion gate also sees how much
  attention landed on observed frames. `shuttle_dropout_prob` blanks the
  shuttle in training so the model learns to fall back on pose.
- Clip archives without shuttle/position arrays are zero-filled ("unobserved").

Data formats (`.npz`): **clip archives** (`features`/`pose` + `labels`,
optional aligned `shuttle`, `position`) and **rally archives** (per-frame
`pose`, `shuttle`, `position`, plus `hit_frames`, one label per hit,
optional `fps` and `hit_sides`). Rally archives feed hit-centred clipping, ASF
neighbour links and HitNet training.

## Size and export

| Configuration | Params |
| --- | --- |
| Default config (pose + shuttle + position) | 1.67 M |
| Default config + ASF | 1.79 M |
| Default dims, pose-only | 1.41 M (was 2.03 M before the depthwise stem / slimmer head) |
| `StrokeClassifier(input_size=132)` (core) | 0.86 M |
| HitNet (default config inputs) | ≈ 17 K |

ONNX export uses the dynamo exporter (opset 18). The default multimodal graph
uses only standard ops: no `If` / `Loop` / `ScatterND`. Its outputs match
PyTorch to < 1e-5 under `onnx.reference`, with a dynamic batch axis. The
ONNX → onnx2tf → TFLite INT8 and CoreML paths are untested here; pass real
clips as `calibration_data` for INT8.

## Multi-sport taxonomy

`sport:` in the config selects the class list. `model.CLASSES` stays the
badminton list.

| Sport | Classes |
| --- | --- |
| badminton | smash, drop, clear, net, serve, defensive |
| tennis | serve, forehand, backhand, volley, smash, lob, drop |
| table_tennis | serve, forehand, backhand, push, block, chop, smash, lob |
| pickleball | serve, forehand, backhand, dink, drop, volley, smash, lob |
| squash | serve, forehand, backhand, volley, drop, boast, lob |

The non-badminton sets are product-level proposals, not taken from a
published dataset. Each sport needs its own training data. `forehand` /
`backhand` mean the ordinary groundstroke from that side; more specific
strokes take precedence when annotating. HitNet's side alternation holds for
singles, and for court sides in doubles.

## Next steps

1. Convert ShuttleSet into rally archives (pose + shuttle + positions + hit
   frames), with its stroke types mapped onto the six classes via
   `SPORT_LABEL_ALIASES`. Then train the classifier and HitNet.
2. Benchmark HitNet + `decode_hits` against the velocity-peak detector on
   Ayto phone footage before switching the app's clipper.
3. Ablate inputs: pose-only vs + shuttle vs + position; and 27 (x, y, z) vs
   18 (x, y) pose features, since BST found 2D beat lifted 3D.
4. Train ASF on rally archives and compare stage 1 with stage 2 on held-out
   rallies.
