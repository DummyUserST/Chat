import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Story, StoryComment, StoryLike, Profile } from '../types/database'

export type StoryWithDetails = Story & {
  author: Profile
  likes: StoryLike[]
  comments: (StoryComment & { author: Profile })[]
  likedByMe: boolean
}

export function useStories(userId?: string) {
  const [stories, setStories] = useState<StoryWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const { data: storyRows } = await supabase
      .from('stories')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!storyRows || storyRows.length === 0) {
      setStories([])
      setLoading(false)
      return
    }

    const authorIds = [...new Set(storyRows.map(s => s.author_id))]
    const storyIds = storyRows.map(s => s.id)

    const [authorsRes, likesRes, commentsRes] = await Promise.all([
      supabase.from('profiles').select('*').in('id', authorIds),
      supabase.from('story_likes').select('*').in('story_id', storyIds),
      supabase.from('story_comments').select('*').in('story_id', storyIds).order('created_at', { ascending: true }),
    ])

    const authorMap = new Map<string, Profile>((authorsRes.data || []).map(p => [p.id, p]))
    const likesMap = new Map<string, StoryLike[]>()
    for (const like of (likesRes.data || [])) {
      const arr = likesMap.get(like.story_id) || []
      arr.push(like)
      likesMap.set(like.story_id, arr)
    }

    const commentAuthorIds = [...new Set((commentsRes.data || []).map(c => c.user_id))]
    const commentAuthorsRes = commentAuthorIds.length
      ? await supabase.from('profiles').select('*').in('id', commentAuthorIds)
      : { data: [] }
    const commentAuthorMap = new Map<string, Profile>((commentAuthorsRes.data || []).map(p => [p.id, p]))

    const commentsMap = new Map<string, (StoryComment & { author: Profile })[]>()
    for (const c of (commentsRes.data || [])) {
      const arr = commentsMap.get(c.story_id) || []
      const author = commentAuthorMap.get(c.user_id)
      if (author) arr.push({ ...c, author })
      commentsMap.set(c.story_id, arr)
    }

    const result: StoryWithDetails[] = storyRows.map(s => ({
      ...s,
      author: authorMap.get(s.author_id)!,
      likes: likesMap.get(s.id) || [],
      comments: commentsMap.get(s.id) || [],
      likedByMe: (likesMap.get(s.id) || []).some(l => l.user_id === userId),
    })).filter(s => s.author)

    setStories(result)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const createStory = useCallback(async (imageUrl: string, caption: string, privacy: 'public' | 'private'): Promise<string | null> => {
    if (!userId) return 'Not signed in.'
    const { error } = await supabase
      .from('stories')
      .insert({ author_id: userId, image_url: imageUrl, caption: caption.trim() || null, privacy })
    if (error) return 'Could not create story.'
    load()
    return null
  }, [userId, load])

  const deleteStory = useCallback(async (storyId: string): Promise<string | null> => {
    const { error } = await supabase.from('stories').delete().eq('id', storyId)
    if (error) return 'Could not delete story.'
    load()
    return null
  }, [load])

  const toggleLike = useCallback(async (storyId: string, currentlyLiked: boolean) => {
    if (currentlyLiked) {
      await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId!)
    } else {
      await supabase.from('story_likes').insert({ story_id: storyId, user_id: userId! })
    }
    setStories(prev => prev.map(s => {
      if (s.id !== storyId) return s
      if (currentlyLiked) {
        return { ...s, likes: s.likes.filter(l => l.user_id !== userId), likedByMe: false }
      }
      return { ...s, likes: [...s.likes, { id: 'temp', story_id: storyId, user_id: userId!, created_at: new Date().toISOString() }], likedByMe: true }
    }))
    load()
  }, [userId, load])

  const addComment = useCallback(async (storyId: string, content: string) => {
    if (!userId || !content.trim()) return
    const { data, error } = await supabase
      .from('story_comments')
      .insert({ story_id: storyId, user_id: userId, content: content.trim() })
      .select()
      .single()
    if (error || !data) return
    load()
  }, [userId, load])

  const deleteComment = useCallback(async (commentId: string) => {
    await supabase.from('story_comments').delete().eq('id', commentId)
    load()
  }, [load])

  return { stories, loading, createStory, deleteStory, toggleLike, addComment, deleteComment, reload: load }
}
