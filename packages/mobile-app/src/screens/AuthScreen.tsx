import React, { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { Colors, Spacing } from "../theme"
import { signInWithOTP } from "../services/supabase"

export default function AuthScreen() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    if (!email.includes("@")) {
      Alert.alert("Enter a valid email")
      return
    }
    setLoading(true)
    const { error } = await signInWithOTP(email)
    setLoading(false)
    if (error) Alert.alert("Error", error.message)
    else Alert.alert("Magic link sent", "Check your email to sign in")
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <View style={styles.topSection}>
        <View style={styles.logoMark}>
          <Text style={styles.logoIcon}>◆</Text>
        </View>
        <Text style={styles.brand}>SportIQ</Text>
        <Text style={styles.tagline}>
          ANALYTICS FOR{'\n'}EVERY ATHLETE
        </Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholder="you@email.com"
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonLoading]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} />
          ) : (
            <Text style={styles.buttonText}>CONTINUE</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>
          Powered by on-device AI. Your video never leaves your phone.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  topSection: {
    alignItems: "center",
    marginBottom: 56,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoIcon: {
    fontSize: 28,
    color: Colors.primary,
  },
  brand: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textTertiary,
    textAlign: "center",
    letterSpacing: 3,
    lineHeight: 20,
  },
  formSection: {
    gap: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 18,
    fontSize: 16,
    fontWeight: "500",
    color: Colors.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  buttonLoading: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.bg,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 24,
    lineHeight: 18,
  },
})
