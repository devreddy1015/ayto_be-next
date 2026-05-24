import { TextStyle } from "react-native"

export const Colors = {
  bg_primary: "#0A0A0F",
  bg_surface: "#13131A",
  bg_elevated: "#1C1C27",
  accent_green: "#00FF87",
  accent_amber: "#FFB300",
  accent_blue: "#4A9EFF",
  accent_coral: "#FF6B6B",
  text_primary: "#FFFFFF",
  text_secondary: "#8E8EA0",
  border: "rgba(255,255,255,0.08)",
  gradient_hero_start: "#00FF87",
  gradient_hero_end: "#4A9EFF",
} as const

export const StrokeColors: Record<string, string> = {
  smash: Colors.accent_amber,
  drop: Colors.accent_coral,
  clear: Colors.accent_blue,
  net: "#4A9EFF",
  serve: Colors.accent_green,
  defensive: "#8E8EA0",
}

export const Typography: Record<string, TextStyle> = {
  h1: {
    fontFamily: "Inter-Bold",
    fontSize: 32,
    fontWeight: "700",
    color: Colors.text_primary,
  },
  h2: {
    fontFamily: "Inter-Bold",
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text_primary,
  },
  h3: {
    fontFamily: "Inter-Bold",
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text_primary,
  },
  body: {
    fontFamily: "Inter-Regular",
    fontSize: 14,
    fontWeight: "400",
    color: Colors.text_secondary,
  },
  caption: {
    fontFamily: "Inter-Regular",
    fontSize: 11,
    fontWeight: "600",
    color: Colors.text_secondary,
  },
  label: {
    fontFamily: "Inter-Bold",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: Colors.text_secondary,
    textTransform: "uppercase",
  },
  stat: {
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text_primary,
  },
  metric: {
    fontFamily: "JetBrainsMono-Regular",
    fontSize: 42,
    fontWeight: "800",
    color: Colors.accent_green,
  },
  numbered: {
    fontFamily: "JetBrainsMono-Regular",
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

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
}

export const Glass = {
  card: {
    backgroundColor: Colors.bg_surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  elevated: {
    backgroundColor: Colors.bg_elevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    shadowColor: Colors.accent_green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 8,
  },
}

export const Motion = {
  enterDuration: 300,
  staggerDelay: 60,
  springConfig: {
    damping: 15,
    stiffness: 150,
  },
  sheetConfig: {
    damping: 20,
    stiffness: 200,
  },
  pressScale: 0.97,
}
