import React from "react"
import { View, Text, StyleSheet, ViewStyle } from "react-native"
import { StrokeColors } from "../../theme"
import type { StrokeType } from "../../types"

interface BadgeProps {
  label: string
  type?: StrokeType | "default"
  speed?: number
  size?: "sm" | "md"
  style?: ViewStyle
}

export default function Badge({
  label,
  type = "default",
  speed,
  size = "sm",
  style,
}: BadgeProps) {
  const color = StrokeColors[type] || "#8E8EA0"

  return (
    <View style={[styles.chip, { borderColor: color + "40", backgroundColor: color + "10" }, style]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }, size === "md" && styles.labelMd]}>
        {label}
      </Text>
      {speed !== undefined && (
        <Text style={styles.speed}>{speed} km/h</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  labelMd: {
    fontSize: 13,
  },
  speed: {
    fontSize: 10,
    fontWeight: "600",
    color: "#8E8EA0",
  },
})
