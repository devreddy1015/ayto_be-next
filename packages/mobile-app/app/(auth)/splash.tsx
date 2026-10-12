import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { Reveal } from "../../src/components/ui/Motion"
import { Screen } from "../../src/components/ui/Surface"
import { useSport } from "../../src/hooks/useSport"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Motion, Paper, Space, Type } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

const EASE = Easing.bezier(...Motion.ease)

/**
 * First-launch title card.
 *
 * The mark draws itself: a ring sweeps open while the wordmark rises through
 * it. Timing is deliberately short — this is a loading screen, not a show.
 */
export default function SplashScreen() {
  const { palette } = useSport()
  const reduce = useReducedMotion()
  const ring = useSharedValue(reduce ? 1 : 0)
  const pulse = useSharedValue(0)

  useEffect(() => {
    if (!reduce) {
      ring.value = withTiming(1, { duration: Motion.slow, easing: EASE })
      pulse.value = withDelay(
        Motion.slow,
        withRepeat(withSequence(withTiming(1, { duration: 1100, easing: EASE }), withTiming(0, { duration: 1100 })), -1),
      )
    }
    const timer = setTimeout(
      () => router.replace(useUserStore.getState().isOnboardingDone ? "/(tabs)" : "/onboarding"),
      reduce ? 600 : 2100,
    )
    return () => clearTimeout(timer)
  }, [pulse, reduce, ring])

  const outer = useAnimatedStyle(() => ({
    opacity: ring.value,
    transform: [{ scale: 0.6 + ring.value * 0.4 }, { rotate: `${(1 - ring.value) * -40}deg` }],
  }))
  const halo = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.22,
    transform: [{ scale: 1 + pulse.value * 0.16 }],
  }))

  return (
    <Screen palette={palette}>
      <View style={styles.center}>
        <View style={styles.markWrap}>
          <Animated.View style={[styles.halo, { backgroundColor: palette.accent }, halo]} />
          <Animated.View style={[styles.ring, { borderColor: palette.accent }, outer]}>
            <View style={[styles.dot, { backgroundColor: palette.accent }]} />
          </Animated.View>
        </View>

        <Reveal delay={260} style={styles.words}>
          <Text style={styles.wordmark}>Ayto</Text>
          <Text style={[Type.kicker, styles.kicker]}>SportIQ</Text>
        </Reveal>

        <Reveal delay={520}>
          <Text style={[Type.bodyMuted, styles.tagline]}>Your game, measured.</Text>
        </Reveal>
      </View>

      <Reveal delay={760}>
        <Text style={[Type.small, styles.footer]}>One phone · nine sports</Text>
      </Reveal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Space.gutter },
  markWrap: { width: 128, height: 128, alignItems: "center", justifyContent: "center", marginBottom: Space.xl },
  halo: { position: "absolute", width: 128, height: 128, borderRadius: 64 },
  ring: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 18, height: 18, borderRadius: 9 },
  words: { alignItems: "center" },
  wordmark: { fontFamily: Fonts.displayBold, fontSize: 46, letterSpacing: -2, color: Paper.ink },
  kicker: { marginTop: 2 },
  tagline: { marginTop: Space.md, textAlign: "center" },
  footer: { textAlign: "center", marginBottom: Space.xxxl, color: Paper.faint },
})
