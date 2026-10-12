import { memo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import Animated, { useAnimatedProps, useAnimatedStyle } from "react-native-reanimated"
import Svg, { Circle, G, type CircleProps } from "react-native-svg"
import type { SportPalette } from "../../sports"
import { Fonts, Motion, Paper, Radius, Space, Type } from "../../theme"
import { Badge } from "../ui/Bits"
import { Reveal, useEnter } from "../ui/Motion"
import { Bar, Counter } from "../ui/Stat"

/**
 * Chart primitives for the report screens.
 *
 * Three shapes cover everything the app plots today: a column chart for a run
 * of sessions, a ring for a single proportion, and paired bars for you against
 * a reference. Entrances come from `Reveal`/`useEnter`, so reduce-motion is
 * honoured in one place rather than in every chart.
 *
 * Every one of these takes a `sample` flag that defaults to on, because nothing
 * in Ayto has analysed footage yet — each number here comes from `getDemo()`.
 * The badge is the default so a screen cannot quietly forget to say so; a
 * caller plotting real measurements one day passes `sample={false}`.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Trailing zeros read as false precision on a chart; whole numbers stay whole. */
function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

interface ColumnProps {
  /** Share of the plot height, 0..1. */
  fraction: number
  plotHeight: number
  color: string
  /** Full strength, or the washed-out tint used for the rest of the run. */
  hot: boolean
  delay: number
}

/**
 * One column. It owns its own entrance value, which is why it is a component
 * rather than a branch inside the map — hooks cannot run in a loop.
 */
const Column = memo(function Column({ fraction, plotHeight, color, hot, delay }: ColumnProps) {
  const t = useEnter(delay)
  // A floor of 3px so an empty session is still a visible mark, not a gap.
  const target = Math.max(3, clamp01(fraction) * plotHeight)
  const grow = useAnimatedStyle(() => ({ height: target * t.value }))

  return (
    <View style={styles.columnSlot}>
      <Animated.View style={[styles.column, { backgroundColor: color }, !hot && styles.columnCool, grow]} />
    </View>
  )
})

interface ColumnsProps {
  data: readonly number[]
  /** Fill for the run. The highlighted column uses `palette.accent` when given. */
  color: string
  palette?: SportPalette
  height?: number
  labels?: readonly string[]
  highlightIndex?: number
  delay?: number
  sample?: boolean
  style?: StyleProp<ViewStyle>
}

/** A column chart built from plain Views — the run of recent sessions. */
export const Columns = memo(function Columns({
  data,
  color,
  palette,
  height = 140,
  labels,
  highlightIndex,
  delay = 0,
  sample = true,
  style,
}: ColumnsProps) {
  // Math.max() of nothing is -Infinity, and a flat run would divide by zero.
  const peak = data.length > 0 ? Math.max(...data) : 0
  const scale = peak > 0 ? peak : 1
  const marked = highlightIndex !== undefined && highlightIndex >= 0 && highlightIndex < data.length

  const a11y = data
    .map((v, i) => `${labels?.[i] ?? `point ${i + 1}`} ${trim(v)}${marked && i === highlightIndex ? ", highlighted" : ""}`)
    .join(", ")

  return (
    <View style={style}>
      <View accessible accessibilityRole="image" accessibilityLabel={`Column chart. ${a11y}`}>
        {/* A pin above the highlighted column: the highlight must survive being
            read in greyscale, and labels are optional. */}
        {marked ? (
          <View style={styles.markerRow}>
            {data.map((_, i) => (
              <View key={i} style={styles.markerSlot}>
                {i === highlightIndex ? (
                  <View style={[styles.marker, { backgroundColor: palette?.accent ?? color }]} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.plot, { height }]}>
          {data.map((v, i) => (
            <Column
              key={i}
              fraction={v / scale}
              plotHeight={height}
              color={marked && i === highlightIndex ? (palette?.accent ?? color) : color}
              hot={!marked || i === highlightIndex}
              delay={delay + i * Motion.stagger}
            />
          ))}
        </View>
        <View style={styles.baseline} />

        {labels ? (
          <View style={styles.labelRow}>
            {data.map((_, i) => (
              <Text
                key={i}
                numberOfLines={1}
                style={[
                  styles.label,
                  marked && i === highlightIndex ? [styles.labelHot, { color: palette?.ink ?? Paper.ink }] : null,
                ]}
              >
                {labels[i] ?? ""}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {sample ? <Badge label="Sample" style={styles.sample} /> : null}
    </View>
  )
})

interface MeterProps {
  /** 0..1 */
  value: number
  color: string
  track?: string
  size?: number
  label?: string
  delay?: number
  sample?: boolean
  style?: StyleProp<ViewStyle>
}

/** A circular progress ring. The sweep is a stroke-dash offset on the UI thread. */
export const Meter = memo(function Meter({
  value,
  color,
  track = Paper.sunken,
  size = 132,
  label,
  delay = 0,
  sample = true,
  style,
}: MeterProps) {
  const t = useEnter(delay)
  const pct = clamp01(value)
  const stroke = Math.max(8, Math.round(size * 0.1))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  const sweep = useAnimatedProps<CircleProps>(() => ({
    strokeDashoffset: circumference * (1 - pct * t.value),
  }))

  // The ring is a single a11y node, so the badge below is never announced on
  // its own — the sample-data caveat has to ride on the label itself.
  const a11y = `${label ?? "Progress"}${sample ? ", sample data" : ""}`

  return (
    <View
      style={[styles.meter, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11y}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Rotated so the sweep starts at twelve o'clock rather than three. */}
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              animatedProps={sweep}
            />
          </G>
        </Svg>
        <View style={styles.meterCentre} pointerEvents="none">
          <View style={styles.meterValue}>
            <Counter value={pct * 100} delay={delay} style={Type.metric} />
            <Text style={[Type.unit, styles.meterUnit]}>%</Text>
          </View>
        </View>
      </View>

      {label ? (
        <Text style={[Type.kicker, styles.meterLabel]} numberOfLines={2}>
          {label}
        </Text>
      ) : null}
      {sample ? <Badge label="Sample" style={styles.meterBadge} /> : null}
    </View>
  )
})

export interface PairedRow {
  label: string
  you: number
  other: number
  unit?: string
}

interface PairedBarsProps {
  rows: readonly PairedRow[]
  palette: SportPalette
  /** What the second bar is being compared against. */
  otherLabel?: string
  delay?: number
  sample?: boolean
  style?: StyleProp<ViewStyle>
}

/** You against a reference, one metric per row. */
export const PairedBars = memo(function PairedBars({
  rows,
  palette,
  otherLabel = "Reference",
  delay = 0,
  sample = true,
  style,
}: PairedBarsProps) {
  return (
    <View style={style}>
      {rows.map((row, i) => {
        // Headroom above the taller of the two, so neither bar ever fills the track.
        const scale = Math.max(row.you, row.other, 0) * 1.1 || 1
        const unit = row.unit ? ` ${row.unit}` : ""
        const step = delay + i * Motion.stagger

        return (
          <Reveal key={row.label} index={i} delay={delay} style={i > 0 ? styles.pairGap : undefined}>
            <View
              accessible
              accessibilityLabel={`${row.label}: you ${trim(row.you)}${unit}, ${otherLabel} ${trim(row.other)}${unit}`}
            >
              <View style={styles.pairHead}>
                <Text style={[Type.label, styles.pairLabel]} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={Type.small}>
                  <Text style={{ color: palette.ink }}>{trim(row.you)}</Text>
                  {" / "}
                  {trim(row.other)}
                  {unit}
                </Text>
              </View>

              {/* Each bar is keyed by a written word, not only by colour. */}
              <View style={styles.pairLine}>
                <Text style={[Type.unit, styles.pairKey]} numberOfLines={1}>
                  You
                </Text>
                <Bar
                  value={row.you / scale}
                  color={palette.accent}
                  height={10}
                  delay={step + 80}
                  style={styles.pairBar}
                />
              </View>
              <View style={styles.pairLine}>
                <Text style={[Type.unit, styles.pairKey]} numberOfLines={1}>
                  {otherLabel}
                </Text>
                <Bar
                  value={row.other / scale}
                  color={Paper.faint}
                  height={10}
                  delay={step + 160}
                  style={styles.pairBar}
                />
              </View>
            </View>
          </Reveal>
        )
      })}

      {sample ? <Badge label="Sample" style={styles.sample} /> : null}
    </View>
  )
})

const styles = StyleSheet.create({
  markerRow: { flexDirection: "row", gap: Space.xs, marginBottom: Space.sm },
  markerSlot: { flex: 1, alignItems: "center" },
  marker: { width: 6, height: 6, borderRadius: 3 },
  plot: { flexDirection: "row", alignItems: "flex-end", gap: Space.xs },
  columnSlot: { flex: 1, justifyContent: "flex-end", height: "100%" },
  column: { width: "100%", borderRadius: Radius.xs },
  columnCool: { opacity: 0.28 },
  baseline: { height: 1, backgroundColor: Paper.line },
  labelRow: { flexDirection: "row", gap: Space.xs, marginTop: Space.sm },
  label: { flex: 1, textAlign: "center", fontFamily: Fonts.body, fontSize: 11, color: Paper.faint },
  labelHot: { fontFamily: Fonts.bodySemi },
  sample: { alignSelf: "flex-end", marginTop: Space.md },

  meter: { alignItems: "center", gap: Space.sm },
  meterCentre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  meterValue: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  meterUnit: { marginBottom: 2 },
  meterLabel: { textAlign: "center", maxWidth: 180 },
  meterBadge: { alignSelf: "center" },

  pairGap: { marginTop: Space.lg },
  pairHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  pairLabel: { flexShrink: 1 },
  pairLine: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginTop: Space.xs },
  pairKey: { width: 62 },
  pairBar: { flex: 1 },
})
