import React, { useState, useMemo } from "react"
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native"
import { router } from "expo-router"
import { Colors, Spacing, Radius } from "../../src/theme"
import SessionCard from "../../src/components/session/SessionCard"
import Skeleton from "../../src/components/ui/Skeleton"
import type { StrokeType, SessionSummary } from "../../src/types"

const MOCK_SESSIONS: SessionSummary[] = [
  { id: "1", user_id: "", sport: "badminton", duration_seconds: 1680, total_frames: 42000, model_version: "v1", created_at: "2025-05-25", max_speed_kmh: 287, avg_speed_kmh: 198, strokes_count: 47, dominant_stroke: "smash", metrics: null },
  { id: "2", user_id: "", sport: "badminton", duration_seconds: 2100, total_frames: 52500, model_version: "v1", created_at: "2025-05-24", max_speed_kmh: 264, avg_speed_kmh: 185, strokes_count: 36, dominant_stroke: "clear", metrics: null },
  { id: "3", user_id: "", sport: "badminton", duration_seconds: 1080, total_frames: 27000, model_version: "v1", created_at: "2025-05-23", max_speed_kmh: 251, avg_speed_kmh: 172, strokes_count: 28, dominant_stroke: "drop", metrics: null },
  { id: "4", user_id: "", sport: "badminton", duration_seconds: 2400, total_frames: 60000, model_version: "v1", created_at: "2025-05-20", max_speed_kmh: 238, avg_speed_kmh: 165, strokes_count: 52, dominant_stroke: "smash", metrics: null },
  { id: "5", user_id: "", sport: "badminton", duration_seconds: 900, total_frames: 22500, model_version: "v1", created_at: "2025-05-18", max_speed_kmh: 221, avg_speed_kmh: 155, strokes_count: 22, dominant_stroke: "defensive", metrics: null },
]

const SPORTS = ["All", "Badminton", "Tennis", "Table Tennis"]
const SORT_OPTIONS = ["Recent", "Highest Speed", "Longest"]

export default function HistoryScreen() {
  const [selectedSport, setSelectedSport] = useState("All")
  const [selectedSort, setSelectedSort] = useState("Recent")
  const [loading, setLoading] = useState(true)

  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  const totalSessions = MOCK_SESSIONS.length
  const avgSpeed = Math.round(MOCK_SESSIONS.reduce((s, ss) => s + ss.avg_speed_kmh, 0) / totalSessions)
  const bestSpeed = Math.max(...MOCK_SESSIONS.map((s) => s.max_speed_kmh))
  const totalStrokes = MOCK_SESSIONS.reduce((s, ss) => s + ss.strokes_count, 0)

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>Your training archive</Text>
      </View>

      {/* Aggregate Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalSessions}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{avgSpeed}</Text>
          <Text style={styles.statLabel}>Avg km/h</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.accent_amber }]}>{bestSpeed}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalStrokes}</Text>
          <Text style={styles.statLabel}>Strokes</Text>
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8 }}>
        {SPORTS.map((sport) => (
          <TouchableOpacity
            key={sport}
            style={[styles.filterPill, selectedSport === sport && styles.filterPillActive]}
            onPress={() => setSelectedSport(sport)}
          >
            <Text style={[styles.filterText, selectedSport === sport && styles.filterTextActive]}>
              {sport}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterDivider} />
        {SORT_OPTIONS.map((sort) => (
          <TouchableOpacity
            key={sort}
            style={[styles.filterPill, selectedSort === sort && styles.filterPillActive]}
            onPress={() => setSelectedSort(sort)}
          >
            <Text style={[styles.filterText, selectedSort === sort && styles.filterTextActive]}>
              {sort}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Session List */}
      {loading ? (
        <View style={{ paddingHorizontal: Spacing.lg }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={90} borderRadius={16} style={{ marginBottom: 10 }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={MOCK_SESSIONS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionCard
              id={item.id}
              date={new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              duration={formatDuration(item.duration_seconds)}
              strokes={item.strokes_count}
              maxSpeed={item.max_speed_kmh}
              sport={item.sport}
              dominantStroke={item.dominant_stroke}
              onPress={() => router.push(`/session/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text_primary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.text_secondary,
    marginTop: 2,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: 8,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bg_surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text_primary,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.text_secondary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  filterRow: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    maxHeight: 40,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg_surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: Colors.accent_green,
    borderColor: Colors.accent_green,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  filterTextActive: {
    color: Colors.bg_primary,
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
    alignSelf: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
  },
})
