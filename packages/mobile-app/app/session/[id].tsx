import { useCallback } from "react"
import { ScrollView, Share, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Bars, Meter } from "../../src/components/data/Bars"
import { RisoSurface, Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { BackButton } from "../../src/components/ui/BackButton"
import Button from "../../src/components/ui/Button"
import { SectionHead } from "../../src/components/ui/SectionHead"
import { Stat } from "../../src/components/ui/Stat"
import { Tag } from "../../src/components/ui/Tag"
import { findSession, getDemo } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { capitalize, clock, shortDate } from "../../src/lib/format"
import { getSport, strokeColor, strokeLabel } from "../../src/sports"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const fallback = useSport()
  const { format, unit } = useSpeed()
  const session = findSession(id ?? "latest")
  const sport = session ? getSport(session.sport) : fallback
  const demo = session ? getDemo(sport.id) : null
  const { palette } = sport

  const share = useCallback(() => {
    if (!session) return
    Share.share({
      message: `${sport.name} on Ayto SportIQ, ${shortDate(session.created_at)}: ${sport.metrics[0].label.toLowerCase()} ${format(session.max_speed_kmh)} ${unit}, ${session.strokes_count} ${sport.strokeNoun}s in ${clock(session.duration_seconds)}.`,
    }).catch(() => {})
  }, [session, sport, format, unit])

  const nav = (
    <View style={styles.nav}>
      <BackButton />
      {session ? <Button label="Share" palette={palette} variant="outline" size="sm" onPress={share} /> : null}
    </View>
  )

  if (!session || !demo) {
    return (
      <Screen palette={palette}>
        <View style={[styles.scroll, { paddingTop: insets.top + Space.md }]}>
          {nav}
          <SweepHeading lines={["Session", "not found."]} palette={palette} size="title" style={styles.hero} />
          <Text style={Type.body}>This session isn't on this phone.</Text>
        </View>
      </Screen>
    )
  }

  const index = demo.sessions.findIndex((s) => s.id === session.id)
  const previous = demo.sessions[index + 1]
  const change = previous ? ((session.max_speed_kmh - previous.max_speed_kmh) / previous.max_speed_kmh) * 100 : null
  const hasReport = index === 0
  const { report } = demo
  const timeline = report.timeline.map(format)
  const peak = Math.max(...timeline)
  const mixMax = Math.max(...report.mix.map((m) => m.count))
  const others = demo.sessions.filter((s) => s.id !== session.id).slice(0, 4)
  const othersMax = Math.max(session.max_speed_kmh, ...others.map((s) => s.max_speed_kmh))

  return (
    <Screen palette={palette}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        {nav}
        <Text style={[Type.kicker, styles.kicker]}>
          {sport.name} · {shortDate(session.created_at)} · {clock(session.duration_seconds)}
        </Text>
        <SweepHeading lines={["Session", "report."]} palette={palette} size="hero" style={styles.hero} />

        <RisoSurface palette={palette} color={Paper.stock} glow={0.32} glowSize={420} grain={0.4} style={styles.heroCard}>
          <Stat
            label={sport.metrics[0].label}
            value={format(session.max_speed_kmh)}
            unit={unit}
            size="xl"
            color={palette.ink}
            delta={
              change === null
                ? undefined
                : { text: `${Math.abs(change).toFixed(1)}% vs previous session`, up: change >= 0, color: change >= 0 ? palette.ink3 : Paper.danger }
            }
          />
          <View style={styles.metrics}>
            <Stat label="Average" value={format(session.avg_speed_kmh)} unit={unit} size="sm" style={styles.metric} />
            <Stat label={`${sport.strokeNoun}s`} value={session.strokes_count} size="sm" style={styles.metric} />
            {hasReport ? <Stat label="Form" value={report.form} unit="/100" size="sm" style={styles.metric} /> : null}
            {hasReport ? <Stat label="Tracked" value={report.detection} unit="%" size="sm" style={styles.metric} /> : null}
          </View>
        </RisoSurface>

        {hasReport ? (
          <>
            <SectionHead kicker={`01 / Every ${report.timelineStepS} s`} title="Speed timeline" palette={palette} />
            <Bars
              values={timeline}
              labels={timeline.map((_, i) => (i % 5 === 0 ? `${i * report.timelineStepS}s` : ""))}
              max={peak * 1.1}
              height={140}
              color={palette.plate}
              highlight={{ threshold: peak, color: palette.ink3 }}
              accessibilityLabel={`Peak ${sport.tracked} speed over the session, top ${peak} ${unit}`}
            />

            <SectionHead
              kicker={`02 / ${report.mix.reduce((n, m) => n + m.count, 0)} ${sport.strokeNoun}s`}
              title={`${capitalize(sport.strokeNoun)} mix`}
              palette={palette}
            />
            {report.mix.map((m) => (
              <View key={m.stroke} style={styles.mixRow}>
                <Tag label={strokeLabel(sport, m.stroke)} color={strokeColor(sport, m.stroke)} style={styles.mixTag} />
                <View style={styles.mixTrack}>
                  <View style={[styles.mixFill, { width: `${(m.count / mixMax) * 100}%`, backgroundColor: strokeColor(sport, m.stroke) }]} />
                </View>
                <Text style={styles.mixCount}>{m.count}</Text>
                <Text style={styles.mixSpeed}>
                  {format(m.avgKmh)} {unit}
                </Text>
              </View>
            ))}

            <SectionHead kicker="03 / Against the pro average" title="Biomechanics" palette={palette} />
            {report.body.map((row) => (
              <Meter key={row.id} label={row.label} you={row.you} pro={row.pro} unit={row.unit} youColor={palette.plate} proColor={palette.ink3} />
            ))}
          </>
        ) : (
          <Text style={[Type.small, styles.note]}>
            The frame-by-frame breakdown in this demo is kept for your latest session only.
          </Text>
        )}

        {others.length > 0 ? (
          <>
            <SectionHead kicker={`04 / ${sport.metrics[0].label}`} title="Against your others" palette={palette} />
            {[session, ...others].map((s) => (
              <View key={s.id} style={styles.cmpRow}>
                <Text style={[styles.cmpDate, s.id === session.id && { color: palette.ink }]}>{shortDate(s.created_at)}</Text>
                <View style={styles.mixTrack}>
                  <View
                    style={[
                      styles.mixFill,
                      { width: `${(s.max_speed_kmh / othersMax) * 100}%`, backgroundColor: s.id === session.id ? palette.plate : Paper.muted },
                    ]}
                  />
                </View>
                <Text style={styles.mixSpeed}>{format(s.max_speed_kmh)}</Text>
              </View>
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
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { marginTop: Space.xl },
  hero: { marginTop: Space.md, marginBottom: Space.xl },
  heroCard: { borderWidth: 1, borderColor: Paper.rule, borderRadius: Radius.sm, padding: Space.lg },
  metrics: { flexDirection: "row", flexWrap: "wrap", rowGap: Space.lg, marginTop: Space.lg, paddingTop: Space.md, borderTopWidth: 1, borderTopColor: Paper.rule },
  metric: { flexBasis: "50%", flexGrow: 1 },
  mixRow: { flexDirection: "row", alignItems: "center", gap: Space.sm, marginBottom: Space.md },
  mixTag: { width: 92, paddingHorizontal: 0 },
  mixTrack: { flex: 1, height: 8, backgroundColor: Paper.raised },
  mixFill: { height: "100%" },
  mixCount: { fontFamily: Fonts.monoBold, fontSize: 13, color: Paper.text, width: 26, textAlign: "right" },
  mixSpeed: { fontFamily: Fonts.mono, fontSize: 11, color: Paper.muted, width: 64, textAlign: "right" },
  note: { marginTop: Space.xl },
  cmpRow: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.md },
  cmpDate: { fontFamily: Fonts.mono, fontSize: 11, color: Paper.muted, width: 52 },
})
