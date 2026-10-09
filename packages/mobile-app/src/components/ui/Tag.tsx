import { memo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { STATUS_LABEL, type AnalysisStatus, type RisoPalette } from "../../sports"
import { Fonts, Paper, Radius } from "../../theme"

interface TagProps {
  label: string
  color: string
  /** swatch: ink square + label · solid: ink block · outline: ink hairline */
  variant?: "swatch" | "solid" | "outline"
  /** Text colour for solid tags. */
  onColor?: string
  style?: StyleProp<ViewStyle>
}

export const Tag = memo(function Tag({ label, color, variant = "swatch", onColor = Paper.bg, style }: TagProps) {
  return (
    <View
      style={[
        styles.tag,
        variant === "solid" && { backgroundColor: color },
        variant === "outline" && { borderWidth: 1, borderColor: color },
        style,
      ]}
    >
      {variant === "swatch" && <View style={[styles.swatch, { backgroundColor: color }]} />}
      <Text style={[styles.label, { color: variant === "solid" ? onColor : color }]}>{label}</Text>
    </View>
  )
})

/** Honest analysis status: live / in training / coming soon. */
export const StatusTag = memo(function StatusTag({ status, palette }: { status: AnalysisStatus; palette: RisoPalette }) {
  if (status === "live") {
    return <Tag label={`● ${STATUS_LABEL.live}`} color={palette.plate} onColor={palette.onPlate} variant="solid" />
  }
  return <Tag label={STATUS_LABEL[status]} color={status === "beta" ? palette.ink : Paper.muted} variant="outline" />
})

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  swatch: { width: 8, height: 8 },
  label: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" },
})
