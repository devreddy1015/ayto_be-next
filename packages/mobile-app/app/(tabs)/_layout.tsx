import { memo, type ComponentProps } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Redirect, Tabs } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useSport } from "../../src/hooks/useSport"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Space } from "../../src/theme"

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0]

const LABELS: Record<string, string> = {
  index: "Home",
  sports: "Sports",
  history: "History",
  compare: "Compare",
  profile: "Profile",
}

/** Masthead-style tab bar: mono labels, the active one printed on an ink plate. */
const RisoTabBar = memo(function RisoTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets()
  const { palette } = useSport()
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Space.sm) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const focused = state.index === index
        const label = LABELS[route.name] ?? route.name
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params)
        }
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={styles.item}
          >
            <View style={[styles.plate, focused && { backgroundColor: palette.plate }]}>
              <Text style={[styles.label, { color: focused ? palette.onPlate : Paper.muted }]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
})

const renderTabBar = (props: TabBarProps) => <RisoTabBar {...props} />

export default function TabLayout() {
  const onboarded = useUserStore((s) => s.isOnboardingDone)
  if (!onboarded) return <Redirect href="/splash" />

  return (
    <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: Paper.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="sports" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="compare" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
    backgroundColor: Paper.bg,
    borderTopWidth: 1,
    borderTopColor: Paper.ruleStrong,
  },
  item: { flex: 1, alignItems: "center", minHeight: 44, justifyContent: "center" },
  plate: { paddingHorizontal: 6, paddingVertical: 6 },
  label: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
})
