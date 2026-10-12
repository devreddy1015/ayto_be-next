import { useEffect, useMemo, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Badge, Note } from "../../src/components/ui/Bits"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Button } from "../../src/components/ui/Press"
import { Stat } from "../../src/components/ui/Stat"
import { Card, Screen } from "../../src/components/ui/Surface"
import { getDemo } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { clock } from "../../src/lib/format"
import { useSessionStore } from "../../src/store/sessionStore"
import { Motion, Paper, Space, Type } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

const STAGE_MS = 900
const REVEAL_MS = 900
const EASE = Easing.bezier(...Motion.ease)

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const { palette } = sport
  const { format, unit } = useSpeed()
  const reduce = useReducedMotion()
  const clip = useSessionStore((s) => s.clip)
  const latest = getDemo(sport.id)?.sessions[0] ?? null

  // On-device inference is not wired up: the recorder saves a clip, nothing
  // analyses it. So the stages describe what actually happens — saving the
  // file and opening a clearly-labelled sample report — and never claim to be
  // tracking, reading pose or naming strokes.
  const stages = useMemo(
    () => [clip ? "Saving your clip" : "Preparing", "Opening a sample report"],
    [clip],
  )
  const total = stages.length * STAGE_MS

  const [stage, setStage] = useState(0)
  const [done, setDone] = useState(false)
  const progress = useSharedValue(reduce ? 1 : 0)

  useEffect(() => {
    if (!reduce) progress.value = withTiming(1, { duration: total, easing: Easing.linear })
    const timers = stages.map((_, i) => setTimeout(() => setStage(i), i * STAGE_MS))
    timers.push(setTimeout(() => setDone(true), total))
    timers.push(
      setTimeout(
        () => router.replace({ pathname: "/session/[id]", params: { id: "latest" } }),
        total + REVEAL_MS,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // Runs once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }))
  const tickStyle = (i: number) => (i < stage || done ? palette.accent : Paper.lineStrong)

  return (
    <Screen palette={palette}>
      <View style={[styles.body, { paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl }]}>
        <Reveal>
          <Badge label={`${sport.name} · ${stage + 1} of ${stages.length}`} tone="accent" palette={palette} />
          <Text style={[Type.hero, styles.title]}>{done ? "All set." : `${stages[stage]}…`}</Text>
        </Reveal>

        <Reveal index={1} style={styles.trackWrap}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { backgroundColor: palette.accent }, bar]} />
          </View>
          <View style={styles.ticks}>
            {stages.map((label, i) => (
              <View key={label} style={styles.tickRow}>
                <View style={[styles.tickDot, { backgroundColor: tickStyle(i) }]}>
                  {i < stage || done ? <Icon name="check" size={11} color="#FFFFFF" weight={3} /> : null}
                </View>
                <Text style={[Type.small, (i < stage || done) && { color: Paper.ink }]}>{label}</Text>
              </View>
            ))}
          </View>
        </Reveal>

        <View style={styles.spacer} />

        {done ? (
          <Reveal from="scale">
            <Card elevation="lg">
              <Text style={Type.kicker}>Sample · not your result</Text>
              <Stat
                label={sport.metrics[0].label}
                value={latest ? format(latest.max_speed_kmh) : 0}
                unit={unit}
                size="xl"
                color={palette.deep}
                delay={120}
                style={styles.stat}
              />
              {clip ? (
                <View style={styles.clipRow}>
                  <Icon name="check" size={15} color={palette.ink} weight={2.4} />
                  <Text style={Type.small}>
                    Your {clock(clip.seconds)} clip is saved on this phone.
                  </Text>
                </View>
              ) : null}
            </Card>
          </Reveal>
        ) : null}

        <Reveal index={2} style={styles.footer}>
          <Note palette={palette}>
            Ayto cannot analyse your own footage yet. The number above is sample data, and nothing
            was measured or uploaded.
          </Note>
          {done ? (
            <Button
              label="See the sample report"
              palette={palette}
              size="lg"
              full
              trailingIcon="arrowRight"
              onPress={() => router.replace({ pathname: "/session/[id]", params: { id: "latest" } })}
            />
          ) : null}
        </Reveal>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: Space.gutter, maxWidth: 520, width: "100%", alignSelf: "center" },
  title: { marginTop: Space.md },
  trackWrap: { marginTop: Space.xl, gap: Space.lg },
  track: { height: 6, borderRadius: 3, backgroundColor: Paper.sunken, overflow: "hidden" },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 3, transformOrigin: "left" },
  ticks: { gap: Space.sm },
  tickRow: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  tickDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  spacer: { flex: 1 },
  stat: { marginTop: Space.sm },
  clipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: 1,
    borderTopColor: Paper.line,
  },
  footer: { gap: Space.md, marginTop: Space.xl },
})
