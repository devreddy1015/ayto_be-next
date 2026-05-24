import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { StrokeColors } from "../../theme"
import type { StrokeType } from "../../types"

interface StrokeChipProps {
  type: StrokeType | string
  speed?: number
  confidence?: number
  size?: "sm" | "md" | "lg"
}

export default function StrokeChip({
  type,
  speed,
  confidence,
  size = "sm",
}: StrokeChipProps) {
  const color = StrokeColors[type.toLowerCase()] || "#8E8EA0"

  const sizeStyles = {
    sm: { paddingHorizontal: 10, paddingVertical: 4, fontSize: 11 },
    md: { paddingHorizontal: 14, paddingVertical: 6, fontSize: 13 },
    lg: { paddingHorizontal: 18, paddingVertical: 8, fontSize: 15 },
  }

  const s = sizeStyles[size]

  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: color + "40",
          backgroundColor: color + "10",
          paddingHorizontal: s.paddingHorizontal,
          paddingVertical: s.paddingVertical,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color, fontSize: s.fontSize }]}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Text>
      {speed !== undefined && (
        <Text style={styles.speed}>{speed} km/h</Text>
      )}
      {confidence !== undefined && (
        <Text style={styles.confidence}>{Math.round(confidence * 100)}%</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    alignSelf: "flex-start",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  speed: {
    fontSize: 10,
    fontWeight: "600",
    color: "#8E8EA0",
  },
  confidence: {
    fontSize: 10,
    fontWeight: "600",
    color: "#8E8EA0",
    opacity: 0.7,
  },
})
