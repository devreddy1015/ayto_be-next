import { useEffect, useMemo, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { Stat } from "../../src/components/ui/Stat"
import { getDemo } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { pad2 } from "../../src/lib/format"
import { Fonts, Paper, Space, Type } from "../../src/theme"

const STAGE_MS = 1250
const REVEAL_MS = 1500

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const { palette } = sport
  const { format, unit } = useSpeed()
  const latest = getDemo(sport.id)?.sessions[0] ?? null
  const reduceMotion = useReducedMotion()
  const stages = useMemo(
    () => [`Tracing the ${sport.tracked}`, "Reading your pose", `Naming each ${sport.strokeNoun}`, "Printing the report"],
    [sport.tracked, sport.strokeNoun],
  )
  const total = stages.length * STAGE_MS
  const [stage, setStage] = useState(0)
  const [done, setDone] = useState(false)
  const progress = useSharedValue(0)

  useEffect(() => {
    // Nothing was analysed for this sport: don't pretend, go home.
    if (!latest) {
      router.replace("/(tabs)")
      return
    }
    // One UI-thread tween for the bar; JS only wakes up once per stage.
    progress.value = withTiming(1, { duration: reduceMotion ? 0 : total, easing: Easing.linear })
    const timers = stages.map((_, i) => setTimeout(() => setStage(i), i * STAGE_MS))
    timers.push(setTimeout(() => setDone(true), total))
    timers.push(
      setTimeout(() => router.replace({ pathname: "/session/[id]", params: { id: "latest" } }), total + REVEAL_MS),
    )
    return () => timers.forEach(clearTimeout)
    // Runs once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }))

  return (
    <Screen palette={palette}>
      <View style={[styles.body, { paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl }]}>
        <Text style={Type.kicker}>
          Processing · {sport.name} · {pad2(stage + 1)}/{pad2(stages.length)}
        </Text>
        <SweepHeading key={stage} lines={stages[stage]} palette={palette} size="title" style={styles.heading} />

        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: stages.length, now: stage + 1 }}>
          <Animated.View style={[styles.fill, { backgroundColor: palette.plate }, barStyle]} />
        </View>

        <View style={styles.list}>
          {stages.map((label, i) => {
            const state = i < stage || done ? "done" : i === stage ? "now" : "next"
            return (
              <View key={label} style={[styles.row, i > 0 && styles.rule]}>
                <Text style={[styles.no, { color: state === "next" ? Paper.faint : palette.ink }]}>{pad2(i + 1)}</Text>
                <Text style={[Type.body, styles.flex, state === "next" && { color: Paper.faint }]}>{label}</Text>
                <Text style={[styles.mark, { color: state === "done" ? palette.ink : Paper.faint }]}>
                  {state === "done" ? "✓" : state === "now" ? "…" : ""}
                </Text>
              </View>
            )
          })}
        </View>

        {done && latest ? (
          <Stat
            label={`${sport.metrics[0].label} · this session`}
            value={format(latest.max_speed_kmh)}
            unit={unit}
            size="xl"
            color={palette.ink}
            style={styles.reveal}
          />
        ) : (
          <Text style={[Type.deck, styles.reveal]}>Everything runs on this phone. Keep the app open.</Text>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: Space.gutter, maxWidth: 560, width: "100%", alignSelf: "center" },
  flex: { flex: 1 },
  heading: { marginTop: Space.lg, minHeight: 96 },
  track: { height: 6, backgroundColor: Paper.raised, marginTop: Space.xl, overflow: "hidden" },
  fill: { ...StyleSheet.absoluteFillObject, transformOrigin: "left" },
  list: { marginTop: Space.xl, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Paper.rule },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingVertical: Space.md },
  rule: { borderTopWidth: 1, borderTopColor: Paper.rule },
  no: { fontFamily: Fonts.monoBold, fontSize: 12, width: 24 },
  mark: { fontFamily: Fonts.monoBold, fontSize: 14, width: 18, textAlign: "right" },
  reveal: { marginTop: Space.xxl },
})
