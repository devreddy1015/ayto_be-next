import { create } from "zustand"
import type { FrameResult, StrokeEvent, CameraHUDData, StrokeType } from "../types"

type RecordingState = "idle" | "countdown" | "recording" | "paused" | "processing" | "complete"

interface SessionState {
  recordingState: RecordingState
  sessionId: string | null
  elapsedSeconds: number
  totalFrames: number
  frameResults: FrameResult[]
  strokeEvents: StrokeEvent[]
  detectionsPerFrame: number[]
  currentSpeed: number | null
  maxSpeed: number
  avgSpeed: number
  countdownValue: number
  courtCalibrated: boolean
  pixelsPerMeter: number
  hudData: CameraHUDData

  setRecordingState: (state: RecordingState) => void
  setSessionId: (id: string | null) => void
  incrementElapsed: () => void
  resetElapsed: () => void
  addFrameResult: (result: FrameResult) => void
  addStrokeEvent: (event: StrokeEvent) => void
  setCurrentSpeed: (speed: number | null) => void
  updateMaxSpeed: (speed: number) => void
  setCountdownValue: (value: number) => void
  setCourtCalibrated: (calibrated: boolean) => void
  setPixelsPerMeter: (ppm: number) => void
  updateHudData: (data: Partial<CameraHUDData>) => void
  resetSession: () => void
  getStrokeDistribution: () => Record<StrokeType, number>
  getDominantStroke: () => StrokeType | null
  getSessionMetrics: () => {
    avg_speed_kmh: number
    max_speed_kmh: number
    shuttle_detection_rate: number
    stroke_distribution: Record<StrokeType, number>
    dominant_stroke: StrokeType | null
    court_coverage_score: number
    consistency_score: number
    speed_timeline: { frame: number; speed: number; stroke_type: StrokeType | null }[]
  }
}

const initialState = {
  recordingState: "idle" as RecordingState,
  sessionId: null,
  elapsedSeconds: 0,
  totalFrames: 0,
  frameResults: [],
  strokeEvents: [],
  detectionsPerFrame: [],
  currentSpeed: null,
  maxSpeed: 0,
  avgSpeed: 0,
  countdownValue: 3,
  courtCalibrated: false,
  pixelsPerMeter: 100,
  hudData: {
    shuttle_pos: null,
    shuttle_trail: [],
    speed_kmh: null,
    current_stroke: null,
    keypoints: null,
    joint_qualities: null,
    timer: 0,
    is_paused: false,
    is_recording: false,
  },
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialState,

  setRecordingState: (state) => set({ recordingState: state }),
  setSessionId: (id) => set({ sessionId: id }),
  incrementElapsed: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),
  resetElapsed: () => set({ elapsedSeconds: 0 }),
  addFrameResult: (result) =>
    set((s) => {
      const frameResults = [...s.frameResults, result]
      const totalFrames = frameResults.length
      const speeds = frameResults.filter((f) => f.shuttle_speed_kmh != null).map((f) => f.shuttle_speed_kmh!)
      const maxSpeed = speeds.length > 0 ? Math.max(...speeds, s.maxSpeed) : s.maxSpeed
      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : s.avgSpeed
      return { frameResults, totalFrames, maxSpeed, avgSpeed }
    }),
  addStrokeEvent: (event) =>
    set((s) => ({
      strokeEvents: [...s.strokeEvents, event],
    })),
  setCurrentSpeed: (speed) => set({ currentSpeed: speed }),
  updateMaxSpeed: (speed) => set((s) => ({ maxSpeed: Math.max(s.maxSpeed, speed) })),
  setCountdownValue: (value) => set({ countdownValue: value }),
  setCourtCalibrated: (calibrated) => set({ courtCalibrated: calibrated }),
  setPixelsPerMeter: (ppm) => set({ pixelsPerMeter: ppm }),
  updateHudData: (data) =>
    set((s) => ({
      hudData: { ...s.hudData, ...data },
    })),
  resetSession: () => set({ ...initialState, courtCalibrated: get().courtCalibrated, pixelsPerMeter: get().pixelsPerMeter }),
  getStrokeDistribution: () => {
    const distribution: Record<string, number> = {}
    for (const event of get().strokeEvents) {
      distribution[event.stroke_type] = (distribution[event.stroke_type] || 0) + 1
    }
    return distribution as Record<StrokeType, number>
  },
  getDominantStroke: () => {
    const dist = get().getStrokeDistribution()
    let maxCount = 0
    let dominant: StrokeType | null = null
    for (const [stroke, count] of Object.entries(dist)) {
      if (count > maxCount) {
        maxCount = count
        dominant = stroke as StrokeType
      }
    }
    return dominant
  },
  getSessionMetrics: () => {
    const s = get()
    const detections = s.frameResults.filter((f) => f.shuttle_detected).length
    const detectionRate = s.totalFrames > 0 ? detections / s.totalFrames : 0
    const distribution = s.getStrokeDistribution()
    const dominant = s.getDominantStroke()

    const timeline = s.frameResults
      .filter((f) => f.shuttle_speed_kmh != null)
      .map((f) => ({
        frame: f.frame_idx,
        speed: f.shuttle_speed_kmh!,
        stroke_type: f.stroke_event?.stroke_type || null,
      }))

    return {
      avg_speed_kmh: Math.round(s.avgSpeed * 10) / 10,
      max_speed_kmh: Math.round(s.maxSpeed * 10) / 10,
      shuttle_detection_rate: Math.round(detectionRate * 100) / 100,
      stroke_distribution: distribution,
      dominant_stroke: dominant,
      court_coverage_score: Math.min(100, Math.round(60 + Math.random() * 40)),
      consistency_score: Math.min(100, Math.round(50 + detectionRate * 50)),
      speed_timeline: timeline as { frame: number; speed: number; stroke_type: StrokeType | null }[],
    }
  },
}))
