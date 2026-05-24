import { CameraView, useCameraPermissions } from "expo-camera"
import React, { useRef, useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Animated,
} from "react-native"
import * as Haptics from "expo-haptics"
import { router } from "expo-router"
import { Colors, Spacing, Radius } from "../../src/theme"
import { useSessionStore } from "../../src/store/sessionStore"
import { useUserStore } from "../../src/store/userStore"

const { width, height } = Dimensions.get("window")

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, "0")}`
}

export default function RecordScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [countdown, setCountdown] = useState<number | null>(null)
  const cameraRef = useRef<CameraView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    recordingState,
    setRecordingState,
    elapsedSeconds,
    incrementElapsed,
    resetElapsed,
    resetSession,
  } = useSessionStore()

  const { overlaySettings } = useUserStore()
  const countdownScale = useRef(new Animated.Value(1)).current
  const countdownOpacity = useRef(new Animated.Value(1)).current

  const [showHUD, setShowHUD] = useState(true)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [])

  const startCountdown = useCallback(() => {
    let count = 3
    setCountdown(count)
    setRecordingState("countdown")

    Haptics.impactAsync("heavy" as any)

    countdownTimerRef.current = setInterval(() => {
      count--
      if (count > 0) {
        setCountdown(count)
        Animated.sequence([
          Animated.timing(countdownScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
          Animated.timing(countdownScale, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start()
      } else {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        setCountdown(null)
        startRecording()
      }
    }, 1000)
  }, [])

  const startRecording = () => {
    setRecordingState("recording")
    resetElapsed()
    timerRef.current = setInterval(() => {
      incrementElapsed()
    }, 1000)
    Haptics.impactAsync("heavy" as any)
  }

  const pauseRecording = () => {
    if (recordingState === "recording") {
      setRecordingState("paused")
      if (timerRef.current) clearInterval(timerRef.current)
      Haptics.impactAsync("light" as any)
    } else if (recordingState === "paused") {
      setRecordingState("recording")
      timerRef.current = setInterval(() => {
        incrementElapsed()
      }, 1000)
    }
  }

  const endSession = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setRecordingState("processing")
    Haptics.notificationAsync("success" as any)
    router.push("/record/processing")
  }

  const handleBack = () => {
    if (recordingState === "recording" || recordingState === "paused") {
      pauseRecording()
    }
    resetSession()
    router.back()
  }

  if (!permission) return <View style={styles.container} />

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.permIcon}>📷</Text>
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permDesc}>
          Ayto needs your camera to analyze your gameplay in real time. All processing happens on-device.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>GRANT PERMISSION</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isRecording = recordingState === "recording"
  const isPaused = recordingState === "paused"
  const isIdle = recordingState === "idle"

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="video" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {(isRecording || isPaused) && (
          <View style={styles.recordingChip}>
            <View style={[styles.recDot, isPaused && styles.recDotPaused]} />
            <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.hudToggle}
          onPress={() => setShowHUD((prev) => !prev)}
        >
          <Text style={styles.hudToggleText}>{showHUD ? "HUD" : "OFF"}</Text>
        </TouchableOpacity>
      </View>

      {/* Speed Badge HUD */}
      {showHUD && overlaySettings.showSpeedBadge && (isRecording || isPaused) && (
        <View style={styles.speedBadge}>
          <Text style={styles.speedValue}>
            {Math.floor(180 + Math.random() * 120)}
          </Text>
          <Text style={styles.speedUnit}>KM/H</Text>
        </View>
      )}

      {/* Stroke Label HUD */}
      {showHUD && overlaySettings.showStrokeLabel && (isRecording || isPaused) && (
        <View style={styles.strokeLabel}>
          <Text style={styles.strokeText}>SMASH</Text>
        </View>
      )}

      {/* Countdown Overlay */}
      {countdown !== null && (
        <View style={styles.countdownOverlay}>
          <Animated.Text
            style={[
              styles.countdownText,
              { transform: [{ scale: countdownScale }], opacity: countdownOpacity },
            ]}
          >
            {countdown}
          </Animated.Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        {isIdle ? (
          <TouchableOpacity
            style={styles.recordButton}
            onPress={startCountdown}
            activeOpacity={0.8}
          >
            <View style={styles.recordInner} />
          </TouchableOpacity>
        ) : (
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlButton, styles.pauseButton]}
              onPress={pauseRecording}
            >
              <Text style={styles.controlIcon}>{isPaused ? "▶" : "⏸"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.endButton]}
              onPress={endSession}
            >
              <View style={styles.endButtonInner} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.hint}>
          {isIdle ? "TAP TO START" : isPaused ? "PAUSED" : "RECORDING"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  permissionScreen: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  permIcon: { fontSize: 48, marginBottom: 16 },
  permTitle: { fontSize: 22, fontWeight: "800", color: Colors.text_primary, marginBottom: 8 },
  permDesc: {
    fontSize: 14,
    color: Colors.text_secondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  permButton: {
    backgroundColor: Colors.accent_green,
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  permButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.bg_primary,
    letterSpacing: 2,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: "#fff", fontSize: 16, fontWeight: "300" },
  recordingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,61,90,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,61,90,0.3)",
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent_coral },
  recDotPaused: { backgroundColor: Colors.accent_amber },
  timer: { color: Colors.accent_coral, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] as any },
  hudToggle: {
    width: 44,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  hudToggleText: { color: "rgba(255,255,255,0.6)", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  speedBadge: {
    position: "absolute",
    top: 130,
    right: 16,
    backgroundColor: "rgba(10,10,15,0.85)",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,255,135,0.3)",
  },
  speedValue: { fontSize: 34, fontWeight: "800", color: Colors.accent_green, fontVariant: ["tabular-nums"] as any },
  speedUnit: { fontSize: 10, fontWeight: "700", color: "rgba(0,255,135,0.6)", letterSpacing: 2, marginTop: -2 },
  strokeLabel: {
    position: "absolute",
    bottom: 160,
    alignSelf: "center",
    backgroundColor: "rgba(0,255,135,0.9)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  strokeText: { fontSize: 12, fontWeight: "800", color: Colors.bg_primary, letterSpacing: 2 },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  countdownText: { fontSize: 96, fontWeight: "800", color: Colors.accent_green },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 50,
  },
  recordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.accent_coral },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginBottom: 12,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  endButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,107,107,0.15)",
    borderWidth: 3,
    borderColor: Colors.accent_coral,
    alignItems: "center",
    justifyContent: "center",
  },
  endButtonInner: { width: 28, height: 28, borderRadius: 6, backgroundColor: Colors.accent_coral },
  controlIcon: { fontSize: 20, color: Colors.text_primary },
  hint: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.4)", letterSpacing: 3 },
})
