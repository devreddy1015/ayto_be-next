export const Colors = {
  bg: "#0A0A0F",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(0,245,160,0.25)",
  primary: "#00F5A0",
  primaryDim: "rgba(0,245,160,0.12)",
  accent: "#FF3D5A",
  accentDim: "rgba(255,61,90,0.15)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.6)",
  textTertiary: "rgba(255,255,255,0.35)",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.06)",
  overlay: "rgba(0,0,0,0.6)",
  navBg: "rgba(10,10,15,0.85)",
  success: "#00F5A0",
  warning: "#FFB800",
  error: "#FF3D5A",
  gradientStart: "#00F5A0",
  gradientEnd: "#00C876",
}

export const Typography = {
  hero: { fontSize: 64, fontWeight: "800" as const, color: Colors.primary },
  h1: { fontSize: 32, fontWeight: "800" as const, color: Colors.text },
  h2: { fontSize: 22, fontWeight: "700" as const, color: Colors.text },
  h3: { fontSize: 16, fontWeight: "700" as const, color: Colors.text },
  body: { fontSize: 14, fontWeight: "500" as const, color: Colors.textSecondary },
  caption: { fontSize: 11, fontWeight: "600" as const, color: Colors.textTertiary },
  label: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.5, color: Colors.textTertiary, textTransform: "uppercase" as const },
  stat: { fontSize: 28, fontWeight: "800" as const, color: Colors.text },
  metric: { fontSize: 42, fontWeight: "800" as const, color: Colors.primary },
}

export const Glass = {
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 20,
  },
  cardElevated: {
    backgroundColor: Colors.surfaceHover,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 8,
  },
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const AnimatedNumber = {
  height: 72,
  fontSize: 64,
  fontWeight: "800" as const,
  color: Colors.primary,
}
