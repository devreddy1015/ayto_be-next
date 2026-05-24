import { create } from "zustand"
import { MMKV } from "react-native-mmkv"
import type { UserProfile } from "../types"

const mmkv = new MMKV({ id: "user-store" })

interface UserState {
  profile: UserProfile | null
  isAuthenticated: boolean
  isOnboardingDone: boolean
  sportPreference: string
  unitPreference: "kmh" | "mph"
  overlaySettings: {
    showSpeedBadge: boolean
    showStrokeLabel: boolean
    showSkeleton: boolean
    showCourtGrid: boolean
  }
  setProfile: (profile: UserProfile | null) => void
  setAuthenticated: (value: boolean) => void
  setOnboardingDone: (value: boolean) => void
  setSportPreference: (sport: string) => void
  setUnitPreference: (unit: "kmh" | "mph") => void
  setOverlaySettings: (settings: Partial<UserState["overlaySettings"]>) => void
  signOut: () => void
  loadPersisted: () => void
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  isAuthenticated: false,
  isOnboardingDone: mmkv.getBoolean("onboarding_done") || false,
  sportPreference: mmkv.getString("sport_preference") || "badminton",
  unitPreference: (mmkv.getString("unit_preference") as "kmh" | "mph") || "kmh",
  overlaySettings: {
    showSpeedBadge: true,
    showStrokeLabel: true,
    showSkeleton: true,
    showCourtGrid: true,
  },

  setProfile: (profile) => set({ profile }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
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
  setOverlaySettings: (settings) =>
    set((state) => ({ overlaySettings: { ...state.overlaySettings, ...settings } })),
  signOut: () => set({ profile: null, isAuthenticated: false }),
  loadPersisted: () => {
    set({
      isOnboardingDone: mmkv.getBoolean("onboarding_done") || false,
      sportPreference: mmkv.getString("sport_preference") || "badminton",
      unitPreference: (mmkv.getString("unit_preference") as "kmh" | "mph") || "kmh",
    })
  },
}))
