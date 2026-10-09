import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { StyleSheet, View } from "react-native"
import { useFonts } from "expo-font"
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold"
import { Fraunces_400Regular_Italic } from "@expo-google-fonts/fraunces/400Regular_Italic"
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium"
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold"
import { Paper } from "../src/theme"

const SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Paper.bg },
  animation: "fade_from_bottom",
} as const

export default function RootLayout() {
  // Four static font files (~390 KB), bundled locally: no network on first launch.
  const [loaded, error] = useFonts({
    Fraunces_700Bold,
    Fraunces_400Regular_Italic,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  })

  // Hold on the paper colour until the type is ready; fall back to system fonts on error.
  if (!loaded && !error) return <View style={styles.root} />

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack screenOptions={SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="record/index" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="record/processing" options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="session/[id]" />
        <Stack.Screen name="sport/[id]" />
        <Stack.Screen name="drills/index" />
      </Stack>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Paper.bg },
})
