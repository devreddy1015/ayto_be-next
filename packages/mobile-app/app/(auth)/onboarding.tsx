import { memo, useCallback, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Bars, Meter } from "../../src/components/data/Bars"
import { RisoSurface, Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import Button, { tapHaptic } from "../../src/components/ui/Button"
import { Stat } from "../../src/components/ui/Stat"
import { getDemo } from "../../src/data/demo"
import { useSport } from "../../src/hooks/useSport"
import { pad2 } from "../../src/lib/format"
import { LIVE_SPORT, SPORTS, STATUS_LABEL, type RisoPalette, type Sport, type SportId } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

const STEPS = [
  {
    kicker: "01 — Track",
    lines: ["Every shot,", "measured."],
    deck: "Prop your phone behind the baseline. Ayto follows the shuttle or ball frame by frame and turns it into speed you can trust.",
  },
  {
    kicker: "02 — Form",
    lines: ["Read your", "form."],
    deck: "Pose estimation reads your elbow, wrist and knees, then sets them beside the pros.",
  },
  {
    kicker: "03 — Sport",
    lines: ["Pick your", "sport."],
    deck: "Badminton is fully live. Every other sport is labelled with exactly what's ready.",
  },
] as const

const SportTile = memo(function SportTile({
  sport,
  selected,
  onSelect,
}: {
  sport: Sport
  selected: boolean
  onSelect: (id: SportId) => void
}) {
  const press = useCallback(() => {
    tapHaptic()
    onSelect(sport.id)
  }, [onSelect, sport.id])
  const { palette } = sport
  return (
    <Pressable
      onPress={press}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${sport.name}, ${STATUS_LABEL[sport.status]}`}
      style={[styles.tile, selected && { borderColor: palette.plate, backgroundColor: Paper.stock }]}
    >
      <View style={[styles.code, { backgroundColor: palette.plate }]}>
        <Text style={[styles.codeText, { color: palette.onPlate }]}>{sport.code}</Text>
      </View>
      <View style={styles.tileText}>
        <Text style={styles.tileName} numberOfLines={1}>
          {sport.name}
        </Text>
        <Text style={[styles.tileStatus, { color: sport.status === "live" ? palette.ink : Paper.faint }]}>
          {STATUS_LABEL[sport.status]}
        </Text>
      </View>
    </Pressable>
  )
})

const SAMPLE = getDemo(LIVE_SPORT.id)

/** A printed specimen of what the step describes, from labelled sample data. */
const Specimen = memo(function Specimen({ step, palette }: { step: number; palette: RisoPalette }) {
  if (!SAMPLE) return null
  return (
    <RisoSurface palette={palette} color={Paper.stock} glow={0.35} glowSize={360} grain={0.4} style={styles.specimen}>
      <Text style={Type.kicker}>Specimen · sample {LIVE_SPORT.name.toLowerCase()} session</Text>
      {step === 0 ? (
        <>
          <Stat label={LIVE_SPORT.metrics[0].label} value={SAMPLE.sessions[0].max_speed_kmh} unit="km/h" size="xl" color={palette.ink} style={styles.specimenStat} />
          <Bars
            values={SAMPLE.report.timeline}
            max={Math.max(...SAMPLE.report.timeline) * 1.1}
            height={56}
            color={palette.plate}
            highlight={{ threshold: Math.max(...SAMPLE.report.timeline), color: palette.ink3 }}
            accessibilityLabel="Sample speed timeline"
          />
        </>
      ) : (
        <View style={styles.specimenStat}>
          {SAMPLE.report.body.map((row) => (
            <Meter key={row.id} label={row.label} you={row.you} pro={row.pro} unit={row.unit} youColor={palette.plate} proColor={palette.ink3} />
          ))}
        </View>
      )}
    </RisoSurface>
  )
})

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(0)
  const sport = useSport()
  const setSportPreference = useUserStore((s) => s.setSportPreference)
  const setOnboardingDone = useUserStore((s) => s.setOnboardingDone)

  const finish = useCallback(() => {
    setOnboardingDone(true)
    router.replace("/login")
  }, [setOnboardingDone])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish()
  }, [step, finish])

  const current = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <Screen palette={sport.palette}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={Type.kicker}>Ayto · SportIQ</Text>
          <Pressable onPress={finish} accessibilityRole="button" hitSlop={10}>
            <Text style={[Type.kicker, styles.skip]}>Skip</Text>
          </Pressable>
        </View>

        <Text style={[Type.kicker, styles.stepKicker, { color: sport.palette.ink }]}>{current.kicker}</Text>
        <SweepHeading key={step} lines={current.lines} palette={sport.palette} size="hero" />
        <Text style={[Type.deck, styles.deck]}>{current.deck}</Text>

        {last ? (
          <View style={styles.grid} accessibilityRole="radiogroup">
            {SPORTS.map((s) => (
              <SportTile key={s.id} sport={s} selected={s.id === sport.id} onSelect={setSportPreference} />
            ))}
          </View>
        ) : (
          <Specimen step={step} palette={sport.palette} />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.lg }]}>
        <View>
          <Text style={[Type.kicker, styles.count]}>
            {pad2(step + 1)} / {pad2(STEPS.length)}
          </Text>
          <View style={styles.progress}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.segment, { backgroundColor: i <= step ? sport.palette.plate : Paper.rule }]}
              />
            ))}
          </View>
        </View>
        <Button
          label={last ? `Start with ${sport.name}` : "Next"}
          trailing="→"
          palette={sport.palette}
          onPress={next}
          style={styles.next}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.gutter, paddingBottom: Space.xl },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.xxxl },
  skip: { color: Paper.text, textDecorationLine: "underline" },
  stepKicker: { marginBottom: Space.md },
  deck: { marginTop: Space.xl, maxWidth: 420 },
  specimen: { marginTop: Space.xl, padding: Space.lg, borderWidth: 1, borderColor: Paper.rule, borderRadius: Radius.sm },
  specimenStat: { marginTop: Space.md, marginBottom: Space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xl },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    padding: Space.sm,
    borderWidth: 1,
    borderColor: Paper.rule,
    borderRadius: Radius.sm,
  },
  code: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  codeText: { fontFamily: Fonts.monoBold, fontSize: 13 },
  tileText: { flex: 1 },
  tileName: { fontFamily: Fonts.display, fontSize: 16, lineHeight: 20, color: Paper.text },
  tileStatus: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: Space.gutter,
    paddingTop: Space.lg,
    borderTopWidth: 1,
    borderTopColor: Paper.rule,
    backgroundColor: Paper.bg,
  },
  count: { marginBottom: Space.sm },
  next: { flexShrink: 1, marginLeft: Space.md },
  progress: { flexDirection: "row", gap: 4 },
  segment: { width: 22, height: 4 },
})
