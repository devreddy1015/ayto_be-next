import { Stack } from "expo-router"
import { Paper } from "../../src/theme"

const SCREEN_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: Paper.canvas },
  animation: "fade",
} as const

export default function AuthLayout() {
  return (
    <Stack screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
    </Stack>
  )
}
