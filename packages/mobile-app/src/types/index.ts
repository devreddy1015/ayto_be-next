import type { SportId } from "../sports"

export type SpeedUnit = "kmh" | "mph"

export interface UserProfile {
  id: string
  name: string
}

export interface SessionSummary {
  id: string
  sport: SportId
  created_at: string
  duration_seconds: number
  max_speed_kmh: number
  avg_speed_kmh: number
  strokes_count: number
  dominant_stroke: string | null
}

export type DrillLevel = "beginner" | "intermediate" | "advanced"

export interface Drill {
  id: string
  sport: SportId
  title: string
  /** A stroke id from the sport's taxonomy. */
  stroke: string
  level: DrillLevel
  minutes: number
  description: string
  steps: readonly string[]
  equipment: readonly string[]
  benefits: readonly string[]
}

/** One row of a you-vs-pro ledger. Higher is better for every row. */
export interface LedgerRow {
  id: string
  label: string
  unit: string
  you: number
  pro: number
}

export interface ProPlayer {
  id: string
  name: string
  country: string
  /** Pro values keyed by LedgerRow id. */
  values: Record<string, number>
}
