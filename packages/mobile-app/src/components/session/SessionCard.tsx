import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import Card from "../ui/Card"
import Badge from "../ui/Badge"
import { Colors, Spacing } from "../../theme"
import type { StrokeType } from "../../types"

interface SessionCardProps {
  id: string
  date: string
  duration: string
  strokes: number
  maxSpeed: number
  sport: string
  dominantStroke?: StrokeType | null
  onPress: () => void
}

export default function SessionCard({
  date,
  duration,
  strokes,
  maxSpeed,
  sport,
  dominantStroke,
  onPress,
}: SessionCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card variant="surface" style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.sportIcon}>
              {sport === "badminton" ? "🏸" : sport === "tennis" ? "🎾" : "🏓"}
            </Text>
            <View>
              <Text style={styles.date}>{date}</Text>
              <Text style={styles.meta}>
                {duration} · {strokes} strokes
              </Text>
            </View>
          </View>
          <View style={styles.speedBox}>
            <Text style={styles.speedValue}>{maxSpeed}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
        </View>

        {dominantStroke && (
          <View style={styles.footer}>
            <Badge
              label={dominantStroke.charAt(0).toUpperCase() + dominantStroke.slice(1)}
              type={dominantStroke}
              size="sm"
            />
          </View>
        )}
      </Card>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sportIcon: {
    fontSize: 22,
  },
  date: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text_primary,
  },
  meta: {
    fontSize: 11,
    color: Colors.text_secondary,
    marginTop: 2,
  },
  speedBox: {
    alignItems: "flex-end",
  },
  speedValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.accent_green,
    fontVariant: ["tabular-nums"],
  },
  speedUnit: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.text_secondary,
    letterSpacing: 1,
  },
  footer: {
    flexDirection: "row",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
})
