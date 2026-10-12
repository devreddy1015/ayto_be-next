import { memo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { Badge } from "../ui/Bits"
import { Icon } from "../ui/Icon"
import { Reveal } from "../ui/Motion"
import { Tappable } from "../ui/Press"
import { Counter } from "../ui/Stat"
import { Card } from "../ui/Surface"
import { useSpeed } from "../../hooks/useSport"
import { clock, shortDate } from "../../lib/format"
import { getSport, strokeLabel } from "../../sports"
import type { SessionSummary } from "../../types"
import { Motion, Paper, Radius, Space, Type } from "../../theme"

/**
 * A row in a session list — history, home and the per-sport page all use this
 * one. Compact by design: three lines of context on the left, the headline
 * number on the right, and the whole thing is one tap target.
 */

/** Row 30 must not wait two seconds for its entrance, so the stagger plateaus. */
const MAX_STAGGER_STEPS = 6

interface SessionCardProps {
  session: SessionSummary
  onPress?: () => void
  /** Position in the list; staggers the entrance and the count-up. */
  index?: number
  style?: StyleProp<ViewStyle>
}

export const SessionCard = memo(function SessionCard({ session, onPress, index = 0, style }: SessionCardProps) {
  // Resolved from the row, never from the active sport: history mixes sports
  // and each one should turn up in its own colours.
  const sport = getSport(session.sport)
  const { palette } = sport
  const { format, unit } = useSpeed()

  const date = shortDate(session.created_at)
  const top = format(session.max_speed_kmh)
  const lead = session.dominant_stroke ? strokeLabel(sport, session.dominant_stroke) : null
  const step = Math.min(index, MAX_STAGGER_STEPS)

  // "28:00" is announced as a time of day, so the spoken label says minutes.
  // Sub-minute sessions round to 1 rather than "0 minutes".
  const minutes = Math.max(1, Math.round(session.duration_seconds / 60))
  const a11y =
    `${sport.name} session, ${date}. ${lead ? `${lead}-led, ` : ""}` +
    `${session.strokes_count} ${sport.strokeNounPlural} over ${minutes} minutes, ` +
    `top speed ${top} ${unit}. Sample data.`

  return (
    <Reveal index={step} style={[styles.row, style]}>
      <Tappable onPress={onPress} label={a11y}>
        <Card elevation="sm" padded={false} style={styles.card}>
          <View style={[styles.rail, { backgroundColor: palette.accent }]} />

          <View style={styles.body}>
            <View style={styles.head}>
              <Badge label={sport.code} tone="accent" palette={palette} />
              <Text style={[Type.small, styles.date]} numberOfLines={1}>
                {sport.name} · {date}
              </Text>
            </View>

            <Text style={Type.subhead} numberOfLines={1}>
              {lead ? `${lead}-led session` : "Session"}
            </Text>

            <View style={styles.meta}>
              <Icon name="clock" size={13} color={Paper.faint} weight={2} />
              <Text style={Type.small} numberOfLines={1}>
                {clock(session.duration_seconds)} · {session.strokes_count} {sport.strokeNounPlural}
              </Text>
            </View>
          </View>

          <View style={styles.headline}>
            <Counter value={top} delay={step * Motion.stagger} style={[Type.metric, { color: palette.ink }]} />
            <Text style={Type.unit}>{unit} max</Text>
            {/* Nothing here was measured — the badge sits with the number it qualifies. */}
            <Badge label="Sample" style={styles.sample} />
          </View>
        </Card>
      </Tappable>
    </Reveal>
  )
})

const styles = StyleSheet.create({
  row: { marginBottom: Space.md },
  card: { flexDirection: "row", borderRadius: Radius.lg },
  rail: { width: 5 },
  body: { flex: 1, gap: Space.xxs, paddingVertical: Space.lg, paddingLeft: Space.lg, paddingRight: Space.md },
  head: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  date: { flex: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  headline: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: Space.xxs,
    paddingVertical: Space.lg,
    paddingRight: Space.lg,
  },
  sample: { marginTop: Space.xs },
})
