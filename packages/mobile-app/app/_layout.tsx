import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View } from "react-native"
import { useFonts } from "expo-font"
import { Outfit_500Medium } from "@expo-google-fonts/outfit/500Medium"
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold"
import { Outfit_700Bold } from "@expo-google-fonts/outfit/700Bold"
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular"
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium"
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold"
import { useAuthSync } from "../src/hooks/useAuthSync"
import { Paper } from "../src/theme"

const SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Paper.canvas },
  animation: "fade_from_bottom",
} as const

export default function RootLayout() {
  // Restore the persisted Supabase session into the user store.
  useAuthSync()

  // Six static font files, bundled locally: no network on first launch.
  const [loaded, error] = useFonts({
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  })

  // Hold on the paper colour until the type is ready; fall back to system fonts on error.
  if (!loaded && !error) return <View style={styles.root} />

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Stack screenOptions={SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="record/index" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="record/processing" options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="session/[id]" />
        <Stack.Screen name="sport/[id]" />
        <Stack.Screen name="drills/index" />
        <Stack.Screen name="settings/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="settings/about" options={{ animation: "slide_from_right" }} />
      </Stack>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Paper.canvas },
})
