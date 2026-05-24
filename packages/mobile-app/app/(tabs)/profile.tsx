import React, { useState } from "react"
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from "react-native"
import { Colors, Spacing, Radius } from "../../src/theme"
import { useUserStore } from "../../src/store/userStore"
import { signOut } from "../../src/lib/supabase"
import Card from "../../src/components/ui/Card"
import Button from "../../src/components/ui/Button"
import Skeleton from "../../src/components/ui/Skeleton"

export default function ProfileScreen() {
  const {
    profile,
    isAuthenticated,
    unitPreference,
    setUnitPreference,
    overlaySettings,
    setOverlaySettings,
    signOut: storeSignOut,
  } = useUserStore()

  const [loading, setLoading] = useState(true)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  const name = profile?.name || "Ayto Athlete"
  const initials = name.split(" ").map((n) => n.charAt(0).toUpperCase()).join("")

  const stats = [
    { label: "Sessions", value: "42" },
    { label: "Hours", value: "18.5" },
    { label: "Sports", value: "3" },
  ]

  const handleSignOut = async () => {
    await signOut()
    storeSignOut()
  }

  const sports = ["Badminton", "Tennis", "Table Tennis", "Squash"]

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.playerName}>{name}</Text>
          <Text style={styles.playerLabel}>Badminton · Right-handed</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              {loading ? (
                <Skeleton height={28} width={40} borderRadius={8} style={{ marginBottom: 4 }} />
              ) : (
                <Text style={styles.statValue}>{stat.value}</Text>
              )}
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Sports */}
        <Text style={styles.sectionTitle}>SPORTS YOU PLAY</Text>
        <View style={styles.sportsRow}>
          {sports.map((sport) => (
            <TouchableOpacity
              key={sport}
              style={[styles.sportChip, sport === "Badminton" && styles.sportChipActive]}
            >
              <Text style={[styles.sportChipText, sport === "Badminton" && styles.sportChipTextActive]}>
                {sport}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Unit Preference */}
        <Card variant="surface" style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Unit Preference</Text>
              <Text style={styles.settingDesc}>Speed measurement unit</Text>
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                style={[styles.unitOption, unitPreference === "kmh" && styles.unitOptionActive]}
                onPress={() => setUnitPreference("kmh")}
              >
                <Text style={[styles.unitText, unitPreference === "kmh" && styles.unitTextActive]}>
                  km/h
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitOption, unitPreference === "mph" && styles.unitOptionActive]}
                onPress={() => setUnitPreference("mph")}
              >
                <Text style={[styles.unitText, unitPreference === "mph" && styles.unitTextActive]}>
                  mph
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        {/* Overlay Settings */}
        <Card variant="surface" style={styles.settingCard}>
          <Text style={styles.sectionTitle}>HUD OVERLAY</Text>
          {[
            { key: "showSpeedBadge", label: "Speed Badge" },
            { key: "showStrokeLabel", label: "Stroke Label" },
            { key: "showSkeleton", label: "Pose Skeleton" },
            { key: "showCourtGrid", label: "Court Grid" },
          ].map(({ key, label }) => (
            <View key={key} style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{label}</Text>
              <Switch
                value={overlaySettings[key as keyof typeof overlaySettings]}
                onValueChange={(v) => setOverlaySettings({ [key]: v })}
                trackColor={{ false: Colors.bg_elevated, true: Colors.accent_green + "40" }}
                thumbColor={overlaySettings[key as keyof typeof overlaySettings] ? Colors.accent_green : Colors.text_secondary}
                ios_backgroundColor={Colors.bg_elevated}
              />
            </View>
          ))}
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button title="Export My Data" onPress={() => {}} variant="secondary" fullWidth />
          {showSignOutConfirm ? (
            <View style={styles.signOutConfirm}>
              <Text style={styles.confirmText}>Are you sure you want to sign out?</Text>
              <View style={styles.confirmButtons}>
                <Button title="Cancel" onPress={() => setShowSignOutConfirm(false)} variant="ghost" size="sm" />
                <Button title="Sign Out" onPress={handleSignOut} variant="danger" size="sm" />
              </View>
            </View>
          ) : (
            <Button title="Sign Out" onPress={() => setShowSignOutConfirm(true)} variant="outline" fullWidth />
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Ayto SportIQ v1.0.0</Text>
        <Text style={styles.footerSub}>Built with ❤️ in India</Text>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg_primary },
  scroll: { paddingTop: 60 },
  header: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  title: { fontSize: 28, fontWeight: "800", color: Colors.text_primary },
  avatarSection: { alignItems: "center", marginBottom: Spacing.xl },
  avatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: Colors.accent_green,
    padding: 3,
    marginBottom: 16,
  },
  avatar: {
    flex: 1,
    borderRadius: 42,
    backgroundColor: "rgba(0,255,135,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 24, fontWeight: "800", color: Colors.accent_green },
  playerName: { fontSize: 22, fontWeight: "800", color: Colors.text_primary, marginBottom: 4 },
  playerLabel: { fontSize: 13, color: Colors.text_secondary },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.lg, gap: 8, marginBottom: Spacing.xl },
  statCard: { flex: 1, backgroundColor: Colors.bg_surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "800", color: Colors.text_primary, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 10, fontWeight: "600", color: Colors.text_secondary, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  sectionTitle: { fontSize: 10, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 2, marginBottom: Spacing.md },
  sportsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  sportChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: Colors.bg_surface, borderWidth: 1, borderColor: Colors.border },
  sportChipActive: { backgroundColor: "rgba(0,255,135,0.08)", borderColor: Colors.accent_green },
  sportChipText: { fontSize: 13, fontWeight: "600", color: Colors.text_secondary },
  sportChipTextActive: { color: Colors.accent_green },
  settingCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, padding: Spacing.md },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  settingLabel: { fontSize: 14, fontWeight: "600", color: Colors.text_primary },
  settingDesc: { fontSize: 11, color: Colors.text_secondary, marginTop: 2 },
  unitToggle: { flexDirection: "row", backgroundColor: Colors.bg_elevated, borderRadius: Radius.full, padding: 3 },
  unitOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full },
  unitOptionActive: { backgroundColor: Colors.accent_green },
  unitText: { fontSize: 12, fontWeight: "700", color: Colors.text_secondary },
  unitTextActive: { color: Colors.bg_primary },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  toggleLabel: { fontSize: 14, fontWeight: "500", color: Colors.text_secondary },
  actions: { paddingHorizontal: Spacing.lg, gap: 12, marginTop: Spacing.lg },
  signOutConfirm: { backgroundColor: "rgba(255,107,107,0.05)", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(255,107,107,0.15)" },
  confirmText: { fontSize: 13, color: Colors.text_secondary, textAlign: "center", marginBottom: 10 },
  confirmButtons: { flexDirection: "row", justifyContent: "center", gap: 12 },
  footer: { textAlign: "center", fontSize: 11, color: Colors.text_secondary, marginTop: Spacing.xl, opacity: 0.5 },
  footerSub: { textAlign: "center", fontSize: 11, color: Colors.text_secondary, opacity: 0.4 },
})
