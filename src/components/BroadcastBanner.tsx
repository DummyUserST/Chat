import { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { AdminBroadcast } from '../types/database'

export default function BroadcastBanner() {
  const { user } = useAuth()
  const isAdmin = user?.app_metadata?.role === 'admin'
  const [broadcast, setBroadcast] = useState<AdminBroadcast | null>(null)
  const [loading, setLoading] = useState(true)

  const loadActive = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('admin_broadcasts')
      .select('*')
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setBroadcast(data as AdminBroadcast | null)
    setLoading(false)
  }

  useEffect(() => {
    loadActive()
    const channel = supabase
      .channel('admin-broadcasts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_broadcasts' }, p => {
        setBroadcast(p.new as AdminBroadcast)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_broadcasts' }, p => {
        const updated = p.new as AdminBroadcast
        if (updated.cancelled_at) {
          setBroadcast(prev => (prev?.id === updated.id ? null : prev))
        } else {
          setBroadcast(updated)
        }
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  const cancel = async () => {
    if (!broadcast) return
    const { error } = await supabase
      .from('admin_broadcasts')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', broadcast.id)
      .is('cancelled_at', null)
    if (!error) setBroadcast(null)
  }

  if (loading || !broadcast) return null

  return (
    <div className="broadcast-banner" role="status" aria-live="polite">
      <span className="broadcast-icon"><Megaphone size={16} /></span>
      <span className="broadcast-text">{broadcast.message}</span>
      {isAdmin && (
        <button className="broadcast-cancel" onClick={cancel} aria-label="Cancel broadcast" title="Cancel broadcast">
          <X size={15} />
        </button>
      )}
    </div>
  )
}
