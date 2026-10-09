import { memo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { Paper, Type } from "../../theme"

interface StatProps {
  label: string
  value: string | number
  unit?: string
  size?: "xl" | "md" | "sm"
  color?: string
  /** e.g. { text: "+8.7% vs prev", up: true } */
  delta?: { text: string; up: boolean; color?: string }
  style?: StyleProp<ViewStyle>
}

const VALUE = { xl: Type.metricXL, md: Type.metric, sm: Type.metricSm }

/** A metric set in mono numerals under a mono kicker. */
export const Stat = memo(function Stat({ label, value, unit, size = "md", color = Paper.text, delta, style }: StatProps) {
  return (
    <View style={style} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}`}>
      <Text style={[Type.kicker, styles.label]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.row}>
        <Text style={[VALUE[size], { color }]} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={[Type.unit, styles.unit]}>{unit}</Text> : null}
      </View>
      {delta ? (
        <Text style={[Type.unit, styles.delta, { color: delta.color ?? Paper.muted }]}>
          {delta.up ? "▲" : "▼"} {delta.text}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  label: { marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  unit: { marginLeft: 2 },
  delta: { marginTop: 4, textTransform: "none" },
})
