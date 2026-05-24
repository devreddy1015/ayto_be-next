export interface FrameResult {
  frame_idx: number
  timestamp_s: number
  shuttle_detected: boolean
  shuttle_pos_x_px: number | null
  shuttle_pos_y_px: number | null
  shuttle_speed_kmh: number | null
  confidence: number
  keypoints: number[][] | null
  joint_angles: Record<string, number> | null
  stroke_event: StrokeEvent | null
}

export interface StrokeEvent {
  frame_start: number
  frame_peak: number
  frame_end: number
  stroke_type: StrokeType
  confidence: number
  speed_kmh: number
  elbow_angle: number
  wrist_velocity: number
  court_x: number
  court_y: number
  angle_at_contact: number
}

export type StrokeType =
  | "smash"
  | "drop"
  | "clear"
  | "net"
  | "serve"
  | "defensive"
  | "drive"

export interface SessionMetrics {
  session_id: string
  avg_speed_kmh: number
  max_speed_kmh: number
  shuttle_detection_rate: number
  stroke_distribution: Record<StrokeType, number>
  dominant_stroke: StrokeType
  court_coverage_score: number
  consistency_score: number
  speed_timeline: SpeedPoint[]
}

export interface SpeedPoint {
  frame: number
  speed: number
  stroke_type: StrokeType | null
}

export interface SessionSummary {
  id: string
  user_id: string
  sport: string
  duration_seconds: number
  total_frames: number
  model_version: string
  created_at: string
  metrics: SessionMetrics | null
  max_speed_kmh: number
  avg_speed_kmh: number
  strokes_count: number
  dominant_stroke: StrokeType | null
}

export interface ProBenchmark {
  id: string
  player_name: string
  sport: string
  smash_speed_kmh: number
  avg_elbow_angle: number
  avg_wrist_velocity: number
  footwork_score: number
  serve_speed_kmh: number
  drop_accuracy: number
  consistency_score: number
}

export interface UserProfile {
  id: string
  name: string
  avatar_url: string | null
  sports: string[]
  unit_preference: "kmh" | "mph"
  created_at: string
}

export interface Drill {
  id: string
  title: string
  category: StrokeType
  difficulty: "beginner" | "intermediate" | "advanced"
  duration_minutes: number
  description: string
  steps: string[]
  thumbnail_type: string
  equipment: string[]
  benefits: string[]
}

export interface RadarDataPoint {
  axis: string
  value: number
  maxValue: number
}

export interface ProComparisonData {
  pro_name: string
  your_session_id: string
  radar_data: RadarDataPoint[]
  stroke_comparisons: StrokeComparison[]
  ai_tip: string
}

export interface StrokeComparison {
  stroke_type: StrokeType
  your_speed: number
  pro_speed: number
  your_elbow_angle: number
  pro_elbow_angle: number
  your_wrist_velocity: number
  pro_wrist_velocity: number
  gap_score: number
}

export interface CameraHUDData {
  shuttle_pos: { x: number; y: number } | null
  shuttle_trail: { x: number; y: number; opacity: number }[]
  speed_kmh: number | null
  current_stroke: StrokeType | null
  keypoints: number[][] | null
  joint_qualities: Record<string, "good" | "warning" | "poor"> | null
  timer: number
  is_paused: boolean
  is_recording: boolean
}

export interface ChartTooltipData {
  frame: number
  speed: number
  time: number
  stroke_type: StrokeType | null
}
