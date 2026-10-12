import { memo, useEffect, type ComponentProps } from "react"
import { Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { Redirect, Tabs, router } from "expo-router"
import * as Haptics from "expo-haptics"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Icon, type IconName } from "../../src/components/ui/Icon"
import { useSport } from "../../src/hooks/useSport"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Motion, Paper, Radius, Shadow, Space } from "../../src/theme"
import { useReducedMotion } from "../../src/hooks/useMotion"

const BACK = Easing.bezier(...Motion.backOut)

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0]

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Home", icon: "activity" },
  sports: { label: "Sports", icon: "grid" },
  history: { label: "History", icon: "clock" },
  compare: { label: "Compare", icon: "compare" },
  profile: { label: "You", icon: "user" },
}

const ORDER = ["index", "sports", "history", "compare", "profile"]

function TabItem({
  name,
  focused,
  tint,
  soft,
  onPress,
}: {
  name: string
  focused: boolean
  tint: string
  soft: string
  onPress: () => void
}) {
  const reduce = useReducedMotion()
  const on = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    on.value = reduce ? (focused ? 1 : 0) : withTiming(focused ? 1 : 0, { duration: Motion.base, easing: BACK })
  }, [focused, on, reduce])

  const pill = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.7 + on.value * 0.3 }],
  }))
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -on.value * 2 }],
  }))

  const meta = TABS[name] ?? { label: name, icon: "activity" as IconName }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      style={styles.item}
      hitSlop={6}
    >
      <Animated.View style={lift}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.pill, { backgroundColor: soft }, pill]} />
          <Icon name={meta.icon} size={21} color={focused ? tint : Paper.faint} weight={focused ? 2.1 : 1.8} />
        </View>
        <Text style={[styles.label, { color: focused ? tint : Paper.faint }]} numberOfLines={1}>
          {meta.label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

/** A floating capsule bar with a record button cut into the middle. */
const TabBar = memo(function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets()
  const { palette } = useSport()
  const reduce = useReducedMotion()
  const recordPress = useSharedValue(0)

  const recordStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : 1 - recordPress.value * 0.08 }],
  }))

  const ordered = ORDER.map((n) => state.routes.find((r) => r.name === n)).filter(Boolean) as typeof state.routes

  const go = (route: (typeof state.routes)[number], focused: boolean) => () => {
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true })
    if (focused || event.defaultPrevented) return
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {})
    navigation.navigate(route.name, route.params)
  }

  const left = ordered.slice(0, 2)
  const right = ordered.slice(2)

  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, Space.md) }]} accessibilityRole="tablist">
      <View style={[styles.bar, Shadow.lg]}>
        {left.map((route) => (
          <TabItem
            key={route.key}
            name={route.name}
            focused={state.routes[state.index]?.key === route.key}
            tint={palette.ink}
            soft={palette.soft}
            onPress={go(route, state.routes[state.index]?.key === route.key)}
          />
        ))}

        <View style={styles.recordSlot}>
          <Animated.View style={recordStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Record a session"
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
                router.push("/record")
              }}
              onPressIn={() => {
                recordPress.value = withTiming(1, { duration: Motion.quick })
              }}
              onPressOut={() => {
                recordPress.value = withTiming(0, { duration: Motion.base, easing: BACK })
              }}
              style={[styles.record, { backgroundColor: palette.accent }, Shadow.md]}
            >
              <Icon name="record" size={24} color="#FFFFFF" weight={1.9} />
            </Pressable>
          </Animated.View>
        </View>

        {right.map((route) => (
          <TabItem
            key={route.key}
            name={route.name}
            focused={state.routes[state.index]?.key === route.key}
            tint={palette.ink}
            soft={palette.soft}
            onPress={go(route, state.routes[state.index]?.key === route.key)}
          />
        ))}
      </View>
    </View>
  )
})

const renderTabBar = (props: TabBarProps) => <TabBar {...props} />

export default function TabLayout() {
  const onboarded = useUserStore((s) => s.isOnboardingDone)
  if (!onboarded) return <Redirect href="/splash" />

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: Paper.canvas } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="sports" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="compare" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}

/** Screens add this much bottom padding so content clears the floating bar. */
export const TAB_BAR_CLEARANCE = 96

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Space.lg,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 68,
    borderRadius: Radius.pill,
    backgroundColor: Paper.veilStrong,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52 },
  iconWrap: { alignItems: "center", justifyContent: "center", height: 30 },
  pill: { position: "absolute", width: 46, height: 30, borderRadius: Radius.pill },
  label: { fontFamily: Fonts.bodyMed, fontSize: 10.5, letterSpacing: 0.1, marginTop: 1, textAlign: "center" },
  recordSlot: { width: 72, alignItems: "center", justifyContent: "center" },
  record: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
})
