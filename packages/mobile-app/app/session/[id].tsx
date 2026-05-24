import React, { useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from "react-native"
import { router } from "expo-router"
import { Colors, Spacing, Radius } from "../../src/theme"
import { DUMMY_SESSION, WEEKLY_SPEEDS } from "../../src/data/dummyData"
import Card from "../../src/components/ui/Card"
import Badge from "../../src/components/ui/Badge"
import StrokeChip from "../../src/components/session/StrokeChip"
import Skeleton from "../../src/components/ui/Skeleton"

const { width } = Dimensions.get("window")

const TRAJECTORY = [120, 140, 180, 220, 200, 150, 100, 160, 240, 287, 250, 190, 140, 180, 230]
const MAX_SPEED = 300

const STROKE_STATS = [
  { type: "smash" as const, count: 12, speed: 287, color: "#FFB300" },
  { type: "clear" as const, count: 6, speed: 210, color: "#4A9EFF" },
  { type: "drop" as const, count: 8, speed: 145, color: "#FF6B6B" },
  { type: "net" as const, count: 4, speed: 60, color: "#4A9EFF" },
  { type: "serve" as const, count: 4, speed: 95, color: "#00FF87" },
]

const BIOMECHANICS = [
  { label: "Elbow Angle", value: 152, pro: 165, unit: "°" },
  { label: "Knee Bend", value: 138, pro: 145, unit: "°" },
  { label: "Wrist Velocity", value: 9.2, pro: 12.4, unit: "m/s" },
]

export default function SessionDashboard() {
  const [loading, setLoading] = useState(true)
  const mountAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1200)
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start()
    return () => clearTimeout(timer)
  }, [])

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Session Detail</Text>
            <Text style={styles.date}>Today · 28 min · Badminton</Text>
          </View>
          <TouchableOpacity style={styles.shareButton}>
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Metric */}
        <View style={styles.heroCard}>
          <View style={styles.heroBg}>
            <Text style={styles.heroLabel}>MAX SPEED</Text>
            {loading ? (
              <Skeleton height={64} width={120} borderRadius={8} />
            ) : (
              <Text style={styles.heroValue}>{DUMMY_SESSION.maxSpeed}</Text>
            )}
            <Text style={styles.heroUnit}>km/h</Text>
            <View style={styles.heroComparison}>
              <Text style={styles.compArrow}>▲</Text>
              <Text style={styles.compText}>73% faster than last session</Text>
            </View>
          </View>
        </View>

        {/* Quick Metrics */}
        <View style={styles.metricsRow}>
          <Card variant="surface" style={styles.metricCard}>
            <Text style={styles.metricValue}>198</Text>
            <Text style={styles.metricLabel}>Avg km/h</Text>
          </Card>
          <Card variant="surface" style={styles.metricCard}>
            <Text style={styles.metricValue}>{DUMMY_SESSION.formScore}</Text>
            <Text style={styles.metricLabel}>Form Score</Text>
          </Card>
          <Card variant="surface" style={styles.metricCard}>
            <Text style={styles.metricValue}>34</Text>
            <Text style={styles.metricLabel}>Strokes</Text>
          </Card>
          <Card variant="surface" style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: Colors.accent_green }]}>94%</Text>
            <Text style={styles.metricLabel}>Detection</Text>
          </Card>
        </View>

        {/* Speed Timeline */}
        <Text style={styles.sectionTitle}>SPEED TIMELINE</Text>
        <Card variant="surface" style={styles.chartCard}>
          <View style={styles.chartYAxis}>
            <Text style={styles.axisLabel}>300</Text>
            <Text style={styles.axisLabel}>200</Text>
            <Text style={styles.axisLabel}>100</Text>
            <Text style={styles.axisLabel}>0</Text>
          </View>
          <View style={styles.chartArea}>
            {TRAJECTORY.map((speed, i) => {
              const barHeight = (speed / MAX_SPEED) * 120
              return (
                <View key={i} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: speed > 250 ? Colors.accent_amber : Colors.accent_green,
                        opacity: speed > 250 ? 1 : 0.6,
                      },
                    ]}
                  />
                </View>
              )
            })}
          </View>
        </Card>

        {/* Stroke Distribution */}
        <Text style={styles.sectionTitle}>STROKE DISTRIBUTION</Text>
        <Card variant="surface" style={styles.strokeCard}>
          <View style={styles.strokeRows}>
            {STROKE_STATS.map((stroke) => (
              <View key={stroke.type} style={styles.strokeRow}>
                <StrokeChip type={stroke.type} size="sm" />
                <View style={styles.strokeBarTrack}>
                  <View
                    style={[
                      styles.strokeBar,
                      { width: `${(stroke.count / 16) * 100}%`, backgroundColor: stroke.color },
                    ]}
                  />
                </View>
                <Text style={styles.strokeCount}>{stroke.count}</Text>
                <Text style={styles.strokeSpeed}>{stroke.speed} km/h</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Biomechanics */}
        <Text style={styles.sectionTitle}>BIOMECHANICS</Text>
        {BIOMECHANICS.map((bio) => (
          <Card key={bio.label} variant="surface" style={styles.bioCard}>
            <View style={styles.bioHeader}>
              <Text style={styles.bioLabel}>{bio.label}</Text>
              <Text style={styles.bioCompare}>
                {bio.value}{bio.unit} (pro: {bio.pro}{bio.unit})
              </Text>
            </View>
            <View style={styles.bioTrack}>
              <View style={[styles.bioBar, { width: `${(bio.value / bio.pro) * 100}%` }]} />
              <View
                style={[styles.bioMarker, { left: `${(bio.pro / (bio.pro * 1.2)) * 100}%` }]}
              />
            </View>
          </Card>
        ))}

        {/* Day Comparison */}
        <Text style={styles.sectionTitle}>VS PREVIOUS SESSIONS</Text>
        <Card variant="surface" style={styles.compCard}>
          {WEEKLY_SPEEDS.slice(0, 4).map((day, i) => (
            <View key={day.day} style={styles.compRow}>
              <Text style={styles.compDay}>{day.day}</Text>
              <View style={styles.compTrackMini}>
                <View style={[styles.compBarMini, { width: `${(day.speed / 300) * 100}%` }]} />
              </View>
              <Text style={styles.compSpeed}>{day.speed}</Text>
            </View>
          ))}
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg_primary },
  scroll: { paddingTop: 60 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.bg_surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: Colors.text_primary, fontSize: 18, fontWeight: "300" },
  title: { fontSize: 16, fontWeight: "700", color: Colors.text_primary },
  date: { fontSize: 11, color: Colors.text_secondary, marginTop: 2 },
  shareButton: {
    backgroundColor: "rgba(0,255,135,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "rgba(0,255,135,0.2)",
  },
  shareText: { color: Colors.accent_green, fontSize: 13, fontWeight: "700" },
  heroCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderRadius: 20, overflow: "hidden" },
  heroBg: { padding: 28, backgroundColor: Colors.bg_elevated, borderWidth: 1, borderColor: "rgba(0,255,135,0.12)", alignItems: "center" },
  heroLabel: { fontSize: 10, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 3, marginBottom: 8 },
  heroValue: { fontSize: 72, fontWeight: "800", color: Colors.accent_green, fontVariant: ["tabular-nums"] as any, lineHeight: 76 },
  heroUnit: { fontSize: 13, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 2, marginTop: -4 },
  heroComparison: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, backgroundColor: "rgba(0,255,135,0.08)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  compArrow: { fontSize: 10, color: Colors.accent_green },
  compText: { fontSize: 12, fontWeight: "600", color: Colors.accent_green },
  metricsRow: { flexDirection: "row", gap: 6, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  metricCard: { flex: 1, alignItems: "center", padding: 12, minHeight: 72, justifyContent: "center" },
  metricValue: { fontSize: 20, fontWeight: "800", color: Colors.text_primary, fontVariant: ["tabular-nums"] as any },
  metricLabel: { fontSize: 8, fontWeight: "600", color: Colors.text_secondary, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  sectionTitle: { fontSize: 10, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 3, marginBottom: Spacing.md, marginHorizontal: Spacing.lg },
  chartCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, padding: Spacing.md, flexDirection: "row" },
  chartYAxis: { justifyContent: "space-between", paddingRight: 8, height: 140 },
  axisLabel: { fontSize: 8, color: Colors.text_secondary, fontWeight: "600", fontVariant: ["tabular-nums"] as any },
  chartArea: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 2, height: 140 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "70%", borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  strokeCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, padding: Spacing.md },
  strokeRows: { gap: 8 },
  strokeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  strokeBarTrack: { flex: 1, height: 6, backgroundColor: Colors.bg_elevated, borderRadius: 3 },
  strokeBar: { height: "100%", borderRadius: 3 },
  strokeCount: { fontSize: 13, fontWeight: "700", color: Colors.text_primary, width: 24, textAlign: "right", fontVariant: ["tabular-nums"] as any },
  strokeSpeed: { fontSize: 11, fontWeight: "600", color: Colors.text_secondary, width: 55, textAlign: "right", fontVariant: ["tabular-nums"] as any },
  bioCard: { marginHorizontal: Spacing.lg, marginBottom: 8, padding: Spacing.md },
  bioHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  bioLabel: { fontSize: 13, fontWeight: "700", color: Colors.text_primary },
  bioCompare: { fontSize: 11, fontWeight: "600", color: Colors.text_secondary },
  bioTrack: { height: 6, backgroundColor: Colors.bg_elevated, borderRadius: 3, position: "relative" },
  bioBar: { height: "100%", backgroundColor: Colors.accent_green, borderRadius: 3 },
  bioMarker: { position: "absolute", top: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent_amber, borderWidth: 2, borderColor: Colors.bg_primary },
  compCard: { marginHorizontal: Spacing.lg, padding: Spacing.md },
  compRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  compDay: { width: 30, fontSize: 11, fontWeight: "600", color: Colors.text_secondary },
  compTrackMini: { flex: 1, height: 6, backgroundColor: Colors.bg_elevated, borderRadius: 3 },
  compBarMini: { height: "100%", backgroundColor: Colors.accent_green, borderRadius: 3, opacity: 0.6 },
  compSpeed: { fontSize: 12, fontWeight: "700", color: Colors.text_secondary, fontVariant: ["tabular-nums"] as any, width: 40, textAlign: "right" },
})
