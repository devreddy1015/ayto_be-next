import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { Colors } from "../theme"
import CameraScreen from "../screens/CameraScreen"
import DashboardScreen from "../screens/DashboardScreen"
import HomeScreen from "../screens/HomeScreen"
import ResultsScreen from "../screens/ResultsScreen"

const Stack = createNativeStackNavigator()

function BottomTabs({ state, navigation }: any) {
  const tabs = [
    { name: "HomeTab", label: "Home", icon: "⌂", screen: "Home" },
    { name: "RecordTab", label: "Record", icon: "⦿", screen: "Camera" },
    { name: "HistoryTab", label: "History", icon: "☰", screen: "Dashboard" },
    { name: "ProfileTab", label: "Profile", icon: "◉", screen: "Home" },
  ]

  const currentRoute = state?.routes?.[state.index]?.name || "Home"
  const activeMap: Record<string, string> = {
    Home: "HomeTab",
    Camera: "RecordTab",
    Dashboard: "HistoryTab",
  }
  const activeTab = activeMap[currentRoute] || "HomeTab"

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.navItem}
            onPress={() => navigation.navigate(tab.screen)}
          >
            <Text style={[styles.navIcon, isActive && styles.navIconActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.navIndicator} />}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
        <Stack.Screen name="Results" component={ResultsScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export { BottomTabs }

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(10,10,15,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingBottom: 30,
    paddingTop: 10,
    paddingHorizontal: 24,
  },
  navItem: {
    alignItems: "center",
    paddingTop: 8,
    width: 60,
  },
  navIcon: {
    fontSize: 18,
    color: "rgba(255,255,255,0.35)",
  },
  navIconActive: {
    color: Colors.primary,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.35)",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  navLabelActive: {
    color: Colors.primary,
  },
  navIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
})
