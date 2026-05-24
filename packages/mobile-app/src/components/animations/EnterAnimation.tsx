import React, { useEffect } from "react"
import { ViewStyle } from "react-native"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated"

interface EnterAnimationProps {
  children: React.ReactNode
  delay?: number
  duration?: number
  translateY?: number
  style?: ViewStyle
}

export default function EnterAnimation({
  children,
  delay = 0,
  duration = 300,
  translateY = 20,
  style,
}: EnterAnimationProps) {
  const opacity = useSharedValue(0)
  const translateYVal = useSharedValue(translateY)

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    )
    translateYVal.value = withDelay(
      delay,
      withTiming(0, { duration, easing: Easing.out(Easing.cubic) }),
    )
  }, [delay, duration])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateYVal.value }],
  }))

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  )
}
