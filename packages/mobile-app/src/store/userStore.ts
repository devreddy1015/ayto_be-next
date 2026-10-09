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

interface UserState {
  profile: UserProfile | null
  isAuthenticated: boolean
  isOnboardingDone: boolean
  sportPreference: SportId
  unitPreference: SpeedUnit
  overlaySettings: OverlaySettings
  signIn: (profile: UserProfile) => void
  signOut: () => void
  setOnboardingDone: (value: boolean) => void
  setSportPreference: (sport: SportId) => void
  setUnitPreference: (unit: SpeedUnit) => void
  setOverlaySettings: (settings: Partial<OverlaySettings>) => void
}

const storedSport = mmkv.getString("sport_preference")

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  isAuthenticated: false,
  isOnboardingDone: mmkv.getBoolean("onboarding_done") ?? false,
  sportPreference: isSportId(storedSport) ? storedSport : DEFAULT_SPORT_ID,
  unitPreference: mmkv.getString("unit_preference") === "mph" ? "mph" : "kmh",
  overlaySettings: { showSpeedBadge: true, showStrokeLabel: true, showFramingGuide: true },

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
  setOverlaySettings: (settings) => set((state) => ({ overlaySettings: { ...state.overlaySettings, ...settings } })),
}))
