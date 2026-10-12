import type { SportId } from "../sports"

/**
 * Real court markings, in metres, from each sport's own rulebook.
 *
 * The frame matches the CV stack (packages/cv-core/src/sports.py): the origin
 * is the near-left corner of the play area, +x runs across the width, +y runs
 * away from the camera along the length, and the net — where there is one —
 * sits at `length / 2`. Keeping the two in step means the diagram a player
 * sees is the same geometry the calibration solves for.
 *
 * Sources: BWF Laws App. 1; ITF Rules of Tennis App. I; ITTF 2.1-2.2;
 * USA Pickleball 2C; WSF Singles Court Specification; FIP Rule 1;
 * MCC Laws App. B; IFAB Law 1; FIBA Rule 2.
 */

/** A painted line. `weight` is drawing emphasis, not a real line width. */
export interface CourtLine {
  x1: number
  y1: number
  x2: number
  y2: number
  weight?: "boundary" | "line" | "faint"
  /** Draw as the net rather than paint. */
  net?: boolean
}

export interface CourtZone {
  x: number
  y: number
  w: number
  h: number
  /** 0-1, how strongly to tint it. */
  fill?: number
  label?: string
}

export interface CourtCircle {
  cx: number
  cy: number
  r: number
  /** Degrees, clockwise from +x. Omit for a full circle. */
  from?: number
  to?: number
}

/**
 * Where to stand the phone, measured rather than guessed.
 *
 * `out` is metres OUTSIDE the left sideline and `back` is metres behind the
 * near baseline, so (0, 0) is the near-left corner itself. `worstError` is the
 * largest launch-speed error seen across five shot directions in simulation
 * with 2 px of tap noise and 1 px of detector noise — the real figure on real
 * footage will be worse, because no model has met real footage yet.
 */
export interface CameraSpot {
  out: number
  back: number
  height: number
  /** Which end to stand behind. Squash has only a glass back wall. */
  side?: "near" | "far"
  /** Why this spot and not the obvious one. */
  why: string
  meanError?: number
  worstError?: number
  /**
   * Which lens reaches. Most sports need the ultrawide: a venue's run-off is
   * smaller than the main lens needs to take in the whole area. Badminton
   * leaves 2.3 m behind the baseline (BWF 1.4.1); the main lens needs 4.2 m.
   */
  lens: "main" | "ultrawide"
  /** More space than the rulebook guarantees, and what it buys. */
  ifYouHaveRoom?: string
}

export interface CourtPlan {
  width: number
  length: number
  /** Overall size as players say it, e.g. "13.4 × 6.1 m". */
  size: string
  lines: readonly CourtLine[]
  zones?: readonly CourtZone[]
  circles?: readonly CourtCircle[]
  /** Short notes keyed to what the diagram shows. */
  marks: readonly string[]
  camera: CameraSpot | null
  /** Why there is no camera spot yet. */
  cameraNote?: string
}

const BADMINTON: CourtPlan = {
  width: 6.1,
  length: 13.4,
  size: "13.4 × 6.1 m",
  lines: [
    // Doubles boundary.
    { x1: 0, y1: 0, x2: 6.1, y2: 0, weight: "boundary" },
    { x1: 0, y1: 13.4, x2: 6.1, y2: 13.4, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 13.4, weight: "boundary" },
    { x1: 6.1, y1: 0, x2: 6.1, y2: 13.4, weight: "boundary" },
    // Singles sidelines, 0.46 m inside the doubles ones.
    { x1: 0.46, y1: 0, x2: 0.46, y2: 13.4 },
    { x1: 5.64, y1: 0, x2: 5.64, y2: 13.4 },
    // Short service lines, 1.98 m from the net.
    { x1: 0, y1: 4.72, x2: 6.1, y2: 4.72 },
    { x1: 0, y1: 8.68, x2: 6.1, y2: 8.68 },
    // Doubles long service lines, 0.76 m in from the back.
    { x1: 0, y1: 0.76, x2: 6.1, y2: 0.76 },
    { x1: 0, y1: 12.64, x2: 6.1, y2: 12.64 },
    // Centre line, short service line to back boundary in each half.
    { x1: 3.05, y1: 0, x2: 3.05, y2: 4.72 },
    { x1: 3.05, y1: 8.68, x2: 3.05, y2: 13.4 },
    { x1: 0, y1: 6.7, x2: 6.1, y2: 6.7, net: true },
  ],
  marks: ["Net 1.55 m at the posts", "Singles lines 0.46 m inside", "Service line 1.98 m from the net"],
  camera: {
    out: 2,
    back: 1.5,
    height: 2.5,
    lens: "ultrawide",
    why: "Wide of the centre line, so no rally direction flies straight at the lens.",
    meanError: 4,
    worstError: 10.2,
    ifYouHaveRoom:
      "With 5 m clear behind the baseline, switch to the main 1x lens and step back — the " +
      "shuttle fills more of the frame and the worst case drops from 10% to 3.5%.",
  },
}

const TENNIS: CourtPlan = {
  width: 10.97,
  length: 23.77,
  size: "23.77 × 10.97 m",
  lines: [
    { x1: 0, y1: 0, x2: 10.97, y2: 0, weight: "boundary" },
    { x1: 0, y1: 23.77, x2: 10.97, y2: 23.77, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 23.77, weight: "boundary" },
    { x1: 10.97, y1: 0, x2: 10.97, y2: 23.77, weight: "boundary" },
    // Singles sidelines, 1.37 m inside the doubles ones.
    { x1: 1.37, y1: 0, x2: 1.37, y2: 23.77 },
    { x1: 9.6, y1: 0, x2: 9.6, y2: 23.77 },
    // Service lines, 6.40 m from the net, singles width only.
    { x1: 1.37, y1: 5.485, x2: 9.6, y2: 5.485 },
    { x1: 1.37, y1: 18.285, x2: 9.6, y2: 18.285 },
    { x1: 5.485, y1: 5.485, x2: 5.485, y2: 18.285 },
    // Centre marks on the baselines.
    { x1: 5.485, y1: 0, x2: 5.485, y2: 0.1, weight: "faint" },
    { x1: 5.485, y1: 23.67, x2: 5.485, y2: 23.77, weight: "faint" },
    { x1: 0, y1: 11.885, x2: 10.97, y2: 11.885, net: true },
  ],
  marks: ["Net 0.914 m at the centre", "Singles lines 1.37 m inside", "Service box 6.40 m deep"],
  camera: {
    out: 3.5,
    back: 3,
    height: 3.5,
    lens: "ultrawide",
    why: "Wide and high. The court is long, so height does more here than distance.",
    meanError: 3.2,
    worstError: 5.1,
  },
}

const TABLE_TENNIS: CourtPlan = {
  width: 1.525,
  length: 2.74,
  size: "2.74 × 1.525 m",
  lines: [
    { x1: 0, y1: 0, x2: 1.525, y2: 0, weight: "boundary" },
    { x1: 0, y1: 2.74, x2: 1.525, y2: 2.74, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 2.74, weight: "boundary" },
    { x1: 1.525, y1: 0, x2: 1.525, y2: 2.74, weight: "boundary" },
    // Centre line, for doubles service only.
    { x1: 0.7625, y1: 0, x2: 0.7625, y2: 2.74, weight: "faint" },
    { x1: 0, y1: 1.37, x2: 1.525, y2: 1.37, net: true },
  ],
  marks: ["Net 15.25 cm", "Table top 76 cm off the floor", "Centre line for doubles"],
  camera: {
    out: 1,
    back: 2.5,
    height: 1.5,
    lens: "main",
    why: "Low and close. The table is small, so the ball stays large in frame.",
    meanError: 0.7,
    worstError: 0.9,
  },
}

const PICKLEBALL: CourtPlan = {
  width: 6.1,
  length: 13.41,
  size: "13.41 × 6.10 m",
  lines: [
    { x1: 0, y1: 0, x2: 6.1, y2: 0, weight: "boundary" },
    { x1: 0, y1: 13.41, x2: 6.1, y2: 13.41, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 13.41, weight: "boundary" },
    { x1: 6.1, y1: 0, x2: 6.1, y2: 13.41, weight: "boundary" },
    // Non-volley ("kitchen") lines, 2.13 m from the net.
    { x1: 0, y1: 4.575, x2: 6.1, y2: 4.575 },
    { x1: 0, y1: 8.835, x2: 6.1, y2: 8.835 },
    // Centre line, kitchen line to baseline in each half.
    { x1: 3.05, y1: 0, x2: 3.05, y2: 4.575 },
    { x1: 3.05, y1: 8.835, x2: 3.05, y2: 13.41 },
    { x1: 0, y1: 6.705, x2: 6.1, y2: 6.705, net: true },
  ],
  zones: [
    { x: 0, y: 4.575, w: 6.1, h: 2.13, fill: 0.5, label: "Kitchen" },
    { x: 0, y: 6.705, w: 6.1, h: 2.13, fill: 0.5 },
  ],
  marks: ["Net 0.86 m at the centre", "Kitchen 2.13 m either side", "No volleying inside it"],
  camera: {
    out: 3,
    back: 3,
    height: 1.5,
    lens: "ultrawide",
    why: "Same court as badminton, but the ball is slower, so a lower, wider spot works.",
    meanError: 1.5,
    worstError: 2.3,
  },
}

const SQUASH: CourtPlan = {
  width: 6.4,
  length: 9.75,
  size: "9.75 × 6.40 m",
  lines: [
    // y = 0 is the front wall; the glass back wall is at y = 9.75.
    { x1: 0, y1: 0, x2: 6.4, y2: 0, weight: "boundary" },
    { x1: 0, y1: 9.75, x2: 6.4, y2: 9.75, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 9.75, weight: "boundary" },
    { x1: 6.4, y1: 0, x2: 6.4, y2: 9.75, weight: "boundary" },
    // Short line, 4.26 m from the front wall.
    { x1: 0, y1: 4.26, x2: 6.4, y2: 4.26 },
    // Half-court line, short line to back wall.
    { x1: 3.2, y1: 4.26, x2: 3.2, y2: 9.75 },
    // Service boxes, 1.6 m square against each side wall.
    { x1: 1.6, y1: 4.26, x2: 1.6, y2: 5.86 },
    { x1: 0, y1: 5.86, x2: 1.6, y2: 5.86 },
    { x1: 4.8, y1: 4.26, x2: 4.8, y2: 5.86 },
    { x1: 4.8, y1: 5.86, x2: 6.4, y2: 5.86 },
  ],
  zones: [
    { x: 0, y: 4.26, w: 1.6, h: 1.6, fill: 0.4, label: "Service box" },
    { x: 4.8, y: 4.26, w: 1.6, h: 1.6, fill: 0.4 },
  ],
  marks: ["Front wall at the top", "Short line 4.26 m back", "Service boxes 1.6 m square"],
  camera: {
    out: 0,
    back: 3,
    height: 2.5,
    side: "far",
    lens: "ultrawide",
    why: "Through the glass back wall, square on. Four walls leave nowhere else.",
  },
  cameraNote:
    "Ayto reports no ball speed for squash. The ball rebounds off the front wall without the " +
    "vertical turn that bounce detection needs, so a single flight arc fitted across it would " +
    "read high. Pose and footwork still work from here.",
}

const PADEL: CourtPlan = {
  width: 10,
  length: 20,
  size: "20 × 10 m",
  lines: [
    { x1: 0, y1: 0, x2: 10, y2: 0, weight: "boundary" },
    { x1: 0, y1: 20, x2: 10, y2: 20, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 20, weight: "boundary" },
    { x1: 10, y1: 0, x2: 10, y2: 20, weight: "boundary" },
    // Service lines, 6.95 m from the net.
    { x1: 0, y1: 3.05, x2: 10, y2: 3.05 },
    { x1: 0, y1: 16.95, x2: 10, y2: 16.95 },
    { x1: 5, y1: 3.05, x2: 5, y2: 16.95 },
    { x1: 0, y1: 10, x2: 10, y2: 10, net: true },
  ],
  marks: ["Net 0.88 m at the centre", "Service line 6.95 m from the net", "Glass walls all round"],
  camera: {
    out: 0,
    back: 3,
    height: 3,
    lens: "ultrawide",
    why: "Behind the back glass, raised. The cage leaves no wide angle.",
  },
  cameraNote:
    "Ayto reports no ball speed for padel either — the walls break the single-arc flight model " +
    "the speed fit depends on.",
}

const CRICKET: CourtPlan = {
  width: 3.05,
  length: 20.12,
  size: "20.12 × 3.05 m",
  lines: [
    { x1: 0, y1: 0, x2: 3.05, y2: 0, weight: "boundary" },
    { x1: 0, y1: 20.12, x2: 3.05, y2: 20.12, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 20.12, weight: "boundary" },
    { x1: 3.05, y1: 0, x2: 3.05, y2: 20.12, weight: "boundary" },
    // Bowling creases, level with the stumps at each end.
    { x1: 0.2, y1: 1.22, x2: 2.85, y2: 1.22 },
    { x1: 0.2, y1: 18.9, x2: 2.85, y2: 18.9 },
    // Popping creases, 1.22 m in front of each set of stumps.
    { x1: 0, y1: 2.44, x2: 3.05, y2: 2.44 },
    { x1: 0, y1: 17.68, x2: 3.05, y2: 17.68 },
    // Return creases, 1.32 m either side of the middle stump.
    { x1: 0.205, y1: 1.22, x2: 0.205, y2: 2.44 },
    { x1: 2.845, y1: 1.22, x2: 2.845, y2: 2.44 },
    { x1: 0.205, y1: 17.68, x2: 0.205, y2: 18.9 },
    { x1: 2.845, y1: 17.68, x2: 2.845, y2: 18.9 },
  ],
  marks: ["Stumps 20.12 m apart", "Popping crease 1.22 m in front", "Return crease 1.32 m either side"],
  camera: null,
  cameraNote: "Nothing is built for cricket yet, so there is no measured camera position to give you.",
}

const FOOTBALL: CourtPlan = {
  width: 68,
  length: 105,
  size: "105 × 68 m",
  lines: [
    { x1: 0, y1: 0, x2: 68, y2: 0, weight: "boundary" },
    { x1: 0, y1: 105, x2: 68, y2: 105, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 105, weight: "boundary" },
    { x1: 68, y1: 0, x2: 68, y2: 105, weight: "boundary" },
    { x1: 0, y1: 52.5, x2: 68, y2: 52.5 },
    // Penalty areas, 16.5 m deep and 40.32 m wide.
    { x1: 13.84, y1: 0, x2: 13.84, y2: 16.5 },
    { x1: 54.16, y1: 0, x2: 54.16, y2: 16.5 },
    { x1: 13.84, y1: 16.5, x2: 54.16, y2: 16.5 },
    { x1: 13.84, y1: 105, x2: 13.84, y2: 88.5 },
    { x1: 54.16, y1: 105, x2: 54.16, y2: 88.5 },
    { x1: 13.84, y1: 88.5, x2: 54.16, y2: 88.5 },
    // Goal areas, 5.5 m deep and 18.32 m wide.
    { x1: 24.84, y1: 0, x2: 24.84, y2: 5.5, weight: "faint" },
    { x1: 43.16, y1: 0, x2: 43.16, y2: 5.5, weight: "faint" },
    { x1: 24.84, y1: 5.5, x2: 43.16, y2: 5.5, weight: "faint" },
    { x1: 24.84, y1: 105, x2: 24.84, y2: 99.5, weight: "faint" },
    { x1: 43.16, y1: 105, x2: 43.16, y2: 99.5, weight: "faint" },
    { x1: 24.84, y1: 99.5, x2: 43.16, y2: 99.5, weight: "faint" },
  ],
  circles: [{ cx: 34, cy: 52.5, r: 9.15 }],
  marks: ["Centre circle 9.15 m", "Penalty area 16.5 m deep", "Penalty spot 11 m out"],
  camera: null,
  cameraNote: "Nothing is built for football yet, so there is no measured camera position to give you.",
}

const BASKETBALL: CourtPlan = {
  width: 15,
  length: 28,
  size: "28 × 15 m",
  lines: [
    { x1: 0, y1: 0, x2: 15, y2: 0, weight: "boundary" },
    { x1: 0, y1: 28, x2: 15, y2: 28, weight: "boundary" },
    { x1: 0, y1: 0, x2: 0, y2: 28, weight: "boundary" },
    { x1: 15, y1: 0, x2: 15, y2: 28, weight: "boundary" },
    { x1: 0, y1: 14, x2: 15, y2: 14 },
    // Keys, 4.9 m wide and 5.8 m from the baseline.
    { x1: 5.05, y1: 0, x2: 5.05, y2: 5.8 },
    { x1: 9.95, y1: 0, x2: 9.95, y2: 5.8 },
    { x1: 5.05, y1: 5.8, x2: 9.95, y2: 5.8 },
    { x1: 5.05, y1: 28, x2: 5.05, y2: 22.2 },
    { x1: 9.95, y1: 28, x2: 9.95, y2: 22.2 },
    { x1: 5.05, y1: 22.2, x2: 9.95, y2: 22.2 },
    // Three-point lines: straight sections 0.9 m from each sideline.
    { x1: 0.9, y1: 0, x2: 0.9, y2: 2.99, weight: "faint" },
    { x1: 14.1, y1: 0, x2: 14.1, y2: 2.99, weight: "faint" },
    { x1: 0.9, y1: 28, x2: 0.9, y2: 25.01, weight: "faint" },
    { x1: 14.1, y1: 28, x2: 14.1, y2: 25.01, weight: "faint" },
  ],
  circles: [
    { cx: 7.5, cy: 14, r: 1.8 },
    // Three-point arcs, 6.75 m from the basket (1.575 m off the baseline).
    { cx: 7.5, cy: 1.575, r: 6.75, from: -10, to: 190 },
    { cx: 7.5, cy: 26.425, r: 6.75, from: 170, to: 370 },
  ],
  marks: ["Three-point arc 6.75 m", "Key 4.9 m wide", "Free throw 5.8 m out"],
  camera: null,
  cameraNote: "Nothing is built for basketball yet, so there is no measured camera position to give you.",
}

export const COURTS: Record<SportId, CourtPlan> = {
  badminton: BADMINTON,
  tennis: TENNIS,
  table_tennis: TABLE_TENNIS,
  pickleball: PICKLEBALL,
  squash: SQUASH,
  padel: PADEL,
  cricket: CRICKET,
  football: FOOTBALL,
  basketball: BASKETBALL,
}

export function getCourt(sport: SportId): CourtPlan {
  return COURTS[sport] ?? BADMINTON
}
