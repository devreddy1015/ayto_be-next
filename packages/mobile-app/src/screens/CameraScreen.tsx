import { CameraView, useCameraPermissions } from "expo-camera"
import React, { useRef, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
} from "react-native"
import { Colors } from "../theme"

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, "0")}`
}

export default function CameraScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions()
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const cameraRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  if (!permission) return <View style={styles.container} />

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <Text style={styles.permIcon}>📷</Text>
        <Text style={styles.permTitle}>Camera Access</Text>
        <Text style={styles.permDesc}>
          SportIQ needs your camera to analyze your gameplay in real time.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>GRANT PERMISSION</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const toggleRecording = async () => {
    if (recording) {
      setRecording(false)
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      try {
        const video = await cameraRef.current?.recordAsync?.({ maxDuration: 600, quality: "720p" })
        if (video) navigation.navigate("Results", { videoUri: video.uri, duration: elapsed })
      } catch (e: any) {
        Alert.alert("Failed", e.message)
      }
    } else {
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000)
      cameraRef.current?.recordAsync?.({ maxDuration: 600, quality: "720p" })
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="video" videoQuality="720p" />

      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          {recording && (
            <View style={styles.recChip}>
              <View style={styles.recDot} />
              <Text style={styles.timer}>{formatTime(elapsed)}</Text>
            </View>
          )}

          <View style={styles.topSpacer} />
        </View>

        <View style={styles.bottomControls}>
          <TouchableOpacity onPress={toggleRecording} activeOpacity={0.8}>
            <View style={[styles.recordOuter, recording && styles.recordOuterActive]}>
              <View style={[styles.recordInner, recording && styles.recordInnerActive]} />
            </View>
          </TouchableOpacity>

          <Text style={styles.hint}>
            {recording ? "TAP TO STOP" : "TAP TO RECORD"}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center", padding: 40 },
  permIcon: { fontSize: 48, marginBottom: 16 },
  permTitle: { fontSize: 22, fontWeight: "800", color: Colors.text, marginBottom: 8 },
  permDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginBottom: 32, lineHeight: 22 },
  permBtn: { backgroundColor: Colors.primary, borderRadius: 28, paddingHorizontal: 32, paddingVertical: 16 },
  permBtnText: { fontSize: 14, fontWeight: "800", color: Colors.bg, letterSpacing: 2 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: "#fff", fontSize: 18, fontWeight: "300" },
  recChip: {
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
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  timer: { color: Colors.accent, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  topSpacer: { width: 40 },
  bottomControls: { alignItems: "center", paddingBottom: 50 },
  recordOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  recordOuterActive: { borderColor: Colors.accent, borderWidth: 4 },
  recordInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.accent,
  },
  recordInnerActive: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  hint: {
    marginTop: 14,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 3,
  },
})
