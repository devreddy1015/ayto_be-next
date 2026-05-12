import { Audio, Video, ResizeMode } from "expo-av"
import React, { useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native"
import { Colors, Glass, Spacing } from "../theme"

export default function ResultsScreen({ navigation, route }: any) {
  const { videoUri, duration } = route.params
  const videoRef = useRef<Video>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
  }, [])

  const mockSpeed = (): string => {
    const t = position
    const base = 180 + Math.sin(t * 1.8) * 60 + Math.sin(t * 3.2) * 40 + Math.random() * 20
    return Math.min(300, Math.max(60, base)).toFixed(0)
  }

  const strokeLabel = (): string | null => {
    const t = position
    if (t < 1) return null
    if (t % 8 < 0.4) return "SMASH"
    if (t % 12 > 3 && t % 12 < 3.4) return "CLEAR"
    if (t % 7 > 5 && t % 7 < 5.3) return "DROP"
    if (t % 5 > 4 && t % 5 < 4.2) return "NET"
    return null
  }

  const speed = mockSpeed()
  const stroke = strokeLabel()
  const isSpike = Number(speed) > 250

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.videoWrap}>
        <Video
          ref={videoRef}
          source={{ uri: videoUri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          onPlaybackStatusUpdate={(s: any) => {
            if (s.isLoaded) setPosition(s.positionMillis / 1000)
          }}
        />

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <View style={[styles.speedBadge, isSpike && styles.speedBadgeHot]}>
          <Text style={[styles.speedValue, isSpike && styles.speedValueHot]}>
            {speed}
          </Text>
          <Text style={[styles.speedUnit, isSpike && styles.speedUnitHot]}>
            KM/H
          </Text>
        </View>

        {stroke && (
          <View style={[styles.strokeBadge, stroke === "SMASH" && styles.strokeBadgeHot]}>
            <Text style={[styles.strokeText, stroke === "SMASH" && styles.strokeTextHot]}>
              {stroke}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.playBtn}
          onPress={async () => {
            if (playing) await videoRef.current?.pauseAsync()
            else await videoRef.current?.playAsync()
            setPlaying(!playing)
          }}
        >
          <Text style={styles.playIcon}>{playing ? "⏸" : "▶"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{duration}s</Text>
          <Text style={styles.metricLabel}>Duration</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{speed}</Text>
          <Text style={styles.metricLabel}>Current</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricValue}>287</Text>
          <Text style={styles.metricLabel}>Max</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.dashboardBtn}
        onPress={() => navigation.navigate("Dashboard")}
        activeOpacity={0.85}
      >
        <Text style={styles.dashboardBtnText}>VIEW FULL ANALYSIS</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  videoWrap: { flex: 1, position: "relative", backgroundColor: "#000" },
  video: { flex: 1 },
  backBtn: {
    position: "absolute",
    top: 56,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: "#fff", fontSize: 20, fontWeight: "300" },
  speedBadge: {
    position: "absolute",
    top: 80,
    right: 16,
    backgroundColor: "rgba(10,10,15,0.85)",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,245,160,0.3)",
  },
  speedBadgeHot: {
    borderColor: "rgba(255,61,90,0.4)",
    backgroundColor: "rgba(255,61,90,0.1)",
  },
  speedValue: {
    fontSize: 34,
    fontWeight: "800",
    color: Colors.primary,
    fontVariant: ["tabular-nums"],
  },
  speedValueHot: { color: Colors.accent },
  speedUnit: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(0,245,160,0.6)",
    letterSpacing: 2,
    marginTop: -2,
  },
  speedUnitHot: { color: "rgba(255,61,90,0.6)" },
  strokeBadge: {
    position: "absolute",
    bottom: 30,
    left: 16,
    backgroundColor: "rgba(0,245,160,0.9)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  strokeBadgeHot: { backgroundColor: "rgba(255,61,90,0.9)" },
  strokeText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.bg,
    letterSpacing: 2,
  },
  strokeTextHot: { color: "#fff" },
  controls: {
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: { fontSize: 20, color: Colors.bg },
  metricsRow: {
    flexDirection: "row",
    paddingVertical: 18,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(255,255,255,0.02)",
    justifyContent: "space-around",
  },
  metric: { alignItems: "center", flex: 1 },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    fontVariant: ["tabular-nums"],
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginTop: 3,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  divider: {
    width: 1,
    height: "60%",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignSelf: "center",
  },
  dashboardBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 18,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.lg,
    alignItems: "center",
  },
  dashboardBtnText: {
    color: Colors.bg,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
  },
})
