export interface FrameResult {
  frame_idx: number
  timestamp_s: number
  shuttle_detected: boolean
  speed_kmh: number | null
  confidence: number
}

export interface StrokeEvent {
  frame_start: number
  frame_peak: number
  frame_end: number
  stroke_type: string
  confidence: number
  elbow_angle: number
  wrist_velocity: number
}

export interface SessionSummary {
  duration_s: number
  avg_speed_kmh: number
  max_speed_kmh: number
  detection_rate: number
  strokes: Record<string, number>
  speed_trend: { frame: number; speed: number }[]
}

export interface ProComparison {
  pro_name: string
  stroke_type: string
  player_angle: number
  pro_angle: number
  difference: number
  similarity_score: number
  feedback: string[]
}
