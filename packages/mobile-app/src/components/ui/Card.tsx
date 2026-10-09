import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { Paper, Radius, Space } from "../../theme"

interface CardProps {
  children: ReactNode
  /** Draws a 3dp ink rule along the top edge, like a printed section marker. */
  accent?: string
  style?: StyleProp<ViewStyle>
}

/** Card stock: one step lighter than the page, hairline rule border. */
export default function Card({ children, accent, style }: CardProps) {
  return <View style={[styles.card, accent ? { borderTopColor: accent, borderTopWidth: 3 } : null, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Paper.stock,
    borderWidth: 1,
    borderColor: Paper.rule,
    borderRadius: Radius.sm,
    padding: Space.lg,
  },
})
