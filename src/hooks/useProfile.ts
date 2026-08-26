import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

export function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))
  useEffect(() => { if (!userId) return; setLoading(true); supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => { setProfile(data); setLoading(false) }) }, [userId])
  const updateProfile = async (updates: Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'private_name' | 'birthday'>>) => {
    if (!userId) return 'You need to be signed in.'
    const username = updates.username?.trim().toLowerCase()
    const { data, error } = await supabase.from('profiles').update({ ...updates, ...(username ? { username } : {}) }).eq('id', userId).select().single()
    if (error) return error.code === '23505' ? 'That username is already taken.' : 'Could not update your profile.'
    setProfile(data); return null
  }
  return { profile, loading, updateProfile }
}
