import React from "react"
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

const settings = [
  { label: "Analysis mode", value: "On-device beta" },
  { label: "Recording quality", value: "720p / 60fps" },
  { label: "Cloud sync", value: "Manual" },
  { label: "Dataset consent", value: "Ask each upload" },
]

export default function SettingsScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{"<"}</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>Athlete profile</Text>
            <Text style={styles.title}>Settings</Text>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>Ayto athlete</Text>
            <Text style={styles.profileMeta}>Right-handed singles player</Text>
          </View>
        </View>

        {settings.map((item) => (
          <View key={item.label} style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Text style={styles.settingValue}>{item.value}</Text>
            </View>
            <View style={styles.chevron}>
              <Text style={styles.chevronText}>{">"}</Text>
            </View>
          </View>
        ))}

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Privacy default</Text>
          <Text style={styles.noticeText}>
            Session video stays local unless you choose to sync or contribute a labelled clip.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#10110f" },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
  },
  backText: { color: "#f4f1e8", fontSize: 24, fontWeight: "900" },
  kicker: { color: "#9fa89c", fontSize: 12, fontWeight: "700" },
  title: { color: "#f4f1e8", fontSize: 29, fontWeight: "900", marginTop: 2 },
  profileCard: {
    borderRadius: 8,
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#cffc46",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#10110f", fontSize: 22, fontWeight: "900" },
  profileCopy: { flex: 1 },
  profileName: { color: "#f4f1e8", fontSize: 18, fontWeight: "900" },
  profileMeta: { color: "#9fa89c", fontSize: 13, marginTop: 3, fontWeight: "700" },
  settingRow: {
    borderRadius: 8,
    backgroundColor: "#181b17",
    borderWidth: 1,
    borderColor: "#30382d",
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingLabel: { color: "#9fa89c", fontSize: 12, fontWeight: "800" },
  settingValue: { color: "#f4f1e8", fontSize: 16, fontWeight: "900", marginTop: 3 },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#242820",
    alignItems: "center",
    justifyContent: "center",
  },
  chevronText: { color: "#cffc46", fontWeight: "900" },
  noticeCard: {
    borderRadius: 8,
    backgroundColor: "#cffc46",
    padding: 16,
    marginTop: 4,
  },
  noticeTitle: { color: "#10110f", fontSize: 18, fontWeight: "900" },
  noticeText: { color: "#202412", fontSize: 14, lineHeight: 21, marginTop: 8, fontWeight: "700" },
})
