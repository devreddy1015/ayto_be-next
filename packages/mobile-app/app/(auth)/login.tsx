import { useCallback, useState } from "react"
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "../../src/components/riso/RisoSurface"
import { SweepHeading } from "../../src/components/riso/SweepHeading"
import Button from "../../src/components/ui/Button"
import Input from "../../src/components/ui/Input"
import { useSport } from "../../src/hooks/useSport"
import { signInWithEmail, signInWithPassword, signUpWithPassword } from "../../src/lib/supabase"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Space, Type } from "../../src/theme"

type Mode = "signin" | "signup"
type Errors = Partial<Record<"name" | "email" | "password" | "confirm" | "form", string>>

const HEADINGS: Record<Mode, readonly string[]> = {
  signin: ["Welcome", "back."],
  signup: ["Make an", "account."],
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const { palette } = useSport()
  const signIn = useUserStore((s) => s.signIn)
  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const switchMode = useCallback((next: Mode) => {
    setMode(next)
    setErrors({})
  }, [])

  const validate = (): boolean => {
    const next: Errors = {}
    if (!email.includes("@")) next.email = "Enter a valid email"
    if (password.length < 6) next.password = "At least 6 characters"
    if (mode === "signup") {
      if (!name.trim()) next.name = "Your name, please"
      if (password !== confirm) next.confirm = "Passwords don't match"
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      if (mode === "signin") {
        const { data, error } = await signInWithPassword(email, password)
        if (error) throw error
        if (data.user) {
          const metaName = data.user.user_metadata?.name
          signIn({ id: data.user.id, name: typeof metaName === "string" && metaName ? metaName : email.split("@")[0] })
        }
        router.replace("/(tabs)")
      } else {
        const { error } = await signUpWithPassword(email, password, name.trim())
        if (error) throw error
        Alert.alert("Check your email", "We've sent you a confirmation link.")
      }
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong" })
    } finally {
      setLoading(false)
    }
  }

  const magicLink = async () => {
    if (!email.includes("@")) {
      setErrors({ email: "Enter a valid email" })
      return
    }
    setLoading(true)
    const { error } = await signInWithEmail(email)
    setLoading(false)
    if (error) setErrors({ form: error.message })
    else Alert.alert("Magic link sent", "Check your email to sign in.")
  }

  const clear = (key: keyof Errors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))

  return (
    <Screen palette={palette}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Space.xl, paddingBottom: insets.bottom + Space.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[Type.kicker, styles.kicker]}>Ayto · SportIQ</Text>
          <SweepHeading key={mode} lines={HEADINGS[mode]} palette={palette} size="title" />

          <View style={styles.modes} accessibilityRole="tablist">
            {(["signin", "signup"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                style={[styles.mode, mode === m && { borderBottomColor: palette.plate }]}
              >
                <Text style={[styles.modeText, mode === m && { color: Paper.text }]}>
                  {m === "signin" ? "Sign in" : "Sign up"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "signup" ? (
            <Input
              label="Name"
              placeholder="Your name"
              value={name}
              accent={palette.plate}
              onChangeText={(t) => {
                setName(t)
                clear("name")
              }}
              error={errors.name}
              autoCapitalize="words"
              autoComplete="name"
            />
          ) : null}
          <Input
            label="Email"
            placeholder="you@email.com"
            value={email}
            accent={palette.plate}
            onChangeText={(t) => {
              setEmail(t)
              clear("email")
            }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Input
            label="Password"
            placeholder="At least 6 characters"
            value={password}
            accent={palette.plate}
            onChangeText={(t) => {
              setPassword(t)
              clear("password")
            }}
            error={errors.password}
            secureTextEntry
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          {mode === "signup" ? (
            <Input
              label="Confirm password"
              placeholder="Type it again"
              value={confirm}
              accent={palette.plate}
              onChangeText={(t) => {
                setConfirm(t)
                clear("confirm")
              }}
              error={errors.confirm}
              secureTextEntry
              autoComplete="new-password"
            />
          ) : null}

          {errors.form ? (
            <Text style={styles.formError} accessibilityRole="alert">
              {errors.form}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={mode === "signin" ? "Sign in" : "Create account"}
              palette={palette}
              size="lg"
              full
              loading={loading}
              onPress={submit}
            />
            <Button label="Email me a magic link" palette={palette} variant="outline" full onPress={magicLink} />
            <Button
              label="Continue without an account"
              palette={palette}
              variant="ghost"
              full
              onPress={() => router.replace("/(tabs)")}
            />
          </View>

          <Text style={[Type.small, styles.footer]}>All analysis runs on-device. Your video never leaves your phone.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Space.gutter, maxWidth: 520, width: "100%", alignSelf: "center" },
  kicker: { marginBottom: Space.lg },
  modes: { flexDirection: "row", marginTop: Space.xl, marginBottom: Space.xl, borderBottomWidth: 1, borderBottomColor: Paper.rule },
  mode: { paddingVertical: Space.md, marginRight: Space.xl, borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -1 },
  modeText: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: Paper.muted },
  formError: { fontFamily: Fonts.mono, fontSize: 12, color: Paper.danger, marginBottom: Space.md },
  actions: { gap: Space.md, marginTop: Space.sm },
  footer: { textAlign: "center", marginTop: Space.xl },
})
