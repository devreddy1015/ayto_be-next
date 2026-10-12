import { memo, useEffect } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import type { SportPalette } from "../../sports"
import { Paper } from "../../theme"
import { useReducedMotion } from "../../hooks/useMotion"

interface MeshProps {
  palette: SportPalette
  /** 0 = flat canvas, 1 = full colour. Screens dial this down behind dense text. */
  intensity?: number
  /** Slow drift of the two blobs. Off for list screens that scroll a lot. */
  animated?: boolean
  style?: StyleProp<ViewStyle>
}

/** One drifting blob. Only `transform` is animated, so it stays on the UI thread. */
const Blob = memo(function Blob({
  color,
  size,
  opacity,
  left,
  top,
  delay,
  drift,
  animated,
}: {
  color: string
  size: number
  opacity: number
  left: number
  top: number
  delay: number
  drift: number
  animated: boolean
}) {
  const t = useSharedValue(0)

  useEffect(() => {
    if (!animated) return
    t.value = withRepeat(
      withTiming(1, { duration: 14000 + delay, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
  }, [animated, delay, t])

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * drift },
      { translateY: t.value * -drift * 0.6 },
      { scale: 1 + t.value * 0.12 },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          left,
          top,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
        },
        style,
      ]}
    />
  )
})

/**
 * The signature surface: a warm canvas washed with the sport's three tints.
 *
 * React Native has no blur filter, so the soft-mesh look is built from a
 * diagonal base gradient plus two very large, very low-opacity circles. Both
 * circles drift on a long sine loop — slow enough to read as light moving
 * rather than animation. Everything animated here is a transform, so it never
 * touches the JS thread, and `useReducedMotion` parks it at frame zero.
 *
 * Text contrast: every stop in `palette.grad` clears 10:1 against `Paper.ink`,
 * and the blobs only lighten, so body copy stays legible wherever it lands.
 */
export const Mesh = memo(function Mesh({
  palette,
  intensity = 1,
  animated = true,
  style,
}: MeshProps) {
  const reduce = useReducedMotion()
  const move = animated && !reduce
  const [a, b, c] = palette.grad

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: Paper.canvas }, style]} pointerEvents="none">
      <LinearGradient
        colors={[a, b, c]}
        locations={[0, 0.52, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 * intensity }]}
      />
      <Blob color={a} size={520} opacity={0.5 * intensity} left={-200} top={-190} delay={0} drift={34} animated={move} />
      <Blob color={c} size={620} opacity={0.42 * intensity} left={90} top={240} delay={3200} drift={-28} animated={move} />
      {/* A top-down wash so status-bar text and the header always sit on light paper. */}
      <LinearGradient
        colors={["rgba(255,255,255,0.75)", "rgba(255,255,255,0)"]}
        style={[StyleSheet.absoluteFill, { height: 260 }]}
        pointerEvents="none"
      />
    </View>
  )
})
