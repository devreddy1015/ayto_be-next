import { create } from "zustand"
import type { SportId } from "../sports"

type RecordingState = "idle" | "countdown" | "recording" | "paused"

/** Live HUD values. A frame processor would write these; null means "not measured". */
interface HudReading {
  speedKmh: number | null
  stroke: string | null
}

/** A clip the camera actually captured, waiting to be analysed. */
export interface Clip {
  uri: string
  sport: SportId
  seconds: number
}

interface SessionState {
  recordingState: RecordingState
  elapsedSeconds: number
  hud: HudReading
  /** The most recent recording, or null if nothing was captured. */
  clip: Clip | null
  setRecordingState: (state: RecordingState) => void
  tick: () => void
  setHud: (reading: Partial<HudReading>) => void
  setClip: (clip: Clip | null) => void
  resetSession: () => void
}

const initial = {
  recordingState: "idle" as RecordingState,
  elapsedSeconds: 0,
  hud: { speedKmh: null, stroke: null } as HudReading,
  clip: null as Clip | null,
}

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,
  setRecordingState: (recordingState) => set({ recordingState }),
  tick: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),
  setHud: (reading) => set((s) => ({ hud: { ...s.hud, ...reading } })),
  setClip: (clip) => set({ clip }),
  resetSession: () => set(initial),
}))
