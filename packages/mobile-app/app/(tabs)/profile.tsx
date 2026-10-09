import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import Button from "../../src/components/ui/Button"
import { Chip } from "../../src/components/ui/Chip"
import { SectionHead } from "../../src/components/ui/SectionHead"
import { Stat } from "../../src/components/ui/Stat"
import { Toggle } from "../../src/components/ui/Toggle"
import { ALL_SESSIONS } from "../../src/data/demo"
import { useSport } from "../../src/hooks/useSport"
import { capitalize } from "../../src/lib/format"
import { signOut } from "../../src/lib/supabase"
import { SPORTS } from "../../src/sports"
import { useUserStore, type OverlaySettings } from "../../src/store/userStore"
import type { SpeedUnit } from "../../src/types"
import { Fonts, Paper, Space, Type } from "../../src/theme"

const UNITS: readonly { id: SpeedUnit; label: string }[] = [
  { id: "kmh", label: "km/h" },
  { id: "mph", label: "mph" },
]

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const { palette } = sport
  const profile = useUserStore((s) => s.profile)
  const isAuthenticated = useUserStore((s) => s.isAuthenticated)
  const unitPreference = useUserStore((s) => s.unitPreference)
  const setUnitPreference = useUserStore((s) => s.setUnitPreference)
  const setSportPreference = useUserStore((s) => s.setSportPreference)
  const overlay = useUserStore((s) => s.overlaySettings)
  const setOverlay = useUserStore((s) => s.setOverlaySettings)
  const storeSignOut = useUserStore((s) => s.signOut)
  const [confirming, setConfirming] = useState(false)

  const name = profile?.name ?? "Athlete"
  const hours = ALL_SESSIONS.reduce((sum, s) => sum + s.duration_seconds, 0) / 3600
  const sportsPlayed = new Set(ALL_SESSIONS.map((s) => s.sport)).size

  const overlayRows: readonly { key: keyof OverlaySettings; label: string; hint: string }[] = [
    { key: "showSpeedBadge", label: "Speed badge", hint: `Live ${sport.tracked} speed while recording` },
    { key: "showStrokeLabel", label: `${capitalize(sport.strokeNoun)} label`, hint: "The class the model just read" },
    { key: "showFramingGuide", label: `${sport.playArea.label} guide`, hint: `Frame the whole ${sport.playArea.label.toLowerCase()}` },
  ]

  const handleSignOut = async () => {
    await signOut()
    storeSignOut()
    setConfirming(false)
  }

  return (
    <Screen palette={palette}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={Type.kicker}>
          Profile · {isAuthenticated ? "Signed in" : "Guest"} · {sport.name}
        </Text>
        <SweepHeading lines={name} palette={palette} size="hero" style={styles.hero} />

        <View style={styles.stats}>
          <Stat label="Sessions" value={ALL_SESSIONS.length} size="md" style={styles.flex} />
          <Stat label="Hours" value={hours.toFixed(1)} size="md" style={styles.flex} />
          <Stat label="Sports" value={sportsPlayed} size="md" style={styles.flex} />
        </View>

        <SectionHead
          kicker="01 / Primary"
          title="Your sport"
          palette={palette}
          right={
            <Pressable onPress={() => router.push("/sports")} accessibilityRole="link" hitSlop={10}>
              <Text style={[Type.kicker, { color: palette.ink }]}>Gallery →</Text>
            </Pressable>
          }
        />
        <View style={styles.wrap}>
          {SPORTS.map((s) => (
            <Chip key={s.id} value={s.id} label={s.name} active={s.id === sport.id} palette={palette} onSelect={setSportPreference} />
          ))}
        </View>

        <SectionHead kicker="02 / Units" title="Speed" palette={palette} />
        <View style={styles.row}>
          {UNITS.map((u) => (
            <Chip key={u.id} value={u.id} label={u.label} active={unitPreference === u.id} palette={palette} onSelect={setUnitPreference} />
          ))}
        </View>

        <SectionHead kicker="03 / Camera" title="Recording overlay" palette={palette} />
        {overlayRows.map(({ key, label, hint }, i) => (
          <View key={key} style={[styles.toggle, i > 0 && styles.rule]}>
            <View style={styles.flex}>
              <Text style={Type.body}>{label}</Text>
              <Text style={Type.small}>{hint}</Text>
            </View>
            <Toggle value={overlay[key]} onChange={(v) => setOverlay({ [key]: v })} palette={palette} label={label} />
          </View>
        ))}

        <View style={styles.account}>
          {!isAuthenticated ? (
            <Button label="Sign in" palette={palette} full onPress={() => router.push("/login")} />
          ) : confirming ? (
            <View style={styles.confirm}>
              <Text style={[Type.small, styles.confirmText]}>Sign out of Ayto on this phone?</Text>
              <View style={styles.row}>
                <Button label="Cancel" palette={palette} variant="ghost" size="sm" onPress={() => setConfirming(false)} />
                <Button label="Sign out" palette={palette} variant="danger" size="sm" onPress={handleSignOut} />
              </View>
            </View>
          ) : (
            <Button label="Sign out" palette={palette} variant="outline" full onPress={() => setConfirming(true)} />
          )}
        </View>

        <Text style={styles.colophon}>
          Ayto SportIQ v1.0.0{"\n"}Set in Fraunces and JetBrains Mono. This edition printed in {palette.names.join(", ")}.
        </Text>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.gutter, paddingBottom: Space.xxxl, maxWidth: 720, width: "100%", alignSelf: "center" },
  flex: { flex: 1 },
  hero: { marginTop: Space.lg, marginBottom: Space.xl },
  stats: { flexDirection: "row", gap: Space.md, paddingVertical: Space.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Paper.rule },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  row: { flexDirection: "row", gap: Space.sm },
  toggle: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingVertical: Space.md },
  rule: { borderTopWidth: 1, borderTopColor: Paper.rule },
  account: { marginTop: Space.xxl },
  confirm: { padding: Space.lg, borderWidth: 1, borderColor: Paper.danger, gap: Space.md, alignItems: "center" },
  confirmText: { color: Paper.text },
  colophon: { fontFamily: Fonts.italic, fontSize: 13, lineHeight: 19, color: Paper.faint, textAlign: "center", marginTop: Space.xxl },
})
