# Algorithm review: best-available methods per pipeline stage

*Ayto SportIQ · research cut-off 9 Oct 2026 · single phone camera, 30–60 fps, on-device target Snapdragon 680 (TFLite), optional cloud post-processing*

## How this was produced

A deep-research run split the question into 6 search angles and fetched 26 primary sources (mostly arXiv, CVPR/ICCV/BMVC/AAAI papers, journals and official repos), extracting 239 falsifiable claims. 45 of the most decision-relevant claims then went through **3-vote adversarial verification**: three independent verifiers each tried to refute the claim against the primary source and any contradicting literature, and 2 of 3 refutations kills a claim.

| Verification result | Claims |
|---|---|
| Supported (≥2 of 3 votes failed to refute) | 29 |
| Refuted | 15 |
| Unresolved (run stopped before all 3 votes) | 1 |
| Extracted from a primary source but not adversarially checked | 194 |

Every number below is tagged with its status: **[verified]**, **[refuted]**, or **[primary, unchecked]**. The run stopped at the session limit before writing its own synthesis, so this report was assembled from the run's saved journal. Raw data is in [`data/verified_claims.json`](data/verified_claims.json), with every verifier's evidence, and [`data/extracted_claims.json`](data/extracted_claims.json). Sources are listed in [`sources.md`](sources.md).

Verification was strongest for stages 1–5. Stage 6 (stroke classification) and stage 7 (technique comparison) rest on primary sources that were read and quoted but not adversarially checked, so treat them as one level weaker.

A refuted claim usually doesn't mean the paper's numbers are wrong. Most refutations here were of *framing*: a self-reported "state of the art" contradicted by another lab's table, numbers superseded by a later revision, or a conclusion the source itself rejects. Each one is noted where it matters.

---

## Summary

| Stage | Ayto before | Most accurate (verified) | On-device choice | Changed in this repo |
|---|---|---|---|---|
| 1 · Shuttle detection | YOLOv8n primary; TrackNetV2 optional, untrained | TrackNetV3 + V4 motion attention + background-median input | WASB-style 1.5M HRNet or width-reduced TrackNet (needs SD680 benchmark) | TrackNet is now the primary detector, with background-median and motion-attention options and sub-pixel peak decoding; YOLO is a fallback |
| 2 · Trajectory | Constant-velocity Kalman filter | TrackNetV3 rectification (InpaintNet) offline; no KF gain online (WASB) | Constant-acceleration candidate gating + physics-aware gap repair | Constant-acceleration KF with gating and post-hit re-acquisition; offline rectifier (local quadratic fits, MAD outlier rejection, gap inpainting that never crosses a hit) |
| 3 · Speed & calibration | Pixel displacement ÷ px-per-metre; Hough "depth" calibration | Court-keypoint projection (6-point DLT) + motion-plane 3D (FreeTrack); MonoTrack drag fit in cloud | Same; FreeTrack's 3D step costs 0.7 ms/frame | 6-point DLT or 4-corner homography + recovered focal length; motion-plane lifting seeds a MonoTrack-style gravity + drag fit to the pixels (per-shot drag); launch and net-crossing speed |
| 4 · Pose | MediaPipe BlazePose + EMA | RTMPose-m/l (COCO-SP AP 82–84) | RTMPose-s/t (≈9–14 ms on SD865) | Pluggable RTMPose backend (COCO→BlazePose index map) with BlazePose fallback; One-Euro filter replaces EMA |
| 5 · Hit detection | Wrist-velocity peak threshold | MonoTrack HitNet + sequence optimisation (F1 0.946) | Same: 16K params | Rule-based fusion of shuttle turns and wrist peaks (feints dropped, no same-side double hits); learned HitNet + DP decoder in ml-models, untrained |
| 6 · Stroke type | Pose-only motion Transformer | BST / TemPose-TF-ASF (pose + shuttle + position) | BST-size models (~1.9M params) | Multimodal cross-attention classifier, hit-centred clips, ASF, per-sport taxonomies |
| 7 · Technique vs pro | Single-frame per-joint angle difference | Phase-aware alignment (2-level / Drop-DTW); learned scorers are still weak | DTW on joint-angle sequences | Hit-cropped two-level banded DTW over angle trajectories: per-joint error and timing offset against the median body timing |

---

## 1. Shuttlecock detection

**Generic box detectors are the weak link.** On the shared TrackNet shuttlecock benchmark, YOLOv7 scored Acc 57.8 / Prec 78.5 / Rec 60.0 / **F1 68.0**, against TrackNetV2 at Acc 85.6 / F1 90.6 and TrackNetV3 at **Acc 95.7 / F1 97.5** (TrackNetV4 paper, Table I) **[verified 2–1]**. The TrackNetV3 repo's own table agrees: YOLOv7 F1 68.00 **[verified 3–0]**. On RacketVision (AAAI 2026, pro broadcast at 1080p), single-frame **YOLO11 reached recall 0.548 and a mean distance error of 29.3 px**. WASB got recall 0.803 / 4.03 px, and TrackNetV3 with a background-median input and 4 frames got recall 0.865 / 1.54–2.07 px **[primary, unchecked]**. The reason is that a single frame can't separate a motion-blurred 2–4 px shuttle from background clutter, and backbone downsampling erases it.

**TrackNet family (heatmap, multi-frame input):**
- **TrackNetV3** (ACM MM Asia 2023, MIT licence, public weights): Acc 97.51 / Prec 97.79 / Rec 99.33 / **F1 98.56**, against TrackNetV2's 94.98 / 99.64 / 94.56 / 97.03 on the Shuttlecock Trajectory test split. The gain comes mostly from recall **[verified 3–0]**. Two parts: a tracking network that takes an **estimated background (median frame)** as extra input and is trained with mixup, and **InpaintNet**, which rectifies missed or occluded points **[verified 3–0]**. Adding the background median alone cut localisation error by 54.8% (7.39 → 3.34 px) on RacketVision badminton **[primary, unchecked]**.
- **TrackNetV4** = TrackNetV3 + a plug-in **motion-attention** module (frame-difference maps modulated by a learnable motion prompt): Acc 95.7 → **96.4**, Rec 95.4 → 96.3, **F1 97.5 → 97.9**, Prec 99.7 → 99.5 **[verified 3–0 and 2–1]**. The module costs almost no speed on TrackNetV2 (163.3 → 161.1 FPS) **[primary; the claim was refuted 2–1 on framing, not on the numbers]**.
- **TrackNetV5** (two different 2025–26 papers): reports F1 98.47–98.59. **Both "beats V3/V4" claims were refuted 3–0**: the numbers are self-reported, the two V5 papers disagree with each other and with V3's own peer-reviewed table, and one ablation doesn't add up. V5-Lite (2.58M params, F1 98.06) is a promising size point, but it was only timed on a desktop RTX 5080 **[verified 3–0 for the description; refuted 3–0 for the "above V3/V4" framing]**. **Not adopted until it's independently reproduced.**

**Small-model options:**
- **WASB** (BMVC 2023): a 1.5M-param HRNet with the stem strides removed. On TrackNetV2 badminton it gets **F1 93.1 / Acc 89.0 / AP 91.6** with oversampling, beating the authors' re-implementations of TrackNetV2 (11.3M, F1 90.5) and MonoTrack (2.9M, F1 90.9) **[verified 3–0]**. Without oversampling it gets F1 91.6 at 70 FPS on a V100 **[primary; the overall claim was refuted 3–0 because its last sentence misread the paper]**.
- **MonoTrack's tracker:** the "88.6% vs 84.0%, 4× fewer params" claim was **[refuted 3–0 and 2–1]**, because WASB's independent re-implementation shows MonoTrack ≈ TrackNetV2 (F1 90.9 vs 90.5).

**No paper reports phone (Snapdragon 680 / TFLite) latency for any of these trackers.** Every FPS figure is from desktop or server GPUs.

**Recommendation.** Make TrackNet the primary detector. Use TrackNetV3-style background-median input plus V4 motion attention for the most accurate model (cloud or high-end phones), and add InpaintNet-style rectification offline. For the mid-range phone, benchmark a width-reduced TrackNet or a WASB-style HRNet on the device before committing. Keep YOLO only as a cold-start fallback and for player boxes.

## 2. Shuttle tracking and trajectory

- **Online filtering:** WASB's authors found **classical Kalman or particle filtering gave no improvement** over simple online candidate filtering with a **constant-acceleration local motion model**. On badminton, the online tracking step changed nothing (F1 91.6 / AP 88.5 with and without it) **[primary, unchecked]**. A constant-velocity Kalman filter also ignores gravity and drag, and lags on every hit.
- **Offline rectification:** TrackNetV3's InpaintNet repairs missing or incorrect points along the predicted trajectory **[verified]**.
- **Physics:** drag on a shuttle scales with v². Zhi et al. (Robotica 2022) use an **unscented Kalman filter** for that reason **[verified 3–0]**, but on a stereo infrared rig with markers, so the result doesn't transfer to one RGB phone **[primary]**. MonoTrack fits **gravity plus quadratic drag with a per-shot drag coefficient**, plus court and shot-placement priors. On 10k synthetic trajectories the priors cut 3D error from 14.9 to 8.0 cm. On real video only reprojection error exists: 8.1–9.8 px bootstrapped, up to 37.1 px end to end **[verified 3–0 and 2–1]**.
- **FreeTrack** (Machine Vision and Applications 37:167, Oct 2026) fits **no drag model**. It assumes each flight between two hits stays in one vertical "motion plane", anchored at the hit frame and the hitter's ground point (midpoint of the ankles), and intersects each camera ray with that plane **[verified 3–0 and 3–0]**. It runs at **0.705 ms/frame, 83× faster than MonoTrack** **[primary]**. Its headline landing-point gains over MonoTrack (e.g. 170.9 → 7.8 cm on clears) were **[refuted 3–0 and 2–1]**. The numbers are in the paper, but the claims hid caveats: an indirect proxy, the authors' own small set, and one omitted row. Stated weakness: the ankle anchor fails on dives and jump smashes **[primary]**.

**Recommendation.** Replace the CV-Kalman "source of truth" with (a) constant-acceleration candidate gating online and (b) offline rectification per flight segment (outlier rejection plus gap inpainting). Use FreeTrack motion-plane lifting for cheap 3D, and MonoTrack-style drag fitting as a cloud refinement.

## 3. Speed estimation and court calibration

- **The closest published analogue to Ayto** (arXiv 2509.05334, Sep 2025, a single independent author): an iPhone 16 at 30 fps, a custom YOLOv5, a constant-velocity Kalman filter and a **2-click metres-per-pixel scale**. Over 20 smashes against a Bushnell radar, **peak speed MAE was 66.41 km/h (RMSE 74.68)**, always above the radar **[verified 3–0]**. Readings taken **at the net crossing** were far closer: **≈9.9 km/h MAE** computed from its Table 1, worst trials off by 31–34 km/h **[verified 3–0]**. The "system failure" reading of the peak error was **[refuted 3–0]**: the author attributes part of the gap to the radar missing the early flight, and the table's own numbers recompute to MAE 69.4. A single-scale calibration **cannot measure motion towards or away from the camera**; this is the same limit as Ayto's pixels-per-metre **[verified 3–0 and 3–0]**.
- **Radar is not ground truth.** In a 34-player lab study, a Doppler radar (Stalker Sport) **under-read peak smash speed by 9.7% on average** against a 500 Hz 9-camera Vicon, and a racket IMU by 13.6%. Radar bias by skill level was −14.1 / −9.8 / −6.9% for novices, intermediates and experts **[verified 3–0]**. The radar-vs-camera correlation and CV figures were **[refuted 2–1]** because the paper's tables contradict its prose. The paper's claim that 50 fps video can't assess shuttle speed was **[refuted 3–0]** as overstated.
- **The shuttle decelerates very fast.** Speed roughly halves within ~0.05 s of contact **[primary; the paper's printed constants look garbled]**. At 30–60 fps that is 1.5–3 frames, so frame-to-frame differencing misses the true peak unless a drag-aware fit extrapolates back to contact.
- **Calibration:**
  - MonoTrack's court detector raised the detection success rate (IoU > 0.8) from 73.9% to 85.5% and cut detection time 40× **[verified 3–0]**.
  - FreeTrack calibrates a full projection matrix by **6-point DLT from the 4 court corners and the 2 net-post tops**, and must be redone when the camera moves or zooms **[verified 3–0]**.
  - PnLCalib (keypoints + line refinement, soccer): the method is **[verified]**, but its specific score gains were **[refuted 3–0]** as superseded by a later revision. It runs at 4–7 Hz on an RTX 2080 Ti, so it is one-off calibration only **[primary]**.

**Recommendation.**
1. Calibrate a projection matrix from court keypoints: user taps on the 4 court corners (+ 2 net-post tops when visible), with automatic line detection as an assist. Fall back to a homography when only ground points are available.
2. Lift shuttle detections into 3D on the flight's motion plane.
3. Estimate **launch speed by fitting a quadratic-drag model** over the first frames after the hit, instead of taking a single noisy frame difference.
4. Report the **net-crossing speed** as the radar-comparable figure.
5. Validate against 240 fps slow-motion phone video as well as radar, remembering radar's ~10% under-read.

## 4. Human pose estimation

- Accuracy on COCO-SinglePerson val (1,045 images): **BlazePose-Lite 29.3 AP, BlazePose-Full 35.4**, MoveNet Lightning 53.6, Thunder 64.8, **RTMPose-t 72.1, -s 77.1, -m 82.4, -l 83.5** **[primary; adversarial check unresolved after 1 vote (not refuted)]**. Ayto currently runs BlazePose.
- Mobile latency (ncnn, 4 threads, Snapdragon 865, 256×192): **RTMPose-t 9.02 ms FP16** (15.84 FP32), **-s 13.89 ms** (25.01), -m 26.44 ms, -l 45.37 ms **[verified 3–0]**. The SD865 is a flagship chip, so expect it to be several times slower on an SD680. Benchmark before choosing between t and s.
- RTMPose's video pipeline runs the person detector only every K frames and smooths with a **One-Euro filter**, not EMA **[primary]**.
- **SmoothNet** (ECCV 2022, 0.33M params) beats One-Euro, Savitzky-Golay and Gaussian filters on jitter and accuracy (AIST++: Accel 31.64 → 4.15, MPJPE −8.8%). It works on 2D keypoints but is **non-causal**, so it suits offline or cloud use only **[primary]**.
- **MotionBERT** is the strongest 2D→3D lifter (37.5 mm MPJPE on H36M) but heavy **[primary]**. BST found 2D pose beat MotionBERT-lifted 3D for stroke classification **[primary]**.

**Recommendation.** Move to RTMPose-s (or -t on weak devices) and keep BlazePose as a fallback. Use a causal One-Euro filter live, which adapts its cutoff to joint speed, so fast arm swings aren't lagged the way a fixed EMA lags them. Use zero-phase or SmoothNet smoothing for offline analysis.

## 5. Hit (stroke-event) detection

- **MonoTrack HitNet** (~16K params; shuttle, pose and court features) plus sequence optimisation: **F1 0.946** (P 94.9 / R 94.3). A **derivative/velocity-peak detector, i.e. what Ayto used, gets F1 0.699** on the same set, and HitNet without the optimisation step gets 0.866 **[verified 2–1 and 3–0]**.
- Trajectory-only hit detection has high recall but low precision (P 0.588 / R 0.936 / F1 0.723). Fusing it with a learned swing detector and a refinement step gives **P 0.897 / F1 0.905** (Sensors 2024, BWF broadcast) **[primary, unchecked]**.
- FreeTrack uses XGBoost on 4 kinematic features plus an **alternating-hitter rule** that recovers missed hits **[primary; small test set]**.

**Recommendation.** Fuse cues: shuttle-trajectory reversals, wrist-speed peaks, and the constraint that hits alternate between players, decoded jointly rather than greedily. Train the HitNet-style model once labelled hit frames exist; ShuttleSet labels the exact contact frame.

## 6. Stroke-type classification  *(primary sources, not adversarially checked)*

- **BST** (arXiv 2502.21085) fuses pose (joints + bones), the shuttle trajectory and court positions with a Cross Transformer. On ShuttleSet (25 classes) it reaches **acc 0.8254 / macro-F1 0.7983**, ahead of TemPose-TF 0.8189/0.7943, ST-GCN 0.7758/0.7352 and ProtoGCN 0.7746/0.7306. On BadmintonDB (18 classes) it gets 0.6517/0.5799 vs ST-GCN 0.5602/0.4870. ~1.85M params. **The shuttle trajectory is the main source of the gain**, while naive concatenation of court position hurt. Clips are cut around hit frames.
- **TemPose-TF-ASF** (arXiv 2605.02558): adjacent-stroke fusion lifts ShuttleSet (31 classes) to acc 0.854 / macro-F1 0.761. ASF improved every model it was added to.
- **VideoBadminton** (18 classes): SlowFast RGB 82.80% top-1, PoseC3D 80.76%, ST-GCN 74.41%. With little data, skeleton models beat RGB, and MViT-V2 collapsed to 14%.

**Recommendation.** Make the classifier multimodal (pose + shuttle + position, using cross-attention rather than concatenation), clip around detected hits, and add ASF for rally context. Stay at BST size for mobile.

## 7. Technique comparison against pros  *(primary sources, not adversarially checked)*

- A per-joint, single-frame angle difference has no temporal alignment and no timing information.
- **Two-level DTW** (Morel et al., VISAPP 2016): whole-body DTW followed by per-joint DTW gives a spatial *and* timing error per joint, from expert data alone. It was tested on tennis serves (mocap, small n).
- **Drop-DTW** (NeurIPS 2021) handles outlier frames anywhere in either sequence and beat DTW, LCSS and Needleman-Wunsch on every alignment benchmark tested.
- Plain DTW fails when the distinctive pose fills only a short part of a long sequence, where non-informative frames dominate. Learned metrics (MMD-NCA) cut false positives by up to 17% relative to DTW measures on mocap.
- The only **smartphone badminton** coach-vs-student benchmark (7,200 clips) shows learned exemplar scoring is still modest: **MAE 7.47 / SRCC 0.56** against coach scores, and worst on overhead strokes.

**Recommendation.** Compare angle *trajectories*, aligned around the hit with a banded DTW, and report per-joint spatial error plus timing offset (lead/lag). Trim non-stroke frames before aligning. Learned similarity can come later, when coach-labelled data exists.

---

## Implementation notes (simulation results from this pass)

These come from synthetic tests in `packages/*/tests`, with known ground truth. They are **not** field measurements.

- **Launch speed.** On simulated quadratic-drag shuttle flights:
  - The drag-model fit over the first 0.15 s, with back-extrapolation to the hit, recovered launch speed to **1.7–6 km/h MAE** (30–60 fps, 2–5 cm position noise).
  - Taking the fastest of the first few frame-to-frame differences was **45–86 km/h low**. That is the "misses the peak" effect the literature describes.
- **3D lifting needs the right plane.** With the true motion plane, launch-speed error was ~3 km/h. Assuming a straight down-the-court plane for shots with up to ±29° lateral direction gave **~160 km/h MAE**, because rays meet the plane at grazing angles. So FreeTrack's two-anchor plane (hitter → next hitter) matters, and a camera *on the centre line* is degenerate for shots straight down the middle. Ayto should recommend filming from behind a back corner or side-on.
- **Physics fit.** Fitting the gravity + drag flight (with a per-shot drag factor) directly to pixels, MonoTrack-style, seeded from plane lifts, reached **3.2 km/h median / 7.5 km/h mean** launch-speed error without knowing the receiver. That's 1.5 px noise and ±25% unknown drag; a guessed plane alone scored ~60 km/h MAE. Cost is ~1–2 s per flight in pure Python, so this is offline/cloud.
- **Calibration.** From the 4 court corners alone, the recovered focal length and camera position are exact on noise-free input, and the camera centre is within ~5 cm at 1 px corner noise.
- **Smoothing.** One-Euro (1 Hz minimum cutoff, β = 10 torso-lengths/s) against EMA α = 0.7 on a simulated fast swing: jitter at rest −33% (30 fps) / −55% (60 fps), swing lag error −66% / −37%.
- **Tracking.** The constant-acceleration Kalman filter's process noise was tuned so no true detection on simulated drag flights is gated out, while isolated clutter is ignored. Smoothing gain over raw detections is small, consistent with WASB's finding that filtering adds little; its value is clutter rejection and coasting through gaps.

## Caveats

- All accuracy numbers are on broadcast or lab footage. None was measured on handheld phone video at 30 fps, and **no source reports Snapdragon 680 latency**.
- Several "state of the art" claims (TrackNetV5, MonoTrack tracker, FreeTrack vs MonoTrack) did not survive verification. They're recorded with their refutation reasons in `data/verified_claims.json`.
- The speed-validation literature is thin: one independent 20-smash study and one lab radar study.

## Open questions to settle with Ayto's own data

1. TrackNet-small vs WASB latency and F1 on an actual SD680 with TFLite INT8, on our phone clips.
2. Launch-speed error of the drag fit against 240 fps slow-motion ground truth.
3. RTMPose-t vs -s on fast overhead strokes (wrist and elbow PCK) at 30 vs 60 fps.
4. Whether hit-centred multimodal clips close the gap to BST numbers on our 6-class taxonomy.
