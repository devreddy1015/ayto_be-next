import { useCallback } from "react"
import { Share, StyleSheet, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { Badge, Divider, Empty, Note, SectionHead } from "../../src/components/ui/Bits"
import { Reveal, useEnter } from "../../src/components/ui/Motion"
import { Button, IconButton } from "../../src/components/ui/Press"
import { Bar, Counter, Stat } from "../../src/components/ui/Stat"
import { Card, Page } from "../../src/components/ui/Surface"
import { findSession, getDemo } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { capitalize, clock, shortDate } from "../../src/lib/format"
import { getSport, strokeLabel } from "../../src/sports"
import { Fonts, Motion, Paper, Radius, Space, Type } from "../../src/theme"

/** Height of the speed-timeline columns, before the peak marker above them. */
const CHART_H = 132
/** A quiet stretch of the rally still reads as a tick, not an empty slot. */
const COLUMN_FLOOR = 5

interface ColumnProps {
  /** 0..1 of the chart's own maximum. */
  fraction: number
  color: string
  delay: number
}

/**
 * One column of the speed timeline.
 *
 * Its own component rather than a loop body because each column owns an
 * entrance clock, and hooks cannot be called from inside a `map`.
 */
function Column({ fraction, color, delay }: ColumnProps) {
  const t = useEnter(delay, Motion.slow)
  const grow = useAnimatedStyle(() => ({
    height: (COLUMN_FLOOR + (CHART_H - COLUMN_FLOOR) * fraction) * t.value,
  }))
  return <Animated.View style={[styles.column, { backgroundColor: color }, grow]} />
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { format, unit } = useSpeed()
  // Only the chrome of the not-found state falls back to the active sport;
  // a real session always tints from its own.
  const activeSport = useSport()
  const session = findSession(id ?? "latest")
  const sport = session ? getSport(session.sport) : activeSport
  const book = session ? getDemo(sport.id) : null
  const { palette } = sport

  const headline = sport.metrics[0]
  const summary = session
    ? `${sport.name} sample report on Ayto SportIQ — ${headline.label.toLowerCase()} ${format(session.max_speed_kmh)} ${unit}, ${session.strokes_count} ${sport.strokeNounPlural} in ${clock(session.duration_seconds)}. Sample data: Ayto has not analysed any footage yet.`
    : ""

  const share = useCallback(async () => {
    if (!summary) return
    try {
      await Share.share({ message: summary })
    } catch {
      // Web Share is missing from some browsers and rejects on dismissal
      // elsewhere. Neither is worth interrupting the report for.
    }
  }, [summary])

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/history"))

  if (!session || !book) {
    return (
      <Page palette={palette} intensity={0.5}>
        <Reveal style={styles.nav}>
          <IconButton name="arrowLeft" label="Go back" palette={palette} onPress={goBack} />
        </Reveal>
        <Reveal index={1}>
          <Empty
            title="That session isn't on this phone."
            caption="It may have been recorded somewhere else, or the link has gone stale."
            icon="info"
            palette={palette}
            action={
              <Button
                label="Back to history"
                palette={palette}
                variant="soft"
                icon="clock"
                onPress={goBack}
                style={styles.emptyAction}
              />
            }
          />
        </Reveal>
      </Page>
    )
  }

  const { report } = book
  const order = book.sessions.findIndex((s) => s.id === session.id)
  const previous = order >= 0 ? book.sessions[order + 1] : undefined

  // The sample report is generated once per sport, against that sport's best
  // session. Rescaling it to the session actually open keeps the page
  // self-consistent — otherwise an older session shows a timeline peak and a
  // stroke mix that contradict its own headline number.
  const best = book.sessions[0]
  const speedScale = best.max_speed_kmh > 0 ? session.max_speed_kmh / best.max_speed_kmh : 1
  const countScale = best.strokes_count > 0 ? session.strokes_count / best.strokes_count : 1

  // Built here rather than inline so the narrowing on `previous` survives into
  // the string, with no non-null assertion.
  let delta: { text: string; up: boolean } | undefined
  if (previous && previous.max_speed_kmh > 0) {
    const change = ((session.max_speed_kmh - previous.max_speed_kmh) / previous.max_speed_kmh) * 100
    delta = {
      text: `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}% on ${shortDate(previous.created_at)}`,
      up: change >= 0,
    }
  }

  const timeline = report.timeline.map((kmh) => format(kmh * speedScale))
  const peak = Math.max(...timeline)
  const peakIndex = timeline.indexOf(peak)
  const span = (timeline.length - 1) * report.timelineStepS

  const mix = report.mix.map((row) => ({
    id: row.stroke,
    label: strokeLabel(sport, row.stroke),
    count: Math.max(1, Math.round(row.count * countScale)),
    avg: format(row.avgKmh * speedScale),
  }))
  const mixMax = Math.max(...mix.map((row) => row.count))

  const minutes = Math.round(session.duration_seconds / 60)
  const dominant = session.dominant_stroke ? strokeLabel(sport, session.dominant_stroke) : null

  return (
    <Page palette={palette} intensity={0.55}>
      <Reveal style={styles.nav}>
        <IconButton name="arrowLeft" label="Go back" palette={palette} onPress={goBack} />
        <IconButton name="share" label="Share this sample report" palette={palette} onPress={share} />
      </Reveal>

      <Reveal index={1} style={styles.head}>
        <Text style={Type.kicker}>Sample report</Text>
        <Text style={[Type.hero, styles.title]} accessibilityRole="header">
          {sport.name}
        </Text>
        <Text
          style={[Type.bodyMuted, styles.deck]}
          accessibilityLabel={`${shortDate(session.created_at)}, ${minutes} minutes, ${sport.playArea.label}`}
        >
          {shortDate(session.created_at)} · {clock(session.duration_seconds)} · {sport.playArea.label.toLowerCase()}
        </Text>
        {dominant ? (
          <Badge label={`Mostly ${dominant.toLowerCase()}`} tone="accent" palette={palette} style={styles.headBadge} />
        ) : null}
      </Reveal>

      <Reveal index={2} style={styles.block}>
        <Note palette={palette}>
          Every number on this page is sample data. Ayto has not analysed any footage yet — there is
          no trained model running on your phone, so nothing here was measured.
        </Note>
      </Reveal>

      <Reveal index={3} style={styles.block}>
        <Card elevation="lg">
          <View style={styles.cardBadge}>
            <Badge label="Sample" tone="accent" palette={palette} dot />
          </View>
          <Stat
            label={headline.label}
            value={format(session.max_speed_kmh)}
            unit={unit}
            size="xl"
            color={palette.deep}
            delay={240}
            palette={palette}
            delta={delta}
          />
          <Divider style={styles.heroRule} />
          <View style={styles.statGrid}>
            <Stat
              label="Average"
              value={format(session.avg_speed_kmh)}
              unit={unit}
              size="sm"
              delay={320}
              icon="activity"
              style={styles.statCell}
            />
            <Stat
              label={capitalize(sport.strokeNounPlural)}
              value={session.strokes_count}
              size="sm"
              delay={380}
              icon="target"
              style={styles.statCell}
            />
            <Stat
              label="Form"
              value={report.form}
              unit="/100"
              size="sm"
              delay={440}
              icon="sparkle"
              style={styles.statCell}
            />
            <Stat
              label="Detection"
              value={report.detection}
              unit="%"
              size="sm"
              delay={500}
              icon="eye"
              style={styles.statCell}
            />
          </View>
        </Card>
      </Reveal>

      <Reveal index={4} style={styles.block}>
        <SectionHead
          kicker="Over the session"
          title="Speed timeline"
          caption={`One sample reading every ${report.timelineStepS} seconds.`}
          palette={palette}
          style={styles.sectionHead}
        />
        <Card variant="tint" palette={palette} elevation="sm">
          <View style={styles.chartTop}>
            <Stat label="Peak" value={peak} unit={unit} size="lg" color={palette.deep} delay={420} />
            <Text style={[Type.small, styles.chartWhen]}>
              at {peakIndex * report.timelineStepS}s of {span}s
            </Text>
          </View>
          <View
            style={styles.chartRow}
            accessible
            accessibilityLabel={`Speed timeline: ${timeline.length} sample readings, peaking at ${peak} ${unit} after ${peakIndex * report.timelineStepS} seconds.`}
          >
            {timeline.map((value, i) => (
              <View key={i * report.timelineStepS} style={styles.slot}>
                {i === peakIndex ? (
                  <View style={[styles.marker, { backgroundColor: palette.deep }]} />
                ) : null}
                <Column
                  fraction={peak > 0 ? value / peak : 0}
                  color={i === peakIndex ? palette.deep : palette.accent}
                  delay={360 + i * 45}
                />
              </View>
            ))}
          </View>
          <View style={styles.axis}>
            <Text style={Type.unit}>0s</Text>
            <Text style={Type.unit}>{Math.round(span / 2)}s</Text>
            <Text style={Type.unit}>{span}s</Text>
          </View>
        </Card>
      </Reveal>

      <Reveal index={5} style={styles.block}>
        <SectionHead
          kicker={`${session.strokes_count} ${sport.strokeNounPlural}`}
          title={`${capitalize(sport.strokeNoun)} mix`}
          caption="Sample counts and average speeds, across this sport's own taxonomy."
          palette={palette}
          style={styles.sectionHead}
        />
        <Card>
          {mix.map((row, i) => (
            <View
              key={row.id}
              style={[styles.mixRow, i > 0 && styles.mixRowGap]}
              accessible
              accessibilityLabel={`${row.label}: ${row.count} ${sport.strokeNounPlural}, averaging ${row.avg} ${unit}.`}
            >
              <View style={styles.mixTop}>
                <Text style={[Type.label, styles.mixLabel]} numberOfLines={1}>
                  {row.label}
                </Text>
                <View style={styles.mixFigures}>
                  <Counter value={row.count} delay={420 + i * 70} style={styles.mixCount} />
                  <Text style={styles.mixDot}>·</Text>
                  <Counter value={row.avg} delay={420 + i * 70} style={styles.mixAvg} />
                  <Text style={Type.unit}>{unit}</Text>
                </View>
              </View>
              <Bar value={row.count / mixMax} color={palette.accent} delay={420 + i * 70} />
            </View>
          ))}
        </Card>
      </Reveal>

      <Reveal index={6} style={styles.block}>
        <SectionHead
          kicker="Biomechanics"
          title="Against the reference average"
          caption="Both sides are sample figures — yours generated, the reference an illustrative tier rather than a measurement of any real athlete."
          palette={palette}
          style={styles.sectionHead}
        />
        <Card>
          {/* Furthest point from the page's honesty note, so it repeats the badge. */}
          <View style={styles.cardBadge}>
            <Badge label="Sample" tone="accent" palette={palette} dot />
          </View>
          {report.body.map((row, i) => {
            const ceiling = Math.max(row.you, row.pro, 1)
            // Degrees come whole, wrist speed in m/s does not; follow the data
            // rather than hard-coding a unit list that the next sport breaks.
            const dp = Number.isInteger(row.you) && Number.isInteger(row.pro) ? 0 : 1
            const gap = row.pro === 0 ? 0 : ((row.you - row.pro) / row.pro) * 100
            const verdict =
              Math.abs(gap) < 0.5
                ? "Level with the reference"
                : `${Math.abs(gap).toFixed(0)}% ${gap > 0 ? "above" : "below"} the reference`

            return (
              <View
                key={row.id}
                style={[styles.bodyRow, i > 0 && styles.bodyRowGap]}
                accessible
                accessibilityLabel={`${row.label}: you ${row.you.toFixed(dp)} ${row.unit}, reference ${row.pro.toFixed(dp)} ${row.unit}. ${verdict}.`}
              >
                <View style={styles.mixTop}>
                  <Text style={[Type.label, styles.mixLabel]} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={[Type.small, styles.verdict]}>{verdict}</Text>
                </View>

                <View style={styles.pair}>
                  <Text style={styles.pairKey}>You</Text>
                  <Bar
                    value={row.you / ceiling}
                    color={palette.accent}
                    delay={480 + i * 90}
                    style={styles.pairBar}
                  />
                  <View style={styles.pairValue}>
                    <Counter value={row.you} decimals={dp} delay={480 + i * 90} style={styles.pairNum} />
                    <Text style={Type.unit}>{row.unit}</Text>
                  </View>
                </View>

                <View style={styles.pair}>
                  <Text style={styles.pairKey}>Reference</Text>
                  <Bar
                    value={row.pro / ceiling}
                    color={Paper.faint}
                    delay={560 + i * 90}
                    style={styles.pairBar}
                  />
                  <View style={styles.pairValue}>
                    <Counter value={row.pro} decimals={dp} delay={560 + i * 90} style={styles.pairNum} />
                    <Text style={Type.unit}>{row.unit}</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </Card>
      </Reveal>

      <Reveal index={7} style={styles.footer}>
        <Button
          label="Record another session"
          palette={palette}
          size="lg"
          full
          icon="record"
          onPress={() => router.push("/record")}
        />
        <Button
          label="Compare against the references"
          palette={palette}
          variant="ghost"
          full
          trailingIcon="arrowRight"
          onPress={() => router.push("/compare")}
        />
        <Text style={[Type.small, styles.footerText]}>
          When on-device analysis ships, this page fills with your own numbers and the sample badges
          come off.
        </Text>
      </Reveal>
    </Page>
  )
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emptyAction: { marginTop: Space.lg },
  head: { marginTop: Space.xl },
  title: { marginTop: Space.xs },
  deck: { marginTop: Space.xs },
  headBadge: { marginTop: Space.md },
  block: { marginTop: Space.xl },
  sectionHead: { marginBottom: Space.lg },

  cardBadge: { flexDirection: "row", justifyContent: "flex-end", marginBottom: Space.sm },
  heroRule: { marginVertical: Space.xl },
  statGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: Space.xl },
  statCell: { flexBasis: "50%", flexGrow: 1 },

  chartTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: Space.md },
  chartWhen: { paddingBottom: Space.xs },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: CHART_H + 12, marginTop: Space.xl },
  slot: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: Space.xs },
  marker: { width: 6, height: 6, borderRadius: 3 },
  column: { alignSelf: "stretch", borderTopLeftRadius: Radius.xs, borderTopRightRadius: Radius.xs },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: Space.sm },

  mixRow: { gap: Space.sm },
  mixRowGap: { marginTop: Space.lg },
  mixTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: Space.sm },
  mixLabel: { flexShrink: 1 },
  mixFigures: { flexDirection: "row", alignItems: "baseline", gap: Space.xs },
  mixCount: { fontFamily: Fonts.display, fontSize: 17, letterSpacing: -0.3, color: Paper.ink },
  mixDot: { fontFamily: Fonts.body, fontSize: 13, color: Paper.faint },
  mixAvg: { fontFamily: Fonts.bodyMed, fontSize: 13, color: Paper.muted },

  bodyRow: { gap: Space.sm },
  bodyRowGap: { marginTop: Space.xl, paddingTop: Space.xl, borderTopWidth: 1, borderTopColor: Paper.line },
  verdict: { flexShrink: 0 },
  pair: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  pairKey: { fontFamily: Fonts.bodyMed, fontSize: 12, lineHeight: 16, color: Paper.faint, width: 66 },
  pairBar: { flex: 1 },
  pairValue: { flexDirection: "row", alignItems: "baseline", gap: 3, width: 66, justifyContent: "flex-end" },
  pairNum: { fontFamily: Fonts.display, fontSize: 15, letterSpacing: -0.3, color: Paper.ink },

  footer: { marginTop: Space.xxl, gap: Space.sm },
  footerText: { textAlign: "center", marginTop: Space.sm },
})
