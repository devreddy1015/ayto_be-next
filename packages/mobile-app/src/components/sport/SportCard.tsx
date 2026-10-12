import { memo, useEffect } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import type { AnalysisStatus, Sport } from "../../sports"
import { Fonts, Motion, Paper, Radius, Shadow, Space, Type } from "../../theme"
import { Badge } from "../ui/Bits"
import { Icon } from "../ui/Icon"
import { Reveal } from "../ui/Motion"
import { Tappable } from "../ui/Press"
import { useReducedMotion } from "../../hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

interface SportCardProps {
  sport: Sport
  /** Marks the sport the app is currently tinted by. */
  selected?: boolean
  onPress?: () => void
  /** Position in a dealt-out list; drives the entrance stagger. */
  index?: number
  /** Drops the status line and shrinks the card, for dense rails. */
  compact?: boolean
  style?: StyleProp<ViewStyle>
}

/** Past this, the stagger stops reading as a deal and starts reading as lag. */
const MAX_STAGGER_INDEX = 5

/**
 * How far each sport's pipeline has actually got.
 *
 * Deliberately not `STATUS_LABEL`, whose first tier reads "Live analysis".
 * The screens that use that wording — the sports tab and the per-sport page —
 * print `sport.statusNote` directly beneath it, and that note is what keeps it
 * honest. This card is a gallery tile with no room for the note, so the badge
 * has to stand on its own: the badminton pipeline passes its tests in the
 * Python packages, but no clip has ever been through it inside this app, so
 * "live" would overclaim here.
 *
 * `spoken` exists because an ampersand and title case read badly aloud.
 */
const READINESS: Record<AnalysisStatus, { badge: string; spoken: string }> = {
  live: { badge: "Built & tested", spoken: "built and tested" },
  beta: { badge: "In training", spoken: "in training" },
  soon: { badge: "On the roadmap", spoken: "on the roadmap" },
}

/**
 * One sport, as a card: its own mesh tint, catalogue code and play area.
 *
 * Deliberately carries no performance metric. Every number in the app comes
 * from generated sample data, and a gallery of nine cards is the easiest place
 * for a stray figure to read as something Ayto measured. The one figure here is
 * the sport's regulation play area, which is a fact about the venue rather than
 * anything about the athlete — hence the ruler and the surface name sitting on
 * it, so it cannot be mistaken for a result.
 */
export const SportCard = memo(function SportCard({
  sport,
  selected = false,
  onPress,
  index = 0,
  compact = false,
  style,
}: SportCardProps) {
  const reduce = useReducedMotion()
  const { palette } = sport
  const mark = useSharedValue(selected ? 1 : 0)
  const readiness = READINESS[sport.status]

  useEffect(() => {
    mark.value = reduce ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: Motion.base, easing: BACK })
  }, [mark, reduce, selected])

  const ringStyle = useAnimatedStyle(() => ({ opacity: mark.value }))

  const checkStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: 0.6 + mark.value * 0.4 }],
  }))

  // Selection is spoken, not just drawn: the ring and the tick are colour and
  // shape, which a screen reader never sees. The readiness tier is spoken even
  // in compact mode, where the badge is dropped for space — leaving it out
  // would let a roadmap sport sound like a finished one.
  const label =
    `${sport.name}${selected ? ", your sport" : ""}. ` +
    `${sport.playArea.label} ${sport.playArea.size}. ` +
    `Analysis ${readiness.spoken}.`

  return (
    <Reveal index={Math.min(index, MAX_STAGGER_INDEX)} style={style}>
      <Tappable onPress={onPress} label={label} scaleTo={0.97}>
        <View style={[styles.card, compact && styles.cardCompact, Shadow.md]}>
          <LinearGradient
            colors={[palette.grad[0], palette.grad[1], palette.grad[2]]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* The text block lands on whichever gradient stop falls under it, so
              a wash guarantees it always sits on light paper. */}
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.62)"]}
            style={[styles.wash, { height: compact ? 84 : 118 }]}
            pointerEvents="none"
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.ring, { borderColor: palette.accent }, ringStyle]}
          />

          <View style={styles.top}>
            <View style={styles.code}>
              <Text style={[styles.codeText, { color: palette.ink }]}>{sport.code}</Text>
            </View>
            <Animated.View style={[styles.check, { backgroundColor: palette.accent }, checkStyle]}>
              <Icon name="check" size={16} color="#FFFFFF" weight={2.6} />
            </Animated.View>
          </View>

          <View style={styles.body}>
            <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>
              {sport.name}
            </Text>
            <View style={styles.area}>
              <Icon name="ruler" size={13} color={palette.deep} weight={2} />
              <Text style={[Type.small, styles.areaText, { color: palette.deep }]} numberOfLines={1}>
                {sport.playArea.label} · {sport.playArea.size}
              </Text>
            </View>
            {compact ? null : (
              <Badge
                label={readiness.badge}
                tone={sport.status === "live" ? "accent" : "neutral"}
                palette={palette}
                dot={sport.status === "live"}
                style={styles.status}
              />
            )}
          </View>
        </View>
      </Tappable>
    </Reveal>
  )
})

const styles = StyleSheet.create({
  card: {
    minHeight: 178,
    borderRadius: Radius.xl,
    overflow: "hidden",
    padding: Space.lg,
    justifyContent: "space-between",
    backgroundColor: Paper.surface,
  },
  cardCompact: { minHeight: 126 },
  wash: { position: "absolute", left: 0, right: 0, bottom: 0 },
  ring: { borderWidth: 2, borderRadius: Radius.xl },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  code: {
    backgroundColor: Paper.veilStrong,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.xs,
  },
  codeText: { fontFamily: Fonts.bodySemi, fontSize: 11, letterSpacing: 0.8 },
  check: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  body: { marginTop: Space.lg, gap: Space.xxs },
  name: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.7, color: Paper.ink },
  nameCompact: { fontSize: 19, lineHeight: 24, letterSpacing: -0.4 },
  area: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  areaText: { flex: 1, fontSize: 13 },
  status: { marginTop: Space.sm },
})
