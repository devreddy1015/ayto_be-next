import { type ReactNode, memo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import type { SportPalette } from "../../sports"
import { Paper, Radius, Space, Type } from "../../theme"
import { Icon, type IconName } from "./Icon"
import { Tappable } from "./Press"

interface SectionHeadProps {
  title: string
  kicker?: string
  caption?: string
  action?: { label: string; onPress: () => void }
  palette: SportPalette
  style?: StyleProp<ViewStyle>
}

export const SectionHead = memo(function SectionHead({
  title,
  kicker,
  caption,
  action,
  palette,
  style,
}: SectionHeadProps) {
  return (
    <View style={[styles.head, style]}>
      <View style={styles.headText}>
        {kicker ? <Text style={Type.kicker}>{kicker}</Text> : null}
        <Text style={[Type.heading, kicker ? styles.headTitle : null]} accessibilityRole="header">
          {title}
        </Text>
        {caption ? <Text style={[Type.small, styles.headCaption]}>{caption}</Text> : null}
      </View>
      {action ? (
        <Tappable onPress={action.onPress} label={action.label} scaleTo={0.94}>
          <View style={[styles.action, { backgroundColor: palette.soft }]}>
            <Text style={[Type.label, { color: palette.onSoft }]}>{action.label}</Text>
            <Icon name="chevronRight" size={14} color={palette.onSoft} weight={2.2} />
          </View>
        </Tappable>
      ) : null}
    </View>
  )
})

interface ChipProps {
  label: string
  palette: SportPalette
  selected?: boolean
  icon?: IconName
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}

export const Chip = memo(function Chip({ label, palette, selected, icon, onPress, style }: ChipProps) {
  const body = (
    <View
      style={[
        styles.chip,
        { backgroundColor: selected ? palette.accent : Paper.surface },
        !selected && styles.chipIdle,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? "#FFFFFF" : palette.ink} weight={2.2} /> : null}
      <Text style={[Type.label, { color: selected ? "#FFFFFF" : Paper.muted }]}>{label}</Text>
    </View>
  )
  return onPress ? (
    <Tappable onPress={onPress} label={label} scaleTo={0.93}>
      {body}
    </Tappable>
  ) : (
    body
  )
})

interface BadgeProps {
  label: string
  tone?: "neutral" | "accent" | "warn"
  palette?: SportPalette
  dot?: boolean
  style?: StyleProp<ViewStyle>
}

export const Badge = memo(function Badge({ label, tone = "neutral", palette, dot, style }: BadgeProps) {
  const bg = tone === "accent" ? (palette?.soft ?? Paper.sunken) : tone === "warn" ? "rgba(216,150,72,0.16)" : Paper.sunken
  const fg = tone === "accent" ? (palette?.onSoft ?? Paper.muted) : tone === "warn" ? "#8A5A18" : Paper.muted
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text style={[Type.kicker, { color: fg, letterSpacing: 0.9 }]}>{label}</Text>
    </View>
  )
})

interface NoteProps {
  children: ReactNode
  icon?: IconName
  palette: SportPalette
  style?: StyleProp<ViewStyle>
}

/**
 * The honesty panel. Used wherever the app shows sample data or describes
 * something that is not built yet — it should look deliberate, not apologetic.
 */
export const Note = memo(function Note({ children, icon = "info", palette, style }: NoteProps) {
  return (
    <View style={[styles.note, { backgroundColor: palette.soft }, style]}>
      <Icon name={icon} size={16} color={palette.onSoft} weight={2} />
      <Text style={[Type.small, styles.noteText, { color: palette.onSoft }]}>{children}</Text>
    </View>
  )
})

interface EmptyProps {
  title: string
  caption?: string
  icon?: IconName
  palette: SportPalette
  action?: ReactNode
  style?: StyleProp<ViewStyle>
}

export const Empty = memo(function Empty({ title, caption, icon = "sparkle", palette, action, style }: EmptyProps) {
  return (
    <View style={[styles.empty, style]}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.soft }]}>
        <Icon name={icon} size={26} color={palette.ink} weight={1.6} />
      </View>
      <Text style={[Type.subhead, styles.emptyTitle]}>{title}</Text>
      {caption ? <Text style={[Type.small, styles.emptyCaption]}>{caption}</Text> : null}
      {action}
    </View>
  )
})

export const Divider = memo(function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />
})

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-end", gap: Space.md },
  headText: { flex: 1 },
  headTitle: { marginTop: 2 },
  headCaption: { marginTop: Space.xs },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: Space.md,
    paddingRight: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
  },
  chipIdle: { borderWidth: 1, borderColor: Paper.line },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    alignSelf: "flex-start",
    paddingHorizontal: Space.md,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  note: {
    flexDirection: "row",
    gap: Space.sm,
    padding: Space.lg,
    borderRadius: Radius.md,
  },
  noteText: { flex: 1, lineHeight: 19 },
  empty: { alignItems: "center", gap: Space.sm, paddingVertical: Space.xxl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: Space.sm, textAlign: "center" },
  emptyCaption: { textAlign: "center", maxWidth: 280 },
  divider: { height: 1, backgroundColor: Paper.line },
})
