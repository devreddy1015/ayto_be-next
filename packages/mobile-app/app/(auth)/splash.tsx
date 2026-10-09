import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useReducedMotion } from "react-native-reanimated"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { useMLModels } from "../../src/hooks/useMLModels"
import { useSport } from "../../src/hooks/useSport"
import { useUserStore } from "../../src/store/userStore"
import { Paper, Space, Type } from "../../src/theme"

/** First-launch title card: the brand line printed with the Riso Sweep. */
export default function SplashScreen() {
  const { loadTimeMs } = useMLModels()
  const { palette } = useSport()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const timer = setTimeout(
      () => router.replace(useUserStore.getState().isOnboardingDone ? "/(tabs)" : "/onboarding"),
      reduceMotion ? 900 : 2400,
    )
    return () => clearTimeout(timer)
  }, [reduceMotion])

  return (
    <Screen palette={palette}>
      <View style={styles.center}>
        <Text style={[Type.kicker, styles.kicker]}>Ayto · SportIQ</Text>
        <SweepHeading lines={["Hawk-Eye.", "For everyone."]} palette={palette} size="hero" align="center" delay={150} />
      </View>
      <Text style={[Type.kicker, styles.footer]}>One phone · every sport · made in India</Text>
      {__DEV__ ? <Text style={styles.dev}>ML load {loadTimeMs} ms</Text> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Space.gutter },
  kicker: { marginBottom: Space.lg },
  footer: { textAlign: "center", marginBottom: Space.xxxl, color: Paper.faint },
  dev: { position: "absolute", bottom: Space.xl, alignSelf: "center", fontSize: 10, color: Paper.faint },
})
