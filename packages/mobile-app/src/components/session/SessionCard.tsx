import { memo, useCallback } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Tag } from "../ui/Tag"
import { useSpeed } from "../../hooks/useSport"
import { clock, shortDate } from "../../lib/format"
import { getSport, strokeColor, strokeLabel } from "../../sports"
import type { SessionSummary } from "../../types"
import { Fonts, Paper, Radius, Space, Type } from "../../theme"

interface SessionCardProps {
  session: SessionSummary
  onPress: (id: string) => void
  /** Prefix the sport name (mixed-sport lists). */
  showSport?: boolean
}

export const SessionCard = memo(function SessionCard({ session, onPress, showSport = false }: SessionCardProps) {
  const sport = getSport(session.sport)
  const { format, unit } = useSpeed()
  const press = useCallback(() => onPress(session.id), [onPress, session.id])
  const dominant = session.dominant_stroke
  const date = shortDate(session.created_at)
  const max = format(session.max_speed_kmh)

  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={`${sport.name} session, ${date}, max ${max} ${unit}, ${session.strokes_count} ${sport.strokeNoun}s`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.edge, { backgroundColor: sport.palette.plate }]} />
      <View style={styles.body}>
        <Text style={Type.kicker} numberOfLines={1}>
          {showSport ? `${sport.name} · ` : ""}
          {date}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {dominant ? `${strokeLabel(sport, dominant)}-led session` : "Session"}
        </Text>
        <Text style={styles.meta}>
          {clock(session.duration_seconds)} · {session.strokes_count} {sport.strokeNoun}s
        </Text>
        {dominant ? (
          <Tag label={strokeLabel(sport, dominant)} color={strokeColor(sport, dominant)} style={styles.tag} />
        ) : null}
      </View>
      <View style={styles.speed}>
        <Text style={[Type.metric, { color: sport.palette.ink }]}>{max}</Text>
        <Text style={Type.unit}>{unit} max</Text>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: Paper.stock,
    borderWidth: 1,
    borderColor: Paper.rule,
    borderRadius: Radius.sm,
    marginBottom: Space.md,
    overflow: "hidden",
  },
  pressed: { backgroundColor: Paper.raised },
  edge: { width: 4 },
  body: { flex: 1, padding: Space.lg, paddingRight: Space.sm, gap: 2 },
  title: { fontFamily: Fonts.display, fontSize: 20, lineHeight: 25, color: Paper.text },
  meta: { fontFamily: Fonts.mono, fontSize: 12, color: Paper.muted },
  tag: { marginTop: Space.sm, paddingHorizontal: 0 },
  speed: { alignItems: "flex-end", justifyContent: "center", paddingRight: Space.lg },
})
