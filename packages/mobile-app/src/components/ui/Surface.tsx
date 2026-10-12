import { type ReactNode, memo } from "react"
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { SportPalette } from "../../sports"
import { Paper, Radius, Shadow, Space } from "../../theme"
import { Mesh } from "./Mesh"

interface ScreenProps {
  children: ReactNode
  palette: SportPalette
  /** Dial the mesh down behind dense content. */
  intensity?: number
  animated?: boolean
  style?: StyleProp<ViewStyle>
}

/** A full-bleed page: the mesh, then your content on top. */
export const Screen = memo(function Screen({
  children,
  palette,
  intensity = 1,
  animated = true,
  style,
}: ScreenProps) {
  return (
    <View style={[styles.screen, style]}>
      <Mesh palette={palette} intensity={intensity} animated={animated} />
      {children}
    </View>
  )
})

interface PageProps extends ScreenProps {
  scroll?: ScrollViewProps
  /** Extra bottom padding, e.g. to clear a tab bar. */
  bottomInset?: number
}

/** The usual page shape: mesh + a safe-area-aware scroll view. */
export const Page = memo(function Page({
  children,
  palette,
  intensity = 1,
  animated = true,
  scroll,
  bottomInset = 0,
  style,
}: PageProps) {
  const insets = useSafeAreaInsets()
  return (
    <Screen palette={palette} intensity={intensity} animated={animated} style={style}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + bottomInset + Space.xxxl },
          scroll?.contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </Screen>
  )
})

interface CardProps {
  children: ReactNode
  /** `plain` white, `glass` translucent over the mesh, `tint` in the sport's soft tone. */
  variant?: "plain" | "glass" | "tint" | "ink"
  palette?: SportPalette
  elevation?: "sm" | "md" | "lg" | "none"
  padded?: boolean
  style?: StyleProp<ViewStyle>
}

/** The floating card. Everything on a page sits in one of these. */
export const Card = memo(function Card({
  children,
  variant = "plain",
  palette,
  elevation = "md",
  padded = true,
  style,
}: CardProps) {
  const background =
    variant === "glass"
      ? Paper.veil
      : variant === "tint"
        ? (palette?.soft ?? Paper.sunken)
        : variant === "ink"
          ? Paper.ink
          : Paper.surface

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: background },
        padded && styles.cardPadded,
        elevation !== "none" && Shadow[elevation],
        style,
      ]}
    >
      {children}
    </View>
  )
})

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Paper.canvas },
  content: { paddingHorizontal: Space.gutter, maxWidth: 560, width: "100%", alignSelf: "center" },
  card: { borderRadius: Radius.xl, overflow: "hidden" },
  cardPadded: { padding: Space.xl },
})
