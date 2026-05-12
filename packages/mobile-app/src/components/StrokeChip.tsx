import React from "react"
import { View, Text, StyleSheet } from "react-native"

const STROKE_COLORS: Record<string, string> = {
  smash: "#FF3D5A",
  drop: "#4A9DFF",
  clear: "#00F5A0",
  net: "#FFB800",
  serve: "#B45AFF",
  defensive: "#FF8C42",
}

interface StrokeChipProps {
  type: string
  speed?: number
}

export default function StrokeChip({ type, speed }: StrokeChipProps) {
  const color = STROKE_COLORS[type.toLowerCase()] || "#888"

  return (
    <View style={[styles.chip, { borderColor: color + "40" }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginRight: 8,
    marginBottom: 8,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  speed: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
  },
})
