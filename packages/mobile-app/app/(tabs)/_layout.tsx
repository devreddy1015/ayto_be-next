import { Tabs } from "expo-router"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { Colors, Radius } from "../../src/theme"

function TabBarIcon({ label, active }: { label: string; active: boolean }) {
  const icons: Record<string, string> = {
    Home: "⌂",
    History: "☰",
    Compare: "◈",
    Profile: "◉",
  }

  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, active && styles.tabIconActive]}>
        {icons[label] || "○"}
      </Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      {active && <View style={styles.tabIndicator} />}
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
      tabBar={(props) => {
        const { state, navigation } = props
        return (
          <View style={styles.tabBar}>
            {state.routes.map((route, index) => {
              const isActive = state.index === index
              const label = route.name === "index" ? "Home" : route.name.charAt(0).toUpperCase() + route.name.slice(1)

              return (
                <TouchableOpacity
                  key={route.key}
                  style={styles.tabItem}
                  onPress={() => navigation.navigate(route.name)}
                  activeOpacity={0.7}
                >
                  <TabBarIcon label={label} active={isActive} />
                </TouchableOpacity>
              )
            })}
          </View>
        )
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="compare" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(10,10,15,0.95)",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingBottom: 28,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 4,
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabIcon: {
    fontSize: 20,
    color: Colors.text_secondary,
  },
  tabIconActive: {
    color: Colors.accent_green,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.text_secondary,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: Colors.accent_green,
  },
  tabIndicator: {
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.accent_green,
    marginTop: 2,
  },
})
