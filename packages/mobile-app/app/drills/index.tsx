import React, { useState, useMemo } from "react"
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native"
import { router } from "expo-router"
import { Colors, Spacing, Radius } from "../../src/theme"
import Card from "../../src/components/ui/Card"
import Badge from "../../src/components/ui/Badge"
import type { StrokeType } from "../../src/types"

interface DrillItem {
  id: string
  title: string
  category: StrokeType
  difficulty: "beginner" | "intermediate" | "advanced"
  duration_minutes: number
  description: string
  steps: string[]
  equipment: string[]
  benefits: string[]
}

const DRILLS: DrillItem[] = [
  { id: "1", title: "Smash Accuracy: Cones", category: "smash", difficulty: "intermediate", duration_minutes: 15, description: "Place 6 cones in the back corners. Practice smashing to each cone position with accuracy.", steps: ["Set up 3 cones in each back corner", "Stand at mid-court", "Smash to each cone position", "Track how many hit the target zone"], equipment: ["Cones", "Shuttlecocks"], benefits: ["Improves smash accuracy", "Builds power control", "Develops spatial awareness"] },
  { id: "2", title: "Drop Shot Precision", category: "drop", difficulty: "beginner", duration_minutes: 10, description: "Practice drop shots from the baseline aiming for the service line. Focus on gentle slice and short follow-through.", steps: ["Stand at baseline", "Partner feeds shuttles", "Drop shot to service line area", "Aim for within 50cm of net"], equipment: ["Partner or feeder", "12+ shuttlecocks"], benefits: ["Improves touch and feel", "Better net clearance", "Consistent drop mechanics"] },
  { id: "3", title: "Clear Height Challenge", category: "clear", difficulty: "intermediate", duration_minutes: 12, description: "Hit clears that must pass above a string or marker set at 4m height. Focus on full body rotation and wrist snap.", steps: ["Set up height marker", "Stand at baseline", "Hit clears above the marker", "Land within 1m of baseline"], equipment: ["String/rope", "Poles or stands", "Shuttlecocks"], benefits: ["Improves clear height", "Better power transfer", "Consistent trajectory"] },
  { id: "4", title: "Net Play: Wall Drill", category: "net", difficulty: "beginner", duration_minutes: 8, description: "Stand close to a wall and practice net shots with quick wrist flicks. Focus on racket head speed and control.", steps: ["Stand 30cm from wall", "Use wrist only - no arm", "Tap shuttle against wall repeatedly", "Count consecutive hits"], equipment: ["Wall", "Shuttlecock"], benefits: ["Quick wrist development", "Net touch improvement", "Hand-eye coordination"] },
  { id: "5", title: "Serve Consistency", category: "serve", difficulty: "beginner", duration_minutes: 10, description: "Serve 50 shuttles aiming for the service line. Track how many land within the zone. Focus on relaxed grip.", steps: ["Mark target zones on court", "Serve 50 shuttles", "Count zone accuracy", "Adjust grip for control"], equipment: ["25+ shuttlecocks", "Target markers"], benefits: ["Serve consistency", "Match-readiness", "Mental focus"] },
  { id: "6", title: "Defensive Footwork", category: "defensive", difficulty: "advanced", duration_minutes: 20, description: "Partner smashes while you practice defensive returns. Focus on low stance, quick reactions, and wrist blocks.", steps: ["Start in defensive stance", "Partner smashes from front", "Block/redirect returns", "Recover to center after each"], equipment: ["Partner", "Shuttlecocks"], benefits: ["Reaction speed", "Defensive positioning", "Wrist strength"] },
  { id: "7", title: "Shadow Footwork", category: "clear", difficulty: "intermediate", duration_minutes: 15, description: "Practice movement patterns without a shuttle. Cover all 6 corners of the court in sequence. Maintain low center of gravity.", steps: ["Start at center", "Move to front-right, back to center", "Front-left, back to center", "Repeat for all 6 corners", "Increase speed each round"], equipment: ["Court space", "Timer"], benefits: ["Court coverage", "Stamina", "Movement efficiency"] },
  { id: "8", title: "Smash Power: Resistance", category: "smash", difficulty: "advanced", duration_minutes: 20, description: "Use resistance bands to build smash power. Focus on explosive shoulder rotation and wrist snap at contact point.", steps: ["Attach band to racket arm", "Practice swing with resistance", "5 explosive smashes, 30s rest", "10 sets total"], equipment: ["Resistance band", "Anchor point", "Racket"], benefits: ["Explosive power", "Shoulder strength", "Wrist snap velocity"] },
  { id: "9", title: "Multi-shuttle Drop", category: "drop", difficulty: "intermediate", duration_minutes: 12, description: "Partner feeds 20 shuttles rapidly. Execute drop shots to alternating corners. Focus on deception and disguise.", steps: ["Partner at net with 20 shuttles", "Rapid feed - one every 3s", "Alternate drop direction", "Maintain same preparation"], equipment: ["Partner", "20 shuttlecocks"], benefits: ["Shot deception", "Quick decision-making", "Consistency under pressure"] },
  { id: "10", title: "Endurance Rally", category: "drive", difficulty: "advanced", duration_minutes: 15, description: "Continuous rally with partner at high speed. Focus on flat drives and maintaining rally pace for full 15 minutes.", steps: ["Partner across net", "Continuous fast rally", "No drops or clears - drives only", "Minimize unforced errors"], equipment: ["Partner", "Shuttlecock"], benefits: ["Cardiovascular endurance", "Shot consistency", "Match stamina"] },
]

const FILTERS = {
  category: ["all", "smash", "drop", "clear", "net", "serve", "defensive", "drive"],
  difficulty: ["all", "beginner", "intermediate", "advanced"],
}

export default function DrillsScreen() {
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [expandedDrill, setExpandedDrill] = useState<string | null>(null)

  const filteredDrills = useMemo(() => {
    return DRILLS.filter((d) => {
      if (selectedCategory !== "all" && d.category !== selectedCategory) return false
      if (selectedDifficulty !== "all" && d.difficulty !== selectedDifficulty) return false
      return true
    })
  }, [selectedCategory, selectedDifficulty])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Drill Library</Text>
          <Text style={styles.subtitle}>{DRILLS.length} curated drills</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTERS.category.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterPill, selectedCategory === cat && styles.filterPillActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>
              {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterDivider} />
        {FILTERS.difficulty.map((diff) => (
          <TouchableOpacity
            key={diff}
            style={[styles.filterPill, selectedDifficulty === diff && styles.filterPillActive]}
            onPress={() => setSelectedDifficulty(diff)}
          >
            <Text style={[styles.filterText, selectedDifficulty === diff && styles.filterTextActive]}>
              {diff === "all" ? "All Levels" : diff.charAt(0).toUpperCase() + diff.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Drills List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {filteredDrills.map((drill) => {
          const isExpanded = expandedDrill === drill.id
          return (
            <Card key={drill.id} variant="surface" style={styles.drillCard}>
              <TouchableOpacity
                onPress={() => setExpandedDrill(isExpanded ? null : drill.id)}
                activeOpacity={0.8}
              >
                <View style={styles.drillHeader}>
                  <View style={styles.drillHeaderLeft}>
                    <Text style={styles.drillTitle}>{drill.title}</Text>
                    <View style={styles.drillTags}>
                      <Badge label={drill.category} type={drill.category} size="sm" />
                      <Text style={styles.drillDuration}>{drill.duration_minutes} min</Text>
                      <View style={[styles.diffDot, {
                        backgroundColor: drill.difficulty === "beginner" ? Colors.accent_green : drill.difficulty === "intermediate" ? Colors.accent_amber : Colors.accent_coral,
                      }]} />
                    </View>
                  </View>
                  <Text style={styles.expandIcon}>{isExpanded ? "−" : "+"}</Text>
                </View>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    <Text style={styles.drillDescription}>{drill.description}</Text>

                    <Text style={styles.subSectionTitle}>STEPS</Text>
                    {drill.steps.map((step, i) => (
                      <View key={i} style={styles.stepRow}>
                        <Text style={styles.stepNumber}>{i + 1}</Text>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}

                    <Text style={styles.subSectionTitle}>EQUIPMENT</Text>
                    <View style={styles.chipsRow}>
                      {drill.equipment.map((eq) => (
                        <View key={eq} style={styles.equipmentChip}>
                          <Text style={styles.equipmentText}>{eq}</Text>
                        </View>
                      ))}
                    </View>

                    <Text style={styles.subSectionTitle}>BENEFITS</Text>
                    {drill.benefits.map((b, i) => (
                      <View key={i} style={styles.benefitRow}>
                        <Text style={styles.benefitDot}>●</Text>
                        <Text style={styles.benefitText}>{b}</Text>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.startDrillButton}
                      onPress={() => router.push("/record")}
                    >
                      <Text style={styles.startDrillText}>Start Drill Recording</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            </Card>
          )
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg_primary },
  header: { paddingTop: 60, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.bg_surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  backText: { color: Colors.text_primary, fontSize: 18, fontWeight: "300" },
  title: { fontSize: 22, fontWeight: "800", color: Colors.text_primary },
  subtitle: { fontSize: 12, color: Colors.text_secondary, marginTop: 2 },
  filterRow: { paddingHorizontal: Spacing.lg, maxHeight: 40, marginBottom: Spacing.md },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bg_surface, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  filterPillActive: { backgroundColor: Colors.accent_green, borderColor: Colors.accent_green },
  filterText: { fontSize: 12, fontWeight: "600", color: Colors.text_secondary },
  filterTextActive: { color: Colors.bg_primary },
  filterDivider: { width: 1, height: 24, backgroundColor: Colors.border, alignSelf: "center", marginHorizontal: 4 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  drillCard: { marginBottom: 10, padding: Spacing.md },
  drillHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  drillHeaderLeft: { flex: 1, gap: 8 },
  drillTitle: { fontSize: 16, fontWeight: "700", color: Colors.text_primary },
  drillTags: { flexDirection: "row", alignItems: "center", gap: 8 },
  drillDuration: { fontSize: 11, fontWeight: "600", color: Colors.text_secondary },
  diffDot: { width: 8, height: 8, borderRadius: 4 },
  expandIcon: { fontSize: 20, fontWeight: "700", color: Colors.text_secondary, width: 28, textAlign: "center" },
  expandedContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  drillDescription: { fontSize: 13, color: Colors.text_secondary, lineHeight: 20, marginBottom: Spacing.md },
  subSectionTitle: { fontSize: 10, fontWeight: "700", color: Colors.text_secondary, letterSpacing: 2, marginBottom: 8, marginTop: 8 },
  stepRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  stepNumber: { fontSize: 12, fontWeight: "700", color: Colors.accent_green, width: 20 },
  stepText: { fontSize: 12, color: Colors.text_secondary, flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  equipmentChip: { backgroundColor: Colors.bg_elevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  equipmentText: { fontSize: 11, fontWeight: "600", color: Colors.text_secondary },
  benefitRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  benefitDot: { fontSize: 8, color: Colors.accent_green, marginTop: 4 },
  benefitText: { fontSize: 12, color: Colors.text_secondary },
  startDrillButton: { marginTop: Spacing.md, backgroundColor: Colors.accent_green, borderRadius: Radius.lg, padding: 14, alignItems: "center" },
  startDrillText: { fontSize: 14, fontWeight: "700", color: Colors.bg_primary, letterSpacing: 1 },
})
