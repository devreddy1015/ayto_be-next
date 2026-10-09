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

/** Three riso inks per sport, each checked for contrast on the black stock. */
export interface RisoPalette {
  /** Ink A: heading plates and primary fills. */
  plate: string
  /** Ink B: the hard offset plate. Decorative only, may be dark. */
  shadow: string
  /** Text-safe accent on the stock (>= 4.5:1). */
  ink: string
  /** Second data tone (>= 3:1). */
  ink2: string
  /** Third data tone (>= 3:1). */
  ink3: string
  /** Misregistered ghost behind paper-coloured type; picked to separate from cream. */
  ghost: string
  /** Text colour on a plate. */
  onPlate: string
  /** Real riso ink names, for the colophon. */
  names: readonly [string, string, string]
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
  palette: RisoPalette
  playArea: { label: string; size: string }
  tracked: "shuttle" | "ball"
  /** What one action is called: "stroke", "shot", "delivery"… */
  strokeNoun: string
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

const DARK = "#121011"

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
      plate: "#FF48B0",
      shadow: "#3255A4",
      ink: "#FF6EC0",
      ink2: "#6F9BEA",
      ink3: "#FFE800",
      ghost: "#FF48B0",
      onPlate: DARK,
      names: ["Fluorescent Pink", "Medium Blue", "Yellow"],
    },
    playArea: { label: "Court", size: "13.4 × 6.1 m" },
    tracked: "shuttle",
    strokeNoun: "stroke",
    strokes: [s("smash", "Smash"), s("drop", "Drop"), s("clear", "Clear"), s("net", "Net"), s("serve", "Serve"), s("defensive", "Defence")],
    metrics: [m("smash_speed", "Smash speed", "km/h"), m("strokes", "Strokes", ""), m("form", "Form score", "/100")],
    status: "live",
    statusNote: "Shuttle tracking, pose, stroke classification, speed and pro comparison all run today.",
  },
  {
    id: "tennis",
    name: "Tennis",
    code: "Tn",
    section: "racket",
    tagline: "Serve speed, groundstroke rhythm and where you stand on court.",
    heading: ["Serve", "bigger."],
    palette: {
      plate: "#FFE916",
      shadow: "#00A95C",
      ink: "#FFE916",
      ink2: "#3FC487",
      ink3: "#FF6C2F",
      ghost: "#00A95C",
      onPlate: DARK,
      names: ["Fluorescent Yellow", "Green", "Orange"],
    },
    playArea: { label: "Court", size: "23.77 × 10.97 m" },
    tracked: "ball",
    strokeNoun: "stroke",
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
      plate: "#FF6C2F",
      shadow: "#0078BF",
      ink: "#FF8A57",
      ink2: "#4AA6E8",
      ink3: "#FFE800",
      ghost: "#FF6C2F",
      onPlate: DARK,
      names: ["Orange", "Blue", "Yellow"],
    },
    playArea: { label: "Table", size: "2.74 × 1.525 m" },
    tracked: "ball",
    strokeNoun: "stroke",
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
      plate: "#E3ED55",
      shadow: "#00838A",
      ink: "#E3ED55",
      ink2: "#2FB8BF",
      ink3: "#FF48B0",
      ghost: "#00838A",
      onPlate: DARK,
      names: ["Light Lime", "Teal", "Fluorescent Pink"],
    },
    playArea: { label: "Court", size: "13.41 × 6.10 m" },
    tracked: "ball",
    strokeNoun: "shot",
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
      plate: "#F65058",
      shadow: "#484D7A",
      ink: "#FF7477",
      ink2: "#8E93C9",
      ink3: "#F2CDCF",
      ghost: "#F65058",
      onPlate: DARK,
      names: ["Scarlet", "Indigo", "Bisque"],
    },
    playArea: { label: "Court", size: "9.75 × 6.40 m" },
    tracked: "ball",
    strokeNoun: "shot",
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
      plate: "#62A8E5",
      shadow: "#235BA8",
      ink: "#7DBBEE",
      ink2: "#5EC8E5",
      ink3: "#FFB511",
      ghost: "#62A8E5",
      onPlate: DARK,
      names: ["Cornflower", "Lake", "Sunflower"],
    },
    playArea: { label: "Court", size: "20 × 10 m" },
    tracked: "ball",
    strokeNoun: "shot",
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
      plate: "#FFB511",
      shadow: "#A75154",
      ink: "#FFB511",
      ink2: "#D97A7D",
      ink3: "#82D8D5",
      ghost: "#A75154",
      onPlate: DARK,
      names: ["Sunflower", "Brick", "Mint"],
    },
    playArea: { label: "Pitch", size: "20.12 × 3.05 m" },
    tracked: "ball",
    strokeNoun: "shot",
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
      plate: "#44D62C",
      shadow: "#407060",
      ink: "#5FE04A",
      ink2: "#6FB79A",
      ink3: "#FFE916",
      ghost: "#44D62C",
      onPlate: DARK,
      names: ["Fluorescent Green", "Hunter Green", "Fluorescent Yellow"],
    },
    playArea: { label: "Pitch", size: "105 × 68 m" },
    tracked: "ball",
    strokeNoun: "touch",
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
      plate: "#FF6F4C",
      shadow: "#3D5588",
      ink: "#FF8A6C",
      ink2: "#7D95CF",
      ink3: "#BB8B41",
      ghost: "#FF6F4C",
      onPlate: DARK,
      names: ["Pumpkin", "Federal Blue", "Flat Gold"],
    },
    playArea: { label: "Court", size: "28 × 15 m" },
    tracked: "ball",
    strokeNoun: "shot",
    strokes: [s("jump_shot", "Jump shot"), s("three", "Three"), s("free_throw", "Free throw"), s("layup", "Layup"), s("floater", "Floater")],
    metrics: [m("release", "Release time", "s"), m("arc", "Shot arc", "°"), m("make_rate", "Make rate", "%")],
    status: "soon",
    statusNote: "On the roadmap, after cricket and football.",
  },
]

export const DEFAULT_SPORT_ID: SportId = "badminton"

const BY_ID = Object.fromEntries(SPORTS.map((sport) => [sport.id, sport])) as Record<SportId, Sport>

export function isSportId(id: unknown): id is SportId {
  return typeof id === "string" && id in BY_ID
}

export function getSport(id: string | null | undefined): Sport {
  return isSportId(id) ? BY_ID[id] : BY_ID[DEFAULT_SPORT_ID]
}

export const LIVE_SPORT = BY_ID[DEFAULT_SPORT_ID]

export function strokeLabel(sport: Sport, strokeId: string): string {
  return sport.strokes.find((stroke) => stroke.id === strokeId)?.label ?? strokeId
}

/** Strokes cycle through the sport's three data inks. */
export function strokeColor(sport: Sport, strokeId: string): string {
  const index = sport.strokes.findIndex((stroke) => stroke.id === strokeId)
  const { ink, ink2, ink3 } = sport.palette
  return index < 0 ? ink : [ink, ink2, ink3][index % 3]
}
