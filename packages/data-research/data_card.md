# Ayto Badminton Dataset — Data Card

## Overview
- **Name:** Ayto Badminton Match Dataset v0.1
- **Domain:** Badminton (singles and doubles)
- **Source:** BWF official YouTube channels, public match recordings
- **Target size:** 200 match videos, ~500K annotated frames
- **Status:** Collection in progress

## Collection Methodology
- Videos sourced via `yt-dlp` using curated search queries
- Only publicly available match recordings included
- Preprocessed at 30fps, 640x360 resolution

## Annotations
- **Shuttle positions:** Bounding boxes annotated via Label Studio
- **Stroke labels:** Manual classification into 6 classes (smash, drop, clear, net, serve, defensive)
- **Player keypoints:** Auto-extracted via MediaPipe Holistic, manually verified for edge cases

## Splits
| Split  | Videos | Frames (target) |
|--------|--------|-----------------|
| Train  | 140    | 350K            |
| Val    | 30     | 75K             |
| Test   | 30     | 75K             |

## Known Limitations
- Camera angles vary significantly across sources
- Some videos have overlaid graphics that may interfere with detection
- Singles vs doubles not yet separated

## Ethical Considerations
- All source material is publicly available
- No player PII is stored — only visual data
- Dataset is for internal R&D only; licensing review required before external distribution

## Versioning
- Tracked via DVC
- Version history maintained in `dvc.lock`
