import { createClient } from "@supabase/supabase-js"
import { MMKV } from "react-native-mmkv"

const storage = new MMKV({ id: "supabase-storage" })

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co"
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key: string) => storage.getString(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithPassword(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
  if (data.user && !error) {
    await supabase.from("profiles").insert({ id: data.user.id, name })
  }
  return { data, error }
}

export function signOut() {
  return supabase.auth.signOut()
}
