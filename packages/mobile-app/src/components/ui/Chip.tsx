import { memo, useCallback } from "react"
import { Pressable, StyleSheet, Text } from "react-native"
import type { RisoPalette } from "../../sports"
import { Fonts, Paper, Radius } from "../../theme"

interface ChipProps<T extends string> {
  value: T
  label: string
  active: boolean
  palette: RisoPalette
  onSelect: (value: T) => void
}

/** Filter chip. Active chips are printed solid in the sport's plate ink. */
function ChipImpl<T extends string>({ value, label, active, palette, onSelect }: ChipProps<T>) {
  const onPress = useCallback(() => onSelect(value), [onSelect, value])
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? { backgroundColor: palette.plate, borderColor: palette.plate } : null]}
    >
      <Text style={[styles.label, { color: active ? palette.onPlate : Paper.muted }]}>{label}</Text>
    </Pressable>
  )
}

export const Chip = memo(ChipImpl) as typeof ChipImpl

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Paper.rule,
    borderRadius: Radius.sm,
  },
  label: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
})
