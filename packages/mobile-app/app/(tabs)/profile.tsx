import { StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { Badge, Divider, Note, SectionHead } from "../../src/components/ui/Bits"
import { Group, Row } from "../../src/components/ui/Form"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, IconButton, Tappable } from "../../src/components/ui/Press"
import { Stat } from "../../src/components/ui/Stat"
import { Card, Page } from "../../src/components/ui/Surface"
import { ALL_SESSIONS } from "../../src/data/demo"
import { useSpeed, useSport } from "../../src/hooks/useSport"
import { shortDate } from "../../src/lib/format"
import { getSport, type SportId } from "../../src/sports"
import { useUserStore } from "../../src/store/userStore"
import type { SessionSummary } from "../../src/types"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

/** Content padding that clears the floating tab bar. */
const TAB_CLEARANCE = 96

/** How many sport tiles fit before the rest live behind "All sports". */
const GALLERY_LIMIT = 6

function summarise() {
  const counts = new Map<SportId, number>()
  let seconds = 0
  let best: SessionSummary | null = null

  for (const session of ALL_SESSIONS) {
    seconds += session.duration_seconds
    counts.set(session.sport, (counts.get(session.sport) ?? 0) + 1)
    if (!best || session.max_speed_kmh > best.max_speed_kmh) best = session
  }

  // Busiest sport first; the id breaks ties so the gallery never reshuffles
  // between renders on two sports with the same count.
  const gallery = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ sport: getSport(id), count }))

  return { sessions: ALL_SESSIONS.length, hours: seconds / 3600, gallery, best }
}

/**
 * ALL_SESSIONS is a module constant generated once at import, so the roll-up
 * is too — there is nothing here for a hook to recompute.
 */
const TOTALS = summarise()

const openLogin = () => router.push("/login")
const openSettings = () => router.push("/settings")
const openAbout = () => router.push("/settings/about")
const openDrills = () => router.push("/drills")
const openSports = () => router.push("/(tabs)/sports")
const openSport = (id: SportId) => () => router.push({ pathname: "/sport/[id]", params: { id } })

export default function ProfileScreen() {
  const sport = useSport()
  const { palette } = sport
  const { format, unit } = useSpeed()
  const profile = useUserStore((s) => s.profile)
  const isAuthenticated = useUserStore((s) => s.isAuthenticated)

  const name = profile?.name ?? "Guest"
  const best = TOTALS.best

  return (
    <Page palette={palette} intensity={0.8} bottomInset={TAB_CLEARANCE}>
      <Reveal style={styles.nav}>
        <View style={styles.navText}>
          <Text style={Type.kicker}>Your account</Text>
          <Text style={Type.title} accessibilityRole="header">
            You
          </Text>
        </View>
        <IconButton name="settings" label="Open settings" palette={palette} onPress={openSettings} />
      </Reveal>

      <Reveal index={1} style={styles.block}>
        <Card variant="glass" elevation="sm">
          <View style={styles.identity}>
            {/* Decorative: the name sits right beside it, so don't read the initial twice. */}
            <View
              style={[styles.avatar, { backgroundColor: palette.accent }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={Type.title} numberOfLines={1}>
                {name}
              </Text>
              <Text style={Type.small}>
                {isAuthenticated
                  ? "Signed in. Your sessions still live on this phone."
                  : "Not signed in. Everything you do stays on this phone."}
              </Text>
            </View>
          </View>
          {isAuthenticated ? null : (
            <Button
              label="Sign in"
              palette={palette}
              icon="user"
              full
              style={styles.identityCta}
              onPress={openLogin}
            />
          )}
        </Card>
      </Reveal>

      <Reveal index={2} style={styles.block}>
        <SectionHead
          kicker="Sample data"
          title="Your totals"
          caption="Sample sessions for every sport, so there is something to explore before any footage has been analysed."
          palette={palette}
        />
        <Card elevation="md" style={styles.totals}>
          <View style={styles.totalsHead}>
            <Text style={Type.subhead}>Everything in the sample set</Text>
            <Badge label="Sample" tone="accent" palette={palette} dot />
          </View>

          <View style={styles.grid}>
            <Stat label="Sessions" value={TOTALS.sessions} size="lg" style={styles.cell} />
            <Stat label="Hours logged" value={TOTALS.hours} decimals={1} size="lg" delay={90} style={styles.cell} />
            <Stat label="Sports covered" value={TOTALS.gallery.length} size="lg" delay={180} style={styles.cell} />
            <Stat
              label="Fastest"
              value={best ? format(best.max_speed_kmh) : "—"}
              unit={best ? unit : undefined}
              size="lg"
              delay={270}
              style={styles.cell}
            />
          </View>

          {best ? (
            <>
              <Divider style={styles.totalsRule} />
              <Text style={Type.small}>
                That top reading sits in a {getSport(best.sport).name.toLowerCase()} session dated{" "}
                {shortDate(best.created_at)}. Generated, not recorded.
              </Text>
            </>
          ) : null}
        </Card>
      </Reveal>

      <Reveal index={3} style={styles.block}>
        <SectionHead
          title="Sports in the set"
          caption={`${TOTALS.gallery.length} sports carry sample sessions. Tap one to see what it will report.`}
          action={{ label: "All sports", onPress: openSports }}
          palette={palette}
        />
        <View style={styles.gallery}>
          {TOTALS.gallery.slice(0, GALLERY_LIMIT).map(({ sport: entry, count }) => (
            <Tappable
              key={entry.id}
              label={`${entry.name}, ${count} sample ${count === 1 ? "session" : "sessions"}`}
              onPress={openSport(entry.id)}
              style={styles.tileSlot}
            >
              <Card variant="tint" palette={entry.palette} elevation="sm" padded={false} style={styles.tile}>
                <View style={styles.tileCode}>
                  <Text style={[styles.tileCodeText, { color: entry.palette.deep }]}>{entry.code}</Text>
                </View>
                <Text style={Type.subhead} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={Type.small}>
                  {count} sample {count === 1 ? "session" : "sessions"}
                </Text>
              </Card>
            </Tappable>
          ))}
        </View>
      </Reveal>

      <Reveal index={4} style={styles.block}>
        <Group title="More">
          <Row
            title="Settings"
            caption="Sport, units, capture and what the camera draws on screen"
            icon="settings"
            palette={palette}
            onPress={openSettings}
          />
          <Divider />
          <Row
            title="Drills"
            caption={`Practice plans for ${sport.name.toLowerCase()}`}
            icon="trophy"
            palette={palette}
            onPress={openDrills}
          />
          <Divider />
          <Row
            title="About & privacy"
            caption="What Ayto stores, and where it goes"
            icon="shield"
            palette={palette}
            onPress={openAbout}
          />
        </Group>
      </Reveal>

      <Reveal index={5}>
        <Note palette={palette}>
          Nothing on this screen was measured. No clip has been analysed and no model has run yet — every number here
          comes from sample sessions, so you can see the shape of a season before analysis ships.
        </Note>
      </Reveal>
    </Page>
  )
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "flex-end", gap: Space.md, marginBottom: Space.xl },
  navText: { flex: 1 },
  block: { marginBottom: Space.xl },
  identity: { flexDirection: "row", alignItems: "center", gap: Space.lg },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: Fonts.displayBold, fontSize: 25, color: "#FFFFFF" },
  identityText: { flex: 1, gap: 2 },
  identityCta: { marginTop: Space.lg },
  totals: { marginTop: Space.lg },
  totalsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: Space.lg, rowGap: Space.xl, columnGap: Space.md },
  cell: { flexBasis: "46%", flexGrow: 1 },
  totalsRule: { marginVertical: Space.lg },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: Space.md, marginTop: Space.lg },
  tileSlot: { flexBasis: "47%", flexGrow: 1 },
  tile: { padding: Space.lg, borderRadius: Radius.lg, gap: 2 },
  tileCode: {
    alignSelf: "flex-start",
    backgroundColor: Paper.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    marginBottom: Space.sm,
  },
  tileCodeText: { fontFamily: Fonts.bodySemi, fontSize: 10, letterSpacing: 0.6 },
})
