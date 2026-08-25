import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function usePresence(userId?: string) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel('tandem-presence', { config: { presence: { key: userId } } })
    const update = () => { const state = channel.presenceState(); setOnlineIds(new Set(Object.keys(state))) }
    channel.on('presence', { event: 'sync' }, update).on('presence', { event: 'join' }, update).on('presence', { event: 'leave' }, update).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { await channel.track({ user_id: userId, online_at: new Date().toISOString() }); await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', userId) }
    })
    return () => { channel.untrack(); channel.unsubscribe(); supabase.from('profiles').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', userId) }
  }, [userId])
  return { onlineIds, isOnline: (id: string) => onlineIds.has(id) }
}
