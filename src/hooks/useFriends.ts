import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { FriendRequest, Profile, BlockedUser } from '../types/database'

export type FriendWithProfile = {
  friend: Profile
  requestId: string
}

export type PendingRequest = {
  request: FriendRequest
  profile: Profile
}

export type BlockedUserWithProfile = {
  block: BlockedUser
  profile: Profile
}

export function useFriends(userId?: string) {
  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [incoming, setIncoming] = useState<PendingRequest[]>([])
  const [outgoing, setOutgoing] = useState<PendingRequest[]>([])
  const [blocked, setBlocked] = useState<BlockedUserWithProfile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const { data: requests } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)

    const all = requests || []
    const accepted = all.filter(r => r.status === 'accepted')
    const pending = all.filter(r => r.status === 'pending')

    const friendIds = accepted.map(r => r.sender_id === userId ? r.receiver_id : r.sender_id)
    const incomingPending = pending.filter(r => r.receiver_id === userId)
    const outgoingPending = pending.filter(r => r.sender_id === userId)

    const [friendProfiles, incomingProfiles, outgoingProfiles] = await Promise.all([
      friendIds.length ? supabase.from('profiles').select('*').in('id', friendIds) : { data: [] },
      incomingPending.length ? supabase.from('profiles').select('*').in('id', incomingPending.map(r => r.sender_id)) : { data: [] },
      outgoingPending.length ? supabase.from('profiles').select('*').in('id', outgoingPending.map(r => r.receiver_id)) : { data: [] },
    ])

    const profileMap = new Map<string, Profile>((friendProfiles.data || []).map(p => [p.id, p]))
    const inMap = new Map<string, Profile>((incomingProfiles.data || []).map(p => [p.id, p]))
    const outMap = new Map<string, Profile>((outgoingProfiles.data || []).map(p => [p.id, p]))

    setFriends(accepted.map(r => ({
      friend: profileMap.get(r.sender_id === userId ? r.receiver_id : r.sender_id)!,
      requestId: r.id,
    })).filter(f => f.friend))

    setIncoming(incomingPending.map(r => ({ request: r, profile: inMap.get(r.sender_id)! })).filter(p => p.profile))
    setOutgoing(outgoingPending.map(r => ({ request: r, profile: outMap.get(r.receiver_id)! })).filter(p => p.profile))

    const { data: blocks } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('blocker_id', userId)
    const blockedIds = (blocks || []).map(b => b.blocked_id)
    const blockedProfiles = blockedIds.length
      ? await supabase.from('profiles').select('*').in('id', blockedIds)
      : { data: [] }
    const blockMap = new Map<string, Profile>((blockedProfiles.data || []).map(p => [p.id, p]))
    setBlocked((blocks || []).map(b => ({ block: b, profile: blockMap.get(b.blocked_id)! })).filter(b => b.profile))

    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const sendRequest = useCallback(async (receiverId: string): Promise<string | null> => {
    if (!userId || receiverId === userId) return 'Cannot send friend request.'
    const { error } = await supabase
      .from('friend_requests')
      .insert({ sender_id: userId, receiver_id: receiverId, status: 'pending' })
    if (error) {
      if (error.code === '23505') return 'Friend request already sent.'
      return 'Could not send friend request.'
    }
    load()
    return null
  }, [userId, load])

  const acceptRequest = useCallback(async (requestId: string): Promise<string | null> => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) return 'Could not accept friend request.'
    load()
    return null
  }, [load])

  const declineRequest = useCallback(async (requestId: string): Promise<string | null> => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) return 'Could not decline friend request.'
    load()
    return null
  }, [load])

  const removeFriend = useCallback(async (requestId: string): Promise<string | null> => {
    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId)
    if (error) return 'Could not remove friend.'
    load()
    return null
  }, [load])

  const isFriend = useCallback((otherId: string) => friends.some(f => f.friend.id === otherId), [friends])

  const hasPendingRequest = useCallback((otherId: string) =>
    outgoing.some(o => o.profile.id === otherId) || incoming.some(i => i.profile.id === otherId),
  [outgoing, incoming])

  const blockUser = useCallback(async (blockedId: string): Promise<string | null> => {
    if (!userId || blockedId === userId) return 'Cannot block yourself.'
    const { error } = await supabase
      .from('blocked_users')
      .insert({ blocker_id: userId, blocked_id: blockedId })
    if (error) {
      if (error.code === '23505') return null
      return 'Could not block user.'
    }
    load()
    return null
  }, [userId, load])

  const unblockUser = useCallback(async (blockId: string): Promise<string | null> => {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('id', blockId)
    if (error) return 'Could not unblock user.'
    load()
    return null
  }, [load])

  return { friends, incoming, outgoing, blocked, loading, sendRequest, acceptRequest, declineRequest, removeFriend, isFriend, hasPendingRequest, blockUser, unblockUser, reload: load }
}
