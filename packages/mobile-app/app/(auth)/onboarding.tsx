import { memo, useCallback, useEffect, useRef, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Badge, Note } from "../../src/components/ui/Bits"
import { FanDeck, type FanCard } from "../../src/components/ui/FanDeck"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, Tappable } from "../../src/components/ui/Press"
import { Bar, Stat } from "../../src/components/ui/Stat"
import { Card, Screen } from "../../src/components/ui/Surface"
import { getDemo } from "../../src/data/demo"
import { useSport } from "../../src/hooks/useSport"
import { SPORTS, STATUS_LABEL, type Sport, type SportId } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Motion, Paper, Radius, Shadow, Space, Type } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

const STEPS = [
  {
    kicker: "Step one",
    title: "Prop your phone\nbehind the line.",
    deck: "Ayto follows the shuttle or ball frame by frame and turns the flight into a speed you can check.",
    icon: "record" as const,
  },
  {
    kicker: "Step two",
    title: "It reads\nyour body.",
    deck: "Pose estimation tracks your elbow, wrist and knees through the swing, then sets them beside reference form.",
    icon: "activity" as const,
  },
  {
    kicker: "Step three",
    title: "Pick the sport\nyou play.",
    deck: "Nine sports, each labelled with exactly what is ready. You can change this any time.",
    icon: "grid" as const,
  },
]

const SportTile = memo(function SportTile({
  sport,
  selected,
  onSelect,
}: {
  sport: Sport
  selected: boolean
  onSelect: (id: SportId) => void
}) {
  const reduce = useReducedMotion()
  const on = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    on.value = reduce ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: Motion.base, easing: BACK })
  }, [on, reduce, selected])

  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.97 + on.value * 0.03 }] }))
  const ring = useAnimatedStyle(() => ({ opacity: on.value }))

  const press = useCallback(() => onSelect(sport.id), [onSelect, sport.id])

  return (
    <Animated.View style={[styles.tileWrap, style]}>
      <Tappable
        onPress={press}
        label={`${sport.name}, ${STATUS_LABEL[sport.status]}`}
        scaleTo={0.95}
      >
        <View style={[styles.tile, selected && Shadow.md]}>
          <LinearGradient
            colors={[sport.palette.grad[0], sport.palette.grad[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View style={[styles.tileRing, { borderColor: sport.palette.accent }, ring]} />
          <View style={[styles.tileCode, { backgroundColor: Paper.veilStrong }]}>
            <Text style={[styles.tileCodeText, { color: sport.palette.ink }]}>{sport.code}</Text>
          </View>
          <Text style={styles.tileName} numberOfLines={1}>
            {sport.name}
          </Text>
          <Text style={[styles.tileStatus, { color: sport.palette.ink }]} numberOfLines={1}>
            {STATUS_LABEL[sport.status]}
          </Text>
          {selected ? (
            <View style={[styles.tileCheck, { backgroundColor: sport.palette.accent }]}>
              <Icon name="check" size={12} color="#FFFFFF" weight={2.6} />
            </View>
          ) : null}
        </View>
      </Tappable>
    </Animated.View>
  )
})

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const { palette } = sport
  const setSport = useUserStore((s) => s.setSportPreference)
  const setDone = useUserStore((s) => s.setOnboardingDone)
  const [step, setStep] = useState(0)
  const demo = getDemo(sport.id)
  const best = demo?.sessions[0]
  const headline = sport.metrics[0]

  const finish = () => {
    setDone(true)
    router.replace("/(tabs)")
  }

  const cards: FanCard[] = SPORTS.slice(0, 5).map((s) => ({
    key: s.id,
    title: s.name,
    caption: s.playArea.size,
    icon: s.section === "racket" ? "target" : s.section === "bat" ? "trophy" : "zap",
    palette: s.palette,
    onPress: () => setSport(s.id),
  }))

  const current = STEPS[step]

  return (
    <Screen palette={palette}>
      <View style={[styles.body, { paddingTop: insets.top + Space.lg, paddingBottom: insets.bottom + Space.lg }]}>
        <View style={styles.progress}>
          {STEPS.map((s, i) => (
            <View
              key={s.kicker}
              style={[
                styles.tick,
                { backgroundColor: i <= step ? palette.accent : Paper.lineStrong, flex: i === step ? 2.4 : 1 },
              ]}
            />
          ))}
        </View>

        <Reveal key={`head-${step}`} style={styles.head}>
          <Badge label={current.kicker} tone="accent" palette={palette} />
          <Text style={[Type.hero, styles.title]}>{current.title}</Text>
          <Text style={[Type.bodyMuted, styles.deck]}>{current.deck}</Text>
        </Reveal>

        <View style={styles.stage}>
          {step === 0 ? (
            <Reveal key="s0" from="scale" delay={120}>
              <FanDeck cards={cards} height={210} />
            </Reveal>
          ) : null}

          {step === 1 && demo && best ? (
            <Reveal key="s1" delay={120}>
              <Card elevation="lg" style={styles.specimen}>
                <Text style={Type.kicker}>Sample · {sport.name.toLowerCase()}</Text>
                <Stat
                  label={headline.label}
                  value={best.max_speed_kmh}
                  unit={headline.unit}
                  size="xl"
                  color={palette.deep}
                  delay={200}
                  style={styles.specimenStat}
                />
                <View style={styles.rows}>
                  {demo.report.body.map((row, i) => (
                    <View key={row.id} style={styles.row}>
                      <Text style={[Type.small, styles.rowLabel]} numberOfLines={1}>
                        {row.label}
                      </Text>
                      <Bar
                        value={row.you / row.pro}
                        color={palette.accent}
                        delay={260 + i * 90}
                        style={styles.rowBar}
                      />
                      <Text style={Type.metricSm}>
                        {row.you}
                        {row.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </Reveal>
          ) : null}

          {step === 2 ? (
            <Reveal key="s2" delay={80} style={styles.flex}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
                {SPORTS.map((s) => (
                  <SportTile key={s.id} sport={s} selected={s.id === sport.id} onSelect={setSport} />
                ))}
              </ScrollView>
            </Reveal>
          ) : null}
        </View>

        {step === 1 ? (
          <Reveal delay={400}>
            <Note palette={palette}>
              Sample data, shown so you can see the shape of a report. Analysing your own footage is
              still in development.
            </Note>
          </Reveal>
        ) : null}

        <Reveal key={`cta-${step}`} delay={200} style={styles.actions}>
          <Button
            label={step === STEPS.length - 1 ? `Start with ${sport.name}` : "Next"}
            palette={palette}
            size="lg"
            full
            trailingIcon="arrowRight"
            onPress={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
          />
          <Button
            label={step === 0 ? "Skip" : "Back"}
            palette={palette}
            variant="ghost"
            full
            onPress={() => (step === 0 ? finish() : setStep((s) => s - 1))}
          />
        </Reveal>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: Space.gutter, maxWidth: 560, width: "100%", alignSelf: "center" },
  flex: { flex: 1 },
  progress: { flexDirection: "row", gap: Space.xs, height: 4 },
  tick: { height: 4, borderRadius: 2 },
  head: { marginTop: Space.xl, gap: Space.sm },
  title: { marginTop: Space.xs },
  deck: { marginTop: Space.xs },
  stage: { flex: 1, justifyContent: "center", marginVertical: Space.lg },
  specimen: { gap: Space.sm },
  specimenStat: { marginTop: Space.sm },
  rows: { marginTop: Space.lg, gap: Space.md },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md },
  rowLabel: { width: 104 },
  rowBar: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, paddingBottom: Space.lg },
  tileWrap: { width: "31.5%" },
  tile: {
    height: 104,
    borderRadius: Radius.lg,
    overflow: "hidden",
    padding: Space.sm,
    justifyContent: "flex-end",
    gap: 1,
    backgroundColor: Paper.surface,
  },
  tileRing: { ...StyleSheet.absoluteFillObject, borderWidth: 2.5, borderRadius: Radius.lg },
  tileCode: {
    position: "absolute",
    top: Space.sm,
    left: Space.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  tileCodeText: { fontFamily: Fonts.bodySemi, fontSize: 10, letterSpacing: 0.6 },
  tileCheck: {
    position: "absolute",
    top: Space.sm,
    right: Space.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileName: { fontFamily: Fonts.bodySemi, fontSize: 13, color: Paper.ink, letterSpacing: -0.2 },
  tileStatus: { fontFamily: Fonts.body, fontSize: 10.5 },
  actions: { gap: Space.xs },
})
