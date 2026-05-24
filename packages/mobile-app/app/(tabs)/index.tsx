import React, { useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  RefreshControl,
} from "react-native"
import { router } from "expo-router"
import { Colors, Typography, Spacing } from "../../src/theme"
import { useUserStore } from "../../src/store/userStore"
import { RECENT_SESSIONS, WEEKLY_SPEEDS, DUMMY_SESSION } from "../../src/data/dummyData"
import SessionCard from "../../src/components/session/SessionCard"
import MetricCard from "../../src/components/session/MetricCard"
import Badge from "../../src/components/ui/Badge"
import Skeleton from "../../src/components/ui/Skeleton"
import type { StrokeType } from "../../src/types"

const { width } = Dimensions.get("window")

export default function HomeScreen() {
  const { profile } = useUserStore()
  const firstName = profile?.name?.split(" ")[0] || "Athlete"
  const pulseAnim = useRef(new Animated.Value(1)).current
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    ).start()

    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1500)
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    return "Good evening"
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent_green}
            colors={[Colors.accent_green]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {getGreeting()}, {firstName}
            </Text>
            <Text style={styles.subtitle}>Ready to train?</Text>
          </View>
          <TouchableOpacity style={styles.avatar}>
            <Text style={styles.avatarText}>
              {firstName.charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hero Stat */}
        {loading ? (
          <View style={styles.skeletonHero}>
            <Skeleton height={120} borderRadius={16} />
          </View>
        ) : (
          <View style={styles.heroCard}>
            <View style={styles.heroGradient}>
              <View>
                <Text style={styles.heroLabel}>LAST SESSION MAX</Text>
                <Text style={styles.heroValue}>{DUMMY_SESSION.maxSpeed}</Text>
                <Text style={styles.heroUnit}>km/h</Text>
              </View>
              <View style={styles.heroRight}>
                <Text style={styles.heroAvg}>Avg {DUMMY_SESSION.avgSpeed}</Text>
                <View style={styles.comparisonBadge}>
                  <Text style={styles.comparisonArrow}>▲</Text>
                  <Text style={styles.comparisonText}>12% vs prev</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickActions}
          contentContainerStyle={styles.quickActionsContent}
        >
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push("/record")}
            activeOpacity={0.8}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <View style={styles.quickActionIcon}>
                <Text style={styles.quickActionEmoji}>⦿</Text>
              </View>
            </Animated.View>
            <Text style={styles.quickActionLabel}>Record Now</Text>
          </TouchableOpacity>

          {["Upload Video", "Compare Pro", "Drills"].map((action) => (
            <TouchableOpacity
              key={action}
              style={styles.quickAction}
              onPress={() => {
                if (action === "Compare Pro") router.push("/compare")
                else if (action === "Drills") router.push("/drills")
              }}
              activeOpacity={0.8}
            >
              <View style={styles.quickActionIconSecondary}>
                <Text style={styles.quickActionEmoji}>
                  {action === "Upload Video" ? "↑" : action === "Compare Pro" ? "◈" : "◎"}
                </Text>
              </View>
              <Text style={styles.quickActionLabel}>{action}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Progress Section */}
        <Text style={styles.sectionTitle}>YOUR PROGRESS</Text>
        <View style={styles.chartPlaceholder}>
          {WEEKLY_SPEEDS.map((item, i) => {
            const maxSpeed = 300
            const barHeight = (item.speed / maxSpeed) * 100
            return (
              <View key={item.day} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  {loading ? (
                    <Skeleton width={22} height={barHeight} style={styles.bar} />
                  ) : (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: item.speed > 270 ? Colors.accent_amber : Colors.accent_green,
                          opacity: item.speed > 270 ? 1 : 0.7,
                        },
                      ]}
                    />
                  )}
                </View>
                <Text style={styles.dayLabel}>{item.day}</Text>
              </View>
            )
          })}
        </View>

        {/* Recent Sessions */}
        <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
        {loading
          ? [1, 2, 3].map((i) => (
              <Skeleton key={i} height={80} style={{ marginBottom: 10 }} borderRadius={16} />
            ))
          : RECENT_SESSIONS.map((session, idx) => (
              <SessionCard
                key={session.id}
                id={session.id}
                date={session.date}
                duration={session.duration}
                strokes={session.strokes}
                maxSpeed={session.maxSpeed}
                sport="badminton"
                dominantStroke={idx === 0 ? "smash" : idx === 1 ? "clear" : "drop"}
                onPress={() => router.push(`/session/${session.id}`)}
              />
            ))}

        {/* Drill Recommendation */}
        <View style={[styles.drillCard]}>
          <View style={styles.drillGlow}>
            <View style={styles.drillContent}>
              <Text style={styles.drillEmoji}>🏸</Text>
              <View style={styles.drillInfo}>
                <Text style={styles.drillTitle}>Recommended Drill</Text>
                <Text style={styles.drillDesc}>
                  Smash Accuracy: Target practice with precision cones
                </Text>
                <View style={styles.drillMeta}>
                  <Badge label="Smash" type="smash" size="sm" />
                  <Text style={styles.drillDuration}>15 min</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.drillButton}
                onPress={() => router.push("/drills")}
              >
                <Text style={styles.drillButtonText}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
  },
  scroll: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.text_primary,
    marginTop: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,255,135,0.12)",
    borderWidth: 1.5,
    borderColor: Colors.accent_green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.accent_green,
  },
  skeletonHero: {
    marginBottom: Spacing.lg,
  },
  heroCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  heroGradient: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: 24,
    backgroundColor: Colors.bg_elevated,
    borderWidth: 1,
    borderColor: "rgba(0,255,135,0.12)",
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 56,
    fontWeight: "800",
    color: Colors.accent_green,
    fontVariant: ["tabular-nums"],
    lineHeight: 60,
  },
  heroUnit: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 2,
    marginTop: -2,
  },
  heroRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  heroAvg: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  comparisonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,255,135,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comparisonArrow: {
    fontSize: 10,
    color: Colors.accent_green,
  },
  comparisonText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.accent_green,
  },
  quickActions: {
    marginBottom: Spacing.xl,
  },
  quickActionsContent: {
    gap: 12,
    paddingRight: Spacing.lg,
  },
  quickAction: {
    alignItems: "center",
    gap: 8,
    width: 80,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: Colors.accent_green,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionIconSecondary: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: Colors.bg_surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionEmoji: {
    fontSize: 22,
    color: Colors.bg_primary,
  },
  quickActionLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.text_secondary,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 2,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  chartPlaceholder: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 120,
    backgroundColor: Colors.bg_surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: Spacing.xl,
  },
  barContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  barWrapper: {
    justifyContent: "flex-end",
    height: "90%",
    alignItems: "center",
  },
  bar: {
    width: 22,
    borderRadius: 6,
  },
  dayLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Colors.text_secondary,
    marginTop: 6,
    textTransform: "uppercase",
  },
  drillCard: {
    marginTop: Spacing.md,
    borderRadius: 16,
    overflow: "hidden",
  },
  drillGlow: {
    backgroundColor: Colors.bg_surface,
    borderWidth: 1,
    borderColor: "rgba(0,255,135,0.12)",
    borderRadius: 16,
  },
  drillContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  drillEmoji: {
    fontSize: 28,
  },
  drillInfo: {
    flex: 1,
    gap: 4,
  },
  drillTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text_primary,
  },
  drillDesc: {
    fontSize: 12,
    color: Colors.text_secondary,
    lineHeight: 18,
  },
  drillMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  drillDuration: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  drillButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent_green,
    alignItems: "center",
    justifyContent: "center",
  },
  drillButtonText: {
    fontSize: 16,
    color: Colors.bg_primary,
    fontWeight: "700",
  },
})
