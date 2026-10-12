import { useCallback, useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Note } from "../../src/components/ui/Bits"
import { Field } from "../../src/components/ui/Form"
import { Reveal } from "../../src/components/ui/Motion"
import { Button, IconButton } from "../../src/components/ui/Press"
import { Screen } from "../../src/components/ui/Surface"
import { useSport } from "../../src/hooks/useSport"
import { signInWithPassword, signUpWithPassword } from "../../src/lib/supabase"
import { useUserStore } from "../../src/store/userStore"
import { Fonts, Paper, Radius, Space, Type } from "../../src/theme"

type Mode = "signin" | "signup"
type Errors = Partial<Record<"name" | "email" | "password" | "confirm" | "form", string>>

const COPY: Record<Mode, { title: string; deck: string; cta: string; swap: string; swapCta: string }> = {
  signin: {
    title: "Welcome back.",
    deck: "Pick up where you left off.",
    cta: "Sign in",
    swap: "New here?",
    swapCta: "Create an account",
  },
  signup: {
    title: "Let's get you set up.",
    deck: "Your sessions stay on your phone unless you ask otherwise.",
    cta: "Create account",
    swap: "Already have an account?",
    swapCta: "Sign in",
  },
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

  const copy = COPY[mode]

  const switchMode = useCallback((next: Mode) => {
    setMode(next)
    setErrors({})
  }, [])

  // REPLACE on the root stack swaps (auth) for a *new* (tabs) route, leaving
  // the original tab navigator mounted underneath. Go back to the existing one
  // when there is one; onboarding has no (tabs) in the stack, so it replaces.
  const toTabs = () => {
    if (router.canGoBack()) router.back()
    else router.replace("/(tabs)")
  }

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
          signIn({
            id: data.user.id,
            name: typeof metaName === "string" && metaName ? metaName : email.split("@")[0],
          })
        }
        toTabs()
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

  const clear = (key: keyof Errors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))

  return (
    <Screen palette={palette}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Space.md, paddingBottom: insets.bottom + Space.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <IconButton
              name="arrowLeft"
              label="Go back"
              palette={palette}
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
            />
          </Reveal>

          <Reveal index={1} style={styles.head}>
            <Text style={Type.hero}>{copy.title}</Text>
            <Text style={[Type.bodyMuted, styles.deck]}>{copy.deck}</Text>
          </Reveal>

          <View style={styles.form}>
            {mode === "signup" ? (
              <Reveal index={2} key="name">
                <Field
                  label="Name"
                  palette={palette}
                  icon="user"
                  placeholder="Priya"
                  value={name}
                  onChangeText={(t) => {
                    setName(t)
                    clear("name")
                  }}
                  error={errors.name}
                  autoCapitalize="words"
                  textContentType="name"
                />
              </Reveal>
            ) : null}

            <Reveal index={3}>
              <Field
                label="Email"
                palette={palette}
                icon="mail"
                placeholder="you@example.com"
                value={email}
                onChangeText={(t) => {
                  setEmail(t)
                  clear("email")
                }}
                error={errors.email}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            </Reveal>

            <Reveal index={4}>
              <Field
                label="Password"
                palette={palette}
                icon="lock"
                placeholder="At least 6 characters"
                value={password}
                onChangeText={(t) => {
                  setPassword(t)
                  clear("password")
                }}
                error={errors.password}
                secret
                autoCapitalize="none"
                textContentType={mode === "signup" ? "newPassword" : "password"}
              />
            </Reveal>

            {mode === "signup" ? (
              <Reveal index={5} key="confirm">
                <Field
                  label="Confirm password"
                  palette={palette}
                  icon="lock"
                  placeholder="Once more"
                  value={confirm}
                  onChangeText={(t) => {
                    setConfirm(t)
                    clear("confirm")
                  }}
                  error={errors.confirm}
                  secret
                  autoCapitalize="none"
                  textContentType="newPassword"
                />
              </Reveal>
            ) : null}

            {errors.form ? (
              <Note palette={palette} icon="info">
                {errors.form}
              </Note>
            ) : null}
          </View>

          <Reveal index={6} style={styles.actions}>
            <Button label={copy.cta} palette={palette} size="lg" full loading={loading} onPress={submit} />
            <Button
              label="Continue without an account"
              palette={palette}
              variant="ghost"
              full
              onPress={toTabs}
            />
          </Reveal>

          <Reveal index={7} style={styles.swap}>
            <Text style={Type.small}>{copy.swap}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.swapCta}
              onPress={() => switchMode(mode === "signin" ? "signup" : "signin")}
              hitSlop={8}
            >
              <Text style={[styles.swapCta, { color: palette.ink }]}>{copy.swapCta}</Text>
            </Pressable>
          </Reveal>

          <Reveal index={8}>
            <View style={styles.footer}>
              <Text style={[Type.small, styles.footerText]}>
                Your video never leaves your phone. On-device analysis is in development.
              </Text>
            </View>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Space.gutter, maxWidth: 520, width: "100%", alignSelf: "center" },
  head: { marginTop: Space.xl },
  deck: { marginTop: Space.sm },
  form: { marginTop: Space.xxl, gap: Space.lg },
  actions: { marginTop: Space.xxl, gap: Space.sm },
  swap: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: Space.xs, marginTop: Space.lg },
  swapCta: { fontFamily: Fonts.bodySemi, fontSize: 14 },
  footer: {
    marginTop: Space.xxl,
    padding: Space.lg,
    borderRadius: Radius.md,
    backgroundColor: Paper.veil,
  },
  footerText: { textAlign: "center", lineHeight: 19 },
})
