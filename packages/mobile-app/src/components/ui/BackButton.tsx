import { memo, useCallback } from "react"
import { Pressable, StyleSheet, Text } from "react-native"
import { router } from "expo-router"
import { Fonts, Paper, Radius } from "../../theme"

/** Square hairline back button. Falls back to Home when there is no history (web deep links). */
export const BackButton = memo(function BackButton({ glyph = "←", label = "Go back" }: { glyph?: string; label?: string }) {
  const onPress = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace("/(tabs)")
  }, [])
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.button}>
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Paper.ruleStrong,
    borderRadius: Radius.sm,
    backgroundColor: Paper.bg,
  },
  glyph: { fontFamily: Fonts.mono, fontSize: 18, color: Paper.text },
})
