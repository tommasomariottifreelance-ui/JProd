import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null) // { client_id, role }
  const [loading, setLoading] = useState(true)

  // Recupera il profilo (client_id + role) dall'utente loggato
  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); return }
    const { data } = await supabase
      .from('users_profiles')
      .select('client_id, role')
      .eq('user_id', userId)
      .single()
    setProfile(data ?? null)
  }

  useEffect(() => {
    // Sessione iniziale
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user?.id ?? null).finally(() => setLoading(false))
    })

    // Listener sui cambi di stato auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user?.id ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook comodo: const { user, profile } = useAuth()
// profile.client_id -> tenant dell'utente
// profile.role      -> 'admin' | 'operator' | 'viewer'
export const useAuth = () => useContext(AuthContext)
