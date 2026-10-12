import { useState } from "react"
import { Alert, Platform, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { Badge, Divider, Note, SectionHead } from "../../src/components/ui/Bits"
import { Group, Row, Segmented, SwitchRow } from "../../src/components/ui/Form"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, IconButton } from "../../src/components/ui/Press"
import { Card, Page } from "../../src/components/ui/Surface"
import { useSport } from "../../src/hooks/useSport"
import { signOut as supabaseSignOut } from "../../src/lib/supabase"
import { SPORTS } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

const APP_VERSION = "0.2.0"

export default function SettingsScreen() {
  const sport = useSport()
  const { palette } = sport
  const store = useUserStore()
  const [busy, setBusy] = useState(false)

  const confirm = (title: string, message: string, onConfirm: () => void, destructive = false) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm()
      return
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: destructive ? "destructive" : "default", onPress: onConfirm },
    ])
  }

  const doSignOut = async () => {
    setBusy(true)
    try {
      await supabaseSignOut()
    } catch {
      // The local session is cleared either way.
    }
    store.signOut()
    setBusy(false)
  }

  return (
    <Page palette={palette} intensity={0.5} animated={false}>
      <Reveal style={styles.nav}>
        <IconButton name="arrowLeft" label="Go back" palette={palette} onPress={() => router.back()} />
        <Text style={Type.heading}>Settings</Text>
        <View style={styles.navSpacer} />
      </Reveal>

      <Reveal index={1} style={styles.block}>
        <Card variant="glass" elevation="sm">
          <View style={styles.account}>
            <View style={[styles.avatar, { backgroundColor: palette.accent }]}>
              <Text style={styles.avatarText}>
                {(store.profile?.name ?? "G").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.accountText}>
              <Text style={Type.subhead} numberOfLines={1}>
                {store.profile?.name ?? "Guest"}
              </Text>
              <Text style={Type.small} numberOfLines={1}>
                {store.isAuthenticated ? "Signed in" : "Not signed in — sessions stay on this phone"}
              </Text>
            </View>
            <Button
              label={store.isAuthenticated ? "Sign out" : "Sign in"}
              palette={palette}
              variant={store.isAuthenticated ? "outline" : "primary"}
              size="sm"
              loading={busy}
              onPress={() =>
                store.isAuthenticated
                  ? confirm("Sign out?", "Your sessions stay on this phone.", doSignOut)
                  : router.push("/login")
              }
            />
          </View>
        </Card>
      </Reveal>

      <Reveal index={2} style={styles.block}>
        <Group title="Game">
          <Row
            title="Sport"
            caption={`${SPORTS.length} available`}
            icon="grid"
            palette={palette}
            onPress={() => router.push("/(tabs)/sports")}
            right={
              <View style={styles.rowValue}>
                <Text style={[Type.label, { color: palette.ink }]}>{sport.name}</Text>
                <Icon name="chevronRight" size={16} color={Paper.faint} />
              </View>
            }
          />
          <Divider />
          <View style={styles.inlineControl}>
            <Segmented
              label="Speed units"
              options={[
                { value: "kmh", label: "km/h" },
                { value: "mph", label: "mph" },
              ]}
              value={store.unitPreference}
              onChange={store.setUnitPreference}
              palette={palette}
            />
          </View>
          <Divider />
          <View style={styles.inlineControl}>
            <Segmented
              label="Racket hand"
              options={[
                { value: "right", label: "Right" },
                { value: "left", label: "Left" },
              ]}
              value={store.handedness}
              onChange={store.setHandedness}
              palette={palette}
            />
          </View>
        </Group>
      </Reveal>

      <Reveal index={3} style={styles.block}>
        <Group title="Capture">
          <View style={styles.inlineControl}>
            <Segmented
              label="Frame rate"
              options={[
                { value: "30", label: "30 fps" },
                { value: "60", label: "60 fps" },
              ]}
              value={String(store.capture.fps)}
              onChange={(v) => store.setCapture({ fps: v === "60" ? 60 : 30 })}
              palette={palette}
            />
            <Text style={[Type.small, styles.hint]}>
              60 fps halves the gap between frames, which is what separates two fast strokes in a rally.
            </Text>
          </View>
          <Divider />
          <View style={styles.inlineControl}>
            <Segmented
              label="Resolution"
              options={[
                { value: "720p", label: "720p" },
                { value: "1080p", label: "1080p" },
              ]}
              value={store.capture.quality}
              onChange={(v) => store.setCapture({ quality: v as "720p" | "1080p" })}
              palette={palette}
            />
          </View>
          <Divider />
          <SwitchRow
            title="Keep footage"
            caption="Store the clip on this phone after a session"
            icon="download"
            palette={palette}
            value={store.capture.keepFootage}
            onValueChange={(v) => store.setCapture({ keepFootage: v })}
          />
        </Group>
      </Reveal>

      <Reveal index={4} style={styles.block}>
        <Group title="Overlay">
          <SwitchRow
            title="Speed badge"
            caption="Live reading while you record"
            icon="zap"
            palette={palette}
            value={store.overlaySettings.showSpeedBadge}
            onValueChange={(v) => store.setOverlaySettings({ showSpeedBadge: v })}
          />
          <Divider />
          <SwitchRow
            title={`${sport.strokeNoun.charAt(0).toUpperCase() + sport.strokeNoun.slice(1)} label`}
            caption="The class the model reads"
            icon="target"
            palette={palette}
            value={store.overlaySettings.showStrokeLabel}
            onValueChange={(v) => store.setOverlaySettings({ showStrokeLabel: v })}
          />
          <Divider />
          <SwitchRow
            title="Framing guide"
            caption="Shows where the court should sit in frame"
            icon="ruler"
            palette={palette}
            value={store.overlaySettings.showFramingGuide}
            onValueChange={(v) => store.setOverlaySettings({ showFramingGuide: v })}
          />
        </Group>
      </Reveal>

      <Reveal index={5} style={styles.block}>
        <Group title="Notifications">
          <SwitchRow
            title="Session ready"
            caption="When a recording has finished analysing"
            icon="bell"
            palette={palette}
            value={store.notifications.sessionReady}
            onValueChange={(v) => store.setNotifications({ sessionReady: v })}
          />
          <Divider />
          <SwitchRow
            title="Weekly summary"
            icon="trending"
            palette={palette}
            value={store.notifications.weeklySummary}
            onValueChange={(v) => store.setNotifications({ weeklySummary: v })}
          />
          <Divider />
          <SwitchRow
            title="Drill reminders"
            icon="trophy"
            palette={palette}
            value={store.notifications.drillReminders}
            onValueChange={(v) => store.setNotifications({ drillReminders: v })}
          />
        </Group>
        <Note palette={palette} style={styles.note}>
          Notifications are not wired up yet — these preferences are saved, but nothing sends them.
        </Note>
      </Reveal>

      <Reveal index={6} style={styles.block}>
        <Group title="App">
          <SwitchRow
            title="Haptics"
            caption="Taps and confirmations buzz"
            icon="sparkle"
            palette={palette}
            value={store.haptics}
            onValueChange={store.setHaptics}
          />
          <Divider />
          <SwitchRow
            title="Reduce motion"
            caption="Screens appear instead of sliding in"
            icon="activity"
            palette={palette}
            value={store.reduceMotion}
            onValueChange={store.setReduceMotion}
          />
          <Divider />
          <Row
            title="Privacy"
            caption="What Ayto stores and where"
            icon="shield"
            palette={palette}
            onPress={() => router.push("/settings/about")}
          />
          <Divider />
          <Row
            title="About & licences"
            caption={`Version ${APP_VERSION}`}
            icon="info"
            palette={palette}
            onPress={() => router.push("/settings/about")}
          />
        </Group>
      </Reveal>

      <Reveal index={7} style={styles.block}>
        <SectionHead title="Danger zone" palette={palette} />
        <Card style={styles.danger}>
          <Row
            title="Reset preferences"
            caption="Sport, units, overlays and capture go back to defaults"
            icon="trash"
            palette={palette}
            danger
            onPress={() =>
              confirm(
                "Reset preferences?",
                "This clears every setting on this phone. Your account is not affected.",
                () => {
                  store.resetPreferences()
                  router.replace("/splash")
                },
                true,
              )
            }
          />
        </Card>
      </Reveal>

      <Reveal index={8} style={styles.footer}>
        <Badge label={`Ayto SportIQ ${APP_VERSION}`} />
      </Reveal>
    </Page>
  )
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.lg },
  navSpacer: { width: 44 },
  block: { marginBottom: Space.xl },
  account: { flexDirection: "row", alignItems: "center", gap: Space.md },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: Fonts.displayBold, fontSize: 19, color: "#FFFFFF" },
  accountText: { flex: 1, gap: 1 },
  rowValue: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  inlineControl: { paddingVertical: Space.md },
  hint: { marginTop: Space.sm, fontSize: 12.5, lineHeight: 17 },
  note: { marginTop: Space.md },
  danger: { padding: Space.lg, borderRadius: Radius.xl, backgroundColor: Paper.surface },
  footer: { alignItems: "center", marginTop: Space.sm },
})
