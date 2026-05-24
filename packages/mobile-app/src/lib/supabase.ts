import { createClient } from "@supabase/supabase-js"
import { MMKV } from "react-native-mmkv"

const storage = new MMKV({ id: "supabase-storage" })

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co"
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key: string) => {
        const value = storage.getString(key)
        return value || null
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export async function signInWithEmail(email: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  return { error }
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithPassword(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (data.user && !error) {
    await supabase.from("profiles").insert({ id: data.user.id, name })
  }
  return { data, error }
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function fetchSessions(userId: string, page: number = 0, limit: number = 20) {
  const from = page * limit
  const to = from + limit - 1
  return supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to)
}

export async function fetchSessionMetrics(sessionId: string) {
  return supabase.from("session_metrics").select("*").eq("session_id", sessionId).single()
}

export async function fetchStrokeEvents(sessionId: string) {
  return supabase.from("stroke_events").select("*").eq("session_id", sessionId).order("frame_peak", { ascending: true })
}

export async function fetchProBenchmarks(sport: string = "badminton") {
  return supabase.from("pro_benchmarks").select("*").eq("sport", sport)
}

export async function saveSession(userId: string, session: {
  sport: string
  duration_seconds: number
  total_frames: number
  model_version: string
  avg_speed_kmh: number
  max_speed_kmh: number
  strokes_count: number
  dominant_stroke: string | null
}) {
  return supabase.from("sessions").insert({ user_id: userId, ...session }).select().single()
}

export async function saveSessionMetrics(metrics: {
  session_id: string
  avg_speed_kmh: number
  max_speed_kmh: number
  shuttle_detection_rate: number
  stroke_distribution: Record<string, number>
  dominant_stroke: string
  court_coverage_score: number
  consistency_score: number
  speed_timeline: { frame: number; speed: number }[]
}) {
  return supabase.from("session_metrics").insert(metrics)
}

export async function saveStrokeEvents(events: Array<{
  session_id: string
  frame_start: number
  frame_peak: number
  frame_end: number
  stroke_type: string
  confidence: number
  speed_kmh: number
  elbow_angle: number
  wrist_velocity: number
  court_x: number
  court_y: number
  angle_at_contact: number
}>) {
  return supabase.from("stroke_events").insert(events)
}

export async function fetchAiTip(sessionId: string, userId: string, weakStrokes: string[]) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { tip: "Sign in to get AI coaching tips." }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/ai-tip`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ session_id: sessionId, user_id: userId, weak_strokes: weakStrokes }),
    },
  )
  return response.json()
}
