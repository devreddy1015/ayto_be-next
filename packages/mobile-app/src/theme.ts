import type { TextStyle } from "react-native"

/**
 * Riso Sweep design tokens.
 *
 * The app is printed on black stock: one warm near-black paper plus a cream
 * "paper" ink for text. Every sport then adds its own three riso inks
 * (see `RisoPalette` in sports.ts); nothing here is sport-specific.
 */
export const Paper = {
  bg: "#121011",
  stock: "#1C1819",
  raised: "#262122",
  rule: "rgba(244,236,224,0.14)",
  ruleStrong: "rgba(244,236,224,0.32)",
  text: "#F4ECE0",
  muted: "#B4AA9C", // 8.3:1 on bg
  faint: "#8A8176", // 4.9:1 on bg
  danger: "#FF665E", // riso Red, 6.6:1 on bg
} as const

/** Font family names as registered by `useFonts` in app/_layout.tsx. */
export const Fonts = {
  display: "Fraunces_700Bold",
  italic: "Fraunces_400Regular_Italic",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
} as const

// Custom families carry their own weight: never pair them with fontWeight
// (Android silently falls back to the system font when you do).
export const Type = {
  display: { fontFamily: Fonts.display, fontSize: 46, lineHeight: 50, letterSpacing: -1.2, color: Paper.text },
  title: { fontFamily: Fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: Paper.text },
  heading: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.3, color: Paper.text },
  deck: { fontFamily: Fonts.italic, fontSize: 17, lineHeight: 24, color: Paper.muted },
  body: { fontSize: 15, lineHeight: 22, color: Paper.text },
  small: { fontSize: 13, lineHeight: 19, color: Paper.muted },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: Paper.muted,
  },
  metricXL: { fontFamily: Fonts.monoBold, fontSize: 64, lineHeight: 70, letterSpacing: -2.5, color: Paper.text },
  metric: { fontFamily: Fonts.monoBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: Paper.text },
  metricSm: { fontFamily: Fonts.monoBold, fontSize: 16, lineHeight: 20, color: Paper.text },
  unit: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Paper.muted },
} satisfies Record<string, TextStyle>

export const Space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, gutter: 20 } as const

/** Print has hard corners; keep radii tiny. */
export const Radius = { sm: 2, md: 4, pill: 999 } as const

/** Hard offset-plate distances (no blur shadows anywhere). */
export const Offset = { sm: 3, md: 5, lg: 7 } as const

export const Motion = {
  sweepMs: 900, // band in + band out, eased cubic-bezier(0.65, 0, 0.35, 1)
  staggerMs: 110, // per line
  litMs: 650, // the bright pass over the finished heading
} as const
