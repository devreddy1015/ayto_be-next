import { useCallback, useMemo } from "react"
import { StyleSheet, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { LinearGradient } from "expo-linear-gradient"
import { Badge, Chip, Divider, Empty, Note, SectionHead } from "../../src/components/ui/Bits"
import { Icon, type IconName } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, IconButton } from "../../src/components/ui/Press"
import { Card, Page } from "../../src/components/ui/Surface"
import { CourtDiagram } from "../../src/components/sport/CourtDiagram"
import { getCourt } from "../../src/data/courts"
import { useSport } from "../../src/hooks/useSport"
import { capitalize, pad2 } from "../../src/lib/format"
import {
  getSport,
  isSportId,
  SECTIONS,
  SPORTS,
  STATUS_LABEL,
  type AnalysisStatus,
  type Sport,
  type SportId,
} from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Motion, Paper, Radius, Rise, Shadow, Space, Type } from "../../src/theme"

/** A status reads as a word first; the tone only reinforces it. */
const STATUS_TONE: Record<AnalysisStatus, "neutral" | "accent" | "warn"> = {
  live: "accent",
  beta: "warn",
  soon: "neutral",
}

const METRIC_ICONS: readonly IconName[] = ["zap", "target", "trending"]

/** The diagram's own coordinate space. The box it draws into keeps this ratio. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={Type.kicker} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

/** One sport's page: what it is, the shape of its court, and what Ayto will read there. */
export default function SportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  // The athlete's own sport colours the not-found state, which has no sport of its own.
  const current = useSport()
  const primaryId = useUserStore((s) => s.sportPreference)
  const setSportPreference = useUserStore((s) => s.setSportPreference)

  const known = isSportId(id)
  const sport = known ? getSport(id) : current
  const { palette } = sport

  const choose = useCallback(() => {
    setSportPreference(sport.id)
    if (router.canGoBack()) router.back()
    else router.replace("/(tabs)/sports")
  }, [setSportPreference, sport.id])

  const openDrills = useCallback(() => {
    router.push({ pathname: "/drills", params: { sport: sport.id } })
  }, [sport.id])

  const back = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace("/(tabs)/sports")
  }, [])

  // A bad id used to fall through to badminton, which quietly showed the wrong
  // sport's court and taxonomy. Say so instead.
  if (!known) {
    return (
      <Page palette={current.palette} intensity={0.5} scroll={{ contentContainerStyle: styles.centre }}>
        <Reveal>
          <Empty
            title="We don't have that sport."
            caption="This link points at something that isn't in the catalogue. It may have been renamed since the link was made."
            icon="info"
            palette={current.palette}
            action={
              <Button
                label="See every sport"
                palette={current.palette}
                variant="soft"
                icon="grid"
                onPress={() => router.replace("/(tabs)/sports")}
                style={styles.emptyAction}
              />
            }
          />
        </Reveal>
      </Page>
    )
  }

  const section = SECTIONS.find((s) => s.id === sport.section)
  const number = SPORTS.findIndex((s) => s.id === sport.id) + 1
  const court = getCourt(sport.id)
  const isPrimary = primaryId === sport.id
  // Each metric row takes a stagger slot of its own, so everything below the
  // list has to count from the end of it rather than from a fixed index.
  const afterMetrics = 6 + sport.metrics.length
  const chipsAt = (afterMetrics + 1) * Motion.stagger

  return (
    <Page palette={palette} intensity={0.7}>
      <Reveal style={styles.nav}>
        <IconButton name="arrowLeft" label="Go back" palette={palette} onPress={back} />
        <Text style={Type.kicker} numberOfLines={1}>
          No. {pad2(number)} — {section?.title}
        </Text>
      </Reveal>

      <Reveal index={1} distance={Rise.lg} style={styles.block}>
        <View style={[styles.hero, Shadow.lg]}>
          <LinearGradient
            colors={palette.grad}
            locations={[0, 0.55, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTop}>
            <View style={styles.code}>
              <Text style={[styles.codeText, { color: palette.deep }]}>{sport.code}</Text>
            </View>
            <Badge
              label={STATUS_LABEL[sport.status]}
              tone={STATUS_TONE[sport.status]}
              palette={palette}
              dot={sport.status === "live"}
            />
          </View>
          <Text style={styles.heroName} accessibilityRole="header">
            {sport.name}
          </Text>
          <Text style={styles.heroTagline}>{sport.tagline}</Text>
          <View style={styles.facts}>
            <Fact label="Will track" value={capitalize(sport.tracked)} />
            <Fact label="Play area" value={sport.playArea.label} />
            <Fact label={capitalize(sport.strokeNounPlural)} value={String(sport.strokes.length)} />
          </View>
        </View>
      </Reveal>

      {/*
        The hero badge speaks the shared STATUS_LABEL vocabulary, whose top tier
        reads "Live analysis" — and nothing in this app has analysed a clip yet.
        The note that says what has actually been built therefore sits directly
        under the badge, the way it does on the sports tab, rather than at the
        foot of a screen the reader may never reach.
      */}
      <Reveal index={2} style={styles.block}>
        <Note palette={palette}>{sport.statusNote}</Note>
      </Reveal>

      <Reveal index={3} style={styles.head}>
        <SectionHead
          kicker="The ground"
          title={`One ${sport.playArea.label.toLowerCase()}, to scale`}
          palette={palette}
        />
      </Reveal>

      <Reveal index={4} style={styles.block}>
        <Card variant="glass" elevation="md">
          <CourtDiagram sport={sport} />
          <View style={styles.courtMeta}>
            <Text style={Type.metricSm}>{sport.playArea.size}</Text>
            <Badge
              label={
                court.camera
                  ? `${court.camera.lens === "ultrawide" ? "Ultrawide 0.5×" : "Main 1× lens"}`
                  : "No camera spot yet"
              }
              tone="accent"
              palette={palette}
            />
          </View>
          {court.camera ? (
            <Text style={[Type.small, styles.courtCaption]}>
              {court.camera.why}
              {court.camera.worstError
                ? ` In simulation, launch speed from here stayed within ${court.camera.worstError}% across every shot direction. Standing on the centre line is far worse — a shot flying straight at the lens has no depth to measure.`
                : ""}
            </Text>
          ) : null}
          {court.cameraNote ? (
            <Note palette={palette} style={styles.courtNote}>
              {court.cameraNote}
            </Note>
          ) : null}
          {court.camera?.lens === "ultrawide" ? (
            <Note palette={palette} icon="ruler" style={styles.courtNote}>
              Switch to the ultrawide (0.5×) lens. A {sport.playArea.label.toLowerCase()} leaves
              less clear space around it than the main lens needs to take the whole thing in.
            </Note>
          ) : null}
          {court.camera?.ifYouHaveRoom ? (
            <Note palette={palette} icon="sparkle" style={styles.courtNote}>
              {court.camera.ifYouHaveRoom}
            </Note>
          ) : null}
        </Card>
      </Reveal>

      <Reveal index={5} style={styles.head}>
        <SectionHead
          kicker="The readout"
          title="What Ayto will read"
          caption={`The ${sport.metrics.length} numbers a ${sport.name.toLowerCase()} session will come back with.`}
          palette={palette}
        />
      </Reveal>

      <View style={styles.block}>
        <Card padded={false} style={styles.list}>
          {sport.metrics.map((metric, i) => (
            <Reveal key={metric.id} index={6 + i}>
              <View style={styles.metricRow}>
                <View style={[styles.metricIcon, { backgroundColor: palette.soft }]}>
                  <Icon name={METRIC_ICONS[i % METRIC_ICONS.length]} size={17} color={palette.ink} weight={2} />
                </View>
                <Text style={[Type.subhead, styles.flex]} numberOfLines={1}>
                  {metric.label}
                </Text>
                <Text style={Type.unit}>{metric.unit || "count"}</Text>
              </View>
              {i < sport.metrics.length - 1 ? <Divider /> : null}
            </Reveal>
          ))}
        </Card>
      </View>

      <Reveal index={afterMetrics} style={styles.head}>
        <SectionHead
          kicker={`${sport.strokes.length} classes`}
          title={`Every ${sport.strokeNoun} it will tell apart`}
          palette={palette}
        />
      </Reveal>

      <View style={[styles.chips, styles.block]}>
        {sport.strokes.map((stroke, i) => (
          <Reveal key={stroke.id} from="scale" delay={chipsAt + i * 45}>
            <Chip label={stroke.label} palette={palette} />
          </Reveal>
        ))}
      </View>

      <Reveal index={afterMetrics + 2} style={styles.actions}>
        {isPrimary ? (
          <Button
            label={`${sport.name} is your sport`}
            palette={palette}
            variant="soft"
            size="lg"
            icon="check"
            full
            disabled
          />
        ) : (
          <Button
            label="Make this my sport"
            palette={palette}
            size="lg"
            icon="check"
            full
            onPress={choose}
          />
        )}
        <Button
          label="Open the drill book"
          palette={palette}
          variant="outline"
          icon="trophy"
          full
          onPress={openDrills}
        />
      </Reveal>
    </Page>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flexGrow: 1, justifyContent: "center" },
  emptyAction: { marginTop: Space.lg },
  nav: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.lg },
  block: { marginBottom: Space.xl },
  head: { marginBottom: Space.md },
  hero: { borderRadius: Radius.sheet, overflow: "hidden", padding: Space.xl },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Paper.veilStrong,
  },
  codeText: { fontFamily: Fonts.displayBold, fontSize: 20, letterSpacing: -0.6 },
  // On a gradient stop only Paper.ink is safely readable, so the hierarchy
  // here is carried by size and weight rather than by colour.
  heroName: { ...Type.hero, marginTop: Space.xl },
  heroTagline: { ...Type.body, marginTop: Space.sm, maxWidth: 320 },
  facts: {
    flexDirection: "row",
    gap: Space.md,
    marginTop: Space.xl,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Paper.veilStrong,
  },
  fact: { flex: 1, gap: 3 },
  factValue: { fontFamily: Fonts.displayMed, fontSize: 15, letterSpacing: -0.2, color: Paper.ink },
  courtNote: { marginTop: Space.md },
  courtMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.md,
    marginTop: Space.lg,
  },
  courtCaption: { marginTop: Space.sm },
  list: { paddingHorizontal: Space.lg },
  metricRow: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingVertical: Space.lg },
  metricIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  actions: { gap: Space.sm },
})
