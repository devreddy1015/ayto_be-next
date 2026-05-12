# Ayto (SportIQ) — Investor Pitch Deck Outline

---

## Slide 1: Title

**Ayto — Professional Sports Analytics from Any Smartphone**

Turning 4 billion recreational athletes into data-driven performers.

*[Demo video thumbnail — player records badminton rally, sees shuttle speed + stroke analysis in 3 seconds]*

---

## Slide 2: The Problem

**500 million active sports players in India have zero access to performance analytics.**

- Professional athletes get biomechanical analysis, shot tracking, AI coaching
- Recreational players get nothing — expensive coaches, zero feedback, no improvement path
- A 14-year-old in Vizag practicing cricket has no way to know what they're doing wrong
- Current solutions: Hawk-Eye costs ₹50 lakh+ per installation, motion capture requires studio setup

**The gap: Pro athletes improve with data. Everyone else improves with vibes.**

---

## Slide 3: The Solution

**Ayto turns any smartphone camera into a professional-grade coaching system.**

Record yourself playing → AI analyzes your form in real-time → get actionable feedback

Four core capabilities:
1. **Object tracking** — shuttle/ball speed computed from video, no hardware
2. **Body analysis** — 33 body keypoints extracted every frame, joint angles computed
3. **Shot classification** — AI identifies every stroke type with success probability
4. **Pro comparison** — "Your smash vs Viktor Axelsen" with specific angle-by-angle feedback

All processing happens on-device. No cloud dependency during analysis.

---

## Slide 4: Demo

*[Live demo or video]*

- User opens app, hits Record
- Plays a 60-second badminton rally
- Within 3 seconds of stopping: shuttle speed overlay, stroke breakdown, session dashboard
- Shows: speed trend graph, stroke distribution pie chart, weak zone heatmap
- Shows: "Your elbow angle is 15° less extended than Lakshya Sen on clears"

**Key numbers from demo:**
- Shuttle detection accuracy: **[X]%** on test videos
- Stroke classification F1: **[X]%** across 6 stroke types
- End-to-end latency: **<3 seconds** on a ₹10,000 phone

---

## Slide 5: Market

**Global sports analytics: $3.4B (2024) → $12B (2030)**

- 95% of market serves professional teams — zero grassroots innovation
- India alone: 500M recreational players, 200K+ sports academies
- Badminton: 200M players worldwide, fastest-growing racket sport
- Cricket: 2.5B fans, grassroots coaching is a ₹15,000 Cr market in India

**Our wedge:** Start with badminton (hardest tracking problem → if solved, all other sports follow), expand to cricket → table tennis → football → tennis → basketball

---

## Slide 6: Business Model

**Four revenue streams from Day 1:**

| Stream | Pricing | TAM Slice |
|--------|---------|-----------|
| B2C Subscriptions | ₹299/month per player | 500M players × 0.1% conversion = 500K users |
| B2B Academy Licenses | ₹15,000/month per court | 200K academies × 5% = 10K accounts |
| Data Licensing | Per-dataset contracts | Yonex, SG, MRF need biomechanical data for R&D |
| Talent Scouting | Revenue share with state boards | Surface hidden talent from Tier 2/3 cities |

**Year 1 target:** ₹2 Cr ARR from B2C + academy pilots
**Year 3 target:** ₹50 Cr ARR across all streams

---

## Slide 7: Technology

**Our moat is the dataset + the on-device inference pipeline.**

- **Computer Vision:** YOLOv8 fine-tuned on shuttle detection + Kalman filter tracking
- **Pose Analysis:** MediaPipe Holistic → hip-normalized keypoints → biomechanical comparison
- **Stroke AI:** BiLSTM + Attention classifier, 6 stroke types, <15ms inference on mobile
- **All on-device:** Zero cloud calls during analysis — works offline, preserves privacy

**Why now:** Phone cameras just crossed the 60fps threshold at ₹8,000 price point. This was not technically possible in 2019. By 2027 everyone will attempt this — we move now.

**Dataset moat:** 500K annotated badminton frames by Month 3 — no competitor has this for recreational play.

---

## Slide 8: Traction & Roadmap

**Phase 1 (Month 1-4): Badminton MVP**
- Android beta app with shuttle speed + stroke classification
- 50 beta users from IIT Bhilai + local clubs
- Partnership conversations with 3 academies

**Phase 2 (Month 5-7): Cricket + Scale**
- Add bowling speed, bat swing biomechanics
- Launch B2B academy product
- Target: 500 paying users

**Phase 3 (Month 8-12): Multi-sport + Data**
- Table tennis, football
- First data licensing deal
- Target: 5,000 paying users, ₹2 Cr ARR

**Year 2:** Tennis, basketball, volleyball. Expand to SEA markets.

---

## Slide 9: Team

**Founder:** [Name] — plays 6 sports competitively, [technical background], built this because no tool exists for recreational athletes to get real feedback

**Core team:** [X] engineers across 5 domain teams:
- Computer Vision (2) — shuttle/ball tracking pipeline
- Pose & Biomechanics (2) — body analysis engine
- ML Engineering (2) — model training + on-device export
- Mobile (2) — React Native app
- Data Research (1) — dataset construction + competitive analysis

*[If applicable: advisors, early supporters]*

---

## Slide 10: The Ask

**Raising ₹[X] Cr pre-seed to:**

1. Ship the badminton MVP and onboard 500 beta users (3 months)
2. Build the annotated dataset (our long-term moat)
3. Sign 5 academy pilots for B2B validation
4. Hire 2 additional ML engineers for cricket expansion

**Use of funds:**
- 60% — Engineering team (salaries + compute)
- 20% — Cloud infrastructure + GPU training
- 15% — User acquisition + academy partnerships
- 5% — Legal + ops

**Why invest now:** First-mover in India's grassroots sports analytics. The dataset we build in the next 6 months becomes the barrier to entry for everyone who comes after.

---

*Contact: [founder email] | [phone]*
*Demo: [link to recorded demo]*
