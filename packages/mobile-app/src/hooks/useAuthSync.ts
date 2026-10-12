import { useEffect } from "react"
import { AppState, type AppStateStatus } from "react-native"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { useUserStore } from "../store/userStore"

function nameFor(session: Session): string {
  const meta = session.user.user_metadata?.name
  if (typeof meta === "string" && meta) return meta
  return session.user.email?.split("@")[0] ?? "Player"
}

/**
 * Mirror the persisted Supabase session into the user store.
 *
 * Tokens live in MMKV and keep refreshing on their own, but nothing read them
 * back, so after a relaunch the app showed "Guest" with only a "Sign in"
 * button while a valid session was still active — and no way to clear it.
 */
export function useAuthSync(): void {
  const signIn = useUserStore((s) => s.signIn)
  const signOut = useUserStore((s) => s.signOut)

  useEffect(() => {
    let active = true

    const apply = (session: Session | null) => {
      if (!active) return
      if (session) signIn({ id: session.user.id, name: nameFor(session) })
      else signOut()
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session))

    // Supabase only refreshes while the app is in the foreground.
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    }
    onAppState(AppState.currentState)
    const appSub = AppState.addEventListener("change", onAppState)

    return () => {
      active = false
      sub.subscription.unsubscribe()
      appSub.remove()
      supabase.auth.stopAutoRefresh()
    }
  }, [signIn, signOut])
}
