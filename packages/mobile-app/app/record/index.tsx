import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as Haptics from "expo-haptics"
import { router } from "expo-router"
import { StatusBar } from "expo-status-bar"
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Plate } from "../../src/components/riso/Plate"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { BackButton } from "../../src/components/ui/BackButton"
import Button from "../../src/components/ui/Button"
import { Tag } from "../../src/components/ui/Tag"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { clock } from "../../src/lib/format"
import { LIVE_SPORT, STATUS_LABEL, strokeLabel, type RisoPalette, type Sport } from "../../src/sports"
import { useSessionStore } from "../../src/store/sessionStore"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Offset, Paper, Space, Type } from "../../src/theme"

const OVERLAY = "rgba(18,16,17,0.78)"

function haptic(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS !== "web") Haptics.impactAsync(style).catch(() => {})
}

export default function RecordScreen() {
  const sport = useSport()
  return sport.status === "live" ? <Recorder sport={sport} /> : <NotLive sport={sport} />
}

/** Honest blocker for sports without analysis: nothing to record into yet. */
function NotLive({ sport }: { sport: Sport }) {
  const insets = useSafeAreaInsets()
  const setSport = useUserStore((s) => s.setSportPreference)
  return (
    <Screen palette={sport.palette}>
      <View style={[styles.notLive, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.xl }]}>
        <BackButton />
        <View style={styles.notLiveBody}>
          <Text style={Type.kicker}>
            {sport.name} · {STATUS_LABEL[sport.status]}
          </Text>
          <SweepHeading lines={["Not", "yet."]} palette={sport.palette} size="hero" />
          <Text style={Type.body}>
            {sport.name} analysis isn't live, so there is nothing to record into yet. {sport.statusNote}
          </Text>
        </View>
        <Button label={`Record ${LIVE_SPORT.name} instead`} trailing="→" palette={sport.palette} full onPress={() => setSport(LIVE_SPORT.id)} />
      </View>
    </Screen>
  )
}

const Countdown = memo(function Countdown({ n, palette }: { n: number; palette: RisoPalette }) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(reduceMotion ? 1 : 1.35)
  useEffect(() => {
    if (!reduceMotion) scale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })
  }, [reduceMotion, scale])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={style}>
      <Plate color={palette.plate} shadow={palette.shadow} offset={Offset.lg} faceStyle={styles.countFace}>
        <Text style={[styles.countText, { color: palette.onPlate }]}>{n}</Text>
      </Plate>
    </Animated.View>
  )
})

/** Viewfinder corners: frame the play area, nothing drawn over the middle. */
const FramingGuide = memo(function FramingGuide({ label, color }: { label: string; color: string }) {
  return (
    <View pointerEvents="none" style={styles.guide}>
      <View style={styles.guideBox}>
        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
          <View key={corner} style={[styles.corner, styles[corner], { borderColor: color }]} />
        ))}
      </View>
      <Text style={[Type.kicker, styles.guideText]}>Fit the whole {label.toLowerCase()} in frame</Text>
    </View>
  )
})

function Recorder({ sport }: { sport: Sport }) {
  const insets = useSafeAreaInsets()
  const { palette } = sport
  const [permission, requestPermission] = useCameraPermissions()
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showHud, setShowHud] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingState = useSessionStore((s) => s.recordingState)
  const elapsed = useSessionStore((s) => s.elapsedSeconds)
  const hud = useSessionStore((s) => s.hud)
  const overlay = useUserStore((s) => s.overlaySettings)
  const { format, unit } = useSpeed()

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  // Leaving the screen (back, or on to processing) always clears timers and the session.
  useEffect(
    () => () => {
      stopTimer()
      useSessionStore.getState().resetSession()
    },
    [stopTimer],
  )

  const runClock = useCallback(() => {
    stopTimer()
    timer.current = setInterval(() => useSessionStore.getState().tick(), 1000)
  }, [stopTimer])

  const start = useCallback(() => {
    const { setRecordingState } = useSessionStore.getState()
    setRecordingState("countdown")
    haptic(Haptics.ImpactFeedbackStyle.Heavy)
    let n = 3
    setCountdown(n)
    stopTimer()
    timer.current = setInterval(() => {
      n -= 1
      if (n > 0) {
        setCountdown(n)
        return
      }
      setCountdown(null)
      setRecordingState("recording")
      runClock()
      haptic(Haptics.ImpactFeedbackStyle.Heavy)
    }, 1000)
  }, [runClock, stopTimer])

  const pauseResume = useCallback(() => {
    const { recordingState: state, setRecordingState } = useSessionStore.getState()
    if (state === "recording") {
      stopTimer()
      setRecordingState("paused")
      haptic(Haptics.ImpactFeedbackStyle.Light)
    } else if (state === "paused") {
      setRecordingState("recording")
      runClock()
    }
  }, [runClock, stopTimer])

  const finish = useCallback(() => {
    stopTimer()
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    router.replace("/record/processing")
  }, [stopTimer])

  if (!permission) return <View style={styles.camera} />

  if (!permission.granted) {
    return (
      <Screen palette={palette}>
        <View style={[styles.notLive, { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.xl }]}>
          <BackButton />
          <View style={styles.notLiveBody}>
            <Text style={Type.kicker}>Camera access</Text>
            <SweepHeading lines={["Camera,", "please."]} palette={palette} size="hero" />
            <Text style={Type.body}>
              Ayto watches the {sport.tracked} through your camera. All processing happens on-device.
            </Text>
          </View>
          <Button label="Allow camera" palette={palette} size="lg" full onPress={requestPermission} />
        </View>
      </Screen>
    )
  }

  const rolling = recordingState === "recording" || recordingState === "paused"
  const idle = recordingState === "idle"
  const paused = recordingState === "paused"

  return (
    <View style={styles.camera}>
      <StatusBar style="light" />
      <CameraView style={StyleSheet.absoluteFill} facing="back" mode="video" />

      {showHud && overlay.showFramingGuide && !rolling ? <FramingGuide label={sport.playArea.label} color={palette.plate} /> : null}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + Space.sm }]}>
        <BackButton glyph="✕" label="Close camera" />
        {rolling ? (
          <View style={styles.recChip} accessibilityLiveRegion="polite">
            <View style={[styles.recDot, { backgroundColor: paused ? Paper.muted : Paper.danger }]} />
            <Text style={styles.recTime}>{clock(elapsed)}</Text>
          </View>
        ) : (
          <Tag label={`${sport.name} · live`} color={palette.plate} onColor={palette.onPlate} variant="solid" />
        )}
        <Pressable
          onPress={() => setShowHud((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: showHud }}
          accessibilityLabel="Overlay"
          style={styles.hudToggle}
        >
          <Text style={[styles.hudText, showHud && { color: palette.ink }]}>HUD</Text>
        </Pressable>
      </View>

      {showHud && overlay.showSpeedBadge && rolling ? (
        <View style={[styles.speed, { top: insets.top + 72, borderColor: palette.plate }]}>
          <Text style={[Type.metric, { color: palette.ink }]}>{hud.speedKmh === null ? "—" : format(hud.speedKmh)}</Text>
          <Text style={Type.unit}>{unit}</Text>
          <Text style={[Type.unit, styles.speedNote]}>{hud.speedKmh === null ? "after session" : `${sport.tracked} · live`}</Text>
        </View>
      ) : null}

      {showHud && overlay.showStrokeLabel && rolling && hud.stroke ? (
        <View style={styles.strokeLabel}>
          <Tag label={strokeLabel(sport, hud.stroke)} color={palette.plate} onColor={palette.onPlate} variant="solid" />
        </View>
      ) : null}

      {countdown !== null ? (
        <View style={styles.countdown}>
          <Countdown key={countdown} n={countdown} palette={palette} />
        </View>
      ) : null}

      {/* Controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Space.xl }]}>
        {idle ? (
          <Pressable onPress={start} accessibilityRole="button" accessibilityLabel="Start recording" style={styles.recordRing}>
            <View style={styles.recordInner} />
          </Pressable>
        ) : rolling ? (
          <View style={styles.controls}>
            <Pressable
              onPress={pauseResume}
              accessibilityRole="button"
              accessibilityLabel={paused ? "Resume" : "Pause"}
              style={styles.control}
            >
              {paused ? (
                <View style={styles.play} />
              ) : (
                <View style={styles.pause}>
                  <View style={styles.pauseBar} />
                  <View style={styles.pauseBar} />
                </View>
              )}
            </Pressable>
            <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="Stop and analyse" style={styles.stop}>
              <View style={styles.stopInner} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.recordRing} />
        )}
        <Text style={[Type.kicker, styles.hint]}>
          {idle ? "Tap to start" : recordingState === "countdown" ? "Get ready" : paused ? "Paused" : "Recording"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: "#000" },
  notLive: { flex: 1, paddingHorizontal: Space.gutter, justifyContent: "space-between" },
  notLiveBody: { gap: Space.lg },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Space.lg,
  },
  recChip: { flexDirection: "row", alignItems: "center", gap: Space.sm, backgroundColor: OVERLAY, paddingHorizontal: Space.md, paddingVertical: 6 },
  recDot: { width: 8, height: 8 },
  recTime: { fontFamily: Fonts.monoBold, fontSize: 14, color: Paper.text },
  hudToggle: { width: 48, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: OVERLAY },
  hudText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, color: Paper.muted },
  guide: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: Space.xxl },
  guideBox: { width: "100%", aspectRatio: 0.62, maxHeight: "70%" },
  corner: { position: "absolute", width: 28, height: 28 },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  guideText: { marginTop: Space.md, color: Paper.text, backgroundColor: OVERLAY, paddingHorizontal: Space.sm, paddingVertical: 4 },
  speed: { position: "absolute", right: Space.lg, alignItems: "flex-end", backgroundColor: OVERLAY, borderLeftWidth: 3, padding: Space.md },
  speedNote: { fontSize: 9, marginTop: 2 },
  strokeLabel: { position: "absolute", bottom: 190, alignSelf: "center" },
  countdown: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  countFace: { width: 140, height: 140, alignItems: "center", justifyContent: "center" },
  countText: { fontFamily: Fonts.monoBold, fontSize: 88, lineHeight: 100 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  recordRing: { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: Paper.text, alignItems: "center", justifyContent: "center" },
  recordInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: Paper.danger },
  controls: { flexDirection: "row", alignItems: "center", gap: Space.xl },
  control: { width: 58, height: 58, alignItems: "center", justifyContent: "center", backgroundColor: OVERLAY, borderWidth: 1, borderColor: Paper.ruleStrong },
  pause: { flexDirection: "row", gap: 6 },
  pauseBar: { width: 5, height: 20, backgroundColor: Paper.text },
  play: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderLeftWidth: 18,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: Paper.text,
  },
  stop: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: Paper.danger, alignItems: "center", justifyContent: "center" },
  stopInner: { width: 26, height: 26, backgroundColor: Paper.danger },
  hint: { marginTop: Space.md, color: Paper.text },
})
