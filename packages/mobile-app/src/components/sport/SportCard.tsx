import { memo, useCallback } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { RisoSurface } from "../riso/RisoSurface"
import { SweepHeading } from "../riso/SweepHeading"
import Button from "../ui/Button"
import { StatusTag, Tag } from "../ui/Tag"
import { pad2 } from "../../lib/format"
import type { Sport, SportId } from "../../sports"
import { Fonts, Paper, Radius, Space, Type } from "../../theme"

interface SportCardProps {
  sport: Sport
  /** Catalogue number, 1-based. */
  number: number
  isPrimary: boolean
  onOpen: (id: SportId) => void
  onMakePrimary: (id: SportId) => void
  animate?: boolean
}

/** A gallery plate for one sport: its own inks, lit corner, grain and sweep heading. */
export const SportCard = memo(function SportCard({ sport, number, isPrimary, onOpen, onMakePrimary, animate = true }: SportCardProps) {
  const open = useCallback(() => onOpen(sport.id), [onOpen, sport.id])
  const makePrimary = useCallback(() => onMakePrimary(sport.id), [onMakePrimary, sport.id])
  const { palette } = sport

  return (
    <RisoSurface palette={palette} color={Paper.stock} glow={0.3} glowSize={380} grain={0.35} style={styles.card}>
      <View style={styles.top}>
        <Text style={Type.kicker}>
          No. {pad2(number)} — {sport.code}
        </Text>
        <StatusTag status={sport.status} palette={palette} />
      </View>

      <SweepHeading lines={sport.name} palette={palette} size="card" animate={animate} style={styles.heading} />
      <Text style={Type.deck}>{sport.tagline}</Text>

      <View style={styles.specs}>
        <Spec label="Tracks" value={sport.tracked} weight={1} />
        <Spec label={sport.playArea.label} value={sport.playArea.size} weight={2} />
        <Spec label={`${sport.strokeNoun}s`} value={String(sport.strokes.length)} weight={0.8} />
      </View>

      <View style={styles.inks} accessible accessibilityLabel={`Printed in ${palette.names.join(", ")}`}>
        {[palette.plate, palette.shadow, palette.ink3].map((c) => (
          <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
        ))}
        <Text style={styles.inkNames} numberOfLines={1}>
          {palette.names.join(" · ")}
        </Text>
      </View>

      <View style={styles.actions}>
        {isPrimary ? (
          <Tag label="Your sport" color={palette.ink} variant="outline" />
        ) : (
          <Button label="Make my sport" size="sm" palette={palette} onPress={makePrimary} />
        )}
        <Pressable
          onPress={open}
          accessibilityRole="link"
          accessibilityLabel={`Open the ${sport.name} section`}
          hitSlop={10}
          style={styles.openHit}
        >
          <Text style={[styles.open, { color: palette.ink }]}>Open section →</Text>
        </Pressable>
      </View>
    </RisoSurface>
  )
})

function Spec({ label, value, weight }: { label: string; value: string; weight: number }) {
  return (
    <View style={[styles.spec, { flex: weight }]}>
      <Text style={[Type.kicker, styles.specLabel]}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Paper.rule,
    borderRadius: Radius.sm,
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.md },
  heading: { marginBottom: Space.sm },
  specs: {
    flexDirection: "row",
    marginTop: Space.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Paper.rule,
  },
  spec: { paddingVertical: Space.sm, paddingRight: Space.xs },
  specLabel: { fontSize: 9 },
  specValue: { fontFamily: Fonts.mono, fontSize: 11, color: Paper.text, marginTop: 2 },
  inks: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: Space.md },
  swatch: { width: 12, height: 12 },
  inkNames: { fontFamily: Fonts.mono, fontSize: 10, color: Paper.faint, marginLeft: 6, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Space.lg },
  openHit: { minHeight: 36, justifyContent: "center" },
  open: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 0.6 },
})
