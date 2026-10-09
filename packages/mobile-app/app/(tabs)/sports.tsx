import { useCallback, useMemo } from "react"
import { Platform, SectionList, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import { SportCard } from "../../src/components/sport/SportCard"
import { SectionHead } from "../../src/components/ui/SectionHead"
import { useSport } from "../../src/hooks/useSport"
import { pad2 } from "../../src/lib/format"
import { SECTIONS, SPORTS, type Sport, type SportId } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import { Space, Type } from "../../src/theme"

const NUMBER = new Map(SPORTS.map((sport, i) => [sport.id, i + 1]))
const LIVE_COUNT = SPORTS.filter((sport) => sport.status === "live").length

const openSport = (id: SportId) => router.push({ pathname: "/sport/[id]", params: { id } })

/** The collection: every sport printed as its own gallery plate. */
export default function SportsScreen() {
  const insets = useSafeAreaInsets()
  const current = useSport()
  const setSport = useUserStore((s) => s.setSportPreference)

  const sections = useMemo(
    () =>
      SECTIONS.map((section, i) => ({
        ...section,
        index: i,
        data: SPORTS.filter((sport) => sport.section === section.id),
      })).filter((section) => section.data.length > 0),
    [],
  )

  const renderItem = useCallback(
    ({ item, index }: { item: Sport; index: number }) => (
      <SportCard
        sport={item}
        number={NUMBER.get(item.id) ?? 0}
        isPrimary={item.id === current.id}
        onOpen={openSport}
        onMakePrimary={setSport}
        animate={index < 3}
      />
    ),
    [current.id, setSport],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: (typeof sections)[number] }) => (
      <View>
        <SectionHead
          kicker={`${pad2(section.index + 1)} / ${section.data.length} ${section.data.length === 1 ? "sport" : "sports"}`}
          title={section.title}
          palette={section.data[0].palette}
        />
        <Text style={[Type.small, styles.sectionDeck]}>{section.deck}</Text>
      </View>
    ),
    [],
  )

  return (
    <Screen palette={current.palette}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        initialNumToRender={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.lg }]}
        ListHeaderComponent={
          <View>
            <Text style={Type.kicker}>
              The collection · {pad2(SPORTS.length)} sports · {LIVE_COUNT} live
            </Text>
            <SweepHeading lines={["Every", "sport."]} palette={current.palette} size="hero" style={styles.hero} />
            <Text style={Type.deck}>
              One camera, every game. {SPORTS.find((s) => s.status === "live")?.name} is fully live today; the rest are
              labelled with exactly what's ready.
            </Text>
          </View>
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Space.gutter, paddingBottom: Space.xxxl, maxWidth: 720, width: "100%", alignSelf: "center" },
  hero: { marginVertical: Space.lg },
  sectionDeck: { marginTop: -Space.sm, marginBottom: Space.lg },
})
