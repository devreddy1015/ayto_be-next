import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { Offset } from "../../theme"

interface PlateProps {
  children: ReactNode
  /** Face colour. */
  color: string
  /** Offset plate colour (the hard "shadow"). */
  shadow: string
  offset?: number
  /** Pressed plates sit down onto their offset plate. */
  pressed?: boolean
  style?: StyleProp<ViewStyle>
  faceStyle?: StyleProp<ViewStyle>
}

/** A solid face on a hard, misregistered offset plate. No blur, no elevation. */
export function Plate({ children, color, shadow, offset = Offset.md, pressed, style, faceStyle }: PlateProps) {
  return (
    <View style={[{ paddingRight: offset, paddingBottom: offset }, style]}>
      <View style={[styles.shadow, { top: offset, left: offset, backgroundColor: shadow }]} />
      <View
        style={[
          { backgroundColor: color },
          faceStyle,
          pressed && { transform: [{ translateX: offset }, { translateY: offset }] },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadow: { position: "absolute", right: 0, bottom: 0 },
})
