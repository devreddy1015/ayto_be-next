import { memo, useCallback, useEffect, useRef } from "react"
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { SPORTS, type Sport, type SportId } from "../../sports"
import { useUserStore } from "../../store/userStore"
import { Fonts, Motion, Paper, Radius, Shadow, Space } from "../../theme"
import { Tappable } from "../ui/Press"
import { useReducedMotion } from "../../hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

const PILL_W = 112
const GAP = Space.sm

function Pill({ sport, active, onSelect }: { sport: Sport; active: boolean; onSelect: (id: SportId) => void }) {
  const reduce = useReducedMotion()
  const on = useSharedValue(active ? 1 : 0)

  useEffect(() => {
    on.value = reduce ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: Motion.base, easing: BACK })
  }, [active, on, reduce])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + on.value * 0.04 }],
    opacity: 0.68 + on.value * 0.32,
  }))

  const press = useCallback(() => onSelect(sport.id), [onSelect, sport.id])

  return (
    <Animated.View style={style}>
      <Tappable onPress={press} label={sport.name} scaleTo={0.94}>
        <View style={[styles.pill, active && Shadow.md, !active && styles.pillIdle]}>
          <LinearGradient
            colors={active ? [sport.palette.grad[0], sport.palette.grad[2]] : [Paper.surface, Paper.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.code, { backgroundColor: active ? Paper.veilStrong : sport.palette.soft }]}>
            <Text style={[styles.codeText, { color: sport.palette.ink }]}>{sport.code}</Text>
          </View>
          <Text style={[styles.name, { color: active ? Paper.ink : Paper.muted }]} numberOfLines={1}>
            {sport.name}
          </Text>
        </View>
      </Tappable>
    </Animated.View>
  )
}

interface SportSwitcherProps {
  style?: StyleProp<ViewStyle>
}

/** The horizontal rail of sports. Scrolls the active one into view on change. */
export const SportSwitcher = memo(function SportSwitcher({ style }: SportSwitcherProps) {
  const current = useUserStore((s) => s.sportPreference)
  const setSport = useUserStore((s) => s.setSportPreference)
  const rail = useRef<ScrollView>(null)

  useEffect(() => {
    const index = SPORTS.findIndex((s) => s.id === current)
    if (index < 0) return
    rail.current?.scrollTo({ x: Math.max(0, index * (PILL_W + GAP) - PILL_W), animated: true })
  }, [current])

  return (
    <ScrollView
      ref={rail}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={style}
      accessibilityRole="tablist"
    >
      {SPORTS.map((sport) => (
        <Pill key={sport.id} sport={sport} active={sport.id === current} onSelect={setSport} />
      ))}
    </ScrollView>
  )
})

const styles = StyleSheet.create({
  rail: { gap: GAP, paddingHorizontal: Space.gutter, paddingVertical: Space.sm },
  pill: {
    width: PILL_W,
    height: 62,
    borderRadius: Radius.lg,
    overflow: "hidden",
    paddingHorizontal: Space.md,
    justifyContent: "center",
    gap: 4,
    backgroundColor: Paper.surface,
  },
  pillIdle: { borderWidth: 1, borderColor: Paper.line },
  code: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs },
  codeText: { fontFamily: Fonts.bodySemi, fontSize: 10, letterSpacing: 0.6 },
  name: { fontFamily: Fonts.bodySemi, fontSize: 13.5, letterSpacing: -0.2 },
})

