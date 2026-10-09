import { memo } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import type { RisoPalette } from "../../sports"
import { Paper, Radius } from "../../theme"

interface ToggleProps {
  value: boolean
  onChange: (value: boolean) => void
  palette: RisoPalette
  label: string
}

/** Print switch: a hairline box with a square knob that inks when on. Same on every platform. */
export const Toggle = memo(function Toggle({ value, onChange, palette, label }: ToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.track, value && { backgroundColor: palette.plate, borderColor: palette.plate }]}
    >
      <View style={[styles.knob, value ? { backgroundColor: palette.onPlate, alignSelf: "flex-end" } : null]} />
    </Pressable>
  )
})

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    padding: 3,
    borderWidth: 1.5,
    borderColor: Paper.ruleStrong,
    borderRadius: Radius.sm,
    justifyContent: "center",
  },
  knob: { width: 19, height: 19, backgroundColor: Paper.muted },
})
