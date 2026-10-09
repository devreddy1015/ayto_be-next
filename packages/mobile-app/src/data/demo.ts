import type { SportId } from "../sports"
import type { LedgerRow, ProPlayer, SessionSummary } from "../types"

/**
 * Sample data for the demo build, keyed by sport. Only sports whose analysis
 * is live have a book; every other sport gets `null`, and screens show an
 * honest empty state instead of invented numbers.
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
  /** Ledger definitions + your values; pros fill in their side. */
  ledger: readonly Omit<LedgerRow, "pro">[]
  pros: readonly ProPlayer[]
  /** One coaching line per ledger id, used for the biggest gap. */
  coaching: Record<string, string>
}

const BADMINTON: DemoBook = {
  sessions: [
    { id: "1", sport: "badminton", created_at: "2025-05-25", duration_seconds: 1680, max_speed_kmh: 287, avg_speed_kmh: 198, strokes_count: 34, dominant_stroke: "smash" },
    { id: "2", sport: "badminton", created_at: "2025-05-24", duration_seconds: 2100, max_speed_kmh: 264, avg_speed_kmh: 185, strokes_count: 36, dominant_stroke: "clear" },
    { id: "3", sport: "badminton", created_at: "2025-05-23", duration_seconds: 1080, max_speed_kmh: 251, avg_speed_kmh: 172, strokes_count: 28, dominant_stroke: "drop" },
    { id: "4", sport: "badminton", created_at: "2025-05-20", duration_seconds: 2400, max_speed_kmh: 238, avg_speed_kmh: 165, strokes_count: 52, dominant_stroke: "smash" },
    { id: "5", sport: "badminton", created_at: "2025-05-18", duration_seconds: 900, max_speed_kmh: 221, avg_speed_kmh: 155, strokes_count: 22, dominant_stroke: "defensive" },
  ],
  weekly: [
    { day: "Mon", kmh: 245 },
    { day: "Tue", kmh: 251 },
    { day: "Wed", kmh: 264 },
    { day: "Thu", kmh: 238 },
    { day: "Fri", kmh: 287 },
    { day: "Sat", kmh: 271 },
    { day: "Sun", kmh: 256 },
  ],
  report: {
    form: 82,
    detection: 94,
    timeline: [120, 140, 180, 220, 200, 150, 100, 160, 240, 287, 250, 190, 140, 180, 230],
    timelineStepS: 2,
    mix: [
      { stroke: "smash", count: 12, avgKmh: 262 },
      { stroke: "drop", count: 8, avgKmh: 112 },
      { stroke: "clear", count: 6, avgKmh: 186 },
      { stroke: "net", count: 4, avgKmh: 48 },
      { stroke: "serve", count: 4, avgKmh: 84 },
    ],
    body: [
      { id: "elbow", label: "Elbow at contact", unit: "°", you: 152, pro: 165 },
      { id: "knee", label: "Knee bend", unit: "°", you: 138, pro: 145 },
      { id: "wrist", label: "Wrist velocity", unit: "m/s", you: 9.2, pro: 12.4 },
    ],
  },
  ledger: [
    { id: "smash_speed", label: "Smash speed", unit: "km/h", you: 287 },
    { id: "serve_speed", label: "Serve speed", unit: "km/h", you: 112 },
    { id: "elbow", label: "Elbow at contact", unit: "°", you: 148 },
    { id: "wrist", label: "Wrist velocity", unit: "m/s", you: 9.2 },
    { id: "footwork", label: "Footwork", unit: "/100", you: 71 },
    { id: "consistency", label: "Consistency", unit: "/100", you: 68 },
  ],
  pros: [
    { id: "axelsen", name: "Viktor Axelsen", country: "DEN", values: { smash_speed: 419, serve_speed: 198, elbow: 165, wrist: 12.4, footwork: 92, consistency: 94 } },
    { id: "srikanth", name: "Srikanth Kidambi", country: "IND", values: { smash_speed: 372, serve_speed: 182, elbow: 158, wrist: 10.8, footwork: 85, consistency: 87 } },
    { id: "sindhu", name: "P. V. Sindhu", country: "IND", values: { smash_speed: 356, serve_speed: 175, elbow: 160, wrist: 11.2, footwork: 88, consistency: 90 } },
  ],
  coaching: {
    smash_speed: "Load the hips before the shoulder turns. The wrist is the last link in the chain, not the first.",
    serve_speed: "Shorten the backswing and push through the shuttle. Serve pace comes from the thumb, not the arm.",
    elbow: "Reach higher at contact. A straighter elbow lengthens the lever and adds pace for free.",
    wrist: "Three sets of fifteen resistance-band pronations build the snap that turns a clear into a smash.",
    footwork: "Shadow the six corners at match pace. Points are lost on the recovery step, not the hit.",
    consistency: "Land fifty in a row on one target before adding speed. Repeatable beats fast.",
  },
}

const BOOKS: Partial<Record<SportId, DemoBook>> = { badminton: BADMINTON }

export function getDemo(sport: SportId): DemoBook | null {
  return BOOKS[sport] ?? null
}

/** Every demo session across sports, newest first. */
export const ALL_SESSIONS: readonly SessionSummary[] = Object.values(BOOKS)
  .flatMap((book) => book.sessions)
  .sort((a, b) => b.created_at.localeCompare(a.created_at))

export function findSession(id: string): SessionSummary | null {
  if (id === "latest") return ALL_SESSIONS[0] ?? null
  return ALL_SESSIONS.find((session) => session.id === id) ?? null
}
