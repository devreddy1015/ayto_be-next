import React, { useEffect, useRef } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native"
import { Colors, Glass, Spacing } from "../theme"

const { width } = Dimensions.get("window")
const CARD_WIDTH = (width - Spacing.lg * 2 - 16) / 3

const TRAJECTORY_DATA = [120, 140, 180, 220, 200, 150, 100, 160, 240, 287, 250, 190, 140, 180, 230]
const MAX_SPEED = 300

const STROKES = [
  { type: "Smash", count: 12, color: "#FF3D5A", speed: 287 },
  { type: "Clear", count: 6, color: "#00F5A0", speed: 210 },
  { type: "Drop", count: 8, color: "#FFB800", speed: 145 },
  { type: "Net", count: 4, color: "#7C4DFF", speed: 60 },
  { type: "Serve", count: 4, color: "#00B8D4", speed: 95 },
]

const PRO_COMPARISON = [
  { label: "Smash Power", you: 78, pro: 95 },
  { label: "Wrist Snap", you: 65, pro: 92 },
  { label: "Footwork", you: 71, pro: 88 },
  { label: "Serve Acc", you: 55, pro: 85 },
  { label: "Reaction", you: 80, pro: 90 },
]

function TrajectoryChart() {
  const barWidth = 6
  const gap = 3
  const chartHeight = 140
  const chartWidth = width - Spacing.lg * 2 - Spacing.md * 2

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartYAxis}>
        <Text style={styles.axisLabel}>300</Text>
        <Text style={styles.axisLabel}>200</Text>
        <Text style={styles.axisLabel}>100</Text>
        <Text style={styles.axisLabel}>0</Text>
      </View>
      <View style={styles.chartArea}>
        {TRAJECTORY_DATA.map((speed, i) => {
          const barHeight = (speed / MAX_SPEED) * chartHeight
          return (
            <View key={i} style={styles.barWrapper}>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor:
                      speed > 250 ? Colors.accent : Colors.primary,
                    width: barWidth,
                    opacity: speed > 250 ? 1 : 0.7,
                    borderRadius: 3,
                  },
                ]}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

function PieChartView() {
  const total = STROKES.reduce((s, st) => s + st.count, 0)
  let cumulative = 0
  const radius = 36
  const circumference = 2 * Math.PI * radius

  return (
    <View style={styles.pieRow}>
      <View style={styles.pieChart}>
        <View style={[styles.pieCenter, { width: radius * 2, height: radius * 2 }]}>
          <Text style={styles.pieTotal}>{total}</Text>
        </View>
      </View>
      <View style={styles.pieLegend}>
        {STROKES.map((s) => (
          <View key={s.type} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendType}>{s.type}</Text>
            <Text style={styles.legendCount}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function FormScoreRing() {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 82,
      duration: 1800,
      useNativeDriver: false,
    }).start()
  }, [])

  return (
    <View style={styles.ringContainer}>
      <View style={styles.ringOuter}>
        <View style={styles.ringInner}>
          <Text style={styles.ringValue}>82</Text>
          <Text style={styles.ringMax}>/100</Text>
        </View>
      </View>
    </View>
  )
}

function ProComparisonBars() {
  return (
    <View style={styles.compContainer}>
      {PRO_COMPARISON.map((item) => (
        <View key={item.label} style={styles.compRow}>
          <Text style={styles.compLabel}>{item.label}</Text>
          <View style={styles.compTrack}>
            <View
              style={[
                styles.compBarYou,
                { width: `${item.you}%` as any },
              ]}
            />
            <View
              style={[
                styles.compBarPro,
                { width: `${item.pro}%` as any },
              ]}
            />
          </View>
        </View>
      ))}
      <View style={styles.compFooter}>
        <View style={styles.compLegendItem}>
          <View style={[styles.compLegendDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.compLegendText}>You</Text>
        </View>
        <View style={styles.compLegendItem}>
          <View style={[styles.compLegendDot, { backgroundColor: Colors.accent }]} />
          <Text style={styles.compLegendText}>Viktor Axelsen</Text>
        </View>
      </View>
    </View>
  )
}

export default function DashboardScreen({ navigation }: any) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Session #1</Text>
        <TouchableOpacity style={styles.exportBtn}>
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.heroRow}>
        <View style={[styles.heroCard, Glass.cardElevated]}>
          <Text style={styles.heroValue}>287</Text>
          <Text style={styles.heroUnit}>km/h</Text>
          <Text style={styles.heroLabel}>Max Speed</Text>
        </View>
        <View style={[styles.heroCard, Glass.cardElevated]}>
          <PieChartView />
          <Text style={styles.heroLabel}>Strokes</Text>
        </View>
        <View style={[styles.heroCard, Glass.cardElevated]}>
          <FormScoreRing />
          <Text style={styles.heroLabel}>Form Score</Text>
        </View>
      </View>

      <View style={[styles.section, Glass.card]}>
        <Text style={styles.sectionTitle}>SPEED TRAJECTORY</Text>
        <TrajectoryChart />
      </View>

      <View style={[styles.section, Glass.card]}>
        <Text style={styles.sectionTitle}>STROKE TIMELINE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {STROKES.map((s, i) => (
            <View key={i} style={styles.timelineCard}>
              <View
                style={[styles.timelineBadge, { backgroundColor: s.color + "20" }]}
              >
                <Text style={[styles.timelineType, { color: s.color }]}>
                  {s.type}
                </Text>
              </View>
              <Text style={styles.timelineSpeed}>{s.speed}</Text>
              <Text style={styles.timelineUnit}>km/h</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.section, Glass.card]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>VS PRO PLAYER</Text>
          <Text style={styles.sectionSubtitle}>Viktor Axelsen</Text>
        </View>
        <ProComparisonBars />
      </View>

      <View style={[styles.section, Glass.card]}>
        <Text style={styles.sectionTitle}>SESSION DETAILS</Text>
        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>28</Text>
            <Text style={styles.detailLabel}>Minutes</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>198</Text>
            <Text style={styles.detailLabel}>Avg km/h</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>34</Text>
            <Text style={styles.detailLabel}>Strokes</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailValue}>94%</Text>
            <Text style={styles.detailLabel}>Detection</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
  },
  navbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backBtn: {
    fontSize: 22,
    color: Colors.textSecondary,
    fontWeight: "300",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    letterSpacing: 1,
  },
  exportBtn: {
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  exportText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  heroRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: Spacing.md,
  },
  heroCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    minHeight: 120,
    justifyContent: "center",
  },
  heroValue: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.primary,
    fontVariant: ["tabular-nums"],
  },
  heroUnit: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textTertiary,
    marginTop: -4,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textTertiary,
    marginTop: 8,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  pieRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pieChart: {
    alignItems: "center",
    justifyContent: "center",
  },
  pieCenter: {
    borderRadius: 36,
    backgroundColor: "rgba(0,245,160,0.06)",
    borderWidth: 2,
    borderColor: "rgba(0,245,160,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  pieTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.primary,
  },
  pieLegend: {
    gap: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendType: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontWeight: "600",
    width: 32,
  },
  legendCount: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  ringContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "rgba(0,245,160,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(0,245,160,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.primary,
    fontVariant: ["tabular-nums"],
  },
  ringMax: {
    fontSize: 9,
    color: Colors.textTertiary,
    fontWeight: "600",
    marginTop: -2,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 3,
    marginBottom: Spacing.md,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginTop: -12,
  },
  chartContainer: {
    flexDirection: "row",
    height: 150,
  },
  chartYAxis: {
    justifyContent: "space-between",
    paddingRight: 8,
    paddingVertical: 2,
  },
  axisLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  chartArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  barWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  bar: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  timelineCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 10,
    alignItems: "center",
    minWidth: 80,
  },
  timelineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  timelineType: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  timelineSpeed: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    fontVariant: ["tabular-nums"],
  },
  timelineUnit: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginTop: 1,
  },
  compContainer: {
    gap: 12,
  },
  compRow: {
    gap: 4,
  },
  compLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  compTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 3,
    overflow: "hidden",
    position: "relative",
  },
  compBarYou: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: Colors.primary,
    borderRadius: 3,
    opacity: 0.8,
  },
  compBarPro: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: Colors.accent,
    opacity: 0.25,
    borderRadius: 3,
  },
  compFooter: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 8,
  },
  compLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compLegendText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  detailItem: {
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  detailValue: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
    fontVariant: ["tabular-nums"],
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginTop: 4,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
})
