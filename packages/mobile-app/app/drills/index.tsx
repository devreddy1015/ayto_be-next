import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Badge, Chip, Divider, Empty, Note } from "../../src/components/ui/Bits"
import { Segmented } from "../../src/components/ui/Form"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, IconButton, Tappable } from "../../src/components/ui/Press"
import { Card, Page } from "../../src/components/ui/Surface"
import { drillsFor } from "../../src/data/drills"
import { useSport } from "../../src/hooks/useSport"
import { capitalize, pad2 } from "../../src/lib/format"
import { LIVE_SPORT, SPORTS, getSport, isSportId, strokeLabel, type Sport, type SportId } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import type { Drill, DrillLevel } from "../../src/types"
import { Fonts, Motion, Paper, Radius, Rise, Space, Type } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

type LevelFilter = "all" | DrillLevel

const LEVELS: readonly { value: LevelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
]

/** Keeps a long book from staggering for three seconds before the last card lands. */
const MAX_STAGGER = 6

interface DrillCardProps {
  drill: Drill
  sport: Sport
  index: number
  expanded: boolean
  onToggle: (id: string) => void
}

const DrillCard = memo(function DrillCard({ drill, sport, index, expanded, onToggle }: DrillCardProps) {
  const { palette } = sport
  const reduce = useReducedMotion()
  const turn = useSharedValue(expanded ? 1 : 0)

  useEffect(() => {
    turn.value = reduce ? (expanded ? 1 : 0) : withTiming(expanded ? 1 : 0, { duration: Motion.quick })
  }, [expanded, reduce, turn])

  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }))

  const toggle = useCallback(() => onToggle(drill.id), [drill.id, onToggle])

  const startRecording = useCallback(() => {
    // The camera reads the sport out of the store, not this screen's filter, so
    // point it at the drill's sport before handing over.
    useUserStore.getState().setSportPreference(sport.id)
    router.push("/record")
  }, [sport.id])

  return (
    <Reveal index={Math.min(index, MAX_STAGGER)} style={styles.cardWrap}>
      <Card padded={false} elevation={expanded ? "lg" : "sm"}>
        <Tappable
          onPress={toggle}
          scaleTo={0.99}
          label={`${drill.title}. ${capitalize(drill.level)}, ${drill.minutes} minutes. ${
            expanded ? "Tap to collapse" : "Tap for the steps"
          }`}
        >
          <View style={styles.head}>
            <View style={styles.headText}>
              <View style={styles.meta}>
                <Badge label={strokeLabel(sport, drill.stroke)} tone="accent" palette={palette} />
                <Badge label={capitalize(drill.level)} />
                <Text style={Type.kicker}>{drill.minutes} min</Text>
              </View>
              <Text style={styles.title}>{drill.title}</Text>
              <Text style={[Type.small, styles.blurb]} numberOfLines={expanded ? undefined : 2}>
                {drill.description}
              </Text>
            </View>
            <Animated.View style={[styles.chevron, { backgroundColor: palette.soft }, chevron]}>
              <Icon name="chevronDown" size={18} color={palette.onSoft} weight={2.2} />
            </Animated.View>
          </View>
        </Tappable>

        {expanded ? (
          // Keyed to the drill so the block deals itself in again on every open,
          // rather than sitting at the end state from the last time it was read.
          <Reveal key={drill.id} distance={Rise.sm} style={styles.detail}>
            <Divider />

            <Text style={[Type.kicker, styles.detailHead]}>How it runs</Text>
            {drill.steps.map((step, i) => (
              <View key={step} style={styles.step}>
                <View style={[styles.stepNo, { backgroundColor: palette.soft }]}>
                  <Text style={[styles.stepNoText, { color: palette.onSoft }]}>{pad2(i + 1)}</Text>
                </View>
                <Text style={[Type.body, styles.stepText]}>{step}</Text>
              </View>
            ))}

            <Text style={[Type.kicker, styles.detailHead]}>What to bring</Text>
            <View style={styles.badges}>
              {drill.equipment.map((item) => (
                <Badge key={item} label={item} />
              ))}
            </View>

            <Text style={[Type.kicker, styles.detailHead]}>What it builds</Text>
            <View style={styles.badges}>
              {drill.benefits.map((benefit) => (
                <Badge key={benefit} label={benefit} tone="accent" palette={palette} dot />
              ))}
            </View>

            {sport.status === "live" ? (
              <Button
                label="Film this drill"
                icon="record"
                palette={palette}
                variant="soft"
                full
                onPress={startRecording}
                style={styles.cta}
              />
            ) : (
              <Text style={[Type.small, styles.cta]}>
                Take this one to the court — the camera is built around {LIVE_SPORT.name} for now.
              </Text>
            )}
          </Reveal>
        ) : null}
      </Card>
    </Reveal>
  )
})

/**
 * The drill book: coaching drills for every sport, filtered by sport and level.
 *
 * Nothing here is personalised. The book is hand-written content, the same for
 * everyone, so the screen never frames a drill as a recommendation.
 */
export default function DrillsScreen() {
  const params = useLocalSearchParams<{ sport?: string }>()
  const active = useSport()

  // A sport page links here with its own sport; anything else — including a
  // hand-typed param — falls back to the athlete's current sport. The choice
  // then lives in this screen, not the store: browsing another sport's book
  // should not re-tint the whole app.
  const [sportId, setSportId] = useState<SportId>(isSportId(params.sport) ? params.sport : active.id)
  const [level, setLevel] = useState<LevelFilter>("all")
  const [open, setOpen] = useState<string | null>(null)

  const sport = getSport(sportId)
  const { palette } = sport

  const book = useMemo(() => drillsFor(sportId), [sportId])
  const visible = useMemo(
    () => (level === "all" ? book : book.filter((drill) => drill.level === level)),
    [book, level],
  )

  const toggle = useCallback((id: string) => setOpen((current) => (current === id ? null : id)), [])

  // An open card can vanish under a filter change, so both filters close it.
  const chooseSport = useCallback((id: SportId) => {
    setSportId(id)
    setOpen(null)
  }, [])

  const chooseLevel = useCallback((next: LevelFilter) => {
    setLevel(next)
    setOpen(null)
  }, [])

  return (
    <Page palette={palette} intensity={0.55} animated={false}>
      <Reveal style={styles.nav}>
        <IconButton
          name="arrowLeft"
          label="Go back"
          palette={palette}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        />
        <Text style={Type.kicker}>
          {sport.name} · {pad2(visible.length)} of {pad2(book.length)}
        </Text>
      </Reveal>

      <Reveal index={1} style={styles.hero}>
        <Text style={Type.hero} accessibilityRole="header">
          Drill book.
        </Text>
        <Text style={[Type.bodyMuted, styles.deck]}>
          Standard coaching drills for every sport in Ayto. Pick one, read the steps, take it to the court.
        </Text>
      </Reveal>

      <Reveal index={2}>
        <Note palette={palette}>
          These are written by coaches, not picked for you — Ayto has never watched you play. The minutes are a
          suggested length, not something measured.
        </Note>
      </Reveal>

      <Reveal index={3} style={styles.filters}>
        <Text style={[Type.kicker, styles.filterLabel]}>Sport</Text>
        {/* Bleeds past the page gutter so the rail runs to both screen edges. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.rail}
          contentContainerStyle={styles.railContent}
          accessibilityRole="tablist"
        >
          {SPORTS.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.name}
              palette={palette}
              selected={entry.id === sportId}
              icon={entry.id === sportId ? "check" : undefined}
              onPress={() => chooseSport(entry.id)}
            />
          ))}
        </ScrollView>

        <Segmented
          label="Level"
          options={LEVELS}
          value={level}
          onChange={chooseLevel}
          palette={palette}
          style={styles.levels}
        />
      </Reveal>

      {visible.length > 0 ? (
        // Re-keyed on the filters so a new selection deals the cards out again
        // instead of swapping them in behind the ones that happened to survive.
        <View key={`${sportId}-${level}`} style={styles.list}>
          {visible.map((drill, i) => (
            <DrillCard
              key={drill.id}
              drill={drill}
              sport={sport}
              index={i}
              expanded={open === drill.id}
              onToggle={toggle}
            />
          ))}
        </View>
      ) : (
        <Reveal index={4}>
          <Empty
            icon="target"
            palette={palette}
            title={book.length === 0 ? "This book is still being written" : "Nothing at that level yet"}
            caption={
              book.length === 0
                ? `No ${sport.name} drills have been written up yet. Try another sport.`
                : `The ${sport.name} book has ${book.length} drills, none of them marked ${level}.`
            }
            action={
              book.length > 0 ? (
                <Button
                  label="Show every level"
                  palette={palette}
                  variant="soft"
                  size="sm"
                  onPress={() => chooseLevel("all")}
                  style={styles.emptyAction}
                />
              ) : null
            }
          />
        </Reveal>
      )}

      <Reveal index={5} style={styles.footer}>
        <Text style={[Type.small, styles.footerText]}>
          Drills are the same for everyone. When stroke analysis ships, it will sit beside this book — it will not
          rewrite it.
        </Text>
      </Reveal>
    </Page>
  )
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.lg },
  hero: { marginBottom: Space.lg },
  deck: { marginTop: Space.sm },
  filters: { marginTop: Space.xl },
  filterLabel: { marginBottom: Space.sm, color: Paper.muted },
  rail: { marginHorizontal: -Space.gutter, flexGrow: 0 },
  railContent: { gap: Space.sm, paddingHorizontal: Space.gutter, paddingVertical: Space.xs },
  levels: { marginTop: Space.lg },
  list: { marginTop: Space.xl },
  cardWrap: { marginBottom: Space.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: Space.md, padding: Space.lg },
  headText: { flex: 1 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: Space.xs },
  title: { fontFamily: Fonts.display, fontSize: 19, lineHeight: 25, letterSpacing: -0.3, color: Paper.ink, marginTop: Space.sm },
  blurb: { marginTop: Space.xs },
  chevron: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  detail: { paddingHorizontal: Space.lg, paddingBottom: Space.lg },
  detailHead: { marginTop: Space.lg, marginBottom: Space.sm },
  step: { flexDirection: "row", alignItems: "flex-start", gap: Space.md, marginBottom: Space.sm },
  stepNo: { width: 26, height: 26, borderRadius: Radius.xs, alignItems: "center", justifyContent: "center" },
  stepNoText: { fontFamily: Fonts.bodySemi, fontSize: 12, letterSpacing: 0.4 },
  stepText: { flex: 1, fontSize: 15 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: Space.xs },
  cta: { marginTop: Space.xl },
  emptyAction: { marginTop: Space.md },
  footer: { marginTop: Space.xxl },
  footerText: { textAlign: "center", lineHeight: 19 },
})
