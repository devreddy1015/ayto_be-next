import { memo, useCallback, useMemo, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { Badge, Chip, Empty, Note } from "../../src/components/ui/Bits"
import { Segmented } from "../../src/components/ui/Form"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, Tappable } from "../../src/components/ui/Press"
import { Stat } from "../../src/components/ui/Stat"
import { Card, Page } from "../../src/components/ui/Surface"
import { ALL_SESSIONS } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { clock, shortDate } from "../../src/lib/format"
import { SPORTS, getSport, type SportId } from "../../src/sports"
import { Radius, Space, Type } from "../../src/theme"
import type { SessionSummary } from "../../src/types"

type Filter = "all" | SportId
type Sort = "recent" | "fastest" | "longest"

const SORTS: readonly { value: Sort; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "fastest", label: "Fastest" },
  { value: "longest", label: "Longest" },
]

const SORTERS: Record<Sort, (a: SessionSummary, b: SessionSummary) => number> = {
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  fastest: (a, b) => b.max_speed_kmh - a.max_speed_kmh,
  longest: (a, b) => b.duration_seconds - a.duration_seconds,
}

/** Only offer a chip for a sport the sample set can actually fill. */
const FILTER_SPORTS = SPORTS.filter((sport) => ALL_SESSIONS.some((session) => session.sport === sport.id))

/** Clears the floating tab bar in (tabs)/_layout.tsx. */
const TAB_CLEARANCE = 96

/** Header blocks come first; rows deal out after them. */
const HEAD_BLOCKS = 4

/** Cap the per-row stagger so the last of forty-odd rows is not still arriving. */
const MAX_STAGGER = 7

interface SessionRowProps {
  session: SessionSummary
  /** Passed down rather than read per row: one store subscription for the list. */
  format: (kmh: number) => number
  unit: string
}

const SessionRow = memo(function SessionRow({ session, format, unit }: SessionRowProps) {
  const sport = getSport(session.sport)
  const date = shortDate(session.created_at)
  const top = format(session.max_speed_kmh)
  const duration = clock(session.duration_seconds)

  const open = useCallback(
    () => router.push({ pathname: "/session/[id]", params: { id: session.id } }),
    [session.id],
  )

  return (
    <Tappable
      onPress={open}
      label={`Sample ${sport.name} session, ${date}. Top ${top} ${unit}, ${session.strokes_count} ${sport.strokeNounPlural}, ${duration} long.`}
    >
      <Card elevation="sm" padded={false} style={styles.row}>
        <View style={styles.rowMain}>
          <View style={styles.rowTop}>
            <Text style={Type.kicker} numberOfLines={1}>
              {date}
            </Text>
            <View style={[styles.code, { backgroundColor: sport.palette.soft }]}>
              <Text style={[Type.kicker, { color: sport.palette.onSoft }]}>{sport.code}</Text>
            </View>
          </View>
          <Text style={Type.subhead} numberOfLines={1}>
            {sport.name}
          </Text>
          <Text style={Type.small} numberOfLines={1}>
            {session.strokes_count} {sport.strokeNounPlural} · {duration}
          </Text>
        </View>
        <View style={styles.rowValue}>
          <Text style={[Type.metric, { color: sport.palette.ink }]}>{top}</Text>
          <Text style={Type.unit}>{unit} top</Text>
        </View>
      </Card>
    </Tappable>
  )
})

/** The log: every sample session, filtered by sport and sorted three ways. */
export default function HistoryScreen() {
  const current = useSport()
  const { format, unit } = useSpeed()
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("recent")

  const sessions = useMemo(
    () => ALL_SESSIONS.filter((s) => filter === "all" || s.sport === filter).sort(SORTERS[sort]),
    [filter, sort],
  )

  const summary = useMemo(() => {
    if (sessions.length === 0) return null
    return {
      count: sessions.length,
      fastest: Math.max(...sessions.map((s) => s.max_speed_kmh)),
      minutes: Math.round(sessions.reduce((total, s) => total + s.duration_seconds, 0) / 60),
    }
  }, [sessions])

  const showAll = useCallback(() => setFilter("all"), [])

  const picked = filter === "all" ? null : getSport(filter)
  // Filtering re-tints the whole page, so the mesh answers the chip you tapped.
  const palette = (picked ?? current).palette

  // Counting the filtered set, not the archive: the number above a list has to
  // describe the list underneath it. Led with "Sample" because this kicker sits
  // above the honesty note, so it has to carry the caveat on its own.
  const countLine = picked
    ? `Sample · ${sessions.length} ${picked.name} ${sessions.length === 1 ? "session" : "sessions"}`
    : `Sample · ${sessions.length} sessions · ${FILTER_SPORTS.length} sports`

  // Remounting on either control re-runs each row's entrance, so a new list
  // deals itself out instead of swapping underneath you.
  const listKey = `${filter}:${sort}`

  return (
    <Page palette={palette} intensity={0.55} animated={false} bottomInset={TAB_CLEARANCE}>
      <Reveal style={styles.head}>
        <Text style={Type.kicker}>{countLine}</Text>
        <Text style={[Type.hero, styles.title]} accessibilityRole="header">
          The archive.
        </Text>
        <Text style={[Type.bodyMuted, styles.deck]}>
          A worked example of the log you will build once sessions are analysed on your phone.
        </Text>
      </Reveal>

      <Reveal index={1} style={styles.block}>
        <Note palette={palette}>
          Every session below is sample data, generated so the app can be explored. None of it came from
          footage, and no numbers here were measured.
        </Note>
      </Reveal>

      <Reveal index={2} style={styles.block}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.rail}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="All"
            palette={palette}
            selected={filter === "all"}
            icon={filter === "all" ? "check" : undefined}
            onPress={showAll}
          />
          {FILTER_SPORTS.map((sport) => {
            const on = filter === sport.id
            return (
              <Chip
                key={sport.id}
                label={sport.name}
                palette={sport.palette}
                selected={on}
                // A tick, not just a fill: selection must survive without colour.
                icon={on ? "check" : undefined}
                onPress={() => setFilter(sport.id)}
              />
            )
          })}
        </ScrollView>

        <Segmented label="Sort" options={SORTS} value={sort} onChange={setSort} palette={palette} style={styles.sort} />
      </Reveal>

      {summary ? (
        <Reveal index={3} style={styles.block}>
          <Card variant="glass" elevation="sm">
            <View style={styles.summaryHead}>
              <Text style={Type.kicker}>At a glance</Text>
              <Badge label="Sample" tone="accent" palette={palette} />
            </View>
            <View style={styles.stats}>
              <Stat label="Sessions" value={summary.count} size="sm" style={styles.stat} />
              <Stat
                label="Fastest"
                value={format(summary.fastest)}
                unit={unit}
                size="sm"
                color={palette.ink}
                delay={90}
                style={styles.stat}
              />
              <Stat label="Logged" value={summary.minutes} unit="min" size="sm" delay={180} style={styles.stat} />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {sessions.map((session, i) => (
        <Reveal
          key={`${listKey}:${session.id}`}
          index={HEAD_BLOCKS + Math.min(i, MAX_STAGGER)}
          style={styles.rowWrap}
        >
          <SessionRow session={session} format={format} unit={unit} />
        </Reveal>
      ))}

      {sessions.length === 0 ? (
        <Reveal index={HEAD_BLOCKS} key={listKey}>
          <Empty
            title="Nothing filed here yet."
            caption={
              picked
                ? `There are no ${picked.name} sessions in the sample set.`
                : "Sessions will appear here once there are some to show."
            }
            icon="clock"
            palette={palette}
            action={
              picked ? (
                <Button label="Show every sport" palette={palette} variant="soft" onPress={showAll} />
              ) : undefined
            }
          />
        </Reveal>
      ) : null}
    </Page>
  )
}

const styles = StyleSheet.create({
  head: { marginTop: Space.sm },
  title: { marginTop: Space.xs },
  deck: { marginTop: Space.sm },
  block: { marginTop: Space.xl },
  // Bleed the rail past the page gutter so chips scroll edge to edge.
  rail: { marginHorizontal: -Space.gutter, flexGrow: 0 },
  chips: { flexDirection: "row", gap: Space.sm, paddingHorizontal: Space.gutter },
  sort: { marginTop: Space.lg },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Space.lg },
  stats: { flexDirection: "row", gap: Space.md },
  stat: { flex: 1 },
  rowWrap: { marginTop: Space.md },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg },
  rowMain: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  code: { paddingHorizontal: Space.sm, paddingVertical: 3, borderRadius: Radius.pill },
  rowValue: { alignItems: "flex-end" },
})
