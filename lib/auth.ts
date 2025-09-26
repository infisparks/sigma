import { supabase } from './supabase'
import { User, UserAppMetadata } from '@supabase/supabase-js'

/**
 * Custom type for Authenticated User, including optional "role" and "name"
 * - Do NOT use "?" on app_metadata (Supabase always provides it)
 */
export type AuthUser = User & {
  app_metadata: UserAppMetadata & {
    role?: string
  }
  user_metadata?: {
    name?: string
  }
}

// Sign in with email and password
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

// Sign up new user
export const signUp = async (email: string, password: string, name: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
      },
    },
  })
  if (error) throw error
  return data
}


// Sign out
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Get current user, typed as AuthUser
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const { data: { user } } = await supabase.auth.getUser()
  return user as AuthUser
}

// Auth state change listener, user typed as AuthUser
export const onAuthStateChange = (callback: (user: AuthUser | null) => void) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback((session?.user as AuthUser) || null)
  })
}
