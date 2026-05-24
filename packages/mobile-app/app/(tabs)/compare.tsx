import React, { useState } from "react"
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native"
import { Colors, Spacing, Radius } from "../../src/theme"
import Card from "../../src/components/ui/Card"
import Badge from "../../src/components/ui/Badge"
import Skeleton from "../../src/components/ui/Skeleton"
import type { ProBenchmark, ProComparisonData, StrokeComparison } from "../../src/types"

const { width } = Dimensions.get("window")

const PRO_PLAYERS: ProBenchmark[] = [
  { id: "1", player_name: "Viktor Axelsen", sport: "badminton", smash_speed_kmh: 419, avg_elbow_angle: 165, avg_wrist_velocity: 12.4, footwork_score: 92, serve_speed_kmh: 198, drop_accuracy: 88, consistency_score: 94 },
  { id: "2", player_name: "Srikanth Kidambi", sport: "badminton", smash_speed_kmh: 372, avg_elbow_angle: 158, avg_wrist_velocity: 10.8, footwork_score: 85, serve_speed_kmh: 182, drop_accuracy: 82, consistency_score: 87 },
  { id: "3", player_name: "P. V. Sindhu", sport: "badminton", smash_speed_kmh: 356, avg_elbow_angle: 160, avg_wrist_velocity: 11.2, footwork_score: 88, serve_speed_kmh: 175, drop_accuracy: 86, consistency_score: 90 },
]

const MOCK_COMPARISON: ProComparisonData = {
  pro_name: "Viktor Axelsen",
  your_session_id: "1",
  radar_data: [
    { axis: "Smash", value: 78, maxValue: 100 },
    { axis: "Drop", value: 65, maxValue: 100 },
    { axis: "Serve", value: 55, maxValue: 100 },
    { axis: "Footwork", value: 71, maxValue: 100 },
    { axis: "Elbow", value: 82, maxValue: 100 },
    { axis: "Consistency", value: 68, maxValue: 100 },
  ],
  stroke_comparisons: [
    { stroke_type: "smash", your_speed: 287, pro_speed: 419, your_elbow_angle: 148, pro_elbow_angle: 165, your_wrist_velocity: 9.2, pro_wrist_velocity: 12.4, gap_score: 68 },
    { stroke_type: "clear", your_speed: 210, pro_speed: 280, your_elbow_angle: 155, pro_elbow_angle: 162, your_wrist_velocity: 8.6, pro_wrist_velocity: 11.0, gap_score: 75 },
    { stroke_type: "drop", your_speed: 145, pro_speed: 170, your_elbow_angle: 140, pro_elbow_angle: 158, your_wrist_velocity: 7.4, pro_wrist_velocity: 9.8, gap_score: 72 },
  ],
  ai_tip: "",
}

export default function CompareScreen() {
  const [selectedPro, setSelectedPro] = useState(PRO_PLAYERS[0])
  const [loading, setLoading] = useState(true)
  const [aiTip, setAiTip] = useState("")
  const [tipLoading, setTipLoading] = useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  const loadAiTip = async () => {
    setTipLoading(true)
    setTimeout(() => {
      setAiTip("Focus on your smash timing: initiate the shoulder rotation before the wrist snap. Your elbow angle at contact is 17° below pro benchmark — practice with resistance bands to close this gap.")
      setTipLoading(false)
    }, 2000)
  }

  React.useEffect(() => { loadAiTip() }, [selectedPro])

  const RadarIcon = () => (
    <View style={styles.radarPlaceholder}>
      {MOCK_COMPARISON.radar_data.map((d, i) => {
        const angle = (i / MOCK_COMPARISON.radar_data.length) * 360
        const rad = (angle * Math.PI) / 180
        const r = 50 * (d.value / d.maxValue)
        const cx = 80
        const cy = 80
        const x = cx + r * Math.cos(rad - Math.PI / 2)
        const y = cy + r * Math.sin(rad - Math.PI / 2)
        return (
          <View key={d.axis} style={styles.radarAxis}>
            <Text style={styles.radarLabel}>{d.axis}</Text>
            <View style={[styles.radarDot, { top: y - 3, left: x - 3 }]} />
          </View>
        )
      })}
      <View style={styles.radarCenter}>
        <Text style={styles.radarScore}>71</Text>
        <Text style={styles.radarScoreLabel}>Match %</Text>
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Pro Comparison</Text>
          <Text style={styles.subtitle}>See how you stack up</Text>
        </View>

        {/* Pro Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.proRow} contentContainerStyle={{ gap: 10, paddingRight: Spacing.lg }}>
          {PRO_PLAYERS.map((pro) => (
            <TouchableOpacity
              key={pro.id}
              style={[styles.proCard, selectedPro.id === pro.id && styles.proCardActive]}
              onPress={() => setSelectedPro(pro)}
            >
              <Text style={[styles.proName, selectedPro.id === pro.id && styles.proNameActive]}>
                {pro.player_name}
              </Text>
              <Text style={[styles.proSpeed, selectedPro.id === pro.id && styles.proSpeedActive]}>
                {pro.smash_speed_kmh} km/h
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <Skeleton height={200} borderRadius={20} style={{ marginBottom: 16 }} />
            <Skeleton height={100} borderRadius={16} style={{ marginBottom: 10 }} />
            <Skeleton height={100} borderRadius={16} style={{ marginBottom: 10 }} />
          </View>
        ) : (
          <>
            {/* Radar Chart */}
            <Card variant="surface" style={styles.radarCard}>
              <Text style={styles.cardTitle}>SKILL RADAR</Text>
              <RadarIcon />
              <View style={styles.radarLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.accent_green }]} />
                  <Text style={styles.legendText}>You</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.accent_amber }]} />
                  <Text style={styles.legendText}>{selectedPro.player_name}</Text>
                </View>
              </View>
            </Card>

            {/* Stroke Comparisons */}
            <Text style={styles.sectionTitle}>PER-STROKE COMPARISON</Text>
            {MOCK_COMPARISON.stroke_comparisons.map((comp) => (
              <Card key={comp.stroke_type} variant="surface" style={styles.compCard}>
                <View style={styles.compHeader}>
                  <Badge label={comp.stroke_type.charAt(0).toUpperCase() + comp.stroke_type.slice(1)} type={comp.stroke_type} size="md" />
                  <Text style={styles.compGap}>{comp.gap_score}% match</Text>
                </View>
                <View style={styles.compRow}>
                  <Text style={styles.compLabel}>Speed</Text>
                  <View style={styles.compTrack}>
                    <View style={[styles.compBarYou, { width: `${(comp.your_speed / comp.pro_speed) * 100}%` }]} />
                  </View>
                  <Text style={styles.compValue}>{comp.your_speed}</Text>
                  <Text style={styles.compProValue}>{comp.pro_speed}</Text>
                </View>
                <View style={styles.compRow}>
                  <Text style={styles.compLabel}>Elbow</Text>
                  <View style={styles.compTrack}>
                    <View style={[styles.compBarPro, { width: `${(comp.your_elbow_angle / comp.pro_elbow_angle) * 100}%` }]} />
                  </View>
                  <Text style={styles.compValue}>{comp.your_elbow_angle}°</Text>
                  <Text style={styles.compProValue}>{comp.pro_elbow_angle}°</Text>
                </View>
              </Card>
            ))}

            {/* AI Tip */}
            <Card variant="surface" style={styles.tipCard}>
              <Text style={styles.cardTitle}>COACH TIP</Text>
              {tipLoading ? (
                <View style={{ marginTop: 8 }}>
                  <Skeleton height={20} borderRadius={4} style={{ marginBottom: 6 }} />
                  <Skeleton height={20} borderRadius={4} style={{ width: "60%" }} />
                </View>
              ) : (
                <Text style={styles.tipText}>{aiTip || "Loading coaching insight..."}</Text>
              )}
            </Card>

            {/* CTA */}
            <TouchableOpacity style={styles.goalCta}>
              <Text style={styles.goalCtaText}>Set Training Goal →</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg_primary },
  scroll: { paddingTop: 60 },
  header: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  title: { fontSize: 28, fontWeight: "800", color: Colors.text_primary },
  subtitle: { fontSize: 13, color: Colors.text_secondary, marginTop: 2, fontWeight: "500" },
  proRow: { paddingLeft: Spacing.lg, marginBottom: Spacing.lg, maxHeight: 80 },
  proCard: {
    backgroundColor: Colors.bg_surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    minWidth: 160,
    justifyContent: "center",
    gap: 4,
  },
  proCardActive: { borderColor: Colors.accent_green, backgroundColor: "rgba(0,255,135,0.05)" },
  proName: { fontSize: 14, fontWeight: "700", color: Colors.text_primary },
  proNameActive: { color: Colors.accent_green },
  proSpeed: { fontSize: 12, fontWeight: "600", color: Colors.text_secondary },
  proSpeedActive: { color: Colors.accent_green },
  radarCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, padding: Spacing.md },
  cardTitle: { fontSize: 10, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 2, marginBottom: Spacing.md },
  radarPlaceholder: { height: 180, alignItems: "center", justifyContent: "center", position: "relative" },
  radarAxis: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  radarLabel: { fontSize: 8, fontWeight: "700", color: Colors.text_secondary },
  radarDot: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent_green },
  radarCenter: { position: "absolute", top: "50%", left: "50%", transform: [{ translateX: -30 }, { translateY: -30 }], width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(0,255,135,0.06)", alignItems: "center", justifyContent: "center" },
  radarScore: { fontSize: 18, fontWeight: "800", color: Colors.accent_green },
  radarScoreLabel: { fontSize: 7, fontWeight: "600", color: Colors.text_secondary },
  radarLegend: { flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: "600", color: Colors.text_secondary },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 2, marginBottom: Spacing.md, marginHorizontal: Spacing.lg },
  compCard: { marginHorizontal: Spacing.lg, marginBottom: 10, padding: Spacing.md },
  compHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  compGap: { fontSize: 12, fontWeight: "700", color: Colors.accent_amber },
  compRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  compLabel: { width: 50, fontSize: 11, fontWeight: "600", color: Colors.text_secondary },
  compTrack: { flex: 1, height: 6, backgroundColor: Colors.bg_elevated, borderRadius: 3, overflow: "hidden" },
  compBarYou: { height: "100%", backgroundColor: Colors.accent_green, borderRadius: 3 },
  compBarPro: { height: "100%", backgroundColor: Colors.accent_amber, borderRadius: 3, opacity: 0.4 },
  compValue: { width: 40, fontSize: 10, fontWeight: "700", color: Colors.text_primary, textAlign: "right", fontVariant: ["tabular-nums"] },
  compProValue: { width: 40, fontSize: 10, fontWeight: "600", color: Colors.text_secondary, textAlign: "right", fontVariant: ["tabular-nums"] },
  tipCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, padding: Spacing.md },
  tipText: { fontSize: 14, fontWeight: "500", color: Colors.text_secondary, lineHeight: 22 },
  goalCta: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.accent_green,
    borderRadius: Radius.lg,
    padding: 18,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  goalCtaText: { fontSize: 15, fontWeight: "800", color: Colors.bg_primary, letterSpacing: 1 },
})
