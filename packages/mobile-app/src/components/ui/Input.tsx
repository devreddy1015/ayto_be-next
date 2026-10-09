import { useState } from "react"
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native"
import { Fonts, Paper, Radius, Space, Type } from "../../theme"

interface InputProps extends TextInputProps {
  label: string
  error?: string
  /** Focus rule colour (the sport's ink). */
  accent: string
}

/** Form field: mono kicker label over a hairline box that inks on focus. */
export default function Input({ label, error, accent, style, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false)
  const borderColor = error ? Paper.danger : focused ? accent : Paper.ruleStrong

  return (
    <View style={styles.container}>
      <Text style={[Type.kicker, styles.label]}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={Paper.faint}
        selectionColor={accent}
        style={[styles.input, { borderColor }, focused && { borderBottomWidth: 3 }, style]}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: Space.lg },
  label: { marginBottom: Space.sm },
  input: {
    minHeight: 50,
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Paper.text,
    backgroundColor: Paper.stock,
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  error: { fontFamily: Fonts.mono, fontSize: 11, color: Paper.danger, marginTop: Space.xs },
})
