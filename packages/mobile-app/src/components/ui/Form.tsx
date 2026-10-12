import { type ReactNode, memo, useCallback, useEffect, useState } from "react"
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native"
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import type { SportPalette } from "../../sports"
import { Fonts, Motion, Paper, Radius, Space, Type } from "../../theme"
import { Icon, type IconName } from "./Icon"
import { Tappable } from "./Press"
import { useReducedMotion } from "../../hooks/useMotion"

interface FieldProps extends Omit<TextInputProps, "style"> {
  label: string
  palette: SportPalette
  icon?: IconName
  error?: string
  /** Renders a show/hide control and starts obscured. */
  secret?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * A text field whose border and label follow focus.
 *
 * The border colour is interpolated on the UI thread so typing never competes
 * with the animation.
 */
export const Field = memo(function Field({
  label,
  palette,
  icon,
  error,
  secret,
  style,
  onFocus,
  onBlur,
  ...input
}: FieldProps) {
  const reduce = useReducedMotion()
  const focus = useSharedValue(0)
  const [hidden, setHidden] = useState(!!secret)

  const border = useDerivedValue(() =>
    interpolateColor(
      focus.value,
      [0, 1],
      [error ? Paper.danger : "rgba(10,9,8,0.10)", error ? Paper.danger : palette.accent],
    ))

  const box = useAnimatedStyle(() => ({
    borderColor: border.value,
    transform: [{ scale: reduce ? 1 : 1 + focus.value * 0.004 }],
  }))

  return (
    <View style={style}>
      <Text style={[Type.label, styles.fieldLabel]}>{label}</Text>
      <Animated.View style={[styles.field, box]}>
        {icon ? <Icon name={icon} size={18} color={Paper.faint} /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={Paper.faint}
          secureTextEntry={hidden}
          {...input}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: Motion.quick })
            onFocus?.(e)
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: Motion.quick })
            onBlur?.(e)
          }}
          style={styles.input}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            onPress={() => setHidden((v) => !v)}
            hitSlop={10}
          >
            <Icon name={hidden ? "eye" : "eyeOff"} size={18} color={Paper.faint} />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Text style={[Type.small, styles.error]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
})

interface RowProps {
  title: string
  caption?: string
  icon?: IconName
  palette: SportPalette
  onPress?: () => void
  /** Right-hand content: a value, a switch, a chevron. */
  right?: ReactNode
  danger?: boolean
  style?: StyleProp<ViewStyle>
}

/** One line in a settings group. */
export const Row = memo(function Row({
  title,
  caption,
  icon,
  palette,
  onPress,
  right,
  danger,
  style,
}: RowProps) {
  const tint = danger ? Paper.danger : palette.ink
  const body = (
    <View style={[styles.row, style]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: danger ? "rgba(179,68,60,0.10)" : palette.soft }]}>
          <Icon name={icon} size={18} color={tint} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[Type.subhead, danger && { color: Paper.danger }]} numberOfLines={1}>
          {title}
        </Text>
        {caption ? (
          <Text style={[Type.small, styles.rowCaption]} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={18} color={Paper.faint} /> : null)}
    </View>
  )

  return onPress ? (
    <Tappable onPress={onPress} label={title} scaleTo={0.985}>
      {body}
    </Tappable>
  ) : (
    body
  )
})

interface SwitchRowProps {
  title: string
  caption?: string
  icon?: IconName
  palette: SportPalette
  value: boolean
  onValueChange: (next: boolean) => void
}

export const SwitchRow = memo(function SwitchRow({
  title,
  caption,
  icon,
  palette,
  value,
  onValueChange,
}: SwitchRowProps) {
  return (
    <Row
      title={title}
      caption={caption}
      icon={icon}
      palette={palette}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={title}
          trackColor={{ false: Paper.sunken, true: palette.accent }}
          thumbColor={Paper.surface}
          ios_backgroundColor={Paper.sunken}
        />
      }
    />
  )
})

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  palette: SportPalette
  label?: string
  style?: StyleProp<ViewStyle>
}

/** A pill selector whose indicator slides between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  palette,
  label,
  style,
}: SegmentedProps<T>) {
  const reduce = useReducedMotion()
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const pos = useSharedValue(index)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    pos.value = reduce ? index : withTiming(index, { duration: Motion.base })
  }, [index, pos, reduce])

  const slot = width > 0 ? (width - 8) / options.length : 0
  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * slot }],
    width: slot,
  }))

  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    setWidth(e.nativeEvent.layout.width)
  }, [])

  return (
    <View style={style}>
      {label ? <Text style={[Type.label, styles.fieldLabel]}>{label}</Text> : null}
      <View style={styles.segment} onLayout={onLayout} accessibilityRole="radiogroup">
        {width > 0 ? (
          <Animated.View style={[styles.indicator, { backgroundColor: palette.accent }, indicator]} />
        ) : null}
        {options.map((option) => {
          const on = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={styles.segmentItem}
            >
              <Text style={[styles.segmentLabel, { color: on ? "#FFFFFF" : Paper.muted }]}>{option.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

interface GroupProps {
  title?: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

/** A titled stack of rows with hairlines between them. */
export const Group = memo(function Group({ title, children, style }: GroupProps) {
  return (
    <View style={style}>
      {title ? <Text style={[Type.kicker, styles.groupTitle]}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  )
})

const styles = StyleSheet.create({
  fieldLabel: { marginBottom: Space.xs, color: Paper.muted },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    height: 54,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    backgroundColor: Paper.surface,
  },
  input: { flex: 1, fontFamily: Fonts.body, fontSize: 16, color: Paper.ink, height: "100%" },
  error: { color: Paper.danger, marginTop: Space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingVertical: Space.md, minHeight: 56 },
  rowIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 1 },
  rowCaption: { fontSize: 13, lineHeight: 18 },
  segment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: Radius.pill,
    backgroundColor: Paper.sunken,
  },
  indicator: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: Radius.pill },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: Space.sm },
  segmentLabel: { fontFamily: Fonts.bodySemi, fontSize: 14 },
  groupTitle: { marginBottom: Space.sm, marginLeft: Space.xs },
  group: {
    backgroundColor: Paper.surface,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.lg,
  },
})
