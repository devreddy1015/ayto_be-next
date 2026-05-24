import { useMemo } from "react"
import { Colors, Typography, Spacing, Radius, Motion } from "../theme"
import { useUserStore } from "../store/userStore"

export function useTheme() {
  const unitPreference = useUserStore((s) => s.unitPreference)

  return useMemo(
    () => ({
      colors: Colors,
      typography: Typography,
      spacing: Spacing,
      radius: Radius,
      motion: Motion,
      unitPreference,
      isDark: true,
      strokeColors: {
        smash: Colors.accent_amber,
        drop: Colors.accent_coral,
        clear: Colors.accent_blue,
        net: Colors.accent_blue,
        serve: Colors.accent_green,
        defensive: Colors.text_secondary,
        drive: Colors.accent_amber,
      },
    }),
    [unitPreference],
  )
}
