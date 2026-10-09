import { memo, type ReactNode } from "react"
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { Riso } from "../../assets"
import type { RisoPalette } from "../../sports"
import { Paper } from "../../theme"

interface RisoSurfaceProps {
  children?: ReactNode
  /** Tints the lit corner. Omit for an untinted surface. */
  palette?: RisoPalette
  /** Paper colour under the texture. */
  color?: string
  /** Grain + scanline strength, 0 to disable. */
  grain?: number
  /** Lit-corner strength, 0 to disable. */
  glow?: number
  /** Diameter of the lit corner in dp. */
  glowSize?: number
  style?: StyleProp<ViewStyle>
}

/**
 * Print stock: base colour, a radial "lit corner" in the sport's ink (top-left),
 * and a tiled grain/scanline texture. Two static images; nothing animates.
 */
export const RisoSurface = memo(function RisoSurface({
  children,
  palette,
  color = Paper.bg,
  grain = 0.4,
  glow = 0.22,
  glowSize = 520,
  style,
}: RisoSurfaceProps) {
  return (
    <View style={[styles.base, { backgroundColor: color }, style]}>
      {palette && glow > 0 ? (
        <Image
          source={Riso.glow}
          resizeMode="stretch"
          style={[
            styles.glow,
            {
              width: glowSize,
              height: glowSize,
              left: -glowSize * 0.45,
              top: -glowSize * 0.45,
              opacity: glow,
              tintColor: palette.ink,
            },
          ]}
        />
      ) : null}
      {grain > 0 ? <Image source={Riso.grain} resizeMode="repeat" style={[styles.grain, { opacity: grain }]} /> : null}
      {children}
    </View>
  )
})

/** Full-screen print stock. Screens put their scroll view inside. */
export function Screen({ children, palette }: { children: ReactNode; palette?: RisoPalette }) {
  return (
    <RisoSurface palette={palette} style={styles.screen}>
      {children}
    </RisoSurface>
  )
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
  screen: { flex: 1 },
  glow: { position: "absolute" },
  // Explicit size: a required image otherwise defaults to its intrinsic 96x96 and never tiles.
  grain: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
})
