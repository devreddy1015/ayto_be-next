import React, { useEffect, useRef } from "react"
import { View, Animated, StyleSheet, Text } from "react-native"
import { Colors } from "../theme"

interface SpeedGaugeProps {
  speed: number
  maxSpeed: number
}

export default function SpeedGauge({ speed, maxSpeed }: SpeedGaugeProps) {
  const animValue = useRef(new Animated.Value(0)).current
  const glowAnim = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: speed,
      duration: 1500,
      useNativeDriver: false,
    }).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.8,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    ).start()
  }, [speed])

  const ratio = maxSpeed > 0 ? Math.min(speed / maxSpeed, 1) : 0
  const segments = 27
  const segmentAngle = 270 / segments

  return (
    <View style={styles.container}>
      <View style={styles.gaugeOuter}>
        {Array.from({ length: segments }).map((_, i) => {
          const rotation = -135 + i * segmentAngle
          const active = i < Math.floor(ratio * segments)
          return (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  transform: [
                    { rotate: `${rotation}deg` },
                    { translateY: -85 },
                  ],
                  backgroundColor: active ? Colors.primary : "rgba(255,255,255,0.08)",
                  opacity: active ? 1 : 0.4,
                },
              ]}
            />
          )
        })}

        <Animated.View style={[styles.gaugeInner, { opacity: glowAnim }]}>
          <View style={styles.innerBorder} />
        </Animated.View>
        <View style={styles.valueContainer}>
          <Text style={styles.speedValue}>{Math.round(speed)}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  gaugeOuter: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,245,160,0.03)",
  },
  tick: {
    position: "absolute",
    width: 3,
    height: 12,
    borderRadius: 2,
  },
  gaugeInner: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: "rgba(0,245,160,0.2)",
  },
  innerBorder: {
    flex: 1,
    borderRadius: 88,
    borderWidth: 1,
    borderColor: "rgba(0,245,160,0.05)",
  },
  valueContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  speedValue: {
    fontSize: 56,
    fontWeight: "800",
    color: Colors.primary,
  },
  speedUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.35)",
    marginTop: -4,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
})
