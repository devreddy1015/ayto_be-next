import { useMemo, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Meter } from "../../src/components/data/Bars"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import Button from "../../src/components/ui/Button"
import Card from "../../src/components/ui/Card"
import { Chip } from "../../src/components/ui/Chip"
import { SectionHead } from "../../src/components/ui/SectionHead"
import { Stat } from "../../src/components/ui/Stat"
import { StatusTag } from "../../src/components/ui/Tag"
import { getDemo } from "../../src/data/demo"
import { useSport } from "../../src/hooks/useSport"
import { LIVE_SPORT } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import type { LedgerRow } from "../../src/types"
import { Fonts, Paper, Space, Type } from "../../src/theme"

export default function CompareScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const setSport = useUserStore((s) => s.setSportPreference)
  const demo = sport.status === "live" ? getDemo(sport.id) : null
  const pros = demo?.pros ?? []
  const [proId, setProId] = useState<string | null>(null)
  const pro = pros.find((p) => p.id === proId) ?? pros[0]
  const { palette } = sport

  // Everything below is derived from the data: match %, rows and the coaching line all follow the pro you pick.
  const ledger = useMemo<LedgerRow[]>(
    () => (demo && pro ? demo.ledger.map((row) => ({ ...row, pro: pro.values[row.id] ?? row.you })) : []),
    [demo, pro],
  )
  const ratios = ledger.map((row) => Math.min(row.you / row.pro, 1))
  const match = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : 0
  const gap = ledger.length ? ledger[ratios.indexOf(Math.min(...ratios))] : null

  return (
    <Screen palette={palette}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={Type.kicker}>Vs pro · {sport.name}</Text>
        <SweepHeading key={sport.id} lines={["Side by", "side."]} palette={palette} size="hero" style={styles.hero} />

        {!demo || !pro ? (
          <Card accent={palette.plate} style={styles.empty}>
            <StatusTag status={sport.status} palette={palette} />
            <Text style={Type.heading}>Pro benchmarks for {sport.name.toLowerCase()} arrive with live analysis.</Text>
            <Text style={Type.small}>{sport.statusNote}</Text>
            <Button
              label={`Compare in ${LIVE_SPORT.name}`}
              trailing="→"
              palette={palette}
              full
              onPress={() => setSport(LIVE_SPORT.id)}
              style={styles.emptyButton}
            />
          </Card>
        ) : (
          <>
            <Text style={[Type.deck, styles.deck]}>
              Your latest session, measured against the benchmarks of a professional.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chips}>
              {pros.map((p) => (
                <Chip key={p.id} value={p.id} label={`${p.name} · ${p.country}`} active={p.id === pro.id} palette={palette} onSelect={setProId} />
              ))}
            </ScrollView>

            <View style={styles.matchRow}>
              <Stat label={`Match with ${pro.name.split(" ").pop()}`} value={match} unit="%" size="xl" color={palette.ink} />
              <View style={styles.legend}>
                <Legend color={palette.plate} label="You" />
                <Legend color={palette.ink3} label={pro.name} />
              </View>
            </View>

            <SectionHead kicker={`01 / ${ledger.length} measures`} title="The ledger" palette={palette} />
            {ledger.map((row) => (
              <Meter
                key={row.id}
                label={row.label}
                you={row.you}
                pro={row.pro}
                unit={row.unit}
                youColor={palette.plate}
                proColor={palette.ink3}
                proName={pro.name}
              />
            ))}

            {gap ? (
              <>
                <SectionHead kicker="02 / Coach's note" title="Close the gap" palette={palette} />
                <Card accent={palette.ink3}>
                  <Text style={Type.kicker}>
                    Biggest gap · {gap.label} · {Math.round((gap.you / gap.pro) * 100)}% of {pro.name}
                  </Text>
                  <Text style={[Type.deck, styles.note]}>{demo.coaching[gap.id]}</Text>
                </Card>
                <Button
                  label="Train the gap"
                  trailing="→"
                  palette={palette}
                  full
                  onPress={() => router.push("/drills")}
                  style={styles.train}
                />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.gutter, paddingBottom: Space.xxxl, maxWidth: 720, width: "100%", alignSelf: "center" },
  hero: { marginTop: Space.lg, marginBottom: Space.lg },
  deck: { marginBottom: Space.lg },
  empty: { gap: Space.md },
  emptyButton: { marginTop: Space.sm },
  chipScroller: { marginHorizontal: -Space.gutter, flexGrow: 0 },
  chips: { paddingHorizontal: Space.gutter, gap: Space.sm },
  matchRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: Space.xl, gap: Space.md },
  legend: { gap: Space.sm, paddingBottom: Space.sm, flexShrink: 1 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  legendSwatch: { width: 10, height: 10 },
  legendText: { fontFamily: Fonts.mono, fontSize: 11, color: Paper.muted },
  note: { color: Paper.text, marginTop: Space.sm },
  train: { marginTop: Space.xl },
})
