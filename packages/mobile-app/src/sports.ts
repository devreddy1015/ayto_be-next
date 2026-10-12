/**
 * Sport registry: the single source of truth for every sport-specific label,
 * colour and taxonomy in the app. Screens never hard-code a sport.
 *
 * Stroke ids mirror the backend taxonomy (packages/ml-models/src/stroke_taxonomy.py)
 * and play-area sizes mirror packages/cv-core/src/sports.py, so a session coming
 * back from the pipeline maps straight onto these labels.
 *
 * `status` is deliberately honest:
 *   live — the full pipeline runs (tracking, pose, strokes, speed, pro compare)
 *   beta — court geometry + stroke taxonomy exist, models are still training;
 *          the app shows no metrics for these yet
 *   soon — on the roadmap only
 */

export type SportId =
  | "badminton"
  | "tennis"
  | "table_tennis"
  | "pickleball"
  | "squash"
  | "padel"
  | "cricket"
  | "football"
  | "basketball"

export type AnalysisStatus = "live" | "beta" | "soon"
export type SportSection = "racket" | "bat" | "field"

/**
 * One sport's tint of the shared surfaces.
 *
 * `accent` is a FILL colour — never put text in it on the canvas. Use `ink`
 * (>=4.6:1) or `deep` (>=7.5:1) for anything readable. `grad` holds the three
 * mesh stops; `Paper.ink` clears 10:1 on every one of them.
 */
export interface SportPalette {
  /** Primary fill: buttons, bars, the live dot. */
  accent: string
  /** Accent darkened for text and icons on the canvas (>= 4.6:1). */
  ink: string
  /** Accent darkened further, for headings (>= 7.5:1). */
  deep: string
  /** Near-white accent tint: chips, wells, selected rows. */
  soft: string
  /** Text on `soft` (>= 4.6:1). */
  onSoft: string
  /** Mesh-gradient stops, corner to corner. */
  grad: readonly [string, string, string]
}

interface Stroke {
  id: string
  label: string
}

interface HeadlineMetric {
  id: string
  label: string
  unit: string
}

export interface Sport {
  id: SportId
  name: string
  /** Two-letter catalogue code, periodic-table style. */
  code: string
  section: SportSection
  tagline: string
  /** Home hero, one entry per SweepHeading line. */
  heading: readonly string[]
  palette: SportPalette
  playArea: { label: string; size: string }
  tracked: "shuttle" | "ball"
  /** What one action is called: "stroke", "shot", "delivery"… */
  strokeNoun: string
  /** Explicit plural: "touch" -> "touches", not "touchs". */
  strokeNounPlural: string
  strokes: readonly Stroke[]
  metrics: readonly HeadlineMetric[]
  status: AnalysisStatus
  statusNote: string
}

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  live: "Live analysis",
  beta: "In training",
  soon: "Coming soon",
}

export const SECTIONS: readonly { id: SportSection; title: string; deck: string }[] = [
  { id: "racket", title: "Racket & paddle", deck: "Net and wall games. One small object, moving very fast." },
  { id: "bat", title: "Bat & ball", deck: "Bat speed for batters, release speed for bowlers." },
  { id: "field", title: "Field & court", deck: "Team sports, measured one player at a time." },
]

const s = (id: string, label: string): Stroke => ({ id, label })
const m = (id: string, label: string, unit: string): HeadlineMetric => ({ id, label, unit })

export const SPORTS: readonly Sport[] = [
  {
    id: "badminton",
    name: "Badminton",
    code: "Bd",
    section: "racket",
    tagline: "The fastest racket sport on earth, measured from your phone.",
    heading: ["Smash", "harder."],
    palette: {
      accent: "#76AA97",
      ink: "#4A7767",
      deep: "#355549",
      soft: "#EDF2F0",
      onSoft: "#497565",
      grad: ["#AACBAE", "#F3EFE6", "#F0D9C4"],
    },
    playArea: { label: "Court", size: "13.4 × 6.1 m" },
    tracked: "shuttle",
    strokeNoun: "stroke",
    strokeNounPlural: "strokes",
    strokes: [s("smash", "Smash"), s("drop", "Drop"), s("clear", "Clear"), s("net", "Net"), s("serve", "Serve"), s("defensive", "Defence")],
    metrics: [m("smash_speed", "Smash speed", "km/h"), m("strokes", "Strokes", ""), m("form", "Form score", "/100")],
    status: "live",
    statusNote: "Shuttle tracking, pose, stroke classification, speed and pro comparison are built and tested. Running them on a clip inside the app is still in development.",
  },
  {
    id: "tennis",
    name: "Tennis",
    code: "Tn",
    section: "racket",
    tagline: "Serve speed, groundstroke rhythm and where you stand on court.",
    heading: ["Serve", "bigger."],
    palette: {
      accent: "#A4A06B",
      ink: "#726F46",
      deep: "#514E32",
      soft: "#F1F1EB",
      onSoft: "#706D45",
      grad: ["#D9DCC4", "#F5F2E8", "#E7E3C9"],
    },
    playArea: { label: "Court", size: "23.77 × 10.97 m" },
    tracked: "ball",
    strokeNoun: "stroke",
    strokeNounPlural: "strokes",
    strokes: [s("serve", "Serve"), s("forehand", "Forehand"), s("backhand", "Backhand"), s("volley", "Volley"), s("smash", "Smash"), s("lob", "Lob"), s("drop", "Drop")],
    metrics: [m("serve_speed", "Serve speed", "km/h"), m("forehand_speed", "Forehand speed", "km/h"), m("rally", "Rally length", "shots")],
    status: "beta",
    statusNote: "Court calibration and ball physics are built and the stroke model is training. No in-app analysis yet.",
  },
  {
    id: "table_tennis",
    name: "Table Tennis",
    code: "Tt",
    section: "racket",
    tagline: "Spin, speed and footwork at the table.",
    heading: ["Loop", "faster."],
    palette: {
      accent: "#A57463",
      ink: "#906353",
      deep: "#66463B",
      soft: "#F1ECEA",
      onSoft: "#8B5F50",
      grad: ["#E8C9B8", "#F5EFE8", "#DCD3C2"],
    },
    playArea: { label: "Table", size: "2.74 × 1.525 m" },
    tracked: "ball",
    strokeNoun: "stroke",
    strokeNounPlural: "strokes",
    strokes: [s("serve", "Serve"), s("forehand", "Forehand"), s("backhand", "Backhand"), s("push", "Push"), s("block", "Block"), s("chop", "Chop"), s("smash", "Smash"), s("lob", "Lob")],
    metrics: [m("ball_speed", "Ball speed", "km/h"), m("rally", "Rally length", "shots"), m("tempo", "Tempo", "shots/min")],
    status: "beta",
    statusNote: "Table geometry and ball physics are built and the stroke model is training. No in-app analysis yet.",
  },
  {
    id: "pickleball",
    name: "Pickleball",
    code: "Pk",
    section: "racket",
    tagline: "Dinks, drops and owning the kitchen line.",
    heading: ["Own the", "kitchen."],
    palette: {
      accent: "#D89648",
      ink: "#986120",
      deep: "#6D4617",
      soft: "#F7F0E8",
      onSoft: "#966020",
      grad: ["#F2D9B4", "#F7F2E8", "#DDE2D4"],
    },
    playArea: { label: "Court", size: "13.41 × 6.10 m" },
    tracked: "ball",
    strokeNoun: "shot",
    strokeNounPlural: "shots",
    strokes: [s("serve", "Serve"), s("forehand", "Forehand"), s("backhand", "Backhand"), s("dink", "Dink"), s("drop", "Drop"), s("volley", "Volley"), s("smash", "Smash"), s("lob", "Lob")],
    metrics: [m("drive_speed", "Drive speed", "km/h"), m("drop_rate", "Drops into the kitchen", "%"), m("dink_rally", "Dink rally", "shots")],
    status: "beta",
    statusNote: "Court geometry and ball physics are built and the shot model is training. No in-app analysis yet.",
  },
  {
    id: "squash",
    name: "Squash",
    code: "Sq",
    section: "racket",
    tagline: "Four walls, one ball, nowhere to hide.",
    heading: ["Hit the", "nick."],
    palette: {
      accent: "#B2706F",
      ink: "#A45958",
      deep: "#753F3E",
      soft: "#F3ECEC",
      onSoft: "#9E5655",
      grad: ["#E6C6C3", "#F5EEEA", "#D8DBCF"],
    },
    playArea: { label: "Court", size: "9.75 × 6.40 m" },
    tracked: "ball",
    strokeNoun: "shot",
    strokeNounPlural: "shots",
    strokes: [s("serve", "Serve"), s("forehand", "Forehand"), s("backhand", "Backhand"), s("volley", "Volley"), s("drop", "Drop"), s("boast", "Boast"), s("lob", "Lob")],
    metrics: [m("ball_speed", "Ball speed", "km/h"), m("t_recovery", "Back to the T", "s"), m("rally", "Rally length", "shots")],
    status: "beta",
    statusNote: "Court geometry and ball physics are built and the shot model is training. No in-app analysis yet.",
  },
  {
    id: "padel",
    name: "Padel",
    code: "Pd",
    section: "racket",
    tagline: "Glass walls, bandejas and patient points.",
    heading: ["Play the", "glass."],
    palette: {
      accent: "#6E9BB5",
      ink: "#48738D",
      deep: "#335264",
      soft: "#ECF1F3",
      onSoft: "#467089",
      grad: ["#C3D9E4", "#F0F3F2", "#CFE2D4"],
    },
    playArea: { label: "Court", size: "20 × 10 m" },
    tracked: "ball",
    strokeNoun: "shot",
    strokeNounPlural: "shots",
    strokes: [s("serve", "Serve"), s("forehand", "Forehand"), s("backhand", "Backhand"), s("volley", "Volley"), s("bandeja", "Bandeja"), s("vibora", "Víbora"), s("smash", "Smash"), s("lob", "Lob")],
    metrics: [m("smash_speed", "Smash speed", "km/h"), m("bandeja_speed", "Bandeja speed", "km/h"), m("net_time", "Time at net", "%")],
    status: "soon",
    statusNote: "Court geometry is in. The shot taxonomy and models come next.",
  },
  {
    id: "cricket",
    name: "Cricket",
    code: "Cr",
    section: "bat",
    tagline: "Bat speed for batters, release speed for bowlers.",
    heading: ["Middle", "it."],
    palette: {
      accent: "#C0924F",
      ink: "#8C6732",
      deep: "#644A24",
      soft: "#F4EFE8",
      onSoft: "#886431",
      grad: ["#E8D6B2", "#F6F1E6", "#D3D6BC"],
    },
    playArea: { label: "Pitch", size: "20.12 × 3.05 m" },
    tracked: "ball",
    strokeNoun: "shot",
    strokeNounPlural: "shots",
    strokes: [s("drive", "Drive"), s("pull", "Pull"), s("cut", "Cut"), s("sweep", "Sweep"), s("defence", "Defence"), s("pace", "Pace ball"), s("spin", "Spin ball")],
    metrics: [m("release_speed", "Release speed", "km/h"), m("bat_speed", "Bat speed", "km/h"), m("length", "Length", "m")],
    status: "soon",
    statusNote: "Next on the roadmap after the racket sports.",
  },
  {
    id: "football",
    name: "Football",
    code: "Fb",
    section: "field",
    tagline: "Shot power, first touch and sprint load.",
    heading: ["Strike", "clean."],
    palette: {
      accent: "#6FA67C",
      ink: "#4A7855",
      deep: "#35563D",
      soft: "#ECF2ED",
      onSoft: "#497654",
      grad: ["#BFDCC2", "#F1F4EA", "#E3DCC6"],
    },
    playArea: { label: "Pitch", size: "105 × 68 m" },
    tracked: "ball",
    strokeNoun: "touch",
    strokeNounPlural: "touches",
    strokes: [s("shot", "Shot"), s("pass", "Pass"), s("cross", "Cross"), s("header", "Header"), s("dribble", "Dribble"), s("first_touch", "First touch")],
    metrics: [m("shot_speed", "Shot speed", "km/h"), m("sprint", "Top sprint", "km/h"), m("touches", "Touches", "")],
    status: "soon",
    statusNote: "On the roadmap. Single-player drills first, then match footage.",
  },
  {
    id: "basketball",
    name: "Basketball",
    code: "Bk",
    section: "field",
    tagline: "Shot arc, release time and range.",
    heading: ["Find your", "arc."],
    palette: {
      accent: "#C47A4E",
      ink: "#A05D35",
      deep: "#714226",
      soft: "#F5EDE8",
      onSoft: "#9A5A33",
      grad: ["#EFCBAE", "#F7F0E8", "#DCD8C8"],
    },
    playArea: { label: "Court", size: "28 × 15 m" },
    tracked: "ball",
    strokeNoun: "shot",
    strokeNounPlural: "shots",
    strokes: [s("jump_shot", "Jump shot"), s("three", "Three"), s("free_throw", "Free throw"), s("layup", "Layup"), s("floater", "Floater")],
    metrics: [m("release", "Release time", "s"), m("arc", "Shot arc", "°"), m("make_rate", "Make rate", "%")],
    status: "soon",
    statusNote: "On the roadmap, after cricket and football.",
  },
]

export const DEFAULT_SPORT_ID: SportId = "badminton"

const BY_ID = new Map<string, Sport>(SPORTS.map((sport) => [sport.id, sport]))

export function isSportId(id: unknown): id is SportId {
  return typeof id === "string" && BY_ID.has(id)
}

export function getSport(id: string | null | undefined): Sport {
  // A Map, not a plain object: `"constructor" in obj` is true for every
  // inherited key, and a route param like /sport/constructor would then
  // return Object instead of a Sport and crash on `sport.palette`.
  return (isSportId(id) ? BY_ID.get(id) : undefined) ?? (BY_ID.get(DEFAULT_SPORT_ID) as Sport)
}

export const LIVE_SPORT = BY_ID.get(DEFAULT_SPORT_ID) as Sport

export function strokeLabel(sport: Sport, strokeId: string): string {
  return sport.strokes.find((stroke) => stroke.id === strokeId)?.label ?? strokeId
}

/**
 * A per-stroke colour that stays readable on the canvas.
 *
 * There is one accent per sport now, not three inks, so strokes are separated
 * by weight rather than hue: the first is the full accent, later ones step
 * towards the text colour. Never the only cue — pair it with a label.
 */
export function strokeColor(sport: Sport, strokeId: string): string {
  const index = sport.strokes.findIndex((stroke) => stroke.id === strokeId)
  const { accent, ink, deep } = sport.palette
  return index < 0 ? ink : [accent, deep, ink][index % 3]
}
