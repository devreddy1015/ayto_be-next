import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://your-project.supabase.co"
const SUPABASE_ANON_KEY = "your-anon-key"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function signInWithOTP(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  return { error }
}

export async function uploadSession(
  userId: string,
  sessionData: object,
) {
  const { error } = await supabase.from("sessions").insert({
    user_id: userId,
    created_at: new Date().toISOString(),
    metrics: sessionData,
  })
  return { error }
}

export function subscribeToAuthChanges(
  callback: (session: any) => void,
) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
}
