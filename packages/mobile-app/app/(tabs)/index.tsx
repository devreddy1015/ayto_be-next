import { useCallback, useMemo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { SportSwitcher } from "../../src/components/sport/SportSwitcher"
import { Badge, Divider, Empty, Note, SectionHead } from "../../src/components/ui/Bits"
import { FanDeck, type FanCard } from "../../src/components/ui/FanDeck"
import { Icon, type IconName } from "../../src/components/ui/Icon"
import { Reveal, useEnter } from "../../src/components/ui/Motion"
import { Button, IconButton, Tappable } from "../../src/components/ui/Press"
import { Counter, Stat } from "../../src/components/ui/Stat"
import { Card, Page } from "../../src/components/ui/Surface"
import { getDemo, type DemoBook } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { clock, shortDate } from "../../src/lib/format"
import {
  SPORTS,
  getSport,
  type AnalysisStatus,
  type Sport,
  type SportId,
  type SportSection,
} from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

/** The five sports on the deck. Badminton sits in the middle: the fan deals outwards from there. */
const DECK: readonly SportId[] = ["table_tennis", "tennis", "badminton", "pickleball", "squash"]

const SPORT_ICON: Record<SportId, IconName> = {
  badminton: "zap",
  tennis: "target",
  table_tennis: "activity",
  pickleball: "sparkle",
  squash: "shield",
  padel: "compare",
  cricket: "trophy",
  football: "play",
  basketball: "trending",
}

/**
 * How far along each sport is, in the athlete's words.
 *
 * Deliberately not `STATUS_LABEL`, which calls the first tier "Live analysis":
 * the badminton pipeline passes its tests in the Python packages, but no clip
 * has ever been through it inside this app, so "live" would overclaim.
 */
const READINESS: Record<AnalysisStatus, string> = {
  live: "Built & tested",
  beta: "In training",
  soon: "On the roadmap",
}

const COUNT: Record<AnalysisStatus, number> = {
  live: SPORTS.filter((sport) => sport.status === "live").length,
  beta: SPORTS.filter((sport) => sport.status === "beta").length,
  soon: SPORTS.filter((sport) => sport.status === "soon").length,
}

const TODAY: readonly { status: AnalysisStatus; icon: IconName }[] = [
  { status: "live", icon: "check" },
  { status: "beta", icon: "activity" },
  { status: "soon", icon: "sparkle" },
]

/** The second line of the greeting, in the language of the sport you're on. */
const ASK: Record<SportSection, string> = {
  racket: "ready to hit?",
  bat: "ready to middle one?",
  field: "ready to play?",
}

const CHART_HEIGHT = 104

interface Readout {
  value: number
  unit: string
  decimals: number
}

/**
 * Every sample session stores its headline number in km/h. Most sports read it
 * as a speed and honour the km/h / mph preference, but basketball's headline
 * metric is a release time — so take the unit from the sport rather than
 * assuming, and keep the one decimal the generator uses for the slower sports.
 */
function readout(sport: Sport, kmh: number, speed: ReturnType<typeof useSpeed>): Readout {
  const metric = sport.metrics[0]
  const isSpeed = metric.unit === "km/h"
  const value = isSpeed ? speed.format(kmh) : kmh
  return {
    value,
    unit: isSpeed ? speed.unit : metric.unit,
    decimals: Number.isInteger(value) ? 0 : 1,
  }
}

/**
 * Which direction counts as an improvement.
 *
 * Eight of the nine headline metrics are speeds, where a bigger number is the
 * better result. Basketball's is a release time in seconds, where it is the
 * other way round — so "best" and the week-on-week delta have to ask the
 * metric rather than assume that up is good.
 */
function lowerIsBetter(sport: Sport): boolean {
  return sport.metrics[0].unit === "s"
}

export default function HomeScreen() {
  const sport = useSport()
  const { palette } = sport
  const profile = useUserStore((s) => s.profile)
  const setSport = useUserStore((s) => s.setSportPreference)
  const demo = getDemo(sport.id)

  const name = profile?.name.trim().split(" ")[0] || "there"

  const deck = useMemo<FanCard[]>(
    () =>
      DECK.map((id) => {
        const card = getSport(id)
        return {
          key: card.id,
          title: card.name,
          caption: READINESS[card.status],
          icon: SPORT_ICON[card.id],
          palette: card.palette,
          onPress: () => setSport(card.id),
        }
      }),
    [setSport],
  )

  return (
    <Page palette={palette} bottomInset={96}>
      <Reveal style={styles.head}>
        <View
          style={styles.greeting}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`Hi ${name}, ${ASK[sport.section]}`}
        >
          <Text style={Type.hero}>Hi {name},</Text>
          <Text style={[Type.hero, { color: palette.deep }]}>{ASK[sport.section]}</Text>
        </View>
        <IconButton
          name="settings"
          label="Settings"
          palette={palette}
          onPress={() => router.push("/settings")}
        />
      </Reveal>

      {/* The deck deals itself out on a spring — a Reveal on top would fight it.
          It also runs full-bleed, so the outermost cards clear the gutter. */}
      <FanDeck cards={deck} delay={140} style={styles.deck} />

      {/* The rail carries its own gutter, so it sits outside the page padding. */}
      <Reveal index={2} style={styles.rail}>
        <SportSwitcher />
      </Reveal>

      {demo ? (
        <>
          <Reveal index={3} style={styles.block}>
            <SectionHead
              title="Last session"
              palette={palette}
              action={{ label: "All", onPress: () => router.push("/(tabs)/history") }}
            />
            <LastSession sport={sport} demo={demo} />
          </Reveal>

          <Reveal index={4} style={styles.block}>
            <SectionHead
              title="This week"
              caption={`${sport.metrics[0].label}, day by day`}
              palette={palette}
            />
            <Week sport={sport} demo={demo} />
          </Reveal>
        </>
      ) : (
        <Reveal index={3} style={styles.block}>
          <Empty
            title="No sample sessions for this sport yet."
            caption="Pick another sport from the deck above."
            icon="grid"
            palette={palette}
          />
        </Reveal>
      )}

      <Reveal index={5} style={styles.block}>
        <SectionHead
          title="What Ayto can do today"
          caption={`Across all ${SPORTS.length} sports`}
          palette={palette}
        />
        <View style={styles.tiles}>
          {TODAY.map((tier, i) => (
            <View
              key={tier.status}
              style={styles.tileWrap}
              accessible
              accessibilityLabel={`${COUNT[tier.status]} sports ${READINESS[tier.status].toLowerCase()}`}
            >
              <Card padded={false} elevation="sm" style={styles.tile}>
                <View style={[styles.tileIcon, { backgroundColor: palette.soft }]}>
                  <Icon name={tier.icon} size={15} color={palette.ink} weight={2.2} />
                </View>
                <Counter value={COUNT[tier.status]} delay={340 + i * 90} style={Type.metric} />
                <Text style={styles.tileLabel}>{READINESS[tier.status]}</Text>
              </Card>
            </View>
          ))}
        </View>
        <Note palette={palette}>
          Built &amp; tested means the tracking, pose and stroke code passes its tests in our Python
          packages. No footage has been through it inside this app yet, so every number on this
          screen is sample data.
        </Note>
      </Reveal>

      <Reveal index={6} style={styles.cta}>
        <Button
          label="Record a session"
          palette={palette}
          size="lg"
          icon="record"
          full
          onPress={() => router.push("/record")}
        />
        <Text style={[Type.small, styles.ctaNote]}>Your footage stays on this phone.</Text>
      </Reveal>
    </Page>
  )
}

/** The most recent sample session, as one tappable card. */
function LastSession({ sport, demo }: { sport: Sport; demo: DemoBook }) {
  const speed = useSpeed()
  const { palette } = sport
  const [last, previous] = demo.sessions
  const peak = readout(sport, last.max_speed_kmh, speed)
  const average = readout(sport, last.avg_speed_kmh, speed)

  // Sample books run best-session-first, so this lands positive — but it is
  // still computed, because each sport generates its own numbers.
  const change = previous
    ? ((last.max_speed_kmh - previous.max_speed_kmh) / previous.max_speed_kmh) * 100
    : null
  // The delta's arrow means "went the right way", not "went up".
  const improved = change !== null && (lowerIsBetter(sport) ? change <= 0 : change >= 0)

  const open = useCallback(
    () => router.push({ pathname: "/session/[id]", params: { id: last.id } }),
    [last.id],
  )

  return (
    <Tappable onPress={open} label={`Open the session from ${shortDate(last.created_at)}`}>
      <Card elevation="lg">
        <View style={styles.cardHead}>
          <Text style={Type.kicker}>{shortDate(last.created_at)}</Text>
          <Badge label="Sample" tone="accent" palette={palette} dot />
        </View>

        <Stat
          label={sport.metrics[0].label}
          value={peak.value}
          unit={peak.unit}
          decimals={peak.decimals}
          size="xl"
          color={palette.deep}
          palette={palette}
          delay={160}
          // The sign is spelled out rather than left to the arrow and the
          // colour, which a screen reader never sees.
          delta={
            change === null
              ? undefined
              : {
                  text: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs ${shortDate(previous.created_at)}`,
                  up: improved,
                }
          }
          style={styles.peak}
        />

        <Divider style={styles.cardRule} />

        <View style={styles.statRow}>
          <Stat
            label="Average"
            value={average.value}
            unit={average.unit}
            decimals={average.decimals}
            size="sm"
            delay={240}
            style={styles.statCell}
          />
          <Stat
            label={sport.strokeNounPlural}
            value={last.strokes_count}
            size="sm"
            delay={300}
            style={styles.statCell}
          />
          <Stat label="Duration" value={clock(last.duration_seconds)} size="sm" style={styles.statCell} />
        </View>

        <View style={styles.open}>
          <Text style={[Type.label, { color: palette.ink }]}>Open this session</Text>
          <Icon name="chevronRight" size={15} color={palette.ink} weight={2.2} />
        </View>
      </Card>
    </Tappable>
  )
}

/** Seven sample days as columns that grow in left to right. */
function Week({ sport, demo }: { sport: Sport; demo: DemoBook }) {
  const speed = useSpeed()
  const { palette } = sport
  const days = demo.weekly.map((entry) => ({ day: entry.day, ...readout(sport, entry.kmh, speed) }))
  const high = Math.max(...days.map((d) => d.value))
  const low = Math.min(...days.map((d) => d.value))
  // One precision for the whole row, so the labels line up.
  const places = days.some((d) => d.decimals === 1) ? 1 : 0
  // Column heights follow the value, but the best day is whichever end of the
  // range the metric rewards — for a release time that is the shortest column.
  const inverted = lowerIsBetter(sport)
  const bestValue = inverted ? low : high

  // Floored well above zero: a week of speeds varies by a few per cent, and a
  // true zero baseline would draw seven columns of identical height. The note
  // under the chart says so, and every column is labelled with its value.
  const ratio = (value: number) => (high === low ? 1 : 0.3 + 0.7 * ((value - low) / (high - low)))

  return (
    <Card elevation="md">
      <View style={styles.cardHead}>
        <Text style={Type.subhead}>
          Best {bestValue.toFixed(places)} {days[0].unit}
        </Text>
        <Badge label="Sample" tone="accent" palette={palette} dot />
      </View>

      {/* Keyed by sport so switching sports re-deals the columns rather than
          snapping them to their new heights. */}
      <View
        key={sport.id}
        style={styles.chart}
        accessible
        accessibilityLabel={`${sport.metrics[0].label} per day in ${days[0].unit}: ${days
          .map((d) => `${d.day} ${d.value.toFixed(places)}`)
          .join(", ")}`}
      >
        {days.map((d, i) => (
          <Column
            key={d.day}
            day={d.day}
            label={d.value.toFixed(places)}
            ratio={ratio(d.value)}
            color={palette.accent}
            best={d.value === bestValue}
            delay={260 + i * 70}
          />
        ))}
      </View>

      <Text style={[Type.small, styles.chartNote]}>
        Columns are scaled to this week, not to zero.
        {inverted ? " A shorter column is the better result for this metric." : null}
      </Text>
    </Card>
  )
}

function Column({
  day,
  label,
  ratio,
  color,
  best,
  delay,
}: {
  day: string
  label: string
  ratio: number
  color: string
  best: boolean
  delay: number
}) {
  const t = useEnter(delay)
  const grow = useAnimatedStyle(() => ({ height: CHART_HEIGHT * ratio * t.value }))

  return (
    <View style={styles.column}>
      <Text style={[styles.columnValue, best && styles.columnStrong]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.columnTrack}>
        <Animated.View style={[styles.columnFill, { backgroundColor: color }, !best && styles.columnFade, grow]} />
      </View>
      <Text style={[styles.columnDay, best && styles.columnStrong]} numberOfLines={1}>
        {day}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: Space.md },
  greeting: { flex: 1 },
  deck: { marginHorizontal: -Space.gutter, marginTop: Space.lg },
  rail: { marginHorizontal: -Space.gutter, marginTop: Space.xs },
  block: { marginTop: Space.xxl, gap: Space.md },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm },
  peak: { marginTop: Space.lg },
  cardRule: { marginVertical: Space.lg },
  statRow: { flexDirection: "row", gap: Space.md },
  statCell: { flex: 1 },
  open: { flexDirection: "row", alignItems: "center", gap: Space.xxs, marginTop: Space.lg },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: Space.xs, marginTop: Space.lg },
  column: { flex: 1, alignItems: "center", gap: Space.xs },
  columnTrack: {
    height: CHART_HEIGHT,
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: Paper.sunken,
    borderRadius: Radius.xs,
    overflow: "hidden",
  },
  columnFill: { width: "100%", borderRadius: Radius.xs },
  columnFade: { opacity: 0.32 },
  columnValue: { fontFamily: Fonts.bodySemi, fontSize: 10.5, lineHeight: 14, color: Paper.faint },
  columnDay: { fontFamily: Fonts.bodyMed, fontSize: 11, lineHeight: 15, color: Paper.faint },
  columnStrong: { color: Paper.ink },
  chartNote: { marginTop: Space.md },
  tiles: { flexDirection: "row", gap: Space.sm },
  tileWrap: { flex: 1 },
  tile: { padding: Space.md, gap: Space.xxs, alignItems: "flex-start" },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.xs,
  },
  tileLabel: { fontFamily: Fonts.bodyMed, fontSize: 12, lineHeight: 16, color: Paper.muted },
  cta: { marginTop: Space.xxl, gap: Space.md },
  ctaNote: { textAlign: "center" },
})
