import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isSupabaseConfigured } from '../lib/supabase'

type MFAChallenge = {
  factorId: string
  challengeId: string
} | null

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  mfaChallenge: MFAChallenge
  signIn: (email: string, password: string) => Promise<{ error: string | null; mfaRequired: boolean }>
  verifyMFA: (code: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)
const readableError = (message: string) => message.toLowerCase().includes('invalid') ? 'That email or password is not correct.' : message

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: 'Tandem is temporarily unavailable. Please try again later.', mfaRequired: false }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: readableError(error.message), mfaRequired: false }
    if (data.user) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totpList = factors?.totp || (factors?.all ? factors.all.filter(f => f.factor_type === 'totp') : [])
      const totp = Array.isArray(totpList) ? totpList[0] : totpList
      if (totp) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        if (!challengeError && challenge) {
          setMfaChallenge({ factorId: totp.id, challengeId: challenge.id })
          await supabase.auth.signOut()
          return { error: null, mfaRequired: true }
        }
      }
    }
    return { error: null, mfaRequired: false }
  }

  const verifyMFA = async (code: string) => {
    if (!mfaChallenge) return { error: 'No MFA challenge in progress.' }
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaChallenge.factorId,
      challengeId: mfaChallenge.challengeId,
      code: code.trim()
    })
    if (error) return { error: 'That code is not correct. Please try again.' }
    setMfaChallenge(null)
    return { error: null }
  }

  const signUp = async (email: string, password: string, username: string, displayName: string) => {
    if (!isSupabaseConfigured) return { error: 'Tandem is temporarily unavailable. Please try again later.', needsConfirmation: false }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.toLowerCase(), display_name: displayName } } })
    return { error: error ? (error.message.includes('already registered') ? 'An account with that email already exists.' : error.message) : null, needsConfirmation: Boolean(data.user && !data.session) }
  }
  const signOut = async () => { await supabase.auth.signOut(); setMfaChallenge(null) }
  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, mfaChallenge, signIn, verifyMFA, signUp, signOut }}>{children}</AuthContext.Provider>
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context }
