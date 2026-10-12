import { useCallback, useEffect, useRef, useState } from "react"
import { Platform, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as Haptics from "expo-haptics"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { Badge, Note } from "../../src/components/ui/Bits"
import { Icon } from "../../src/components/ui/Icon"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, IconButton, Tappable } from "../../src/components/ui/Press"
import { Card, Screen } from "../../src/components/ui/Surface"
import { useSport } from "../../src/hooks/useSport"
import { clock } from "../../src/lib/format"
import { useSessionStore } from "../../src/store/sessionStore"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Motion, Paper, Radius, Shadow, Space, Type } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

type Phase = "idle" | "recording" | "saving"

export default function RecordScreen() {
  const insets = useSafeAreaInsets()
  const sport = useSport()
  const { palette } = sport
  const reduce = useReducedMotion()
  const [permission, requestPermission] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const capture = useUserStore((s) => s.capture)
  const showGuide = useUserStore((s) => s.overlaySettings.showFramingGuide)
  const setClip = useSessionStore((s) => s.setClip)

  const pulse = useSharedValue(0)

  useEffect(() => {
    if (phase !== "recording" || reduce) {
      pulse.value = 0
      return
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }),
      ),
      -1,
    )
  }, [phase, pulse, reduce])

  useEffect(() => {
    if (phase !== "recording") return
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const dotStyle = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.value * 0.55 }))
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.08 }],
    opacity: 0.25 + pulse.value * 0.2,
  }))

  const start = useCallback(async () => {
    setError(null)
    setSeconds(0)
    setPhase("recording")
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    try {
      // Actually record. Web has no recordAsync in expo-camera, so there the
      // clip is skipped and the flow still reaches the report.
      const result = await camera.current?.recordAsync({ maxDuration: 600 })
      if (result?.uri) setClip({ uri: result.uri, sport: sport.id, seconds })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recording failed")
    }
  }, [sport.id, seconds, setClip])

  const finish = useCallback(() => {
    setPhase("saving")
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    try {
      camera.current?.stopRecording()
    } catch {
      // Nothing was recording; the flow continues either way.
    }
    router.replace("/record/processing")
  }, [])

  if (!permission) {
    // Permission state is still resolving: show the bare mesh, not a flash of
    // the denied screen.
    return (
      <Screen palette={palette}>
        <View style={styles.root} />
      </Screen>
    )
  }

  if (!permission.granted) {
    return (
      <Screen palette={palette}>
        <View style={[styles.gate, { paddingTop: insets.top + Space.xl, paddingBottom: insets.bottom + Space.xl }]}>
          <Reveal>
            <IconButton name="close" label="Close" palette={palette} onPress={() => router.back()} />
          </Reveal>
          <View style={styles.gateBody}>
            <Reveal index={1}>
              <View style={[styles.gateIcon, { backgroundColor: palette.soft }]}>
                <Icon name="record" size={32} color={palette.ink} weight={1.6} />
              </View>
            </Reveal>
            <Reveal index={2}>
              <Text style={[Type.title, styles.centered]}>Ayto needs the camera.</Text>
              <Text style={[Type.bodyMuted, styles.centered, styles.gateDeck]}>
                That is the only sensor it uses. The clip stays on this phone.
              </Text>
            </Reveal>
          </View>
          <Reveal index={3} style={styles.gateActions}>
            <Button label="Allow camera" palette={palette} size="lg" full onPress={requestPermission} />
            <Button label="Not now" palette={palette} variant="ghost" full onPress={() => router.back()} />
          </Reveal>
        </View>
      </Screen>
    )
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        videoQuality={capture.quality === "1080p" ? "1080p" : "720p"}
      />

      {showGuide ? (
        <View style={styles.guide} pointerEvents="none">
          <View style={[styles.guideBox, { borderColor: "rgba(255,255,255,0.55)" }]} />
          <Text style={styles.guideText}>Fit the whole {sport.playArea.label.toLowerCase()} inside the frame</Text>
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + Space.md }]}>
        <IconButton name="close" label="Close" variant="glass" onPress={() => router.back()} />
        {phase === "recording" ? (
          <View style={styles.timer}>
            <Animated.View style={[styles.recDot, dotStyle]} />
            <Text style={styles.timerText}>{clock(seconds)}</Text>
          </View>
        ) : (
          <Badge label={`${sport.name} · ${capture.fps} fps`} />
        )}
        <IconButton
          name="settings"
          label="Capture settings"
          variant="glass"
          onPress={() => router.push("/settings")}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Space.xl }]}>
        {error ? (
          <Card variant="glass" style={styles.errorCard}>
            <Text style={[Type.small, { color: Paper.danger }]}>{error}</Text>
          </Card>
        ) : phase === "idle" ? (
          <Reveal>
            <Card variant="glass" elevation="sm" padded={false} style={styles.hint}>
              <Note palette={palette} icon="info">
                Ayto records the clip now. Analysis runs later — it is not live yet.
              </Note>
            </Card>
          </Reveal>
        ) : null}

        <View style={styles.controls}>
          <View style={styles.controlSide} />
          <Tappable
            onPress={phase === "recording" ? finish : start}
            label={phase === "recording" ? "Stop recording" : "Start recording"}
            scaleTo={0.9}
          >
            <View style={styles.shutterWrap}>
              <Animated.View style={[styles.shutterRing, { borderColor: palette.accent }, ringStyle]} />
              <View style={[styles.shutter, phase === "recording" && styles.shutterOn]}>
                <View
                  style={[
                    phase === "recording" ? styles.shutterSquare : styles.shutterDot,
                    { backgroundColor: palette.accent },
                  ]}
                />
              </View>
            </View>
          </Tappable>
          <View style={styles.controlSide}>
            {phase === "recording" ? (
              <Text style={styles.sideHint} numberOfLines={2}>
                Tap to finish
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0908" },
  gate: { flex: 1, paddingHorizontal: Space.gutter, maxWidth: 520, width: "100%", alignSelf: "center" },
  gateBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: Space.lg },
  gateIcon: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  centered: { textAlign: "center" },
  gateDeck: { marginTop: Space.sm },
  gateActions: { gap: Space.xs },
  guide: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: Space.md },
  guideBox: { width: "84%", aspectRatio: 1.5, borderWidth: 1.5, borderRadius: Radius.lg, borderStyle: "dashed" },
  guideText: { fontFamily: Fonts.bodyMed, fontSize: 13, color: "rgba(255,255,255,0.8)" },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.gutter,
  },
  timer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(10,9,8,0.55)",
  },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#E4584F" },
  timerText: { fontFamily: Fonts.display, fontSize: 16, color: "#FFFFFF", letterSpacing: 0.4 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: Space.gutter, gap: Space.lg },
  hint: { overflow: "hidden" },
  errorCard: { paddingVertical: Space.md },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlSide: { width: 76, alignItems: "center" },
  sideHint: { fontFamily: Fonts.bodyMed, fontSize: 12, color: "rgba(255,255,255,0.75)", textAlign: "center" },
  shutterWrap: { width: 86, height: 86, alignItems: "center", justifyContent: "center" },
  shutterRing: { position: "absolute", width: 86, height: 86, borderRadius: 43, borderWidth: 3 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Paper.veilStrong,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.md,
  },
  shutterOn: { backgroundColor: "#FFFFFF" },
  shutterDot: { width: 54, height: 54, borderRadius: 27 },
  shutterSquare: { width: 28, height: 28, borderRadius: 7 },
})
