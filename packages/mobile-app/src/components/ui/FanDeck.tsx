import { memo, useCallback, useEffect, useState } from "react"
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated"
import type { SportPalette } from "../../sports"
import { Fonts, Motion, Paper, Radius, Shadow, Space, Type } from "../../theme"
import { Icon, type IconName } from "./Icon"
import { Tappable } from "./Press"
import { useReducedMotion } from "../../hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

export interface FanCard {
  key: string
  title: string
  caption?: string
  icon: IconName
  palette: SportPalette
  onPress?: () => void
}

interface FanDeckProps {
  cards: readonly FanCard[]
  /** Degrees between neighbouring cards. */
  spread?: number
  height?: number
  delay?: number
  style?: StyleProp<ViewStyle>
}

const CARD_W = 128
const CARD_H = 152
/** Room left either side so the outermost card never touches the edge. */
const EDGE_PAD = 24
const MAX_STEP = 56
const MIN_STEP = 30
/** Assumed width until the first layout pass. */
const NARROW_PHONE = 340

function Fanned({ card, i, mid, spread, step, delay }: {
  card: FanCard
  i: number
  mid: number
  spread: number
  /** Horizontal distance between neighbouring card centres, in px. */
  step: number
  delay: number
}) {
  const reduce = useReducedMotion()
  const t = useSharedValue(reduce ? 1 : 0)
  const lift = useSharedValue(0)
  const offset = i - mid

  useEffect(() => {
    if (reduce) {
      t.value = 1
      return
    }
    // Cards deal out from the middle of the deck, outwards.
    const startAt = delay + Math.abs(offset) * 90
    t.value = withDelay(startAt, withTiming(1, { duration: Motion.slow, easing: BACK }))
    // See useSettleGuard in Motion.tsx: rAF is paused in a background tab, so
    // without this the deck can be left dealt half-way and never arrive.
    const guard = setTimeout(() => {
      if (t.value !== 1) t.value = 1
    }, startAt + Motion.slow + 120)
    return () => clearTimeout(guard)
  }, [delay, offset, reduce, t])

  const style = useAnimatedStyle(() => {
    const settle = t.value
    return {
      opacity: settle,
      transform: [
        { translateY: (1 - settle) * 46 - lift.value * 14 },
        { rotate: `${offset * spread * settle}deg` },
        { translateX: offset * step * settle },
        { scale: (0.86 + settle * 0.14) * (1 + lift.value * 0.04) },
      ],
      zIndex: Math.round(10 - Math.abs(offset)),
    }
  })

  const onIn = () => {
    lift.value = withTiming(1, { duration: Motion.quick, easing: Easing.out(Easing.quad) })
  }
  const onOut = () => {
    lift.value = withTiming(0, { duration: Motion.base, easing: BACK })
  }

  return (
    <Animated.View style={[styles.slot, style]} onTouchStart={onIn} onTouchEnd={onOut} onTouchCancel={onOut}>
      <Tappable onPress={card.onPress} label={card.title} scaleTo={0.94}>
        <View style={[styles.card, Shadow.lg]}>
          <LinearGradient
            colors={[card.palette.grad[0], card.palette.grad[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.badge, { backgroundColor: Paper.veilStrong }]}>
            <Icon name={card.icon} size={19} color={card.palette.ink} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {card.title}
            </Text>
            {card.caption ? (
              <Text style={[Type.small, styles.cardCaption]} numberOfLines={1}>
                {card.caption}
              </Text>
            ) : null}
          </View>
        </View>
      </Tappable>
    </Animated.View>
  )
}

/**
 * Cards dealt out in a shallow arc, the way a hand of cards fans.
 *
 * The deck is the screen's one moment of theatre: cards arrive from the
 * centre outwards and lift under a finger. With reduce-motion on, the fan is
 * drawn settled.
 *
 * It measures itself and shrinks the fan to the width it actually has, so the
 * outermost cards never run off a narrow phone. Below `MIN_STEP` it stops
 * shrinking and lets the cards overlap more instead, which still reads as a
 * deck.
 */
export const FanDeck = memo(function FanDeck({
  cards,
  spread = 7,
  height = 230,
  delay = 240,
  style,
}: FanDeckProps) {
  const [width, setWidth] = useState(0)
  const mid = (cards.length - 1) / 2

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width)
  }, [])

  // The outermost card is rotated, so its bounding box is wider than CARD_W:
  // w*cos(a) + h*sin(a). Fit against that, or the corners clip off-screen.
  //
  // Before the first layout callback, fall back to a step that fits the
  // narrowest phone rather than rendering nothing: onLayout does not fire in
  // a backgrounded tab, and an invisible deck is worse than a tight one.
  const outerDeg = (mid * spread * Math.PI) / 180
  const rotatedW = CARD_W * Math.cos(outerDeg) + CARD_H * Math.sin(outerDeg)
  const fitted =
    mid > 0
      ? ((width > 0 ? width : NARROW_PHONE) - rotatedW - EDGE_PAD) / (2 * mid)
      : MAX_STEP
  const step = Math.max(MIN_STEP, Math.min(MAX_STEP, fitted))
  const tilt = spread * Math.min(1, step / MAX_STEP)

  return (
    <View style={[styles.deck, { height }, style]} accessibilityRole="menu" onLayout={onLayout}>
      {cards.map((card, i) => (
        <Fanned key={card.key} card={card} i={i} mid={mid} spread={tilt} step={step} delay={delay} />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  deck: { alignItems: "center", justifyContent: "flex-end" },
  slot: { position: "absolute", bottom: 0 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: Radius.lg,
    overflow: "hidden",
    padding: Space.md,
    justifyContent: "space-between",
    backgroundColor: Paper.surface,
  },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardText: { gap: 2 },
  cardTitle: { fontFamily: Fonts.display, fontSize: 16, lineHeight: 20, letterSpacing: -0.4, color: Paper.ink },
  cardCaption: { fontSize: 12, lineHeight: 15 },
})
