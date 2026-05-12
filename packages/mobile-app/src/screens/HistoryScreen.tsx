import React from "react"
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

const history = [
  {
    id: "S-1042",
    date: "Today",
    title: "Evening singles",
    duration: "8:42",
    maxSpeed: 287,
    strokes: 47,
    read: 94,
    bars: [44, 72, 63, 92, 58, 81],
  },
  {
    id: "S-1039",
    date: "Yesterday",
    title: "Backhand drill",
    duration: "6:15",
    maxSpeed: 241,
    strokes: 36,
    read: 91,
    bars: [36, 54, 48, 66, 71, 59],
  },
  {
    id: "S-1032",
    date: "May 10",
    title: "Match simulation",
    duration: "10:00",
    maxSpeed: 268,
    strokes: 62,
    read: 89,
    bars: [52, 80, 70, 86, 64, 75],
  },
]

export default function HistoryScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{"<"}</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>Session archive</Text>
            <Text style={styles.title}>Training history</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>145</Text>
          <Text style={styles.summaryLabel}>tracked strokes this week</Text>
          <View style={styles.summaryLine}>
            <View style={styles.summaryFill} />
          </View>
        </View>

        {history.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={styles.sessionCard}
            onPress={() => navigation.navigate("Dashboard")}
          >
            <View style={styles.sessionTop}>
              <View>
                <Text style={styles.sessionDate}>{session.date}</Text>
                <Text style={styles.sessionTitle}>{session.title}</Text>
              </View>
              <Text style={styles.sessionId}>{session.id}</Text>
            </View>

            <View style={styles.sparkline}>
              {session.bars.map((bar, index) => (
                <View key={`${session.id}-${index}`} style={styles.sparkColumn}>
                  <View style={[styles.sparkBar, { height: `${bar}%` }]} />
                </View>
              ))}
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{session.duration}</Text>
                <Text style={styles.metricLabel}>Duration</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{session.maxSpeed}</Text>
                <Text style={styles.metricLabel}>Max km/h</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{session.strokes}</Text>
                <Text style={styles.metricLabel}>Strokes</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{session.read}%</Text>
                <Text style={styles.metricLabel}>Read</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
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
  summaryCard: {
    borderRadius: 8,
    backgroundColor: "#cffc46",
    padding: 18,
    marginBottom: 12,
  },
  summaryValue: { color: "#10110f", fontSize: 56, fontWeight: "900", lineHeight: 62 },
  summaryLabel: { color: "#202412", fontSize: 14, fontWeight: "900" },
  summaryLine: {
    height: 8,
    backgroundColor: "rgba(16,17,15,0.2)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 16,
  },
  summaryFill: { width: "78%", height: "100%", backgroundColor: "#10110f" },
  sessionCard: {
    borderRadius: 8,
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
    padding: 16,
    marginBottom: 12,
  },
  sessionTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  sessionDate: { color: "#9fa89c", fontSize: 12, fontWeight: "800" },
  sessionTitle: { color: "#f4f1e8", fontSize: 18, fontWeight: "900", marginTop: 2 },
  sessionId: { color: "#cffc46", fontSize: 12, fontWeight: "900" },
  sparkline: {
    height: 62,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    marginBottom: 14,
  },
  sparkColumn: { flex: 1, height: "100%", justifyContent: "flex-end" },
  sparkBar: { backgroundColor: "#39d6d0", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  metricRow: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#22271f",
    padding: 10,
  },
  metricValue: { color: "#f4f1e8", fontSize: 16, fontWeight: "900" },
  metricLabel: { color: "#9fa89c", fontSize: 10, fontWeight: "700", marginTop: 3 },
})
