import { useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useAttachments(userId: string | undefined) {
  const upload = useCallback(async (file: File, type: 'image' | 'audio' | 'video' | 'file'): Promise<{ url: string; name: string; duration: number | null } | null> => {
    if (!userId) return null
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false })
    if (error) return null
    const { data } = supabase.storage.from('attachments').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name, duration: null }
  }, [userId])

  const uploadWithDuration = useCallback(async (file: File, type: 'image' | 'audio' | 'video' | 'file', duration: number | null): Promise<{ url: string; name: string; duration: number | null } | null> => {
    if (!userId) return null
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false })
    if (error) return null
    const { data } = supabase.storage.from('attachments').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name, duration }
  }, [userId])

  return { upload, uploadWithDuration }
}
