import { create } from "zustand"

type RecordingState = "idle" | "countdown" | "recording" | "paused"

/** Live HUD values. The on-device frame processor writes these; null means "not measured yet". */
interface HudReading {
  speedKmh: number | null
  stroke: string | null
}

interface SessionState {
  recordingState: RecordingState
  elapsedSeconds: number
  hud: HudReading
  setRecordingState: (state: RecordingState) => void
  tick: () => void
  setHud: (reading: Partial<HudReading>) => void
  resetSession: () => void
}

const initial = {
  recordingState: "idle" as RecordingState,
  elapsedSeconds: 0,
  hud: { speedKmh: null, stroke: null } as HudReading,
}

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,
  setRecordingState: (recordingState) => set({ recordingState }),
  tick: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),
  setHud: (reading) => set((s) => ({ hud: { ...s.hud, ...reading } })),
  resetSession: () => set(initial),
}))
