import { memo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Fonts, Paper, Space, Type } from "../../theme"

interface BarsProps {
  values: readonly number[]
  labels?: readonly string[]
  max: number
  height?: number
  color: string
  /** Values above `threshold` print in `color` at full strength; the rest are lighter. */
  highlight?: { threshold: number; color: string }
  accessibilityLabel: string
}

/** Static column chart: plain Views, no per-frame work. */
export const Bars = memo(function Bars({ values, labels, max, height = 120, color, highlight, accessibilityLabel }: BarsProps) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={[styles.plot, { height }]}>
        {values.map((v, i) => {
          const hot = highlight && v >= highlight.threshold ? highlight.color : null
          return (
            <View key={i} style={styles.col}>
              <View
                style={[
                  styles.bar,
                  { height: Math.max(2, (v / max) * height), backgroundColor: hot ?? color },
                  !hot && styles.cool,
                ]}
              />
            </View>
          )
        })}
      </View>
      {labels ? (
        <View style={styles.labels}>
          {labels.map((l, i) => (
            <Text key={i} style={styles.label}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
})

interface MeterProps {
  label: string
  you: number
  pro: number
  unit: string
  youColor: string
  proColor: string
  proName?: string
}

/** You-vs-pro ledger row: your bar in one ink, the pro as a hard tick in another. */
export const Meter = memo(function Meter({ label, you, pro, unit, youColor, proColor, proName = "Pro" }: MeterProps) {
  const scale = Math.max(you, pro) * 1.08 || 1
  return (
    <View style={styles.meter} accessible accessibilityLabel={`${label}: you ${you}${unit}, ${proName} ${pro}${unit}`}>
      <View style={styles.meterHead}>
        <Text style={[Type.small, styles.meterLabel]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.meterValues}>
          <Text style={{ color: youColor }}>{you}</Text>
          <Text style={{ color: Paper.faint }}> / </Text>
          <Text style={{ color: proColor }}>{pro}</Text>
          <Text style={{ color: Paper.muted }}> {unit}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(you / scale) * 100}%`, backgroundColor: youColor }]} />
        <View style={[styles.tick, { left: `${(pro / scale) * 100}%`, backgroundColor: proColor }]} />
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  plot: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  col: { flex: 1, justifyContent: "flex-end", height: "100%" },
  bar: { width: "100%" },
  cool: { opacity: 0.55 },
  labels: { flexDirection: "row", gap: 4, marginTop: Space.sm },
  label: { flex: 1, textAlign: "center", fontFamily: Fonts.mono, fontSize: 10, color: Paper.muted },
  meter: { marginBottom: Space.lg },
  meterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: Space.sm },
  meterLabel: { color: Paper.text, flexShrink: 1 },
  meterValues: { fontFamily: Fonts.mono, fontSize: 12 },
  track: { height: 8, backgroundColor: Paper.raised, justifyContent: "center" },
  fill: { height: "100%" },
  tick: { position: "absolute", width: 3, top: -4, bottom: -4, marginLeft: -1.5 },
})
