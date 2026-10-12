import { Fragment, memo, useCallback, useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Badge, Divider, Note, SectionHead } from "../../src/components/ui/Bits"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Tappable } from "../../src/components/ui/Press"
import { Card, Page } from "../../src/components/ui/Surface"
import { useSport } from "../../src/hooks/useSport"
import {
  SECTIONS,
  SPORTS,
  STATUS_LABEL,
  type AnalysisStatus,
  type Sport,
  type SportId,
  type SportPalette,
} from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Motion, Paper, Radius, Shadow, Space, Type } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

/** Clears the floating tab bar — mirrors TAB_BAR_CLEARANCE in app/(tabs)/_layout.tsx. */
const TAB_CLEARANCE = 96

/** Blocks above the first section, so the stagger keeps counting across the page. */
const HEAD_BLOCKS = 3

const STATUS_ORDER: readonly AnalysisStatus[] = ["live", "beta", "soon"]

const STATUS_TONE: Record<AnalysisStatus, "accent" | "warn" | "neutral"> = {
  live: "accent",
  beta: "warn",
  soon: "neutral",
}

/** What each label promises — and, just as importantly, what it does not. */
const STATUS_MEANING: Record<AnalysisStatus, string> = {
  live:
    "The whole pipeline is built and tested: tracking, pose, stroke classification, speed and pro comparison. " +
    "Running it on a clip from inside the app is still in development.",
  beta:
    "Court geometry and ball physics are in, and the stroke model is training. " +
    "There are no readings for these sports yet.",
  soon: "On the roadmap. Nothing is built for these beyond the labels and colours on this page.",
}

const STATUS_COUNT: Record<AnalysisStatus, number> = {
  live: SPORTS.filter((sport) => sport.status === "live").length,
  beta: SPORTS.filter((sport) => sport.status === "beta").length,
  soon: SPORTS.filter((sport) => sport.status === "soon").length,
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * The gallery, grouped the way the registry groups it. Static — SECTIONS and
 * SPORTS never change at runtime — so it is built once at module load.
 *
 * `reveal` is where a group's heading lands in the page-wide stagger: every
 * group before it contributes its own heading plus one card per sport.
 */
const GROUPS = SECTIONS.map((section) => ({
  ...section,
  sports: SPORTS.filter((sport) => sport.section === section.id),
}))
  .filter((group) => group.sports.length > 0)
  .map((group, i, all) => ({
    ...group,
    reveal: HEAD_BLOCKS + all.slice(0, i).reduce((n, g) => n + g.sports.length + 1, 0),
  }))

const FOOTER_REVEAL = HEAD_BLOCKS + GROUPS.length + SPORTS.length

export default function SportsScreen() {
  const current = useSport()
  const { palette } = current
  const setSport = useUserStore((s) => s.setSportPreference)

  // One tap does both jobs: it retunes the rest of the app to this sport and
  // opens its page, so nobody has to find a separate "make this mine" control.
  const open = useCallback(
    (id: SportId) => {
      setSport(id)
      router.push({ pathname: "/sport/[id]", params: { id } })
    },
    [setSport],
  )

  return (
    <Page palette={palette} intensity={0.8} bottomInset={TAB_CLEARANCE}>
      <Reveal style={styles.block}>
        <Text style={Type.kicker}>The collection · {plural(SPORTS.length, "sport")}</Text>
        <Text style={[Type.hero, styles.hero]} accessibilityRole="header">
          Every sport, one camera.
        </Text>
        <Text style={Type.bodyMuted}>
          Pick the game you play and the rest of the app retunes to it — its colours, its strokes, its court.
        </Text>
      </Reveal>

      <Reveal index={1} style={styles.block}>
        <SectionHead
          kicker="A roadmap, not a scoreboard"
          title="What the labels mean"
          caption="Every sport carries one of three. They say what has been built so far — none of them means the app is analysing your footage today."
          palette={palette}
          style={styles.head}
        />
        <Card variant="glass" elevation="sm">
          {STATUS_ORDER.map((status, i) => (
            <Fragment key={status}>
              {i > 0 ? <Divider style={styles.legendRule} /> : null}
              <View style={styles.legendRow}>
                <View style={styles.legendTop}>
                  <Badge
                    label={STATUS_LABEL[status]}
                    tone={STATUS_TONE[status]}
                    palette={palette}
                    dot={status === "live"}
                  />
                  <Text style={Type.kicker}>{plural(STATUS_COUNT[status], "sport")}</Text>
                </View>
                <Text style={Type.small}>{STATUS_MEANING[status]}</Text>
              </View>
            </Fragment>
          ))}
        </Card>
      </Reveal>

      <Reveal index={2} style={styles.block}>
        <Note palette={palette}>
          No clip has been analysed anywhere in Ayto yet. Any figures you meet elsewhere in the app are generated
          sample data, and they say so where they sit.
        </Note>
      </Reveal>

      {GROUPS.map((group) => (
        <View key={group.id} style={styles.block}>
          <Reveal index={group.reveal}>
            <SectionHead
              kicker={plural(group.sports.length, "sport")}
              title={group.title}
              caption={group.deck}
              palette={palette}
              style={styles.head}
            />
          </Reveal>
          {group.sports.map((sport, i) => (
            <Reveal key={sport.id} index={group.reveal + 1 + i}>
              <Plate sport={sport} active={sport.id === current.id} onOpen={open} />
            </Reveal>
          ))}
        </View>
      ))}

      <Reveal index={FOOTER_REVEAL} style={styles.footer}>
        <Divider />
        <Text style={[Type.small, styles.footerText]}>
          Racket sports first, then bat and ball, then the field games. That order is the order they arrive in.
        </Text>
      </Reveal>
    </Page>
  )
}

interface PlateProps {
  sport: Sport
  active: boolean
  onOpen: (id: SportId) => void
}

/** One gallery plate: the sport's own mesh stops over a white footer of facts. */
const Plate = memo(function Plate({ sport, active, onOpen }: PlateProps) {
  const { palette } = sport
  const press = useCallback(() => onOpen(sport.id), [onOpen, sport.id])

  return (
    <Tappable
      onPress={press}
      label={`${sport.name}. ${STATUS_LABEL[sport.status]}.${active ? " Your sport." : ""} Opens ${sport.name}.`}
    >
      <View style={[styles.card, Shadow.md]}>
        <LinearGradient
          colors={[...palette.grad]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.plate}
        >
          <View style={styles.plateTop}>
            <View style={styles.code}>
              <Text style={[styles.codeText, { color: palette.deep }]}>{sport.code}</Text>
            </View>
            {active ? (
              // Mounts only when this sport is chosen, so Reveal doubles as the
              // badge's selection animation.
              <Reveal from="scale" duration={Motion.quick}>
                <View style={styles.mine}>
                  <Icon name="check" size={13} color={palette.deep} weight={2.6} />
                  <Text style={[styles.mineText, { color: palette.deep }]}>Your sport</Text>
                </View>
              </Reveal>
            ) : null}
          </View>

          <Text style={Type.title}>{sport.name}</Text>
          <Text style={[Type.small, styles.tagline]}>{sport.tagline}</Text>

          <View style={styles.area}>
            <Icon name="ruler" size={14} color={palette.deep} weight={2} />
            <Text style={styles.areaText}>
              {sport.playArea.label} · {sport.playArea.size}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.foot}>
          <View style={styles.footTop}>
            <Badge
              label={STATUS_LABEL[sport.status]}
              tone={STATUS_TONE[sport.status]}
              palette={palette}
              dot={sport.status === "live"}
            />
            <Icon name="chevronRight" size={16} color={Paper.faint} />
          </View>
          <Text style={Type.small}>{sport.statusNote}</Text>
        </View>

        <Ring palette={palette} active={active} />
      </View>
    </Tappable>
  )
})

/** The selection ring. Sits over the card, takes no touches, springs in and out. */
function Ring({ palette, active }: { palette: SportPalette; active: boolean }) {
  const reduce = useReducedMotion()
  const on = useSharedValue(active ? 1 : 0)

  useEffect(() => {
    on.value = reduce ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: Motion.base, easing: BACK })
  }, [active, on, reduce])

  const style = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.975 + on.value * 0.025 }],
  }))

  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: palette.accent }, style]} />
}

const styles = StyleSheet.create({
  block: { marginBottom: Space.xl },
  hero: { marginTop: Space.sm, marginBottom: Space.md },
  head: { marginBottom: Space.lg },
  legendRow: { gap: Space.sm },
  legendRule: { marginVertical: Space.lg },
  legendTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm },
  card: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Paper.surface,
    marginBottom: Space.md,
  },
  plate: { padding: Space.xl },
  plateTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.lg,
    minHeight: 36,
  },
  code: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Paper.veil,
  },
  codeText: { fontFamily: Fonts.displayBold, fontSize: 14, letterSpacing: 0.2 },
  mine: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingLeft: Space.sm,
    paddingRight: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Paper.veilStrong,
  },
  mineText: { fontFamily: Fonts.bodySemi, fontSize: 12, letterSpacing: 0.1 },
  // Paper.ink is the only text colour the gradient stops are contrast-checked
  // for, so the deck rides on size rather than a lighter tone.
  tagline: { color: Paper.ink, marginTop: Space.xs },
  area: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Paper.veil,
  },
  areaText: { fontFamily: Fonts.bodyMed, fontSize: 12.5, letterSpacing: 0.1, color: Paper.ink },
  foot: { padding: Space.lg, gap: Space.sm, borderTopWidth: 1, borderTopColor: Paper.line },
  footTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm },
  ring: { ...StyleSheet.absoluteFillObject, borderRadius: Radius.xl, borderWidth: 2 },
  footer: { gap: Space.lg, marginTop: Space.sm },
  footerText: { textAlign: "center" },
})
