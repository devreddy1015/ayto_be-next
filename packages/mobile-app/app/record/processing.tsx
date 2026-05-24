import React, { useEffect, useRef, useState } from "react"
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native"
import { router } from "expo-router"
import { Colors, Spacing } from "../../src/theme"

const { width } = Dimensions.get("window")

const STAGES = [
  { id: "path", label: "Extracting shuttle path", icon: "◎" },
  { id: "pose", label: "Reading your pose", icon: "◈" },
  { id: "classify", label: "Classifying strokes", icon: "◆" },
  { id: "report", label: "Building your report", icon: "◉" },
]

const FUN_STATS = [
  "Your fastest shot this session: analyzing...",
  "Tracking shuttle at 1200 fps...",
  "Comparing to pro benchmarks...",
  "Crunching biomechanics data...",
  "Almost there. Stay pumped!",
]

export default function ProcessingScreen() {
  const [currentStage, setCurrentStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [funStat, setFunStat] = useState(FUN_STATS[0])
  const [finalSpeed, setFinalSpeed] = useState<number | null>(null)

  const progressAnim = useRef(new Animated.Value(0)).current
  const stageOpacity = useRef(new Animated.Value(1)).current
  const stageTranslateY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let stageIndex = 0
    const stageInterval = setInterval(() => {
      stageIndex++
      if (stageIndex < STAGES.length) {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(stageOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(stageTranslateY, { toValue: -20, duration: 200, useNativeDriver: true }),
          ]),
        ]).start(() => {
          setCurrentStage(stageIndex)
          stageOpacity.setValue(0)
          stageTranslateY.setValue(20)
          Animated.parallel([
            Animated.timing(stageOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(stageTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start()
        })
      } else {
        clearInterval(stageInterval)
      }
    }, 1200)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 0.03
        if (next >= 1) {
          clearInterval(progressInterval)
          return 1
        }
        return next
      })
    }, 100)

    let statIndex = 0
    const statInterval = setInterval(() => {
      statIndex = (statIndex + 1) % FUN_STATS.length
      setFunStat(FUN_STATS[statIndex])
    }, 2000)

    const timer = setTimeout(() => {
      const speed = 287
      setFinalSpeed(speed)
      setTimeout(() => {
        router.replace({ pathname: "/session/[id]", params: { id: "latest" } })
      }, 1500)
    }, 5000)

    return () => {
      clearInterval(stageInterval)
      clearInterval(progressInterval)
      clearInterval(statInterval)
      clearTimeout(timer)
    }
  }, [])

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  })

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 50,
      useNativeDriver: false,
    }).start()
  }, [progress])

  const currentStageData = STAGES[currentStage]

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Processing</Text>
        <Text style={styles.subtitle}>Analyzing your session</Text>

        {/* Stage */}
        <Animated.View
          style={[
            styles.stageContainer,
            { opacity: stageOpacity, transform: [{ translateY: stageTranslateY }] },
          ]}
        >
          <View style={styles.stageIconContainer}>
            <Text style={styles.stageIcon}>{currentStageData.icon}</Text>
          </View>
          <Text style={styles.stageLabel}>{currentStageData.label}</Text>
        </Animated.View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}%
          </Text>
        </View>

        {/* Fun Stats */}
        <View style={styles.funStatContainer}>
          <Text style={styles.funStat}>{funStat}</Text>
        </View>

        {/* Stage Dots */}
        <View style={styles.stageDots}>
          {STAGES.map((stage, i) => (
            <View
              key={stage.id}
              style={[
                styles.stageDot,
                i < currentStage && styles.stageDotComplete,
                i === currentStage && styles.stageDotActive,
              ]}
            />
          ))}
        </View>

        {/* Final Speed Reveal */}
        {finalSpeed && (
          <Animated.View style={styles.speedReveal}>
            <Text style={styles.speedRevealLabel}>MAX SPEED</Text>
            <Text style={styles.speedRevealValue}>{finalSpeed}</Text>
            <Text style={styles.speedRevealUnit}>km/h</Text>
          </Animated.View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text_primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text_secondary,
    marginBottom: 48,
  },
  stageContainer: {
    alignItems: "center",
    marginBottom: 32,
    minHeight: 140,
  },
  stageIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: "rgba(0,255,135,0.06)",
    borderWidth: 2,
    borderColor: "rgba(0,255,135,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  stageIcon: {
    fontSize: 36,
    color: Colors.accent_green,
  },
  stageLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text_primary,
    letterSpacing: 0.5,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: width - Spacing.xl * 2,
    marginBottom: 24,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.bg_surface,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent_green,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.accent_green,
    fontVariant: ["tabular-nums"] as any,
    width: 40,
    textAlign: "right",
  },
  funStatContainer: {
    marginBottom: 32,
    minHeight: 40,
    justifyContent: "center",
  },
  funStat: {
    fontSize: 13,
    color: Colors.text_secondary,
    textAlign: "center",
    fontStyle: "italic",
  },
  stageDots: {
    flexDirection: "row",
    gap: 8,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bg_surface,
  },
  stageDotComplete: {
    backgroundColor: Colors.accent_green,
  },
  stageDotActive: {
    backgroundColor: Colors.accent_green,
    transform: [{ scale: 1.3 }],
  },
  speedReveal: {
    position: "absolute",
    bottom: -120,
    alignItems: "center",
  },
  speedRevealLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 3,
    marginBottom: 4,
  },
  speedRevealValue: {
    fontSize: 72,
    fontWeight: "800",
    color: Colors.accent_green,
    fontVariant: ["tabular-nums"] as any,
  },
  speedRevealUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 2,
    marginTop: -8,
  },
})
