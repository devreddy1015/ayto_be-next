import { memo, useCallback } from "react"
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import * as Haptics from "expo-haptics"
import { Plate } from "../riso/Plate"
import type { RisoPalette } from "../../sports"
import { Fonts, Offset, Paper } from "../../theme"

type Variant = "solid" | "outline" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

interface ButtonProps {
  label: string
  onPress: () => void
  palette: RisoPalette
  variant?: Variant
  size?: Size
  disabled?: boolean
  loading?: boolean
  full?: boolean
  /** A trailing glyph such as "→". */
  trailing?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
}

const HEIGHT: Record<Size, number> = { sm: 36, md: 48, lg: 56 }
const FONT: Record<Size, number> = { sm: 11, md: 13, lg: 14 }
const DANGER_SHADOW = "#7A2622"

export function tapHaptic() {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

/** Print button: a solid ink face on a hard offset plate that presses down onto it. */
const Button = memo(function Button({
  label,
  onPress,
  palette,
  variant = "solid",
  size = "md",
  disabled = false,
  loading = false,
  full = false,
  trailing,
  accessibilityHint,
  style,
}: ButtonProps) {
  const inactive = disabled || loading
  const handlePress = useCallback(() => {
    tapHaptic()
    onPress()
  }, [onPress])

  const plated = variant === "solid" || variant === "danger"
  const face = variant === "danger" ? Paper.danger : variant === "solid" ? palette.plate : "transparent"
  const textColor = plated ? palette.onPlate : variant === "outline" ? palette.ink : Paper.text

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={size === "sm" ? 6 : 0}
      style={[full && styles.full, inactive && styles.inactive, style]}
    >
      {({ pressed }) => {
        const content = (
          <View style={[styles.face, { minHeight: HEIGHT[size] }, size === "sm" && styles.faceSm]}>
            {loading ? (
              <ActivityIndicator color={textColor} size="small" />
            ) : (
              <Text style={[styles.label, { color: textColor, fontSize: FONT[size] }, variant === "ghost" && styles.ghost]}>
                {label}
                {trailing ? `  ${trailing}` : ""}
              </Text>
            )}
          </View>
        )
        if (plated) {
          return (
            <Plate
              color={face}
              shadow={variant === "danger" ? DANGER_SHADOW : palette.shadow}
              offset={size === "sm" ? Offset.sm : Offset.md}
              pressed={pressed}
            >
              {content}
            </Plate>
          )
        }
        return (
          <View
            style={[
              variant === "outline" && { borderWidth: 1.5, borderColor: palette.ink },
              pressed && styles.pressedFlat,
            ]}
          >
            {content}
          </View>
        )
      }}
    </Pressable>
  )
})

export default Button

const styles = StyleSheet.create({
  full: { alignSelf: "stretch" },
  inactive: { opacity: 0.45 },
  face: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  faceSm: { paddingHorizontal: 12 },
  label: { fontFamily: Fonts.monoBold, letterSpacing: 1.2, textTransform: "uppercase" },
  ghost: { textDecorationLine: "underline" },
  pressedFlat: { backgroundColor: "rgba(244,236,224,0.08)" },
})
