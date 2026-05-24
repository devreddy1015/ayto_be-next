import React, { useEffect, useRef } from "react"
import { View, Animated, StyleSheet, ViewStyle } from "react-native"
import { Colors } from "../../theme"

interface SkeletonProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle
  variant?: "rect" | "circle" | "text"
}

export default function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
  variant = "rect",
}: SkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [])

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  })

  const variantStyles: ViewStyle =
    variant === "circle"
      ? { width: height, height, borderRadius: height / 2 }
      : variant === "text"
        ? { height: 12, borderRadius: 4 }
        : { height, borderRadius }

  return (
    <Animated.View
      style={[
        styles.base,
        variantStyles,
        { width: width as any, opacity },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.bg_elevated,
  },
})
