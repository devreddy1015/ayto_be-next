import { useCallback } from "react"
import { getSport, type Sport } from "../sports"
import { useUserStore } from "../store/userStore"
import { speed, speedUnitLabel } from "../lib/format"

/** The athlete's current sport, resolved from the registry. */
export function useSport(): Sport {
  return getSport(useUserStore((s) => s.sportPreference))
}

/** Speed formatting that honours the km/h / mph preference. */
export function useSpeed() {
  const unit = useUserStore((s) => s.unitPreference)
  const format = useCallback((kmh: number) => speed(kmh, unit), [unit])
  return { format, unit: speedUnitLabel(unit) }
}
