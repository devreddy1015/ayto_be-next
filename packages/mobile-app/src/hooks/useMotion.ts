import { useReducedMotion as useSystemReducedMotion } from "react-native-reanimated"
import { useUserStore } from "../store/userStore"

/**
 * Whether to render the settled state instead of animating.
 *
 * Combines the OS accessibility setting with the in-app override, so someone
 * who finds the motion distracting can turn it off without changing a system
 * preference. The OS setting is never overridden the other way: if the
 * platform says reduce motion, this is true regardless of the app toggle.
 */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion()
  const preference = useUserStore((s) => s.reduceMotion)
  return system || preference
}
