import type { TextStyle, ViewStyle } from "react-native"

/**
 * Ayto design tokens — "Soft Field".
 *
 * Warm paper, soft pastel mesh gradients, large friendly geometric type and
 * cards that float on long low-opacity shadows. Every sport tints the same
 * surfaces with its own triad (see `SportPalette` in sports.ts); nothing here
 * is sport-specific.
 *
 * Contrast: every pairing below is checked against the canvas. Body text is
 * 18.1:1, `muted` 5.3:1 and `faint` 4.8:1, so all of it clears WCAG AA at any
 * size. Sport accents carry their own `ink` (>=4.6:1) and `deep` (>=7.5:1)
 * tones for text, because the raw accent is a fill colour, not a text colour.
 */
export const Paper = {
  /** Page background: warm off-white stock. */
  canvas: "#F7F4EF",
  /** Cards and sheets sitting on the canvas. */
  surface: "#FFFFFF",
  /** A recessed well inside a card (inputs, tracks, empty slots). */
  sunken: "#F1EDE6",
  /** Near-black from the reference palette. 18.1:1 on canvas. */
  ink: "#0A0908",
  /** Secondary text. 5.3:1 on canvas. */
  muted: "#6B6459",
  /** Tertiary text and icons. 4.8:1 on canvas — still AA at any size. */
  faint: "#726B60",
  /** Hairlines and dividers. */
  line: "rgba(10,9,8,0.08)",
  lineStrong: "rgba(10,9,8,0.16)",
  /** Translucent white for glass panels over a gradient. */
  veil: "rgba(255,255,255,0.72)",
  veilStrong: "rgba(255,255,255,0.90)",
  danger: "#B3443C",
  success: "#4A7867",
} as const

/** Font family names as registered by `useFonts` in app/_layout.tsx. */
export const Fonts = {
  /** Outfit — geometric, round, friendly. Headings and numbers. */
  display: "Outfit_600SemiBold",
  displayBold: "Outfit_700Bold",
  displayMed: "Outfit_500Medium",
  /** Plus Jakarta Sans — humanist, legible at small sizes. Body and UI. */
  body: "PlusJakartaSans_400Regular",
  bodyMed: "PlusJakartaSans_500Medium",
  bodySemi: "PlusJakartaSans_600SemiBold",
} as const

/**
 * Custom families carry their own weight: never pair them with `fontWeight`
 * (Android silently falls back to the system font when you do).
 */
export const Type = {
  hero: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 45, letterSpacing: -1.4, color: Paper.ink },
  title: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 35, letterSpacing: -0.9, color: Paper.ink },
  heading: { fontFamily: Fonts.display, fontSize: 21, lineHeight: 27, letterSpacing: -0.4, color: Paper.ink },
  subhead: { fontFamily: Fonts.bodySemi, fontSize: 17, lineHeight: 24, letterSpacing: -0.2, color: Paper.ink },
  body: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 24, color: Paper.ink },
  bodyMuted: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 24, color: Paper.muted },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20, color: Paper.muted },
  label: { fontFamily: Fonts.bodyMed, fontSize: 13, lineHeight: 17, letterSpacing: 0.1, color: Paper.ink },
  kicker: {
    fontFamily: Fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: Paper.faint,
  },
  metricXL: { fontFamily: Fonts.displayBold, fontSize: 62, lineHeight: 66, letterSpacing: -3, color: Paper.ink },
  metricLg: { fontFamily: Fonts.displayBold, fontSize: 40, lineHeight: 44, letterSpacing: -1.8, color: Paper.ink },
  metric: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 31, letterSpacing: -1, color: Paper.ink },
  metricSm: { fontFamily: Fonts.display, fontSize: 18, lineHeight: 22, letterSpacing: -0.4, color: Paper.ink },
  unit: { fontFamily: Fonts.bodyMed, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, color: Paper.faint },
} satisfies Record<string, TextStyle>

export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
  /** Screen side margin. */
  gutter: 20,
} as const

/** Soft geometry: everything is generously rounded. */
export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  sheet: 34,
  pill: 999,
} as const

/**
 * Long, low-opacity shadows — the floating-card look. `elevation` keeps
 * Android in step; react-native-web maps the iOS props to box-shadow.
 */
export const Shadow = {
  sm: {
    shadowColor: "#2A2016",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "#2A2016",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 6,
  },
  lg: {
    shadowColor: "#2A2016",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.13,
    shadowRadius: 40,
    elevation: 14,
  },
} satisfies Record<string, ViewStyle>

/**
 * Motion. One easing for almost everything — a strong ease-out so things
 * arrive quickly and settle — plus two springs for anything the finger drives.
 */
export const Motion = {
  /** Taps, toggles, pressed states. */
  quick: 180,
  /** The default: entrances, cross-fades, layout moves. */
  base: 320,
  /** Hero reveals and screen transitions. */
  slow: 560,
  /** Count-ups and long sweeps. */
  lazy: 900,
  /** Per-item delay in a staggered list. */
  stagger: 60,
  /** cubic-bezier(0.22, 1, 0.36, 1) — ease-out-quint. */
  ease: [0.22, 1, 0.36, 1] as const,
  /** cubic-bezier(0.65, 0, 0.35, 1) — symmetric, for sweeps. */
  easeInOut: [0.65, 0, 0.35, 1] as const,
  /**
   * cubic-bezier(0.34, 1.56, 0.64, 1) — ease-out-back. Overshoots and
   * settles, so it reads as a spring.
   *
   * Prefer this over `withSpring` for anything that must END somewhere the
   * user sees. Reanimated's web renderer compiles `withTiming` down to a CSS
   * animation but drives `withSpring` on the rAF loop, so a spring freezes
   * mid-flight whenever the tab is backgrounded or throttled and never
   * reaches its target. A timing curve always arrives.
   */
  backOut: [0.34, 1.56, 0.64, 1] as const,
  /** Only for transient states that return to rest on their own. */
  spring: { damping: 18, stiffness: 140, mass: 0.9 },
  springy: { damping: 12, stiffness: 180, mass: 0.8 },
} as const

/** Distance an entering element travels. Keep small — these are nudges. */
export const Rise = { sm: 10, md: 18, lg: 28 } as const
