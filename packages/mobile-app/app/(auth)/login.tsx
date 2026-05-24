import React, { useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native"
import { router } from "expo-router"
import { Colors, Spacing, Radius } from "../../src/theme"
import { signInWithEmail, signInWithPassword, signUpWithPassword } from "../../src/lib/supabase"
import { useUserStore } from "../../src/store/userStore"
import Input from "../../src/components/ui/Input"
import Button from "../../src/components/ui/Button"

export default function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!email.includes("@")) newErrors.email = "Enter a valid email"
    if (password.length < 6) newErrors.password = "Password must be 6+ characters"
    if (mode === "signup") {
      if (!name.trim()) newErrors.name = "Name is required"
      if (password !== confirmPassword) newErrors.confirmPassword = "Passwords don't match"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      if (mode === "signin") {
        const { error } = await signInWithPassword(email, password)
        if (error) throw error
      } else {
        const { error } = await signUpWithPassword(email, password, name.trim())
        if (error) throw error
        Alert.alert("Check your email", "We've sent you a confirmation link.")
        setLoading(false)
        return
      }
      router.replace("/(tabs)")
    } catch (err: any) {
      setErrors({ form: err.message || "Something went wrong" })
    }
    setLoading(false)
  }

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      setErrors({ email: "Enter a valid email" })
      return
    }
    setLoading(true)
    const { error } = await signInWithEmail(email)
    setLoading(false)
    if (error) setErrors({ form: error.message })
    else Alert.alert("Magic link sent", "Check your email to sign in")
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topSection}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>◈</Text>
          </View>
          <Text style={styles.brand}>Ayto</Text>
          <Text style={styles.tagline}>SPORTIQ</Text>
        </View>

        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            style={[styles.modePill, mode === "signin" && styles.modePillActive]}
            onPress={() => { setMode("signin"); setErrors({}) }}
          >
            <Text style={[styles.modeText, mode === "signin" && styles.modeTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modePill, mode === "signup" && styles.modePillActive]}
            onPress={() => { setMode("signup"); setErrors({}) }}
          >
            <Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === "signup" && (
            <Input
              label="Name"
              placeholder="Your name"
              value={name}
              onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: "" })) }}
              error={errors.name}
              autoCapitalize="words"
            />
          )}

          <Input
            label="Email"
            placeholder="you@email.com"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: "" })) }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password"
            placeholder="Min 6 characters"
            value={password}
            onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: "" })) }}
            error={errors.password}
            secureTextEntry
          />

          {mode === "signup" && (
            <Input
              label="Confirm Password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setErrors((e) => ({ ...e, confirmPassword: "" })) }}
              error={errors.confirmPassword}
              secureTextEntry
            />
          )}

          {errors.form && (
            <Text style={styles.formError}>{errors.form}</Text>
          )}

          <Button
            title={mode === "signin" ? "Sign In" : "Create Account"}
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
          />

          <Button
            title="Send Magic Link"
            onPress={handleMagicLink}
            variant="outline"
            fullWidth
            size="md"
          />
        </View>

        <Text style={styles.footer}>
          All analysis runs on-device. Your video never leaves your phone.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg_primary,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  topSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(0,255,135,0.08)",
    borderWidth: 2,
    borderColor: "rgba(0,255,135,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoIcon: {
    fontSize: 24,
    color: Colors.accent_green,
  },
  brand: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.text_primary,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.accent_green,
    letterSpacing: 4,
    marginTop: 4,
  },
  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: Colors.bg_surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  modePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.full,
    alignItems: "center",
  },
  modePillActive: {
    backgroundColor: Colors.accent_green,
  },
  modeText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  modeTextActive: {
    color: Colors.bg_primary,
    fontWeight: "700",
  },
  form: {
    gap: 4,
  },
  formError: {
    fontSize: 12,
    color: Colors.accent_coral,
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: Colors.text_secondary,
    marginTop: 32,
    lineHeight: 18,
    opacity: 0.6,
  },
})
