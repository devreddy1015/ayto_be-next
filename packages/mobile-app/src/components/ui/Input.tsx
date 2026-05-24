import React, { useState } from "react"
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  Animated,
} from "react-native"
import { Colors, Radius, Spacing } from "../../theme"

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  hint?: string
}

export default function Input({ label, error, hint, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor="rgba(255,255,255,0.2)"
          onFocus={(e) => {
            setFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            props.onBlur?.(e)
          }}
          {...props}
        />
      </View>
      {error && (
        <Text style={styles.error}>{error}</Text>
      )}
      {hint && !error && (
        <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.text_secondary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
    marginLeft: 4,
    textTransform: "uppercase",
  },
  inputWrapper: {
    backgroundColor: Colors.bg_surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  inputFocused: {
    borderColor: Colors.accent_green,
  },
  inputError: {
    borderColor: Colors.accent_coral,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text_primary,
  },
  error: {
    fontSize: 11,
    color: Colors.accent_coral,
    marginTop: Spacing.xs,
    marginLeft: 4,
    fontWeight: "500",
  },
  hint: {
    fontSize: 11,
    color: Colors.text_secondary,
    marginTop: Spacing.xs,
    marginLeft: 4,
  },
})
