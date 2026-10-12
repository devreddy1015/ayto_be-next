# Research

Evidence behind Ayto's algorithm choices. Start with the review; the data files are for checking a specific number.

| File | What it is |
|---|---|
| [`algorithm-review-2026-10.md`](algorithm-review-2026-10.md) | Per-stage review (detection → tracking → speed/calibration → pose → hit detection → stroke type → technique comparison): what Ayto used, what's most accurate, what runs on a phone, and what changed in the code |
| [`review-findings-2026-10.md`](review-findings-2026-10.md) | The 34 defects an adversarial review found in the change set that became `16b8d33`, with mechanism, reproduction and fix for each. All fixed as of 2026-10-12; kept as the record |
| [`sources.md`](sources.md) | The 26 primary sources, with venue, date and how many of their claims survived verification |
| [`data/verified_claims.json`](data/verified_claims.json) | The 45 claims that went through 3-vote adversarial verification, with status (`supported` / `refuted` / `unresolved`), the supporting quote and each verifier's evidence |
| [`data/extracted_claims.json`](data/extracted_claims.json) | All 239 claims extracted from the sources, each tagged with its verification status (`not checked` for most) |

## Conventions

- Cite a number only with its status: **[verified]**, **[refuted]** or **[primary, unchecked]**.
- A refuted claim usually means the *framing* failed (self-reported SOTA contradicted elsewhere, superseded revision, overreach), not that the paper's table is wrong. Read the verifier notes before dismissing a paper.
- No source reports Snapdragon 680 latency. Treat every FPS figure as desktop/server until we benchmark on device.
- New reviews go in as `algorithm-review-YYYY-MM.md`, with raw data under `data/`.
