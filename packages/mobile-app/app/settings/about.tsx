import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { Badge, Divider, Note, SectionHead } from "../../src/components/ui/Bits"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { IconButton } from "../../src/components/ui/Press"
import { Card, Page } from "../../src/components/ui/Surface"
import { useSport } from "../../src/hooks/useSport"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

const PRIVACY = [
  {
    icon: "record" as const,
    title: "Your footage",
    body: "Clips you record stay in this app's storage on your phone. Nothing is uploaded. Turning off “Keep footage” deletes the clip once a session is analysed.",
  },
  {
    icon: "activity" as const,
    title: "Your results",
    body: "Session numbers live on your phone. If you sign in, they sync to your account so you can see them on another device; signed out, they never leave.",
  },
  {
    icon: "user" as const,
    title: "Your account",
    body: "Email and name only, held by Supabase for sign-in. No analytics SDK, no advertising identifiers, no third-party trackers are bundled in this build.",
  },
  {
    icon: "shield" as const,
    title: "Deleting everything",
    body: "Reset preferences clears this phone. To delete an account and its synced sessions, email the address below and it is removed within 30 days.",
  },
]

/** Direct dependencies that ship in the binary, with their licences. */
const LICENCES = [
  { name: "React Native", licence: "MIT" },
  { name: "Expo SDK 54", licence: "MIT" },
  { name: "expo-router", licence: "MIT" },
  { name: "react-native-reanimated", licence: "MIT" },
  { name: "react-native-svg", licence: "MIT" },
  { name: "react-native-mmkv", licence: "MIT" },
  { name: "zustand", licence: "MIT" },
  { name: "supabase-js", licence: "MIT" },
  { name: "Outfit (typeface)", licence: "SIL OFL 1.1" },
  { name: "Plus Jakarta Sans (typeface)", licence: "SIL OFL 1.1" },
]

/** The research the analysis is built on. Full list in research/sources.md. */
const RESEARCH = [
  { name: "TrackNetV3", use: "Shuttle detection and trajectory rectification" },
  { name: "WASB (BMVC 2023)", use: "Ball detection and candidate gating" },
  { name: "MonoTrack (CVPRW 2022)", use: "Monocular flight physics and launch speed" },
  { name: "RTMPose", use: "Pose estimation" },
  { name: "PnLCalib", use: "Court calibration" },
  { name: "BST / TemPose-TF", use: "Stroke classification" },
]

export default function AboutScreen() {
  const { palette } = useSport()

  return (
    <Page palette={palette} intensity={0.5} animated={false}>
      <Reveal style={styles.nav}>
        <IconButton name="arrowLeft" label="Go back" palette={palette} onPress={() => router.back()} />
        <Text style={Type.heading}>About</Text>
        <View style={styles.navSpacer} />
      </Reveal>

      <Reveal index={1} style={styles.block}>
        <Text style={Type.hero}>Ayto SportIQ</Text>
        <Text style={[Type.bodyMuted, styles.deck]}>
          Sports analysis from one phone camera. Nine sports, no sensors, no extra hardware.
        </Text>
        <Badge label="Version 0.2.0 · pre-release" tone="accent" palette={palette} style={styles.badge} />
      </Reveal>

      <Reveal index={2} style={styles.block}>
        <Note palette={palette} icon="info">
          This build analyses nothing yet. The detection, pose and physics pipeline is written and
          tested, but it does not run inside the app — every number you see is clearly-labelled
          sample data.
        </Note>
      </Reveal>

      <Reveal index={3} style={styles.block}>
        <SectionHead title="Privacy" kicker="What we hold" palette={palette} />
        <Card style={styles.card}>
          {PRIVACY.map((item, i) => (
            <View key={item.title}>
              {i > 0 ? <Divider style={styles.divider} /> : null}
              <View style={styles.item}>
                <View style={[styles.itemIcon, { backgroundColor: palette.soft }]}>
                  <Icon name={item.icon} size={18} color={palette.ink} />
                </View>
                <View style={styles.itemText}>
                  <Text style={Type.subhead}>{item.title}</Text>
                  <Text style={[Type.small, styles.itemBody]}>{item.body}</Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      </Reveal>

      <Reveal index={4} style={styles.block}>
        <SectionHead title="Built on" kicker="Research" palette={palette} />
        <Card style={styles.card}>
          {RESEARCH.map((item, i) => (
            <View key={item.name}>
              {i > 0 ? <Divider style={styles.divider} /> : null}
              <View style={styles.line}>
                <Text style={[Type.label, styles.lineName]}>{item.name}</Text>
                <Text style={[Type.small, styles.lineUse]} numberOfLines={2}>
                  {item.use}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </Reveal>

      <Reveal index={5} style={styles.block}>
        <SectionHead title="Open source" kicker="Licences" palette={palette} />
        <Card style={styles.card}>
          {LICENCES.map((item, i) => (
            <View key={item.name}>
              {i > 0 ? <Divider style={styles.divider} /> : null}
              <View style={styles.line}>
                <Text style={[Type.label, styles.lineName]}>{item.name}</Text>
                <Text style={[Type.small, { color: palette.ink }]}>{item.licence}</Text>
              </View>
            </View>
          ))}
        </Card>
      </Reveal>

      <Reveal index={6} style={styles.footer}>
        <Text style={[Type.small, styles.footerText]}>hello@ayto.app</Text>
        <Text style={[Type.small, styles.footerText]}>Made in India</Text>
      </Reveal>
    </Page>
  )
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.lg },
  navSpacer: { width: 44 },
  block: { marginBottom: Space.xl },
  deck: { marginTop: Space.sm },
  badge: { marginTop: Space.md },
  card: { padding: Space.lg, borderRadius: Radius.xl, backgroundColor: Paper.surface, marginTop: Space.md },
  divider: { marginVertical: Space.md },
  item: { flexDirection: "row", gap: Space.md },
  itemIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: "center", justifyContent: "center" },
  itemText: { flex: 1, gap: 2 },
  itemBody: { lineHeight: 19 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.md },
  lineName: { flexShrink: 0 },
  lineUse: { flex: 1, textAlign: "right" },
  footer: { alignItems: "center", gap: 2, marginTop: Space.sm },
  footerText: { fontFamily: Fonts.bodyMed, color: Paper.faint },
})
