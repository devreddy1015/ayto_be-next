import { useCallback } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Bars } from "../../src/components/data/Bars"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { SessionCard } from "../../src/components/session/SessionCard"
import { SportSwitcher } from "../../src/components/sport/SportSwitcher"
import Button from "../../src/components/ui/Button"
import Card from "../../src/components/ui/Card"
import { SectionHead } from "../../src/components/ui/SectionHead"
import { Stat } from "../../src/components/ui/Stat"
import { StatusTag, Tag } from "../../src/components/ui/Tag"
import { getDemo, type DemoBook } from "../../src/data/demo"
import { drillsFor } from "../../src/data/drills"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { capitalize, dateline, greeting, shortDate } from "../../src/lib/format"
import { LIVE_SPORT, STATUS_LABEL, strokeColor, strokeLabel, type Sport } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

const openSession = (id: string) => router.push({ pathname: "/session/[id]", params: { id } })

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const profile = useUserStore((s) => s.profile)
  const setSport = useUserStore((s) => s.setSportPreference)
  const demo = sport.status === "live" ? getDemo(sport.id) : null
  const name = profile?.name.split(" ")[0]

  return (
    <Screen palette={sport.palette}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Masthead */}
        <View style={styles.masthead}>
          <View>
            <Text style={styles.wordmark}>
              Ayto <Text style={[Type.kicker, { color: sport.palette.ink }]}>SportIQ</Text>
            </Text>
            <Text style={Type.kicker}>
              {dateline()} · {greeting()}
              {name ? `, ${name}` : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={[styles.avatar, { borderColor: sport.palette.plate }]}
          >
            <Text style={[styles.avatarText, { color: sport.palette.ink }]}>{(name ?? "A").charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>

        <SportSwitcher activeId={sport.id} onSelect={setSport} />

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={[Type.kicker, styles.heroKicker, { color: sport.palette.ink }]}>
            {sport.name} · {sport.code}
          </Text>
          <SweepHeading key={sport.id} lines={sport.heading} palette={sport.palette} size="hero" />
          <Text style={[Type.deck, styles.deck]}>{sport.tagline}</Text>
          <StatusTag status={sport.status} palette={sport.palette} />
        </View>

        {demo ? <LiveEdition sport={sport} demo={demo} /> : <LabEdition sport={sport} onSwitch={setSport} />}

        <DrillOfTheDay sport={sport} />
      </ScrollView>
    </Screen>
  )
}

/** Live sports: real numbers from the latest session. */
function LiveEdition({ sport, demo }: { sport: Sport; demo: DemoBook }) {
  const { format, unit } = useSpeed()
  const { palette } = sport
  const [last, prev] = demo.sessions
  const change = prev ? ((last.max_speed_kmh - prev.max_speed_kmh) / prev.max_speed_kmh) * 100 : null
  const weekly = demo.weekly.map((d) => format(d.kmh))
  const best = Math.max(...weekly)

  return (
    <>
      <Card accent={palette.plate} style={styles.lastCard}>
        <Text style={Type.kicker}>Last session · {shortDate(last.created_at)}</Text>
        <Stat
          label={sport.metrics[0].label}
          value={format(last.max_speed_kmh)}
          unit={unit}
          size="xl"
          color={palette.ink}
          delta={
            change === null
              ? undefined
              : { text: `${Math.abs(change).toFixed(1)}% vs previous`, up: change >= 0, color: change >= 0 ? palette.ink3 : Paper.danger }
          }
          style={styles.lastStat}
        />
        <View style={styles.row3}>
          <Stat label="Average" value={format(last.avg_speed_kmh)} unit={unit} size="sm" style={styles.flex} />
          <Stat label={`${sport.strokeNoun}s`} value={last.strokes_count} size="sm" style={styles.flex} />
          <Stat label="Form" value={demo.report.form} unit="/100" size="sm" style={styles.flex} />
        </View>
        <Button
          label="Record a session"
          trailing="●"
          palette={palette}
          size="lg"
          full
          onPress={() => router.push("/record")}
          accessibilityHint="Opens the camera"
          style={styles.record}
        />
        <View style={styles.row2}>
          <Button label="Drills" palette={palette} variant="outline" size="sm" full style={styles.flex} onPress={() => router.push("/drills")} />
          <Button label="Vs pro" palette={palette} variant="outline" size="sm" full style={styles.flex} onPress={() => router.push("/compare")} />
        </View>
      </Card>

      <SectionHead
        kicker={`02 / ${sport.metrics[0].label}`}
        title="This week"
        palette={palette}
        right={<Text style={[Type.kicker, { color: palette.ink3 }]}>Best {best}</Text>}
      />
      <Bars
        values={weekly}
        labels={demo.weekly.map((d) => d.day)}
        max={best * 1.1}
        color={palette.plate}
        highlight={{ threshold: best, color: palette.ink3 }}
        accessibilityLabel={`Top ${sport.metrics[0].label.toLowerCase()} per day this week, best ${best} ${unit}`}
      />

      <SectionHead
        kicker="03 / Archive"
        title="Recent sessions"
        palette={palette}
        right={
          <Pressable onPress={() => router.push("/history")} accessibilityRole="link" hitSlop={10}>
            <Text style={[Type.kicker, { color: palette.ink }]}>All →</Text>
          </Pressable>
        }
      />
      {demo.sessions.slice(0, 3).map((session) => (
        <SessionCard key={session.id} session={session} onPress={openSession} />
      ))}
    </>
  )
}

/** Sports in training or on the roadmap: say so plainly, show what's coming, no numbers. */
function LabEdition({ sport, onSwitch }: { sport: Sport; onSwitch: (id: Sport["id"]) => void }) {
  const { palette } = sport
  const switchToLive = useCallback(() => onSwitch(LIVE_SPORT.id), [onSwitch])
  return (
    <>
      <Card accent={palette.plate} style={styles.lastCard}>
        <Text style={Type.kicker}>Status · {STATUS_LABEL[sport.status]}</Text>
        <Text style={[Type.heading, styles.labTitle]}>{sport.name} analysis isn't live yet.</Text>
        <Text style={Type.small}>{sport.statusNote}</Text>
        <Button
          label={`Switch to ${LIVE_SPORT.name}`}
          trailing="→"
          palette={palette}
          full
          onPress={switchToLive}
          accessibilityHint={`${LIVE_SPORT.name} has full analysis today`}
          style={styles.record}
        />
        <Button label="All sports" palette={palette} variant="outline" size="sm" full onPress={() => router.push("/sports")} />
      </Card>

      <SectionHead kicker="02 / Planned" title="What we'll measure" palette={palette} />
      <View style={styles.planned}>
        {sport.metrics.map((metric, i) => (
          <View key={metric.id} style={[styles.plannedRow, i > 0 && styles.plannedRule]}>
            <Text style={[Type.body, styles.flex]}>{metric.label}</Text>
            <Text style={styles.plannedValue}>— {metric.unit}</Text>
          </View>
        ))}
      </View>

      <SectionHead kicker={`03 / ${sport.strokes.length} classes`} title={`${capitalize(sport.strokeNoun)}s we'll read`} palette={palette} />
      <View style={styles.tags}>
        {sport.strokes.map((stroke) => (
          <Tag key={stroke.id} label={stroke.label} color={strokeColor(sport, stroke.id)} variant="outline" />
        ))}
      </View>
    </>
  )
}

function DrillOfTheDay({ sport }: { sport: Sport }) {
  const drills = drillsFor(sport.id)
  if (drills.length === 0) return null
  const drill = drills[new Date().getDate() % drills.length]
  const { palette } = sport
  return (
    <>
      <SectionHead kicker="04 / Practice" title="Drill of the day" palette={palette} />
      <Pressable
        onPress={() => router.push("/drills")}
        accessibilityRole="button"
        accessibilityHint="Opens the drill book"
        style={({ pressed }) => [styles.drill, pressed && { backgroundColor: Paper.raised }]}
      >
        <View style={styles.drillTop}>
          <Tag label={strokeLabel(sport, drill.stroke)} color={strokeColor(sport, drill.stroke)} />
          <Text style={Type.kicker}>
            {drill.minutes} min · {drill.level}
          </Text>
        </View>
        <Text style={[Type.heading, styles.drillTitle]}>{drill.title}</Text>
        <Text style={Type.small}>{drill.description}</Text>
        <Text style={[Type.kicker, styles.drillLink, { color: palette.ink }]}>Open the drill book →</Text>
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.gutter, paddingBottom: Space.xxxl, maxWidth: 720, width: "100%", alignSelf: "center" },
  flex: { flex: 1 },
  masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.lg },
  wordmark: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 28, color: Paper.text },
  avatar: { width: 40, height: 40, borderWidth: 1.5, alignItems: "center", justifyContent: "center", borderRadius: Radius.sm },
  avatarText: { fontFamily: Fonts.monoBold, fontSize: 16 },
  hero: { marginTop: Space.xxl, marginBottom: Space.xl, gap: Space.md },
  heroKicker: { marginBottom: Space.xs },
  deck: { maxWidth: 460 },
  lastCard: { gap: Space.sm },
  lastStat: { marginTop: Space.sm },
  row3: { flexDirection: "row", gap: Space.md, marginTop: Space.md, paddingTop: Space.md, borderTopWidth: 1, borderTopColor: Paper.rule },
  row2: { flexDirection: "row", gap: Space.md, marginTop: Space.xs },
  record: { marginTop: Space.lg },
  labTitle: { marginTop: Space.xs },
  planned: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: Paper.rule },
  plannedRow: { flexDirection: "row", alignItems: "center", paddingVertical: Space.md },
  plannedRule: { borderTopWidth: 1, borderTopColor: Paper.rule },
  plannedValue: { fontFamily: Fonts.mono, fontSize: 12, color: Paper.faint },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  drill: { backgroundColor: Paper.stock, borderWidth: 1, borderColor: Paper.rule, borderRadius: Radius.sm, padding: Space.lg, gap: Space.sm },
  drillTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  drillTitle: { marginTop: Space.xs },
  drillLink: { marginTop: Space.sm },
})
