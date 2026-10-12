import { create } from "zustand"
import { MMKV } from "react-native-mmkv"
import { DEFAULT_SPORT_ID, isSportId, type SportId } from "../sports"
import type { SpeedUnit, UserProfile } from "../types"

const mmkv = new MMKV({ id: "user-store" })

export interface OverlaySettings {
  showSpeedBadge: boolean
  showStrokeLabel: boolean
  showFramingGuide: boolean
}

export interface CaptureSettings {
  /** Target capture rate. 60 is worth it: the stroke windows scale with fps. */
  fps: 30 | 60
  quality: "720p" | "1080p"
  /** Keep the clip on the phone after analysis. */
  keepFootage: boolean
}

export interface NotificationSettings {
  sessionReady: boolean
  weeklySummary: boolean
  drillReminders: boolean
}

interface UserState {
  profile: UserProfile | null
  isAuthenticated: boolean
  isOnboardingDone: boolean
  sportPreference: SportId
  unitPreference: SpeedUnit
  handedness: "right" | "left"
  overlaySettings: OverlaySettings
  capture: CaptureSettings
  notifications: NotificationSettings
  haptics: boolean
  /** User override for motion. The OS setting still wins when IT is on. */
  reduceMotion: boolean
  signIn: (profile: UserProfile) => void
  signOut: () => void
  setOnboardingDone: (value: boolean) => void
  setSportPreference: (sport: SportId) => void
  setUnitPreference: (unit: SpeedUnit) => void
  setHandedness: (hand: "right" | "left") => void
  setOverlaySettings: (settings: Partial<OverlaySettings>) => void
  setCapture: (settings: Partial<CaptureSettings>) => void
  setNotifications: (settings: Partial<NotificationSettings>) => void
  setHaptics: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
  /** Clear every stored preference. Does not touch the Supabase session. */
  resetPreferences: () => void
}

/** MMKV has no JSON helper; these keep the reads tidy and the failures quiet. */
function readJson<T>(key: string, fallback: T): T {
  const raw = mmkv.getString(key)
  if (!raw) return fallback
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    mmkv.set(key, JSON.stringify(value))
  } catch {
    // A full or unavailable store must never break a settings tap.
  }
}

const storedSport = mmkv.getString("sport_preference")

const DEFAULT_OVERLAYS: OverlaySettings = {
  showSpeedBadge: true,
  showStrokeLabel: true,
  showFramingGuide: true,
}
const DEFAULT_CAPTURE: CaptureSettings = { fps: 60, quality: "1080p", keepFootage: true }
const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  sessionReady: true,
  weeklySummary: false,
  drillReminders: false,
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  isAuthenticated: false,
  isOnboardingDone: mmkv.getBoolean("onboarding_done") ?? false,
  sportPreference: isSportId(storedSport) ? storedSport : DEFAULT_SPORT_ID,
  unitPreference: mmkv.getString("unit_preference") === "mph" ? "mph" : "kmh",
  handedness: mmkv.getString("handedness") === "left" ? "left" : "right",
  overlaySettings: readJson("overlays", DEFAULT_OVERLAYS),
  capture: readJson("capture", DEFAULT_CAPTURE),
  notifications: readJson("notifications", DEFAULT_NOTIFICATIONS),
  haptics: mmkv.getBoolean("haptics") ?? true,
  reduceMotion: mmkv.getBoolean("reduce_motion") ?? false,

  signIn: (profile) => set({ profile, isAuthenticated: true }),
  signOut: () => set({ profile: null, isAuthenticated: false }),

  setOnboardingDone: (value) => {
    mmkv.set("onboarding_done", value)
    set({ isOnboardingDone: value })
  },
  setSportPreference: (sport) => {
    mmkv.set("sport_preference", sport)
    set({ sportPreference: sport })
  },
  setUnitPreference: (unit) => {
    mmkv.set("unit_preference", unit)
    set({ unitPreference: unit })
  },
  setHandedness: (hand) => {
    mmkv.set("handedness", hand)
    set({ handedness: hand })
  },
  setOverlaySettings: (settings) =>
    set((state) => {
      const next = { ...state.overlaySettings, ...settings }
      writeJson("overlays", next)
      return { overlaySettings: next }
    }),
  setCapture: (settings) =>
    set((state) => {
      const next = { ...state.capture, ...settings }
      writeJson("capture", next)
      return { capture: next }
    }),
  setNotifications: (settings) =>
    set((state) => {
      const next = { ...state.notifications, ...settings }
      writeJson("notifications", next)
      return { notifications: next }
    }),
  setHaptics: (on) => {
    mmkv.set("haptics", on)
    set({ haptics: on })
  },
  setReduceMotion: (on) => {
    mmkv.set("reduce_motion", on)
    set({ reduceMotion: on })
  },
  resetPreferences: () => {
    mmkv.clearAll()
    set({
      isOnboardingDone: false,
      sportPreference: DEFAULT_SPORT_ID,
      unitPreference: "kmh",
      handedness: "right",
      overlaySettings: DEFAULT_OVERLAYS,
      capture: DEFAULT_CAPTURE,
      notifications: DEFAULT_NOTIFICATIONS,
      haptics: true,
      reduceMotion: false,
    })
  },
}))
