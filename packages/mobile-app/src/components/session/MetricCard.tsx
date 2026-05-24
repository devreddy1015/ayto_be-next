import React from "react"
import { View, Text, StyleSheet } from "react-native"
import Card from "../ui/Card"
import { Colors } from "../../theme"

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  comparison?: {
    text: string
    positive: boolean
  }
  variant?: "neutral" | "green" | "amber" | "coral"
}

export default function MetricCard({
  label,
  value,
  unit,
  comparison,
  variant = "neutral",
}: MetricCardProps) {
  const colorMap = {
    neutral: Colors.text_primary,
    green: Colors.accent_green,
    amber: Colors.accent_amber,
    coral: Colors.accent_coral,
  }

  const valueColor = colorMap[variant]

  return (
    <Card variant="surface" style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
      {comparison && (
        <View style={styles.comparison}>
          <Text style={[styles.arrow, comparison.positive ? styles.arrowUp : styles.arrowDown]}>
            {comparison.positive ? "▲" : "▼"}
          </Text>
          <Text style={styles.comparisonText}>{comparison.text}</Text>
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    flex: 1,
    minHeight: 90,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  value: {
    fontSize: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  comparison: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  arrow: {
    fontSize: 10,
  },
  arrowUp: {
    color: Colors.accent_green,
  },
  arrowDown: {
    color: Colors.accent_coral,
  },
  comparisonText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
})
