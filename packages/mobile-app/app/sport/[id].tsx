import { useCallback } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RisoSurface, Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { SessionCard } from "../../src/components/session/SessionCard"
import { BackButton } from "../../src/components/ui/BackButton"
import Button from "../../src/components/ui/Button"
import { SectionHead } from "../../src/components/ui/SectionHead"
import { StatusTag, Tag } from "../../src/components/ui/Tag"
import { getDemo } from "../../src/data/demo"
import { drillsFor } from "../../src/data/drills"
import { useSpeed } from "../../src/hooks/useSport"
import { capitalize, pad2 } from "../../src/lib/format"
import { getSport, SECTIONS, SPORTS, strokeColor } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

const openSession = (id: string) => router.push({ pathname: "/session/[id]", params: { id } })

/** "13.4 × 6.1 m" -> [13.4, 6.1] (length, width). */
function dims(size: string): [number, number] {
  const [a, b] = size.split("×").map((part) => parseFloat(part))
  return [a || 1, b || 1]
}

/** One sport's own section: its plate, status, play area, taxonomy, drills and sessions. */
export default function SportSection() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const sport = getSport(id)
  const insets = useSafeAreaInsets()
  const { format, unit } = useSpeed()
  const primaryId = useUserStore((s) => s.sportPreference)
  const setSport = useUserStore((s) => s.setSportPreference)
  const makePrimary = useCallback(() => setSport(sport.id), [setSport, sport.id])

  const { palette } = sport
  const demo = sport.status === "live" ? getDemo(sport.id) : null
  const last = demo?.sessions[0]
  const drills = drillsFor(sport.id)
  const number = SPORTS.indexOf(sport) + 1
  const section = SECTIONS.find((s) => s.id === sport.section)
  const [length, width] = dims(sport.playArea.size)
  const isPrimary = primaryId === sport.id
  const lastValues: Record<string, string> = last && demo
    ? { [sport.metrics[0].id]: `${format(last.max_speed_kmh)} ${unit}`, strokes: String(last.strokes_count), form: `${demo.report.form}/100` }
    : {}

  return (
    <Screen palette={palette}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <BackButton />
          <Text style={Type.kicker}>
            No. {pad2(number)} — {section?.title}
          </Text>
        </View>

        <RisoSurface palette={palette} color={Paper.stock} glow={0.4} glowSize={460} grain={0.45} style={styles.plate}>
          <View style={styles.plateTop}>
            <View style={[styles.code, { backgroundColor: palette.plate }]}>
              <Text style={[styles.codeText, { color: palette.onPlate }]}>{sport.code}</Text>
            </View>
            <StatusTag status={sport.status} palette={palette} />
          </View>
          <SweepHeading key={sport.id} lines={sport.name.split(" ")} palette={palette} size="hero" style={styles.heading} />
          <Text style={Type.deck}>{sport.tagline}</Text>
          <View style={styles.inks}>
            {[palette.plate, palette.shadow, palette.ink3].map((c) => (
              <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
            ))}
          </View>
          <Text style={styles.inkNames}>Printed in {palette.names.join(", ")}</Text>
          <View style={styles.actions}>
            {isPrimary ? (
              <Tag label="Your sport" color={palette.ink} variant="outline" />
            ) : (
              <Button label="Make my sport" palette={palette} size="sm" onPress={makePrimary} />
            )}
            {demo ? (
              <Button
                label="Record"
                trailing="●"
                palette={palette}
                size="sm"
                variant="outline"
                onPress={() => {
                  makePrimary()
                  router.push("/record")
                }}
              />
            ) : null}
          </View>
        </RisoSurface>

        <SectionHead kicker="01 / Status" title={demo ? "Live today" : "In the print room"} palette={palette} />
        <Text style={Type.body}>{sport.statusNote}</Text>

        <SectionHead kicker={`02 / ${sport.playArea.label}`} title="Play area" palette={palette} />
        <View style={styles.areaRow}>
          <View
            style={[styles.court, { aspectRatio: width / length, borderColor: palette.ink }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${sport.playArea.label}, ${sport.playArea.size}`}
          >
            <View style={[styles.courtMid, { backgroundColor: palette.ink2 }]} />
          </View>
          <View style={styles.areaText}>
            <Text style={Type.kicker}>{sport.playArea.label}</Text>
            <Text style={[Type.metricSm, styles.areaValue]}>{sport.playArea.size}</Text>
            <Text style={Type.kicker}>Tracks</Text>
            <Text style={[Type.metricSm, styles.areaValue]}>{capitalize(sport.tracked)}</Text>
          </View>
        </View>

        <SectionHead kicker="03 / Headline numbers" title="What it measures" palette={palette} />
        <View style={styles.ledger}>
          {sport.metrics.map((metric, i) => (
            <View key={metric.id} style={[styles.ledgerRow, i > 0 && styles.ledgerRule]}>
              <Text style={[Type.body, styles.flex]}>{metric.label}</Text>
              <Text style={[styles.ledgerValue, { color: lastValues[metric.id] ? palette.ink : Paper.faint }]}>
                {lastValues[metric.id] ?? `planned · ${metric.unit || "count"}`}
              </Text>
            </View>
          ))}
        </View>

        <SectionHead kicker={`04 / ${sport.strokes.length} classes`} title={`${capitalize(sport.strokeNoun)} taxonomy`} palette={palette} />
        <View style={styles.tags}>
          {sport.strokes.map((stroke) => (
            <Tag key={stroke.id} label={stroke.label} color={strokeColor(sport, stroke.id)} variant="outline" />
          ))}
        </View>

        {drills.length > 0 ? (
          <>
            <SectionHead
              kicker={`05 / ${drills.length} drills`}
              title="From the drill book"
              palette={palette}
              right={
                <Pressable
                  onPress={() => router.push({ pathname: "/drills", params: { sport: sport.id } })}
                  accessibilityRole="link"
                  hitSlop={10}
                >
                  <Text style={[Type.kicker, { color: palette.ink }]}>All →</Text>
                </Pressable>
              }
            />
            {drills.slice(0, 3).map((drill, i) => (
              <View key={drill.id} style={[styles.drillRow, i > 0 && styles.ledgerRule]}>
                <Text style={[Type.kicker, styles.drillNo]}>{pad2(i + 1)}</Text>
                <View style={styles.flex}>
                  <Text style={styles.drillTitle}>{drill.title}</Text>
                  <Text style={Type.small}>
                    {drill.minutes} min · {drill.level}
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {demo ? (
          <>
            <SectionHead kicker="06 / Archive" title="Your sessions" palette={palette} />
            {demo.sessions.slice(0, 3).map((session) => (
              <SessionCard key={session.id} session={session} onPress={openSession} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.gutter, maxWidth: 720, width: "100%", alignSelf: "center" },
  flex: { flex: 1 },
  nav: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.lg },
  plate: { borderWidth: 1, borderColor: Paper.rule, borderRadius: Radius.sm, padding: Space.lg },
  plateTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.xl },
  code: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  codeText: { fontFamily: Fonts.monoBold, fontSize: 18 },
  heading: { marginBottom: Space.md },
  inks: { flexDirection: "row", gap: 4, marginTop: Space.lg },
  swatch: { width: 12, height: 12 },
  inkNames: { fontFamily: Fonts.mono, fontSize: 10, color: Paper.faint, marginTop: Space.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: Space.md, marginTop: Space.lg, flexWrap: "wrap" },
  areaRow: { flexDirection: "row", gap: Space.xl, alignItems: "center" },
  court: { height: 150, maxWidth: 150, borderWidth: 2, justifyContent: "center" },
  courtMid: { height: 2 },
  areaText: { flex: 1, gap: 2 },
  areaValue: { marginBottom: Space.md },
  ledger: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Paper.rule },
  ledgerRow: { flexDirection: "row", alignItems: "center", paddingVertical: Space.md, gap: Space.md },
  ledgerRule: { borderTopWidth: 1, borderTopColor: Paper.rule },
  ledgerValue: { fontFamily: Fonts.mono, fontSize: 12 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  drillRow: { flexDirection: "row", gap: Space.md, paddingVertical: Space.md },
  drillNo: { width: 24 },
  drillTitle: { fontFamily: Fonts.display, fontSize: 18, lineHeight: 23, color: Paper.text },
})
