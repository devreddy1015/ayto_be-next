import { useMemo, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { SportSwitcher } from "../../src/components/sport/SportSwitcher"
import { Badge, Divider, Empty, Note, SectionHead } from "../../src/components/ui/Bits"
import { Segmented } from "../../src/components/ui/Form"
import { Reveal } from "../../src/components/ui/Motion"
import { Button } from "../../src/components/ui/Press"
import { Bar, Stat } from "../../src/components/ui/Stat"
import { Card, Page } from "../../src/components/ui/Surface"
import { getDemo } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import type { SportPalette } from "../../src/sports"
import { Motion, Paper, Space, Type } from "../../src/theme"

/** A ledger row resolved against the chosen reference tier. Higher is better. */
interface CompareRow {
  id: string
  label: string
  /** Already converted to the athlete's preferred speed unit where relevant. */
  unit: string
  you: number
  reference: number
  /** you / reference, clamped to 0..1. */
  ratio: number
  /** Bar fill, both sides sharing one scale so the gap is to size. */
  youShare: number
  referenceShare: number
}

/** The sample data names the tiers "Elite reference"; the selector has room for the tier only. */
function tierLabel(name: string): string {
  return name.replace(/\s*reference$/i, "")
}

/** Sample values are integers or one decimal — never print 9.200000000000001. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function CompareScreen() {
  const sport = useSport()
  const { palette } = sport
  const { format: formatSpeed, unit: speedUnit } = useSpeed()
  const demo = getDemo(sport.id)
  const [tierId, setTierId] = useState<string | null>(null)

  const tiers = demo?.pros ?? []
  const tier = tiers.find((t) => t.id === tierId) ?? tiers[0]
  const tierName = tier ? tierLabel(tier.name) : ""

  const rows = useMemo<CompareRow[]>(() => {
    if (!demo || !tier) return []
    return demo.ledger.map((row) => {
      const reference = tier.values[row.id] ?? row.you
      // A reference of zero would divide to Infinity; read it as already met.
      const ratio = reference > 0 ? Math.min(row.you / reference, 1) : 1
      const scale = Math.max(row.you, reference)
      const isSpeed = row.unit === "km/h"
      return {
        id: row.id,
        label: row.label,
        unit: isSpeed ? speedUnit : row.unit,
        you: isSpeed ? formatSpeed(row.you) : row.you,
        reference: isSpeed ? formatSpeed(reference) : reference,
        ratio,
        youShare: scale > 0 ? row.you / scale : 0,
        referenceShare: scale > 0 ? reference / scale : 0,
      }
    })
  }, [demo, formatSpeed, speedUnit, tier])

  const match = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.ratio, 0) / rows.length) * 100)
    : 0

  // The row the athlete is furthest behind on — what the coaching note speaks to.
  const gap = rows.length ? rows.reduce((worst, row) => (row.ratio < worst.ratio ? row : worst)) : null
  const coaching = gap
    ? (demo?.coaching[gap.id] ??
      "Make this the one thing you work on next session. One row at a time moves further than all six at once.")
    : ""

  return (
    <Page palette={palette} intensity={0.7} bottomInset={96}>
      <Reveal style={styles.head}>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={Type.kicker}>Compare</Text>
            <Text style={Type.hero} accessibilityRole="header">
              Where you stand.
            </Text>
          </View>
          <Badge label="Sample" tone="accent" palette={palette} dot />
        </View>
        <Text style={[Type.bodyMuted, styles.deck]}>
          Your {sport.name.toLowerCase()} sample numbers, lined up against three reference profiles. None of this has
          been measured yet — the analysis that will fill these rows is still being built.
        </Text>
      </Reveal>

      {/* The rail sets its own gutter, so it bleeds back out of the page padding. */}
      <Reveal index={1} style={styles.rail}>
        <SportSwitcher />
      </Reveal>

      {!tier || rows.length === 0 ? (
        <Reveal index={2} style={styles.block}>
          <Empty
            title="No ledger for this sport yet"
            caption={`${sport.name} will get its comparison rows as the model work lands. Pick another sport to see how the screen reads.`}
            icon="compare"
            palette={palette}
            action={
              <Button
                label="Browse sports"
                palette={palette}
                variant="soft"
                onPress={() => router.push("/(tabs)/sports")}
              />
            }
          />
        </Reveal>
      ) : (
        <>
          <Reveal index={2} style={styles.block}>
            <Segmented
              label="Compare against"
              options={tiers.map((t) => ({ value: t.id, label: tierLabel(t.name) }))}
              value={tier.id}
              onChange={setTierId}
              palette={palette}
            />
            <Text style={[Type.small, styles.caption]}>Three illustrative profiles, hardest first.</Text>
          </Reveal>

          <Reveal index={3} style={styles.block}>
            <Card variant="glass" elevation="lg" style={styles.matchCard}>
              <View style={styles.matchTop}>
                {/* Keyed on the tier so the count-up runs again on every switch. */}
                <Stat
                  key={tier.id}
                  label={`Match · ${tierName}`}
                  value={match}
                  unit="%"
                  size="xl"
                  color={palette.deep}
                  delay={120}
                  style={styles.matchStat}
                />
                <Badge label="Sample" tone="accent" palette={palette} />
              </View>

              <Bar
                key={`${tier.id}-match`}
                value={match / 100}
                color={palette.accent}
                height={10}
                delay={160}
              />

              <View style={styles.legend}>
                <Swatch color={palette.accent} label="You" />
                <Swatch color={Paper.ink} label={tierName} />
              </View>

              <Text style={[Type.small, styles.matchCaption]}>
                Your sample numbers reach {match}% of this profile across the {rows.length} rows below, each row capped
                at 100%. Both sides are sample figures.
              </Text>
            </Card>
          </Reveal>

          <Reveal index={4} style={styles.block}>
            <Note palette={palette} icon="info">
              These are illustrative reference profiles, not measurements. No athlete sits behind them and none of the
              figures is sourced — they exist so the comparison has something to hold until real analysis lands.
            </Note>
          </Reveal>

          <Reveal index={5} style={styles.block}>
            <SectionHead
              title="Row by row"
              kicker={`${rows.length} rows`}
              caption="Higher is better in every row. Sample numbers on both sides."
              palette={palette}
            />
            <Card elevation="sm" padded={false} style={styles.ledger}>
              {rows.map((row, i) => (
                <View key={row.id}>
                  {i > 0 ? <Divider /> : null}
                  <LedgerRow
                    row={row}
                    tierKey={tier.id}
                    tierName={tierName}
                    palette={palette}
                    delay={i * Motion.stagger}
                  />
                </View>
              ))}
            </Card>
          </Reveal>

          {gap ? (
            <Reveal index={6} style={styles.block}>
              <SectionHead title="Where the gap is" kicker="Coaching note" palette={palette} />
              <Card variant="tint" palette={palette} style={styles.gapCard}>
                <Text style={Type.subhead} numberOfLines={2}>
                  {gap.label}
                </Text>
                {/* This card sits far enough below the honesty note to be read on its own. */}
                <View style={styles.gapBadges}>
                  <Badge label={`${Math.round(gap.ratio * 100)}% of ${tierName.toLowerCase()}`} />
                  <Badge label="Sample" />
                </View>
                <Text style={[Type.body, styles.gapCopy]}>{coaching}</Text>
                <Button
                  label="Find a drill for this"
                  palette={palette}
                  trailingIcon="arrowRight"
                  full
                  onPress={() => router.push({ pathname: "/drills", params: { sport: sport.id } })}
                  style={styles.gapButton}
                />
              </Card>
            </Reveal>
          ) : null}
        </>
      )}
    </Page>
  )
}

interface LedgerRowProps {
  row: CompareRow
  /** Changing this remounts the bars, which is what makes them grow in again. */
  tierKey: string
  tierName: string
  palette: SportPalette
  delay: number
}

function LedgerRow({ row, tierKey, tierName, palette, delay }: LedgerRowProps) {
  const pct = Math.round(row.ratio * 100)

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${row.label}. You ${num(row.you)} ${row.unit}. ${tierName} ${num(row.reference)} ${row.unit}. ${pct} percent of the reference.`}
    >
      <View style={styles.rowHead}>
        <Text style={[Type.subhead, styles.rowLabel]} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={[Type.metricSm, { color: palette.deep }]}>{pct}%</Text>
      </View>

      <Track
        key={`${tierKey}-you`}
        name="You"
        value={`${num(row.you)} ${row.unit}`}
        share={row.youShare}
        color={palette.accent}
        delay={delay}
      />
      <Track
        key={`${tierKey}-reference`}
        name={tierName}
        value={`${num(row.reference)} ${row.unit}`}
        share={row.referenceShare}
        color={Paper.ink}
        delay={delay + 80}
      />
    </View>
  )
}

interface TrackProps {
  name: string
  value: string
  share: number
  color: string
  delay: number
}

/** One side of a comparison: who it is, what they do, and the bar for it. */
function Track({ name, value, share, color, delay }: TrackProps) {
  return (
    <View style={styles.track}>
      <View style={styles.trackHead}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={[Type.label, styles.trackName]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[Type.label, styles.trackValue]}>{value}</Text>
      </View>
      <Bar value={share} color={color} height={9} delay={delay} />
    </View>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[Type.small, styles.legendText]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { marginTop: Space.xs },
  headRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: Space.md },
  headText: { flex: 1 },
  deck: { marginTop: Space.sm },
  rail: { marginHorizontal: -Space.gutter, marginTop: Space.lg },
  block: { marginTop: Space.xl },
  caption: { marginTop: Space.sm },
  matchCard: { gap: Space.lg },
  matchTop: { flexDirection: "row", alignItems: "flex-start", gap: Space.md },
  matchStat: { flex: 1 },
  matchCaption: { lineHeight: 19 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: Space.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  legendText: { flexShrink: 1 },
  ledger: { marginTop: Space.lg, paddingVertical: Space.xs },
  row: { paddingHorizontal: Space.lg, paddingVertical: Space.lg, gap: Space.md },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm },
  rowLabel: { flex: 1 },
  swatch: { width: 9, height: 9, borderRadius: 5 },
  track: { gap: 6 },
  trackHead: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  trackName: { flex: 1, color: Paper.muted },
  trackValue: { color: Paper.ink },
  gapCard: { marginTop: Space.lg, gap: Space.md },
  gapBadges: { flexDirection: "row", flexWrap: "wrap", gap: Space.xs },
  gapCopy: { lineHeight: 23 },
  gapButton: { marginTop: Space.xs },
})
