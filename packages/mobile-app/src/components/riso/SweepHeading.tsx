import { memo, useCallback, useEffect } from "react"
import { Image, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated"
import { Riso } from "../../assets"
import type { RisoPalette } from "../../sports"
import { Fonts, Motion, Paper } from "../../theme"

/**
 * Gallery heading, "Riso Sweep".
 *
 * Each line is an old-style serif standing on a hard offset plate. On mount an
 * ink band sweeps left -> right across the line (scaleX grows from the left
 * edge, then retracts to the right edge); the type is revealed under the band
 * at the midpoint, then a bright lit pass slides over the finished plate.
 * Lines are staggered. Everything animates transform/opacity on the UI thread,
 * and with reduce-motion on, the final state renders immediately.
 *
 * Variants:
 *   plate — type on a solid ink plate with a misregistered offset plate behind it
 *   ink   — paper-coloured type with a misregistered ink ghost, no plate
 */

const SWEEP_EASE = Easing.bezier(0.65, 0, 0.35, 1)
const LIT_EASE = Easing.inOut(Easing.quad)
const LIT_WIDTH = 56
const LIT_COLORS = ["rgba(255,255,255,0)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)"] as const
const CORNER_COLORS = ["rgba(255,255,255,0.34)", "rgba(255,255,255,0)"] as const
const CORNER_START = { x: 0, y: 0 }
const CORNER_END = { x: 0.75, y: 1 }
const LIT_START = { x: 0, y: 0.5 }
const LIT_END = { x: 1, y: 0.5 }

const SIZES = {
  hero: { fontSize: 46, lineHeight: 52, letterSpacing: -1.2, padX: 10, offset: 7, ghost: 3, gap: 6 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8, padX: 8, offset: 5, ghost: 2, gap: 5 },
  card: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, padX: 7, offset: 4, ghost: 2, gap: 4 },
  section: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3, padX: 6, offset: 3, ghost: 2, gap: 3 },
} as const

type SweepSize = keyof typeof SIZES
type SweepVariant = "plate" | "ink"

const textStyles = StyleSheet.create(
  Object.fromEntries(
    Object.entries(SIZES).map(([key, s]) => [
      key,
      { fontFamily: Fonts.display, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing },
    ]),
  ) as Record<SweepSize, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }>,
)

interface LineProps {
  text: string
  palette: RisoPalette
  variant: SweepVariant
  size: SweepSize
  delay: number
  play: boolean
  last: boolean
}

const SweepLine = memo(function SweepLine({ text, palette, variant, size, delay, play, last }: LineProps) {
  const cfg = SIZES[size]
  const isPlate = variant === "plate"
  // band: 0 -> 1 grows from the left edge, 1 -> 2 retracts to the right edge.
  const band = useSharedValue(play ? 0 : 2)
  const lit = useSharedValue(play ? 0 : 1)
  const width = useSharedValue(0)

  useEffect(() => {
    if (!play) return
    band.value = withDelay(delay, withTiming(2, { duration: Motion.sweepMs, easing: SWEEP_EASE }))
    if (isPlate) {
      lit.value = withDelay(delay + Motion.sweepMs, withTiming(1, { duration: Motion.litMs, easing: LIT_EASE }))
    }
  }, [play, delay, isPlate, band, lit])

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width
    },
    [width],
  )

  const plateReveal = useAnimatedStyle(() => ({ opacity: band.value >= 1 ? 1 : 0 }))
  const typeReveal = useAnimatedStyle(() => ({ opacity: band.value >= 1 ? 1 : 0 }))
  const shadowReveal = useAnimatedStyle(() => ({ opacity: band.value >= 1 ? 1 : 0 }))

  const bandStyle = useAnimatedStyle(() => {
    const p = band.value
    const w = width.value
    const growing = p <= 1
    return {
      opacity: p > 0 && p < 2 ? 1 : 0,
      transform: [
        { translateX: growing ? (-(1 - p) * w) / 2 : ((p - 1) * w) / 2 },
        { scaleX: Math.max(growing ? p : 2 - p, 0.001) },
      ],
    }
  })

  const litStyle = useAnimatedStyle(() => {
    const t = lit.value
    return {
      opacity: t > 0 && t < 1 ? 1 : 0,
      transform: [{ translateX: -LIT_WIDTH + t * (width.value + LIT_WIDTH * 2) }, { skewX: "-18deg" }],
    }
  })

  const textColor = isPlate ? palette.onPlate : Paper.text
  const ghostColor = isPlate ? palette.shadow : palette.ghost

  return (
    <View
      style={[
        styles.line,
        !last && { marginBottom: cfg.gap },
        isPlate && { paddingRight: cfg.offset, paddingBottom: cfg.offset },
      ]}
    >
      {isPlate && (
        <Animated.View
          style={[styles.fill, { top: cfg.offset, left: cfg.offset, backgroundColor: palette.shadow }, shadowReveal]}
        />
      )}
      <View
        onLayout={onLayout}
        style={[
          styles.clip,
          isPlate ? { paddingHorizontal: cfg.padX } : { paddingRight: cfg.ghost, paddingBottom: cfg.ghost },
        ]}
      >
        {isPlate && (
          <Animated.View style={[styles.fill, { backgroundColor: palette.plate }, plateReveal]}>
            <Image source={Riso.dither} resizeMode="repeat" style={styles.dither} />
            <LinearGradient colors={CORNER_COLORS} start={CORNER_START} end={CORNER_END} style={styles.fill} />
          </Animated.View>
        )}
        <Animated.View style={typeReveal}>
          <Text
            aria-hidden
            importantForAccessibility="no"
            maxFontSizeMultiplier={1.3}
            style={[textStyles[size], styles.ghost, { color: ghostColor, top: cfg.ghost, left: cfg.ghost, right: -cfg.ghost }]}
          >
            {text}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[textStyles[size], { color: textColor }]}>
            {text}
          </Text>
        </Animated.View>
        {play && (
          <Animated.View
            pointerEvents="none"
            style={[styles.fill, { backgroundColor: isPlate ? palette.shadow : palette.plate }, bandStyle]}
          />
        )}
        {play && isPlate && (
          <Animated.View pointerEvents="none" style={[styles.lit, litStyle]}>
            <LinearGradient colors={LIT_COLORS} start={LIT_START} end={LIT_END} style={styles.fill} />
          </Animated.View>
        )}
      </View>
    </View>
  )
})

interface SweepHeadingProps {
  /** One string per line; a plain string is a single line. */
  lines: readonly string[] | string
  palette: RisoPalette
  variant?: SweepVariant
  size?: SweepSize
  /** ms before the first line starts. */
  delay?: number
  /** false renders the final state (use for long lists). */
  animate?: boolean
  align?: "left" | "center"
  style?: StyleProp<ViewStyle>
}

export const SweepHeading = memo(function SweepHeading({
  lines,
  palette,
  variant = "plate",
  size = "title",
  delay = 0,
  animate = true,
  align = "left",
  style,
}: SweepHeadingProps) {
  const reduceMotion = useReducedMotion()
  const list = typeof lines === "string" ? [lines] : lines
  const play = animate && !reduceMotion

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={list.join(" ")}
      style={[align === "center" ? styles.center : styles.left, style]}
    >
      {list.map((text, i) => (
        <SweepLine
          key={`${i}:${text}`}
          text={text}
          palette={palette}
          variant={variant}
          size={size}
          delay={delay + i * Motion.staggerMs}
          play={play}
          last={i === list.length - 1}
        />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  left: { alignItems: "flex-start" },
  center: { alignItems: "center" },
  line: { maxWidth: "100%" },
  clip: { overflow: "hidden" },
  fill: { ...StyleSheet.absoluteFillObject },
  dither: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.55 },
  ghost: { position: "absolute" },
  lit: { position: "absolute", top: -8, bottom: -8, left: 0, width: LIT_WIDTH },
})
