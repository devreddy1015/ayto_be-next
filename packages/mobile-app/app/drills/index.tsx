import { memo, useCallback, useMemo, useState } from "react"
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { BackButton } from "../../src/components/ui/BackButton"
import Button from "../../src/components/ui/Button"
import { Chip } from "../../src/components/ui/Chip"
import { Tag } from "../../src/components/ui/Tag"
import { drillsFor } from "../../src/data/drills"
import { useSport } from "../../src/hooks/useSport"
import { capitalize, pad2 } from "../../src/lib/format"
import { getSport, isSportId, strokeColor, strokeLabel, type Sport } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import type { Drill, DrillLevel } from "../../src/types"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

type LevelFilter = "all" | DrillLevel
const LEVELS: readonly LevelFilter[] = ["all", "beginner", "intermediate", "advanced"]
const keyExtractor = (item: Drill) => item.id

const DrillCard = memo(function DrillCard({
  drill,
  sport,
  expanded,
  onToggle,
}: {
  drill: Drill
  sport: Sport
  expanded: boolean
  onToggle: (id: string) => void
}) {
  const toggle = useCallback(() => onToggle(drill.id), [onToggle, drill.id])
  const { palette } = sport
  return (
    <View style={[styles.card, expanded && { borderColor: palette.plate }]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${drill.title}, ${drill.minutes} minutes, ${drill.level}`}
        style={styles.cardHead}
      >
        <View style={styles.flex}>
          <View style={styles.tags}>
            <Tag label={strokeLabel(sport, drill.stroke)} color={strokeColor(sport, drill.stroke)} />
            <Text style={Type.kicker}>
              {drill.minutes} min · {drill.level}
            </Text>
          </View>
          <Text style={styles.title}>{drill.title}</Text>
        </View>
        <Text style={[styles.toggle, { color: palette.ink }]}>{expanded ? "−" : "+"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text style={Type.body}>{drill.description}</Text>
          <Text style={[Type.kicker, styles.sub]}>Steps</Text>
          {drill.steps.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text style={[styles.stepNo, { color: palette.ink }]}>{pad2(i + 1)}</Text>
              <Text style={[Type.small, styles.flex, styles.stepText]}>{step}</Text>
            </View>
          ))}
          <Text style={[Type.kicker, styles.sub]}>Kit</Text>
          <View style={styles.tags}>
            {drill.equipment.map((item) => (
              <Tag key={item} label={item} color={Paper.muted} variant="outline" />
            ))}
          </View>
          <Text style={[Type.kicker, styles.sub]}>Builds</Text>
          <Text style={Type.small}>{drill.benefits.join(" · ")}</Text>
          {sport.status === "live" ? (
            <Button
              label="Record this drill"
              trailing="●"
              palette={palette}
              full
              onPress={() => {
                useUserStore.getState().setSportPreference(sport.id)
                router.push("/record")
              }}
              style={styles.record}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
})

export default function DrillsScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ sport?: string }>()
  const current = useSport()
  const sport = isSportId(params.sport) ? getSport(params.sport) : current
  const { palette } = sport

  const drills = useMemo(() => drillsFor(sport.id), [sport.id])
  const strokes = useMemo(() => sport.strokes.filter((s) => drills.some((d) => d.stroke === s.id)), [sport, drills])
  const [stroke, setStroke] = useState("all")
  const [level, setLevel] = useState<LevelFilter>("all")
  const [open, setOpen] = useState<string | null>(null)

  const visible = useMemo(
    () => drills.filter((d) => (stroke === "all" || d.stroke === stroke) && (level === "all" || d.level === level)),
    [drills, stroke, level],
  )
  const toggle = useCallback((id: string) => setOpen((o) => (o === id ? null : id)), [])
  const renderItem = useCallback(
    ({ item }: { item: Drill }) => <DrillCard drill={item} sport={sport} expanded={open === item.id} onToggle={toggle} />,
    [sport, open, toggle],
  )

  return (
    <Screen palette={palette}>
      <FlatList
        data={visible}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={open}
        initialNumToRender={6}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.xxxl }]}
        ListHeaderComponent={
          <View>
            <View style={styles.nav}>
              <BackButton />
              <Text style={Type.kicker}>
                Drill book · {sport.name} · {pad2(drills.length)}
              </Text>
            </View>
            <SweepHeading key={sport.id} lines={["Drill", "book."]} palette={palette} size="hero" style={styles.hero} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chips}>
              <Chip value="all" label="All" active={stroke === "all"} palette={palette} onSelect={setStroke} />
              {strokes.map((s) => (
                <Chip key={s.id} value={s.id} label={s.label} active={stroke === s.id} palette={palette} onSelect={setStroke} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroller, styles.levels]} contentContainerStyle={styles.chips}>
              {LEVELS.map((l) => (
                <Chip key={l} value={l} label={l === "all" ? "All levels" : capitalize(l)} active={level === l} palette={palette} onSelect={setLevel} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={<Text style={[Type.small, styles.empty]}>No drills match these filters.</Text>}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Space.gutter, maxWidth: 720, width: "100%", alignSelf: "center" },
  flex: { flex: 1 },
  nav: { flexDirection: "row", alignItems: "center", gap: Space.md },
  hero: { marginTop: Space.xl, marginBottom: Space.xl },
  chipScroller: { marginHorizontal: -Space.gutter, flexGrow: 0 },
  chips: { paddingHorizontal: Space.gutter, gap: Space.sm },
  levels: { marginTop: Space.sm, marginBottom: Space.xl },
  card: { backgroundColor: Paper.stock, borderWidth: 1, borderColor: Paper.rule, borderRadius: Radius.sm, marginBottom: Space.md },
  cardHead: { flexDirection: "row", alignItems: "flex-start", padding: Space.lg, gap: Space.md },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: Space.sm },
  title: { fontFamily: Fonts.display, fontSize: 20, lineHeight: 25, color: Paper.text, marginTop: Space.sm },
  toggle: { fontFamily: Fonts.monoBold, fontSize: 22, width: 24, textAlign: "center" },
  body: { paddingHorizontal: Space.lg, paddingBottom: Space.lg, borderTopWidth: 1, borderTopColor: Paper.rule, paddingTop: Space.lg },
  sub: { marginTop: Space.lg, marginBottom: Space.sm },
  step: { flexDirection: "row", gap: Space.md, marginBottom: Space.sm },
  stepNo: { fontFamily: Fonts.monoBold, fontSize: 12, width: 22 },
  stepText: { color: Paper.text },
  record: { marginTop: Space.xl },
  empty: { paddingVertical: Space.xl },
})
