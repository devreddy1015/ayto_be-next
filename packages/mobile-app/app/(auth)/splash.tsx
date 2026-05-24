import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native"
import { router } from "expo-router"
import { Colors } from "../../src/theme"
import { useMLModels } from "../../src/hooks/useMLModels"
import { useUserStore } from "../../src/store/userStore"

const { width, height } = Dimensions.get("window")

export default function SplashScreen() {
  const { isReady: mlReady, loadTimeMs } = useMLModels()
  const { isOnboardingDone, isAuthenticated } = useUserStore()

  const logoScale = useRef(new Animated.Value(0.3)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const taglineProgress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 100 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start()

    const tagline = "Hawk-Eye. For everyone."
    const charDuration = 2200 / tagline.length
    let currentChar = 0

    const charInterval = setInterval(() => {
      currentChar++
      taglineProgress.setValue(currentChar / tagline.length)
      if (currentChar >= tagline.length) clearInterval(charInterval)
    }, charDuration)

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoScale, { toValue: 1.5, duration: 400, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(taglineOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        if (!isOnboardingDone) {
          router.replace("/(auth)/onboarding")
        } else {
          router.replace("/(tabs)")
        }
      })
    }, 2200)

    return () => {
      clearInterval(charInterval)
      clearTimeout(timeout)
    }
  }, [])

  const tagline = "Hawk-Eye. For everyone."

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <View style={styles.logoMark}>
          <Text style={styles.logoIcon}>◈</Text>
        </View>
        <Text style={styles.brandName}>Ayto</Text>
        <Text style={styles.subtitle}>SportIQ</Text>
      </Animated.View>

      <Animated.View style={[styles.taglineContainer, { opacity: taglineOpacity }]}>
        <Text style={styles.tagline}>
          {tagline.split("").map((char, i) => (
            <Animated.Text
              key={i}
              style={{
                opacity: taglineProgress.interpolate({
                  inputRange: [0, i / tagline.length, (i + 0.5) / tagline.length],
                  outputRange: [0, 0, 1],
                  extrapolate: "clamp",
                }),
              }}
            >
              {char}
            </Animated.Text>
          ))}
        </Text>
      </Animated.View>

      {__DEV__ && (
        <Text style={styles.devInfo}>ML Load: {loadTimeMs}ms</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoMark: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(0,255,135,0.08)",
    borderWidth: 2,
    borderColor: "rgba(0,255,135,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoIcon: {
    fontSize: 32,
    color: Colors.accent_green,
  },
  brandName: {
    fontSize: 42,
    fontWeight: "800",
    color: Colors.text_primary,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.accent_green,
    letterSpacing: 4,
    marginTop: 4,
    textTransform: "uppercase",
  },
  taglineContainer: {
    position: "absolute",
    bottom: 80,
  },
  tagline: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text_secondary,
    letterSpacing: 1,
    flexDirection: "row",
  },
  devInfo: {
    position: "absolute",
    bottom: 30,
    fontSize: 10,
    color: Colors.text_secondary,
    opacity: 0.5,
  },
})
