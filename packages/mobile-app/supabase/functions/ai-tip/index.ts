import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface RequestBody {
  session_id: string
  user_id: string
  weak_strokes: string[]
}

interface SessionMetrics {
  avg_speed_kmh: number
  max_speed_kmh: number
  dominant_stroke: string
  consistency_score: number
  stroke_distribution: Record<string, number>
}

interface ProBenchmark {
  player_name: string
  smash_speed_kmh: number
  avg_elbow_angle: number
  avg_wrist_velocity: number
  footwork_score: number
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const body: RequestBody = await req.json()
    const { session_id, user_id, weak_strokes } = body

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user || user.id !== user_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    }

    const { data: metrics, error: metricsError } = await supabase
      .from("session_metrics")
      .select("*")
      .eq("session_id", session_id)
      .single()

    if (metricsError || !metrics) {
      return new Response(JSON.stringify({ tip: "Complete a full session to get AI tips." }), { status: 200 })
    }

    const { data: benchmarks } = await supabase
      .from("pro_benchmarks")
      .select("*")
      .eq("sport", "badminton")
      .limit(1)
      .single()

    const prompt = buildPrompt(metrics as SessionMetrics, benchmarks as ProBenchmark, weak_strokes)

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!anthropicResponse.ok) {
      const cachedTip = generateLocalTip(metrics as SessionMetrics, weak_strokes)
      return new Response(JSON.stringify({ tip: cachedTip, cached: true }), { status: 200 })
    }

    const aiData = await anthropicResponse.json()
    const tip = aiData.content?.[0]?.text || generateLocalTip(metrics as SessionMetrics, weak_strokes)

    return new Response(JSON.stringify({ tip: tip.trim() }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ tip: "Focus on your form and consistency. Every session builds strength." }), { status: 200 })
  }
})

function buildPrompt(metrics: SessionMetrics, pro: ProBenchmark, weakStrokes: string[]): string {
  const speedGap = pro.smash_speed_kmh - metrics.max_speed_kmh
  const weakList = weakStrokes.length > 0 ? weakStrokes.join(", ") : "none identified"
  return `You are a professional badminton coach. Give ONE specific, actionable 2-3 sentence training tip in English.

Player stats:
- Max speed: ${metrics.max_speed_kmh} km/h (pro: ${pro.smash_speed_kmh} km/h, gap: ${speedGap} km/h)
- Dominant stroke: ${metrics.dominant_stroke}
- Consistency: ${metrics.consistency_score}/100
- Weak strokes: ${weakList}

Focus on the biggest gap or weakest stroke. Be encouraging. Keep it under 50 words.`
}

function generateLocalTip(metrics: SessionMetrics, weakStrokes: string[]): string {
  const tips: Record<string, string> = {
    smash: "Work on your smash timing: initiate the shoulder rotation before the wrist snap. Practice with resistance bands for explosive power.",
    drop: "For drop shots, focus on a shorter follow-through and slice the shuttle at contact. Try the 'cut' technique with a higher racket position.",
    clear: "Improve your clear by stepping back with your non-racket foot and hitting the shuttle at the highest point. Engage your core for extra distance.",
    net: "Keep your racket head up when approaching the net. Practice lunging drills to improve your footwork and reach.",
    serve: "For serves, consistency beats power. Focus on a relaxed grip and smooth push motion. Practice 50 short serves daily.",
    defensive: "Strengthen your defensive stance: stay low, wide base, and use short wrist motions to redirect. React, don't predict.",
    drive: "Drive shots need a compact swing and quick wrist snap. Practice against a wall for faster reactions and accuracy.",
    default: "Focus on consistency across all strokes. Record yourself to identify form issues, and drill your weakest stroke for 15 minutes daily.",
  }

  const weak = weakStrokes[0] || metrics.dominant_stroke || "default"
  return tips[weak] || tips.default
}
