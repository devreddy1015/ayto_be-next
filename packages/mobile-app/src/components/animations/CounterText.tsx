import React, { useEffect } from "react"
import { StyleSheet, TextInput, TextStyle } from "react-native"
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  useDerivedValue,
} from "react-native-reanimated"
import { Colors, Typography } from "../../theme"

interface CounterTextProps {
  value: number
  prefix?: string
  suffix?: string
  style?: TextStyle
  decimals?: number
  springConfig?: { damping: number; stiffness: number }
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

function formatValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

export default function CounterText({
  value,
  prefix = "",
  suffix = "",
  style,
  decimals = 0,
  springConfig = { damping: 15, stiffness: 150 },
}: CounterTextProps) {
  const displayValue = useSharedValue(0)

  useEffect(() => {
    displayValue.value = withSpring(value, springConfig)
  }, [value])

  const animatedText = useDerivedValue(() => {
    return `${prefix}${formatValue(displayValue.value, decimals)}${suffix}`
  })

  const animatedProps = useAnimatedProps(
    () => ({ text: animatedText.value } as Record<string, unknown>),
    [animatedText],
  )

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      style={[styles.text, Typography.numbered, style]}
      underlineColorAndroid="transparent"
    />
  )
}

const styles = StyleSheet.create({
  text: {
    fontSize: 64,
    fontWeight: "800",
    color: Colors.accent_green,
    fontVariant: ["tabular-nums"],
    backgroundColor: "transparent",
  },
})
