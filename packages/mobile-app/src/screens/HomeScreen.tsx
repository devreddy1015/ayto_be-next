import React, { useEffect, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  ScrollView,
} from "react-native"
import SpeedGauge from "../components/SpeedGauge"
import { Colors, Glass, Spacing } from "../theme"
import { DUMMY_SESSION, RECENT_SESSIONS } from "../data/dummyData"

const { width } = Dimensions.get("window")

export default function HomeScreen({ navigation }: any) {
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start()
  }, [])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>SportIQ</Text>
            <Text style={styles.greeting}>
              Welcome back, {DUMMY_SESSION.playerName.split(" ")[0]}
            </Text>
          </View>
          <TouchableOpacity style={styles.avatar}>
            <Text style={styles.avatarText}>RD</Text>
          </TouchableOpacity>
        </View>

        {/* Speed Gauge */}
        <SpeedGauge speed={0} maxSpeed={DUMMY_SESSION.maxSpeed} />
        <Text style={styles.gaugeLabel}>READY TO RECORD</Text>
        <View style={styles.statusDot} />

        {/* Start Recording Button */}
        <Animated.View
          style={[
            styles.recordBtnWrapper,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.recordBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Camera")}
          >
            <View style={styles.recordBtnInner}>
              <Text style={styles.recordIcon}>⦿</Text>
              <Text style={styles.recordText}>START RECORDING</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Stat Cards Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, Glass.card]}>
            <Text style={styles.statValue}>3</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={[styles.statCard, Glass.card]}>
            <Text style={styles.statValue}>{DUMMY_SESSION.maxSpeed}</Text>
            <Text style={styles.statLabel}>Best Speed</Text>
          </View>
          <View style={[styles.statCard, Glass.card]}>
            <Text style={styles.statValue}>{DUMMY_SESSION.avgSpeed}</Text>
            <Text style={styles.statLabel}>Avg Speed</Text>
          </View>
        </View>

        {/* Recent Sessions */}
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        {RECENT_SESSIONS.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={[styles.sessionCard, Glass.card]}
            onPress={() => navigation.navigate("Results")}
          >
            <View style={styles.sessionRow}>
              <View>
                <Text style={styles.sessionDate}>{session.date}</Text>
                <Text style={styles.sessionMeta}>
                  {session.strokes} strokes · {session.duration}
                </Text>
              </View>
              <View style={styles.sessionSpeed}>
                <Text style={styles.sessionSpeedValue}>
                  {session.maxSpeed}
                </Text>
                <Text style={styles.sessionSpeedUnit}>km/h</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        {[
          { label: "Home", icon: "⌂", active: true },
          { label: "Record", icon: "⦿", active: false },
          { label: "History", icon: "☰", active: false },
          { label: "Profile", icon: "◉", active: false },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.navItem}
            onPress={() => {
              if (item.label === "Record") navigation.navigate("Camera")
              if (item.label === "History") navigation.navigate("Dashboard")
            }}
          >
            <Text
              style={[styles.navIcon, item.active && styles.navIconActive]}
            >
              {item.icon}
            </Text>
            <Text
              style={[styles.navLabel, item.active && styles.navLabelActive]}
            >
              {item.label}
            </Text>
            {item.active && <View style={styles.navIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xl,
  },
  logo: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 1,
  },
  greeting: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "500",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  gaugeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: 6,
    opacity: 0.6,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  recordBtnWrapper: {
    marginBottom: Spacing.xl,
    alignItems: "center",
  },
  recordBtn: {
    width: width - Spacing.lg * 2,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: Colors.primary,
  },
  recordBtnInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  recordIcon: {
    fontSize: 22,
    color: Colors.bg,
  },
  recordText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.bg,
    letterSpacing: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sessionCard: {
    marginBottom: 10,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionDate: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  sessionMeta: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  sessionSpeed: {
    alignItems: "flex-end",
  },
  sessionSpeedValue: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.primary,
  },
  sessionSpeedUnit: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(10,10,15,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingBottom: 30,
    paddingTop: 10,
    paddingHorizontal: Spacing.lg,
  },
  navItem: {
    alignItems: "center",
    paddingTop: 8,
    width: 60,
  },
  navIcon: {
    fontSize: 18,
    color: Colors.textTertiary,
  },
  navIconActive: {
    color: Colors.primary,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  navLabelActive: {
    color: Colors.primary,
  },
  navIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
})
