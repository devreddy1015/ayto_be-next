import { memo, useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import type { SportPalette } from "../../sports"
import { Motion, Paper, Radius, Space, Type } from "../../theme"
import { Icon, type IconName } from "./Icon"
import { useEnter } from "./Motion"
import { useReducedMotion } from "../../hooks/useMotion"

/** cubic-bezier(0.22, 1, 0.36, 1), evaluated on the JS thread for the count-up. */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5)
}

interface CounterProps {
  value: number
  decimals?: number
  duration?: number
  delay?: number
  style?: StyleProp<TextStyle>
}

/**
 * A number that counts up once on mount.
 *
 * This one runs on the JS thread rather than through Reanimated: it is a
 * single text node per card, and driving `Text` content from a worklet needs
 * the animated-TextInput trick, which does not render reliably on web — and
 * the web build is what people see first.
 */
export const Counter = memo(function Counter({
  value,
  decimals = 0,
  duration = Motion.lazy,
  delay = 0,
  style,
}: CounterProps) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (reduce) {
      setShown(value)
      return
    }
    let start: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const step = (now: number) => {
      if (start === undefined) start = now
      const t = Math.min(1, (now - start) / duration)
      setShown(value * easeOutQuint(t))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }

    timer = setTimeout(() => {
      frame.current = requestAnimationFrame(step)
    }, delay)

    return () => {
      if (timer) clearTimeout(timer)
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [delay, duration, reduce, value])

  return <Text style={style}>{shown.toFixed(decimals)}</Text>
})

interface StatProps {
  label: string
  value: number | string
  unit?: string
  size?: "xl" | "lg" | "md" | "sm"
  color?: string
  decimals?: number
  delay?: number
  icon?: IconName
  /** e.g. "+3.7% vs last session" */
  delta?: { text: string; up: boolean }
  palette?: SportPalette
  style?: StyleProp<ViewStyle>
}

const SIZES = {
  xl: Type.metricXL,
  lg: Type.metricLg,
  md: Type.metric,
  sm: Type.metricSm,
} as const

export const Stat = memo(function Stat({
  label,
  value,
  unit,
  size = "md",
  color = Paper.ink,
  decimals = 0,
  delay = 0,
  icon,
  delta,
  palette,
  style,
}: StatProps) {
  const numeric = typeof value === "number"
  const a11y = `${label}: ${numeric ? value.toFixed(decimals) : value}${unit ? ` ${unit}` : ""}`

  return (
    <View style={style} accessible accessibilityLabel={a11y}>
      <View style={styles.labelRow}>
        {icon ? <Icon name={icon} size={14} color={Paper.faint} weight={2} /> : null}
        <Text style={Type.kicker} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.valueRow}>
        {numeric ? (
          <Counter value={value} decimals={decimals} delay={delay} style={[SIZES[size], { color }]} />
        ) : (
          <Text style={[SIZES[size], { color }]}>{value}</Text>
        )}
        {unit ? <Text style={[Type.unit, styles.unit]}>{unit}</Text> : null}
      </View>
      {delta ? (
        <View style={[styles.delta, { backgroundColor: palette?.soft ?? Paper.sunken }]}>
          <Icon
            name={delta.up ? "trending" : "activity"}
            size={13}
            color={delta.up ? (palette?.ink ?? Paper.success) : Paper.danger}
            weight={2.2}
          />
          <Text style={[Type.small, { color: delta.up ? (palette?.onSoft ?? Paper.success) : Paper.danger }]}>
            {delta.text}
          </Text>
        </View>
      ) : null}
    </View>
  )
})

interface BarProps {
  /** 0..1 */
  value: number
  color: string
  track?: string
  height?: number
  delay?: number
  style?: StyleProp<ViewStyle>
}

/** A horizontal bar that grows in from the left. */
export const Bar = memo(function Bar({
  value,
  color,
  track = Paper.sunken,
  height = 8,
  delay = 0,
  style,
}: BarProps) {
  const t = useEnter(delay)
  const fill = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, value)) * 100 * t.value}%`,
  }))

  return (
    <View style={[{ height, backgroundColor: track, borderRadius: Radius.pill, overflow: "hidden" }, style]}>
      <Animated.View style={[{ height, backgroundColor: color, borderRadius: Radius.pill }, fill]} />
    </View>
  )
})

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: Space.xs, marginBottom: Space.xs },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: Space.xs },
  unit: { marginBottom: 2 },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    alignSelf: "flex-start",
    marginTop: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
})
