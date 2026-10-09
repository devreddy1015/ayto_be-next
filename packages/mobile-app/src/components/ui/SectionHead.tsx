import { memo, type ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import { SweepHeading } from "../riso/SweepHeading"
import type { RisoPalette } from "../../sports"
import { Paper, Space, Type } from "../../theme"

interface SectionHeadProps {
  title: string
  palette: RisoPalette
  /** Mono catalogue line above the title, e.g. "02 / This week". */
  kicker?: string
  right?: ReactNode
  delay?: number
}

/** Section opener: hairline rule, mono kicker, ink-variant sweep heading. */
export const SectionHead = memo(function SectionHead({ title, palette, kicker, right, delay = 200 }: SectionHeadProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.rule} />
      <View style={styles.row}>
        <View style={styles.titles}>
          {kicker ? <Text style={[Type.kicker, styles.kicker]}>{kicker}</Text> : null}
          <SweepHeading lines={title} palette={palette} variant="ink" size="section" delay={delay} />
        </View>
        {right}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { marginTop: Space.xxl, marginBottom: Space.lg },
  rule: { height: 1, backgroundColor: Paper.rule, marginBottom: Space.md },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: Space.md },
  titles: { flexShrink: 1 },
  kicker: { marginBottom: Space.xs },
})
