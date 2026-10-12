import { SPORTS, type Sport, type SportId } from "../sports"
import type { LedgerRow, ProPlayer, SessionSummary } from "../types"

/**
 * Sample data for every sport.
 *
 * None of this is measured. It exists so the app can be explored before any
 * footage has been analysed, and every screen that shows it says so. The
 * numbers are generated from each sport's own profile — its strokes, its
 * headline metrics and the realistic amateur range below — rather than being
 * one hard-coded badminton object reused everywhere.
 *
 * Generation is deterministic (a seeded LCG keyed off the sport id), so the
 * same sport always shows the same session history across reloads and devices.
 */
export interface DemoBook {
  sessions: readonly SessionSummary[]
  weekly: readonly { day: string; kmh: number }[]
  report: {
    form: number
    detection: number
    /** Peak speed every `timelineStepS` seconds. */
    timeline: readonly number[]
    timelineStepS: number
    mix: readonly { stroke: string; count: number; avgKmh: number }[]
    body: readonly LedgerRow[]
  }
  /** Ledger definitions + your values; references fill in the other side. */
  ledger: readonly Omit<LedgerRow, "pro">[]
  pros: readonly ProPlayer[]
  /** One coaching line per ledger id, used for the biggest gap. */
  coaching: Record<string, string>
}

/**
 * Realistic club-level ranges, so a pickleball "sample" does not read like a
 * badminton smash. `peak` is a strong amateur result for the sport's headline
 * metric; `floor` is an ordinary one.
 */
const RANGE: Record<SportId, { floor: number; peak: number; strokesPerMin: number }> = {
  badminton: { floor: 196, peak: 287, strokesPerMin: 1.3 },
  tennis: { floor: 128, peak: 179, strokesPerMin: 1.1 },
  table_tennis: { floor: 54, peak: 83, strokesPerMin: 2.6 },
  pickleball: { floor: 48, peak: 74, strokesPerMin: 1.8 },
  squash: { floor: 112, peak: 168, strokesPerMin: 1.9 },
  padel: { floor: 78, peak: 121, strokesPerMin: 1.6 },
  cricket: { floor: 86, peak: 124, strokesPerMin: 0.7 },
  football: { floor: 71, peak: 108, strokesPerMin: 1.4 },
  basketball: { floor: 0.52, peak: 0.78, strokesPerMin: 1.2 },
}

/** Per-joint reference values by sport family — illustrative, not measured. */
const BODY: Record<string, readonly { id: string; label: string; unit: string; you: number; pro: number }[]> = {
  racket: [
    { id: "elbow", label: "Elbow at contact", unit: "°", you: 152, pro: 161 },
    { id: "knee", label: "Knee bend", unit: "°", you: 138, pro: 145 },
    { id: "wrist", label: "Wrist velocity", unit: "m/s", you: 9.2, pro: 11.5 },
  ],
  bat: [
    { id: "elbow", label: "Lead elbow", unit: "°", you: 128, pro: 141 },
    { id: "knee", label: "Front-knee flex", unit: "°", you: 146, pro: 152 },
    { id: "wrist", label: "Bat-hand speed", unit: "m/s", you: 8.1, pro: 10.4 },
  ],
  field: [
    { id: "elbow", label: "Arm swing", unit: "°", you: 94, pro: 108 },
    { id: "knee", label: "Plant-knee flex", unit: "°", you: 142, pro: 151 },
    { id: "wrist", label: "Hip rotation", unit: "°/s", you: 412, pro: 520 },
  ],
}

const COACHING_BY_ID: Record<string, (sport: Sport) => string> = {
  elbow: () => "Reach higher at contact. A straighter elbow lengthens the lever and adds pace for free.",
  knee: () => "Sink into the shot. Power starts at the floor, not the shoulder.",
  wrist: (s) => `Three sets of fifteen resistance-band rotations build the snap that turns a push into a ${s.strokeNoun}.`,
  footwork: () => "Shadow the corners at match pace. Points are lost on the recovery step, not the hit.",
  consistency: () => "Land fifty in a row on one target before adding speed. Repeatable beats fast.",
}

/** Deterministic LCG, so a sport's sample history never shifts between runs. */
function rng(seedText: string) {
  let seed = 0
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Fixed sample dates — the app never claims these are recent. */
const DATES = ["2025-05-25", "2025-05-24", "2025-05-23", "2025-05-20", "2025-05-18"]

function makeBook(sport: Sport): DemoBook {
  const next = rng(sport.id)
  const { floor, peak, strokesPerMin } = RANGE[sport.id]
  const span = peak - floor
  // Keep enough precision for the metric's own scale: a release time lives
  // between 0.5 and 0.8 s, where rounding to one decimal loses the difference.
  const round = (n: number) =>
    peak > 100 ? Math.round(n) : peak > 5 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100

  const sessions: SessionSummary[] = DATES.map((date, i) => {
    // Best session first, then a gentle decline, so "vs previous" reads well.
    const slide = i / (DATES.length - 1)
    const max = floor + span * (1 - slide * 0.72) - next() * span * 0.06
    const minutes = 15 + Math.round(next() * 25)
    return {
      id: `${sport.id}-${i + 1}`,
      sport: sport.id,
      created_at: date,
      duration_seconds: minutes * 60,
      max_speed_kmh: round(max),
      avg_speed_kmh: round(max * (0.66 + next() * 0.05)),
      strokes_count: Math.round(minutes * strokesPerMin * (0.85 + next() * 0.3)),
      dominant_stroke: sport.strokes[Math.floor(next() * Math.min(3, sport.strokes.length))].id,
    }
  })

  const best = sessions[0]

  const weekly = DAYS.map((day) => ({
    day,
    kmh: round(floor + span * (0.45 + next() * 0.55)),
  }))

  // A rally: speeds rise into the middle of the session and tail off.
  const timeline = Array.from({ length: 15 }, (_, i) => {
    const arc = Math.sin((i / 14) * Math.PI)
    return round(floor * 0.62 + (best.max_speed_kmh - floor * 0.62) * (0.35 + arc * 0.65) * (0.9 + next() * 0.2))
  })

  // Stroke mix across the sport's own taxonomy, heaviest on the first few.
  const strokes = sport.strokes.slice(0, 5)
  const weights = strokes.map((_, i) => Math.max(1, Math.round(12 * Math.pow(0.68, i) * (0.85 + next() * 0.3))))
  const total = weights.reduce((a, b) => a + b, 0)
  const scale = best.strokes_count / total
  const mix = strokes.map((stroke, i) => ({
    stroke: stroke.id,
    count: Math.max(1, Math.round(weights[i] * scale)),
    avgKmh: round(floor * 0.55 + span * (1 - i * 0.17) * (0.6 + next() * 0.2)),
  }))

  const body = BODY[sport.section].map((row) => ({ ...row }))

  const headline = sport.metrics[0]
  const ledger: Omit<LedgerRow, "pro">[] = [
    { id: "headline", label: headline.label, unit: headline.unit, you: best.max_speed_kmh },
    { id: "avg", label: `Average ${sport.strokeNoun}`, unit: headline.unit, you: best.avg_speed_kmh },
    { id: "elbow", label: body[0].label, unit: body[0].unit, you: body[0].you },
    { id: "wrist", label: body[2].label, unit: body[2].unit, you: body[2].you },
    { id: "footwork", label: "Court coverage", unit: "/100", you: 64 + Math.round(next() * 14) },
    { id: "consistency", label: "Consistency", unit: "/100", you: 61 + Math.round(next() * 14) },
  ]

  // Three unnamed reference tiers. Deliberately NOT attributed to real
  // players: none of these figures is measured or sourced.
  const tiers = [
    { id: "elite", name: "Elite reference", gap: 1.46 },
    { id: "international", name: "International reference", gap: 1.3 },
    { id: "national", name: "National reference", gap: 1.16 },
  ]
  const pros: ProPlayer[] = tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    country: "—",
    values: Object.fromEntries(
      ledger.map((row) => [
        row.id,
        row.unit === "/100"
          ? Math.min(99, Math.round(row.you * (1 + (tier.gap - 1) * 0.6)))
          : round(row.you * tier.gap),
      ]),
    ),
  }))

  const coaching: Record<string, string> = {
    headline: `Power comes from the ground up. Load the hips before the shoulder turns — the ${sport.tracked} only knows what the last link in the chain did.`,
    avg: `Consistency beats peak. Hold 80% on every ${sport.strokeNoun} before chasing your best one.`,
  }
  for (const row of ledger) {
    const line = COACHING_BY_ID[row.id]
    if (line) coaching[row.id] = line(sport)
  }

  return {
    sessions,
    weekly,
    report: {
      form: 68 + Math.round(next() * 20),
      detection: 88 + Math.round(next() * 9),
      timeline,
      timelineStepS: 2,
      mix,
      body,
    },
    ledger,
    pros,
    coaching,
  }
}

const BOOKS: Record<SportId, DemoBook> = Object.fromEntries(
  SPORTS.map((sport) => [sport.id, makeBook(sport)]),
) as Record<SportId, DemoBook>

export function getDemo(sport: SportId): DemoBook | null {
  return BOOKS[sport] ?? null
}

export const ALL_SESSIONS: readonly SessionSummary[] = SPORTS.flatMap((s) => BOOKS[s.id].sessions)
  .slice()
  .sort((a, b) => b.created_at.localeCompare(a.created_at))

export function findSession(id: string): SessionSummary | null {
  if (id === "latest") return ALL_SESSIONS[0] ?? null
  return ALL_SESSIONS.find((s) => s.id === id) ?? null
}
