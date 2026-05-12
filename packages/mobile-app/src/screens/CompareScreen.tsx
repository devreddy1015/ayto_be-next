import React, { useState } from "react"
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

const strokes = ["Smash", "Clear", "Net"]

const comparisons = {
  Smash: [
    { label: "Elbow extension", you: 78, pro: 91 },
    { label: "Hip rotation", you: 64, pro: 86 },
    { label: "Wrist snap", you: 71, pro: 93 },
  ],
  Clear: [
    { label: "Contact height", you: 82, pro: 90 },
    { label: "Shoulder line", you: 69, pro: 84 },
    { label: "Recovery step", you: 76, pro: 88 },
  ],
  Net: [
    { label: "Lunge depth", you: 84, pro: 89 },
    { label: "Racket face", you: 73, pro: 86 },
    { label: "Balance return", you: 67, pro: 85 },
  ],
}

export default function CompareScreen({ navigation }: any) {
  const [selected, setSelected] = useState<keyof typeof comparisons>("Smash")
  const metrics = comparisons[selected]

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{"<"}</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>Biomechanics</Text>
            <Text style={styles.title}>Compare pro</Text>
          </View>
        </View>

        <View style={styles.segment}>
          {strokes.map((stroke) => (
            <TouchableOpacity
              key={stroke}
              style={[styles.segmentItem, selected === stroke && styles.segmentItemActive]}
              onPress={() => setSelected(stroke as keyof typeof comparisons)}
            >
              <Text style={[styles.segmentText, selected === stroke && styles.segmentTextActive]}>
                {stroke}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.hero}>
          <View>
            <Text style={styles.heroLabel}>Similarity score</Text>
            <Text style={styles.heroValue}>{selected === "Smash" ? 76 : selected === "Clear" ? 81 : 79}</Text>
            <Text style={styles.heroUnit}>vs elite reference</Text>
          </View>
          <View style={styles.poseFigure}>
            <View style={styles.head} />
            <View style={styles.torso} />
            <View style={styles.armLeft} />
            <View style={styles.armRight} />
            <View style={styles.legLeft} />
            <View style={styles.legRight} />
          </View>
        </View>

        {metrics.map((metric) => (
          <View key={metric.label} style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricTitle}>{metric.label}</Text>
              <Text style={styles.metricGap}>{metric.pro - metric.you} pt gap</Text>
            </View>
            <View style={styles.trackGroup}>
              <Text style={styles.trackLabel}>You</Text>
              <View style={styles.track}>
                <View style={[styles.youFill, { width: `${metric.you}%` }]} />
              </View>
              <Text style={styles.trackScore}>{metric.you}</Text>
            </View>
            <View style={styles.trackGroup}>
              <Text style={styles.trackLabel}>Pro</Text>
              <View style={styles.track}>
                <View style={[styles.proFill, { width: `${metric.pro}%` }]} />
              </View>
              <Text style={styles.trackScore}>{metric.pro}</Text>
            </View>
          </View>
        ))}

        <View style={styles.feedbackCard}>
          <Text style={styles.feedbackTitle}>Coach note</Text>
          <Text style={styles.feedbackText}>
            Drive the shoulder first, then let the wrist accelerate through contact. Your timing is close; the biggest gain is in the final third of the swing.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#10110f" },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
  },
  backText: { color: "#f4f1e8", fontSize: 24, fontWeight: "900" },
  kicker: { color: "#9fa89c", fontSize: 12, fontWeight: "700" },
  title: { color: "#f4f1e8", fontSize: 29, fontWeight: "900", marginTop: 2 },
  segment: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#181b17",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#30382d",
    padding: 6,
    marginBottom: 12,
  },
  segmentItem: { flex: 1, borderRadius: 6, paddingVertical: 11, alignItems: "center" },
  segmentItemActive: { backgroundColor: "#cffc46" },
  segmentText: { color: "#9fa89c", fontWeight: "900" },
  segmentTextActive: { color: "#10110f" },
  hero: {
    minHeight: 190,
    borderRadius: 8,
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroLabel: { color: "#9fa89c", fontSize: 13, fontWeight: "800" },
  heroValue: { color: "#cffc46", fontSize: 72, fontWeight: "900", lineHeight: 78 },
  heroUnit: { color: "#f4f1e8", fontSize: 13, fontWeight: "900" },
  poseFigure: { width: 122, height: 152, position: "relative" },
  head: {
    position: "absolute",
    top: 4,
    left: 52,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f4f1e8",
  },
  torso: {
    position: "absolute",
    top: 30,
    left: 58,
    width: 8,
    height: 62,
    borderRadius: 4,
    backgroundColor: "#39d6d0",
    transform: [{ rotate: "-14deg" }],
  },
  armLeft: {
    position: "absolute",
    top: 34,
    left: 20,
    width: 58,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff7a45",
    transform: [{ rotate: "-28deg" }],
  },
  armRight: {
    position: "absolute",
    top: 36,
    right: 10,
    width: 62,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#cffc46",
    transform: [{ rotate: "-46deg" }],
  },
  legLeft: {
    position: "absolute",
    top: 86,
    left: 34,
    width: 54,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#39d6d0",
    transform: [{ rotate: "52deg" }],
  },
  legRight: {
    position: "absolute",
    top: 88,
    right: 20,
    width: 58,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff7a45",
    transform: [{ rotate: "-44deg" }],
  },
  metricCard: {
    borderRadius: 8,
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
    padding: 16,
    marginBottom: 12,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  metricTitle: { color: "#f4f1e8", fontSize: 16, fontWeight: "900" },
  metricGap: { color: "#ff7a45", fontSize: 12, fontWeight: "900" },
  trackGroup: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  trackLabel: { color: "#9fa89c", width: 30, fontSize: 12, fontWeight: "900" },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#272d25",
  },
  youFill: { height: "100%", borderRadius: 5, backgroundColor: "#39d6d0" },
  proFill: { height: "100%", borderRadius: 5, backgroundColor: "#cffc46" },
  trackScore: { color: "#f4f1e8", width: 24, textAlign: "right", fontWeight: "900" },
  feedbackCard: {
    borderRadius: 8,
    backgroundColor: "#cffc46",
    padding: 16,
  },
  feedbackTitle: { color: "#10110f", fontSize: 18, fontWeight: "900" },
  feedbackText: { color: "#202412", fontSize: 14, lineHeight: 21, marginTop: 8, fontWeight: "700" },
})
