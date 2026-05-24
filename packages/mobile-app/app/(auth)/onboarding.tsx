import React, { useRef, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
} from "react-native"
import { router } from "expo-router"
import { Colors, Spacing, Radius } from "../../src/theme"
import { useUserStore } from "../../src/store/userStore"

const { width } = Dimensions.get("window")

const slides = [
  {
    id: "1",
    title: "Track Every Shot",
    description: "Real-time shuttle tracking with advanced computer vision. See your speed, trajectory, and shot placement instantly.",
    icon: "◎",
    color: Colors.accent_green,
  },
  {
    id: "2",
    title: "Analyze Your Form",
    description: "AI-powered pose estimation breaks down your biomechanics. Compare your technique to professional players.",
    icon: "◈",
    color: Colors.accent_blue,
  },
  {
    id: "3",
    title: "Improve Fast",
    description: "Get personalized drills and training plans based on your weaknesses. Smash harder, move smarter.",
    icon: "◆",
    color: Colors.accent_amber,
  },
]

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const { setOnboardingDone } = useUserStore()

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true })
    } else {
      handleFinish()
    }
  }

  const handleFinish = () => {
    setOnboardingDone(true)
    router.replace("/(auth)/login")
  }

  const handleSkip = () => {
    setOnboardingDone(true)
    router.replace("/(auth)/login")
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width)
          setCurrentIndex(idx)
        }}
        renderItem={({ item, index }) => (
          <View style={styles.slide}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconRing, { borderColor: item.color }]}>
                <Text style={[styles.icon, { color: item.color }]}>{item.icon}</Text>
              </View>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentIndex === index && { backgroundColor: Colors.accent_green, width: 24 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.8}>
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
          </Text>
          <Text style={styles.nextArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
  },
  skipButton: {
    position: "absolute",
    top: 60,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg_surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  slide: {
    width,
    paddingHorizontal: Spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 48,
  },
  iconRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text_primary,
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    fontWeight: "400",
    color: Colors.text_secondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: 50,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.accent_green,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.bg_primary,
  },
  nextArrow: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.bg_primary,
  },
})
