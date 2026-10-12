import { type ReactNode, memo, useCallback } from "react"
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import * as Haptics from "expo-haptics"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import type { SportPalette } from "../../sports"
import { Fonts, Motion, Paper, Radius, Shadow, Space } from "../../theme"
import { Icon, type IconName } from "./Icon"
import { useReducedMotion } from "../../hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function useTouch(scaleTo: number) {
  const reduce = useReducedMotion()
  const pressed = useSharedValue(0)

  const onPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: Motion.quick })
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [pressed])

  const onPressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: Motion.base, easing: BACK })
  }, [pressed])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * 0.12,
  }))

  return { onPressIn, onPressOut, style }
}

type Variant = "primary" | "soft" | "outline" | "ghost" | "ink"

interface ButtonProps {
  label: string
  palette: SportPalette
  onPress?: () => void
  variant?: Variant
  size?: "sm" | "md" | "lg"
  icon?: IconName
  trailingIcon?: IconName
  full?: boolean
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export const Button = memo(function Button({
  label,
  palette,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  full,
  loading,
  disabled,
  style,
}: ButtonProps) {
  const touch = useTouch(0.96)
  const off = disabled || loading

  const background =
    variant === "primary"
      ? palette.accent
      : variant === "soft"
        ? palette.soft
        : variant === "ink"
          ? Paper.ink
          : "transparent"

  const foreground =
    variant === "primary" || variant === "ink"
      ? "#FFFFFF"
      : variant === "soft"
        ? palette.onSoft
        : palette.ink

  const height = size === "lg" ? 58 : size === "sm" ? 40 : 50

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      onPressIn={touch.onPressIn}
      onPressOut={touch.onPressOut}
      style={[
        styles.button,
        { height, backgroundColor: background, paddingHorizontal: size === "sm" ? Space.lg : Space.xl },
        variant === "outline" && { borderWidth: 1.5, borderColor: palette.ink },
        variant === "primary" && Shadow.sm,
        full && styles.full,
        off && styles.off,
        touch.style,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={foreground} /> : null}
          <Text style={[styles.label, { color: foreground, fontSize: size === "sm" ? 14 : 16 }]}>{label}</Text>
          {trailingIcon ? <Icon name={trailingIcon} size={18} color={foreground} /> : null}
        </>
      )}
    </AnimatedPressable>
  )
})

interface IconButtonProps {
  name: IconName
  label: string
  onPress?: () => void
  palette?: SportPalette
  variant?: "glass" | "solid" | "plain"
  size?: number
  style?: StyleProp<ViewStyle>
}

/** The small circular control that sits in a screen corner. */
export const IconButton = memo(function IconButton({
  name,
  label,
  onPress,
  palette,
  variant = "glass",
  size = 44,
  style,
}: IconButtonProps) {
  const touch = useTouch(0.9)
  const background =
    variant === "glass" ? Paper.veilStrong : variant === "solid" ? (palette?.accent ?? Paper.ink) : "transparent"
  const tint = variant === "solid" ? "#FFFFFF" : (palette?.ink ?? Paper.ink)

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={touch.onPressIn}
      onPressOut={touch.onPressOut}
      hitSlop={8}
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        variant !== "plain" && Shadow.sm,
        touch.style,
        style,
      ]}
    >
      <Icon name={name} size={size * 0.46} color={tint} />
    </AnimatedPressable>
  )
})

interface TappableProps {
  children: ReactNode
  onPress?: () => void
  label?: string
  scaleTo?: number
  style?: StyleProp<ViewStyle>
}

/** Wrap any card or row to give it the same press feel. */
export const Tappable = memo(function Tappable({
  children,
  onPress,
  label,
  scaleTo = 0.975,
  style,
}: TappableProps) {
  const touch = useTouch(scaleTo)
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={touch.onPressIn}
      onPressOut={touch.onPressOut}
      style={[touch.style, style]}
    >
      <View>{children}</View>
    </AnimatedPressable>
  )
})

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    borderRadius: Radius.pill,
  },
  full: { alignSelf: "stretch" },
  off: { opacity: 0.45 },
  label: { fontFamily: Fonts.bodySemi, letterSpacing: -0.1 },
  iconButton: { alignItems: "center", justifyContent: "center" },
})
