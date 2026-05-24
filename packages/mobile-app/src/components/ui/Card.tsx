import React from "react"
import { View, StyleSheet, ViewStyle } from "react-native"
import { Colors, Radius } from "../../theme"

interface CardProps {
  children: React.ReactNode
  variant?: "surface" | "elevated" | "glass"
  style?: ViewStyle
  padding?: number
  borderColor?: string
  glow?: boolean
}

export default function Card({
  children,
  variant = "surface",
  style,
  padding,
  borderColor,
  glow,
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        styles[variant],
        padding !== undefined ? { padding } : null,
        borderColor ? { borderColor } : null,
        glow && styles.glow,
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  surface: {
    backgroundColor: Colors.bg_surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevated: {
    backgroundColor: Colors.bg_elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.accent_green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 6,
  },
  glass: {
    backgroundColor: "rgba(28,28,39,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  glow: {
    borderColor: "rgba(0,255,135,0.15)",
    shadowColor: Colors.accent_green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
})
