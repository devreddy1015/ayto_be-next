import { useEffect, useState, useCallback } from "react"
import { supabase, signOut } from "../lib/supabase"
import { useUserStore } from "../store/userStore"
import type { UserProfile, SessionSummary, SessionMetrics, StrokeEvent, ProBenchmark } from "../types"

export function useSupabaseAuth() {
  const { setProfile, setAuthenticated, signOut: storeSignOut } = useUserStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthenticated(true)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setAuthenticated(true)
        fetchProfile(session.user.id)
      } else {
        storeSignOut()
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (!error && data) {
      setProfile(data as UserProfile)
    }
    setLoading(false)
  }

  const logout = useCallback(async () => {
    await signOut()
    storeSignOut()
  }, [])

  return { loading, logout }
}

export function useSessions(limit: number = 20) {
  const { profile } = useUserStore()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    if (!profile) return
    loadSessions(0)
  }, [profile])

  const loadSessions = async (p: number) => {
    if (!profile) return
    setLoading(true)
    const from = p * limit
    const to = from + limit - 1

    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .range(from, to)

    if (!error && data) {
      const mapped = data.map((s) => ({
        id: s.id,
        user_id: s.user_id,
        sport: s.sport,
        duration_seconds: s.duration_seconds,
        total_frames: s.total_frames || 0,
        model_version: s.model_version || "",
        created_at: s.created_at,
        max_speed_kmh: s.max_speed_kmh || 0,
        avg_speed_kmh: s.avg_speed_kmh || 0,
        strokes_count: s.strokes_count || 0,
        dominant_stroke: s.dominant_stroke || null,
        metrics: null,
      })) as SessionSummary[]

      if (p === 0) setSessions(mapped)
      else setSessions((prev) => [...prev, ...mapped])

      setHasMore(data.length === limit)
      setPage(p)
    }
    setLoading(false)
  }

  const loadMore = () => {
    if (hasMore && !loading) {
      loadSessions(page + 1)
    }
  }

  return { sessions, loading, loadMore, hasMore }
}

export function useSessionMetrics(sessionId: string | null) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    supabase
      .from("session_metrics")
      .select("*")
      .eq("session_id", sessionId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setMetrics(data as SessionMetrics)
        setLoading(false)
      })
  }, [sessionId])

  return { metrics, loading }
}

export function useStrokeEvents(sessionId: string | null) {
  const [events, setEvents] = useState<StrokeEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    supabase
      .from("stroke_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("frame_peak", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setEvents(data as StrokeEvent[])
        setLoading(false)
      })
  }, [sessionId])

  return { events, loading }
}

export function useProBenchmarks(sport: string = "badminton") {
  const [benchmarks, setBenchmarks] = useState<ProBenchmark[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from("pro_benchmarks")
      .select("*")
      .eq("sport", sport)
      .then(({ data, error }) => {
        if (!error && data) setBenchmarks(data as ProBenchmark[])
        setLoading(false)
      })
  }, [sport])

  return { benchmarks, loading }
}
