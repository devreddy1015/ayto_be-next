import { useCallback, useMemo, useState } from "react"
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { SessionCard } from "../../src/components/session/SessionCard"
import { Chip } from "../../src/components/ui/Chip"
import { Stat } from "../../src/components/ui/Stat"
import { ALL_SESSIONS } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { getSport, SPORTS, STATUS_LABEL, type SportId } from "../../src/sports"
import type { SessionSummary } from "../../src/types"
import { Paper, Space, Type } from "../../src/theme"

type SportFilter = "all" | SportId
type Sort = "recent" | "fastest" | "longest"

const SORTS: readonly { id: Sort; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "fastest", label: "Fastest" },
  { id: "longest", label: "Longest" },
]

const SORTERS: Record<Sort, (a: SessionSummary, b: SessionSummary) => number> = {
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  fastest: (a, b) => b.max_speed_kmh - a.max_speed_kmh,
  longest: (a, b) => b.duration_seconds - a.duration_seconds,
}

const openSession = (id: string) => router.push({ pathname: "/session/[id]", params: { id } })
const keyExtractor = (item: SessionSummary) => item.id

export default function HistoryScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const { format, unit } = useSpeed()
  const [filter, setFilter] = useState<SportFilter>("all")
  const [sort, setSort] = useState<Sort>("recent")

  const sessions = useMemo(
    () => ALL_SESSIONS.filter((s) => filter === "all" || s.sport === filter).sort(SORTERS[sort]),
    [filter, sort],
  )

  const totals = useMemo(() => {
    if (sessions.length === 0) return null
    return {
      count: sessions.length,
      avg: Math.round(sessions.reduce((sum, s) => sum + s.avg_speed_kmh, 0) / sessions.length),
      best: Math.max(...sessions.map((s) => s.max_speed_kmh)),
      strokes: sessions.reduce((sum, s) => sum + s.strokes_count, 0),
    }
  }, [sessions])

  const renderItem = useCallback(
    ({ item }: { item: SessionSummary }) => <SessionCard session={item} onPress={openSession} showSport={filter === "all"} />,
    [filter],
  )

  const filtered = filter === "all" ? null : getSport(filter)
  const palette = (filtered ?? sport).palette

  const header = (
    <View>
      <Text style={Type.kicker}>Archive · {ALL_SESSIONS.length} sessions on file</Text>
      <SweepHeading lines={["The", "archive."]} palette={palette} size="hero" style={styles.hero} />

      {totals ? (
        <View style={styles.stats}>
          <Stat label="Sessions" value={totals.count} size="sm" style={styles.stat} />
          <Stat label={`Avg ${unit}`} value={format(totals.avg)} size="sm" style={styles.stat} />
          <Stat label="Best" value={format(totals.best)} size="sm" color={palette.ink} style={styles.stat} />
          <Stat label="Strokes" value={totals.strokes} size="sm" style={styles.stat} />
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chips}>
        <Chip value="all" label="All" active={filter === "all"} palette={palette} onSelect={setFilter} />
        {SPORTS.map((s) => (
          <Chip key={s.id} value={s.id} label={s.name} active={filter === s.id} palette={palette} onSelect={setFilter} />
        ))}
      </ScrollView>
      <View style={styles.sorts}>
        <Text style={[Type.kicker, styles.sortLabel]}>Sort</Text>
        {SORTS.map((s) => (
          <Chip key={s.id} value={s.id} label={s.label} active={sort === s.id} palette={palette} onSelect={setSort} />
        ))}
      </View>
    </View>
  )

  return (
    <Screen palette={palette}>
      <FlatList
        data={sessions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          filtered ? (
            <View style={styles.empty}>
              <Text style={Type.heading}>No {filtered.name.toLowerCase()} sessions yet.</Text>
              <Text style={[Type.small, styles.emptyNote]}>
                {filtered.status === "live"
                  ? "Record one from Home and it will be filed here."
                  : `${filtered.name} analysis: ${STATUS_LABEL[filtered.status].toLowerCase()}. ${filtered.statusNote}`}
              </Text>
            </View>
          ) : null
        }
        initialNumToRender={8}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.lg }]}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Space.gutter, paddingBottom: Space.xxxl, maxWidth: 720, width: "100%", alignSelf: "center" },
  hero: { marginTop: Space.lg, marginBottom: Space.xl },
  stats: {
    flexDirection: "row",
    gap: Space.sm,
    paddingVertical: Space.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Paper.rule,
    marginBottom: Space.lg,
  },
  stat: { flex: 1 },
  chipScroller: { marginHorizontal: -Space.gutter, flexGrow: 0 },
  chips: { paddingHorizontal: Space.gutter, gap: Space.sm },
  sorts: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginTop: Space.md, marginBottom: Space.xl },
  sortLabel: { marginRight: Space.xs },
  empty: { paddingVertical: Space.xxl, gap: Space.sm },
  emptyNote: { maxWidth: 420 },
})
