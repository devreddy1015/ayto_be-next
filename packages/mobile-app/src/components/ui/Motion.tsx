import { type ReactNode, useEffect } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated"
import { Motion, Rise } from "../../theme"
import { useReducedMotion } from "../../hooks/useMotion"

const EASE = Easing.bezier(...Motion.ease)

/**
 * Land `t` on 1 even if the animation never runs.
 *
 * Reanimated drives web animations off requestAnimationFrame, which browsers
 * pause outright in a backgrounded tab. Without this, a screen opened in a
 * background tab stays invisible: the entrance starts, the frame loop stops,
 * and the opacity is stuck part-way for good. Timers are throttled rather
 * than paused, so one of them can always finish the job.
 */
function useSettleGuard(t: SharedValue<number>, after: number, skip: boolean) {
  useEffect(() => {
    if (skip) return
    const timer = setTimeout(() => {
      if (t.value !== 1) t.value = 1
    }, after + 120)
    return () => clearTimeout(timer)
  }, [after, skip, t])
}

interface RevealProps {
  children: ReactNode
  /** Position in a staggered group; multiplied by `Motion.stagger`. */
  index?: number
  /** Extra delay on top of the stagger, in ms. */
  delay?: number
  /** How far it travels in. */
  distance?: number
  /** Slide in from the side instead of up. */
  from?: "bottom" | "left" | "right" | "scale"
  duration?: number
  style?: StyleProp<ViewStyle>
}

/**
 * The entrance primitive: everything on a screen arrives through this.
 *
 * Fades and travels a short distance on the UI thread. With reduce-motion on
 * it renders the settled state immediately rather than animating faster — a
 * shortened animation is still animation.
 */
export function Reveal({
  children,
  index = 0,
  delay = 0,
  distance = Rise.md,
  from = "bottom",
  duration = Motion.base,
  style,
}: RevealProps) {
  const reduce = useReducedMotion()
  const t = useSharedValue(reduce ? 1 : 0)

  useEffect(() => {
    if (reduce) {
      t.value = 1
      return
    }
    t.value = withDelay(delay + index * Motion.stagger, withTiming(1, { duration, easing: EASE }))
  }, [delay, duration, index, reduce, t])

  useSettleGuard(t, delay + index * Motion.stagger + duration, reduce)

  const animated = useAnimatedStyle(() => {
    const away = 1 - t.value
    const transform =
      from === "scale"
        ? [{ scale: 0.94 + t.value * 0.06 }]
        : from === "left"
          ? [{ translateX: -away * distance }]
          : from === "right"
            ? [{ translateX: away * distance }]
            : [{ translateY: away * distance }]
    return { opacity: t.value, transform }
  })

  return <Animated.View style={[style, animated]}>{children}</Animated.View>
}

/**
 * A value that eases from 0 to 1 once on mount, for callers that want to drive
 * their own interpolation (bar widths, ring sweeps, count-ups).
 */
export function useEnter(delay = 0, duration = Motion.slow) {
  const reduce = useReducedMotion()
  const t = useSharedValue(reduce ? 1 : 0)

  useEffect(() => {
    if (reduce) {
      t.value = 1
      return
    }
    t.value = withDelay(delay, withTiming(1, { duration, easing: EASE }))
  }, [delay, duration, reduce, t])

  useSettleGuard(t, delay + duration, reduce)

  return t
}
