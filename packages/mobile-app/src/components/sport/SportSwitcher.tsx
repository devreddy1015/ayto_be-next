import { memo, useCallback } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { tapHaptic } from "../ui/Button"
import { SPORTS, type Sport, type SportId } from "../../sports"
import { Fonts, Paper, Radius, Space } from "../../theme"

interface SportChipProps {
  sport: Sport
  active: boolean
  onSelect: (id: SportId) => void
}

const SportChip = memo(function SportChip({ sport, active, onSelect }: SportChipProps) {
  const press = useCallback(() => {
    tapHaptic()
    onSelect(sport.id)
  }, [onSelect, sport.id])
  const { palette } = sport
  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${sport.name}${sport.status === "live" ? ", live analysis" : ""}`}
      style={[styles.chip, active && { borderColor: palette.plate, backgroundColor: Paper.stock }]}
    >
      <View style={[styles.code, { backgroundColor: palette.plate }]}>
        <Text style={[styles.codeText, { color: palette.onPlate }]}>{sport.code}</Text>
      </View>
      <Text style={[styles.name, { color: active ? Paper.text : Paper.muted }]}>{sport.name}</Text>
      {sport.status === "live" ? <View style={[styles.live, { backgroundColor: palette.ink }]} /> : null}
    </Pressable>
  )
})

/** Horizontal sport picker, bleeding to the screen edges. */
export const SportSwitcher = memo(function SportSwitcher({
  activeId,
  onSelect,
}: {
  activeId: SportId
  onSelect: (id: SportId) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
      {SPORTS.map((sport) => (
        <SportChip key={sport.id} sport={sport} active={sport.id === activeId} onSelect={onSelect} />
      ))}
    </ScrollView>
  )
})

const styles = StyleSheet.create({
  scroller: { marginHorizontal: -Space.gutter, flexGrow: 0 },
  row: { paddingHorizontal: Space.gutter, gap: Space.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingLeft: 5,
    paddingRight: Space.md,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Paper.rule,
    borderRadius: Radius.sm,
  },
  code: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  codeText: { fontFamily: Fonts.monoBold, fontSize: 12 },
  name: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 0.4 },
  live: { width: 6, height: 6, borderRadius: 3 },
})
