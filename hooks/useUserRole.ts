// @/hooks/useUserRole.ts
'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { onAuthStateChange, type AuthUser } from '@/lib/auth'

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastUserId = useRef<string | null>(null) // To track the last user ID whose role was successfully fetched

  useEffect(() => {
    let cancelled = false

    async function fetchUserRole(user: AuthUser | null = null, isInitialLoadOrAuthChange: boolean = false) {
      // Only set loading to true if it's an initial load, an actual user change, or a forced refetch.
      // Avoid setting loading=true if it's just a re-evaluation for the same user.
      if (isInitialLoadOrAuthChange || (user && user.id !== lastUserId.current) || (!user && lastUserId.current !== null)) {
        setLoading(true)
      }
      setError(null)

      let currentUser = user
      if (!currentUser) {
        // If user not provided (e.g., initial load or browser re-focus), fetch it
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !fetchedUser) {
          if (!cancelled) {
            setRole(null)
            setError('No authenticated user')
            setLoading(false)
            lastUserId.current = null // Clear last user ID on logout/no user
          }
          return
        }
        currentUser = fetchedUser as AuthUser
      }

      if (!currentUser) {
        // Double check if user is still null after fetching
        if (!cancelled) {
          setRole(null)
          setError('No authenticated user')
          setLoading(false)
          lastUserId.current = null
        }
        return
      }

      // If the user ID hasn't changed AND it's not an initial/forced refetch,
      // we already have the role. Just ensure loading is false and exit.
      if (currentUser.id === lastUserId.current && !isInitialLoadOrAuthChange) {
        if (!cancelled) {
          setLoading(false) // Role already known for this user, just ensure loading is off
        }
        return // Prevent redundant DB query
      }

      // Query 'zuser' table by uid to get the role
      let userRole: string | null = null;
      const { data, error: dbError } = await supabase.from('zuser').select('role').eq('uid', currentUser.id).single()
      if (data?.role) {
        userRole = data.role;
      } else {
        // Fallback: Query 'user' table by id
        const { data: udata } = await supabase.from('user').select('role').eq('id', currentUser.id).single();
        if (udata?.role) {
          userRole = udata.role;
        } else if (currentUser.email) {
          // Fallback: Query 'user' table by email
          const { data: emailData } = await supabase.from('user').select('role').eq('email', currentUser.email).single();
          if (emailData?.role) {
            userRole = emailData.role;
          }
        }
      }

      if (userRole) {
        const cleanedRole = userRole.trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (cleanedRole === 'otherhospital') {
          userRole = 'otherhospital';
        } else if (cleanedRole === 'pathoentry') {
          userRole = 'patho-entry';
        }
      }

      if (!cancelled) {
        if (!userRole) {
          setRole(null)
          setError('Role not found or database error')
          lastUserId.current = currentUser.id // Even on error, we tried for this user
        } else {
          setRole(userRole)
          setError(null)
          lastUserId.current = currentUser.id // Store the ID of the user whose role we just fetched
        }
        setLoading(false)
      }
    }

    // Initial fetch of the user role when the hook mounts
    fetchUserRole(null, true) // Pass true for isInitialLoadOrAuthChange for the very first load

    // Listen for authentication state changes
    const { data: authListener } = onAuthStateChange((user: AuthUser | null) => {
      // If the user ID has changed (actual login/logout/different user)
      // OR if a user just signed in (user exists, but lastUserId was null)
      // OR if a user signed out (user is null, but lastUserId was not null)
      if ((user && user.id !== lastUserId.current) || (!user && lastUserId.current !== null) || (user && lastUserId.current === null)) {
        fetchUserRole(user, true) // Force a refetch if it's a genuine auth change
      } else if (!user && lastUserId.current === null) {
        // If there's no user and we already knew there was no user,
        // just ensure loading is false (important if initial fetch failed)
        if (!cancelled) {
          setLoading(false);
        }
      }
      // If user exists and user.id === lastUserId.current,
      // it means it's the same user object (or a new reference to the same user),
      // so we do nothing here to prevent re-fetching and loading state flicker.
    })

    // Cleanup function for the effect
    return () => {
      cancelled = true
      authListener?.subscription?.unsubscribe() // Unsubscribe from the auth listener
    }
  }, []) // Empty dependency array means this effect runs once on mount

  return { role, loading, error }
}