import React from "react"
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native"
import * as Haptics from "expo-haptics"
import { Colors, Spacing, Radius } from "../../theme"
import type { ImpactFeedbackStyle } from "expo-haptics"

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
  size?: "sm" | "md" | "lg"
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
  textStyle?: TextStyle
  fullWidth?: boolean
  icon?: string
}

export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const handlePress = () => {
    if (!disabled && !loading) {
      Haptics.impactAsync("light" as ImpactFeedbackStyle)
      onPress()
    }
  }

  const buttonStyles = [
    styles.base,
    styles[variant],
    styles[`size_${size}`],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ]

  const labelStyles = [
    styles.label,
    styles[`label_${variant}`],
    styles[`label_${size}`],
    disabled && styles.labelDisabled,
    textStyle,
  ]

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={handlePress}
      activeOpacity={0.8}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? Colors.bg_primary : Colors.accent_green}
          size="small"
        />
      ) : (
        <>
          {icon && <Text style={styles.icon}>{icon}</Text>}
          <Text style={labelStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.lg,
    gap: 8,
  },
  primary: {
    backgroundColor: Colors.accent_green,
  },
  secondary: {
    backgroundColor: Colors.bg_elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.accent_green,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: "rgba(255,107,107,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.3)",
  },
  size_sm: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 36,
  },
  size_md: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  size_lg: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    minHeight: 56,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontWeight: "700",
    letterSpacing: 1,
  },
  label_primary: {
    color: Colors.bg_primary,
    fontSize: 15,
  },
  label_secondary: {
    color: Colors.text_primary,
    fontSize: 15,
  },
  label_outline: {
    color: Colors.accent_green,
    fontSize: 15,
  },
  label_ghost: {
    color: Colors.text_secondary,
    fontSize: 14,
  },
  label_danger: {
    color: Colors.accent_coral,
    fontSize: 15,
  },
  label_sm: {
    fontSize: 12,
  },
  label_md: {
    fontSize: 14,
  },
  label_lg: {
    fontSize: 16,
  },
  labelDisabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 18,
  },
})
