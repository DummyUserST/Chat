import { FormEvent, useRef, useState } from 'react'
import { ArrowLeft, Camera, Globe2, Heart, Lock, MessageCircle, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useStories } from '../hooks/useStories'
import { useAttachments } from '../hooks/useAttachments'
import type { StoryWithDetails } from '../hooks/useStories'

const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const timeAgo = (value: string) => {
  const diff = Date.now() - new Date(value).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function Avatar({ profile }: { profile: { avatar_url: string | null; display_name: string } }) {
  return <span className="story-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile.display_name || '?')}</span>
}

function StoryCard({ story, userId, onLike, onComment, onDelete }: {
  story: StoryWithDetails
  userId: string
  onLike: (id: string, liked: boolean) => void
  onComment: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)
  const isMine = story.author_id === userId

  const submitComment = (e: FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    onComment(story.id, commentText)
    setCommentText('')
  }

  return (
    <article className="story-card">
      <header className="story-card-header">
        <Avatar profile={story.author} />
        <div>
          <b>{story.author.display_name}</b>
          <small>@{story.author.username} · {timeAgo(story.created_at)}</small>
        </div>
        <span className={`story-privacy-badge ${story.privacy}`}>
          {story.privacy === 'public' ? <Globe2 size={12} /> : <Lock size={12} />}
          {story.privacy === 'public' ? 'Public' : 'Friends only'}
        </span>
        {isMine && (
          <button className="story-delete-btn" onClick={() => onDelete(story.id)} aria-label="Delete story">
            <Trash2 size={15} />
          </button>
        )}
      </header>
      <div className="story-image-wrap">
        <img src={story.image_url} alt={story.caption || 'Story image'} className="story-image" />
      </div>
      {story.caption && <p className="story-caption">{story.caption}</p>}
      <div className="story-actions">
        <button className={`story-action ${story.likedByMe ? 'liked' : ''}`} onClick={() => onLike(story.id, story.likedByMe)}>
          <Heart size={18} fill={story.likedByMe ? 'currentColor' : 'none'} />
          <span>{story.likes.length || ''}</span>
        </button>
        <button className="story-action" onClick={() => setShowComments(!showComments)}>
          <MessageCircle size={18} />
          <span>{story.comments.length || ''}</span>
        </button>
      </div>
      {showComments && (
        <div className="story-comments-section">
          {story.comments.map(c => (
            <div className="story-comment" key={c.id}>
              <Avatar profile={c.author} />
              <div>
                <b>{c.author.display_name}</b>
                <span>{c.content}</span>
                <small>{timeAgo(c.created_at)}</small>
              </div>
              {c.user_id === userId && (
                <button className="comment-delete" onClick={() => {}} aria-label="Delete comment">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {!story.comments.length && <p className="story-comments-empty">No comments yet. Be the first!</p>}
          <form className="story-comment-form" onSubmit={submitComment}>
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              maxLength={500}
              aria-label="Comment"
            />
            <button type="submit" disabled={!commentText.trim()} aria-label="Send comment">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </article>
  )
}

function StoryUploader({ userId, onUploaded }: { userId: string; onUploaded: (url: string, caption: string, privacy: 'public' | 'private') => Promise<string | null> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public')
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const [posting, setPosting] = useState(false)
  const { upload } = useAttachments(userId)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    const result = await upload(file, 'image')
    setUploading(false)
    if (result) {
      setImageUrl(result.url)
      setExpanded(true)
    } else {
      setError('Could not upload that photo. Please try a different one.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const reset = () => {
    setImageUrl('')
    setCaption('')
    setPrivacy('public')
    setExpanded(false)
    setError('')
  }

  const submit = async () => {
    if (!imageUrl) return
    setPosting(true)
    const err = await onUploaded(imageUrl, caption, privacy)
    setPosting(false)
    if (err) { setError(err); return }
    reset()
  }

  const fileInput = <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />

  if (!expanded) {
    return (
      <>
        {fileInput}
        <div className="story-uploader-collapsed" onClick={() => fileRef.current?.click()}>
          <Camera size={20} />
          <span>Share a moment...</span>
          {uploading && <span className="composer-spinner" />}
        </div>
        {error && <p className="story-uploader-error">{error}</p>}
      </>
    )
  }

  return (
    <div className="story-uploader">
      {fileInput}
      <div className="story-uploader-top">
        <h3>New story</h3>
        <button onClick={reset} aria-label="Cancel"><X size={18} /></button>
      </div>
      {imageUrl && <img src={imageUrl} alt="Preview" className="story-uploader-preview" />}
      <input
        value={caption}
        onChange={e => setCaption(e.target.value)}
        placeholder="Write a caption..."
        maxLength={500}
        className="story-uploader-caption"
      />
      <div className="story-uploader-privacy">
        <label>
          <input type="radio" name="privacy" checked={privacy === 'public'} onChange={() => setPrivacy('public')} />
          <Globe2 size={15} /> Public — anyone can see
        </label>
        <label>
          <input type="radio" name="privacy" checked={privacy === 'private'} onChange={() => setPrivacy('private')} />
          <Lock size={15} /> Friends only
        </label>
      </div>
      {error && <p className="story-uploader-error">{error}</p>}
      <button className="primary-button" onClick={submit} disabled={!imageUrl || posting}>
        <Send size={16} /> {posting ? 'Posting...' : 'Post story'}
      </button>
    </div>
  )
}

export default function StoriesPage() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { stories, loading, createStory, deleteStory, toggleLike, addComment } = useStories(user?.id)
  const nav = useNavigate()

  return (
    <div className="stories-shell">
      <header className="settings-top">
        <button onClick={() => nav('/chats')}><ArrowLeft size={18} /> Back to chats</button>
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span> tandem</div>
        <button onClick={() => nav('/friends')}><Heart size={17} /> Friends</button>
      </header>
      <main className="stories-content">
        <p className="eyebrow">Stories</p>
        <h1>Your feed.</h1>
        <p className="muted">See what your friends and the community are sharing.</p>
        <StoryUploader userId={user?.id || ''} onUploaded={createStory} />
        <div className="stories-feed">
          {loading ? (
            <div className="stories-loading">Loading stories...</div>
          ) : stories.length ? (
            stories.map(s => (
              <StoryCard
                key={s.id}
                story={s}
                userId={user?.id || ''}
                onLike={toggleLike}
                onComment={addComment}
                onDelete={deleteStory}
              />
            ))
          ) : (
            <div className="stories-empty">
              <Camera size={28} />
              <b>No stories yet</b>
              <span>Be the first to share a moment.</span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
